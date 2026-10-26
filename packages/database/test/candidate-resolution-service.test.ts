import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CandidateResolutionService,
  RoutingContractError,
  type CandidateResolutionInput,
  type RegistryAuthorityReadPort,
  type RegistryAuthoritySnapshot,
  type RoutingPolicySnapshot,
  type SpecializationSnapshot,
} from "../src/index.js";

const now = "2026-10-09T00:00:00.000Z";
const future = "2026-10-09T01:00:00.000Z";

function registrySnapshot(): RegistryAuthoritySnapshot {
  return {
    snapshotRef: `registry-snapshot:sha256:${"a".repeat(64)}`,
    revision: "registry-r1",
    authoritySource: "PHASE15B_AI_REGISTRY",
    transactionSnapshot: { xmin: "10", xmax: "12" },
    freshnessPolicyRef: "registry-freshness-policy",
    freshnessPolicyVersion: "1",
    freshnessMaxAgeMs: 3_600_000,
    observedAt: now,
    freshUntil: future,
    providers: [
      {
        id: "provider-a",
        version: 1,
        status: "ACTIVE",
        kind: "PROVIDER",
        healthState: "HEALTHY",
        readinessState: "READY",
      },
      {
        id: "provider-b",
        version: 2,
        status: "ACTIVE",
        kind: "PROVIDER",
        healthState: "HEALTHY",
        readinessState: "READY",
      },
    ],
    models: [
      {
        id: "model-b",
        providerId: "provider-b",
        version: 3,
        status: "ACTIVE",
        kind: "MODEL",
        healthState: "HEALTHY",
        readinessState: "READY",
      },
      {
        id: "model-a",
        providerId: "provider-a",
        version: 4,
        status: "ACTIVE",
        kind: "MODEL",
        healthState: "HEALTHY",
        readinessState: "READY",
      },
    ],
    runtimeAdapters: [
      {
        id: "runtime-b",
        providerId: "provider-b",
        version: 5,
        status: "ACTIVE",
        kind: "RUNTIME_ADAPTER",
        executionMode: "REMOTE",
        healthState: "HEALTHY",
        readinessState: "READY",
      },
      {
        id: "runtime-a",
        providerId: "provider-a",
        version: 6,
        status: "ACTIVE",
        kind: "RUNTIME_ADAPTER",
        executionMode: "REMOTE",
        healthState: "HEALTHY",
        readinessState: "READY",
      },
    ],
    capabilities: [
      {
        id: "cap-required",
        capabilityKey: "REQUIRED",
        capabilityClass: "NATIVE",
        version: 1,
        status: "ACTIVE",
        kind: "CAPABILITY",
      },
      {
        id: "cap-preferred",
        capabilityKey: "PREFERRED",
        capabilityClass: "NATIVE",
        version: 1,
        status: "ACTIVE",
        kind: "CAPABILITY",
      },
    ],
    modelHostBindings: [
      {
        id: "binding-b",
        modelId: "model-b",
        runtimeAdapterId: "runtime-b",
        version: 1,
        status: "ACTIVE",
        kind: "MODEL_HOST_BINDING",
        healthState: "HEALTHY",
        readinessState: "READY",
        costClass: "LOW",
        latencyClass: "LOW",
        qualityClass: "HIGH",
      },
      {
        id: "binding-a",
        modelId: "model-a",
        runtimeAdapterId: "runtime-a",
        version: 1,
        status: "ACTIVE",
        kind: "MODEL_HOST_BINDING",
        healthState: "HEALTHY",
        readinessState: "READY",
        costClass: "LOW",
        latencyClass: "LOW",
        qualityClass: "HIGH",
      },
    ],
    modelCapabilities: [
      ...["binding-a", "binding-b"].map((bindingId) => ({
        id: `${bindingId}-required`,
        modelId: bindingId === "binding-a" ? "model-a" : "model-b",
        modelHostBindingId: bindingId,
        runtimeAdapterId: bindingId === "binding-a" ? "runtime-a" : "runtime-b",
        capabilityId: "cap-required",
        version: 1,
        status: "ACTIVE",
        kind: "MODEL_CAPABILITY_BINDING" as const,
        supportLevel: "SUPPORTED",
        confidenceClass: "HIGH",
        verificationFreshness: "FRESH",
      })),
      {
        id: "binding-b-preferred",
        modelId: "model-b",
        modelHostBindingId: "binding-b",
        runtimeAdapterId: "runtime-b",
        capabilityId: "cap-preferred",
        version: 1,
        status: "ACTIVE",
        kind: "MODEL_CAPABILITY_BINDING",
        supportLevel: "SUPPORTED",
        confidenceClass: "HIGH",
        verificationFreshness: "FRESH",
      },
    ],
    roleCompatibilities: [
      ...["a", "b"].map((suffix) => ({
        id: `role-${suffix}`,
        modelId: `model-${suffix}`,
        modelHostBindingId: `binding-${suffix}`,
        runtimeAdapterId: `runtime-${suffix}`,
        domainKey: "OPERATIONS",
        roleKey: "EXECUTOR",
        version: 1,
        status: "ACTIVE",
        kind: "ROLE_COMPATIBILITY" as const,
        eligibility: "ELIGIBLE",
        fallbackEligible: true,
        independentReviewEligible: false,
        adversarialReviewEligible: false,
      })),
    ],
  };
}

