import { createHash } from "node:crypto";

import {
  canonicalAuditValue,
  deterministicAuditUuid,
} from "./audit-record-repository.js";
import type { ResolvedRoutingCandidate } from "./candidate-resolution-service.js";
import {
  AIDOS_AUTHORITY_SOURCE,
  AIDOS_AVAILABILITY_SOURCE,
  AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
  AIDOS_PROJECT_REGISTRATION_SOURCE,
} from "./routing-authority-read-ports.js";
import {
  RoutingContractError,
  toRoutingDecisionOutputV1,
  type AppendRoutingDecisionInput,
  type RoutingAppendResult,
  type RoutingCandidateSnapshotInput,
  type RoutingDecisionOutputV1,
  type RoutingDecisionRepository,
  type RoutingFreshnessReference,
  type RoutingHumanOverrideAuthorityBinding,
  type RoutingMode,
} from "./routing-contracts.js";
import type {
  CreateRoutingDecisionInput,
  RoutingValidationService,
  ValidatedRoutingContext,
} from "./routing-validation-service.js";
import type { GovernedActorType } from "./work-request-contracts.js";

export const HUMAN_ROUTING_OVERRIDE_REASON_CODES = [
  "HUMAN_SELECTED_ELIGIBLE_RESOURCE",
  "HUMAN_REQUESTED_REEVALUATION",
] as const;
export type HumanRoutingOverrideReasonCode =
  (typeof HUMAN_ROUTING_OVERRIDE_REASON_CODES)[number];

export type HumanRoutingOverrideAuthority =
  RoutingHumanOverrideAuthorityBinding;

export type HumanRoutingOverrideIntent =
  | Readonly<{
      type: "SELECT_ELIGIBLE_CANDIDATE";
      modelHostBindingId: string;
    }>
  | Readonly<{ type: "REEVALUATE_CANONICAL" }>;

export interface HumanRoutingOverrideRequest extends Omit<
  CreatePersistedRoutingDecisionInput,
  "actorType" | "expectedCurrentDecisionId"
> {
  readonly actorType: "HUMAN";
  readonly expectedCurrentDecisionId: string;
  readonly authority: HumanRoutingOverrideAuthority;
  readonly overrideIntent: HumanRoutingOverrideIntent;
  readonly reasonCode: HumanRoutingOverrideReasonCode;
  readonly reasonText: string;
}

export interface CreatePersistedRoutingDecisionInput extends CreateRoutingDecisionInput {
  readonly expectedCurrentDecisionId: string | null;
  readonly idempotencyKey: string;
  readonly actorType: GovernedActorType;
  readonly actorId: string;
  readonly evidenceRefs: readonly string[];
  readonly contextRefs: readonly string[];
  readonly artifactRefs: readonly string[];
  readonly priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  readonly correlationId: string;
  readonly causationRefs: readonly string[];
  readonly traceId: string;
  readonly spanId: string;
}

