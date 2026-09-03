export type DevelopmentWorkspaceState =
  | "approval_required"
  | "blocked"
  | "conflict"
  | "denied"
  | "empty"
  | "error"
  | "loading"
  | "ready"
  | "timeout"
  | "unavailable";

export interface DevelopmentWorkspaceIdentity {
  permissions: readonly string[];
}

export interface DevelopmentWorkspaceInput {
  identity: DevelopmentWorkspaceIdentity;
  path: string;
  state?: DevelopmentWorkspaceState | undefined;
}

function badge(label: string, style: string): string {
  return `<span class="status status-${style}">${label}</span>`;
}

function workspaceState(
  state: Exclude<DevelopmentWorkspaceState, "ready">,
): string {
  const states = {
    approval_required: [
      "◆",
      "Human approval required",
      "The requested governed action is waiting for valid, target-bound authority.",
    ],
    blocked: [
      "×",
      "Blocked by dependency",
      "Architecture review must complete before implementation can continue.",
    ],
    conflict: [
      "↻",
      "Workspace state changed",
      "Repository state no longer matches this view. Request a fresh governed status snapshot.",
    ],
    denied: [
      "⊘",
      "Workspace access denied",
      "This identity has no permission for the requested repository capability.",
    ],
    empty: [
      "○",
      "No development task selected",
      "Choose an authorized development task to establish repository and run scope.",
    ],
    error: [
      "!",
      "Development workspace unavailable",
      "The failure was captured with request and correlation context.",
    ],
    loading: [
      "◌",
      "Loading development workspace",
      "Establishing authorized task, workroot, runner, and evidence context.",
    ],
    timeout: [
      "◷",
      "Workspace request timed out",
      "No repository action was assumed successful. Retry through the governed capability.",
    ],
    unavailable: [
      "◇",
      "Local runner unavailable",
      "Execution is fail-closed until a registered runner returns to a healthy state.",
    ],
  } as const;
  const [icon, title, copy] = states[state];
  return `<section class="panel state-view" data-view-state="${state}"><div><div class="state-icon" aria-hidden="true">${icon}</div><h2>${title}</h2><p>${copy}</p><a class="btn btn-primary" href="/development" style="display:inline-flex;align-items:center;text-decoration:none">Return to workspace</a></div></section>`;
}

function previewEntry(): string {
  return `<div class="page-heading"><div><div class="eyebrow">Development / Preview</div><h1>Preview Workspace</h1><p>Entry point only for a future governed render, inspect, annotate, and verification workflow.</p></div></div><div class="detail-grid"><section class="panel"><div class="panel-head"><h2>Preview boundary</h2>${badge("ENTRY ONLY", "active")}</div><div class="panel-body"><div class="callout"><strong>Phase boundary preserved</strong><p>Preview automation and UI Inspector execution remain Phase 1.16 scope. This screen provides navigation and context only.</p></div><dl class="fact-grid" style="margin-top:16px"><div class="fact"><dt>Task</dt><dd>task-dev-114</dd></div><div class="fact"><dt>Environment</dt><dd>DEVELOPMENT</dd></div><div class="fact"><dt>Source</dt><dd>Current task-scoped artifact</dd></div><div class="fact"><dt>Next action</dt><dd>Complete implementation evidence</dd></div></dl></div></section><aside class="panel"><div class="panel-head"><h2>Available now</h2></div><div class="panel-body"><p>✓ Return to development context</p><p>✓ Inspect linked run and evidence</p><p>— Visual inspection automation remains unavailable</p><a class="btn" href="/development" style="display:inline-flex;align-items:center;text-decoration:none;margin-top:12px">Back to workspace</a></div></aside></div>`;
}

