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

const applicabilityFingerprints = {
  DEVELOPMENT:
    "sha256:959feebdd3075ea34a390444cbf73e049f077802e9b7a00bf62b8b2b6f7b1ff1",
  PREVIEW:
    "sha256:6e450423cee477152443c00933ca059d6b3deaf94e6654295c1d379ce6251c20",
  PRODUCTION:
    "sha256:ff014a12ff17a78f8c6560082d5bc1535db038b65e0f720827c4ba2a3f90e33e",
  STAGING:
    "sha256:fb634d033705610ae585bbc3e89570be18b23b7def729cc4cbed3f6f8944a891",
} as const;

const ids = {
  actor: "10000000-0000-4000-8000-000000000001",
  audit: "10000000-0000-4000-8000-000000000002",
  policyA: "10000000-0000-4000-8000-000000000003",
  policyAV1: "10000000-0000-4000-8000-000000000004",
  policyAV2: "10000000-0000-4000-8000-000000000005",
  policyB: "10000000-0000-4000-8000-000000000006",
  policyBV1: "10000000-0000-4000-8000-000000000007",
  activation1: "10000000-0000-4000-8000-000000000008",
  activation2: "10000000-0000-4000-8000-000000000009",
} as const;

async function migratedDatabase(t: test.TestContext): Promise<PGlite> {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(database, await loadMigrations(migrationDirectory));
  await database.exec(`
    INSERT INTO audit.audit_records (
      id, actor_type, actor_id, action, target_type, target_id, result,
      request_id, correlation_id, trace_id, span_id, record_hash
    ) VALUES (
      '${ids.audit}', 'SYSTEM', '${ids.actor}', 'REGISTRY_FRESHNESS_POLICY.TEST',
      'REGISTRY_FRESHNESS_POLICY', '${ids.policyA}', 'SUCCEEDED',
      'phase15b-rfa01', 'phase15b-rfa01', 'phase15b-rfa01-trace',
      'phase15b-rfa01-span', repeat('a', 64)
    );
  `);
  return database;
}

async function insertPolicy(
  database: PGlite,
  input: {
    id?: string;
    policyId?: string;
    version?: number | string;
    predecessor?: string | null;
    authority?: string;
    scope?: string;
    environment?: string;
    maxAgeMs?: number | string;
    lifecycle?: string;
    idempotencyKey?: string;
  } = {},
): Promise<void> {
  await database.query(
    `INSERT INTO governance.registry_freshness_policy_versions (
      registry_freshness_policy_version_id, registry_freshness_policy_id,
      policy_version, supersedes_policy_version_id, authority_identifier,
      registry_scope, environment, max_age_ms, lifecycle_intent, effective_at,
      content_fingerprint, idempotency_key, created_by_actor_type,
      created_by_actor_id, reason_code, audit_ref
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP,
      'sha256:' || repeat('b',64),$10,'SYSTEM',$11,'TEST',$12)`,
    [
      input.id ?? ids.policyAV1,
      input.policyId ?? ids.policyA,
      input.version ?? 1,
      input.predecessor ?? null,
      input.authority ?? "MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD",
      input.scope ?? "PHASE15B_AI_REGISTRY",
      input.environment ?? "STAGING",
      input.maxAgeMs ?? 60_000,
      input.lifecycle ?? "ACTIVE",
      input.idempotencyKey ??
        `policy-${input.policyId ?? ids.policyA}-${input.version ?? 1}`,
      ids.actor,
      ids.audit,
    ],
  );
}

async function insertActivation(
  database: PGlite,
  input: {
    id?: string;
    policyId?: string;
    version?: number;
    sequence?: number;
    eventType?: string;
    predecessor?: string | null;
    environment?: keyof typeof applicabilityFingerprints;
    applicabilityFingerprint?: string;
    eventFingerprintCharacter?: string;
    idempotencyKey?: string;
  } = {},
): Promise<void> {
  await database.query(
    `INSERT INTO governance.registry_freshness_policy_activation_events (
      registry_freshness_policy_activation_event_id,
      registry_freshness_policy_id, registry_freshness_policy_version,
      registry_scope, environment, applicability_fingerprint,
      selection_sequence, event_type, supersedes_activation_event_id,
      event_fingerprint, idempotency_key, authority_identifier,
      actor_type, actor_id, reason_code, audit_ref
    ) VALUES ($1,$2,$3,'PHASE15B_AI_REGISTRY',$11,$12,$4,$5,$6,
      'sha256:' || repeat($7,64),$8,
      'MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD',
      'SYSTEM',$9,'TEST',$10)`,
    [
      input.id ?? ids.activation1,
      input.policyId ?? ids.policyA,
      input.version ?? 1,
      input.sequence ?? 1,
      input.eventType ?? "ACTIVATE",
      input.predecessor ?? null,
      input.eventFingerprintCharacter ?? "d",
      input.idempotencyKey ?? `activation-${input.sequence ?? 1}`,
      ids.actor,
      ids.audit,
      input.environment ?? "STAGING",
      input.applicabilityFingerprint ??
        applicabilityFingerprints[input.environment ?? "STAGING"],
    ],
  );
}

