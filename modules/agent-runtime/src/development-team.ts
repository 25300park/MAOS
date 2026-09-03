import type { ActorType, TaskStatus } from "@maos/contracts";
import type {
  AgentLifecycle,
  AgentRuntimeStatus,
  HealthStatus,
  ModelPolicy,
  RunnerPolicy,
} from "./index.js";
import { RuntimeError } from "./runtime-error.js";

export const DEVELOPMENT_AGENT_ROLES = [
  "DEVELOPMENT_LEAD",
  "REQUIREMENT_PRODUCT_AGENT",
  "ARCHITECTURE_AGENT",
  "UI_UX_AGENT",
  "FRONTEND_AGENT",
  "BACKEND_AGENT",
  "DATABASE_AGENT",
  "FUNCTIONAL_TEST_AGENT",
  "UX_QA_AGENT",
  "SECURITY_REVIEW_AGENT",
  "DEVOPS_DEPLOYMENT_AGENT",
] as const;

export type DevelopmentAgentRole = (typeof DEVELOPMENT_AGENT_ROLES)[number];
export type ToolPermissionEffect = "ALLOW" | "DENY" | "ALLOW_WITH_APPROVAL";

export interface DevelopmentRoleContract {
  allowed_task_types: readonly string[];
  approval_policy: string;
  forbidden_task_types: readonly string[];
  handoff_policy: string;
  memory_scope: readonly string[];
  mission: string;
  reporting: string;
  responsibilities: readonly string[];
  skill_ids: readonly string[];
  tool_capabilities: readonly string[];
}

export interface DevelopmentAgentMember {
  agent_id: string;
  current_assignment_id: string | null;
  health: HealthStatus;
  lifecycle: AgentLifecycle;
  model_policy: ModelPolicy;
  role: DevelopmentAgentRole;
  runner_policy: RunnerPolicy;
  runtime_status: AgentRuntimeStatus;
  skill_ids: readonly string[];
  tool_permissions: readonly {
    capability: string;
    effect: ToolPermissionEffect;
    risk: "R0" | "R1" | "R2" | "R3" | "R4";
  }[];
}

export interface DevelopmentAssignment {
  agent_id: string;
  assigned_by: { id: string; type: ActorType };
  id: string;
  status: "ASSIGNED";
  task_id: string;
  task_scope: string;
  task_type: string;
}

export interface DevelopmentTeamEvent {
  actor: { id: string; type: ActorType };
  aggregate_id: string;
  correlation_id: string;
  evidence_refs: readonly string[];
  name: string;
}

export interface DevelopmentTeamMutation<T> {
  entity: T;
  event: DevelopmentTeamEvent;
}

export interface HandoffPackage {
  artifacts: readonly string[];
  confidence: number;
  constraints: readonly string[];
  decisions: readonly string[];
  facts: readonly string[];
  from_agent_id: string;
  id: string;
  open_questions: readonly string[];
  recommended_next_action: string;
  status: "READY" | "ACCEPTED";
  summary: string;
  task_id: string;
  task_scope: string;
  to_agent_id: string;
}

export interface DevelopmentArtifact {
  author_agent_id: string;
  evidence_refs: readonly string[];
  id: string;
  task_id: string;
  version: string;
}

export interface ReviewTask {
  artifact_id: string;
  id: string;
  reviewer_agent_id: string;
  status: Extract<TaskStatus, "REVIEW">;
}

export interface FeedbackArtifact {
  author_agent_id: string;
  id: string;
  review_task_id: string;
  summary: string;
}

export interface RevisionTask {
  feedback_artifact_id: string;
  id: string;
  owner_agent_id: string;
  source_artifact_id: string;
  status: Extract<TaskStatus, "REVISE">;
}

const commonForbidden = ["APPROVAL", "PRODUCTION_EXECUTION"] as const;

const role = (
  mission: string,
  allowed: readonly string[],
  skills: readonly string[],
  tools: readonly string[],
  responsibilities: readonly string[],
): DevelopmentRoleContract => ({
  allowed_task_types: allowed,
  approval_policy:
    "May recommend or prepare; cannot self-approve or grant human authority.",
  forbidden_task_types: commonForbidden,
  handoff_policy:
    "Structured task-scoped package with artifacts, constraints, questions, and evidence.",
  memory_scope: ["PROJECT", "TASK", "ARTIFACT", "POLICY"],
  mission,
  reporting:
    "Report status, blocker, evidence, and next safe action through MAOS records.",
  responsibilities,
  skill_ids: skills,
  tool_capabilities: tools,
});

