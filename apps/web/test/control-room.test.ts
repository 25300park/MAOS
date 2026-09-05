import assert from "node:assert/strict";
import test from "node:test";
import * as web from "../src/index.js";

type WebModule = typeof web & {
  renderControlRoom(input: Record<string, unknown>): string;
};

const controlRoom = web as WebModule;
const operator = {
  actor_id: "human-operator-1",
  display_name: "Mina Park",
  permissions: [
    "TODAY:READ",
    "PROJECT:READ",
    "TASK:READ",
    "AI_COMPANY:READ",
    "AGENT:READ",
    "RUN:READ",
    "APPROVAL:READ",
    "APPROVAL:DECIDE",
    "ALERT:READ",
    "SYSTEM:READ",
    "MARKETING:READ",
    "AI_MLS:READ",
    "DEVELOPMENT:READ",
    "RELEASE:READ",
    "AUDIT:READ",
  ],
  role: "OPERATOR",
};

test("exports the executable Control Room renderer", () => {
  assert.equal(typeof controlRoom.renderControlRoom, "function");
});

test("renders a semantic Control Room shell and the complete authorized navigation", () => {
  const html = controlRoom.renderControlRoom({
    identity: operator,
    path: "/today",
  });
  for (const landmark of ["<header", "<nav", "<main", "<aside"]) {
    assert.match(html, new RegExp(landmark));
  }
  for (const label of [
    "Today",
    "Projects",
    "Task Center",
    "AI Company",
    "Agent Registry",
    "Runs",
    "Approval Center",
    "Alerts",
    "Systems",
    "Development",
    "Deployments",
  ]) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  assert.match(html, /Skip to main content/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /What needs attention/);
  assert.match(html, /Who owns it/);
  assert.match(html, /What happens next/);
});

test("renders a permission-scoped multi-system Control Plane projection", () => {
  const html = controlRoom.renderControlRoom({
    control_plane: {
      blockers: [
        {
          id: "task-blocked",
          owner: { id: "human-owner", type: "HUMAN" },
          status: "WAITING_APPROVAL",
        },
      ],
      next_actions: [{ action: "HUMAN_APPROVAL", id: "task-blocked" }],
      summary: { alerts: 1, projects: 2, runs: 3, systems: 2, tasks: 4 },
      systems: [
        {
          health: "HEALTHY",
          id: "maos",
          lifecycle: "ACTIVE",
          name: "MAOS Core",
          owner: { id: "platform-owner", type: "HUMAN" },
          source_of_truth: "MAOS",
        },
        {
          health: "UNKNOWN",
          id: "crm",
          lifecycle: "ACTIVE",
          name: "CRM <script>alert(1)</script>",
          owner: { id: "revenue-owner", type: "HUMAN" },
          source_of_truth: "DOMAIN_SYSTEM",
        },
      ],
    },
    identity: operator,
    path: "/systems",
  });

  for (const text of [
    "Control Plane scope",
    "2 systems",
    "2 projects",
    "3 runs",
    "task-blocked",
    "HUMAN_APPROVAL",
    "DOMAIN_SYSTEM",
  ])
    assert.match(html, new RegExp(text));
  assert.match(html, /CRM &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /CRM <script>/);
});

test("renders a permission-aware Deployment Center with immutable artifact and human approval boundaries", () => {
  const readOnly = controlRoom.renderControlRoom({
    identity: {
      ...operator,
      permissions: [...operator.permissions, "RELEASE:READ"],
    },
    path: "/deployments",
  });
  for (const text of [
    "Deployment Center",
    "release-117",
    "sha256:candidate",
    "WAITING APPROVAL",
    "Rollback ready",
    "Build once",
    "QA PASS ≠ Production Approval",
    "Simulated deployment",
  ])
    assert.match(readOnly, new RegExp(text));
  assert.doesNotMatch(readOnly, /data-action="DEPLOYMENT:EXECUTE"/);

  const executor = controlRoom.renderControlRoom({
    identity: {
      ...operator,
      permissions: [
        ...operator.permissions,
        "RELEASE:READ",
        "DEPLOYMENT:EXECUTE",
      ],
    },
    path: "/deployments",
  });
  assert.match(executor, /data-action="DEPLOYMENT:EXECUTE" disabled/);
  assert.match(executor, /Human approval and runtime revalidation required/);
  assert.doesNotMatch(executor, /real production deploy|force-push/i);
});

