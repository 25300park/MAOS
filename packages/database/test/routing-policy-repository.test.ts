import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import {
  applyMigrations,
  loadMigrations,
  openPostgresDatabase,
  PostgresPhase15dRoutingPolicyRepository,
} from "../src/index.js";
import { withDisposablePostgres } from "../../../scripts/testing/disposable-postgres.js";

const id = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, "0")}`;
const sha = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;

const basePolicy = {
  routingPolicyVersionId: id("10"),
  routingPolicyId: id("11"),
  expectedPredecessorId: null,
  authorityIdentifier: "MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD" as const,
  lifecycleIntent: "ACTIVE" as const,
  canonicalDomain: "OPERATIONS" as const,
  routingPurpose: "PRIMARY_EXECUTION" as const,
  roleClass: "EXECUTOR" as const,
  organizationId: id("1"),
  projectId: id("3"),
  scopeRef: "project:operations",
  environment: "STAGING" as const,
  requiredCapabilityRefs: [] as string[],
  preferredCapabilityRefs: [] as string[],
  policyConstraints: {},
  effectiveAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
  contentFingerprint: sha("a"),
  actorType: "HUMAN" as const,
  actorId: id("4"),
  evidenceRefs: ["evidence:policy:1"],
  idempotencyKey: "policy-1",
  correlationId: "correlation-1",
  traceId: "trace-1",
  spanId: "span-1",
};

const context = {
  canonicalDomain: "OPERATIONS" as const,
  routingPurpose: "PRIMARY_EXECUTION" as const,
  roleClass: "EXECUTOR" as const,
  organizationId: id("1"),
  projectId: id("3"),
  scopeRef: "project:operations",
  environment: "STAGING" as const,
};

async function seedScope(database: { exec(sql: string): Promise<unknown> }) {
  await database.exec(`
    INSERT INTO core.organizations(id,name,slug)
      VALUES('${id("1")}','Policy Organization','phase15d-policy-organization');
    INSERT INTO core.departments(id,organization_id,name)
      VALUES('${id("2")}','${id("1")}','Policy Department');
    INSERT INTO core.projects(id,organization_id,department_id,name)
      VALUES('${id("3")}','${id("1")}','${id("2")}','Policy Project');
  `);
}

async function fixture(t: test.TestContext) {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(
    database,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  await seedScope(database);
  return {
    database,
    repository: new PostgresPhase15dRoutingPolicyRepository(database),
  };
}

test("appends immutable policy versions and reuses exact idempotent replay", async (t) => {
  const { database, repository } = await fixture(t);
  const draft = { ...basePolicy, lifecycleIntent: "DRAFT" as const };
  const created = await repository.appendPolicyVersion(draft);
  const replay = await repository.appendPolicyVersion(draft);

  assert.equal(created.outcome, "CREATED");
  assert.equal(replay.outcome, "REUSED");
  assert.equal(replay.policy.routingPolicyVersionId, id("10"));
  assert.equal(Object.isFrozen(replay.policy), true);
  assert.equal(Object.isFrozen(replay.policy.requiredCapabilityRefs), true);
  assert.equal(Object.isFrozen(replay.policy.preferredCapabilityRefs), true);
  assert.equal(Object.isFrozen(replay.policy.policyConstraints), true);
  assert.equal(
    (await repository.findPolicyVersionByIdentity(draft.routingPolicyId, 1))
      ?.routingPolicyVersionId,
    draft.routingPolicyVersionId,
  );
  await assert.rejects(
    repository.appendPolicyVersion({
      ...draft,
      scopeRef: "project:conflicting-scope",
    }),
    /ROUTING_IDEMPOTENCY_CONFLICT/,
  );
  await assert.rejects(
    database.exec(`UPDATE governance.ai_routing_policy_versions
      SET scope_ref='changed' WHERE routing_policy_version_id='${id("10")}'`),
    /PHASE15D_ROUTING_APPEND_ONLY/,
  );
});

test("policy replay rejects Evidence and audit-context drift", async (t) => {
  const { repository } = await fixture(t);
  await repository.appendPolicyVersion(basePolicy);
  for (const changed of [
    { evidenceRefs: ["evidence:policy:changed"] },
    { actorId: id("44") },
    { correlationId: "correlation-changed" },
    { traceId: "trace-changed" },
    { spanId: "span-changed" },
  ]) {
    await assert.rejects(
      repository.appendPolicyVersion({ ...basePolicy, ...changed }),
      /ROUTING_IDEMPOTENCY_CONFLICT/,
    );
  }
});

test("activation appends selection history and logically supersedes the prior policy", async (t) => {
  const { database, repository } = await fixture(t);
  const first = await repository.appendPolicyVersion(basePolicy);
  const firstActivation = await repository.activatePolicyVersion({
    routingPolicyActivationEventId: id("20"),
    routingPolicyVersionId: first.policy.routingPolicyVersionId,
    expectedActivationEventId: null,
    authorityIdentifier: basePolicy.authorityIdentifier,
    actorType: "HUMAN",
    actorId: id("4"),
    reasonCode: "INITIAL_ACTIVATION",
    evidenceRefs: ["evidence:activation:1"],
    idempotencyKey: "activation-1",
    correlationId: "correlation-a1",
    traceId: "trace-a1",
    spanId: "span-a1",
  });
  const secondPolicy = await repository.appendPolicyVersion({
    ...basePolicy,
    routingPolicyVersionId: id("12"),
    expectedPredecessorId: id("10"),
    contentFingerprint: sha("b"),
    idempotencyKey: "policy-2",
  });
  const secondActivation = await repository.activatePolicyVersion({
    routingPolicyActivationEventId: id("21"),
    routingPolicyVersionId: secondPolicy.policy.routingPolicyVersionId,
    expectedActivationEventId:
      firstActivation.activation.routingPolicyActivationEventId,
    authorityIdentifier: basePolicy.authorityIdentifier,
    actorType: "HUMAN",
    actorId: id("4"),
    reasonCode: "SUPERSEDE_POLICY",
    evidenceRefs: ["evidence:activation:2"],
    idempotencyKey: "activation-2",
    correlationId: "correlation-a2",
    traceId: "trace-a2",
    spanId: "span-a2",
  });

  assert.equal(firstActivation.activation.eventType, "ACTIVATE");
  assert.equal(secondActivation.activation.eventType, "SUPERSEDE");
  assert.equal(
    secondActivation.activation.supersedesActivationEventId,
    firstActivation.activation.routingPolicyActivationEventId,
  );
  const current = await repository.listCurrentSelections(context);
  assert.equal(current.length, 1);
  assert.equal(current[0]?.routingPolicyVersionId, id("12"));
  const immutable = await repository.findPolicyVersion(id("10"));
  assert.equal(immutable?.lifecycleIntent, "ACTIVE");
  const count = await database.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM governance.ai_routing_policy_activation_events",
  );
  assert.equal(count.rows[0]?.count, "2");
  const audit = await database.query<{ action: string; metadata: unknown }>(
    `SELECT action,metadata FROM audit.audit_records
     WHERE id=$1`,
    [secondActivation.auditRef],
  );
  assert.equal(audit.rows[0]?.action, "ROUTING.POLICY_ACTIVATED");
  assert.deepEqual(audit.rows[0]?.metadata, {
    applicability_fingerprint:
      secondActivation.activation.applicabilityFingerprint,
    authority: "MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD",
    prior_activation_event_id:
      firstActivation.activation.routingPolicyActivationEventId,
    selection_sequence: 2,
  });
});

test("a RETIRE activation head yields no current selection", async (t) => {
  const { database, repository } = await fixture(t);
  await repository.appendPolicyVersion(basePolicy);
  const active = await repository.activatePolicyVersion({
    routingPolicyActivationEventId: id("20"),
    routingPolicyVersionId: id("10"),
    expectedActivationEventId: null,
    authorityIdentifier: basePolicy.authorityIdentifier,
    actorType: "HUMAN",
    actorId: id("4"),
    reasonCode: "INITIAL_ACTIVATION",
    evidenceRefs: [],
    idempotencyKey: "activation-1",
    correlationId: "c1",
    traceId: "t1",
    spanId: "s1",
  });
  await database.query(
    `INSERT INTO governance.ai_routing_policy_activation_events(
       routing_policy_activation_event_id,routing_policy_id,
       routing_policy_version_id,applicability_fingerprint,selection_sequence,
       event_type,supersedes_activation_event_id,actor_type,actor_id,
       reason_code,evidence_refs,audit_ref)
     VALUES($1,$2,$3,$4,2,'RETIRE',$5,'HUMAN',$6,'RETIRED',ARRAY[]::text[],$7)`,
    [
      id("22"),
      id("11"),
      id("10"),
      active.activation.applicabilityFingerprint,
      id("20"),
      id("4"),
      active.auditRef,
    ],
  );
  assert.deepEqual(await repository.listCurrentSelections(context), []);
});

test("activation exact replay is reused and conflicting replay is denied", async (t) => {
  const { database, repository } = await fixture(t);
  await repository.appendPolicyVersion(basePolicy);
  const input = {
    routingPolicyActivationEventId: id("20"),
    routingPolicyVersionId: id("10"),
    expectedActivationEventId: null,
    authorityIdentifier: basePolicy.authorityIdentifier,
    actorType: "HUMAN" as const,
    actorId: id("4"),
    reasonCode: "INITIAL_ACTIVATION",
    evidenceRefs: ["evidence:activation:1"],
    idempotencyKey: "activation-1",
    correlationId: "correlation-a1",
    traceId: "trace-a1",
    spanId: "span-a1",
  };
  assert.equal(
    (await repository.activatePolicyVersion(input)).outcome,
    "CREATED",
  );
  assert.equal(
    (await repository.activatePolicyVersion(input)).outcome,
    "REUSED",
  );
  await assert.rejects(
    repository.activatePolicyVersion({
      ...input,
      expectedActivationEventId: id("99"),
    }),
    /ROUTING_IDEMPOTENCY_CONFLICT/,
  );
  for (const changed of [
    { evidenceRefs: ["evidence:activation:changed"] },
    { actorId: id("44") },
    { correlationId: "correlation-changed" },
    { traceId: "trace-changed" },
    { spanId: "span-changed" },
  ]) {
    await assert.rejects(
      repository.activatePolicyVersion({ ...input, ...changed }),
      /ROUTING_IDEMPOTENCY_CONFLICT/,
    );
  }
  const events = await database.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM governance.ai_routing_policy_activation_events",
  );
  assert.equal(events.rows[0]?.count, "1");
});

test("specialization versions remain exact policy children and immutable", async (t) => {
  const { database, repository } = await fixture(t);
  await repository.appendPolicyVersion(basePolicy);
  const input = {
    specializationVersionId: id("30"),
    specializationId: id("31"),
    expectedPredecessorId: null,
    authorityIdentifier: basePolicy.authorityIdentifier,
    routingPolicyVersionId: id("10"),
    lifecycle: "ACTIVE",
    specializationKey: "LEGAL_RESEARCH",
    canonicalDomain: "OPERATIONS",
    routingPurpose: "PRIMARY_EXECUTION",
    scopeRef: "project:operations",
    environment: "STAGING",
    requiredCapabilityRefs: [],
    preferredCapabilityRefs: [],
    metadata: { level: "SPECIALIST" },
    contentFingerprint: sha("c"),
    actorType: "HUMAN",
    actorId: id("4"),
    evidenceRefs: ["evidence:specialization:1"],
    idempotencyKey: "specialization-1",
    correlationId: "correlation-s1",
    traceId: "trace-s1",
    spanId: "span-s1",
  } as const;
  const created = await repository.appendSpecializationVersion(input);
  assert.equal(created.outcome, "CREATED");
  assert.equal(created.specialization.routingPolicyVersionId, id("10"));
  assert.equal(Object.isFrozen(created.specialization), true);
  assert.equal(
    Object.isFrozen(created.specialization.requiredCapabilityRefs),
    true,
  );
  assert.equal(Object.isFrozen(created.specialization.metadata), true);
  assert.equal(
    (await repository.appendSpecializationVersion(input)).outcome,
    "REUSED",
  );
  await assert.rejects(
    repository.appendSpecializationVersion({
      ...input,
      metadata: { level: "CONFLICTING" },
    }),
    /ROUTING_IDEMPOTENCY_CONFLICT/,
  );
  for (const changed of [
    { evidenceRefs: ["evidence:specialization:changed"] },
    { actorId: id("44") },
    { correlationId: "correlation-changed" },
    { traceId: "trace-changed" },
    { spanId: "span-changed" },
  ]) {
    await assert.rejects(
      repository.appendSpecializationVersion({ ...input, ...changed }),
      /ROUTING_IDEMPOTENCY_CONFLICT/,
    );
  }
  const second = await repository.appendSpecializationVersion({
    ...input,
    specializationVersionId: id("32"),
    expectedPredecessorId: id("30"),
    contentFingerprint: sha("d"),
    idempotencyKey: "specialization-2",
    correlationId: "correlation-s2",
    traceId: "trace-s2",
    spanId: "span-s2",
  });
  const current = await repository.findCurrentSpecializationVersion(
    input.specializationId,
  );
  assert.equal(
    current?.specializationVersionId,
    second.specialization.specializationVersionId,
  );
  await assert.rejects(
    database.exec(`DELETE FROM governance.ai_routing_specialization_versions
      WHERE specialization_version_id='${id("30")}'`),
    /PHASE15D_ROUTING_APPEND_ONLY/,
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
        await seedScope(firstDatabase);
        const first = new PostgresPhase15dRoutingPolicyRepository(
          firstDatabase,
        );
        const second = new PostgresPhase15dRoutingPolicyRepository(
          secondDatabase,
        );
        await first.appendPolicyVersion(basePolicy);
        const initial = await first.activatePolicyVersion({
          routingPolicyActivationEventId: id("20"),
          routingPolicyVersionId: id("10"),
          expectedActivationEventId: null,
          authorityIdentifier: basePolicy.authorityIdentifier,
          actorType: "HUMAN",
          actorId: id("4"),
          reasonCode: "INITIAL_ACTIVATION",
          evidenceRefs: [],
          idempotencyKey: "activation-1",
          correlationId: "c1",
          traceId: "t1",
          spanId: "s1",
        });
        for (const [suffix, key] of [
          ["12", "policy-2"],
          ["13", "policy-3"],
        ] as const) {
          await first.appendPolicyVersion({
            ...basePolicy,
            routingPolicyVersionId: id(suffix),
            routingPolicyId: id(`1${suffix}`),
            contentFingerprint: sha(suffix),
            idempotencyKey: key,
          });
        }
        const activate = (
          repository: PostgresPhase15dRoutingPolicyRepository,
          suffix: string,
          key: string,
        ) =>
          repository.activatePolicyVersion({
            routingPolicyActivationEventId: id(`2${suffix}`),
            routingPolicyVersionId: id(suffix),
            expectedActivationEventId:
              initial.activation.routingPolicyActivationEventId,
            authorityIdentifier: basePolicy.authorityIdentifier,
            actorType: "HUMAN",
            actorId: id("4"),
            reasonCode: "COMPETING_ACTIVATION",
            evidenceRefs: [],
            idempotencyKey: key,
            correlationId: key,
            traceId: key,
            spanId: key,
          });
        const results = await Promise.allSettled([
          activate(first, "12", "activation-2"),
          activate(second, "13", "activation-3"),
        ]);
        assert.equal(
          results.filter(({ status }) => status === "fulfilled").length,
          1,
        );
        assert.equal(
          results.filter(({ status }) => status === "rejected").length,
          1,
        );
        const current = await first.listCurrentSelections(context);
        assert.equal(current.length, 1);
      } finally {
        await Promise.all([firstDatabase.close(), secondDatabase.close()]);
      }
    });
  },
);
