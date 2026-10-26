import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, loadMigrations } from "../src/index.js";

const migrationDirectory = resolve("packages/database/migrations");

async function pre0029Database(t: test.TestContext): Promise<PGlite> {
  const database = new PGlite();
  t.after(() => database.close());
  const migrations = await loadMigrations(migrationDirectory);
  await applyMigrations(
    database,
    migrations.filter(({ id }) => id < "0029_"),
  );
  return database;
}

async function migratedDatabase(t: test.TestContext): Promise<PGlite> {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(database, await loadMigrations(migrationDirectory));
  return database;
}

test("migration 0029 creates normalized registry without collapsing canonical entities", async (t) => {
  const database = await migratedDatabase(t);
  const tables = await database.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'ai'
        AND table_name IN (
          'host_runtimes',
          'model_host_bindings',
          'capabilities',
          'model_capability_bindings',
          'role_compatibilities',
          'domain_execution_constraints'
        )
      ORDER BY table_name`,
  );
  assert.deepEqual(
    tables.rows.map(({ table_name }) => table_name),
    [
      "capabilities",
      "domain_execution_constraints",
      "host_runtimes",
      "model_capability_bindings",
      "model_host_bindings",
      "role_compatibilities",
    ],
  );

  const providerColumns = await database.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ai'
        AND table_name = 'model_providers'
        AND column_name IN (
          'provider_key', 'display_name', 'provider_type', 'health_state',
          'readiness_state', 'credential_ref', 'default_region', 'metadata',
          'version'
        )
      ORDER BY column_name`,
  );
  assert.equal(providerColumns.rows.length, 9);

  const modelColumns = await database.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ai'
        AND table_name = 'models'
        AND column_name IN (
          'model_key', 'display_name', 'model_family', 'model_version',
          'context_window_class', 'multimodal_support',
          'structured_output_support', 'tool_use_support',
          'streaming_support', 'health_state', 'readiness_state', 'metadata'
        )
      ORDER BY column_name`,
  );
  assert.equal(modelColumns.rows.length, 12);

  const preserved = await database.query<{
    table_name: string;
    column_name: string;
  }>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE (table_schema = 'ai' AND table_name = 'agents' AND column_name = 'runtime_status')
         OR (table_schema = 'execution' AND table_name = 'runners' AND column_name = 'health')
      ORDER BY table_name`,
  );
  assert.deepEqual(preserved.rows, [
    { column_name: "runtime_status", table_name: "agents" },
    { column_name: "health", table_name: "runners" },
  ]);

  const constraints = await database.query<{ constraint_name: string }>(
    `SELECT constraint_name
       FROM information_schema.table_constraints
      WHERE table_schema = 'ai'
        AND constraint_name IN (
          'model_host_bindings_model_id_host_id_key',
          'model_capability_bindings_model_host_binding_id_capability_id_key'
        )
      ORDER BY constraint_name`,
  );
  assert.equal(constraints.rows.length, 2);

  const foreignKeys = await database.query<{ foreign_key_count: string }>(
    `SELECT count(*)::text AS foreign_key_count
       FROM information_schema.table_constraints
      WHERE table_schema = 'ai'
        AND table_name IN (
          'host_runtimes', 'model_host_bindings', 'model_capability_bindings',
          'role_compatibilities'
        )
        AND constraint_type = 'FOREIGN KEY'`,
  );
  assert.equal(foreignKeys.rows[0]?.foreign_key_count, "6");
});

test("legacy capabilities are compatibility-only", async (t) => {
  const database = await migratedDatabase(t);
  const column = await database.query<{
    comment: string | null;
    data_type: string;
  }>(
    `SELECT col_description(c.oid, a.attnum) AS comment,
            format_type(a.atttypid, a.atttypmod) AS data_type
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'ai'
        AND c.relname = 'models'
        AND a.attname = 'capabilities'
        AND a.attnum > 0
        AND NOT a.attisdropped`,
  );
  assert.equal(column.rows[0]?.data_type, "text[]");
  assert.match(
    column.rows[0]?.comment ?? "",
    /LEGACY_NONAUTHORITATIVE[\s\S]*COMPATIBILITY_ONLY/u,
  );
});

test("health and readiness accept only distinct approved states", async (t) => {
  const database = await migratedDatabase(t);
  const provider = await database.query<{ id: string }>(
    "SELECT id FROM ai.model_providers WHERE provider_key = 'openai'",
  );
  const providerId = provider.rows[0]?.id;
  assert.ok(providerId);

  await database.query(
    "UPDATE ai.model_providers SET health_state = 'HEALTHY', readiness_state = 'BLOCKED' WHERE id = $1",
    [providerId],
  );
  await assert.rejects(
    database.query(
      "UPDATE ai.model_providers SET health_state = 'READY' WHERE id = $1",
      [providerId],
    ),
    /health_state|check constraint/iu,
  );
  await assert.rejects(
    database.query(
      "UPDATE ai.model_providers SET readiness_state = 'HEALTHY' WHERE id = $1",
      [providerId],
    ),
    /readiness_state|check constraint/iu,
  );
});