test("filters navigation and governed actions by exact permission", () => {
  const observer = {
    ...operator,
    permissions: ["TODAY:READ", "PROJECT:READ"],
    role: "OBSERVER",
  };
  const html = controlRoom.renderControlRoom({
    identity: observer,
    path: "/today",
  });
  assert.match(html, />Today</);
  assert.match(html, />Projects</);
  assert.doesNotMatch(html, />Approval Center</);
  assert.doesNotMatch(html, /Approve selected/);
  assert.match(html, /Observer access/);

  const projects = controlRoom.renderControlRoom({
    identity: observer,
    path: "/projects",
  });
  assert.doesNotMatch(projects, /New project/);
});

test("renders governed actions as navigable controls instead of inert buttons", () => {
  const today = controlRoom.renderControlRoom({
    identity: operator,
    path: "/today",
  });
  assert.match(today, /href="\/approvals"[^>]*>Review approval/);

  const task = controlRoom.renderControlRoom({
    identity: operator,
    path: "/tasks/task-2048",
  });
  assert.doesNotMatch(task, /href="\/audit"/);
});

test("rejects direct navigation to a screen outside the identity scope", () => {
  const html = controlRoom.renderControlRoom({
    identity: { ...operator, permissions: ["TODAY:READ"], role: "OBSERVER" },
    path: "/approvals",
  });
  assert.match(html, /Screen not available/);
  assert.doesNotMatch(html, /Customer data export/);
  assert.doesNotMatch(html, /Review next approval/);
});

test("fails closed at the authenticated UI boundary", () => {
  const html = controlRoom.renderControlRoom({
    identity: null,
    path: "/today",
  });
  assert.match(html, /Authentication required/);
  assert.match(html, /Sign in through your organization identity provider/);
  assert.doesNotMatch(html, /Approval Center/);
  assert.doesNotMatch(html, /Project Atlas/);
});

test("renders canonical loading, empty, error, blocked, and approval-required states", () => {
  const states = {
    loading: "Loading current operating state",
    empty: "No items in this view",
    error: "Control Room data is unavailable",
    blocked: "Blocked by dependency",
    approval_required: "Human approval required",
  } as const;
  for (const [state, message] of Object.entries(states)) {
    const html = controlRoom.renderControlRoom({
      identity: operator,
      path: "/tasks",
      state,
    });
    assert.match(html, new RegExp(message));
    assert.match(html, new RegExp(`data-view-state="${state}"`));
  }
});

test("renders task and run drill-down with ownership, blockers, next action, activity, and evidence", () => {
  const task = controlRoom.renderControlRoom({
    identity: operator,
    path: "/tasks/task-2048",
  });
  for (const text of [
    "Task task-2048",
    "Owner",
    "Blocker",
    "Approval",
    "Next action",
    "Activity & evidence",
  ]) {
    assert.match(task, new RegExp(text));
  }

  const run = controlRoom.renderControlRoom({
    identity: operator,
    path: "/runs/run-8042",
  });
  assert.match(run, /Run run-8042/);
  assert.match(run, /Agent ≠ Model ≠ Runner/);
  assert.match(run, /Current step/);
  assert.match(run, /Correlation/);
});

test("redacts security-sensitive values before rendering", () => {
  const html = controlRoom.renderControlRoom({
    identity: operator,
    path: "/alerts",
    supplemental: {
      api_key: "must-not-render",
      authorization: "Bearer must-not-render",
      private_journal: "must-not-render",
      safe_summary: "Dependency retry threshold exceeded",
    },
  });
  assert.equal(html.includes("must-not-render"), false);
  assert.match(html, /Dependency retry threshold exceeded/);
  assert.match(html, /\[REDACTED\]/);
});

test("includes responsive, keyboard, and WCAG-oriented foundations", () => {
  const html = controlRoom.renderControlRoom({
    identity: operator,
    path: "/today",
  });
  assert.match(html, /@media \(max-width:\s*760px\)/);
  assert.match(
    html,
    /@media \(min-width:\s*761px\) and \(max-width:\s*1100px\)/,
  );
  assert.match(html, /:focus-visible/);
  assert.match(html, /aria-label="Primary navigation"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /min-height:\s*44px/);
  assert.doesNotMatch(html, /user-scalable=no/);
});

