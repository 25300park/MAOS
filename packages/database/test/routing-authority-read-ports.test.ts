import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AIDOS_AUTHORITY_SOURCE,
  AIDOS_AVAILABILITY_SOURCE,
  AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
  AIDOS_PROJECT_REGISTRATION_SOURCE,
  RoutingContractError,
} from "../src/index.js";
import {
  ExternalAidosAuthorityAdapter,
  GovernedHumanApprovalAuthorityAdapter,
  Phase15bRegistryAuthorityAdapter,
  Phase15cClassificationAuthorityAdapter,
} from "../src/routing-authority-read-ports.js";

const now = "2099-10-08T00:00:00.000Z";
const future = "2099-10-08T01:00:00.000Z";
const past = "2000-01-01T00:00:00.000Z";
const digest = `sha256:${"a".repeat(64)}`;
const aidosDelegationInput = {
  developmentIntent: "Implement the approved change",
  requestedRoleClass: "EXECUTOR" as const,
  requiredCapabilities: ["execute"] as const,
  preferredCapabilities: [] as const,
  policyConstraints: [] as const,
  contextRefs: [] as const,
  artifactRefs: [] as const,
  priority: 50,
  aidosProjectRef: "aidos-project:1",
  delegationRequestId: "delegation-request",
};
const aidosSnapshotBinding = {
  snapshotId: "018f47a2-5c2d-7b9f-8abc-0123456789ab",
  authorityEpoch: digest,
  requestDigest: digest,
  projectionBindings: [
    { projectionType: AIDOS_PROJECT_REGISTRATION_SOURCE, projectionId: "urn:aidos:projection:018f47a2-5c2d-7b9f-8abc-0123456789ab:AIDOS_PROJECT_REGISTRATION_PROJECTION", projectionRevision: digest },
    { projectionType: AIDOS_AVAILABILITY_SOURCE, projectionId: "urn:aidos:projection:018f47a2-5c2d-7b9f-8abc-0123456789ab:AIDOS_RUNTIME_AVAILABILITY_PROJECTION", projectionRevision: digest },
    { projectionType: AIDOS_DELEGATION_ELIGIBILITY_SOURCE, projectionId: "urn:aidos:projection:018f47a2-5c2d-7b9f-8abc-0123456789ab:AIDOS_DELEGATION_ELIGIBILITY_PROJECTION", projectionRevision: digest },
  ],
};
const currentClassificationContext = {
  requestId: "request",
  organizationId: "o",
  projectId: "p",
  companyScopeRef: "company",
  teamScopeRef: null,
  projectScopeRef: "project",
  systemScopeRef: null,
  environment: "STAGING",
  staleness: {
    requestChanged: false,
    taskChanged: false,
    policyChanged: false,
    capabilitiesChanged: false,
    evidenceInvalid: false,
    humanOverride: false,
    conflictingClassification: false,
    taxonomyInvalid: false,
  },
} as const;

test("classification adapter preserves distinct fail-closed states", async () => {
  const cases = [
    ["WORK_REQUEST_NOT_FOUND", "ROUTING_REQUEST_NOT_FOUND"],
    ["CLASSIFICATION_MISSING", "CLASSIFICATION_NOT_CURRENT"],
    ["CLASSIFICATION_HEAD_STALE", "CLASSIFICATION_STALE"],
    ["CLASSIFICATION_HEAD_PROPOSED", "CLASSIFICATION_NOT_VALIDATED"],
    ["CLASSIFICATION_CHAIN_INVALID", "CLASSIFICATION_INVALID"],
    ["CLASSIFICATION_POLICY_DRIFT", "CLASSIFICATION_POLICY_UNRESOLVED"],
  ] as const;
  for (const [backendCode, expected] of cases) {
    const adapter = new Phase15cClassificationAuthorityAdapter({
      resolveCurrentClassification: async () => {
        throw new Error(backendCode);
      },
      buildPhase15dClassificationHandoff: () => {
        throw new Error("unused");
      },
      validatePhase15dClassificationHandoff: async () => {
        throw new Error("unused");
      },
    });
    await assert.rejects(
      adapter.readCurrent("request", currentClassificationContext),
      (error) =>
        error instanceof RoutingContractError && error.code === expected,
    );
  }
});

