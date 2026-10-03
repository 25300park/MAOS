export type Phase14Environment =
  "DEVELOPMENT" | "PREVIEW" | "STAGING" | "PRODUCTION";

export type Phase14RiskClass = "R0" | "R1" | "R2" | "R3" | "R4";

export type CommandClassification =
  | "READ_OBSERVE"
  | "ANALYZE_PLAN"
  | "GOVERNED_WRITE_ACTION"
  | "CONTROL"
  | "PROHIBITED_UNSUPPORTED";

export type CommandLifecycleState =
  | "RECEIVED"
  | "INTERPRETING"
  | "CLASSIFIED"
  | "PLANNING"
  | "REVIEW"
  | "WAITING_HUMAN"
  | "WAITING_APPROVAL"
  | "READY"
  | "DISPATCHED"
  | "COMPLETED"
  | "REJECTED"
  | "DENIED"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED";

export type ClarificationState = "NOT_REQUIRED" | "REQUIRED" | "RESOLVED";
export type RoutingKind = "PLANNER" | "REVIEWER" | "EXECUTOR" | "VERIFIER";
export type RoutingStatus =
  | "PENDING"
  | "EVALUATING"
  | "SELECTED"
  | "WAITING_HUMAN"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED";
export type GovernedArtifactKind = "PLAN" | "REVIEW" | "VERIFICATION";
export type VerificationOutcome =
  | "PASS"
  | "FAIL"
  | "INSUFFICIENT_EVIDENCE"
  | "CONFLICTED"
  | "ERROR"
  | "CANCELLED"
  | "EXPIRED";
export type PortalBindingKind = "PROJECT_PORTAL" | "DEVELOPMENT_TEAM_PORTAL";
export type DevelopmentTaskKind = "CODE_CHANGE" | "TEST_ONLY" | "DOCUMENTATION";

export interface CreateCommandClarificationReceiptInput {
  readonly id: string;
  readonly commandEnvelopeId: string;
  readonly projectId: string;
  readonly humanActorId: string;
  readonly resolvedFields: {
    readonly development_task_kind: DevelopmentTaskKind;
  };
  readonly evidenceRefs: readonly string[];
  readonly auditRefs: readonly string[];
  readonly idempotencyKey: string;
  readonly responseFingerprint: string;
  readonly correlationId: string;
}

export interface CommandClarificationReceipt extends CreateCommandClarificationReceiptInput {
  readonly createdAt: Date | string;
}

export interface HumanApprovalIntegrationRef {
  readonly approvalId: string;
  readonly approvalRequestRef: string;
  readonly approvalDecisionRef?: string;
  readonly targetVersion: string;
  readonly targetHash: string;
}

export type HumanApprovalStatus =
  "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "REVOKED" | "CANCELLED";

export type HumanApprovalValidity =
  | "VALID"
  | "STALE"
  | "TARGET_MISMATCH"
  | "VERSION_MISMATCH"
  | "AUTHORITY_INVALID"
  | "POLICY_INVALID"
  | "CONSUMED";

export type HumanApprovalDecisionType =
  | "APPROVED"
  | "REJECTED"
  | "CLARIFICATION_REQUIRED"
  | "REVOKED"
  | "EXPIRED"
  | "SUPERSEDED"
  | "CANCELLED";

export interface CreateHumanApprovalRequestInput {
  readonly id: string;
  readonly approvalId: string;
  readonly projectId: string;
  readonly commandEnvelopeId: string;
  readonly planArtifactId: string;
  readonly reviewArtifactId: string;
  readonly authorityOwnerActorId: string;
  readonly requestedByActorType: "HUMAN" | "AGENT" | "SYSTEM";
  readonly requestedByActorId: string;
  readonly requestedOperation: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly targetVersion: string;
  readonly targetHash: string;
  readonly companyScopeRef: string;
  readonly teamScopeRef?: string;
  readonly projectScopeRef: string;
  readonly systemScopeRef?: string;
  readonly riskClass: Phase14RiskClass;
  readonly environment: Phase14Environment;
  readonly evidenceRefs: readonly string[];
  readonly evidenceManifestHash: string;
  readonly approvalPolicyRef: string;
  readonly approvalPolicyVersion: string;
  readonly freshUntil: Date;
  readonly expiresAt: Date;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly correlationId: string;
  readonly causationRefs: readonly string[];
}

