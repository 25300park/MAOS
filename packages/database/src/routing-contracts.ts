export const ROUTING_ROLE_CLASSES = [
  "PLANNER",
  "EXECUTOR",
  "RESEARCHER",
  "ANALYST",
  "WRITER",
  "REVIEWER",
] as const;
export type RoutingRoleClass = (typeof ROUTING_ROLE_CLASSES)[number];

export const ROUTING_PURPOSES = [
  "PRIMARY_EXECUTION",
  "INDEPENDENT_REVIEW",
  "ADVERSARIAL_REVIEW",
] as const;
export type RoutingPurpose = (typeof ROUTING_PURPOSES)[number];

export const ROUTING_MODES = [
  "PRIMARY_EXECUTION",
  "FALLBACK",
  "INDEPENDENT_REVIEW",
  "ADVERSARIAL_REVIEW",
] as const;
export type RoutingMode = (typeof ROUTING_MODES)[number];
export type RoutingDecisionState = "SELECTED" | "DENIED" | "WAITING";
export type RoutingStalenessState =
  | "CURRENT"
  | "STALE_CLASSIFICATION"
  | "STALE_POLICY"
  | "STALE_REGISTRY"
  | "STALE_APPROVAL"
  | "STALE_AIDOS"
  | "CONFLICTING";
export type RoutingCandidateEligibility = "ELIGIBLE" | "EXCLUDED";
export type RoutingHumanApprovalState =
  | "NOT_REQUIRED"
  | "REQUIRED_MISSING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "REVOKED"
  | "STALE"
  | "CONSUMED";
export type DevelopmentDelegationState =
  | "NOT_APPLICABLE"
  | "READY_TO_DELEGATE"
  | "AIDOS_UNAVAILABLE"
  | "WAITING_AIDOS_ONBOARDING";
export type CanonicalDomain =
  | "BUSINESS"
  | "OPERATIONS"
  | "RESEARCH"
  | "ANALYTICS"
  | "WRITING"
  | "DEVELOPMENT"
  | "MEMORY";

export const ROUTING_ERROR_CODES = [
  "ROUTING_REQUEST_NOT_FOUND",
  "CLASSIFICATION_NOT_CURRENT",
  "CLASSIFICATION_NOT_VALIDATED",
  "CLASSIFICATION_INVALID",
  "CLASSIFICATION_STALE",
  "CLASSIFICATION_POLICY_UNRESOLVED",
  "ROUTING_POLICY_MISSING",
  "ROUTING_POLICY_STALE",
  "ROUTING_POLICY_INACTIVE",
  "ROUTING_POLICY_CONFLICT",
  "ROUTING_POLICY_ACTIVATION_CONFLICT",
  "POLICY_DENIED",
  "FALLBACK_NOT_AUTHORIZED",
  "SPECIALIZATION_INVALID",
  "REQUIRED_CAPABILITY_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "MODEL_DISABLED",
  "RUNTIME_ADAPTER_UNAVAILABLE",
  "REGISTRY_STALE",
  "REGISTRY_RECONCILING",
  "REGISTRY_CONFLICT",
  "NO_ELIGIBLE_CANDIDATE",
  "NONDETERMINISTIC_CANDIDATE_TIE",
  "REVIEW_INDEPENDENCE_UNSATISFIED",
  "ADVERSARIAL_REVIEW_POLICY_MISSING",
  "HUMAN_APPROVAL_REQUIRED",
  "HUMAN_APPROVAL_STALE",
  "HUMAN_APPROVAL_REVOKED",
  "HUMAN_APPROVAL_INVALID",
  "HUMAN_OVERRIDE_POLICY_VIOLATION",
  "AIDOS_UNAVAILABLE",
  "WAITING_AIDOS_ONBOARDING",
  "AIDOS_AUTHORITY_STALE",
  "AIDOS_AUTHORITY_CONFLICT",
  "AIDOS_DELEGATION_INELIGIBLE",
  "DEVELOPMENT_NATIVE_EXECUTION_PROHIBITED",
  "ROUTING_DECISION_STALE",
  "ROUTING_STREAM_CONFLICT",
  "ROUTING_CROSS_STREAM_SUPERSESSION_DENIED",
  "ROUTING_IDEMPOTENCY_CONFLICT",
] as const;
export type RoutingErrorCode = (typeof ROUTING_ERROR_CODES)[number];

