import assert from "node:assert/strict";
import test from "node:test";
import { renderControlRoom } from "../src/control-room.js";

const identity = { actor_id: "fixture", display_name: "CEO", role: "READER", permissions: ["PROJECT:READ", "SYSTEM:READ"] };
const project_registry = { state: "AVAILABLE" as const, records: [{ id: "fixture-project", name: "Example project", scope: "project-test", environment: "STAGING", health: "HEALTHY", repository: "registry://fixture", branch: "test", workroot: "fixture" }] };
const system_registry = { state: "AVAILABLE" as const, records: [{ id: "fixture-system", name: "Example system", lifecycle: "ACTIVE", health: "UNKNOWN", owner: { id: "fixture-owner", type: "HUMAN" }, source_of_truth: "MAOS" }] };
test("dashboard summarizes only returned registry records on the existing login landing page", () => {
  const html = renderControlRoom({identity,path:"/projects",project_registry,system_registry});
  assert.ok(html.includes('aria-label="CEO 운영 현황"'));
  assert.ok(html.includes('data-metric="projects">1</strong>'));
  assert.ok(html.includes('data-metric="systems">1</strong>'));
  assert.ok(html.includes('data-metric="unknown-systems">1</strong>'));
  assert.ok(html.includes('AIDOS: Not connected'));
  assert.ok(html.includes('회사 전체 건수가 아닙니다'));
});
test("unavailable or restricted reads never become zero or healthy", () => {
  for(const state of ["UNAVAILABLE","RESTRICTED"] as const) {
    const html=renderControlRoom({identity,path:"/projects",project_registry:{state},system_registry:{state}});
    assert.ok(html.includes('data-metric="projects">NOT_AVAILABLE</strong>'));
    assert.ok(html.includes('data-metric="systems">NOT_AVAILABLE</strong>'));
    assert.ok(!html.includes('data-metric="systems">0</strong>'));
  }
});
test("dashboard hides system data and quick links without SYSTEM READ", () => {
  const html=renderControlRoom({identity:{...identity,permissions:["PROJECT:READ"]},path:"/projects",project_registry,system_registry});
  const dashboard=html.split('aria-label="CEO 운영 현황"')[1]?.split('</section>')[0] ?? '';
  assert.ok(dashboard);
  assert.ok(!dashboard.includes('data-metric="systems"'));
  assert.ok(!dashboard.includes('href="/systems'));
});