test("renders a useful not-found state without leaking unauthorized navigation", () => {
  const html = controlRoom.renderControlRoom({
    identity: { ...operator, permissions: ["TODAY:READ"] },
    path: "/unknown",
  });
  assert.match(html, /Screen not available/);
  assert.match(html, /Return to Today/);
  assert.doesNotMatch(html, />Systems</);
});

test("renders the System Development Workspace with task-scoped delivery context", () => {
  const html = controlRoom.renderControlRoom({
    identity: operator,
    path: "/development",
  });
  for (const text of [
    "System Development Workspace",
    "codex/phase-1.15A-development-loop-runtime",
    "task-dev-115a",
    "Development Lead",
    "Requirement",
    "Implementation",
    "Automated test",
    "QA review",
    "Next action",
  ]) {
    assert.match(html, new RegExp(text));
  }
});

test("shows governed repository, changed-file, runner, and quality evidence", () => {
  const html = controlRoom.renderControlRoom({
    identity: operator,
    path: "/development",
  });
  for (const text of [
    "Approved workroot",
    "GIT_STATUS",
    "GIT_DIFF",
    "Changed files",
    "apps/web/src/control-room.ts",
    "Tests",
    "Build",
    "local-runner-1",
    "HEALTHY",
    "evidence-test-114",
    "QA PASS ≠ Production Approval",
  ]) {
    assert.match(html, new RegExp(text));
  }
  assert.doesNotMatch(html, /terminal|shell prompt|force-push/i);
});

test("shows the read-only RBS/Admin pilot boundary and simulated delivery state", () => {
  const systems = controlRoom.renderControlRoom({
    identity: operator,
    path: "/systems",
  });
  for (const text of [
    "RBS Homes",
    "Admin RBS Homes",
    "I2 · Observable",
    "DOMAIN SOURCE OF TRUTH",
    "READ ONLY",
    "PREVIEW",
  ])
    assert.match(systems, new RegExp(text));

  const workspace = controlRoom.renderControlRoom({
    identity: operator,
    path: "/development",
  });
  for (const text of [
    "RBS / Admin Pilot",
    "registry://rbs-homes/repository",
    "workroot://rbs-homes",
    "WAITING APPROVAL",
    "Simulated deployment",
    "Production authority: NONE",
  ])
    assert.match(workspace, new RegExp(text));
  assert.doesNotMatch(workspace, /data-action="RBS_PRODUCTION_DEPLOY"/);
});

test("shows management-level RBS/Admin operations and the governed listing handoff", () => {
  const html = controlRoom.renderControlRoom({
    identity: operator,
    path: "/systems",
    rbs_admin: {
      approval_status: "NOT APPROVED",
      blockers: ["Admin API health evidence is stale"],
      handoff_status: "READY FOR HUMAN REVIEW",
      next_action: "Refresh Admin health before any governed progression",
      production_deployment_approved: false,
      systems: [
        {
          api_health: "HEALTHY",
          artifact_reference: "artifact://rbs/preview-42",
          deployment_readiness: "NOT_READY",
          environment: "PREVIEW",
          health: "HEALTHY",
          id: "rbs-homes",
          last_verified_at: "2026-09-04T08:30:00Z",
          name: "RBS Homes",
          owner: "RBS Platform Owner",
          qa_status: "PASS",
          release_reference: "release://rbs/42",
          rollback_readiness: "READY",
          source_commit: "commit-rbs-42",
          source_of_truth: "DOMAIN_SYSTEM",
          type: "PUBLIC_PLATFORM",
        },
        {
          api_health: "UNKNOWN",
          artifact_reference: "artifact://admin/preview-42",
          deployment_readiness: "UNKNOWN",
          environment: "PREVIEW",
          health: "UNKNOWN",
          id: "admin-rbs-homes",
          last_verified_at: "STALE",
          name: "Admin RBS Homes",
          owner: "Admin Platform Owner",
          qa_status: "WAITING",
          release_reference: "release://admin/42",
          rollback_readiness: "UNKNOWN",
          source_commit: "commit-admin-42",
          source_of_truth: "DOMAIN_SYSTEM",
          type: "INTERNAL_PLATFORM",
        },
      ],
    },
  });

  for (const text of [
    "RBS / Admin Operations",
    "RBS Homes",
    "Admin RBS Homes",
    "RBS Platform Owner",
    "API health",
    "commit-rbs-42",
    "QA",
    "Rollback",
    "READY FOR HUMAN REVIEW",
    "Production deployment: NOT APPROVED",
    "Admin API health evidence is stale",
    "Refresh Admin health",
    "independent AWS infrastructure",
  ])
    assert.match(html, new RegExp(text));
  assert.doesNotMatch(html, /data-action="(?:PUBLISH|DEPLOY|ROLLBACK)"/);
});