function policy(
  constraints: Readonly<Record<string, unknown>> = {
    allowedRoutingModes: ["PRIMARY_EXECUTION"],
    candidateTieBreakers: ["MODEL_ID"],
  },
): RoutingPolicySnapshot {
  return {
    routingPolicyVersionId: "policy-version",
    routingPolicyId: "policy",
    version: 1,
    supersedesPolicyVersionId: null,
    authorityIdentifier: "MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD",
    lifecycleIntent: "ACTIVE",
    canonicalDomain: "OPERATIONS",
    routingPurpose: "PRIMARY_EXECUTION",
    roleClass: "EXECUTOR",
    organizationId: "organization",
    projectId: "project",
    scopeRef: "scope",
    environment: "STAGING",
    requiredCapabilityRefs: ["cap-required"],
    preferredCapabilityRefs: ["cap-preferred"],
    policyConstraints: constraints,
    effectiveAt: now,
    expiresAt: null,
    contentFingerprint: "sha256:policy",
    createdByActorType: "HUMAN",
    createdByActorId: "human",
    auditRef: "audit:policy",
    createdAt: now,
  };
}

function input(
  overrides: Partial<CandidateResolutionInput> = {},
): CandidateResolutionInput {
  return {
    policy: policy(),
    specialization: null,
    canonicalDomain: "OPERATIONS",
    roleClass: "EXECUTOR",
    routingPurpose: "PRIMARY_EXECUTION",
    routingMode: "PRIMARY_EXECUTION",
    organizationId: "organization",
    projectId: "project",
    scopeRef: "scope",
    environment: "STAGING",
    requiredCapabilityRefs: ["cap-required"],
    preferredCapabilityRefs: ["cap-preferred"],
    classification: {
      identity: "classification-version",
      revision: "classification-r1",
      version: 1,
      currentnessProof: "sha256:classification-current",
    },
    ...overrides,
  };
}

function port(snapshot = registrySnapshot()): RegistryAuthorityReadPort {
  return {
    readSnapshot: async () => snapshot,
    revalidate: async (evidence) => ({
      current: true,
      authority: "PHASE15B_AI_REGISTRY",
      identity: evidence.snapshotRef,
      revision: evidence.snapshotRevision,
      checkedAt: now,
      freshUntil: evidence.freshUntil,
      freshnessModel: "AUTHORITY_EXPIRY",
      policyRef: evidence.policyRef,
      policyVersion: evidence.policyVersion,
      maxAgeMs: evidence.maxAgeMs,
      registryObservedAt: evidence.registryObservedAt,
      snapshotRef: evidence.snapshotRef,
      snapshotRevision: evidence.snapshotRevision,
      snapshotHash: evidence.snapshotHash,
    }),
  };
}