export interface HumanApprovalRequest extends CreateHumanApprovalRequestInput {
  readonly status: HumanApprovalStatus;
  readonly validity: HumanApprovalValidity;
  readonly createdAt: Date | string;
}

export interface HumanApprovalDecisionInput {
  readonly id: string;
  readonly projectId: string;
  readonly requestId: string;
  readonly actorType: "HUMAN" | "AGENT" | "SYSTEM";
  readonly actorId: string;
  readonly authorityRef: string;
  readonly decisionType: HumanApprovalDecisionType;
  readonly reasonCode: string;
  readonly evidenceRefs: readonly string[];
  readonly replacementRequestId?: string;
  readonly idempotencyKey: string;
  readonly decisionFingerprint: string;
  readonly correlationId: string;
  readonly causationRefs: readonly string[];
  readonly decidedAt: Date;
}

export interface HumanApprovalDecision extends HumanApprovalDecisionInput {
  readonly approvalId: string;
  readonly approvalStatus: HumanApprovalStatus;
  readonly approvalValidity: HumanApprovalValidity;
  readonly createdAt: Date | string;
}

export interface HumanApprovalExpectedBinding {
  readonly targetType: string;
  readonly targetId: string;
  readonly targetVersion: string;
  readonly targetHash: string;
  readonly companyScopeRef: string;
  readonly teamScopeRef?: string;
  readonly projectScopeRef: string;
  readonly systemScopeRef?: string;
  readonly riskClass: Phase14RiskClass;
  readonly environment: Phase14Environment;
  readonly requestedOperation: string;
  readonly evidenceManifestHash: string;
  readonly approvalPolicyRef: string;
  readonly approvalPolicyVersion: string;
}

export interface HumanApprovalRevalidationResult {
  readonly allowed: boolean;
  readonly approvalId: string;
  readonly reasonCode: string;
  readonly status: HumanApprovalStatus;
  readonly validity: HumanApprovalValidity;
}

export interface GovernedArtifactMetadataRef {
  readonly artifactId: string;
  readonly artifactKind: GovernedArtifactKind;
  readonly artifactRef: string;
  readonly artifactVersion: string;
  readonly artifactHash: string;
}

export interface CreateCommandEnvelopeInput {
  readonly id: string;
  readonly projectId: string;
  readonly humanActorId: string;
  readonly sourceMessageRef: string;
  readonly sourceMessageHash: string;
  readonly priorCommandId?: string | undefined;
  readonly companyScopeRef: string;
  readonly teamScopeRef?: string | undefined;
  readonly projectScopeRef: string;
  readonly systemScopeRef?: string | undefined;
  readonly environment: Phase14Environment;
  readonly normalizedIntent: string;
  readonly requestedOutcome: string;
  readonly classificationInputs?: Readonly<Record<string, string>> | undefined;
  readonly commandClassification: CommandClassification;
  readonly riskClass: Phase14RiskClass;
  readonly policyRef: string;
  readonly policyVersion: string;
  readonly requestFingerprint: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly causationRef?: string | undefined;
  readonly evidenceRefs?: readonly string[];
  readonly auditRefs: readonly string[];
  readonly expiresAt?: Date | string | undefined;
}

export interface CommandEnvelope extends CreateCommandEnvelopeInput {
  readonly lifecycleState: CommandLifecycleState;
  readonly clarificationState: ClarificationState;
  readonly unresolvedFields: readonly string[];
  readonly approvalId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly workflowInstanceId?: string | undefined;
  readonly runId?: string | undefined;
  readonly evidenceRefs: readonly string[];
  readonly auditRefs: readonly string[];
  readonly reasonCode?: string | undefined;
  readonly version: number;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
}

export interface CommandEnvelopeTransition {
  readonly id: string;
  readonly expectedVersion: number;
  readonly lifecycleState: CommandLifecycleState;
  readonly transitionActorType: "HUMAN" | "AGENT" | "SYSTEM" | "SERVICE";
  readonly transitionActorRef: string;
  readonly transitionPolicyRef: string;
  readonly transitionPolicyVersion: string;
  readonly correlationId: string;
  readonly causationRef?: string;
  readonly clarificationState?: ClarificationState;
  readonly unresolvedFields?: readonly string[];
  readonly approvalId?: string;
  readonly approvalRequestRef?: string;
  readonly approvalDecisionRef?: string;
  readonly taskId?: string;
  readonly workflowInstanceId?: string;
  readonly runId?: string;
  readonly evidenceRefs?: readonly string[];
  readonly auditRefs: readonly string[];
  readonly reasonCode: string;
  readonly approvalTargetVersion?: string;
  readonly approvalTargetHash?: string;
}