export interface RoutingDecisionServiceDependencies {
  readonly validation: Pick<RoutingValidationService, "validate">;
  readonly repository: RoutingDecisionRepository;
  readonly now?: () => Date;
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

function fingerprint(value: unknown) {
  return `sha256:${createHash("sha256")
    .update(canonicalAuditValue(value))
    .digest("hex")}`;
}

function authorityIdentity(context: ValidatedRoutingContext) {
  return {
    request: {
      id: context.request.id,
      lifecycleState: context.request.lifecycleState,
      organizationId: context.request.organizationId,
      projectId: context.request.projectId,
      companyScopeRef: context.request.companyScopeRef,
      teamScopeRef: context.request.teamScopeRef,
      projectScopeRef: context.request.projectScopeRef,
      systemScopeRef: context.request.systemScopeRef,
      environment: context.request.environment,
    },
    classification: {
      identity: context.classification.identity,
      revision: context.classification.revision,
      version: context.classification.classificationVersion,
      currentnessProof: context.classification.currentnessProof,
      policyResolutionRef: context.classification.policyResolutionRef,
      policyResolutionVersion: context.classification.policyResolutionVersion,
    },
    policy: {
      id: context.policy.routingPolicyId,
      versionId: context.policy.routingPolicyVersionId,
      version: context.policy.version,
      lifecycle: context.policy.lifecycleIntent,
      fingerprint: context.policy.contentFingerprint,
    },
    specialization: context.specialization,
    approval: context.approval
      ? {
          identity: context.approval.identity,
          revision: context.approval.revision,
          state: context.approval.state,
          targetType: context.approval.targetType,
          targetId: context.approval.targetId,
          targetVersion: context.approval.targetVersion,
          targetHash: context.approval.targetHash,
        }
      : null,
    registry: context.candidates
      ? {
          snapshotRef: context.candidates.registrySnapshotRef,
          revision: context.candidates.registrySnapshotRevision,
          resourceRefs: [...context.candidates.registryResourceRefs].sort(),
          eligibleCandidates: context.candidates.eligibleCandidates,
          excludedCandidates: context.candidates.excludedCandidates,
        }
      : null,
    aidos: context.aidos
      ? {
          authoritySource: AIDOS_AUTHORITY_SOURCE,
          projectRef: context.aidos.projectRef,
          availability: {
            source: AIDOS_AVAILABILITY_SOURCE,
            revision: context.aidos.availabilityRevision,
          },
          registration: context.aidos.registrationRevision
            ? {
                source: AIDOS_PROJECT_REGISTRATION_SOURCE,
                revision: context.aidos.registrationRevision,
              }
            : null,
          eligibility: context.aidos.eligibilityRevision
            ? {
                source: AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
                revision: context.aidos.eligibilityRevision,
              }
            : null,
          evidenceRefs: [...context.aidos.evidenceRefs],
        }
      : null,
    developmentDelegationState: context.developmentDelegationState,
  };
}

function requireEquivalentAuthority(
  initial: ValidatedRoutingContext,
  current: ValidatedRoutingContext,
) {
  if (
    fingerprint(authorityIdentity(initial)) !==
    fingerprint(authorityIdentity(current))
  )
    throw new RoutingContractError("ROUTING_DECISION_STALE");
}

function requireDeterministicCandidates(context: ValidatedRoutingContext) {
  if (context.classification.handoff.domainKey === "DEVELOPMENT") {
    if (
      context.candidates !== null ||
      !context.aidos ||
      ![
        "READY_TO_DELEGATE",
        "AIDOS_UNAVAILABLE",
        "WAITING_AIDOS_ONBOARDING",
      ].includes(context.developmentDelegationState)
    )
      throw new RoutingContractError("DEVELOPMENT_NATIVE_EXECUTION_PROHIBITED");
    return;
  }
  const candidates = context.candidates?.eligibleCandidates ?? [];
  if (candidates.length === 0)
    throw new RoutingContractError("NO_ELIGIBLE_CANDIDATE");
  const ranks = new Set<number>();
  for (const candidate of candidates) {
    if (
      !Number.isInteger(candidate.deterministicRank) ||
      candidate.deterministicRank < 1 ||
      ranks.has(candidate.deterministicRank)
    )
      throw new RoutingContractError("NONDETERMINISTIC_CANDIDATE_TIE");
    ranks.add(candidate.deterministicRank);
  }
  const sortedRanks = [...ranks].sort((left, right) => left - right);
  if (sortedRanks.some((rank, index) => rank !== index + 1))
    throw new RoutingContractError("NONDETERMINISTIC_CANDIDATE_TIE");
}

function candidateSnapshot(
  decisionId: string,
  context: ValidatedRoutingContext,
  candidate: ResolvedRoutingCandidate,
  routingMode: RoutingMode,
): RoutingCandidateSnapshotInput {
  const registry = context.candidates!;
  return Object.freeze({
    candidateSnapshotId: deterministicAuditUuid(
      `PHASE15D.ROUTING_CANDIDATE:${decisionId}:${candidate.modelHostBindingId}`,
    ),
    deterministicRank: candidate.deterministicRank,
    providerId: candidate.providerId,
    modelId: candidate.modelId,
    runtimeAdapterId: candidate.runtimeAdapterId,
    modelHostBindingId: candidate.modelHostBindingId,
    eligibilityState: "ELIGIBLE",
    reasonCodes: Object.freeze(["ELIGIBLE"]),
    capabilityEvidence: Object.freeze({
      ...candidate.lineage,
      matchedRequiredCapabilityRefs: Object.freeze([
        ...candidate.matchedRequiredCapabilityRefs,
      ]),
      matchedPreferredCapabilityRefs: Object.freeze([
        ...candidate.matchedPreferredCapabilityRefs,
      ]),
      roleClass: context.policy.roleClass,
      routingMode,
    }),
    rankingEvidence: Object.freeze({ ...candidate.rankingEvidence }),
    registrySnapshotRef: registry.registrySnapshotRef!,
    registrySnapshotRevision: registry.registrySnapshotRevision!,
    observedAt: registry.registryObservedAt!,
    freshUntil: registry.registryFreshUntil!,
  });
}

function minimumIso(values: readonly (string | null | undefined)[]) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  if (timestamps.length === 0)
    throw new RoutingContractError("ROUTING_POLICY_STALE");
  return new Date(Math.min(...timestamps)).toISOString();
}