test("resolves safe candidates through the Registry authority with deterministic preferred ranking", async () => {
  const result = await new CandidateResolutionService(
    port(),
    () => new Date(now),
  ).resolve(input());

  assert.equal(result.registrySnapshotRef, registrySnapshot().snapshotRef);
  assert.deepEqual(result.registryFreshnessAuthority, {
    policyRef: "registry-freshness-policy",
    policyVersion: "1",
    maxAgeMs: 3_600_000,
    registryObservedAt: now,
    freshUntil: future,
    snapshotRef: registrySnapshot().snapshotRef,
    snapshotRevision: "registry-r1",
    snapshotHash: "a".repeat(64),
  });
  assert.deepEqual(
    result.eligibleCandidates.map((candidate) => candidate.modelHostBindingId),
    ["binding-b", "binding-a"],
  );
  assert.deepEqual(
    result.eligibleCandidates[0]!.matchedPreferredCapabilityRefs,
    ["cap-preferred"],
  );
  assert.deepEqual(result.eligibleCandidates[0]!.lineage, {
    provider: { id: "provider-b", version: 2 },
    model: { id: "model-b", version: 3 },
    runtimeAdapter: { id: "runtime-b", version: 5 },
    modelHostBinding: { id: "binding-b", version: 1 },
    capabilityBindings: [
      {
        id: "binding-b-required",
        version: 1,
        capabilityId: "cap-required",
        capabilityVersion: 1,
        requirement: "REQUIRED",
      },
      {
        id: "binding-b-preferred",
        version: 1,
        capabilityId: "cap-preferred",
        capabilityVersion: 1,
        requirement: "PREFERRED",
      },
    ],
    roleCompatibility: { id: "role-b", version: 1 },
    specialization: null,
    routingPolicy: {
      id: "policy",
      versionId: "policy-version",
      version: 1,
      contentFingerprint: "sha256:policy",
    },
    classification: {
      identity: "classification-version",
      revision: "classification-r1",
      version: 1,
      currentnessProof: "sha256:classification-current",
    },
  });
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal("selectedCandidate" in result, false);
});

test("reads the complete canonical Registry snapshot instead of a capability-only partial", async () => {
  let requestedRefs: readonly string[] | undefined;
  const registry = port();
  await new CandidateResolutionService(
    {
      ...registry,
      readSnapshot: async (query) => {
        requestedRefs = query.resourceRefs;
        return registry.readSnapshot(query);
      },
    },
    () => new Date(now),
  ).resolve(input());
  assert.deepEqual(requestedRefs, []);
});

test("rejects role, required capability, specialization, and policy mismatches", async () => {
  const service = new CandidateResolutionService(port(), () => new Date(now));
  await assert.rejects(
    service.resolve(input({ roleClass: "ANALYST" })),
    (error) =>
      error instanceof RoutingContractError && error.code === "POLICY_DENIED",
  );
  await assert.rejects(
    service.resolve(input({ requiredCapabilityRefs: ["cap-missing"] })),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "REQUIRED_CAPABILITY_UNAVAILABLE",
  );
  const specialization: SpecializationSnapshot = {
    specializationVersionId: "specialization-version",
    specializationId: "specialization",
    version: 1,
    supersedesSpecializationVersionId: null,
    routingPolicyVersionId: "policy-version",
    lifecycle: "ACTIVE",
    specializationKey: "DOMAIN_SPECIALIST",
    canonicalDomain: "OPERATIONS",
    routingPurpose: "PRIMARY_EXECUTION",
    scopeRef: "scope",
    environment: "STAGING",
    requiredCapabilityRefs: ["cap-specialist"],
    preferredCapabilityRefs: [],
    metadata: {},
    contentFingerprint: "sha256:specialization",
    auditRef: "audit:specialization",
    createdAt: now,
  };
  await assert.rejects(
    service.resolve(input({ specialization })),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "SPECIALIZATION_INVALID",
  );
  await assert.rejects(
    service.resolve(
      input({ policy: policy({ allowedProviderIds: ["provider-x"] }) }),
    ),
    (error) =>
      error instanceof RoutingContractError && error.code === "POLICY_DENIED",
  );
  await assert.rejects(
    service.resolve(
      input({
        policy: policy({ ungovernedCandidatePreference: "provider-a" }),
      }),
    ),
    (error) =>
      error instanceof RoutingContractError && error.code === "POLICY_DENIED",
  );
});

test("fails closed for unavailable Registry resources and stale capability authority", async () => {
  const baseline = registrySnapshot();
  const providerDown: RegistryAuthoritySnapshot = {
    ...baseline,
    providers: baseline.providers.map((provider, index) =>
      index === 0 ? { ...provider, readinessState: "NOT_READY" } : provider,
    ),
  };
  await assert.rejects(
    new CandidateResolutionService(
      port(providerDown),
      () => new Date(now),
    ).resolve(
      input({ policy: policy({ allowedProviderIds: ["provider-a"] }) }),
    ),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "PROVIDER_UNAVAILABLE",
  );

  const current = registrySnapshot();
  const staleCapability: RegistryAuthoritySnapshot = {
    ...current,
    modelCapabilities: current.modelCapabilities.map((capability, index) =>
      index === 0
        ? { ...capability, verificationFreshness: "STALE" }
        : capability,
    ),
  };
  await assert.rejects(
    new CandidateResolutionService(
      port(staleCapability),
      () => new Date(now),
    ).resolve(
      input({ policy: policy({ allowedProviderIds: ["provider-a"] }) }),
    ),
    (error) =>
      error instanceof RoutingContractError && error.code === "REGISTRY_STALE",
  );

  for (const freshnessDrift of [
    { freshUntil: "2026-10-09T00:30:00.000Z" },
    { freshnessMaxAgeMs: Number.MAX_SAFE_INTEGER },
    { freshnessPolicyRef: "" },
  ]) {
    await assert.rejects(
      new CandidateResolutionService(
        port({ ...baseline, ...freshnessDrift }),
        () => new Date(now),
      ).resolve(input()),
      (error) =>
        error instanceof RoutingContractError &&
        error.code === "REGISTRY_STALE",
    );
  }
});

