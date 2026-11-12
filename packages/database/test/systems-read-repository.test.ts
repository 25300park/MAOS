import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, loadMigrations } from "../src/index.js";
import { PostgresSystemsReadRepository } from "../src/systems-read-repository.js";

test("durable systems projection is bounded to active Human/project/organization/environment", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  // Baseline 0042 expects this role; disposable fixture only, matching its existing setup tests.
  await db.exec("CREATE ROLE maos_staging_runtime");
  await applyMigrations(
    db,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  const id = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  for (const n of [1, 2]) {
    await db.query(
      "INSERT INTO core.organizations(id,name,slug) VALUES($1,$2,$2)",
      [id(n), `fixture-${n}`],
    );
    await db.query(
      "INSERT INTO core.departments(id,organization_id,name) VALUES($1,$2,$3)",
      [id(n + 10), id(n), "Fixture"],
    );
    await db.query(
      "INSERT INTO core.projects(id,organization_id,department_id,name) VALUES($1,$2,$3,$4)",
      [id(n + 20), id(n), id(n + 10), "Fixture"],
    );
    await db.query(
      "INSERT INTO identity.humans(id,organization_id,display_name) VALUES($1,$2,$3)",
      [id(n + 30), id(n), "Fixture"],
    );
    await db.query(
      "INSERT INTO identity.human_project_assignments(id,human_id,organization_id,project_id,scope) VALUES($1,$2,$3,$4,'project-maos')",
      [id(n + 40), id(n + 30), id(n), id(n + 20)],
    );
    await db.query(
      "INSERT INTO identity.assignment_permissions(assignment_id,action,resource,environment,risk,effect) VALUES($1,'READ','SYSTEM','staging','R0','ALLOW')",
      [id(n + 40)],
    );
    await db.query(
      "INSERT INTO integration.systems(id,name,system_type,source_of_truth,lifecycle,owner_actor_type,owner_actor_id) VALUES($1,'Fixture','INTERNAL_PLATFORM','MAOS','ACTIVE','HUMAN','fixture-owner')",
      [`fixture-${n}`],
    );
    await db.query(
      "INSERT INTO operations.repositories(id,system_id,reference,default_branch) VALUES($1,$2,$3,'main')",
      [`repo-${n}`, `fixture-${n}`, `registry://fixture/${n}`],
    );
    await db.query(
      "INSERT INTO core.project_system_links(project_id,system_id,repository_id) VALUES($1,$2,$3)",
      [id(n + 20), `fixture-${n}`, `repo-${n}`],
    );
    await db.query(
      "INSERT INTO operations.system_environments(id,system_id,name,health,configuration_reference,credential_reference) VALUES($1,$2,'STAGING','HEALTHY','configref://fixture','secretref://fixture')",
      [`env-${n}`, `fixture-${n}`],
    );
  }
  const repo = new PostgresSystemsReadRepository(db);
  const input = {
    actorId: id(31),
    projectId: id(21),
    scope: "project-maos",
    environment: "staging" as const,
  };
  await t.test(
    "only bound system and safe projection; health not inferred",
    async () => {
      const rows = await repo.list(input);
      assert.equal(rows.length, 1);
      assert.ok(rows[0]);
      assert.equal(rows[0].id, "fixture-1");
      assert.equal(rows[0].health, "UNKNOWN");
      assert.deepEqual(Object.keys(rows[0]).sort(), [
        "health",
        "id",
        "lifecycle",
        "name",
        "owner",
        "source_of_truth",
      ]);
    },
  );
  await t.test(
    "cross tenant/project and unknown actor/scope excluded",
    async () => {
      for (const change of [
        { actorId: id(32) },
        { projectId: id(22) },
        { actorId: id(99) },
        { scope: "other" },
      ])
        assert.deepEqual(await repo.list({ ...input, ...change }), []);
    },
  );
  for (const [name, sql] of [
    [
      "revoked assignment",
      `UPDATE identity.human_project_assignments SET revoked_at=CURRENT_TIMESTAMP WHERE id='${id(41)}'`,
    ],
    [
      "archived Human",
      `UPDATE identity.humans SET archived_at=CURRENT_TIMESTAMP WHERE id='${id(31)}'`,
    ],
    [
      "archived organization",
      `UPDATE core.organizations SET archived_at=CURRENT_TIMESTAMP WHERE id='${id(1)}'`,
    ],
    [
      "archived project",
      `UPDATE core.projects SET archived_at=CURRENT_TIMESTAMP WHERE id='${id(21)}'`,
    ],
    [
      "archived system",
      "UPDATE integration.systems SET archived_at=CURRENT_TIMESTAMP WHERE id='fixture-1'",
    ],
    [
      "missing link",
      `DELETE FROM core.project_system_links WHERE project_id='${id(21)}'`,
    ],
    [
      "wrong environment",
      "UPDATE operations.system_environments SET name='PRODUCTION' WHERE id='env-1'",
    ],
    [
      "no permission",
      `DELETE FROM identity.assignment_permissions WHERE assignment_id='${id(41)}'`,
    ],
    [
      "explicit deny",
      `INSERT INTO identity.assignment_permissions(assignment_id,action,resource,environment,risk,effect) VALUES('${id(41)}','READ','SYSTEM','staging','R0','DENY')`,
    ],
  ] as const)
    await t.test(name, async () => {
      await db.exec("BEGIN");
      try {
        await db.exec(sql);
        assert.deepEqual(await repo.list(input), []);
      } finally {
        await db.exec("ROLLBACK");
      }
    });
});
