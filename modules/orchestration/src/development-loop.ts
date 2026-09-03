import type { ActorType, GovernanceDecision } from "@maos/contracts";
import type { WorkEngine } from "./index.js";

export type DevelopmentLoopAgentRole =
  | "DEVELOPMENT_LEAD"
  | "REQUIREMENT_PRODUCT_AGENT"
  | "ARCHITECTURE_AGENT"
  | "UI_UX_AGENT"
  | "FRONTEND_AGENT"
  | "BACKEND_AGENT"
  | "DATABASE_AGENT"
  | "FUNCTIONAL_TEST_AGENT"
  | "UX_QA_AGENT"
  | "SECURITY_REVIEW_AGENT"
  | "DEVOPS_DEPLOYMENT_AGENT";

export interface DevelopmentLoopTeamPort {
  assignTask(input: {
    agent_id: string;
    assigned_by: { id: string; type: ActorType };
    correlation_id: string;
    id: string;
    required_skill_ids: readonly string[];
    required_tool_capability: string;
    task_id: string;
    task_scope: string;
    task_type: string;
  }): unknown;
  listMembers(): readonly {
    agent_id: string;
    role: DevelopmentLoopAgentRole;
  }[];
  releaseAssignment(assignmentId: string, agentId: string): unknown;
}

export const DEVELOPMENT_LOOP_STAGES = [
  "REQUIREMENT",
  "PLAN",
  "IMPLEMENT",
  "TEST",
  "QA",
  "REVISE",
  "RETEST",
  "HUMAN_APPROVAL",
  "DEPLOY_PREPARATION",
  "VERIFY",
  "LEARN",
] as const;

export const DEVELOPMENT_LOOP_STOP_CONDITIONS = [
  "GOAL_REACHED",
  "MAX_ITERATIONS",
  "TIME_BUDGET_EXCEEDED",
  "COST_BUDGET_EXCEEDED",
  "RISK_ESCALATION",
  "WAITING_HUMAN",
  "APPROVAL_REQUIRED",
  "NO_PROGRESS",
  "KILL_SWITCH",
  "FATAL_ERROR",
] as const;

export type DevelopmentLoopStage = (typeof DEVELOPMENT_LOOP_STAGES)[number];
export type DevelopmentLoopStopCondition =
  (typeof DEVELOPMENT_LOOP_STOP_CONDITIONS)[number];
export type DevelopmentLoopStatus =
  | "CREATED"
  | "RUNNING"
  | "PAUSED"
  | "WAITING_HUMAN"
  | "WAITING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "ESCALATED";
export type DevelopmentLoopEvaluation =
  | "PASS"
  | "REVISE"
  | "WAITING_HUMAN"
  | "NO_PROGRESS"
  | "RISK_ESCALATION"
  | "KILL_SWITCH"
  | "FATAL_ERROR";

export interface DevelopmentLoopDefinition {
  allowed_tool_capabilities: readonly string[];
  id: string;
  implementation_role: Extract<
    DevelopmentLoopAgentRole,
    "FRONTEND_AGENT" | "BACKEND_AGENT" | "DATABASE_AGENT"
  >;
  max_cost_amount: number;
  max_iterations: number;
  name: string;
  no_progress_limit: number;
  time_budget_ms: number;
  version: number;
}

export interface LoopTaskReference {
  agent_id: string | null;
  assignment_id: string | null;
  id: string;
  stage: DevelopmentLoopStage;
  task_type: string;
}

export interface LoopUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface DevelopmentLoopRun {
  active_agent_id: string | null;
  active_assignment_id: string | null;
  approval_id: string | null;
  artifact_ids: readonly string[];
  cost_amount: number;
  definition_id: string;
  definition_version: number;
  evidence_ids: readonly string[];
  id: string;
  iteration: number;
  no_progress_count: number;
  project_id: string;
  stage: DevelopmentLoopStage;
  started_at: string;
  status: DevelopmentLoopStatus;
  stop_condition: DevelopmentLoopStopCondition | null;
  tasks: readonly LoopTaskReference[];
  trigger: { id: string; type: "HUMAN_REQUEST" | "TASK" | "WORKFLOW" };
  usage: LoopUsage;
}

