import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  applyMigrations,
  getSchemaVersion,
  loadMigrations,
  validateMigrationSafety,
} from "../src/index.js";

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
      "0006_skill_tool_mcp_foundation",
      "0007_local_execution_bridge_foundation",
      "0008_ai_memory_gateway_integration",
      "0009_observability_audit_foundation",
      "0010_release_deployment_foundation",
      "0011_rbs_admin_pilot_foundation",
      "0012_core_control_plane_generalization",
      "0013_ai_memory_knowledge_integration",
      "0014_marketing_automation_integration",
      "0015_ai_mls_integration",
      "0016_crm_human_work_integration",
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
      "core.project_system_links",
      "core.projects",
      "core.schema_migrations",
      "governance.approvals",
      "governance.authority_rules",
      "governance.reviews",
      "governance.tool_permissions",
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

test("initializes Phase 1.10 Skill, Tool, MCP, permission, and ToolCall persistence", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const result = await applyMigrations(
    database,
    await loadMigrations(migrationsDirectory),
  );
  assert.ok(result.applied.includes("0006_skill_tool_mcp_foundation"));

  const tables = await database.query<{ qualified_name: string }>(`
    SELECT table_schema || '.' || table_name AS qualified_name
    FROM information_schema.tables
    WHERE (table_schema, table_name) IN (
      ('ai', 'skill_definitions'),
      ('ai', 'skill_versions'),
      ('ai', 'skill_bindings'),
      ('execution', 'tool_providers'),
      ('execution', 'tools'),
      ('execution', 'tool_capabilities'),
      ('governance', 'tool_permissions'),
      ('execution', 'tool_calls'),
      ('audit', 'tool_call_events')
    )
    ORDER BY qualified_name
  `);
  assert.deepEqual(
    tables.rows.map(({ qualified_name }) => qualified_name),
    [
      "ai.skill_bindings",
      "ai.skill_definitions",
      "ai.skill_versions",
      "audit.tool_call_events",
      "execution.tool_calls",
      "execution.tool_capabilities",
      "execution.tool_providers",
      "execution.tools",
      "governance.tool_permissions",
    ],
  );

  await assert.rejects(
    database.query(`
      INSERT INTO execution.tools (
        provider_id, name, tool_type, risk, lifecycle, health
      ) VALUES (
        '00000000-0000-4000-8000-000000000099',
        'Invalid Tool', 'SHELL', 'R5', 'ENABLED', 'ASSUMED_HEALTHY'
      )
    `),
    /(check constraint|foreign key)/i,
  );
});

test("initializes Phase 1.10A local runner registration, allowlist, policy, and task scope persistence", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const result = await applyMigrations(
    database,
    await loadMigrations(migrationsDirectory),
  );
  assert.ok(result.applied.includes("0007_local_execution_bridge_foundation"));

  const tables = await database.query<{ qualified_name: string }>(`
    SELECT table_schema || '.' || table_name AS qualified_name
    FROM information_schema.tables
    WHERE (table_schema, table_name) IN (
      ('execution', 'local_runner_registrations'),
      ('execution', 'local_runner_workroots'),
      ('execution', 'local_runner_capabilities'),
      ('execution', 'local_runner_command_policies'),
      ('execution', 'local_task_scopes')
    )
    ORDER BY qualified_name
  `);
  assert.deepEqual(
    tables.rows.map(({ qualified_name }) => qualified_name),
    [
      "execution.local_runner_capabilities",
      "execution.local_runner_command_policies",
      "execution.local_runner_registrations",
      "execution.local_runner_workroots",
      "execution.local_task_scopes",
    ],
  );
});

