import type { ActorType } from "@maos/contracts";
import type { WorkEngine } from "./index.js";

export type QualityPersona =
  "HUMAN_OPERATOR" | "DEVELOPMENT_LEAD" | "REVIEWER_QA";
export type QualityCheckKind =
  "FUNCTIONAL" | "UX" | "VISUAL" | "WORKFLOW_SCENARIO" | "REGRESSION";
export type QualityOutcome = "PASS" | "FAIL" | "BLOCKED";
export type QualityRunStatus =
  "RUNNING" | "PASS" | "REVISE" | "BLOCKED" | "TIMED_OUT" | "CANCELLED";
export type QualityIssueStatus =
  | "ISSUE_RECORDED"
  | "FIX_TASK_CREATED"
  | "FIX_SUBMITTED"
  | "TARGETED_TEST_PASSED"
  | "REGRESSION_PASSED"
  | "PASS"
  | "REVISE";

export interface QualityEvent {
  action: string;
  actor: { id: string; type: ActorType };
  aggregate_id: string;
  correlation_id: string;
  evidence_refs: readonly string[];
  name: string;
  project_id: string;
  target: { id: string; type: "PREVIEW" | "QUALITY_RUN" | "QA_ISSUE" };
}

export interface QualityMutation<T> {
  entity: T;
  event: QualityEvent;
}

export interface PreviewRegistration {
  allowed_capabilities: readonly string[];
  environment: "DEVELOPMENT" | "PREVIEW";
  id: string;
  project_id: string;
  route: string;
  task_id: string;
}

export interface PreviewInspection {
  before_inspection_id: string | null;
  component: string;
  dom_summary: string;
  evidence_id: string;
  id: string;
  preview_id: string;
  route: string;
  screenshot_artifact_id: string;
  selector: string;
  source: { line: number; path: string };
  viewport: { height: number; width: number };
}

export interface QualityCheck {
  actual_result: string;
  evidence_ids: readonly string[];
  expected_result: string;
  id: string;
  kind: QualityCheckKind;
  outcome: QualityOutcome;
  persona: QualityPersona;
  scenario: string;
  tester_agent_id: string;
}

export interface QualityRun {
  allowed_capabilities: readonly string[];
  approval_status: "NOT_GRANTED";
  checks: readonly QualityCheck[];
  developer_agent_id: string;
  functional_tester_agent_id: string;
  id: string;
  personas: readonly QualityPersona[];
  preview_id: string;
  project_id: string;
  started_at: string;
  status: QualityRunStatus;
  task_id: string;
  time_budget_ms: number;
  ux_tester_agent_id: string;
}

export interface QualityIssue {
  approval_status: "NOT_GRANTED";
  component: string;
  developer_agent_id: string | null;
  evidence_ids: readonly string[];
  expected_behavior: string;
  fix_artifact_id: string | null;
  fix_task_id: string | null;
  id: string;
  persona: QualityPersona;
  problem: string;
  recommendation: string;
  reproduction_steps: readonly string[];
  run_id: string;
  scenario: string;
  screen: string;
  severity: "MINOR" | "MAJOR" | "CRITICAL";
  source: { line: number; path: string } | null;
  status: QualityIssueStatus;
  tester_agent_id: string;
}

