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

const TEST_NOW = Date.parse("2026-09-03T12:00:00.000Z");

async function startApi(actorType: "AGENT" | "HUMAN" = "AGENT") {
  const service = new MemoryGatewayIntegration(undefined, () => TEST_NOW);
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
            kind: "KNOWLEDGE",
            namespace: "/projects",
            provenance: {
              confidence: 0.92,
              evidence_ids: ["evidence-1"],
              origin: "approved project registry",
              project_id: "project-1",
              quality: "VERIFIED",
              references: ["artifact://checklist-1"],
              retrieval_reason: "Matches the active task objective",
              retrieved_at: new Date(TEST_NOW - 60_000).toISOString(),
              source_identity: "knowledge-owner",
              system_id: "system-1",
            },
            scope_id: "project-1",
            source: {
              external_resource_id: "checklist-1",
              system_id: "ai-memory-gateway",
            },
            type: "PROJECT",
            validation: "HUMAN_VERIFIED",
            version: "checklist-v1",
          },
        ],
      }),
      submitCandidate: async () => ({
        external_memory_id: "gateway-candidate-1",
      }),
    },
  );
  const permissions = [
    ["MEMORY_GATEWAY", "READ"],
    ["MEMORY_CONTEXT", "READ"],
    ["MEMORY_REFERENCE", "READ"],
    ["MEMORY_CONTEXT_PACKAGE", "READ"],
    ["MEMORY_INTEGRATION_HEALTH", "READ"],
    ["MEMORY_CANDIDATE", "CREATE"],
    ["MEMORY_CANDIDATE", "REVIEW"],
    ["MEMORY_CANDIDATE", "SUBMIT"],
  ] as const;
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "agent-1",
    actor_type: actorType,
    roles: [
      {
        id: "memory-reader",
        name: "MEMORY_READER",
        permissions: permissions.map(([resource, action]) => ({
          action,
          effect: "ALLOW" as const,
          environment: "development",
          resource,
          risk:
            resource === "MEMORY_CANDIDATE" ? ("R2" as const) : ("R0" as const),
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

test("returns a task-scoped context package and observable gateway health without credentials", async (t) => {
  const api = await startApi();
  t.after(api.close);
  const assembled = await post(
    api.baseUrl,
    "/api/v1/memory/context-packages/assemble",
    {
      agent_id: "agent-1",
      allow_partial: false,
      approved_decisions: ["decision"],
      categories: ["RELEVANT_MEMORY"],
      gateway_id: "memory-gateway-1",
      general_corporate_policy: ["policy"],
      limit: 5,
      max_age_ms: 604_800_000,
      namespace: "/projects",
      privacy: { allow_private_personal: false },
      project_constraints: ["constraint"],
      project_id: "project-1",
      query: "launch checklist",
      requested_classifications: ["INTERNAL"],
      require_provenance: true,
      required_artifacts: ["artifact"],
      system_id: "system-1",
      task_id: "task-1",
      task_instructions: ["instruction"],
      timeout_ms: 100,
    },
  );
  assert.equal(assembled.response.status, 200);
  assert.equal(assembled.body.data?.status, "READY");
  assert.deepEqual(assembled.body.data?.scope, {
    agent_id: "agent-1",
    project_id: "project-1",
    system_id: "system-1",
    task_id: "task-1",
  });

  const health = await post(api.baseUrl, "/api/v1/memory-gateways/health", {
    gateway_id: "memory-gateway-1",
  });
  assert.equal(health.response.status, 200);
  assert.equal(health.body.data?.health, "HEALTHY");
  assert.equal(health.body.data?.ready, true);
  assert.equal(JSON.stringify(health.body).includes("credential_ref"), false);
});

test("keeps memory candidate creation, human review, and gateway submission as separate API operations", async (t) => {
  const api = await startApi("HUMAN");
  t.after(api.close);
  const created = await post(api.baseUrl, "/api/v1/memory-candidates/create", {
    content_hash: `sha256:${"b".repeat(64)}`,
    content_reference: "artifact://task-1/improvement-1",
    evidence_ids: ["evidence-1"],
    gateway_id: "memory-gateway-1",
    id: "candidate-api-1",
    project_id: "project-1",
    task_id: "task-1",
    type: "PROJECT",
  });
  assert.equal(created.response.status, 200);
  assert.equal(created.body.data?.status, "PENDING");

  const reviewed = await post(api.baseUrl, "/api/v1/memory-candidates/review", {
    candidate_id: "candidate-api-1",
    decision: "APPROVE",
    validation: "HUMAN_VERIFIED",
  });
  assert.equal(reviewed.response.status, 200);
  assert.equal(reviewed.body.data?.status, "APPROVED");

  const submitted = await post(
    api.baseUrl,
    "/api/v1/memory-candidates/submit",
    {
      candidate_id: "candidate-api-1",
    },
  );
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.data?.status, "MERGED");
  assert.equal(
    submitted.body.data?.merged_external_memory_id,
    "gateway-candidate-1",
  );
});

test("rejects malformed context and memory-candidate contracts at the service boundary", async (t) => {
  const api = await startApi("HUMAN");
  t.after(api.close);
  const malformedContext = await post(
    api.baseUrl,
    "/api/v1/memory/context-packages/assemble",
    {
      agent_id: "agent-1",
      allow_partial: false,
      approved_decisions: [],
      categories: "RELEVANT_MEMORY",
      gateway_id: "memory-gateway-1",
      general_corporate_policy: [],
      limit: 5,
      max_age_ms: 1000,
      namespace: "/projects",
      privacy: { allow_private_personal: false },
      project_constraints: [],
      project_id: "project-1",
      query: "query",
      requested_classifications: ["INTERNAL"],
      require_provenance: true,
      required_artifacts: [],
      system_id: "system-1",
      task_id: "task-1",
      task_instructions: [],
      timeout_ms: 100,
    },
  );
  assert.equal(malformedContext.response.status, 422);
  assert.equal(
    malformedContext.body.error?.code,
    "INVALID_TASK_CONTEXT_REQUEST",
  );

  const malformedCandidate = await post(
    api.baseUrl,
    "/api/v1/memory-candidates/create",
    {
      content_hash: `sha256:${"c".repeat(64)}`,
      content_reference: "artifact://task-1/candidate",
      evidence_ids: ["evidence-1"],
      gateway_id: "memory-gateway-1",
      id: "candidate-invalid",
      project_id: "project-1",
      task_id: "task-1",
      type: "RAW_CHAT",
    },
  );
  assert.equal(malformedCandidate.response.status, 422);
  assert.equal(malformedCandidate.body.error?.code, "INVALID_MEMORY_CANDIDATE");
});
