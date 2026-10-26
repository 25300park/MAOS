import assert from "node:assert/strict";
import test from "node:test";
import { loadProjectRegistry, loadSystemRegistry, renderProjectRegistry, renderSystemRegistry } from "../src/registry-reads.js";

const project = { id: "b613e899-ba5e-4e9f-8c23-66ade19d2116", scope: "project-maos", environment: "STAGING", repository: "registry://25300park/MAOS", branch: "main", workroot: "workroot://maos/staging/runtime", health: "HEALTHY" };

test("project portal read displays only returned canonical identity/metadata without inventing name", async () => {
  const calls: string[] = [];
  const view = await loadProjectRegistry(async path => { calls.push(path); return Response.json({ ok: true, data: { project, credential_ref: "must-not-render" } }); });
  const html = renderProjectRegistry(view);
  assert.deepEqual(calls, ["/api/v1/phase14/portal"]);
  for (const value of Object.values(project)) assert.ok(html.includes(value));
  assert.ok(!html.includes("Atlas"));
  assert.ok(!html.includes("must-not-render"));
  assert.ok(html.includes("Name not provided"));
});

test("project reads fail closed for denied, empty, malformed, failed and transport responses", async () => {
  for (const [response, state] of [
    [new Response(null, { status: 403 }), "RESTRICTED"],
    [Response.json({ ok: true, data: { project: null } }), "EMPTY"],
    [Response.json({ ok: true, data: { project: { ...project, id: null } } }), "UNAVAILABLE"],
    [new Response(null, { status: 500 }), "UNAVAILABLE"],
  ] as const) {
    const view = await loadProjectRegistry(async () => response);
    assert.equal(view.state, state);
    assert.ok(!renderProjectRegistry(view).includes("Project Atlas"));
  }
  assert.equal((await loadProjectRegistry(async () => { throw Error("private error"); })).state, "UNAVAILABLE");
});

test("systems consume exact control plane read without manufacturing health or bindings", async () => {
  const system = { id: "maos", name: "MAOS", lifecycle: "ACTIVE", health: "UNKNOWN", owner: { id: "owner", type: "HUMAN" }, source_of_truth: "MAOS" };
  const view = await loadSystemRegistry(async path => {
    assert.equal(path, "/api/v1/control-plane");
    return Response.json({ ok: true, data: { entity: { systems: [system] } } });
  });
  const html = renderSystemRegistry(view);
  assert.ok(html.includes("UNKNOWN"));
  assert.ok(!html.includes("HEALTHY"));
  assert.ok(!html.includes("href="));
  assert.ok(html.includes("System records"));
});

test("systems denied/invalid responses show no sample fallback or fabricated records", async () => {
  for (const response of [new Response(null, { status: 403 }), Response.json({ ok: true, data: { entity: { systems: [{ id: "maos" }] } } })]) {
    const view = await loadSystemRegistry(async () => response);
    const html = renderSystemRegistry(view);
    assert.ok(!html.includes("RBS Homes"));
    assert.ok(!html.includes("HEALTHY"));
  }
  assert.equal((await loadSystemRegistry(async () => Response.json({ ok: true, data: { entity: { systems: [] } } }))).state, "EMPTY");
});

test("Registry rendering escapes returned text and never turns metadata into actions", async () => {
  const view = await loadProjectRegistry(async () => Response.json({ ok: true, data: {
    project: { ...project, name: '<script>alert("x")</script>' },
  } }));
  const html = renderProjectRegistry(view);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("href="));
});