export class RoutingContractError extends Error {
  constructor(readonly code: RoutingErrorCode) {
    super(code);
    this.name = "RoutingContractError";
  }
}

interface RoutingAuthorityReferenceBase {
  readonly identity: string;
  readonly revision: string;
  readonly checkedAt: string;
}

export interface RoutingCurrentnessReference extends RoutingAuthorityReferenceBase {
  readonly authority: "CLASSIFICATION";
  readonly freshnessModel: "REFERENCE_VERSION_CURRENTNESS";
}

export interface RoutingExpiryReference extends RoutingAuthorityReferenceBase {
  readonly authority: "POLICY" | "REGISTRY" | "APPROVAL" | "AIDOS";
  readonly freshnessModel: "AUTHORITY_EXPIRY";
  readonly freshUntil: string;
}

export type RoutingFreshnessReference =
  RoutingCurrentnessReference | RoutingExpiryReference;

export interface RoutingCandidateSnapshotInput {
  readonly candidateSnapshotId: string;
  readonly deterministicRank: number;
  readonly providerId: string;
  readonly modelId: string;
  readonly runtimeAdapterId: string;
  readonly modelHostBindingId: string;
  readonly eligibilityState: RoutingCandidateEligibility;
  readonly reasonCodes: readonly string[];
  readonly capabilityEvidence: Readonly<Record<string, unknown>>;
  readonly rankingEvidence: Readonly<Record<string, unknown>>;
  readonly registrySnapshotRef: string;
  readonly registrySnapshotRevision: string;
  readonly observedAt: string;
  readonly freshUntil: string;
}

export interface RoutingCandidateSnapshot extends RoutingCandidateSnapshotInput {
  readonly routingDecisionId: string;
  readonly createdAt: string;
}

export interface RoutingDecisionRecord {
  readonly routingDecisionId: string;
  readonly routingDecisionStreamId: string;
  readonly requestId: string;
  readonly routingPurpose: RoutingPurpose;
  readonly routingVersion: number;
  readonly supersedesRoutingDecisionId: string | null;
  readonly classificationVersionId: string;
  readonly classificationVersion: number;
  readonly classificationState: "VALIDATED";
  readonly classificationCurrentnessState: "CURRENT";
  readonly classificationCurrentnessProof: string;
  readonly classificationPolicyResolutionRef: string;
  readonly classificationPolicyResolutionVersion: string;
  readonly canonicalDomain: CanonicalDomain;
  readonly roleClass: RoutingRoleClass;
  readonly routingMode: RoutingMode;
  readonly specializationVersionId: string | null;
  readonly routingPolicyVersionId: string;
  readonly selectedProviderRef: string | null;
  readonly selectedModelRef: string | null;
  readonly selectedRuntimeAdapterRef: string | null;
  readonly selectedModelHostBindingRef: string | null;
  readonly registrySnapshotRef: string;
  readonly registrySnapshotRevision: string;
  readonly registryObservedAt: string;
  readonly registryFreshUntil: string;
  readonly requiredCapabilities: readonly string[];
  readonly preferredCapabilities: readonly string[];
  readonly policyConstraints: Readonly<Record<string, unknown>>;
  readonly contextRefs: readonly string[];
  readonly artifactRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  readonly humanApprovalState: RoutingHumanApprovalState;
  readonly humanApprovalRef: string | null;
  readonly humanApprovalTargetVersion: string | null;
  readonly humanApprovalTargetHash: string | null;
  readonly humanApprovalAuthority: string | null;
  readonly humanApprovalCheckedAt: string | null;
  readonly humanApprovalExpiresAt: string | null;
  readonly developmentDelegationState: DevelopmentDelegationState;
  readonly aidosProjectRef: string | null;
  readonly aidosRequiredCapabilities: readonly string[] | null;
  readonly aidosAuthorityRevision: string | null;
  readonly aidosCheckedAt: string | null;
  readonly aidosFreshUntil: string | null;
  readonly decisionState: RoutingDecisionState;
  readonly decisionReasonCodes: readonly string[];
  readonly stalenessState: RoutingStalenessState;
  readonly classificationCheckedAt: string;
  readonly policyCheckedAt: string;
  readonly policyFreshUntil: string;
  readonly idempotencyKey: string;
  readonly canonicalIntentFingerprint: string;
  readonly correlationId: string;
  readonly causationRefs: readonly string[];
  readonly auditRef: string;
  readonly createdAt: string;
}

