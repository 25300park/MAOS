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
      ? `<div class="workspace-actions" aria-label="Governed development actions">${canExecute ? '<button class="btn btn-primary" type="button" data-capability="RUN_COMMAND" disabled>Request test run</button>' : ""}${canCancel ? '<button class="btn" type="button" data-action="LOCAL_EXECUTION:CANCEL" disabled>Cancel run</button>' : ""}<span>Task scope · task-dev-114 · authenticated API session required</span></div>`
      : '<p class="permission-note">Read-only workspace access · execution actions require exact Local Execution permission.</p>';

  return `<div class="page-heading development-heading"><div><div class="eyebrow">Governed build surface</div><h1>System Development Workspace</h1><p>Build context for one authorized change—task, agent, repository state, quality evidence, approval, and next action in one place.</p></div><a class="btn" href="/development/preview" style="display:inline-flex;align-items:center;text-decoration:none">Open Preview Workspace →</a></div>
  <section class="dev-context" aria-label="Development context"><div><span>PROJECT</span><strong>MAOS Core</strong></div><div><span>REPOSITORY</span><strong>D:\\10. MAOS</strong></div><div><span>BRANCH</span><strong>codex/phase-1.14-system-development-workspace</strong></div><div><span>Approved workroot</span><strong>Verified · task scoped</strong></div></section>
  <section class="panel dev-hero"><div><div class="eyebrow">task-dev-114 · DEVELOPMENT</div><h2>Implement System Development Workspace</h2><p>Give operators clear visibility into development ownership, changed files, verification evidence, blockers, approval, and the next safe action.</p></div><div class="dev-hero-meta">${badge("IN PROGRESS", "working")}<span><strong>Owner</strong> · Development Lead</span><span><strong>Assigned agent</strong> · Frontend Agent</span><span><strong>Next action</strong> · complete component tests</span></div></section>
  <section class="dev-stage-grid" aria-label="Development lifecycle"><article class="dev-stage complete"><span>01</span><strong>Requirement</strong><small>COMPLETE · evidence linked</small></article><article class="dev-stage complete"><span>02</span><strong>Plan</strong><small>COMPLETE · reviewed</small></article><article class="dev-stage active"><span>03</span><strong>Implementation</strong><small>IN PROGRESS · Frontend Agent</small></article><article class="dev-stage"><span>04</span><strong>Automated test</strong><small>QUEUED · governed runner</small></article><article class="dev-stage"><span>05</span><strong>QA review</strong><small>WAITING · human gate</small></article></section>
  <div class="dev-work-grid"><div class="stack"><section class="panel"><div class="panel-head"><h2>Changed files</h2><div class="utility-row">${badge("3 CHANGED", "working")}<span class="permission-note">GIT_STATUS · GIT_DIFF</span></div></div><div class="file-list" role="list"><div role="listitem"><span class="file-state modified">M</span><code>apps/web/src/control-room.ts</code><span>+42 −8</span></div><div role="listitem"><span class="file-state added">A</span><code>apps/web/src/development-workspace.ts</code><span>+218</span></div><div role="listitem"><span class="file-state modified">M</span><code>apps/web/src/styles.ts</code><span>+31</span></div></div><div class="repository-boundary"><strong>Governed repository snapshot</strong><span>READ_FILE, GIT_STATUS, and GIT_DIFF use registered local-runner capabilities inside the approved workroot.</span></div></section>
  <section class="panel"><div class="panel-head"><h2>Quality & evidence</h2><span class="permission-note">QA PASS ≠ Production Approval</span></div><div class="quality-grid"><article><span class="quality-icon pass">✓</span><div><strong>Tests</strong><p>113 passed · evidence-test-114</p></div>${badge("PASS", "healthy")}</article><article><span class="quality-icon pass">✓</span><div><strong>Build</strong><p>17 workspaces · artifact-build-114</p></div>${badge("PASS", "healthy")}</article><article><span class="quality-icon wait">◆</span><div><strong>Human approval</strong><p>Not requested · implementation incomplete</p></div>${badge("NOT READY", "waiting")}</article></div></section></div>
  <aside class="stack"><section class="panel"><div class="panel-head"><h2>Run & local runner</h2>${badge("RUNNING", "running")}</div><div class="panel-body"><dl class="fact-grid"><div class="fact"><dt>Run</dt><dd><a href="/runs/run-dev-114">run-dev-114</a></dd></div><div class="fact"><dt>Current step</dt><dd>Component implementation</dd></div><div class="fact"><dt>Runner</dt><dd>local-runner-1</dd></div><div class="fact"><dt>Health</dt><dd>${badge("HEALTHY", "healthy")}</dd></div></dl><p class="permission-note">Runner identity and health do not grant authority.</p>${actions}</div></section><section class="panel"><div class="panel-head"><h2>What is blocked</h2>${badge("CLEAR", "healthy")}</div><div class="panel-body"><p><strong>No active dependency blocker.</strong></p><p class="permission-note">Approval remains unavailable until implementation, tests, QA, and evidence are complete.</p><a href="/approvals" class="panel-link">Open Approval Center →</a></div></section><section class="panel"><div class="panel-head"><h2>Recent evidence</h2></div><div class="panel-body timeline"><article class="activity"><time>10:14 · Test</time><strong>Focused component suite passed</strong><p>evidence-test-114 · checksum recorded</p></article><article class="activity"><time>10:09 · Repository</time><strong>Scoped diff captured</strong><p>GIT_DIFF · 3 files · workroot verified</p></article><article class="activity"><time>09:58 · Human</time><strong>Implementation plan accepted</strong><p>Reviewer · Development Lead</p></article></div></section></aside></div>`;
}
