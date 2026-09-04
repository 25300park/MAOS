import { CONTROL_ROOM_CSS } from "./styles.js";
import {
  renderDevelopmentWorkspace,
  type DevelopmentWorkspaceState,
  type Phase1VerificationSnapshot,
} from "./development-workspace.js";

export interface ControlRoomIdentity {
  actor_id: string;
  display_name: string;
  permissions: readonly string[];
  role: string;
}

export type ViewState = DevelopmentWorkspaceState;

export interface ControlPlaneView {
  blockers: readonly {
    id: string;
    owner: { id: string; type: string };
    status: string;
  }[];
  next_actions: readonly { action: string; id: string }[];
  summary: {
    alerts: number;
    projects: number;
    runs: number;
    systems: number;
    tasks: number;
  };
  systems: readonly {
    health: string;
    id: string;
    lifecycle: string;
    name: string;
    owner: { id: string; type: string };
    source_of_truth: string;
  }[];
}

export interface MemoryIntegrationView {
  average_latency_ms: number;
  failure_rate: number;
  gateway_id: string;
  health: string;
  last_context_status: "DEGRADED" | "FAILED" | "READY" | "UNKNOWN";
  provenance_issues: number;
  ready: boolean;
  request_count: number;
}

export interface MarketingView {
  approval_state: string;
  campaign_id: string;
  channels: readonly string[];
  health: string;
  kpi: { leads: number; reach: number };
  next_action: string;
  publisher_state: string;
  qa_state: string;
  roles: readonly string[];
  source_reference: string;
  status: string;
}

export interface AiMlsView {
  blocked_tasks: number;
  candidate_counts: { blocked: number; pending: number; verified: number };
  collection_status: string;
  failed_runs: number;
  health: string;
  ingestion_status: string;
  next_action: string;
  source_reference: string;
  stale_ingestions: number;
  verification_backlog: number;
}

export interface ControlRoomRenderInput {
  ai_mls?: AiMlsView | undefined;
  context?: {
    correlation_id: string;
    request_id: string;
    span_id: string;
    trace_id: string;
  };
  control_plane?: ControlPlaneView | undefined;
  development_snapshot?: Phase1VerificationSnapshot | undefined;
  identity: ControlRoomIdentity | null;
  memory_integration?: MemoryIntegrationView | undefined;
  marketing?: MarketingView | undefined;
  path: string;
  state?: ViewState;
  supplemental?: Record<string, unknown>;
}

interface NavigationItem {
  icon: string;
  label: string;
  path: string;
  permission: string;
  section: "OPERATE" | "GOVERN" | "BUILD";
}

const NAVIGATION: readonly NavigationItem[] = [
  {
    icon: "⌂",
    label: "Today",
    path: "/today",
    permission: "TODAY:READ",
    section: "OPERATE",
  },
  {
    icon: "◫",
    label: "Projects",
    path: "/projects",
    permission: "PROJECT:READ",
    section: "OPERATE",
  },
  {
    icon: "✓",
    label: "Task Center",
    path: "/tasks",
    permission: "TASK:READ",
    section: "OPERATE",
  },
  {
    icon: "◇",
    label: "AI Company",
    path: "/ai-company",
    permission: "AI_COMPANY:READ",
    section: "OPERATE",
  },
  {
    icon: "◎",
    label: "Agent Registry",
    path: "/agents",
    permission: "AGENT:READ",
    section: "OPERATE",
  },
  {
    icon: "▶",
    label: "Runs",
    path: "/runs",
    permission: "RUN:READ",
    section: "OPERATE",
  },
  {
    icon: "◆",
    label: "Approval Center",
    path: "/approvals",
    permission: "APPROVAL:READ",
    section: "GOVERN",
  },
  {
    icon: "!",
    label: "Alerts",
    path: "/alerts",
    permission: "ALERT:READ",
    section: "GOVERN",
  },
  {
    icon: "◉",
    label: "Systems",
    path: "/systems",
    permission: "SYSTEM:READ",
    section: "GOVERN",
  },
  {
    icon: "◈",
    label: "Marketing",
    path: "/marketing",
    permission: "MARKETING:READ",
    section: "OPERATE",
  },
  {
    icon: "⌗",
    label: "AI-MLS",
    path: "/ai-mls",
    permission: "AI_MLS:READ",
    section: "OPERATE",
  },
  {
    icon: "⌘",
    label: "Development",
    path: "/development",
    permission: "DEVELOPMENT:READ",
    section: "BUILD",
  },
  {
    icon: "⇧",
    label: "Deployments",
    path: "/deployments",
    permission: "RELEASE:READ",
    section: "BUILD",
  },
];

const SENSITIVE =
  /^(?:api_?key|authorization|client_secret|credentials?|password|private_journal|secret|token)$/i;

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function redact(value: unknown, key = ""): unknown {
  if (SENSITIVE.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [
        nestedKey,
        redact(nestedValue, nestedKey),
      ]),
    );
  }
  return value;
}

function currentPath(itemPath: string, path: string): boolean {
  return itemPath === "/today"
    ? path === itemPath || path === "/"
    : path === itemPath || path.startsWith(`${itemPath}/`);
}

function navigation(identity: ControlRoomIdentity, path: string): string {
  return (["OPERATE", "GOVERN", "BUILD"] as const)
    .map((section) => {
      const items = NAVIGATION.filter(
        (item) =>
          item.section === section &&
          identity.permissions.includes(item.permission),
      );
      if (items.length === 0) return "";
      return `<div class="nav-section">${section}</div>${items
        .map(
          (item) =>
            `<a class="nav-link" href="${item.path}"${currentPath(item.path, path) ? ' aria-current="page"' : ""}><span class="nav-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span></a>`,
        )
        .join("")}`;
    })
    .join("");
}

function status(label: string, style: string): string {
  return `<span class="status status-${style}">${escapeHtml(label)}</span>`;
}

function pageHeading(
  eyebrow: string,
  title: string,
  description: string,
): string {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div><div class="date-block"><strong>Thursday, Sep 3</strong><span>Seoul · 09:42 KST</span></div></div>`;
}