test("applicability fingerprint is canonically derived and caller drift is rejected", async (t) => {
  const database = await migratedDatabase(t);
  const result = await database.query<{
    environment: keyof typeof applicabilityFingerprints;
    fingerprint: string;
  }>(`
    SELECT environment,
      governance.registry_freshness_applicability_fingerprint(
        'PHASE15B_AI_REGISTRY', environment
      ) AS fingerprint
    FROM unnest(ARRAY['DEVELOPMENT','PREVIEW','STAGING','PRODUCTION']) environment
    ORDER BY environment
  `);
  assert.deepEqual(
    Object.fromEntries(
      result.rows.map(({ environment, fingerprint }) => [
        environment,
        fingerprint,
      ]),
    ),
    applicabilityFingerprints,
  );

  await insertPolicy(database);
  await assert.rejects(
    insertActivation(database, {
      applicabilityFingerprint: `sha256:${"0".repeat(64)}`,
    }),
  );
});

test("migration 0033 creates the Registry freshness authority without seeding policy", async (t) => {
  const migrations = await loadMigrations(migrationDirectory);
  assert.equal(
    migrations.some(
      ({ id }) => id === "0033_phase15b_registry_freshness_policy",
    ),
    true,
  );

  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(database, migrations);

  const tables = await database.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'governance'
      AND table_name IN (
        'registry_freshness_policy_versions',
        'registry_freshness_policy_activation_events'
      )
    ORDER BY table_name
  `);
  assert.deepEqual(
    tables.rows.map(({ table_name }) => table_name),
    [
      "registry_freshness_policy_activation_events",
      "registry_freshness_policy_versions",
    ],
  );

  const seeded = await database.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM governance.registry_freshness_policy_versions
  `);
  assert.equal(seeded.rows[0]?.count, "0");
});

test("migration 0033 adds nullable governed Registry lineage to Phase15D evidence", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(database, await loadMigrations(migrationDirectory));

  for (const tableName of [
    "request_routing_decision_versions",
    "request_routing_candidate_snapshots",
  ]) {
    const columns = await database.query<{
      column_name: string;
      is_nullable: string;
    }>(
      `SELECT column_name,is_nullable
         FROM information_schema.columns
        WHERE table_schema='governance' AND table_name=$1
          AND column_name IN (
            'registry_freshness_policy_id',
            'registry_freshness_policy_version',
            'registry_max_age_ms'
          )
        ORDER BY column_name`,
      [tableName],
    );
    assert.deepEqual(columns.rows, [
      {
        column_name: "registry_freshness_policy_id",
        is_nullable: "YES",
      },
      {
        column_name: "registry_freshness_policy_version",
        is_nullable: "YES",
      },
      { column_name: "registry_max_age_ms", is_nullable: "YES" },
    ]);
  }
});