test("requires exact routing mode compatibility and never conflates fallback with review", async () => {
  const service = new CandidateResolutionService(port(), () => new Date(now));
  const fallback = await service.resolve(
    input({
      routingMode: "FALLBACK",
      policy: policy({
        allowedRoutingModes: ["FALLBACK"],
        candidateTieBreakers: ["MODEL_ID"],
      }),
    }),
  );
  assert.equal(fallback.eligibleCandidates.length, 2);
  await assert.rejects(
    service.resolve(
      input({
        routingMode: "INDEPENDENT_REVIEW",
        policy: policy({ allowedRoutingModes: ["INDEPENDENT_REVIEW"] }),
      }),
    ),
    (error) =>
      error instanceof RoutingContractError && error.code === "POLICY_DENIED",
  );
});

test("rejects an unresolved deterministic tie without inventing vendor priority", async () => {
  const current = registrySnapshot();
  const snapshot: RegistryAuthoritySnapshot = {
    ...current,
    modelCapabilities: current.modelCapabilities.filter(
      ({ capabilityId }) => capabilityId !== "cap-preferred",
    ),
  };
  await assert.rejects(
    new CandidateResolutionService(port(snapshot), () => new Date(now)).resolve(
      input({
        preferredCapabilityRefs: [],
        policy: policy({ allowedRoutingModes: ["PRIMARY_EXECUTION"] }),
      }),
    ),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "NONDETERMINISTIC_CANDIDATE_TIE",
  );
});

test("preferred ranking uses only active fresh canonical capability bindings", async () => {
  const baseline = registrySnapshot();
  const inactiveCapability: RegistryAuthoritySnapshot = {
    ...baseline,
    capabilities: baseline.capabilities.map((value) =>
      value.id === "cap-preferred" ? { ...value, status: "INACTIVE" } : value,
    ),
  };
  const inactiveResult = await new CandidateResolutionService(
    port(inactiveCapability),
    () => new Date(now),
  ).resolve(input());
  assert.deepEqual(
    inactiveResult.eligibleCandidates.map(
      ({ modelHostBindingId }) => modelHostBindingId,
    ),
    ["binding-a", "binding-b"],
  );
  assert.equal(
    inactiveResult.eligibleCandidates.every(
      ({ matchedPreferredCapabilityRefs }) =>
        matchedPreferredCapabilityRefs.length === 0,
    ),
    true,
  );

  const staleBinding: RegistryAuthoritySnapshot = {
    ...baseline,
    modelCapabilities: baseline.modelCapabilities.map((value) =>
      value.id === "binding-b-preferred"
        ? { ...value, verificationFreshness: "STALE" }
        : value,
    ),
  };
  const staleResult = await new CandidateResolutionService(
    port(staleBinding),
    () => new Date(now),
  ).resolve(input());
  assert.deepEqual(
    staleResult.eligibleCandidates.map(
      ({ modelHostBindingId }) => modelHostBindingId,
    ),
    ["binding-a", "binding-b"],
  );
});