test("deterministic key backfill is order independent and collision safe", async (t) => {
  const migrations = await loadMigrations(migrationDirectory);
  const migration0029 = migrations.find(({ id }) => id.startsWith("0029_"));
  if (migration0029 === undefined) {
    throw new Error(
      "migration 0029 is required for the deterministic backfill test",
    );
  }
  const requiredMigration0029 = migration0029;

  async function seedAndMigrate(reverse: boolean): Promise<{
    models: Record<string, string>;
    providers: Record<string, string>;
  }> {
    const database = await pre0029Database(t);
    const providers = [
      ["11111111-1111-4111-8111-111111111111", "Acme AI"],
      ["22222222-2222-4222-8222-222222222222", " acme--ai "],
      ["33333333-3333-4333-8333-333333333333", "!!!"],
    ];
    for (const [id, name] of reverse ? providers.reverse() : providers) {
      await database.query(
        "INSERT INTO ai.model_providers (id, name, status) VALUES ($1, $2, 'ACTIVE')",
        [id, name],
      );
    }
    const models = [
      ["44444444-4444-4444-8444-444444444444", "Model X"],
      ["55555555-5555-4555-8555-555555555555", " model---x "],
    ];
    for (const [id, name] of reverse ? models.reverse() : models) {
      await database.query(
        `INSERT INTO ai.models (id, provider_id, name, lifecycle, capabilities)
         VALUES ($1, '33333333-3333-4333-8333-333333333333', $2, 'ACTIVE', ARRAY['LEGACY'])`,
        [id, name],
      );
    }
    await applyMigrations(database, [requiredMigration0029]);
    const providerRows = await database.query<{
      id: string;
      provider_key: string;
    }>(
      "SELECT id, provider_key FROM ai.model_providers WHERE id::text LIKE '________-____-4___-8___-____________' ORDER BY id",
    );
    const modelRows = await database.query<{ id: string; model_key: string }>(
      "SELECT id, model_key FROM ai.models ORDER BY id",
    );
    return {
      models: Object.fromEntries(
        modelRows.rows.map(({ id, model_key }) => [id, model_key]),
      ),
      providers: Object.fromEntries(
        providerRows.rows.map(({ id, provider_key }) => [id, provider_key]),
      ),
    };
  }

  const forward = await seedAndMigrate(false);
  const reverse = await seedAndMigrate(true);
  assert.deepEqual(forward, reverse);
  assert.equal(
    forward.providers["11111111-1111-4111-8111-111111111111"],
    "acme-ai-11111111111141118111111111111111",
  );
  assert.equal(
    forward.providers["22222222-2222-4222-8222-222222222222"],
    "acme-ai-22222222222242228222222222222222",
  );
  assert.equal(
    forward.providers["33333333-3333-4333-8333-333333333333"],
    "provider",
  );
  assert.equal(
    forward.models["44444444-4444-4444-8444-444444444444"],
    "model-x-44444444444444448444444444444444",
  );
  assert.equal(
    forward.models["55555555-5555-4555-8555-555555555555"],
    "model-x-55555555555545558555555555555555",
  );
});