export interface CreateRoutingEnvelopeInput {
  readonly id: string;
  readonly projectId: string;
  readonly commandEnvelopeId: string;
  readonly commandEnvelopeVersion: number;
  readonly commandEnvelopeHash: string;
  readonly routingKind: RoutingKind;
  readonly status: RoutingStatus;
  readonly inputArtifactId?: string;
  readonly verificationHandoffId?: string;
  readonly routingPurpose: string;
  readonly requiredRole: string;
  readonly selectedRoleRef?: string;
  readonly selectedAgentId?: string;
  readonly candidateRefs: readonly string[];
  readonly evaluationRefs: readonly string[];
  readonly capabilityRefs?: readonly string[];
  readonly skillVersionRefs?: readonly string[];
  readonly independenceEvidenceRef?: string;
  readonly riskClass: Phase14RiskClass;
  readonly environment: Phase14Environment;
  readonly routingPolicyRef: string;
  readonly routingPolicyVersion: string;
  readonly approvalId?: string;
  readonly approvalRequestRef?: string;
  readonly approvalDecisionRef?: string;
  readonly approvalTargetVersion?: string;
  readonly approvalTargetHash?: string;
  readonly repositoryId?: string;
  readonly workrootId?: string;
  readonly taskId?: string;
  readonly runId?: string;
  readonly fallbackOutcome?: string;
  readonly noSelectionReason?: string;
  readonly inputBindingHash: string;
  readonly idempotencyKey: string;
  readonly routingInputFingerprint: string;
  readonly correlationId: string;
  readonly causationRefs?: readonly string[];
  readonly evidenceRefs?: readonly string[];
  readonly auditRefs?: readonly string[];
  readonly evaluatedAt: Date;
  readonly expiresAt?: Date;
}

export interface CreateGovernedArtifactRefInput {
  readonly id: string;
  readonly projectId: string;
  readonly commandEnvelopeId: string;
  readonly artifactKind: GovernedArtifactKind;
  readonly artifactRef: string;
  readonly artifactVersion: string;
  readonly artifactHash: string;
  readonly deliveryArtifactId?: string;
  readonly taskId?: string;
  readonly runId?: string;
  readonly scopeRef: string;
  readonly riskClass: Phase14RiskClass;
  readonly environment: Phase14Environment;
  readonly policyRef: string;
  readonly policyVersion: string;
  readonly evidenceRefs?: readonly string[];
  readonly auditRefs?: readonly string[];
  readonly idempotencyKey: string;
  readonly inputFingerprint: string;
  readonly correlationId: string;
  readonly causationRef?: string;
  readonly verificationHandoffId?: string;
  readonly verificationOutcome?: VerificationOutcome;
  readonly verificationResolution?: "CLOSURE" | "REWORK" | "WAITING_HUMAN";
  readonly reworkHandoffRef?: string;
  readonly evidenceClassification?:
    "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "PRIVATE_PERSONAL";
  readonly redactionPolicyRef?: string;
  readonly retentionClass?: string;
  readonly retentionPolicyRef?: string;
  readonly generatedAt?: Date;
  readonly observedAt?: Date;
  readonly evidenceIntegrityAlgorithm?: "SHA-256";
}

export interface CreateVerificationHandoffInput {
  readonly id: string;
  readonly projectId: string;
  readonly commandEnvelopeId: string;
  readonly executorRoutingId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly toolCallId?: string;
  readonly runnerId: string;
  readonly status: "READY" | "INVALIDATED" | "CANCELLED" | "EXPIRED";
  readonly executionResultRef: string;
  readonly executionResultVersion: string;
  readonly executionResultHash: string;
  readonly artifactRefIds: readonly string[];
  readonly artifactManifestHash: string;
  readonly evidenceRefs: readonly string[];
  readonly evidenceSetHash: string;
  readonly expectedOutcomeRef: string;
  readonly acceptanceCriteriaRef: string;
  readonly verificationCriteriaRef: string;
  readonly scopeRef: string;
  readonly riskClass: Phase14RiskClass;
  readonly environment: Phase14Environment;
  readonly executionPolicyRef: string;
  readonly executionPolicyVersion: string;
  readonly verificationPolicyRef: string;
  readonly verificationPolicyVersion: string;
  readonly idempotencyKey: string;
  readonly handoffFingerprint: string;
  readonly correlationId: string;
  readonly causationRefs?: readonly string[];
  readonly auditRefs?: readonly string[];
  readonly expiresAt?: Date;
}