test("classification adapter returns only the canonical current handoff", async () => {
  const handoff = {
    classificationId: "classification",
    requestId: "request",
    taskId: null,
    version: 1,
    domainKey: "OPERATIONS",
    subdomainKey: null,
    routingDisposition: "MAOS_NATIVE",
    requestedRoleClass: "EXECUTOR",
    requiredCapabilityRefs: [],
    preferredCapabilityRefs: [],
    policyConstraintRefs: [],
    policyResolutionRef: "policy",
    policyResolutionVersion: "1",
    contextRefs: [],
    artifactRefs: [],
    priorityClass: "NORMAL",
    correlationId: "correlation",
    causationRef: null,
    freshnessProof: "sha256:proof",
    organizationId: "o",
    projectId: "p",
    environment: "STAGING",
  } as const;
  const adapter = new Phase15cClassificationAuthorityAdapter({
    resolveCurrentClassification: async () =>
      ({
        request: {
          organizationId: "o",
          projectId: "p",
          environment: "STAGING",
        },
        classification: {
          classificationId: "classification",
          requestId: "request",
          version: 1,
          classificationState: "VALIDATED",
          validatedAt: now,
          staleAt: null,
          policyResolutionRef: "policy",
          policyResolutionVersion: "1",
          canonicalPayloadFingerprint: "sha256:proof",
        },
        policy: {},
      }) as never,
    buildPhase15dClassificationHandoff: () => handoff,
    validatePhase15dClassificationHandoff: async () => ({
      ...handoff,
      companyScopeRef: "company",
      teamScopeRef: null,
      projectScopeRef: "project",
      systemScopeRef: null,
      validated: true,
    }),
  });
  const snapshot = await adapter.readCurrent(
    "request",
    currentClassificationContext,
  );
  assert.deepEqual(snapshot.handoff, handoff);
  assert.equal(snapshot.classificationId, "classification");
  assert.equal(snapshot.requestId, "request");
  assert.equal(snapshot.classificationState, "VALIDATED");
  assert.equal(snapshot.stalenessState, "CURRENT");
  assert.equal(snapshot.policyResolved, true);
  assert.equal(snapshot.freshnessModel, "REFERENCE_VERSION_CURRENTNESS");
  assert.equal(snapshot.classificationVersion, 1);
  assert.equal(snapshot.currentnessProof, "sha256:proof");
  assert.equal("freshUntil" in snapshot, false);
  assert.equal("expiresAt" in snapshot, false);
  await assert.rejects(
    adapter.revalidate("other-classification", currentClassificationContext),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "CLASSIFICATION_NOT_CURRENT",
  );
});

test("classification authority fails closed for stale or unknown freshness", async () => {
  for (const staleKey of Object.keys(
    currentClassificationContext.staleness,
  ) as (keyof typeof currentClassificationContext.staleness)[]) {
    let staleBackendReads = 0;
    const staleAdapter = new Phase15cClassificationAuthorityAdapter({
      resolveCurrentClassification: async () => {
        staleBackendReads += 1;
        return {} as never;
      },
      buildPhase15dClassificationHandoff: () => ({}) as never,
      validatePhase15dClassificationHandoff: async () => ({}) as never,
    });
    await assert.rejects(
      staleAdapter.readCurrent("request", {
        ...currentClassificationContext,
        staleness: {
          ...currentClassificationContext.staleness,
          [staleKey]: true,
        },
      }),
      (error) =>
        error instanceof RoutingContractError &&
        error.code === "CLASSIFICATION_STALE",
      staleKey,
    );
    assert.equal(staleBackendReads, 0, staleKey);
  }
  const unknownAdapter = new Phase15cClassificationAuthorityAdapter({
    resolveCurrentClassification: async () =>
      ({
        request: {
          organizationId: "o",
          projectId: "p",
          environment: "STAGING",
        },
        classification: {
          classificationId: "classification",
          version: 1,
          classificationState: "VALIDATED",
          validatedAt: now,
          staleAt: null,
          policyResolutionRef: "policy",
          policyResolutionVersion: "1",
          canonicalPayloadFingerprint: "sha256:proof",
        },
        policy: {},
      }) as never,
    buildPhase15dClassificationHandoff: () =>
      ({ requestId: "request" }) as never,
    validatePhase15dClassificationHandoff: async (value) =>
      ({ ...value, validated: true }) as never,
  });
  await assert.rejects(
    unknownAdapter.readCurrent("request", {
      ...currentClassificationContext,
      staleness: undefined as never,
    }),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "CLASSIFICATION_STALE",
  );
});

test("classification authority uses reference currentness without inventing expiry", async () => {
  const handoff = {
    classificationId: "classification",
    requestId: "request",
    version: 1,
    policyResolutionRef: "policy",
    policyResolutionVersion: "1",
    freshnessProof: "sha256:proof",
  } as never;
  const adapter = new Phase15cClassificationAuthorityAdapter({
    resolveCurrentClassification: async () =>
      ({
        request: {
          organizationId: "o",
          projectId: "p",
          environment: "STAGING",
        },
        classification: {
          classificationId: "classification",
          requestId: "request",
          version: 1,
          classificationState: "VALIDATED",
          validatedAt: now,
          staleAt: null,
          policyResolutionRef: "policy",
          policyResolutionVersion: "1",
          canonicalPayloadFingerprint: "sha256:proof",
        },
        policy: {},
      }) as never,
    buildPhase15dClassificationHandoff: () => handoff,
    validatePhase15dClassificationHandoff: async () =>
      ({ validated: true }) as never,
  });
  const snapshot = await adapter.readCurrent(
    "request",
    currentClassificationContext,
  );
  assert.equal(snapshot.freshnessModel, "REFERENCE_VERSION_CURRENTNESS");
  assert.equal(snapshot.currentnessProof, "sha256:proof");
  assert.equal("freshUntil" in snapshot, false);
  assert.equal("expiresAt" in snapshot, false);
});

