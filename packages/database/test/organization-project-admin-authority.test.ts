import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, loadMigrations } from "../src/index.js";
import { PostgresOrganizationProjectAdminAuthorityRepository } from "../src/organization-project-admin-authority.js";

const org = "70000000-0000-4000-8000-000000000001";
const human = "70000000-0000-4000-8000-000000000002";
let db: PGlite;
let repository: PostgresOrganizationProjectAdminAuthorityRepository;
test.before(async () => {
  db = new PGlite();
  await applyMigrations(db, (await loadMigrations(resolve("packages/database/migrations"))).filter(m => m.id < "0020"));
  await db.exec(`INSERT INTO core.organizations(id,name,slug) VALUES ('${org}','Synthetic','synthetic-org');
    INSERT INTO identity.humans(id,organization_id,display_name) VALUES ('${human}','${org}','Synthetic Human');
    INSERT INTO governance.authority_rules(actor_type,actor_id,action,effect,environment,resource,risk,scope,valid_from)
    VALUES ('HUMAN','${human}','READ','ALLOW','staging','PROJECT_REGISTRY','R0','organization:${org}','2020-01-01'),
      (NULL,NULL,'READ','DENY','staging','PROJECT_REGISTRY','R0','organization:${org}','2020-01-01');`);
  repository = new PostgresOrganizationProjectAdminAuthorityRepository({
    exec: async () => { throw Error("no writes"); },
    query: async <T>(sql: string, params?: unknown[]) => {
      assert.match(sql.trimStart(), /^SELECT\b/);
      assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i);
      return db.query<T>(sql, params);
    },
  });
});
test.after(async () => { await db?.close(); });
test("canonical Human organization and scoped rules are read with no mutations", async () => {
  const result = await repository.read(human, org);
  assert.equal(result?.humanId, human);
  assert.equal(result?.organizationId, org);
  assert.equal(result?.rules.length, 2);
  assert.ok(result?.rules.some(r => r.actor_id === human && r.effect === "ALLOW"));
  assert.ok(result?.rules.some(r => r.actor_id === undefined && r.effect === "DENY"));
});
test("cross-organization identity and unknown Human return no trusted membership", async () => {
  assert.equal(await repository.read(human, "70000000-0000-4000-8000-000000000009"), null);
  assert.equal(await repository.read("70000000-0000-4000-8000-000000000009", org), null);
});
test("archived organization and Human cannot retain admin authority", async () => {
  await db.exec(`UPDATE core.organizations SET archived_at=CURRENT_TIMESTAMP WHERE id='${org}'`);
  assert.equal(await repository.read(human, org), null);
  await db.exec(`UPDATE core.organizations SET archived_at=NULL; UPDATE identity.humans SET archived_at=CURRENT_TIMESTAMP`);
  assert.equal(await repository.read(human, org), null);
});
