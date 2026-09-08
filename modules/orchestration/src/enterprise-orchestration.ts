import { createHash } from "node:crypto";
import type { ActorType, GovernanceDecision } from "@maos/contracts";

export type EnterpriseHealth =
  "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "MAINTENANCE" | "UNKNOWN";
export type EnterpriseSignalType =
  | "CRM_DEMAND"
  | "AI_MLS_MARKET"
  | "CRM_RBS_TRANSACTION"
  | "HR_EVENT"
  | "CONTRACT_ISSUE"
  | "SYSTEM_DEFECT";
export type EnterpriseTeam =
  | "DEVELOPMENT"
  | "MARKETING"
  | "ACCOUNTING_TAX"
  | "HR_LABOR"
  | "LEGAL_REGULATORY"
  | "CRM_HUMAN"
  | "AI_MLS";
export type EnterpriseWorkMode =
  "HUMAN_ONLY" | "AI_LOW_RISK" | "HUMAN_REVIEW" | "HUMAN_APPROVAL" | "MIXED";

export interface EnterpriseActor {
  id: string;
  type: ActorType;
}
export interface EnterpriseSystemReference {
  health: EnterpriseHealth;
  id: string;
  source_of_truth: "MAOS" | "DOMAIN_SYSTEM";
}
export interface CompanyGoal {
  evidence_refs: readonly string[];
  id: string;
  kpi_references: readonly string[];
  linked_project_ids: readonly string[];
  linked_system_ids: readonly string[];
  owner_id: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: "DRAFT" | "ACTIVE" | "AT_RISK" | "ACHIEVED" | "CANCELLED";
  target: string;
  timeframe: { end: string; start: string };
  version: number;
}
export interface EnterpriseSignal {
  classification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  evidence_refs: readonly string[];
  id: string;
  observed_at: string;
  project_id: string;
  provenance_reference: string;
  source_system_id: string;
  status: "OPEN" | "PLANNED" | "DISMISSED";
  target_system_id: string;
  type: EnterpriseSignalType;
  version: number;
}
export interface EnterpriseApprovalRequirement {
  action: string;
  approval_id: string;
  environment: "DEVELOPMENT" | "PREVIEW" | "STAGING" | "PRODUCTION";
}
export interface EnterpriseTask {
  allowed_tools: readonly string[];
  approval?: EnterpriseApprovalRequirement | undefined;
  dependencies: readonly string[];
  environment: "DEVELOPMENT" | "PREVIEW" | "STAGING";
  evidence_refs: readonly string[];
  expected_evidence: readonly string[];
  external_mutation_performed: false;
  id: string;
  permission: string;
  purpose: string;
  risk: "R0" | "R1" | "R2" | "R3" | "R4";
  source_system_id: string;
  status:
    | "READY"
    | "WAITING_DEPENDENCY"
    | "WAITING_APPROVAL"
    | "IN_PROGRESS"
    | "BLOCKED"
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED";
  target_system_id: string;
  team: EnterpriseTeam;
  version: number;
  work_mode: EnterpriseWorkMode;
}
export interface EnterprisePlan {
  evidence_refs: readonly string[];
  goal_id: string;
  id: string;
  project_id: string;
  signal_id: string;
  status:
    | "PLANNED"
    | "RUNNING"
    | "WAITING_HUMAN"
    | "BLOCKED"
    | "COMPLETED"
    | "CANCELLED";
  tasks: readonly EnterpriseTask[];
  version: number;
}
export interface EnterpriseLoop {
  allowed_actor_ids: readonly string[];
  cost_amount: number;
  goal_id: string;
  id: string;
  iteration: number;
  max_cost_amount: number;
  max_iterations: number;
  no_progress_count: number;
  no_progress_limit: number;
  owner_id: string;
  project_id: string;
  started_at: string;
  status: "RUNNING" | "PAUSED" | "STOPPED" | "CANCELLED";
  stop_condition:
    | "GOAL_REACHED"
    | "MAX_ITERATIONS"
    | "TIME_BUDGET_EXCEEDED"
    | "COST_BUDGET_EXCEEDED"
    | "RISK_ESCALATION"
    | "WAITING_HUMAN"
    | "APPROVAL_REQUIRED"
    | "NO_PROGRESS"
    | "KILL_SWITCH"
    | "FATAL_ERROR"
    | null;
  time_budget_ms: number;
  version: number;
}
export interface EnterpriseEvent {
  correlation_id: string;
  evidence_refs: readonly string[];
  name: string;
  occurred_at: string;
  project_id?: string;
  resource_id: string;
  resource_type: string;
  source_system_id?: string;
  target_system_id?: string;
}
export interface EnterpriseAudit {
  action: string;
  actor: EnterpriseActor;
  correlation_id: string;
  evidence_refs: readonly string[];
  result: "SUCCEEDED" | "DENIED" | "FAILED";
  target: { id: string; type: string };
}
export interface EnterpriseApprovalPort {
  evaluate(input: {
    actor: EnterpriseActor;
    approval_id: string;
    target: {
      action: string;
      environment: string;
      hash: string;
      plan_id: string;
      project_id: string;
      source_system_id: string;
      target_system_id: string;
      task_id: string;
      version: number;
    };
  }): GovernanceDecision;
}

