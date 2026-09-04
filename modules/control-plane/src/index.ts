import type { ActorType, TaskStatus } from "@maos/contracts";

export type ControlPlaneHealth =
  "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "MAINTENANCE" | "UNKNOWN";
export type ControlPlaneLifecycle =
  "DRAFT" | "ACTIVE" | "SUSPENDED" | "DISABLED" | "RETIRED";
export type EnvironmentName =
  "DEVELOPMENT" | "PREVIEW" | "STAGING" | "PRODUCTION";

export interface ControlPlaneActor {
  id: string;
  type: ActorType;
}

export interface SystemRegistration {
  id: string;
  lifecycle: ControlPlaneLifecycle;
  name: string;
  owner: ControlPlaneActor;
  source_of_truth: "MAOS" | "DOMAIN_SYSTEM";
  type:
    | "DOMAIN_APPLICATION"
    | "AI_AGENT_SYSTEM"
    | "PUBLIC_PLATFORM"
    | "INTERNAL_PLATFORM"
    | "INFRASTRUCTURE"
    | "MEMORY_SYSTEM"
    | "EXTERNAL_SERVICE";
}

export interface EnvironmentRegistration {
  configuration_reference: string;
  credential_reference: string;
  health: ControlPlaneHealth;
  id: string;
  name: EnvironmentName;
  system_id: string;
}

export interface RepositoryRegistration {
  default_branch: string;
  id: string;
  reference: string;
  system_id: string;
}

export interface WorkrootRegistration {
  id: string;
  repository_id: string;
  root_reference: string;
  system_id: string;
}

export interface RunnerRegistration {
  capabilities: readonly string[];
  environment_id: string;
  health: ControlPlaneHealth;
  id: string;
  lifecycle: ControlPlaneLifecycle;
  system_id: string;
  workroot_ids: readonly string[];
}

export interface IntegrationRegistration {
  adapter_reference: string;
  allowed_actions: readonly ("READ" | "WRITE" | "EXECUTE" | "ADMIN")[];
  id: string;
  maturity: "I0" | "I1" | "I2" | "I3" | "I4" | "I5";
  mode: "READ_ONLY" | "GOVERNED_WRITE";
  source_system_id: string;
}

export interface ProjectBinding {
  id: string;
  owner: ControlPlaneActor;
  repository_id: string;
  system_id: string;
}

export interface TaskBinding {
  id: string;
  owner: ControlPlaneActor;
  project_id: string;
  status: TaskStatus;
  system_id: string;
}

export interface RunBinding {
  agent_id: string;
  correlation_id: string;
  id: string;
  model_id: string;
  project_id: string;
  runner_id: string;
  status:
    | "CREATED"
    | "QUEUED"
    | "RUNNING"
    | "WAITING_TOOL"
    | "WAITING_APPROVAL"
    | "SUCCEEDED"
    | "FAILED"
    | "CANCELLED";
  system_id: string;
  task_id: string;
}

export interface LoopPolicy {
  allowed_tools: readonly string[];
  id: string;
  max_cost_amount: number;
  max_iterations: number;
  time_budget_ms: number;
}

export interface GovernedLoopRun {
  actor: ControlPlaneActor;
  correlation_id: string;
  cost_amount: number;
  id: string;
  iteration: number;
  policy_id: string;
  project_id: string | null;
  started_at_ms: number;
  status: "RUNNING" | "PAUSED" | "STOPPED" | "CANCELLED";
  stop_condition:
    | "GOAL_REACHED"
    | "MAX_ITERATIONS"
    | "TIME_BUDGET_EXCEEDED"
    | "COST_BUDGET_EXCEEDED"
    | "WAITING_HUMAN"
    | "APPROVAL_REQUIRED"
    | "NO_PROGRESS"
    | "KILL_SWITCH"
    | "FATAL_ERROR"
    | null;
  system_id: string;
  trigger: { id: string; type: "HUMAN_REQUEST" | "TASK" | "WORKFLOW" };
}

export interface ControlPlaneEvent {
  correlation_id: string;
  name: string;
  resource_id: string;
  system_id: string;
}

export interface ControlPlaneAudit {
  action: string;
  actor: ControlPlaneActor;
  correlation_id: string;
  result: "SUCCEEDED" | "DENIED";
  target: { id: string; type: string };
}

export class ControlPlaneError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const present = (value: string): boolean => value.trim().length > 0;

