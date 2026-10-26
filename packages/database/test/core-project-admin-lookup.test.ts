import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, loadMigrations } from "../src/index.js";
import { PostgresCoreBootstrapRepository } from "../src/core-bootstrap-repository.js";

const id = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1), department = id(2), project = id(3);
let db: PGlite;
let repository: PostgresCoreBootstrapRepository;
const queries: { sql: string; params?: unknown[] }[] = [];
test.before(async () => {
  db = new PGlite();
  const migrations = await loadMigrations(resolve("packages/database/migrations"));
  await applyMigrations(db, migrations.filter(m => m.id < "0013"));
  await db.exec(`
    INSERT INTO core.organizations(id,name,slug) VALUES ('${org}','Synthetic organization','lookup-test'),('${id(10)}','Other organization','lookup-other');
    INSERT INTO core.departments(id,organization_id,name) VALUES ('${department}','${org}','Development'),('${id(11)}','${id(10)}','Development');
    INSERT INTO core.projects(id,organization_id,department_id,name) VALUES
      ('${project}','${org}','${department}','Synthetic project'),
      ('${id(4)}','${org}','${department}','Second project'),
      ('${id(5)}','${org}','${department}','Third project'),
      ('${id(12)}','${id(10)}','${id(11)}','Hidden project');
    INSERT INTO integration.systems(id,name,system_type,source_of_truth,lifecycle,owner_actor_type,owner_actor_id)
      VALUES ('lookup-one','One','INTERNAL_PLATFORM','MAOS','ACTIVE','HUMAN','test-owner'),
             ('lookup-two','Two','INTERNAL_PLATFORM','MAOS','ACTIVE','HUMAN','test-owner');
    INSERT INTO operations.repositories(id,system_id,reference,default_branch) VALUES
      ('repo-one','lookup-one','registry://synthetic/unique','main'),
      ('repo-two','lookup-two','registry://synthetic/unique','main'),
      ('repo-shared','lookup-one','registry://synthetic/shared','main'),
      ('repo-shared-two','lookup-two','registry://synthetic/shared','main'),
      ('repo-hidden','lookup-one','registry://synthetic/hidden','main');
    INSERT INTO core.project_system_links(project_id,system_id,repository_id) VALUES
      ('${project}','lookup-one','repo-one'),('${project}','lookup-two','repo-two'),
      ('${id(4)}','lookup-one','repo-shared'),('${id(4)}','lookup-two','repo-shared-two'),
      ('${id(5)}','lookup-one','repo-one'),
      ('${id(12)}','lookup-one','repo-hidden');`);
  repository = new PostgresCoreBootstrapRepository({
    exec: async () => { throw Error("writer forbidden"); },
    query: async <T>(sql: string, params?: unknown[]) => {
      assert.match(sql.trimStart(), /^SELECT\b/);
      assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
      queries.push({ sql, ...(params ? { params } : {}) });
      return db.query<T>(sql, params);
    },
  });
});
test.after(async () => { await db?.close(); });

test("exact project UUID returns only the whitelisted Core record", async () => {
  const rows = await repository.findProjectsExact(org, { project_id: project });
  assert.deepEqual(rows, [{ project_id: project, organization_id: org, department_id: department,
    name: "Synthetic project", version: 1, archived_at: null }]);
});
test("department/name is an exact registration key, not fuzzy matching", async () => {
  assert.equal((await repository.findProjectsExact(org, { department_id: department, project_name: "Synthetic project" }))[0]?.project_id, project);
  assert.deepEqual(await repository.findProjectsExact(org, { department_id: department, project_name: "synthetic project" }), []);
});
test("repository lookup detects different projects rather than choosing one", async () => {
  const rows = await repository.findProjectsExact(org, { repository_reference: "registry://synthetic/unique" });
  assert.deepEqual(rows.map(p => p.project_id), [project, id(5)]);
});
test("duplicate repository links to the same project are deduplicated", async () => {
  const rows = await repository.findProjectsExact(org, { repository_reference: "registry://synthetic/shared" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.project_id, id(4));
});
test("cross-organization identity and repository lookups disclose no records", async () => {
  assert.deepEqual(await repository.findProjectsExact(org, { project_id: id(12) }), []);
  assert.deepEqual(await repository.findProjectsExact(org, { repository_reference: "registry://synthetic/hidden" }), []);
});
test("missing repository relationships and unknown UUID return scoped empty results", async () => {
  assert.deepEqual(await repository.findProjectsExact(org, { repository_reference: "registry://synthetic/missing" }), []);
  assert.deepEqual(await repository.findProjectsExact(org, { project_id: id(99) }), []);
});
test("selector values are bound parameters, never interpolated SQL", async () => {
  const value = "x' OR 1=1 --";
  assert.deepEqual(await repository.findProjectsExact(org, { department_id: department, project_name: value }), []);
  assert.equal(queries.at(-1)?.sql.includes(value), false);
  assert.deepEqual(queries.at(-1)?.params, [org, department, value]);
});
test("empty, mixed or malformed selectors cannot become enumeration", async () => {
  const count = queries.length;
  for (const selector of [{}, { project_id: project, repository_reference: "registry://synthetic/unique" },
    { department_id: department }, { project_id: "*" }, { repository_reference: "https://github.com/25300park/ai-mls.git" }]) {
    await assert.rejects(() => repository.findProjectsExact(org, selector as never));
  }
  await assert.rejects(() => repository.findProjectsExact("*", { project_id: project }));
  assert.equal(queries.length, count);
});
