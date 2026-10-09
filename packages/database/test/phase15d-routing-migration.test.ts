import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import {
  applyMigrations,
  loadMigrations,
  openPostgresDatabase,
} from "../src/index.js";
import { withDisposablePostgres } from "../../../scripts/testing/disposable-postgres.js";

const migrationDirectory = resolve("packages/database/migrations");

const expectedTables = [
  "ai_routing_policy_activation_events",
  "ai_routing_policy_versions",
  "ai_routing_specialization_versions",
  "request_routing_candidate_snapshots",
  "request_routing_decision_streams",
  "request_routing_decision_versions",
] as const;

const ids = {
  actor: "00000000-0000-4000-8000-000000000001",
  audit: "00000000-0000-4000-8000-000000000002",
  classification: "00000000-0000-4000-8000-00000000000a",
  department: "00000000-0000-4000-8000-000000000003",
  organization: "00000000-0000-4000-8000-000000000004",
  policy: "00000000-0000-4000-8000-000000000005",
  policyVersion: "00000000-0000-4000-8000-000000000006",
  project: "00000000-0000-4000-8000-000000000007",
  request: "00000000-0000-4000-8000-000000000008",
  decision: "00000000-0000-4000-8000-00000000000b",
  stream: "00000000-0000-4000-8000-000000000009",
} as const;

async function migratedDatabase(t: test.TestContext): Promise<PGlite> {
  const db = new PGlite();
  t.after(async () => db.close());
  await applyMigrations(db, await loadMigrations(migrationDirectory));
  return db;
}

async function seedRequestAndAudit(db: {
  exec(sql: string): Promise<unknown>;
}): Promise<void> {
  await db.exec(`
    INSERT INTO core.organizations (id, name, slug)
    VALUES ('${ids.organization}', 'Phase15D Organization', 'phase15d-organization');
    INSERT INTO core.departments (id, organization_id, name)
    VALUES ('${ids.department}', '${ids.organization}', 'Phase15D Department');
    INSERT INTO core.projects (id, organization_id, department_id, name)
    VALUES ('${ids.project}', '${ids.organization}', '${ids.department}', 'Phase15D Project');
    INSERT INTO audit.audit_records (
      id, actor_type, actor_id, action, target_type, target_id, result,
      request_id, correlation_id, trace_id, span_id, record_hash
    ) VALUES (
      '${ids.audit}', 'SYSTEM', '${ids.actor}', 'ROUTING.CREATE',
      'ROUTING_POLICY', '${ids.policyVersion}', 'SUCCEEDED',
      'phase15d-request', 'phase15d-correlation', 'phase15d-trace',
      'phase15d-span', repeat('a', 64)
    );
    INSERT INTO work.requests (
      id, source_system, source_type, source_ref, source_fingerprint,
      organization_id, project_id, company_scope_ref, project_scope_ref,
      environment, registered_by_actor_type, registered_by_actor_id,
      idempotency_key, input_fingerprint, correlation_id,
      registration_audit_ref
    ) VALUES (
      '${ids.request}', 'MAOS', 'TEST', 'phase15d-request',
      'sha256:' || repeat('b', 64), '${ids.organization}', '${ids.project}',
      'company:test', 'project:test', 'DEVELOPMENT', 'SYSTEM', '${ids.actor}',
      'phase15d-request-key', 'sha256:' || repeat('c', 64),
      'phase15d-correlation', '${ids.audit}'
    );
  `);
}

async function insertPolicy(
  db: PGlite,
  overrides: { lifecycle?: string; purpose?: string; role?: string } = {},
): Promise<void> {
  await db.query(
    `INSERT INTO governance.ai_routing_policy_versions (
      routing_policy_version_id, routing_policy_id, version,
      authority_identifier, lifecycle_intent, canonical_domain,
      routing_purpose, role_class, scope_ref, environment,
      effective_at, content_fingerprint, created_by_actor_type,
      created_by_actor_id, audit_ref
    ) VALUES ($1, $2, 1, 'MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD',
      $3, 'OPERATIONS', $4, $5, 'scope:test', 'STAGING',
      CURRENT_TIMESTAMP, 'sha256:' || repeat('d', 64), 'SYSTEM', $6, $7)`,
    [
      ids.policyVersion,
      ids.policy,
      overrides.lifecycle ?? "ACTIVE",
      overrides.purpose ?? "PRIMARY_EXECUTION",
      overrides.role ?? "EXECUTOR",
      ids.actor,
      ids.audit,
    ],
  );
}