export class QualityRuntimeError extends Error {
  constructor(
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

const functionalKinds = new Set<QualityCheckKind>([
  "FUNCTIONAL",
  "WORKFLOW_SCENARIO",
  "REGRESSION",
]);

function present(value: string): boolean {
  return value.trim().length > 0;
}

function safeSource(source: { line: number; path: string }): boolean {
  const normalized = source.path.replaceAll("\\", "/");
  return (
    source.line > 0 &&
    Number.isSafeInteger(source.line) &&
    !normalized.startsWith("/") &&
    !/^[A-Za-z]:\//.test(normalized) &&
    !normalized.split("/").includes("..")
  );
}

export class QualityRuntime {
  private readonly previews = new Map<string, PreviewRegistration>();
  private readonly inspections = new Map<string, PreviewInspection>();
  private readonly runs = new Map<string, QualityRun>();
  private readonly issues = new Map<string, QualityIssue>();
  private readonly recordedEvents = new Map<string, QualityEvent[]>();

  constructor(
    private readonly work: WorkEngine,
    private readonly now: () => Date = () => new Date(),
  ) {}

  registerPreview(
    input: PreviewRegistration & {
      actor: { id: string; type: ActorType };
      correlation_id: string;
    },
  ): QualityMutation<PreviewRegistration> {
    if (
      this.previews.has(input.id) ||
      input.actor.type !== "HUMAN" ||
      !present(input.route) ||
      !input.route.startsWith("/") ||
      input.allowed_capabilities.length === 0
    )
      throw new QualityRuntimeError("INVALID_PREVIEW_REGISTRATION");
    const entity: PreviewRegistration = {
      allowed_capabilities: [...new Set(input.allowed_capabilities)],
      environment: input.environment,
      id: input.id,
      project_id: input.project_id,
      route: input.route,
      task_id: input.task_id,
    };
    this.previews.set(entity.id, entity);
    return this.mutation(
      entity,
      "PREVIEW.REGISTERED",
      input.actor,
      input.correlation_id,
      [],
      "PREVIEW",
      entity.project_id,
    );
  }

  recordInspection(
    input: Omit<PreviewInspection, "before_inspection_id"> & {
      actor: { id: string; type: ActorType };
      before_inspection_id?: string;
      correlation_id: string;
    },
  ): QualityMutation<PreviewInspection> {
    const preview = this.preview(input.preview_id);
    if (input.route !== preview.route)
      throw new QualityRuntimeError("PREVIEW_ROUTE_SCOPE_MISMATCH");
    if (!safeSource(input.source))
      throw new QualityRuntimeError("SOURCE_PATH_OUTSIDE_WORKSPACE");
    if (
      !present(input.component) ||
      !present(input.dom_summary) ||
      !present(input.selector) ||
      !present(input.evidence_id) ||
      !present(input.screenshot_artifact_id) ||
      input.viewport.width < 320 ||
      input.viewport.height < 320
    )
      throw new QualityRuntimeError("INSPECTION_EVIDENCE_REQUIRED");
    if (
      input.before_inspection_id &&
      !this.inspections.has(input.before_inspection_id)
    )
      throw new QualityRuntimeError("BEFORE_INSPECTION_NOT_FOUND");
    const entity: PreviewInspection = {
      before_inspection_id: input.before_inspection_id ?? null,
      component: input.component,
      dom_summary: input.dom_summary,
      evidence_id: input.evidence_id,
      id: input.id,
      preview_id: input.preview_id,
      route: input.route,
      screenshot_artifact_id: input.screenshot_artifact_id,
      selector: input.selector,
      source: input.source,
      viewport: input.viewport,
    };
    this.inspections.set(entity.id, entity);
    return this.mutation(
      entity,
      "PREVIEW.INSPECTED",
      input.actor,
      input.correlation_id,
      [entity.evidence_id, entity.screenshot_artifact_id],
      "PREVIEW",
      preview.project_id,
    );
  }

  requestCapability(previewId: string, capability: string): string {
    if (!this.preview(previewId).allowed_capabilities.includes(capability))
      throw new QualityRuntimeError("QA_CAPABILITY_DENIED", { capability });
    return capability;
  }

  createRun(
    input: Omit<
      QualityRun,
      "approval_status" | "checks" | "started_at" | "status"
    > & {
      actor: { id: string; type: ActorType };
      correlation_id: string;
    },
  ): QualityMutation<QualityRun> {
    const preview = this.preview(input.preview_id);
    if (
      input.actor.type !== "HUMAN" ||
      preview.project_id !== input.project_id ||
      preview.task_id !== input.task_id
    )
      throw new QualityRuntimeError("QA_RUN_SCOPE_MISMATCH");
    if (
      input.developer_agent_id === input.functional_tester_agent_id ||
      input.developer_agent_id === input.ux_tester_agent_id ||
      input.functional_tester_agent_id === input.ux_tester_agent_id
    )
      throw new QualityRuntimeError("TESTER_DEVELOPER_SEPARATION_REQUIRED");
    if (
      input.personas.length === 0 ||
      input.time_budget_ms <= 0 ||
      input.allowed_capabilities.some(
        (capability) => !preview.allowed_capabilities.includes(capability),
      )
    )
      throw new QualityRuntimeError("INVALID_QA_RUN");
    const entity: QualityRun = {
      allowed_capabilities: [...new Set(input.allowed_capabilities)],
      approval_status: "NOT_GRANTED",
      checks: [],
      developer_agent_id: input.developer_agent_id,
      functional_tester_agent_id: input.functional_tester_agent_id,
      id: input.id,
      personas: [...new Set(input.personas)],
      preview_id: input.preview_id,
      project_id: input.project_id,
      started_at: this.now().toISOString(),
      status: "RUNNING",
      task_id: input.task_id,
      time_budget_ms: input.time_budget_ms,
      ux_tester_agent_id: input.ux_tester_agent_id,
    };
    this.runs.set(entity.id, entity);
    return this.mutation(
      entity,
      "QUALITY_RUN.CREATED",
      input.actor,
      input.correlation_id,
      [],
      "QUALITY_RUN",
      entity.project_id,
    );
  }

  recordCheck(
    input: Omit<QualityCheck, "tester_agent_id"> & {
      actor: { id: string; type: ActorType };
      correlation_id: string;
      run_id: string;
    },
  ): QualityMutation<QualityRun> {
    const run = this.running(input.run_id);
    this.enforceTime(run);
    const tester = functionalKinds.has(input.kind)
      ? run.functional_tester_agent_id
      : run.ux_tester_agent_id;
    if (input.actor.type !== "AGENT" || input.actor.id !== tester)
      throw new QualityRuntimeError("QA_TESTER_ROLE_REQUIRED");
    if (
      !run.personas.includes(input.persona) ||
      input.evidence_ids.length === 0 ||
      !present(input.scenario) ||
      !present(input.expected_result) ||
      !present(input.actual_result)
    )
      throw new QualityRuntimeError("QA_CHECK_EVIDENCE_REQUIRED");
    const check: QualityCheck = {
      actual_result: input.actual_result,
      evidence_ids: input.evidence_ids,
      expected_result: input.expected_result,
      id: input.id,
      kind: input.kind,
      outcome: input.outcome,
      persona: input.persona,
      scenario: input.scenario,
      tester_agent_id: input.actor.id,
    };
    const entity: QualityRun = {
      ...run,
      checks: [...run.checks, check],
      status:
        input.outcome === "BLOCKED"
          ? "BLOCKED"
          : input.outcome === "FAIL"
            ? "REVISE"
            : run.status,
    };
    this.runs.set(entity.id, entity);
    return this.mutation(
      entity,
      `QUALITY_CHECK.${input.outcome}`,
      input.actor,
      input.correlation_id,
      input.evidence_ids,
      "QUALITY_RUN",
      entity.project_id,
    );
  }

  completeRun(
    id: string,
    actor: { id: string; type: ActorType },
    correlationId: string,
  ): QualityMutation<QualityRun> {
    const run = this.run(id);
    const kinds = new Set(
      run.checks
        .filter((check) => check.outcome === "PASS")
        .map((check) => check.kind),
    );
    const unresolved = [...this.issues.values()].some(
      (issue) => issue.run_id === id && issue.status !== "PASS",
    );
    if (
      actor.type !== "HUMAN" ||
      unresolved ||
      !["FUNCTIONAL", "UX", "VISUAL", "WORKFLOW_SCENARIO", "REGRESSION"].every(
        (kind) => kinds.has(kind as QualityCheckKind),
      )
    )
      throw new QualityRuntimeError("QA_EVIDENCE_INCOMPLETE");
    const entity = { ...run, status: "PASS" as const };
    this.runs.set(id, entity);
    return this.mutation(
      entity,
      "QUALITY_RUN.PASS",
      actor,
      correlationId,
      run.checks.flatMap((check) => check.evidence_ids),
      "QUALITY_RUN",
      entity.project_id,
    );
  }

  createIssue(
    input: Omit<
      QualityIssue,
      | "approval_status"
      | "developer_agent_id"
      | "fix_artifact_id"
      | "fix_task_id"
      | "source"
      | "status"
      | "tester_agent_id"
    > & {
      actor: { id: string; type: ActorType };
      correlation_id: string;
      source?: { line: number; path: string };
    },
  ): QualityMutation<QualityIssue> {
    const run = this.run(input.run_id);
    const testerIds = [run.functional_tester_agent_id, run.ux_tester_agent_id];
    if (input.actor.type !== "AGENT" || !testerIds.includes(input.actor.id))
      throw new QualityRuntimeError("QA_TESTER_ROLE_REQUIRED");
    if (
      input.evidence_ids.length === 0 ||
      input.reproduction_steps.length === 0 ||
      ![
        input.component,
        input.expected_behavior,
        input.problem,
        input.recommendation,
        input.scenario,
        input.screen,
      ].every(present) ||
      (input.source && !safeSource(input.source))
    )
      throw new QualityRuntimeError("INVALID_QA_ISSUE_CONTRACT");
    const hasFailureEvidence = run.checks.some(
      (check) =>
        check.outcome !== "PASS" &&
        check.evidence_ids.some((id) => input.evidence_ids.includes(id)),
    );
    if (!hasFailureEvidence)
      throw new QualityRuntimeError("ISSUE_FAILURE_EVIDENCE_REQUIRED");
    const entity: QualityIssue = {
      approval_status: "NOT_GRANTED",
      component: input.component,
      developer_agent_id: null,
      evidence_ids: input.evidence_ids,
      expected_behavior: input.expected_behavior,
      fix_artifact_id: null,
      fix_task_id: null,
      id: input.id,
      persona: input.persona,
      problem: input.problem,
      recommendation: input.recommendation,
      reproduction_steps: input.reproduction_steps,
      run_id: input.run_id,
      scenario: input.scenario,
      screen: input.screen,
      severity: input.severity,
      source: input.source ?? null,
      status: "ISSUE_RECORDED",
      tester_agent_id: input.actor.id,
    };
    this.issues.set(entity.id, entity);
    return this.issueMutation(
      entity,
      "QA_ISSUE.RECORDED",
      input.actor,
      input.correlation_id,
    );
  }

  routeIssue(input: {
    actor: { id: string; type: ActorType };
    correlation_id: string;
    developer_agent_id: string;
    issue_id: string;
  }): QualityMutation<QualityIssue> {
    const issue = this.issue(input.issue_id);
    const run = this.run(issue.run_id);
    if (
      input.actor.type !== "HUMAN" ||
      input.developer_agent_id !== run.developer_agent_id ||
      input.developer_agent_id === issue.tester_agent_id
    )
      throw new QualityRuntimeError("DEVELOPER_ASSIGNMENT_DENIED");
    const fixTaskId = `${issue.id}:fix`;
    this.work.createTask({
      actor: input.actor,
      correlation_id: input.correlation_id,
      id: fixTaskId,
      idempotency_key: fixTaskId,
      owner: { id: input.developer_agent_id, type: "AGENT" },
      parent_task_id: run.task_id,
      project_id: run.project_id,
      status: "REVISE",
      task_type: "DEVELOPMENT",
      title: `Fix QA issue ${issue.id}`,
    });
    const entity: QualityIssue = {
      ...issue,
      developer_agent_id: input.developer_agent_id,
      fix_task_id: fixTaskId,
      status: "FIX_TASK_CREATED",
    };
    this.issues.set(entity.id, entity);
    return this.issueMutation(
      entity,
      "QA_ISSUE.ROUTED",
      input.actor,
      input.correlation_id,
    );
  }

  submitFix(input: {
    actor: { id: string; type: ActorType };
    artifact_id: string;
    correlation_id: string;
    evidence_ids: readonly string[];
    issue_id: string;
  }): QualityMutation<QualityIssue> {
    const issue = this.issue(input.issue_id);
    if (
      input.actor.type !== "AGENT" ||
      input.actor.id !== issue.developer_agent_id
    )
      throw new QualityRuntimeError("DEVELOPER_REQUIRED");
    if (
      !["FIX_TASK_CREATED", "REVISE"].includes(issue.status) ||
      !present(input.artifact_id) ||
      input.evidence_ids.length === 0
    )
      throw new QualityRuntimeError("FIX_EVIDENCE_REQUIRED");
    const entity: QualityIssue = {
      ...issue,
      evidence_ids: [...issue.evidence_ids, ...input.evidence_ids],
      fix_artifact_id: input.artifact_id,
      status: "FIX_SUBMITTED",
    };
    this.issues.set(entity.id, entity);
    return this.issueMutation(
      entity,
      "QA_ISSUE.FIX_SUBMITTED",
      input.actor,
      input.correlation_id,
      input.evidence_ids,
    );
  }

  recordRetest(input: {
    actor: { id: string; type: ActorType };
    correlation_id: string;
    evidence_ids: readonly string[];
    issue_id: string;
    outcome: "PASS" | "FAIL";
    stage: "TARGETED_TEST" | "REGRESSION_TEST" | "UX_RETEST";
  }): QualityMutation<QualityIssue> {
    const issue = this.issue(input.issue_id);
    const run = this.run(issue.run_id);
    const expectedTester =
      input.stage === "UX_RETEST"
        ? run.ux_tester_agent_id
        : run.functional_tester_agent_id;
    if (input.actor.type !== "AGENT" || input.actor.id !== expectedTester)
      throw new QualityRuntimeError("QA_TESTER_ROLE_REQUIRED");
    const requiredStatus: Record<typeof input.stage, QualityIssueStatus> = {
      TARGETED_TEST: "FIX_SUBMITTED",
      REGRESSION_TEST: "TARGETED_TEST_PASSED",
      UX_RETEST: "REGRESSION_PASSED",
    };
    if (issue.status !== requiredStatus[input.stage])
      throw new QualityRuntimeError("INVALID_FIX_LOOP_TRANSITION", {
        actual: issue.status,
        stage: input.stage,
      });
    if (input.evidence_ids.length === 0)
      throw new QualityRuntimeError("RETEST_EVIDENCE_REQUIRED");
    const status: QualityIssueStatus =
      input.outcome === "FAIL"
        ? "REVISE"
        : input.stage === "TARGETED_TEST"
          ? "TARGETED_TEST_PASSED"
          : input.stage === "REGRESSION_TEST"
            ? "REGRESSION_PASSED"
            : "PASS";
    const entity: QualityIssue = {
      ...issue,
      evidence_ids: [...issue.evidence_ids, ...input.evidence_ids],
      status,
    };
    this.issues.set(entity.id, entity);
    return this.issueMutation(
      entity,
      status === "PASS" ? "QA_ISSUE.PASS" : `QA_ISSUE.${status}`,
      input.actor,
      input.correlation_id,
      input.evidence_ids,
    );
  }

  cancelRun(
    id: string,
    actor: { id: string; type: ActorType },
    correlationId: string,
  ): QualityMutation<QualityRun> {
    const run = this.run(id);
    if (actor.type !== "HUMAN" || ["PASS", "CANCELLED"].includes(run.status))
      throw new QualityRuntimeError("QA_RUN_NOT_CANCELLABLE");
    const entity = { ...run, status: "CANCELLED" as const };
    this.runs.set(id, entity);
    return this.mutation(
      entity,
      "QUALITY_RUN.CANCELLED",
      actor,
      correlationId,
      [],
      "QUALITY_RUN",
      run.project_id,
    );
  }

  getRun(id: string): QualityRun {
    return this.run(id);
  }

  listRuns(): QualityRun[] {
    return [...this.runs.values()];
  }

  listIssues(): QualityIssue[] {
    return [...this.issues.values()];
  }

  events(id: string): QualityEvent[] {
    return [...(this.recordedEvents.get(id) ?? [])];
  }

  private enforceTime(run: QualityRun): void {
    if (
      this.now().getTime() - new Date(run.started_at).getTime() >
      run.time_budget_ms
    ) {
      this.runs.set(run.id, { ...run, status: "TIMED_OUT" });
      throw new QualityRuntimeError("QA_RUN_TIMED_OUT");
    }
  }

  private preview(id: string): PreviewRegistration {
    const preview = this.previews.get(id);
    if (!preview) throw new QualityRuntimeError("PREVIEW_NOT_FOUND");
    return preview;
  }

  private run(id: string): QualityRun {
    const run = this.runs.get(id);
    if (!run) throw new QualityRuntimeError("QA_RUN_NOT_FOUND");
    return run;
  }

  private running(id: string): QualityRun {
    const run = this.run(id);
    if (run.status !== "RUNNING" && run.status !== "REVISE")
      throw new QualityRuntimeError("QA_RUN_NOT_RUNNING", {
        status: run.status,
      });
    return run;
  }

  private issue(id: string): QualityIssue {
    const issue = this.issues.get(id);
    if (!issue) throw new QualityRuntimeError("QA_ISSUE_NOT_FOUND");
    return issue;
  }

  private issueMutation(
    entity: QualityIssue,
    name: string,
    actor: { id: string; type: ActorType },
    correlationId: string,
    evidenceRefs: readonly string[] = entity.evidence_ids,
  ): QualityMutation<QualityIssue> {
    const run = this.run(entity.run_id);
    return this.mutation(
      entity,
      name,
      actor,
      correlationId,
      evidenceRefs,
      "QA_ISSUE",
      run.project_id,
    );
  }

  private mutation<T extends { id: string }>(
    entity: T,
    name: string,
    actor: { id: string; type: ActorType },
    correlationId: string,
    evidenceRefs: readonly string[],
    targetType: QualityEvent["target"]["type"],
    projectId: string,
  ): QualityMutation<T> {
    const event: QualityEvent = {
      action: name.split(".").at(-1) ?? name,
      actor,
      aggregate_id: entity.id,
      correlation_id: correlationId,
      evidence_refs: evidenceRefs,
      name,
      project_id: projectId,
      target: { id: entity.id, type: targetType },
    };
    this.recordedEvents.set(entity.id, [
      ...(this.recordedEvents.get(entity.id) ?? []),
      event,
    ]);
    return { entity, event };
  }
}
