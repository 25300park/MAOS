import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import type { GovernanceDecision } from "@maos/contracts";
import {
  DevelopmentAgentTeam,
  type DevelopmentAgentRole,
} from "../modules/agent-runtime/src/index.js";
import { evaluateApproval } from "../modules/governance/src/index.js";
import {
  RbsAdminPilotError,
  RbsAdminPilotService,
  type DomainReadAdapter,
  type PilotStage,
} from "../modules/integration/src/index.js";
import { ObservabilityAuditService } from "../modules/observability/src/index.js";
import {
  DevelopmentLoopEngine,
  DevelopmentLoopError,
  QualityRuntime,
  ReleaseDeploymentError,
  ReleaseDeploymentRuntime,
  WorkEngine,
  type DeploymentAdapter,
  type ReleaseAuditPort,
  type RuntimeApproval,
} from "../modules/orchestration/src/index.js";
import {
  LocalBridgeError,
  LocalExecutionBridge,
  ToolingEngine,
  type LocalExecutionAdapter,
  type PermissionLayers,
  type ToolDefinition,
} from "../modules/tooling/src/index.js";
import { renderControlRoom } from "../apps/web/src/index.js";

const correlationId = "corr-phase-119";
const human = (id: string) => ({ id, type: "HUMAN" as const });
const agent = (id: string) => ({ id, type: "AGENT" as const });

function createWork() {
  const work = new WorkEngine(() => new Date("2026-09-04T00:00:00Z"));
  work.createProject({
    actor: human("human-phase-owner"),
    correlation_id: correlationId,
    department_id: "department-development",
    id: "project-phase-1",
    idempotency_key: "project-phase-1",
    name: "MAOS Phase 1",
    organization_id: "mrhomes",
    owner: human("human-phase-owner"),
  });
  const rootTask = work.createTask({
    actor: human("human-phase-owner"),
    correlation_id: correlationId,
    id: "task-phase-119",
    idempotency_key: "task-phase-119",
    owner: human("human-phase-owner"),
    project_id: "project-phase-1",
    status: "IN_PROGRESS",
    task_type: "DEVELOPMENT",
    title: "Verify the complete Phase 1 vertical slice",
  });
  return { rootTask, work };
}

function createTeam(): DevelopmentAgentTeam {
  const team = new DevelopmentAgentTeam();
  const roles: readonly DevelopmentAgentRole[] = [
    "REQUIREMENT_PRODUCT_AGENT",
    "DEVELOPMENT_LEAD",
    "BACKEND_AGENT",
    "FUNCTIONAL_TEST_AGENT",
    "UX_QA_AGENT",
    "DEVOPS_DEPLOYMENT_AGENT",
  ];
  for (const role of roles) {
    const contract = team.getRoleContract(role);
    team.registerMember({
      agent_id: `agent-${role.toLowerCase().replaceAll("_", "-")}`,
      current_assignment_id: null,
      health: "HEALTHY",
      lifecycle: "ACTIVE",
      model_policy: {
        model_ids: [`model-${role.toLowerCase()}`],
        required_capabilities: ["TEXT"],
      },
      role,
      runner_policy: {
        required_capabilities: ["LOCAL_EXECUTION_BRIDGE"],
        runner_ids: [`runner-${role.toLowerCase()}`],
      },
      runtime_status: "AVAILABLE",
      skill_ids: [...contract.skill_ids],
      tool_permissions: contract.tool_capabilities.map((capability) => ({
        capability,
        effect: "ALLOW" as const,
        risk: capability === "READ_FILE" ? ("R0" as const) : ("R2" as const),
      })),
    });
  }
  return team;
}

function createLoop(work: WorkEngine, team = createTeam()) {
  const loop = new DevelopmentLoopEngine(
    work,
    team,
    () => new Date("2026-09-04T00:00:00Z"),
  );
  loop.createDefinition({
    allowed_tool_capabilities: ["READ_FILE", "RUN_COMMAND"],
    id: "definition-phase-119",
    implementation_role: "BACKEND_AGENT",
    max_cost_amount: 10,
    max_iterations: 3,
    name: "Phase 1 governed verification",
    no_progress_limit: 2,
    time_budget_ms: 60_000,
    version: 1,
  });
  loop.trigger({
    actor: human("human-phase-owner"),
    correlation_id: correlationId,
    definition_id: "definition-phase-119",
    id: "loop-run-phase-119",
    project_id: "project-phase-1",
    trigger: { id: "task-phase-119", type: "TASK" },
  });
  return loop;
}

function evaluateLoop(
  loop: DevelopmentLoopEngine,
  stageEvidence: string,
  outcome: "PASS" | "REVISE" = "PASS",
  artifactIds: readonly string[] = [],
) {
  return loop.evaluate({
    actor: agent("agent-evaluator"),
    artifact_ids: artifactIds,
    correlation_id: correlationId,
    cost_amount: 0.2,
    evidence_ids: [stageEvidence],
    outcome,
    run_id: "loop-run-phase-119",
    usage: { input_tokens: 20, output_tokens: 10 },
  });
}

class SimulatedDeploymentAdapter implements DeploymentAdapter {
  readonly mode = "SIMULATED" as const;
  fail = false;
  deployed: string[] = [];
  rolledBack: string[] = [];

