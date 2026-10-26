import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  RoutingContractError,
  RoutingPolicyService,
  RoutingPolicyStewardService,
  type RoutingPolicyRepository,
  type RoutingPolicySnapshot,
} from "../src/index.js";

const id = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, "0")}`;
const sha = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;
const now = "2026-10-09T00:00:00.000Z";

const policy: RoutingPolicySnapshot = Object.freeze({
  routingPolicyVersionId: id("10"),
  routingPolicyId: id("11"),
  version: 1,
  supersedesPolicyVersionId: null,
  authorityIdentifier: "MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD",
  lifecycleIntent: "ACTIVE",
  canonicalDomain: "OPERATIONS",
  routingPurpose: "PRIMARY_EXECUTION",
  roleClass: "EXECUTOR",
  organizationId: id("1"),
  projectId: id("3"),
  scopeRef: "project:operations",
  environment: "STAGING",
  requiredCapabilityRefs: [],
  preferredCapabilityRefs: [],
  policyConstraints: {},
  effectiveAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
  contentFingerprint: sha("a"),
  createdByActorType: "HUMAN",
  createdByActorId: id("4"),
  auditRef: id("5"),
  createdAt: "2026-01-01T00:00:00.000Z",
  activation: Object.freeze({
    routingPolicyActivationEventId: id("20"),
    routingPolicyId: id("11"),
    routingPolicyVersionId: id("10"),
    applicabilityFingerprint: sha("b"),
    selectionSequence: 1,
    eventType: "ACTIVATE",
    supersedesActivationEventId: null,
    actorType: "HUMAN",
    actorId: id("4"),
    reasonCode: "INITIAL_ACTIVATION",
    evidenceRefs: [],
    auditRef: id("6"),
    createdAt: "2026-01-01T00:00:00.000Z",
  }),
});

function repository(overrides: Partial<RoutingPolicyRepository> = {}) {
  return {
    appendPolicyVersion: async () => ({
      outcome: "CREATED" as const,
      policy,
      auditRef: id("5"),
    }),
    appendSpecializationVersion: async () => {
      throw new Error("unused");
    },
    activatePolicyVersion: async () => {
      throw new Error("unused");
    },
    findPolicyVersion: async () => policy,
    findPolicyVersionByIdentity: async (id, version) =>
      id === policy.routingPolicyId && version === policy.version
        ? policy
        : undefined,
    findSpecializationVersion: async () => undefined,
    findCurrentSpecializationVersion: async () => undefined,
    listCurrentSelections: async () => [policy],
    ...overrides,
  } satisfies RoutingPolicyRepository;
}

const context = {
  canonicalDomain: "OPERATIONS" as const,
  routingPurpose: "PRIMARY_EXECUTION" as const,
  roleClass: "EXECUTOR" as const,
  organizationId: id("1"),
  projectId: id("3"),
  scopeRef: "project:operations",
  environment: "STAGING" as const,
  effectiveAt: now,
};

test("resolves exactly one effective active policy and fails closed otherwise", async () => {
  const service = new RoutingPolicyService(repository(), () => new Date(now));
  assert.equal(
    (await service.resolveActivePolicy(context)).routingPolicyVersionId,
    id("10"),
  );
  await assert.rejects(
    new RoutingPolicyService(
      repository({ listCurrentSelections: async () => [] }),
      () => new Date(now),
    ).resolveActivePolicy(context),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "ROUTING_POLICY_MISSING",
  );
  await assert.rejects(
    new RoutingPolicyService(
      repository({ listCurrentSelections: async () => [policy, policy] }),
      () => new Date(now),
    ).resolveActivePolicy(context),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "ROUTING_POLICY_CONFLICT",
  );
  await assert.rejects(
    new RoutingPolicyService(
      repository({
        listCurrentSelections: async () => [
          { ...policy, expiresAt: "2026-01-01T00:00:00.000Z" },
        ],
      }),
      () => new Date(now),
    ).resolveActivePolicy(context),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "ROUTING_POLICY_STALE",
  );
});

test("reads an exact policy identity and version through the canonical policy service", async () => {
  const calls: Array<{ id: string; version: number }> = [];
  const service = new RoutingPolicyService(
    repository({
      findPolicyVersionByIdentity: async (id, version) => {
        calls.push({ id, version });
        return id === policy.routingPolicyId && version === policy.version
          ? policy
          : undefined;
      },
    }),
  );

  assert.equal(
    (await service.getPolicyVersion(policy.routingPolicyId, policy.version))
      ?.routingPolicyVersionId,
    policy.routingPolicyVersionId,
  );
  assert.deepEqual(calls, [
    { id: policy.routingPolicyId, version: policy.version },
  ]);
});

test("superseded, draft, retired, and scope-mismatched policies never resolve", async () => {
  for (const lifecycleIntent of ["DRAFT", "SUPERSEDED", "RETIRED"] as const) {
    await assert.rejects(
      new RoutingPolicyService(
        repository({
          listCurrentSelections: async () => [{ ...policy, lifecycleIntent }],
        }),
        () => new Date(now),
      ).resolveActivePolicy(context),
      (error) =>
        error instanceof RoutingContractError &&
        error.code === "ROUTING_POLICY_INACTIVE",
      lifecycleIntent,
    );
  }
  await assert.rejects(
    new RoutingPolicyService(
      repository({
        listCurrentSelections: async () => [
          { ...policy, scopeRef: "project:other" },
        ],
      }),
      () => new Date(now),
    ).resolveActivePolicy(context),
    (error) =>
      error instanceof RoutingContractError && error.code === "POLICY_DENIED",
  );
});

test("steward policy creation rejects invalid tuples and Development native execution", async () => {
  const steward = new RoutingPolicyStewardService(repository());
  const base = {
    routingPolicyVersionId: id("10"),
    routingPolicyId: id("11"),
    expectedPredecessorId: null,
    authorityIdentifier: "MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD" as const,
    lifecycleIntent: "DRAFT" as const,
    canonicalDomain: "OPERATIONS" as const,
    routingPurpose: "PRIMARY_EXECUTION" as const,
    roleClass: "EXECUTOR" as const,
    organizationId: id("1"),
    projectId: id("3"),
    scopeRef: "project:operations",
    environment: "STAGING" as const,
    requiredCapabilityRefs: [] as string[],
    preferredCapabilityRefs: [] as string[],
    policyConstraints: {},
    effectiveAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    contentFingerprint: sha("a"),
    actorType: "HUMAN" as const,
    actorId: id("4"),
    evidenceRefs: [] as string[],
    idempotencyKey: "policy-1",
    correlationId: "c",
    traceId: "t",
    spanId: "s",
  };
  assert.equal((await steward.createPolicyVersion(base)).outcome, "CREATED");
  for (const invalid of [
    { roleClass: "QA_REVIEWER" },
    { routingPurpose: "FALLBACK" },
    { routingPurpose: "INDEPENDENT_REVIEW", roleClass: "EXECUTOR" },
  ]) {
    await assert.rejects(
      steward.createPolicyVersion({ ...base, ...invalid } as never),
      (error) =>
        error instanceof RoutingContractError && error.code === "POLICY_DENIED",
    );
  }
  await assert.rejects(
    steward.createPolicyVersion({
      ...base,
      canonicalDomain: "DEVELOPMENT",
      lifecycleIntent: "ACTIVE",
      policyConstraints: { routingDisposition: "MAOS_NATIVE" },
    }),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "DEVELOPMENT_NATIVE_EXECUTION_PROHIBITED",
  );
});

test("only the canonical steward can create or activate policy state", async () => {
  const steward = new RoutingPolicyStewardService(repository());
  const calls = [
    steward.createPolicyVersion({
      routingPolicyVersionId: id("10"),
      routingPolicyId: id("11"),
      expectedPredecessorId: null,
      authorityIdentifier: "OTHER" as never,
      lifecycleIntent: "DRAFT",
      canonicalDomain: "OPERATIONS",
      routingPurpose: "PRIMARY_EXECUTION",
      roleClass: "EXECUTOR",
      organizationId: null,
      projectId: null,
      scopeRef: "global",
      environment: "STAGING",
      requiredCapabilityRefs: [],
      preferredCapabilityRefs: [],
      policyConstraints: {},
      effectiveAt: now,
      expiresAt: null,
      contentFingerprint: sha("a"),
      actorType: "HUMAN",
      actorId: id("4"),
      evidenceRefs: [],
      idempotencyKey: "p",
      correlationId: "c",
      traceId: "t",
      spanId: "s",
    }),
    steward.activatePolicyVersion({
      routingPolicyActivationEventId: id("20"),
      routingPolicyVersionId: id("10"),
      expectedActivationEventId: null,
      authorityIdentifier: "OTHER" as never,
      actorType: "HUMAN",
      actorId: id("4"),
      reasonCode: "ACTIVATE",
      evidenceRefs: [],
      idempotencyKey: "a",
      correlationId: "c",
      traceId: "t",
      spanId: "s",
    }),
  ];
  for (const call of calls) {
    await assert.rejects(
      call,
      (error) =>
        error instanceof RoutingContractError && error.code === "POLICY_DENIED",
    );
  }
});

test("specialization resolution is exact, current, bounded, and cannot create authority", async () => {
  const specialization = Object.freeze({
    specializationVersionId: id("30"),
    specializationId: id("31"),
    version: 1,
    supersedesSpecializationVersionId: null,
    routingPolicyVersionId: id("10"),
    lifecycle: "ACTIVE" as const,
    specializationKey: "LEGAL_RESEARCH",
    canonicalDomain: "OPERATIONS" as const,
    routingPurpose: "PRIMARY_EXECUTION" as const,
    scopeRef: "project:operations",
    environment: "STAGING" as const,
    requiredCapabilityRefs: [] as string[],
    preferredCapabilityRefs: [] as string[],
    metadata: { level: "SPECIALIST" },
    contentFingerprint: sha("c"),
    auditRef: id("5"),
    createdAt: now,
  });
  const service = new RoutingPolicyService(
    repository({
      findSpecializationVersion: async () => specialization,
      findCurrentSpecializationVersion: async () => specialization,
    }),
  );
  assert.equal(
    (await service.resolveSpecialization(id("10"), id("30"), context))
      ?.specializationKey,
    "LEGAL_RESEARCH",
  );
  assert.equal(
    await service.resolveSpecialization(id("10"), null, context),
    null,
  );
  await assert.rejects(
    service.resolveSpecialization(id("99"), id("30"), context),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "SPECIALIZATION_INVALID",
  );
  assert.equal("roleClass" in specialization, false);
  assert.equal("permission" in specialization, false);
  assert.equal("authority" in specialization, false);
});

test("specialization resolution rejects an earlier ACTIVE version after the chain advances", async () => {
  const earlier = Object.freeze({
    specializationVersionId: id("30"),
    specializationId: id("31"),
    version: 1,
    supersedesSpecializationVersionId: null,
    routingPolicyVersionId: id("10"),
    lifecycle: "ACTIVE" as const,
    specializationKey: "LEGAL_RESEARCH",
    canonicalDomain: "OPERATIONS" as const,
    routingPurpose: "PRIMARY_EXECUTION" as const,
    scopeRef: "project:operations",
    environment: "STAGING" as const,
    requiredCapabilityRefs: [] as string[],
    preferredCapabilityRefs: [] as string[],
    metadata: {},
    contentFingerprint: sha("c"),
    auditRef: id("32"),
    createdAt: now,
  });
  const current = Object.freeze({
    ...earlier,
    specializationVersionId: id("33"),
    version: 2,
    supersedesSpecializationVersionId: earlier.specializationVersionId,
    contentFingerprint: sha("d"),
  });
  const staleRepository = {
    ...repository({ findSpecializationVersion: async () => earlier }),
    findCurrentSpecializationVersion: async () => current,
  } as RoutingPolicyRepository;

  await assert.rejects(
    new RoutingPolicyService(
      staleRepository,
      () => new Date(now),
    ).resolveSpecialization(id("10"), earlier.specializationVersionId, context),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "SPECIALIZATION_INVALID",
  );
});

test("specialization resolution rejects a non-consumable current head without fallback", async () => {
  for (const lifecycle of ["DRAFT", "SUPERSEDED", "RETIRED"] as const) {
    const current = Object.freeze({
      specializationVersionId: id("33"),
      specializationId: id("31"),
      version: 2,
      supersedesSpecializationVersionId: id("30"),
      routingPolicyVersionId: id("10"),
      lifecycle,
      specializationKey: "LEGAL_RESEARCH",
      canonicalDomain: "OPERATIONS" as const,
      routingPurpose: "PRIMARY_EXECUTION" as const,
      scopeRef: "project:operations",
      environment: "STAGING" as const,
      requiredCapabilityRefs: [] as string[],
      preferredCapabilityRefs: [] as string[],
      metadata: {},
      contentFingerprint: sha("d"),
      auditRef: id("34"),
      createdAt: now,
    });
    const service = new RoutingPolicyService(
      repository({
        findSpecializationVersion: async () => current,
        findCurrentSpecializationVersion: async () => current,
      }),
    );
    await assert.rejects(
      service.resolveSpecialization(
        id("10"),
        current.specializationVersionId,
        context,
      ),
      (error) =>
        error instanceof RoutingContractError &&
        error.code === "SPECIALIZATION_INVALID",
    );
  }
});

test("policy and specialization capability references are revalidated through the Registry port", async () => {
  const missingCapabilityPolicy = {
    ...policy,
    requiredCapabilityRefs: [id("99")],
  };
  const registry = {
    readSnapshot: async () => ({ capabilities: [] }),
    revalidate: async () => {
      throw new Error("unused");
    },
  } as never;
  await assert.rejects(
    new RoutingPolicyService(
      repository({
        listCurrentSelections: async () => [missingCapabilityPolicy],
      }),
      () => new Date(now),
      registry,
    ).resolveActivePolicy(context),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "REQUIRED_CAPABILITY_UNAVAILABLE",
  );
  const specialization = {
    specializationVersionId: id("30"),
    specializationId: id("31"),
    version: 1,
    supersedesSpecializationVersionId: null,
    routingPolicyVersionId: id("10"),
    lifecycle: "ACTIVE" as const,
    specializationKey: "LEGAL_RESEARCH",
    canonicalDomain: "OPERATIONS" as const,
    routingPurpose: "PRIMARY_EXECUTION" as const,
    scopeRef: "project:operations",
    environment: "STAGING" as const,
    requiredCapabilityRefs: [id("99")],
    preferredCapabilityRefs: [] as string[],
    metadata: {},
    contentFingerprint: sha("c"),
    auditRef: id("5"),
    createdAt: now,
  };
  await assert.rejects(
    new RoutingPolicyService(
      repository({
        findSpecializationVersion: async () => specialization,
        findCurrentSpecializationVersion: async () => specialization,
      }),
      () => new Date(now),
      registry,
    ).resolveSpecialization(id("10"), id("30"), context),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "SPECIALIZATION_INVALID",
  );
});

test("specialization creation requires the exact governed parent and non-authority metadata", async () => {
  let appendCalls = 0;
  const steward = new RoutingPolicyStewardService(
    repository({
      appendSpecializationVersion: async () => {
        appendCalls += 1;
        throw new Error("should not append");
      },
    }),
  );
  const input = {
    specializationVersionId: id("30"),
    specializationId: id("31"),
    expectedPredecessorId: null,
    authorityIdentifier: "MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD" as const,
    routingPolicyVersionId: id("10"),
    lifecycle: "ACTIVE" as const,
    specializationKey: "LEGAL_RESEARCH",
    canonicalDomain: "RESEARCH" as const,
    routingPurpose: "PRIMARY_EXECUTION" as const,
    scopeRef: "project:operations",
    environment: "STAGING" as const,
    requiredCapabilityRefs: [] as string[],
    preferredCapabilityRefs: [] as string[],
    metadata: {},
    contentFingerprint: sha("c"),
    actorType: "HUMAN" as const,
    actorId: id("4"),
    evidenceRefs: [] as string[],
    idempotencyKey: "specialization-1",
    correlationId: "c",
    traceId: "t",
    spanId: "s",
  };
  await assert.rejects(
    steward.createSpecializationVersion(input),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "SPECIALIZATION_INVALID",
  );
  await assert.rejects(
    steward.createSpecializationVersion({
      ...input,
      canonicalDomain: "OPERATIONS",
      metadata: { authority: "invented" },
    }),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "SPECIALIZATION_INVALID",
  );
  assert.equal(appendCalls, 0);
});

test("RoutingPolicyService has no direct external authority backend bypass", async () => {
  const source = await readFile(
    new URL("../src/routing-policy-service.ts", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    "RequestClassificationRuntime",
    "AiRegistryRepository",
    "PostgresHumanApprovalRuntime",
    "AidosAuthorityBackend",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.equal(source.includes("UPDATE "), false);
  assert.equal(source.includes("DELETE "), false);
});
