import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createBearerAuthenticator } from "@maos/module-identity";
import { OperationsHardeningService } from "@maos/module-operations";
import { ObservabilityAuditService } from "@maos/module-observability";
import { createApiServer } from "../src/app.js";
import { createOperationsRoutes } from "../src/operations-routes.js";

async function startApi(allow: boolean) {
  const service = new OperationsHardeningService(
    () => new Date("2026-09-09T05:00:00Z"),
  );
  const audit = new ObservabilityAuditService({
    id: () => "operations-audit-id",
    now: () => new Date("2026-09-09T05:00:00Z"),
  });
  service.registerTarget({
    environment: "DEVELOPMENT",
    health: "HEALTHY",
    id: "maos-api",
    kind: "APPLICATION",
    owner_reference: "role:platform-operations",
    system_id: "maos",
  });
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "human-operator",
    actor_type: "HUMAN",
    roles: [
      {
        id: "operator",
        name: "OPERATOR",
        permissions: allow
          ? [
              {
                action: "READ",
                effect: "ALLOW",
                environment: "development",
                resource: "OPERATIONS",
                risk: "R0",
                scope: "project-maos",
              } as const,
              {
                action: "CONTROL",
                effect: "ALLOW",
                environment: "development",
                resource: "OPERATIONS",
                risk: "R2",
                scope: "project-maos",
              } as const,
              {
                action: "CREATE",
                effect: "ALLOW",
                environment: "development",
                resource: "OPERATIONS",
                risk: "R2",
                scope: "project-maos",
              } as const,
            ]
          : [],
      },
    ],
  }));
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createOperationsRoutes(
      service,
      {
        environment: "development",
        scope: "project-maos",
      },
      audit,
    ),
    service: "api",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    audit,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

const headers = {
  authorization: "Bearer identity-reference",
  "content-type": "application/json",
};

test("exposes an authorized versioned operations snapshot", async (t) => {
  const api = await startApi(true);
  t.after(api.close);
  const response = await fetch(`${api.baseUrl}/api/v1/operations/snapshot`, {
    headers,
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    data: { overall_health: string; production_deployment_approved: boolean };
  };
  assert.equal(body.data.overall_health, "HEALTHY");
  assert.equal(body.data.production_deployment_approved, false);
});

test("defaults operations API access to deny", async (t) => {
  const api = await startApi(false);
  t.after(api.close);
  const response = await fetch(`${api.baseUrl}/api/v1/operations/snapshot`, {
    headers,
  });
  assert.equal(response.status, 403);
});

test("validates alert control input instead of accepting malformed lifecycle changes", async (t) => {
  const api = await startApi(true);
  t.after(api.close);
  const response = await fetch(
    `${api.baseUrl}/api/v1/operations/alerts/transition`,
    {
      body: JSON.stringify({ alert_id: "missing-state" }),
      headers,
      method: "POST",
    },
  );
  assert.equal(response.status, 422);

  const invalidState = await fetch(
    `${api.baseUrl}/api/v1/operations/alerts/transition`,
    {
      body: JSON.stringify({
        alert_id: "alert-1",
        evidence_refs: ["evidence://alert/invalid"],
        state: "AUTO_CLOSED",
      }),
      headers,
      method: "POST",
    },
  );
  assert.equal(invalidState.status, 422);
});

test("validates incident enums, reference arrays, and known targets", async (t) => {
  const api = await startApi(true);
  t.after(api.close);
  for (const input of [
    {
      affected_system_ids: ["maos"],
      alert_ids: ["unknown-alert"],
      evidence_refs: ["evidence://incident/create"],
      id: "incident-unknown-alert",
      impact: "impact",
      owner_reference: "role:incident-commander",
      severity: "SEV-1",
    },
    {
      affected_system_ids: [7],
      alert_ids: [],
      evidence_refs: ["evidence://incident/create"],
      id: "incident-invalid-array",
      impact: "impact",
      owner_reference: "role:incident-commander",
      severity: "SEV-1",
    },
    {
      affected_system_ids: ["maos"],
      alert_ids: [],
      evidence_refs: ["evidence://incident/create"],
      id: "incident-invalid-severity",
      impact: "impact",
      owner_reference: "role:incident-commander",
      severity: "SEV-0",
    },
  ]) {
    const response = await fetch(`${api.baseUrl}/api/v1/operations/incidents`, {
      body: JSON.stringify(input),
      headers,
      method: "POST",
    });
    assert.equal(response.status, 422);
  }
});

test("records canonical audit for authorized operations mutations", async (t) => {
  const api = await startApi(true);
  t.after(api.close);
  const health = await fetch(`${api.baseUrl}/api/v1/operations/health`, {
    body: JSON.stringify({
      evidence_refs: ["evidence://health/api"],
      health: "DEGRADED",
      target_id: "maos-api",
    }),
    headers,
    method: "POST",
  });
  assert.equal(health.status, 200);
  const audits = api.audit.queryAudit(
    { action: "OPERATIONS_HEALTH.RECORDED", project_id: "project-maos" },
    { allowed: true, project_ids: ["project-maos"] },
  );
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.target.id, "maos-api");
  assert.equal(audits[0]?.result, "SUCCEEDED");
});
