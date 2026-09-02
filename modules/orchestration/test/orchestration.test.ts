import assert from "node:assert/strict";
import test from "node:test";
import type { GovernanceDecision } from "@maos/contracts";
import { WorkEngine, WorkError, type TaskStatus } from "../src/index.js";

const actor = { id: "human-owner", type: "HUMAN" } as const;
const context = { actor, correlation_id: "corr-work" };

function engineWithProject(): WorkEngine {
  const engine = new WorkEngine();
  engine.createProject({
    ...context,
    department_id: "department-1",
    id: "project-1",
    idempotency_key: "create-project-1",
    name: "Project One",
    organization_id: "organization-1",
    owner: actor,
  });
  return engine;
}

function createTask(
  engine: WorkEngine,
  id: string,
  status: TaskStatus = "DRAFT",
) {
  return engine.createTask({
    ...context,
    id,
    idempotency_key: `create-${id}`,
    owner: actor,
    project_id: "project-1",
    status,
    task_type: "DEVELOPMENT",
    title: id,
  });
}

test("creates and archives a human-owned project idempotently with events", () => {
  const engine = new WorkEngine();
  const input = {
    ...context,
    department_id: "department-1",
    id: "project-1",
    idempotency_key: "create-project-1",
    name: "Project One",
    organization_id: "organization-1",
    owner: actor,
  };

  const created = engine.createProject(input);
  assert.equal(created.entity.version, 1);
  assert.equal(created.event?.name, "PROJECT.CREATED");
  assert.deepEqual(engine.createProject(input), created);

  const archived = engine.archiveProject({
    ...context,
    expected_version: 1,
    idempotency_key: "archive-project-1",
    project_id: "project-1",
  });
  assert.equal(archived.entity.version, 2);
  assert.equal(archived.event?.name, "PROJECT.ARCHIVED");
  assert.deepEqual(
    engine.archiveProject({
      ...context,
      expected_version: 1,
      idempotency_key: "archive-project-1",
      project_id: "project-1",
    }),
    archived,
  );
});

test("executes canonical task transitions and rejects invalid transitions", () => {
  const engine = engineWithProject();
  createTask(engine, "task-1");

  let version = 1;
  for (const status of [
    "READY",
    "QUEUED",
    "IN_PROGRESS",
    "REVIEW",
    "REVISE",
    "IN_PROGRESS",
    "REVIEW",
    "COMPLETED",
  ] as const) {
    const result = engine.transitionTask({
      ...context,
      expected_version: version,
      idempotency_key: `task-1-${version}-${status}`,
      task_id: "task-1",
      to: status,
    });
    version += 1;
    assert.equal(result.entity.status, status);
    assert.equal(result.entity.version, version);
    assert.equal(result.event?.name, `TASK.${status}`);
  }

  assert.throws(
    () =>
      engine.transitionTask({
        ...context,
        expected_version: version,
        idempotency_key: "terminal-transition",
        task_id: "task-1",
        to: "READY",
      }),
    (error: unknown) =>
      error instanceof WorkError && error.code === "INVALID_TASK_TRANSITION",
  );
});

test("blocks unmet dependencies and rejects dependency cycles", () => {
  const engine = engineWithProject();
  createTask(engine, "task-a", "READY");
  createTask(engine, "task-b", "READY");
  engine.addDependency({
    depends_on_task_id: "task-a",
    dependency_type: "REQUIRES",
    idempotency_key: "dependency-b-a",
    task_id: "task-b",
  });

  const blocked = engine.transitionTask({
    ...context,
    expected_version: 1,
    idempotency_key: "queue-task-b",
    task_id: "task-b",
    to: "QUEUED",
  });
  assert.equal(blocked.entity.status, "WAITING_DEPENDENCY");
  assert.equal(blocked.event?.name, "TASK.WAITING_DEPENDENCY");

  assert.throws(
    () =>
      engine.addDependency({
        depends_on_task_id: "task-b",
        dependency_type: "REQUIRES",
        idempotency_key: "dependency-a-b",
        task_id: "task-a",
      }),
    (error: unknown) =>
      error instanceof WorkError && error.code === "DEPENDENCY_CYCLE",
  );
});

test("requires a valid Phase 1.7 decision to leave approval waiting", () => {
  const engine = engineWithProject();
  createTask(engine, "task-approval", "IN_PROGRESS");
  engine.transitionTask({
    ...context,
    expected_version: 1,
    idempotency_key: "wait-approval",
    task_id: "task-approval",
    to: "WAITING_APPROVAL",
  });

  const resume = (approval?: GovernanceDecision) =>
    engine.transitionTask({
      ...context,
      ...(approval ? { approval } : {}),
      expected_version: 2,
      idempotency_key: "resume-after-approval",
      task_id: "task-approval",
      to: "IN_PROGRESS",
    });
  assert.throws(
    () => resume(),
    (error: unknown) =>
      error instanceof WorkError && error.code === "APPROVAL_REQUIRED",
  );
  assert.equal(
    resume({
      allowed: true,
      approval_id: "approval-1",
      authority: "AUTHORIZED",
      status: "APPROVED",
      validity: "VALID",
    }).entity.status,
    "IN_PROGRESS",
  );
});

test("validates workflow definitions and approval-gated workflow state", () => {
  const engine = engineWithProject();
  const definition = engine.createWorkflowDefinition({
    ...context,
    id: "workflow-1",
    idempotency_key: "create-workflow-1",
    name: "Delivery Workflow",
    owner: actor,
    project_id: "project-1",
    steps: [
      { depends_on: [], gate: "DEPENDENCY_GATE", key: "build" },
      { depends_on: ["build"], gate: "APPROVAL_GATE", key: "approve" },
    ],
  });
  assert.equal(definition.entity.version, 1);
  assert.equal(definition.event?.name, "WORKFLOW.CREATED");

  const instance = engine.startWorkflow({
    ...context,
    definition_id: "workflow-1",
    id: "workflow-instance-1",
    idempotency_key: "start-workflow-1",
  });
  assert.equal(instance.entity.status, "RUNNING");

  engine.transitionWorkflow({
    ...context,
    expected_version: 1,
    idempotency_key: "workflow-wait-approval",
    instance_id: "workflow-instance-1",
    to: "WAITING_APPROVAL",
  });
  assert.throws(
    () =>
      engine.transitionWorkflow({
        ...context,
        expected_version: 2,
        idempotency_key: "workflow-resume",
        instance_id: "workflow-instance-1",
        to: "RUNNING",
      }),
    (error: unknown) =>
      error instanceof WorkError && error.code === "APPROVAL_REQUIRED",
  );
});