export class EnterpriseOrchestrationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "EnterpriseOrchestrationError";
  }
}

const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const timestamp = (value: string) => Number.isFinite(Date.parse(value));
const refs = (values: unknown, prefix: string): values is readonly string[] =>
  Array.isArray(values) &&
  values.length > 0 &&
  values.every(
    (value) =>
      typeof value === "string" &&
      value.length > prefix.length &&
      value.startsWith(prefix),
  );
const frozen = <T extends object>(value: T): Readonly<T> =>
  Object.freeze(value);
const SIGNAL_PAIRS: Readonly<
  Record<EnterpriseSignalType, readonly [string, string]>
> = {
  AI_MLS_MARKET: ["ai-mls", "marketing-automation"],
  CONTRACT_ISSUE: ["crm", "ph-legal-regulatory"],
  CRM_DEMAND: ["crm", "ai-mls"],
  CRM_RBS_TRANSACTION: ["rbs-homes", "erp"],
  HR_EVENT: ["erp-hr", "erp"],
  SYSTEM_DEFECT: ["maos", "maos"],
};

export class EnterpriseOrchestrationService {
  private readonly systems = new Map<
    string,
    Readonly<EnterpriseSystemReference>
  >();
  private readonly goals = new Map<string, Readonly<CompanyGoal>>();
  private readonly signals = new Map<string, Readonly<EnterpriseSignal>>();
  private readonly plans = new Map<string, Readonly<EnterprisePlan>>();
  private readonly loops = new Map<string, Readonly<EnterpriseLoop>>();
  private readonly eventLog: Readonly<EnterpriseEvent>[] = [];
  private readonly auditLog: Readonly<EnterpriseAudit>[] = [];

  constructor(
    systems: readonly EnterpriseSystemReference[],
    private readonly now: () => Date = () => new Date(),
    private readonly approval?: EnterpriseApprovalPort,
  ) {
    if (
      systems.length === 0 ||
      new Set(systems.map(({ id }) => id)).size !== systems.length
    )
      throw new EnterpriseOrchestrationError("INVALID_ENTERPRISE_SYSTEM_GRAPH");
    for (const system of systems) {
      if (!nonempty(system.id))
        throw new EnterpriseOrchestrationError(
          "INVALID_ENTERPRISE_SYSTEM_GRAPH",
        );
      if (system.id !== "maos" && system.source_of_truth !== "DOMAIN_SYSTEM")
        throw new EnterpriseOrchestrationError(
          "DOMAIN_SOURCE_OF_TRUTH_TAKEOVER_DENIED",
        );
      this.systems.set(system.id, frozen({ ...system }));
    }
  }

  systemGraph() {
    return [...this.systems.values()].map((system) => ({ ...system }));
  }

  createGoal(input: {
    actor: EnterpriseActor;
    correlation_id: string;
    evidence_refs: readonly string[];
    goal_id: string;
    kpi_references: readonly string[];
    linked_project_ids: readonly string[];
    linked_system_ids: readonly string[];
    owner_id: string;
    priority: CompanyGoal["priority"];
    status: CompanyGoal["status"];
    target: string;
    timeframe: CompanyGoal["timeframe"];
  }): Readonly<CompanyGoal> {
    if (
      input.actor.type !== "HUMAN" ||
      input.actor.id !== input.owner_id ||
      !nonempty(input.goal_id) ||
      !nonempty(input.target) ||
      !refs(input.evidence_refs, "evidence://") ||
      !refs(input.kpi_references, "kpi://") ||
      !Array.isArray(input.linked_project_ids) ||
      input.linked_project_ids.length === 0 ||
      !Array.isArray(input.linked_system_ids) ||
      input.linked_system_ids.length === 0 ||
      input.linked_system_ids.some((id) => !this.systems.has(id)) ||
      !timestamp(input.timeframe.start) ||
      !timestamp(input.timeframe.end) ||
      Date.parse(input.timeframe.end) <= Date.parse(input.timeframe.start) ||
      this.goals.has(input.goal_id)
    )
      return this.deny(
        input,
        "INVALID_COMPANY_GOAL",
        input.goal_id,
        "COMPANY_GOAL",
      );
    const goal = frozen({
      evidence_refs: frozen([...input.evidence_refs]),
      id: input.goal_id,
      kpi_references: frozen([...input.kpi_references]),
      linked_project_ids: frozen([...input.linked_project_ids]),
      linked_system_ids: frozen([...input.linked_system_ids]),
      owner_id: input.owner_id,
      priority: input.priority,
      status: input.status,
      target: input.target,
      timeframe: frozen({ ...input.timeframe }),
      version: 1,
    });
    this.goals.set(goal.id, goal);
    this.proof(
      input,
      "COMPANY_GOAL.CREATED",
      "CREATE_COMPANY_GOAL",
      goal.id,
      "COMPANY_GOAL",
    );
    return goal;
  }

