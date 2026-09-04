import assert from "node:assert/strict";
import test from "node:test";
import {
  MEMORY_INTEGRATION_BOUNDARY,
  MEMORY_OVERLAP_CLASSIFICATION,
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
  now?: () => number,
) {
  const service = new MemoryGatewayIntegration(onEvent, now);
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

const phase3ValidItem = {
  ...validItem,
  kind: "KNOWLEDGE" as const,
  provenance: {
    ...validItem.provenance,
    confidence: 0.92,
    origin: "approved decision registry",
    project_id: "project-1",
    quality: "VERIFIED",
    references: ["artifact://decision-1"],
    retrieval_reason: "Matches the active task objective",
    source_identity: "knowledge-owner",
    system_id: "system-1",
  },
  version: "decision-v1",
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

test("assembles task context with complete scope and provenance while preserving canonical priority", async () => {
  const events: MemoryIntegrationEvent[] = [];
  const service = integration(
    {
      retrieve: async () => ({ items: [phase3ValidItem] }),
    },
    (event) => events.push(event),
    () => Date.parse("2026-09-03T01:00:00.000Z"),
  );
  const result = await service.assembleTaskContextPackage(
    {
      ...request,
      agent_id: "agent-1",
      allow_partial: false,
      categories: [
        "APPROVED_DECISIONS",
        "PROJECT_CONSTRAINTS",
        "REQUIRED_ARTIFACTS",
        "RELEVANT_MEMORY",
        "GENERAL_CORPORATE_POLICY",
      ],
      max_age_ms: 86_400_000,
      privacy: { allow_private_personal: false },
      requested_classifications: ["INTERNAL"],
      require_provenance: true,
      system_id: "system-1",
    },
    policy,
    {
      approved_decisions: ["decision"],
      general_corporate_policy: ["policy"],
      project_constraints: ["constraint"],
      required_artifacts: ["artifact"],
      task_instructions: ["instruction"],
    },
  );

  assert.equal(result.status, "READY");
  assert.equal(result.scope.agent_id, "agent-1");
  assert.equal(result.scope.system_id, "system-1");
  assert.equal(result.references[0]?.kind, "KNOWLEDGE");
  assert.equal(result.references[0]?.version, "decision-v1");
  assert.deepEqual(
    result.sections.map(({ kind }) => kind),
    [
      "TASK_INSTRUCTIONS",
      "APPROVED_DECISIONS",
      "PROJECT_CONSTRAINTS",
      "REQUIRED_ARTIFACTS",
      "RELEVANT_MEMORY",
      "GENERAL_CORPORATE_POLICY",
    ],
  );
  assert.deepEqual(result.references[0]?.provenance.references, [
    "artifact://decision-1",
  ]);
  assert.equal(events.at(-1)?.name, "MEMORY.CONTEXT_ASSEMBLED");
});

test("fails closed or returns explicit degraded partial context for stale and malformed results", async () => {
  const stale = integration(
    {
      retrieve: async () => ({ items: [phase3ValidItem] }),
    },
    undefined,
    () => Date.parse("2026-09-05T00:00:00.000Z"),
  );
  const phase3Request = {
    ...request,
    agent_id: "agent-1",
    allow_partial: false,
    categories: ["RELEVANT_MEMORY" as const],
    max_age_ms: 60_000,
    privacy: { allow_private_personal: false as const },
    requested_classifications: ["INTERNAL" as const],
    require_provenance: true as const,
    system_id: "system-1",
  };
  await assert.rejects(
    stale.assembleTaskContextPackage(phase3Request, policy, {
      approved_decisions: [],
      general_corporate_policy: [],
      project_constraints: [],
      required_artifacts: [],
      task_instructions: ["instruction"],
    }),
    (error: unknown) =>
      error instanceof MemoryGatewayError && error.code === "MEMORY_STALE",
  );

  const partial = await stale.assembleTaskContextPackage(
    { ...phase3Request, allow_partial: true },
    policy,
    {
      approved_decisions: [],
      general_corporate_policy: [],
      project_constraints: [],
      required_artifacts: [],
      task_instructions: ["instruction"],
    },
  );
  assert.equal(partial.status, "DEGRADED");
  assert.equal(partial.references.length, 0);
  assert.deepEqual(partial.degraded_reasons, ["MEMORY_STALE"]);
  assert.equal(
    stale.getIntegrationHealth("memory-gateway-1").provenance_issues,
    2,
  );
  assert.equal(
    stale.getIntegrationHealth("memory-gateway-1").health,
    "DEGRADED",
  );
  assert.equal(stale.getIntegrationHealth("memory-gateway-1").ready, false);

  const malformed = integration(
    {
      retrieve: async () => ({
        items: [
          phase3ValidItem,
          {
            ...phase3ValidItem,
            external_memory_id: "malformed-1",
            provenance: { ...phase3ValidItem.provenance, source_identity: "" },
          },
        ],
      }),
    },
    undefined,
    () => Date.parse("2026-09-03T01:00:00.000Z"),
  );
  const malformedPartial = await malformed.assembleTaskContextPackage(
    { ...phase3Request, allow_partial: true, max_age_ms: 86_400_000 },
    policy,
    {
      approved_decisions: [],
      general_corporate_policy: [],
      project_constraints: [],
      required_artifacts: [],
      task_instructions: ["instruction"],
    },
  );
  assert.equal(malformedPartial.status, "DEGRADED");
  assert.equal(malformedPartial.references.length, 1);
  assert.deepEqual(malformedPartial.degraded_reasons, [
    "INVALID_MEMORY_PROVENANCE",
  ]);
});

test("excludes classifications not requested for the current task context", async () => {
  const service = integration(
    {
      retrieve: async () => ({
        items: [
          phase3ValidItem,
          {
            ...phase3ValidItem,
            classification: "CONFIDENTIAL",
            external_memory_id: "confidential-1",
          },
        ],
      }),
    },
    undefined,
    () => Date.parse("2026-09-03T01:00:00.000Z"),
  );
  const result = await service.assembleTaskContextPackage(
    {
      ...request,
      agent_id: "agent-1",
      allow_partial: true,
      categories: ["RELEVANT_MEMORY"],
      max_age_ms: 86_400_000,
      privacy: { allow_private_personal: false },
      requested_classifications: ["INTERNAL"],
      require_provenance: true,
      system_id: "system-1",
    },
    policy,
    {
      approved_decisions: ["must not be included"],
      general_corporate_policy: ["must not be included"],
      project_constraints: ["must not be included"],
      required_artifacts: ["must not be included"],
      task_instructions: ["instruction"],
    },
  );
  assert.equal(result.references.length, 1);
  assert.deepEqual(result.degraded_reasons, [
    "MEMORY_CLASSIFICATION_NOT_REQUESTED",
  ]);
  assert.deepEqual(
    result.sections.map(({ kind }) => kind),
    ["TASK_INSTRUCTIONS", "RELEVANT_MEMORY"],
  );
});

test("rejects an agent requesting context for a different agent identity", async () => {
  const service = integration({
    retrieve: async () => ({ items: [phase3ValidItem] }),
  });
  await assert.rejects(
    service.assembleTaskContextPackage(
      {
        ...request,
        agent_id: "agent-2",
        allow_partial: false,
        categories: ["RELEVANT_MEMORY"],
        max_age_ms: 86_400_000,
        privacy: { allow_private_personal: false },
        requested_classifications: ["INTERNAL"],
        require_provenance: true,
        system_id: "system-1",
      },
      policy,
      {
        approved_decisions: [],
        general_corporate_policy: [],
        project_constraints: [],
        required_artifacts: [],
        task_instructions: [],
      },
    ),
    (error: unknown) =>
      error instanceof MemoryGatewayError &&
      error.code === "INVALID_TASK_CONTEXT_REQUEST",
  );
});

test("requires human validation before submitting a memory candidate to the existing gateway", async () => {
  const submitted: string[] = [];
  const events: MemoryIntegrationEvent[] = [];
  const service = integration(
    {
      retrieve: async () => ({ items: [] }),
      submitCandidate: async (candidate) => {
        submitted.push(candidate.id);
        return { external_memory_id: "gateway-candidate-1" };
      },
    },
    (event) => events.push(event),
  );
  const candidate = service.createMemoryCandidate({
    actor: { id: "agent-1", type: "AGENT" },
    content_hash: `sha256:${"a".repeat(64)}`,
    content_reference: "artifact://run-1/learned-constraint",
    correlation_id: "corr-candidate",
    evidence_ids: ["evidence-1"],
    gateway_id: "memory-gateway-1",
    id: "candidate-1",
    project_id: "project-1",
    task_id: "task-1",
    type: "PROJECT",
  });
  assert.equal(candidate.status, "PENDING");
  await assert.rejects(
    service.submitMemoryCandidate("candidate-1"),
    (error: unknown) =>
      error instanceof MemoryGatewayError &&
      error.code === "MEMORY_CANDIDATE_NOT_APPROVED",
  );
  assert.throws(
    () =>
      service.reviewMemoryCandidate("candidate-1", {
        actor: { id: "agent-2", type: "AGENT" },
        decision: "APPROVE",
        validation: "AGENT_VERIFIED",
      }),
    (error: unknown) =>
      error instanceof MemoryGatewayError &&
      error.code === "HUMAN_MEMORY_REVIEW_REQUIRED",
  );
  service.reviewMemoryCandidate("candidate-1", {
    actor: { id: "human-1", type: "HUMAN" },
    decision: "APPROVE",
    validation: "HUMAN_VERIFIED",
  });
  const merged = await service.submitMemoryCandidate("candidate-1");
  assert.equal(merged.status, "MERGED");
  assert.equal(merged.merged_external_memory_id, "gateway-candidate-1");
  assert.deepEqual(submitted, ["candidate-1"]);
  assert.equal(JSON.stringify(merged).includes("learned-constraint"), true);
  assert.equal("content" in merged, false);
  assert.deepEqual(
    events.map(({ name }) => name),
    [
      "MEMORY.CANDIDATE_CREATED",
      "MEMORY.CANDIDATE_APPROVED",
      "MEMORY.CANDIDATE_MERGED",
    ],
  );
});

test("keeps memory ownership and provider routing outside competing MAOS implementations", () => {
  assert.deepEqual(MEMORY_INTEGRATION_BOUNDARY, {
    memory_source_of_truth: "AI_MEMORY_GATEWAY",
    provider_router_owner: "MAOS_AGENT_MODEL_RUNNER_RUNTIME",
    gateway_role: "RETRIEVAL_RANKING_SUMMARIZATION",
    maos_persistence: "REFERENCE_AND_GOVERNANCE_METADATA_ONLY",
  });
  assert.equal(MEMORY_OVERLAP_CLASSIFICATION.PERSONAL_AGENT, "KEEP");
  assert.equal(MEMORY_OVERLAP_CLASSIFICATION.PROVIDER_ROUTING, "INTEGRATE");
  assert.equal(MEMORY_OVERLAP_CLASSIFICATION.CODE_EXECUTION, "KEEP");
});
