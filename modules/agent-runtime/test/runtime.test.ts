import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentRuntimeEngine,
  RuntimeError,
  type ExecutionResult,
} from "../src/index.js";

const baseAgent = {
  allowed_task_types: ["DEVELOPMENT"],
  department_id: "department-1",
  id: "agent-1",
  lifecycle: "ACTIVE" as const,
  mission: "Implement reviewed tasks",
  model_policy: {
    model_ids: ["model-primary", "model-fallback"],
    required_capabilities: ["TEXT"],
  },
  name: "Developer Agent",
  role: "SPECIALIST",
  runner_policy: {
    required_capabilities: ["NODE"],
    runner_ids: ["runner-primary", "runner-fallback"],
  },
  runtime_status: "AVAILABLE" as const,
  version: 1,
};

function configuredEngine(): AgentRuntimeEngine {
  const engine = new AgentRuntimeEngine();
  engine.registerProvider({ id: "provider-primary", status: "DISABLED" });
  engine.registerProvider({ id: "provider-fallback", status: "ACTIVE" });
  engine.registerModel({
    capabilities: ["TEXT"],
    id: "model-primary",
    lifecycle: "ACTIVE",
    provider_id: "provider-primary",
  });
  engine.registerModel({
    capabilities: ["TEXT", "STRUCTURED_OUTPUT"],
    id: "model-fallback",
    lifecycle: "ACTIVE",
    provider_id: "provider-fallback",
  });
  engine.registerRunner({
    capabilities: ["NODE"],
    health: "UNKNOWN",
    id: "runner-primary",
    lifecycle: "ACTIVE",
  });
  engine.registerRunner({
    capabilities: ["NODE", "SANDBOX"],
    health: "HEALTHY",
    id: "runner-fallback",
    lifecycle: "ACTIVE",
  });
  engine.registerAgentDefinition(baseAgent);
  return engine;
}

function assign(engine: AgentRuntimeEngine) {
  return engine.assignTask({
    agent_id: "agent-1",
    assigned_by: { id: "human-1", type: "HUMAN" },
    correlation_id: "corr-runtime",
    id: "assignment-1",
    idempotency_key: "assign-task-1",
    task_id: "task-1",
    task_status: "QUEUED",
    task_type: "DEVELOPMENT",
  });
}

test("keeps Agent, Model, and Runner identities separate during assignment", () => {
  const engine = configuredEngine();

  assert.throws(
    () =>
      engine.assignTask({
        agent_id: "model-fallback",
        assigned_by: { id: "human-1", type: "HUMAN" },
        correlation_id: "corr-runtime",
        id: "assignment-invalid",
        idempotency_key: "assign-invalid",
        task_id: "task-1",
        task_status: "QUEUED",
        task_type: "DEVELOPMENT",
      }),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "AGENT_NOT_FOUND",
  );

  const assignment = assign(engine);
  assert.equal(assignment.entity.agent_id, "agent-1");
  assert.equal(assignment.entity.status, "ASSIGNED");
  assert.equal(assignment.event?.name, "TASK.ASSIGNED");
});

test("rejects assignment when the agent is unavailable or task type is forbidden", () => {
  const engine = configuredEngine();
  assert.throws(
    () =>
      engine.assignTask({
        agent_id: "agent-1",
        assigned_by: { id: "human-1", type: "HUMAN" },
        correlation_id: "corr-runtime",
        id: "assignment-forbidden",
        idempotency_key: "assign-forbidden",
        task_id: "task-2",
        task_status: "QUEUED",
        task_type: "DEPLOYMENT",
      }),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "TASK_TYPE_NOT_ALLOWED",
  );
});

test("selects ordered healthy compatible fallbacks and fails closed", () => {
  const engine = configuredEngine();
  const selected = engine.selectExecutionTarget("agent-1");
  assert.equal(selected.model.id, "model-fallback");
  assert.equal(selected.runner.id, "runner-fallback");

  engine.updateRunnerHealth("runner-fallback", "UNAVAILABLE");
  assert.throws(
    () => engine.selectExecutionTarget("agent-1"),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "NO_COMPATIBLE_RUNNER",
  );
});

test("records successful execution results with usage and evidence metadata", async () => {
  const engine = configuredEngine();
  const assignment = assign(engine);
  const requested = engine.createRun({
    assignment_id: assignment.entity.id,
    correlation_id: "corr-runtime",
    id: "run-success",
    idempotency_key: "run-success",
    task_id: "task-1",
    timeout_ms: 100,
  });
  const result: ExecutionResult = {
    evidence: { artifact_ids: ["artifact-1"] },
    output: { summary: "complete" },
    usage: {
      cost_amount: 0.02,
      currency: "USD",
      input_tokens: 10,
      output_tokens: 5,
    },
  };

  const completed = await engine.executeRun("run-success", async () => result);
  assert.equal(requested.entity.agent_id, "agent-1");
  assert.equal(requested.entity.model_id, "model-fallback");
  assert.equal(requested.entity.runner_id, "runner-fallback");
  assert.equal(completed.entity.status, "SUCCEEDED");
  assert.deepEqual(completed.entity.usage, result.usage);
  assert.deepEqual(completed.event?.evidence, result.evidence);
});

test("times out execution and cancels an in-flight run", async () => {
  const timeoutEngine = configuredEngine();
  const timeoutAssignment = assign(timeoutEngine);
  timeoutEngine.createRun({
    assignment_id: timeoutAssignment.entity.id,
    correlation_id: "corr-timeout",
    id: "run-timeout",
    idempotency_key: "run-timeout",
    task_id: "task-1",
    timeout_ms: 5,
  });
  const timedOut = await timeoutEngine.executeRun(
    "run-timeout",
    () => new Promise<ExecutionResult>(() => undefined),
  );
  assert.equal(timedOut.entity.status, "TIMED_OUT");
  assert.equal(timedOut.event?.name, "RUN.TIMED_OUT");

  const cancelEngine = configuredEngine();
  const cancelAssignment = assign(cancelEngine);
  cancelEngine.createRun({
    assignment_id: cancelAssignment.entity.id,
    correlation_id: "corr-cancel",
    id: "run-cancel",
    idempotency_key: "run-cancel",
    task_id: "task-1",
    timeout_ms: 100,
  });
  const running = cancelEngine.executeRun(
    "run-cancel",
    ({ signal }) =>
      new Promise<ExecutionResult>((resolve) => {
        signal.addEventListener("abort", () =>
          resolve({ evidence: {}, output: null, usage: null }),
        );
      }),
  );
  cancelEngine.cancelRun("run-cancel", "human-request");
  const cancelled = await running;
  assert.equal(cancelled.entity.status, "CANCELLED");
  assert.equal(cancelled.entity.cancellation_reason, "human-request");
  assert.equal(cancelled.event?.name, "RUN.CANCELLED");
});
