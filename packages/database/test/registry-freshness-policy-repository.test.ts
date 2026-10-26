import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import {
  applyMigrations,
  loadMigrations,
  openPostgresDatabase,
  PostgresRegistryFreshnessPolicyRepository,
  RoutingContractError,
} from "../src/index.js";
import { withDisposablePostgres } from "../../../scripts/testing/disposable-postgres.js";

const id = (n: string) => `30000000-0000-4000-8000-${n.padStart(12, "0")}`;
const sha = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;

const basePolicy = {
  registryFreshnessPolicyVersionId: id("10"),
  registryFreshnessPolicyId: id("11"),
  policyVersion: 1,
  supersedesPolicyVersionId: null,
  authorityIdentifier:
    "MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD" as const,
  registryScope: "PHASE15B_AI_REGISTRY" as const,
  environment: "STAGING" as const,
  maxAgeMs: 60_000,
  lifecycleIntent: "ACTIVE" as const,
  effectiveAt: "2026-10-11T00:00:00.000Z",
  contentFingerprint: sha("a"),
  idempotencyKey: "policy-1",
  actorType: "HUMAN" as const,
  actorId: id("1"),
  reasonCode: "CREATE_POLICY",
  evidenceRefs: ["evidence:registry-policy:1"],
  correlationId: "correlation-policy-1",
  traceId: "trace-policy-1",
  spanId: "span-policy-1",
};

const firstActivation = {
  registryFreshnessPolicyActivationEventId: id("20"),
  registryFreshnessPolicyId: id("11"),
  policyVersion: 1,
  expectedActivationEventId: null,
  authorityIdentifier: basePolicy.authorityIdentifier,
  registryScope: basePolicy.registryScope,
  environment: basePolicy.environment,
  actorType: "HUMAN" as const,
  actorId: id("1"),
  reasonCode: "ACTIVATE_POLICY",
  evidenceRefs: ["evidence:registry-activation:1"],
  idempotencyKey: "activation-1",
  correlationId: "correlation-activation-1",
  traceId: "trace-activation-1",
  spanId: "span-activation-1",
};