  recordSignal(input: {
    actor: EnterpriseActor;
    classification: EnterpriseSignal["classification"];
    correlation_id: string;
    evidence_refs: readonly string[];
    observed_at: string;
    project_id: string;
    provenance_reference: string;
    signal_id: string;
    source_system_id: string;
    target_system_id: string;
    type: EnterpriseSignalType;
  }): Readonly<EnterpriseSignal> {
    const pair = SIGNAL_PAIRS[input.type];
    const observedAt = Date.parse(input.observed_at);
    const ageMs = this.now().getTime() - observedAt;
    if (Number.isFinite(observedAt) && (ageMs < 0 || ageMs > 86_400_000))
      return this.deny(
        input,
        "ENTERPRISE_SIGNAL_STALE",
        input.signal_id,
        "SIGNAL",
      );
    if (
      !pair ||
      pair[0] !== input.source_system_id ||
      pair[1] !== input.target_system_id ||
      !this.systems.has(input.source_system_id) ||
      !this.systems.has(input.target_system_id) ||
      !nonempty(input.project_id) ||
      !timestamp(input.observed_at) ||
      !nonempty(input.provenance_reference) ||
      !refs(input.evidence_refs, "evidence://") ||
      input.classification === "RESTRICTED" ||
      this.signals.has(input.signal_id)
    )
      return this.deny(
        input,
        "INVALID_ENTERPRISE_SIGNAL",
        input.signal_id,
        "SIGNAL",
      );
    const signal = frozen({
      classification: input.classification,
      evidence_refs: frozen([...input.evidence_refs]),
      id: input.signal_id,
      observed_at: input.observed_at,
      project_id: input.project_id,
      provenance_reference: input.provenance_reference,
      source_system_id: input.source_system_id,
      status: "OPEN" as const,
      target_system_id: input.target_system_id,
      type: input.type,
      version: 1,
    });
    this.signals.set(signal.id, signal);
    this.proof(
      input,
      "ENTERPRISE_SIGNAL.RECORDED",
      "RECORD_ENTERPRISE_SIGNAL",
      signal.id,
      "SIGNAL",
    );
    return signal;
  }

  createPlan(input: {
    actor: EnterpriseActor;
    correlation_id: string;
    evidence_refs: readonly string[];
    goal_id: string;
    plan_id: string;
    project_id: string;
    signal_id: string;
    tasks: readonly Omit<
      EnterpriseTask,
      "evidence_refs" | "external_mutation_performed" | "status" | "version"
    >[];
  }): Readonly<EnterprisePlan> {
    if (
      input.tasks.some(
        (task) => task.approval?.environment.toUpperCase() === "PRODUCTION",
      )
    )
      return this.deny(
        input,
        "PRODUCTION_ACTION_DENIED",
        input.plan_id,
        "ORCHESTRATION_PLAN",
      );
    const goal = this.goals.get(input.goal_id);
    const signal = this.signals.get(input.signal_id);
    const taskIds = new Set(input.tasks.map(({ id }) => id));
    const invalidTask = input.tasks.some(
      (task) =>
        !nonempty(task.id) ||
        !this.systems.has(task.source_system_id) ||
        !this.systems.has(task.target_system_id) ||
        task.allowed_tools.length === 0 ||
        !nonempty(task.purpose) ||
        !nonempty(task.permission) ||
        !["R0", "R1", "R2", "R3", "R4"].includes(task.risk) ||
        !["DEVELOPMENT", "PREVIEW", "STAGING"].includes(task.environment) ||
        (["R2", "R3", "R4"].includes(task.risk) &&
          task.approval === undefined) ||
        (task.work_mode === "HUMAN_APPROVAL" && task.approval === undefined) ||
        (task.approval !== undefined &&
          task.approval.environment !== task.environment) ||
        !refs(task.expected_evidence, "evidence://") ||
        task.dependencies.some((id) => !taskIds.has(id) || id === task.id),
    );
    if (
      input.actor.type !== "HUMAN" ||
      !goal ||
      !signal ||
      !goal.linked_project_ids.includes(input.project_id) ||
      signal.project_id !== input.project_id ||
      input.tasks.length === 0 ||
      taskIds.size !== input.tasks.length ||
      invalidTask ||
      this.hasCycle(input.tasks) ||
      !refs(input.evidence_refs, "evidence://") ||
      this.plans.has(input.plan_id)
    )
      return this.deny(
        input,
        "INVALID_ENTERPRISE_PLAN",
        input.plan_id,
        "ORCHESTRATION_PLAN",
      );
    const tasks = input.tasks.map((task): EnterpriseTask => ({
      allowed_tools: [...task.allowed_tools],
      approval: task.approval ? { ...task.approval } : undefined,
      dependencies: [...task.dependencies],
      environment: task.environment,
      evidence_refs: [],
      expected_evidence: [...task.expected_evidence],
      external_mutation_performed: false,
      id: task.id,
      permission: task.permission,
      purpose: task.purpose,
      risk: task.risk,
      source_system_id: task.source_system_id,
      status:
        task.dependencies.length > 0
          ? "WAITING_DEPENDENCY"
          : task.approval
            ? "WAITING_APPROVAL"
            : "READY",
      target_system_id: task.target_system_id,
      team: task.team,
      version: 1,
      work_mode: task.work_mode,
    }));
    const plan = this.storePlan({
      evidence_refs: [...input.evidence_refs],
      goal_id: input.goal_id,
      id: input.plan_id,
      project_id: input.project_id,
      signal_id: input.signal_id,
      status: "PLANNED",
      tasks,
      version: 1,
    });
    this.signals.set(
      signal.id,
      frozen({ ...signal, status: "PLANNED", version: signal.version + 1 }),
    );
    this.proof(
      input,
      "ORCHESTRATION_PLAN.CREATED",
      "CREATE_ORCHESTRATION_PLAN",
      plan.id,
      "ORCHESTRATION_PLAN",
    );
    return plan;
  }