test("stable registry seeds are exact and remain non-ready", async (t) => {
  const database = await migratedDatabase(t);
  const providers = await database.query<{
    credential_ref: string | null;
    provider_key: string;
    readiness_state: string;
  }>(
    "SELECT provider_key, readiness_state, credential_ref FROM ai.model_providers ORDER BY provider_key",
  );
  assert.deepEqual(
    providers.rows.map(({ provider_key }) => provider_key),
    ["anthropic", "google", "openai"],
  );
  assert.ok(
    providers.rows.every(({ credential_ref }) => credential_ref === null),
  );
  assert.ok(
    providers.rows.every(({ readiness_state }) => readiness_state !== "READY"),
  );

  const hosts = await database.query<{
    host_key: string;
    readiness_state: string;
  }>(
    "SELECT host_key, readiness_state FROM ai.host_runtimes ORDER BY host_key",
  );
  assert.deepEqual(
    hosts.rows.map(({ host_key }) => host_key),
    ["anthropic-api", "claude-code", "codex-cli", "google-api", "openai-api"],
  );
  assert.ok(
    hosts.rows.every(({ readiness_state }) => readiness_state !== "READY"),
  );

  const capabilities = await database.query<{ capability_key: string }>(
    "SELECT capability_key FROM ai.capabilities ORDER BY capability_key",
  );
  assert.deepEqual(
    capabilities.rows.map(({ capability_key }) => capability_key),
    [
      "ANALYSIS",
      "CODE_EXECUTION",
      "CODE_REASONING",
      "CODE_REVIEW",
      "DATA_ANALYSIS",
      "GENERAL_REASONING",
      "LONG_CONTEXT",
      "MULTIMODAL",
      "PLANNING",
      "RESEARCH",
      "SECURITY_REVIEW",
      "STRUCTURED_OUTPUT",
      "SUMMARIZATION",
      "TOOL_USE",
      "WRITING",
    ],
  );

  const volatile = await database.query<{
    bindings: string;
    models: string;
    roles: string;
  }>(
    `SELECT (SELECT count(*)::text FROM ai.models) AS models,
            (SELECT count(*)::text FROM ai.model_capability_bindings) AS bindings,
            (SELECT count(*)::text FROM ai.role_compatibilities) AS roles`,
  );
  assert.deepEqual(volatile.rows[0], {
    bindings: "0",
    models: "0",
    roles: "0",
  });

  const constraint = await database.query<{
    execution_mode: string;
    status: string;
  }>(
    "SELECT execution_mode, status FROM ai.domain_execution_constraints WHERE domain_key = 'DEVELOPMENT'",
  );
  assert.deepEqual(constraint.rows, [
    { execution_mode: "DELEGATE_TO_AIDOS", status: "ACTIVE" },
  ]);

  await assert.rejects(
    database.query(
      `INSERT INTO ai.model_providers
         (name, status, provider_key)
       VALUES ('Conflicting Provider', 'ACTIVE', 'openai')`,
    ),
    /unique|provider_key/iu,
  );
});

test("database rejects weakening Development authority and direct MAOS role eligibility", async (t) => {
  const database = await migratedDatabase(t);
  for (const statement of [
    "UPDATE ai.domain_execution_constraints SET execution_mode = 'MAOS_NATIVE' WHERE domain_key = 'DEVELOPMENT'",
    "UPDATE ai.domain_execution_constraints SET execution_mode = 'PROHIBITED' WHERE domain_key = 'DEVELOPMENT'",
    "UPDATE ai.domain_execution_constraints SET status = 'DISABLED' WHERE domain_key = 'DEVELOPMENT'",
    "UPDATE ai.domain_execution_constraints SET domain_key = 'DEVELOPMENT_RENAMED' WHERE domain_key = 'DEVELOPMENT'",
  ]) {
    await assert.rejects(
      database.query(statement),
      /AI_DEVELOPMENT_DOMAIN_CONSTRAINT_IMMUTABLE/u,
    );
  }
  await assert.rejects(
    database.query(
      "DELETE FROM ai.domain_execution_constraints WHERE domain_key = 'DEVELOPMENT'",
    ),
    /AI_DEVELOPMENT_DOMAIN_CONSTRAINT_IMMUTABLE/u,
  );
  await assert.rejects(
    database.query(
      `INSERT INTO ai.role_compatibilities
         (role_key, domain_key, eligibility)
       VALUES ('DEVELOPER', 'DEVELOPMENT', 'ELIGIBLE')`,
    ),
    /AI_DEVELOPMENT_ROLE_COMPATIBILITY_DENIED/u,
  );
  await assert.rejects(
    database.query(
      `INSERT INTO ai.role_compatibilities
         (role_key, domain_key, eligibility)
       VALUES ('DEVELOPMENT_EXECUTOR', 'DEVELOPMENT', 'CONDITIONAL')`,
    ),
    /AI_DEVELOPMENT_ROLE_COMPATIBILITY_DENIED/u,
  );

  await database.query(
    "ALTER TABLE ai.domain_execution_constraints DISABLE TRIGGER domain_execution_constraints_guard_development",
  );
  await database.query(
    "DELETE FROM ai.domain_execution_constraints WHERE domain_key = 'DEVELOPMENT'",
  );
  await assert.rejects(
    database.query(
      `INSERT INTO ai.role_compatibilities
         (role_key, domain_key, eligibility)
       VALUES ('DEVELOPER', 'DEVELOPMENT', 'ELIGIBLE')`,
    ),
    /AI_DEVELOPMENT_POLICY_PROHIBITED/u,
  );
});

