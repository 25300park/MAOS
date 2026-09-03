import assert from "node:assert/strict";
import test from "node:test";
import {
  MemoryGatewayError,
  MemoryGatewayIntegration,
  assembleTaskContext,
  type MemoryAccessPolicy,
  type MemoryGatewayAdapter,
  type MemoryGatewayRetrievalRequest,
  type MemoryIntegrationEvent,
} from "../src/index.js";

const policy: MemoryAccessPolicy = {
  allowed_classifications: ["INTERNAL", "CONFIDENTIAL"],
  allowed_namespaces: ["/projects"],
  allowed_types: ["PROJECT", "DECISION"],
};

const request: MemoryGatewayRetrievalRequest = {
  actor: { id: "agent-1", type: "AGENT" },
  correlation_id: "corr-1",
  gateway_id: "memory-gateway-1",
  limit: 5,
  namespace: "/projects",
  project_id: "project-1",
  query: "approved launch decision",
  request_id: "request-1",
  run_id: "run-1",
  task_id: "task-1",
  timeout_ms: 100,
};

function integration(
  adapter: MemoryGatewayAdapter,
  onEvent?: (event: MemoryIntegrationEvent) => void,
) {
  const service = new MemoryGatewayIntegration(onEvent);
  service.registerGateway(
    {
      credential_ref: "secret://memory-gateway/service-token",
      endpoint: "https://memory.internal.example/v1",
      health: "HEALTHY",
      id: "memory-gateway-1",
      lifecycle: "ACTIVE",
      name: "Corporate AI Memory Gateway",
    },
    adapter,
  );
  return service;
}

const validItem = {
  classification: "INTERNAL" as const,
  content: "Launch requires legal sign-off.",
  external_memory_id: "memory-1",
  namespace: "/projects" as const,
  provenance: {
    evidence_ids: ["evidence-1"],
    retrieved_at: "2026-09-03T00:00:00.000Z",
  },
  scope_id: "project-1",
  source: {
    external_resource_id: "decision-1",
    system_id: "ai-memory-gateway",
  },
  type: "DECISION" as const,
  validation: "HUMAN_VERIFIED" as const,
};

test("registers a healthy gateway using only a credential reference", () => {
  const service = integration({
    retrieve: async () => ({ items: [] }),
  });
  const gateway = service.getGateway("memory-gateway-1");
  assert.equal(gateway.credential_ref, "secret://memory-gateway/service-token");
  assert.equal(service.isReady("memory-gateway-1"), true);
  assert.throws(
    () =>
      service.registerGateway(
        {
          ...gateway,
          credential_ref: "raw-token-value",
          id: "unsafe-gateway",
        },
        { retrieve: async () => ({ items: [] }) },
      ),
    (error: unknown) =>
      error instanceof MemoryGatewayError &&
      error.code === "INVALID_CREDENTIAL_REFERENCE",
  );
  assert.throws(
    () =>
      service.registerGateway(
        {
          ...gateway,
          endpoint: "http://memory.internal.example/v1",
          id: "insecure-gateway",
        },
        { retrieve: async () => ({ items: [] }) },
      ),
    (error: unknown) =>
      error instanceof MemoryGatewayError &&
      error.code === "INVALID_GATEWAY_ENDPOINT",
  );
});

test("retrieves task-scoped memory while preserving source and provenance", async () => {
  let receivedCredential = "";
  const service = integration({
    retrieve: async (_input, context) => {
      receivedCredential = context.credential_ref;
      return { items: [validItem] };
    },
  });
  const result = await service.retrieveTaskContext(request, policy);
  assert.equal(receivedCredential, "secret://memory-gateway/service-token");
  assert.deepEqual(result.references, [
    {
      ...validItem,
      gateway_id: "memory-gateway-1",
      id: "memory-gateway-1:memory-1",
    },
  ]);
  assert.deepEqual(result.evidence, {
    excluded_count: 0,
    gateway_id: "memory-gateway-1",
    reference_count: 1,
    task_id: "task-1",
  });
  assert.deepEqual(
    result.events.map(({ name }) => name),
    ["MEMORY.RETRIEVAL_REQUESTED", "MEMORY.RETRIEVAL_SUCCEEDED"],
  );
});

