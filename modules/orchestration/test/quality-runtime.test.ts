import assert from "node:assert/strict";
import test from "node:test";
import {
  QualityRuntime,
  QualityRuntimeError,
  WorkEngine,
} from "../src/index.js";

const human = { id: "human-operator", type: "HUMAN" as const };
const functional = { id: "agent-functional", type: "AGENT" as const };
const ux = { id: "agent-ux-qa", type: "AGENT" as const };
const developer = { id: "agent-frontend", type: "AGENT" as const };

function configured(now: () => Date = () => new Date("2026-09-03T01:00:00Z")) {
  const work = new WorkEngine(now);
  work.createProject({
    actor: human,
    correlation_id: "corr-qa",
    department_id: "department-development",
    id: "project-maos",
    idempotency_key: "project-maos",
    name: "MAOS",
    organization_id: "mrhomes",
    owner: human,
  });
  work.createTask({
    actor: human,
    correlation_id: "corr-qa",
    id: "task-116",
    idempotency_key: "task-116",
    owner: developer,
    project_id: "project-maos",
    status: "IN_PROGRESS",
    task_type: "DEVELOPMENT",
    title: "Preview and QA foundation",
  });
  return { runtime: new QualityRuntime(work, now), work };
}

function preview(runtime: QualityRuntime) {
  return runtime.registerPreview({
    actor: human,
    allowed_capabilities: ["BROWSER_INSPECT", "SCREENSHOT_CAPTURE"],
    correlation_id: "corr-qa",
    environment: "DEVELOPMENT",
    id: "preview-116",
    project_id: "project-maos",
    route: "/development/preview",
    task_id: "task-116",
  });
}

function run(runtime: QualityRuntime) {
  return runtime.createRun({
    actor: human,
    allowed_capabilities: ["BROWSER_INSPECT", "SCREENSHOT_CAPTURE"],
    correlation_id: "corr-qa",
    developer_agent_id: developer.id,
    functional_tester_agent_id: functional.id,
    id: "qa-run-116",
    personas: ["HUMAN_OPERATOR", "DEVELOPMENT_LEAD", "REVIEWER_QA"],
    preview_id: "preview-116",
    project_id: "project-maos",
    task_id: "task-116",
    time_budget_ms: 60_000,
    ux_tester_agent_id: ux.id,
  });
}

test("registers task-scoped preview and captures inspectable before/after evidence", () => {
  const { runtime } = configured();
  preview(runtime);
  const before = runtime.recordInspection({
    actor: ux,
    component: "Preview workspace summary",
    correlation_id: "corr-qa",
    dom_summary: "main > section.preview-summary",
    evidence_id: "evidence-before",
    id: "inspection-before",
    preview_id: "preview-116",
    route: "/development/preview",
    screenshot_artifact_id: "artifact-shot-before",
    selector: "[data-preview-summary]",
    source: { line: 81, path: "apps/web/src/development-workspace.ts" },
    viewport: { height: 900, width: 1440 },
  });
  const after = runtime.recordInspection({
    actor: ux,
    before_inspection_id: before.entity.id,
    component: "Preview workspace summary",
    correlation_id: "corr-qa",
    dom_summary: "main > section.preview-summary[data-state=verified]",
    evidence_id: "evidence-after",
    id: "inspection-after",
    preview_id: "preview-116",
    route: "/development/preview",
    screenshot_artifact_id: "artifact-shot-after",
    selector: "[data-preview-summary]",
    source: { line: 81, path: "apps/web/src/development-workspace.ts" },
    viewport: { height: 844, width: 390 },
  });
  assert.equal(after.entity.before_inspection_id, "inspection-before");
  assert.equal(after.entity.viewport.width, 390);
  assert.deepEqual(after.event.evidence_refs, [
    "evidence-after",
    "artifact-shot-after",
  ]);
});

test("rejects preview scope escape, unsafe source paths, and unapproved capabilities", () => {
  const { runtime } = configured();
  preview(runtime);
  assert.throws(
    () =>
      runtime.recordInspection({
        actor: ux,
        component: "Unsafe",
        correlation_id: "corr-qa",
        dom_summary: "body",
        evidence_id: "evidence-unsafe",
        id: "inspection-unsafe",
        preview_id: "preview-116",
        route: "/systems",
        screenshot_artifact_id: "artifact-unsafe",
        selector: "body",
        source: { line: 1, path: "../outside.ts" },
        viewport: { height: 800, width: 1280 },
      }),
    (error) =>
      error instanceof QualityRuntimeError &&
      error.code === "PREVIEW_ROUTE_SCOPE_MISMATCH",
  );
  assert.throws(
    () => runtime.requestCapability("preview-116", "RUN_COMMAND"),
    (error) =>
      error instanceof QualityRuntimeError &&
      error.code === "QA_CAPABILITY_DENIED",
  );
});