test("initializes Phase 1.11 gateway registration, external reference, and retrieval evidence persistence", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const result = await applyMigrations(
    database,
    await loadMigrations(migrationsDirectory),
  );
  assert.ok(result.applied.includes("0008_ai_memory_gateway_integration"));

  const tables = await database.query<{ qualified_name: string }>(`
    SELECT table_schema || '.' || table_name AS qualified_name
    FROM information_schema.tables
    WHERE (table_schema, table_name) IN (
      ('integration', 'memory_gateways'),
      ('knowledge', 'memory_references'),
      ('audit', 'memory_retrieval_events')
    )
    ORDER BY qualified_name
  `);
  assert.deepEqual(
    tables.rows.map(({ qualified_name }) => qualified_name),
    [
      "audit.memory_retrieval_events",
      "integration.memory_gateways",
      "knowledge.memory_references",
    ],
  );

  const columns = await database.query<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'knowledge'
      AND table_name = 'memory_references'
    ORDER BY column_name
  `);
  assert.equal(
    columns.rows.some(({ column_name }) => column_name === "content"),
    false,
  );
});

test("initializes Phase 3 run-context and reviewed memory-candidate metadata without memory content", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const result = await applyMigrations(
    database,
    await loadMigrations(migrationsDirectory),
  );
  assert.ok(result.applied.includes("0013_ai_memory_knowledge_integration"));
  const tables = await database.query<{ qualified_name: string }>(`
    SELECT table_schema || '.' || table_name AS qualified_name
    FROM information_schema.tables
    WHERE (table_schema, table_name) IN (
      ('execution', 'run_contexts'),
      ('knowledge', 'memory_candidates')
    )
    ORDER BY qualified_name
  `);
  assert.deepEqual(
    tables.rows.map(({ qualified_name }) => qualified_name),
    ["execution.run_contexts", "knowledge.memory_candidates"],
  );
  const forbidden = await database.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM information_schema.columns
    WHERE (table_schema, table_name) IN (
      ('execution', 'run_contexts'),
      ('knowledge', 'memory_candidates')
    ) AND column_name IN ('content', 'memory_content', 'prompt')
  `);
  assert.equal(forbidden.rows[0]?.count, "0");
});

test("initializes separate observability records and append-only audit persistence", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const result = await applyMigrations(
    database,
    await loadMigrations(migrationsDirectory),
  );
  assert.ok(result.applied.includes("0009_observability_audit_foundation"));

  const tables = await database.query<{ qualified_name: string }>(`
    SELECT table_schema || '.' || table_name AS qualified_name
    FROM information_schema.tables
    WHERE (table_schema, table_name) IN (
      ('audit', 'observability_events'),
      ('audit', 'trace_spans'),
      ('audit', 'audit_records'),
      ('operations', 'metric_samples')
    )
    ORDER BY qualified_name
  `);
  assert.deepEqual(
    tables.rows.map(({ qualified_name }) => qualified_name),
    [
      "audit.audit_records",
      "audit.observability_events",
      "audit.trace_spans",
      "operations.metric_samples",
    ],
  );

  await database.exec(`
    INSERT INTO audit.audit_records (
      id, actor_type, actor_id, action, target_type, target_id, result,
      request_id, correlation_id, trace_id, span_id, record_hash
    ) VALUES (
      '00000000-0000-4000-8000-000000000901',
      'SYSTEM', '00000000-0000-4000-8000-000000000902',
      'SYSTEM.START', 'SYSTEM', '00000000-0000-4000-8000-000000000903',
      'SUCCEEDED', 'request-1', 'correlation-1', 'trace-1', 'span-1',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    )
  `);
  await assert.rejects(
    database.exec(`
      UPDATE audit.audit_records SET result = 'FAILED'
      WHERE id = '00000000-0000-4000-8000-000000000901'
    `),
    /append-only/i,
  );
  await assert.rejects(
    database.exec(`
      DELETE FROM audit.audit_records
      WHERE id = '00000000-0000-4000-8000-000000000901'
    `),
    /append-only/i,
  );
});

test("initializes distinct Phase 1.9 agent, model, runner, assignment, and run persistence", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const result = await applyMigrations(
    database,
    await loadMigrations(migrationsDirectory),
  );
  assert.ok(result.applied.includes("0005_agent_model_runner_foundation"));

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

test("initializes immutable release, artifact, environment, and deployment persistence", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const result = await applyMigrations(
    database,
    await loadMigrations(migrationsDirectory),
  );
  assert.ok(result.applied.includes("0010_release_deployment_foundation"));

  const tables = await database.query<{ qualified_name: string }>(`
    SELECT table_schema || '.' || table_name AS qualified_name
    FROM information_schema.tables
    WHERE table_schema = 'delivery'
      AND table_name IN ('artifacts', 'releases', 'release_evidence', 'environments', 'deployments')
    ORDER BY qualified_name
  `);
  assert.deepEqual(
    tables.rows.map(({ qualified_name }) => qualified_name),
    [
      "delivery.artifacts",
      "delivery.deployments",
      "delivery.environments",
      "delivery.release_evidence",
      "delivery.releases",
    ],
  );

  await assert.rejects(
    database.query(`
      INSERT INTO delivery.artifacts (
        project_id, artifact_key, build_id, artifact_hash, source_commit,
        configuration_versions
      ) VALUES (
        '00000000-0000-4000-8000-000000000099', 'artifact-invalid',
        'build-invalid', 'not-a-sha256', 'commit-invalid', ARRAY['config-1']
      )
    `),
    /check constraint|foreign key/i,
  );

  await assert.rejects(
    database.query(`
      INSERT INTO delivery.deployments (
        release_id, environment_name, status, artifact_hash,
        rollback_artifact_hash, executor_actor_id, timeout_ms
      ) VALUES (
        '00000000-0000-4000-8000-000000000099', 'PRODUCTION', 'COMPLETED',
        'sha256:${"a".repeat(64)}', 'sha256:${"b".repeat(64)}',
        '00000000-0000-4000-8000-000000000098', 1000
      )
    `),
    /check constraint|foreign key/i,
  );
});

