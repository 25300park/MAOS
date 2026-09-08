import assert from "node:assert/strict";
import test from "node:test";
import {
  renderControlRoom,
  type ControlRoomIdentity,
  type OperationsView,
} from "../src/control-room.js";

const identity: ControlRoomIdentity = {
  actor_id: "human-operator",
  display_name: "Operations Lead",
  permissions: ["TODAY:READ", "OPERATIONS:READ"],
  role: "OPERATOR",
};

const operations: OperationsView = {
  active_incidents: 1,
  alerts: [
    {
      affected_system: "ai-memory-gateway",
      owner_reference: "role:knowledge-operations",
      severity: "CRITICAL",
      state: "OPEN",
    },
  ],
  backup: {
    last_verified_at: "2026-09-09T03:55:00Z",
    status: "RESTORE_ELIGIBLE",
  },
  degraded_systems: ["ai-memory-gateway"],
  dr: { classification: "SIMULATED", status: "EXERCISED_SIMULATED" },
  emergency_stops: 0,
  next_actions: ["Acknowledge gateway incident", "Follow recovery runbook"],
  overall_health: "DEGRADED",
  production_deployment_approved: false,
  production_gaps_open: 10,
  recovery_state: "MITIGATING",
  security_warnings: 1,
};

test("renders permission-aware operational health, incidents, recovery, and production gaps", () => {
  const html = renderControlRoom({ identity, operations, path: "/operations" });
  assert.match(html, /Operations/);
  assert.match(html, /DEGRADED/);
  assert.match(html, /Active incidents/);
  assert.match(html, /SIMULATED/);
  assert.match(html, /Production deployment[^]*NOT APPROVED/);
  assert.match(html, /Production gaps[^]*10/);
  assert.match(html, /Acknowledge gateway incident/);
});

test("hides operations navigation and content without operations permission", () => {
  const html = renderControlRoom({
    identity: { ...identity, permissions: ["TODAY:READ"] },
    operations,
    path: "/today",
  });
  assert.doesNotMatch(html, /href="\/operations"/);
});

test("renders an accessible empty operations state without sensitive payloads", () => {
  const html = renderControlRoom({ identity, path: "/operations" });
  assert.match(html, /No operations snapshot yet/);
  assert.match(html, /<h1>Operations<\/h1>/);
  assert.doesNotMatch(html, /password|private_journal|credential value/i);
});