  async deploy(input: { artifact_hash: string }) {
    this.deployed.push(input.artifact_hash);
    return this.fail
      ? { evidence_ids: ["evidence-deploy-failed"], outcome: "FAILED" as const }
      : {
          artifact_hash: input.artifact_hash,
          evidence_ids: ["evidence-simulated-deployment"],
          health: "HEALTHY" as const,
          integration_passed: true,
          outcome: "SUCCEEDED" as const,
          smoke_passed: true,
        };
  }

  async rollback(input: { artifact_hash: string }) {
    this.rolledBack.push(input.artifact_hash);
    return {
      artifact_hash: input.artifact_hash,
      evidence_ids: ["evidence-rollback"],
      health: "HEALTHY" as const,
      outcome: "SUCCEEDED" as const,
      smoke_passed: true,
    };
  }
}

function createReleaseRuntime(
  adapter = new SimulatedDeploymentAdapter(),
  audit?: ReleaseAuditPort,
) {
  const runtime = new ReleaseDeploymentRuntime(
    adapter,
    () => new Date("2026-09-04T00:10:00Z"),
    audit,
  );
  runtime.registerEnvironment({
    deployment_mode: "SIMULATED",
    eligible: true,
    health: "HEALTHY",
    name: "PRODUCTION",
  });
  runtime.registerArtifact({
    build_id: "build-known-good",
    configuration_versions: ["config-1"],
    hash: "sha256:known-good",
    id: "artifact-known-good",
    source_commit: "commit-known-good",
  });
  runtime.registerArtifact({
    build_id: "build-phase-119",
    configuration_versions: ["config-2"],
    hash: "sha256:phase119",
    id: "artifact-implementation-fixed",
    source_commit: "commit-phase119",
  });
  const binding = {
    artifact_hash: "sha256:phase119",
    source_commit: "commit-phase119",
  };
  runtime.createRelease({
    actor: human("human-author"),
    artifact_id: "artifact-implementation-fixed",
    author_actor_id: "human-author",
    configuration_versions: ["config-2"],
    correlation_id: correlationId,
    development_loop_run_id: "loop-run-phase-119",
    development_loop_stage: "DEPLOY_PREPARATION",
    evidence: [
      { ...binding, id: "evidence-tests", kind: "TEST", outcome: "PASS" },
      { ...binding, id: "evidence-qa", kind: "QA", outcome: "PASS" },
      {
        ...binding,
        id: "evidence-security",
        kind: "SECURITY",
        outcome: "PASS",
      },
      {
        ...binding,
        id: "evidence-rollback-ready",
        kind: "ROLLBACK",
        outcome: "PASS",
      },
      {
        ...binding,
        environment: "DEVELOPMENT",
        id: "evidence-development",
        kind: "ENVIRONMENT",
        outcome: "PASS",
      },
      {
        ...binding,
        environment: "PREVIEW",
        id: "evidence-preview",
        kind: "ENVIRONMENT",
        outcome: "PASS",
      },
      {
        ...binding,
        environment: "STAGING",
        id: "evidence-staging",
        kind: "ENVIRONMENT",
        outcome: "PASS",
      },
    ],
    id: "release-phase-119",
    project_id: "project-phase-1",
    qa_reviewer_actor_id: "human-qa",
    reviewer_actor_id: "human-reviewer",
    rollback_artifact_id: "artifact-known-good",
    source_commit: "commit-phase119",
    version: "1.19.0",
  });
  runtime.evaluateReadiness(
    "release-phase-119",
    human("human-reviewer"),
    correlationId,
  );
  runtime.createDeployment({
    actor: human("human-release-owner"),
    correlation_id: correlationId,
    environment: "PRODUCTION",
    executor_actor_id: "agent-devops-deployment-agent",
    id: "deployment-phase-119",
    release_id: "release-phase-119",
    timeout_ms: 5_000,
  });
  return { adapter, runtime };
}

function deploymentApproval(
  runtime: ReleaseDeploymentRuntime,
  decision: GovernanceDecision = {
    allowed: true,
    approval_id: "approval-phase-119",
    authority: "AUTHORIZED",
    status: "APPROVED",
    validity: "VALID",
  },
): RuntimeApproval {
  return {
    approver: human("human-production-approver"),
    decision,
    environment: "PRODUCTION",
    permission_allowed: true,
    policy_valid: true,
    target: runtime.approvalTarget("deployment-phase-119"),
  };
}

