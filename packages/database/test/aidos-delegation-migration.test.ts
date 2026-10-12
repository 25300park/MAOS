import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, loadMigrations } from "../src/index.js";

test("migration 0034 persists canonical AIDOS input and complete snapshot binding", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const migrations = await loadMigrations(resolve("packages/database/migrations"));
  await applyMigrations(database, migrations);

  const columns = await database.query<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='governance'
      AND table_name='request_routing_decision_versions'
      AND column_name IN ('aidos_delegation_input','aidos_required_capabilities','aidos_snapshot_binding')
    ORDER BY column_name
  `);
  assert.deepEqual(
    columns.rows.map(({ column_name }) => column_name),
    [
      "aidos_delegation_input",
      "aidos_required_capabilities",
      "aidos_snapshot_binding",
    ],
  );

  const constraints = await database.query<{ conname: string }>(`
    SELECT conname
    FROM pg_constraint
    WHERE conname IN (
      'request_routing_decision_versions_aidos_delegation_input_check',
      'request_routing_decision_versions_aidos_capabilities_check',
      'request_routing_decision_versions_aidos_snapshot_binding_check'
    )
    ORDER BY conname
  `);
  assert.deepEqual(
    constraints.rows.map(({ conname }) => conname),
    [
      "request_routing_decision_versions_aidos_capabilities_check",
      "request_routing_decision_versions_aidos_delegation_input_check",
      "request_routing_decision_versions_aidos_snapshot_binding_check",
    ],
  );
});