export interface RoutingDecisionOutputV1 {
  readonly contractVersion: "PHASE15D_ROUTING_OUTPUT_V1";
  readonly routingDecisionId: string;
  readonly routingDecisionStreamId: string;
  readonly routingVersion: number;
  readonly requestId: string;
  readonly classificationVersionId: string;
  readonly canonicalDomain: CanonicalDomain;
  readonly roleClass: RoutingRoleClass;
  readonly routingPurpose: RoutingPurpose;
  readonly routingMode: RoutingMode;
  readonly specializationMetadata: Readonly<Record<string, unknown>> | null;
  readonly requiredCapabilities: readonly string[];
  readonly preferredCapabilities: readonly string[];
  readonly eligibleResourceRefs: readonly string[];
  readonly selectedProviderRef: string | null;
  readonly selectedModelRef: string | null;
  readonly selectedRuntimeAdapterRef: string | null;
  readonly policyConstraints: Readonly<Record<string, unknown>>;
  readonly policySnapshotRef: string;
  readonly registrySnapshotRef: string;
  readonly contextRefs: readonly string[];
  readonly artifactRefs: readonly string[];
  readonly priority: RoutingDecisionRecord["priority"];
  readonly humanApprovalState: RoutingHumanApprovalState;
  readonly humanApprovalRef: string | null;
  readonly humanApprovalAuthority: string | null;
  readonly humanApprovalCheckedAt: string | null;
  readonly humanApprovalExpiresAt: string | null;
  readonly developmentDelegationState: DevelopmentDelegationState;
  readonly aidosProjectRef: string | null;
  readonly aidosRequiredCapabilities: readonly string[] | null;
  readonly aidosAuthorityRevision: string | null;
  readonly aidosCheckedAt: string | null;
  readonly aidosFreshUntil: string | null;
  readonly decisionReasonCodes: readonly string[];
  readonly createdAt: string;
  readonly supersedesRoutingDecisionId: string | null;
  readonly stalenessState: RoutingStalenessState;
  readonly freshnessReferences: readonly RoutingFreshnessReference[];
}

export interface AppendRoutingDecisionInput extends Omit<
  RoutingDecisionRecord,
  "routingVersion" | "supersedesRoutingDecisionId" | "auditRef" | "createdAt"
> {
  readonly expectedPredecessorId: string | null;
  readonly actorType: "HUMAN" | "AGENT" | "SYSTEM";
  readonly actorId: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly projectId: string;
  readonly candidates: readonly RoutingCandidateSnapshotInput[];
  readonly auditAction?:
    "ROUTING.DECISION_CREATED" | "ROUTING.OVERRIDE_CREATED";
  readonly auditMetadata?: Readonly<{
    authority: RoutingHumanOverrideAuthorityBinding;
    overrideTargetDecisionId: string;
    overrideIntentType: "SELECT_ELIGIBLE_CANDIDATE" | "REEVALUATE_CANONICAL";
    reasonCode:
      "HUMAN_SELECTED_ELIGIBLE_RESOURCE" | "HUMAN_REQUESTED_REEVALUATION";
    reasonText: string;
  }>;
}

export interface RoutingHumanOverrideAuthorityBinding {
  readonly authorityId: string;
  readonly permission: "ROUTING_DECISION:OVERRIDE";
  readonly state: "ACTIVE" | "REVOKED" | "EXPIRED" | "STALE";
  readonly actorId: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly scopeRef: string;
  readonly environment: string;
  readonly targetRequestId: string;
  readonly targetRoutingPurpose: RoutingPurpose;
  readonly targetDecisionId: string;
  readonly checkedAt: string;
  readonly freshUntil: string;
}

export interface RoutingHumanOverrideAuditBinding {
  readonly actorId: string;
  readonly metadata: NonNullable<AppendRoutingDecisionInput["auditMetadata"]>;
}

export interface RoutingDecisionAuditInput {
  readonly action: "ROUTING.OVERRIDE_REJECTED" | "ROUTING.DECISION_STALE";
  readonly actorId: string;
  readonly actorType: "HUMAN" | "AGENT" | "SYSTEM";
  readonly requestId: string;
  readonly projectId: string;
  readonly targetDecisionId: string;
  readonly result: "DENIED";
  readonly evidenceRefs: readonly string[];
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly idempotencyKey: string;
  readonly metadata: Readonly<{
    routingPurpose: RoutingPurpose;
    reasonCode: RoutingErrorCode;
  }>;
}