test("activation serialization locks the canonical applicability fingerprint", async (t) => {
  const database = await migratedDatabase(t);
  const definition = await database.query<{ definition: string }>(`
    SELECT pg_get_functiondef(procedure.oid) AS definition
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname='governance'
      AND procedure.proname='guard_registry_freshness_policy_activation_append'
  `);

  assert.match(
    definition.rows[0]?.definition ?? "",
    /pg_advisory_xact_lock\(\s*hashtextextended\(canonical_applicability_fingerprint,\s*0\)/u,
  );
  assert.match(
    definition.rows[0]?.definition ?? "",
    /WHERE applicability_fingerprint = canonical_applicability_fingerprint/u,
  );
});

test("policy versions enforce canonical identity, max age, lineage, and immutability", async (t) => {
  const database = await migratedDatabase(t);
  await insertPolicy(database);

  await assert.rejects(
    insertPolicy(database, {
      id: ids.policyAV2,
      version: 1,
      idempotencyKey: "duplicate-version",
    }),
  );
  await assert.rejects(
    insertPolicy(database, {
      id: ids.policyBV1,
      policyId: ids.policyB,
      authority: "NOT_THE_AUTHORITY",
    }),
  );
  await assert.rejects(
    insertPolicy(database, {
      id: ids.policyBV1,
      policyId: ids.policyB,
      scope: "OTHER_REGISTRY",
    }),
  );
  await assert.rejects(
    insertPolicy(database, {
      id: ids.policyBV1,
      policyId: ids.policyB,
      environment: "OTHER",
    }),
  );
  for (const maxAgeMs of [
    0,
    -1,
    "1.5",
    "9007199254740992",
    "9223372036854775808",
  ]) {
    await assert.rejects(
      insertPolicy(database, {
        id: ids.policyBV1,
        policyId: ids.policyB,
        maxAgeMs,
        idempotencyKey: `invalid-max-${maxAgeMs}`,
      }),
    );
  }
  await assert.rejects(
    insertPolicy(database, {
      id: ids.policyBV1,
      policyId: ids.policyB,
      version: 2,
      predecessor: ids.policyAV1,
    }),
  );

  await database
    .query(
      "UPDATE governance.registry_freshness_policy_versions SET reason_code='OTHER' WHERE registry_freshness_policy_version_id=$1",
      [ids.policyAV1],
    )
    .then(
      () => assert.fail("policy UPDATE must be rejected"),
      () => undefined,
    );
  await database
    .query(
      "DELETE FROM governance.registry_freshness_policy_versions WHERE registry_freshness_policy_version_id=$1",
      [ids.policyAV1],
    )
    .then(
      () => assert.fail("policy DELETE must be rejected"),
      () => undefined,
    );
});

test("activation history serializes exact heads and rejects invalid transitions", async (t) => {
  const database = await migratedDatabase(t);
  await insertPolicy(database);
  await insertPolicy(database, {
    id: ids.policyAV2,
    version: 2,
    predecessor: ids.policyAV1,
  });
  await insertActivation(database);

  await assert.rejects(
    insertActivation(database, {
      id: ids.activation2,
      sequence: 1,
      version: 2,
      idempotencyKey: "duplicate-sequence",
    }),
  );
  await assert.rejects(
    insertActivation(database, {
      id: ids.activation2,
      sequence: 2,
      version: 2,
      eventType: "SUPERSEDE",
      predecessor: "10000000-0000-4000-8000-000000000099",
    }),
  );
  await assert.rejects(
    insertActivation(database, {
      id: ids.activation2,
      sequence: 2,
      version: 2,
      eventType: "ACTIVATE",
      predecessor: ids.activation1,
    }),
  );

  await insertActivation(database, {
    id: ids.activation2,
    sequence: 2,
    version: 2,
    eventType: "SUPERSEDE",
    predecessor: ids.activation1,
  });
  await database
    .query(
      "UPDATE governance.registry_freshness_policy_activation_events SET reason_code='OTHER' WHERE registry_freshness_policy_activation_event_id=$1",
      [ids.activation2],
    )
    .then(
      () => assert.fail("activation UPDATE must be rejected"),
      () => undefined,
    );
  await database
    .query(
      "DELETE FROM governance.registry_freshness_policy_activation_events WHERE registry_freshness_policy_activation_event_id=$1",
      [ids.activation2],
    )
    .then(
      () => assert.fail("activation DELETE must be rejected"),
      () => undefined,
    );
});

test("routing lineage uses an exact composite policy reference and derived freshness", async (t) => {
  const database = await migratedDatabase(t);
  const constraints = await database.query<{
    conname: string;
    definition: string;
  }>(`
    SELECT c.conname,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='governance'
      AND r.relname IN (
        'request_routing_decision_versions',
        'request_routing_candidate_snapshots'
      )
      AND c.conname LIKE '%registry_%'
    ORDER BY c.conname
  `);
  const definitions = new Map(
    constraints.rows.map(({ conname, definition }) => [conname, definition]),
  );
  for (const prefix of ["routing_decision", "routing_candidate"]) {
    assert.match(
      definitions.get(`${prefix}_registry_policy_fk`) ?? "",
      /FOREIGN KEY \(registry_freshness_policy_id, registry_freshness_policy_version\)/u,
    );
    assert.match(
      definitions.get(`${prefix}_registry_lineage_complete`) ?? "",
      /registry_max_age_ms IS NULL/u,
    );
    assert.match(
      definitions.get(`${prefix}_registry_fresh_until_derived`) ?? "",
      /00:00:00\.001/u,
    );
  }
});

test(
  "real PostgreSQL isolates environment lock domains and serializes one canonical applicability head",
  { timeout: 120_000 },
  async () => {
    await withDisposablePostgres({}, async (context) => {
      const first = await openPostgresDatabase(context.migrationUrl);
      const second = await openPostgresDatabase(context.migrationUrl);
      try {
        const migrations = await loadMigrations(migrationDirectory);
        const applied = await applyMigrations(first, migrations);
        assert.equal(applied.applied.length, 37);
        assert.deepEqual(await applyMigrations(first, migrations), {
          applied: [],
          skipped: migrations.map(({ id }) => id),
        });
        await first.exec(`
          INSERT INTO audit.audit_records (
            id,actor_type,actor_id,action,target_type,target_id,result,
            request_id,correlation_id,trace_id,span_id,record_hash
          ) VALUES (
            '${ids.audit}','SYSTEM','${ids.actor}','REGISTRY_FRESHNESS_POLICY.TEST',
            'REGISTRY_FRESHNESS_POLICY','${ids.policyA}','SUCCEEDED',
            'rfa01','rfa01','rfa01-trace','rfa01-span',repeat('a',64)
          );
          INSERT INTO governance.registry_freshness_policy_versions (
            registry_freshness_policy_version_id,registry_freshness_policy_id,
            policy_version,authority_identifier,registry_scope,environment,
            max_age_ms,lifecycle_intent,effective_at,content_fingerprint,
            idempotency_key,created_by_actor_type,created_by_actor_id,reason_code,audit_ref
          ) VALUES
          ('${ids.policyAV1}','${ids.policyA}',1,
            'MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD',
            'PHASE15B_AI_REGISTRY','STAGING',60000,'ACTIVE',CURRENT_TIMESTAMP,
            'sha256:' || repeat('b',64),'policy-a','SYSTEM','${ids.actor}','TEST','${ids.audit}'),
          ('${ids.policyBV1}','${ids.policyB}',1,
            'MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD',
            'PHASE15B_AI_REGISTRY','PREVIEW',60000,'ACTIVE',CURRENT_TIMESTAMP,
            'sha256:' || repeat('c',64),'policy-b','SYSTEM','${ids.actor}','TEST','${ids.audit}'),
          ('10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000011',1,
            'MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD',
            'PHASE15B_AI_REGISTRY','DEVELOPMENT',60000,'ACTIVE',CURRENT_TIMESTAMP,
            'sha256:' || repeat('d',64),'policy-c','SYSTEM','${ids.actor}','TEST','${ids.audit}'),
          ('10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000013',1,
            'MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD',
            'PHASE15B_AI_REGISTRY','DEVELOPMENT',60000,'ACTIVE',CURRENT_TIMESTAMP,
            'sha256:' || repeat('e',64),'policy-d','SYSTEM','${ids.actor}','TEST','${ids.audit}');
        `);

        const insert = (
          database: typeof first,
          eventId: string,
          policyId: string,
          applicabilityFingerprint: string,
          environment: string,
        ) =>
          database.query(
            `INSERT INTO governance.registry_freshness_policy_activation_events (
            registry_freshness_policy_activation_event_id,
            registry_freshness_policy_id,registry_freshness_policy_version,
            registry_scope,environment,applicability_fingerprint,
            selection_sequence,event_type,event_fingerprint,idempotency_key,
            authority_identifier,actor_type,actor_id,reason_code,audit_ref
          ) VALUES ($1,$2,1,'PHASE15B_AI_REGISTRY',$7,
            $3,1,'ACTIVATE',
            'sha256:' || repeat('a',64),$6,
            'MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD',
            'SYSTEM',$4,'TEST',$5)`,
            [
              eventId,
              policyId,
              applicabilityFingerprint,
              ids.actor,
              ids.audit,
              eventId,
              environment,
            ],
          );

        const isolated = await Promise.allSettled([
          insert(
            first,
            ids.activation1,
            ids.policyA,
            applicabilityFingerprints.STAGING,
            "STAGING",
          ),
          insert(
            second,
            ids.activation2,
            ids.policyB,
            applicabilityFingerprints.PREVIEW,
            "PREVIEW",
          ),
        ]);
        assert.equal(
          isolated.filter(({ status }) => status === "fulfilled").length,
          2,
        );

        const serialized = await Promise.allSettled([
          insert(
            first,
            "10000000-0000-4000-8000-000000000014",
            "10000000-0000-4000-8000-000000000011",
            applicabilityFingerprints.DEVELOPMENT,
            "DEVELOPMENT",
          ),
          insert(
            second,
            "10000000-0000-4000-8000-000000000015",
            "10000000-0000-4000-8000-000000000013",
            applicabilityFingerprints.DEVELOPMENT,
            "DEVELOPMENT",
          ),
        ]);
        assert.equal(
          serialized.filter(({ status }) => status === "fulfilled").length,
          1,
        );
        assert.equal(
          serialized.filter(({ status }) => status === "rejected").length,
          1,
        );
        const count = await first.query<{ count: string }>(`
          SELECT count(*)::text AS count
          FROM governance.registry_freshness_policy_activation_events
          WHERE registry_scope='PHASE15B_AI_REGISTRY'
        `);
        assert.equal(count.rows[0]?.count, "3");
      } finally {
        await second.close();
        await first.close();
      }
    });
  },
);