  executeTask(input: {
    actor: EnterpriseActor;
    approval_id?: string;
    correlation_id: string;
    evidence_refs: readonly string[];
    expected_version: number;
    permission_allowed: boolean;
    plan_id: string;
    task_id: string;
  }): Readonly<EnterpriseTask> {
    const plan = this.plan(input.plan_id);
    const task = plan.tasks.find(({ id }) => id === input.task_id);
    if (!task)
      throw new EnterpriseOrchestrationError("ENTERPRISE_TASK_NOT_FOUND");
    if (task.version !== input.expected_version)
      return this.deny(
        input,
        "ENTERPRISE_TASK_VERSION_MISMATCH",
        task.id,
        "TASK",
      );
    if (
      !["READY", "WAITING_APPROVAL", "WAITING_DEPENDENCY"].includes(task.status)
    )
      return this.deny(
        input,
        "ENTERPRISE_TASK_STATE_CONFLICT",
        task.id,
        "TASK",
      );
    if (!input.permission_allowed)
      return this.deny(
        input,
        "CROSS_SYSTEM_PERMISSION_DENIED",
        task.id,
        "TASK",
      );
    if (task.work_mode === "HUMAN_ONLY" && input.actor.type !== "HUMAN")
      return this.deny(input, "HUMAN_TASK_AUTHORITY_REQUIRED", task.id, "TASK");
    if (
      task.dependencies.some(
        (id) =>
          plan.tasks.find((item) => item.id === id)?.status !== "COMPLETED",
      )
    )
      return this.deny(input, "DEPENDENCY_NOT_SATISFIED", task.id, "TASK");
    if (
      this.system(task.source_system_id).health !== "HEALTHY" ||
      this.system(task.target_system_id).health !== "HEALTHY"
    )
      return this.deny(input, "ENTERPRISE_SYSTEM_UNAVAILABLE", task.id, "TASK");
    if (
      !refs(input.evidence_refs, "evidence://") ||
      task.expected_evidence.some(
        (expected) => !input.evidence_refs.includes(expected),
      )
    )
      return this.deny(
        input,
        "ENTERPRISE_TASK_EVIDENCE_REQUIRED",
        task.id,
        "TASK",
      );
    if (task.approval) {
      if (input.approval_id !== task.approval.approval_id)
        return this.deny(input, "APPROVAL_TARGET_MISMATCH", task.id, "TASK");
      const decision = this.approval?.evaluate({
        actor: input.actor,
        approval_id: input.approval_id,
        target: {
          action: task.approval.action,
          environment: task.environment,
          hash: this.taskHash(plan, task),
          plan_id: plan.id,
          project_id: plan.project_id,
          source_system_id: task.source_system_id,
          target_system_id: task.target_system_id,
          task_id: task.id,
          version: task.version,
        },
      });
      if (
        !decision?.allowed ||
        decision.approval_id !== input.approval_id ||
        decision.status !== "APPROVED" ||
        decision.validity !== "VALID" ||
        decision.authority !== "AUTHORIZED"
      )
        return this.deny(input, "ENTERPRISE_APPROVAL_INVALID", task.id, "TASK");
    }
    const completed: EnterpriseTask = {
      ...task,
      evidence_refs: [...input.evidence_refs],
      external_mutation_performed: false,
      status: "COMPLETED",
      version: task.version + 1,
    };
    const tasks = plan.tasks.map((item) =>
      item.id === task.id
        ? completed
        : {
            ...item,
            status:
              item.status === "WAITING_DEPENDENCY" &&
              item.dependencies.every(
                (id) =>
                  (id === completed.id
                    ? completed
                    : plan.tasks.find((candidate) => candidate.id === id)
                  )?.status === "COMPLETED",
              )
                ? item.approval
                  ? ("WAITING_APPROVAL" as const)
                  : ("READY" as const)
                : item.status,
          },
    );
    this.storePlan({
      ...plan,
      status: tasks.every(({ status }) => status === "COMPLETED")
        ? "COMPLETED"
        : "RUNNING",
      tasks,
      version: plan.version + 1,
    });
    this.proof(
      input,
      "ENTERPRISE_TASK.COMPLETED",
      "EXECUTE_ENTERPRISE_TASK",
      task.id,
      "TASK",
      task.source_system_id,
      task.target_system_id,
    );
    return frozen({
      ...completed,
      evidence_refs: frozen([...completed.evidence_refs]),
    });
  }