const ROLE_CONTRACTS: Record<DevelopmentAgentRole, DevelopmentRoleContract> = {
  DEVELOPMENT_LEAD: role(
    "Coordinate governed development delivery without absorbing specialist authority.",
    ["PLANNING", "DEVELOPMENT", "REVIEW", "REPORTING"],
    ["requirements-analysis", "structured-handoff"],
    ["READ_FILE", "GIT_STATUS", "GIT_DIFF"],
    ["assign compatible work", "track blockers", "prepare human decisions"],
  ),
  REQUIREMENT_PRODUCT_AGENT: role(
    "Turn human intent into scoped, testable requirements.",
    ["PLANNING", "ANALYSIS", "RESEARCH"],
    ["requirements-analysis", "structured-handoff"],
    ["READ_FILE"],
    ["clarify scope", "produce requirement artifacts"],
  ),
  ARCHITECTURE_AGENT: role(
    "Assess architecture impact and preserve frozen boundaries.",
    ["ANALYSIS", "DESIGN", "REVIEW"],
    ["system-design", "structured-handoff"],
    ["READ_FILE", "GIT_DIFF"],
    ["review boundaries", "identify change-request requirements"],
  ),
  UI_UX_AGENT: role(
    "Produce accessible interaction and visual design artifacts.",
    ["DESIGN", "QA", "REVIEW"],
    ["visual-qa", "structured-handoff"],
    ["READ_FILE", "BROWSER_INSPECT"],
    ["define interaction", "review accessibility direction"],
  ),
  FRONTEND_AGENT: role(
    "Implement approved client behavior within task and repository scope.",
    ["DEVELOPMENT", "TEST", "REVISE"],
    ["frontend-development", "structured-handoff"],
    ["READ_FILE", "WRITE_FILE", "RUN_COMMAND", "GIT_STATUS", "GIT_DIFF"],
    ["implement frontend", "attach verification evidence"],
  ),
  BACKEND_AGENT: role(
    "Implement approved service behavior and stable contracts.",
    ["DEVELOPMENT", "TEST", "REVISE"],
    ["backend-development", "structured-handoff"],
    ["READ_FILE", "WRITE_FILE", "RUN_COMMAND", "GIT_STATUS", "GIT_DIFF"],
    ["implement backend", "preserve API governance"],
  ),
  DATABASE_AGENT: role(
    "Implement approved schema and migration changes deterministically.",
    ["DATABASE", "TEST", "REVISE"],
    ["database-development", "structured-handoff"],
    ["READ_FILE", "WRITE_FILE", "RUN_COMMAND", "GIT_DIFF"],
    ["author migrations", "verify clean initialization"],
  ),
  FUNCTIONAL_TEST_AGENT: role(
    "Independently verify executable requirements and failures.",
    ["TEST", "VERIFICATION", "REVIEW"],
    ["software-testing", "structured-handoff"],
    ["READ_FILE", "RUN_COMMAND"],
    ["run tests", "produce evidence", "open revision work"],
  ),
  UX_QA_AGENT: role(
    "Independently verify UI behavior, accessibility, and operational clarity.",
    ["QA", "VERIFICATION", "REVIEW"],
    ["visual-qa", "ui-inspection-workflow", "structured-handoff"],
    ["READ_FILE", "BROWSER_INSPECT"],
    ["perform UX QA", "produce feedback artifacts"],
  ),
  SECURITY_REVIEW_AGENT: role(
    "Independently review security boundaries and deny unsafe changes.",
    ["SECURITY", "VERIFICATION", "REVIEW"],
    ["security-review", "structured-handoff"],
    ["READ_FILE", "GIT_DIFF"],
    ["review threats", "record security evidence"],
  ),
  DEVOPS_DEPLOYMENT_AGENT: role(
    "Prepare deployment evidence without executing production deployment.",
    ["DEPLOYMENT", "VERIFICATION", "REPORTING"],
    ["deployment-preparation", "structured-handoff"],
    ["READ_FILE", "RUN_COMMAND", "GIT_STATUS", "GIT_DIFF"],
    ["prepare release artifacts", "prepare rollback evidence"],
  ),
};

type AssignmentInput = Omit<DevelopmentAssignment, "status"> & {
  correlation_id: string;
  approval?: {
    actor_type: ActorType;
    status: string;
    target_id: string;
    validity: string;
  };
  required_skill_ids: readonly string[];
  required_tool_capability: string;
  requires_human_approval?: boolean;
};

type HandoffInput = Omit<HandoffPackage, "status"> & {
  correlation_id: string;
};

export class DevelopmentAgentTeam {
  private readonly members = new Map<string, DevelopmentAgentMember>();
  private readonly assignments = new Map<string, DevelopmentAssignment>();
  private readonly handoffs = new Map<string, HandoffPackage>();
  private readonly artifacts = new Map<string, DevelopmentArtifact>();
  private readonly reviews = new Map<string, ReviewTask>();
  private readonly feedback = new Map<string, FeedbackArtifact>();

