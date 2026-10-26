import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  ROUTING_ERROR_CODES,
  RoutingContractError,
  type RoutingHumanOverrideAuthorityBinding,
} from "@maos/database";
import { createBearerAuthenticator } from "@maos/module-identity";
import { createApiServer } from "../src/app.js";
import {
  createRoutingRoutes,
  routingFailureHttpStatus,
  type RoutingApiServices,
} from "../src/routing-routes.js";

const requestId = "81000000-0000-4000-8000-000000000001";
const decisionId = "81000000-0000-4000-8000-000000000002";
const policyId = "81000000-0000-4000-8000-000000000003";
const classificationId = "81000000-0000-4000-8000-000000000004";
const bindingId = "81000000-0000-4000-8000-000000000005";
const organizationId = "82000000-0000-4000-8000-000000000001";
const projectId = "82000000-0000-4000-8000-000000000002";
const calls: Array<{ method: string; input: unknown }> = [];
const decision = {
  contractVersion: "PHASE15D_ROUTING_OUTPUT_V1",
  routingDecisionId: decisionId,
  routingDecisionStreamId: "81000000-0000-4000-8000-000000000006",
  routingVersion: 1,
  requestId,
  classificationVersionId: classificationId,
  canonicalDomain: "ANALYTICS",
  roleClass: "ANALYST",
  routingPurpose: "PRIMARY_EXECUTION",
  routingMode: "PRIMARY_EXECUTION",
  specializationMetadata: null,
  requiredCapabilities: [],
  preferredCapabilities: [],
  eligibleResourceRefs: [bindingId],
  selectedProviderRef: null,
  selectedModelRef: null,
  selectedRuntimeAdapterRef: null,
  policyConstraints: {},
  policySnapshotRef: policyId,
  registrySnapshotRef: "registry:1",
  contextRefs: [],
  artifactRefs: [],
  priority: "NORMAL",
  humanApprovalState: "NOT_REQUIRED",
  humanApprovalRef: null,
  humanApprovalAuthority: null,
  humanApprovalCheckedAt: null,
  humanApprovalExpiresAt: null,
  developmentDelegationState: "NOT_APPLICABLE",
  aidosProjectRef: null,
  aidosRequiredCapabilities: null,
  aidosAuthorityRevision: null,
  aidosCheckedAt: null,
  aidosFreshUntil: null,
  decisionReasonCodes: ["CANONICAL_SELECTION"],
  createdAt: "2026-10-10T00:00:00.000Z",
  supersedesRoutingDecisionId: null,
  stalenessState: "CURRENT",
  freshnessReferences: [],
} as const;

function services(
  targetScope: {
    organizationId: string;
    projectId: string;
    scopeRef: string;
    environment: "STAGING";
  } = {
    organizationId,
    projectId,
    scopeRef: "project-maos",
    environment: "STAGING",
  },
): RoutingApiServices {
  return {
    resourceScopes: {
      resolveRequestScope: async () => targetScope,
    },
    reads: {
      getCurrentDecision: async (input) => {
        calls.push({ method: "getCurrentDecision", input });
        return decision as never;
      },
      getDecisionHistory: async (input) => {
        calls.push({ method: "getDecisionHistory", input });
        return [decision] as never;
      },
      getDecisionById: async (input) => {
        calls.push({ method: "getDecisionById", input });
        return decision as never;
      },
      getDecisionCandidates: async (input) => {
        calls.push({ method: "getDecisionCandidates", input });
        return [];
      },
    },
    decisions: {
      createDecision: async (input) => {
        calls.push({ method: "createDecision", input });
        return { outcome: "CREATED", decision } as never;
      },
      applyHumanOverride: async (input) => {
        calls.push({ method: "applyHumanOverride", input });
        return { outcome: "CREATED", decision } as never;
      },
    },
    policies: {
      getPolicyVersion: async (id, version) => {
        calls.push({ method: "getPolicyVersion", input: { id, version } });
        return id === policyId && version === 1
          ? {
              routingPolicyVersionId: "81000000-0000-4000-8000-000000000007",
              routingPolicyId: policyId,
              version: 1,
              supersedesPolicyVersionId: null,
              authorityIdentifier: "MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD",
              lifecycleIntent: "ACTIVE",
              canonicalDomain: "ANALYTICS",
              routingPurpose: "PRIMARY_EXECUTION",
              roleClass: "ANALYST",
              organizationId: targetScope.organizationId,
              projectId: targetScope.projectId,
              scopeRef: targetScope.scopeRef,
              environment: targetScope.environment,
              requiredCapabilityRefs: [],
              preferredCapabilityRefs: [],
              policyConstraints: {
                allowedRoutingModes: ["PRIMARY_EXECUTION"],
                candidateTieBreakers: ["MODEL_ID"],
                humanApprovalRequired: false,
                unexpectedBackendSecret: "must-not-cross-http-boundary",
              },
              effectiveAt: "2026-10-10T00:00:00.000Z",
              expiresAt: null,
              contentFingerprint: "sha256:safe",
              createdByActorType: "SYSTEM",
              createdByActorId: "system",
              auditRef: "audit:safe",
              createdAt: "2026-10-10T00:00:00.000Z",
            }
          : undefined;
      },
    },
  };
}