function requiredCapabilities(context: ValidatedRoutingContext) {
  return unique([
    ...context.classification.handoff.requiredCapabilityRefs,
    ...context.policy.requiredCapabilityRefs,
    ...(context.specialization?.requiredCapabilityRefs ?? []),
  ]);
}

function preferredCapabilities(context: ValidatedRoutingContext) {
  const required = new Set(requiredCapabilities(context));
  return unique([
    ...context.classification.handoff.preferredCapabilityRefs,
    ...context.policy.preferredCapabilityRefs,
    ...(context.specialization?.preferredCapabilityRefs ?? []),
  ]).filter((value) => !required.has(value));
}

function routingDecisionIdentity(
  input: Pick<
    CreatePersistedRoutingDecisionInput,
    "requestId" | "idempotencyKey"
  >,
) {
  return deterministicAuditUuid(
    `PHASE15D.ROUTING_DECISION:${input.requestId}:${input.idempotencyKey}`,
  );
}

interface AppendDecisionOptions {
  readonly selectedModelHostBindingId?: string;
  readonly decisionReasonCodes?: readonly string[];
  readonly override?: Readonly<{
    authority: HumanRoutingOverrideAuthority;
    intent: HumanRoutingOverrideIntent;
    reasonCode: HumanRoutingOverrideReasonCode;
    reasonText: string;
  }>;
}