test("shows Marketing team, campaign, KPI, and governed publisher boundaries", () => {
  const html = controlRoom.renderControlRoom({
    identity: operator,
    path: "/marketing",
    marketing: {
      approval_state: "APPROVED",
      campaign_id: "campaign-4",
      channels: ["BLOG", "TIKTOK", "INSTAGRAM", "YOUTUBE"],
      health: "HEALTHY",
      kpi: { leads: 18, reach: 4200 },
      next_action: "Publisher simulation after exact human approval",
      publisher_state: "WAITING_AUTHORIZATION",
      qa_state: "PASS",
      roles: [
        "CMO",
        "STRATEGY",
        "DATA_ANALYSIS",
        "ADS",
        "CONTENT",
        "COPY",
        "DESIGN",
        "YOUTUBE",
        "QA",
        "PUBLISHER",
      ],
      source_reference: "marketing://campaigns/campaign-4",
      status: "WAITING_APPROVAL",
    },
  });
  for (const text of [
    "Marketing Automation",
    "Independent AI team",
    "campaign-4",
    "BLOG",
    "TIKTOK",
    "INSTAGRAM",
    "YOUTUBE",
    "QA PASS ≠ CEO / Production Approval",
    "Publisher capability ≠ authority",
    "Marketing remains source of truth",
    "WAITING AUTHORIZATION",
    "4,200",
    "18",
  ])
    assert.match(html, new RegExp(text));
  assert.doesNotMatch(html, /data-action="MARKETING_PUBLISH"/);
});

test("shows internal-only AI-MLS intake, candidate, verification, and task visibility", () => {
  const html = controlRoom.renderControlRoom({
    ai_mls: {
      blocked_tasks: 2,
      candidate_counts: { blocked: 2, pending: 7, verified: 4 },
      collection_status: "RUNNING",
      failed_runs: 1,
      health: "DEGRADED",
      ingestion_status: "DEGRADED",
      next_action: "Review failed source and verification backlog",
      source_reference: "ai-mls://sources/internal-feed",
      stale_ingestions: 2,
      verification_backlog: 7,
    },
    identity: operator,
    path: "/ai-mls",
  });
  for (const text of [
    "AI-MLS",
    "INTERNAL ONLY",
    "AI-MLS remains source of truth",
    "Ingestion",
    "Candidate visibility",
    "Verification backlog",
    "Stale",
    "Failed runs",
    "Review failed source",
    "ai-mls://sources/internal-feed",
    "No external publication",
  ])
    assert.match(html, new RegExp(text));
  assert.doesNotMatch(html, /data-action="AI_MLS_PUBLISH"/);
});

test("shows ERP accounting and tax governance without sensitive ledger or external actions", () => {
  const html = controlRoom.renderControlRoom({
    erp_finance: {
      blocked_items: 2,
      deadline_risks: 1,
      erp_health: "HEALTHY",
      last_verified_at: "2026-09-05T10:00:00Z",
      missing_approvals: 1,
      next_deadline: "2026-09-10",
      open_obligations: 3,
      period_status: "OBSERVED",
      production_external_actions_enabled: false,
      risk_summary: { missing_data: 2, stale_or_unverified: 1 },
      team_roles: [
        "FINANCE_COMPLIANCE_LEAD",
        "PH_ACCOUNTING_AGENT",
        "PH_TAX_AGENT",
        "PAYROLL_STATUTORY_AGENT",
        "COMPLIANCE_QA_AGENT",
      ],
      work_items: 4,
    },
    identity: {
      ...operator,
      permissions: [...operator.permissions, "ERP:READ"],
    },
    path: "/finance-compliance",
  });
  for (const text of [
    "Finance &amp; Compliance",
    "ERP remains source of truth",
    "Accounting period",
    "Upcoming deadlines",
    "Blocked items",
    "Missing approvals",
    "PH Accounting / Tax AI Team",
    "Human authority remains final",
    "No filing, payment, or submission",
    "2026-09-10",
    "COMPLIANCE QA AGENT",
  ])
    assert.match(html, new RegExp(text));
  assert.doesNotMatch(html, /journal_entries|payroll_record|bank_account/i);
  assert.doesNotMatch(
    html,
    /data-action="(?:BIR_FILING|TAX_PAYMENT|SEC_SUBMISSION|BANK_TRANSACTION)"/,
  );
});