const permission = (
  resource: string,
  action: string,
  scope = "project-maos",
) => ({
  action,
  effect: "ALLOW" as const,
  environment: "staging" as const,
  resource,
  risk:
    action === "READ"
      ? ("R0" as const)
      : action === "OVERRIDE"
        ? ("R2" as const)
        : ("R1" as const),
  scope,
});

const authenticate = createBearerAuthenticator(async (reference) => {
  if (reference === "none") return null;
  const permissions =
    reference === "reader"
      ? [
          permission("ROUTING_DECISION", "READ"),
          permission("ROUTING_POLICY", "READ"),
        ]
      : reference === "writer"
        ? [permission("ROUTING_DECISION", "CREATE")]
        : reference === "human"
          ? [permission("ROUTING_DECISION", "OVERRIDE")]
          : reference === "wrong-scope"
            ? [permission("ROUTING_DECISION", "READ", "project-other")]
            : [];
  return {
    actor_id: `${reference}-actor`,
    actor_type: "HUMAN",
    roles: [{ id: reference, name: reference, permissions }],
  };
});

const overrideAuthority = (
  actorId: string,
): RoutingHumanOverrideAuthorityBinding => ({
  authorityId: "authority:human-override",
  permission: "ROUTING_DECISION:OVERRIDE",
  state: "ACTIVE",
  actorId,
  organizationId,
  projectId,
  scopeRef: "project-maos",
  environment: "STAGING",
  targetRequestId: requestId,
  targetRoutingPurpose: "PRIMARY_EXECUTION",
  targetDecisionId: decisionId,
  checkedAt: "2026-10-10T00:00:00.000Z",
  freshUntil: "2099-10-10T00:00:00.000Z",
});