async function fixture(t: test.TestContext) {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(
    database,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  return {
    database,
    repository: new PostgresRegistryFreshnessPolicyRepository(database),
  };
}

test("appends immutable policy versions and reuses only exact replay", async (t) => {
  const { database, repository } = await fixture(t);
  const created = await repository.appendPolicyVersion(basePolicy);
  const replay = await repository.appendPolicyVersion(basePolicy);

  assert.equal(created.outcome, "CREATED");
  assert.equal(replay.outcome, "REUSED");
  assert.equal(replay.policy.policyVersion, 1);
  assert.equal(Object.isFrozen(replay.policy), true);
  assert.equal(Object.isFrozen(replay.policy.evidenceRefs), true);
  assert.equal("idempotencyKey" in replay.policy, false);

  for (const changed of [
    { maxAgeMs: 60_001 },
    { reasonCode: "DRIFTED_REASON" },
    { evidenceRefs: ["evidence:changed"] },
    { correlationId: "correlation-changed" },
    { traceId: "trace-changed" },
    { spanId: "span-changed" },
  ]) {
    await assert.rejects(
      repository.appendPolicyVersion({ ...basePolicy, ...changed }),
      (error) =>
        error instanceof RoutingContractError &&
        error.code === "ROUTING_IDEMPOTENCY_CONFLICT",
    );
  }

  await assert.rejects(
    repository.appendPolicyVersion({
      ...basePolicy,
      registryFreshnessPolicyVersionId: id("12"),
      idempotencyKey: "policy-duplicate-version",
    }),
    /ROUTING_POLICY_CONFLICT/u,
  );
  await assert.rejects(
    database.exec(`UPDATE governance.registry_freshness_policy_versions
      SET max_age_ms=1
      WHERE registry_freshness_policy_version_id='${id("10")}'`),
    /REGISTRY_FRESHNESS_POLICY_APPEND_ONLY/u,
  );
});

test("exact replay fails closed when authority or valid environment drifts", async (t) => {
  const { repository } = await fixture(t);
  assert.equal(
    (await repository.appendPolicyVersion(basePolicy)).outcome,
    "CREATED",
  );
  assert.equal(
    (await repository.appendPolicyVersion(basePolicy)).outcome,
    "REUSED",
  );
  await assert.rejects(
    repository.appendPolicyVersion({
      ...basePolicy,
      authorityIdentifier: "APPLICATION_RUNTIME" as never,
    }),
    /POLICY_DENIED/u,
  );
  await assert.rejects(
    repository.appendPolicyVersion({
      ...basePolicy,
      environment: "PREVIEW",
    }),
    /ROUTING_POLICY_CONFLICT/u,
  );
});

test("requires the exact monotonic same-chain predecessor", async (t) => {
  const { repository } = await fixture(t);
  await repository.appendPolicyVersion(basePolicy);

  await assert.rejects(
    repository.appendPolicyVersion({
      ...basePolicy,
      registryFreshnessPolicyVersionId: id("12"),
      policyVersion: 2,
      supersedesPolicyVersionId: id("99"),
      idempotencyKey: "policy-2-wrong-predecessor",
      contentFingerprint: sha("b"),
    }),
    /ROUTING_POLICY_CONFLICT/u,
  );

  const second = await repository.appendPolicyVersion({
    ...basePolicy,
    registryFreshnessPolicyVersionId: id("12"),
    policyVersion: 2,
    supersedesPolicyVersionId: id("10"),
    idempotencyKey: "policy-2",
    contentFingerprint: sha("b"),
  });
  assert.equal(second.policy.policyVersion, 2);
  assert.equal(second.policy.supersedesPolicyVersionId, id("10"));
});

test("repository rejects maxAgeMs that cannot derive a representable freshUntil", async (t) => {
  const { database, repository } = await fixture(t);
  await assert.rejects(
    repository.appendPolicyVersion({
      ...basePolicy,
      maxAgeMs: 8_640_000_000_000_000,
    }),
    (error) =>
      error instanceof RoutingContractError && error.code === "POLICY_DENIED",
  );
  const count = await database.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM governance.registry_freshness_policy_versions",
  );
  assert.equal(count.rows[0]?.count, "0");
});

