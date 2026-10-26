import assert from "node:assert/strict";
import test from "node:test";

import {
  AIDOS_AUTHORITY_SOURCE,
  AIDOS_AVAILABILITY_SOURCE,
  AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
  AIDOS_PROJECT_REGISTRATION_SOURCE,
  RoutingContractError,
  RoutingValidationService,
  type AidosAuthorityReadPort,
  type CandidateResolutionResult,
  type ClassificationAuthorityReadPort,
  type ClassificationAuthoritySnapshot,
  type ExactRequestContext,
  type HumanApprovalAuthorityReadPort,
  type HumanApprovalSnapshot,
  type RegistryAuthorityReadPort,
  type RoutingPolicySnapshot,
  type RoutingPolicyResolver,
  type CandidateResolver,
  type WorkRequestReadPort,
} from "../src/index.js";

const now = "2026-10-09T00:00:00.000Z";
const future = "2026-10-09T01:00:00.000Z";
const digest = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;
const aidosDelegationInput = {
  developmentIntent: "Implement the approved change",
  requestedRoleClass: "EXECUTOR" as const,
  requiredCapabilities: ["execute"] as const,
  preferredCapabilities: ["verify"] as const,
  policyConstraints: [] as const,
  contextRefs: [] as const,
  artifactRefs: [] as const,
  priority: 50,
  aidosProjectRef: "aidos-project",
  delegationRequestId: "delegation-request",
};
const aidosSnapshotBinding = {
  snapshotId: "018f47a2-5c2d-7b9f-8abc-0123456789ab",
  authorityEpoch: digest("a"),
  requestDigest: digest("b"),
  projectionBindings: [
    {
      projectionType: "AIDOS_PROJECT_REGISTRATION_PROJECTION" as const,
      projectionId:
        "urn:aidos:projection:018f47a2-5c2d-7b9f-8abc-0123456789ab:AIDOS_PROJECT_REGISTRATION_PROJECTION",
      projectionRevision: digest("c"),
    },
    {
      projectionType: "AIDOS_RUNTIME_AVAILABILITY_PROJECTION" as const,
      projectionId:
        "urn:aidos:projection:018f47a2-5c2d-7b9f-8abc-0123456789ab:AIDOS_RUNTIME_AVAILABILITY_PROJECTION",
      projectionRevision: digest("d"),
    },
    {
      projectionType: "AIDOS_DELEGATION_ELIGIBILITY_PROJECTION" as const,
      projectionId:
        "urn:aidos:projection:018f47a2-5c2d-7b9f-8abc-0123456789ab:AIDOS_DELEGATION_ELIGIBILITY_PROJECTION",
      projectionRevision: digest("e"),
    },
  ],
};
const registrySnapshotHash = "a".repeat(64);
const context: ExactRequestContext = {
  requestId: "request",
  organizationId: "organization",
  projectId: "project",
  companyScopeRef: "company",
  teamScopeRef: null,
  projectScopeRef: "scope",
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
};

function classification(
  overrides: Partial<ClassificationAuthoritySnapshot> = {},
): ClassificationAuthoritySnapshot {
  return {
    current: true,
    authority: "PHASE15C_CLASSIFICATION",
    identity: "classification-version",
    revision: "classification-r1",
    checkedAt: now,
    freshnessModel: "REFERENCE_VERSION_CURRENTNESS",
    handoff: {
      classificationId: "classification-version",
      requestId: "request",
      taskId: null,
      version: 1,
      domainKey: "OPERATIONS",
      subdomainKey: null,
      routingDisposition: "MAOS_NATIVE",
      requestedRoleClass: "EXECUTOR",
      requiredCapabilityRefs: ["cap-required"],
      preferredCapabilityRefs: ["cap-preferred"],
      policyConstraintRefs: ["domain-policy"],
      policyResolutionRef: "domain-policy",
      policyResolutionVersion: "1",
      contextRefs: [],
      artifactRefs: [],
      priorityClass: "NORMAL",
      correlationId: "correlation",
      causationRef: null,
      freshnessProof: "sha256:classification-current",
      organizationId: "organization",
      projectId: "project",
      environment: "STAGING",
    },
    classificationId: "classification-version",
    requestId: "request",
    classificationState: "VALIDATED",
    stalenessState: "CURRENT",
    policyResolved: true,
    policyResolutionRef: "domain-policy",
    policyResolutionVersion: "1",
    classificationVersion: 1,
    currentnessProof: "sha256:classification-current",
    validatedAt: now,
    ...overrides,
  };
}