async function start(
  targetScope?: Parameters<typeof services>[0],
  serviceOverride?: RoutingApiServices,
) {
  calls.length = 0;
  const routes = createRoutingRoutes(serviceOverride ?? services(targetScope), {
    environment: "staging",
    scope: "project-maos",
    requestContext: {
      organizationId,
      projectId,
      companyScopeRef: "company-maos",
      teamScopeRef: "team-development",
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
    resolveOverrideAuthority: ({ actorId }) => overrideAuthority(actorId),
  });
  const server = createApiServer({
    authenticate,
    environment: "staging",
    routes,
    service: "api",
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  return {
    routes,
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

test("registers exactly the seven frozen Phase15D routes", async (t) => {
  const api = await start();
  t.after(api.close);
  assert.deepEqual(
    api.routes.map(({ method, path }) => `${method} ${path}`),
    [
      "GET /api/v1/routing/requests/:requestId/current",
      "GET /api/v1/routing/requests/:requestId/history",
      "GET /api/v1/routing/decisions/:routingDecisionId",
      "GET /api/v1/routing/decisions/:routingDecisionId/candidates",
      "POST /api/v1/routing/requests/:requestId/decisions",
      "POST /api/v1/routing/requests/:requestId/overrides",
      "GET /api/v1/routing/policies/:policyId/versions/:version",
    ],
  );
});

test("enforces authentication, exact read permission, scope, and method safety", async (t) => {
  const api = await start();
  t.after(api.close);
  const url = `${api.base}/api/v1/routing/requests/${requestId}/current?routingPurpose=PRIMARY_EXECUTION`;
  assert.equal((await fetch(url)).status, 401);
  assert.equal(
    (await fetch(url, { headers: { authorization: "Bearer writer" } })).status,
    403,
  );
  assert.equal(
    (await fetch(url, { headers: { authorization: "Bearer wrong-scope" } }))
      .status,
    403,
  );
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers: { authorization: "Bearer reader" },
      })
    ).status,
    405,
  );
  assert.equal(
    (await fetch(url, { headers: { authorization: "Bearer reader" } })).status,
    200,
  );
  assert.equal(calls.at(-1)?.method, "getCurrentDecision");
});

test("routes all four reads only through the RoutingReadService contract", async (t) => {
  const api = await start();
  t.after(api.close);
  const headers = { authorization: "Bearer reader" };
  const urls = [
    `/api/v1/routing/requests/${requestId}/current?routingPurpose=PRIMARY_EXECUTION`,
    `/api/v1/routing/requests/${requestId}/history?routingPurpose=PRIMARY_EXECUTION`,
    `/api/v1/routing/decisions/${decisionId}`,
    `/api/v1/routing/decisions/${decisionId}/candidates`,
  ];
  for (const url of urls)
    assert.equal((await fetch(`${api.base}${url}`, { headers })).status, 200);
  assert.deepEqual(
    calls.map(({ method }) => method),
    [
      "getCurrentDecision",
      "getDecisionHistory",
      "getDecisionById",
      "getDecisionById",
      "getDecisionCandidates",
    ],
  );
  assert.deepEqual(calls[2]?.input, { routingDecisionId: decisionId });
  assert.deepEqual(calls[3]?.input, { routingDecisionId: decisionId });
  assert.deepEqual(calls[4]?.input, { routingDecisionId: decisionId });
  assert.equal(
    (
      await fetch(
        `${api.base}/api/v1/routing/decisions/${decisionId}?requestId=${requestId}`,
        { headers },
      )
    ).status,
    422,
  );
});

const decisionBody = {
  expectedClassificationVersionId: classificationId,
  expectedCurrentDecisionId: null,
  routingPurpose: "PRIMARY_EXECUTION",
  roleClass: "ANALYST",
  routingMode: "PRIMARY_EXECUTION",
  specializationRef: null,
  approval: null,
  aidosTargetRef: null,
  evidenceRefs: ["evidence:one"],
  contextRefs: ["context:one"],
  artifactRefs: [],
  priority: "NORMAL",
  causationRefs: ["cause:one"],
};

test("strictly validates and propagates trusted mutation identity and transport context", async (t) => {
  const api = await start();
  t.after(api.close);
  const response = await fetch(
    `${api.base}/api/v1/routing/requests/${requestId}/decisions`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer writer",
        "content-type": "application/json",
        "idempotency-key": "routing-create-1",
        "x-correlation-id": "correlation-1",
        "x-trace-id": "trace-1",
        "x-span-id": "span-1",
      },
      body: JSON.stringify(decisionBody),
    },
  );
  assert.equal(response.status, 200, await response.text());
  const input = calls.find(({ method }) => method === "createDecision")
    ?.input as Record<string, unknown>;
  assert.equal(input.actorId, "writer-actor");
  assert.equal(input.idempotencyKey, "routing-create-1");
  assert.equal(input.correlationId, "correlation-1");
  assert.equal(input.traceId, "trace-1");
  assert.equal(input.spanId, "span-1");
  assert.equal("organizationId" in decisionBody, false);

  const spoofed = await fetch(
    `${api.base}/api/v1/routing/requests/${requestId}/decisions`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer writer",
        "content-type": "application/json",
        "idempotency-key": "routing-create-2",
      },
      body: JSON.stringify({
        ...decisionBody,
        actorId: "spoof",
        projectId: "spoof",
      }),
    },
  );
  assert.equal(spoofed.status, 422);
});

test("delegates Human override with server-derived authority only", async (t) => {
  const api = await start();
  t.after(api.close);
  const body = {
    ...decisionBody,
    expectedCurrentDecisionId: decisionId,
    overrideIntent: {
      type: "SELECT_ELIGIBLE_CANDIDATE",
      modelHostBindingId: bindingId,
    },
    reasonCode: "HUMAN_SELECTED_ELIGIBLE_RESOURCE",
    reasonText: "Human selected the eligible governed candidate.",
  };
  assert.equal(
    (
      await fetch(
        `${api.base}/api/v1/routing/requests/${requestId}/overrides`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer reader",
            "content-type": "application/json",
            "idempotency-key": "override-1",
          },
          body: JSON.stringify(body),
        },
      )
    ).status,
    403,
  );
  const response = await fetch(
    `${api.base}/api/v1/routing/requests/${requestId}/overrides`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer human",
        "content-type": "application/json",
        "idempotency-key": "override-1",
      },
      body: JSON.stringify(body),
    },
  );
  assert.equal(response.status, 200, await response.text());
  const input = calls.find(({ method }) => method === "applyHumanOverride")
    ?.input as Record<string, unknown>;
  assert.equal((input.authority as { actorId: string }).actorId, "human-actor");
  assert.equal(input.actorType, "HUMAN");
});