export interface RoutingAppendResult {
  readonly outcome: "CREATED" | "REUSED";
  readonly decision: RoutingDecisionRecord;
  readonly candidates: readonly RoutingCandidateSnapshot[];
  readonly auditRef: string;
}

export interface RoutingDecisionRepository {
  findOrCreateStreamIdentity(input: {
    requestId: string;
    purpose: RoutingPurpose;
    streamId: string;
    actorType: "HUMAN" | "AGENT" | "SYSTEM";
    actorId: string;
  }): Promise<string>;
  findCurrent(
    requestId: string,
    purpose: RoutingPurpose,
  ): Promise<RoutingDecisionRecord | undefined>;
  findById(
    requestId: string,
    decisionId: string,
  ): Promise<RoutingDecisionRecord | undefined>;
  listHistory(
    requestId: string,
    purpose: RoutingPurpose,
  ): Promise<readonly RoutingDecisionRecord[]>;
  listCandidates(
    decisionId: string,
  ): Promise<readonly RoutingCandidateSnapshot[]>;
  findHumanOverrideAudit(
    auditRef: string,
  ): Promise<RoutingHumanOverrideAuditBinding | undefined>;
  recordRoutingAudit(input: RoutingDecisionAuditInput): Promise<void>;
  appendDecision(
    input: AppendRoutingDecisionInput,
  ): Promise<RoutingAppendResult>;
}

const includes = <T extends string>(
  values: readonly T[],
  value: string,
): value is T => values.includes(value as T);

export function assertRoutingEnums(record: RoutingDecisionRecord): void {
  if (
    !includes(ROUTING_ROLE_CLASSES, record.roleClass) ||
    !includes(ROUTING_PURPOSES, record.routingPurpose) ||
    !includes(ROUTING_MODES, record.routingMode)
  ) {
    throw new RoutingContractError("CLASSIFICATION_INVALID");
  }
}

export function toRoutingDecisionOutputV1(
  record: RoutingDecisionRecord,
  candidates: readonly RoutingCandidateSnapshot[],
  freshnessReferences: readonly RoutingFreshnessReference[],
  specializationMetadata: Readonly<Record<string, unknown>> | null = null,
): RoutingDecisionOutputV1 {
  assertRoutingEnums(record);
  return {
    contractVersion: "PHASE15D_ROUTING_OUTPUT_V1",
    routingDecisionId: record.routingDecisionId,
    routingDecisionStreamId: record.routingDecisionStreamId,
    routingVersion: record.routingVersion,
    requestId: record.requestId,
    classificationVersionId: record.classificationVersionId,
    canonicalDomain: record.canonicalDomain,
    roleClass: record.roleClass,
    routingPurpose: record.routingPurpose,
    routingMode: record.routingMode,
    specializationMetadata,
    requiredCapabilities: record.requiredCapabilities,
    preferredCapabilities: record.preferredCapabilities,
    eligibleResourceRefs: candidates
      .filter((x) => x.eligibilityState === "ELIGIBLE")
      .map((x) => x.modelHostBindingId),
    selectedProviderRef: record.selectedProviderRef,
    selectedModelRef: record.selectedModelRef,
    selectedRuntimeAdapterRef: record.selectedRuntimeAdapterRef,
    policyConstraints: record.policyConstraints,
    policySnapshotRef: record.routingPolicyVersionId,
    registrySnapshotRef: record.registrySnapshotRef,
    contextRefs: record.contextRefs,
    artifactRefs: record.artifactRefs,
    priority: record.priority,
    humanApprovalState: record.humanApprovalState,
    humanApprovalRef: record.humanApprovalRef,
    humanApprovalAuthority: record.humanApprovalAuthority,
    humanApprovalCheckedAt: record.humanApprovalCheckedAt,
    humanApprovalExpiresAt: record.humanApprovalExpiresAt,
    developmentDelegationState: record.developmentDelegationState,
    aidosProjectRef: record.aidosProjectRef,
    aidosRequiredCapabilities: record.aidosRequiredCapabilities,
    aidosAuthorityRevision: record.aidosAuthorityRevision,
    aidosCheckedAt: record.aidosCheckedAt,
    aidosFreshUntil: record.aidosFreshUntil,
    decisionReasonCodes: record.decisionReasonCodes,
    createdAt: record.createdAt,
    supersedesRoutingDecisionId: record.supersedesRoutingDecisionId,
    stalenessState: record.stalenessState,
    freshnessReferences,
  };
}