test("executes the governed Phase 1 happy path, revision loop, release, UI visibility, and audit chain", async () => {
  const { rootTask, work } = createWork();
  const team = createTeam();
  const loop = createLoop(work, team);
  const workEvents = rootTask.event ? [rootTask.event] : [];
  let task = rootTask.entity;
  const transitionTask = (
    to: Parameters<WorkEngine["transitionTask"]>[0]["to"],
    actor: { id: string; type: "AGENT" | "HUMAN" },
    approval?: GovernanceDecision,
  ) => {
    const mutation = work.transitionTask({
      actor,
      ...(approval ? { approval } : {}),
      correlation_id: correlationId,
      expected_version: task.version,
      idempotency_key: `task-phase-119:${task.version}:${to}`,
      task_id: task.id,
      to,
    });
    task = mutation.entity;
    if (mutation.event) workEvents.push(mutation.event);
    return mutation;
  };

  evaluateLoop(loop, "evidence-requirement", "PASS", ["artifact-requirement"]);
  evaluateLoop(loop, "evidence-plan", "PASS", ["artifact-plan"]);
  evaluateLoop(loop, "evidence-implementation", "PASS", [
    "artifact-implementation",
  ]);
  evaluateLoop(loop, "evidence-test-failed");
  const revise = evaluateLoop(loop, "evidence-qa-failed", "REVISE");
  assert.equal(revise.entity.stage, "REVISE");
  assert.equal(revise.entity.iteration, 2);
  transitionTask("REVIEW", agent("agent-functional-test-agent"));
  transitionTask("REVISE", agent("agent-ux-qa-agent"));

  const initialArtifact = team.recordArtifact({
    author_agent_id: "agent-backend-agent",
    evidence_refs: ["evidence-implementation"],
    id: "artifact-implementation",
    task_id: task.id,
    version: "commit-phase119-initial",
  });
  const reviewTask = team.createReviewTask({
    artifact_id: initialArtifact.id,
    id: "review-phase-119-initial",
    reviewer_agent_id: "agent-functional-test-agent",
  });
  const feedbackArtifact = team.recordFeedbackArtifact({
    author_agent_id: "agent-functional-test-agent",
    id: "feedback-phase-119-ui-state",
    review_task_id: reviewTask.id,
    summary: "Current governed verification state is not visible.",
  });
  const revisionTask = team.createRevisionTask({
    feedback_artifact_id: feedbackArtifact.id,
    id: "revision-phase-119-ui-state",
    owner_agent_id: "agent-backend-agent",
  });
  assert.equal(revisionTask.source_artifact_id, initialArtifact.id);

  const quality = new QualityRuntime(
    work,
    () => new Date("2026-09-04T00:02:00Z"),
  );
  quality.registerPreview({
    actor: human("human-phase-owner"),
    allowed_capabilities: ["BROWSER_INSPECT", "SCREENSHOT_CAPTURE"],
    correlation_id: correlationId,
    environment: "DEVELOPMENT",
    id: "preview-phase-119",
    project_id: "project-phase-1",
    route: "/development",
    task_id: "task-phase-119",
  });
  quality.recordInspection({
    actor: agent("agent-ux-qa-agent"),
    component: "Phase 1 verification panel",
    correlation_id: correlationId,
    dom_summary: "main > section[aria-label='Phase 1 E2E verification']",
    evidence_id: "evidence-ui-mobile",
    id: "inspection-phase-119",
    preview_id: "preview-phase-119",
    route: "/development",
    screenshot_artifact_id: "artifact-ui-mobile",
    selector: "[aria-label='Phase 1 E2E verification']",
    source: { line: 1, path: "apps/web/src/development-workspace.ts" },
    viewport: { height: 844, width: 390 },
  });
  quality.createRun({
    actor: human("human-phase-owner"),
    allowed_capabilities: ["BROWSER_INSPECT", "SCREENSHOT_CAPTURE"],
    correlation_id: correlationId,
    developer_agent_id: "agent-backend-agent",
    functional_tester_agent_id: "agent-functional-test-agent",
    id: "qa-run-phase-119-failed",
    personas: ["HUMAN_OPERATOR", "DEVELOPMENT_LEAD", "REVIEWER_QA"],
    preview_id: "preview-phase-119",
    project_id: "project-phase-1",
    task_id: "task-phase-119",
    time_budget_ms: 60_000,
    ux_tester_agent_id: "agent-ux-qa-agent",
  });
  quality.recordCheck({
    actor: agent("agent-ux-qa-agent"),
    actual_result: "Verification state was not connected to the workspace",
    correlation_id: correlationId,
    evidence_ids: ["evidence-qa-failed"],
    expected_result: "Current governed status is visible",
    id: "check-phase-119-failed",
    kind: "UX",
    outcome: "FAIL",
    persona: "HUMAN_OPERATOR",
    run_id: "qa-run-phase-119-failed",
    scenario: "Understand current Phase 1 verification status",
  });
  quality.createIssue({
    actor: agent("agent-ux-qa-agent"),
    component: "Development Workspace",
    correlation_id: correlationId,
    evidence_ids: ["evidence-qa-failed"],
    expected_behavior: "Display the supplied verification snapshot",
    id: "issue-phase-119-ui-state",
    problem: "Only an old demonstration snapshot was visible",
    persona: "HUMAN_OPERATOR",
    recommendation: "Render a bounded escaped verification snapshot",
    reproduction_steps: ["Open Development Workspace", "Inspect status"],
    run_id: "qa-run-phase-119-failed",
    scenario: "Understand current Phase 1 verification status",
    screen: "/development",
    severity: "MAJOR",
    source: { line: 1, path: "apps/web/src/development-workspace.ts" },
  });
  quality.routeIssue({
    actor: human("human-phase-owner"),
    correlation_id: correlationId,
    developer_agent_id: "agent-backend-agent",
    issue_id: "issue-phase-119-ui-state",
  });
  quality.submitFix({
    actor: agent("agent-backend-agent"),
    artifact_id: "artifact-implementation-fixed",
    correlation_id: correlationId,
    evidence_ids: ["evidence-fix"],
    issue_id: "issue-phase-119-ui-state",
  });
  const releaseArtifact = team.recordArtifact({
    author_agent_id: "agent-backend-agent",
    evidence_refs: ["evidence-fix", "evidence-targeted-retest"],
    id: "artifact-implementation-fixed",
    task_id: task.id,
    version: "commit-phase119",
  });
  const fixedReview = team.createReviewTask({
    artifact_id: releaseArtifact.id,
    id: "review-phase-119-fixed",
    reviewer_agent_id: "agent-functional-test-agent",
  });
  assert.equal(fixedReview.status, "REVIEW");
  quality.recordRetest({
    actor: agent("agent-functional-test-agent"),
    correlation_id: correlationId,
    evidence_ids: ["evidence-targeted-retest"],
    issue_id: "issue-phase-119-ui-state",
    outcome: "PASS",
    stage: "TARGETED_TEST",
  });
  quality.recordRetest({
    actor: agent("agent-functional-test-agent"),
    correlation_id: correlationId,
    evidence_ids: ["evidence-regression"],
    issue_id: "issue-phase-119-ui-state",
    outcome: "PASS",
    stage: "REGRESSION_TEST",
  });
  const qaResolved = quality.recordRetest({
    actor: agent("agent-ux-qa-agent"),
    correlation_id: correlationId,
    evidence_ids: ["evidence-ux-retest"],
    issue_id: "issue-phase-119-ui-state",
    outcome: "PASS",
    stage: "UX_RETEST",
  });
  assert.equal(qaResolved.entity.status, "PASS");
  assert.equal(qaResolved.entity.developer_agent_id, "agent-backend-agent");
  assert.notEqual(
    qaResolved.entity.developer_agent_id,
    qaResolved.entity.tester_agent_id,
  );
  transitionTask("IN_PROGRESS", agent("agent-backend-agent"));
  transitionTask("WAITING_APPROVAL", human("human-phase-owner"));
  assert.throws(
    () => transitionTask("IN_PROGRESS", agent("agent-backend-agent")),
    /APPROVAL_REQUIRED/,
  );

  evaluateLoop(loop, "evidence-revision", "PASS", [
    "artifact-implementation-fixed",
  ]);
  const waitingApproval = evaluateLoop(loop, "evidence-retest");
  assert.equal(waitingApproval.entity.status, "WAITING_APPROVAL");
  assert.throws(
    () =>
      loop.approve({
        actor: agent("agent-ux-qa-agent"),
        artifact_id: "artifact-implementation-fixed",
        correlation_id: correlationId,
        decision: {
          allowed: true,
          approval_id: "approval-invalid-agent",
          authority: "AUTHORIZED",
          status: "APPROVED",
          validity: "VALID",
        },
        run_id: "loop-run-phase-119",
      }),
    (error) =>
      error instanceof DevelopmentLoopError &&
      error.code === "HUMAN_APPROVAL_REQUIRED",
  );
  loop.approve({
    actor: human("human-production-approver"),
    artifact_id: "artifact-implementation-fixed",
    correlation_id: correlationId,
    decision: {
      allowed: true,
      approval_id: "approval-phase-119",
      authority: "AUTHORIZED",
      status: "APPROVED",
      validity: "VALID",
    },
    run_id: "loop-run-phase-119",
  });
  const teamApproval = team.recordHumanApproval({
    actor_id: "human-production-approver",
    actor_type: "HUMAN",
    artifact_id: releaseArtifact.id,
    artifact_version: releaseArtifact.version,
    id: "approval-phase-119",
  });
  transitionTask("IN_PROGRESS", agent("agent-backend-agent"), {
    allowed: true,
    approval_id: teamApproval.id,
    authority: "AUTHORIZED",
    status: "APPROVED",
    validity: "VALID",
  });

  const observability = new ObservabilityAuditService({
    now: () => new Date("2026-09-04T00:20:00Z"),
  });
  const context = {
    approval_id: teamApproval.id,
    artifact_id: releaseArtifact.id,
    correlation_id: correlationId,
    project_id: task.project_id,
    request_id: "request-phase-119",
    run_id: "loop-run-phase-119",
    span_id: "span-phase-119",
    task_id: task.id,
    trace_id: "trace-phase-119",
  };
  const releaseAudit: ReleaseAuditPort = {
    record(record) {
      observability.recordAudit({
        action: `${record.target.type}.${record.action}`,
        actor: record.actor,
        context,
        evidence_refs: record.evidence_refs,
        result: record.result,
        target: record.target,
      });
    },
  };
  const { adapter, runtime: release } = createReleaseRuntime(
    undefined,
    releaseAudit,
  );
  assert.equal(
    release.getRelease("release-phase-119").artifact_id,
    releaseArtifact.id,
  );
  assert.equal(
    release.getRelease("release-phase-119").source_commit,
    releaseArtifact.version,
  );
  await assert.rejects(
    () =>
      release.executeDeployment(
        "deployment-phase-119",
        agent("agent-devops-deployment-agent"),
        correlationId,
      ),
    (error) =>
      error instanceof ReleaseDeploymentError &&
      error.code === "DEPLOYMENT_NOT_AUTHORIZED",
  );
  const target = release.approvalTarget("deployment-phase-119");
  const staleDecision = evaluateApproval({
    approval: {
      approved_by_actor_id: "human-production-approver",
      id: "approval-stale-phase-119",
      status: "APPROVED",
      target,
      validity: "STALE",
    },
    authority: { outcome: "AUTHORIZED", rule_ids: ["rule-release-approve"] },
    executor_actor_id: "agent-devops-deployment-agent",
    expected_target: target,
    now: new Date("2026-09-04T00:09:00Z"),
  });
  assert.equal(staleDecision.allowed, false);
  assert.equal(staleDecision.validity, "STALE");
  assert.throws(
    () =>
      release.authorizeDeployment(
        "deployment-phase-119",
        deploymentApproval(release, staleDecision),
        correlationId,
      ),
    (error) =>
      error instanceof ReleaseDeploymentError &&
      error.code === "APPROVAL_NOT_ALLOWED",
  );
  const mismatchedApproval = deploymentApproval(release);
  assert.throws(
    () =>
      release.authorizeDeployment(
        "deployment-phase-119",
        {
          ...mismatchedApproval,
          target: { ...mismatchedApproval.target, hash: "sha256:mismatch" },
        },
        correlationId,
      ),
    (error) =>
      error instanceof ReleaseDeploymentError &&
      error.code === "APPROVAL_TARGET_MISMATCH",
  );
  assert.throws(
    () =>
      release.authorizeDeployment(
        "deployment-phase-119",
        { ...deploymentApproval(release), approver: agent("agent-approver") },
        correlationId,
      ),
    (error) =>
      error instanceof ReleaseDeploymentError &&
      error.code === "HUMAN_PRODUCTION_APPROVAL_REQUIRED",
  );
  release.authorizeDeployment(
    "deployment-phase-119",
    deploymentApproval(release),
    correlationId,
  );
  await release.executeDeployment(
    "deployment-phase-119",
    agent("agent-devops-deployment-agent"),
    correlationId,
  );
  const deployment = release.verifyDeployment(
    "deployment-phase-119",
    human("human-verifier"),
    correlationId,
  ).entity;
  assert.equal(deployment.status, "SUCCEEDED");
  assert.deepEqual(adapter.deployed, ["sha256:phase119"]);
  assert.equal(deployment.artifact_hash, "sha256:phase119");

  evaluateLoop(loop, "evidence-release");
  evaluateLoop(loop, "evidence-verification");
  const completed = evaluateLoop(loop, "evidence-learning-candidate");
  assert.equal(completed.entity.status, "COMPLETED");
  assert.equal(completed.entity.stop_condition, "GOAL_REACHED");
  transitionTask("REVIEW", agent("agent-functional-test-agent"));
  const completedTask = transitionTask("COMPLETED", human("human-phase-owner"));
  assert.equal(completedTask.entity.status, "COMPLETED");
  assert.equal(loop.getRun("loop-run-phase-119").trigger.type, "TASK");
  assert.equal(loop.getRun("loop-run-phase-119").trigger.id, task.id);

  const event = observability.recordEvent({
    context,
    name: completed.event.name,
    payload: {
      evidence_refs: completed.event.evidence_refs,
      stop_condition: completed.entity.stop_condition,
    },
  });
  for (const workEvent of workEvents)
    observability.recordAudit({
      action: workEvent.name,
      actor: workEvent.actor,
      context,
      evidence_refs:
        workEvent.name === "TASK.COMPLETED"
          ? completed.entity.evidence_ids
          : [],
      result: "SUCCEEDED",
      target: {
        id: workEvent.aggregate_id,
        type: workEvent.aggregate_type,
      },
    });
  for (const loopEvent of loop.events("loop-run-phase-119"))
    observability.recordAudit({
      action: loopEvent.name,
      actor: loopEvent.actor,
      context,
      evidence_refs: loopEvent.evidence_refs,
      result: "SUCCEEDED",
      target: loopEvent.target,
    });
  const audits = observability.queryAudit(
    {},
    { allowed: true, project_ids: ["project-phase-1"] },
  );
  assert.ok(audits.length > workEvents.length);
  assert.equal(observability.verifyAuditIntegrity(), true);
  assert.notEqual(event.id, audits[0]?.id);
  assert.equal(
    audits.every((record) => record.context.correlation_id === correlationId),
    true,
  );
  assert.ok(
    audits.some(
      (record) =>
        record.action === "TASK.COMPLETED" && record.target.id === task.id,
    ),
  );
  assert.ok(
    audits.some(
      (record) =>
        record.action === "DEPLOYMENT.SUCCEEDED" &&
        record.target.id === deployment.id,
    ),
  );

  const html = renderControlRoom({
    development_snapshot: {
      approval_status: "APPROVED · VALID",
      artifact_hash: "sha256:phase119",
      assigned_agent: "agent-backend-agent",
      blocker: null,
      branch: "codex/phase-1.19-full-e2e-loop-verification",
      changed_files: [
        "apps/web/src/development-workspace.ts",
        "scripts/phase-1.19-e2e.test.ts",
      ],
      deployment_status: `${deployment.status} · SIMULATED`,
      evidence_ids: [...completed.entity.evidence_ids],
      loop_stage: completed.entity.stage,
      next_action: "Prepare MVP Go / No-Go evidence",
      owner: "human-phase-owner",
      project_id: completed.entity.project_id,
      qa_status: qaResolved.entity.status,
      release_status: release.getRelease("release-phase-119").status,
      run_id: completed.entity.id,
      run_status: completed.entity.status,
      source_commit: "commit-phase119",
      task_id: "task-phase-119",
      task_status: completedTask.entity.status,
      test_status: "PASS",
      verification_status: "PASS",
    },
    identity: {
      actor_id: "human-phase-owner",
      display_name: "Phase Owner",
      permissions: ["DEVELOPMENT:READ"],
      role: "OWNER",
    },
    path: "/development",
  });
  for (const visible of [
    "project-phase-1",
    "task-phase-119",
    "loop-run-phase-119",
    "agent-backend-agent",
    "sha256:phase119",
    "SUCCEEDED · SIMULATED",
    "Prepare MVP Go / No-Go evidence",
  ])
    assert.match(html, new RegExp(visible.replaceAll("/", "\\/")));
});