function todayPage(identity: ControlRoomIdentity): string {
  const canApprove = identity.permissions.includes("APPROVAL:DECIDE");
  return `${pageHeading("Operating overview", "Today", "The work that needs human attention—ordered by risk, authority, and what happens next.")}
  <section class="metric-grid" aria-label="Operating summary">
    <article class="metric metric-critical"><div class="metric-top"><span>Critical issues</span><span>↗ 1</span></div><strong class="metric-value">3</strong><div class="metric-note">1 requires owner action now</div></article>
    <article class="metric metric-approval"><div class="metric-top"><span>Waiting approval</span><span>oldest 2h</span></div><strong class="metric-value">7</strong><div class="metric-note">2 high-risk decisions</div></article>
    <article class="metric metric-working"><div class="metric-top"><span>AI agents working</span><span>6 healthy</span></div><strong class="metric-value">8</strong><div class="metric-note">2 waiting on dependencies</div></article>
    <article class="metric metric-risk"><div class="metric-top"><span>Projects at risk</span><span>of 12</span></div><strong class="metric-value">2</strong><div class="metric-note">Delivery confidence below 70%</div></article>
  </section>
  <div class="content-grid"><div class="stack"><section class="panel"><div class="panel-head"><h2>What needs attention</h2><a href="/tasks">Open Task Center →</a></div><div class="panel-body">
    <article class="attention-item"><span class="signal red"></span><div><h3>Project Atlas launch evidence is incomplete</h3><p>Why: QA passed, but the production approval package is missing rollback evidence.</p></div><div class="attention-meta">${status("BLOCKED", "blocked")}<strong>Owner · J. Kim</strong><span>Next · attach evidence</span></div></article>
    <article class="attention-item"><span class="signal"></span><div><h3>Customer data export awaits human authority</h3><p>Why: R3 external action requires a separate approver and exact target binding.</p></div><div class="attention-meta">${status("WAITING APPROVAL", "approval")}<strong>Owner · S. Lee</strong><span>Next · human decision</span></div></article>
    <article class="attention-item"><span class="signal blue"></span><div><h3>Research workflow is waiting on source validation</h3><p>Why: the agent returned three sources; one lacks canonical provenance.</p></div><div class="attention-meta">${status("IN PROGRESS", "working")}<strong>Owner · Research Lead</strong><span>Next · validate source</span></div></article>
  </div></section>
  <section class="panel"><div class="panel-head"><h2>Priority work queue</h2><a href="/projects">View projects →</a></div><div class="table-wrap"><table class="data-table"><caption class="sr-only">Current priority tasks</caption><thead><tr><th>Work</th><th>Status</th><th>Owner</th><th>Next action</th><th>Due</th></tr></thead><tbody>
  <tr><td><a href="/tasks/task-2048">Finalize launch evidence</a><br><small>Project Atlas · task-2048</small></td><td>${status("BLOCKED", "blocked")}</td><td><span class="owner"><span class="avatar">JK</span>J. Kim</span></td><td>Attach rollback proof</td><td>Today</td></tr>
  <tr><td><a href="/tasks/task-1780">Approve customer export</a><br><small>Revenue Ops · task-1780</small></td><td>${status("WAITING", "approval")}</td><td><span class="owner"><span class="avatar">SL</span>S. Lee</span></td><td>${canApprove ? '<a class="btn btn-approval" href="/approvals">Review approval</a>' : "Await approver"}</td><td>11:30</td></tr>
  <tr><td><a href="/tasks/task-1632">Validate research sources</a><br><small>Market signal · task-1632</small></td><td>${status("REVIEW", "working")}</td><td><span class="owner"><span class="avatar">RA</span>Research Agent</span></td><td>Human source review</td><td>Tomorrow</td></tr>
  </tbody></table></div></section></div>
  <aside class="stack" aria-label="Live operating context"><section class="panel"><div class="panel-head"><h2>Live activity</h2><span class="status status-healthy">LIVE</span></div><div class="panel-body timeline">
    <article class="activity"><time>09:41:32</time><strong>Deployment agent produced artifact</strong><p>run-8042 · evidence-441</p></article>
    <article class="activity"><time>09:38:10</time><strong>Approval requested</strong><p>Customer export · S. Lee</p></article>
    <article class="activity"><time>09:30:44</time><strong>Runner health degraded</strong><p>local-runner-2 · latency threshold</p></article>
    <article class="activity"><time>09:22:01</time><strong>Task entered review</strong><p>Research source validation</p></article>
  </div></section><section class="panel"><div class="panel-head"><h2>Who owns it</h2></div><div class="panel-body"><dl class="fact-grid"><div class="fact"><dt>At-risk projects</dt><dd>J. Kim · S. Lee</dd></div><div class="fact"><dt>Approvals</dt><dd>CEO · Ops Lead</dd></div><div class="fact"><dt>Failed runs</dt><dd>Platform Team</dd></div><div class="fact"><dt>What happens next</dt><dd>Evidence review</dd></div></dl></div></section></aside></div>`;
}

function projectsPage(): string {
  return `${pageHeading("Portfolio control", "Projects", "Business containers with explicit owners, delivery confidence, blockers, and next actions.")}<section class="panel"><div class="panel-head"><h2>Company portfolio</h2><div class="utility-row"><button class="btn">Filters</button><button class="btn btn-primary">New project</button></div></div><div class="table-wrap"><table class="data-table"><caption class="sr-only">Projects</caption><thead><tr><th>Project</th><th>State</th><th>Owner</th><th>Progress</th><th>Next action</th></tr></thead><tbody><tr><td><a href="/projects/atlas">Project Atlas</a><br><small>Launch readiness</small></td><td>${status("AT RISK", "blocked")}</td><td><span class="owner"><span class="avatar">JK</span>J. Kim</span></td><td><div class="progress"><span style="width:68%"></span></div></td><td>Evidence package</td></tr><tr><td><a href="/projects/revenue-ops">Revenue Operations</a><br><small>Automation controls</small></td><td>${status("ACTIVE", "active")}</td><td><span class="owner"><span class="avatar">SL</span>S. Lee</span></td><td><div class="progress"><span style="width:82%"></span></div></td><td>Approval decision</td></tr><tr><td><a href="/projects/market-signal">Market Signal</a><br><small>Research system</small></td><td>${status("ACTIVE", "active")}</td><td><span class="owner"><span class="avatar">MH</span>M. Han</span></td><td><div class="progress"><span style="width:54%"></span></div></td><td>Source validation</td></tr></tbody></table></div></section>`;
}