export interface CreatePortalBindingInput {
  readonly id: string;
  readonly version: number;
  readonly supersedesVersion?: number;
  readonly bindingKind: PortalBindingKind;
  readonly companyRef: string;
  readonly teamRef?: string;
  readonly projectId: string;
  readonly projectScopeRef: string;
  readonly systemId?: string;
  readonly systemVersion?: number;
  readonly environmentId?: string;
  readonly environmentVersion?: number;
  readonly repositoryId?: string;
  readonly repositoryVersion?: number;
  readonly workrootId?: string;
  readonly workrootRef?: string;
  readonly policyRef: string;
  readonly policyVersion: string;
  readonly lifecycle: "ACTIVE" | "SUSPENDED" | "RETIRED";
  readonly capabilityRefs?: readonly string[];
  readonly evidenceRefs?: readonly string[];
  readonly auditRefs?: readonly string[];
  readonly idempotencyKey: string;
  readonly bindingFingerprint: string;
  readonly correlationId: string;
  readonly expiresAt?: Date;
}

export interface CreateOrReuseResult<T> {
  readonly outcome: "CREATED" | "REUSED";
  readonly value: T;
}

export interface PlannerReviewerRoutingPolicy {
  readonly ref: string;
  readonly version: string;
  readonly routingKind: "PLANNER" | "REVIEWER";
  readonly lifecycle: "APPROVED" | "RETIRED";
  readonly requiredCapabilityRefs: readonly string[];
  readonly requiredSkillVersionRefs: readonly string[];
  readonly allowedAgentIds: readonly string[];
  readonly companyScopeRefs: readonly string[];
  readonly teamScopeRefs: readonly string[];
  readonly projectScopeRefs: readonly string[];
  readonly systemScopeRefs: readonly string[];
  readonly environments: readonly string[];
  readonly maxRiskClass: Phase14RiskClass;
  readonly maxAttempts: number;
  readonly timeoutMs: number;
  readonly policyHash: string;
  readonly evidenceRefs: readonly string[];
  readonly auditRefs: readonly string[];
  readonly effectiveAt: Date;
  readonly expiresAt?: Date;
}

export interface ExecutorRoutingPolicy extends Omit<
  PlannerReviewerRoutingPolicy,
  "routingKind"
> {
  readonly routingKind: "EXECUTOR";
  readonly requestedOperations: readonly string[];
  readonly requiredToolPermissionRefs: readonly string[];
  readonly allowedRepositoryIds: readonly string[];
  readonly allowedWorkrootIds: readonly string[];
  readonly requiredRunnerCapabilityRefs: readonly string[];
  readonly approvalRequirement: "REQUIRED" | "NOT_REQUIRED";
}

export interface VerificationRoutingPolicy extends Omit<
  PlannerReviewerRoutingPolicy,
  "routingKind"
> {
  readonly routingKind: "VERIFIER";
}

export interface RoutingWorkBinding {
  readonly taskId: string;
  readonly assignmentId: string;
  readonly runId: string;
  readonly modelId: string;
  readonly runnerId: string;
}

export interface PlannerRoutingRequest {
  readonly routingId: string;
  readonly commandEnvelopeId: string;
  readonly commandEnvelopeVersion: number;
  readonly commandEnvelopeHash: string;
  readonly idempotencyKey: string;
  readonly policyRef: string;
  readonly policyVersion: string;
  readonly work: RoutingWorkBinding;
  readonly correlationId: string;
}

export interface ReviewerRoutingRequest extends PlannerRoutingRequest {
  readonly planArtifactId: string;
  readonly planArtifactVersion: string;
  readonly planArtifactHash: string;
  readonly plannerRoutingId: string;
  readonly plannerAgentId: string;
  readonly plannerRunId: string;
}

