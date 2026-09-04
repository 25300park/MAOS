import assert from "node:assert/strict";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, loadMigrations } from "@maos/database";

const database = new PGlite();

try {
  const migrations = await loadMigrations(
    resolve("packages/database/migrations"),
  );
  const first = await applyMigrations(database, migrations);
  const second = await applyMigrations(database, migrations);

  assert.deepEqual(first.applied, [
    "0001_canonical_schemas",
    "0002_core_foundation",
    "0003_approval_authority_foundation",
    "0004_project_task_workflow_foundation",
    "0005_agent_model_runner_foundation",
    "0006_skill_tool_mcp_foundation",
    "0007_local_execution_bridge_foundation",
    "0008_ai_memory_gateway_integration",
    "0009_observability_audit_foundation",
    "0010_release_deployment_foundation",
    "0011_rbs_admin_pilot_foundation",
  ]);
  assert.deepEqual(second.applied, []);
  assert.deepEqual(second.skipped, [
    "0001_canonical_schemas",
    "0002_core_foundation",
    "0003_approval_authority_foundation",
    "0004_project_task_workflow_foundation",
    "0005_agent_model_runner_foundation",
    "0006_skill_tool_mcp_foundation",
    "0007_local_execution_bridge_foundation",
    "0008_ai_memory_gateway_integration",
    "0009_observability_audit_foundation",
    "0010_release_deployment_foundation",
    "0011_rbs_admin_pilot_foundation",
  ]);

  const migrationCount = await database.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM core.schema_migrations",
  );
  assert.equal(migrationCount.rows[0]?.count, "11");

  console.log("Clean database initialization: PASS");
  console.log("Database migrations applied: 11");
  console.log("Migration repeatability: PASS (11 skipped on replay)");
} finally {
  await database.close();
}
