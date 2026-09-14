import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { loadMigrations } from "../src/index.js";

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

test("keeps canonical LF checksums stable for migrations 0001 through 0019", async () => {
  const migrations = await loadMigrations("packages/database/migrations");
  assert.deepEqual(
    Object.fromEntries(migrations.map(({ checksum, id }) => [id, checksum])),
    canonicalChecksums,
  );
});