const localProvider = {
  checksum: "checksum-phase-119",
  health: "HEALTHY" as const,
  id: "provider-phase-119",
  lifecycle: "ACTIVE" as const,
  name: "Phase 1 local provider",
  provider_type: "NATIVE" as const,
  trust: "TRUSTED_INTERNAL" as const,
  version: "1.0.0",
};

const localTool: ToolDefinition = {
  capabilities: [
    {
      action_type: "READ",
      environment_scope: ["development"],
      id: "read-file",
      requires_approval: false,
      risk_level: "R0",
    },
    {
      action_type: "EXECUTE",
      environment_scope: ["development"],
      id: "run-command",
      requires_approval: true,
      risk_level: "R2",
    },
  ],
  health: "HEALTHY",
  id: "tool-phase-119",
  lifecycle: "ACTIVE",
  name: "Phase 1 workspace tool",
  provider_id: localProvider.id,
  risk: "R2",
  type: "FILESYSTEM",
};

function layeredPermission(
  capability: "read-file" | "run-command",
  effect: "ALLOW" | "ALLOW_WITH_APPROVAL",
): PermissionLayers {
  const permission = {
    action_type:
      capability === "read-file" ? ("READ" as const) : ("EXECUTE" as const),
    capability_id: capability,
    effect,
    environment: "development",
    risk: capability === "read-file" ? ("R0" as const) : ("R2" as const),
    tool_id: localTool.id,
  };
  return {
    agent: [permission],
    environment: [permission],
    human_authority: [permission],
    project: [permission],
    workflow: [permission],
  };
}