function createAppendInput(
  input: CreatePersistedRoutingDecisionInput,
  context: ValidatedRoutingContext,
  now: string,
  options: AppendDecisionOptions = {},
): AppendRoutingDecisionInput {
  requireDeterministicCandidates(context);
  const streamId = deterministicAuditUuid(
    `PHASE15D.ROUTING_STREAM:${input.requestId}:${input.routingPurpose}`,
  );
  const decisionId = routingDecisionIdentity(input);
  const development =
    context.classification.handoff.domainKey === "DEVELOPMENT";
  const candidates = development
    ? []
    : [...context.candidates!.eligibleCandidates]
        .sort((left, right) => left.deterministicRank - right.deterministicRank)
        .map((candidate) =>
          candidateSnapshot(decisionId, context, candidate, input.routingMode),
        );
  const selected = development
    ? null
    : options.selectedModelHostBindingId
      ? context.candidates!.eligibleCandidates.find(
          ({ modelHostBindingId }) =>
            modelHostBindingId === options.selectedModelHostBindingId,
        )
      : context.candidates!.eligibleCandidates.find(
          ({ deterministicRank }) => deterministicRank === 1,
        );
  if (!development && !selected)
    throw new RoutingContractError("HUMAN_OVERRIDE_POLICY_VIOLATION");
  const registryObservedAt = development
    ? context.aidos!.checkedAt
    : context.candidates!.registryObservedAt!;
  const registryFreshUntil = development
    ? context.aidos!.freshUntil
    : context.candidates!.registryFreshUntil!;
  const registrySnapshotRef = development
    ? `aidos-authority:${context.aidos!.projectRef}`
    : context.candidates!.registrySnapshotRef!;
  const registrySnapshotRevision = development
    ? [
        context.aidos!.availabilityRevision,
        context.aidos!.registrationRevision ?? "NOT_OBSERVED",
        context.aidos!.eligibilityRevision ?? "NOT_OBSERVED",
      ].join(":")
    : context.candidates!.registrySnapshotRevision!;
  const approval = context.approval;
  const policyFreshUntil = minimumIso([
    context.policy.expiresAt,
    registryFreshUntil,
    approval?.freshUntil,
    context.aidos?.freshUntil,
  ]);
  const intent = {
    input: {
      requestId: input.requestId,
      expectedClassificationVersionId: input.expectedClassificationVersionId,
      context: input.context,
      scopeRef: input.scopeRef,
      roleClass: input.roleClass,
      routingPurpose: input.routingPurpose,
      routingMode: input.routingMode,
      specializationRef: input.specializationRef,
      approval: input.approval,
      aidosTargetRef: input.aidosTargetRef,
      expectedCurrentDecisionId: input.expectedCurrentDecisionId,
      actorType: input.actorType,
      actorId: input.actorId,
      evidenceRefs: input.evidenceRefs,
      contextRefs: input.contextRefs,
      artifactRefs: input.artifactRefs,
      priority: input.priority,
      correlationId: input.correlationId,
      causationRefs: input.causationRefs,
      traceId: input.traceId,
      spanId: input.spanId,
    },
    authority: authorityIdentity(context),
    candidates,
    ...(options.override ? { override: options.override } : {}),
  };
  return {
    routingDecisionId: decisionId,
    routingDecisionStreamId: streamId,
    requestId: input.requestId,
    routingPurpose: input.routingPurpose,
    expectedPredecessorId: input.expectedCurrentDecisionId,
    classificationVersionId: context.classification.identity,
    classificationVersion: context.classification.classificationVersion,
    classificationState: "VALIDATED",
    classificationCurrentnessState: "CURRENT",
    classificationCurrentnessProof: context.classification.currentnessProof,
    classificationPolicyResolutionRef:
      context.classification.policyResolutionRef,
    classificationPolicyResolutionVersion:
      context.classification.policyResolutionVersion,
    canonicalDomain: context.classification.handoff.domainKey,
    roleClass: input.roleClass,
    routingMode: input.routingMode,
    specializationVersionId:
      context.specialization?.specializationVersionId ?? null,
    routingPolicyVersionId: context.policy.routingPolicyVersionId,
    selectedProviderRef: selected?.providerId ?? null,
    selectedModelRef: selected?.modelId ?? null,
    selectedRuntimeAdapterRef: selected?.runtimeAdapterId ?? null,
    selectedModelHostBindingRef: selected?.modelHostBindingId ?? null,
    registrySnapshotRef,
    registrySnapshotRevision,
    registryObservedAt,
    registryFreshUntil,
    requiredCapabilities: requiredCapabilities(context),
    preferredCapabilities: preferredCapabilities(context),
    policyConstraints: context.policy.policyConstraints,
    contextRefs: unique([
      ...context.classification.handoff.contextRefs,
      ...input.contextRefs,
    ]),
    artifactRefs: unique([
      ...context.classification.handoff.artifactRefs,
      ...input.artifactRefs,
    ]),
    evidenceRefs: unique([
      ...input.evidenceRefs,
      ...(context.aidos?.evidenceRefs ?? []),
    ]),
    priority: input.priority,
    humanApprovalState: approval ? "APPROVED" : "NOT_REQUIRED",
    humanApprovalRef: approval?.approvalRef ?? null,
    humanApprovalTargetVersion: approval?.targetVersion ?? null,
    humanApprovalTargetHash: approval?.targetHash ?? null,
    humanApprovalAuthority: approval?.authority ?? null,
    humanApprovalCheckedAt: approval?.checkedAt ?? null,
    humanApprovalExpiresAt: approval?.expiresAt ?? null,
    developmentDelegationState: context.developmentDelegationState,
    aidosProjectRef: context.aidos?.projectRef ?? null,
    aidosRequiredCapabilities: development
      ? requiredCapabilities(context)
      : null,
    aidosAuthorityRevision: context.aidos
      ? [
          context.aidos.availabilityRevision,
          context.aidos.registrationRevision ?? "NOT_OBSERVED",
          context.aidos.eligibilityRevision ?? "NOT_OBSERVED",
        ].join(":")
      : null,
    aidosCheckedAt: context.aidos?.checkedAt ?? null,
    aidosFreshUntil: context.aidos?.freshUntil ?? null,
    decisionState:
      development && context.developmentDelegationState !== "READY_TO_DELEGATE"
        ? "WAITING"
        : "SELECTED",
    decisionReasonCodes:
      options.decisionReasonCodes ??
      (development
        ? [
            context.developmentDelegationState === "READY_TO_DELEGATE"
              ? "DELEGATE_TO_AIDOS"
              : context.developmentDelegationState,
          ]
        : ["SELECTED_BY_CANONICAL_POLICY"]),
    stalenessState: "CURRENT",
    classificationCheckedAt: context.classification.checkedAt,
    policyCheckedAt: now,
    policyFreshUntil,
    idempotencyKey: input.idempotencyKey,
    canonicalIntentFingerprint: fingerprint(intent),
    correlationId: input.correlationId,
    causationRefs: input.causationRefs,
    actorType: input.actorType,
    actorId: input.actorId,
    traceId: input.traceId,
    spanId: input.spanId,
    projectId: context.request.projectId,
    candidates,
    ...(options.override
      ? {
          auditAction: "ROUTING.OVERRIDE_CREATED" as const,
          auditMetadata: {
            authority: boundedHumanOverrideAuthority(
              options.override.authority,
            ),
            overrideTargetDecisionId:
              options.override.authority.targetDecisionId,
            overrideIntentType: options.override.intent.type,
            reasonCode: options.override.reasonCode,
            reasonText: safeAuditReasonText(options.override.reasonText),
          },
        }
      : {}),
  };
}