function policy(
  constraints: Readonly<Record<string, unknown>> = {
    allowedRoutingModes: ["PRIMARY_EXECUTION"],
    candidateTieBreakers: ["MODEL_ID"],
  },
): RoutingPolicySnapshot {
  return {
    routingPolicyVersionId: "routing-policy-version",
    routingPolicyId: "routing-policy",
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
    contentFingerprint: "sha256:routing-policy",
    createdByActorType: "HUMAN",
    createdByActorId: "human",
    auditRef: "audit:routing-policy",
    createdAt: now,
  };
}

const candidates: CandidateResolutionResult = {
  registrySnapshotRef: `registry-snapshot:sha256:${registrySnapshotHash}`,
  registrySnapshotRevision: "registry-r1",
  registryObservedAt: now,
  registryFreshUntil: future,
  registryFreshnessAuthority: {
    policyRef: "registry-freshness-policy",
    policyVersion: "1",
    maxAgeMs: 3_600_000,
    registryObservedAt: now,
    freshUntil: future,
    snapshotRef: `registry-snapshot:sha256:${registrySnapshotHash}`,
    snapshotRevision: "registry-r1",
    snapshotHash: registrySnapshotHash,
  },
  registryResourceRefs: [
    "provider",
    "model",
    "runtime",
    "binding",
    "binding-cap-required",
    "role-compatibility",
    "cap-required",
  ],
  eligibleCandidates: [
    {
      deterministicRank: 1,
      providerId: "provider",
      modelId: "model",
      runtimeAdapterId: "runtime",
      modelHostBindingId: "binding",
      matchedRequiredCapabilityRefs: ["cap-required"],
      matchedPreferredCapabilityRefs: [],
      roleCompatibilityRef: "role-compatibility",
      specializationVersionId: null,
      lineage: {
        provider: { id: "provider", version: 1 },
        model: { id: "model", version: 1 },
        runtimeAdapter: { id: "runtime", version: 1 },
        modelHostBinding: { id: "binding", version: 1 },
        capabilityBindings: [
          {
            id: "binding-cap-required",
            version: 1,
            capabilityId: "cap-required",
            capabilityVersion: 1,
            requirement: "REQUIRED",
          },
        ],
        roleCompatibility: { id: "role-compatibility", version: 1 },
        specialization: null,
        routingPolicy: {
          id: "routing-policy",
          versionId: "routing-policy-version",
          version: 1,
          contentFingerprint: "sha256:routing-policy",
        },
        classification: {
          identity: "classification-version",
          revision: "classification-r1",
          version: 1,
          currentnessProof: "sha256:classification-current",
        },
      },
      rankingEvidence: {
        preferredCapabilityMatchCount: 0,
        tieBreakers: ["MODEL_ID"],
      },
    },
  ],
  excludedCandidates: [],
  developmentDelegationRequired: false,
};

function workRequests(): WorkRequestReadPort {
  return {
    findRequest: async () => ({
      id: "request",
      sourceSystem: "portal",
      sourceType: "REQUEST",
      sourceRef: "source:request",
      sourceFingerprint: "sha256:request",
      lifecycleState: "REGISTERED",
      registrationAuditRef: "audit:request",
      registeredAt: now,
      invalidatedAt: null,
      invalidationReasonCode: null,
      organizationId: "organization",
      projectId: "project",
      companyScopeRef: "company",
      teamScopeRef: null,
      projectScopeRef: "scope",
      systemScopeRef: null,
      environment: "STAGING",
    }),
  };
}

