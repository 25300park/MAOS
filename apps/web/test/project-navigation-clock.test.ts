import assert from "node:assert/strict";
import test from "node:test";
import { renderControlRoom } from "../src/index.js";

const identity = {
  actor_id: "human-operator-1", display_name: "Operator", role: "OPERATOR",
  permissions: ["PROJECT:READ"],
};

test("Atlas link opens a distinct bounded preview with a projects return link", () => {
  const list = renderControlRoom({ identity, path: "/projects" });
  assert.match(list, /href="\/projects\/atlas"/);
  for (const path of ["revenue-ops", "market-signal"])
    assert.ok(!list.includes(`href="/projects/${path}"`));
  const detail = renderControlRoom({ identity, path: "/projects/atlas" });
  assert.match(detail, /<h1>Project Atlas<\/h1>/);
  assert.match(detail, /href="\/projects">Back to projects/);
  assert.match(detail, /Sample portfolio data/);
  assert.notEqual(detail, list);
  assert.equal(renderControlRoom({ identity, path: "/projects" }), list);
});

test("header uses current Seoul runtime time, including date rollover and refresh", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-23T15:42:00Z") });
  const html = renderControlRoom({ identity, path: "/projects" });
  assert.match(html, /Saturday, Oct 24/);
  assert.match(html, /Seoul · 00:42 KST/);
  assert.doesNotMatch(html, /Thursday, Sep 3|09:42 KST/);
  t.mock.timers.setTime(Date.parse("2026-10-23T15:43:00Z"));
  assert.match(renderControlRoom({ identity, path: "/projects/atlas" }), /Seoul · 00:43 KST/);
});

test("Atlas detail retains project authorization boundary", () => {
  const html = renderControlRoom({ identity: { ...identity, permissions: [] }, path: "/projects/atlas" });
  assert.doesNotMatch(html, /<h1>Project Atlas<\/h1>/);
});
