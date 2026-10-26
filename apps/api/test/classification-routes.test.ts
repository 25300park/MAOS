import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { ClassificationRecord } from "@maos/database";
import { createBearerAuthenticator } from "@maos/module-identity";
import { createApiServer } from "../src/app.js";
import { createClassificationRoutes } from "../src/classification-routes.js";

const requestId = "81000000-0000-4000-8000-000000000001";
const classification: ClassificationRecord = {
  classificationId: "81000000-0000-4000-8000-000000000002",
  requestId,
  taskId: null,
  version: 1,
  supersedesClassificationId: null,
  domainKey: "DEVELOPMENT",
  subdomainKey: "CODE_REVIEW",
  classificationState: "VALIDATED",
  source: "DETERMINISTIC_POLICY",
  routingDisposition: "DELEGATE_TO_AIDOS",
  reasonCode: "POLICY_MATCH",
  requestedRoleClass: null,
  requiredCapabilityRefs: ["capability://code-review"],
  preferredCapabilityRefs: [],
  policyConstraintRefs: ["policy://development"],
  contextRefs: ["secret-context"],
  artifactRefs: [],
  evidenceRefs: ["secret-evidence"],
  priorityClass: "NORMAL",
  intentClassRef: null,
  intentSnapshotHash: "secret-hash",
  riskClassRef: null,
  riskSnapshotHash: null,
  confidenceClass: "HIGH",
  validatorRuleRef: "rule://deterministic",
  validatorRuleVersion: "1",
  policyResolutionRef: "82000000-0000-4000-8000-000000000001",
  policyResolutionVersion: "1",
  createdByActorType: "SYSTEM",
  createdByActorId: "83000000-0000-4000-8000-000000000001",
  createdAt: "2026-10-02T00:00:00.000Z",
  validatedAt: "2026-10-02T00:00:00.000Z",
  staleAt: null,
  canonicalPayloadFingerprint: "secret-fingerprint",
  idempotencyKey: "secret-idempotency",
  correlationId: "secret-correlation",
  causationRef: null,
  auditRef: "84000000-0000-4000-8000-000000000001",
};

const authenticate = createBearerAuthenticator(async (reference) =>
  reference === "reader"
    ? {
        actor_id: "reader",
        actor_type: "HUMAN",
        roles: [
          {
            id: "role",
            name: "SYSTEM_READER",
            permissions: [
              {
                action: "READ",
                effect: "ALLOW",
                environment: "staging",
                resource: "SYSTEM",
                risk: "R0",
                scope: "project-maos",
              },
            ],
          },
        ],
      }
    : null,
);

async function start() {
  const routes = createClassificationRoutes(
    {
      findCurrent: async (id) =>
        id === requestId ? classification : undefined,
      listHistory: async (id) => (id === requestId ? [classification] : []),
    },
    { environment: "staging", scope: "project-maos" },
  );
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

test("exposes only authorized read-only current and history diagnostics", async (t) => {
  const api = await start();
  t.after(api.close);
  assert.deepEqual(
    api.routes.map(({ method, path }) => `${method} ${path}`),
    [
      "GET /api/v1/classifications/requests/:requestId/current",
      "GET /api/v1/classifications/requests/:requestId/history",
    ],
  );
  for (const suffix of ["current", "history"]) {
    const denied = await fetch(
      `${api.base}/api/v1/classifications/requests/${requestId}/${suffix}`,
    );
    assert.equal(denied.status, 401);
    const response = await fetch(
      `${api.base}/api/v1/classifications/requests/${requestId}/${suffix}`,
      { headers: { authorization: "Bearer reader" } },
    );
    const text = await response.text();
    assert.equal(response.status, 200, text);
    assert.match(text, /DELEGATE_TO_AIDOS/u);
    assert.doesNotMatch(
      text,
      /secret-context|secret-evidence|secret-hash|secret-fingerprint|secret-idempotency|secret-correlation/u,
    );
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await fetch(
      `${api.base}/api/v1/classifications/requests/${requestId}/current`,
      { method, headers: { authorization: "Bearer reader" } },
    );
    assert.equal(response.status, 405);
  }
});

test("fails missing classifications and invalid request identities closed", async (t) => {
  const api = await start();
  t.after(api.close);
  const headers = { authorization: "Bearer reader" };
  assert.equal(
    (
      await fetch(
        `${api.base}/api/v1/classifications/requests/81000000-0000-4000-8000-000000000099/current`,
        { headers },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(
        `${api.base}/api/v1/classifications/requests/not-a-request/current`,
        { headers },
      )
    ).status,
    422,
  );
});