export class ControlPlaneRegistry {
  readonly #systems = new Map<string, Readonly<SystemRegistration>>();
  readonly #environments = new Map<string, Readonly<EnvironmentRegistration>>();
  readonly #repositories = new Map<string, Readonly<RepositoryRegistration>>();
  readonly #workroots = new Map<string, Readonly<WorkrootRegistration>>();
  readonly #runners = new Map<string, Readonly<RunnerRegistration>>();
  readonly #integrations = new Map<string, Readonly<IntegrationRegistration>>();
  readonly #projects = new Map<string, Readonly<ProjectBinding>>();
  readonly #tasks = new Map<string, Readonly<TaskBinding>>();
  readonly #runs = new Map<string, Readonly<RunBinding>>();
  readonly #policies = new Map<string, Readonly<LoopPolicy>>();
  readonly #loops = new Map<string, GovernedLoopRun>();
  readonly #events: ControlPlaneEvent[] = [];
  readonly #audit: ControlPlaneAudit[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  registerSystem(input: SystemRegistration): Readonly<SystemRegistration> {
    this.expectNew(this.#systems, input.id, "SYSTEM_ALREADY_EXISTS");
    if (!present(input.id) || !present(input.name) || !present(input.owner.id))
      throw new ControlPlaneError("INVALID_SYSTEM_REGISTRATION");
    if (input.source_of_truth === "MAOS" && input.type === "DOMAIN_APPLICATION")
      throw new ControlPlaneError("DOMAIN_SOURCE_OF_TRUTH_TAKEOVER_DENIED");
    const value = Object.freeze({
      ...input,
      owner: Object.freeze({ ...input.owner }),
    });
    this.#systems.set(value.id, value);
    return value;
  }