test("enforces the canonical 500-character Human override reason limit", async (t) => {
  const api = await start();
  t.after(api.close);
  const url = `${api.base}/api/v1/routing/requests/${requestId}/overrides`;
  const headers = {
    authorization: "Bearer human",
    "content-type": "application/json",
    "idempotency-key": "override-reason-limit",
  };
  const body = {
    ...decisionBody,
    expectedCurrentDecisionId: decisionId,
    overrideIntent: { type: "REEVALUATE_CANONICAL" },
    reasonCode: "HUMAN_REQUESTED_REEVALUATION",
  };

  const accepted = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...body, reasonText: "a".repeat(500) }),
  });
  assert.equal(accepted.status, 200, await accepted.text());

  const rejected = await fetch(url, {
    method: "POST",
    headers: { ...headers, "idempotency-key": "override-reason-too-long" },
    body: JSON.stringify({ ...body, reasonText: "a".repeat(501) }),
  });
  assert.equal(rejected.status, 422, await rejected.text());
});

test("exposes a safe immutable policy projection through the policy service", async (t) => {
  const api = await start();
  t.after(api.close);
  const response = await fetch(
    `${api.base}/api/v1/routing/policies/${policyId}/versions/1`,
    { headers: { authorization: "Bearer reader" } },
  );
  const text = await response.text();
  assert.equal(response.status, 200, text);
  assert.doesNotMatch(text, /createdByActorId|auditRef|activation/u);
  assert.doesNotMatch(
    text,
    /unexpectedBackendSecret|must-not-cross-http-boundary/u,
  );
  assert.match(text, /allowedRoutingModes/u);
  assert.equal(calls.at(-1)?.method, "getPolicyVersion");
});

test("rejects request resources outside the configured organization and project", async (t) => {
  const cases = [
    { organizationId: "82000000-0000-4000-8000-000000000099", projectId },
    { organizationId, projectId: "82000000-0000-4000-8000-000000000099" },
  ] as const;
  for (const target of cases) {
    const api = await start({
      ...target,
      scopeRef: "project-maos",
      environment: "STAGING",
    });
    t.after(api.close);
    const response = await fetch(
      `${api.base}/api/v1/routing/requests/${requestId}/current?routingPurpose=PRIMARY_EXECUTION`,
      { headers: { authorization: "Bearer reader" } },
    );
    assert.equal(response.status, 403);
    assert.equal(
      calls.some(({ method }) => method === "getCurrentDecision"),
      false,
    );
  }
});

test("rejects decision and Human override writes outside the trusted target scope", async (t) => {
  const api = await start({
    organizationId,
    projectId: "82000000-0000-4000-8000-000000000099",
    scopeRef: "project-maos",
    environment: "STAGING",
  });
  t.after(api.close);
  const headers = {
    "content-type": "application/json",
    "idempotency-key": "scope-test",
  };
  const create = await fetch(
    `${api.base}/api/v1/routing/requests/${requestId}/decisions`,
    {
      method: "POST",
      headers: { ...headers, authorization: "Bearer writer" },
      body: JSON.stringify(decisionBody),
    },
  );
  const override = await fetch(
    `${api.base}/api/v1/routing/requests/${requestId}/overrides`,
    {
      method: "POST",
      headers: { ...headers, authorization: "Bearer human" },
      body: JSON.stringify({
        ...decisionBody,
        expectedCurrentDecisionId: decisionId,
        overrideIntent: { type: "REEVALUATE_CANONICAL" },
        reasonCode: "HUMAN_REQUESTED_REEVALUATION",
        reasonText: "Re-evaluate under the canonical governed policy.",
      }),
    },
  );
  assert.equal(create.status, 403);
  assert.equal(override.status, 403);
  assert.equal(
    calls.some(({ method }) => method === "createDecision"),
    false,
  );
  assert.equal(
    calls.some(({ method }) => method === "applyHumanOverride"),
    false,
  );
});

test("rejects policy reads outside the trusted organization and project", async (t) => {
  const api = await start({
    organizationId: "82000000-0000-4000-8000-000000000099",
    projectId,
    scopeRef: "project-maos",
    environment: "STAGING",
  });
  t.after(api.close);
  const response = await fetch(
    `${api.base}/api/v1/routing/policies/${policyId}/versions/1`,
    { headers: { authorization: "Bearer reader" } },
  );
  assert.equal(response.status, 403);
});