test("hides finance and compliance navigation without ERP permission", () => {
  const denied = controlRoom.renderControlRoom({
    identity: operator,
    path: "/finance-compliance",
  });
  assert.doesNotMatch(denied, />Finance &amp; Compliance</);
  assert.match(denied, /Screen not available/);
});

test("renders employee-centered CRM Today without exposing MAOS plumbing", () => {
  const html = controlRoom.renderControlRoom({
    crm: {
      blockers: 1,
      contract_deadlines: 2,
      health: "HEALTHY",
      next_actions: [
        "Confirm owner availability",
        "Send reviewed viewing draft",
      ],
      overdue_tasks: 1,
      source_reference: "crm://workspaces/employee-1/today",
      tasks_due_today: 4,
      upcoming_viewings: 2,
      workload: "BALANCED",
    },
    identity: {
      ...operator,
      permissions: [...operator.permissions, "CRM:READ"],
    },
    path: "/crm",
  });
  for (const text of [
    "Human Work",
    "Today",
    "My Tasks",
    "Customers",
    "Listings",
    "Calendar",
    "Documents",
    "Reports",
    "Search",
    "Natural-language work capture",
    "Confirm owner availability",
    "PRIVATE — ONLY YOU",
    "CRM remains source of truth",
  ])
    assert.match(html, new RegExp(text.replaceAll("—", "—")));
  assert.doesNotMatch(html, /ToolCall|MemoryCandidate|unrestricted shell/i);
  assert.match(html, /crm-work-nav/);
  assert.match(html, /overflow-x:auto/);
});

test("covers three employee workflows and keeps uncertain writes review-only", () => {
  const html = controlRoom.renderControlRoom({
    crm: {
      blockers: 0,
      contract_deadlines: 1,
      health: "DEGRADED",
      next_actions: ["Review captured work"],
      overdue_tasks: 0,
      source_reference: "crm://workspaces/employee-1/today",
      tasks_due_today: 3,
      upcoming_viewings: 1,
      workload: "HIGH",
    },
    identity: {
      ...operator,
      permissions: [...operator.permissions, "CRM:READ", "CRM:CAPTURE"],
    },
    path: "/crm",
  });
  for (const text of [
    "Client / Lead handling",
    "Listing / Owner handling",
    "Contract / Documentation / Support",
    "Employee review required",
    "No duplicate entry",
    "AI-MLS internal search",
    "No autonomous sending",
  ])
    assert.match(html, new RegExp(text.replaceAll("/", "\\/")));
  assert.match(html, /data-action="CRM:CAPTURE"/);
  assert.doesNotMatch(html, /data-action="CRM:SEND"/);
});

test("hides CRM navigation and capture action without exact permissions", () => {
  const hidden = controlRoom.renderControlRoom({
    identity: operator,
    path: "/today",
  });
  assert.doesNotMatch(hidden, />Human Work</);
  const readOnly = controlRoom.renderControlRoom({
    identity: {
      ...operator,
      permissions: [...operator.permissions, "CRM:READ"],
    },
    path: "/crm",
  });
  assert.doesNotMatch(readOnly, /data-action="CRM:CAPTURE"/);
  assert.match(readOnly, /Read-only work visibility/);
});

test("shows AI Memory Gateway boundary, context provenance health, and degraded state without memory content", () => {
  const memoryIntegration = {
    average_latency_ms: 42,
    failure_rate: 0.1,
    gateway_id: "memory-gateway-1",
    health: "DEGRADED",
    last_context_status: "DEGRADED",
    provenance_issues: 2,
    ready: false,
    request_count: 10,
  };
  for (const path of ["/systems", "/development"]) {
    const html = controlRoom.renderControlRoom({
      identity: operator,
      memory_integration: memoryIntegration,
      path,
    });
    for (const text of [
      "AI Memory Gateway Integration",
      "AI Memory Gateway is source of truth",
      "DEGRADED",
      "Provenance issues",
      "memory-gateway-1",
    ])
      assert.match(html, new RegExp(text));
    assert.doesNotMatch(html, /raw memory content|retrieval query/i);
  }
});