test("approval adapter distinguishes stale and revoked canonical authority", async () => {
  const expected = {
    targetType: "ROUTING_DECISION",
    targetId: "decision",
    targetVersion: "1",
    targetHash: "sha256:x",
    companyScopeRef: "company",
    projectScopeRef: "project",
    riskClass: "R2",
    environment: "STAGING",
    requestedOperation: "ROUTE",
    evidenceManifestHash: "sha256:e",
    approvalPolicyRef: "policy",
    approvalPolicyVersion: "1",
  } as const;
  for (const [status, validity, code] of [
    ["EXPIRED", "VALID", "HUMAN_APPROVAL_STALE"],
    ["REVOKED", "VALID", "HUMAN_APPROVAL_REVOKED"],
    ["APPROVED", "STALE", "HUMAN_APPROVAL_STALE"],
  ] as const) {
    const adapter = new GovernedHumanApprovalAuthorityAdapter(
      {
        findRequest: async () =>
          ({
            targetVersion: "1",
            expiresAt: future,
          }) as never,
        revalidate: async () => ({
          allowed: false,
          approvalId: "approval",
          reasonCode: status,
          status,
          validity,
        }),
        resolveDecisionAuthorityRef: async () =>
          status === "REVOKED" ? undefined : "authority-rule",
      },
      async () => undefined,
    );
    await assert.rejects(
      adapter.resolveRequirement({ approvalRequestId: "request", expected }),
      (error) => error instanceof RoutingContractError && error.code === code,
    );
  }
});

test("approval adapter preserves valid external approval authority", async () => {
  const adapter = new GovernedHumanApprovalAuthorityAdapter(
    {
      findRequest: async () =>
        ({
          id: "request",
          approvalId: "approval",
          authorityOwnerActorId: "human",
          targetType: "ROUTING_DECISION",
          targetId: "decision",
          targetVersion: "1",
          targetHash: "sha256:x",
          freshUntil: future,
          expiresAt: future,
          status: "APPROVED",
          validity: "VALID",
          createdAt: now,
        }) as never,
      resolveDecisionAuthorityRef: async () => "authority-rule",
      revalidate: async () => ({
        allowed: true,
        approvalId: "approval",
        reasonCode: "VALID",
        status: "APPROVED",
        validity: "VALID",
      }),
    },
    async () => undefined,
  );
  const result = await adapter.resolveRequirement({
    approvalRequestId: "request",
    expected: {
      targetType: "ROUTING_DECISION",
      targetId: "decision",
      targetVersion: "1",
      targetHash: "sha256:x",
      companyScopeRef: "company",
      projectScopeRef: "project",
      riskClass: "R2",
      environment: "STAGING",
      requestedOperation: "ROUTE",
      evidenceManifestHash: "sha256:e",
      approvalPolicyRef: "policy",
      approvalPolicyVersion: "1",
    },
  });
  assert.equal(result.state, "APPROVED");
  assert.equal(result.approvalRef, "approval");
  assert.equal(result.authority, "authority-rule");
  assert.equal(result.authorityRuleRef, "authority-rule");
  assert.equal(result.targetType, "ROUTING_DECISION");
  assert.equal(result.targetId, "decision");
  assert.equal(result.targetVersion, "1");
  assert.equal(result.targetHash, "sha256:x");
  assert.equal(result.freshUntil, future);
  assert.equal(result.expiresAt, future);
  assert.equal(result.approvalStatus, "APPROVED");
  assert.equal(result.approvalValidity, "VALID");
});

test("approval adapter rejects wrong target, version, and hash lineage", async () => {
  const expected = {
    targetType: "ROUTING_DECISION",
    targetId: "decision",
    targetVersion: "1",
    targetHash: "sha256:x",
    companyScopeRef: "company",
    projectScopeRef: "project",
    riskClass: "R2",
    environment: "STAGING",
    requestedOperation: "ROUTE",
    evidenceManifestHash: "sha256:e",
    approvalPolicyRef: "policy",
    approvalPolicyVersion: "1",
  } as const;
  for (const reasonCode of [
    "TARGET_MISMATCH",
    "VERSION_MISMATCH",
    "STALE_TARGET_HASH",
  ]) {
    const adapter = new GovernedHumanApprovalAuthorityAdapter(
      {
        findRequest: async () =>
          ({
            id: "request",
            approvalId: "approval",
            authorityOwnerActorId: "human",
            targetType: "ROUTING_DECISION",
            targetId: "decision",
            targetVersion: "1",
            targetHash: "sha256:x",
            freshUntil: future,
            expiresAt: future,
            status: "APPROVED",
            validity: "VALID",
            createdAt: now,
          }) as never,
        resolveDecisionAuthorityRef: async () => "authority-rule",
        revalidate: async () => ({
          allowed: false,
          approvalId: "approval",
          reasonCode,
          status: "APPROVED",
          validity: "VALID",
        }),
      },
      async () => undefined,
    );
    await assert.rejects(
      adapter.resolveRequirement({
        approvalRequestId: "request",
        expected,
      }),
      (error) =>
        error instanceof RoutingContractError &&
        error.code === "HUMAN_APPROVAL_INVALID",
    );
  }
});

