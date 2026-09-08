import assert from "node:assert/strict";
import test from "node:test";
import {
  EnterpriseOrchestrationService,
  type EnterpriseApprovalPort,
  type EnterpriseSystemReference,
} from "../src/enterprise-orchestration.js";

const now = "2026-09-08T10:00:00.000Z";
const human = { id: "human-executive", type: "HUMAN" as const };
const agent = { id: "agent-chief-of-staff", type: "AGENT" as const };
const systems: readonly EnterpriseSystemReference[] = [
  "maos",
  "ai-memory-gateway",
  "marketing-automation",
  "ai-mls",
  "crm",
  "rbs-homes",
  "admin-rbs-homes",
  "erp",
  "erp-hr",
  "ph-legal-regulatory",
].map((id) => ({
  health: "HEALTHY",
  id,
  source_of_truth: id === "maos" ? "MAOS" : "DOMAIN_SYSTEM",
}));

const approval: EnterpriseApprovalPort = {
  evaluate: ({ approval_id }) => ({
    allowed: true,
    approval_id,
    authority: "AUTHORIZED",
    status: "APPROVED",
    validity: "VALID",
  }),
};

function setup(
  port: EnterpriseApprovalPort | undefined = approval,
  clock: () => Date = () => new Date(now),
) {
  const service = new EnterpriseOrchestrationService(systems, clock, port);
  service.createGoal({
    actor: human,
    correlation_id: "corr-goal",
    evidence_refs: ["evidence://enterprise/goal"],
    goal_id: "goal-growth",
    kpi_references: ["kpi://revenue/qualified-demand"],
    linked_project_ids: ["project-maos"],
    linked_system_ids: ["crm", "ai-mls", "marketing-automation"],
    owner_id: human.id,
    priority: "HIGH",
    status: "ACTIVE",
    target: "Increase qualified demand",
    timeframe: { end: "2026-12-31T00:00:00.000Z", start: now },
  });
  return service;
}

const searchTask = (id: string) => ({
  allowed_tools: ["AI_MLS_SEARCH"],
  dependencies: [] as string[],
  environment: "PREVIEW" as const,
  expected_evidence: ["evidence://enterprise/result"],
  id,
  permission: "AI_MLS:SEARCH",
  purpose: "Search approved internal listing candidates",
  risk: "R0" as const,
  source_system_id: "crm",
  target_system_id: "ai-mls",
  team: "AI_MLS" as const,
  work_mode: "AI_LOW_RISK" as const,
});

function signal(service: EnterpriseOrchestrationService, type = "CRM_DEMAND") {
  return service.recordSignal({
    actor: agent,
    classification: "INTERNAL",
    correlation_id: "corr-signal",
    evidence_refs: ["evidence://enterprise/signal"],
    observed_at: now,
    project_id: "project-maos",
    provenance_reference: "crmref://signals/demand-1",
    signal_id: `signal-${type.toLowerCase()}`,
    source_system_id: type === "SYSTEM_DEFECT" ? "maos" : "crm",
    target_system_id: type === "SYSTEM_DEFECT" ? "maos" : "ai-mls",
    type: type as "CRM_DEMAND" | "SYSTEM_DEFECT",
  });
}

test("keeps the enterprise graph reference-only and domain systems authoritative", () => {
  const service = setup();
  assert.equal(service.systemGraph().length, systems.length);
  assert.equal(
    service.systemGraph().find(({ id }) => id === "crm")?.source_of_truth,
    "DOMAIN_SYSTEM",
  );
  assert.throws(
    () =>
      new EnterpriseOrchestrationService([
        { health: "HEALTHY", id: "crm", source_of_truth: "MAOS" },
      ]),
    /DOMAIN_SOURCE_OF_TRUTH_TAKEOVER_DENIED/,
  );
});

test("creates a company goal and a provenance-bound cross-system signal", () => {
  const service = setup();
  const recorded = signal(service);
  assert.equal(recorded.source_system_id, "crm");
  assert.equal(recorded.target_system_id, "ai-mls");
  assert.equal(recorded.provenance_reference, "crmref://signals/demand-1");
  assert.equal(service.executiveProjection(human, true).goals.active, 1);
});