export interface ExecutorRoutingRequest extends PlannerRoutingRequest {
  readonly planArtifactId: string;
  readonly planArtifactVersion: string;
  readonly planArtifactHash: string;
  readonly reviewArtifactId: string;
  readonly reviewArtifactVersion: string;
  readonly reviewArtifactHash: string;
  readonly approvalRequestId?: string;
  readonly approvalDecisionId?: string;
  readonly requestedOperation: string;
  readonly approvalTargetType?: string;
  readonly approvalTargetId?: string;
  readonly approvalTargetVersion?: string;
  readonly approvalTargetHash?: string;
  readonly evidenceManifestHash: string;
  readonly approvalPolicyRef: string;
  readonly approvalPolicyVersion: string;
  readonly toolPermissionRefs: readonly string[];
  readonly toolId: string;
  readonly toolCapabilityId: string;
  readonly toolActionType: "READ" | "WRITE" | "EXECUTE" | "ADMIN";
  readonly systemId: string;
  readonly repositoryId: string;
  readonly workrootId: string;
  readonly requiredRunnerCapabilityRefs: readonly string[];
}

export interface VerificationRoutingRequest {
  readonly routingId: string;
  readonly commandEnvelopeVersion: number;
  readonly commandEnvelopeHash: string;
  readonly routingIdempotencyKey: string;
  readonly policyRef: string;
  readonly policyVersion: string;
  readonly work: RoutingWorkBinding;
  readonly correlationId: string;
  readonly handoff: Omit<CreateVerificationHandoffInput, "handoffFingerprint">;
}

export interface VerificationArtifactRequest extends RoutingArtifactRequest {
  readonly verificationHandoffId: string;
  readonly outcome: VerificationOutcome;
  readonly resolution: "CLOSURE" | "REWORK" | "WAITING_HUMAN";
  readonly reworkHandoffRef?: string;
}

export interface ExecutorPreExecutionRevalidationResult {
  readonly allowed: boolean;
  readonly reasonCode: string;
  readonly routingId: string;
}

export type Maos019Capability =
  "READ_FILE" | "WRITE_FILE" | "RUN_COMMAND" | "GIT_STATUS" | "GIT_DIFF";

export interface Maos019DispatchRequest {
  readonly dispatchId: string;
  readonly executorRequest: ExecutorRoutingRequest;
  readonly localRunnerId: string;
  readonly capability: Maos019Capability;
  readonly branchRef: string;
  readonly workrootPath: string;
  readonly relativePath?: string;
  readonly content?: string;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly skillVersionRef: string;
  readonly toolPermissionRef: string;
  readonly networkPolicyRef: "network-policy://default-deny/v1";
  readonly networkRequested: boolean;
  readonly timeoutMs: number;
  readonly idempotencyKey: string;
  readonly evidenceRefs: readonly string[];
  readonly correlationId: string;
}

export interface Maos019DispatchResult {
  readonly outcome: "CREATED" | "REUSED";
  readonly dispatchId: string;
  readonly status:
    | "AUTHORIZED"
    | "EXECUTING"
    | "SUCCEEDED"
    | "FAILED"
    | "DENIED"
    | "TIMED_OUT"
    | "CANCELLED";
}

export interface Maos019ControlRequest {
  readonly dispatchId: string;
  readonly action: "STOP" | "PAUSE" | "KILL";
  readonly actorId: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface RoutingArtifactRequest {
  readonly id: string;
  readonly routingId: string;
  readonly artifactRef: string;
  readonly artifactVersion: string;
  readonly artifactHash: string;
  readonly idempotencyKey: string;
  readonly evidenceRefs: readonly string[];
  readonly auditRefs: readonly string[];
}

export class Phase14RuntimeConflictError extends Error {
  readonly code: string;

  constructor(code = "PHASE14_RUNTIME_CONFLICT") {
    super(code);
    this.code = code;
  }
}

export class Phase14RoutingDeniedError extends Error {
  readonly code: string;

  constructor(code = "PHASE14_ROUTING_DENIED") {
    super(code);
    this.code = code;
  }
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function computePhase14Fingerprint(
  value: Readonly<Record<string, unknown>>,
  fingerprintField: string,
): string {
  const canonical = { ...value };
  delete canonical[fingerprintField];
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(canonical)))
    .digest("hex")}`;
}
import { createHash } from "node:crypto";
