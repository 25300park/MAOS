import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createBearerAuthenticator } from "@maos/module-identity";
import {
  MemoryGatewayIntegration,
  type MemoryAccessPolicy,
} from "@maos/module-knowledge";
import { createApiServer } from "../src/app.js";
import { createMemoryGatewayRoutes } from "../src/memory-gateway-routes.js";

const policy: MemoryAccessPolicy = {
  allowed_classifications: ["INTERNAL"],
  allowed_namespaces: ["/projects"],
  allowed_types: ["PROJECT"],
};

async function startApi() {
  const service = new MemoryGatewayIntegration();
  service.registerGateway(
    {
      credential_ref: "secret://memory-gateway/service-token",
      endpoint: "https://memory.internal.example/v1",
      health: "HEALTHY",
      id: "memory-gateway-1",
      lifecycle: "ACTIVE",
      name: "Corporate AI Memory Gateway",
    },
    {
      retrieve: async () => ({
        items: [
          {
            classification: "INTERNAL",
            content: "Use the approved launch checklist.",
            external_memory_id: "memory-1",
            namespace: "/projects",
            provenance: {
              evidence_ids: ["evidence-1"],
              retrieved_at: "2026-09-03T00:00:00.000Z",
            },
            scope_id: "project-1",
            source: {
              external_resource_id: "checklist-1",
              system_id: "ai-memory-gateway",
            },
            type: "PROJECT",
            validation: "HUMAN_VERIFIED",
          },
        ],
      }),
    },
  );
  const permissions = [
    ["MEMORY_GATEWAY", "READ"],
    ["MEMORY_CONTEXT", "READ"],
    ["MEMORY_REFERENCE", "READ"],
  ] as const;
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "agent-1",
    actor_type: "AGENT",
    roles: [
      {
        id: "memory-reader",
        name: "MEMORY_READER",
        permissions: permissions.map(([resource, action]) => ({
          action,
          effect: "ALLOW" as const,
          environment: "development",
          resource,
          risk: "R0" as const,
          scope: "project-1",
        })),
      },
    ],
  }));
  const server = createApiServer({
    authenticate,
    environment: "development",
    readiness: () => service.isReady("memory-gateway-1"),
    routes: createMemoryGatewayRoutes(service, {
      environment: "development",
      resolvePolicy: () => policy,
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
    service,
  };
}

async function post(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: "Bearer identity-reference",
      "content-type": "application/json",
      "x-correlation-id": "corr-memory-api",
      "x-request-id": "request-memory-api",
    },
    method: "POST",
  });
  return {
    body: (await response.json()) as {
      data?: Record<string, unknown>;
      error?: { code: string };
    },
    response,
  };
}

test("returns safe gateway status and task-scoped memory references", async (t) => {
  const api = await startApi();
  t.after(api.close);
  const status = await post(api.baseUrl, "/api/v1/memory-gateways/status", {
    gateway_id: "memory-gateway-1",
  });
  assert.equal(status.response.status, 200);
  assert.deepEqual(status.body.data, {
    health: "HEALTHY",
    id: "memory-gateway-1",
    lifecycle: "ACTIVE",
    name: "Corporate AI Memory Gateway",
  });
  assert.equal(JSON.stringify(status.body).includes("credential_ref"), false);

  const retrieval = await post(api.baseUrl, "/api/v1/memory/context", {
    gateway_id: "memory-gateway-1",
    limit: 5,
    namespace: "/projects",
    project_id: "project-1",
    query: "launch checklist",
    run_id: "run-1",
    task_id: "task-1",
    timeout_ms: 100,
  });
  assert.equal(retrieval.response.status, 200);
  const references = retrieval.body.data?.references as Record<
    string,
    unknown
  >[];
  assert.equal(references[0]?.external_memory_id, "memory-1");
  assert.deepEqual(references[0]?.source, {
    external_resource_id: "checklist-1",
    system_id: "ai-memory-gateway",
  });

  const reference = await post(api.baseUrl, "/api/v1/memory-references/get", {
    reference_id: "memory-gateway-1:memory-1",
  });
  assert.equal(reference.response.status, 200);
  assert.equal(reference.body.data?.external_memory_id, "memory-1");
});

test("reports gateway unavailability through readiness and stable API errors", async (t) => {
  const api = await startApi();
  t.after(api.close);
  api.service.updateGatewayHealth("memory-gateway-1", "UNAVAILABLE");

  const readiness = await fetch(`${api.baseUrl}/health/ready`);
  assert.equal(readiness.status, 503);

  const retrieval = await post(api.baseUrl, "/api/v1/memory/context", {
    gateway_id: "memory-gateway-1",
    limit: 5,
    namespace: "/projects",
    project_id: "project-1",
    query: "launch checklist",
    task_id: "task-1",
    timeout_ms: 100,
  });
  assert.equal(retrieval.response.status, 503);
  assert.equal(retrieval.body.error?.code, "GATEWAY_UNAVAILABLE");
});