test("AIDOS adapter preserves the external v1.1 authority and fails closed", async () => {
  const adapter = new ExternalAidosAuthorityAdapter({
    readAidosAvailability: async () => ({
      state: "AVAILABLE",
      projectRef: "aidos-project:1",
      revision: "r1",
      observedAt: now,
      freshUntil: future,
      evidenceRef: "evidence:aidos:availability:1",
      source: AIDOS_AUTHORITY_SOURCE,
      sourceProjection: AIDOS_AVAILABILITY_SOURCE,
    }),
    readProjectOnboardingState: async () => ({
      state: "PROJECT_ONBOARDED",
      projectRef: "aidos-project:1",
      revision: "r1",
      observedAt: now,
      freshUntil: future,
      evidenceRef: "evidence:aidos:onboarding:1",
      source: AIDOS_AUTHORITY_SOURCE,
      sourceProjection: AIDOS_PROJECT_REGISTRATION_SOURCE,
    }),
    readDelegationEligibility: async () => ({
      state: "ELIGIBLE",
      projectRef: "aidos-project:1",
      revision: "r1",
      observedAt: now,
      freshUntil: future,
      evidenceRef: "evidence:aidos:eligibility:1",
      source: AIDOS_AUTHORITY_SOURCE,
      sourceProjection: AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
      snapshotBinding: aidosSnapshotBinding,
    }),
    revalidate: async () => ({
      snapshotBinding: aidosSnapshotBinding,
      availability: {
        state: "AVAILABLE",
        projectRef: "aidos-project:1",
        revision: digest,
        observedAt: now,
        freshUntil: future,
        evidenceRef: "evidence:aidos:availability:1",
        source: AIDOS_AUTHORITY_SOURCE,
        sourceProjection: AIDOS_AVAILABILITY_SOURCE,
      },
      registration: {
        state: "PROJECT_ONBOARDED",
        projectRef: "aidos-project:1",
        revision: digest,
        observedAt: now,
        freshUntil: future,
        evidenceRef: "evidence:aidos:onboarding:1",
        source: AIDOS_AUTHORITY_SOURCE,
        sourceProjection: AIDOS_PROJECT_REGISTRATION_SOURCE,
      },
      eligibility: {
        state: "ELIGIBLE",
        projectRef: "aidos-project:1",
        revision: digest,
        observedAt: now,
        freshUntil: future,
        evidenceRef: "evidence:aidos:eligibility:1",
        source: AIDOS_AUTHORITY_SOURCE,
        sourceProjection: AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
        snapshotBinding: aidosSnapshotBinding,
      },
    }),
  });

  const availability = await adapter.readAidosAvailability({
    environment: "STAGING",
    targetRef: "AIDOS",
    organizationId: "o",
    projectId: "p",
    scopeRef: "scope",
    correlationId: "c",
    delegationInput: aidosDelegationInput,
  });
  assert.equal(availability.source, AIDOS_AUTHORITY_SOURCE);
  assert.equal(availability.sourceProjection, AIDOS_AVAILABILITY_SOURCE);
  assert.equal(
    (
      await adapter.readProjectOnboardingState({
        projectRef: "aidos-project:1",
        organizationId: "o",
        projectId: "p",
        environment: "STAGING",
        scopeRef: "scope",
        delegationInput: aidosDelegationInput,
      })
    ).sourceProjection,
    AIDOS_PROJECT_REGISTRATION_SOURCE,
  );
  assert.equal(
    (
      await adapter.readDelegationEligibility({
        projectRef: "aidos-project:1",
        organizationId: "o",
        projectId: "p",
        environment: "STAGING",
        scopeRef: "scope",
        classificationVersionId: "classification",
        delegationInput: aidosDelegationInput,
      })
    ).sourceProjection,
    AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
  );
  const revalidated = await adapter.revalidate({
    availability: {
      projectRef: "aidos-project:1",
      revision: digest,
    },
    registration: {
      projectRef: "aidos-project:1",
      revision: digest,
    },
    eligibility: {
      projectRef: "aidos-project:1",
      revision: digest,
    },
    context: currentClassificationContext,
    snapshotBinding: aidosSnapshotBinding,
  });
  assert.equal(revalidated.current, true);
  assert.equal(
    revalidated.revision,
    `${digest}:${digest}:${digest}`,
  );

  const unavailable = new ExternalAidosAuthorityAdapter({
    readAidosAvailability: async () => ({
      state: "UNAVAILABLE",
      projectRef: "aidos-project:1",
      revision: "r1",
      observedAt: now,
      freshUntil: future,
      evidenceRef: "evidence:aidos:unavailable",
      source: AIDOS_AUTHORITY_SOURCE,
      sourceProjection: AIDOS_AVAILABILITY_SOURCE,
    }),
    readProjectOnboardingState: async () => ({
      state: "PROJECT_NOT_ONBOARDED",
      projectRef: "aidos-project:1",
      revision: "r1",
      observedAt: now,
      freshUntil: future,
      evidenceRef: "evidence:aidos:onboarding",
      source: AIDOS_AUTHORITY_SOURCE,
      sourceProjection: AIDOS_PROJECT_REGISTRATION_SOURCE,
    }),
    readDelegationEligibility: async () => {
      throw new Error("unused");
    },
    revalidate: async () => {
      throw new Error("unused");
    },
  });
  await assert.rejects(
    unavailable.readAidosAvailability({
      environment: "STAGING",
      targetRef: "AIDOS",
      organizationId: "o",
      projectId: "p",
      scopeRef: "scope",
      correlationId: "c",
      delegationInput: aidosDelegationInput,
    }),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "AIDOS_UNAVAILABLE",
  );
  await assert.rejects(
    unavailable.readProjectOnboardingState({
      projectRef: "aidos-project:1",
      organizationId: "o",
      projectId: "p",
      environment: "STAGING",
      scopeRef: "scope",
      delegationInput: aidosDelegationInput,
    }),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "WAITING_AIDOS_ONBOARDING",
  );

  const stale = new ExternalAidosAuthorityAdapter({
    readAidosAvailability: async () => ({
      state: "UNKNOWN",
      projectRef: "aidos-project:1",
      revision: "r1",
      observedAt: now,
      freshUntil: past,
      evidenceRef: "evidence:aidos:stale",
      source: AIDOS_AUTHORITY_SOURCE,
      sourceProjection: AIDOS_AVAILABILITY_SOURCE,
    }),
    readProjectOnboardingState: async () => {
      throw new Error("unused");
    },
    readDelegationEligibility: async () => {
      throw new Error("unused");
    },
    revalidate: async () => {
      throw new Error("unused");
    },
  });
  await assert.rejects(
    stale.readAidosAvailability({
      environment: "STAGING",
      targetRef: "AIDOS",
      organizationId: "o",
      projectId: "p",
      scopeRef: "scope",
      correlationId: "c",
      delegationInput: aidosDelegationInput,
    }),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "AIDOS_AUTHORITY_STALE",
  );

  const staleRegistration = new ExternalAidosAuthorityAdapter({
    readAidosAvailability: async () => {
      throw new Error("unused");
    },
    readProjectOnboardingState: async () => ({
      state: "PROJECT_ONBOARDED",
      projectRef: "aidos-project:1",
      revision: "registration-r1",
      observedAt: now,
      freshUntil: past,
      evidenceRef: "evidence:aidos:onboarding:stale",
      source: AIDOS_AUTHORITY_SOURCE,
      sourceProjection: AIDOS_PROJECT_REGISTRATION_SOURCE,
    }),
    readDelegationEligibility: async () => {
      throw new Error("unused");
    },
    revalidate: async () => {
      throw new Error("unused");
    },
  });
  await assert.rejects(
    staleRegistration.readProjectOnboardingState({
      projectRef: "aidos-project:1",
      organizationId: "o",
      projectId: "p",
      environment: "STAGING",
      scopeRef: "scope",
      delegationInput: aidosDelegationInput,
    }),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "AIDOS_AUTHORITY_STALE",
  );

  const staleEligibility = new ExternalAidosAuthorityAdapter({
    readAidosAvailability: async () => {
      throw new Error("unused");
    },
    readProjectOnboardingState: async () => {
      throw new Error("unused");
    },
    readDelegationEligibility: async () => ({
      state: "ELIGIBLE",
      projectRef: "aidos-project:1",
      revision: "eligibility-r1",
      observedAt: now,
      freshUntil: past,
      evidenceRef: "evidence:aidos:eligibility:stale",
      source: AIDOS_AUTHORITY_SOURCE,
      sourceProjection: AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
      snapshotBinding: aidosSnapshotBinding,
    }),
    revalidate: async () => {
      throw new Error("unused");
    },
  });
  await assert.rejects(
    staleEligibility.readDelegationEligibility({
      projectRef: "aidos-project:1",
      organizationId: "o",
      projectId: "p",
      environment: "STAGING",
      scopeRef: "scope",
      classificationVersionId: "classification",
      delegationInput: aidosDelegationInput,
    }),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "AIDOS_AUTHORITY_STALE",
  );
});

