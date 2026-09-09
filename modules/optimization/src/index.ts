import { createHash } from "node:crypto";
import type { ActorType, GovernanceDecision, ToolRisk } from "@maos/contracts";

export type LearningCandidateType =
  | "WORKFLOW"
  | "SKILL"
  | "MODEL"
  | "RUNNER"
  | "TOOL"
  | "POLICY"
  | "UX"
  | "SYSTEM"
  | "TEAM"
  | "AGENT"
  | "INTEGRATION";
export type PatternType =
  | "REPEATED_TASK_FAILURE"
  | "REPEATED_UX_FRICTION"
  | "REPEATED_APPROVAL_BOTTLENECK"
  | "REPEATED_RETRY_RECOVERY"
  | "REPEATED_SUCCESSFUL_WORKFLOW"
  | "REPEATED_SYSTEM_OPPORTUNITY"
  | "REPEATED_RESOURCE_INEFFICIENCY";
export type CandidateActivationState =
  | "INACTIVE"
  | "READY_FOR_ACTIVATION"
  | "ACTIVE"
  | "PAUSED"
  | "CANCELLED"
  | "REJECTED"
  | "ROLLBACK_CANDIDATE";

export interface OptimizationActor {
  id: string;
  type: ActorType;
}

export interface VerifiedResultReference {
  correlation_id: string;
  evidence_refs: readonly string[];
  id: string;
  project_id: string;
  source_hash: string;
  source_id: string;
  source_type: "TASK" | "RUN" | "WORKFLOW" | "QUALITY" | "SYSTEM";
  source_version: number;
  verification_state: "VERIFIED";
  verified_at: string;
}

export interface OptimizationMetric {
  baseline: number;
  name: string;
  observed: number;
  unit: string;
}

function bindsEveryResultEvidence(
  results: readonly (Readonly<VerifiedResultReference> | undefined)[],
  evidenceRefs: readonly string[],
) {
  return results.every(
    (result) =>
      result !== undefined &&
      result.evidence_refs.some((reference) =>
        evidenceRefs.includes(reference),
      ),
  );
}

export interface PatternEvaluation {
  created_at: string;
  evidence_refs: readonly string[];
  id: string;
  metrics: readonly Readonly<OptimizationMetric>[];
  occurrence_count: number;
  pattern: PatternType;
  project_id: string;
  recommendation: string;
  result_ids: readonly string[];
}

export interface LearningCandidate {
  activation_state: CandidateActivationState;
  affected_target: {
    id: string;
    type: LearningCandidateType;
    version: number;
  };
  approval_id: string | null;
  approval_state: "NOT_REQUESTED" | "PENDING" | "APPROVED" | "REJECTED";
  approved_by_actor_id: string | null;
  author_actor_id: string;
  candidate_hash: string;
  confidence: number;
  created_at: string;
  escalated: boolean;
  evaluation_id: string | null;
  evidence_refs: readonly string[];
  expected_benefit: string;
  id: string;
  improvement_hypothesis: string;
  improvement_task_id: string | null;
  observed_pattern: string;
  project_id: string;
  result_ids: readonly string[];
  review_state: "PENDING" | "APPROVED" | "REJECTED";
  reviewed_by_actor_id: string | null;
  reviewer_actor_id: string;
  risk: ToolRisk;
  simulation_only: boolean;
  target_hash: string;
  type: LearningCandidateType;
  updated_at: string;
  ux_retest_state: "NOT_REQUIRED" | "PENDING" | "PASS" | "FAIL";
  verification_state: "NOT_STARTED" | "IN_PROGRESS" | "PASS" | "FAIL";
  version: number;
}

export interface OptimizationEvent {
  correlation_id: string;
  evidence_refs: readonly string[];
  name: string;
  occurred_at: string;
  resource_id: string;
  resource_type:
    "VERIFIED_RESULT" | "PATTERN_EVALUATION" | "LEARNING_CANDIDATE";
}

export interface OptimizationAudit {
  action: string;
  actor: OptimizationActor;
  correlation_id: string;
  evidence_refs: readonly string[];
  result: "SUCCEEDED" | "DENIED";
  target: { id: string; type: string };
}

export interface OptimizationBrief {
  approvals_needed: number;
  candidates: {
    active: number;
    cancelled: number;
    pending: number;
    rejected: number;
  };
  cost_performance_signals: number;
  production_deployment_approved: false;
  production_ready: false;
  recurring_issues: number;
  recommended_next_actions: readonly string[];
  ux_findings: number;
}

