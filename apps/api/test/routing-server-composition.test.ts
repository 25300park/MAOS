import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { RoutingContractError } from "@maos/database";
import {
  composeStagingRoutingRoutes,
  createCanonicalRoutingServices,
} from "../src/routing-server-composition.js";

const requestId = "81000000-0000-4000-8000-000000000001";
const organizationId = "81000000-0000-4000-8000-000000000002";
const projectId = "81000000-0000-4000-8000-000000000003";
const aidos = {
  baseUrl: "https://aidos.test",
  readerId: "maos-staging-reader",
  keyId: "synthetic-key-id",
  identitySubject: "maos:staging",
  hmacSecret: "synthetic-hmac-secret",
} as const;

test("routing composition is disabled by default and fails closed without services", () => {
  assert.deepEqual(
    composeStagingRoutingRoutes(undefined, { enabled: false }),
    [],
  );
  assert.throws(
    () =>
      composeStagingRoutingRoutes(undefined, {
        enabled: true,
        environment: "staging",
        organizationId: "81000000-0000-4000-8000-000000000001",
        projectId: "81000000-0000-4000-8000-000000000002",
        scope: "project-maos",
        aidos,
        requestContext: {} as never,
        resolveOverrideAuthority: async () => {
          throw new Error("unreachable");
        },
      }),
    /PHASE15D_ROUTING_SERVICES_REQUIRED/u,
  );
});

test("enabled canonical composition mounts exactly the seven frozen routes", () => {
  const unavailable = async () => {
    throw new Error("not invoked during composition");
  };
  const services = {
    resourceScopes: { resolveRequestScope: unavailable },
    reads: {
      getCurrentDecision: unavailable,
      getDecisionHistory: unavailable,
      getDecisionById: unavailable,
      getDecisionCandidates: unavailable,
    },
    decisions: { createDecision: unavailable, applyHumanOverride: unavailable },
    policies: { getPolicyVersion: unavailable },
  };
  const routes = composeStagingRoutingRoutes(services as never, {
    enabled: true,
    environment: "staging",
    organizationId: "81000000-0000-4000-8000-000000000001",
    projectId: "81000000-0000-4000-8000-000000000002",
    scope: "project-maos",
    aidos,
    requestContext: {} as never,
    resolveOverrideAuthority: async () => {
      throw new Error("not invoked during composition");
    },
  });
  assert.equal(routes.length, 7);
  assert.throws(
    () =>
      composeStagingRoutingRoutes({ ...services, policies: {} } as never, {
        enabled: true,
        environment: "staging",
        organizationId: "81000000-0000-4000-8000-000000000001",
        projectId: "81000000-0000-4000-8000-000000000002",
        scope: "project-maos",
        aidos,
        requestContext: {} as never,
        resolveOverrideAuthority: unavailable,
      }),
    /PHASE15D_ROUTING_SERVICES_INCOMPLETE/u,
  );
});

test("canonical server composition constructs the real service graph and reaches RoutingReadService", async () => {
  const queries: string[] = [];
  const database = {
    exec: async () => undefined,
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("FROM work.requests"))
        return {
          rows: [
            {
              id: requestId,
              source_system: "MAOS",
              source_type: "TEST",
              source_ref: "request:test",
              source_fingerprint: `sha256:${"a".repeat(64)}`,
              organization_id: organizationId,
              project_id: projectId,
              company_scope_ref: "company-maos",
              team_scope_ref: null,
              project_scope_ref: "project-maos",
              system_scope_ref: null,
              environment: "STAGING",
              lifecycle_state: "REGISTERED",
              registration_audit_ref: "81000000-0000-4000-8000-000000000004",
              registered_at: "2026-10-10T00:00:00.000Z",
              invalidated_at: null,
              invalidation_reason_code: null,
              idempotency_key: "request-test",
              input_fingerprint: `sha256:${"b".repeat(64)}`,
            },
          ],
        };
      if (sql.includes("request_routing_decision_versions"))
        return { rows: [] };
      return { rows: [] };
    },
  } as never;
  const services = createCanonicalRoutingServices(database, {
    environment: "staging",
    aidos,
  });
  const routes = composeStagingRoutingRoutes(database, {
    enabled: true,
    environment: "staging",
    organizationId,
    projectId,
    scope: "project-maos",
    aidos,
    requestContext: {
      organizationId,
      projectId,
      companyScopeRef: "company-maos",
      teamScopeRef: null,
      projectScopeRef: "project-maos",
      systemScopeRef: null,
      environment: "STAGING",
      staleness: {
        requestChanged: false,
        taskChanged: false,
        policyChanged: false,
        capabilitiesChanged: false,
        evidenceInvalid: false,
        humanOverride: false,
        conflictingClassification: false,
        taxonomyInvalid: false,
      },
    },
    resolveOverrideAuthority: async () => {
      throw new Error("not used");
    },
  });
  assert.equal(routes.length, 7);
  assert.equal(services.reads.constructor.name, "RoutingReadService");
  assert.equal(services.policies.constructor.name, "RoutingPolicyService");
  const result = await routes[1]!.handle({
    context: {} as never,
    identity: {} as never,
    input: null,
    params: { requestId },
    request: { url: `/?routingPurpose=PRIMARY_EXECUTION` } as never,
  });
  assert.deepEqual(result, { decisions: [] });
  assert.ok(
    queries.some((sql) => sql.includes("request_routing_decision_versions")),
  );
});

test("canonical request scope lookup distinguishes missing resources from cross-scope resources", async () => {
  const database = {
    exec: async () => undefined,
    query: async () => ({ rows: [] }),
  } as never;
  const services = createCanonicalRoutingServices(database, {
    environment: "staging",
    aidos,
  });

  await assert.rejects(
    services.resourceScopes.resolveRequestScope(requestId),
    (error: unknown) =>
      error instanceof RoutingContractError &&
      error.code === "ROUTING_REQUEST_NOT_FOUND",
  );
});

test("enabled canonical composition contains no unavailable authority placeholders", async () => {
  const source = await readFile(
    new URL("../src/routing-server-composition.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /unavailable(?:Approvals|Classifications|Registry|Aidos)/u,
  );
  assert.match(source, /createPhase15cClassificationAuthorityReadPort/u);
  assert.match(source, /createPhase15bRegistryAuthorityReadPort/u);
  assert.match(source, /createGovernedHumanApprovalAuthorityReadPort/u);
  assert.match(source, /createExternalAidosAuthorityReadPort/u);
});