test("shows local execution actions only with exact permissions", () => {
  const readOnly = controlRoom.renderControlRoom({
    identity: operator,
    path: "/development",
  });
  assert.doesNotMatch(readOnly, /Request test run/);
  assert.doesNotMatch(readOnly, /Cancel run/);
  assert.match(readOnly, /Read-only workspace access/);

  const executor = controlRoom.renderControlRoom({
    identity: {
      ...operator,
      permissions: [
        ...operator.permissions,
        "LOCAL_EXECUTION:EXECUTE",
        "LOCAL_EXECUTION:CANCEL",
      ],
    },
    path: "/development",
  });
  assert.match(executor, /data-capability="RUN_COMMAND"/);
  assert.match(executor, /data-capability="RUN_COMMAND" disabled/);
  assert.match(executor, /Request test run/);
  assert.match(executor, /data-action="LOCAL_EXECUTION:CANCEL"/);
  assert.match(executor, /data-action="LOCAL_EXECUTION:CANCEL" disabled/);
  assert.match(executor, /Cancel run/);
  assert.match(executor, /Task scope · task-dev-115/);
});

test("renders every development workspace operational state explicitly", () => {
  const states = {
    approval_required: "Human approval required",
    blocked: "Blocked by dependency",
    conflict: "Workspace state changed",
    denied: "Workspace access denied",
    empty: "No development task selected",
    error: "Development workspace unavailable",
    loading: "Loading development workspace",
    timeout: "Workspace request timed out",
    unavailable: "Local runner unavailable",
  } as const;
  for (const [state, message] of Object.entries(states)) {
    const html = controlRoom.renderControlRoom({
      identity: operator,
      path: "/development",
      state,
    });
    assert.match(html, new RegExp(message));
    assert.match(html, new RegExp(`data-view-state="${state}"`));
  }
});

test("renders the governed Preview, Inspector, and QA workspace", () => {
  const html = controlRoom.renderControlRoom({
    identity: operator,
    path: "/development/preview",
  });
  assert.match(html, /Preview Workspace/);
  for (const text of [
    "Preview state",
    "UI Inspector",
    "DOM / Component",
    "Source location",
    "Before / After",
    "Functional QA",
    "UX QA",
    "Visual QA",
    "Workflow Scenario",
    "Regression",
    "Human CEO / MAOS Operator",
    "Development Lead",
    "Reviewer / QA User",
    "Structured Issue",
    "Targeted Test",
    "UX Re-test",
  ])
    assert.match(html, new RegExp(text.replaceAll("/", "\\/")));
  assert.match(html, /QA PASS ≠ Production Approval/);
  assert.match(html, /aria-label="Preview viewport"/);
  assert.doesNotMatch(html, /production deploy now|unrestricted browser/i);
});

test("shows Preview and QA actions only with exact permissions", () => {
  const readOnly = controlRoom.renderControlRoom({
    identity: operator,
    path: "/development/preview",
  });
  assert.doesNotMatch(readOnly, /data-action="QA:EXECUTE"/);
  assert.doesNotMatch(readOnly, /data-action="QA:ISSUE"/);

  const authorized = controlRoom.renderControlRoom({
    identity: {
      ...operator,
      permissions: [...operator.permissions, "QA:EXECUTE", "QA:ISSUE"],
    },
    path: "/development/preview",
  });
  assert.match(authorized, /data-action="QA:EXECUTE"/);
  assert.match(authorized, /data-action="QA:ISSUE"/);
  assert.match(authorized, /Task scope · task-116/);
});