  simulateOpportunity(input: {
    actor: EnterpriseActor;
    correlation_id: string;
    environment: "DEVELOPMENT" | "PREVIEW";
    evidence_refs: readonly string[];
    permission_allowed: boolean;
    project_id: string;
    purpose: string;
    risk: "R0" | "R1";
    source_system_id: string;
    target_system_id: string;
    type: EnterpriseSignalType;
  }) {
    const pair = SIGNAL_PAIRS[input.type];
    if (!input.permission_allowed)
      return this.deny(
        input,
        "CROSS_SYSTEM_PERMISSION_DENIED",
        input.type,
        "SIMULATION",
      );
    if (
      !pair ||
      pair[0] !== input.source_system_id ||
      pair[1] !== input.target_system_id ||
      !this.systems.has(input.source_system_id) ||
      !this.systems.has(input.target_system_id) ||
      !nonempty(input.purpose) ||
      !["DEVELOPMENT", "PREVIEW"].includes(input.environment) ||
      !["R0", "R1"].includes(input.risk) ||
      !refs(input.evidence_refs, "evidence://")
    )
      return this.deny(
        input,
        "CROSS_SYSTEM_SCOPE_DENIED",
        input.type,
        "SIMULATION",
      );
    this.proof(
      input,
      "ENTERPRISE_OPPORTUNITY.SIMULATED",
      "SIMULATE_ENTERPRISE_OPPORTUNITY",
      input.type,
      "SIMULATION",
      input.source_system_id,
      input.target_system_id,
    );
    return frozen({
      external_mutation_performed: false as const,
      environment: input.environment,
      project_id: input.project_id,
      purpose: input.purpose,
      risk: input.risk,
      source_system_id: input.source_system_id,
      state: "SIMULATED" as const,
      target_system_id: input.target_system_id,
      type: input.type,
    });
  }

  startLoop(input: {
    allowed_actor_ids: readonly string[];
    actor: EnterpriseActor;
    correlation_id: string;
    evidence_refs: readonly string[];
    goal_id: string;
    loop_id: string;
    max_cost_amount: number;
    max_iterations: number;
    no_progress_limit: number;
    project_id: string;
    time_budget_ms: number;
  }): Readonly<EnterpriseLoop> {
    if (
      input.actor.type !== "HUMAN" ||
      !this.goals
        .get(input.goal_id)
        ?.linked_project_ids.includes(input.project_id) ||
      this.loops.has(input.loop_id) ||
      !Array.isArray(input.allowed_actor_ids) ||
      input.allowed_actor_ids.length === 0 ||
      new Set(input.allowed_actor_ids).size !==
        input.allowed_actor_ids.length ||
      input.allowed_actor_ids.some((id) => !nonempty(id)) ||
      !refs(input.evidence_refs, "evidence://") ||
      ![
        input.max_cost_amount,
        input.max_iterations,
        input.no_progress_limit,
        input.time_budget_ms,
      ].every((value) => Number.isFinite(value) && value > 0)
    )
      return this.deny(
        { ...input, evidence_refs: [] },
        "INVALID_ENTERPRISE_LOOP",
        input.loop_id,
        "LOOP",
      );
    const loop = frozen({
      allowed_actor_ids: frozen([...input.allowed_actor_ids]),
      cost_amount: 0,
      goal_id: input.goal_id,
      id: input.loop_id,
      iteration: 0,
      max_cost_amount: input.max_cost_amount,
      max_iterations: input.max_iterations,
      no_progress_count: 0,
      no_progress_limit: input.no_progress_limit,
      owner_id: input.actor.id,
      project_id: input.project_id,
      started_at: this.now().toISOString(),
      status: "RUNNING" as const,
      stop_condition: null,
      time_budget_ms: input.time_budget_ms,
      version: 1,
    });
    this.loops.set(loop.id, loop);
    this.proof(
      input,
      "ENTERPRISE_LOOP.STARTED",
      "START_ENTERPRISE_LOOP",
      loop.id,
      "LOOP",
    );
    return loop;
  }

