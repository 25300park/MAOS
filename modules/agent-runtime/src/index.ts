import type { ActorType, TaskStatus } from "@maos/contracts";
import { RuntimeError } from "./runtime-error.js";

export { RuntimeError } from "./runtime-error.js";

export type AgentLifecycle =
  "DRAFT" | "ACTIVE" | "SUSPENDED" | "DISABLED" | "RETIRED";
export type AgentRuntimeStatus =
  "AVAILABLE" | "WORKING" | "WAITING" | "BLOCKED" | "OFFLINE";
export type ProviderStatus = "ACTIVE" | "DISABLED";
export type ModelLifecycle = "ACTIVE" | "DISABLED";
export type RunnerLifecycle = "ACTIVE" | "DISABLED" | "RETIRED";
export type HealthStatus =
  "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "MAINTENANCE" | "UNKNOWN";
export type AssignmentStatus = "ASSIGNED" | "RELEASED";
export type RunStatus =
  "REQUESTED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "CANCELLED";

export interface ActorReference {
  id: string;
  type: ActorType;
}

export interface SelectionPolicy {
  required_capabilities: readonly string[];
}

export interface ModelPolicy extends SelectionPolicy {
  model_ids: readonly string[];
}

export interface RunnerPolicy extends SelectionPolicy {
  runner_ids: readonly string[];
}

export interface AgentDefinition {
  allowed_task_types: readonly string[];
  department_id: string;
  id: string;
  lifecycle: AgentLifecycle;
  mission: string;
  model_policy: ModelPolicy;
  name: string;
  role: string;
  runner_policy: RunnerPolicy;
  runtime_status: AgentRuntimeStatus;
  version: number;
}

export interface ModelProvider {
  id: string;
  status: ProviderStatus;
}

export interface ModelDefinition {
  capabilities: readonly string[];
  id: string;
  lifecycle: ModelLifecycle;
  provider_id: string;
}

export interface RunnerDefinition {
  capabilities: readonly string[];
  health: HealthStatus;
  id: string;
  lifecycle: RunnerLifecycle;
}

export interface TaskAssignment {
  agent_id: string;
  assigned_by: ActorReference;
  correlation_id: string;
  id: string;
  status: AssignmentStatus;
  task_id: string;
  task_type: string;
}

export interface UsageMetadata {
  cost_amount: number;
  currency: string;
  input_tokens: number;
  output_tokens: number;
}

export interface ExecutionResult {
  evidence: Record<string, unknown>;
  output: unknown;
  usage: UsageMetadata | null;
}

export interface Run {
  agent_id: string;
  assignment_id: string;
  cancellation_reason: string | null;
  correlation_id: string;
  evidence: Record<string, unknown>;
  id: string;
  model_id: string;
  output: unknown;
  runner_id: string;
  status: RunStatus;
  task_id: string;
  timeout_ms: number;
  usage: UsageMetadata | null;
}

export interface RuntimeEvent {
  actor: ActorReference;
  aggregate_id: string;
  aggregate_type: "AGENT" | "TASK" | "RUN";
  correlation_id: string;
  evidence: Record<string, unknown>;
  name: string;
}

export interface RuntimeMutation<T> {
  entity: T;
  event: RuntimeEvent | null;
}

export interface ExecutionRequest {
  agent_id: string;
  correlation_id: string;
  model_id: string;
  run_id: string;
  runner_id: string;
  signal: AbortSignal;
  task_id: string;
  timeout_ms: number;
}

export type RunExecutor = (
  request: ExecutionRequest,
) => ExecutionResult | Promise<ExecutionResult>;

type AssignmentInput = {
  agent_id: string;
  assigned_by: ActorReference;
  correlation_id: string;
  id: string;
  idempotency_key: string;
  task_id: string;
  task_status: TaskStatus;
  task_type: string;
};

type RunInput = {
  assignment_id: string;
  correlation_id: string;
  id: string;
  idempotency_key: string;
  task_id: string;
  timeout_ms: number;
};

const includesAll = (
  available: readonly string[],
  required: readonly string[],
): boolean => required.every((capability) => available.includes(capability));

export class AgentRuntimeEngine {
  private readonly agents = new Map<string, AgentDefinition>();
  private readonly providers = new Map<string, ModelProvider>();
  private readonly models = new Map<string, ModelDefinition>();
  private readonly runners = new Map<string, RunnerDefinition>();
  private readonly assignments = new Map<string, TaskAssignment>();
  private readonly runs = new Map<string, Run>();
  private readonly operations = new Map<string, unknown>();
  private readonly controllers = new Map<string, AbortController>();

  private once<T>(scope: string, key: string, operation: () => T): T {
    const operationId = `${scope}:${key}`;
    if (this.operations.has(operationId))
      return this.operations.get(operationId) as T;
    const result = operation();
    this.operations.set(operationId, result);
    return result;
  }

  registerProvider(provider: ModelProvider): ModelProvider {
    this.expectNew(this.providers, provider.id, "PROVIDER_ALREADY_EXISTS");
    this.providers.set(provider.id, provider);
    return provider;
  }