function createBridge() {
  const tooling = new ToolingEngine();
  tooling.registerProvider(localProvider);
  tooling.registerTool(localTool);
  const adapter: LocalExecutionAdapter = {
    gitDiff: async () => ({ output: "diff", evidence: {} }),
    gitStatus: async () => ({ output: "clean", evidence: {} }),
    readFile: async ({ path }) => ({ output: path, evidence: { path } }),
    runCommand: async ({ command }) => ({
      output: `${command} passed`,
      evidence: { authorization: "Bearer must-redact" },
    }),
    writeFile: async ({ path }) => ({ output: path, evidence: { path } }),
  };
  const bridge = new LocalExecutionBridge(tooling, adapter, {
    allowed_commands: ["npm"],
    allowed_workroots: ["D:\\10. MAOS"],
  });
  bridge.registerRunner({
    allowed_commands: ["npm"],
    capabilities: ["READ_FILE", "RUN_COMMAND", "GIT_STATUS", "GIT_DIFF"],
    device_id: "device-phase-119",
    health: "HEALTHY",
    id: "local-runner-phase-119",
    identity_id: "system-local-phase-119",
    provider_id: localProvider.id,
    runner_id: "runner-phase-119",
    workroots: ["D:\\10. MAOS"],
  });
  bridge.bindTaskScope({
    run_id: "run-phase-119",
    runner_id: "local-runner-phase-119",
    task_id: "task-phase-119",
    workroot: "D:\\10. MAOS",
  });
  return { bridge, tooling };
}

