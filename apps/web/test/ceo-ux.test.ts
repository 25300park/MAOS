import assert from "node:assert/strict";
import test from "node:test";
import { renderControlRoom } from "../src/control-room.js";
import { renderProjectRegistry, renderSystemRegistry } from "../src/registry-reads.js";

const identity = { actor_id: "synthetic-human", display_name: "Test user", role: "OPERATOR", permissions: ["PROJECT:READ", "SYSTEM:READ"] };
const render = (path: string) => renderControlRoom({ identity, path, system_registry: { state: "UNAVAILABLE" } });

test("CEO navigation describes existing read pages and keeps logout visible", () => {
  const html = render("/projects");
  for (const text of ["프로젝트", "연결 시스템", "요청 흐름 조회", "현재 사용자", "로그아웃"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("Search coming soon"));
  assert.ok(html.includes('id="maos-logout"'));
});

test("Systems places registry and state explanations before external consoles", () => {
  const html = render("/systems");
  assert.ok(html.indexOf('aria-label="Authorized system records"') < html.indexOf('aria-label="External system consoles"'));
  for (const text of ["UNKNOWN", "확인되지 않음", "NOT_AVAILABLE", "조회 정보 없음", "Not connected", "미연결"]) assert.ok(html.includes(text), text);
});

test("Project technical identifiers are in a collapsed details region", () => {
  const html = renderProjectRegistry({ state: "AVAILABLE", records: [{ id: "synthetic-project", scope: "project-test", environment: "STAGING", health: "UNKNOWN", repository: "registry://test", branch: "test", workroot: "test" }] });
  assert.match(html, /<details><summary>기술 상세<\/summary>[\s\S]*synthetic-project[\s\S]*registry:\/\/test[\s\S]*<\/details>/);
});

test("Routing explains read-only intent without changing request form", () => {
  const html = render("/systems/routing");
  assert.ok(html.includes("새 업무를 생성하거나 실행하지 않습니다"));
  assert.ok(html.includes('method="get" action="/systems/routing"'));
  assert.ok(html.includes("No MAOS-native execution fallback"));
});

test("Environment label uses runtime context rather than inventing Staging", () => {
  const previous = process.env.MAOS_ENV;
  try {
    process.env.MAOS_ENV = "staging";
    assert.ok(render("/projects").includes("현재 환경: Staging"));
    delete process.env.MAOS_ENV;
    assert.ok(render("/projects").includes("현재 환경: 환경 미확인"));
  } finally {
    if (previous === undefined) delete process.env.MAOS_ENV;
    else process.env.MAOS_ENV = previous;
  }
});

test("System identity remains escaped inside technical details with lifecycle visible", () => {
  const html = renderSystemRegistry({ state: "AVAILABLE", records: [{ id: "system-test", name: "Test", lifecycle: "ACTIVE", health: "UNKNOWN", owner: { id: "<owner>", type: "HUMAN" }, source_of_truth: "MAOS" }] });
  assert.ok(html.includes("<td>ACTIVE</td>"));
  assert.match(html, /<details><summary>기술 상세<\/summary>[\s\S]*system-test[\s\S]*&lt;owner&gt;[\s\S]*<\/details>/);
});