test("creates the read-only RBS/Admin pilot persistence boundary", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(database, await loadMigrations(migrationsDirectory));

  const tables = await database.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'integration'
      AND table_name IN ('domain_systems', 'rbs_admin_pilots', 'pilot_evidence')
    ORDER BY table_name
  `);
  assert.deepEqual(
    tables.rows.map(({ table_name }) => table_name),
    ["domain_systems", "pilot_evidence", "rbs_admin_pilots"],
  );
  await database.exec(`
    INSERT INTO core.organizations (id, name, slug)
    VALUES ('00000000-0000-4000-8000-000000000181', 'Pilot Org', 'pilot-org');
    INSERT INTO core.departments (id, organization_id, name)
    VALUES ('00000000-0000-4000-8000-000000000182', '00000000-0000-4000-8000-000000000181', 'Pilot');
    INSERT INTO core.projects (id, organization_id, department_id, name)
    VALUES ('00000000-0000-4000-8000-000000000183', '00000000-0000-4000-8000-000000000181', '00000000-0000-4000-8000-000000000182', 'RBS Pilot');
    INSERT INTO work.tasks (id, project_id, title, task_type, status)
    VALUES ('00000000-0000-4000-8000-000000000184', '00000000-0000-4000-8000-000000000183', 'Safe pilot', 'DEVELOPMENT', 'IN_PROGRESS');
    INSERT INTO integration.domain_systems (
      id, name, system_type, source_of_truth, maturity, integration_owner_id,
      repository_reference, workroot_reference, credential_reference, capabilities
    ) VALUES (
      'rbs-homes', 'RBS Homes', 'PUBLIC_PLATFORM', 'DOMAIN_SYSTEM', 'I2', 'human-owner',
      'registry://rbs/repository', 'workroot://rbs', 'secretref://rbs/read',
      ARRAY['READ_SYSTEM_STATUS']
    );
    INSERT INTO integration.rbs_admin_pilots (
      id, version, project_id, task_id, system_id, repository_reference,
      workroot_reference, stage, status
    ) VALUES (
      'pilot-rbs-118', 'pilot-v1', '00000000-0000-4000-8000-000000000183',
      '00000000-0000-4000-8000-000000000184', 'rbs-homes',
      'registry://rbs/repository', 'workroot://rbs', 'REQUEST', 'ACTIVE'
    );
    INSERT INTO integration.pilot_evidence (
      id, pilot_id, evidence_ref, source_system_id, source_record_id,
      project_id, task_id, correlation_id, capability, version, health,
      environment_name, deployment_readiness, observed_at, captured_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000185', 'pilot-rbs-118', 'evidence-status',
      'rbs-homes', 'status:rbs', '00000000-0000-4000-8000-000000000183',
      '00000000-0000-4000-8000-000000000184', 'corr-118', 'READ_SYSTEM_STATUS',
      'pilot-v1', 'HEALTHY', 'PREVIEW', 'READY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
  `);
  await assert.rejects(() =>
    database.exec(`
      UPDATE integration.pilot_evidence
      SET source_record_id = 'tampered'
      WHERE id = '00000000-0000-4000-8000-000000000185'
    `),
  );
  await assert.rejects(() =>
    database.exec(`
      INSERT INTO integration.domain_systems (
        id, name, system_type, source_of_truth, maturity, integration_owner_id,
        repository_reference, workroot_reference, credential_reference, capabilities
      ) VALUES (
        'unsafe', 'Unsafe', 'PUBLIC_PLATFORM', 'DOMAIN_SYSTEM', 'I2', 'human-owner',
        'registry://unsafe/repository', 'workroot://unsafe', 'secretref://unsafe/read',
        ARRAY['WRITE_PRODUCTION']
      )
    `),
  );
});

test("creates generalized Control Plane registry, scope, and bounded-loop persistence", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const result = await applyMigrations(
    database,
    await loadMigrations(migrationsDirectory),
  );
  assert.ok(result.applied.includes("0012_core_control_plane_generalization"));

  const tables = await database.query<{ qualified_name: string }>(`
    SELECT table_schema || '.' || table_name AS qualified_name
    FROM information_schema.tables
    WHERE (table_schema, table_name) IN (
      ('integration', 'systems'),
      ('operations', 'system_environments'),
      ('operations', 'repositories'),
      ('operations', 'workroots'),
      ('operations', 'runner_system_bindings'),
      ('operations', 'runner_workroot_bindings'),
      ('core', 'project_system_links'),
      ('execution', 'control_loop_policies'),
      ('execution', 'control_loop_runs')
    )
    ORDER BY qualified_name
  `);
  assert.deepEqual(
    tables.rows.map(({ qualified_name }) => qualified_name),
    [
      "core.project_system_links",
      "execution.control_loop_policies",
      "execution.control_loop_runs",
      "integration.systems",
      "operations.repositories",
      "operations.runner_system_bindings",
      "operations.runner_workroot_bindings",
      "operations.system_environments",
      "operations.workroots",
    ],
  );

  await assert.rejects(
    database.exec(`
      INSERT INTO integration.systems (
        id, name, system_type, source_of_truth, lifecycle,
        owner_actor_type, owner_actor_id
      ) VALUES (
        'crm', 'CRM', 'DOMAIN_APPLICATION', 'MAOS', 'ACTIVE',
        'HUMAN', 'human-owner'
      )
    `),
    /check constraint/i,
  );
});

test("persists only governed Marketing references and immutable observations", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(database, await loadMigrations(migrationsDirectory));
  const tables = await database.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'integration' AND table_name IN (
      'marketing_team_members', 'marketing_campaign_links', 'marketing_observations'
    ) ORDER BY table_name
  `);
  assert.deepEqual(
    tables.rows.map(({ table_name }) => table_name),
    [
      "marketing_campaign_links",
      "marketing_observations",
      "marketing_team_members",
    ],
  );
  await database.exec(`
    INSERT INTO integration.systems (id, name, system_type, source_of_truth, lifecycle, owner_actor_type, owner_actor_id)
    VALUES ('marketing-automation', 'Marketing Automation', 'AI_AGENT_SYSTEM', 'DOMAIN_SYSTEM', 'ACTIVE', 'HUMAN', 'owner');
    INSERT INTO core.organizations (id, name, slug) VALUES ('00000000-0000-4000-8000-000000000401', 'Marketing Org', 'marketing-org');
    INSERT INTO core.departments (id, organization_id, name) VALUES ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000401', 'Marketing');
    INSERT INTO core.projects (id, organization_id, department_id, name) VALUES ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000402', 'Campaign visibility');
    INSERT INTO work.tasks (id, project_id, title, task_type, status) VALUES ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000403', 'Observe campaign', 'DEVELOPMENT', 'IN_PROGRESS');
    INSERT INTO integration.marketing_team_members (system_id, external_agent_id, role, current_work_reference, health, status)
    VALUES ('marketing-automation', 'marketing-cmo', 'CMO', 'marketing://agents/cmo', 'HEALTHY', 'AVAILABLE');
    INSERT INTO integration.marketing_campaign_links (system_id, campaign_id, project_id, task_id, source_reference, external_version, target_hash)
    VALUES ('marketing-automation', 'campaign-4', '00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000404', 'marketing://campaigns/campaign-4', 'v4', 'sha256:${"a".repeat(64)}');
    INSERT INTO integration.marketing_observations (system_id, campaign_id, source_reference, external_version, target_hash, campaign_status, qa_state, approval_state, publisher_state, evidence_references, correlation_id, observed_at)
    VALUES ('marketing-automation', 'campaign-4', 'marketing://campaigns/campaign-4', 'v4', 'sha256:${"a".repeat(64)}', 'WAITING_APPROVAL', 'PASS', 'APPROVED', 'WAITING_AUTHORIZATION', ARRAY['evidence://marketing/qa'], 'corr-4', CURRENT_TIMESTAMP);
  `);
  await assert.rejects(
    () =>
      database.exec(
        "UPDATE integration.marketing_observations SET qa_state = 'REVISE'",
      ),
    /append-only/i,
  );
  await assert.rejects(
    () =>
      database.exec(
        "INSERT INTO integration.marketing_team_members (system_id, external_agent_id, role, current_work_reference, health, status) VALUES ('marketing-automation', 'other-cmo', 'CMO', 'marketing://agents/other', 'HEALTHY', 'AVAILABLE')",
      ),
    /unique constraint/i,
  );
});