test("activation history selects one exact current policy and retirement removes it", async (t) => {
  const { database, repository } = await fixture(t);
  await repository.appendPolicyVersion(basePolicy);
  const activated = await repository.activatePolicy(firstActivation);
  assert.equal(activated.activation.eventType, "ACTIVATE");
  assert.equal(
    (
      await repository.resolveCurrentPolicy({
        registryScope: "PHASE15B_AI_REGISTRY",
        environment: "STAGING",
      })
    ).policyRef,
    id("11"),
  );

  const replacement = {
    ...basePolicy,
    registryFreshnessPolicyVersionId: id("30"),
    registryFreshnessPolicyId: id("31"),
    contentFingerprint: sha("c"),
    idempotencyKey: "policy-replacement",
  };
  await repository.appendPolicyVersion(replacement);
  const superseded = await repository.activatePolicy({
    ...firstActivation,
    registryFreshnessPolicyActivationEventId: id("21"),
    registryFreshnessPolicyId: id("31"),
    expectedActivationEventId:
      activated.activation.registryFreshnessPolicyActivationEventId,
    reasonCode: "SUPERSEDE_POLICY",
    evidenceRefs: ["evidence:registry-activation:2"],
    idempotencyKey: "activation-2",
    correlationId: "correlation-activation-2",
    traceId: "trace-activation-2",
    spanId: "span-activation-2",
  });
  assert.equal(superseded.activation.eventType, "SUPERSEDE");
  assert.equal(
    (
      await repository.resolveCurrentPolicy({
        registryScope: "PHASE15B_AI_REGISTRY",
        environment: "STAGING",
      })
    ).policyRef,
    id("31"),
  );

  const retired = await repository.retireCurrentPolicy({
    registryFreshnessPolicyActivationEventId: id("22"),
    expectedActivationEventId:
      superseded.activation.registryFreshnessPolicyActivationEventId,
    expectedPolicyId: id("31"),
    expectedPolicyVersion: 1,
    authorityIdentifier: basePolicy.authorityIdentifier,
    registryScope: basePolicy.registryScope,
    environment: basePolicy.environment,
    actorType: "HUMAN",
    actorId: id("1"),
    reasonCode: "RETIRE_POLICY",
    evidenceRefs: ["evidence:registry-retirement:1"],
    idempotencyKey: "retirement-1",
    correlationId: "correlation-retirement-1",
    traceId: "trace-retirement-1",
    spanId: "span-retirement-1",
  });
  assert.equal(retired.activation.eventType, "RETIRE");
  await assert.rejects(
    repository.resolveCurrentPolicy({
      registryScope: "PHASE15B_AI_REGISTRY",
      environment: "STAGING",
    }),
    /ROUTING_POLICY_MISSING/u,
  );
  assert.deepEqual(
    (
      await repository.readActivationHistory({
        registryScope: "PHASE15B_AI_REGISTRY",
        environment: "STAGING",
      })
    ).map(({ eventType }) => eventType),
    ["ACTIVATE", "SUPERSEDE", "RETIRE"],
  );
  assert.equal(
    (await repository.findPolicyVersion(id("30")))?.maxAgeMs,
    60_000,
  );
  assert.equal(
    (await repository.findPolicyVersion(id("10")))?.lifecycleIntent,
    "ACTIVE",
  );
  assert.equal(
    (await repository.findPolicyVersion(id("30")))?.lifecycleIntent,
    "ACTIVE",
  );

  const audit = await database.query<{
    action: string;
    evidence_refs: string[];
    metadata: Record<string, unknown>;
  }>(
    "SELECT action,evidence_refs,metadata FROM audit.audit_records WHERE id=$1",
    [retired.auditRef],
  );
  assert.equal(audit.rows[0]?.action, "REGISTRY_FRESHNESS_POLICY.RETIRED");
  assert.deepEqual(audit.rows[0]?.evidence_refs, [
    "evidence:registry-retirement:1",
  ]);
  assert.equal(audit.rows[0]?.metadata.reason_code, "RETIRE_POLICY");
});

test("activation and retirement exact replay are deterministic and drift fails closed", async (t) => {
  const { database, repository } = await fixture(t);
  await repository.appendPolicyVersion(basePolicy);
  assert.equal(
    (await repository.activatePolicy(firstActivation)).outcome,
    "CREATED",
  );
  assert.equal(
    (await repository.activatePolicy(firstActivation)).outcome,
    "REUSED",
  );
  for (const changed of [
    { reasonCode: "DRIFTED_REASON" },
    { evidenceRefs: ["evidence:changed"] },
    { expectedActivationEventId: id("99") },
  ]) {
    await assert.rejects(
      repository.activatePolicy({ ...firstActivation, ...changed }),
      /ROUTING_IDEMPOTENCY_CONFLICT/u,
    );
  }
  const retirement = {
    registryFreshnessPolicyActivationEventId: id("22"),
    expectedActivationEventId:
      firstActivation.registryFreshnessPolicyActivationEventId,
    expectedPolicyId: basePolicy.registryFreshnessPolicyId,
    expectedPolicyVersion: basePolicy.policyVersion,
    authorityIdentifier: basePolicy.authorityIdentifier,
    registryScope: basePolicy.registryScope,
    environment: basePolicy.environment,
    actorType: "HUMAN" as const,
    actorId: id("1"),
    reasonCode: "RETIRE_POLICY",
    evidenceRefs: ["evidence:registry-retirement:1"],
    idempotencyKey: "retirement-1",
    correlationId: "correlation-retirement-1",
    traceId: "trace-retirement-1",
    spanId: "span-retirement-1",
  };
  assert.equal(
    (await repository.retireCurrentPolicy(retirement)).outcome,
    "CREATED",
  );
  assert.equal(
    (await repository.retireCurrentPolicy(retirement)).outcome,
    "REUSED",
  );
  await assert.rejects(
    repository.retireCurrentPolicy({
      ...retirement,
      reasonCode: "DRIFTED_RETIREMENT_REASON",
    }),
    /ROUTING_IDEMPOTENCY_CONFLICT/u,
  );
  const count = await database.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM governance.registry_freshness_policy_activation_events",
  );
  assert.equal(count.rows[0]?.count, "2");
});