test("Registry adapter returns safe distinct resources without credentials", async () => {
  const canonicalObservation = {
    authoritySource: "PHASE15B_AI_REGISTRY" as const,
    transactionSnapshot: { xmin: "41", xmax: "44" },
    observedAt: now,
    freshUntil: future,
    freshnessPolicyRef: "registry-freshness-policy",
    freshnessPolicyVersion: "1",
    freshnessMaxAgeMs: 3_600_000,
    providers: [
      {
        id: "provider",
        providerKey: "P",
        displayName: "Provider",
        providerType: "REMOTE",
        status: "ACTIVE",
        healthState: "HEALTHY",
        readinessState: "READY",
        credentialRef: "secret://never-return",
        defaultRegion: null,
        metadata: { secret: true },
        version: 1,
      },
      {
        id: "provider-z",
        providerKey: "Z",
        displayName: "Provider Z",
        providerType: "REMOTE",
        status: "ACTIVE",
        healthState: "HEALTHY",
        readinessState: "READY",
        credentialRef: null,
        defaultRegion: null,
        metadata: {},
        version: 1,
      },
      {
        id: "provider-ä",
        providerKey: "UNICODE",
        displayName: "Unicode Provider",
        providerType: "REMOTE",
        status: "ACTIVE",
        healthState: "HEALTHY",
        readinessState: "READY",
        credentialRef: null,
        defaultRegion: null,
        metadata: {},
        version: 1,
      },
    ],
    models: [
      {
        id: "model",
        providerId: "provider",
        modelKey: "M",
        displayName: "Model",
        modelFamily: null,
        modelVersion: null,
        contextWindowClass: null,
        multimodalSupport: null,
        structuredOutputSupport: null,
        toolUseSupport: null,
        streamingSupport: null,
        lifecycle: "ACTIVE",
        healthState: "HEALTHY",
        readinessState: "READY",
        metadata: {},
        version: 1,
      },
    ],
    runtimeAdapters: [
      {
        id: "host",
        providerId: "provider",
        hostKey: "H",
        displayName: "Host",
        hostType: "REMOTE",
        status: "ACTIVE",
        executionMode: "REMOTE",
        networkRequired: true,
        interactiveRequired: false,
        credentialMode: "REFERENCE",
        credentialRef: "secret://never-return",
        adapterRef: "adapter://h",
        healthState: "HEALTHY",
        readinessState: "READY",
        metadata: {},
        version: 1,
      },
    ],
    capabilities: [
      {
        id: "capability",
        capabilityKey: "TEXT",
        description: "text",
        capabilityClass: "NATIVE",
        status: "ACTIVE",
        version: 1,
      },
    ],
    modelHostBindings: [
      {
        id: "binding",
        modelId: "model",
        modelKey: "M",
        hostId: "host",
        hostKey: "H",
        lifecycle: "ACTIVE",
        healthState: "HEALTHY",
        readinessState: "READY",
        costClass: "LOW",
        latencyClass: "LOW",
        qualityClass: "HIGH",
        verificationEvidenceRef: "evidence:binding",
        verifiedAt: now,
        policyVersion: "1",
        metadata: {},
        version: 1,
      },
    ],
    modelCapabilities: [
      {
        id: "model-capability",
        modelId: "model",
        modelHostBindingId: "binding",
        hostId: "host",
        hostKey: "H",
        capabilityId: "capability",
        capabilityKey: "TEXT",
        description: "text",
        capabilityClass: "NATIVE",
        supportLevel: "SUPPORTED",
        confidenceClass: "HIGH",
        verificationFreshness: "FRESH",
        verifiedAt: now,
        verificationSource: "registry-verifier",
        evidenceRef: "evidence:capability",
        policyVersion: "1",
        status: "ACTIVE",
        metadata: {},
        version: 1,
      },
    ],
    roleCompatibilities: [
      {
        id: "role",
        modelId: "model",
        modelHostBindingId: "binding",
        hostId: "host",
        domainKey: "OPERATIONS",
        stageKey: "PRIMARY",
        roleKey: "EXECUTOR",
        eligibility: "ELIGIBLE",
        fallbackEligible: true,
        independentReviewEligible: false,
        adversarialReviewEligible: false,
        status: "ACTIVE",
        metadata: {},
        version: 1,
      },
    ],
  } as const;
  let registryReads = 0;
  const adapter = new Phase15bRegistryAuthorityAdapter(
    {
      readCanonicalSnapshot: async () => ({
        ...canonicalObservation,
        providers:
          registryReads++ === 0
            ? canonicalObservation.providers
            : [...canonicalObservation.providers].reverse(),
      }),
    },
    { now: () => new Date(now) },
  );

  const snapshot = await adapter.readSnapshot({ resourceRefs: [] });
  assert.deepEqual(
    snapshot.providers.map((value) => value.id),
    ["provider", "provider-z", "provider-ä"],
  );
  assert.notEqual(snapshot.providers[0]!.id, snapshot.models[0]!.id);
  assert.notEqual(snapshot.models[0]!.id, snapshot.runtimeAdapters[0]!.id);
  assert.equal(JSON.stringify(snapshot).includes("credential"), false);
  assert.equal(JSON.stringify(snapshot).includes("secret://"), false);
  assert.match(snapshot.snapshotRef, /^registry-snapshot:sha256:[a-f0-9]{64}$/);
  assert.equal(snapshot.authoritySource, "PHASE15B_AI_REGISTRY");
  assert.equal(snapshot.transactionSnapshot.xmin, "41");
  assert.equal(snapshot.freshUntil, future);
  assert.equal(snapshot.freshnessMaxAgeMs, 3_600_000);
  assert.equal(snapshot.modelHostBindings[0]!.modelId, "model");
  assert.equal(snapshot.modelHostBindings[0]!.runtimeAdapterId, "host");
  assert.equal(snapshot.modelCapabilities[0]!.capabilityId, "capability");
  const repeated = await adapter.readSnapshot({ resourceRefs: [] });
  assert.equal(repeated.snapshotRef, snapshot.snapshotRef);
  assert.deepEqual(
    repeated.providers.map((value) => value.id),
    snapshot.providers.map((value) => value.id),
  );
  const evidence = {
    policyRef: snapshot.freshnessPolicyRef,
    policyVersion: snapshot.freshnessPolicyVersion,
    maxAgeMs: snapshot.freshnessMaxAgeMs,
    registryObservedAt: snapshot.observedAt,
    freshUntil: snapshot.freshUntil,
    snapshotRef: snapshot.snapshotRef,
    snapshotRevision: snapshot.revision,
    snapshotHash: snapshot.snapshotRef.slice(
      "registry-snapshot:sha256:".length,
    ),
  };
  await assert.doesNotReject(
    adapter.revalidate({
      ...evidence,
      resourceRefs: [
        "provider",
        "model",
        "host",
        "binding",
        "capability",
        "model-capability",
        "role",
      ],
    }),
  );
  await assert.rejects(
    adapter.revalidate({
      ...evidence,
      resourceRefs: ["missing-registry-resource"],
    }),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "REGISTRY_CONFLICT",
  );

  let unrelatedChangeReads = 0;
  const unrelatedChange = new Phase15bRegistryAuthorityAdapter(
    {
      readCanonicalSnapshot: async () => {
        const changed = unrelatedChangeReads++ > 0;
        return {
          ...canonicalObservation,
          providers: canonicalObservation.providers.map((provider) =>
            changed && provider.id === "provider-z"
              ? { ...provider, version: provider.version + 1 }
              : provider,
          ),
        };
      },
    },
    { now: () => new Date(now) },
  );
  const beforeUnrelatedChange = await unrelatedChange.readSnapshot({
    resourceRefs: [],
  });
  await assert.rejects(
    unrelatedChange.revalidate({
      ...evidence,
      snapshotRef: beforeUnrelatedChange.snapshotRef,
      snapshotRevision: beforeUnrelatedChange.revision,
      snapshotHash: beforeUnrelatedChange.snapshotRef.slice(
        "registry-snapshot:sha256:".length,
      ),
      resourceRefs: ["provider", "model", "host", "binding"],
    }),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "REGISTRY_CONFLICT",
  );

  let candidateChangeReads = 0;
  const candidateChange = new Phase15bRegistryAuthorityAdapter(
    {
      readCanonicalSnapshot: async () => {
        const changed = candidateChangeReads++ > 0;
        return {
          ...canonicalObservation,
          providers: canonicalObservation.providers.map((provider) =>
            changed && provider.id === "provider"
              ? { ...provider, version: provider.version + 1 }
              : provider,
          ),
        };
      },
    },
    { now: () => new Date(now) },
  );
  const beforeCandidateChange = await candidateChange.readSnapshot({
    resourceRefs: [],
  });
  await assert.rejects(
    candidateChange.revalidate({
      ...evidence,
      snapshotRef: beforeCandidateChange.snapshotRef,
      snapshotRevision: beforeCandidateChange.revision,
      snapshotHash: beforeCandidateChange.snapshotRef.slice(
        "registry-snapshot:sha256:".length,
      ),
      resourceRefs: ["provider", "model", "host", "binding"],
    }),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "REGISTRY_CONFLICT",
  );

  for (const drift of [
    { freshnessPolicyRef: "replacement-policy" },
    { freshnessPolicyVersion: "2" },
    { freshnessMaxAgeMs: 1_800_000 },
  ]) {
    const policyChanged = new Phase15bRegistryAuthorityAdapter(
      {
        readCanonicalSnapshot: async () => ({
          ...canonicalObservation,
          ...drift,
          freshUntil:
            "freshnessMaxAgeMs" in drift
              ? "2099-10-08T00:30:00.000Z"
              : canonicalObservation.freshUntil,
        }),
      },
      { now: () => new Date(now) },
    );
    await assert.rejects(
      policyChanged.revalidate({
        ...evidence,
        resourceRefs: ["provider", "model", "host", "binding"],
      }),
      (error) =>
        error instanceof RoutingContractError &&
        error.code === "REGISTRY_CONFLICT",
    );
  }

  await assert.rejects(
    adapter.revalidate({
      ...evidence,
      freshUntil: "2099-10-08T00:30:00.000Z",
      resourceRefs: ["provider", "model", "host", "binding"],
    }),
    (error) =>
      error instanceof RoutingContractError && error.code === "REGISTRY_STALE",
  );
  const bindingClosure = await adapter.readSnapshot({
    resourceRefs: ["binding"],
  });
  assert.deepEqual(
    bindingClosure.models.map((value) => value.id),
    ["model"],
  );
  assert.deepEqual(
    bindingClosure.runtimeAdapters.map((value) => value.id),
    ["host"],
  );
  assert.deepEqual(
    bindingClosure.providers.map((value) => value.id),
    ["provider"],
  );

  const stale = new Phase15bRegistryAuthorityAdapter({
    readCanonicalSnapshot: async () => ({
      ...canonicalObservation,
      modelCapabilities: [
        {
          ...canonicalObservation.modelCapabilities[0],
          verificationFreshness: "STALE" as const,
        },
      ],
    }),
  });
  await assert.rejects(
    stale.readSnapshot({ resourceRefs: [] }),
    (error) =>
      error instanceof RoutingContractError && error.code === "REGISTRY_STALE",
  );

  for (const invalidFreshUntil of [
    undefined,
    42,
    "not-a-date",
    "2099-02-30T00:00:00Z",
    "2099-10-08T01:00:00",
  ] as const) {
    const malformed = new Phase15bRegistryAuthorityAdapter({
      readCanonicalSnapshot: async () =>
        ({
          ...canonicalObservation,
          freshUntil: invalidFreshUntil,
        }) as never,
    });
    await assert.rejects(
      malformed.readSnapshot({ resourceRefs: [] }),
      (error) =>
        error instanceof RoutingContractError &&
        error.code === "REGISTRY_STALE",
      String(invalidFreshUntil),
    );
  }
});