function tasksPage(): string {
  return `${pageHeading("Work control", "Task Center", "Task is WHAT. See the owner, canonical state, blocker, approval, and next action without opening a chat.")}<div class="utility-row" style="margin-bottom:14px"><button class="btn btn-primary">All active · 28</button><button class="btn">Blocked · 4</button><button class="btn">Waiting approval · 7</button><button class="btn">Review · 5</button></div><section class="panel"><div class="table-wrap"><table class="data-table"><caption>Operational tasks</caption><thead><tr><th>Task</th><th>Status</th><th>Owner</th><th>Blocker / approval</th><th>Next action</th></tr></thead><tbody><tr><td><a href="/tasks/task-2048">Finalize launch evidence</a><br><small>Project Atlas</small></td><td>${status("BLOCKED", "blocked")}</td><td>J. Kim</td><td>Missing rollback proof</td><td>Attach evidence</td></tr><tr><td><a href="/tasks/task-1780">Approve customer export</a><br><small>Revenue Operations</small></td><td>${status("WAITING_APPROVAL", "approval")}</td><td>S. Lee</td><td>R3 · exact target approval</td><td>Human decision</td></tr><tr><td><a href="/tasks/task-1632">Validate research sources</a><br><small>Market Signal</small></td><td>${status("REVIEW", "working")}</td><td>Research Lead</td><td>1 unverified source</td><td>Complete review</td></tr></tbody></table></div></section>`;
}

function taskDetail(path: string, identity: ControlRoomIdentity): string {
  const id = path.split("/").at(-1) ?? "unknown";
  const canApprove = identity.permissions.includes("APPROVAL:DECIDE");
  return `${pageHeading("Project Atlas / Launch readiness", `Task ${escapeHtml(id)}`, "Finalize production launch evidence and preserve the distinction between QA verification and human approval.")}<div class="detail-grid"><div class="stack"><section class="panel"><div class="panel-head"><h2>Work definition</h2>${status("BLOCKED", "blocked")}</div><div class="panel-body"><dl class="fact-grid"><div class="fact"><dt>Why it exists</dt><dd>Production release gate</dd></div><div class="fact"><dt>Owner</dt><dd>J. Kim · Human</dd></div><div class="fact"><dt>Blocker</dt><dd>Rollback evidence missing</dd></div><div class="fact"><dt>Approval</dt><dd>Pending · VALID</dd></div><div class="fact"><dt>Next action</dt><dd>Attach evidence, then re-review</dd></div><div class="fact"><dt>Workflow</dt><dd>Launch readiness v3</dd></div></dl></div></section><section class="panel"><div class="panel-head"><h2>Activity & evidence</h2><a href="/audit">Open audit →</a></div><div class="panel-body timeline"><article class="activity"><time>09:41 · Agent run</time><strong>Deployment artifact created</strong><p>artifact-882 · evidence-441 · checksum verified</p></article><article class="activity"><time>09:32 · QA review</time><strong>Functional QA passed</strong><p>QA PASS is not production approval.</p></article><article class="activity"><time>09:14 · Human action</time><strong>Rollback evidence requested</strong><p>Reviewer · M. Han · correlation corr-2048</p></article></div></section></div><aside class="stack"><section class="panel"><div class="panel-head"><h2>Control gate</h2></div><div class="panel-body"><div class="callout"><strong>Human approval required</strong><p>Approval remains unavailable until the evidence set is complete and bound to this exact version.</p></div><div class="utility-row" style="margin-top:14px"><button class="btn" disabled>Mark complete</button>${canApprove ? '<button class="btn btn-approval" disabled>Approve</button>' : '<span class="permission-note">No approval authority</span>'}</div></div></section><section class="panel"><div class="panel-head"><h2>Execution chain</h2></div><div class="panel-body"><p><strong>Task</strong> → Assignment → Run → Artifact</p><p class="permission-note">Task ≠ Run · Review ≠ Approval · Evidence ≠ Audit</p></div></section></aside></div>`;
}

function aiCompanyPage(): string {
  return `${pageHeading("AI workforce", "AI Company", "A governed view of who is working, what they own, and where human attention is required.")}<section class="card-grid"><article class="entity-card"><span class="eyebrow">Executive orchestration</span><h3>AI Chief of Staff</h3><p>Coordinates work; does not replace specialized agents.</p><div class="entity-foot">${status("WORKING", "working")}<span>3 active tasks</span></div></article><article class="entity-card"><span class="eyebrow">System development</span><h3>Platform Team</h3><p>Build, test, review, and operations roles remain separated.</p><div class="entity-foot">${status("ACTIVE", "active")}<span>5 agents</span></div></article><article class="entity-card"><span class="eyebrow">Research</span><h3>Market Intelligence</h3><p>Source-grounded research with provenance review.</p><div class="entity-foot">${status("WAITING", "approval")}<span>1 blocked</span></div></article></section><div class="section-title"><h2>Current work allocation</h2></div><section class="panel"><div class="table-wrap"><table class="data-table"><caption class="sr-only">AI company work allocation</caption><thead><tr><th>Agent</th><th>Role</th><th>Task</th><th>Run</th><th>Next</th></tr></thead><tbody><tr><td>Deployment Agent</td><td>Release evidence</td><td>task-2048</td><td>${status("RUNNING", "running")}</td><td>Produce rollback proof</td></tr><tr><td>Research Agent</td><td>Source analysis</td><td>task-1632</td><td>${status("WAITING", "approval")}</td><td>Human validates source</td></tr></tbody></table></div></section>`;
}

