import { OperationsError, type OperationsActor } from "./index.js";

export interface RetryResult<T> {
  attempts: number;
  backoff_ms: readonly number[];
  replayed: boolean;
  value: T;
}

interface RetryInput<T> {
  base_backoff_ms: number;
  idempotency_key: string;
  max_attempts: number;
  max_elapsed_ms: number;
  operation: (signal: AbortSignal) => Promise<T>;
  retryable_codes: readonly string[];
  signal?: AbortSignal;
}

export class BoundedRetryExecutor {
  readonly #completed = new Map<string, RetryResult<unknown>>();
  readonly #inflight = new Map<string, Promise<RetryResult<unknown>>>();
  readonly #unknownOutcomes = new Map<
    string,
    { attempts: number; backoff_ms: readonly number[] }
  >();

  async execute<T>(input: RetryInput<T>): Promise<RetryResult<T>> {
    if (
      !input.idempotency_key ||
      !Number.isFinite(input.max_attempts) ||
      !Number.isInteger(input.max_attempts) ||
      input.max_attempts < 1 ||
      input.max_attempts > 10 ||
      !Number.isFinite(input.max_elapsed_ms) ||
      !Number.isSafeInteger(input.max_elapsed_ms) ||
      input.max_elapsed_ms <= 0 ||
      !Number.isFinite(input.base_backoff_ms) ||
      !Number.isSafeInteger(input.base_backoff_ms) ||
      input.base_backoff_ms < 0
    )
      throw new OperationsError("INVALID_RETRY_POLICY");
    const existing = this.#completed.get(input.idempotency_key);
    if (existing) return { ...(existing as RetryResult<T>), replayed: true };
    if (this.#unknownOutcomes.has(input.idempotency_key))
      throw new OperationsError("OPERATION_OUTCOME_UNKNOWN");
    const inflight = this.#inflight.get(input.idempotency_key);
    if (inflight) return inflight as Promise<RetryResult<T>>;
    const execution = this.executeNew(input);
    this.#inflight.set(input.idempotency_key, execution);
    try {
      return await execution;
    } finally {
      if (this.#inflight.get(input.idempotency_key) === execution)
        this.#inflight.delete(input.idempotency_key);
    }
  }

  private async executeNew<T>(input: RetryInput<T>): Promise<RetryResult<T>> {
    const started = Date.now();
    const backoff: number[] = [];
    for (let attempt = 1; attempt <= input.max_attempts; attempt += 1) {
      if (input.signal?.aborted)
        throw new OperationsError("OPERATION_CANCELLED");
      if (Date.now() - started > input.max_elapsed_ms)
        throw new OperationsError("RETRY_TIME_BUDGET_EXCEEDED");
      try {
        const remaining = Math.max(
          1,
          input.max_elapsed_ms - (Date.now() - started),
        );
        const value = await this.runOperation(
          input.operation,
          input.signal,
          remaining,
        );
        const result: RetryResult<T> = Object.freeze({
          attempts: attempt,
          backoff_ms: Object.freeze([...backoff]),
          replayed: false,
          value,
        });
        this.#completed.set(input.idempotency_key, result);
        return result;
      } catch (error) {
        if (
          error instanceof TimedOutOperation ||
          error instanceof CancelledOperation
        ) {
          this.#unknownOutcomes.set(input.idempotency_key, {
            attempts: attempt,
            backoff_ms: Object.freeze([...backoff]),
          });
          void error.completion
            .then((value) => {
              this.#completed.set(
                input.idempotency_key,
                Object.freeze({
                  attempts: attempt,
                  backoff_ms: Object.freeze([...backoff]),
                  replayed: false,
                  value,
                }),
              );
              this.#unknownOutcomes.delete(input.idempotency_key);
            })
            .catch(() => undefined);
          throw error;
        }
        const code = error instanceof OperationsError ? error.code : "UNKNOWN";
        if (
          attempt === input.max_attempts ||
          !input.retryable_codes.includes(code)
        )
          throw error;
        const delayMs = input.base_backoff_ms * 2 ** (attempt - 1);
        backoff.push(delayMs);
        const remaining = input.max_elapsed_ms - (Date.now() - started);
        if (remaining <= delayMs)
          throw new OperationsError("RETRY_TIME_BUDGET_EXCEEDED");
        await cancellableDelay(delayMs, input.signal);
      }
    }
    throw new OperationsError("RETRY_EXHAUSTED");
  }

  reconcileUnknown<T>(
    input: {
      actor: OperationsActor;
      evidence_refs: readonly string[];
      idempotency_key: string;
    } & (
      | { outcome: "CONFIRMED_NOT_APPLIED" }
      | { outcome: "CONFIRMED_APPLIED"; value: T }
    ),
  ): void {
    if (input.actor.type !== "HUMAN")
      throw new OperationsError("HUMAN_RECONCILIATION_AUTHORITY_REQUIRED");
    if (input.evidence_refs.length === 0)
      throw new OperationsError("RECONCILIATION_EVIDENCE_REQUIRED");
    const unknown = this.#unknownOutcomes.get(input.idempotency_key);
    if (!unknown) throw new OperationsError("UNKNOWN_OUTCOME_NOT_FOUND");
    if (input.outcome === "CONFIRMED_APPLIED")
      this.#completed.set(
        input.idempotency_key,
        Object.freeze({
          attempts: unknown.attempts,
          backoff_ms: unknown.backoff_ms,
          replayed: false,
          value: input.value,
        }),
      );
    this.#unknownOutcomes.delete(input.idempotency_key);
  }

  private async runOperation<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal | undefined,
    timeoutMs: number,
  ): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    const completion = Promise.resolve().then(() =>
      operation(controller.signal),
    );
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new TimedOutOperation(completion));
      }, timeoutMs);
    });
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => {
        controller.abort();
        reject(new CancelledOperation(completion));
      };
      signal?.addEventListener("abort", abort, { once: true });
    });
    try {
      return await Promise.race([completion, timeout, cancelled]);
    } finally {
      if (timer) clearTimeout(timer);
      if (abort) signal?.removeEventListener("abort", abort);
    }
  }
}