export function renderDevelopmentWorkspace(
  input: DevelopmentWorkspaceInput,
): string {
  if (input.path === "/development/preview") return previewEntry();
  if (input.state && input.state !== "ready")
    return workspaceState(input.state);

  const canExecute = input.identity.permissions.includes(
    "LOCAL_EXECUTION:EXECUTE",
  );
  const canCancel = input.identity.permissions.includes(
    "LOCAL_EXECUTION:CANCEL",
  );
  const actions =
    canExecute || canCancel
      ? `<div class="workspace-actions" aria-label="Governed development actions">${canExecute ? '<button class="btn btn-primary" type="button" data-capability="RUN_COMMAND" disabled>Request test run</button>' : ""}${canCancel ? '<button class="btn" type="button" data-action="LOCAL_EXECUTION:CANCEL" disabled>Cancel run</button>' : ""}<span>Task scope · task-dev-115 · authenticated API session required</span></div>`
      : '<p class="permission-note">Read-only workspace access · execution actions require exact Local Execution permission.</p>';

  return `<div class="page-heading development-heading"><div><div class="eyebrow">Governed build surface</div><h1>System Development Workspace</h1><p>Build context for one authorized change—task, agent, repository state, quality evidence, approval, and next action in one place.</p></div><a class="btn" href="/development/preview" style="display:inline-flex;align-items:center;text-decoration:none">Open Preview Workspace →</a></div>
  <section class="dev-context" aria-label="Development context"><div><span>PROJECT</span><strong>MAOS Core</strong></div><div><span>REPOSITORY</span><strong>D:\\10. MAOS</strong></div><div><span>BRANCH</span><strong>codex/phase-1.15A-development-loop-runtime</strong></div><div><span>Approved workroot</span><strong>Verified · task scoped</strong></div></section>
  <section class="panel dev-hero"><div><div class="eyebrow">task-dev-115a · DEVELOPMENT</div><h2>Implement Development Loop Runtime MVP</h2><p>Coordinate bounded requirement, implementation, test, revision, approval, verification, and learning-candidate stages with explicit evidence.</p></div><div class="dev-hero-meta">${badge("IN PROGRESS", "working")}<span><strong>Owner</strong> · Development Lead</span><span><strong>Assigned agent</strong> · Backend Agent</span><span><strong>Next action</strong> · complete loop lifecycle tests</span></div></section>
  <section class="dev-stage-grid" aria-label="Development lifecycle"><article class="dev-stage complete"><span>01</span><strong>Requirement</strong><small>COMPLETE · evidence linked</small></article><article class="dev-stage complete"><span>02</span><strong>Plan</strong><small>COMPLETE · reviewed</small></article><article class="dev-stage active"><span>03</span><strong>Implementation</strong><small>IN PROGRESS · Frontend Agent</small></article><article class="dev-stage"><span>04</span><strong>Automated test</strong><small>QUEUED · governed runner</small></article><article class="dev-stage"><span>05</span><strong>QA review</strong><small>WAITING · human gate</small></article></section>
  <div class="dev-work-grid"><div class="stack"><section class="panel"><div class="panel-head"><h2>Changed files</h2><div class="utility-row">${badge("3 CHANGED", "working")}<span class="permission-note">GIT_STATUS · GIT_DIFF</span></div></div><div class="file-list" role="list"><div role="listitem"><span class="file-state modified">M</span><code>apps/web/src/control-room.ts</code><span>+42 −8</span></div><div role="listitem"><span class="file-state added">A</span><code>apps/web/src/development-workspace.ts</code><span>+218</span></div><div role="listitem"><span class="file-state modified">M</span><code>apps/web/src/styles.ts</code><span>+31</span></div></div><div class="repository-boundary"><strong>Governed repository snapshot</strong><span>READ_FILE, GIT_STATUS, and GIT_DIFF use registered local-runner capabilities inside the approved workroot.</span></div></section>
  <section class="panel"><div class="panel-head"><h2>Quality & evidence</h2><span class="permission-note">QA PASS ≠ Production Approval</span></div><div class="quality-grid"><article><span class="quality-icon pass">✓</span><div><strong>Tests</strong><p>113 passed · evidence-test-114</p></div>${badge("PASS", "healthy")}</article><article><span class="quality-icon pass">✓</span><div><strong>Build</strong><p>17 workspaces · artifact-build-114</p></div>${badge("PASS", "healthy")}</article><article><span class="quality-icon wait">◆</span><div><strong>Human approval</strong><p>Not requested · implementation incomplete</p></div>${badge("NOT READY", "waiting")}</article></div></section></div>
  <aside class="stack"><section class="panel"><div class="panel-head"><h2>Run & local runner</h2>${badge("RUNNING", "running")}</div><div class="panel-body"><dl class="fact-grid"><div class="fact"><dt>Run</dt><dd><a href="/runs/run-dev-114">run-dev-114</a></dd></div><div class="fact"><dt>Current step</dt><dd>Component implementation</dd></div><div class="fact"><dt>Runner</dt><dd>local-runner-1</dd></div><div class="fact"><dt>Health</dt><dd>${badge("HEALTHY", "healthy")}</dd></div></dl><p class="permission-note">Runner identity and health do not grant authority.</p>${actions}</div></section><section class="panel"><div class="panel-head"><h2>What is blocked</h2>${badge("CLEAR", "healthy")}</div><div class="panel-body"><p><strong>No active dependency blocker.</strong></p><p class="permission-note">Human approval required after implementation, independent test, QA, security review, and evidence. Self-approval is never allowed.</p><a href="/approvals" class="panel-link">Open Approval Center →</a></div></section><section class="panel"><div class="panel-head"><h2>Recent evidence</h2></div><div class="panel-body timeline"><article class="activity"><time>10:14 · Test</time><strong>Focused component suite passed</strong><p>evidence-test-114 · checksum recorded</p></article><article class="activity"><time>10:09 · Repository</time><strong>Scoped diff captured</strong><p>GIT_DIFF · 3 files · workroot verified</p></article><article class="activity"><time>09:58 · Human</time><strong>Implementation plan accepted</strong><p>Reviewer · Development Lead</p></article></div></section></aside></div>
  <div class="section-title"><h2>System Development Agent Team</h2><span class="permission-note">Agent ≠ Model ≠ Runner · Skill ≠ Tool Permission</span></div>
  <section class="panel"><div class="table-wrap"><table class="data-table"><caption>Eleven specialized roles and current governed status</caption><thead><tr><th>Role</th><th>Status</th><th>Current assignment</th><th>Boundary</th></tr></thead><tbody>
  <tr><td>Development Lead</td><td>${badge("WORKING", "working")}</td><td>task-dev-115</td><td>Coordinates; cannot self-approve</td></tr><tr><td>Requirement / Product Agent</td><td>${badge("AVAILABLE", "healthy")}</td><td>—</td><td>Requirements only</td></tr><tr><td>Architecture Agent</td><td>${badge("AVAILABLE", "healthy")}</td><td>—</td><td>Architecture review</td></tr><tr><td>UI / UX Agent</td><td>${badge("AVAILABLE", "healthy")}</td><td>—</td><td>Design artifact</td></tr><tr><td>Frontend Agent</td><td>${badge("AVAILABLE", "healthy")}</td><td>—</td><td>Client implementation</td></tr><tr><td>Backend Agent</td><td>${badge("WORKING", "working")}</td><td>task-dev-115</td><td>Service implementation</td></tr><tr><td>Database Agent</td><td>${badge("AVAILABLE", "healthy")}</td><td>—</td><td>Migration scope</td></tr><tr><td>Functional Test Agent</td><td>${badge("WAITING", "waiting")}</td><td>task-review-115</td><td>Independent verification</td></tr><tr><td>UX QA Agent</td><td>${badge("AVAILABLE", "healthy")}</td><td>—</td><td>Independent UX QA</td></tr><tr><td>Security Review Agent</td><td>${badge("WAITING", "waiting")}</td><td>task-security-115</td><td>Independent security review</td></tr><tr><td>DevOps / Deployment Agent</td><td>${badge("AVAILABLE", "healthy")}</td><td>—</td><td>Preparation only</td></tr>
  </tbody></table></div></section>
  <div class="section-title"><h2>Governed collaboration record</h2></div><section class="panel"><div class="panel-body"><p><strong>Task → Artifact → Review Task → Feedback Artifact → Revision Task → Re-test / Re-review</strong></p><p class="permission-note">Chat is not source of truth. Handoffs carry task scope, facts, decisions, constraints, artifacts, open questions, confidence, evidence, and the recommended next action.</p></div></section>
  <div class="section-title"><h2>Development Loop Runtime</h2><span class="permission-note">Bounded orchestration · no production execution</span></div><section class="panel"><div class="panel-head"><h2>Loop run · loop-run-115a</h2>${badge("RUNNING", "running")}</div><div class="panel-body"><dl class="fact-grid"><div class="fact"><dt>Current stage</dt><dd>Implement</dd></div><div class="fact"><dt>Iteration</dt><dd>Iteration 1 of 3</dd></div><div class="fact"><dt>Time budget</dt><dd>12m of 60m</dd></div><div class="fact"><dt>Cost budget</dt><dd>$1.20 of $10.00</dd></div><div class="fact"><dt>Allowed tools</dt><dd>READ_FILE · RUN_COMMAND</dd></div><div class="fact"><dt>Stop controls</dt><dd>NO_PROGRESS · KILL_SWITCH</dd></div></dl><p class="permission-note">Human Authority &gt; AI Authority · QA PASS ≠ Production Approval · deployment progression remains approval-bound.</p></div></section>
  <section class="dev-stage-grid" aria-label="Development loop stages"><article class="dev-stage complete"><span>01</span><strong>Requirement</strong><small>COMPLETE · artifact linked</small></article><article class="dev-stage complete"><span>02</span><strong>Plan</strong><small>COMPLETE · evidence linked</small></article><article class="dev-stage active"><span>03</span><strong>Implement</strong><small>RUNNING · bounded tools</small></article><article class="dev-stage"><span>04</span><strong>Test / QA / Re-test</strong><small>WAITING · independent roles</small></article><article class="dev-stage"><span>05</span><strong>Human Approval</strong><small>REQUIRED before progression</small></article><article class="dev-stage"><span>06</span><strong>Deploy Preparation</strong><small>PREPARATION ONLY</small></article><article class="dev-stage"><span>07</span><strong>Verify</strong><small>Evidence required</small></article><article class="dev-stage"><span>08</span><strong>Learn / Improvement Candidate</strong><small>Candidate only</small></article></section>`;
}