function classifications(
  snapshot = classification(),
): ClassificationAuthorityReadPort {
  return {
    readCurrent: async () => snapshot,
    revalidate: async () => ({
      current: true,
      authority: snapshot.authority,
      identity: snapshot.identity,
      revision: snapshot.revision,
      checkedAt: now,
      freshnessModel: "REFERENCE_VERSION_CURRENTNESS",
    }),
  };
}

function policies(value = policy()): RoutingPolicyResolver {
  return {
    resolveActivePolicy: async () => value,
    resolveSpecialization: async () => null,
  };
}

function candidateService(value = candidates): CandidateResolver {
  return { resolve: async () => value };
}

function approvalSnapshot(
  overrides: Partial<HumanApprovalSnapshot> = {},
): HumanApprovalSnapshot {
  return {
    current: true,
    authority: "approval-rule",
    identity: "approval",
    revision: "approval-r1",
    checkedAt: now,
    freshUntil: future,
    freshnessModel: "AUTHORITY_EXPIRY",
    state: "APPROVED",
    approvalRef: "approval",
    authorityRuleRef: "approval-rule",
    approvalPolicyRef: "approval-rule",
    approvalPolicyVersion: "1",
    targetType: "ROUTING_REQUEST",
    targetId: "request",
    targetVersion: "1",
    targetHash: "sha256:target",
    approvalStatus: "APPROVED",
    approvalValidity: "VALID",
    issuedAt: now,
    expiresAt: future,
    reasonCode: "APPROVED",
    ...overrides,
  };
}

function approvals(
  snapshot = approvalSnapshot(),
): HumanApprovalAuthorityReadPort {
  return {
    resolveRequirement: async () => snapshot,
    revalidate: async () => snapshot,
  };
}

function aidos(): AidosAuthorityReadPort {
  const base = {
    projectRef: "aidos-project",
    revision: "aidos-r1",
    observedAt: now,
    freshUntil: future,
    evidenceRef: "evidence:aidos",
    source: AIDOS_AUTHORITY_SOURCE,
  } as const;
  return {
    readAidosAvailability: async () => ({
      ...base,
      revision: digest("d"),
      state: "AVAILABLE",
      sourceProjection: AIDOS_AVAILABILITY_SOURCE,
    }),
    readProjectOnboardingState: async () => ({
      ...base,
      revision: digest("c"),
      state: "PROJECT_ONBOARDED",
      sourceProjection: AIDOS_PROJECT_REGISTRATION_SOURCE,
    }),
    readDelegationEligibility: async () => ({
      ...base,
      revision: digest("e"),
      state: "ELIGIBLE",
      sourceProjection: AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
      snapshotBinding: aidosSnapshotBinding,
    }),
    revalidate: async () => ({
      current: true,
      authority: AIDOS_AUTHORITY_SOURCE,
      identity: "aidos-project",
      revision: `${digest("d")}:${digest("c")}:${digest("e")}`,
      checkedAt: now,
      freshUntil: future,
      freshnessModel: "AUTHORITY_EXPIRY",
      snapshotBinding: aidosSnapshotBinding,
    }),
  };
}

function registry(): RegistryAuthorityReadPort {
  return {
    readSnapshot: async () => {
      throw new Error("not used by validation service");
    },
    revalidate: async (input) => ({
      current: true,
      authority: "PHASE15B_REGISTRY",
      identity: input.snapshotRef,
      revision: input.snapshotRevision,
      checkedAt: now,
      freshUntil: future,
      freshnessModel: "AUTHORITY_EXPIRY",
      policyRef: input.policyRef,
      policyVersion: input.policyVersion,
      maxAgeMs: input.maxAgeMs,
      registryObservedAt: input.registryObservedAt,
      snapshotRef: input.snapshotRef,
      snapshotRevision: input.snapshotRevision,
      snapshotHash: input.snapshotHash,
    }),
  };
}

