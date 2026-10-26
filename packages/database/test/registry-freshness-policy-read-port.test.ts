import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  REGISTRY_FRESHNESS_POLICY_AUTHORITY,
  PostgresRegistryFreshnessPolicyRepository,
  type RegistryFreshnessPolicyRepository,
} from "../src/registry-freshness-policy-repository.js";
import { applyMigrations } from "../src/migrate.js";
import { loadMigrations } from "../src/migrations.js";
import {
  RepositoryRegistryFreshnessPolicyReadPort,
  deriveRegistryFreshUntil,
} from "../src/registry-freshness-policy-read-port.js";
import { RoutingContractError } from "../src/routing-contracts.js";
import { Phase15bRegistryAuthorityAdapter } from "../src/routing-authority-read-ports.js";
import type { RuntimeDatabase } from "../src/postgres.js";
import { openPostgresDatabase } from "../src/postgres.js";
import { withDisposablePostgres } from "../../../scripts/testing/disposable-postgres.js";

const currentPolicy = {
  policyRef: "10000000-0000-4000-8000-000000000001",
  policyVersion: 3,
  maxAgeMs: 60_000,
  registryScope: "PHASE15B_AI_REGISTRY" as const,
  environment: "STAGING" as const,
  effectiveState: "ACTIVE" as const,
  activationEventRef: "10000000-0000-4000-8000-000000000002",
  selectionSequence: 7,
  authorityIdentifier: REGISTRY_FRESHNESS_POLICY_AUTHORITY,
};

function repository(
  resolveCurrentPolicy: RegistryFreshnessPolicyRepository["resolveCurrentPolicy"] = async () =>
    currentPolicy,
): Pick<RegistryFreshnessPolicyRepository, "resolveCurrentPolicy"> {
  return { resolveCurrentPolicy };
}