test("rejects stale signals and tasks without explicit purpose, environment, and risk", () => {
  const service = setup();
  assert.throws(
    () =>
      service.recordSignal({
        actor: agent,
        classification: "INTERNAL",
        correlation_id: "corr-stale",
        evidence_refs: ["evidence://enterprise/stale"],
        observed_at: "2026-09-01T00:00:00.000Z",
        project_id: "project-maos",
        provenance_reference: "crmref://signals/stale",
        signal_id: "signal-stale",
        source_system_id: "crm",
        target_system_id: "ai-mls",
        type: "CRM_DEMAND",
      }),
    /ENTERPRISE_SIGNAL_STALE/,
  );
  signal(service);
  assert.throws(
    () =>
      service.createPlan({
        actor: human,
        correlation_id: "corr-unbounded-plan",
        evidence_refs: ["evidence://enterprise/plan"],
        goal_id: "goal-growth",
        plan_id: "plan-unbounded",
        project_id: "project-maos",
        signal_id: "signal-crm_demand",
        tasks: [
          {
            allowed_tools: ["AI_MLS_SEARCH"],
            dependencies: [],
            expected_evidence: ["evidence://enterprise/result"],
            id: "task-unbounded",
            permission: "AI_MLS:SEARCH",
            source_system_id: "crm",
            target_system_id: "ai-mls",
            team: "AI_MLS",
            work_mode: "MIXED",
          } as never,
        ],
      }),
    /INVALID_ENTERPRISE_PLAN/,
  );
});

test("decomposes a governed plan into dependency-bound system tasks", () => {
  const service = setup();
  signal(service);
  const plan = service.createPlan({
    actor: human,
    correlation_id: "corr-plan",
    evidence_refs: ["evidence://enterprise/plan"],
    goal_id: "goal-growth",
    plan_id: "plan-growth",
    project_id: "project-maos",
    signal_id: "signal-crm_demand",
    tasks: [
      {
        allowed_tools: ["AI_MLS_SEARCH"],
        dependencies: [],
        environment: "PREVIEW",
        expected_evidence: ["evidence://enterprise/search"],
        id: "task-search",
        permission: "AI_MLS:SEARCH",
        purpose: "Find verified candidates for an approved company goal",
        risk: "R0",
        source_system_id: "crm",
        target_system_id: "ai-mls",
        team: "AI_MLS",
        work_mode: "MIXED",
      },
      {
        allowed_tools: ["MARKETING_SIMULATE"],
        approval: {
          action: "SIMULATE_MARKETING_OPPORTUNITY",
          approval_id: "approval-marketing-1",
          environment: "PREVIEW",
        },
        dependencies: ["task-search"],
        environment: "PREVIEW",
        expected_evidence: ["evidence://enterprise/campaign"],
        id: "task-campaign",
        permission: "MARKETING:SIMULATE",
        purpose: "Simulate a governed campaign opportunity",
        risk: "R0",
        source_system_id: "ai-mls",
        target_system_id: "marketing-automation",
        team: "MARKETING",
        work_mode: "HUMAN_APPROVAL",
      },
    ],
  });
  assert.equal(plan.tasks.length, 2);
  assert.equal(plan.tasks[1]?.status, "WAITING_DEPENDENCY");
  assert.throws(
    () =>
      service.executeTask({
        actor: agent,
        correlation_id: "corr-early",
        evidence_refs: ["evidence://enterprise/campaign"],
        expected_version: 1,
        permission_allowed: true,
        plan_id: plan.id,
        task_id: "task-campaign",
      }),
    /DEPENDENCY_NOT_SATISFIED/,
  );
});

test("simulates all approved cross-system opportunity patterns without mutation", () => {
  const service = setup();
  const patterns = [
    ["CRM_DEMAND", "crm", "ai-mls"],
    ["AI_MLS_MARKET", "ai-mls", "marketing-automation"],
    ["CRM_RBS_TRANSACTION", "rbs-homes", "erp"],
    ["HR_EVENT", "erp-hr", "erp"],
    ["CONTRACT_ISSUE", "crm", "ph-legal-regulatory"],
    ["SYSTEM_DEFECT", "maos", "maos"],
  ] as const;
  for (const [type, source, target] of patterns) {
    const result = service.simulateOpportunity({
      actor: human,
      correlation_id: `corr-${type}`,
      evidence_refs: [`evidence://enterprise/${type.toLowerCase()}`],
      environment: "PREVIEW",
      permission_allowed: true,
      project_id: "project-maos",
      purpose: "Verify a governed cross-system opportunity",
      risk: "R0",
      source_system_id: source,
      target_system_id: target,
      type,
    });
    assert.equal(result.state, "SIMULATED");
    assert.equal(result.external_mutation_performed, false);
  }
});

