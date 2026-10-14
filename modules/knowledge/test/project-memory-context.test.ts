import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_MEMORY_CONTEXT_AUTHORITY_BOUNDARY,
  AiMemoryProjectContextAdapter,
  MemoryGatewayError,
  MemoryGatewayIntegration,
  type GatewayMemoryItem,
  type MemoryGatewayAdapter,
} from "../src/index.js";

const projectId = "70000000-0000-4000-8000-000000000003";
const requestId = "70000000-0000-4000-8000-000000000004";
const retrievedAt = "2026-10-14T00:00:00.000Z";

const validItem: GatewayMemoryItem = {
  classification: "INTERNAL",
  content: "The project previously selected a bounded adapter.",
  external_memory_id: "memory-1",
  namespace: "/projects",
  provenance: {
    confidence: 0.9,
    evidence_ids: ["evidence-1"],
    origin: "AI_MEMORY",
    project_id: projectId,
    quality: "VERIFIED",
    references: ["context://decision/1", "artifact://decision/1"],
    retrieval_reason: "PROJECT_CONTEXT_QUERY",
    retrieved_at: retrievedAt,
    source_identity: "ai-memory-gateway",
    system_id: "AI_MEMORY",
  },
  scope_id: projectId,
  source: {
    external_resource_id: "conversation-1",
    system_id: "AI_MEMORY",
  },
  type: "PROJECT",
  validation: "SYSTEM_VERIFIED",
  kind: "MEMORY",
  version: "1",
};

function fixture(
  adapter: MemoryGatewayAdapter,
  now = () => Date.parse("2026-10-14T00:01:00.000Z"),
) {
  const gateway = new MemoryGatewayIntegration(undefined, now);
  gateway.registerGateway(
    {
      credential_ref: "secret://ai-memory/local-fixture",
      endpoint: "https://ai-memory.example.test",
      health: "HEALTHY",
      id: "ai-memory-1",
      lifecycle: "ACTIVE",
      name: "AI Memory local fixture",
    },
    adapter,
  );
  return new AiMemoryProjectContextAdapter(gateway, {
    accessPolicy: {
      allowedClassifications: ["INTERNAL"],
      allowedTypes: ["PROJECT", "DECISION", "TASK"],
    },
    actor: { id: "maos-memory-context", type: "SYSTEM" },
    gatewayId: "ai-memory-1",
    maxAgeMs: 86_400_000,
    systemId: "AI_MEMORY",
    timeoutMs: 100,
  });
}

const query = {
  projectId,
  requestId,
  correlationId: "correlation-m6",
  query: "Find prior project decisions relevant to the current request",
  limit: 5,
};

test("project context query returns a safe DTO with preserved project binding and references", async () => {
  const service = fixture({ retrieve: async () => ({ items: [validItem] }) });
  const result = await service.queryProjectContext(query);

  assert.equal(result.status, "AVAILABLE");
  assert.equal(result.items[0]?.projectId, projectId);
  assert.equal(result.items[0]?.memoryRef, "ai-memory-1:memory-1");
  assert.equal(
    result.items[0]?.summary,
    "The project previously selected a bounded adapter.",
  );
  assert.equal(result.items[0]?.occurredAt, retrievedAt);
  assert.deepEqual(result.contextRefs, [
    "ai-memory-1:memory-1",
    "context://decision/1",
  ]);
  assert.deepEqual(result.artifactRefs, ["artifact://decision/1"]);
});

test("safe context DTO omits credentials and raw backend identity", async () => {
  const service = fixture({ retrieve: async () => ({ items: [validItem] }) });
  const serialized = JSON.stringify(await service.queryProjectContext(query));
  assert.equal(serialized.includes("secret://"), false);
  assert.equal(serialized.includes("conversation-1"), false);
  assert.equal(serialized.includes("external_memory_id"), false);
  assert.equal(serialized.includes("credential_ref"), false);
});

test("high-confidence secret material is rejected instead of exposed as a summary", async () => {
  const service = fixture({
    retrieve: async () => ({
      items: [
        {
          ...validItem,
          content: `sk-${"x".repeat(32)}`,
        },
      ],
    }),
  });
  const result = await service.queryProjectContext(query);
  assert.equal(result.status, "DEGRADED");
  assert.equal(result.warningCode, "AI_MEMORY_CONTEXT_REJECTED");
  assert.equal(JSON.stringify(result).includes("sk-"), false);
});

test("secret references are rejected instead of exposed as safe context", async () => {
  const service = fixture({
    retrieve: async () => ({
      items: [
        {
          ...validItem,
          provenance: {
            ...validItem.provenance,
            references: ["secret://ai-memory/raw-credential"],
          },
        },
      ],
    }),
  });
  const result = await service.queryProjectContext(query);
  assert.equal(result.status, "DEGRADED");
  assert.equal(JSON.stringify(result).includes("secret://"), false);
});

test("empty memory is non-blocking and does not fabricate context", async () => {
  const service = fixture({ retrieve: async () => ({ items: [] }) });
  const result = await service.queryProjectContext(query);
  assert.equal(result.status, "EMPTY");
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.contextRefs, []);
  assert.equal(result.warningCode, "AI_MEMORY_EMPTY");
});

test("timeout or unavailable memory is non-blocking", async () => {
  const service = fixture({
    retrieve: async () => {
      throw new MemoryGatewayError("GATEWAY_TIMED_OUT");
    },
  });
  const result = await service.queryProjectContext(query);
  assert.equal(result.status, "UNAVAILABLE");
  assert.equal(result.warningCode, "AI_MEMORY_UNAVAILABLE");
  assert.deepEqual(result.contextRefs, []);
});

test("malformed memory response is rejected safely", async () => {
  const service = fixture({
    retrieve: async () => ({
      items: [
        {
          ...validItem,
          source: { ...validItem.source, system_id: "" },
        },
      ],
    }),
  });
  const result = await service.queryProjectContext(query);
  assert.equal(result.status, "DEGRADED");
  assert.equal(result.warningCode, "AI_MEMORY_CONTEXT_REJECTED");
  assert.deepEqual(result.items, []);
});

test("stale memory is omitted without becoming current project state", async () => {
  const service = fixture(
    { retrieve: async () => ({ items: [validItem] }) },
    () => Date.parse("2026-10-16T00:00:00.000Z"),
  );
  const result = await service.queryProjectContext(query);
  assert.equal(result.status, "DEGRADED");
  assert.equal(result.warningCode, "AI_MEMORY_CONTEXT_REJECTED");
  assert.deepEqual(result.contextRefs, []);
});

test("AI Memory remains contextual evidence with no MAOS authority", () => {
  assert.deepEqual(AI_MEMORY_CONTEXT_AUTHORITY_BOUNDARY, {
    currentProjectStateAuthority: false,
    routingAuthority: false,
    approvalAuthority: false,
    executionAuthority: false,
  });
});