test("AIDOS authority rejects malformed projection freshness", async () => {
  for (const invalidFreshUntil of [
    undefined,
    42,
    "not-a-date",
    "2099-02-30T00:00:00Z",
    "2099-10-08T01:00:00",
  ] as const) {
    const base = {
      projectRef: "aidos-project:1",
      revision: "r1",
      observedAt: now,
      freshUntil: invalidFreshUntil,
      evidenceRef: "evidence:aidos",
      source: AIDOS_AUTHORITY_SOURCE,
    } as const;
    const adapter = new ExternalAidosAuthorityAdapter({
      readAidosAvailability: async () =>
        ({
          ...base,
          state: "AVAILABLE",
          sourceProjection: AIDOS_AVAILABILITY_SOURCE,
        }) as never,
      readProjectOnboardingState: async () =>
        ({
          ...base,
          state: "PROJECT_ONBOARDED",
          sourceProjection: AIDOS_PROJECT_REGISTRATION_SOURCE,
        }) as never,
      readDelegationEligibility: async () =>
        ({
          ...base,
          state: "ELIGIBLE",
          sourceProjection: AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
        }) as never,
      revalidate: async () => {
        throw new Error("unused");
      },
    });
    for (const read of [
      () =>
        adapter.readAidosAvailability({
          environment: "STAGING",
          targetRef: "AIDOS",
          organizationId: "o",
          projectId: "p",
          scopeRef: "scope",
          correlationId: "correlation",
          delegationInput: aidosDelegationInput,
        }),
      () =>
        adapter.readProjectOnboardingState({
          projectRef: "aidos-project:1",
          organizationId: "o",
          projectId: "p",
          environment: "STAGING",
          scopeRef: "scope",
          delegationInput: aidosDelegationInput,
        }),
      () =>
        adapter.readDelegationEligibility({
          projectRef: "aidos-project:1",
          organizationId: "o",
          projectId: "p",
          environment: "STAGING",
          scopeRef: "scope",
          classificationVersionId: "classification",
          delegationInput: aidosDelegationInput,
        }),
    ]) {
      await assert.rejects(
        read(),
        (error) =>
          error instanceof RoutingContractError &&
          error.code === "AIDOS_AUTHORITY_STALE",
        String(invalidFreshUntil),
      );
    }
  }
});