async function seedClassificationAndStream(db: PGlite): Promise<void> {
  await db.exec(`
    INSERT INTO governance.request_classification_versions (
      classification_id, request_id, version, domain_key,
      classification_state, source, routing_disposition, reason_code,
      created_by_actor_type, created_by_actor_id,
      canonical_payload_fingerprint, idempotency_key,
      correlation_id, audit_ref
    ) VALUES (
      '${ids.classification}', '${ids.request}', 1, 'OPERATIONS',
      'PROPOSED', 'DETERMINISTIC_POLICY', 'MAOS_NATIVE', 'TEST_CLASSIFICATION',
      'SYSTEM', '${ids.actor}', 'sha256:' || repeat('2', 64),
      'phase15d-classification-key', 'phase15d-correlation', '${ids.audit}'
    );
    INSERT INTO governance.request_routing_decision_streams (
      routing_decision_stream_id, request_id, routing_purpose,
      created_by_actor_type, created_by_actor_id
    ) VALUES (
      '${ids.stream}', '${ids.request}', 'PRIMARY_EXECUTION',
      'SYSTEM', '${ids.actor}'
    );
  `);
}

async function insertDeniedDecision(
  db: PGlite,
  values: {
    decisionId?: string;
    mode?: string;
    predecessorId?: string | null;
    version?: number;
  } = {},
): Promise<void> {
  await db.query(
    `INSERT INTO governance.request_routing_decision_versions (
      routing_decision_id, routing_decision_stream_id, request_id,
      routing_purpose, routing_version, supersedes_routing_decision_id,
      classification_version_id, canonical_domain, role_class, routing_mode,
      classification_version, classification_state,
      classification_currentness_state, classification_currentness_proof,
      classification_policy_resolution_ref,
      classification_policy_resolution_version,
      routing_policy_version_id, registry_snapshot_ref,
      registry_snapshot_revision, registry_observed_at, registry_fresh_until,
      priority, human_approval_state, development_delegation_state,
      decision_state, decision_reason_codes, staleness_state,
      classification_checked_at,
      policy_checked_at, policy_fresh_until, idempotency_key,
      canonical_intent_fingerprint, correlation_id, audit_ref
    ) VALUES (
      $1, $2, $3, 'PRIMARY_EXECUTION', $4, $5, $6,
      'OPERATIONS', 'EXECUTOR', $7, 1, 'VALIDATED', 'CURRENT',
      'sha256:' || repeat('2', 64),
      '00000000-0000-4000-8000-000000000005', '1',
      $8, 'registry:test', 'revision:test',
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 hour',
      'NORMAL', 'NOT_REQUIRED', 'NOT_APPLICABLE', 'DENIED',
      ARRAY['POLICY_DENIED'], 'CURRENT',
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP + INTERVAL '1 hour',
      $9, 'sha256:' || repeat('3', 64), 'phase15d-correlation', $10
    )`,
    [
      values.decisionId ?? ids.decision,
      ids.stream,
      ids.request,
      values.version ?? 1,
      values.predecessorId ?? null,
      ids.classification,
      values.mode ?? "PRIMARY_EXECUTION",
      ids.policyVersion,
      `phase15d-decision-${values.version ?? 1}`,
      ids.audit,
    ],
  );
}

test("migration 0032 creates the Phase15D routing schema foundation", async (t) => {
  const migrations = await loadMigrations(migrationDirectory);
  assert.equal(
    migrations.at(-1)?.id,
    "0032_phase15d_multi_ai_role_model_routing",
  );

  const db = await migratedDatabase(t);

  const result = await db.query<{ table_name: string }>(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'governance'
      AND table_name = ANY($1::text[])
    ORDER BY table_name
  `,
    [expectedTables],
  );

  assert.deepEqual(
    result.rows.map((row) => row.table_name),
    [...expectedTables].sort(),
  );

  const columns = await db.query<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'governance'
      AND table_name = 'request_routing_decision_versions'
  `);
  const names = new Set(columns.rows.map((row) => row.column_name));
  assert.equal(names.has("classification_fresh_until"), false);
  for (const name of [
    "classification_version",
    "classification_state",
    "classification_currentness_state",
    "classification_currentness_proof",
    "classification_policy_resolution_ref",
    "classification_policy_resolution_version",
  ]) {
    assert.equal(names.has(name), true, name);
  }
});