function agentsPage(): string {
  return `${pageHeading("WHO does the work", "Agent Registry", "Agent identity and role remain separate from model reasoning and runner execution.")}<section class="panel"><div class="table-wrap"><table class="data-table"><caption>Registered agents</caption><thead><tr><th>Agent</th><th>Mission</th><th>Status</th><th>Model policy</th><th>Runner policy</th></tr></thead><tbody><tr><td><strong>Deployment Agent</strong><br><small>agent-17 · v4</small></td><td>Release evidence preparation</td><td>${status("WORKING", "working")}</td><td>deployment-reasoning</td><td>controlled-local</td></tr><tr><td><strong>Research Agent</strong><br><small>agent-09 · v7</small></td><td>Source-grounded analysis</td><td>${status("WAITING", "approval")}</td><td>research-balanced</td><td>cloud-sandbox</td></tr><tr><td><strong>QA Agent</strong><br><small>agent-12 · v3</small></td><td>Verification and evidence</td><td>${status("ACTIVE", "active")}</td><td>verification-strict</td><td>ci-runner</td></tr></tbody></table></div></section>`;
}

function runsPage(): string {
  return `${pageHeading("Execution visibility", "Runs", "Run is an execution attempt—not the business task. Inspect current step, evidence, cost, and failure context.")}<section class="panel"><div class="table-wrap"><table class="data-table"><caption>Recent runs</caption><thead><tr><th>Run</th><th>Task</th><th>Status</th><th>Agent / model / runner</th><th>Current step</th></tr></thead><tbody><tr><td><a href="/runs/run-8042">run-8042</a><br><small>started 09:30</small></td><td>task-2048</td><td>${status("RUNNING", "running")}</td><td>Deployment Agent / Reasoner M / local-1</td><td>Collect evidence</td></tr><tr><td><a href="/runs/run-8038">run-8038</a><br><small>ended 09:21</small></td><td>task-1632</td><td>${status("COMPLETED", "completed")}</td><td>Research Agent / Reasoner S / cloud-2</td><td>Evidence emitted</td></tr><tr><td><a href="/runs/run-8031">run-8031</a><br><small>ended 08:57</small></td><td>task-1510</td><td>${status("FAILED", "failed")}</td><td>QA Agent / Validator / ci-1</td><td>Retry reviewed</td></tr></tbody></table></div></section>`;
}

function runDetail(path: string): string {
  const id = path.split("/").at(-1) ?? "unknown";
  return `${pageHeading("Runs / Inspector", `Run ${escapeHtml(id)}`, "Live execution context with identity, reasoning, execution, events, and evidence kept distinct.")}<div class="callout" style="border-color:var(--blue);background:#eef3ff;margin-bottom:18px"><strong>Agent ≠ Model ≠ Runner</strong><p>Deployment Agent (WHO) · Reasoner M (HOW IT REASONS) · local-runner-1 (WHERE IT EXECUTES)</p></div><div class="detail-grid"><section class="panel"><div class="panel-head"><h2>Execution timeline</h2>${status("RUNNING", "running")}</div><div class="panel-body timeline"><article class="activity"><time>09:41:32 · Current step</time><strong>Collecting rollback evidence</strong><p>Tool call authorized · read-only repository status</p></article><article class="activity"><time>09:39:04</time><strong>Model result validated</strong><p>Schema valid · no action authority inferred</p></article><article class="activity"><time>09:30:11</time><strong>Run claimed by runner</strong><p>Health HEALTHY · capability matched</p></article></div></section><aside class="stack"><section class="panel"><div class="panel-head"><h2>Run context</h2></div><div class="panel-body"><dl class="fact-grid"><div class="fact"><dt>Current step</dt><dd>Evidence collection</dd></div><div class="fact"><dt>Task</dt><dd>task-2048</dd></div><div class="fact"><dt>Correlation</dt><dd>corr-2048</dd></div><div class="fact"><dt>Trace</dt><dd>trace-8042</dd></div><div class="fact"><dt>Elapsed</dt><dd>11m 21s</dd></div><div class="fact"><dt>Cost</dt><dd>$0.82 USD</dd></div></dl></div></section><section class="panel"><div class="panel-head"><h2>Evidence</h2></div><div class="panel-body"><p><strong>artifact-882</strong><br><small>Deployment manifest · checksum verified</small></p><p><strong>evidence-441</strong><br><small>Test suite · 100/100 PASS</small></p></div></section></aside></div>`;
}

function approvalsPage(identity: ControlRoomIdentity): string {
  const decide = identity.permissions.includes("APPROVAL:DECIDE");
  return `${pageHeading("Human authority", "Approval Center", "Approval means MAY. It stays separate from review, QA, recommendation, and execution state.")}<section class="panel"><div class="panel-head"><h2>Decisions awaiting authority</h2>${decide ? '<button class="btn btn-approval">Review next approval</button>' : '<span class="permission-note">Observer access · decisions hidden</span>'}</div><div class="table-wrap"><table class="data-table"><caption class="sr-only">Approval requests</caption><thead><tr><th>Request</th><th>Risk</th><th>Requested by</th><th>Status / validity</th><th>Evidence</th></tr></thead><tbody><tr><td><strong>Customer data export</strong><br><small>Exact target export-119 · v2</small></td><td>R3 · External action</td><td>S. Lee · Human</td><td>${status("PENDING", "approval")} <small>VALID</small></td><td>4 linked items</td></tr><tr><td><strong>Production release</strong><br><small>release-45 · commit 74d9781</small></td><td>R4 · Critical action</td><td>Deployment Agent</td><td>${status("PENDING", "approval")} <small>VALID</small></td><td>Rollback proof missing</td></tr></tbody></table></div></section><div class="callout" style="margin-top:16px"><strong>QA PASS ≠ Human Approval</strong><p>AI recommendation, review outcome, approval status, and approval validity are displayed separately.</p></div>`;
}