  getRoleContract(roleId: DevelopmentAgentRole): DevelopmentRoleContract {
    return ROLE_CONTRACTS[roleId];
  }

  registerMember(input: DevelopmentAgentMember): DevelopmentAgentMember {
    if (!DEVELOPMENT_AGENT_ROLES.includes(input.role))
      throw new RuntimeError("UNKNOWN_DEVELOPMENT_ROLE");
    if (
      input.model_policy.model_ids.includes(input.agent_id) ||
      input.runner_policy.runner_ids.includes(input.agent_id) ||
      input.model_policy.model_ids.some((id) =>
        input.runner_policy.runner_ids.includes(id),
      )
    )
      throw new RuntimeError("IDENTITY_BOUNDARY_VIOLATION");
    const contract = this.getRoleContract(input.role);
    if (
      input.model_policy.model_ids.length === 0 ||
      input.runner_policy.runner_ids.length === 0 ||
      !contract.skill_ids.every((id) => input.skill_ids.includes(id)) ||
      !input.tool_permissions.every((permission) =>
        contract.tool_capabilities.includes(permission.capability),
      )
    )
      throw new RuntimeError("ROLE_CAPABILITY_INCOMPLETE");
    if (this.members.has(input.agent_id))
      throw new RuntimeError("DEVELOPMENT_AGENT_ALREADY_EXISTS");
    this.members.set(input.agent_id, input);
    return input;
  }

  listMembers(): DevelopmentAgentMember[] {
    return [...this.members.values()];
  }

  suspendMember(agentId: string): DevelopmentAgentMember {
    const current = this.member(agentId);
    const updated = {
      ...current,
      lifecycle: "SUSPENDED" as const,
      runtime_status: "OFFLINE" as const,
    };
    this.members.set(agentId, updated);
    return updated;
  }

  assignTask(
    input: AssignmentInput,
  ): DevelopmentTeamMutation<DevelopmentAssignment> {
    const member = this.member(input.agent_id);
    const contract = this.getRoleContract(member.role);
    if (
      member.lifecycle !== "ACTIVE" ||
      member.runtime_status !== "AVAILABLE" ||
      member.health !== "HEALTHY" ||
      member.current_assignment_id !== null
    )
      throw new RuntimeError("AGENT_UNAVAILABLE");
    if (
      contract.forbidden_task_types.includes(input.task_type) ||
      !contract.allowed_task_types.includes(input.task_type)
    )
      throw new RuntimeError("ROLE_TASK_FORBIDDEN");
    if (!input.required_skill_ids.every((id) => member.skill_ids.includes(id)))
      throw new RuntimeError("SKILL_NOT_ALLOWED");
    const permission = member.tool_permissions.find(
      (candidate) => candidate.capability === input.required_tool_capability,
    );
    if (!permission || permission.effect === "DENY")
      throw new RuntimeError("TOOL_PERMISSION_DENIED");
    if (
      permission.effect === "ALLOW_WITH_APPROVAL" ||
      input.requires_human_approval
    ) {
      const approval = input.approval;
      if (
        !approval ||
        approval.actor_type !== "HUMAN" ||
        approval.status !== "APPROVED" ||
        approval.validity !== "VALID" ||
        approval.target_id !== input.task_id
      )
        throw new RuntimeError("HUMAN_APPROVAL_REQUIRED");
    }
    const entity: DevelopmentAssignment = {
      agent_id: input.agent_id,
      assigned_by: input.assigned_by,
      id: input.id,
      status: "ASSIGNED",
      task_id: input.task_id,
      task_scope: input.task_scope,
      task_type: input.task_type,
    };
    this.assignments.set(entity.id, entity);
    this.members.set(member.agent_id, {
      ...member,
      current_assignment_id: entity.id,
      runtime_status: "WORKING",
    });
    return {
      entity,
      event: this.event(
        "DEVELOPMENT_AGENT.ASSIGNED",
        entity.id,
        input.correlation_id,
        input.assigned_by,
      ),
    };
  }

  createHandoff(input: HandoffInput): DevelopmentTeamMutation<HandoffPackage> {
    this.member(input.from_agent_id);
    this.member(input.to_agent_id);
    if (input.from_agent_id === input.to_agent_id)
      throw new RuntimeError("HANDOFF_SEPARATION_REQUIRED");
    if (
      !input.summary ||
      !input.recommended_next_action ||
      input.artifacts.length === 0 ||
      input.confidence < 0 ||
      input.confidence > 1
    )
      throw new RuntimeError("INCOMPLETE_HANDOFF");
    const entity: HandoffPackage = {
      artifacts: input.artifacts,
      confidence: input.confidence,
      constraints: input.constraints,
      decisions: input.decisions,
      facts: input.facts,
      from_agent_id: input.from_agent_id,
      id: input.id,
      open_questions: input.open_questions,
      recommended_next_action: input.recommended_next_action,
      status: "READY",
      summary: input.summary,
      task_id: input.task_id,
      task_scope: input.task_scope,
      to_agent_id: input.to_agent_id,
    };
    this.handoffs.set(entity.id, entity);
    return {
      entity,
      event: this.event(
        "DEVELOPMENT_HANDOFF.CREATED",
        entity.id,
        input.correlation_id,
        { id: input.from_agent_id, type: "AGENT" },
        entity.artifacts,
      ),
    };
  }