function service(
  overrides: {
    workRequests?: WorkRequestReadPort;
    classifications?: ClassificationAuthorityReadPort;
    policies?: RoutingPolicyResolver;
    candidates?: CandidateResolver;
    approvals?: HumanApprovalAuthorityReadPort;
    aidos?: AidosAuthorityReadPort;
    registry?: RegistryAuthorityReadPort;
    now?: () => Date;
  } = {},
) {
  return new RoutingValidationService({
    workRequests: overrides.workRequests ?? workRequests(),
    classifications: overrides.classifications ?? classifications(),
    policies: overrides.policies ?? policies(),
    candidates: overrides.candidates ?? candidateService(),
    approvals: overrides.approvals ?? approvals(),
    aidos: overrides.aidos ?? aidos(),
    registry: overrides.registry ?? registry(),
    now: overrides.now ?? (() => new Date(now)),
  });
}

const validationInput = {
  requestId: "request",
  expectedClassificationVersionId: "classification-version",
  context,
  scopeRef: "scope",
  roleClass: "EXECUTOR" as const,
  routingPurpose: "PRIMARY_EXECUTION" as const,
  routingMode: "PRIMARY_EXECUTION" as const,
  specializationRef: null,
  approval: null,
  aidosTargetRef: null,
  aidosDelegationInput,
};

test("validates current canonical authorities and returns non-authoritative candidate evidence", async () => {
  const result = await service().validate(validationInput);
  assert.equal(result.request.id, "request");
  assert.equal(result.classification.identity, "classification-version");
  assert.equal(result.policy.routingPolicyVersionId, "routing-policy-version");
  assert.equal(result.candidates?.registrySnapshotRevision, "registry-r1");
  assert.equal(result.developmentDelegationState, "NOT_APPLICABLE");
  assert.equal("executionAuthority" in result, false);
});

test("invokes every final authority revalidation boundary before success", async () => {
  let classificationReads = 0;
  let classificationRevalidations = 0;
  let policyReads = 0;
  const policyInputs: unknown[] = [];
  let registryRevalidations = 0;
  const registryRevalidationInputs: unknown[][] = [];
  const classificationPort = classifications();
  const policyPort = policies();
  const registryPort = registry();
  await service({
    classifications: {
      ...classificationPort,
      readCurrent: async (...args) => {
        classificationReads += 1;
        return classificationPort.readCurrent(...args);
      },
      revalidate: async (...args) => {
        classificationRevalidations += 1;
        return classificationPort.revalidate(...args);
      },
    },
    policies: {
      ...policyPort,
      resolveActivePolicy: async (...args) => {
        policyReads += 1;
        policyInputs.push(args[0]);
        return policyPort.resolveActivePolicy(...args);
      },
    },
    registry: {
      ...registryPort,
      revalidate: async (...args) => {
        registryRevalidations += 1;
        registryRevalidationInputs.push(args);
        return registryPort.revalidate(...args);
      },
    },
  }).validate(validationInput);
  assert.equal(classificationReads, 2);
  assert.equal(classificationRevalidations, 1);
  assert.equal(policyReads, 2);
  assert.equal(
    policyInputs.every((input) => !("effectiveAt" in (input as object))),
    true,
  );
  assert.equal(registryRevalidations, 1);
  assert.deepEqual(registryRevalidationInputs, [
    [
      {
        ...candidates.registryFreshnessAuthority,
        resourceRefs: [...candidates.registryResourceRefs],
      },
    ],
  ]);
});

test("requires exact governed Registry freshness evidence at final revalidation", async () => {
  for (const override of [
    { policyRef: "changed-policy" },
    { policyVersion: "2" },
    { maxAgeMs: 1_800_000 },
    { snapshotHash: "b".repeat(64) },
    { registryObservedAt: "2026-10-09T00:00:01.000Z" },
    { freshUntil: "2026-10-09T00:30:00.000Z" },
  ]) {
    await assert.rejects(
      service({
        registry: {
          ...registry(),
          revalidate: async (input) => ({
            ...(await registry().revalidate(input)),
            ...override,
          }),
        },
      }).validate(validationInput),
      (error) =>
        error instanceof RoutingContractError &&
        error.code === "REGISTRY_CONFLICT",
    );
  }
});

test("fails closed when the governed Registry snapshot expires before validation", async () => {
  await assert.rejects(
    service({
      registry: registry(),
      now: () => new Date("2026-10-09T01:00:00.001Z"),
    }).validate(validationInput),
    (error) =>
      error instanceof RoutingContractError && error.code === "REGISTRY_STALE",
  );
});