test("records functional, UX, visual, scenario, and regression checks with evidence", () => {
  const { runtime } = configured();
  preview(runtime);
  run(runtime);
  const checks = [
    ["FUNCTIONAL", functional.id, "HUMAN_OPERATOR"],
    ["WORKFLOW_SCENARIO", functional.id, "DEVELOPMENT_LEAD"],
    ["REGRESSION", functional.id, "REVIEWER_QA"],
    ["UX", ux.id, "HUMAN_OPERATOR"],
    ["VISUAL", ux.id, "REVIEWER_QA"],
  ] as const;
  for (const [kind, agentId, persona] of checks)
    runtime.recordCheck({
      actor: { id: agentId, type: "AGENT" },
      actual_result: "Observed governed behavior",
      correlation_id: "corr-qa",
      evidence_ids: [`evidence-${kind.toLowerCase()}`],
      expected_result: "Governed behavior is visible and correct",
      id: `check-${kind.toLowerCase()}`,
      kind,
      outcome: "PASS",
      persona,
      run_id: "qa-run-116",
      scenario: `Complete ${kind} user goal`,
    });
  assert.equal(runtime.getRun("qa-run-116").checks.length, 5);
  assert.equal(
    runtime.completeRun("qa-run-116", human, "corr-qa").entity.status,
    "PASS",
  );
  assert.equal(runtime.getRun("qa-run-116").approval_status, "NOT_GRANTED");
});

test("enforces tester and developer separation", () => {
  const { runtime } = configured();
  preview(runtime);
  assert.throws(
    () =>
      runtime.createRun({
        actor: human,
        allowed_capabilities: ["BROWSER_INSPECT"],
        correlation_id: "corr-qa",
        developer_agent_id: developer.id,
        functional_tester_agent_id: developer.id,
        id: "qa-run-invalid",
        personas: ["HUMAN_OPERATOR"],
        preview_id: "preview-116",
        project_id: "project-maos",
        task_id: "task-116",
        time_budget_ms: 60_000,
        ux_tester_agent_id: ux.id,
      }),
    (error) =>
      error instanceof QualityRuntimeError &&
      error.code === "TESTER_DEVELOPER_SEPARATION_REQUIRED",
  );
});

test("creates a complete UX issue and executes the governed developer fix loop", () => {
  const { runtime } = configured();
  preview(runtime);
  run(runtime);
  runtime.recordCheck({
    actor: ux,
    actual_result: "Next action is unclear",
    correlation_id: "corr-qa",
    evidence_ids: ["evidence-ux-fail"],
    expected_result: "Next action is explicit",
    id: "check-ux-fail",
    kind: "UX",
    outcome: "FAIL",
    persona: "HUMAN_OPERATOR",
    run_id: "qa-run-116",
    scenario: "Inspect the next governed action",
  });
  const issue = runtime.createIssue({
    actor: ux,
    component: "Preview summary",
    correlation_id: "corr-qa",
    evidence_ids: ["evidence-ux-fail"],
    expected_behavior: "Show one explicit next action",
    id: "ux-116-001",
    problem: "Two competing next actions are displayed",
    persona: "HUMAN_OPERATOR",
    recommendation: "Prioritize the governed QA action",
    reproduction_steps: ["Open Preview Workspace", "Read summary actions"],
    run_id: "qa-run-116",
    scenario: "Inspect the next governed action",
    screen: "/development/preview",
    severity: "MAJOR",
    source: { line: 81, path: "apps/web/src/development-workspace.ts" },
  });
  assert.equal(issue.entity.status, "ISSUE_RECORDED");
  const routed = runtime.routeIssue({
    actor: human,
    correlation_id: "corr-qa",
    developer_agent_id: developer.id,
    issue_id: issue.entity.id,
  });
  assert.equal(routed.entity.status, "FIX_TASK_CREATED");
  assert.equal(routed.entity.fix_task_id, "ux-116-001:fix");
  runtime.submitFix({
    actor: developer,
    artifact_id: "artifact-fix-1",
    correlation_id: "corr-qa",
    evidence_ids: ["evidence-fix-1"],
    issue_id: issue.entity.id,
  });
  runtime.recordRetest({
    actor: functional,
    correlation_id: "corr-qa",
    evidence_ids: ["evidence-targeted"],
    issue_id: issue.entity.id,
    outcome: "PASS",
    stage: "TARGETED_TEST",
  });
  runtime.recordRetest({
    actor: functional,
    correlation_id: "corr-qa",
    evidence_ids: ["evidence-regression"],
    issue_id: issue.entity.id,
    outcome: "PASS",
    stage: "REGRESSION_TEST",
  });
  const resolved = runtime.recordRetest({
    actor: ux,
    correlation_id: "corr-qa",
    evidence_ids: ["evidence-ux-retest"],
    issue_id: issue.entity.id,
    outcome: "PASS",
    stage: "UX_RETEST",
  });
  assert.equal(resolved.entity.status, "PASS");
  assert.equal(resolved.entity.approval_status, "NOT_GRANTED");
  assert.match(resolved.event.name, /QA_ISSUE\.PASS/);
});