function requireNonEmptyBounded(value: string, maximum: number) {
  return (
    value.trim().length > 0 &&
    value.length <= maximum &&
    !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)
  );
}

function safeAuditReasonText(value: string) {
  return value
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/giu,
      "[REDACTED]",
    )
    .replace(
      /\b(?:postgres(?:ql)?|https?):\/\/[^\s/@:]+:[^\s/@]+@[^\s]+/giu,
      "[REDACTED]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [REDACTED]")
    .replace(
      /["']?\b(password|secret|token|api[_-]?key|credential)\b["']?\s*[:=]\s*(["'])(?:\\.|(?!\2)[\s\S])*\2/giu,
      "$1=[REDACTED]",
    )
    .replace(
      /["']?\b(password|secret|token|api[_-]?key|credential)\b["']?\s*[:=]\s*(?!\[REDACTED\])[^\s,;]+/giu,
      "$1=[REDACTED]",
    );
}

function hasExactKeys(value: object, expected: readonly string[]) {
  return (
    Object.keys(value).sort().join("\u0000") ===
    [...expected].sort().join("\u0000")
  );
}

function boundedHumanOverrideAuthority(
  authority: HumanRoutingOverrideAuthority,
): HumanRoutingOverrideAuthority {
  return {
    authorityId: authority.authorityId,
    permission: authority.permission,
    state: authority.state,
    actorId: authority.actorId,
    organizationId: authority.organizationId,
    projectId: authority.projectId,
    scopeRef: authority.scopeRef,
    environment: authority.environment,
    targetRequestId: authority.targetRequestId,
    targetRoutingPurpose: authority.targetRoutingPurpose,
    targetDecisionId: authority.targetDecisionId,
    checkedAt: authority.checkedAt,
    freshUntil: authority.freshUntil,
  };
}

function requireHumanOverrideAuthority(
  input: HumanRoutingOverrideRequest,
  now: Date,
) {
  const authority = input.authority;
  if (
    !hasExactKeys(authority, [
      "authorityId",
      "permission",
      "state",
      "actorId",
      "organizationId",
      "projectId",
      "scopeRef",
      "environment",
      "targetRequestId",
      "targetRoutingPurpose",
      "targetDecisionId",
      "checkedAt",
      "freshUntil",
    ]) ||
    input.actorType !== "HUMAN" ||
    authority.permission !== "ROUTING_DECISION:OVERRIDE" ||
    !requireNonEmptyBounded(authority.authorityId, 256) ||
    authority.actorId !== input.actorId ||
    authority.organizationId !== input.context.organizationId ||
    authority.projectId !== input.context.projectId ||
    authority.scopeRef !== input.scopeRef ||
    authority.environment !== input.context.environment ||
    authority.targetRequestId !== input.requestId ||
    authority.targetRoutingPurpose !== input.routingPurpose ||
    authority.targetDecisionId !== input.expectedCurrentDecisionId
  )
    throw new RoutingContractError("HUMAN_APPROVAL_INVALID");
  if (authority.state === "REVOKED")
    throw new RoutingContractError("HUMAN_APPROVAL_REVOKED");
  const checkedAt = Date.parse(authority.checkedAt);
  const freshUntil = Date.parse(authority.freshUntil);
  if (
    authority.state === "EXPIRED" ||
    authority.state === "STALE" ||
    !Number.isFinite(checkedAt) ||
    !Number.isFinite(freshUntil) ||
    checkedAt > now.getTime() ||
    freshUntil <= now.getTime()
  )
    throw new RoutingContractError("HUMAN_APPROVAL_STALE");
  if (authority.state !== "ACTIVE")
    throw new RoutingContractError("HUMAN_APPROVAL_INVALID");
}

function requireHumanOverrideIntent(input: HumanRoutingOverrideRequest) {
  if (
    !HUMAN_ROUTING_OVERRIDE_REASON_CODES.includes(input.reasonCode) ||
    !requireNonEmptyBounded(input.reasonText, 500) ||
    input.evidenceRefs.length === 0 ||
    input.evidenceRefs.some((value) => !requireNonEmptyBounded(value, 512))
  )
    throw new RoutingContractError("HUMAN_OVERRIDE_POLICY_VIOLATION");
  if (
    (input.overrideIntent.type !== "SELECT_ELIGIBLE_CANDIDATE" &&
      input.overrideIntent.type !== "REEVALUATE_CANONICAL") ||
    (input.overrideIntent.type === "SELECT_ELIGIBLE_CANDIDATE" &&
      !hasExactKeys(input.overrideIntent, ["type", "modelHostBindingId"])) ||
    (input.overrideIntent.type === "REEVALUATE_CANONICAL" &&
      !hasExactKeys(input.overrideIntent, ["type"])) ||
    (input.overrideIntent.type === "SELECT_ELIGIBLE_CANDIDATE" &&
      (input.reasonCode !== "HUMAN_SELECTED_ELIGIBLE_RESOURCE" ||
        !requireNonEmptyBounded(
          input.overrideIntent.modelHostBindingId,
          256,
        ))) ||
    (input.overrideIntent.type === "REEVALUATE_CANONICAL" &&
      input.reasonCode !== "HUMAN_REQUESTED_REEVALUATION")
  )
    throw new RoutingContractError("HUMAN_OVERRIDE_POLICY_VIOLATION");
}