export interface DevelopmentLoopEvent {
  action: string;
  actor: { id: string; type: ActorType };
  aggregate_id: string;
  correlation_id: string;
  evidence_refs: readonly string[];
  name: string;
  project_id: string;
  target: { id: string; type: "DEVELOPMENT_LOOP_RUN" };
}

export interface DevelopmentLoopMutation {
  entity: DevelopmentLoopRun;
  event: DevelopmentLoopEvent;
}

export class DevelopmentLoopError extends Error {
  constructor(
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

type StagePlan = {
  role: DevelopmentLoopAgentRole | "HUMAN";
  skill: string | null;
  task_type: string;
  tool: string | null;
};

const IMPLEMENTATION_SKILLS = {
  BACKEND_AGENT: "backend-development",
  DATABASE_AGENT: "database-development",
  FRONTEND_AGENT: "frontend-development",
} as const;

const stagePlan = (
  stage: DevelopmentLoopStage,
  implementationRole: DevelopmentLoopDefinition["implementation_role"],
): StagePlan => {
  const plans: Record<DevelopmentLoopStage, StagePlan> = {
    REQUIREMENT: {
      role: "REQUIREMENT_PRODUCT_AGENT",
      skill: "requirements-analysis",
      task_type: "PLANNING",
      tool: "READ_FILE",
    },
    PLAN: {
      role: "DEVELOPMENT_LEAD",
      skill: "requirements-analysis",
      task_type: "PLANNING",
      tool: "READ_FILE",
    },
    IMPLEMENT: {
      role: implementationRole,
      skill: IMPLEMENTATION_SKILLS[implementationRole],
      task_type:
        implementationRole === "DATABASE_AGENT" ? "DATABASE" : "DEVELOPMENT",
      tool: "READ_FILE",
    },
    TEST: {
      role: "FUNCTIONAL_TEST_AGENT",
      skill: "software-testing",
      task_type: "TEST",
      tool: "RUN_COMMAND",
    },
    QA: {
      role: "UX_QA_AGENT",
      skill: "visual-qa",
      task_type: "QA",
      tool: "READ_FILE",
    },
    REVISE: {
      role: implementationRole,
      skill: IMPLEMENTATION_SKILLS[implementationRole],
      task_type:
        implementationRole === "DATABASE_AGENT" ? "DATABASE" : "DEVELOPMENT",
      tool: "READ_FILE",
    },
    RETEST: {
      role: "FUNCTIONAL_TEST_AGENT",
      skill: "software-testing",
      task_type: "TEST",
      tool: "RUN_COMMAND",
    },
    HUMAN_APPROVAL: {
      role: "HUMAN",
      skill: null,
      task_type: "APPROVAL_PREPARATION",
      tool: null,
    },
    DEPLOY_PREPARATION: {
      role: "DEVOPS_DEPLOYMENT_AGENT",
      skill: "deployment-preparation",
      task_type: "DEPLOYMENT",
      tool: "READ_FILE",
    },
    VERIFY: {
      role: "FUNCTIONAL_TEST_AGENT",
      skill: "software-testing",
      task_type: "VERIFICATION",
      tool: "READ_FILE",
    },
    LEARN: {
      role: "REQUIREMENT_PRODUCT_AGENT",
      skill: "requirements-analysis",
      task_type: "ANALYSIS",
      tool: "READ_FILE",
    },
  };
  return plans[stage];
};

const nextStage = (
  stage: DevelopmentLoopStage,
  outcome: DevelopmentLoopEvaluation,
): DevelopmentLoopStage | null => {
  if (stage === "QA") return outcome === "REVISE" ? "REVISE" : "HUMAN_APPROVAL";
  if (stage === "REVISE") return "RETEST";
  if (stage === "RETEST") return "HUMAN_APPROVAL";
  const index = DEVELOPMENT_LOOP_STAGES.indexOf(stage);
  return DEVELOPMENT_LOOP_STAGES[index + 1] ?? null;
};

export class DevelopmentLoopEngine {
  private readonly definitions = new Map<string, DevelopmentLoopDefinition>();
  private readonly runs = new Map<string, DevelopmentLoopRun>();
  private readonly recordedEvents = new Map<string, DevelopmentLoopEvent[]>();

  constructor(
    private readonly work: WorkEngine,
    private readonly team: DevelopmentLoopTeamPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  createDefinition(
    input: DevelopmentLoopDefinition,
  ): DevelopmentLoopDefinition {
    if (
      input.version < 1 ||
      !Number.isSafeInteger(input.version) ||
      input.max_iterations < 1 ||
      !Number.isSafeInteger(input.max_iterations) ||
      input.time_budget_ms <= 0 ||
      input.max_cost_amount <= 0 ||
      input.no_progress_limit < 1 ||
      !Number.isSafeInteger(input.no_progress_limit) ||
      input.allowed_tool_capabilities.length === 0
    )
      throw new DevelopmentLoopError("INVALID_LOOP_DEFINITION");
    if (this.definitions.has(input.id))
      throw new DevelopmentLoopError("LOOP_DEFINITION_ALREADY_EXISTS");
    this.definitions.set(input.id, input);
    return input;
  }

  trigger(input: {
    actor: { id: string; type: ActorType };
    correlation_id: string;
    definition_id: string;
    id: string;
    project_id: string;
    trigger: DevelopmentLoopRun["trigger"];
  }): DevelopmentLoopMutation {
    if (this.runs.has(input.id))
      throw new DevelopmentLoopError("LOOP_RUN_ALREADY_EXISTS");
    const definition = this.definition(input.definition_id);
    const base: DevelopmentLoopRun = {
      active_agent_id: null,
      active_assignment_id: null,
      approval_id: null,
      artifact_ids: [],
      cost_amount: 0,
      definition_id: definition.id,
      definition_version: definition.version,
      evidence_ids: [],
      id: input.id,
      iteration: 1,
      no_progress_count: 0,
      project_id: input.project_id,
      stage: "REQUIREMENT",
      started_at: this.now().toISOString(),
      status: "CREATED",
      stop_condition: null,
      tasks: [],
      trigger: input.trigger,
      usage: { input_tokens: 0, output_tokens: 0 },
    };
    const entity = this.openStage(
      base,
      "REQUIREMENT",
      input.actor,
      input.correlation_id,
    );
    this.runs.set(entity.id, entity);
    return this.mutation(
      entity,
      "DEVELOPMENT_LOOP.TRIGGERED",
      input.actor,
      input.correlation_id,
    );
  }

  evaluate(input: {
    actor: { id: string; type: ActorType };
    artifact_ids: readonly string[];
    correlation_id: string;
    cost_amount: number;
    evidence_ids: readonly string[];
    outcome: DevelopmentLoopEvaluation;
    run_id: string;
    usage: LoopUsage;
  }): DevelopmentLoopMutation {
    const run = this.running(input.run_id);
    if (input.evidence_ids.length === 0)
      throw new DevelopmentLoopError("EVIDENCE_REQUIRED");
    if (
      input.cost_amount < 0 ||
      input.usage.input_tokens < 0 ||
      input.usage.output_tokens < 0
    )
      throw new DevelopmentLoopError("INVALID_USAGE");
    let updated: DevelopmentLoopRun = {
      ...run,
      artifact_ids: [...new Set([...run.artifact_ids, ...input.artifact_ids])],
      cost_amount: run.cost_amount + input.cost_amount,
      evidence_ids: [...new Set([...run.evidence_ids, ...input.evidence_ids])],
      usage: {
        input_tokens: run.usage.input_tokens + input.usage.input_tokens,
        output_tokens: run.usage.output_tokens + input.usage.output_tokens,
      },
    };

    const budgetStop = this.budgetStop(updated);
    if (budgetStop)
      return this.stop(
        updated,
        budgetStop,
        "ESCALATED",
        input.actor,
        input.correlation_id,
      );

    if (input.outcome === "WAITING_HUMAN")
      return this.stop(
        updated,
        "WAITING_HUMAN",
        "WAITING_HUMAN",
        input.actor,
        input.correlation_id,
      );
    if (input.outcome === "KILL_SWITCH")
      return this.stop(
        updated,
        "KILL_SWITCH",
        "CANCELLED",
        input.actor,
        input.correlation_id,
      );
    if (input.outcome === "RISK_ESCALATION")
      return this.stop(
        updated,
        "RISK_ESCALATION",
        "ESCALATED",
        input.actor,
        input.correlation_id,
      );
    if (input.outcome === "FATAL_ERROR")
      return this.stop(
        updated,
        "FATAL_ERROR",
        "FAILED",
        input.actor,
        input.correlation_id,
      );
    if (input.outcome === "NO_PROGRESS") {
      updated = {
        ...updated,
        no_progress_count: updated.no_progress_count + 1,
      };
      if (
        updated.no_progress_count >=
        this.definition(updated.definition_id).no_progress_limit
      )
        return this.stop(
          updated,
          "NO_PROGRESS",
          "ESCALATED",
          input.actor,
          input.correlation_id,
        );
      this.runs.set(updated.id, updated);
      return this.mutation(
        updated,
        "DEVELOPMENT_LOOP.NO_PROGRESS",
        input.actor,
        input.correlation_id,
      );
    }

    const target = nextStage(updated.stage, input.outcome);
    if (!target)
      return this.stop(
        updated,
        "GOAL_REACHED",
        "COMPLETED",
        input.actor,
        input.correlation_id,
      );
    if (updated.stage === "QA" && input.outcome === "REVISE") {
      updated = { ...updated, iteration: updated.iteration + 1 };
      if (
        updated.iteration >
        this.definition(updated.definition_id).max_iterations
      )
        return this.stop(
          updated,
          "MAX_ITERATIONS",
          "ESCALATED",
          input.actor,
          input.correlation_id,
        );
    }
    this.releaseCurrent(updated);
    if (target === "HUMAN_APPROVAL") {
      updated = this.openStage(
        updated,
        target,
        input.actor,
        input.correlation_id,
      );
      updated = {
        ...updated,
        status: "WAITING_APPROVAL",
        stop_condition: "APPROVAL_REQUIRED",
      };
      this.runs.set(updated.id, updated);
      return this.mutation(
        updated,
        "DEVELOPMENT_LOOP.APPROVAL_REQUIRED",
        input.actor,
        input.correlation_id,
      );
    }
    updated = this.openStage(
      updated,
      target,
      input.actor,
      input.correlation_id,
    );
    this.runs.set(updated.id, updated);
    return this.mutation(
      updated,
      "DEVELOPMENT_LOOP.ADVANCED",
      input.actor,
      input.correlation_id,
    );
  }

  approve(input: {
    actor: { id: string; type: ActorType };
    artifact_id: string;
    correlation_id: string;
    decision: GovernanceDecision;
    run_id: string;
  }): DevelopmentLoopMutation {
    const run = this.run(input.run_id);
    if (run.stage !== "HUMAN_APPROVAL" || run.status !== "WAITING_APPROVAL")
      throw new DevelopmentLoopError("LOOP_NOT_WAITING_APPROVAL");
    if (input.actor.type !== "HUMAN" || !input.decision.allowed)
      throw new DevelopmentLoopError("HUMAN_APPROVAL_REQUIRED");
    if (!run.artifact_ids.includes(input.artifact_id))
      throw new DevelopmentLoopError("APPROVAL_TARGET_MISMATCH");
    const approved = {
      ...run,
      approval_id: input.decision.approval_id,
      stop_condition: null,
    };
    const entity = this.openStage(
      approved,
      "DEPLOY_PREPARATION",
      input.actor,
      input.correlation_id,
    );
    this.runs.set(entity.id, entity);
    return this.mutation(
      entity,
      "DEVELOPMENT_LOOP.APPROVED",
      input.actor,
      input.correlation_id,
    );
  }

  pause(
    runId: string,
    actor: { id: string; type: ActorType },
    correlationId: string,
  ) {
    const run = this.running(runId);
    const entity = { ...run, status: "PAUSED" as const };
    this.runs.set(runId, entity);
    return this.mutation(
      entity,
      "DEVELOPMENT_LOOP.PAUSED",
      actor,
      correlationId,
    );
  }

  resume(
    runId: string,
    actor: { id: string; type: ActorType },
    correlationId: string,
  ) {
    const run = this.run(runId);
    if (run.status !== "PAUSED" && run.status !== "WAITING_HUMAN")
      throw new DevelopmentLoopError("LOOP_NOT_RESUMABLE");
    if (actor.type !== "HUMAN")
      throw new DevelopmentLoopError("HUMAN_RESUME_REQUIRED");
    const entity = { ...run, status: "RUNNING" as const, stop_condition: null };
    this.runs.set(runId, entity);
    return this.mutation(
      entity,
      "DEVELOPMENT_LOOP.RESUMED",
      actor,
      correlationId,
    );
  }

  cancel(
    runId: string,
    actor: { id: string; type: ActorType },
    correlationId: string,
  ) {
    const run = this.run(runId);
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(run.status))
      throw new DevelopmentLoopError("LOOP_NOT_CANCELLABLE");
    this.releaseCurrent(run);
    const entity = { ...run, status: "CANCELLED" as const };
    this.runs.set(runId, entity);
    return this.mutation(
      entity,
      "DEVELOPMENT_LOOP.CANCELLED",
      actor,
      correlationId,
    );
  }

  requestTool(runId: string, capability: string): string {
    const definition = this.definition(this.run(runId).definition_id);
    if (!definition.allowed_tool_capabilities.includes(capability))
      throw new DevelopmentLoopError("TOOL_NOT_ALLOWED");
    return capability;
  }

  getRun(id: string): DevelopmentLoopRun {
    return this.run(id);
  }

  listRuns(): DevelopmentLoopRun[] {
    return [...this.runs.values()];
  }

  events(runId: string): DevelopmentLoopEvent[] {
    return [...(this.recordedEvents.get(runId) ?? [])];
  }

  private openStage(
    run: DevelopmentLoopRun,
    stage: DevelopmentLoopStage,
    actor: { id: string; type: ActorType },
    correlationId: string,
  ): DevelopmentLoopRun {
    const definition = this.definition(run.definition_id);
    const plan = stagePlan(stage, definition.implementation_role);
    const taskId = `${run.id}:${stage.toLowerCase()}:${run.iteration}`;
    if (plan.role === "HUMAN") {
      this.work.createTask({
        actor,
        correlation_id: correlationId,
        id: taskId,
        idempotency_key: taskId,
        owner:
          actor.type === "HUMAN"
            ? actor
            : { id: "human-approver", type: "HUMAN" },
        project_id: run.project_id,
        status: "WAITING_APPROVAL",
        task_type: plan.task_type,
        title: `Development loop ${stage}`,
      });
      return {
        ...run,
        active_agent_id: null,
        active_assignment_id: null,
        stage,
        status: "RUNNING",
        tasks: [
          ...run.tasks,
          {
            agent_id: null,
            assignment_id: null,
            id: taskId,
            stage,
            task_type: plan.task_type,
          },
        ],
      };
    }
    const member = this.team
      .listMembers()
      .find((candidate) => candidate.role === plan.role);
    if (!member)
      throw new DevelopmentLoopError("COMPATIBLE_AGENT_NOT_FOUND", {
        role: plan.role,
      });
    if (!plan.tool || !definition.allowed_tool_capabilities.includes(plan.tool))
      throw new DevelopmentLoopError("TOOL_NOT_ALLOWED", {
        capability: plan.tool,
      });
    this.work.createTask({
      actor,
      correlation_id: correlationId,
      id: taskId,
      idempotency_key: taskId,
      owner: { id: member.agent_id, type: "AGENT" },
      project_id: run.project_id,
      status: "READY",
      task_type: plan.task_type,
      title: `Development loop ${stage}`,
    });
    const assignmentId = `${taskId}:assignment`;
    this.team.assignTask({
      agent_id: member.agent_id,
      assigned_by: actor,
      correlation_id: correlationId,
      id: assignmentId,
      required_skill_ids: plan.skill ? [plan.skill] : [],
      required_tool_capability: plan.tool,
      task_id: taskId,
      task_scope: run.project_id,
      task_type: plan.task_type,
    });
    return {
      ...run,
      active_agent_id: member.agent_id,
      active_assignment_id: assignmentId,
      stage,
      status: "RUNNING",
      stop_condition: null,
      tasks: [
        ...run.tasks,
        {
          agent_id: member.agent_id,
          assignment_id: assignmentId,
          id: taskId,
          stage,
          task_type: plan.task_type,
        },
      ],
    };
  }

  private releaseCurrent(run: DevelopmentLoopRun): void {
    if (run.active_agent_id && run.active_assignment_id)
      this.team.releaseAssignment(
        run.active_assignment_id,
        run.active_agent_id,
      );
  }

  private budgetStop(
    run: DevelopmentLoopRun,
  ): DevelopmentLoopStopCondition | null {
    const definition = this.definition(run.definition_id);
    if (
      this.now().getTime() - new Date(run.started_at).getTime() >
      definition.time_budget_ms
    )
      return "TIME_BUDGET_EXCEEDED";
    if (run.cost_amount > definition.max_cost_amount)
      return "COST_BUDGET_EXCEEDED";
    return null;
  }

  private stop(
    run: DevelopmentLoopRun,
    condition: DevelopmentLoopStopCondition,
    status: DevelopmentLoopStatus,
    actor: { id: string; type: ActorType },
    correlationId: string,
  ): DevelopmentLoopMutation {
    this.releaseCurrent(run);
    const entity = {
      ...run,
      active_agent_id: null,
      active_assignment_id: null,
      status,
      stop_condition: condition,
    };
    this.runs.set(entity.id, entity);
    return this.mutation(
      entity,
      `DEVELOPMENT_LOOP.${condition}`,
      actor,
      correlationId,
    );
  }

  private mutation(
    entity: DevelopmentLoopRun,
    name: string,
    actor: { id: string; type: ActorType },
    correlationId: string,
  ): DevelopmentLoopMutation {
    const event: DevelopmentLoopEvent = {
      action: name,
      actor,
      aggregate_id: entity.id,
      correlation_id: correlationId,
      evidence_refs: entity.evidence_ids,
      name,
      project_id: entity.project_id,
      target: { id: entity.id, type: "DEVELOPMENT_LOOP_RUN" },
    };
    this.recordedEvents.set(entity.id, [
      ...(this.recordedEvents.get(entity.id) ?? []),
      event,
    ]);
    return { entity, event };
  }

  private definition(id: string): DevelopmentLoopDefinition {
    const definition = this.definitions.get(id);
    if (!definition)
      throw new DevelopmentLoopError("LOOP_DEFINITION_NOT_FOUND");
    return definition;
  }

  private run(id: string): DevelopmentLoopRun {
    const run = this.runs.get(id);
    if (!run) throw new DevelopmentLoopError("LOOP_RUN_NOT_FOUND");
    return run;
  }

  private running(id: string): DevelopmentLoopRun {
    const run = this.run(id);
    if (run.status !== "RUNNING")
      throw new DevelopmentLoopError("LOOP_NOT_RUNNING", {
        status: run.status,
      });
    return run;
  }
}
