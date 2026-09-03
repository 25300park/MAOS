import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVELOPMENT_LOOP_STAGES,
  DEVELOPMENT_LOOP_STOP_CONDITIONS,
  type DevelopmentLoopAgentRole,
  DevelopmentLoopEngine,
  DevelopmentLoopError,
  type DevelopmentLoopTeamPort,
  WorkEngine,
} from "../src/index.js";

const human = { id: "human-owner", type: "HUMAN" as const };

class FakeDevelopmentLoopTeam implements DevelopmentLoopTeamPort {
  private readonly members: {
    agent_id: string;
    current_assignment_id: string | null;
    role: DevelopmentLoopAgentRole;
  }[];

  constructor(roles: readonly DevelopmentLoopAgentRole[]) {
    this.members = roles.map((role) => ({
      agent_id: `agent-${role.toLowerCase()}`,
      current_assignment_id: null,
      role,
    }));
  }

  listMembers() {
    return this.members;
  }

  assignTask(input: { agent_id: string; id: string }) {
    const member = this.members.find(
      (candidate) => candidate.agent_id === input.agent_id,
    );
    if (!member) throw new Error("COMPATIBLE_AGENT_NOT_FOUND");
    member.current_assignment_id = input.id;
  }

  releaseAssignment(assignmentId: string, agentId: string) {
    const member = this.members.find(
      (candidate) => candidate.agent_id === agentId,
    );
    if (!member || member.current_assignment_id !== assignmentId)
      throw new Error("ASSIGNMENT_NOT_ACTIVE");
    member.current_assignment_id = null;
  }
}

function configured(now: () => Date = () => new Date("2026-09-03T00:00:00Z")) {
  const work = new WorkEngine(now);
  work.createProject({
    actor: human,
    correlation_id: "corr-loop",
    department_id: "department-development",
    id: "project-maos",
    idempotency_key: "project-maos",
    name: "MAOS",
    organization_id: "mrhomes",
    owner: human,
  });
  const team = new FakeDevelopmentLoopTeam([
    "REQUIREMENT_PRODUCT_AGENT",
    "DEVELOPMENT_LEAD",
    "FRONTEND_AGENT",
    "FUNCTIONAL_TEST_AGENT",
    "UX_QA_AGENT",
    "DEVOPS_DEPLOYMENT_AGENT",
  ]);
  return { engine: new DevelopmentLoopEngine(work, team, now), team };
}

function definition(engine: DevelopmentLoopEngine, maxIterations = 3) {
  return engine.createDefinition({
    allowed_tool_capabilities: ["READ_FILE", "RUN_COMMAND"],
    id: "loop-definition-1",
    implementation_role: "FRONTEND_AGENT",
    max_cost_amount: 10,
    max_iterations: maxIterations,
    name: "Governed Development Loop",
    no_progress_limit: 2,
    time_budget_ms: 60_000,
    version: 1,
  });
}

function start(engine: DevelopmentLoopEngine, maxIterations = 3) {
  definition(engine, maxIterations);
  return engine.trigger({
    actor: human,
    correlation_id: "corr-loop",
    definition_id: "loop-definition-1",
    id: "loop-run-1",
    project_id: "project-maos",
    trigger: { id: "task-root", type: "TASK" },
  });
}

const progress = (
  engine: DevelopmentLoopEngine,
  outcome: "PASS" | "REVISE" = "PASS",
) =>
  engine.evaluate({
    actor: { id: "agent-evaluator", type: "AGENT" },
    artifact_ids: ["artifact-1"],
    correlation_id: "corr-loop",
    cost_amount: 0.25,
    evidence_ids: ["evidence-1"],
    outcome,
    run_id: "loop-run-1",
    usage: { input_tokens: 10, output_tokens: 5 },
  });