function freshnessReferences(
  context: ValidatedRoutingContext,
  policyCheckedAt: string,
  policyFreshUntil: string,
): readonly RoutingFreshnessReference[] {
  const values: RoutingFreshnessReference[] = [
    {
      authority: "CLASSIFICATION",
      identity: context.classification.identity,
      revision: context.classification.revision,
      checkedAt: context.classification.checkedAt,
      freshnessModel: "REFERENCE_VERSION_CURRENTNESS",
    },
    {
      authority: "POLICY",
      identity: context.policy.routingPolicyVersionId,
      revision: context.policy.contentFingerprint,
      checkedAt: policyCheckedAt,
      freshUntil: policyFreshUntil,
      freshnessModel: "AUTHORITY_EXPIRY",
    },
  ];
  if (context.candidates) {
    values.push({
      authority: "REGISTRY",
      identity: context.candidates.registrySnapshotRef!,
      revision: context.candidates.registrySnapshotRevision!,
      checkedAt: context.candidates.registryObservedAt!,
      freshUntil: context.candidates.registryFreshUntil!,
      freshnessModel: "AUTHORITY_EXPIRY",
    });
  }
  if (context.approval) {
    values.push({
      authority: "APPROVAL",
      identity: context.approval.identity,
      revision: context.approval.revision,
      checkedAt: context.approval.checkedAt,
      freshUntil: context.approval.freshUntil,
      freshnessModel: "AUTHORITY_EXPIRY",
    });
  }
  if (context.aidos) {
    values.push({
      authority: "AIDOS",
      identity: context.aidos.projectRef,
      revision: [
        context.aidos.availabilityRevision,
        context.aidos.registrationRevision ?? "NOT_OBSERVED",
        context.aidos.eligibilityRevision ?? "NOT_OBSERVED",
      ].join(":"),
      checkedAt: context.aidos.checkedAt,
      freshUntil: context.aidos.freshUntil,
      freshnessModel: "AUTHORITY_EXPIRY",
    });
  }
  return Object.freeze(values);
}

export class RoutingDecisionService {
  private readonly now: () => Date;

  constructor(
    private readonly dependencies: RoutingDecisionServiceDependencies,
  ) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async createDecision(
    input: CreatePersistedRoutingDecisionInput,
  ): Promise<RoutingAppendResult> {
    const initial = await this.dependencies.validation.validate(input);
    const current = await this.dependencies.validation.validate(input);
    requireEquivalentAuthority(initial, current);
    return this.dependencies.repository.appendDecision(
      createAppendInput(input, current, this.now().toISOString()),
    );
  }

  async createFallback(
    input: CreatePersistedRoutingDecisionInput,
  ): Promise<RoutingAppendResult> {
    if (
      input.routingPurpose !== "PRIMARY_EXECUTION" ||
      input.routingMode !== "FALLBACK"
    )
      throw new RoutingContractError("FALLBACK_NOT_AUTHORIZED");
    if (!input.expectedCurrentDecisionId)
      throw new RoutingContractError("FALLBACK_NOT_AUTHORIZED");
    const current = await this.dependencies.repository.findCurrent(
      input.requestId,
      "PRIMARY_EXECUTION",
    );
    if (!current) throw new RoutingContractError("ROUTING_STREAM_CONFLICT");
    if (current.routingDecisionId !== input.expectedCurrentDecisionId) {
      const replay = await this.dependencies.repository.findById(
        input.requestId,
        routingDecisionIdentity(input),
      );
      if (!replay || replay.idempotencyKey !== input.idempotencyKey)
        throw new RoutingContractError("ROUTING_STREAM_CONFLICT");
    }
    return this.createDecision(input);
  }

