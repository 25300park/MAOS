import assert from "node:assert/strict";
import test from "node:test";

import {
  RoutingContractError,
  RoutingDecisionService,
  type AppendRoutingDecisionInput,
  type CreatePersistedRoutingDecisionInput,
  type CreateRoutingDecisionInput,
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
      ...aidosOverrides,
    },
    developmentDelegationState: "READY_TO_DELEGATE",
  });
}

class MemoryDecisionRepository implements RoutingDecisionRepository {
  readonly appends: AppendRoutingDecisionInput[] = [];
  private readonly records = new Map<string, RoutingAppendResult>();
  private readonly heads = new Map<string, RoutingDecisionRecord>();

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
    const decision: RoutingDecisionRecord = {
      ...input,
      routingVersion: (head?.routingVersion ?? 0) + 1,
      supersedesRoutingDecisionId: input.expectedPredecessorId,
      auditRef: id("90"),
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

  assert.equal(result.outcome, "CREATED");
  assert.equal(result.decision.routingVersion, 1);
  assert.equal(result.decision.supersedesRoutingDecisionId, null);
  assert.equal(result.decision.decisionState, "SELECTED");
  assert.equal(result.decision.selectedModelHostBindingRef, id("23"));
  assert.equal(validationCalls(), 2);
  assert.equal(repository.appends.length, 1);
  assert.equal(result.candidates.length, 1);
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
    readonly [
      string,
      Partial<NonNullable<ValidatedRoutingContext["aidos"]>>,
    ]
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