test("defaults cross-system work to deny and isolates approval targets", () => {
  const service = setup();
  assert.throws(
    () =>
      service.simulateOpportunity({
        actor: agent,
        correlation_id: "corr-denied",
        evidence_refs: ["evidence://enterprise/denied"],
        environment: "PREVIEW",
        permission_allowed: false,
        project_id: "project-maos",
        purpose: "Verify default-deny behavior",
        risk: "R0",
        source_system_id: "crm",
        target_system_id: "ai-mls",
        type: "CRM_DEMAND",
      }),
    /CROSS_SYSTEM_PERMISSION_DENIED/,
  );

  signal(service);
  const plan = service.createPlan({
    actor: human,
    correlation_id: "corr-plan",
    evidence_refs: ["evidence://enterprise/plan"],
    goal_id: "goal-growth",
    plan_id: "plan-approval",
    project_id: "project-maos",
    signal_id: "signal-crm_demand",
    tasks: [
      {
        allowed_tools: ["AI_MLS_SEARCH"],
        dependencies: [],
        environment: "PREVIEW",
        expected_evidence: ["evidence://enterprise/result"],
        id: "task-approved",
        permission: "AI_MLS:SEARCH",
        purpose: "Search approved internal listing candidates",
        risk: "R0",
        source_system_id: "crm",
        target_system_id: "ai-mls",
        team: "AI_MLS",
        work_mode: "HUMAN_APPROVAL",
        approval: {
          action: "SEARCH",
          approval_id: "approval-a",
          environment: "PREVIEW",
        },
      },
    ],
  });
  assert.throws(
    () =>
      service.executeTask({
        actor: agent,
        approval_id: "approval-other-system",
        correlation_id: "corr-approval",
        evidence_refs: ["evidence://enterprise/result"],
        expected_version: 1,
        permission_allowed: true,
        plan_id: plan.id,
        task_id: "task-approved",
      }),
    /APPROVAL_TARGET_MISMATCH/,
  );
});

test("executes only a simulated exact-bound task and preserves evidence continuity", () => {
  const service = setup();
  signal(service);
  const plan = service.createPlan({
    actor: human,
    correlation_id: "corr-plan",
    evidence_refs: ["evidence://enterprise/plan"],
    goal_id: "goal-growth",
    plan_id: "plan-execute",
    project_id: "project-maos",
    signal_id: "signal-crm_demand",
    tasks: [
      {
        allowed_tools: ["AI_MLS_SEARCH"],
        dependencies: [],
        environment: "PREVIEW",
        expected_evidence: ["evidence://enterprise/result"],
        id: "task-search",
        permission: "AI_MLS:SEARCH",
        purpose: "Search approved internal listing candidates",
        risk: "R0",
        source_system_id: "crm",
        target_system_id: "ai-mls",
        team: "AI_MLS",
        work_mode: "AI_LOW_RISK",
      },
    ],
  });
  const task = service.executeTask({
    actor: agent,
    correlation_id: "corr-execute",
    evidence_refs: ["evidence://enterprise/result"],
    expected_version: 1,
    permission_allowed: true,
    plan_id: plan.id,
    task_id: "task-search",
  });
  assert.equal(task.status, "COMPLETED");
  assert.equal(task.external_mutation_performed, false);
  const proof = service.evidence("corr-execute");
  assert.equal(proof.events.length, 1);
  assert.equal(proof.audit.length, 1);
  assert.notDeepEqual(proof.events[0], proof.audit[0]);
});