test("persists only internal AI-MLS references and immutable observation metadata", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(database, await loadMigrations(migrationsDirectory));
  const tables = await database.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'integration' AND table_name IN (
      'ai_mls_resource_links', 'ai_mls_intake_observations', 'ai_mls_candidate_references'
    ) ORDER BY table_name
  `);
  assert.deepEqual(
    tables.rows.map(({ table_name }) => table_name),
    [
      "ai_mls_candidate_references",
      "ai_mls_intake_observations",
      "ai_mls_resource_links",
    ],
  );
  await database.exec(`
    INSERT INTO integration.systems (id, name, system_type, source_of_truth, lifecycle, owner_actor_type, owner_actor_id)
    VALUES ('ai-mls', 'AI-MLS', 'INTERNAL_PLATFORM', 'DOMAIN_SYSTEM', 'ACTIVE', 'HUMAN', 'owner');
    INSERT INTO core.organizations (id, name, slug) VALUES ('00000000-0000-4000-8000-000000000501', 'AI MLS Org', 'ai-mls-org');
    INSERT INTO core.departments (id, organization_id, name) VALUES ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000501', 'Intelligence');
    INSERT INTO core.projects (id, organization_id, department_id, name) VALUES ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000502', 'Internal intelligence');
    INSERT INTO work.tasks (id, project_id, title, task_type, status) VALUES ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000503', 'Observe AI-MLS', 'ANALYSIS', 'IN_PROGRESS');
    INSERT INTO integration.ai_mls_resource_links (system_id, resource_id, project_id, task_id, source_reference, external_version, target_hash)
    VALUES ('ai-mls', 'feed', '00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000504', 'ai-mls://sources/feed', 'v5', 'sha256:${"d".repeat(64)}');
    INSERT INTO integration.ai_mls_candidate_references (system_id, resource_id, candidate_id, source_reference, verification_state, contact_state, consent_state, duplicate_state, freshness, evidence_references, correlation_id, observed_at)
    VALUES ('ai-mls', 'feed', 'candidate-5', 'ai-mls://candidates/candidate-5', 'VERIFIED', 'CONTACTED', 'GRANTED', 'UNIQUE', 'FRESH', ARRAY['evidence://ai-mls/candidate-5'], 'corr-5', CURRENT_TIMESTAMP);
  `);
  await assert.rejects(
    () =>
      database.exec(
        "UPDATE integration.ai_mls_candidate_references SET freshness = 'STALE'",
      ),
    /append-only/i,
  );
  await assert.rejects(
    () =>
      database.exec(
        `INSERT INTO integration.ai_mls_candidate_references (system_id, resource_id, candidate_id, source_reference, verification_state, contact_state, consent_state, duplicate_state, freshness, publication_eligibility_informational_only, evidence_references, correlation_id, observed_at) VALUES ('ai-mls', 'feed', 'unsafe', 'ai-mls://candidates/unsafe', 'VERIFIED', 'CONTACTED', 'GRANTED', 'UNIQUE', 'FRESH', false, ARRAY['evidence://unsafe'], 'corr-unsafe', CURRENT_TIMESTAMP)`,
      ),
    /check constraint/i,
  );
});

test("stores only CRM references and privacy-safe operational metadata", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(database, await loadMigrations(migrationsDirectory));
  const tables = await database.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'integration' AND table_name LIKE 'crm_%'
    ORDER BY table_name
  `);
  assert.deepEqual(
    tables.rows.map(({ table_name }) => table_name),
    [
      "crm_capture_candidates",
      "crm_employee_scope_references",
      "crm_work_observations",
    ],
  );
  await database.exec(`
    INSERT INTO integration.systems (id, name, system_type, source_of_truth, lifecycle, owner_actor_type, owner_actor_id)
    VALUES ('crm', 'CRM', 'DOMAIN_APPLICATION', 'DOMAIN_SYSTEM', 'ACTIVE', 'HUMAN', 'owner');
    INSERT INTO core.organizations (id, name, slug) VALUES ('00000000-0000-4000-8000-000000000601', 'CRM Org', 'crm-org');
    INSERT INTO core.departments (id, organization_id, name) VALUES ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000601', 'Brokerage');
    INSERT INTO core.projects (id, organization_id, department_id, name) VALUES ('00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000602', 'CRM integration');
    INSERT INTO integration.crm_employee_scope_references (system_id, employee_id, project_id, source_reference)
    VALUES ('crm', 'employee-1', '00000000-0000-4000-8000-000000000603', 'crm://employees/employee-1');
    INSERT INTO integration.crm_capture_candidates (system_id, employee_id, candidate_id, original_input_reference, deduplication_key, confidence, review_required, evidence_references, correlation_id)
    VALUES ('crm', 'employee-1', 'candidate-1', 'crm://captures/capture-1', 'dedupe-1', 0.82, true, ARRAY['evidence://crm/capture-1'], 'corr-1');
    INSERT INTO integration.crm_work_observations (system_id, employee_id, source_reference, workload, tasks_due_today, overdue_tasks, upcoming_viewings, contract_deadlines, blockers, evidence_references, correlation_id, observed_at)
    VALUES ('crm', 'employee-1', 'crm://workspaces/employee-1/today', 'BALANCED', 4, 1, 2, 1, 1, ARRAY['evidence://crm/today'], 'corr-1', CURRENT_TIMESTAMP);
  `);
  await assert.rejects(
    () =>
      database.exec(
        "UPDATE integration.crm_work_observations SET blockers = 0",
      ),
    /append-only/i,
  );
  await assert.rejects(
    () =>
      database.exec(
        "INSERT INTO integration.crm_capture_candidates (system_id, employee_id, candidate_id, original_input_reference, deduplication_key, confidence, review_required, evidence_references, correlation_id) VALUES ('crm', 'employee-1', 'candidate-private', 'crm://captures/private', 'dedupe-private', 1, false, ARRAY['evidence://crm/private'], 'corr-private')",
      ),
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
      "0006_skill_tool_mcp_foundation",
      "0007_local_execution_bridge_foundation",
      "0008_ai_memory_gateway_integration",
      "0009_observability_audit_foundation",
      "0010_release_deployment_foundation",
      "0011_rbs_admin_pilot_foundation",
      "0012_core_control_plane_generalization",
      "0013_ai_memory_knowledge_integration",
      "0014_marketing_automation_integration",
      "0015_ai_mls_integration",
      "0016_crm_human_work_integration",
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

test("reports the applied schema version and rolls back a failed migration", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(database, await loadMigrations(migrationsDirectory));
  const version = await getSchemaVersion(database);
  assert.equal(version.applied_count, 16);
  assert.equal(version.latest_id, "0016_crm_human_work_integration");
  assert.match(version.latest_checksum, /^[a-f0-9]{64}$/);

  await assert.rejects(
    applyMigrations(database, [
      {
        checksum: "f".repeat(64),
        id: "0012_failure_probe",
        sql: "CREATE TABLE core.partial_probe(id text); SELECT * FROM core.missing_probe;",
      },
    ]),
  );
  const partial = await database.query<{ count: string }>(`
    SELECT count(*)::text AS count FROM information_schema.tables
    WHERE table_schema = 'core' AND table_name = 'partial_probe'
  `);
  assert.equal(partial.rows[0]?.count, "0");
});