test("fails closed when classification, policy, or Registry changes after resolution", async () => {
  let classificationReads = 0;
  await assert.rejects(
    service({
      classifications: {
        ...classifications(),
        readCurrent: async () =>
          ++classificationReads === 1
            ? classification()
            : classification({ revision: "classification-r2" }),
      },
    }).validate(validationInput),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "CLASSIFICATION_NOT_CURRENT",
  );

  let policyReads = 0;
  await assert.rejects(
    service({
      policies: {
        ...policies(),
        resolveActivePolicy: async () =>
          ++policyReads === 1
            ? policy()
            : { ...policy(), contentFingerprint: "sha256:changed" },
      },
    }).validate(validationInput),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "ROUTING_POLICY_STALE",
  );

  await assert.rejects(
    service({
      registry: {
        ...registry(),
        revalidate: async () => {
          throw new RoutingContractError("REGISTRY_CONFLICT");
        },
      },
    }).validate(validationInput),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "REGISTRY_CONFLICT",
  );
});

test("fails closed for missing request and mismatched request context", async () => {
  await assert.rejects(
    service({ workRequests: { findRequest: async () => undefined } }).validate(
      validationInput,
    ),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "ROUTING_REQUEST_NOT_FOUND",
  );
  await assert.rejects(
    service({
      workRequests: {
        findRequest: async () => ({
          ...(await workRequests().findRequest("request"))!,
          projectId: "other-project",
        }),
      },
    }).validate(validationInput),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "CLASSIFICATION_INVALID",
  );
});

test("rejects non-current, non-validated, stale, and policy-unresolved classification snapshots", async () => {
  for (const [snapshot, code] of [
    [classification({ current: false }), "CLASSIFICATION_NOT_CURRENT"],
    [
      classification({ classificationState: "PROPOSED" } as never),
      "CLASSIFICATION_NOT_VALIDATED",
    ],
    [
      classification({ stalenessState: "STALE" } as never),
      "CLASSIFICATION_STALE",
    ],
    [
      classification({ policyResolved: false } as never),
      "CLASSIFICATION_POLICY_UNRESOLVED",
    ],
  ] as const) {
    await assert.rejects(
      service({ classifications: classifications(snapshot) }).validate(
        validationInput,
      ),
      (error) => error instanceof RoutingContractError && error.code === code,
    );
  }
});

test("rejects an earlier or malformed classification binding without fallback", async () => {
  await assert.rejects(
    service().validate({
      ...validationInput,
      expectedClassificationVersionId: "earlier-classification",
    }),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "CLASSIFICATION_NOT_CURRENT",
  );
  const malformed = classification({
    policyResolutionVersion: "2",
  });
  await assert.rejects(
    service({ classifications: classifications(malformed) }).validate(
      validationInput,
    ),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "CLASSIFICATION_INVALID",
  );
  await assert.rejects(
    service({
      classifications: classifications(
        classification({ authority: "UNTRUSTED_CLASSIFICATION" }),
      ),
    }).validate(validationInput),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "CLASSIFICATION_INVALID",
  );
});

test("requires exact current Human Approval when policy requires it", async () => {
  const approvalRequired = policies(
    policy({
      allowedRoutingModes: ["PRIMARY_EXECUTION"],
      candidateTieBreakers: ["MODEL_ID"],
      humanApprovalRequired: true,
    }),
  );
  await assert.rejects(
    service({ policies: approvalRequired }).validate(validationInput),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "HUMAN_APPROVAL_REQUIRED",
  );
  for (const [state, code] of [
    ["EXPIRED", "HUMAN_APPROVAL_STALE"],
    ["REVOKED", "HUMAN_APPROVAL_REVOKED"],
    ["REJECTED", "HUMAN_APPROVAL_INVALID"],
  ] as const) {
    await assert.rejects(
      service({
        policies: approvalRequired,
        approvals: approvals(approvalSnapshot({ state })),
      }).validate({
        ...validationInput,
        approval: {
          approvalRequestId: "approval-request",
          expected: {
            targetType: "ROUTING_REQUEST",
            targetId: "request",
            targetVersion: "1",
            targetHash: "sha256:target",
            companyScopeRef: "company",
            projectScopeRef: "scope",
            riskClass: "R3",
            environment: "STAGING",
            requestedOperation: "ROUTE",
            evidenceManifestHash: "sha256:evidence",
            approvalPolicyRef: "approval-rule",
            approvalPolicyVersion: "1",
          },
        },
      }),
      (error) => error instanceof RoutingContractError && error.code === code,
    );
  }
});