test("rejects incomplete or mismatched versioned candidate binding lineage", async () => {
  const baseline = registrySnapshot();
  const missingVersion: RegistryAuthoritySnapshot = {
    ...baseline,
    modelCapabilities: baseline.modelCapabilities.map((value) =>
      value.id === "binding-a-required"
        ? { ...value, version: undefined as never }
        : value,
    ),
  };
  await assert.rejects(
    new CandidateResolutionService(
      port(missingVersion),
      () => new Date(now),
    ).resolve(
      input({ policy: policy({ allowedProviderIds: ["provider-a"] }) }),
    ),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "REGISTRY_CONFLICT",
  );

  const mismatchedBinding: RegistryAuthoritySnapshot = {
    ...baseline,
    modelCapabilities: baseline.modelCapabilities.map((value) =>
      value.id === "binding-a-required"
        ? { ...value, runtimeAdapterId: "runtime-b" }
        : value,
    ),
  };
  await assert.rejects(
    new CandidateResolutionService(
      port(mismatchedBinding),
      () => new Date(now),
    ).resolve(
      input({ policy: policy({ allowedProviderIds: ["provider-a"] }) }),
    ),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "REGISTRY_CONFLICT",
  );

  const missingRole: RegistryAuthoritySnapshot = {
    ...baseline,
    providers: baseline.providers.filter(({ id }) => id === "provider-a"),
    models: baseline.models.filter(({ id }) => id === "model-a"),
    runtimeAdapters: baseline.runtimeAdapters.filter(
      ({ id }) => id === "runtime-a",
    ),
    modelHostBindings: baseline.modelHostBindings.filter(
      ({ id }) => id === "binding-a",
    ),
    modelCapabilities: baseline.modelCapabilities.filter(
      ({ modelHostBindingId }) => modelHostBindingId === "binding-a",
    ),
    roleCompatibilities: baseline.roleCompatibilities.filter(() => false),
  };
  await assert.rejects(
    new CandidateResolutionService(
      port(missingRole),
      () => new Date(now),
    ).resolve(input()),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "NO_ELIGIBLE_CANDIDATE",
  );
});

test("rejects unknown and malformed values for governed policy constraints", async () => {
  const service = new CandidateResolutionService(port(), () => new Date(now));
  for (const constraints of [
    {
      allowedRoutingModes: ["PRIMARY_EXECUTION", "UNKNOWN_MODE"],
      candidateTieBreakers: ["MODEL_ID"],
    },
    {
      allowedRoutingModes: ["PRIMARY_EXECUTION"],
      candidateTieBreakers: ["MODEL_ID"],
      routingDisposition: "UNKNOWN_DISPOSITION",
    },
    {
      allowedRoutingModes: ["PRIMARY_EXECUTION"],
      candidateTieBreakers: ["MODEL_ID"],
      humanApprovalRequired: "yes",
    },
  ]) {
    await assert.rejects(
      service.resolve(input({ policy: policy(constraints) })),
      (error) =>
        error instanceof RoutingContractError && error.code === "POLICY_DENIED",
    );
  }
});

test("candidate ordering uses a locale-independent canonical comparator", async () => {
  const source = await readFile(
    new URL("../src/candidate-resolution-service.ts", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes("localeCompare"), false);

  const baseline = registrySnapshot();
  const rename = (value: string) =>
    value === "model-a" ? "Z-model" : value === "model-b" ? "ä-model" : value;
  const localeSensitive: RegistryAuthoritySnapshot = {
    ...baseline,
    models: baseline.models.map((value) => ({
      ...value,
      id: rename(value.id),
    })),
    modelHostBindings: baseline.modelHostBindings.map((value) => ({
      ...value,
      modelId: rename(value.modelId),
    })),
    modelCapabilities: baseline.modelCapabilities
      .filter(({ capabilityId }) => capabilityId !== "cap-preferred")
      .map((value) => ({ ...value, modelId: rename(value.modelId) })),
    roleCompatibilities: baseline.roleCompatibilities.map((value) => ({
      ...value,
      modelId: rename(value.modelId),
    })),
  };
  const result = await new CandidateResolutionService(
    port(localeSensitive),
    () => new Date(now),
  ).resolve(
    input({
      preferredCapabilityRefs: [],
      policy: policy({
        allowedRoutingModes: ["PRIMARY_EXECUTION"],
        candidateTieBreakers: ["MODEL_ID"],
      }),
    }),
  );
  assert.deepEqual(
    result.eligibleCandidates.map(({ modelId }) => modelId),
    ["Z-model", "ä-model"],
  );
});

test("Development yields AIDOS delegation metadata and no MAOS candidate", async () => {
  let reads = 0;
  const registry = port();
  const service = new CandidateResolutionService({
    ...registry,
    readSnapshot: async (query) => {
      reads += 1;
      return registry.readSnapshot(query);
    },
  });
  const result = await service.resolve(
    input({
      canonicalDomain: "DEVELOPMENT",
      policy: {
        ...policy({ routingDisposition: "DELEGATE_TO_AIDOS" }),
        canonicalDomain: "DEVELOPMENT",
      },
    }),
  );
  assert.equal(result.developmentDelegationRequired, true);
  assert.deepEqual(result.eligibleCandidates, []);
  assert.equal(reads, 0);
});