test("requires lock, fresh verified backup, and recovery strategy for production migrations", () => {
  assert.deepEqual(
    validateMigrationSafety({
      automatic: false,
      backup_age_ms: 30_000,
      backup_status: "VERIFIED",
      destructive: false,
      environment: "PRODUCTION",
      lock_required: true,
      max_backup_age_ms: 60_000,
      recovery_strategy: "FORWARD_FIX",
    }),
    { allowed: true, requires_human_approval: true },
  );
  assert.throws(
    () =>
      validateMigrationSafety({
        automatic: true,
        backup_age_ms: 30_000,
        backup_status: "VERIFIED",
        destructive: true,
        environment: "PRODUCTION",
        lock_required: true,
        max_backup_age_ms: 60_000,
        recovery_strategy: "FORWARD_FIX",
      }),
    /DESTRUCTIVE_AUTO_MIGRATION_FORBIDDEN/,
  );
  assert.throws(
    () =>
      validateMigrationSafety({
        automatic: false,
        backup_age_ms: 90_000,
        backup_status: "VERIFIED",
        destructive: false,
        environment: "PRODUCTION",
        lock_required: true,
        max_backup_age_ms: 60_000,
        recovery_strategy: "FORWARD_FIX",
      }),
    /FRESH_BACKUP_REQUIRED/,
  );
});