test("rejects wrong approval authority and approval drift during final revalidation", async () => {
  const approvalRequired = policies(
    policy({
      allowedRoutingModes: ["PRIMARY_EXECUTION"],
      candidateTieBreakers: ["MODEL_ID"],
      humanApprovalRequired: true,
    }),
  );
  const input = {
    ...validationInput,
    approval: {
      approvalRequestId: "approval-request",
      expected: {
        targetType: "ROUTING_REQUEST",
        targetId: "request",
        targetVersion: "1",
        targetHash: "sha256:target",
        companyScopeRef: "company",
        projectScopeRef: "scope",
        riskClass: "R3" as const,
        environment: "STAGING" as const,
        requestedOperation: "ROUTE",
        evidenceManifestHash: "sha256:evidence",
        approvalPolicyRef: "approval-rule",
        approvalPolicyVersion: "1",
      },
    },
  };
  let approvalRevalidations = 0;
  const approvalPort = approvals();
  await service({
    policies: approvalRequired,
    approvals: {
      ...approvalPort,
      revalidate: async (...args) => {
        approvalRevalidations += 1;
        return approvalPort.revalidate(...args);
      },
    },
  }).validate(input);
  assert.equal(approvalRevalidations, 1);

  await assert.rejects(
    service({
      policies: approvalRequired,
      approvals: approvals(approvalSnapshot({ authority: "WRONG_AUTHORITY" })),
    }).validate(input),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "HUMAN_APPROVAL_INVALID",
  );

  for (const override of [
    { targetId: "wrong-request" },
    { targetVersion: "wrong-version" },
    { targetHash: "sha256:wrong" },
  ]) {
    await assert.rejects(
      service({
        policies: approvalRequired,
        approvals: approvals(approvalSnapshot(override)),
      }).validate(input),
      (error) =>
        error instanceof RoutingContractError &&
        error.code === "HUMAN_APPROVAL_INVALID",
    );
  }

  const initial = approvalSnapshot();
  await assert.rejects(
    service({
      policies: approvalRequired,
      approvals: {
        resolveRequirement: async () => initial,
        revalidate: async () => approvalSnapshot({ state: "REVOKED" }),
      },
    }).validate(input),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "HUMAN_APPROVAL_REVOKED",
  );
});

test("returns allowlisted specialization evidence without unrestricted metadata", async () => {
  const specialization = {
    specializationVersionId: "specialization-version",
    specializationId: "specialization",
    version: 1,
    supersedesSpecializationVersionId: null,
    routingPolicyVersionId: "routing-policy-version",
    lifecycle: "ACTIVE" as const,
    specializationKey: "DOMAIN_SPECIALIST",
    canonicalDomain: "OPERATIONS" as const,
    routingPurpose: "PRIMARY_EXECUTION" as const,
    scopeRef: "scope",
    environment: "STAGING" as const,
    requiredCapabilityRefs: ["cap-required"],
    preferredCapabilityRefs: [],
    metadata: { credentialAdjacent: "must-not-leak" },
    contentFingerprint: "sha256:specialization",
    auditRef: "audit:specialization",
    createdAt: now,
  };
  const policyPort = policies();
  const specializedCandidates: CandidateResolutionResult = {
    ...candidates,
    eligibleCandidates: candidates.eligibleCandidates.map((candidate) => ({
      ...candidate,
      lineage: {
        ...candidate.lineage,
        specialization: {
          id: specialization.specializationId,
          versionId: specialization.specializationVersionId,
          version: specialization.version,
          contentFingerprint: specialization.contentFingerprint,
        },
      },
    })),
  };
  const result = await service({
    policies: {
      ...policyPort,
      resolveSpecialization: async () => specialization,
    },
    candidates: candidateService(specializedCandidates),
  }).validate({
    ...validationInput,
    specializationRef: "specialization-version",
  });
  assert.equal(
    result.specialization?.specializationVersionId,
    "specialization-version",
  );
  assert.equal("metadata" in result.specialization!, false);
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
});

