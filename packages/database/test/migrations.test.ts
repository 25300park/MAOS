import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, loadMigrations } from "../src/index.js";

const canonicalChecksums = Object.freeze({
  "0001_canonical_schemas":
    "f828f328c79585f639257e0df2a16d765ea22d2953be89dadc6d224561c8e161",
  "0002_core_foundation":
    "b05ba045aac3ba221bcb2beb42f310746114ea05ddb434acca10581cbdd2b4af",
  "0003_approval_authority_foundation":
    "f9126cd067cda9778a8613643ebb74ba54e432e9439a62c148816fd0933c8bde",
  "0004_project_task_workflow_foundation":
    "db3deb25eb6507b906564b0da1bbcf34fd1fe8ccc138f3fc0e0e6e65eb4d50f6",
  "0005_agent_model_runner_foundation":
    "c446a667b4c92267a5e7df21defeefc339e734a630857d9e83fd872740ae6212",
  "0006_skill_tool_mcp_foundation":
    "80d7e13627284c72dd5bbe9623d043397b24883d9ac032030e4fdce1ba05d490",
  "0007_local_execution_bridge_foundation":
    "7419c95e9e43d2c3cf2e968a5b372e4c6449d46efeeda442e9c26dc7f07b6914",
  "0008_ai_memory_gateway_integration":
    "045ef95e8f764dd21772027b7576f353869bf78aa26d408f9505987867dc0dc7",
  "0009_observability_audit_foundation":
    "cd82134ac5d9dd2baf7e32d4a3f31a011246e97879507041592e705ad8be6f26",
  "0010_release_deployment_foundation":
    "0d45fccafbade12af3577cf65fd07f5de8abfac9a4de2aa23b747a38e58bd2e5",
  "0011_rbs_admin_pilot_foundation":
    "7a95ba6fb0d9a9d7b1351abaa79d1fd783cad7f7a9458c6f03d36d0adeb78263",
  "0012_core_control_plane_generalization":
    "209623028eeac72110436e911e313f37bee2432d8819223016272ae28eb843e0",
  "0013_ai_memory_knowledge_integration":
    "401d68b5e39277ec242340d2bbd4be91b46d647d74c91fdb3056a27fd68b9e0b",
  "0014_marketing_automation_integration":
    "ba3efc8810239e76e99e157e2e99c7cbf9e845457e9ed8e59ba4eb4c960e2726",
  "0015_ai_mls_integration":
    "3df2721945d6ac41ad303fe211b019d026cb6e97d94450f1dfb87b6aee04f9d1",
  "0016_crm_human_work_integration":
    "6e9070b6c2d40106664a360e69a195bda350a9b028a8abfee291b38113566e75",
  "0017_optimization_learning_foundation":
    "c4171e152d0d70542e3a2750b25b057c5b4519e596063527a03c9146a41bd466",
  "0018_alert_email_delivery":
    "8a9212accac15dec523a77d57fee6f60fcca4c36c23687e5beecf8a1b4dd8654",
  "0019_staging_session_ingress":
    "f2a8c8cd5abd48bae8f0ce51676b8b01f234ed520f66429393d2fc5070ae9626",
  "0020_phase14_runtime_foundation":
    "c982e3d6bdc60833b1ef2feaf63ea5f2b6331ab961a81ec32262b2e48bbd3232",
  "0021_command_clarification_receipts":
    "a9f95a4d107415f585377654bddd05564aba38644b14929ffd7594f862146b81",
  "0022_phase14_routing_policy_versions":
    "895148f540dbffd7e0f9b6dfb548fe19d0349352ac20ce157505e026c20b0016",
  "0023_human_approval_runtime":
    "9c785c331077b8a8a373fe5812bea070d57a61ec005ed3f6f23baf05def26666",
  "0024_executor_routing_policy":
    "1bd5deec64aedabc70cc5a2f0221fe2ebdc74637879e92907c68ab11327b91f8",
  "0025_verification_runtime":
    "72c0601cb54332001d77a9000c74a1aa166976392d75f33ce0f156748bcfd9e2",
  "0026_phase14_evidence_audit_runtime":
    "e2eb6a0b68ca969abe9508259bf5968a54a3a7adac9de4511acda6654882fac4",
  "0027_phase14l_canonical_alignment":
    "524fa4eba6e78f97e6f987bf3e8b3e92e2965bae4450f5559577866984a7be42",
  "0028_phase14m_security_kill_switch":
    "37d4ef844494762dae816e727b712325a7ae8bbb85b3dcf6bc3fe7a5da829e50",
  "0029_phase15b_ai_provider_model_capability_registry":
    "916c4cb600bdb36e41d93192374186e9364ad643d9fb1efbd839cecd68b82ad7",
  "0030_phase15b_r0_durable_assignment_authority":
    "f1445748f0b55731013711c6606a78d275f8f70e02114306ce33b19144e39e1d",
  "0031_phase15c_classification_domain_routing":
    "bf20bb6aed84323ed4b37eb0ec19e488d8ffc99f0d88c957e30dd32f23258ee1",
  "0032_phase15d_multi_ai_role_model_routing":
    "ec3b2b8217c89158c2003e717969e28099717d2e47162b7ae19031b5ad004b4a",
});