test("returns failed re-tests to revision and prevents tester self-fix", () => {
  const { runtime } = configured();
  preview(runtime);
  run(runtime);
  runtime.recordCheck({
    actor: functional,
    actual_result: "Failure",
    correlation_id: "corr-qa",
    evidence_ids: ["evidence-fail"],
    expected_result: "Pass",
    id: "check-fail",
    kind: "FUNCTIONAL",
    outcome: "FAIL",
    persona: "REVIEWER_QA",
    run_id: "qa-run-116",
    scenario: "Validate feature",
  });
  runtime.createIssue({
    actor: functional,
    component: "QA API",
    correlation_id: "corr-qa",
    evidence_ids: ["evidence-fail"],
    expected_behavior: "Return canonical result",
    id: "qa-116-002",
    problem: "Unexpected result",
    persona: "REVIEWER_QA",
    recommendation: "Correct the response mapping",
    reproduction_steps: ["Call API", "Inspect response"],
    run_id: "qa-run-116",
    scenario: "Validate feature",
    screen: "/api/v1/quality-runs",
    severity: "CRITICAL",
  });
  runtime.routeIssue({
    actor: human,
    correlation_id: "corr-qa",
    developer_agent_id: developer.id,
    issue_id: "qa-116-002",
  });
  assert.throws(
    () =>
      runtime.submitFix({
        actor: functional,
        artifact_id: "artifact-self-fix",
        correlation_id: "corr-qa",
        evidence_ids: ["evidence-self-fix"],
        issue_id: "qa-116-002",
      }),
    (error) =>
      error instanceof QualityRuntimeError &&
      error.code === "DEVELOPER_REQUIRED",
  );
  runtime.submitFix({
    actor: developer,
    artifact_id: "artifact-fix-2",
    correlation_id: "corr-qa",
    evidence_ids: ["evidence-fix-2"],
    issue_id: "qa-116-002",
  });
  const revise = runtime.recordRetest({
    actor: functional,
    correlation_id: "corr-qa",
    evidence_ids: ["evidence-targeted-fail"],
    issue_id: "qa-116-002",
    outcome: "FAIL",
    stage: "TARGETED_TEST",
  });
  assert.equal(revise.entity.status, "REVISE");
});

test("times out and permits human cancellation without assuming PASS", () => {
  let now = new Date("2026-09-03T01:00:00Z");
  const { runtime } = configured(() => now);
  preview(runtime);
  run(runtime);
  now = new Date("2026-09-03T01:02:00Z");
  assert.throws(
    () =>
      runtime.recordCheck({
        actor: functional,
        actual_result: "Late",
        correlation_id: "corr-qa",
        evidence_ids: ["evidence-late"],
        expected_result: "On time",
        id: "check-late",
        kind: "FUNCTIONAL",
        outcome: "PASS",
        persona: "HUMAN_OPERATOR",
        run_id: "qa-run-116",
        scenario: "Time bound",
      }),
    (error) =>
      error instanceof QualityRuntimeError && error.code === "QA_RUN_TIMED_OUT",
  );
  const cancelled = runtime.cancelRun("qa-run-116", human, "corr-qa");
  assert.equal(cancelled.entity.status, "CANCELLED");
  assert.equal(cancelled.entity.approval_status, "NOT_GRANTED");
});