test("CODE_EXECUTION metadata cannot override the Development authority boundary", async (t) => {
  const database = await migratedDatabase(t);
  const provider = await database.query<{ id: string }>(
    "SELECT id FROM ai.model_providers WHERE provider_key = 'openai'",
  );
  const model = await database.query<{ id: string }>(
    `INSERT INTO ai.models (provider_id, name, lifecycle, capabilities, model_key)
     VALUES ($1, 'Boundary Model', 'ACTIVE', ARRAY['CODE_EXECUTION'], 'boundary-model')
     RETURNING id`,
    [provider.rows[0]!.id],
  );
  const host = await database.query<{ id: string }>(
    "SELECT id FROM ai.host_runtimes WHERE host_key = 'openai-api'",
  );
  const binding = await database.query<{ id: string }>(
    `INSERT INTO ai.model_host_bindings (model_id, host_id, health_state, readiness_state)
     VALUES ($1, $2, 'HEALTHY', 'READY') RETURNING id`,
    [model.rows[0]!.id, host.rows[0]!.id],
  );
  const capability = await database.query<{ id: string }>(
    "SELECT id FROM ai.capabilities WHERE capability_key = 'CODE_EXECUTION'",
  );
  await database.query(
    `INSERT INTO ai.model_capability_bindings
       (model_host_binding_id, capability_id, support_level, confidence_class,
        verification_freshness, verified_at, verification_source, evidence_ref, policy_version)
     VALUES ($1, $2, 'PREFERRED', 'HIGH', 'FRESH', CURRENT_TIMESTAMP,
             'TEST', 'evidence://phase15b/code-execution', 'phase15b-test')`,
    [binding.rows[0]!.id, capability.rows[0]!.id],
  );
  const compatibility = await database.query<{ id: string }>(
    `INSERT INTO ai.role_compatibilities
       (model_host_binding_id, role_key, domain_key, stage_key, eligibility)
     VALUES ($1, 'ANALYST', 'ANALYSIS', 'EXECUTION', 'ELIGIBLE')
     RETURNING id`,
    [binding.rows[0]!.id],
  );
  await assert.rejects(
    database.query(
      "UPDATE ai.role_compatibilities SET domain_key = 'DEVELOPMENT' WHERE id = $1",
      [compatibility.rows[0]!.id],
    ),
    /AI_DEVELOPMENT_ROLE_COMPATIBILITY_DENIED/u,
  );
  await assert.rejects(
    database.query(
      `INSERT INTO ai.role_compatibilities
         (model_host_binding_id, role_key, domain_key, stage_key, eligibility)
       VALUES ($1, 'DEVELOPER', 'DEVELOPMENT', 'EXECUTION', 'ELIGIBLE')`,
      [binding.rows[0]!.id],
    ),
    /AI_DEVELOPMENT_ROLE_COMPATIBILITY_DENIED/u,
  );
});

test("missing, non-delegating, and ambiguous Development policy fail closed", async (t) => {
  async function rejectsAfterPolicyMutation(
    mutation: string | readonly string[],
  ): Promise<void> {
    const database = await migratedDatabase(t);
    await database.query(
      "ALTER TABLE ai.domain_execution_constraints DISABLE TRIGGER domain_execution_constraints_guard_development",
    );
    for (const statement of typeof mutation === "string"
      ? [mutation]
      : mutation) {
      await database.query(statement);
    }
    await assert.rejects(
      database.query(
        `INSERT INTO ai.role_compatibilities
           (role_key, domain_key, eligibility)
         VALUES ('DEVELOPER', 'DEVELOPMENT', 'ELIGIBLE')`,
      ),
      /AI_DEVELOPMENT_POLICY_PROHIBITED/u,
    );
  }

  await rejectsAfterPolicyMutation(
    "DELETE FROM ai.domain_execution_constraints WHERE domain_key = 'DEVELOPMENT'",
  );
  await rejectsAfterPolicyMutation(
    "UPDATE ai.domain_execution_constraints SET execution_mode = 'PROHIBITED' WHERE domain_key = 'DEVELOPMENT'",
  );
  await rejectsAfterPolicyMutation([
    `ALTER TABLE ai.domain_execution_constraints
       DROP CONSTRAINT domain_execution_constraints_domain_key_key`,
    `INSERT INTO ai.domain_execution_constraints
       (domain_key, execution_mode, status, reason_code, policy_ref, policy_version,
        routing_disposition, target_kind, target_ref, target_version)
     VALUES
       ('DEVELOPMENT', 'DELEGATE_TO_AIDOS', 'ACTIVE', 'AMBIGUOUS_TEST', 'test://policy', '1',
        'DELEGATE_TO_AIDOS', 'AIDOS', 'authority://aidos/development', 'MAOS-031')`,
  ]);
});

test("database triggers share the approved Development advisory-lock boundary", async (t) => {
  const database = await migratedDatabase(t);
  const functions = await database.query<{ definition: string }>(
    `SELECT pg_get_functiondef(p.oid) AS definition
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'ai'
        AND p.proname IN ('guard_development_domain_constraint', 'guard_development_role_compatibility')
      ORDER BY p.proname`,
  );
  assert.equal(functions.rows.length, 2);
  for (const { definition } of functions.rows) {
    assert.match(
      definition,
      /pg_advisory_xact_lock\s*\(\s*hashtextextended\s*\(\s*'ai\.development_authority_boundary'/iu,
    );
  }
});
