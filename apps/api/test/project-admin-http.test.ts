import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { IdentityContext } from "@maos/module-identity";
import type { AuthorityRule } from "@maos/module-governance";
import { createApiServer } from "../src/app.js";
import { createProjectAdminLookupRuntime } from "../src/project-admin-runtime.js";
import { createProjectAdminHttpComposition } from "../src/project-admin-http.js";

const org = "70000000-0000-4000-8000-000000000001";
const human = "70000000-0000-4000-8000-000000000002";
const project = "70000000-0000-4000-8000-000000000003";
const identity: IdentityContext = { actor_id: human, actor_type: "HUMAN", roles: [] };
const allow: AuthorityRule = { id: "synthetic-allow", actor_id: human, actor_type: "HUMAN", action: "READ",
  resource: "PROJECT_REGISTRY", risk: "R0", environment: "staging", scope: `organization:${org}`, effect: "ALLOW" };
const row = { project_id: project, organization_id: org, department_id: "70000000-0000-4000-8000-000000000004",
  name: "Synthetic project", version: 1, archived_at: null };
async function fixture(t: test.TestContext, environment = "staging") {
  let authCalls = 0, lookupCalls = 0, authorityCalls = 0;
  const state = { rules: [allow], rows: [row], unavailable: false, principal: identity };
  const runtime = createProjectAdminLookupRuntime({ authenticate: async () => { throw Error("duplicate authentication"); },
    authority: { read: async () => { authorityCalls++; if (state.unavailable) throw Error("sensitive internal diagnostic");
      return { humanId: human, organizationId: org, rules: state.rules }; } },
    projects: { findProjectsExact: async () => { lookupCalls++; return state.rows; } },
    organizationId: org, environment: "staging" });
  const composition = createProjectAdminHttpComposition({ runtime, environment, organizationId: org,
    authenticate: async headers => { authCalls++; return headers["x-synthetic-auth"] === "yes" ? state.principal : null; } });
  const server = createApiServer({ environment: "staging", service: "api", authenticate: composition.authenticate,
    routes: composition.routes });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { state, counts: () => ({ authCalls, lookupCalls, authorityCalls }),
    read: (query: string, authenticated = true, organization = org) => fetch(`${base}/api/v1/organizations/${organization}/projects/lookup${query}`,
      { headers: authenticated ? { "x-synthetic-auth": "yes" } : {} }) };
}
test("HTTP exact lookup uses canonical authentication once and detached authority", async t => {
  const before = JSON.stringify(identity);
  const f = await fixture(t);
  const response = await f.read(`?project_id=${project}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.state, "FOUND");
  assert.deepEqual(f.counts(), { authCalls: 1, authorityCalls: 1, lookupCalls: 1 });
  assert.equal(JSON.stringify(identity), before);
});
test("HTTP 401 and 403 do not query Registry or disclose records", async t => {
  const f = await fixture(t);
  assert.equal((await f.read(`?project_id=${project}`, false)).status, 401);
  f.state.rules = [];
  assert.equal((await f.read(`?project_id=${project}`)).status, 403);
  assert.equal(f.counts().lookupCalls, 0);
});
test("HTTP explicit DENY and cross-org requests stay restricted", async t => {
  const f = await fixture(t);
  f.state.rules = [allow, { ...allow, effect: "DENY" }];
  assert.equal((await f.read(`?project_id=${project}`)).status, 403);
  assert.equal((await f.read(`?project_id=${project}`, true, project)).status, 403);
  assert.equal(f.counts().lookupCalls, 0);
});
test("selector-free, combined, unknown and duplicate selectors cannot enumerate", async t => {
  const f = await fixture(t);
  for (const query of ["", `?project_id=${project}&repository_reference=registry://synthetic/repo`,
    `?project_id=${project}&project_id=${project}`, "?department_id=invalid", "?all=true", "?repository_reference=https://github.com/25300park/ai-mls.git"]) {
    assert.equal((await f.read(query)).status, 422);
  }
  assert.equal(f.counts().lookupCalls, 0);
});
test("all three exact selector variants reach C1", async t => {
  const f = await fixture(t);
  for (const query of [`?project_id=${project}`, "?repository_reference=registry://synthetic/repo",
    `?department_id=${row.department_id}&project_name=Synthetic%20project`]) {
    assert.equal((await f.read(query)).status, 200);
  }
  assert.equal(f.counts().authCalls, 3);
  assert.equal(f.counts().lookupCalls, 3);
});
test("NOT_FOUND and AMBIGUOUS remain explicit outcomes without invented records", async t => {
  const f = await fixture(t);
  f.state.rows = [];
  const missing = await f.read(`?project_id=${project}`);
  assert.equal((await missing.json()).data.state, "NOT_FOUND");
  f.state.rows = [row, { ...row, project_id: human }];
  const ambiguous = await f.read("?repository_reference=registry://synthetic/repo");
  assert.equal((await ambiguous.json()).data.state, "AMBIGUOUS");
});
test("unavailable authority maps to sanitized 503", async t => {
  const f = await fixture(t);
  f.state.unavailable = true;
  const response = await f.read(`?project_id=${project}`);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /sensitive|stack|diagnostic/);
  assert.equal(f.counts().lookupCalls, 0);
});
test("Production composition registers no lookup route", async t => {
  const f = await fixture(t, "production");
  assert.equal((await f.read(`?project_id=${project}`)).status, 404);
});

test("authentication for Bootstrap and Portal remains unchanged outside exact lookup path", async () => {
  let calls = 0;
  const runtime = createProjectAdminLookupRuntime({ authenticate: async () => { throw Error("must not authenticate twice"); },
    authority: { read: async () => { throw Error("must not resolve admin authority"); } },
    projects: { findProjectsExact: async () => { throw Error("must not read Registry"); } },
    organizationId: org, environment: "staging" });
  const composition = createProjectAdminHttpComposition({ environment: "staging", organizationId: org, runtime,
    authenticate: async () => { calls++; return identity; } });
  for (const [method, path] of [["POST", "/api/v1/core/bootstrap"], ["GET", "/api/v1/phase14/portal"]]) {
    assert.equal(await composition.authenticate({}, { method: method!, path: path!, correlation_id: "synthetic",
      request_id: "synthetic", trace_id: "synthetic", mfa_required: false }), identity);
  }
  assert.equal(calls, 2);
});
