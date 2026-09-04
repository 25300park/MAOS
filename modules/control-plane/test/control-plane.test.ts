import assert from "node:assert/strict";
import test from "node:test";
import {
  ControlPlaneError,
  ControlPlaneRegistry,
  type ControlPlaneActor,
} from "../src/index.js";

const human: ControlPlaneActor = { id: "human-owner", type: "HUMAN" };

function registerSystemFoundation(registry: ControlPlaneRegistry, id: string) {
  registry.registerSystem({
    id,
    lifecycle: "ACTIVE",
    name: id,
    owner: human,
    source_of_truth: "DOMAIN_SYSTEM",
    type: "DOMAIN_APPLICATION",
  });
  registry.registerEnvironment({
    configuration_reference: `configref://${id}/development`,
    credential_reference: `secretref://${id}/development`,
    health: "HEALTHY",
    id: `${id}-development`,
    name: "DEVELOPMENT",
    system_id: id,
  });
  registry.registerRepository({
    default_branch: "main",
    id: `${id}-repository`,
    reference: `registry://${id}/repository`,
    system_id: id,
  });
  registry.registerWorkroot({
    id: `${id}-workroot`,
    repository_id: `${id}-repository`,
    root_reference: `workroot://${id}`,
    system_id: id,
  });
}

test("registers reusable system, environment, repository, workroot, and runner resources", () => {
  const registry = new ControlPlaneRegistry();
  registerSystemFoundation(registry, "system-a");
  registry.registerRunner({
    capabilities: ["LOCAL", "READ_FILE"],
    environment_id: "system-a-development",
    health: "HEALTHY",
    id: "runner-a",
    lifecycle: "ACTIVE",
    system_id: "system-a",
    workroot_ids: ["system-a-workroot"],
  });
  const view = registry.projectControlPlane({ system_ids: ["system-a"] });
  assert.deepEqual(view.summary, {
    alerts: 0,
    projects: 0,
    runs: 0,
    systems: 1,
    tasks: 0,
  });
  assert.equal(view.systems[0]?.health, "HEALTHY");
  assert.throws(
    () => registerSystemFoundation(registry, "system-a"),
    /SYSTEM_ALREADY_EXISTS/,
  );
});

test("rejects cross-system environment, repository, workroot, and runner bindings", () => {
  const registry = new ControlPlaneRegistry();
  registerSystemFoundation(registry, "system-a");
  registerSystemFoundation(registry, "system-b");
  assert.throws(
    () =>
      registry.registerRunner({
        capabilities: ["LOCAL"],
        environment_id: "system-b-development",
        health: "HEALTHY",
        id: "runner-escape",
        lifecycle: "ACTIVE",
        system_id: "system-a",
        workroot_ids: ["system-a-workroot"],
      }),
    /CROSS_SYSTEM_SCOPE_DENIED/,
  );
  assert.throws(
    () =>
      registry.registerWorkroot({
        id: "workroot-escape",
        repository_id: "system-b-repository",
        root_reference: "workroot://escape",
        system_id: "system-a",
      }),
    /CROSS_SYSTEM_SCOPE_DENIED/,
  );
});

test("keeps projects, tasks, and runs separate and isolated across projects", () => {
  const registry = new ControlPlaneRegistry();
  registerSystemFoundation(registry, "system-a");
  registry.registerRunner({
    capabilities: ["LOCAL"],
    environment_id: "system-a-development",
    health: "HEALTHY",
    id: "runner-a",
    lifecycle: "ACTIVE",
    system_id: "system-a",
    workroot_ids: ["system-a-workroot"],
  });
  for (const id of ["project-a", "project-b"])
    registry.bindProject({
      id,
      owner: human,
      repository_id: "system-a-repository",
      system_id: "system-a",
    });
  registry.bindTask({
    id: "task-a",
    owner: { id: "agent-a", type: "AGENT" },
    project_id: "project-a",
    status: "READY",
    system_id: "system-a",
  });
  registry.bindRun({
    agent_id: "agent-a",
    correlation_id: "corr-a",
    id: "run-a",
    model_id: "model-a",
    project_id: "project-a",
    runner_id: "runner-a",
    status: "RUNNING",
    system_id: "system-a",
    task_id: "task-a",
  });
  assert.notEqual(registry.getTask("task-a").id, registry.getRun("run-a").id);
  assert.throws(
    () =>
      registry.bindRun({
        agent_id: "agent-a",
        correlation_id: "corr-escape",
        id: "run-escape",
        model_id: "model-a",
        project_id: "project-b",
        runner_id: "runner-a",
        status: "RUNNING",
        system_id: "system-a",
        task_id: "task-a",
      }),
    /CROSS_PROJECT_SCOPE_DENIED/,
  );
});