test("zero current policy and an ambiguous latest history fail closed", async (t) => {
  const { repository } = await fixture(t);
  await assert.rejects(
    repository.resolveCurrentPolicy({
      registryScope: "PHASE15B_AI_REGISTRY",
      environment: "STAGING",
    }),
    /ROUTING_POLICY_MISSING/u,
  );

  const ambiguousDatabase = {
    exec: async () => undefined,
    query: async <Row>() => ({
      rows: [{ event_type: "ACTIVATE" }, { event_type: "ACTIVATE" }] as Row[],
    }),
  };
  await assert.rejects(
    new PostgresRegistryFreshnessPolicyRepository(
      ambiguousDatabase,
    ).resolveCurrentPolicy({
      registryScope: "PHASE15B_AI_REGISTRY",
      environment: "STAGING",
    }),
    /ROUTING_POLICY_CONFLICT/u,
  );
});

test(
  "real PostgreSQL serializes competing activation heads without split brain",
  { timeout: 120_000 },
  async () => {
    await withDisposablePostgres({}, async (postgres) => {
      const firstDatabase = await openPostgresDatabase(postgres.migrationUrl);
      const secondDatabase = await openPostgresDatabase(postgres.migrationUrl);
      try {
        await applyMigrations(
          firstDatabase,
          await loadMigrations(resolve("packages/database/migrations")),
        );
        const first = new PostgresRegistryFreshnessPolicyRepository(
          firstDatabase,
        );
        const second = new PostgresRegistryFreshnessPolicyRepository(
          secondDatabase,
        );
        await first.appendPolicyVersion(basePolicy);
        const initial = await first.activatePolicy(firstActivation);
        for (const [suffix, environment] of [
          ["31", "STAGING"],
          ["41", "STAGING"],
          ["51", "PREVIEW"],
        ] as const) {
          await first.appendPolicyVersion({
            ...basePolicy,
            registryFreshnessPolicyVersionId: id(`${suffix}0`),
            registryFreshnessPolicyId: id(suffix),
            environment,
            contentFingerprint: sha(suffix),
            idempotencyKey: `policy-${suffix}`,
          });
        }
        const compete = (
          repository: PostgresRegistryFreshnessPolicyRepository,
          suffix: string,
        ) =>
          repository.activatePolicy({
            ...firstActivation,
            registryFreshnessPolicyActivationEventId: id(`${suffix}1`),
            registryFreshnessPolicyId: id(suffix),
            expectedActivationEventId:
              initial.activation.registryFreshnessPolicyActivationEventId,
            idempotencyKey: `activation-${suffix}`,
            correlationId: `correlation-${suffix}`,
            traceId: `trace-${suffix}`,
            spanId: `span-${suffix}`,
          });
        const results = await Promise.allSettled([
          compete(first, "31"),
          compete(second, "41"),
        ]);
        assert.equal(
          results.filter(({ status }) => status === "fulfilled").length,
          1,
        );
        assert.equal(
          results.filter(({ status }) => status === "rejected").length,
          1,
        );
        const current = await first.resolveCurrentPolicy({
          registryScope: "PHASE15B_AI_REGISTRY",
          environment: "STAGING",
        });
        assert.ok([id("31"), id("41")].includes(current.policyRef));

        const preview = await second.activatePolicy({
          ...firstActivation,
          registryFreshnessPolicyActivationEventId: id("511"),
          registryFreshnessPolicyId: id("51"),
          expectedActivationEventId: null,
          environment: "PREVIEW",
          idempotencyKey: "activation-preview",
          correlationId: "correlation-preview",
          traceId: "trace-preview",
          spanId: "span-preview",
        });
        assert.equal(preview.outcome, "CREATED");
      } finally {
        await Promise.all([firstDatabase.close(), secondDatabase.close()]);
      }
    });
  },
);