class TimedOutOperation<T> extends Error {
  readonly code = "OPERATION_TIMED_OUT";

  constructor(readonly completion: Promise<T>) {
    super("OPERATION_TIMED_OUT");
  }
}

class CancelledOperation<T> extends Error {
  readonly code = "OPERATION_CANCELLED";

  constructor(readonly completion: Promise<T>) {
    super("OPERATION_CANCELLED");
  }
}

function cancellableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted)
    return Promise.reject(new OperationsError("OPERATION_CANCELLED"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    const cancel = () => {
      clearTimeout(timer);
      reject(new OperationsError("OPERATION_CANCELLED"));
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

export interface ResourceLimits {
  max_concurrent_runs: number;
  max_cost_units: number;
  max_loop_iterations: number;
  max_task_runs: number;
  max_time_ms: number;
}

export class ResourceProtectionPolicy {
  constructor(private readonly limits: ResourceLimits) {
    if (
      Object.values(limits).some(
        (value) => !Number.isFinite(value) || value <= 0,
      )
    )
      throw new OperationsError("INVALID_RESOURCE_LIMITS");
  }

  evaluate(input: {
    concurrent_runs: number;
    cost_units: number;
    loop_iterations: number;
    task_runs: number;
    time_ms: number;
  }): { reasons: string[]; status: "ALLOWED" | "DEGRADED" | "DENIED" } {
    const exceeded: string[] = [];
    if (input.concurrent_runs > this.limits.max_concurrent_runs)
      exceeded.push("RUNNER_CAPACITY_EXCEEDED");
    if (input.cost_units > this.limits.max_cost_units)
      exceeded.push("COST_BUDGET_EXCEEDED");
    if (input.loop_iterations > this.limits.max_loop_iterations)
      exceeded.push("LOOP_ITERATION_LIMIT_EXCEEDED");
    if (input.task_runs > this.limits.max_task_runs)
      exceeded.push("TASK_RUN_LIMIT_EXCEEDED");
    if (input.time_ms > this.limits.max_time_ms)
      exceeded.push("TIME_BUDGET_EXCEEDED");
    if (exceeded.length > 0) return { reasons: exceeded, status: "DENIED" };
    if (input.concurrent_runs === this.limits.max_concurrent_runs)
      return { reasons: ["RUNNER_CAPACITY_REACHED"], status: "DEGRADED" };
    return { reasons: [], status: "ALLOWED" };
  }
}

export type EmergencyStopScope =
  | "AGENT_EXECUTION"
  | "DEPLOYMENT_READINESS"
  | "EXTERNAL_ACTION_READINESS"
  | "LOCAL_RUNNER"
  | "LOOP"
  | "TOOL_EXECUTION";

export interface EmergencyStop {
  actor_id: string;
  correlation_id: string;
  engaged: boolean;
  evidence_refs: readonly string[];
  scope: EmergencyStopScope;
}

export class EmergencyStopRegistry {
  readonly #stops = new Map<EmergencyStopScope, EmergencyStop>();

  engage(input: {
    actor: OperationsActor;
    correlation_id: string;
    evidence_refs: readonly string[];
    scope: EmergencyStopScope;
  }): Readonly<EmergencyStop> {
    if (input.actor.type !== "HUMAN")
      throw new OperationsError("HUMAN_EMERGENCY_AUTHORITY_REQUIRED");
    if (!input.correlation_id || input.evidence_refs.length === 0)
      throw new OperationsError("EMERGENCY_STOP_EVIDENCE_REQUIRED");
    const stop = Object.freeze({
      actor_id: input.actor.id,
      correlation_id: input.correlation_id,
      engaged: true,
      evidence_refs: Object.freeze([...input.evidence_refs]),
      scope: input.scope,
    });
    this.#stops.set(stop.scope, stop);
    return stop;
  }

  release(input: {
    actor: OperationsActor;
    evidence_refs: readonly string[];
    scope: EmergencyStopScope;
  }): Readonly<EmergencyStop> {
    if (input.actor.type !== "HUMAN")
      throw new OperationsError("HUMAN_EMERGENCY_AUTHORITY_REQUIRED");
    const existing = this.#stops.get(input.scope);
    if (!existing) throw new OperationsError("EMERGENCY_STOP_NOT_FOUND");
    const released = Object.freeze({
      ...existing,
      actor_id: input.actor.id,
      engaged: false,
      evidence_refs: Object.freeze([
        ...existing.evidence_refs,
        ...input.evidence_refs,
      ]),
    });
    this.#stops.set(input.scope, released);
    return released;
  }

  assertAllowed(scope: EmergencyStopScope): void {
    if (this.#stops.get(scope)?.engaged)
      throw new OperationsError("EMERGENCY_STOP_ENGAGED");
  }

  active(): readonly EmergencyStop[] {
    return [...this.#stops.values()].filter(({ engaged }) => engaged);
  }
}

export interface FailureDependency {
  dependency_ids: readonly string[];
  id: string;
}

export class FailureRecoverySimulator {
  readonly #dependencies: readonly FailureDependency[];
  readonly #states = new Map<string, "DEGRADED" | "HEALTHY" | "UNAVAILABLE">();

  constructor(dependencies: readonly FailureDependency[]) {
    const ids = new Set(dependencies.map(({ id }) => id));
    if (
      dependencies.length === 0 ||
      ids.size !== dependencies.length ||
      dependencies.some(({ dependency_ids }) =>
        dependency_ids.some((dependency) => !ids.has(dependency)),
      )
    )
      throw new OperationsError("INVALID_FAILURE_DEPENDENCY_GRAPH");
    this.#dependencies = dependencies.map((item) => ({
      dependency_ids: Object.freeze([...item.dependency_ids]),
      id: item.id,
    }));
    for (const { id } of dependencies) this.#states.set(id, "HEALTHY");
  }

  fail(input: {
    actor: OperationsActor;
    correlation_id: string;
    evidence_refs: readonly string[];
    target_id: string;
  }): {
    classification: "SIMULATED";
    fail_closed: true;
    states: Readonly<Record<string, "DEGRADED" | "HEALTHY" | "UNAVAILABLE">>;
  } {
    if (!this.#states.has(input.target_id))
      throw new OperationsError("FAILURE_TARGET_NOT_FOUND");
    if (!input.correlation_id || input.evidence_refs.length === 0)
      throw new OperationsError("FAILURE_EVIDENCE_REQUIRED");
    this.#states.set(input.target_id, "UNAVAILABLE");
    const affected = new Set([input.target_id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of this.#dependencies)
        if (
          !affected.has(item.id) &&
          item.dependency_ids.some((dependency) => affected.has(dependency))
        ) {
          affected.add(item.id);
          this.#states.set(item.id, "DEGRADED");
          changed = true;
        }
    }
    return {
      classification: "SIMULATED",
      fail_closed: true,
      states: Object.freeze(Object.fromEntries(this.#states)),
    };
  }

  recover(input: {
    actor: OperationsActor;
    correlation_id: string;
    evidence_refs: readonly string[];
    target_id: string;
  }): {
    classification: "SIMULATED";
    states: Readonly<Record<string, "DEGRADED" | "HEALTHY" | "UNAVAILABLE">>;
  } {
    if (input.actor.type !== "HUMAN")
      throw new OperationsError("HUMAN_RECOVERY_AUTHORITY_REQUIRED");
    if (!this.#states.has(input.target_id))
      throw new OperationsError("FAILURE_TARGET_NOT_FOUND");
    if (!input.correlation_id || input.evidence_refs.length === 0)
      throw new OperationsError("RECOVERY_EVIDENCE_REQUIRED");
    const target = this.#dependencies.find(({ id }) => id === input.target_id)!;
    if (
      target.dependency_ids.some(
        (dependency) => this.#states.get(dependency) !== "HEALTHY",
      )
    )
      throw new OperationsError("DEPENDENCY_UNAVAILABLE");
    this.#states.set(input.target_id, "HEALTHY");
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of this.#dependencies)
        if (
          this.#states.get(item.id) === "DEGRADED" &&
          item.dependency_ids.every(
            (dependency) => this.#states.get(dependency) === "HEALTHY",
          )
        ) {
          this.#states.set(item.id, "HEALTHY");
          changed = true;
        }
    }
    return {
      classification: "SIMULATED",
      states: Object.freeze(Object.fromEntries(this.#states)),
    };
  }
}

export class CircuitBreaker {
  readonly #failures = new Map<string, number>();
  readonly #states = new Map<string, "CLOSED" | "OPEN">();

  constructor(private readonly failureThreshold: number) {
    if (failureThreshold < 1 || failureThreshold > 100)
      throw new OperationsError("INVALID_CIRCUIT_THRESHOLD");
  }

  recordFailure(targetId: string): "CLOSED" | "OPEN" {
    const failures = (this.#failures.get(targetId) ?? 0) + 1;
    this.#failures.set(targetId, failures);
    const state = failures >= this.failureThreshold ? "OPEN" : "CLOSED";
    this.#states.set(targetId, state);
    return state;
  }

  state(targetId: string): "CLOSED" | "OPEN" {
    return this.#states.get(targetId) ?? "CLOSED";
  }

  assertAllowed(targetId: string): void {
    if (this.state(targetId) === "OPEN")
      throw new OperationsError("CIRCUIT_OPEN");
  }

  reset(targetId: string, actor: OperationsActor): void {
    if (actor.type !== "HUMAN")
      throw new OperationsError("HUMAN_RECOVERY_AUTHORITY_REQUIRED");
    this.#failures.set(targetId, 0);
    this.#states.set(targetId, "CLOSED");
  }
}