test("keeps integration ownership external and defaults cross-system writes to deny", () => {
  const registry = new ControlPlaneRegistry();
  registerSystemFoundation(registry, "crm");
  registry.registerIntegration({
    adapter_reference: "adapterref://crm/v1",
    allowed_actions: ["READ"],
    id: "integration-crm",
    maturity: "I1",
    mode: "READ_ONLY",
    source_system_id: "crm",
  });
  assert.equal(registry.getSystem("crm").source_of_truth, "DOMAIN_SYSTEM");
  assert.throws(
    () =>
      registry.authorize({
        action: "WRITE",
        actor: { id: "agent-a", type: "AGENT" },
        approved: false,
        permission: "ALLOW",
        project_id: null,
        system_id: "crm",
      }),
    (error) =>
      error instanceof ControlPlaneError &&
      error.code === "CROSS_SYSTEM_WRITE_DENIED",
  );
  assert.throws(
    () =>
      registry.authorize({
        action: "READ",
        actor: { id: "agent-a", type: "AGENT" },
        approved: false,
        permission: "DENY",
        project_id: null,
        system_id: "crm",
      }),
    /PERMISSION_DENIED/,
  );
  assert.throws(
    () =>
      registry.authorize({
        action: "READ",
        actor: { id: "agent-a", type: "AGENT" },
        approved: false,
        permission: "ALLOW_WITH_APPROVAL",
        project_id: null,
        system_id: "crm",
      }),
    /APPROVAL_REQUIRED/,
  );
});

test("enforces bounded reusable loop policy and emits separate event and audit proof", () => {
  const registry = new ControlPlaneRegistry();
  registerSystemFoundation(registry, "system-a");
  registry.registerLoopPolicy({
    allowed_tools: ["READ_FILE"],
    id: "loop-policy-a",
    max_cost_amount: 5,
    max_iterations: 2,
    time_budget_ms: 60_000,
  });
  const loop = registry.startLoop({
    actor: human,
    correlation_id: "corr-loop",
    id: "loop-a",
    policy_id: "loop-policy-a",
    project_id: null,
    system_id: "system-a",
    trigger: { id: "request-a", type: "HUMAN_REQUEST" },
  });
  registry.recordLoopEvaluation({
    cost_amount: 1,
    id: loop.id,
    progress: true,
    requested_tool: "READ_FILE",
  });
  registry.recordLoopEvaluation({
    cost_amount: 1,
    id: loop.id,
    progress: true,
    requested_tool: "READ_FILE",
  });
  assert.equal(registry.getLoop("loop-a").stop_condition, "MAX_ITERATIONS");
  const evidence = registry.evidence("corr-loop");
  assert.equal(evidence.events.at(-1)?.name, "LOOP.STOPPED");
  assert.equal(evidence.audit.at(-1)?.action, "LOOP.STOP");
  assert.notDeepEqual(evidence.events.at(-1), evidence.audit.at(-1));
});

test("pauses, resumes, and cancels loops without weakening human authority", () => {
  const registry = new ControlPlaneRegistry();
  registerSystemFoundation(registry, "system-a");
  registry.registerLoopPolicy({
    allowed_tools: ["READ_FILE"],
    id: "loop-policy-a",
    max_cost_amount: 5,
    max_iterations: 3,
    time_budget_ms: 60_000,
  });
  registry.startLoop({
    actor: human,
    correlation_id: "corr-control",
    id: "loop-control",
    policy_id: "loop-policy-a",
    project_id: null,
    system_id: "system-a",
    trigger: { id: "request-a", type: "HUMAN_REQUEST" },
  });

  assert.equal(registry.pauseLoop("loop-control").status, "PAUSED");
  assert.throws(
    () =>
      registry.recordLoopEvaluation({
        cost_amount: 0,
        id: "loop-control",
        progress: true,
        requested_tool: "READ_FILE",
      }),
    /LOOP_NOT_RUNNING/,
  );
  assert.equal(registry.resumeLoop("loop-control", human).status, "RUNNING");
  assert.equal(
    registry.cancelLoop("loop-control", human).stop_condition,
    "KILL_SWITCH",
  );
  assert.equal(registry.getLoop("loop-control").status, "CANCELLED");
  const proof = registry.evidence("corr-control");
  assert.deepEqual(
    proof.audit.map(({ action }) => action),
    ["LOOP.START", "LOOP.PAUSE", "LOOP.RESUME", "LOOP.CANCEL"],
  );
  assert.throws(
    () => registry.resumeLoop("loop-control", human),
    /LOOP_NOT_PAUSED/,
  );
});

test("enforces cost and elapsed-time budgets", () => {
  let now = 100;
  const registry = new ControlPlaneRegistry(() => now);
  registerSystemFoundation(registry, "system-a");
  registry.registerLoopPolicy({
    allowed_tools: ["READ_FILE"],
    id: "loop-policy-budget",
    max_cost_amount: 1,
    max_iterations: 10,
    time_budget_ms: 50,
  });
  registry.startLoop({
    actor: human,
    correlation_id: "corr-cost",
    id: "loop-cost",
    policy_id: "loop-policy-budget",
    project_id: null,
    system_id: "system-a",
    trigger: { id: "request-cost", type: "HUMAN_REQUEST" },
  });
  assert.equal(
    registry.recordLoopEvaluation({
      cost_amount: 2,
      id: "loop-cost",
      progress: true,
      requested_tool: "READ_FILE",
    }).stop_condition,
    "COST_BUDGET_EXCEEDED",
  );

  registry.startLoop({
    actor: human,
    correlation_id: "corr-time",
    id: "loop-time",
    policy_id: "loop-policy-budget",
    project_id: null,
    system_id: "system-a",
    trigger: { id: "request-time", type: "HUMAN_REQUEST" },
  });
  now = 151;
  assert.equal(
    registry.recordLoopEvaluation({
      cost_amount: 0,
      id: "loop-time",
      progress: true,
      requested_tool: "READ_FILE",
    }).stop_condition,
    "TIME_BUDGET_EXCEEDED",
  );
});
