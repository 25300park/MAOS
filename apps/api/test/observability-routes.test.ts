import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createBearerAuthenticator } from "@maos/module-identity";
import { ObservabilityAuditService } from "@maos/module-observability";
import { createApiServer } from "../src/app.js";
import { createObservabilityRoutes } from "../src/observability-routes.js";

async function startApi(allow: boolean) {
  const service = new ObservabilityAuditService();
  service.recordAudit({
    action: "TASK.READ",
    actor: { id: "human-1", type: "HUMAN" },
    context: {
      correlation_id: "corr-1",
      project_id: "project-1",
      request_id: "req-1",
      span_id: "span-1",
      trace_id: "trace-1",
    },
    evidence_refs: [],
    result: "SUCCEEDED",
    target: { id: "task-1", type: "TASK" },
  });
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "human-1",
    actor_type: "HUMAN",
    roles: [
      {
        id: "auditor",
        name: "AUDITOR",
        permissions: allow
          ? [
              {
                action: "READ",
                effect: "ALLOW",
                environment: "development",
                resource: "AUDIT",
                risk: "R0",
                scope: "project-1",
              } as const,
            ]
          : [],
      },
    ],
  }));
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createObservabilityRoutes(service, {
      environment: "development",
      project_ids: ["project-1"],
      scope: "project-1",
    }),
    service: "api",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

test("provides authenticated, authorized, project-scoped audit queries", async (t) => {
  const api = await startApi(true);
  t.after(api.close);
  const response = await fetch(`${api.baseUrl}/api/v1/audit/query`, {
    body: JSON.stringify({ project_id: "project-1" }),
    headers: {
      authorization: "Bearer identity-reference",
      "content-type": "application/json",
    },
    method: "POST",
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: unknown[] };
  assert.equal(body.data.length, 1);
});

test("audit query API defaults to deny", async (t) => {
  const api = await startApi(false);
  t.after(api.close);
  const response = await fetch(`${api.baseUrl}/api/v1/audit/query`, {
    body: JSON.stringify({ project_id: "project-1" }),
    headers: {
      authorization: "Bearer identity-reference",
      "content-type": "application/json",
    },
    method: "POST",
  });
  assert.equal(response.status, 403);
});