test("rejects production plans and enforces human-only work mode", () => {
  const service = setup();
  signal(service);
  const task = {
    allowed_tools: ["AI_MLS_SEARCH"],
    dependencies: [],
    environment: "PREVIEW" as const,
    expected_evidence: ["evidence://enterprise/result"],
    id: "task-human",
    permission: "AI_MLS:SEARCH",
    purpose: "Human review of internal listing candidates",
    risk: "R0" as const,
    source_system_id: "crm",
    target_system_id: "ai-mls",
    team: "AI_MLS" as const,
    work_mode: "HUMAN_ONLY" as const,
  };
  assert.throws(
    () =>
      service.createPlan({
        actor: human,
        correlation_id: "corr-production-plan",
        evidence_refs: ["evidence://enterprise/plan"],
        goal_id: "goal-growth",
        plan_id: "plan-production",
        project_id: "project-maos",
        signal_id: "signal-crm_demand",
        tasks: [
          {
            ...task,
            approval: {
              action: "SEARCH",
              approval_id: "approval-production",
              environment: "PRODUCTION",
            },
          },
        ],
      }),
    /PRODUCTION_ACTION_DENIED/,
  );
  const plan = service.createPlan({
    actor: human,
    correlation_id: "corr-human-plan",
    evidence_refs: ["evidence://enterprise/plan"],
    goal_id: "goal-growth",
    plan_id: "plan-human",
    project_id: "project-maos",
    signal_id: "signal-crm_demand",
    tasks: [task],
  });
  assert.throws(
    () =>
      service.executeTask({
        actor: agent,
        correlation_id: "corr-agent-human-task",
        evidence_refs: ["evidence://enterprise/result"],
        expected_version: 1,
        permission_allowed: true,
        plan_id: plan.id,
        task_id: task.id,
      }),
    /HUMAN_TASK_AUTHORITY_REQUIRED/,
  );

  assert.throws(
    () =>
      service.createPlan({
        actor: human,
        correlation_id: "corr-missing-approval",
        evidence_refs: ["evidence://enterprise/plan"],
        goal_id: "goal-growth",
        plan_id: "plan-missing-approval",
        project_id: "project-maos",
        signal_id: "signal-crm_demand",
        tasks: [
          {
            ...searchTask("task-missing-approval"),
            work_mode: "HUMAN_APPROVAL",
          },
        ],
      }),
    /INVALID_ENTERPRISE_PLAN/,
  );
});

test("stores only the allowlisted orchestration task contract", () => {
  const service = setup();
  signal(service);
  const plan = service.createPlan({
    actor: human,
    correlation_id: "corr-allowlist",
    evidence_refs: ["evidence://enterprise/plan"],
    goal_id: "goal-growth",
    plan_id: "plan-allowlist",
    project_id: "project-maos",
    signal_id: "signal-crm_demand",
    tasks: [
      {
        ...searchTask("task-allowlist"),
        private_notes: "must-not-persist",
        payroll_amount: 999,
      } as never,
    ],
  });
  assert.doesNotMatch(JSON.stringify(plan), /private_notes|payroll_amount/);
});

test("runs a bounded enterprise loop and stops for no progress or human intervention", () => {
  const service = setup();
  const loop = service.startLoop({
    allowed_actor_ids: [agent.id],
    actor: human,
    correlation_id: "corr-loop",
    evidence_refs: ["evidence://enterprise/loop-start"],
    goal_id: "goal-growth",
    loop_id: "loop-growth",
    max_cost_amount: 5,
    max_iterations: 3,
    no_progress_limit: 2,
    project_id: "project-maos",
    time_budget_ms: 60_000,
  });
  assert.equal(loop.status, "RUNNING");
  service.evaluateLoop({
    actor: agent,
    correlation_id: "corr-loop-1",
    cost_amount: 1,
    evidence_refs: ["evidence://enterprise/loop-1"],
    expected_version: 1,
    loop_id: loop.id,
    outcome: "NO_PROGRESS",
  });
  const stopped = service.evaluateLoop({
    actor: agent,
    correlation_id: "corr-loop-2",
    cost_amount: 1,
    evidence_refs: ["evidence://enterprise/loop-2"],
    expected_version: 2,
    loop_id: loop.id,
    outcome: "NO_PROGRESS",
  });
  assert.equal(stopped.status, "STOPPED");
  assert.equal(stopped.stop_condition, "NO_PROGRESS");

  const waiting = service.startLoop({
    allowed_actor_ids: [agent.id],
    actor: human,
    correlation_id: "corr-loop-human",
    evidence_refs: ["evidence://enterprise/loop-human-start"],
    goal_id: "goal-growth",
    loop_id: "loop-human",
    max_cost_amount: 5,
    max_iterations: 3,
    no_progress_limit: 2,
    project_id: "project-maos",
    time_budget_ms: 60_000,
  });
  const escalated = service.evaluateLoop({
    actor: agent,
    correlation_id: "corr-loop-human",
    cost_amount: 0,
    evidence_refs: ["evidence://enterprise/loop-human"],
    expected_version: 1,
    loop_id: waiting.id,
    outcome: "HUMAN_INTERVENTION_REQUIRED",
  });
  assert.equal(escalated.stop_condition, "WAITING_HUMAN");
});