  async applyHumanOverride(
    input: HumanRoutingOverrideRequest,
  ): Promise<RoutingAppendResult> {
    try {
      requireHumanOverrideAuthority(input, this.now());
      requireHumanOverrideIntent(input);
      const predecessor = await this.dependencies.repository.findById(
        input.requestId,
        input.expectedCurrentDecisionId,
      );
      if (!predecessor)
        throw new RoutingContractError("ROUTING_DECISION_STALE");
      if (
        predecessor.routingPurpose !== input.routingPurpose ||
        predecessor.routingDecisionStreamId !==
          deterministicAuditUuid(
            `PHASE15D.ROUTING_STREAM:${input.requestId}:${input.routingPurpose}`,
          )
      )
        throw new RoutingContractError(
          "ROUTING_CROSS_STREAM_SUPERSESSION_DENIED",
        );
      const head = await this.dependencies.repository.findCurrent(
        input.requestId,
        input.routingPurpose,
      );
      const replay = await this.dependencies.repository.findById(
        input.requestId,
        routingDecisionIdentity(input),
      );
      if (
        head?.routingDecisionId !== input.expectedCurrentDecisionId &&
        !replay
      )
        throw new RoutingContractError("ROUTING_DECISION_STALE");
      const initial = await this.dependencies.validation.validate(input);
      const current = await this.dependencies.validation.validate(input);
      requireEquivalentAuthority(initial, current);
      requireHumanOverrideAuthority(input, this.now());
      if (
        current.classification.handoff.domainKey === "DEVELOPMENT" &&
        input.overrideIntent.type === "SELECT_ELIGIBLE_CANDIDATE"
      )
        throw new RoutingContractError(
          "DEVELOPMENT_NATIVE_EXECUTION_PROHIBITED",
        );
      return await this.dependencies.repository.appendDecision(
        createAppendInput(input, current, this.now().toISOString(), {
          ...(input.overrideIntent.type === "SELECT_ELIGIBLE_CANDIDATE"
            ? {
                selectedModelHostBindingId:
                  input.overrideIntent.modelHostBindingId,
              }
            : {}),
          decisionReasonCodes: ["HUMAN_OVERRIDE", input.reasonCode],
          override: {
            authority: input.authority,
            intent: input.overrideIntent,
            reasonCode: input.reasonCode,
            reasonText: input.reasonText,
          },
        }),
      );
    } catch (error) {
      if (error instanceof RoutingContractError) {
        const stale = [
          "ROUTING_DECISION_STALE",
          "ROUTING_STREAM_CONFLICT",
          "CLASSIFICATION_STALE",
          "ROUTING_POLICY_STALE",
          "REGISTRY_STALE",
          "HUMAN_APPROVAL_STALE",
          "AIDOS_AUTHORITY_STALE",
        ].includes(error.code);
        await this.dependencies.repository
          .recordRoutingAudit({
            action: stale
              ? "ROUTING.DECISION_STALE"
              : "ROUTING.OVERRIDE_REJECTED",
            actorId: input.actorId,
            actorType: input.actorType,
            requestId: input.requestId,
            projectId: input.context.projectId,
            targetDecisionId: input.expectedCurrentDecisionId,
            result: "DENIED",
            evidenceRefs: input.evidenceRefs,
            correlationId: input.correlationId,
            traceId: input.traceId,
            spanId: input.spanId,
            idempotencyKey: `${input.idempotencyKey}:${error.code}`,
            metadata: {
              routingPurpose: input.routingPurpose,
              reasonCode: error.code,
            },
          })
          .catch(() => undefined);
      }
      throw error;
    }
  }