function alertsPage(supplemental?: Record<string, unknown>): string {
  const safe = supplemental
    ? escapeHtml(JSON.stringify(redact(supplemental), null, 2))
    : "";
  return `${pageHeading("Operational signals", "Alerts", "Actionable conditions with severity, owner, scope, and the next safe response.")}<section class="card-grid"><article class="entity-card"><span class="status status-failed">CRITICAL · OPEN</span><h3>Runner latency threshold</h3><p>local-runner-2 · owner Platform Team</p><div class="entity-foot"><span>Started 09:30</span><strong>Inspect health</strong></div></article><article class="entity-card"><span class="status status-waiting">WARNING · OPEN</span><h3>Approval aging</h3><p>2 requests older than policy threshold</p><div class="entity-foot"><span>Owner Ops Lead</span><strong>Review queue</strong></div></article><article class="entity-card"><span class="status status-healthy">NOTICE · ACKNOWLEDGED</span><h3>Memory gateway recovery</h3><p>Readiness returned to HEALTHY</p><div class="entity-foot"><span>09:12</span><strong>View event</strong></div></article></section>${safe ? `<div class="section-title"><h2>Sanitized diagnostic context</h2></div><pre class="supplemental">${safe}</pre>` : ""}`;
}

function controlPlaneScope(view: ControlPlaneView): string {
  const rows = view.systems
    .map((system) => {
      const style =
        system.health === "HEALTHY"
          ? "healthy"
          : system.health === "UNAVAILABLE"
            ? "failed"
            : "waiting";
      return `<tr><td><strong>${escapeHtml(system.name)}</strong><br><small>${escapeHtml(system.id)}</small></td><td>${status(system.lifecycle, "active")}</td><td>${status(system.health, style)}</td><td>${escapeHtml(system.owner.id)} · ${escapeHtml(system.owner.type)}</td><td>${escapeHtml(system.source_of_truth)}</td></tr>`;
    })
    .join("");
  const blockers = view.blockers
    .map(
      (blocker) =>
        `<li><strong>${escapeHtml(blocker.id)}</strong> · ${escapeHtml(blocker.status)} · owner ${escapeHtml(blocker.owner.id)}</li>`,
    )
    .join("");
  const nextActions = view.next_actions
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.id)}</strong> · ${escapeHtml(item.action)}</li>`,
    )
    .join("");
  return `<section aria-label="Control Plane scope"><div class="section-title"><h2>Control Plane scope</h2><span class="permission-note">Permission-scoped projection · domain ownership preserved</span></div><section class="metric-grid" aria-label="Control Plane summary"><article class="metric metric-working"><div class="metric-top"><span>Systems</span><span>registered</span></div><strong class="metric-value">${view.summary.systems}</strong><div class="metric-note">${view.summary.systems} systems</div></article><article class="metric metric-working"><div class="metric-top"><span>Projects</span><span>in scope</span></div><strong class="metric-value">${view.summary.projects}</strong><div class="metric-note">${view.summary.projects} projects</div></article><article class="metric metric-working"><div class="metric-top"><span>Runs</span><span>current</span></div><strong class="metric-value">${view.summary.runs}</strong><div class="metric-note">${view.summary.runs} runs</div></article><article class="metric metric-critical"><div class="metric-top"><span>Alerts</span><span>attention</span></div><strong class="metric-value">${view.summary.alerts}</strong><div class="metric-note">Unknown is never healthy</div></article></section><section class="panel"><div class="table-wrap"><table class="data-table"><caption>Authorized systems</caption><thead><tr><th>System</th><th>Lifecycle</th><th>Health</th><th>Owner</th><th>Source of truth</th></tr></thead><tbody>${rows}</tbody></table></div></section><div class="detail-grid" style="margin-top:18px"><section class="panel"><div class="panel-head"><h2>Blockers</h2></div><div class="panel-body"><ul>${blockers || "<li>No blockers in scope</li>"}</ul></div></section><section class="panel"><div class="panel-head"><h2>Next actions</h2></div><div class="panel-body"><ul>${nextActions || "<li>No pending actions</li>"}</ul></div></section></div></section>`;
}

function memoryIntegrationPanel(view?: MemoryIntegrationView): string {
  if (!view) return "";
  const style = view.ready
    ? "healthy"
    : view.health === "UNAVAILABLE"
      ? "failed"
      : "waiting";
  return `<div class="section-title"><h2>AI Memory Gateway Integration</h2><span class="permission-note">AI Memory Gateway is source of truth · MAOS stores references and governance metadata only</span></div><section class="panel" aria-label="AI Memory Gateway integration"><div class="panel-head"><h2>${escapeHtml(view.gateway_id)}</h2>${status(view.health, style)}</div><dl class="fact-grid"><div class="fact"><dt>Context status</dt><dd>${status(view.last_context_status, style)}</dd></div><div class="fact"><dt>Provenance issues</dt><dd>${view.provenance_issues}</dd></div><div class="fact"><dt>Requests</dt><dd>${view.request_count}</dd></div><div class="fact"><dt>Failure / latency</dt><dd>${Math.round(view.failure_rate * 100)}% · ${Math.round(view.average_latency_ms)} ms</dd></div></dl></section>`;
}

function systemsPage(
  controlPlane?: ControlPlaneView,
  memoryIntegration?: MemoryIntegrationView,
): string {
  const scoped = controlPlane ? controlPlaneScope(controlPlane) : "";
  return `${pageHeading("Platform visibility", "Systems", "Health is explicit and dependency-aware. UNKNOWN never appears as HEALTHY.")}${scoped}${memoryIntegrationPanel(memoryIntegration)}<div class="section-title"><h2>Phase 1 operational dependencies</h2></div><section class="panel"><div class="panel-head"><h2>Registered systems and dependencies</h2><span class="permission-note">Pilot boundary · READ ONLY · domain systems remain source of truth</span></div><div class="table-wrap"><table class="data-table"><caption class="sr-only">Registered systems and dependencies</caption><thead><tr><th>System</th><th>Type</th><th>Health</th><th>Integration</th><th>Owner / boundary</th></tr></thead><tbody><tr><td><strong>MAOS Core API</strong></td><td>INTERNAL_PLATFORM</td><td>${status("HEALTHY", "healthy")}</td><td>Native</td><td>Platform Team</td></tr><tr><td><strong>AI Memory Gateway</strong></td><td>MEMORY_SYSTEM</td><td>${status("HEALTHY", "healthy")}</td><td>I2 · Observable</td><td>Knowledge Team</td></tr><tr><td><strong>RBS Homes</strong><br><small>PREVIEW · readiness awaiting fresh evidence</small></td><td>PUBLIC_PLATFORM</td><td>${status("UNKNOWN", "waiting")}</td><td>I2 · Observable</td><td>Platform Owner<br><small>DOMAIN SOURCE OF TRUTH</small></td></tr><tr><td><strong>Admin RBS Homes</strong><br><small>PREVIEW · readiness awaiting fresh evidence</small></td><td>INTERNAL_PLATFORM</td><td>${status("UNKNOWN", "waiting")}</td><td>I2 · Observable</td><td>Platform Owner<br><small>DOMAIN SOURCE OF TRUTH</small></td></tr><tr><td><strong>Local Runner 2</strong></td><td>INFRASTRUCTURE</td><td>${status("DEGRADED", "approval")}</td><td>Registered provider</td><td>Platform Team</td></tr><tr><td><strong>CRM</strong></td><td>DOMAIN_APPLICATION</td><td>${status("UNKNOWN", "waiting")}</td><td>I0 · Independent</td><td>Revenue Ops</td></tr></tbody></table></div></section>`;
}

function statePage(state: Exclude<ViewState, "ready">): string {
  const states = {
    loading: [
      "◌",
      "Loading current operating state",
      "Request context is established. Waiting for authorized data.",
    ],
    empty: [
      "○",
      "No items in this view",
      "Nothing currently matches the selected scope and filters.",
    ],
    error: [
      "!",
      "Control Room data is unavailable",
      "The failure was captured with correlation context. Retry safely.",
    ],
    blocked: [
      "×",
      "Blocked by dependency",
      "The required upstream work is incomplete. Review the blocker before proceeding.",
    ],
    approval_required: [
      "◆",
      "Human approval required",
      "This operation cannot proceed until valid authority is recorded.",
    ],
    conflict: [
      "↻",
      "Control Room state changed",
      "Request a fresh authorized view before continuing.",
    ],
    denied: [
      "⊘",
      "Control Room access denied",
      "This identity is not authorized for the requested resource.",
    ],
    timeout: [
      "◷",
      "Control Room request timed out",
      "No operation was assumed successful. Retry safely.",
    ],
    unavailable: [
      "◇",
      "Control Room dependency unavailable",
      "The required service is unavailable and the operation is fail-closed.",
    ],
  } as const;
  const [icon, title, copy] = states[state];
  return `<section class="panel state-view" data-view-state="${state}"><div><div class="state-icon" aria-hidden="true">${icon}</div><h2>${title}</h2><p>${copy}</p><button class="btn">${state === "error" ? "Retry" : "Return to overview"}</button></div></section>`;
}

function notFound(): string {
  return `${pageHeading("Navigation", "Screen not available", "The requested Control Room screen does not exist or is outside your authorized navigation scope.")}<section class="panel state-view"><div><div class="state-icon">?</div><h2>Screen not available</h2><p>Check the address or return to an authorized operating view.</p><a class="btn btn-primary" href="/today" style="display:inline-flex;align-items:center;text-decoration:none">Return to Today</a></div></section>`;
}

function deploymentsPage(identity: ControlRoomIdentity): string {
  const canExecute = identity.permissions.includes("DEPLOYMENT:EXECUTE");
  const action = canExecute
    ? '<button class="btn btn-primary" type="button" data-action="DEPLOYMENT:EXECUTE" disabled>Run simulated deployment</button><span class="permission-note">Human approval and runtime revalidation required</span>'
    : '<span class="permission-note">Read-only release visibility · execution requires exact permission and human authority.</span>';
  return `${pageHeading("Release control", "Deployment Center", "Promote one immutable artifact through governed environments with explicit human authority, verification, and rollback evidence.")}
  <section class="metric-grid" aria-label="Release readiness"><article class="metric metric-working"><div class="metric-top"><span>Release</span><span>release-117</span></div><strong class="metric-value">1.17.0</strong><div class="metric-note">commit-candidate · build-117</div></article><article class="metric metric-approval"><div class="metric-top"><span>Production gate</span><span>Human authority</span></div><strong class="metric-value" style="font-size:21px">WAITING APPROVAL</strong><div class="metric-note">QA PASS ≠ Production Approval</div></article><article class="metric metric-working"><div class="metric-top"><span>Artifact</span><span>Immutable</span></div><strong class="metric-value" style="font-size:18px">sha256:candidate</strong><div class="metric-note">Build once → promote same artifact</div></article><article class="metric metric-working"><div class="metric-top"><span>Rollback</span><span>Known good</span></div><strong class="metric-value" style="font-size:21px">READY</strong><div class="metric-note">Rollback ready · sha256:previous</div></article></section>
  <div class="detail-grid"><section class="panel"><div class="panel-head"><h2>Environment progression</h2>${status("SIMULATED ONLY", "working")}</div><div class="table-wrap"><table class="data-table"><caption class="sr-only">Release environment progression</caption><thead><tr><th>Environment</th><th>Artifact</th><th>Health</th><th>Gate</th><th>Evidence</th></tr></thead><tbody><tr><td>DEVELOPMENT</td><td>sha256:candidate</td><td>${status("HEALTHY", "healthy")}</td><td>Verified tests</td><td>evidence-tests</td></tr><tr><td>PREVIEW / STAGING</td><td>sha256:candidate</td><td>${status("HEALTHY", "healthy")}</td><td>QA + Security PASS</td><td>evidence-qa · evidence-security</td></tr><tr><td>PRODUCTION</td><td>sha256:candidate</td><td>${status("WAITING APPROVAL", "approval")}</td><td>Exact-target human approval</td><td>Not yet authorized</td></tr></tbody></table></div></section><aside class="stack"><section class="panel"><div class="panel-head"><h2>Governed action</h2></div><div class="panel-body"><div class="callout"><strong>Simulated deployment</strong><p>No real production credentials or external deployment capability is available in this phase.</p></div><div class="utility-row" style="margin-top:14px">${action}</div></div></section><section class="panel"><div class="panel-head"><h2>Evidence chain</h2></div><div class="panel-body timeline"><article class="activity"><time>Build</time><strong>Artifact frozen</strong><p>commit-candidate · sha256:candidate</p></article><article class="activity"><time>QA / Security</time><strong>Independent evidence passed</strong><p>Does not grant production authority.</p></article><article class="activity"><time>Next</time><strong>Human approval</strong><p>Revalidate target, version, hash, policy, environment, and authority.</p></article></div></section></aside></div>`;
}

function routeContent(input: ControlRoomRenderInput): string {
  const path = input.path === "/" ? "/today" : input.path;
  if (path === "/development" || path.startsWith("/development/"))
    return `${renderDevelopmentWorkspace({
      identity: input.identity!,
      path,
      snapshot: input.development_snapshot,
      state: input.state,
    })}${memoryIntegrationPanel(input.memory_integration)}`;
  if (input.state && input.state !== "ready") return statePage(input.state);
  if (path === "/today") return todayPage(input.identity!);
  if (path === "/projects" || path.startsWith("/projects/"))
    return projectsPage();
  if (path === "/tasks") return tasksPage();
  if (path.startsWith("/tasks/")) return taskDetail(path, input.identity!);
  if (path === "/ai-company") return aiCompanyPage();
  if (path === "/agents") return agentsPage();
  if (path === "/runs") return runsPage();
  if (path.startsWith("/runs/")) return runDetail(path);
  if (path === "/approvals") return approvalsPage(input.identity!);
  if (path === "/alerts") return alertsPage(input.supplemental);
  if (path === "/systems")
    return systemsPage(input.control_plane, input.memory_integration);
  if (path === "/marketing") return marketingPage(input.marketing);
  if (path === "/ai-mls") return aiMlsPage(input.ai_mls);
  if (path === "/deployments") return deploymentsPage(input.identity!);
  return notFound();
}

function aiMlsPage(view?: AiMlsView): string {
  if (!view)
    return `${pageHeading("Independent internal system", "AI-MLS", "MAOS integrates and monitors; AI-MLS remains source of truth.")}<section class="panel state-view"><div><div class="state-icon">⌗</div><h2>No internal observation</h2><p>The integration is registered without copying listing data into MAOS.</p></div></section>`;
  return `${pageHeading("INTERNAL ONLY", "AI-MLS", "Governed real-estate intelligence visibility. AI-MLS remains source of truth.")}
  <section class="metric-grid" aria-label="AI-MLS integration summary"><article class="metric metric-working"><div class="metric-top"><span>Ingestion</span><span>${escapeHtml(view.health)}</span></div><strong class="metric-value" style="font-size:21px">${escapeHtml(view.ingestion_status)}</strong><div class="metric-note">Collection · ${escapeHtml(view.collection_status)}</div></article><article class="metric metric-approval"><div class="metric-top"><span>Verification backlog</span><span>Human review</span></div><strong class="metric-value">${view.verification_backlog}</strong><div class="metric-note">Pending candidates</div></article><article class="metric metric-risk"><div class="metric-top"><span>Stale ingestion</span><span>Stale warning</span></div><strong class="metric-value">${view.stale_ingestions}</strong><div class="metric-note">Requires source review</div></article><article class="metric metric-critical"><div class="metric-top"><span>Failed runs</span><span>Operational</span></div><strong class="metric-value">${view.failed_runs}</strong><div class="metric-note">Blocked tasks · ${view.blocked_tasks}</div></article></section>
  <div class="detail-grid"><section class="panel"><div class="panel-head"><h2>Candidate visibility</h2>${status("INTERNAL ONLY", "working")}</div><div class="panel-body"><dl class="fact-grid"><div class="fact"><dt>Pending</dt><dd>${view.candidate_counts.pending}</dd></div><div class="fact"><dt>Verified</dt><dd>${view.candidate_counts.verified}</dd></div><div class="fact"><dt>Blocked</dt><dd>${view.candidate_counts.blocked}</dd></div><div class="fact"><dt>Source reference</dt><dd><code>${escapeHtml(view.source_reference)}</code></dd></div></dl><div class="callout"><strong>No external publication</strong><p>Publication eligibility is informational only. Verified and consented information still requires separately governed downstream authority.</p></div></div></section><aside class="panel"><div class="panel-head"><h2>Current coordination</h2><span class="permission-note">Read-only</span></div><div class="panel-body"><p><strong>Next action</strong></p><p>${escapeHtml(view.next_action)}</p><p class="permission-note">MAOS does not run the AI-MLS parser, matching engine, search index, contact workflow, or publication runtime.</p></div></aside></div>`;
}

function marketingPage(view?: MarketingView): string {
  if (!view)
    return `${pageHeading("Independent system", "Marketing Automation", "MAOS coordinates governed visibility; Marketing remains source of truth.")}<section class="panel state-view"><div><div class="state-icon">◈</div><h2>No campaign observation</h2><p>The integration is registered without importing Marketing domain data.</p></div></section>`;
  const roles = view.roles
    .map(
      (role) =>
        `<span class="status status-working">${escapeHtml(role)}</span>`,
    )
    .join(" ");
  const channels = view.channels
    .map(
      (channel) =>
        `<span class="status status-active">${escapeHtml(channel)}</span>`,
    )
    .join(" ");
  return `${pageHeading("Independent AI team", "Marketing Automation", "MAOS monitors and coordinates safely; Marketing remains source of truth.")}
  <section class="metric-grid" aria-label="Marketing integration summary"><article class="metric metric-working"><div class="metric-top"><span>Campaign</span><span>${escapeHtml(view.health)}</span></div><strong class="metric-value" style="font-size:21px">${escapeHtml(view.campaign_id)}</strong><div class="metric-note">${escapeHtml(view.status)}</div></article><article class="metric metric-working"><div class="metric-top"><span>Reach</span><span>KPI feed</span></div><strong class="metric-value">${view.kpi.reach.toLocaleString("en-US")}</strong><div class="metric-note">Leads · ${view.kpi.leads}</div></article><article class="metric metric-approval"><div class="metric-top"><span>QA</span><span>Review only</span></div><strong class="metric-value" style="font-size:21px">${escapeHtml(view.qa_state)}</strong><div class="metric-note">QA PASS ≠ CEO / Production Approval</div></article><article class="metric metric-approval"><div class="metric-top"><span>Publisher</span><span>Governed</span></div><strong class="metric-value" style="font-size:18px">${escapeHtml(view.publisher_state).replaceAll("_", " ")}</strong><div class="metric-note">Publisher capability ≠ authority</div></article></section>
  <div class="detail-grid"><section class="panel"><div class="panel-head"><h2>Campaign visibility</h2>${status(view.approval_state, "approval")}</div><div class="panel-body"><dl class="fact-grid"><div class="fact"><dt>Source reference</dt><dd><code>${escapeHtml(view.source_reference)}</code></dd></div><div class="fact"><dt>Next action</dt><dd>${escapeHtml(view.next_action)}</dd></div><div class="fact"><dt>Channels</dt><dd>${channels}</dd></div><div class="fact"><dt>Boundary</dt><dd>Observation and simulation only</dd></div></dl><div class="callout"><strong>External publishing is unavailable.</strong><p>Exact human approval is required before Publisher progression; no production credentials or publish action exist here.</p></div></div></section><aside class="panel"><div class="panel-head"><h2>10-role external team</h2><span class="permission-note">Registry visibility</span></div><div class="panel-body"><p>${roles}</p><p class="permission-note">Agent status and work references are observed; MAOS does not replace the Marketing workflow runtime.</p></div></aside></div>`;
}

function authenticationPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authentication required · MAOS</title><style>${CONTROL_ROOM_CSS}</style></head><body><main class="auth-shell"><section class="auth-story"><div class="brand"><span class="brand-mark">M</span><div><strong>MAOS</strong><small>Control Room</small></div></div><div><p class="eyebrow">Enterprise AI control plane</p><h1>Human authority stays visible.</h1><p>Structured work, explicit ownership, governed AI activity, and evidence you can inspect.</p></div><small>Private personal data remains private by default.</small></section><section class="auth-panel"><div class="auth-card"><span class="eyebrow">Secure boundary</span><h2>Authentication required</h2><p>Sign in through your organization identity provider to access authorized Control Room resources.</p><button class="btn btn-primary" disabled>Organization sign-in</button><p class="permission-note">Identity provider integration is configured outside source code.</p></div></section></main></body></html>`;
}