test("policy read port returns one immutable allowlisted current policy", async () => {
  const port = new RepositoryRegistryFreshnessPolicyReadPort(repository());
  const result = await port.resolveCurrentPolicy({
    registryScope: "PHASE15B_AI_REGISTRY",
    environment: "STAGING",
  });

  assert.deepEqual(result, {
    policyRef: currentPolicy.policyRef,
    policyVersion: 3,
    maxAgeMs: 60_000,
    registryScope: "PHASE15B_AI_REGISTRY",
    environment: "STAGING",
    effectiveState: "ACTIVE",
    activationEventRef: currentPolicy.activationEventRef,
    selectionSequence: 7,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal("authorityIdentifier" in result, false);
});

test("policy read port preserves missing, retired, and ambiguous fail-closed results", async () => {
  for (const code of [
    "ROUTING_POLICY_MISSING",
    "ROUTING_POLICY_CONFLICT",
  ] as const) {
    const port = new RepositoryRegistryFreshnessPolicyReadPort(
      repository(async () => {
        throw new RoutingContractError(code);
      }),
    );
    await assert.rejects(
      port.resolveCurrentPolicy({
        registryScope: "PHASE15B_AI_REGISTRY",
        environment: "STAGING",
      }),
      (error) => error instanceof RoutingContractError && error.code === code,
    );
  }
});

test("policy read port rejects wrong authority, scope, environment, and malformed state", async () => {
  const invalid = [
    { authorityIdentifier: "APPLICATION_RUNTIME" },
    { registryScope: "OTHER_SCOPE" },
    { environment: "PREVIEW" },
    { effectiveState: "RETIRED" },
    { policyRef: "" },
    { policyVersion: 0 },
    { maxAgeMs: 0 },
    { activationEventRef: "" },
    { selectionSequence: 0 },
  ] as const;
  for (const changed of invalid) {
    const port = new RepositoryRegistryFreshnessPolicyReadPort(
      repository(async () => ({ ...currentPolicy, ...changed }) as never),
    );
    await assert.rejects(
      port.resolveCurrentPolicy({
        registryScope: "PHASE15B_AI_REGISTRY",
        environment: "STAGING",
      }),
      (error) =>
        error instanceof RoutingContractError &&
        error.code === "REGISTRY_STALE",
      JSON.stringify(changed),
    );
  }
});

test("freshUntil derives exact milliseconds from observedAt and fails closed on overflow", () => {
  assert.equal(
    deriveRegistryFreshUntil("2026-10-11T00:00:00.125Z", 60_001),
    "2026-10-11T00:01:00.126Z",
  );
  assert.throws(
    () =>
      deriveRegistryFreshUntil(
        new Date(8_640_000_000_000_000).toISOString(),
        1,
      ),
    (error) =>
      error instanceof RoutingContractError && error.code === "REGISTRY_STALE",
  );
});

const ids = {
  provider: "31000000-0000-4000-8000-000000000001",
  model: "31000000-0000-4000-8000-000000000002",
  host: "31000000-0000-4000-8000-000000000003",
  binding: "31000000-0000-4000-8000-000000000004",
  policy: "31000000-0000-4000-8000-000000000005",
  policyV1: "31000000-0000-4000-8000-000000000006",
  policyV2: "31000000-0000-4000-8000-000000000007",
  activationV1: "31000000-0000-4000-8000-000000000008",
  activationV2: "31000000-0000-4000-8000-000000000009",
  actor: "31000000-0000-4000-8000-000000000010",
} as const;

async function seedRegistry(database: RuntimeDatabase) {
  await database.query(
    `INSERT INTO ai.model_providers
       (id,name,status,provider_key,display_name,provider_type,health_state,
        readiness_state,credential_ref,metadata)
     VALUES($1,'RFA03 Provider','ACTIVE','rfa03-provider','RFA03 Provider',
       'EXTERNAL','HEALTHY','READY','secretref://rfa03/provider',
       '{"password":"RFA03_SECRET_SENTINEL"}'::jsonb)`,
    [ids.provider],
  );
  await database.query(
    `INSERT INTO ai.models
       (id,provider_id,name,lifecycle,capabilities,model_key,display_name,
        health_state,readiness_state,metadata)
     VALUES($1,$2,'RFA03 Model','ACTIVE',ARRAY['LEGACY_ONLY'],'rfa03-model',
       'RFA03 Model','HEALTHY','READY','{}'::jsonb)`,
    [ids.model, ids.provider],
  );
  await database.query(
    `INSERT INTO ai.host_runtimes
       (id,provider_id,host_key,display_name,host_type,status,execution_mode,
        network_required,interactive_required,credential_mode,credential_ref,
        adapter_ref,health_state,readiness_state,metadata)
     VALUES($1,$2,'rfa03-host','RFA03 Host','PROVIDER_API','ACTIVE','REMOTE_API',
       true,false,'REFERENCE','secretref://rfa03/host','adapter://rfa03',
       'HEALTHY','READY','{}'::jsonb)`,
    [ids.host, ids.provider],
  );
  await database.query(
    `INSERT INTO ai.model_host_bindings
       (id,model_id,host_id,lifecycle,health_state,readiness_state,cost_class,
        latency_class,quality_class,verification_evidence_ref,verified_at,
        policy_version,metadata)
     VALUES($1,$2,$3,'ACTIVE','HEALTHY','READY','LOW','LOW','HIGH',
       'evidence://rfa03/binding',CURRENT_TIMESTAMP,'registry-policy-v1','{}')`,
    [ids.binding, ids.model, ids.host],
  );
  await database.query(
    `INSERT INTO ai.model_capability_bindings
       (model_host_binding_id,capability_id,support_level,confidence_class,
        verification_freshness,verified_at,verification_source,evidence_ref,
        policy_version,status,metadata)
     SELECT $1,id,'SUPPORTED','HIGH','FRESH',CURRENT_TIMESTAMP,'rfa03-verifier',
       'evidence://rfa03/capability','registry-policy-v1','ACTIVE','{}'
       FROM ai.capabilities WHERE capability_key='CODE_REVIEW'`,
    [ids.binding],
  );
  await database.query(
    `INSERT INTO ai.role_compatibilities
       (model_host_binding_id,domain_key,stage_key,role_key,eligibility,
        fallback_eligible,independent_review_eligible,adversarial_review_eligible)
     VALUES($1,'ANALYTICS','PRIMARY','ANALYST','ELIGIBLE',true,false,false)`,
    [ids.binding],
  );
}

function governedPolicy(version: 1 | 2) {
  return {
    registryFreshnessPolicyVersionId:
      version === 1 ? ids.policyV1 : ids.policyV2,
    registryFreshnessPolicyId: ids.policy,
    policyVersion: version,
    supersedesPolicyVersionId: version === 1 ? null : ids.policyV1,
    authorityIdentifier: REGISTRY_FRESHNESS_POLICY_AUTHORITY,
    registryScope: "PHASE15B_AI_REGISTRY" as const,
    environment: "STAGING" as const,
    maxAgeMs: version === 1 ? 60_000 : 120_000,
    lifecycleIntent: "ACTIVE" as const,
    effectiveAt: `2026-10-11T00:0${version}:00.000Z`,
    contentFingerprint: `sha256:${String(version).repeat(64)}`,
    actorType: "HUMAN" as const,
    actorId: ids.actor,
    reasonCode: `RFA03_POLICY_V${version}`,
    evidenceRefs: [`evidence:rfa03:policy:v${version}`],
    idempotencyKey: `rfa03-policy-v${version}`,
    correlationId: `rfa03-policy-v${version}`,
    traceId: `rfa03-policy-v${version}`,
    spanId: `rfa03-policy-v${version}`,
  };
}

function tracked(database: RuntimeDatabase) {
  const calls: string[] = [];
  const pids = new Set<number>();
  const record = async (sql: string) => {
    calls.push(sql);
    const pid = await database.query<{ pid: number }>(
      "SELECT pg_backend_pid()::int AS pid",
    );
    pids.add(pid.rows[0]!.pid);
  };
  const wrapped: RuntimeDatabase = {
    close: () => database.close(),
    exec: async (sql) => {
      await record(sql);
      return await database.exec(sql);
    },
    query: async <Row>(sql: string, params?: unknown[]) => {
      await record(sql);
      return await database.query<Row>(sql, params);
    },
  };
  return { calls, pids, wrapped };
}

test(
  "runtime factory binds governed policy and canonical Registry evidence in one read-only PostgreSQL transaction",
  { timeout: 120_000 },
  async () => {
    await withDisposablePostgres({}, async (postgres) => {
      const database = await openPostgresDatabase(postgres.migrationUrl);
      try {
        await applyMigrations(
          database,
          await loadMigrations(resolve("packages/database/migrations")),
        );
        await seedRegistry(database);
        const observation = tracked(database);
        const adapter = Phase15bRegistryAuthorityAdapter.fromPostgres(
          observation.wrapped,
          "STAGING",
        );

        await assert.rejects(
          adapter.readSnapshot({ resourceRefs: [] }),
          /ROUTING_POLICY_MISSING/u,
        );

        const policies = new PostgresRegistryFreshnessPolicyRepository(
          observation.wrapped,
        );
        await policies.appendPolicyVersion(governedPolicy(1));
        const firstActivation = await policies.activatePolicy({
          registryFreshnessPolicyActivationEventId: ids.activationV1,
          registryFreshnessPolicyId: ids.policy,
          policyVersion: 1,
          expectedActivationEventId: null,
          authorityIdentifier: REGISTRY_FRESHNESS_POLICY_AUTHORITY,
          registryScope: "PHASE15B_AI_REGISTRY",
          environment: "STAGING",
          actorType: "HUMAN",
          actorId: ids.actor,
          reasonCode: "RFA03_ACTIVATE_V1",
          evidenceRefs: ["evidence:rfa03:activation:v1"],
          idempotencyKey: "rfa03-activation-v1",
          correlationId: "rfa03-activation-v1",
          traceId: "rfa03-activation-v1",
          spanId: "rfa03-activation-v1",
        });
        observation.calls.length = 0;
        observation.pids.clear();

        const v1 = await adapter.readSnapshot({ resourceRefs: [] });
        assert.equal(observation.pids.size, 1);
        assert.equal(
          observation.calls.filter((sql) =>
            sql.includes("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"),
          ).length,
          1,
        );
        assert.equal(
          observation.calls.filter((sql) =>
            sql.includes("transaction_timestamp()"),
          ).length,
          1,
        );
        assert.equal(
          observation.calls.some(
            (sql) =>
              sql.includes("transaction_isolation") &&
              sql.includes("transaction_read_only"),
          ),
          true,
        );
        assert.equal(v1.freshnessPolicyRef, ids.policy);
        assert.equal(v1.freshnessPolicyVersion, "1");
        assert.equal(v1.freshnessMaxAgeMs, 60_000);
        assert.equal(
          Date.parse(v1.freshUntil) - Date.parse(v1.observedAt),
          60_000,
        );
        assert.match(
          v1.snapshotRef,
          /^registry-snapshot:sha256:[a-f0-9]{64}$/u,
        );
        assert.match(v1.revision, /^registry-revision:/u);
        assert.equal(
          JSON.stringify(v1).includes("RFA03_SECRET_SENTINEL"),
          false,
        );
        assert.equal(JSON.stringify(v1).includes("secretref://"), false);
        const v1Evidence = {
          policyRef: v1.freshnessPolicyRef,
          policyVersion: v1.freshnessPolicyVersion,
          maxAgeMs: v1.freshnessMaxAgeMs,
          registryObservedAt: v1.observedAt,
          freshUntil: v1.freshUntil,
          snapshotRef: v1.snapshotRef,
          snapshotRevision: v1.revision,
          snapshotHash: v1.snapshotRef.slice(
            "registry-snapshot:sha256:".length,
          ),
          resourceRefs: [ids.provider, ids.model, ids.host, ids.binding],
        };
        await assert.doesNotReject(adapter.revalidate(v1Evidence));

        await policies.appendPolicyVersion(governedPolicy(2));
        await policies.activatePolicy({
          registryFreshnessPolicyActivationEventId: ids.activationV2,
          registryFreshnessPolicyId: ids.policy,
          policyVersion: 2,
          expectedActivationEventId:
            firstActivation.activation.registryFreshnessPolicyActivationEventId,
          authorityIdentifier: REGISTRY_FRESHNESS_POLICY_AUTHORITY,
          registryScope: "PHASE15B_AI_REGISTRY",
          environment: "STAGING",
          actorType: "HUMAN",
          actorId: ids.actor,
          reasonCode: "RFA03_ACTIVATE_V2",
          evidenceRefs: ["evidence:rfa03:activation:v2"],
          idempotencyKey: "rfa03-activation-v2",
          correlationId: "rfa03-activation-v2",
          traceId: "rfa03-activation-v2",
          spanId: "rfa03-activation-v2",
        });
        const v2 = await adapter.readSnapshot({ resourceRefs: [] });
        assert.equal(v1.freshnessPolicyVersion, "1");
        assert.equal(v1.freshnessMaxAgeMs, 60_000);
        assert.equal(v2.freshnessPolicyVersion, "2");
        assert.equal(v2.freshnessMaxAgeMs, 120_000);
        await assert.rejects(
          adapter.revalidate(v1Evidence),
          (error) =>
            error instanceof RoutingContractError &&
            error.code === "REGISTRY_CONFLICT",
        );

        const expiredAdapter = Phase15bRegistryAuthorityAdapter.fromPostgres(
          observation.wrapped,
          "STAGING",
          { now: () => new Date(Date.parse(v2.observedAt) + 600_000) },
        );
        await assert.rejects(
          expiredAdapter.readSnapshot({ resourceRefs: [] }),
          (error) =>
            error instanceof RoutingContractError &&
            error.code === "REGISTRY_STALE",
        );

        const v2Evidence = {
          policyRef: v2.freshnessPolicyRef,
          policyVersion: v2.freshnessPolicyVersion,
          maxAgeMs: v2.freshnessMaxAgeMs,
          registryObservedAt: v2.observedAt,
          freshUntil: v2.freshUntil,
          snapshotRef: v2.snapshotRef,
          snapshotRevision: v2.revision,
          snapshotHash: v2.snapshotRef.slice(
            "registry-snapshot:sha256:".length,
          ),
          resourceRefs: [ids.provider, ids.model, ids.host, ids.binding],
        };
        await database.query(
          `UPDATE ai.model_providers SET version=version + 1 WHERE id=$1`,
          [ids.provider],
        );
        await assert.rejects(
          adapter.revalidate(v2Evidence),
          (error) =>
            error instanceof RoutingContractError &&
            error.code === "REGISTRY_CONFLICT",
        );

        await database.query(
          `UPDATE ai.model_capability_bindings
             SET verification_freshness='STALE'
           WHERE model_host_binding_id=$1`,
          [ids.binding],
        );
        await assert.rejects(
          adapter.readSnapshot({ resourceRefs: [] }),
          (error) =>
            error instanceof RoutingContractError &&
            error.code === "REGISTRY_STALE",
        );
      } finally {
        await database.close();
      }
    });
  },
);