test("routing authority boundary exposes no owning-authority mutation", async () => {
  const source = await readFile(
    new URL("../src/routing-authority-read-ports.ts", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    "appendClassification(",
    "createRequest(",
    "decide(",
    "registerProject(",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.equal(
    source.includes("AIDOS_EXTERNAL_ORCHESTRATOR_INTEGRATION_CONTRACT_V1_1"),
    true,
  );
  const names = [
    ...source.matchAll(
      /export interface (ClassificationAuthorityReadPort|RegistryAuthorityReadPort|HumanApprovalAuthorityReadPort|AidosAuthorityReadPort)\b/g,
    ),
  ].map((match) => match[1]);
  assert.deepEqual(names.sort(), [
    "AidosAuthorityReadPort",
    "ClassificationAuthorityReadPort",
    "HumanApprovalAuthorityReadPort",
    "RegistryAuthorityReadPort",
  ]);
  const barrel = await readFile(
    new URL("../src/index.ts", import.meta.url),
    "utf8",
  );
  for (const rawExport of [
    "RegistryCanonicalObservation",
    "RegistryCanonicalSnapshotBackend",
    "RegistryFreshnessPolicy",
    "PostgresPhase15bRegistrySnapshotBackend",
    "AidosAuthorityBackend",
    "Phase15cClassificationAuthorityAdapter",
    "Phase15bRegistryAuthorityAdapter",
    "GovernedHumanApprovalAuthorityAdapter",
    "ExternalAidosAuthorityAdapter",
    "AidosRevalidationObservation",
  ]) {
    assert.equal(barrel.includes(rawExport), false, rawExport);
  }
  assert.equal(
    barrel.includes('export * from "./routing-authority-read-ports.js"'),
    false,
  );
  for (const canonical of [
    "ClassificationAuthorityReadPort",
    "RegistryAuthorityReadPort",
    "HumanApprovalAuthorityReadPort",
    "AidosAuthorityReadPort",
  ]) {
    assert.equal(barrel.includes(canonical), true, canonical);
  }
  for (const relative of [
    "../src/routing-contracts.ts",
    "../src/routing-decision-repository.ts",
  ]) {
    const serviceFacing = await readFile(
      new URL(relative, import.meta.url),
      "utf8",
    );
    assert.equal(
      /RequestClassificationRuntime|AiRegistryRepository|PostgresHumanApprovalRuntime|AidosAuthorityBackend/.test(
        serviceFacing,
      ),
      false,
    );
  }
});