async function temporaryMigrations(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "maos-migrations-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  return directory;
}

test("canonicalizes LF, CRLF, and lone CR to one checksum and SQL representation", async (t) => {
  const directory = await temporaryMigrations(t);
  const file = join(directory, "0001_line_endings.sql");
  const variants = [
    "SELECT 1;\nSELECT 2;\n",
    "SELECT 1;\r\nSELECT 2;\r\n",
    "SELECT 1;\rSELECT 2;\r",
  ];
  const expectedSql = "SELECT 1;\nSELECT 2;\n";
  const expectedChecksum = createHash("sha256")
    .update(expectedSql)
    .digest("hex");

  for (const variant of variants) {
    await writeFile(file, variant, "utf8");
    const [migration] = await loadMigrations(directory);
    assert.equal(migration?.sql, expectedSql);
    assert.equal(migration?.checksum, expectedChecksum);
    assert.equal(await readFile(file, "utf8"), variant);
  }
});

test("changes the checksum for content drift while preserving strict replay semantics", async (t) => {
  const directory = await temporaryMigrations(t);
  const file = join(directory, "0001_content.sql");
  await writeFile(file, "SELECT 1;\r\n", "utf8");
  const [original] = await loadMigrations(directory);
  await writeFile(file, "SELECT 2;\n", "utf8");
  const [changed] = await loadMigrations(directory);

  assert.notEqual(original?.checksum, changed?.checksum);
});

test("keeps canonical LF checksums stable for migrations 0001 through 0029", async () => {
  const migrations = await loadMigrations("packages/database/migrations");
  assert.deepEqual(
    Object.fromEntries(
      migrations
        .filter(
          ({ id }) =>
            id <= "0029_phase15b_ai_provider_model_capability_registry",
        )
        .map(({ checksum, id }) => [id, checksum]),
    ),
    Object.fromEntries(
      Object.entries(canonicalChecksums).filter(
        ([id]) => id <= "0029_phase15b_ai_provider_model_capability_registry",
      ),
    ),
  );
});

test("phase 14L alignment permits canonical R1 command authority without weakening the risk vocabulary", async () => {
  const migrations = await loadMigrations("packages/database/migrations");
  const migration = migrations.find(
    ({ id }) => id === "0027_phase14l_canonical_alignment",
  );
  assert.ok(migration);
  assert.match(
    migration.sql,
    /assignment_permissions_risk_check[\s\S]*risk IN \('R1', 'R2'\)/,
  );
  assert.match(
    migration.sql,
    /approval_requirement[\s\S]*'REQUIRED'[\s\S]*'NOT_REQUIRED'/,
  );
});

test("phase 14L assignment permissions accept R1 and preserve R2 while rejecting R0", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const migrations = await loadMigrations("packages/database/migrations");
  const phase14lBoundary = migrations.findIndex(
    ({ id }) => id === "0027_phase14l_canonical_alignment",
  );
  assert.notEqual(phase14lBoundary, -1);
  await applyMigrations(database, migrations.slice(0, phase14lBoundary + 1));
  await database.exec(`
    INSERT INTO core.organizations (id,name,slug) VALUES ('00000000-0000-4000-8000-000000002701','Phase14L Org','phase14l-org');
    INSERT INTO core.departments (id,organization_id,name) VALUES ('00000000-0000-4000-8000-000000002702','00000000-0000-4000-8000-000000002701','Development');
    INSERT INTO core.projects (id,organization_id,department_id,name) VALUES ('00000000-0000-4000-8000-000000002703','00000000-0000-4000-8000-000000002701','00000000-0000-4000-8000-000000002702','Phase14L');
    INSERT INTO identity.humans (id,organization_id,display_name) VALUES ('00000000-0000-4000-8000-000000002704','00000000-0000-4000-8000-000000002701','Pilot Owner');
    INSERT INTO identity.human_project_assignments (id,human_id,organization_id,project_id,scope) VALUES ('00000000-0000-4000-8000-000000002705','00000000-0000-4000-8000-000000002704','00000000-0000-4000-8000-000000002701','00000000-0000-4000-8000-000000002703','project-maos');
    INSERT INTO identity.assignment_permissions (assignment_id,action,resource,environment,risk,effect) VALUES
      ('00000000-0000-4000-8000-000000002705','CREATE','COMMAND','staging','R1','ALLOW'),
      ('00000000-0000-4000-8000-000000002705','CREATE','SESSION','staging','R2','ALLOW');
  `);
  await assert.rejects(
    database.exec(
      `INSERT INTO identity.assignment_permissions (assignment_id,action,resource,environment,risk,effect) VALUES ('00000000-0000-4000-8000-000000002705','CREATE','COMMAND','staging','R0','ALLOW')`,
    ),
    /assignment_permissions_risk_check/,
  );
});