test("migration 0032 exposes exactly the approved eight composite foreign keys", async (t) => {
  const db = await migratedDatabase(t);
  const result = await db.query<{ conname: string; definition: string }>(
    `
    SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'governance'
      AND r.relname = ANY($1::text[])
      AND c.contype = 'f'
      AND array_length(c.conkey, 1) > 1
    ORDER BY c.conname
  `,
    [expectedTables],
  );

  const expectedNames = [
    "ai_routing_policy_activation_events_policy_fk",
    "ai_routing_policy_versions_predecessor_fk",
    "ai_routing_policy_versions_project_fk",
    "ai_routing_specialization_versions_predecessor_fk",
    "request_routing_decision_versions_approval_fk",
    "request_routing_decision_versions_classification_fk",
    "request_routing_decision_versions_predecessor_fk",
    "request_routing_decision_versions_stream_fk",
  ];
  assert.deepEqual(
    result.rows.map((row) => row.conname),
    expectedNames,
  );
  for (const row of result.rows) {
    assert.match(row.definition, /FOREIGN KEY/);
    assert.match(row.definition, /REFERENCES/);
  }
});

test("migration 0032 freezes role, purpose, mode, lifecycle, staleness, approval, and delegation states", async (t) => {
  const db = await migratedDatabase(t);
  const checks = await db.query<{ definition: string }>(
    `
    SELECT pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'governance'
      AND r.relname = ANY($1::text[])
      AND c.contype = 'c'
  `,
    [expectedTables],
  );
  const definitions = checks.rows.map((row) => row.definition).join("\n");

  for (const value of [
    "PLANNER",
    "EXECUTOR",
    "RESEARCHER",
    "ANALYST",
    "WRITER",
    "REVIEWER",
    "PRIMARY_EXECUTION",
    "FALLBACK",
    "INDEPENDENT_REVIEW",
    "ADVERSARIAL_REVIEW",
    "DRAFT",
    "ACTIVE",
    "SUPERSEDED",
    "RETIRED",
    "CURRENT",
    "STALE_CLASSIFICATION",
    "STALE_POLICY",
    "STALE_REGISTRY",
    "STALE_APPROVAL",
    "STALE_AIDOS",
    "CONFLICTING",
    "NOT_REQUIRED",
    "REQUIRED_MISSING",
    "APPROVED",
    "REJECTED",
    "EXPIRED",
    "REVOKED",
    "STALE",
    "CONSUMED",
    "NOT_APPLICABLE",
    "READY_TO_DELEGATE",
    "AIDOS_UNAVAILABLE",
    "WAITING_AIDOS_ONBOARDING",
  ]) {
    assert.match(definitions, new RegExp(`'${value}'`));
  }
  assert.doesNotMatch(definitions, /DOMAIN_SPECIALIST/);
});