test("defaults retrieval to deny and enforces task, namespace, type, and classification scope", async () => {
  const service = integration({
    retrieve: async () => ({ items: [validItem] }),
  });
  for (const restrictedPolicy of [
    { ...policy, allowed_namespaces: [] },
    { ...policy, allowed_types: [] },
    { ...policy, allowed_classifications: [] },
  ]) {
    await assert.rejects(
      service.retrieveTaskContext(request, restrictedPolicy),
      (error: unknown) =>
        error instanceof MemoryGatewayError &&
        error.code === "MEMORY_ACCESS_DENIED",
    );
  }
  await assert.rejects(
    service.retrieveTaskContext(
      { ...request, project_id: "project-2" },
      policy,
    ),
    (error: unknown) =>
      error instanceof MemoryGatewayError &&
      error.code === "MEMORY_SCOPE_MISMATCH",
  );
});

test("excludes PRIVATE_PERSONAL results from corporate task retrieval", async () => {
  const service = integration({
    retrieve: async () => ({
      items: [
        validItem,
        {
          ...validItem,
          classification: "PRIVATE_PERSONAL",
          external_memory_id: "private-1",
        },
      ],
    }),
  });
  const result = await service.retrieveTaskContext(request, policy);
  assert.equal(result.references.length, 1);
  assert.equal(result.evidence.excluded_count, 1);
});

test("fails closed when gateway metadata lacks canonical provenance", async () => {
  const service = integration({
    retrieve: async () => ({
      items: [
        {
          ...validItem,
          provenance: { evidence_ids: [], retrieved_at: "" },
        },
      ],
    }),
  });
  await assert.rejects(
    service.retrieveTaskContext(request, policy),
    (error: unknown) =>
      error instanceof MemoryGatewayError &&
      error.code === "INVALID_MEMORY_PROVENANCE",
  );
});

test("preserves canonical task context priority with memory below required artifacts", () => {
  const context = assembleTaskContext({
    approved_decisions: ["decision"],
    general_corporate_policy: ["policy"],
    project_constraints: ["constraint"],
    relevant_memory: ["memory"],
    required_artifacts: ["artifact"],
    task_instructions: ["instruction"],
  });
  assert.deepEqual(
    context.sections.map(({ kind }) => kind),
    [
      "TASK_INSTRUCTIONS",
      "APPROVED_DECISIONS",
      "PROJECT_CONSTRAINTS",
      "REQUIRED_ARTIFACTS",
      "RELEVANT_MEMORY",
      "GENERAL_CORPORATE_POLICY",
    ],
  );
});

test("bounds retry, timeout, cancellation, and unavailable gateway behavior", async () => {
  let attempts = 0;
  const retrying = integration({
    retrieve: async () => {
      attempts += 1;
      if (attempts === 1)
        throw new MemoryGatewayError("GATEWAY_TRANSIENT_FAILURE", {}, true);
      return { items: [validItem] };
    },
  });
  assert.equal(
    (
      await retrying.retrieveTaskContext(
        { ...request, max_attempts: 2 },
        policy,
      )
    ).references.length,
    1,
  );
  assert.equal(attempts, 2);

  const blocking = integration({
    retrieve: async (_input, { signal }) =>
      new Promise((resolve) => {
        signal.addEventListener("abort", () => resolve({ items: [] }), {
          once: true,
        });
      }),
  });
  await assert.rejects(
    blocking.retrieveTaskContext({ ...request, timeout_ms: 5 }, policy),
    (error: unknown) =>
      error instanceof MemoryGatewayError && error.code === "GATEWAY_TIMED_OUT",
  );

  const controller = new AbortController();
  const cancelled = blocking.retrieveTaskContext(
    request,
    policy,
    controller.signal,
  );
  controller.abort();
  await assert.rejects(
    cancelled,
    (error: unknown) =>
      error instanceof MemoryGatewayError && error.code === "GATEWAY_CANCELLED",
  );

  blocking.updateGatewayHealth("memory-gateway-1", "UNAVAILABLE");
  assert.equal(blocking.isReady("memory-gateway-1"), false);
  await assert.rejects(
    blocking.retrieveTaskContext(request, policy),
    (error: unknown) =>
      error instanceof MemoryGatewayError &&
      error.code === "GATEWAY_UNAVAILABLE",
  );
});

test("emits structured failure evidence without query or credential values", async () => {
  const events: MemoryIntegrationEvent[] = [];
  const service = integration(
    {
      retrieve: async () => {
        throw new Error("external failure");
      },
    },
    (event) => events.push(event),
  );
  await assert.rejects(
    service.retrieveTaskContext(request, policy),
    (error: unknown) =>
      error instanceof MemoryGatewayError && error.code === "GATEWAY_FAILURE",
  );
  assert.deepEqual(
    events.map(({ name }) => name),
    ["MEMORY.RETRIEVAL_REQUESTED", "MEMORY.RETRIEVAL_FAILED"],
  );
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes(request.query), false);
  assert.equal(serialized.includes("service-token"), false);
});
