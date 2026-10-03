import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, loadMigrations } from "../src/index.js";

const migrationDirectory = resolve("packages/database/migrations");

async function migratedDatabase(t: test.TestContext): Promise<PGlite> {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(database, await loadMigrations(migrationDirectory));
  return database;
}

test("migration 0031 creates separate request and classification authorities", async (t) => {
  const database = await migratedDatabase(t);
  const tables = await database.query<{
    table_schema: string;
    table_name: string;
  }>(
    `SELECT table_schema, table_name FROM information_schema.tables
      WHERE (table_schema, table_name) IN
        (('work','requests'),('governance','request_classification_versions'))
      ORDER BY table_schema, table_name`,
  );
  assert.deepEqual(tables.rows, [
    {
      table_name: "request_classification_versions",
      table_schema: "governance",
    },
    { table_name: "requests", table_schema: "work" },
  ]);
});

test("migration 0031 binds Development to the canonical AIDOS target", async (t) => {
  const database = await migratedDatabase(t);
  const result = await database.query<{
    execution_mode: string;
    routing_disposition: string;
    target_kind: string | null;
    target_ref: string | null;
    target_version: string | null;
  }>(`SELECT execution_mode, routing_disposition, target_kind, target_ref, target_version
        FROM ai.domain_execution_constraints WHERE domain_key='DEVELOPMENT'`);
  assert.deepEqual(result.rows, [
    {
      execution_mode: "DELEGATE_TO_AIDOS",
      routing_disposition: "DELEGATE_TO_AIDOS",
      target_kind: "AIDOS",
      target_ref: "authority://aidos/development",
      target_version: "MAOS-031",
    },
  ]);
});

test("migration 0031 rejects request history mutation and invalid classification chains", async (t) => {
  const database = await migratedDatabase(t);
  await assert.rejects(
    database.query(`INSERT INTO governance.request_classification_versions
      (classification_id,request_id,version,domain_key,classification_state,source,
       routing_disposition,reason_code,created_by_actor_type,created_by_actor_id,
       canonical_payload_fingerprint,idempotency_key,correlation_id,audit_ref)
      VALUES (gen_random_uuid(),gen_random_uuid(),1,'BUSINESS','PROPOSED','AI_ASSISTED',
       'REQUIRE_HUMAN_REVIEW','PROPOSAL','AGENT',gen_random_uuid(),
       'sha256:${"a".repeat(64)}','key','correlation',gen_random_uuid())`),
    /foreign key|violates/i,
  );
});