  registerModel(model: ModelDefinition): ModelDefinition {
    this.expectNew(this.models, model.id, "MODEL_ALREADY_EXISTS");
    if (!this.providers.has(model.provider_id))
      throw new RuntimeError("PROVIDER_NOT_FOUND");
    this.models.set(model.id, model);
    return model;
  }

  registerRunner(runner: RunnerDefinition): RunnerDefinition {
    this.expectNew(this.runners, runner.id, "RUNNER_ALREADY_EXISTS");
    this.runners.set(runner.id, runner);
    return runner;
  }

  registerAgentDefinition(agent: AgentDefinition): AgentDefinition {
    this.expectNew(this.agents, agent.id, "AGENT_ALREADY_EXISTS");
    if (
      agent.version < 1 ||
      agent.model_policy.model_ids.length === 0 ||
      agent.runner_policy.runner_ids.length === 0
    )
      throw new RuntimeError("INVALID_AGENT_DEFINITION");
    this.agents.set(agent.id, agent);
    return agent;
  }

  updateRunnerHealth(id: string, health: HealthStatus): RunnerDefinition {
    const runner = this.getRunner(id);
    const updated = { ...runner, health };
    this.runners.set(id, updated);
    return updated;
  }

  assignTask(input: AssignmentInput): RuntimeMutation<TaskAssignment> {
    return this.once("assignment:create", input.idempotency_key, () => {
      const agent = this.getAgent(input.agent_id);
      if (agent.lifecycle !== "ACTIVE" || agent.runtime_status !== "AVAILABLE")
        throw new RuntimeError("AGENT_UNAVAILABLE");
      if (!agent.allowed_task_types.includes(input.task_type))
        throw new RuntimeError("TASK_TYPE_NOT_ALLOWED");
      if (input.task_status !== "READY" && input.task_status !== "QUEUED")
        throw new RuntimeError("TASK_NOT_ASSIGNABLE");
      this.expectNew(this.assignments, input.id, "ASSIGNMENT_ALREADY_EXISTS");
      const entity: TaskAssignment = {
        agent_id: input.agent_id,
        assigned_by: input.assigned_by,
        correlation_id: input.correlation_id,
        id: input.id,
        status: "ASSIGNED",
        task_id: input.task_id,
        task_type: input.task_type,
      };
      this.assignments.set(entity.id, entity);
      return {
        entity,
        event: this.event(
          input.assigned_by,
          entity.task_id,
          "TASK",
          input.correlation_id,
          "TASK.ASSIGNED",
          { agent_id: entity.agent_id, assignment_id: entity.id },
        ),
      };
    });
  }

  selectExecutionTarget(agentId: string): {
    model: ModelDefinition;
    runner: RunnerDefinition;
  } {
    const agent = this.getAgent(agentId);
    const model = agent.model_policy.model_ids
      .map((id) => this.models.get(id))
      .find(
        (candidate): candidate is ModelDefinition =>
          candidate !== undefined &&
          candidate.lifecycle === "ACTIVE" &&
          this.providers.get(candidate.provider_id)?.status === "ACTIVE" &&
          includesAll(
            candidate.capabilities,
            agent.model_policy.required_capabilities,
          ),
      );
    if (!model) throw new RuntimeError("NO_COMPATIBLE_MODEL");
    const runner = agent.runner_policy.runner_ids
      .map((id) => this.runners.get(id))
      .find(
        (candidate): candidate is RunnerDefinition =>
          candidate !== undefined &&
          candidate.lifecycle === "ACTIVE" &&
          candidate.health === "HEALTHY" &&
          includesAll(
            candidate.capabilities,
            agent.runner_policy.required_capabilities,
          ),
      );
    if (!runner) throw new RuntimeError("NO_COMPATIBLE_RUNNER");
    return { model, runner };
  }

  createRun(input: RunInput): RuntimeMutation<Run> {
    return this.once("run:create", input.idempotency_key, () => {
      const assignment = this.getAssignment(input.assignment_id);
      if (assignment.task_id !== input.task_id)
        throw new RuntimeError("ASSIGNMENT_TASK_MISMATCH");
      if (input.timeout_ms <= 0 || !Number.isSafeInteger(input.timeout_ms))
        throw new RuntimeError("INVALID_TIMEOUT");
      this.expectNew(this.runs, input.id, "RUN_ALREADY_EXISTS");
      const target = this.selectExecutionTarget(assignment.agent_id);
      const entity: Run = {
        agent_id: assignment.agent_id,
        assignment_id: assignment.id,
        cancellation_reason: null,
        correlation_id: input.correlation_id,
        evidence: {},
        id: input.id,
        model_id: target.model.id,
        output: null,
        runner_id: target.runner.id,
        status: "REQUESTED",
        task_id: input.task_id,
        timeout_ms: input.timeout_ms,
        usage: null,
      };
      this.runs.set(entity.id, entity);
      return {
        entity,
        event: this.runEvent(entity, "RUN.REQUESTED"),
      };
    });
  }

