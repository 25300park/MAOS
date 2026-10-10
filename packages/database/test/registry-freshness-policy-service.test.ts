import assert from "node:assert/strict";
import test from "node:test";

import {
  RegistryFreshnessPolicyService,
  RoutingContractError,
  type RegistryFreshnessPolicyRepository,
} from "../src/index.js";

const id = (n: string) => `31000000-0000-4000-8000-${n.padStart(12, "0")}`;
const sha = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;
const now = new Date("2026-10-11T00:00:00.000Z");

const input = {
  registryFreshnessPolicyVersionId: id("10"),
  registryFreshnessPolicyId: id("11"),
  policyVersion: 1,
  supersedesPolicyVersionId: null,
  authorityIdentifier:
    "MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD" as const,
  registryScope: "PHASE15B_AI_REGISTRY" as const,
  environment: "STAGING" as const,
  maxAgeMs: 60_000,
  lifecycleIntent: "ACTIVE" as const,
  effectiveAt: now.toISOString(),
  contentFingerprint: sha("a"),
  idempotencyKey: "policy-1",
  actorType: "HUMAN" as const,
  actorId: id("1"),
  reasonCode: "CREATE_POLICY",
  evidenceRefs: ["evidence:policy:1"],
  correlationId: "correlation-1",
  traceId: "trace-1",
  spanId: "span-1",
};

function repository(
  overrides: Partial<RegistryFreshnessPolicyRepository> = {},
) {
  return {
    appendPolicyVersion: async () => ({
      outcome: "CREATED" as const,
      policy: Object.freeze({
        policyVersionId: id("10"),
        policyRef: id("11"),
        policyVersion: 1,
        supersedesPolicyVersionId: null,
        authorityIdentifier: input.authorityIdentifier,
        registryScope: input.registryScope,
        environment: input.environment,
        maxAgeMs: input.maxAgeMs,
        lifecycleIntent: input.lifecycleIntent,
        effectiveAt: input.effectiveAt,
        contentFingerprint: input.contentFingerprint,
        actorType: input.actorType,
        actorId: input.actorId,
        reasonCode: input.reasonCode,
        evidenceRefs: Object.freeze([...input.evidenceRefs]),
        auditRef: id("90"),
        createdAt: input.effectiveAt,
      }),
      auditRef: id("90"),
    }),
    findPolicyVersion: async () => undefined,
    resolveCurrentPolicy: async () => {
      throw new RoutingContractError("ROUTING_POLICY_MISSING");
    },
    appendActivationEvent: async () => {
      throw new Error("unused");
    },
    activatePolicy: async () => {
      throw new Error("unused");
    },
    retireCurrentPolicy: async () => {
      throw new Error("unused");
    },
    readActivationHistory: async () => [],
    ...overrides,
  } satisfies RegistryFreshnessPolicyRepository;
}

test("accepts only the canonical steward, scope, and environment", async () => {
  let calls = 0;
  const service = new RegistryFreshnessPolicyService(
    repository({
      appendPolicyVersion: async (value) => {
        calls += 1;
        assert.equal(value, input);
        return repository().appendPolicyVersion(value);
      },
    }),
    () => now,
  );
  assert.equal((await service.appendPolicyVersion(input)).outcome, "CREATED");

  for (const changed of [
    { authorityIdentifier: "APPLICATION_RUNTIME" },
    { registryScope: "OTHER_REGISTRY" },
    { environment: "OTHER" },
  ]) {
    await assert.rejects(
      service.appendPolicyVersion({ ...input, ...changed } as never),
      (error) =>
        error instanceof RoutingContractError && error.code === "POLICY_DENIED",
    );
  }
  assert.equal(calls, 1);
});

test("maxAgeMs is a positive safe integer and keeps freshUntil representable", async () => {
  const service = new RegistryFreshnessPolicyService(repository(), () => now);
  for (const maxAgeMs of [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    8_640_000_000_000_000,
  ]) {
    await assert.rejects(
      service.appendPolicyVersion({ ...input, maxAgeMs }),
      (error) =>
        error instanceof RoutingContractError && error.code === "POLICY_DENIED",
      String(maxAgeMs),
    );
  }
  assert.equal(
    (
      await service.appendPolicyVersion({
        ...input,
        maxAgeMs: 1,
      })
    ).outcome,
    "CREATED",
  );
});