export class OptimizationLearningError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "OptimizationLearningError";
  }
}

const CANDIDATE_TYPES = new Set<string>([
  "WORKFLOW",
  "SKILL",
  "MODEL",
  "RUNNER",
  "TOOL",
  "POLICY",
  "UX",
  "SYSTEM",
  "TEAM",
  "AGENT",
  "INTEGRATION",
]);
const PATTERN_TYPES = new Set<string>([
  "REPEATED_TASK_FAILURE",
  "REPEATED_UX_FRICTION",
  "REPEATED_APPROVAL_BOTTLENECK",
  "REPEATED_RETRY_RECOVERY",
  "REPEATED_SUCCESSFUL_WORKFLOW",
  "REPEATED_SYSTEM_OPPORTUNITY",
  "REPEATED_RESOURCE_INEFFICIENCY",
]);
const RESULT_TYPES = new Set<string>([
  "TASK",
  "RUN",
  "WORKFLOW",
  "QUALITY",
  "SYSTEM",
]);
const RISK_VALUES = new Set<string>(["R0", "R1", "R2", "R3", "R4"]);
const HASH = /^sha256:[a-f0-9]{64}$/;
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const evidence = (values: unknown): values is readonly string[] =>
  Array.isArray(values) &&
  values.length > 0 &&
  values.every(
    (value) =>
      typeof value === "string" &&
      value.startsWith("evidence://") &&
      value.length > "evidence://".length,
  );
const positiveVersion = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) > 0;
const freeze = <T extends object>(value: T): Readonly<T> =>
  Object.freeze(value);

function candidateHash(input: {
  affected_target: LearningCandidate["affected_target"];
  expected_benefit: string;
  improvement_hypothesis: string;
  observed_pattern: string;
  result_ids: readonly string[];
  risk: ToolRisk;
  target_hash: string;
  type: LearningCandidateType;
}): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        affected_target: input.affected_target,
        expected_benefit: input.expected_benefit,
        improvement_hypothesis: input.improvement_hypothesis,
        observed_pattern: input.observed_pattern,
        result_ids: [...input.result_ids].sort(),
        risk: input.risk,
        target_hash: input.target_hash,
        type: input.type,
      }),
    )
    .digest("hex");
  return `sha256:${digest}`;
}