test(
  "real PostgreSQL preserves retirement idempotency, audit linkage, and rollback atomicity",
  { timeout: 120_000 },
  async () => {
    await withDisposablePostgres({}, async (postgres) => {
      const database = await openPostgresDatabase(postgres.migrationUrl);
      try {
        await applyMigrations(
          database,
          await loadMigrations(resolve("packages/database/migrations")),
        );
        const repository = new PostgresRegistryFreshnessPolicyRepository(
          database,
        );
        const count = async (sql: string, values: unknown[]) => {
          const result = await database.query<{ count: number }>(sql, values);
          return result.rows[0]?.count ?? -1;
        };
        const assertAudit = async (
          auditRef: string,
          action: string,
          evidenceRefs: readonly string[],
        ) => {
          const result = await database.query<{
            action: string;
            evidence_refs: string[];
          }>(
            "SELECT action,evidence_refs FROM audit.audit_records WHERE id=$1",
            [auditRef],
          );
          assert.equal(result.rows.length, 1);
          assert.equal(result.rows[0]?.action, action);
          assert.deepEqual(result.rows[0]?.evidence_refs, evidenceRefs);
        };

        const appended = await repository.appendPolicyVersion(basePolicy);
        assert.equal(appended.outcome, "CREATED");
        assert.equal(
          (await repository.appendPolicyVersion(basePolicy)).outcome,
          "REUSED",
        );
        await assert.rejects(
          repository.appendPolicyVersion({
            ...basePolicy,
            authorityIdentifier: "APPLICATION_RUNTIME" as never,
          }),
          /POLICY_DENIED/u,
        );
        await assert.rejects(
          repository.appendPolicyVersion({
            ...basePolicy,
            environment: "PREVIEW",
          }),
          /ROUTING_POLICY_CONFLICT/u,
        );
        await assertAudit(
          appended.auditRef,
          "REGISTRY_FRESHNESS_POLICY.VERSION_APPENDED",
          basePolicy.evidenceRefs,
        );

        const activated = await repository.activatePolicy(firstActivation);
        assert.equal(activated.outcome, "CREATED");
        assert.equal(
          (await repository.activatePolicy(firstActivation)).outcome,
          "REUSED",
        );
        await assertAudit(
          activated.auditRef,
          "REGISTRY_FRESHNESS_POLICY.ACTIVATED",
          firstActivation.evidenceRefs,
        );

        const replacementPolicy = {
          ...basePolicy,
          registryFreshnessPolicyVersionId: id("60"),
          registryFreshnessPolicyId: id("61"),
          contentFingerprint: sha("f"),
          evidenceRefs: ["evidence:registry-policy:replacement"],
          idempotencyKey: "policy-real-replacement",
          correlationId: "correlation-real-replacement",
          traceId: "trace-real-replacement",
          spanId: "span-real-replacement",
        };
        const replacementAppended =
          await repository.appendPolicyVersion(replacementPolicy);
        const supersessionInput = {
          ...firstActivation,
          registryFreshnessPolicyActivationEventId: id("62"),
          registryFreshnessPolicyId:
            replacementPolicy.registryFreshnessPolicyId,
          expectedActivationEventId:
            activated.activation.registryFreshnessPolicyActivationEventId,
          reasonCode: "SUPERSEDE_POLICY",
          evidenceRefs: ["evidence:registry-activation:supersede"],
          idempotencyKey: "activation-real-supersede",
          correlationId: "correlation-real-supersede",
          traceId: "trace-real-supersede",
          spanId: "span-real-supersede",
        };
        const superseded = await repository.activatePolicy(supersessionInput);
        assert.equal(superseded.activation.eventType, "SUPERSEDE");
        assert.equal(
          (
            await repository.resolveCurrentPolicy({
              registryScope: basePolicy.registryScope,
              environment: basePolicy.environment,
            })
          ).policyRef,
          replacementPolicy.registryFreshnessPolicyId,
        );
        await assertAudit(
          replacementAppended.auditRef,
          "REGISTRY_FRESHNESS_POLICY.VERSION_APPENDED",
          replacementPolicy.evidenceRefs,
        );
        await assertAudit(
          superseded.auditRef,
          "REGISTRY_FRESHNESS_POLICY.ACTIVATED",
          supersessionInput.evidenceRefs,
        );

        await database.exec(`
          CREATE FUNCTION governance.reject_rfa02_policy_for_test()
          RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
            IF NEW.idempotency_key='policy-rollback' THEN
              RAISE EXCEPTION 'bounded policy rollback test rejection';
            END IF;
            RETURN NEW;
          END $$;
          CREATE TRIGGER reject_rfa02_policy_for_test
            BEFORE INSERT ON governance.registry_freshness_policy_versions
            FOR EACH ROW EXECUTE FUNCTION governance.reject_rfa02_policy_for_test();
          CREATE FUNCTION governance.reject_rfa02_activation_for_test()
          RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
            IF NEW.idempotency_key IN ('activation-rollback','retirement-rollback') THEN
              RAISE EXCEPTION 'bounded activation rollback test rejection';
            END IF;
            RETURN NEW;
          END $$;
          CREATE TRIGGER reject_rfa02_activation_for_test
            BEFORE INSERT ON governance.registry_freshness_policy_activation_events
            FOR EACH ROW EXECUTE FUNCTION governance.reject_rfa02_activation_for_test();
        `);

        const rollbackPolicy = {
          ...basePolicy,
          registryFreshnessPolicyVersionId: id("70"),
          registryFreshnessPolicyId: id("71"),
          contentFingerprint: sha("7"),
          idempotencyKey: "policy-rollback",
          correlationId: "correlation-policy-rollback",
          traceId: "trace-policy-rollback",
          spanId: "span-policy-rollback",
        };
        await assert.rejects(
          repository.appendPolicyVersion(rollbackPolicy),
          /bounded policy rollback test rejection/u,
        );
        assert.equal(
          await count(
            "SELECT count(*)::int AS count FROM governance.registry_freshness_policy_versions WHERE idempotency_key=$1",
            [rollbackPolicy.idempotencyKey],
          ),
          0,
        );
        assert.equal(
          await count(
            "SELECT count(*)::int AS count FROM audit.audit_records WHERE correlation_id=$1",
            [rollbackPolicy.correlationId],
          ),
          0,
        );

        const rollbackActivationPolicy = {
          ...basePolicy,
          registryFreshnessPolicyVersionId: id("80"),
          registryFreshnessPolicyId: id("81"),
          contentFingerprint: sha("8"),
          idempotencyKey: "policy-activation-rollback-target",
          correlationId: "correlation-activation-rollback-target",
          traceId: "trace-activation-rollback-target",
          spanId: "span-activation-rollback-target",
        };
        await repository.appendPolicyVersion(rollbackActivationPolicy);
        const rollbackActivation = {
          ...firstActivation,
          registryFreshnessPolicyActivationEventId: id("82"),
          registryFreshnessPolicyId:
            rollbackActivationPolicy.registryFreshnessPolicyId,
          expectedActivationEventId:
            superseded.activation.registryFreshnessPolicyActivationEventId,
          reasonCode: "ROLLBACK_ACTIVATION",
          evidenceRefs: ["evidence:activation:rollback"],
          idempotencyKey: "activation-rollback",
          correlationId: "correlation-activation-rollback",
          traceId: "trace-activation-rollback",
          spanId: "span-activation-rollback",
        };
        await assert.rejects(
          repository.activatePolicy(rollbackActivation),
          /bounded activation rollback test rejection/u,
        );
        assert.equal(
          await count(
            "SELECT count(*)::int AS count FROM governance.registry_freshness_policy_activation_events WHERE idempotency_key=$1",
            [rollbackActivation.idempotencyKey],
          ),
          0,
        );
        assert.equal(
          await count(
            "SELECT count(*)::int AS count FROM audit.audit_records WHERE correlation_id=$1",
            [rollbackActivation.correlationId],
          ),
          0,
        );
        assert.equal(
          (
            await repository.resolveCurrentPolicy({
              registryScope: basePolicy.registryScope,
              environment: basePolicy.environment,
            })
          ).policyRef,
          replacementPolicy.registryFreshnessPolicyId,
        );

        const rollbackRetirement = {
          registryFreshnessPolicyActivationEventId: id("83"),
          expectedActivationEventId:
            superseded.activation.registryFreshnessPolicyActivationEventId,
          expectedPolicyId: replacementPolicy.registryFreshnessPolicyId,
          expectedPolicyVersion: replacementPolicy.policyVersion,
          authorityIdentifier: basePolicy.authorityIdentifier,
          registryScope: basePolicy.registryScope,
          environment: basePolicy.environment,
          actorType: "HUMAN" as const,
          actorId: id("1"),
          reasonCode: "ROLLBACK_RETIREMENT",
          evidenceRefs: ["evidence:retirement:rollback"],
          idempotencyKey: "retirement-rollback",
          correlationId: "correlation-retirement-rollback",
          traceId: "trace-retirement-rollback",
          spanId: "span-retirement-rollback",
        };
        await assert.rejects(
          repository.retireCurrentPolicy(rollbackRetirement),
          /bounded activation rollback test rejection/u,
        );
        assert.equal(
          await count(
            "SELECT count(*)::int AS count FROM governance.registry_freshness_policy_activation_events WHERE idempotency_key=$1",
            [rollbackRetirement.idempotencyKey],
          ),
          0,
        );
        assert.equal(
          await count(
            "SELECT count(*)::int AS count FROM audit.audit_records WHERE correlation_id=$1",
            [rollbackRetirement.correlationId],
          ),
          0,
        );
        assert.equal(
          (
            await repository.resolveCurrentPolicy({
              registryScope: basePolicy.registryScope,
              environment: basePolicy.environment,
            })
          ).policyRef,
          replacementPolicy.registryFreshnessPolicyId,
        );

        const retirement = {
          ...rollbackRetirement,
          registryFreshnessPolicyActivationEventId: id("84"),
          reasonCode: "RETIRE_POLICY",
          evidenceRefs: ["evidence:registry-retirement:real"],
          idempotencyKey: "retirement-real",
          correlationId: "correlation-retirement-real",
          traceId: "trace-retirement-real",
          spanId: "span-retirement-real",
        };
        const retired = await repository.retireCurrentPolicy(retirement);
        assert.equal(retired.outcome, "CREATED");
        assert.equal(retired.activation.eventType, "RETIRE");
        assert.equal(
          (await repository.retireCurrentPolicy(retirement)).outcome,
          "REUSED",
        );
        for (const changed of [
          { reasonCode: "DRIFTED_RETIRE_REASON" },
          { evidenceRefs: ["evidence:retirement:drift"] },
          { expectedActivationEventId: id("99") },
        ]) {
          await assert.rejects(
            repository.retireCurrentPolicy({ ...retirement, ...changed }),
            /ROUTING_IDEMPOTENCY_CONFLICT/u,
          );
        }
        await assert.rejects(
          repository.resolveCurrentPolicy({
            registryScope: basePolicy.registryScope,
            environment: basePolicy.environment,
          }),
          /ROUTING_POLICY_MISSING/u,
        );
        assert.equal(
          await count(
            "SELECT count(*)::int AS count FROM governance.registry_freshness_policy_activation_events WHERE idempotency_key=$1",
            [retirement.idempotencyKey],
          ),
          1,
        );
        assert.equal(
          await count(
            "SELECT count(*)::int AS count FROM audit.audit_records WHERE correlation_id=$1",
            [retirement.correlationId],
          ),
          1,
        );
        await assertAudit(
          retired.auditRef,
          "REGISTRY_FRESHNESS_POLICY.RETIRED",
          retirement.evidenceRefs,
        );
      } finally {
        await database.close();
      }
    });
  },
);