test("fails closed across tool permission, task/workroot, command, approval, and runner health boundaries", async () => {
  const { bridge, tooling } = createBridge();
  tooling.requestToolCall({
    action_type: "READ",
    agent_id: "agent-backend-agent",
    capability_id: "read-file",
    correlation_id: correlationId,
    environment: "development",
    id: "call-read-phase-119",
    idempotency_key: "call-read-phase-119",
    run_id: "run-phase-119",
    timeout_ms: 1_000,
    tool_id: localTool.id,
  });
  await assert.rejects(
    () =>
      bridge.execute({
        capability: "READ_FILE",
        relative_path: "package.json",
        run_id: "run-phase-119",
        runner_id: "local-runner-phase-119",
        task_id: "task-phase-119",
        tool_call_id: "call-read-phase-119",
      }),
    /TOOL_CALL_NOT_EXECUTABLE/,
  );
  tooling.authorizeToolCall("call-read-phase-119", {
    permissions: layeredPermission("read-file", "ALLOW"),
  });
  await assert.rejects(
    () =>
      bridge.execute({
        capability: "READ_FILE",
        relative_path: join("..", "outside.txt"),
        run_id: "run-phase-119",
        runner_id: "local-runner-phase-119",
        task_id: "task-phase-119",
        tool_call_id: "call-read-phase-119",
      }),
    (error) =>
      error instanceof LocalBridgeError &&
      error.code === "PATH_OUTSIDE_WORKROOT",
  );
  await assert.rejects(
    () =>
      bridge.execute({
        capability: "READ_FILE",
        relative_path: "package.json",
        run_id: "other-run",
        runner_id: "local-runner-phase-119",
        task_id: "task-phase-119",
        tool_call_id: "call-read-phase-119",
      }),
    (error) =>
      error instanceof LocalBridgeError && error.code === "TASK_SCOPE_MISMATCH",
  );

  tooling.requestToolCall({
    action_type: "EXECUTE",
    agent_id: "agent-backend-agent",
    capability_id: "run-command",
    correlation_id: correlationId,
    environment: "development",
    id: "call-command-phase-119",
    idempotency_key: "call-command-phase-119",
    run_id: "run-phase-119",
    timeout_ms: 1_000,
    tool_id: localTool.id,
  });
  const waiting = tooling.authorizeToolCall("call-command-phase-119", {
    permissions: layeredPermission("run-command", "ALLOW_WITH_APPROVAL"),
  });
  assert.equal(waiting.entity.status, "WAITING_APPROVAL");
  await assert.rejects(
    () =>
      bridge.execute({
        args: ["test", "&&", "whoami"],
        capability: "RUN_COMMAND",
        command: "npm",
        run_id: "run-phase-119",
        runner_id: "local-runner-phase-119",
        task_id: "task-phase-119",
        tool_call_id: "call-command-phase-119",
      }),
    (error) =>
      error instanceof LocalBridgeError && error.code === "COMMAND_DENIED",
  );
  bridge.updateRunnerHealth("local-runner-phase-119", "UNKNOWN");
  await assert.rejects(
    () =>
      bridge.execute({
        capability: "READ_FILE",
        relative_path: "package.json",
        run_id: "run-phase-119",
        runner_id: "local-runner-phase-119",
        task_id: "task-phase-119",
        tool_call_id: "call-read-phase-119",
      }),
    (error) =>
      error instanceof LocalBridgeError && error.code === "RUNNER_UNAVAILABLE",
  );
});