  evaluateLoop(input: {
    actor: EnterpriseActor;
    correlation_id: string;
    cost_amount: number;
    evidence_refs: readonly string[];
    expected_version: number;
    loop_id: string;
    outcome:
      | "PROGRESS"
      | "NO_PROGRESS"
      | "GOAL_REACHED"
      | "RISK_ESCALATION"
      | "HUMAN_INTERVENTION_REQUIRED"
      | "FATAL_ERROR";
  }): Readonly<EnterpriseLoop> {
    const loop = this.loop(input.loop_id);
    if (
      ![
        "PROGRESS",
        "NO_PROGRESS",
        "GOAL_REACHED",
        "RISK_ESCALATION",
        "HUMAN_INTERVENTION_REQUIRED",
        "FATAL_ERROR",
      ].includes(input.outcome)
    )
      return this.deny(
        input,
        "INVALID_ENTERPRISE_LOOP_OUTCOME",
        loop.id,
        "LOOP",
      );
    if (
      input.actor.id !== loop.owner_id &&
      !loop.allowed_actor_ids.includes(input.actor.id)
    )
      return this.deny(input, "LOOP_EVALUATOR_DENIED", loop.id, "LOOP");
    if (input.expected_version !== loop.version)
      return this.deny(
        input,
        "ENTERPRISE_LOOP_VERSION_MISMATCH",
        loop.id,
        "LOOP",
      );
    if (
      loop.status !== "RUNNING" ||
      input.cost_amount < 0 ||
      !Number.isFinite(input.cost_amount) ||
      !refs(input.evidence_refs, "evidence://")
    )
      throw new EnterpriseOrchestrationError("ENTERPRISE_LOOP_NOT_RUNNING");
    const iteration = loop.iteration + 1;
    const cost = loop.cost_amount + input.cost_amount;
    const elapsed = this.now().getTime() - Date.parse(loop.started_at);
    const noProgress =
      input.outcome === "NO_PROGRESS" ? loop.no_progress_count + 1 : 0;
    const stop: EnterpriseLoop["stop_condition"] =
      input.outcome === "GOAL_REACHED"
        ? "GOAL_REACHED"
        : input.outcome === "RISK_ESCALATION"
          ? "RISK_ESCALATION"
          : input.outcome === "HUMAN_INTERVENTION_REQUIRED"
            ? "WAITING_HUMAN"
            : input.outcome === "FATAL_ERROR"
              ? "FATAL_ERROR"
              : iteration >= loop.max_iterations
                ? "MAX_ITERATIONS"
                : cost >= loop.max_cost_amount
                  ? "COST_BUDGET_EXCEEDED"
                  : elapsed >= loop.time_budget_ms
                    ? "TIME_BUDGET_EXCEEDED"
                    : noProgress >= loop.no_progress_limit
                      ? "NO_PROGRESS"
                      : null;
    const updated = frozen({
      ...loop,
      cost_amount: cost,
      iteration,
      no_progress_count: noProgress,
      status: stop ? ("STOPPED" as const) : ("RUNNING" as const),
      stop_condition: stop,
      version: loop.version + 1,
    });
    this.loops.set(loop.id, updated);
    this.proof(
      input,
      stop ? "ENTERPRISE_LOOP.STOPPED" : "ENTERPRISE_LOOP.ITERATED",
      "EVALUATE_ENTERPRISE_LOOP",
      loop.id,
      "LOOP",
    );
    return updated;
  }

  pauseLoop(
    id: string,
    actor: EnterpriseActor,
    correlation_id: string,
    expected_version: number,
    evidence_refs: readonly string[],
  ) {
    return this.controlLoop(
      id,
      actor,
      correlation_id,
      expected_version,
      evidence_refs,
      "PAUSED",
    );
  }
  resumeLoop(
    id: string,
    actor: EnterpriseActor,
    correlation_id: string,
    expected_version: number,
    evidence_refs: readonly string[],
  ) {
    const loop = this.loop(id);
    if (
      actor.type !== "HUMAN" ||
      actor.id !== loop.owner_id ||
      loop.status !== "PAUSED" ||
      loop.version !== expected_version ||
      !refs(evidence_refs, "evidence://")
    )
      throw new EnterpriseOrchestrationError("HUMAN_LOOP_AUTHORITY_REQUIRED");
    const updated = frozen({
      ...loop,
      status: "RUNNING" as const,
      version: loop.version + 1,
    });
    this.loops.set(id, updated);
    this.proof(
      { actor, correlation_id, evidence_refs },
      "ENTERPRISE_LOOP.RESUMED",
      "RESUME_ENTERPRISE_LOOP",
      id,
      "LOOP",
    );
    return updated;
  }
  cancelLoop(
    id: string,
    actor: EnterpriseActor,
    correlation_id: string,
    expected_version: number,
    evidence_refs: readonly string[],
  ) {
    return this.controlLoop(
      id,
      actor,
      correlation_id,
      expected_version,
      evidence_refs,
      "CANCELLED",
    );
  }