test("rejects malformed immutable append material before repository mutation", async () => {
  let calls = 0;
  const service = new RegistryFreshnessPolicyService(
    repository({
      appendPolicyVersion: async () => {
        calls += 1;
        return repository().appendPolicyVersion(input);
      },
    }),
    () => now,
  );
  for (const changed of [
    { policyVersion: 0 },
    { policyVersion: 2, supersedesPolicyVersionId: null },
    { policyVersion: 1, supersedesPolicyVersionId: id("99") },
    { lifecycleIntent: "UNKNOWN" },
    { effectiveAt: "not-a-date" },
    { contentFingerprint: "not-a-fingerprint" },
    { idempotencyKey: " " },
    { reasonCode: " " },
    { evidenceRefs: [""] },
  ]) {
    await assert.rejects(
      service.appendPolicyVersion({ ...input, ...changed } as never),
      (error) =>
        error instanceof RoutingContractError && error.code === "POLICY_DENIED",
    );
  }
  assert.equal(calls, 0);
});

test("delegates exact current resolution and preserves fail-closed errors", async () => {
  const current = {
    policyRef: id("11"),
    policyVersion: 1,
    maxAgeMs: 60_000,
    environment: "STAGING" as const,
    registryScope: "PHASE15B_AI_REGISTRY" as const,
    effectiveState: "ACTIVE" as const,
    activationEventRef: id("20"),
    selectionSequence: 1,
  };
  const service = new RegistryFreshnessPolicyService(
    repository({ resolveCurrentPolicy: async () => Object.freeze(current) }),
    () => now,
  );
  assert.deepEqual(
    await service.resolveCurrentPolicy({
      registryScope: "PHASE15B_AI_REGISTRY",
      environment: "STAGING",
    }),
    current,
  );
  for (const code of [
    "ROUTING_POLICY_MISSING",
    "ROUTING_POLICY_CONFLICT",
  ] as const) {
    await assert.rejects(
      new RegistryFreshnessPolicyService(
        repository({
          resolveCurrentPolicy: async () => {
            throw new RoutingContractError(code);
          },
        }),
      ).resolveCurrentPolicy({
        registryScope: "PHASE15B_AI_REGISTRY",
        environment: "STAGING",
      }),
      (error) => error instanceof RoutingContractError && error.code === code,
    );
  }
});

test("mutation methods reject noncanonical authority before reaching repository", async () => {
  let mutations = 0;
  const service = new RegistryFreshnessPolicyService(
    repository({
      activatePolicy: async () => {
        mutations += 1;
        throw new Error("unexpected");
      },
      retireCurrentPolicy: async () => {
        mutations += 1;
        throw new Error("unexpected");
      },
    }),
  );
  const common = {
    registryFreshnessPolicyActivationEventId: id("20"),
    authorityIdentifier: "APPLICATION_RUNTIME" as never,
    registryScope: "PHASE15B_AI_REGISTRY" as const,
    environment: "STAGING" as const,
    actorType: "HUMAN" as const,
    actorId: id("1"),
    reasonCode: "MUTATE",
    evidenceRefs: [] as string[],
    idempotencyKey: "mutation-1",
    correlationId: "correlation-1",
    traceId: "trace-1",
    spanId: "span-1",
  };
  await assert.rejects(
    service.activatePolicy({
      ...common,
      registryFreshnessPolicyId: id("11"),
      policyVersion: 1,
      expectedActivationEventId: null,
    }),
    /POLICY_DENIED/u,
  );
  await assert.rejects(
    service.retireCurrentPolicy({
      ...common,
      expectedActivationEventId: id("21"),
      expectedPolicyId: id("11"),
      expectedPolicyVersion: 1,
    }),
    /POLICY_DENIED/u,
  );
  assert.equal(mutations, 0);
});