  registerEnvironment(
    input: EnvironmentRegistration,
  ): Readonly<EnvironmentRegistration> {
    this.expectNew(this.#environments, input.id, "ENVIRONMENT_ALREADY_EXISTS");
    this.getSystem(input.system_id);
    if (!input.configuration_reference.startsWith("configref://"))
      throw new ControlPlaneError("CONFIGURATION_REFERENCE_REQUIRED");
    if (!input.credential_reference.startsWith("secretref://"))
      throw new ControlPlaneError("SECRET_REFERENCE_REQUIRED");
    const value = Object.freeze({ ...input });
    this.#environments.set(value.id, value);
    return value;
  }

  registerRepository(
    input: RepositoryRegistration,
  ): Readonly<RepositoryRegistration> {
    this.expectNew(this.#repositories, input.id, "REPOSITORY_ALREADY_EXISTS");
    this.getSystem(input.system_id);
    if (
      !input.reference.startsWith("registry://") ||
      !present(input.default_branch)
    )
      throw new ControlPlaneError("INVALID_REPOSITORY_REFERENCE");
    const value = Object.freeze({ ...input });
    this.#repositories.set(value.id, value);
    return value;
  }

  registerWorkroot(
    input: WorkrootRegistration,
  ): Readonly<WorkrootRegistration> {
    this.expectNew(this.#workroots, input.id, "WORKROOT_ALREADY_EXISTS");
    const repository = this.required(
      this.#repositories,
      input.repository_id,
      "REPOSITORY_NOT_FOUND",
    );
    this.expectSameSystem(input.system_id, repository.system_id);
    if (!input.root_reference.startsWith("workroot://"))
      throw new ControlPlaneError("INVALID_WORKROOT_REFERENCE");
    const value = Object.freeze({ ...input });
    this.#workroots.set(value.id, value);
    return value;
  }

  registerRunner(input: RunnerRegistration): Readonly<RunnerRegistration> {
    this.expectNew(this.#runners, input.id, "RUNNER_ALREADY_EXISTS");
    const environment = this.required(
      this.#environments,
      input.environment_id,
      "ENVIRONMENT_NOT_FOUND",
    );
    this.expectSameSystem(input.system_id, environment.system_id);
    if (input.capabilities.length === 0 || input.workroot_ids.length === 0)
      throw new ControlPlaneError("RUNNER_SCOPE_REQUIRED");
    for (const workrootId of input.workroot_ids) {
      const workroot = this.required(
        this.#workroots,
        workrootId,
        "WORKROOT_NOT_FOUND",
      );
      this.expectSameSystem(input.system_id, workroot.system_id);
    }
    const value = Object.freeze({
      ...input,
      capabilities: Object.freeze([...new Set(input.capabilities)]),
      workroot_ids: Object.freeze([...new Set(input.workroot_ids)]),
    });
    this.#runners.set(value.id, value);
    return value;
  }

  registerIntegration(
    input: IntegrationRegistration,
  ): Readonly<IntegrationRegistration> {
    this.expectNew(this.#integrations, input.id, "INTEGRATION_ALREADY_EXISTS");
    const system = this.getSystem(input.source_system_id);
    if (system.source_of_truth !== "DOMAIN_SYSTEM")
      throw new ControlPlaneError("INTEGRATION_SOURCE_MUST_BE_DOMAIN_SYSTEM");
    if (!input.adapter_reference.startsWith("adapterref://"))
      throw new ControlPlaneError("ADAPTER_REFERENCE_REQUIRED");
    if (
      input.mode === "READ_ONLY" &&
      input.allowed_actions.some((action) => action !== "READ")
    )
      throw new ControlPlaneError("READ_ONLY_INTEGRATION_WRITE_DENIED");
    const value = Object.freeze({
      ...input,
      allowed_actions: Object.freeze([...new Set(input.allowed_actions)]),
    });
    this.#integrations.set(value.id, value);
    return value;
  }

  bindProject(input: ProjectBinding): Readonly<ProjectBinding> {
    this.expectNew(this.#projects, input.id, "PROJECT_ALREADY_BOUND");
    this.getSystem(input.system_id);
    const repository = this.required(
      this.#repositories,
      input.repository_id,
      "REPOSITORY_NOT_FOUND",
    );
    this.expectSameSystem(input.system_id, repository.system_id);
    if (input.owner.type !== "HUMAN")
      throw new ControlPlaneError("PROJECT_OWNER_MUST_BE_HUMAN");
    const value = Object.freeze({
      ...input,
      owner: Object.freeze({ ...input.owner }),
    });
    this.#projects.set(value.id, value);
    return value;
  }

  bindTask(input: TaskBinding): Readonly<TaskBinding> {
    this.expectNew(this.#tasks, input.id, "TASK_ALREADY_BOUND");
    const project = this.required(
      this.#projects,
      input.project_id,
      "PROJECT_NOT_FOUND",
    );
    this.expectSameSystem(input.system_id, project.system_id);
    const value = Object.freeze({
      ...input,
      owner: Object.freeze({ ...input.owner }),
    });
    this.#tasks.set(value.id, value);
    return value;
  }

  bindRun(input: RunBinding): Readonly<RunBinding> {
    this.expectNew(this.#runs, input.id, "RUN_ALREADY_BOUND");
    const task = this.required(this.#tasks, input.task_id, "TASK_NOT_FOUND");
    if (task.project_id !== input.project_id)
      throw new ControlPlaneError("CROSS_PROJECT_SCOPE_DENIED");
    this.expectSameSystem(input.system_id, task.system_id);
    const runner = this.required(
      this.#runners,
      input.runner_id,
      "RUNNER_NOT_FOUND",
    );
    this.expectSameSystem(input.system_id, runner.system_id);
    if (runner.lifecycle !== "ACTIVE" || runner.health !== "HEALTHY")
      throw new ControlPlaneError("RUNNER_UNAVAILABLE");
    const value = Object.freeze({ ...input });
    this.#runs.set(value.id, value);
    return value;
  }

  authorize(input: {
    action: "READ" | "WRITE" | "EXECUTE" | "ADMIN";
    actor: ControlPlaneActor;
    approved: boolean;
    permission: "ALLOW" | "DENY" | "ALLOW_WITH_APPROVAL";
    project_id: string | null;
    system_id: string;
  }): { allowed: true } {
    const system = this.getSystem(input.system_id);
    if (input.permission === "DENY")
      throw new ControlPlaneError("PERMISSION_DENIED");
    if (input.permission === "ALLOW_WITH_APPROVAL" && !input.approved)
      throw new ControlPlaneError("APPROVAL_REQUIRED");
    if (input.project_id) {
      const project = this.required(
        this.#projects,
        input.project_id,
        "PROJECT_NOT_FOUND",
      );
      this.expectSameSystem(input.system_id, project.system_id);
    }
    if (system.source_of_truth === "DOMAIN_SYSTEM" && input.action !== "READ")
      throw new ControlPlaneError("CROSS_SYSTEM_WRITE_DENIED");
    return { allowed: true };
  }

  registerLoopPolicy(input: LoopPolicy): Readonly<LoopPolicy> {
    this.expectNew(this.#policies, input.id, "LOOP_POLICY_ALREADY_EXISTS");
    if (
      input.max_iterations < 1 ||
      input.time_budget_ms < 1 ||
      input.max_cost_amount < 0 ||
      input.allowed_tools.length === 0
    )
      throw new ControlPlaneError("INVALID_LOOP_POLICY");
    const value = Object.freeze({
      ...input,
      allowed_tools: Object.freeze([...new Set(input.allowed_tools)]),
    });
    this.#policies.set(value.id, value);
    return value;
  }

  startLoop(
    input: Omit<
      GovernedLoopRun,
      | "cost_amount"
      | "iteration"
      | "started_at_ms"
      | "status"
      | "stop_condition"
    >,
  ): GovernedLoopRun {
    this.expectNew(this.#loops, input.id, "LOOP_ALREADY_EXISTS");
    this.getSystem(input.system_id);
    this.required(this.#policies, input.policy_id, "LOOP_POLICY_NOT_FOUND");
    if (input.actor.type !== "HUMAN")
      throw new ControlPlaneError("HUMAN_LOOP_AUTHORITY_REQUIRED");
    if (input.project_id) {
      const project = this.required(
        this.#projects,
        input.project_id,
        "PROJECT_NOT_FOUND",
      );
      this.expectSameSystem(input.system_id, project.system_id);
    }
    const run: GovernedLoopRun = {
      ...input,
      cost_amount: 0,
      iteration: 0,
      started_at_ms: this.now(),
      status: "RUNNING",
      stop_condition: null,
    };
    this.#loops.set(run.id, run);
    this.recordProof(run, "LOOP.STARTED", "LOOP.START");
    return { ...run };
  }

  recordLoopEvaluation(input: {
    cost_amount: number;
    id: string;
    progress: boolean;
    requested_tool: string;
  }): GovernedLoopRun {
    const run = this.required(this.#loops, input.id, "LOOP_NOT_FOUND");
    const policy = this.required(
      this.#policies,
      run.policy_id,
      "LOOP_POLICY_NOT_FOUND",
    );
    if (run.status !== "RUNNING")
      throw new ControlPlaneError("LOOP_NOT_RUNNING");
    if (!policy.allowed_tools.includes(input.requested_tool))
      throw new ControlPlaneError("LOOP_TOOL_DENIED");
    run.iteration += 1;
    run.cost_amount += input.cost_amount;
    if (!input.progress) this.stopLoop(run, "NO_PROGRESS");
    else if (run.iteration >= policy.max_iterations)
      this.stopLoop(run, "MAX_ITERATIONS");
    else if (run.cost_amount > policy.max_cost_amount)
      this.stopLoop(run, "COST_BUDGET_EXCEEDED");
    else if (this.now() - run.started_at_ms > policy.time_budget_ms)
      this.stopLoop(run, "TIME_BUDGET_EXCEEDED");
    return { ...run };
  }

  pauseLoop(id: string): GovernedLoopRun {
    const run = this.required(this.#loops, id, "LOOP_NOT_FOUND");
    if (run.status !== "RUNNING")
      throw new ControlPlaneError("LOOP_NOT_RUNNING");
    run.status = "PAUSED";
    this.recordProof(run, "LOOP.PAUSED", "LOOP.PAUSE");
    return { ...run };
  }

  resumeLoop(id: string, actor: ControlPlaneActor): GovernedLoopRun {
    const run = this.required(this.#loops, id, "LOOP_NOT_FOUND");
    if (run.status !== "PAUSED") throw new ControlPlaneError("LOOP_NOT_PAUSED");
    this.expectLoopAuthority(run, actor);
    run.status = "RUNNING";
    this.recordProof(run, "LOOP.RESUMED", "LOOP.RESUME");
    return { ...run };
  }

  cancelLoop(id: string, actor: ControlPlaneActor): GovernedLoopRun {
    const run = this.required(this.#loops, id, "LOOP_NOT_FOUND");
    if (run.status !== "RUNNING" && run.status !== "PAUSED")
      throw new ControlPlaneError("LOOP_NOT_CANCELLABLE");
    this.expectLoopAuthority(run, actor);
    run.status = "CANCELLED";
    run.stop_condition = "KILL_SWITCH";
    this.recordProof(run, "LOOP.CANCELLED", "LOOP.CANCEL");
    return { ...run };
  }

  getSystem(id: string): Readonly<SystemRegistration> {
    return this.required(this.#systems, id, "SYSTEM_NOT_FOUND");
  }

  getTask(id: string): Readonly<TaskBinding> {
    return this.required(this.#tasks, id, "TASK_NOT_FOUND");
  }

  getRun(id: string): Readonly<RunBinding> {
    return this.required(this.#runs, id, "RUN_NOT_FOUND");
  }

  getLoop(id: string): GovernedLoopRun {
    return { ...this.required(this.#loops, id, "LOOP_NOT_FOUND") };
  }

  evidence(correlationId: string): {
    audit: readonly ControlPlaneAudit[];
    events: readonly ControlPlaneEvent[];
  } {
    return {
      audit: this.#audit
        .filter((record) => record.correlation_id === correlationId)
        .map((record) => ({ ...record })),
      events: this.#events
        .filter((event) => event.correlation_id === correlationId)
        .map((event) => ({ ...event })),
    };
  }

  projectControlPlane(input: { system_ids: readonly string[] }) {
    const allowed = new Set(input.system_ids);
    const systems = [...this.#systems.values()]
      .filter((system) => allowed.has(system.id))
      .map((system) => {
        const health = [...this.#environments.values()]
          .filter((environment) => environment.system_id === system.id)
          .map((environment) => environment.health);
        return {
          id: system.id,
          lifecycle: system.lifecycle,
          name: system.name,
          owner: system.owner,
          source_of_truth: system.source_of_truth,
          health: health.includes("UNAVAILABLE")
            ? ("UNAVAILABLE" as const)
            : health.includes("DEGRADED")
              ? ("DEGRADED" as const)
              : health.length > 0 &&
                  health.every((value) => value === "HEALTHY")
                ? ("HEALTHY" as const)
                : ("UNKNOWN" as const),
        };
      });
    const projects = [...this.#projects.values()].filter((item) =>
      allowed.has(item.system_id),
    );
    const tasks = [...this.#tasks.values()].filter((item) =>
      allowed.has(item.system_id),
    );
    const runs = [...this.#runs.values()].filter((item) =>
      allowed.has(item.system_id),
    );
    return {
      blockers: tasks
        .filter((task) =>
          [
            "BLOCKED",
            "WAITING_DEPENDENCY",
            "WAITING_HUMAN",
            "WAITING_APPROVAL",
          ].includes(task.status),
        )
        .map((task) => ({
          id: task.id,
          owner: task.owner,
          status: task.status,
        })),
      next_actions: tasks
        .filter(
          (task) => task.status !== "COMPLETED" && task.status !== "CANCELLED",
        )
        .map((task) => ({
          id: task.id,
          action:
            task.status === "WAITING_APPROVAL"
              ? "HUMAN_APPROVAL"
              : "ADVANCE_TASK",
        })),
      projects: projects.map((item) => ({ ...item })),
      runs: runs.map((item) => ({ ...item })),
      summary: {
        alerts: systems.filter((system) => system.health !== "HEALTHY").length,
        projects: projects.length,
        runs: runs.length,
        systems: systems.length,
        tasks: tasks.length,
      },
      systems,
      tasks: tasks.map((item) => ({ ...item })),
    };
  }

  private stopLoop(
    run: GovernedLoopRun,
    condition: NonNullable<GovernedLoopRun["stop_condition"]>,
  ): void {
    run.status = "STOPPED";
    run.stop_condition = condition;
    this.recordProof(run, "LOOP.STOPPED", "LOOP.STOP");
  }

  private recordProof(
    run: GovernedLoopRun,
    name: string,
    action: string,
  ): void {
    this.#events.push({
      correlation_id: run.correlation_id,
      name,
      resource_id: run.id,
      system_id: run.system_id,
    });
    this.#audit.push({
      action,
      actor: run.actor,
      correlation_id: run.correlation_id,
      result: "SUCCEEDED",
      target: { id: run.id, type: "LOOP_RUN" },
    });
  }

  private expectSameSystem(expected: string, actual: string): void {
    if (expected !== actual)
      throw new ControlPlaneError("CROSS_SYSTEM_SCOPE_DENIED");
  }

  private expectLoopAuthority(
    run: GovernedLoopRun,
    actor: ControlPlaneActor,
  ): void {
    if (actor.type !== "HUMAN" || actor.id !== run.actor.id)
      throw new ControlPlaneError("HUMAN_LOOP_AUTHORITY_REQUIRED");
  }

  private expectNew<T>(map: Map<string, T>, id: string, code: string): void {
    if (map.has(id)) throw new ControlPlaneError(code);
  }

  private required<T>(map: Map<string, T>, id: string, code: string): T {
    const value = map.get(id);
    if (!value) throw new ControlPlaneError(code);
    return value;
  }
}