test("migration 0032 creates no authority rows and revokes PUBLIC table privileges", async (t) => {
  const db = await migratedDatabase(t);
  for (const table of expectedTables) {
    const count = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM governance.${table}`,
    );
    assert.equal(count.rows[0]?.count, "0");
  }

  const publicGrants = await db.query<{ count: string }>(
    `
    SELECT count(*)::text AS count
    FROM information_schema.table_privileges
    WHERE table_schema = 'governance'
      AND table_name = ANY($1::text[])
      AND grantee = 'PUBLIC'
  `,
    [expectedTables],
  );
  assert.equal(publicGrants.rows[0]?.count, "0");
});

test("routing streams enforce request binding, purpose uniqueness, coexistence, and immutability", async (t) => {
  const db = await migratedDatabase(t);
  await seedRequestAndAudit(db);

  await assert.rejects(
    db.exec(`INSERT INTO governance.request_routing_decision_streams (
      routing_decision_stream_id, request_id, routing_purpose,
      created_by_actor_type, created_by_actor_id
    ) VALUES (
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      'PRIMARY_EXECUTION', 'SYSTEM', '${ids.actor}'
    )`),
  );

  await db.exec(`INSERT INTO governance.request_routing_decision_streams (
    routing_decision_stream_id, request_id, routing_purpose,
    created_by_actor_type, created_by_actor_id
  ) VALUES
    ('${ids.stream}', '${ids.request}', 'PRIMARY_EXECUTION', 'SYSTEM', '${ids.actor}'),
    ('10000000-0000-4000-8000-000000000003', '${ids.request}', 'INDEPENDENT_REVIEW', 'SYSTEM', '${ids.actor}')`);

  await assert.rejects(
    db.exec(`INSERT INTO governance.request_routing_decision_streams (
      routing_decision_stream_id, request_id, routing_purpose,
      created_by_actor_type, created_by_actor_id
    ) VALUES (
      '10000000-0000-4000-8000-000000000004',
      '${ids.request}', 'PRIMARY_EXECUTION', 'SYSTEM', '${ids.actor}'
    )`),
  );
  await assert.rejects(
    db.exec(`UPDATE governance.request_routing_decision_streams
      SET routing_purpose = 'ADVERSARIAL_REVIEW'
      WHERE routing_decision_stream_id = '${ids.stream}'`),
    /PHASE15D_ROUTING_APPEND_ONLY/,
  );
  await assert.rejects(
    db.exec(`DELETE FROM governance.request_routing_decision_streams
      WHERE routing_decision_stream_id = '${ids.stream}'`),
    /PHASE15D_ROUTING_APPEND_ONLY/,
  );
});

test("policy and specialization chains enforce exact states and immediate predecessors", async (t) => {
  const db = await migratedDatabase(t);
  await seedRequestAndAudit(db);

  await assert.rejects(insertPolicy(db, { role: "DOMAIN_SPECIALIST" }));
  await assert.rejects(insertPolicy(db, { purpose: "FALLBACK" }));
  await assert.rejects(insertPolicy(db, { lifecycle: "DISABLED" }));
  await insertPolicy(db);

  await db.exec(`INSERT INTO governance.ai_routing_policy_activation_events (
    routing_policy_activation_event_id, routing_policy_id,
    routing_policy_version_id, applicability_fingerprint,
    selection_sequence, event_type, actor_type, actor_id,
    reason_code, audit_ref
  ) VALUES (
    '25000000-0000-4000-8000-000000000001', '${ids.policy}',
    '${ids.policyVersion}', 'sha256:' || repeat('4', 64), 1,
    'ACTIVATE', 'SYSTEM', '${ids.actor}', 'POLICY_ACTIVATED', '${ids.audit}'
  )`);
  await assert.rejects(
    db.exec(`INSERT INTO governance.ai_routing_policy_activation_events (
      routing_policy_activation_event_id, routing_policy_id,
      routing_policy_version_id, applicability_fingerprint,
      selection_sequence, event_type, supersedes_activation_event_id,
      actor_type, actor_id, reason_code, audit_ref
    ) VALUES (
      '25000000-0000-4000-8000-000000000002', '${ids.policy}',
      '${ids.policyVersion}', 'sha256:' || repeat('5', 64), 2,
      'RETIRE', '25000000-0000-4000-8000-000000000001',
      'SYSTEM', '${ids.actor}', 'POLICY_RETIRED', '${ids.audit}'
    )`),
    /ROUTING_POLICY_ACTIVATION_PREDECESSOR_INVALID/,
  );

  await assert.rejects(
    db.exec(`INSERT INTO governance.ai_routing_policy_versions (
      routing_policy_version_id, routing_policy_id, version,
      supersedes_policy_version_id, authority_identifier, lifecycle_intent,
      canonical_domain, routing_purpose, role_class, scope_ref, environment,
      effective_at, content_fingerprint, created_by_actor_type,
      created_by_actor_id, audit_ref
    ) VALUES (
      '20000000-0000-4000-8000-000000000001', '${ids.policy}', 2,
      '20000000-0000-4000-8000-000000000002',
      'MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD', 'ACTIVE', 'OPERATIONS',
      'PRIMARY_EXECUTION', 'EXECUTOR', 'scope:test', 'STAGING',
      CURRENT_TIMESTAMP, 'sha256:' || repeat('e', 64), 'SYSTEM',
      '${ids.actor}', '${ids.audit}'
    )`),
  );

  await db.exec(`INSERT INTO governance.ai_routing_specialization_versions (
    specialization_version_id, specialization_id, version,
    routing_policy_version_id, lifecycle, specialization_key,
    canonical_domain, routing_purpose, scope_ref, environment,
    content_fingerprint, audit_ref
  ) VALUES (
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002', 1,
    '${ids.policyVersion}', 'ACTIVE', 'DOMAIN_SPECIALIST_OPERATIONS',
    'OPERATIONS', 'PRIMARY_EXECUTION', 'scope:test', 'STAGING',
    'sha256:' || repeat('f', 64), '${ids.audit}'
  )`);

  await assert.rejects(
    db.exec(`INSERT INTO governance.ai_routing_specialization_versions (
      specialization_version_id, specialization_id, version,
      supersedes_specialization_version_id, routing_policy_version_id,
      lifecycle, specialization_key, canonical_domain, routing_purpose,
      scope_ref, environment, content_fingerprint, audit_ref
    ) VALUES (
      '30000000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000002', 2,
      '30000000-0000-4000-8000-000000000004',
      '${ids.policyVersion}', 'ACTIVE', 'DOMAIN_SPECIALIST_OPERATIONS',
      'OPERATIONS', 'PRIMARY_EXECUTION', 'scope:test', 'STAGING',
      'sha256:' || repeat('1', 64), '${ids.audit}'
    )`),
  );
  await assert.rejects(
    db.exec(`UPDATE governance.ai_routing_policy_versions
      SET lifecycle_intent = 'RETIRED'
      WHERE routing_policy_version_id = '${ids.policyVersion}'`),
    /PHASE15D_ROUTING_APPEND_ONLY/,
  );
});

test("routing decisions enforce mode compatibility, immediate predecessors, and append-only history", async (t) => {
  const db = await migratedDatabase(t);
  await seedRequestAndAudit(db);
  await insertPolicy(db);
  await seedClassificationAndStream(db);

  await assert.rejects(
    insertDeniedDecision(db, {
      decisionId: "40000000-0000-4000-8000-000000000001",
      mode: "ADVERSARIAL_REVIEW",
    }),
  );
  await insertDeniedDecision(db);
  await assert.rejects(
    insertDeniedDecision(db, {
      decisionId: "40000000-0000-4000-8000-000000000002",
      predecessorId: "40000000-0000-4000-8000-000000000003",
      version: 2,
    }),
    /ROUTING_DECISION_PREDECESSOR_INVALID/,
  );
  await assert.rejects(
    db.exec(`UPDATE governance.request_routing_decision_versions
      SET decision_state = 'WAITING'
      WHERE routing_decision_id = '${ids.decision}'`),
    /PHASE15D_ROUTING_APPEND_ONLY/,
  );
  await assert.rejects(
    db.exec(`DELETE FROM governance.request_routing_decision_versions
      WHERE routing_decision_id = '${ids.decision}'`),
    /PHASE15D_ROUTING_APPEND_ONLY/,
  );
});

test(
  "real PostgreSQL applies and replays 0032 and serializes one request-purpose stream",
  { timeout: 120_000 },
  async () => {
    await withDisposablePostgres({}, async (context) => {
      const migrations = await loadMigrations(migrationDirectory);
      const firstDatabase = await openPostgresDatabase(context.migrationUrl);
      const secondDatabase = await openPostgresDatabase(context.migrationUrl);
      try {
        const first = await applyMigrations(firstDatabase, migrations);
        assert.equal(first.applied.length, 32);
        assert.equal(
          first.applied.at(-1),
          "0032_phase15d_multi_ai_role_model_routing",
        );

        const replay = await applyMigrations(firstDatabase, migrations);
        assert.deepEqual(replay, {
          applied: [],
          skipped: migrations.map(({ id }) => id),
        });

        const registry = await firstDatabase.query<{
          checksum: string;
          id: string;
        }>(`
          SELECT id, checksum
          FROM core.schema_migrations
          WHERE id = '0032_phase15d_multi_ai_role_model_routing'
        `);
        assert.deepEqual(registry.rows, [
          {
            checksum:
              "ec3b2b8217c89158c2003e717969e28099717d2e47162b7ae19031b5ad004b4a",
            id: "0032_phase15d_multi_ai_role_model_routing",
          },
        ]);

        await seedRequestAndAudit(firstDatabase);
        const inserts = await Promise.allSettled([
          firstDatabase.exec(`INSERT INTO governance.request_routing_decision_streams (
            routing_decision_stream_id, request_id, routing_purpose,
            created_by_actor_type, created_by_actor_id
          ) VALUES (
            '50000000-0000-4000-8000-000000000001', '${ids.request}',
            'PRIMARY_EXECUTION', 'SYSTEM', '${ids.actor}'
          )`),
          secondDatabase.exec(`INSERT INTO governance.request_routing_decision_streams (
            routing_decision_stream_id, request_id, routing_purpose,
            created_by_actor_type, created_by_actor_id
          ) VALUES (
            '50000000-0000-4000-8000-000000000002', '${ids.request}',
            'PRIMARY_EXECUTION', 'SYSTEM', '${ids.actor}'
          )`),
        ]);
        assert.equal(
          inserts.filter(({ status }) => status === "fulfilled").length,
          1,
        );
        assert.equal(
          inserts.filter(({ status }) => status === "rejected").length,
          1,
        );

        const streams = await firstDatabase.query<{ count: string }>(`
          SELECT count(*)::text AS count
          FROM governance.request_routing_decision_streams
          WHERE request_id = '${ids.request}'
            AND routing_purpose = 'PRIMARY_EXECUTION'
        `);
        assert.equal(streams.rows[0]?.count, "1");
      } finally {
        await secondDatabase.close();
        await firstDatabase.close();
      }
    });
  },
);