  async executeRun(
    id: string,
    executor: RunExecutor,
  ): Promise<RuntimeMutation<Run>> {
    const requested = this.getRun(id);
    if (requested.status !== "REQUESTED")
      throw new RuntimeError("RUN_NOT_EXECUTABLE", {
        status: requested.status,
      });
    const running = { ...requested, status: "RUNNING" as const };
    this.runs.set(id, running);
    const controller = new AbortController();
    this.controllers.set(id, controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        Promise.resolve(
          executor({
            agent_id: running.agent_id,
            correlation_id: running.correlation_id,
            model_id: running.model_id,
            run_id: running.id,
            runner_id: running.runner_id,
            signal: controller.signal,
            task_id: running.task_id,
            timeout_ms: running.timeout_ms,
          }),
        ).then((result) => ({ kind: "result" as const, result })),
        new Promise<{ kind: "timeout" }>((resolve) => {
          timer = setTimeout(
            () => resolve({ kind: "timeout" }),
            running.timeout_ms,
          );
        }),
        new Promise<{ kind: "cancelled" }>((resolve) => {
          controller.signal.addEventListener(
            "abort",
            () => resolve({ kind: "cancelled" }),
            { once: true },
          );
        }),
      ]);
      if (outcome.kind === "timeout") {
        controller.abort();
        return this.finishRun(running, "TIMED_OUT", null);
      }
      if (outcome.kind === "cancelled") {
        const cancelled = this.getRun(id);
        return {
          entity: cancelled,
          event: this.runEvent(cancelled, "RUN.CANCELLED"),
        };
      }
      const current = this.getRun(id);
      if (current.status === "CANCELLED")
        return {
          entity: current,
          event: this.runEvent(current, "RUN.CANCELLED"),
        };
      return this.finishRun(running, "SUCCEEDED", outcome.result);
    } catch {
      if (this.getRun(id).status === "CANCELLED") {
        const cancelled = this.getRun(id);
        return {
          entity: cancelled,
          event: this.runEvent(cancelled, "RUN.CANCELLED"),
        };
      }
      return this.finishRun(running, "FAILED", {
        evidence: { error_type: "EXECUTION_FAILURE" },
        output: null,
        usage: null,
      });
    } finally {
      if (timer) clearTimeout(timer);
      this.controllers.delete(id);
    }
  }

  cancelRun(id: string, reason: string): RuntimeMutation<Run> {
    const run = this.getRun(id);
    if (run.status !== "REQUESTED" && run.status !== "RUNNING")
      throw new RuntimeError("RUN_NOT_CANCELLABLE", { status: run.status });
    const entity = {
      ...run,
      cancellation_reason: reason,
      status: "CANCELLED" as const,
    };
    this.runs.set(id, entity);
    this.controllers.get(id)?.abort();
    return { entity, event: this.runEvent(entity, "RUN.CANCELLED") };
  }

  private finishRun(
    run: Run,
    status: "SUCCEEDED" | "FAILED" | "TIMED_OUT",
    result: ExecutionResult | null,
  ): RuntimeMutation<Run> {
    const entity: Run = {
      ...run,
      evidence: result?.evidence ?? {},
      output: result?.output ?? null,
      status,
      usage: result?.usage ?? null,
    };
    this.runs.set(entity.id, entity);
    return {
      entity,
      event: this.runEvent(entity, `RUN.${status}`),
    };
  }

  private runEvent(run: Run, name: string): RuntimeEvent {
    return this.event(
      { id: run.agent_id, type: "AGENT" },
      run.id,
      "RUN",
      run.correlation_id,
      name,
      run.evidence,
    );
  }

  private event(
    actor: ActorReference,
    aggregateId: string,
    aggregateType: RuntimeEvent["aggregate_type"],
    correlationId: string,
    name: string,
    evidence: Record<string, unknown>,
  ): RuntimeEvent {
    return {
      actor,
      aggregate_id: aggregateId,
      aggregate_type: aggregateType,
      correlation_id: correlationId,
      evidence,
      name,
    };
  }

  private getAgent(id: string): AgentDefinition {
    const value = this.agents.get(id);
    if (!value) throw new RuntimeError("AGENT_NOT_FOUND");
    return value;
  }

  private getRunner(id: string): RunnerDefinition {
    const value = this.runners.get(id);
    if (!value) throw new RuntimeError("RUNNER_NOT_FOUND");
    return value;
  }

  private getAssignment(id: string): TaskAssignment {
    const value = this.assignments.get(id);
    if (!value) throw new RuntimeError("ASSIGNMENT_NOT_FOUND");
    return value;
  }

  private getRun(id: string): Run {
    const value = this.runs.get(id);
    if (!value) throw new RuntimeError("RUN_NOT_FOUND");
    return value;
  }

  private expectNew<T>(
    collection: Map<string, T>,
    id: string,
    code: string,
  ): void {
    if (collection.has(id)) throw new RuntimeError(code);
  }
}

export * from "./development-team.js";