test("phase 15B R0 assignment migration expands only the durable risk vocabulary", async (t) => {
  const migrations = await loadMigrations("packages/database/migrations");
  const migrationIndex = migrations.findIndex(
    ({ id }) => id === "0030_phase15b_r0_durable_assignment_authority",
  );
  assert.equal(
    migrations[migrationIndex - 1]?.id,
    "0029_phase15b_ai_provider_model_capability_registry",
  );
  const migration = migrations[migrationIndex];
  assert.ok(migration);
  assert.match(
    migration.sql,
    /DROP CONSTRAINT assignment_permissions_risk_check;[\s\S]*ADD CONSTRAINT assignment_permissions_risk_check[\s\S]*CHECK \(risk IN \('R0', 'R1', 'R2'\)\);/,
  );
  assert.doesNotMatch(migration.sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);

  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(database, migrations);
  await database.exec(`
    INSERT INTO core.organizations (id,name,slug) VALUES ('00000000-0000-4000-8000-000000003001','Phase15B Org','phase15b-org');
    INSERT INTO core.departments (id,organization_id,name) VALUES ('00000000-0000-4000-8000-000000003002','00000000-0000-4000-8000-000000003001','Security');
    INSERT INTO core.projects (id,organization_id,department_id,name) VALUES ('00000000-0000-4000-8000-000000003003','00000000-0000-4000-8000-000000003001','00000000-0000-4000-8000-000000003002','Phase15B');
    INSERT INTO identity.humans (id,organization_id,display_name) VALUES ('00000000-0000-4000-8000-000000003004','00000000-0000-4000-8000-000000003001','Registry Reader');
    INSERT INTO identity.human_project_assignments (id,human_id,organization_id,project_id,scope) VALUES ('00000000-0000-4000-8000-000000003005','00000000-0000-4000-8000-000000003004','00000000-0000-4000-8000-000000003001','00000000-0000-4000-8000-000000003003','project-maos');
    INSERT INTO identity.assignment_permissions (assignment_id,action,resource,environment,risk,effect) VALUES
      ('00000000-0000-4000-8000-000000003005','READ','SYSTEM','staging','R0','ALLOW'),
      ('00000000-0000-4000-8000-000000003005','CREATE','COMMAND','staging','R1','ALLOW'),
      ('00000000-0000-4000-8000-000000003005','CREATE','SESSION','staging','R2','ALLOW');
  `);
  const stored = await database.query<{ risk: string }>(`
    SELECT risk FROM identity.assignment_permissions ORDER BY risk
  `);
  assert.deepEqual(
    stored.rows.map(({ risk }) => risk),
    ["R0", "R1", "R2"],
  );
  for (const risk of ["R3", "R4", "UNKNOWN"]) {
    await assert.rejects(
      database.exec(`
        INSERT INTO identity.assignment_permissions (assignment_id,action,resource,environment,risk,effect)
        VALUES ('00000000-0000-4000-8000-000000003005','READ','SYSTEM','staging','${risk}','DENY')
      `),
      /assignment_permissions_risk_check/,
    );
  }
});

test("phase 15B R0 assignment migration preserves historical checksums and creates no permission rows", async (t) => {
  const migrations = await loadMigrations("packages/database/migrations");
  assert.deepEqual(
    Object.fromEntries(
      migrations
        .filter(
          ({ id }) =>
            id <= "0029_phase15b_ai_provider_model_capability_registry",
        )
        .map(({ checksum, id }) => [id, checksum]),
    ),
    Object.fromEntries(
      Object.entries(canonicalChecksums).filter(
        ([id]) => id <= "0029_phase15b_ai_provider_model_capability_registry",
      ),
    ),
  );
  const migrationIndex = migrations.findIndex(
    ({ id }) => id === "0030_phase15b_r0_durable_assignment_authority",
  );
  assert.notEqual(migrationIndex, -1);
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(database, migrations.slice(0, migrationIndex));
  const before = await database.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM identity.assignment_permissions",
  );
  await applyMigrations(database, migrations.slice(migrationIndex));
  const after = await database.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM identity.assignment_permissions",
  );
  assert.equal(before.rows[0]?.count, "0");
  assert.equal(after.rows[0]?.count, before.rows[0]?.count);
});

test("phase 15B R0 assignment migration replays through the canonical runner", async (t) => {
  const migrations = await loadMigrations("packages/database/migrations");
  const phase15b = migrations.find(
    ({ id }) => id === "0030_phase15b_r0_durable_assignment_authority",
  );
  assert.equal(
    phase15b?.checksum,
    canonicalChecksums["0030_phase15b_r0_durable_assignment_authority"],
  );
  const database = new PGlite();
  t.after(() => database.close());
  const first = await applyMigrations(database, migrations);
  assert.ok(
    first.applied.includes("0030_phase15b_r0_durable_assignment_authority"),
  );
  const replay = await applyMigrations(database, migrations);
  assert.deepEqual(replay, {
    applied: [],
    skipped: migrations.map(({ id }) => id),
  });
});