export class OptimizationLearningService {
  private readonly results = new Map<
    string,
    Readonly<VerifiedResultReference>
  >();
  private readonly evaluations = new Map<string, Readonly<PatternEvaluation>>();
  private readonly candidates = new Map<string, Readonly<LearningCandidate>>();
  private readonly eventLog: Readonly<OptimizationEvent>[] = [];
  private readonly auditLog: Readonly<OptimizationAudit>[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  recordVerifiedResult(input: {
    actor: OptimizationActor;
    correlation_id: string;
    evidence_refs: readonly string[];
    project_id: string;
    result_id: string;
    source_hash: string;
    source_id: string;
    source_type: VerifiedResultReference["source_type"];
    source_version: number;
    verified_at: string;
  }): Readonly<VerifiedResultReference> {
    const verifiedAt = Date.parse(input.verified_at);
    if (
      !nonempty(input.actor.id) ||
      !nonempty(input.correlation_id) ||
      !nonempty(input.project_id) ||
      !nonempty(input.result_id) ||
      !nonempty(input.source_id) ||
      !RESULT_TYPES.has(input.source_type) ||
      !positiveVersion(input.source_version) ||
      !HASH.test(input.source_hash) ||
      !evidence(input.evidence_refs) ||
      !Number.isFinite(verifiedAt) ||
      verifiedAt > this.now().getTime() ||
      this.results.has(input.result_id)
    )
      return this.deny(
        input,
        "INVALID_VERIFIED_RESULT",
        input.result_id,
        "VERIFIED_RESULT",
      );
    const result = freeze({
      correlation_id: input.correlation_id,
      evidence_refs: freeze([...input.evidence_refs]),
      id: input.result_id,
      project_id: input.project_id,
      source_hash: input.source_hash,
      source_id: input.source_id,
      source_type: input.source_type,
      source_version: input.source_version,
      verification_state: "VERIFIED" as const,
      verified_at: input.verified_at,
    });
    this.results.set(result.id, result);
    this.proof(
      input,
      "VERIFIED_RESULT.RECORDED",
      "RECORD_VERIFIED_RESULT",
      result.id,
      "VERIFIED_RESULT",
    );
    return result;
  }

  evaluatePattern(input: {
    actor: OptimizationActor;
    correlation_id: string;
    evaluation_id: string;
    evidence_refs: readonly string[];
    metrics: readonly OptimizationMetric[];
    pattern: PatternType;
    project_id: string;
    recommendation: string;
    result_ids: readonly string[];
  }): Readonly<PatternEvaluation> {
    const results = [...new Set(input.result_ids)].map((id) =>
      this.results.get(id),
    );
    if (
      !nonempty(input.evaluation_id) ||
      !nonempty(input.project_id) ||
      !nonempty(input.recommendation) ||
      !PATTERN_TYPES.has(input.pattern) ||
      results.length < 2 ||
      results.some(
        (result) => !result || result.project_id !== input.project_id,
      ) ||
      !evidence(input.evidence_refs) ||
      !bindsEveryResultEvidence(results, input.evidence_refs) ||
      !Array.isArray(input.metrics) ||
      input.metrics.length === 0 ||
      input.metrics.some(
        (metric) =>
          !nonempty(metric.name) ||
          !nonempty(metric.unit) ||
          !Number.isFinite(metric.baseline) ||
          !Number.isFinite(metric.observed),
      ) ||
      this.evaluations.has(input.evaluation_id)
    )
      return this.deny(
        input,
        "INVALID_PATTERN_EVALUATION",
        input.evaluation_id,
        "PATTERN_EVALUATION",
      );
    const evaluation = freeze({
      created_at: this.now().toISOString(),
      evidence_refs: freeze([...input.evidence_refs]),
      id: input.evaluation_id,
      metrics: freeze(input.metrics.map((metric) => freeze({ ...metric }))),
      occurrence_count: results.length,
      pattern: input.pattern,
      project_id: input.project_id,
      recommendation: input.recommendation,
      result_ids: freeze([...new Set(input.result_ids)]),
    });
    this.evaluations.set(evaluation.id, evaluation);
    this.proof(
      input,
      "PATTERN_EVALUATION.COMPLETED",
      "EVALUATE_PATTERN",
      evaluation.id,
      "PATTERN_EVALUATION",
    );
    return evaluation;
  }

  createCandidate(input: {
    actor: OptimizationActor;
    affected_target: LearningCandidate["affected_target"];
    candidate_id: string;
    confidence: number;
    correlation_id: string;
    evaluation_id?: string;
    evidence_refs: readonly string[];
    expected_benefit: string;
    improvement_hypothesis: string;
    observed_pattern: string;
    project_id: string;
    result_ids: readonly string[];
    reviewer_actor_id: string;
    risk: ToolRisk;
    target_hash: string;
    type: LearningCandidateType;
  }): Readonly<LearningCandidate> {
    if (
      input.type === ("ARCHITECTURE" as LearningCandidateType) ||
      input.affected_target.type === ("ARCHITECTURE" as LearningCandidateType)
    )
      return this.deny(
        input,
        "ARCHITECTURE_CHANGE_REJECTED",
        input.candidate_id,
        "LEARNING_CANDIDATE",
      );
    const results = [...new Set(input.result_ids)].map((id) =>
      this.results.get(id),
    );
    const evaluation = input.evaluation_id
      ? this.evaluations.get(input.evaluation_id)
      : undefined;
    if (
      !CANDIDATE_TYPES.has(input.type) ||
      input.affected_target.type !== input.type ||
      !nonempty(input.candidate_id) ||
      !nonempty(input.actor.id) ||
      !nonempty(input.affected_target.id) ||
      !positiveVersion(input.affected_target.version) ||
      !HASH.test(input.target_hash) ||
      !Number.isFinite(input.confidence) ||
      input.confidence < 0 ||
      input.confidence > 1 ||
      !RISK_VALUES.has(input.risk) ||
      !nonempty(input.observed_pattern) ||
      !nonempty(input.improvement_hypothesis) ||
      !nonempty(input.expected_benefit) ||
      !nonempty(input.reviewer_actor_id) ||
      input.reviewer_actor_id === input.actor.id ||
      !evidence(input.evidence_refs) ||
      results.length === 0 ||
      results.some(
        (result) => !result || result.project_id !== input.project_id,
      ) ||
      !bindsEveryResultEvidence(results, input.evidence_refs) ||
      (input.evaluation_id !== undefined &&
        (!evaluation || evaluation.project_id !== input.project_id)) ||
      this.candidates.has(input.candidate_id)
    ) {
      const code = results.some((result) => !result)
        ? "VERIFIED_RESULT_REQUIRED"
        : !bindsEveryResultEvidence(results, input.evidence_refs)
          ? "EVIDENCE_BINDING_REQUIRED"
          : "INVALID_LEARNING_CANDIDATE";
      return this.deny(input, code, input.candidate_id, "LEARNING_CANDIDATE");
    }
    const createdAt = this.now().toISOString();
    const target = freeze({ ...input.affected_target });
    const resultIds = freeze([...new Set(input.result_ids)]);
    const created = freeze({
      activation_state: "INACTIVE" as const,
      affected_target: target,
      approval_id: null,
      approval_state: "NOT_REQUESTED" as const,
      approved_by_actor_id: null,
      author_actor_id: input.actor.id,
      candidate_hash: candidateHash({
        affected_target: target,
        expected_benefit: input.expected_benefit,
        improvement_hypothesis: input.improvement_hypothesis,
        observed_pattern: input.observed_pattern,
        result_ids: resultIds,
        risk: input.risk,
        target_hash: input.target_hash,
        type: input.type,
      }),
      confidence: input.confidence,
      created_at: createdAt,
      escalated: false,
      evaluation_id: input.evaluation_id ?? null,
      evidence_refs: freeze([...input.evidence_refs]),
      expected_benefit: input.expected_benefit,
      id: input.candidate_id,
      improvement_hypothesis: input.improvement_hypothesis,
      improvement_task_id: null,
      observed_pattern: input.observed_pattern,
      project_id: input.project_id,
      result_ids: resultIds,
      review_state: "PENDING" as const,
      reviewed_by_actor_id: null,
      reviewer_actor_id: input.reviewer_actor_id,
      risk: input.risk,
      simulation_only: false,
      target_hash: input.target_hash,
      type: input.type,
      updated_at: createdAt,
      ux_retest_state:
        input.type === "UX" ? ("PENDING" as const) : ("NOT_REQUIRED" as const),
      verification_state: "NOT_STARTED" as const,
      version: 1,
    });
    this.candidates.set(created.id, created);
    this.proof(
      input,
      "LEARNING_CANDIDATE.CREATED",
      "CREATE_LEARNING_CANDIDATE",
      created.id,
      "LEARNING_CANDIDATE",
    );
    return created;
  }

  reviewCandidate(input: {
    actor: OptimizationActor;
    candidate_id: string;
    correlation_id: string;
    decision: "APPROVE" | "REJECT";
    evidence_refs: readonly string[];
    expected_version: number;
    project_id?: string;
  }): Readonly<LearningCandidate> {
    const current = this.candidate(input.candidate_id, input.project_id);
    this.version(current, input.expected_version);
    if (input.decision !== "APPROVE" && input.decision !== "REJECT")
      return this.deny(
        input,
        "INVALID_REVIEW_DECISION",
        current.id,
        "LEARNING_CANDIDATE",
      );
    if (input.actor.type !== "HUMAN")
      return this.deny(
        input,
        "HUMAN_REVIEW_REQUIRED",
        current.id,
        "LEARNING_CANDIDATE",
      );
    if (
      input.actor.id !== current.reviewer_actor_id ||
      input.actor.id === current.author_actor_id
    )
      return this.deny(
        input,
        "SEPARATION_OF_DUTIES_REQUIRED",
        current.id,
        "LEARNING_CANDIDATE",
      );
    if (current.review_state !== "PENDING" || !evidence(input.evidence_refs))
      return this.deny(
        input,
        "INVALID_CANDIDATE_REVIEW",
        current.id,
        "LEARNING_CANDIDATE",
      );
    const approved = input.decision === "APPROVE";
    const updated = this.update(current, {
      activation_state: approved ? "INACTIVE" : "REJECTED",
      approval_state: approved ? "PENDING" : "REJECTED",
      evidence_refs: this.mergeEvidence(current, input.evidence_refs),
      review_state: approved ? "APPROVED" : "REJECTED",
      reviewed_by_actor_id: input.actor.id,
    });
    this.proof(
      input,
      approved ? "LEARNING_CANDIDATE.REVIEWED" : "LEARNING_CANDIDATE.REJECTED",
      approved ? "REVIEW_LEARNING_CANDIDATE" : "REJECT_LEARNING_CANDIDATE",
      current.id,
      "LEARNING_CANDIDATE",
    );
    return updated;
  }

  approveCandidate(input: {
    actor: OptimizationActor;
    approval: GovernanceDecision;
    candidate_hash: string;
    candidate_id: string;
    correlation_id: string;
    evidence_refs: readonly string[];
    expected_version: number;
    project_id?: string;
  }): Readonly<LearningCandidate> {
    const current = this.candidate(input.candidate_id, input.project_id);
    this.version(current, input.expected_version);
    this.hash(current, input.candidate_hash);
    if (input.actor.type !== "HUMAN")
      return this.deny(
        input,
        "HUMAN_APPROVAL_REQUIRED",
        current.id,
        "LEARNING_CANDIDATE",
      );
    if (
      input.actor.id === current.author_actor_id ||
      input.actor.id === current.reviewed_by_actor_id
    )
      return this.deny(
        input,
        "SEPARATION_OF_DUTIES_REQUIRED",
        current.id,
        "LEARNING_CANDIDATE",
      );
    if (
      current.review_state !== "APPROVED" ||
      !input.approval.allowed ||
      input.approval.authority !== "AUTHORIZED" ||
      input.approval.status !== "APPROVED" ||
      input.approval.validity !== "VALID" ||
      !evidence(input.evidence_refs)
    )
      return this.deny(
        input,
        "APPROVAL_REQUIRED",
        current.id,
        "LEARNING_CANDIDATE",
      );
    const updated = this.update(current, {
      activation_state: "READY_FOR_ACTIVATION",
      approval_id: input.approval.approval_id,
      approval_state: "APPROVED",
      approved_by_actor_id: input.actor.id,
      evidence_refs: this.mergeEvidence(current, input.evidence_refs),
    });
    this.proof(
      input,
      "LEARNING_CANDIDATE.APPROVED",
      "APPROVE_LEARNING_CANDIDATE",
      current.id,
      "LEARNING_CANDIDATE",
    );
    return updated;
  }

  activateCandidate(input: {
    actor: OptimizationActor;
    candidate_hash: string;
    candidate_id: string;
    correlation_id: string;
    environment: "DEVELOPMENT" | "PREVIEW" | "STAGING" | "PRODUCTION";
    evidence_refs: readonly string[];
    expected_version: number;
    project_id?: string;
  }): Readonly<LearningCandidate> {
    const current = this.candidate(input.candidate_id, input.project_id);
    this.version(current, input.expected_version);
    this.hash(current, input.candidate_hash);
    if (
      !["DEVELOPMENT", "PREVIEW", "STAGING", "PRODUCTION"].includes(
        input.environment,
      )
    )
      return this.deny(
        input,
        "INVALID_ACTIVATION_ENVIRONMENT",
        current.id,
        "LEARNING_CANDIDATE",
      );
    if (input.environment === "PRODUCTION")
      return this.deny(
        input,
        "PRODUCTION_ACTIVATION_DENIED",
        current.id,
        "LEARNING_CANDIDATE",
      );
    if (input.actor.type !== "HUMAN")
      return this.deny(
        input,
        "HUMAN_ACTIVATION_REQUIRED",
        current.id,
        "LEARNING_CANDIDATE",
      );
    if (
      [
        current.author_actor_id,
        current.reviewed_by_actor_id,
        current.approved_by_actor_id,
      ].includes(input.actor.id)
    )
      return this.deny(
        input,
        "SEPARATION_OF_DUTIES_REQUIRED",
        current.id,
        "LEARNING_CANDIDATE",
      );
    if (
      current.activation_state !== "READY_FOR_ACTIVATION" ||
      current.approval_state !== "APPROVED" ||
      !current.approval_id ||
      !evidence(input.evidence_refs)
    )
      return this.deny(
        input,
        "ACTIVATION_NOT_AUTHORIZED",
        current.id,
        "LEARNING_CANDIDATE",
      );
    if (current.verification_state !== "PASS")
      return this.deny(
        input,
        "VERIFIED_IMPROVEMENT_REQUIRED",
        current.id,
        "LEARNING_CANDIDATE",
      );
    const updated = this.update(current, {
      activation_state: "ACTIVE",
      evidence_refs: this.mergeEvidence(current, input.evidence_refs),
    });
    this.proof(
      input,
      "LEARNING_CANDIDATE.ACTIVATED",
      "ACTIVATE_VERSIONED_CHANGE",
      current.id,
      "LEARNING_CANDIDATE",
    );
    return updated;
  }

  linkImprovementTask(input: {
    actor: OptimizationActor;
    candidate_id: string;
    correlation_id: string;
    evidence_refs: readonly string[];
    expected_version: number;
    project_id?: string;
    task_id: string;
  }): Readonly<LearningCandidate> {
    const current = this.candidate(input.candidate_id, input.project_id);
    this.version(current, input.expected_version);
    if (input.actor.type !== "HUMAN")
      return this.deny(
        input,
        "HUMAN_TASK_AUTHORITY_REQUIRED",
        current.id,
        "LEARNING_CANDIDATE",
      );
    if (
      current.review_state !== "APPROVED" ||
      current.approval_state !== "APPROVED" ||
      current.activation_state !== "READY_FOR_ACTIVATION" ||
      current.improvement_task_id !== null ||
      !nonempty(input.task_id) ||
      !evidence(input.evidence_refs)
    )
      return this.deny(
        input,
        "IMPROVEMENT_TASK_NOT_AUTHORIZED",
        current.id,
        "LEARNING_CANDIDATE",
      );
    const updated = this.update(current, {
      evidence_refs: this.mergeEvidence(current, input.evidence_refs),
      improvement_task_id: input.task_id,
      verification_state: "IN_PROGRESS",
    });
    this.proof(
      input,
      "LEARNING_CANDIDATE.TASK_LINKED",
      "LINK_IMPROVEMENT_TASK",
      current.id,
      "LEARNING_CANDIDATE",
    );
    return updated;
  }

  recordCandidateVerification(input: {
    actor: OptimizationActor;
    candidate_id: string;
    correlation_id: string;
    evidence_refs: readonly string[];
    expected_version: number;
    outcome: "PASS" | "FAIL";
    project_id?: string;
    ux_retest?: "PASS" | "FAIL";
  }): Readonly<LearningCandidate> {
    const current = this.candidate(input.candidate_id, input.project_id);
    this.version(current, input.expected_version);
    if (input.outcome !== "PASS" && input.outcome !== "FAIL")
      return this.deny(
        input,
        "INVALID_VERIFICATION_OUTCOME",
        current.id,
        "LEARNING_CANDIDATE",
      );
    if (
      input.actor.type === "AGENT" ||
      input.actor.id === current.author_actor_id ||
      !current.improvement_task_id ||
      current.verification_state !== "IN_PROGRESS" ||
      !evidence(input.evidence_refs)
    )
      return this.deny(
        input,
        "INDEPENDENT_VERIFICATION_REQUIRED",
        current.id,
        "LEARNING_CANDIDATE",
      );
    if (current.type === "UX" && input.ux_retest !== "PASS")
      return this.deny(
        input,
        "UX_RETEST_REQUIRED",
        current.id,
        "LEARNING_CANDIDATE",
      );
    const updated = this.update(current, {
      activation_state:
        input.outcome === "PASS" ? "READY_FOR_ACTIVATION" : "PAUSED",
      evidence_refs: this.mergeEvidence(current, input.evidence_refs),
      ux_retest_state:
        current.type === "UX"
          ? (input.ux_retest ?? "FAIL")
          : current.ux_retest_state,
      verification_state: input.outcome,
    });
    this.proof(
      input,
      input.outcome === "PASS"
        ? "LEARNING_CANDIDATE.VERIFIED"
        : "LEARNING_CANDIDATE.VERIFICATION_FAILED",
      "VERIFY_IMPROVEMENT_CANDIDATE",
      current.id,
      "LEARNING_CANDIDATE",
    );
    return updated;
  }

  controlCandidate(input: {
    action: "PAUSE" | "CANCEL" | "ESCALATE" | "ROLLBACK_CANDIDATE";
    actor: OptimizationActor;
    candidate_id: string;
    correlation_id: string;
    evidence_refs: readonly string[];
    expected_version: number;
    project_id?: string;
  }): Readonly<LearningCandidate> {
    const current = this.candidate(input.candidate_id, input.project_id);
    this.version(current, input.expected_version);
    const actions = ["PAUSE", "CANCEL", "ESCALATE", "ROLLBACK_CANDIDATE"];
    if (!actions.includes(input.action))
      return this.deny(
        input,
        "INVALID_CONTROL_ACTION",
        current.id,
        "LEARNING_CANDIDATE",
      );
    if (input.actor.type !== "HUMAN" || !evidence(input.evidence_refs))
      return this.deny(
        input,
        "HUMAN_CONTROL_REQUIRED",
        current.id,
        "LEARNING_CANDIDATE",
      );
    const terminal = ["CANCELLED", "REJECTED", "ROLLBACK_CANDIDATE"].includes(
      current.activation_state,
    );
    if (
      terminal ||
      (input.action === "ROLLBACK_CANDIDATE" &&
        current.activation_state !== "ACTIVE")
    )
      return this.deny(
        input,
        "INVALID_CANDIDATE_TRANSITION",
        current.id,
        "LEARNING_CANDIDATE",
      );
    const activation_state: CandidateActivationState =
      input.action === "PAUSE"
        ? "PAUSED"
        : input.action === "CANCEL"
          ? "CANCELLED"
          : input.action === "ROLLBACK_CANDIDATE"
            ? "ROLLBACK_CANDIDATE"
            : current.activation_state;
    const updated = this.update(current, {
      activation_state,
      escalated: input.action === "ESCALATE" ? true : current.escalated,
      evidence_refs: this.mergeEvidence(current, input.evidence_refs),
    });
    this.proof(
      input,
      `LEARNING_CANDIDATE.${input.action === "ROLLBACK_CANDIDATE" ? "ROLLBACK_PROPOSED" : `${input.action}D`}`,
      `${input.action}_LEARNING_CANDIDATE`,
      current.id,
      "LEARNING_CANDIDATE",
    );
    return updated;
  }

  simulateExpansion(input: {
    actor: OptimizationActor;
    candidate_id: string;
    correlation_id: string;
    evidence_refs: readonly string[];
    project_id: string;
    registry_type:
      "SYSTEM" | "TEAM" | "AGENT" | "TOOL" | "WORKFLOW" | "INTEGRATION";
    resource_id: string;
    result_ids: readonly string[];
    reviewer_actor_id: string;
  }): Readonly<LearningCandidate> & {
    governance_inherited: true;
    simulation_only: true;
  } {
    const type = input.registry_type;
    const results = [...new Set(input.result_ids)].map((id) =>
      this.results.get(id),
    );
    if (
      results.some(
        (result) => !result || result.project_id !== input.project_id,
      )
    )
      return this.deny(
        input,
        "CROSS_PROJECT_SCOPE_DENIED",
        input.candidate_id,
        "LEARNING_CANDIDATE",
      );
    const created = this.createCandidate({
      actor: input.actor,
      affected_target: { id: input.resource_id, type, version: 1 },
      candidate_id: input.candidate_id,
      confidence: 0.5,
      correlation_id: input.correlation_id,
      evidence_refs: input.evidence_refs,
      expected_benefit: `Evaluate governed ${type.toLowerCase()} expansion`,
      improvement_hypothesis: `Register ${input.resource_id} through existing governance`,
      observed_pattern: "REPEATED_SYSTEM_OPPORTUNITY",
      project_id: input.project_id,
      result_ids: input.result_ids,
      reviewer_actor_id: input.reviewer_actor_id,
      risk: "R1",
      target_hash: `sha256:${createHash("sha256").update(`${type}:${input.resource_id}`).digest("hex")}`,
      type,
    });
    const updated = this.update(created, { simulation_only: true });
    return freeze({
      ...updated,
      governance_inherited: true,
      simulation_only: true,
    });
  }

  dailyBriefing(
    actor: OptimizationActor,
    permissionAllowed: boolean,
    projectId: string,
  ): Readonly<OptimizationBrief> {
    if (!permissionAllowed || actor.type !== "HUMAN" || !nonempty(projectId))
      throw new OptimizationLearningError("OPTIMIZATION_VIEW_DENIED");
    const candidates = this.listCandidates(projectId);
    const evaluations = this.listEvaluations(projectId);
    return freeze({
      approvals_needed: candidates.filter(
        (item) =>
          item.review_state === "APPROVED" &&
          item.approval_state !== "APPROVED",
      ).length,
      candidates: freeze({
        active: candidates.filter((item) => item.activation_state === "ACTIVE")
          .length,
        cancelled: candidates.filter(
          (item) => item.activation_state === "CANCELLED",
        ).length,
        pending: candidates.filter((item) => item.review_state === "PENDING")
          .length,
        rejected: candidates.filter((item) => item.review_state === "REJECTED")
          .length,
      }),
      cost_performance_signals: evaluations.filter((item) =>
        item.metrics.some((metric) =>
          /cost|latency|time|utilization|retry/i.test(metric.name),
        ),
      ).length,
      production_deployment_approved: false,
      production_ready: false,
      recurring_issues: evaluations.length,
      recommended_next_actions: freeze(
        candidates
          .filter((item) => item.review_state === "PENDING")
          .map((item) => `REVIEW:${item.id}`),
      ),
      ux_findings: candidates.filter((item) => item.type === "UX").length,
    });
  }

  evidence(correlationId: string): {
    audit: readonly Readonly<OptimizationAudit>[];
    events: readonly Readonly<OptimizationEvent>[];
  } {
    return {
      audit: this.auditLog.filter(
        (record) => record.correlation_id === correlationId,
      ),
      events: this.eventLog.filter(
        (record) => record.correlation_id === correlationId,
      ),
    };
  }

  listCandidates(projectId?: string): readonly Readonly<LearningCandidate>[] {
    return [...this.candidates.values()]
      .filter((candidate) => !projectId || candidate.project_id === projectId)
      .map((candidate) => ({ ...candidate }));
  }

  getCandidate(
    candidateId: string,
    projectId: string,
  ): Readonly<LearningCandidate> {
    return { ...this.candidate(candidateId, projectId) };
  }

  listEvaluations(projectId?: string): readonly Readonly<PatternEvaluation>[] {
    return [...this.evaluations.values()]
      .filter((evaluation) => !projectId || evaluation.project_id === projectId)
      .map((evaluation) => ({ ...evaluation }));
  }

  private candidate(
    id: string,
    projectId?: string,
  ): Readonly<LearningCandidate> {
    const candidate = this.candidates.get(id);
    if (!candidate)
      throw new OptimizationLearningError("LEARNING_CANDIDATE_NOT_FOUND");
    if (projectId !== undefined && candidate.project_id !== projectId)
      throw new OptimizationLearningError("CROSS_PROJECT_SCOPE_DENIED");
    return candidate;
  }

  private version(candidate: LearningCandidate, expected: number): void {
    if (candidate.version !== expected)
      throw new OptimizationLearningError(
        "LEARNING_CANDIDATE_VERSION_MISMATCH",
      );
  }

  private hash(candidate: LearningCandidate, expected: string): void {
    if (candidate.candidate_hash !== expected)
      throw new OptimizationLearningError("LEARNING_CANDIDATE_HASH_MISMATCH");
  }

  private mergeEvidence(
    candidate: LearningCandidate,
    values: readonly string[],
  ): readonly string[] {
    return freeze([...new Set([...candidate.evidence_refs, ...values])]);
  }

  private update(
    current: Readonly<LearningCandidate>,
    change: Partial<LearningCandidate>,
  ): Readonly<LearningCandidate> {
    const updated = freeze({
      ...current,
      ...change,
      updated_at: this.now().toISOString(),
      version: current.version + 1,
    });
    this.candidates.set(updated.id, updated);
    return updated;
  }

  private proof(
    input: {
      actor: OptimizationActor;
      correlation_id: string;
      evidence_refs: readonly string[];
    },
    name: string,
    action: string,
    id: string,
    type: OptimizationEvent["resource_type"],
  ): void {
    this.eventLog.push(
      freeze({
        correlation_id: input.correlation_id,
        evidence_refs: freeze([...input.evidence_refs]),
        name,
        occurred_at: this.now().toISOString(),
        resource_id: id,
        resource_type: type,
      }),
    );
    this.auditLog.push(
      freeze({
        action,
        actor: freeze({ ...input.actor }),
        correlation_id: input.correlation_id,
        evidence_refs: freeze([...input.evidence_refs]),
        result: "SUCCEEDED" as const,
        target: freeze({ id, type }),
      }),
    );
  }

  private deny<T>(
    input: {
      actor: OptimizationActor;
      correlation_id: string;
      evidence_refs?: readonly string[];
    },
    code: string,
    id: string,
    type: OptimizationEvent["resource_type"],
  ): T {
    this.auditLog.push(
      freeze({
        action: code,
        actor: freeze({ ...input.actor }),
        correlation_id: input.correlation_id,
        evidence_refs: freeze([...(input.evidence_refs ?? [])]),
        result: "DENIED" as const,
        target: freeze({ id, type }),
      }),
    );
    throw new OptimizationLearningError(code);
  }
}