test("supports human loop pause, resume, cancellation and failure escalation", () => {
  const service = setup();
  const loop = service.startLoop({
    allowed_actor_ids: [agent.id],
    actor: human,
    correlation_id: "corr-loop-controls",
    evidence_refs: ["evidence://enterprise/loop-controls"],
    goal_id: "goal-growth",
    loop_id: "loop-controls",
    max_cost_amount: 5,
    max_iterations: 3,
    no_progress_limit: 2,
    project_id: "project-maos",
    time_budget_ms: 60_000,
  });
  assert.throws(
    () =>
      service.evaluateLoop({
        actor: { id: "agent-unassigned", type: "AGENT" },
        correlation_id: "corr-unassigned",
        cost_amount: 0,
        evidence_refs: ["evidence://enterprise/unassigned"],
        expected_version: 1,
        loop_id: loop.id,
        outcome: "PROGRESS",
      }),
    /LOOP_EVALUATOR_DENIED/,
  );
  assert.throws(
    () =>
      service.evaluateLoop({
        actor: agent,
        correlation_id: "corr-invalid-outcome",
        cost_amount: 0,
        evidence_refs: ["evidence://enterprise/invalid-outcome"],
        expected_version: 1,
        loop_id: loop.id,
        outcome: "UNTRUSTED_OUTCOME" as never,
      }),
    /INVALID_ENTERPRISE_LOOP_OUTCOME/,
  );
  assert.equal(
    service.pauseLoop(loop.id, human, "corr-pause", 1, [
      "evidence://enterprise/pause",
    ]).status,
    "PAUSED",
  );
  assert.equal(
    service.resumeLoop(loop.id, human, "corr-resume", 2, [
      "evidence://enterprise/resume",
    ]).status,
    "RUNNING",
  );
  assert.equal(
    service.cancelLoop(loop.id, human, "corr-cancel", 3, [
      "evidence://enterprise/cancel",
    ]).stop_condition,
    "KILL_SWITCH",
  );
});

test("stops an enterprise loop at the exact time-budget boundary", () => {
  let clock = Date.parse(now);
  const service = setup(approval, () => new Date(clock));
  const loop = service.startLoop({
    allowed_actor_ids: [agent.id],
    actor: human,
    correlation_id: "corr-time-loop",
    evidence_refs: ["evidence://enterprise/time-start"],
    goal_id: "goal-growth",
    loop_id: "loop-time",
    max_cost_amount: 5,
    max_iterations: 3,
    no_progress_limit: 2,
    project_id: "project-maos",
    time_budget_ms: 1_000,
  });
  clock += 1_000;
  const stopped = service.evaluateLoop({
    actor: agent,
    correlation_id: "corr-time-boundary",
    cost_amount: 0,
    evidence_refs: ["evidence://enterprise/time-boundary"],
    expected_version: 1,
    loop_id: loop.id,
    outcome: "PROGRESS",
  });
  assert.equal(stopped.stop_condition, "TIME_BUDGET_EXCEEDED");
});