  reportFailure(input: {
    actor: EnterpriseActor;
    correlation_id: string;
    evidence_refs: readonly string[];
    expected_version: number;
    permission_allowed: boolean;
    plan_id: string;
    reason:
      | "SYSTEM_UNAVAILABLE"
      | "INTEGRATION_UNAVAILABLE"
      | "TASK_FAILURE"
      | "DEPENDENCY_FAILURE"
      | "MISSING_APPROVAL"
      | "DEADLINE_RISK"
      | "LEGAL_COMPLIANCE_BLOCKER"
      | "NO_PROGRESS";
    task_id: string;
  }) {
    const plan = this.plan(input.plan_id);
    const task = plan.tasks.find(({ id }) => id === input.task_id);
    const reasons = [
      "SYSTEM_UNAVAILABLE",
      "INTEGRATION_UNAVAILABLE",
      "TASK_FAILURE",
      "DEPENDENCY_FAILURE",
      "MISSING_APPROVAL",
      "DEADLINE_RISK",
      "LEGAL_COMPLIANCE_BLOCKER",
      "NO_PROGRESS",
    ];
    if (
      !task ||
      !refs(input.evidence_refs, "evidence://") ||
      !reasons.includes(input.reason)
    )
      throw new EnterpriseOrchestrationError("INVALID_ENTERPRISE_FAILURE");
    if (!input.permission_allowed)
      return this.deny(
        input,
        "CROSS_SYSTEM_PERMISSION_DENIED",
        task.id,
        "TASK",
      );
    if (task.version !== input.expected_version)
      return this.deny(
        input,
        "ENTERPRISE_TASK_VERSION_MISMATCH",
        task.id,
        "TASK",
      );
    if (
      ![
        "READY",
        "WAITING_DEPENDENCY",
        "WAITING_APPROVAL",
        "IN_PROGRESS",
      ].includes(task.status)
    )
      return this.deny(
        input,
        "ENTERPRISE_TASK_STATE_CONFLICT",
        task.id,
        "TASK",
      );
    const blocked = {
      ...task,
      evidence_refs: [...task.evidence_refs, ...input.evidence_refs],
      status: "BLOCKED" as const,
      version: task.version + 1,
    };
    this.storePlan({
      ...plan,
      status: "WAITING_HUMAN",
      tasks: plan.tasks.map((item) => (item.id === task.id ? blocked : item)),
      version: plan.version + 1,
    });
    this.proof(
      input,
      "ENTERPRISE_TASK.ESCALATED",
      "ESCALATE_ENTERPRISE_TASK",
      task.id,
      "TASK",
      task.source_system_id,
      task.target_system_id,
    );
    return frozen({
      human_intervention_required: true as const,
      reason: input.reason,
      task: blocked,
    });
  }

  executiveProjection(actor: EnterpriseActor, permission_allowed: boolean) {
    if (actor.type !== "HUMAN" || !permission_allowed)
      throw new EnterpriseOrchestrationError("ENTERPRISE_VIEW_DENIED");
    const goals = [...this.goals.values()];
    const plans = [...this.plans.values()];
    const tasks = plans.flatMap(({ tasks }) => tasks);
    const loops = [...this.loops.values()];
    return frozen({
      approvals_required: tasks.filter(
        ({ status }) => status === "WAITING_APPROVAL",
      ).length,
      blockers: tasks.filter(
        ({ status }) => status === "BLOCKED" || status === "WAITING_DEPENDENCY",
      ).length,
      external_mutations_enabled: false as const,
      goals: {
        active: goals.filter(({ status }) => status === "ACTIVE").length,
        at_risk: goals.filter(({ status }) => status === "AT_RISK").length,
        total: goals.length,
      },
      loops: {
        active: loops.filter(({ status }) => status === "RUNNING").length,
        total: loops.length,
      },
      next_actions: [
        ...(this.signals.size > plans.length ? ["PLAN_OPEN_SIGNALS"] : []),
        ...(tasks.some(({ status }) => status === "WAITING_APPROVAL")
          ? ["REVIEW_APPROVALS"]
          : []),
        ...(tasks.some(({ status }) => status === "BLOCKED")
          ? ["RESOLVE_BLOCKERS"]
          : []),
      ],
      plans: {
        active: plans.filter(
          ({ status }) => status !== "COMPLETED" && status !== "CANCELLED",
        ).length,
        total: plans.length,
      },
      systems: {
        healthy: [...this.systems.values()].filter(
          ({ health }) => health === "HEALTHY",
        ).length,
        unhealthy: [...this.systems.values()].filter(
          ({ health }) => health !== "HEALTHY",
        ).length,
        total: this.systems.size,
      },
      tasks: {
        active: tasks.filter(
          ({ status }) => !["COMPLETED", "CANCELLED"].includes(status),
        ).length,
        total: tasks.length,
      },
    });
  }

  dailyBriefing(actor: EnterpriseActor, permission_allowed: boolean) {
    const view = this.executiveProjection(actor, permission_allowed);
    return frozen({
      approvals_required: view.approvals_required,
      blockers: view.blockers,
      completed_work: [...this.plans.values()].filter(
        ({ status }) => status === "COMPLETED",
      ).length,
      current_work: view.tasks.active,
      failures: [...this.plans.values()]
        .flatMap(({ tasks }) => tasks)
        .filter(({ status }) => status === "FAILED").length,
      major_risks: view.goals.at_risk + view.systems.unhealthy,
      recommended_next_actions: frozen([...view.next_actions]),
      system_health: view.systems,
      upcoming_deadlines: [...this.goals.values()]
        .filter(({ status }) => status === "ACTIVE")
        .map(({ timeframe }) => timeframe.end)
        .sort(),
      what_changed: this.eventLog.slice(-10).map(({ name }) => name),
    });
  }

  evidence(correlation_id: string) {
    return {
      audit: this.auditLog
        .filter((item) => item.correlation_id === correlation_id)
        .map((item) => ({ ...item })),
      events: this.eventLog
        .filter((item) => item.correlation_id === correlation_id)
        .map((item) => ({ ...item })),
    };
  }

  listGoals() {
    return [...this.goals.values()].map((item) => ({ ...item }));
  }
  listSignals() {
    return [...this.signals.values()].map((item) => ({ ...item }));
  }
  listPlans() {
    return [...this.plans.values()].map((item) => ({
      ...item,
      tasks: item.tasks.map((task) => ({ ...task })),
    }));
  }
  listLoops() {
    return [...this.loops.values()].map((item) => ({ ...item }));
  }