test("fails closed when candidate authority lineage drifts", async () => {
  const forged: CandidateResolutionResult = {
    ...candidates,
    eligibleCandidates: candidates.eligibleCandidates.map((candidate) => ({
      ...candidate,
      lineage: {
        ...candidate.lineage,
        classification: {
          ...candidate.lineage.classification,
          revision: "forged-classification-revision",
        },
      },
    })),
  };
  await assert.rejects(
    service({ candidates: candidateService(forged) }).validate(validationInput),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "REGISTRY_CONFLICT",
  );
});

test("Development revalidates AIDOS and never calls MAOS candidate resolution", async () => {
  let candidateCalls = 0;
  let aidosRequiredCapabilityRefs: readonly string[] = [];
  let aidosRevalidations = 0;
  const developmentClassification = classification({
    handoff: {
      ...classification().handoff,
      domainKey: "DEVELOPMENT",
      routingDisposition: "DELEGATE_TO_AIDOS",
    },
  });
  const developmentPolicy = {
    ...policy({
      allowedRoutingModes: ["PRIMARY_EXECUTION"],
      routingDisposition: "DELEGATE_TO_AIDOS",
    }),
    canonicalDomain: "DEVELOPMENT" as const,
    requiredCapabilityRefs: ["cap-policy"],
  };
  const developmentSpecialization = {
    specializationVersionId: "development-specialization-version",
    specializationId: "development-specialization",
    version: 1,
    supersedesSpecializationVersionId: null,
    routingPolicyVersionId: "routing-policy-version",
    lifecycle: "ACTIVE" as const,
    specializationKey: "DOMAIN_SPECIALIST",
    canonicalDomain: "DEVELOPMENT" as const,
    routingPurpose: "PRIMARY_EXECUTION" as const,
    scopeRef: "scope",
    environment: "STAGING" as const,
    requiredCapabilityRefs: ["cap-specialization"],
    preferredCapabilityRefs: [],
    metadata: {},
    contentFingerprint: "sha256:development-specialization",
    auditRef: "audit:development-specialization",
    createdAt: now,
  };
  const aidosPort = aidos();
  const result = await service({
    classifications: classifications(developmentClassification),
    policies: {
      resolveActivePolicy: async () => developmentPolicy,
      resolveSpecialization: async () => developmentSpecialization,
    },
    candidates: {
      resolve: async () => {
        candidateCalls += 1;
        return candidates;
      },
    },
    aidos: {
      ...aidosPort,
      readDelegationEligibility: async (query) => {
        aidosRequiredCapabilityRefs =
          query.delegationInput.requiredCapabilities;
        return aidosPort.readDelegationEligibility(query);
      },
      revalidate: async (...args) => {
        aidosRevalidations += 1;
        return aidosPort.revalidate(...args);
      },
    },
  }).validate({
    ...validationInput,
    aidosTargetRef: "aidos-project",
  });
  assert.equal(result.developmentDelegationState, "READY_TO_DELEGATE");
  assert.equal(result.candidates, null);
  assert.equal(candidateCalls, 0);
  assert.equal(aidosRevalidations, 1);
  assert.deepEqual(aidosRequiredCapabilityRefs, ["execute"]);
});

test("Development fails closed when AIDOS projection authority changes after reads", async () => {
  const developmentClassification = classification({
    handoff: {
      ...classification().handoff,
      domainKey: "DEVELOPMENT",
      routingDisposition: "DELEGATE_TO_AIDOS",
    },
  });
  const developmentPolicy = {
    ...policy({
      allowedRoutingModes: ["PRIMARY_EXECUTION"],
      routingDisposition: "DELEGATE_TO_AIDOS",
    }),
    canonicalDomain: "DEVELOPMENT" as const,
  };
  await assert.rejects(
    service({
      classifications: classifications(developmentClassification),
      policies: policies(developmentPolicy),
      aidos: {
        ...aidos(),
        revalidate: async () => {
          throw new RoutingContractError("AIDOS_AUTHORITY_CONFLICT");
        },
      },
    }).validate({ ...validationInput, aidosTargetRef: "aidos-project" }),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "AIDOS_AUTHORITY_CONFLICT",
  );
});