test("fails closed for unavailable systems, stale versions, and task failure", () => {
  const unavailable = new EnterpriseOrchestrationService(
    systems.map((system) =>
      system.id === "ai-mls" ? { ...system, health: "UNKNOWN" } : system,
    ),
    () => new Date(now),
  );
  unavailable.createGoal({
    actor: human,
    correlation_id: "corr-goal",
    evidence_refs: ["evidence://enterprise/goal"],
    goal_id: "goal-growth",
    kpi_references: ["kpi://revenue/qualified-demand"],
    linked_project_ids: ["project-maos"],
    linked_system_ids: ["crm", "ai-mls"],
    owner_id: human.id,
    priority: "HIGH",
    status: "ACTIVE",
    target: "Increase qualified demand",
    timeframe: { end: "2026-12-31T00:00:00.000Z", start: now },
  });
  signal(unavailable);
  const plan = unavailable.createPlan({
    actor: human,
    correlation_id: "corr-plan",
    evidence_refs: ["evidence://enterprise/plan"],
    goal_id: "goal-growth",
    plan_id: "plan-unavailable",
    project_id: "project-maos",
    signal_id: "signal-crm_demand",
    tasks: [searchTask("task-unavailable")],
  });
  const attempt = () =>
    unavailable.executeTask({
      actor: agent,
      correlation_id: "corr-unavailable",
      evidence_refs: ["evidence://enterprise/result"],
      expected_version: 1,
      permission_allowed: true,
      plan_id: plan.id,
      task_id: "task-unavailable",
    });
  assert.throws(attempt, /ENTERPRISE_SYSTEM_UNAVAILABLE/);
  const escalation = unavailable.reportFailure({
    actor: agent,
    correlation_id: "corr-escalation",
    evidence_refs: ["evidence://enterprise/failure"],
    expected_version: 1,
    permission_allowed: true,
    plan_id: plan.id,
    reason: "SYSTEM_UNAVAILABLE",
    task_id: "task-unavailable",
  });
  assert.equal(escalation.human_intervention_required, true);
  assert.equal(escalation.task.status, "BLOCKED");

  const healthy = setup();
  signal(healthy);
  const healthyPlan = healthy.createPlan({
    actor: human,
    correlation_id: "corr-plan-healthy",
    evidence_refs: ["evidence://enterprise/plan"],
    goal_id: "goal-growth",
    plan_id: "plan-version",
    project_id: "project-maos",
    signal_id: "signal-crm_demand",
    tasks: [searchTask("task-version")],
  });
  healthy.executeTask({
    actor: agent,
    correlation_id: "corr-first",
    evidence_refs: ["evidence://enterprise/result"],
    expected_version: 1,
    permission_allowed: true,
    plan_id: healthyPlan.id,
    task_id: "task-version",
  });
  assert.throws(
    () =>
      healthy.executeTask({
        actor: agent,
        correlation_id: "corr-stale-version",
        evidence_refs: ["evidence://enterprise/result"],
        expected_version: 1,
        permission_allowed: true,
        plan_id: healthyPlan.id,
        task_id: "task-version",
      }),
    /ENTERPRISE_TASK_VERSION_MISMATCH/,
  );
  assert.throws(
    () =>
      healthy.executeTask({
        actor: agent,
        correlation_id: "corr-repeat-current",
        evidence_refs: ["evidence://enterprise/result"],
        expected_version: 2,
        permission_allowed: true,
        plan_id: healthyPlan.id,
        task_id: "task-version",
      }),
    /ENTERPRISE_TASK_STATE_CONFLICT/,
  );
  assert.throws(
    () =>
      healthy.reportFailure({
        actor: agent,
        correlation_id: "corr-fail-completed",
        evidence_refs: ["evidence://enterprise/failure"],
        expected_version: 2,
        permission_allowed: true,
        plan_id: healthyPlan.id,
        reason: "TASK_FAILURE",
        task_id: "task-version",
      }),
    /ENTERPRISE_TASK_STATE_CONFLICT/,
  );
});

test("produces a privacy-safe executive projection and daily evidence briefing", () => {
  const service = setup();
  signal(service);
  const view = service.executiveProjection(human, true);
  const briefing = service.dailyBriefing(human, true);
  assert.equal(view.goals.active, 1);
  assert.equal(view.systems.total, systems.length);
  assert.equal(briefing.approvals_required, 0);
  assert.ok(briefing.recommended_next_actions.includes("PLAN_OPEN_SIGNALS"));
  assert.doesNotMatch(
    JSON.stringify({ view, briefing }),
    /private_notes|contract_clause|payroll_amount|legal_matter_content/i,
  );
});