  private system(id: string) {
    const system = this.systems.get(id);
    if (!system)
      throw new EnterpriseOrchestrationError("ENTERPRISE_SYSTEM_NOT_FOUND");
    return system;
  }
  private plan(id: string) {
    const plan = this.plans.get(id);
    if (!plan)
      throw new EnterpriseOrchestrationError("ENTERPRISE_PLAN_NOT_FOUND");
    return plan;
  }
  private loop(id: string) {
    const loop = this.loops.get(id);
    if (!loop)
      throw new EnterpriseOrchestrationError("ENTERPRISE_LOOP_NOT_FOUND");
    return loop;
  }
  private storePlan(plan: EnterprisePlan) {
    const stored = frozen({
      ...plan,
      evidence_refs: frozen([...plan.evidence_refs]),
      tasks: frozen(
        plan.tasks.map((task) =>
          frozen({
            ...task,
            allowed_tools: frozen([...task.allowed_tools]),
            approval: task.approval ? frozen({ ...task.approval }) : undefined,
            dependencies: frozen([...task.dependencies]),
            evidence_refs: frozen([...task.evidence_refs]),
            expected_evidence: frozen([...task.expected_evidence]),
          }),
        ),
      ),
    });
    this.plans.set(stored.id, stored);
    return stored;
  }
  private taskHash(
    plan: Readonly<EnterprisePlan>,
    task: Readonly<EnterpriseTask>,
  ) {
    return `sha256:${createHash("sha256")
      .update(
        [
          plan.id,
          plan.project_id,
          task.id,
          task.source_system_id,
          task.target_system_id,
          task.purpose,
          task.environment,
          task.risk,
          task.permission,
          ...task.allowed_tools,
          task.approval?.action ?? "",
          task.approval?.environment ?? "",
          task.version,
        ].join("\n"),
      )
      .digest("hex")}`;
  }
  private hasCycle(
    tasks: readonly { id: string; dependencies: readonly string[] }[],
  ) {
    const graph = new Map(tasks.map((task) => [task.id, task.dependencies]));
    const visit = (id: string, path = new Set<string>()): boolean => {
      if (path.has(id)) return true;
      const next = new Set(path);
      next.add(id);
      return (graph.get(id) ?? []).some((dependency) =>
        visit(dependency, next),
      );
    };
    return tasks.some(({ id }) => visit(id));
  }
  private controlLoop(
    id: string,
    actor: EnterpriseActor,
    correlation_id: string,
    expected_version: number,
    evidence_refs: readonly string[],
    status: "PAUSED" | "CANCELLED",
  ) {
    const loop = this.loop(id);
    if (
      actor.type !== "HUMAN" ||
      actor.id !== loop.owner_id ||
      loop.status !== "RUNNING" ||
      loop.version !== expected_version ||
      !refs(evidence_refs, "evidence://")
    )
      throw new EnterpriseOrchestrationError("HUMAN_LOOP_AUTHORITY_REQUIRED");
    const updated = frozen({
      ...loop,
      status,
      stop_condition:
        status === "CANCELLED" ? ("KILL_SWITCH" as const) : loop.stop_condition,
      version: loop.version + 1,
    });
    this.loops.set(id, updated);
    this.proof(
      { actor, correlation_id, evidence_refs },
      `ENTERPRISE_LOOP.${status}`,
      `${status}_ENTERPRISE_LOOP`,
      id,
      "LOOP",
    );
    return updated;
  }
  private proof(
    input: {
      actor: EnterpriseActor;
      correlation_id: string;
      evidence_refs: readonly string[];
      project_id?: string;
    },
    name: string,
    action: string,
    resource_id: string,
    resource_type: string,
    source_system_id?: string,
    target_system_id?: string,
  ) {
    this.eventLog.push(
      frozen({
        correlation_id: input.correlation_id,
        evidence_refs: frozen([...input.evidence_refs]),
        name,
        occurred_at: this.now().toISOString(),
        ...(input.project_id ? { project_id: input.project_id } : {}),
        resource_id,
        resource_type,
        ...(source_system_id ? { source_system_id } : {}),
        ...(target_system_id ? { target_system_id } : {}),
      }),
    );
    this.auditLog.push(
      frozen({
        action,
        actor: frozen({ ...input.actor }),
        correlation_id: input.correlation_id,
        evidence_refs: frozen([...input.evidence_refs]),
        result: "SUCCEEDED" as const,
        target: frozen({ id: resource_id, type: resource_type }),
      }),
    );
  }
  private deny(
    input: {
      actor: EnterpriseActor;
      correlation_id: string;
      evidence_refs: readonly string[];
    },
    code: string,
    id: string,
    type: string,
  ): never {
    this.auditLog.push(
      frozen({
        action: code,
        actor: frozen({ ...input.actor }),
        correlation_id: input.correlation_id,
        evidence_refs: frozen([...input.evidence_refs]),
        result: "DENIED" as const,
        target: frozen({ id, type }),
      }),
    );
    throw new EnterpriseOrchestrationError(code);
  }
}