test("defines the canonical development loop and triggers a task assigned to the Phase 1.15 team", () => {
  assert.deepEqual(DEVELOPMENT_LOOP_STAGES, [
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
  ]);
  assert.deepEqual(DEVELOPMENT_LOOP_STOP_CONDITIONS, [
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
  ]);
  const { engine, team } = configured();
  const run = start(engine);
  assert.equal(run.entity.stage, "REQUIREMENT");
  assert.equal(run.entity.status, "RUNNING");
  assert.equal(run.entity.iteration, 1);
  assert.equal(run.entity.tasks[0]?.task_type, "PLANNING");
  assert.equal(
    team.listMembers().find((candidate) => candidate.current_assignment_id)
      ?.role,
    "REQUIREMENT_PRODUCT_AGENT",
  );
  assert.equal(run.event.name, "DEVELOPMENT_LOOP.TRIGGERED");
});

test("advances through task-scoped stages while chaining artifacts, evidence, usage, and events", () => {
  const { engine, team } = configured();
  start(engine);
  const plan = progress(engine);
  assert.equal(plan.entity.stage, "PLAN");
  assert.deepEqual(plan.entity.artifact_ids, ["artifact-1"]);
  assert.deepEqual(plan.entity.evidence_ids, ["evidence-1"]);
  assert.equal(plan.entity.usage.input_tokens, 10);
  assert.equal(plan.entity.cost_amount, 0.25);
  assert.equal(plan.event.name, "DEVELOPMENT_LOOP.ADVANCED");
  assert.equal(
    team.listMembers().find((candidate) => candidate.current_assignment_id)
      ?.role,
    "DEVELOPMENT_LEAD",
  );
  assert.equal(engine.events("loop-run-1").length, 2);
  assert.deepEqual(plan.event.target, {
    id: "loop-run-1",
    type: "DEVELOPMENT_LOOP_RUN",
  });
  assert.deepEqual(plan.event.evidence_refs, ["evidence-1"]);
});

test("runs the QA revision and re-test path before returning to human approval", () => {
  const { engine } = configured();
  start(engine);
  for (let index = 0; index < 4; index += 1) progress(engine);
  assert.equal(progress(engine, "REVISE").entity.stage, "REVISE");
  assert.equal(engine.getRun("loop-run-1").iteration, 2);
  assert.equal(progress(engine).entity.stage, "RETEST");
  const waiting = progress(engine);
  assert.equal(waiting.entity.stage, "HUMAN_APPROVAL");
  assert.equal(waiting.entity.status, "WAITING_APPROVAL");
});

test("enforces iteration, time, and cost budgets before creating more work", () => {
  const oneIteration = configured();
  start(oneIteration.engine, 1);
  for (let index = 0; index < 4; index += 1) progress(oneIteration.engine);
  const maxed = progress(oneIteration.engine, "REVISE");
  assert.equal(maxed.entity.status, "ESCALATED");
  assert.equal(maxed.entity.stop_condition, "MAX_ITERATIONS");

  let now = new Date("2026-09-03T00:00:00Z");
  const timed = configured(() => now);
  start(timed.engine);
  now = new Date("2026-09-03T00:01:01Z");
  assert.equal(
    progress(timed.engine).entity.stop_condition,
    "TIME_BUDGET_EXCEEDED",
  );

  const costly = configured();
  start(costly.engine);
  const stopped = costly.engine.evaluate({
    actor: { id: "agent-evaluator", type: "AGENT" },
    artifact_ids: ["artifact-1"],
    correlation_id: "corr-loop",
    cost_amount: 11,
    evidence_ids: ["evidence-1"],
    outcome: "PASS",
    run_id: "loop-run-1",
    usage: { input_tokens: 10, output_tokens: 5 },
  });
  assert.equal(stopped.entity.stop_condition, "COST_BUDGET_EXCEEDED");
});