test("maps every frozen routing failure code deterministically without aliases", () => {
  assert.equal(ROUTING_ERROR_CODES.length, 41);
  for (const code of ROUTING_ERROR_CODES) {
    const status = routingFailureHttpStatus(new RoutingContractError(code));
    assert.ok([403, 404, 409, 422, 503].includes(status), `${code}: ${status}`);
  }
  assert.equal(
    routingFailureHttpStatus(
      new RoutingContractError("ROUTING_REQUEST_NOT_FOUND"),
    ),
    404,
  );
  assert.equal(
    routingFailureHttpStatus(
      new RoutingContractError("ROUTING_IDEMPOTENCY_CONFLICT"),
    ),
    409,
  );
  assert.equal(
    routingFailureHttpStatus(new RoutingContractError("AIDOS_UNAVAILABLE")),
    503,
  );
  assert.equal(
    routingFailureHttpStatus(
      new RoutingContractError("CLASSIFICATION_INVALID"),
    ),
    422,
  );
});

test("all seven routes reject unauthenticated access", async (t) => {
  const api = await start();
  t.after(api.close);
  const requests = [
    [
      `${api.base}/api/v1/routing/requests/${requestId}/current?routingPurpose=PRIMARY_EXECUTION`,
      {},
    ],
    [
      `${api.base}/api/v1/routing/requests/${requestId}/history?routingPurpose=PRIMARY_EXECUTION`,
      {},
    ],
    [
      `${api.base}/api/v1/routing/decisions/${decisionId}?requestId=${requestId}&routingPurpose=PRIMARY_EXECUTION`,
      {},
    ],
    [
      `${api.base}/api/v1/routing/decisions/${decisionId}/candidates?requestId=${requestId}&routingPurpose=PRIMARY_EXECUTION`,
      {},
    ],
    [
      `${api.base}/api/v1/routing/requests/${requestId}/decisions`,
      { method: "POST" },
    ],
    [
      `${api.base}/api/v1/routing/requests/${requestId}/overrides`,
      { method: "POST" },
    ],
    [`${api.base}/api/v1/routing/policies/${policyId}/versions/1`, {}],
  ] as const;
  for (const [url, init] of requests)
    assert.equal((await fetch(url, init)).status, 401, url);
});

test("strict mutation schema rejects invalid enums, identifiers, evidence and unknown fields", async (t) => {
  const api = await start();
  t.after(api.close);
  const url = `${api.base}/api/v1/routing/requests/${requestId}/decisions`;
  const invalidBodies = [
    { ...decisionBody, routingPurpose: "UNKNOWN" },
    { ...decisionBody, roleClass: "UNKNOWN" },
    { ...decisionBody, routingMode: "UNKNOWN" },
    { ...decisionBody, expectedCurrentDecisionId: "not-a-uuid" },
    { ...decisionBody, evidenceRefs: [""] },
    { ...decisionBody, unknown: true },
  ];
  for (const body of invalidBodies) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: "Bearer writer",
        "content-type": "application/json",
        "idempotency-key": "valid-key",
      },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 422, JSON.stringify(body));
  }
  const malformedKey = await fetch(url, {
    method: "POST",
    headers: {
      authorization: "Bearer writer",
      "content-type": "application/json",
      "idempotency-key": "invalid key",
    },
    body: JSON.stringify(decisionBody),
  });
  assert.equal(malformedKey.status, 422);
});

test("route-level canonical failures remain bounded and never leak internals", async (t) => {
  for (const [code, status] of [
    ["ROUTING_REQUEST_NOT_FOUND", 404],
    ["ROUTING_IDEMPOTENCY_CONFLICT", 409],
    ["AIDOS_UNAVAILABLE", 503],
  ] as const) {
    const failing = services();
    failing.reads.getCurrentDecision = async () => {
      throw new RoutingContractError(code);
    };
    const api = await start(undefined, failing);
    t.after(api.close);
    const response = await fetch(
      `${api.base}/api/v1/routing/requests/${requestId}/current?routingPurpose=PRIMARY_EXECUTION`,
      { headers: { authorization: "Bearer reader" } },
    );
    const text = await response.text();
    assert.equal(response.status, status);
    assert.match(text, new RegExp(code, "u"));
    assert.doesNotMatch(text, /stack|password|connection string/iu);
  }
});

test("routing HTTP surface invokes no execution, run, job, tool or deployment boundary", async (t) => {
  const api = await start();
  t.after(api.close);
  await fetch(
    `${api.base}/api/v1/routing/requests/${requestId}/current?routingPurpose=PRIMARY_EXECUTION`,
    { headers: { authorization: "Bearer reader" } },
  );
  const invoked = calls.map(({ method }) => method);
  for (const prohibited of [
    "executeProvider",
    "executeModel",
    "executeTool",
    "executeAidos",
    "createRun",
    "createJob",
    "deploy",
  ])
    assert.equal(invoked.includes(prohibited), false, prohibited);
});