  async validateForHandoff(
    decisionId: string,
    expectedContext: CreateRoutingDecisionInput,
    currentHumanOverrideAuthority?: HumanRoutingOverrideAuthority,
  ): Promise<RoutingDecisionOutputV1> {
    const current =
      await this.dependencies.validation.validate(expectedContext);
    const decision = await this.dependencies.repository.findById(
      expectedContext.requestId,
      decisionId,
    );
    if (!decision) throw new RoutingContractError("ROUTING_DECISION_STALE");
    const head = await this.dependencies.repository.findCurrent(
      expectedContext.requestId,
      expectedContext.routingPurpose,
    );
    if (!head || head.routingDecisionId !== decisionId)
      throw new RoutingContractError("ROUTING_DECISION_STALE");
    if (decision.decisionReasonCodes.includes("HUMAN_OVERRIDE")) {
      const binding = await this.dependencies.repository.findHumanOverrideAudit(
        decision.auditRef,
      );
      if (!binding || !currentHumanOverrideAuthority)
        throw new RoutingContractError("HUMAN_APPROVAL_STALE");
      const persisted = binding.metadata.authority;
      const immutableAuthorityIdentity = (
        authority: HumanRoutingOverrideAuthority,
      ) => ({
        authorityId: authority.authorityId,
        permission: authority.permission,
        actorId: authority.actorId,
        organizationId: authority.organizationId,
        projectId: authority.projectId,
        scopeRef: authority.scopeRef,
        environment: authority.environment,
        targetRequestId: authority.targetRequestId,
        targetRoutingPurpose: authority.targetRoutingPurpose,
        targetDecisionId: authority.targetDecisionId,
      });
      if (
        binding.actorId !== persisted.actorId ||
        fingerprint(immutableAuthorityIdentity(persisted)) !==
          fingerprint(
            immutableAuthorityIdentity(currentHumanOverrideAuthority),
          ) ||
        currentHumanOverrideAuthority.targetRequestId !==
          expectedContext.requestId ||
        currentHumanOverrideAuthority.targetRoutingPurpose !==
          expectedContext.routingPurpose
      )
        throw new RoutingContractError("HUMAN_APPROVAL_INVALID");
      requireHumanOverrideAuthority(
        {
          ...expectedContext,
          actorType: "HUMAN",
          actorId: currentHumanOverrideAuthority.actorId,
          expectedCurrentDecisionId:
            currentHumanOverrideAuthority.targetDecisionId,
          authority: currentHumanOverrideAuthority,
          overrideIntent: { type: "REEVALUATE_CANONICAL" },
          reasonCode: "HUMAN_REQUESTED_REEVALUATION",
          reasonText: "handoff revalidation",
          idempotencyKey: "handoff-revalidation",
          evidenceRefs: [decision.auditRef],
          contextRefs: [],
          artifactRefs: [],
          priority: decision.priority,
          correlationId: decision.correlationId,
          causationRefs: [],
          traceId: "handoff-revalidation",
          spanId: "handoff-revalidation",
        },
        this.now(),
      );
    }
    if (
      decision.classificationVersionId !== current.classification.identity ||
      decision.classificationCurrentnessProof !==
        current.classification.currentnessProof ||
      decision.classificationPolicyResolutionRef !==
        current.classification.policyResolutionRef ||
      decision.classificationPolicyResolutionVersion !==
        current.classification.policyResolutionVersion ||
      decision.routingPolicyVersionId !==
        current.policy.routingPolicyVersionId ||
      decision.canonicalDomain !== current.classification.handoff.domainKey ||
      decision.roleClass !== expectedContext.roleClass ||
      decision.routingPurpose !== expectedContext.routingPurpose ||
      decision.routingMode !== expectedContext.routingMode ||
      decision.specializationVersionId !==
        (current.specialization?.specializationVersionId ?? null) ||
      decision.stalenessState !== "CURRENT"
    )
      throw new RoutingContractError("ROUTING_DECISION_STALE");
    if (
      current.approval &&
      (decision.humanApprovalRef !== current.approval.approvalRef ||
        decision.humanApprovalTargetVersion !==
          current.approval.targetVersion ||
        decision.humanApprovalTargetHash !== current.approval.targetHash ||
        decision.humanApprovalAuthority !== current.approval.authority)
    )
      throw new RoutingContractError("HUMAN_APPROVAL_STALE");
    if (
      current.aidos &&
      (decision.aidosProjectRef !== current.aidos.projectRef ||
        decision.aidosAuthorityRevision !==
          [
            current.aidos.availabilityRevision,
            current.aidos.registrationRevision ?? "NOT_OBSERVED",
            current.aidos.eligibilityRevision ?? "NOT_OBSERVED",
          ].join(":"))
    )
      throw new RoutingContractError("AIDOS_AUTHORITY_STALE");
    if (current.candidates) {
      if (
        decision.registrySnapshotRef !==
          current.candidates.registrySnapshotRef ||
        decision.registrySnapshotRevision !==
          current.candidates.registrySnapshotRevision
      )
        throw new RoutingContractError("REGISTRY_STALE");
    } else if (
      decision.developmentDelegationState !==
        current.developmentDelegationState ||
      decision.selectedProviderRef !== null ||
      decision.selectedModelRef !== null ||
      decision.selectedRuntimeAdapterRef !== null ||
      decision.selectedModelHostBindingRef !== null
    )
      throw new RoutingContractError("DEVELOPMENT_NATIVE_EXECUTION_PROHIBITED");
    const candidates =
      await this.dependencies.repository.listCandidates(decisionId);
    return toRoutingDecisionOutputV1(
      decision,
      candidates,
      freshnessReferences(
        current,
        decision.policyCheckedAt,
        decision.policyFreshUntil,
      ),
      current.specialization ? { ...current.specialization } : null,
    );
  }
}