test("Development blocks before AIDOS when canonical delegation input is missing", async () => {
  const base = classification();
  const developmentClassification = classification({
    handoff: {
      ...base.handoff,
      domainKey: "DEVELOPMENT",
      routingDisposition: "DELEGATE_TO_AIDOS",
    },
  });
  const developmentPolicy = {
    ...policy({
      allowedRoutingModes: ["PRIMARY_EXECUTION"],
      routingDisposition: "DELEGATE_TO_AIDOS",
    }),
    canonicalDomain: "DEVELOPMENT" as const,
  };
  let aidosCalls = 0;
  const blockedPort = aidos();
  await assert.rejects(
    service({
      classifications: classifications(developmentClassification),
      policies: policies(developmentPolicy),
      aidos: {
        ...blockedPort,
        readAidosAvailability: async (query) => {
          aidosCalls += 1;
          return blockedPort.readAidosAvailability(query);
        },
      },
    }).validate({
      ...validationInput,
      aidosTargetRef: "aidos-project",
      aidosDelegationInput: null,
    }),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "WAITING_AIDOS_DELEGATION_INPUT",
  );
  assert.equal(aidosCalls, 0);
});

test("Development returns bounded unavailable and onboarding outcomes", async () => {
  const developmentClassification = classification({
    handoff: {
      ...classification().handoff,
      domainKey: "DEVELOPMENT",
      routingDisposition: "DELEGATE_TO_AIDOS",
    },
  });
  const developmentPolicy = {
    ...policy({
      allowedRoutingModes: ["PRIMARY_EXECUTION"],
      routingDisposition: "DELEGATE_TO_AIDOS",
    }),
    canonicalDomain: "DEVELOPMENT" as const,
  };
  const baseOverrides = {
    classifications: classifications(developmentClassification),
    policies: policies(developmentPolicy),
  };
  const unavailablePort = aidos();
  const unavailable = await service({
    ...baseOverrides,
    aidos: {
      ...unavailablePort,
      readAidosAvailability: async (query) => ({
        ...(await unavailablePort.readAidosAvailability(query)),
        state: "UNAVAILABLE",
      }),
    },
  }).validate({ ...validationInput, aidosTargetRef: "aidos-project" });
  assert.equal(unavailable.developmentDelegationState, "AIDOS_UNAVAILABLE");
  assert.equal(unavailable.aidos?.registrationRevision, null);
  assert.equal(unavailable.aidos?.eligibilityRevision, null);

  const onboardingPort = aidos();
  const onboarding = await service({
    ...baseOverrides,
    aidos: {
      ...onboardingPort,
      readProjectOnboardingState: async (query) => ({
        ...(await onboardingPort.readProjectOnboardingState(query)),
        state: "PROJECT_NOT_ONBOARDED",
      }),
    },
  }).validate({ ...validationInput, aidosTargetRef: "aidos-project" });
  assert.equal(
    onboarding.developmentDelegationState,
    "WAITING_AIDOS_ONBOARDING",
  );
  assert.equal(onboarding.aidos?.eligibilityRevision, null);

  await assert.rejects(
    service({
      ...baseOverrides,
      aidos: {
        ...aidos(),
        readAidosAvailability: async () => ({
          ...(await aidos().readAidosAvailability({
            environment: "STAGING",
            targetRef: "aidos-project",
            organizationId: "organization",
            projectId: "project",
            scopeRef: "scope",
            correlationId: "correlation",
            delegationInput: aidosDelegationInput,
          })),
          state: "UNKNOWN",
        }),
      },
    }).validate({ ...validationInput, aidosTargetRef: "aidos-project" }),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "AIDOS_AUTHORITY_STALE",
  );
});
