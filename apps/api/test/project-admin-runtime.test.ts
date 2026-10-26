import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, loadMigrations } from "@maos/database";
import type { AuthorityRule } from "@maos/module-governance";
import type { IdentityContext } from "@maos/module-identity";
import { createPostgresProjectAdminLookupRuntime, createProjectAdminLookupRuntime } from "../src/project-admin-runtime.js";

const org = "70000000-0000-4000-8000-000000000001";
const human = "70000000-0000-4000-8000-000000000002";
const identity: IdentityContext = { actor_id: human, actor_type: "HUMAN", roles: [{ id: "synthetic-session-assignment",
  name: "project-assignment", permissions: [{ action: "READ", resource: "PROJECT", risk: "R0",
    environment: "staging", scope: "project-maos", effect: "ALLOW" }] }] };
const allow: AuthorityRule = { id: "synthetic-rule", actor_id: human, actor_type: "HUMAN", action: "READ",
  resource: "PROJECT_REGISTRY", risk: "R0", environment: "staging", scope: `organization:${org}`, effect: "ALLOW",
  valid_from: "2020-01-01T00:00:00Z" };
const generic: AuthorityRule = { id: "synthetic-generic", action: "READ", resource: "PROJECT_REGISTRY",
  risk: "R0", environment: "staging", scope: `organization:${org}`, effect: "ALLOW",
  valid_from: "2020-01-01T00:00:00Z" };
const row = { project_id: "70000000-0000-4000-8000-000000000003", organization_id: org,
  department_id: "70000000-0000-4000-8000-000000000004", name: "Synthetic project", version: 1, archived_at: null };
const input = { organization_id: org, selector: { project_id: row.project_id } };
const context = { method: "GET", path: "/local-only/project-admin-lookup",
  correlation_id: "synthetic-correlation", mfa_required: false,
  request_id: "synthetic-request", trace_id: "synthetic-trace" };
function fixture(rules: AuthorityRule[] = [allow], principal: IdentityContext | null = identity) {
  let queries = 0;
  const runtime = createProjectAdminLookupRuntime({
    authenticate: async () => principal,
    authority: { read: async () => ({ humanId: human, organizationId: org, rules }) },
    projects: { findProjectsExact: async () => { queries++; return [row]; } },
    organizationId: org, environment: "staging", now: () => new Date("2026-10-23T00:00:00Z"),
  });
  return { runtime, queries: () => queries };
}
test("verified request-scoped entitlement invokes C1 without mutating session roles", async () => {
  const before = JSON.stringify(identity);
  const { runtime, queries } = fixture();
  const result = await runtime.lookup({}, context, input);
  assert.equal(result.status, 200);
  assert.equal(result.result.state, "FOUND");
  assert.equal(queries(), 1);
  assert.equal(JSON.stringify(identity), before);
});
test("unauthenticated is 401; membership/project assignment without entitlement is 403", async () => {
  assert.equal((await fixture([allow], null).runtime.lookup({}, context, input)).status, 401);
  const { runtime, queries } = fixture([]);
  assert.equal((await runtime.lookup({}, context, input)).status, 403);
  assert.equal(queries(), 0);
});
test("actor-unspecified ALLOW, wrong actor and wrong organization cannot authorize", async () => {
  for (const rule of [generic, { ...allow, actor_id: row.project_id }, { ...allow, scope: "organization:other" }]) {
    const { runtime, queries } = fixture([rule]);
    assert.equal((await runtime.lookup({}, context, input)).status, 403);
    assert.equal(queries(), 0);
  }
});
test("exact and actor-unspecified DENY and additional-approval override ALLOW", async () => {
  for (const rule of [{ ...allow, effect: "DENY" as const }, { ...generic, effect: "DENY" as const },
    { ...generic, effect: "REQUIRE_ADDITIONAL_APPROVAL" as const }]) {
    assert.equal((await fixture([allow, rule]).runtime.lookup({}, context, input)).status, 403);
  }
});
test("revoked, expired, future, malformed and wrong-environment authority fails closed", async () => {
  for (const rule of [{ ...allow, revoked_at: "2026-10-22T00:00:00Z" },
    { ...allow, valid_until: "2026-10-23T00:00:00Z" }, { ...allow, valid_from: "2027-01-01T00:00:00Z" },
    { ...allow, valid_from: "invalid" }, { ...allow, environment: "production" }]) {
    assert.equal((await fixture([rule]).runtime.lookup({}, context, input)).status, 403);
  }
});
test("authority is re-read each request and revocation is not cached", async () => {
  const rules = [allow];
  const { runtime } = fixture(rules);
  assert.equal((await runtime.lookup({}, context, input)).status, 200);
  rules.length = 0;
  assert.equal((await runtime.lookup({}, context, input)).status, 403);
});
test("cross-organization request is denied without Registry query", async () => {
  const { runtime, queries } = fixture();
  assert.equal((await runtime.lookup({}, context, { ...input, organization_id: row.project_id })).status, 403);
  assert.equal(queries(), 0);
});