class ReadOnlyRbsAdapter implements DomainReadAdapter {
  readonly mode = "READ_ONLY" as const;

  async read(input: { system_id: string }) {
    return {
      commit: "commit-rbs-observed",
      deployment_readiness: "READY" as const,
      environment: "PREVIEW" as const,
      health: "HEALTHY" as const,
      observed_at: "2026-09-04T00:00:00Z",
      repository_state: "CLEAN" as const,
      source_record_id: `status:${input.system_id}`,
      source_system_id: input.system_id,
      version: "pilot-v1",
    };
  }
}

function advancePilot(
  service: RbsAdminPilotService,
  stage: PilotStage,
  actorId: string,
) {
  return service.advancePilot({
    actor: stage === "APPROVAL_BOUNDARY" ? human(actorId) : agent(actorId),
    correlation_id: correlationId,
    evidence_ids: [`evidence-${stage.toLowerCase()}`],
    pilot_id: "pilot-rbs-phase-119",
    stage,
  });
}

test("keeps the RBS/Admin pilot read-only and recovers a failed simulated deployment by rollback", async () => {
  const service = new RbsAdminPilotService(
    new ReadOnlyRbsAdapter(),
    () => new Date("2026-09-04T00:00:30Z"),
  );
  service.registerSystem({
    actor: human("human-platform-owner"),
    capabilities: ["READ_SYSTEM_STATUS", "READ_DEPLOYMENT_READINESS"],
    correlation_id: correlationId,
    credential_reference: "secretref://rbs-admin/pilot-readonly",
    deployment_reference: "registry://rbs-homes/deployment",
    environment_reference: "registry://rbs-homes/preview",
    health_reference: "registry://rbs-homes/health",
    hosting_reference: "registry://rbs-homes/infrastructure",
    id: "rbs-homes",
    integration_owner_id: "human-platform-owner",
    maturity: "I2",
    name: "RBS Homes",
    repository_reference: "registry://rbs-homes/repository",
    source_of_truth: "DOMAIN_SYSTEM",
    type: "PUBLIC_PLATFORM",
    workroot_reference: "workroot://rbs-homes",
  });
  service.createPilot({
    actor: human("human-requester"),
    assignments: [
      { agent_id: "agent-lead", role: "DEVELOPMENT_LEAD" },
      { agent_id: "agent-requirement", role: "REQUIREMENT_PRODUCT" },
      { agent_id: "agent-backend", role: "BACKEND" },
      { agent_id: "agent-functional", role: "FUNCTIONAL_TEST" },
      { agent_id: "agent-ux", role: "UX_QA" },
      { agent_id: "agent-security", role: "SECURITY_REVIEW" },
      { agent_id: "agent-deploy", role: "DEVOPS_DEPLOYMENT" },
    ],
    correlation_id: correlationId,
    id: "pilot-rbs-phase-119",
    project_id: "project-phase-1",
    repository_reference: "registry://rbs-homes/repository",
    request_evidence_id: "evidence-human-request",
    system_id: "rbs-homes",
    task_id: "task-rbs-phase-119",
    workroot_reference: "workroot://rbs-homes",
  });
  const status = await service.readStatus({
    actor: agent("agent-integration"),
    capability: "READ_SYSTEM_STATUS",
    correlation_id: correlationId,
    permission_allowed: true,
    pilot_id: "pilot-rbs-phase-119",
    project_id: "project-phase-1",
    system_id: "rbs-homes",
    task_id: "task-rbs-phase-119",
    timeout_ms: 1_000,
  });
  assert.equal(status.entity.source_system_id, "rbs-homes");
  assert.equal(service.listSystems()[0]?.source_of_truth, "DOMAIN_SYSTEM");
  advancePilot(service, "REQUIREMENT", "agent-requirement");
  advancePilot(service, "PLAN", "agent-lead");
  assert.throws(
    () =>
      service.advancePilot({
        actor: agent("agent-backend"),
        branch: "codex/phase-1.19-full-e2e-loop-verification",
        changed_files: ["..\\outside.ts"],
        correlation_id: correlationId,
        evidence_ids: ["evidence-unsafe"],
        pilot_id: "pilot-rbs-phase-119",
        repository_reference: "registry://rbs-homes/repository",
        stage: "IMPLEMENT",
        workroot_reference: "workroot://rbs-homes",
      }),
    (error) =>
      error instanceof RbsAdminPilotError && error.code === "PILOT_PATH_ESCAPE",
  );
  service.advancePilot({
    actor: agent("agent-backend"),
    branch: "codex/phase-1.19-full-e2e-loop-verification",
    changed_files: ["scripts/phase-1.19-e2e.test.ts"],
    correlation_id: correlationId,
    evidence_ids: ["evidence-rbs-change"],
    pilot_id: "pilot-rbs-phase-119",
    repository_reference: "registry://rbs-homes/repository",
    stage: "IMPLEMENT",
    workroot_reference: "workroot://rbs-homes",
  });
  advancePilot(service, "TEST", "agent-functional");
  advancePilot(service, "QA", "agent-ux");
  service.advancePilot({
    actor: human("human-rbs-approver"),
    approval: {
      decision: {
        allowed: true,
        approval_id: "approval-rbs-phase-119",
        authority: "AUTHORIZED",
        status: "APPROVED",
        validity: "VALID",
      },
      environment: "PREVIEW",
      target_id: "pilot-rbs-phase-119",
      target_version: "pilot-v1",
    },
    correlation_id: correlationId,
    evidence_ids: ["evidence-rbs-human-approval"],
    pilot_id: "pilot-rbs-phase-119",
    stage: "APPROVAL_BOUNDARY",
  });
  service.advancePilot({
    actor: agent("agent-deploy"),
    correlation_id: correlationId,
    evidence_ids: ["release-rbs-phase-119"],
    pilot_id: "pilot-rbs-phase-119",
    release_id: "release-rbs-phase-119",
    stage: "RELEASE_PREPARATION",
  });
  service.advancePilot({
    actor: agent("agent-deploy"),
    correlation_id: correlationId,
    deployment_id: "deployment-rbs-simulated",
    deployment_mode: "SIMULATED",
    evidence_ids: ["evidence-rbs-simulated-deployment"],
    pilot_id: "pilot-rbs-phase-119",
    stage: "SIMULATED_DEPLOYMENT",
  });
  const verified = advancePilot(service, "VERIFICATION", "agent-functional");
  assert.equal(verified.entity.status, "VERIFIED");
  assert.equal(verified.entity.production_authorized, false);
  assert.equal(verified.entity.deployment_mode, "SIMULATED");

  const failedAdapter = new SimulatedDeploymentAdapter();
  failedAdapter.fail = true;
  const { runtime } = createReleaseRuntime(failedAdapter);
  runtime.authorizeDeployment(
    "deployment-phase-119",
    deploymentApproval(runtime),
    correlationId,
  );
  await assert.rejects(
    () =>
      runtime.executeDeployment(
        "deployment-phase-119",
        agent("agent-devops-deployment-agent"),
        correlationId,
      ),
    (error) =>
      error instanceof ReleaseDeploymentError &&
      error.code === "DEPLOYMENT_FAILED",
  );
  const rollback = await runtime.rollbackDeployment(
    "deployment-phase-119",
    {
      ...deploymentApproval(runtime),
      target: runtime.rollbackApprovalTarget("deployment-phase-119"),
    },
    agent("agent-devops-deployment-agent"),
    correlationId,
  );
  assert.equal(rollback.entity.status, "ROLLED_BACK");
  assert.deepEqual(failedAdapter.rolledBack, ["sha256:known-good"]);
});