  acceptHandoff(
    id: string,
    agentId: string,
    taskScope: string,
  ): HandoffPackage {
    const handoff = this.handoffs.get(id);
    if (!handoff) throw new RuntimeError("HANDOFF_NOT_FOUND");
    if (handoff.to_agent_id !== agentId)
      throw new RuntimeError("HANDOFF_RECIPIENT_MISMATCH");
    if (handoff.task_scope !== taskScope)
      throw new RuntimeError("HANDOFF_SCOPE_MISMATCH");
    const accepted = { ...handoff, status: "ACCEPTED" as const };
    this.handoffs.set(id, accepted);
    return accepted;
  }

  recordArtifact(input: DevelopmentArtifact): DevelopmentArtifact {
    this.member(input.author_agent_id);
    if (input.evidence_refs.length === 0 || !input.version)
      throw new RuntimeError("ARTIFACT_EVIDENCE_REQUIRED");
    this.artifacts.set(input.id, input);
    return input;
  }

  createReviewTask(input: Omit<ReviewTask, "status">): ReviewTask {
    const artifact = this.artifacts.get(input.artifact_id);
    if (!artifact) throw new RuntimeError("ARTIFACT_NOT_FOUND");
    const reviewer = this.member(input.reviewer_agent_id);
    if (artifact.author_agent_id === input.reviewer_agent_id)
      throw new RuntimeError("REVIEW_SEPARATION_REQUIRED");
    if (
      ![
        "ARCHITECTURE_AGENT",
        "FUNCTIONAL_TEST_AGENT",
        "UX_QA_AGENT",
        "SECURITY_REVIEW_AGENT",
      ].includes(reviewer.role)
    )
      throw new RuntimeError("REVIEW_ROLE_REQUIRED");
    const review = { ...input, status: "REVIEW" as const };
    this.reviews.set(input.id, review);
    return review;
  }

  recordFeedbackArtifact(input: FeedbackArtifact): FeedbackArtifact {
    const review = this.reviews.get(input.review_task_id);
    if (!review) throw new RuntimeError("REVIEW_TASK_NOT_FOUND");
    if (review.reviewer_agent_id !== input.author_agent_id)
      throw new RuntimeError("FEEDBACK_AUTHOR_MISMATCH");
    this.feedback.set(input.id, input);
    return input;
  }

  createRevisionTask(
    input: Omit<RevisionTask, "source_artifact_id" | "status">,
  ): RevisionTask {
    const feedback = this.feedback.get(input.feedback_artifact_id);
    if (!feedback) throw new RuntimeError("FEEDBACK_ARTIFACT_NOT_FOUND");
    const review = this.reviews.get(feedback.review_task_id)!;
    const artifact = this.artifacts.get(review.artifact_id)!;
    if (artifact.author_agent_id !== input.owner_agent_id)
      throw new RuntimeError("REVISION_OWNER_MISMATCH");
    return {
      ...input,
      source_artifact_id: artifact.id,
      status: "REVISE",
    };
  }

  recordHumanApproval(input: {
    actor_id: string;
    actor_type: ActorType;
    artifact_id: string;
    artifact_version: string;
    id: string;
  }): typeof input {
    if (input.actor_type !== "HUMAN")
      throw new RuntimeError("HUMAN_APPROVAL_REQUIRED");
    const artifact = this.artifacts.get(input.artifact_id);
    if (!artifact || artifact.version !== input.artifact_version)
      throw new RuntimeError("APPROVAL_TARGET_MISMATCH");
    return input;
  }

  private member(id: string): DevelopmentAgentMember {
    const member = this.members.get(id);
    if (!member) throw new RuntimeError("DEVELOPMENT_AGENT_NOT_FOUND");
    return member;
  }

  private event(
    name: string,
    aggregateId: string,
    correlationId: string,
    actor: { id: string; type: ActorType },
    evidenceRefs: readonly string[] = [],
  ): DevelopmentTeamEvent {
    return {
      actor,
      aggregate_id: aggregateId,
      correlation_id: correlationId,
      evidence_refs: evidenceRefs,
      name,
    };
  }
}