test("shows all eleven development roles and the governed review chain", () => {
  const html = controlRoom.renderControlRoom({
    identity: operator,
    path: "/development",
  });
  for (const role of [
    "Development Lead",
    "Requirement / Product Agent",
    "Architecture Agent",
    "UI / UX Agent",
    "Frontend Agent",
    "Backend Agent",
    "Database Agent",
    "Functional Test Agent",
    "UX QA Agent",
    "Security Review Agent",
    "DevOps / Deployment Agent",
  ]) {
    assert.match(html, new RegExp(role.replaceAll("/", "\\/")));
  }
  assert.match(
    html,
    /Task → Artifact → Review Task → Feedback Artifact → Revision Task → Re-test \/ Re-review/,
  );
  assert.match(html, /Human approval required/);
  assert.match(html, /Agent ≠ Model ≠ Runner/);
});

test("shows bounded Development Loop status, budgets, stop controls, and approval boundary", () => {
  const html = controlRoom.renderControlRoom({
    identity: operator,
    path: "/development",
  });
  for (const text of [
    "Development Loop Runtime",
    "Iteration 1 of 3",
    "Time budget",
    "Cost budget",
    "Allowed tools",
    "NO_PROGRESS",
    "KILL_SWITCH",
    "Human Approval",
    "Deploy Preparation",
    "Learn / Improvement Candidate",
  ])
    assert.match(html, new RegExp(text));
  assert.match(html, /QA PASS ≠ Production Approval/);
  assert.doesNotMatch(html, /production deploy now|unrestricted autonomous/i);
});

test("renders the actual Phase 1 verification snapshot without trusting snapshot text", () => {
  const html = controlRoom.renderControlRoom({
    development_snapshot: {
      approval_status: "APPROVED · VALID",
      artifact_hash: "sha256:phase119",
      assigned_agent: "agent-backend-e2e",
      blocker: null,
      branch: "codex/phase-1.19-full-e2e-loop-verification",
      changed_files: ["scripts/phase-1.19-e2e.test.ts"],
      deployment_status: "SUCCEEDED · SIMULATED",
      evidence_ids: ["evidence-e2e", "evidence-verification"],
      loop_stage: "LEARN",
      next_action: "Prepare MVP Go / No-Go evidence",
      owner: "human-phase-owner",
      project_id: "project-phase-1",
      qa_status: "PASS",
      release_status: "READY",
      run_id: "loop-run-phase-119",
      run_status: "COMPLETED",
      source_commit: "commit-phase119",
      task_id: "task-phase-119",
      task_status: "COMPLETED",
      test_status: "PASS",
      verification_status: "PASS <script>alert(1)</script>",
    },
    identity: operator,
    path: "/development",
  });

  for (const text of [
    "Phase 1 E2E Verification",
    "project-phase-1",
    "task-phase-119",
    "loop-run-phase-119",
    "agent-backend-e2e",
    "APPROVED · VALID",
    "sha256:phase119",
    "SUCCEEDED · SIMULATED",
    "Prepare MVP Go / No-Go evidence",
    "evidence-verification",
  ])
    assert.match(html, new RegExp(text.replaceAll("/", "\\/")));
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /PASS &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(
    html,
    /phase-1\.15A|task-dev-115a|loop-run-115a|pilot-rbs-118/,
  );
});

test("shows the generalized system, environment, repository, and workroot scope in Development", () => {
  const html = controlRoom.renderControlRoom({
    development_snapshot: {
      approval_status: "NOT_REQUIRED",
      artifact_hash: "sha256:phase2",
      assigned_agent: "agent-platform",
      blocker: null,
      branch: "codex/phase-2-core-control-plane",
      changed_files: ["modules/control-plane/src/index.ts"],
      deployment_status: "NOT_APPROVED",
      environment_id: "maos-development",
      evidence_ids: ["evidence-phase2"],
      loop_stage: "VERIFY",
      next_action: "Human review",
      owner: "human-platform-owner",
      project_id: "project-maos",
      qa_status: "PASS",
      release_status: "NOT_REQUESTED",
      repository_reference: "registry://maos/repository",
      run_id: "run-phase2",
      run_status: "RUNNING",
      source_commit: "working-tree",
      system_id: "maos",
      task_id: "task-phase2",
      task_status: "IN_PROGRESS",
      test_status: "PASS",
      verification_status: "PASS",
      workroot_reference: "workroot://maos",
    },
    identity: operator,
    path: "/development",
  });
  for (const value of [
    "Control Plane Work Scope",
    "maos-development",
    "registry://maos/repository",
    "workroot://maos",
  ])
    assert.match(html, new RegExp(value.replaceAll("/", "\\/")));
});
