import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, loadMigrations } from "../src/index.js";

const migrationsDirectory = resolve("packages/database/migrations");

test("initializes canonical schemas and Phase 1.4 foundation tables on a clean database", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());

  const migrations = await loadMigrations(migrationsDirectory);
  const result = await applyMigrations(database, migrations);

  assert.deepEqual(result, {
    applied: [
      "0001_canonical_schemas",
      "0002_core_foundation",
      "0003_approval_authority_foundation",
      "0004_project_task_workflow_foundation",
      "0005_agent_model_runner_foundation",
    ],
    skipped: [],
  });

  const schemas = await database.query<{ schema_name: string }>(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name IN (
      'core', 'identity', 'work', 'ai', 'execution', 'governance',
      'knowledge', 'integration', 'communication', 'notification',
      'audit', 'private', 'quality', 'delivery', 'operations'
    )
    ORDER BY schema_name
  `);
  assert.deepEqual(
    schemas.rows.map(({ schema_name }) => schema_name),
    [
      "ai",
      "audit",
      "communication",
      "core",
      "delivery",
      "execution",
      "governance",
      "identity",
      "integration",
      "knowledge",
      "notification",
      "operations",
      "private",
      "quality",
      "work",
    ],
  );

  const tables = await database.query<{ qualified_name: string }>(`
    SELECT table_schema || '.' || table_name AS qualified_name
    FROM information_schema.tables
    WHERE table_schema IN ('core', 'identity', 'work', 'governance')
    ORDER BY qualified_name
  `);
  assert.deepEqual(
    tables.rows.map(({ qualified_name }) => qualified_name),
    [
      "core.departments",
      "core.organizations",
      "core.project_members",
      "core.projects",
      "core.schema_migrations",
      "governance.approvals",
      "governance.authority_rules",
      "governance.reviews",
      "identity.humans",
      "work.task_assignments",
      "work.task_dependencies",
      "work.tasks",
      "work.workflow_definitions",
      "work.workflow_instances",
      "work.workflow_step_instances",
      "work.workflow_versions",
    ],
  );
});

test("initializes distinct Phase 1.9 agent, model, runner, assignment, and run persistence", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const result = await applyMigrations(
    database,
    await loadMigrations(migrationsDirectory),
  );
  assert.equal(result.applied.at(-1), "0005_agent_model_runner_foundation");

  const tables = await database.query<{ qualified_name: string }>(`
    SELECT table_schema || '.' || table_name AS qualified_name
    FROM information_schema.tables
    WHERE (table_schema, table_name) IN (
      ('ai', 'agent_definitions'),
      ('ai', 'agent_definition_versions'),
      ('ai', 'agents'),
      ('ai', 'model_providers'),
      ('ai', 'models'),
      ('execution', 'runners'),
      ('execution', 'runs'),
      ('audit', 'run_events')
    )
    ORDER BY qualified_name
  `);
  assert.deepEqual(
    tables.rows.map(({ qualified_name }) => qualified_name),
    [
      "ai.agent_definition_versions",
      "ai.agent_definitions",
      "ai.agents",
      "ai.model_providers",
      "ai.models",
      "audit.run_events",
      "execution.runners",
      "execution.runs",
    ],
  );

  await assert.rejects(
    database.query(`
      INSERT INTO execution.runners (name, lifecycle, health, capabilities)
      VALUES ('Invalid runner', 'ACTIVE', 'ASSUMED_HEALTHY', ARRAY['NODE'])
    `),
    /check constraint/i,
  );

  await assert.rejects(
    database.query(`
      INSERT INTO ai.models (provider_id, name, lifecycle, capabilities)
      VALUES (
        '00000000-0000-4000-8000-000000000099',
        'Orphan model',
        'ACTIVE',
        ARRAY['TEXT']
      )
    `),
    /foreign key/i,
  );
});

test("initializes Phase 1.8 ownership, workflow, and event persistence", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const result = await applyMigrations(
    database,
    await loadMigrations(migrationsDirectory),
  );
  assert.ok(result.applied.includes("0004_project_task_workflow_foundation"));

  const tables = await database.query<{ qualified_name: string }>(`
    SELECT table_schema || '.' || table_name AS qualified_name
    FROM information_schema.tables
    WHERE (table_schema = 'core' AND table_name = 'project_members')
       OR (table_schema = 'audit' AND table_name = 'events')
    ORDER BY qualified_name
  `);
  assert.deepEqual(
    tables.rows.map(({ qualified_name }) => qualified_name),
    ["audit.events", "core.project_members"],
  );
});

test("enforces hierarchy, lifecycle, and dependency constraints", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(database, await loadMigrations(migrationsDirectory));

  await assert.rejects(
    database.query(`
      INSERT INTO core.departments (organization_id, name)
      VALUES ('00000000-0000-4000-8000-000000000001', 'Orphan')
    `),
    /foreign key/i,
  );

  await database.exec(`
    INSERT INTO core.organizations (id, name, slug)
    VALUES ('00000000-0000-4000-8000-000000000001', 'MAOS Test', 'maos-test');
    INSERT INTO core.departments (id, organization_id, name)
    VALUES (
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
      'Engineering'
    );
    INSERT INTO core.projects (id, organization_id, department_id, name)
    VALUES (
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      'Core Database'
    );
  `);

  await assert.rejects(
    database.query(`
      INSERT INTO work.tasks (project_id, title, task_type, status)
      VALUES (
        '00000000-0000-4000-8000-000000000003',
        'Invalid lifecycle',
        'DATABASE',
        'DONE'
      )
    `),
    /check constraint/i,
  );

  await database.query(`
    INSERT INTO work.tasks (id, project_id, title, task_type, status)
    VALUES
      (
        '00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000003',
        'Parent task',
        'DATABASE',
        'READY'
      ),
      (
        '00000000-0000-4000-8000-000000000005',
        '00000000-0000-4000-8000-000000000003',
        'Dependent task',
        'DATABASE',
        'WAITING_DEPENDENCY'
      );
  `);

  await assert.rejects(
    database.query(`
      INSERT INTO work.task_dependencies (task_id, depends_on_task_id, dependency_type)
      VALUES (
        '00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000004',
        'REQUIRES'
      )
    `),
    /check constraint/i,
  );
});

test("enforces exact approval binding and authority rule constraints", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(database, await loadMigrations(migrationsDirectory));

  await assert.rejects(
    database.query(`
      INSERT INTO governance.approvals (
        target_type, target_id, target_version, target_hash,
        requested_by_actor_type, requested_by_actor_id
      ) VALUES (
        'RELEASE', '00000000-0000-4000-8000-000000000010', '1', '',
        'HUMAN', '00000000-0000-4000-8000-000000000011'
      )
    `),
    /check constraint/i,
  );

  await assert.rejects(
    database.query(`
      INSERT INTO governance.authority_rules (
        action, effect, environment, resource, risk, scope
      ) VALUES ('DEPLOY', 'ALLOW_EVERYTHING', 'production', 'RELEASE', 'R4', 'all')
    `),
    /check constraint/i,
  );

  await assert.rejects(
    database.query(`
      INSERT INTO governance.authority_rules (
        actor_type, action, effect, environment, resource, risk, scope
      ) VALUES (
        'HUMAN', 'DEPLOY', 'ALLOW', 'production', 'RELEASE', 'R4', 'all'
      )
    `),
    /check constraint/i,
  );
});

test("replays migrations idempotently and rejects checksum drift", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const migrations = await loadMigrations(migrationsDirectory);

  await applyMigrations(database, migrations);
  assert.deepEqual(await applyMigrations(database, migrations), {
    applied: [],
    skipped: [
      "0001_canonical_schemas",
      "0002_core_foundation",
      "0003_approval_authority_foundation",
      "0004_project_task_workflow_foundation",
      "0005_agent_model_runner_foundation",
    ],
  });

  const drifted = migrations.map((migration, index) =>
    index === 0 ? { ...migration, checksum: "0".repeat(64) } : migration,
  );
  await assert.rejects(
    applyMigrations(database, drifted),
    /checksum mismatch.*0001_canonical_schemas/i,
  );
});