export function renderControlRoom(input: ControlRoomRenderInput): string {
  if (!input.identity) return authenticationPage();
  const path = input.path === "/" ? "/today" : input.path;
  const section = NAVIGATION.find((item) => currentPath(item.path, path));
  const title = section?.label ?? "Control Room";
  const authorized =
    !section || input.identity.permissions.includes(section.permission);
  const initials = input.identity.display_name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const context = input.context ?? {
    correlation_id: "preview-correlation",
    request_id: "preview-request",
    span_id: "preview-span",
    trace_id: "preview-trace",
  };
  const accessNote =
    input.identity.role === "OBSERVER"
      ? '<p class="permission-note">Observer access · read-only authorized views</p>'
      : "";
  const routedContent = authorized ? routeContent(input) : notFound();
  const permissionAwareContent = input.identity.permissions.includes(
    "PROJECT:CREATE",
  )
    ? routedContent
    : routedContent.replace(
        '<button class="btn btn-primary">New project</button>',
        "",
      );
  const content = permissionAwareContent.replace(
    '<a href="/audit">Open audit →</a>',
    '<span class="permission-note">3 linked records</span>',
  );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#17251e"><title>${escapeHtml(title)} · MAOS Control Room</title><style>${CONTROL_ROOM_CSS}</style></head><body><a class="skip-link" href="#main-content">Skip to main content</a><div class="mobile-overlay" data-close-nav></div><div class="app-shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">M</span><div><strong>MAOS</strong><small>Control Room</small></div></div><nav class="primary-nav" aria-label="Primary navigation">${navigation(input.identity, path)}</nav><div class="sidebar-foot"><span class="avatar">${escapeHtml(initials)}</span><div><strong>${escapeHtml(input.identity.display_name)}</strong><small>${escapeHtml(input.identity.role)} · Development</small></div></div></aside><div class="workspace"><header class="topbar"><button class="menu-button" type="button" aria-label="Open navigation" aria-expanded="false" data-menu-button>☰</button><div class="breadcrumb"><span>Control Room /</span> ${escapeHtml(title)}</div><div class="command"><div class="command-search" role="search">⌕ <span>Search work, agents, runs…</span><span class="key">⌘ K</span></div><button class="icon-button" aria-label="Notifications">♢</button></div></header><main class="main" id="main-content" tabindex="-1">${accessNote}${content}<footer class="footer-meta" aria-label="Request context"><span>Request <code>${escapeHtml(context.request_id)}</code></span><span>Correlation <code>${escapeHtml(context.correlation_id)}</code></span><span>Trace <code>${escapeHtml(context.trace_id)}</code></span></footer></main></div></div><script>(()=>{const b=document.querySelector('[data-menu-button]');const close=()=>{document.body.classList.remove('nav-open');b?.setAttribute('aria-expanded','false')};b?.addEventListener('click',()=>{const open=document.body.classList.toggle('nav-open');b.setAttribute('aria-expanded',String(open))});document.querySelector('[data-close-nav]')?.addEventListener('click',close);document.addEventListener('keydown',e=>{if(e.key==='Escape')close()})})()</script></body></html>`;
}
