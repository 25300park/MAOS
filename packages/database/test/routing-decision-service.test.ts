import assert from "node:assert/strict";
import test from "node:test";

import {
  RoutingContractError,
  RoutingDecisionService,
  type AppendRoutingDecisionInput,
  type CreatePersistedRoutingDecisionInput,
  type CreateRoutingDecisionInput,
  type HumanRoutingOverrideAuthority,
  type HumanRoutingOverrideRequest,
  type RoutingAppendResult,
  type RoutingCandidateSnapshot,
  type RoutingDecisionRecord,
  type RoutingDecisionRepository,
  type RoutingPurpose,
  type RoutingValidationService,
  type ValidatedRoutingContext,
} from "../src/index.js";

const now = "2026-10-09T00:00:00.000Z";
const future = "2026-10-09T01:00:00.000Z";
const id = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, "0")}`;
const sha = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;
const aidosDelegationInput = {
  developmentIntent: "Implement the approved change",
  requestedRoleClass: "EXECUTOR" as const,
  requiredCapabilities: ["execute"] as const,
  preferredCapabilities: ["verify"] as const,
  policyConstraints: [] as const,
  contextRefs: [] as const,
  artifactRefs: [] as const,
  priority: 50,
  aidosProjectRef: "aidos:project",
  delegationRequestId: "delegation-request",
};
const aidosSnapshotBinding = {
  snapshotId: "018f47a2-5c2d-7b9f-8abc-0123456789ab",
  authorityEpoch: sha("a"),
  requestDigest: sha("b"),
  projectionBindings: [
    { projectionType: "AIDOS_PROJECT_REGISTRATION_PROJECTION" as const, projectionId: "urn:aidos:projection:018f47a2-5c2d-7b9f-8abc-0123456789ab:AIDOS_PROJECT_REGISTRATION_PROJECTION", projectionRevision: sha("c") },
    { projectionType: "AIDOS_RUNTIME_AVAILABILITY_PROJECTION" as const, projectionId: "urn:aidos:projection:018f47a2-5c2d-7b9f-8abc-0123456789ab:AIDOS_RUNTIME_AVAILABILITY_PROJECTION", projectionRevision: sha("d") },
    { projectionType: "AIDOS_DELEGATION_ELIGIBILITY_PROJECTION" as const, projectionId: "urn:aidos:projection:018f47a2-5c2d-7b9f-8abc-0123456789ab:AIDOS_DELEGATION_ELIGIBILITY_PROJECTION", projectionRevision: sha("e") },
  ],
};

function validationInput(
  overrides: Partial<CreateRoutingDecisionInput> = {},
): CreateRoutingDecisionInput {
  return {
    requestId: id("1"),
    expectedClassificationVersionId: id("2"),
    context: {
      requestId: id("1"),
      organizationId: id("3"),
      projectId: id("4"),
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
    },
    scopeRef: "scope",
    roleClass: "EXECUTOR",
    routingPurpose: "PRIMARY_EXECUTION",
    routingMode: "PRIMARY_EXECUTION",
    specializationRef: null,
    approval: null,
    aidosTargetRef: null,
    aidosDelegationInput,
    ...overrides,
  };
}

function createInput(
  overrides: Partial<CreatePersistedRoutingDecisionInput> = {},
): CreatePersistedRoutingDecisionInput {
  return {
    ...validationInput(),
    expectedCurrentDecisionId: null,
    idempotencyKey: "route-once",
    actorType: "SYSTEM",
    actorId: id("5"),
    evidenceRefs: ["evidence:routing"],
    contextRefs: ["context:routing"],
    artifactRefs: [],
    priority: "NORMAL",
    correlationId: "correlation",
    causationRefs: [],
    traceId: "trace",
    spanId: "span",
    ...overrides,
  };
}

function overrideAuthority(
  overrides: Partial<HumanRoutingOverrideAuthority> = {},
): HumanRoutingOverrideAuthority {
  return {
    authorityId: "authority:routing-override",
    permission: "ROUTING_DECISION:OVERRIDE",
    state: "ACTIVE",
    actorId: id("5"),
    organizationId: id("3"),
    projectId: id("4"),
    scopeRef: "scope",
    environment: "STAGING",
    targetRequestId: id("1"),
    targetRoutingPurpose: "PRIMARY_EXECUTION",
    targetDecisionId: id("90"),
    checkedAt: now,
    freshUntil: future,
    ...overrides,
  };
}

function overrideInput(
  predecessorId: string,
  overrides: Partial<HumanRoutingOverrideRequest> = {},
): HumanRoutingOverrideRequest {
  return {
    ...createInput({
      expectedCurrentDecisionId: predecessorId,
      idempotencyKey: "override-once",
      actorType: "HUMAN",
    }),
    actorType: "HUMAN",
    expectedCurrentDecisionId: predecessorId,
    authority: overrideAuthority({ targetDecisionId: predecessorId }),
    overrideIntent: {
      type: "SELECT_ELIGIBLE_CANDIDATE",
      modelHostBindingId: id("23"),
    },
    reasonCode: "HUMAN_SELECTED_ELIGIBLE_RESOURCE",
    reasonText: "Human selected the current policy-eligible candidate.",
    evidenceRefs: ["evidence:human-override"],
    ...overrides,
  };
}

function validated(
  overrides: Partial<ValidatedRoutingContext> = {},
): ValidatedRoutingContext {
  return {
    request: {
      id: id("1"),
      sourceSystem: "PORTAL",
      sourceType: "REQUEST",
      sourceRef: "request:1",
      sourceFingerprint: sha("a"),
      lifecycleState: "REGISTERED",
      registrationAuditRef: id("6"),
      registeredAt: now,
      invalidatedAt: null,
      invalidationReasonCode: null,
      organizationId: id("3"),
      projectId: id("4"),
      companyScopeRef: "company",
      teamScopeRef: null,
      projectScopeRef: "scope",
      systemScopeRef: null,
      environment: "STAGING",
    },
    classification: {
      current: true,
      authority: "PHASE15C_CLASSIFICATION",
      identity: id("2"),
      revision: "classification-r1",
      checkedAt: now,
      freshnessModel: "REFERENCE_VERSION_CURRENTNESS",
      handoff: {
        classificationId: id("2"),
        requestId: id("1"),
        taskId: null,
        version: 1,
        domainKey: "OPERATIONS",
        subdomainKey: null,
        routingDisposition: "MAOS_NATIVE",
        requestedRoleClass: "EXECUTOR",
        requiredCapabilityRefs: [id("10")],
        preferredCapabilityRefs: [id("11")],
        policyConstraintRefs: ["constraint:1"],
        policyResolutionRef: id("12"),
        policyResolutionVersion: "1",
        contextRefs: ["classification:context"],
        artifactRefs: ["classification:artifact"],
        priorityClass: "NORMAL",
        correlationId: "classification-correlation",
        causationRef: null,
        freshnessProof: sha("b"),
        organizationId: id("3"),
        projectId: id("4"),
        environment: "STAGING",
      },
      classificationId: id("2"),
      requestId: id("1"),
      classificationState: "VALIDATED",
      stalenessState: "CURRENT",
      policyResolved: true,
      policyResolutionRef: id("12"),
      policyResolutionVersion: "1",
      classificationVersion: 1,
      currentnessProof: sha("b"),
      validatedAt: now,
    },
    policy: {
      routingPolicyVersionId: id("13"),
      routingPolicyId: id("14"),
      version: 1,
      supersedesPolicyVersionId: null,
      authorityIdentifier: "MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD",
      lifecycleIntent: "ACTIVE",
      canonicalDomain: "OPERATIONS",
      routingPurpose: "PRIMARY_EXECUTION",
      roleClass: "EXECUTOR",
      organizationId: id("3"),
      projectId: id("4"),
      scopeRef: "scope",
      environment: "STAGING",
      requiredCapabilityRefs: [id("10")],
      preferredCapabilityRefs: [id("11")],
      policyConstraints: Object.freeze({
        allowedRoutingModes: ["PRIMARY_EXECUTION", "FALLBACK"],
        candidateTieBreakers: ["MODEL_ID"],
      }),
      effectiveAt: now,
      expiresAt: null,
      contentFingerprint: sha("c"),
      createdByActorType: "HUMAN",
      createdByActorId: id("5"),
      auditRef: id("15"),
      createdAt: now,
    },
    specialization: null,
    approval: null,
    candidates: {
      registrySnapshotRef: `registry-snapshot:${sha("d")}`,
      registrySnapshotRevision: "registry-r1",
      registryObservedAt: now,
      registryFreshUntil: future,
      registryFreshnessAuthority: {
        policyRef: "registry-freshness-policy",
        policyVersion: "1",
        maxAgeMs: 3_600_000,
        registryObservedAt: now,
        freshUntil: future,
        snapshotRef: `registry-snapshot:${sha("d")}`,
        snapshotRevision: "registry-r1",
        snapshotHash: sha("d").slice("sha256:".length),
      },
      registryResourceRefs: [
        id("20"),
        id("21"),
        id("22"),
        id("23"),
        id("24"),
        id("25"),
        id("10"),
      ],
      eligibleCandidates: [
        {
          deterministicRank: 1,
          providerId: id("20"),
          modelId: id("21"),
          runtimeAdapterId: id("22"),
          modelHostBindingId: id("23"),
          matchedRequiredCapabilityRefs: [id("10")],
          matchedPreferredCapabilityRefs: [],
          roleCompatibilityRef: id("24"),
          specializationVersionId: null,
          lineage: {
            provider: { id: id("20"), version: 2 },
            model: { id: id("21"), version: 3 },
            runtimeAdapter: { id: id("22"), version: 4 },
            modelHostBinding: { id: id("23"), version: 5 },
            capabilityBindings: [
              {
                id: id("25"),
                version: 6,
                capabilityId: id("10"),
                capabilityVersion: 7,
                requirement: "REQUIRED",
              },
            ],
            roleCompatibility: { id: id("24"), version: 8 },
            specialization: null,
            routingPolicy: {
              id: id("14"),
              versionId: id("13"),
              version: 1,
              contentFingerprint: sha("c"),
            },
            classification: {
              identity: id("2"),
              revision: "classification-r1",
              version: 1,
              currentnessProof: sha("b"),
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
    },
    aidos: null,
    developmentDelegationState: "NOT_APPLICABLE",
    ...overrides,
  };
}

function developmentValidated(
  aidosOverrides: Partial<NonNullable<ValidatedRoutingContext["aidos"]>> = {},
): ValidatedRoutingContext {
  const base = validated();
  return validated({
    classification: {
      ...base.classification,
      handoff: {
        ...base.classification.handoff,
        domainKey: "DEVELOPMENT",
        routingDisposition: "DELEGATE_TO_AIDOS",
      },
    },
    policy: {
      ...base.policy,
      canonicalDomain: "DEVELOPMENT",
      policyConstraints: {
        allowedRoutingModes: ["PRIMARY_EXECUTION"],
        routingDisposition: "DELEGATE_TO_AIDOS",
      },
    },
    candidates: null,
    aidos: {
      projectRef: "aidos:project",
      availabilityRevision: "availability-r1",
      registrationRevision: "registration-r1",
      eligibilityRevision: "eligibility-r1",
      checkedAt: now,
      freshUntil: future,
      evidenceRefs: [
        "evidence:aidos:availability",
        "evidence:aidos:registration",
        "evidence:aidos:eligibility",
      ],
      delegationInput: aidosDelegationInput,
      snapshotBinding: aidosSnapshotBinding,
      ...aidosOverrides,
    },
    developmentDelegationState: "READY_TO_DELEGATE",
  });
}

class MemoryDecisionRepository implements RoutingDecisionRepository {
  readonly appends: AppendRoutingDecisionInput[] = [];
  readonly audits: Parameters<
    RoutingDecisionRepository["recordRoutingAudit"]
  >[0][] = [];
  private readonly records = new Map<string, RoutingAppendResult>();
  private readonly heads = new Map<string, RoutingDecisionRecord>();
  private readonly overrideAuthorities = new Map<
    string,
    AppendRoutingDecisionInput["auditMetadata"]
  >();

  replaceDecisionForTest(result: RoutingAppendResult) {
    this.records.set(result.decision.routingDecisionId, result);
    this.heads.set(
      `${result.decision.requestId}:${result.decision.routingPurpose}`,
      result.decision,
    );
  }

  async findOrCreateStreamIdentity(input: {
    requestId: string;
    purpose: RoutingPurpose;
    streamId: string;
    actorType: "HUMAN" | "AGENT" | "SYSTEM";
    actorId: string;
  }) {
    return input.streamId;
  }
  async findCurrent(requestId: string, purpose: RoutingPurpose) {
    return this.heads.get(`${requestId}:${purpose}`);
  }
  async findById(requestId: string, decisionId: string) {
    const decision = this.records.get(decisionId)?.decision;
    return decision?.requestId === requestId ? decision : undefined;
  }
  async listHistory(requestId: string, purpose: RoutingPurpose) {
    return [...this.records.values()]
      .map(({ decision }) => decision)
      .filter(
        (decision) =>
          decision.requestId === requestId &&
          decision.routingPurpose === purpose,
      );
  }
  async listCandidates(decisionId: string) {
    return this.records.get(decisionId)?.candidates ?? [];
  }
  async findHumanOverrideAudit(auditRef: string) {
    const metadata = this.overrideAuthorities.get(auditRef);
    return metadata
      ? { actorId: metadata.authority.actorId, metadata }
      : undefined;
  }
  successfulOverrideAuditCount() {
    return this.overrideAuthorities.size;
  }
  async recordRoutingAudit(
    input: Parameters<RoutingDecisionRepository["recordRoutingAudit"]>[0],
  ) {
    this.audits.push(input);
  }
  async appendDecision(input: AppendRoutingDecisionInput) {
    this.appends.push(input);
    const existing = [...this.records.values()].find(
      ({ decision }) =>
        decision.requestId === input.requestId &&
        decision.idempotencyKey === input.idempotencyKey,
    );
    if (existing) {
      if (
        existing.decision.routingDecisionId !== input.routingDecisionId ||
        existing.decision.canonicalIntentFingerprint !==
          input.canonicalIntentFingerprint
      )
        throw new RoutingContractError("ROUTING_IDEMPOTENCY_CONFLICT");
      return { ...existing, outcome: "REUSED" as const };
    }
    const headKey = `${input.requestId}:${input.routingPurpose}`;
    const head = this.heads.get(headKey);
    if ((head?.routingDecisionId ?? null) !== input.expectedPredecessorId)
      throw new RoutingContractError("ROUTING_STREAM_CONFLICT");
    const auditRef = `${input.routingDecisionId}:audit`;
    const decision: RoutingDecisionRecord = {
      ...input,
      routingVersion: (head?.routingVersion ?? 0) + 1,
      supersedesRoutingDecisionId: input.expectedPredecessorId,
      auditRef,
      createdAt: now,
    };
    const candidates: RoutingCandidateSnapshot[] = input.candidates.map(
      (candidate) => ({
        ...candidate,
        routingDecisionId: input.routingDecisionId,
        createdAt: now,
      }),
    );
    const result: RoutingAppendResult = {
      outcome: "CREATED",
      decision,
      candidates,
      auditRef: decision.auditRef,
    };
    this.records.set(input.routingDecisionId, result);
    this.heads.set(headKey, decision);
    if (input.auditMetadata)
      this.overrideAuthorities.set(auditRef, input.auditMetadata);
    return result;
  }
}

function service(
  contexts: readonly (ValidatedRoutingContext | Error)[] = [
    validated(),
    validated(),
  ],
) {
  let calls = 0;
  const validator = {
    validate: async () => {
      const value = contexts[Math.min(calls++, contexts.length - 1)]!;
      if (value instanceof Error) throw value;
      return value;
    },
  } satisfies Pick<RoutingValidationService, "validate">;
  const repository = new MemoryDecisionRepository();
  return {
    decisionService: new RoutingDecisionService({
      validation: validator,
      repository,
      now: () => new Date(now),
    }),
    repository,
    validationCalls: () => calls,
  };
}

test("creates one deterministic stream decision with safe candidate lineage", async () => {
  const { decisionService, repository, validationCalls } = service();
  const result = await decisionService.createDecision(createInput());
  assert.equal(
    result.decision.canonicalIntentFingerprint,
    "sha256:89c78ee5d10059e5ae19ae01d33b5c47e75d6fef276d6190681cf63797e1a10d",
  );

  assert.equal(result.outcome, "CREATED");
  assert.equal(result.decision.routingVersion, 1);
  assert.equal(result.decision.supersedesRoutingDecisionId, null);
  assert.equal(result.decision.decisionState, "SELECTED");
  assert.equal(result.decision.selectedModelHostBindingRef, id("23"));
  assert.equal(
    result.decision.registryFreshnessPolicyRef,
    "registry-freshness-policy",
  );
  assert.equal(result.decision.registryFreshnessPolicyVersion, "1");
  assert.equal(result.decision.registryFreshnessMaxAgeMs, 3_600_000);
  assert.equal(
    result.decision.registrySnapshotHash,
    sha("d").slice("sha256:".length),
  );
  assert.equal(validationCalls(), 2);
  assert.equal(repository.appends.length, 1);
  assert.equal(result.candidates.length, 1);
  assert.equal(
    result.candidates[0]!.registryFreshnessPolicyRef,
    result.decision.registryFreshnessPolicyRef,
  );
  assert.equal(
    result.candidates[0]!.registrySnapshotHash,
    result.decision.registrySnapshotHash,
  );
  assert.deepEqual(result.candidates[0]!.capabilityEvidence, {
    provider: { id: id("20"), version: 2 },
    model: { id: id("21"), version: 3 },
    runtimeAdapter: { id: id("22"), version: 4 },
    modelHostBinding: { id: id("23"), version: 5 },
    capabilityBindings: [
      {
        id: id("25"),
        version: 6,
        capabilityId: id("10"),
        capabilityVersion: 7,
        requirement: "REQUIRED",
      },
    ],
    roleCompatibility: { id: id("24"), version: 8 },
    specialization: null,
    routingPolicy: {
      id: id("14"),
      versionId: id("13"),
      version: 1,
      contentFingerprint: sha("c"),
    },
    classification: {
      identity: id("2"),
      revision: "classification-r1",
      version: 1,
      currentnessProof: sha("b"),
    },
    matchedRequiredCapabilityRefs: [id("10")],
    matchedPreferredCapabilityRefs: [],
    roleClass: "EXECUTOR",
    routingMode: "PRIMARY_EXECUTION",
  });
  assert.doesNotMatch(JSON.stringify(result), /secret|credential|sdk/iu);
});

test("derives stream identity from request and purpose and keeps purposes independent", async () => {
  const first = service();
  const primary = await first.decisionService.createDecision(createInput());
  const repeatedPurpose = service();
  const same = await repeatedPurpose.decisionService.createDecision(
    createInput({ idempotencyKey: "another" }),
  );
  assert.equal(
    primary.decision.routingDecisionStreamId,
    same.decision.routingDecisionStreamId,
  );

  const reviewContext = validated({
    policy: {
      ...validated().policy,
      routingPurpose: "INDEPENDENT_REVIEW",
      roleClass: "REVIEWER",
      policyConstraints: {
        allowedRoutingModes: ["INDEPENDENT_REVIEW"],
        candidateTieBreakers: ["MODEL_ID"],
      },
    },
  });
  const review = service([reviewContext, reviewContext]);
  const reviewDecision = await review.decisionService.createDecision(
    createInput({
      roleClass: "REVIEWER",
      routingPurpose: "INDEPENDENT_REVIEW",
      routingMode: "INDEPENDENT_REVIEW",
    }),
  );
  assert.notEqual(
    primary.decision.routingDecisionStreamId,
    reviewDecision.decision.routingDecisionStreamId,
  );
});

test("appends stream-local successor and rejects stale expected head", async () => {
  const state = validated();
  const { decisionService } = service([
    state,
    state,
    state,
    state,
    state,
    state,
  ]);
  const first = await decisionService.createDecision(createInput());
  const second = await decisionService.createDecision(
    createInput({
      expectedCurrentDecisionId: first.decision.routingDecisionId,
      idempotencyKey: "route-twice",
    }),
  );
  assert.equal(second.decision.routingVersion, 2);
  assert.equal(
    second.decision.supersedesRoutingDecisionId,
    first.decision.routingDecisionId,
  );
  assert.equal(first.decision.routingVersion, 1);
  await assert.rejects(
    decisionService.createDecision(
      createInput({ idempotencyKey: "stale-head" }),
    ),
    (error: unknown) =>
      error instanceof RoutingContractError &&
      error.code === "ROUTING_STREAM_CONFLICT",
  );
});

test("fails closed when final pre-write authority validation changes or fails", async () => {
  const changedPolicy = validated({
    policy: { ...validated().policy, contentFingerprint: sha("z") },
  });
  const changed = service([validated(), changedPolicy]);
  await assert.rejects(
    changed.decisionService.createDecision(createInput()),
    (error: unknown) =>
      error instanceof RoutingContractError &&
      error.code === "ROUTING_DECISION_STALE",
  );
  assert.equal(changed.repository.appends.length, 0);

  const stale = service([
    validated(),
    new RoutingContractError("CLASSIFICATION_STALE"),
  ]);
  await assert.rejects(
    stale.decisionService.createDecision(createInput()),
    (error: unknown) =>
      error instanceof RoutingContractError &&
      error.code === "CLASSIFICATION_STALE",
  );
  assert.equal(stale.repository.appends.length, 0);
});

test("rejects changed Registry, Approval, and AIDOS authority before append", async () => {
  const base = validated();
  const changedRegistry = validated({
    candidates: {
      ...base.candidates!,
      registrySnapshotRevision: "registry-r2",
    },
  });
  const registry = service([base, changedRegistry]);
  await assert.rejects(
    registry.decisionService.createDecision(createInput()),
    /ROUTING_DECISION_STALE/,
  );
  assert.equal(registry.repository.appends.length, 0);

  const approval = {
    current: true,
    authority: "HUMAN_APPROVAL_AUTHORITY",
    identity: id("40"),
    revision: "approval-r1",
    checkedAt: now,
    freshUntil: future,
    freshnessModel: "AUTHORITY_EXPIRY" as const,
    state: "APPROVED" as const,
    approvalRef: id("40"),
    authorityRuleRef: "HUMAN_APPROVAL_AUTHORITY",
    approvalPolicyRef: "approval-policy",
    approvalPolicyVersion: "1",
    targetType: "ROUTING_DECISION",
    targetId: id("1"),
    targetVersion: "1",
    targetHash: sha("e"),
    approvalStatus: "APPROVED",
    approvalValidity: "VALID",
    issuedAt: now,
    expiresAt: future,
    reasonCode: "APPROVED",
  };
  const approved = validated({ approval });
  const changedApproval = validated({
    approval: { ...approval, revision: "approval-r2" },
  });
  const approvalService = service([approved, changedApproval]);
  await assert.rejects(
    approvalService.decisionService.createDecision(createInput()),
    /ROUTING_DECISION_STALE/,
  );
  assert.equal(approvalService.repository.appends.length, 0);

  const developmentBase = validated({
    classification: {
      ...base.classification,
      handoff: {
        ...base.classification.handoff,
        domainKey: "DEVELOPMENT",
        routingDisposition: "DELEGATE_TO_AIDOS",
      },
    },
    policy: {
      ...base.policy,
      canonicalDomain: "DEVELOPMENT",
      policyConstraints: { routingDisposition: "DELEGATE_TO_AIDOS" },
    },
    candidates: null,
    aidos: {
      projectRef: "aidos:project",
      availabilityRevision: "availability-r1",
      registrationRevision: "registration-r1",
      eligibilityRevision: "eligibility-r1",
      checkedAt: now,
      freshUntil: future,
      evidenceRefs: ["evidence:aidos"],
      delegationInput: aidosDelegationInput,
      snapshotBinding: aidosSnapshotBinding,
    },
    developmentDelegationState: "READY_TO_DELEGATE",
  });
  const changedAidos = validated({
    ...developmentBase,
    aidos: {
      ...developmentBase.aidos!,
      eligibilityRevision: "eligibility-r2",
    },
  });
  const aidos = service([developmentBase, changedAidos]);
  await assert.rejects(
    aidos.decisionService.createDecision(
      createInput({ aidosTargetRef: "aidos:project" }),
    ),
    /ROUTING_DECISION_STALE/,
  );
  assert.equal(aidos.repository.appends.length, 0);
});

test("rejects nondeterministic candidate rank before persistence", async () => {
  const base = validated();
  const duplicate = {
    ...base.candidates!.eligibleCandidates[0]!,
    modelHostBindingId: id("30"),
  };
  const ambiguous = validated({
    candidates: {
      ...base.candidates!,
      eligibleCandidates: [base.candidates!.eligibleCandidates[0]!, duplicate],
    },
  });
  const { decisionService, repository } = service([ambiguous, ambiguous]);
  await assert.rejects(
    decisionService.createDecision(createInput()),
    (error: unknown) =>
      error instanceof RoutingContractError &&
      error.code === "NONDETERMINISTIC_CANDIDATE_TIE",
  );
  assert.equal(repository.appends.length, 0);
});

test("restricts fallback to the primary stream", async () => {
  const { decisionService } = service();
  await assert.rejects(
    decisionService.createFallback(createInput({ routingMode: "FALLBACK" })),
    (error: unknown) =>
      error instanceof RoutingContractError &&
      error.code === "FALLBACK_NOT_AUTHORIZED",
  );
  const primary = await decisionService.createDecision(createInput());
  const result = await decisionService.createFallback(
    createInput({
      routingMode: "FALLBACK",
      expectedCurrentDecisionId: primary.decision.routingDecisionId,
      idempotencyKey: "fallback-once",
    }),
  );
  assert.equal(result.decision.routingPurpose, "PRIMARY_EXECUTION");
  assert.equal(result.decision.routingMode, "FALLBACK");
  const replay = await decisionService.createFallback(
    createInput({
      routingMode: "FALLBACK",
      expectedCurrentDecisionId: primary.decision.routingDecisionId,
      idempotencyKey: "fallback-once",
    }),
  );
  assert.equal(replay.outcome, "REUSED");

  await decisionService.createDecision(
    createInput({
      expectedCurrentDecisionId: result.decision.routingDecisionId,
      idempotencyKey: "route-after-fallback",
    }),
  );
  const supersededReplay = await decisionService.createFallback(
    createInput({
      routingMode: "FALLBACK",
      expectedCurrentDecisionId: primary.decision.routingDecisionId,
      idempotencyKey: "fallback-once",
    }),
  );
  assert.equal(supersededReplay.outcome, "REUSED");
  assert.equal(
    supersededReplay.decision.routingDecisionId,
    result.decision.routingDecisionId,
  );

  await assert.rejects(
    decisionService.createFallback(
      createInput({
        routingPurpose: "INDEPENDENT_REVIEW",
        routingMode: "FALLBACK",
        roleClass: "REVIEWER",
      }),
    ),
    (error: unknown) =>
      error instanceof RoutingContractError &&
      error.code === "FALLBACK_NOT_AUTHORIZED",
  );
});

test("persists Development delegation without MAOS-native selection", async () => {
  const base = validated();
  const development = validated({
    classification: {
      ...base.classification,
      handoff: {
        ...base.classification.handoff,
        domainKey: "DEVELOPMENT",
        routingDisposition: "DELEGATE_TO_AIDOS",
      },
    },
    policy: {
      ...base.policy,
      canonicalDomain: "DEVELOPMENT",
      policyConstraints: {
        allowedRoutingModes: ["PRIMARY_EXECUTION"],
        routingDisposition: "DELEGATE_TO_AIDOS",
      },
    },
    candidates: null,
    aidos: {
      projectRef: "aidos:project",
      availabilityRevision: "availability-r1",
      registrationRevision: "registration-r1",
      eligibilityRevision: "eligibility-r1",
      checkedAt: now,
      freshUntil: future,
      evidenceRefs: ["evidence:aidos"],
      delegationInput: aidosDelegationInput,
      snapshotBinding: aidosSnapshotBinding,
    },
    developmentDelegationState: "READY_TO_DELEGATE",
  });
  const { decisionService } = service([development, development]);
  const result = await decisionService.createDecision(
    createInput({ aidosTargetRef: "aidos:project" }),
  );
  assert.equal(result.decision.canonicalDomain, "DEVELOPMENT");
  assert.equal(result.decision.developmentDelegationState, "READY_TO_DELEGATE");
  assert.equal(result.decision.selectedProviderRef, null);
  assert.equal(result.decision.selectedModelRef, null);
  assert.equal(result.decision.selectedRuntimeAdapterRef, null);
  assert.equal(result.decision.selectedModelHostBindingRef, null);
  assert.equal(result.candidates.length, 0);
});

test("persists bounded unavailable and onboarding Development outcomes", async () => {
  const base = validated();
  const development = {
    classification: {
      ...base.classification,
      handoff: {
        ...base.classification.handoff,
        domainKey: "DEVELOPMENT" as const,
        routingDisposition: "DELEGATE_TO_AIDOS" as const,
      },
    },
    policy: {
      ...base.policy,
      canonicalDomain: "DEVELOPMENT" as const,
      policyConstraints: { routingDisposition: "DELEGATE_TO_AIDOS" },
    },
    candidates: null,
  };
  for (const [state, registrationRevision] of [
    ["AIDOS_UNAVAILABLE", null],
    ["WAITING_AIDOS_ONBOARDING", "registration-r1"],
  ] as const) {
    const context = validated({
      ...development,
      aidos: {
        projectRef: "aidos:project",
        availabilityRevision: "availability-r1",
        registrationRevision,
        eligibilityRevision: null,
        checkedAt: now,
        freshUntil: future,
        evidenceRefs: ["evidence:aidos"],
        delegationInput: aidosDelegationInput,
        snapshotBinding: null,
      },
      developmentDelegationState: state,
    });
    const { decisionService } = service([context, context]);
    const result = await decisionService.createDecision(
      createInput({
        aidosTargetRef: "aidos:project",
        idempotencyKey: `development-${state}`,
      }),
    );
    assert.equal(result.decision.developmentDelegationState, state);
    assert.equal(result.decision.decisionState, "WAITING");
    assert.deepEqual(result.decision.decisionReasonCodes, [state]);
    assert.equal(result.decision.selectedProviderRef, null);
  }
});

test("exact replay is reused and material replay conflict is rejected", async () => {
  const state = validated();
  const { decisionService } = service([
    state,
    state,
    state,
    state,
    state,
    state,
  ]);
  const first = await decisionService.createDecision(createInput());
  const replay = await decisionService.createDecision(createInput());
  assert.equal(first.outcome, "CREATED");
  assert.equal(replay.outcome, "REUSED");

  await assert.rejects(
    decisionService.createDecision(
      createInput({ evidenceRefs: ["evidence:changed"] }),
    ),
    (error: unknown) =>
      error instanceof RoutingContractError &&
      error.code === "ROUTING_IDEMPOTENCY_CONFLICT",
  );
  await assert.rejects(
    decisionService.createDecision(createInput({ traceId: "trace-changed" })),
    (error: unknown) =>
      error instanceof RoutingContractError &&
      error.code === "ROUTING_IDEMPOTENCY_CONFLICT",
  );
});

test("AIDOS exact replay includes authority Evidence identity", async () => {
  const original = developmentValidated();
  const changedEvidence = developmentValidated({
    evidenceRefs: [
      "evidence:aidos:availability:changed",
      "evidence:aidos:registration",
      "evidence:aidos:eligibility",
    ],
  });
  const { decisionService } = service([
    original,
    original,
    original,
    original,
    changedEvidence,
    changedEvidence,
  ]);
  const input = createInput({ aidosTargetRef: "aidos:project" });
  await decisionService.createDecision(input);
  assert.equal((await decisionService.createDecision(input)).outcome, "REUSED");
  await assert.rejects(
    decisionService.createDecision(input),
    (error: unknown) =>
      error instanceof RoutingContractError &&
      error.code === "ROUTING_IDEMPOTENCY_CONFLICT",
  );
});

test("AIDOS projection-only replay drift fails closed", async (t) => {
  const cases: ReadonlyArray<
    readonly [string, Partial<NonNullable<ValidatedRoutingContext["aidos"]>>]
  > = [
    ["availability", { availabilityRevision: "availability-r2" }],
    ["registration", { registrationRevision: "registration-r2" }],
    ["eligibility", { eligibilityRevision: "eligibility-r2" }],
  ];
  for (const [name, drift] of cases) {
    await t.test(name, async () => {
      const original = developmentValidated();
      const changed = developmentValidated(drift);
      const { decisionService } = service([
        original,
        original,
        changed,
        changed,
      ]);
      const input = createInput({ aidosTargetRef: "aidos:project" });
      await decisionService.createDecision(input);
      await assert.rejects(
        decisionService.createDecision(input),
        (error: unknown) =>
          error instanceof RoutingContractError &&
          error.code === "ROUTING_IDEMPOTENCY_CONFLICT",
      );
    });
  }
});

test("superseded AIDOS replay requires the exact historical Evidence identity", async () => {
  const original = developmentValidated();
  const changedEvidence = developmentValidated({
    evidenceRefs: [
      "evidence:aidos:availability",
      "evidence:aidos:registration:changed",
      "evidence:aidos:eligibility",
    ],
  });
  const { decisionService } = service([
    original,
    original,
    original,
    original,
    original,
    original,
    changedEvidence,
    changedEvidence,
  ]);
  const historicalInput = createInput({ aidosTargetRef: "aidos:project" });
  const historical = await decisionService.createDecision(historicalInput);
  await decisionService.createDecision(
    createInput({
      aidosTargetRef: "aidos:project",
      expectedCurrentDecisionId: historical.decision.routingDecisionId,
      idempotencyKey: "development-successor",
    }),
  );
  assert.equal(
    (await decisionService.createDecision(historicalInput)).outcome,
    "REUSED",
  );
  await assert.rejects(
    decisionService.createDecision(historicalInput),
    (error: unknown) =>
      error instanceof RoutingContractError &&
      error.code === "ROUTING_IDEMPOTENCY_CONFLICT",
  );
});

test("revalidates the current stream head and emits only non-executing output", async () => {
  const state = validated();
  const { decisionService } = service([state, state, state]);
  const created = await decisionService.createDecision(createInput());
  const output = await decisionService.validateForHandoff(
    created.decision.routingDecisionId,
    validationInput(),
  );
  assert.equal(output.contractVersion, "PHASE15D_ROUTING_OUTPUT_V1");
  assert.equal(output.routingDecisionId, created.decision.routingDecisionId);
  assert.equal(output.stalenessState, "CURRENT");
  for (const prohibited of [
    "runId",
    "jobId",
    "toolCallId",
    "runnerId",
    "credential",
    "executionToken",
  ])
    assert.equal(prohibited in output, false);
});

test("appends an authorized Human override as an immutable stream-local successor", async () => {
  const base = validated();
  const secondCandidate = {
    ...base.candidates!.eligibleCandidates[0]!,
    deterministicRank: 2,
    providerId: id("30"),
    modelId: id("31"),
    runtimeAdapterId: id("32"),
    modelHostBindingId: id("33"),
    lineage: {
      ...base.candidates!.eligibleCandidates[0]!.lineage,
      provider: { id: id("30"), version: 1 },
      model: { id: id("31"), version: 1 },
      runtimeAdapter: { id: id("32"), version: 1 },
      modelHostBinding: { id: id("33"), version: 1 },
    },
  };
  const state = validated({
    candidates: {
      ...base.candidates!,
      registryResourceRefs: [
        ...base.candidates!.registryResourceRefs,
        id("30"),
        id("31"),
        id("32"),
        id("33"),
      ],
      eligibleCandidates: [
        base.candidates!.eligibleCandidates[0]!,
        secondCandidate,
      ],
    },
  });
  const { decisionService, repository } = service([state, state, state, state]);
  const original = await decisionService.createDecision(createInput());
  const originalSnapshot = structuredClone(original.decision);
  const result = await decisionService.applyHumanOverride(
    overrideInput(original.decision.routingDecisionId, {
      overrideIntent: {
        type: "SELECT_ELIGIBLE_CANDIDATE",
        modelHostBindingId: id("33"),
      },
    }),
  );

  assert.equal(result.outcome, "CREATED");
  assert.equal(result.decision.routingVersion, 2);
  assert.equal(
    result.decision.supersedesRoutingDecisionId,
    original.decision.routingDecisionId,
  );
  assert.equal(
    result.decision.routingDecisionStreamId,
    original.decision.routingDecisionStreamId,
  );
  assert.deepEqual(original.decision, originalSnapshot);
  assert.equal(
    repository.appends.at(-1)?.auditAction,
    "ROUTING.OVERRIDE_CREATED",
  );
  assert.deepEqual(repository.appends.at(-1)?.auditMetadata, {
    authority: overrideAuthority({
      targetDecisionId: original.decision.routingDecisionId,
    }),
    overrideTargetDecisionId: original.decision.routingDecisionId,
    overrideIntentType: "SELECT_ELIGIBLE_CANDIDATE",
    reasonCode: "HUMAN_SELECTED_ELIGIBLE_RESOURCE",
    reasonText: "Human selected the current policy-eligible candidate.",
  });
  assert.deepEqual(result.decision.decisionReasonCodes, [
    "HUMAN_OVERRIDE",
    "HUMAN_SELECTED_ELIGIBLE_RESOURCE",
  ]);
  assert.equal(original.decision.selectedModelHostBindingRef, id("23"));
  assert.equal(result.decision.selectedModelHostBindingRef, id("33"));
  assert.equal(result.candidates.length, 2);
  for (const prohibited of ["runId", "jobId", "toolCallId", "executionToken"])
    assert.equal(prohibited in result, false);
});

test("rejects unauthorized, stale, revoked, and wrongly scoped Human authority", async (t) => {
  const cases: ReadonlyArray<
    readonly [
      string,
      Partial<HumanRoutingOverrideRequest>,
      Partial<HumanRoutingOverrideAuthority> | null,
      string,
    ]
  > = [
    [
      "non-Human actor",
      { actorType: "SYSTEM" as "HUMAN" },
      null,
      "HUMAN_APPROVAL_INVALID",
    ],
    [
      "wrong permission",
      {},
      { permission: "ROUTING_DECISION:READ" as "ROUTING_DECISION:OVERRIDE" },
      "HUMAN_APPROVAL_INVALID",
    ],
    ["revoked", {}, { state: "REVOKED" }, "HUMAN_APPROVAL_REVOKED"],
    ["expired", {}, { state: "EXPIRED" }, "HUMAN_APPROVAL_STALE"],
    ["stale", {}, { state: "STALE" }, "HUMAN_APPROVAL_STALE"],
    [
      "wrong organization",
      {},
      { organizationId: id("99") },
      "HUMAN_APPROVAL_INVALID",
    ],
    ["wrong project", {}, { projectId: id("99") }, "HUMAN_APPROVAL_INVALID"],
    ["wrong scope", {}, { scopeRef: "other" }, "HUMAN_APPROVAL_INVALID"],
    [
      "wrong target",
      {},
      { targetRequestId: id("99") },
      "HUMAN_APPROVAL_INVALID",
    ],
  ];
  for (const [name, changes, authorityChanges, code] of cases) {
    await t.test(name, async () => {
      const state = validated();
      const { decisionService } = service([state, state, state, state]);
      const original = await decisionService.createDecision(createInput());
      const base = overrideInput(original.decision.routingDecisionId);
      await assert.rejects(
        decisionService.applyHumanOverride({
          ...base,
          ...changes,
          authority: authorityChanges
            ? { ...base.authority, ...authorityChanges }
            : base.authority,
        }),
        (error: unknown) =>
          error instanceof RoutingContractError && error.code === code,
      );
    });
  }
});

test("requires exact current head, bounded reason, and non-empty Evidence", async () => {
  const state = validated();
  const { decisionService } = service([
    state,
    state,
    state,
    state,
    state,
    state,
  ]);
  const original = await decisionService.createDecision(createInput());
  const base = overrideInput(original.decision.routingDecisionId);
  await assert.rejects(
    decisionService.applyHumanOverride({ ...base, reasonText: "" }),
    /HUMAN_OVERRIDE_POLICY_VIOLATION/,
  );
  await assert.rejects(
    decisionService.applyHumanOverride({ ...base, evidenceRefs: [] }),
    /HUMAN_OVERRIDE_POLICY_VIOLATION/,
  );
  await assert.rejects(
    decisionService.applyHumanOverride({
      ...base,
      overrideIntent: { type: "UNKNOWN" } as never,
    }),
    /HUMAN_OVERRIDE_POLICY_VIOLATION/,
  );
  await assert.rejects(
    decisionService.applyHumanOverride({
      ...base,
      authority: { ...base.authority, credential: "must-not-persist" } as never,
    }),
    /HUMAN_APPROVAL_INVALID/,
  );
  await assert.rejects(
    decisionService.applyHumanOverride({
      ...base,
      overrideIntent: {
        ...base.overrideIntent,
        arbitraryMutation: true,
      } as never,
    }),
    /HUMAN_OVERRIDE_POLICY_VIOLATION/,
  );
  await assert.rejects(
    decisionService.applyHumanOverride({
      ...base,
      expectedCurrentDecisionId: id("98"),
      authority: overrideAuthority({ targetDecisionId: id("98") }),
      idempotencyKey: "stale-override",
    }),
    /ROUTING_DECISION_STALE/,
  );
});

test("persists bounded rejection Audit and redacts secret-shaped reason text", async () => {
  const state = validated();
  const { decisionService, repository } = service(
    Array.from({ length: 8 }, () => state),
  );
  const original = await decisionService.createDecision(createInput());
  await assert.rejects(
    decisionService.applyHumanOverride({
      ...overrideInput(original.decision.routingDecisionId),
      overrideIntent: { type: "UNKNOWN" } as never,
    }),
    /HUMAN_OVERRIDE_POLICY_VIOLATION/,
  );
  assert.equal(repository.audits[0]?.action, "ROUTING.OVERRIDE_REJECTED");
  assert.deepEqual(repository.audits[0]?.metadata, {
    routingPurpose: "PRIMARY_EXECUTION",
    reasonCode: "HUMAN_OVERRIDE_POLICY_VIOLATION",
  });

  const accepted = await decisionService.applyHumanOverride({
    ...overrideInput(original.decision.routingDecisionId, {
      idempotencyKey: "redacted-reason",
    }),
    reasonText:
      'Investigate token=HOSTILE_SECRET_VALUE and {"password":"JSON SECRET WITH SPACES"} before selecting.',
  });
  const auditMetadata = repository.appends.find(
    ({ routingDecisionId }) =>
      routingDecisionId === accepted.decision.routingDecisionId,
  )?.auditMetadata;
  assert.equal(
    auditMetadata?.reasonText,
    "Investigate token=[REDACTED] and {password=[REDACTED]} before selecting.",
  );
  assert.doesNotMatch(
    JSON.stringify(auditMetadata),
    /HOSTILE_SECRET_VALUE|JSON SECRET WITH SPACES/u,
  );
});

test("revalidates persisted Human override authority before handoff", async () => {
  const state = validated();
  const { decisionService } = service(Array.from({ length: 12 }, () => state));
  const original = await decisionService.createDecision(createInput());
  const override = overrideInput(original.decision.routingDecisionId);
  const created = await decisionService.applyHumanOverride(override);

  await assert.rejects(
    decisionService.validateForHandoff(
      created.decision.routingDecisionId,
      validationInput(),
    ),
    /HUMAN_APPROVAL_STALE/,
  );
  const output = await decisionService.validateForHandoff(
    created.decision.routingDecisionId,
    validationInput(),
    override.authority,
  );
  assert.equal(output.routingDecisionId, created.decision.routingDecisionId);
  await assert.rejects(
    decisionService.validateForHandoff(
      created.decision.routingDecisionId,
      validationInput(),
      { ...override.authority, state: "REVOKED" },
    ),
    /HUMAN_APPROVAL_REVOKED/,
  );
  await assert.rejects(
    decisionService.validateForHandoff(
      created.decision.routingDecisionId,
      validationInput(),
      { ...override.authority, authorityId: "authority:changed" },
    ),
    /HUMAN_APPROVAL_INVALID/,
  );
});

test("rejects cross-purpose targets and preserves the other purpose head", async () => {
  const state = validated();
  const reviewState = validated({
    policy: {
      ...state.policy,
      routingPurpose: "INDEPENDENT_REVIEW",
      roleClass: "REVIEWER",
    },
  });
  const { decisionService, repository } = service([
    state,
    state,
    reviewState,
    reviewState,
    state,
    state,
  ]);
  const primary = await decisionService.createDecision(createInput());
  const review = await decisionService.createDecision(
    createInput({
      routingPurpose: "INDEPENDENT_REVIEW",
      routingMode: "INDEPENDENT_REVIEW",
      roleClass: "REVIEWER",
      idempotencyKey: "review-stream",
    }),
  );
  await assert.rejects(
    decisionService.applyHumanOverride({
      ...overrideInput(primary.decision.routingDecisionId),
      expectedCurrentDecisionId: review.decision.routingDecisionId,
      authority: overrideAuthority({
        targetDecisionId: review.decision.routingDecisionId,
      }),
      idempotencyKey: "cross-purpose-override",
    }),
    /ROUTING_CROSS_STREAM_SUPERSESSION_DENIED/,
  );
  assert.equal(
    (await repository.findCurrent(id("1"), "INDEPENDENT_REVIEW"))
      ?.routingDecisionId,
    review.decision.routingDecisionId,
  );
});

test("revalidates Classification, policy, Registry, Approval, and AIDOS before override", async (t) => {
  const initial = validated();
  const commonCases: ReadonlyArray<readonly [string, ValidatedRoutingContext]> =
    [
      [
        "Classification",
        validated({
          classification: {
            ...initial.classification,
            currentnessProof: sha("z"),
          },
        }),
      ],
      [
        "policy",
        validated({
          policy: { ...initial.policy, contentFingerprint: sha("z") },
        }),
      ],
      [
        "Registry",
        validated({
          candidates: {
            ...initial.candidates!,
            registrySnapshotRevision: "registry-r2",
          },
        }),
      ],
    ];
  for (const [name, changed] of commonCases) {
    await t.test(name, async () => {
      const { decisionService, repository } = service([
        initial,
        initial,
        initial,
        changed,
      ]);
      const original = await decisionService.createDecision(createInput());
      await assert.rejects(
        decisionService.applyHumanOverride(
          overrideInput(original.decision.routingDecisionId),
        ),
        /ROUTING_DECISION_STALE/,
      );
      assert.equal(repository.appends.length, 1);
    });
  }

  const approval = {
    current: true,
    authority: "HUMAN_APPROVAL_AUTHORITY",
    identity: id("40"),
    revision: "approval-r1",
    checkedAt: now,
    freshUntil: future,
    freshnessModel: "AUTHORITY_EXPIRY" as const,
    state: "APPROVED" as const,
    approvalRef: id("40"),
    authorityRuleRef: "HUMAN_APPROVAL_AUTHORITY",
    approvalPolicyRef: "approval-policy",
    approvalPolicyVersion: "1",
    targetType: "ROUTING_DECISION",
    targetId: id("1"),
    targetVersion: "1",
    targetHash: sha("e"),
    approvalStatus: "APPROVED",
    approvalValidity: "VALID",
    issuedAt: now,
    expiresAt: future,
    reasonCode: "APPROVED",
  };
  await t.test("Approval", async () => {
    const approved = validated({ approval });
    const changedApproval = validated({
      approval: { ...approval, revision: "approval-r2" },
    });
    const { decisionService, repository } = service([
      approved,
      approved,
      approved,
      changedApproval,
    ]);
    const original = await decisionService.createDecision(createInput());
    await assert.rejects(
      decisionService.applyHumanOverride(
        overrideInput(original.decision.routingDecisionId),
      ),
      /ROUTING_DECISION_STALE/,
    );
    assert.equal(repository.appends.length, 1);
  });

  await t.test("AIDOS", async () => {
    const development = developmentValidated();
    const changedAidos = developmentValidated({
      eligibilityRevision: "eligibility-r2",
    });
    const { decisionService, repository } = service([
      development,
      development,
      development,
      changedAidos,
    ]);
    const original = await decisionService.createDecision(
      createInput({ aidosTargetRef: "aidos:project" }),
    );
    await assert.rejects(
      decisionService.applyHumanOverride(
        overrideInput(original.decision.routingDecisionId, {
          aidosTargetRef: "aidos:project",
          overrideIntent: { type: "REEVALUATE_CANONICAL" },
          reasonCode: "HUMAN_REQUESTED_REEVALUATION",
        }),
      ),
      /ROUTING_DECISION_STALE/,
    );
    assert.equal(repository.appends.length, 1);
  });
});

test("allows only current policy-eligible candidates and never native Development selection", async () => {
  const state = validated();
  const { decisionService } = service([state, state, state, state]);
  const original = await decisionService.createDecision(createInput());
  await assert.rejects(
    decisionService.applyHumanOverride({
      ...overrideInput(original.decision.routingDecisionId),
      overrideIntent: {
        type: "SELECT_ELIGIBLE_CANDIDATE",
        modelHostBindingId: id("99"),
      },
    }),
    /HUMAN_OVERRIDE_POLICY_VIOLATION/,
  );

  const development = developmentValidated();
  const developmentService = service([
    development,
    development,
    development,
    development,
  ]).decisionService;
  const developmentOriginal = await developmentService.createDecision(
    createInput({
      aidosTargetRef: "aidos:project",
      idempotencyKey: "development-base",
    }),
  );
  await assert.rejects(
    developmentService.applyHumanOverride({
      ...overrideInput(developmentOriginal.decision.routingDecisionId, {
        aidosTargetRef: "aidos:project",
        idempotencyKey: "development-override",
      }),
      overrideIntent: {
        type: "SELECT_ELIGIBLE_CANDIDATE",
        modelHostBindingId: id("23"),
      },
    }),
    /DEVELOPMENT_NATIVE_EXECUTION_PROHIBITED/,
  );
});

test("Human override exact replay is reused and all material replay drift conflicts", async (t) => {
  const state = validated();
  const contexts = Array.from({ length: 20 }, () => state);
  const { decisionService, repository } = service(contexts);
  const original = await decisionService.createDecision(createInput());
  const input = overrideInput(original.decision.routingDecisionId);
  const first = await decisionService.applyHumanOverride(input);
  assert.equal(
    (await decisionService.applyHumanOverride(input)).outcome,
    "REUSED",
  );
  const conflicts: ReadonlyArray<
    readonly [string, Partial<HumanRoutingOverrideRequest>]
  > = [
    ["reason", { reasonText: "Different reason." }],
    ["Evidence", { evidenceRefs: ["evidence:different"] }],
    [
      "authority",
      {
        authority: overrideAuthority({
          authorityId: "authority:different",
          targetDecisionId: original.decision.routingDecisionId,
        }),
      },
    ],
  ];
  for (const [name, change] of conflicts) {
    await t.test(name, async () => {
      await assert.rejects(
        decisionService.applyHumanOverride({ ...input, ...change }),
        /ROUTING_IDEMPOTENCY_CONFLICT/,
      );
    });
  }
  assert.equal(
    repository.appends.filter(
      (value) => value.routingDecisionId === first.decision.routingDecisionId,
    ).length,
    5,
  );
  assert.equal(
    (await repository.listHistory(id("1"), "PRIMARY_EXECUTION")).length,
    2,
  );
});

test("Human override replay fails closed on AIDOS Evidence and projection-only drift", async (t) => {
  const canonical = developmentValidated();
  const driftCases: ReadonlyArray<readonly [string, ValidatedRoutingContext]> =
    [
      [
        "Evidence",
        developmentValidated({
          evidenceRefs: [
            "evidence:aidos:availability",
            "evidence:aidos:registration:changed",
            "evidence:aidos:eligibility",
          ],
        }),
      ],
      [
        "registration",
        developmentValidated({ registrationRevision: "registration-r2" }),
      ],
      [
        "availability",
        developmentValidated({ availabilityRevision: "availability-r2" }),
      ],
      [
        "eligibility",
        developmentValidated({ eligibilityRevision: "eligibility-r2" }),
      ],
    ];
  const contexts = [
    ...Array.from({ length: 6 }, () => canonical),
    ...driftCases.flatMap(([, context]) => [context, context]),
  ];
  const { decisionService, repository } = service(contexts);
  const original = await decisionService.createDecision(
    createInput({
      aidosTargetRef: "aidos:project",
      idempotencyKey: "development-override-base",
    }),
  );
  const input = overrideInput(original.decision.routingDecisionId, {
    aidosTargetRef: "aidos:project",
    idempotencyKey: "development-override-replay",
    overrideIntent: { type: "REEVALUATE_CANONICAL" },
    reasonCode: "HUMAN_REQUESTED_REEVALUATION",
  });
  const created = await decisionService.applyHumanOverride(input);
  const replay = await decisionService.applyHumanOverride(input);
  assert.equal(replay.outcome, "REUSED");
  assert.equal(
    replay.decision.routingDecisionId,
    created.decision.routingDecisionId,
  );
  assert.equal(replay.auditRef, created.auditRef);

  const historyBefore = await repository.listHistory(
    input.requestId,
    input.routingPurpose,
  );
  const snapshotCountBefore = (
    await Promise.all(
      historyBefore.map(({ routingDecisionId }) =>
        repository.listCandidates(routingDecisionId),
      ),
    )
  ).flat().length;
  assert.equal(historyBefore.length, 2);
  assert.equal(snapshotCountBefore, 0);
  assert.equal(repository.successfulOverrideAuditCount(), 1);

  for (const [name] of driftCases) {
    await t.test(name, async () => {
      await assert.rejects(
        decisionService.applyHumanOverride(input),
        (error: unknown) =>
          error instanceof RoutingContractError &&
          error.code === "ROUTING_IDEMPOTENCY_CONFLICT",
      );
      const history = await repository.listHistory(
        input.requestId,
        input.routingPurpose,
      );
      const snapshotCount = (
        await Promise.all(
          history.map(({ routingDecisionId }) =>
            repository.listCandidates(routingDecisionId),
          ),
        )
      ).flat().length;
      assert.equal(history.length, 2);
      assert.equal(snapshotCount, snapshotCountBefore);
      assert.equal(
        (await repository.findCurrent(input.requestId, input.routingPurpose))
          ?.routingDecisionId,
        created.decision.routingDecisionId,
      );
      assert.equal(repository.successfulOverrideAuditCount(), 1);
    });
  }
  assert.equal(repository.audits.length, driftCases.length);
  assert.equal(
    repository.audits.every(
      ({ action, metadata }) =>
        action === "ROUTING.OVERRIDE_REJECTED" &&
        metadata.reasonCode === "ROUTING_IDEMPOTENCY_CONFLICT",
    ),
    true,
  );
  for (const prohibited of ["runId", "jobId", "toolCallId", "executionToken"])
    assert.equal(prohibited in created, false);
});

test("concurrent distinct Human overrides against one head produce one successor", async () => {
  const state = validated();
  const { decisionService, repository } = service(
    Array.from({ length: 8 }, () => state),
  );
  const original = await decisionService.createDecision(createInput());
  const [left, right] = await Promise.allSettled([
    decisionService.applyHumanOverride(
      overrideInput(original.decision.routingDecisionId),
    ),
    decisionService.applyHumanOverride(
      overrideInput(original.decision.routingDecisionId, {
        idempotencyKey: "override-two",
        reasonText: "A distinct current Human override.",
      }),
    ),
  ]);
  assert.equal(
    [left, right].filter(({ status }) => status === "fulfilled").length,
    1,
  );
  assert.equal(
    [left, right].filter(({ status }) => status === "rejected").length,
    1,
  );
  assert.equal(
    (await repository.listHistory(id("1"), "PRIMARY_EXECUTION")).length,
    2,
  );
});

function withRegistryFreshness(
  source: ValidatedRoutingContext,
  changes: Partial<
    NonNullable<
      NonNullable<
        ValidatedRoutingContext["candidates"]
      >["registryFreshnessAuthority"]
    >
  >,
): ValidatedRoutingContext {
  const candidates = source.candidates!;
  const authority = { ...candidates.registryFreshnessAuthority!, ...changes };
  return {
    ...source,
    candidates: {
      ...candidates,
      registrySnapshotRef: authority.snapshotRef,
      registrySnapshotRevision: authority.snapshotRevision,
      registryObservedAt: authority.registryObservedAt,
      registryFreshUntil: authority.freshUntil,
      registryFreshnessAuthority: authority,
    },
  };
}

test("Registry freshness-only replay drift fails closed for decisions and overrides", async (t) => {
  const base = validated();
  const driftCases = [
    ["policyRef", { policyRef: "registry-freshness-policy-v2" }],
    ["policyVersion", { policyVersion: "2" }],
    [
      "maxAgeMs",
      { maxAgeMs: 7_200_000, freshUntil: "2026-10-09T02:00:00.000Z" },
    ],
    [
      "registryObservedAt",
      {
        registryObservedAt: "2026-10-08T23:30:00.000Z",
        freshUntil: "2026-10-09T00:30:00.000Z",
      },
    ],
    ["freshUntil", { freshUntil: "2026-10-09T02:00:00.000Z" }],
    ["snapshotRevision", { snapshotRevision: "registry-r2" }],
    [
      "snapshotHash",
      {
        snapshotRef: `registry-snapshot:${sha("e")}`,
        snapshotHash: sha("e").slice("sha256:".length),
      },
    ],
  ] as const;
  for (const [name, changes] of driftCases) {
    await t.test(name, async () => {
      const changed = withRegistryFreshness(base, changes);
      const decisionHarness = service([base, base, changed, changed]);
      await decisionHarness.decisionService.createDecision(createInput());
      await assert.rejects(
        decisionHarness.decisionService.createDecision(createInput()),
        /ROUTING_IDEMPOTENCY_CONFLICT/,
      );

      const overrideHarness = service([
        base,
        base,
        base,
        base,
        changed,
        changed,
      ]);
      const predecessor =
        await overrideHarness.decisionService.createDecision(createInput());
      const override = overrideInput(predecessor.decision.routingDecisionId);
      await overrideHarness.decisionService.applyHumanOverride(override);
      await assert.rejects(
        overrideHarness.decisionService.applyHumanOverride(override),
        /ROUTING_IDEMPOTENCY_CONFLICT/,
      );
    });
  }
});

test("Human override persists current Registry freshness instead of predecessor history", async () => {
  const base = validated();
  const current = withRegistryFreshness(base, {
    policyVersion: "2",
    snapshotRevision: "registry-r2",
  });
  const harness = service([base, base, current, current]);
  const predecessor =
    await harness.decisionService.createDecision(createInput());
  const override = await harness.decisionService.applyHumanOverride(
    overrideInput(predecessor.decision.routingDecisionId),
  );
  assert.equal(predecessor.decision.registryFreshnessPolicyVersion, "1");
  assert.equal(override.decision.registryFreshnessPolicyVersion, "2");
  assert.equal(override.decision.registrySnapshotRevision, "registry-r2");
  assert.equal(
    override.candidates[0]!.registryFreshnessPolicyVersion,
    override.decision.registryFreshnessPolicyVersion,
  );
});

test("handoff requires exact current Registry freshness lineage and rejects policy-less history", async (t) => {
  const base = validated();
  const cases = [
    withRegistryFreshness(base, { policyRef: "registry-policy-changed" }),
    withRegistryFreshness(base, { policyVersion: "2" }),
    withRegistryFreshness(base, {
      maxAgeMs: 7_200_000,
      freshUntil: "2026-10-09T02:00:00.000Z",
    }),
    withRegistryFreshness(base, { snapshotRevision: "registry-r2" }),
    withRegistryFreshness(base, {
      snapshotRef: `registry-snapshot:${sha("e")}`,
      snapshotHash: sha("e").slice("sha256:".length),
    }),
  ];
  for (const [index, changed] of cases.entries()) {
    await t.test(`drift-${index + 1}`, async () => {
      const harness = service([base, base, changed]);
      const created =
        await harness.decisionService.createDecision(createInput());
      await assert.rejects(
        harness.decisionService.validateForHandoff(
          created.decision.routingDecisionId,
          validationInput(),
        ),
        /REGISTRY_STALE/,
      );
    });
  }

  const policylessHarness = service([base, base, base]);
  const policyless =
    await policylessHarness.decisionService.createDecision(createInput());
  policylessHarness.repository.replaceDecisionForTest({
    ...policyless,
    decision: {
      ...policyless.decision,
      registryFreshnessPolicyRef: null,
      registryFreshnessPolicyVersion: null,
      registryFreshnessMaxAgeMs: null,
      registrySnapshotHash: null,
    },
  });
  await assert.rejects(
    policylessHarness.decisionService.validateForHandoff(
      policyless.decision.routingDecisionId,
      validationInput(),
    ),
    /REGISTRY_STALE/,
  );

  for (const code of ["REGISTRY_STALE", "REGISTRY_CONFLICT"] as const) {
    const staleHarness = service([base, base, new RoutingContractError(code)]);
    const created =
      await staleHarness.decisionService.createDecision(createInput());
    await assert.rejects(
      staleHarness.decisionService.validateForHandoff(
        created.decision.routingDecisionId,
        validationInput(),
      ),
      new RegExp(code),
    );
  }
});
