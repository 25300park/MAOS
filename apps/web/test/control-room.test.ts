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
    "DEVELOPMENT:READ",
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
  ]) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  assert.match(html, /Skip to main content/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /What needs attention/);
  assert.match(html, /Who owns it/);
  assert.match(html, /What happens next/);
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
    "codex/phase-1.14-system-development-workspace",
    "task-dev-114",
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
  assert.match(executor, /Task scope · task-dev-114/);
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

test("provides a governed Preview Workspace entry without preview automation", () => {
  const html = controlRoom.renderControlRoom({
    identity: operator,
    path: "/development/preview",
  });
  assert.match(html, /Preview Workspace/);
  assert.match(html, /Entry point only/);
  assert.match(html, /Phase 1\.16/);
  assert.doesNotMatch(html, /Auto-fix|Run visual inspector/);
});