test("C1 no-match, ambiguity and unavailable outcomes survive runtime composition", async () => {
  for (const [rows, expected] of [[[], "NOT_FOUND"], [[row, { ...row, project_id: human }], "AMBIGUOUS"]] as const) {
    const runtime = createProjectAdminLookupRuntime({ authenticate: async () => identity,
      authority: { read: async () => ({ humanId: human, organizationId: org, rules: [allow] }) },
      projects: { findProjectsExact: async () => rows }, organizationId: org, environment: "staging" });
    assert.deepEqual((await runtime.lookup({}, context, input)).result, { state: expected });
  }
  const runtime = createProjectAdminLookupRuntime({ authenticate: async () => identity,
    authority: { read: async () => { throw Error("safe fixture outage"); } },
    projects: { findProjectsExact: async () => { throw Error("must not query"); } }, organizationId: org, environment: "staging" });
  assert.deepEqual(await runtime.lookup({}, context, input), { status: 503, result: { state: "NOT_VERIFIED" } });
});

test("missing canonical identity and existing explicit permission DENY cannot be elevated", async () => {
  const missing = createProjectAdminLookupRuntime({ authenticate: async () => identity,
    authority: { read: async () => null }, projects: { findProjectsExact: async () => { throw Error("must not query"); } },
    organizationId: org, environment: "staging" });
  assert.equal((await missing.lookup({}, context, input)).status, 403);
  const denied = { ...identity, roles: [{ id: "deny", name: "existing-deny", permissions: [{
    action: "READ", resource: "PROJECT_REGISTRY", risk: "R0" as const, environment: "staging",
    scope: `organization:${org}`, effect: "DENY" as const,
  }] }] };
  const { runtime, queries } = fixture([allow], denied);
  assert.equal((await runtime.lookup({}, context, input)).status, 403);
  assert.equal(queries(), 0);
});

test("concrete Postgres composition resolves canonical authority and C1 with SELECT only", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await applyMigrations(db, (await loadMigrations(resolve("packages/database/migrations"))).filter(m => m.id < "0020"));
  await db.exec(`INSERT INTO core.organizations(id,name,slug) VALUES ('${org}','Synthetic','runtime-synthetic');
    INSERT INTO core.departments(id,organization_id,name) VALUES ('${row.department_id}','${org}','Development');
    INSERT INTO core.projects(id,organization_id,department_id,name) VALUES ('${row.project_id}','${org}','${row.department_id}','Synthetic project');
    INSERT INTO identity.humans(id,organization_id,display_name) VALUES ('${human}','${org}','Synthetic Human');
    INSERT INTO governance.authority_rules(actor_type,actor_id,action,effect,environment,resource,risk,scope,valid_from)
    VALUES ('HUMAN','${human}','READ','ALLOW','staging','PROJECT_REGISTRY','R0','organization:${org}','2020-01-01');`);
  const runtime = createPostgresProjectAdminLookupRuntime({ authenticate: async () => identity,
    database: { exec: async () => { throw Error("no business writes"); },
      query: async <T>(sql: string, params?: unknown[]) => {
        assert.match(sql.trimStart(), /^SELECT\b/);
        assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i);
        return db.query<T>(sql, params);
      } }, organizationId: org, environment: "staging", now: () => new Date("2026-10-23T00:00:00Z") });
  const found = await runtime.lookup({}, context, input);
  assert.equal(found.result.state, "FOUND");
  if (found.result.state === "FOUND") assert.deepEqual(found.result.project, row);
  await db.exec("UPDATE governance.authority_rules SET revoked_at='2026-10-22'");
  assert.equal((await runtime.lookup({}, context, input)).status, 403);
});