test("supports pause, resume, cancel, waiting-human, kill-switch, risk, fatal, and no-progress stops", () => {
  const paused = configured();
  start(paused.engine);
  assert.equal(
    paused.engine.pause("loop-run-1", human, "corr-loop").entity.status,
    "PAUSED",
  );
  assert.equal(
    paused.engine.resume("loop-run-1", human, "corr-loop").entity.status,
    "RUNNING",
  );
  assert.equal(
    paused.engine.cancel("loop-run-1", human, "corr-loop").entity.status,
    "CANCELLED",
  );

  for (const [outcome, expected] of [
    ["WAITING_HUMAN", "WAITING_HUMAN"],
    ["KILL_SWITCH", "KILL_SWITCH"],
    ["RISK_ESCALATION", "RISK_ESCALATION"],
    ["FATAL_ERROR", "FATAL_ERROR"],
  ] as const) {
    const current = configured();
    start(current.engine);
    const result = current.engine.evaluate({
      actor: human,
      artifact_ids: [],
      correlation_id: "corr-loop",
      cost_amount: 0,
      evidence_ids: ["evidence-stop"],
      outcome,
      run_id: "loop-run-1",
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    assert.equal(result.entity.stop_condition, expected);
  }

  const stalled = configured();
  start(stalled.engine);
  stalled.engine.evaluate({
    actor: human,
    artifact_ids: [],
    correlation_id: "corr-loop",
    cost_amount: 0,
    evidence_ids: ["evidence-no-progress-1"],
    outcome: "NO_PROGRESS",
    run_id: "loop-run-1",
    usage: { input_tokens: 0, output_tokens: 0 },
  });
  assert.equal(
    stalled.engine.evaluate({
      actor: human,
      artifact_ids: [],
      correlation_id: "corr-loop",
      cost_amount: 0,
      evidence_ids: ["evidence-no-progress-2"],
      outcome: "NO_PROGRESS",
      run_id: "loop-run-1",
      usage: { input_tokens: 0, output_tokens: 0 },
    }).entity.stop_condition,
    "NO_PROGRESS",
  );
});

test("requires exact human approval before deploy preparation and never treats QA as approval", () => {
  const { engine } = configured();
  start(engine);
  for (let index = 0; index < 5; index += 1) progress(engine);
  const waiting = engine.getRun("loop-run-1");
  assert.equal(waiting.stage, "HUMAN_APPROVAL");
  assert.equal(waiting.status, "WAITING_APPROVAL");
  assert.equal(waiting.stop_condition, "APPROVAL_REQUIRED");
  assert.throws(
    () =>
      engine.approve({
        actor: { id: "agent-qa", type: "AGENT" },
        artifact_id: "artifact-1",
        correlation_id: "corr-loop",
        decision: {
          allowed: true,
          approval_id: "approval-1",
          authority: "AUTHORIZED",
          status: "APPROVED",
          validity: "VALID",
        },
        run_id: "loop-run-1",
      }),
    (error: unknown) =>
      error instanceof DevelopmentLoopError &&
      error.code === "HUMAN_APPROVAL_REQUIRED",
  );
  const approved = engine.approve({
    actor: human,
    artifact_id: "artifact-1",
    correlation_id: "corr-loop",
    decision: {
      allowed: true,
      approval_id: "approval-1",
      authority: "AUTHORIZED",
      status: "APPROVED",
      validity: "VALID",
    },
    run_id: "loop-run-1",
  });
  assert.equal(approved.entity.stage, "DEPLOY_PREPARATION");
  assert.equal(approved.entity.status, "RUNNING");
  assert.equal(approved.event.name, "DEVELOPMENT_LOOP.APPROVED");

  assert.equal(progress(engine).entity.stage, "VERIFY");
  assert.equal(progress(engine).entity.stage, "LEARN");
  const completed = progress(engine);
  assert.equal(completed.entity.status, "COMPLETED");
  assert.equal(completed.entity.stop_condition, "GOAL_REACHED");
});

test("rejects tools outside the definition and missing evidence by default", () => {
  const { engine } = configured();
  start(engine);
  assert.throws(
    () => engine.requestTool("loop-run-1", "DEPLOY_PRODUCTION"),
    (error: unknown) =>
      error instanceof DevelopmentLoopError &&
      error.code === "TOOL_NOT_ALLOWED",
  );
  assert.throws(
    () =>
      engine.evaluate({
        actor: human,
        artifact_ids: [],
        correlation_id: "corr-loop",
        cost_amount: 0,
        evidence_ids: [],
        outcome: "PASS",
        run_id: "loop-run-1",
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
    (error: unknown) =>
      error instanceof DevelopmentLoopError &&
      error.code === "EVIDENCE_REQUIRED",
  );
});
