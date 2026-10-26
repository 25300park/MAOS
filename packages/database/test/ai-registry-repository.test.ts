import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  type AiRegistryRepository,
  AiRegistryReadService,
  PostgresAiRegistryRepository,
  assertDevelopmentCompatibilityAllowed,
  calculateVerificationFreshness,
  validateReadinessTransition,
} from "../src/ai-registry-repository.js";
import { applyMigrations, loadMigrations } from "../src/index.js";

const migrationDirectory = resolve("packages/database/migrations");
const ids = {
  alphaModel: "10000000-0000-4000-8000-000000000001",
  alphaProvider: "10000000-0000-4000-8000-000000000002",
  alphaHost: "10000000-0000-4000-8000-000000000003",
  alphaBinding: "10000000-0000-4000-8000-000000000004",
  zetaModel: "20000000-0000-4000-8000-000000000001",
  zetaProvider: "20000000-0000-4000-8000-000000000002",
};

async function migratedDatabase(t: test.TestContext): Promise<PGlite> {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(database, await loadMigrations(migrationDirectory));
  return database;
}

async function seedRepositoryFixture(database: PGlite): Promise<void> {
  await database.query(
    `INSERT INTO ai.model_providers
       (id, name, status, provider_key, display_name, provider_type, health_state,
        readiness_state, credential_ref, default_region, metadata)
     VALUES
       ($1, 'Zeta Provider', 'ACTIVE', 'zeta-provider', 'Zeta Provider', 'EXTERNAL',
        'HEALTHY', 'UNKNOWN', 'secretref://internal/zeta', 'region-z',
        '{"token":"HOSTILE_TOKEN_SENTINEL"}'::jsonb),
       ($2, 'Alpha Provider', 'ACTIVE', 'alpha-provider', 'Alpha Provider', 'EXTERNAL',
        'HEALTHY', 'BLOCKED', 'secretref://internal/alpha', 'region-a',
        '{"password":"HOSTILE_PASSWORD_SENTINEL"}'::jsonb)`,
    [ids.zetaProvider, ids.alphaProvider],
  );
  await database.query(
    `INSERT INTO ai.models
       (id, provider_id, name, lifecycle, capabilities, model_key, display_name,
        model_family, model_version, health_state, readiness_state, metadata)
     VALUES
       ($1, $2, 'Zeta Model', 'ACTIVE', ARRAY['LEGACY_ONLY'], 'zeta-model',
        'Zeta Model', 'fixture', '1', 'HEALTHY', 'READY',
        '{"secret":"HOSTILE_MODEL_SENTINEL"}'::jsonb),
       ($3, $2, 'Alpha Model', 'ACTIVE', ARRAY['LEGACY_ONLY'], 'alpha-model',
        'Alpha Model', 'fixture', '1', 'HEALTHY', 'READY', '{}'::jsonb)`,
    [ids.zetaModel, ids.alphaProvider, ids.alphaModel],
  );
  await database.query(
    `INSERT INTO ai.host_runtimes
       (id, provider_id, host_key, display_name, host_type, status, execution_mode,
        network_required, interactive_required, credential_mode, credential_ref,
        adapter_ref, health_state, readiness_state, metadata)
     VALUES
       ($1, $2, 'alpha-host', 'Alpha Host', 'PROVIDER_API', 'ACTIVE', 'REMOTE_API',
        true, false, 'REFERENCE', 'secretref://internal/host', 'adapter://fixture/alpha',
        'HEALTHY', 'READY', '{"api_key":"HOSTILE_API_KEY_SENTINEL"}'::jsonb)`,
    [ids.alphaHost, ids.alphaProvider],
  );
  await database.query(
    `INSERT INTO ai.model_host_bindings
       (id, model_id, host_id, lifecycle, health_state, readiness_state, cost_class,
        latency_class, quality_class, verification_evidence_ref, verified_at,
        policy_version, metadata)
     VALUES
       ($1, $2, $3, 'ACTIVE', 'HEALTHY', 'READY', 'LOW', 'MEDIUM', 'HIGH',
        'evidence://fixture/verified', CURRENT_TIMESTAMP, 'policy-v1', '{}'::jsonb)`,
    [ids.alphaBinding, ids.alphaModel, ids.alphaHost],
  );
  await database.query(
    `INSERT INTO ai.model_capability_bindings
       (model_host_binding_id, capability_id, support_level, confidence_class,
        verification_freshness, verified_at, verification_source, evidence_ref,
        policy_version, status, metadata)
     SELECT $1, id, 'SUPPORTED', 'HIGH', 'FRESH', CURRENT_TIMESTAMP,
            'fixture-verifier', 'evidence://fixture/capability', 'policy-v1', 'ACTIVE',
            '{"token":"HOSTILE_BINDING_SENTINEL"}'::jsonb
       FROM ai.capabilities
      WHERE capability_key = 'CODE_REVIEW'`,
    [ids.alphaBinding],
  );
  await database.query(
    `INSERT INTO ai.role_compatibilities
       (model_host_binding_id, domain_key, stage_key, role_key, eligibility,
        fallback_eligible, independent_review_eligible, adversarial_review_eligible)
     VALUES
       ($1, 'ANALYSIS', 'PLANNING', 'FALLBACK_PLANNER', 'ELIGIBLE', true, false, false),
       ($1, 'ANALYSIS', 'REVIEW', 'INDEPENDENT_REVIEWER', 'ELIGIBLE', false, true, true)`,
    [ids.alphaBinding],
  );
}

test("repository reads distinct normalized registry entities in deterministic order", async (t) => {
  const database = await migratedDatabase(t);
  await seedRepositoryFixture(database);
  const repository = new PostgresAiRegistryRepository(database);

  const providers = await repository.listProviders();
  assert.deepEqual(
    providers.map(({ providerKey }) => providerKey),
    ["alpha-provider", "anthropic", "google", "openai", "zeta-provider"],
  );
  assert.equal(
    (await repository.findProvider(ids.alphaProvider))?.providerKey,
    "alpha-provider",
  );
  assert.equal(
    await repository.findProvider("30000000-0000-4000-8000-000000000000"),
    undefined,
  );

  const models = await repository.listModels();
  assert.deepEqual(
    models.map(({ modelKey }) => modelKey),
    ["alpha-model", "zeta-model"],
  );
  assert.equal(
    (await repository.findModel(ids.alphaModel))?.providerId,
    ids.alphaProvider,
  );
  assert.equal(
    await repository.findModel("30000000-0000-4000-8000-000000000000"),
    undefined,
  );

  const hosts = await repository.listHosts();
  assert.deepEqual(
    hosts.map(({ hostKey }) => hostKey),
    [
      "alpha-host",
      "anthropic-api",
      "claude-code",
      "codex-cli",
      "google-api",
      "openai-api",
    ],
  );
  assert.equal(
    (await repository.findHost(ids.alphaHost))?.hostKey,
    "alpha-host",
  );
  assert.equal(
    await repository.findHost("30000000-0000-4000-8000-000000000000"),
    undefined,
  );

  const capabilities = await repository.listCapabilities();
  assert.equal(capabilities[0]?.capabilityKey, "ANALYSIS");
  assert.equal(
    (await repository.findCapability(capabilities[0]!.id))?.capabilityKey,
    "ANALYSIS",
  );
  assert.equal(
    await repository.findCapability("30000000-0000-4000-8000-000000000000"),
    undefined,
  );

  const bindings = await repository.listModelHostBindings(ids.alphaModel);
  assert.deepEqual(
    bindings.map(({ id }) => id),
    [ids.alphaBinding],
  );
  const modelCapabilities = await repository.listModelCapabilities(
    ids.alphaModel,
  );
  assert.deepEqual(
    modelCapabilities.map(({ capabilityKey }) => capabilityKey),
    ["CODE_REVIEW"],
  );
  assert.ok(
    modelCapabilities.every(
      ({ capabilityKey }) => capabilityKey !== "LEGACY_ONLY",
    ),
  );

  const roles = await repository.listRoleCompatibilities(ids.alphaModel);
  assert.deepEqual(
    roles.map(({ roleKey }) => roleKey),
    ["FALLBACK_PLANNER", "INDEPENDENT_REVIEWER"],
  );
  assert.deepEqual(
    roles.map(
      ({
        adversarialReviewEligible,
        fallbackEligible,
        independentReviewEligible,
      }) => ({
        adversarialReviewEligible,
        fallbackEligible,
        independentReviewEligible,
      }),
    ),
    [
      {
        adversarialReviewEligible: false,
        fallbackEligible: true,
        independentReviewEligible: false,
      },
      {
        adversarialReviewEligible: true,
        fallbackEligible: false,
        independentReviewEligible: true,
      },
    ],
  );
  assert.equal(
    (await repository.listDomainConstraints())[0]?.domainKey,
    "DEVELOPMENT",
  );

  assert.notEqual(providers[0]!.id, models[0]!.id);
  assert.notEqual(models[0]!.id, hosts[0]!.id);
});
test("repository reconstructs canonical state after repository restart", async (t) => {
  const database = await migratedDatabase(t);
  await seedRepositoryFixture(database);
  const first = new PostgresAiRegistryRepository(database);
  const before = await first.listModelCapabilities(ids.alphaModel);
  const second = new PostgresAiRegistryRepository(database);
  assert.deepEqual(await second.listModelCapabilities(ids.alphaModel), before);
});

test("read service constructs allowlisted public views without persistence secrets", async (t) => {
  const database = await migratedDatabase(t);
  await seedRepositoryFixture(database);
  const service = new AiRegistryReadService(
    new PostgresAiRegistryRepository(database),
  );
  const publicResult = {
    capabilities: await service.listModelCapabilities(ids.alphaModel),
    hosts: await service.listHosts(),
    models: await service.listModels(),
    providers: await service.listProviders(),
  };
  const serialized = JSON.stringify(publicResult);
  assert.doesNotMatch(serialized, /credential_ref|credentialRef|metadata/iu);
  assert.doesNotMatch(serialized, /secret|token|password|api_key/iu);
  assert.doesNotMatch(serialized, /HOSTILE_|secretref:\/\//u);
});

test("read service replaces persistence errors with a bounded non-secret error", async () => {
  const unsafeRepository = {
    listProviders: async () => {
      throw new Error("credential_ref=secretref://HOSTILE_ERROR_SENTINEL");
    },
  } as unknown as AiRegistryRepository;
  const service = new AiRegistryReadService(unsafeRepository);
  await assert.rejects(service.listProviders(), (error: unknown) => {
    assert.equal(
      error instanceof Error ? error.message : String(error),
      "AI_REGISTRY_READ_FAILED",
    );
    assert.doesNotMatch(String(error), /credential|secret|HOSTILE/iu);
    return true;
  });
});

test("verification freshness remains UNKNOWN, STALE, or RECONCILING until exact evidence is current", () => {
  const now = new Date("2026-09-29T12:00:00.000Z");
  const valid = {
    evidenceRef: "evidence://fixture/current",
    expectedPolicyVersion: "policy-v1",
    maximumAgeMs: 60_000,
    now,
    policyVersion: "policy-v1",
    reconciliationState: "COMPLETE" as const,
    source: "fixture-verifier",
    verifiedAt: new Date(now.getTime() - 1_000),
  };
  assert.equal(
    calculateVerificationFreshness({ ...valid, evidenceRef: null }),
    "UNKNOWN",
  );
  assert.equal(
    calculateVerificationFreshness({ ...valid, source: null }),
    "UNKNOWN",
  );
  assert.equal(
    calculateVerificationFreshness({ ...valid, verifiedAt: null }),
    "UNKNOWN",
  );
  assert.equal(calculateVerificationFreshness(valid), "FRESH");
  assert.equal(
    calculateVerificationFreshness({
      ...valid,
      verifiedAt: new Date(now.getTime() - 60_001),
    }),
    "STALE",
  );
  assert.equal(
    calculateVerificationFreshness({
      ...valid,
      verifiedAt: new Date(now.getTime() + 1),
    }),
    "UNKNOWN",
  );
  assert.equal(
    calculateVerificationFreshness({
      ...valid,
      reconciliationState: "CONFLICTING",
    }),
    "RECONCILING",
  );
  assert.equal(
    calculateVerificationFreshness({
      ...valid,
      reconciliationState: "INCOMPLETE",
    }),
    "RECONCILING",
  );
  assert.equal(
    calculateVerificationFreshness({
      ...valid,
      expectedPolicyVersion: "policy-v2",
    }),
    "STALE",
  );
});

test("readiness validation keeps health distinct and requires exact current evidence", () => {
  const now = new Date("2026-09-29T12:00:00.000Z");
  const evidence = {
    evidenceRef: "evidence://fixture/current",
    expectedPolicyVersion: "policy-v1",
    expectedResourceId: "resource-1",
    maximumAgeMs: 60_000,
    policyVersion: "policy-v1",
    reconciliationState: "COMPLETE" as const,
    resourceId: "resource-1",
    source: "fixture-verifier",
    verifiedAt: new Date(now.getTime() - 1_000),
  };
  assert.deepEqual(
    validateReadinessTransition({
      evidence: null,
      from: "UNKNOWN",
      now,
      to: "READY",
    }),
    { allowed: false, reasonCode: "READINESS_CURRENT_EVIDENCE_REQUIRED" },
  );
  assert.deepEqual(
    validateReadinessTransition({
      evidence: null,
      from: "BLOCKED",
      now,
      to: "READY",
    }),
    { allowed: false, reasonCode: "READINESS_CURRENT_EVIDENCE_REQUIRED" },
  );
  assert.equal(
    validateReadinessTransition({
      evidence: { ...evidence, verifiedAt: new Date(now.getTime() - 60_001) },
      from: "UNKNOWN",
      now,
      to: "READY",
    }).reasonCode,
    "READINESS_EVIDENCE_STALE",
  );
  assert.equal(
    validateReadinessTransition({
      evidence: { ...evidence, reconciliationState: "CONFLICTING" },
      from: "BLOCKED",
      now,
      to: "READY",
    }).reasonCode,
    "READINESS_EVIDENCE_RECONCILING",
  );
  assert.equal(
    validateReadinessTransition({
      evidence: { ...evidence, resourceId: "wrong-resource" },
      from: "UNKNOWN",
      now,
      to: "READY",
    }).reasonCode,
    "READINESS_RESOURCE_MISMATCH",
  );
  assert.equal(
    validateReadinessTransition({
      evidence: { ...evidence, expectedPolicyVersion: "policy-v2" },
      from: "UNKNOWN",
      now,
      to: "READY",
    }).reasonCode,
    "READINESS_POLICY_MISMATCH",
  );
  assert.deepEqual(
    validateReadinessTransition({
      evidence,
      from: "UNKNOWN",
      now,
      to: "READY",
    }),
    { allowed: true, reasonCode: "READINESS_TRANSITION_ALLOWED" },
  );
  assert.deepEqual(
    validateReadinessTransition({
      evidence: null,
      from: "UNKNOWN",
      now,
      to: "BLOCKED",
    }),
    { allowed: true, reasonCode: "READINESS_TRANSITION_ALLOWED" },
  );
});

test("Development defense-in-depth fails closed and CODE_EXECUTION cannot override policy", () => {
  const delegatedPolicy = [
    {
      domainKey: "DEVELOPMENT",
      executionMode: "DELEGATE_TO_AIDOS" as const,
      status: "ACTIVE" as const,
    },
  ];
  assert.doesNotThrow(() =>
    assertDevelopmentCompatibilityAllowed({
      capabilityKeys: ["CODE_EXECUTION"],
      domainKey: "DEVELOPMENT",
      eligibility: "ELIGIBLE",
      hostReadiness: "READY",
      modelReadiness: "READY",
      policies: delegatedPolicy,
      requestedExecutionMode: "DELEGATE_TO_AIDOS",
    }),
  );
  assert.throws(
    () =>
      assertDevelopmentCompatibilityAllowed({
        capabilityKeys: ["CODE_EXECUTION"],
        domainKey: "DEVELOPMENT",
        eligibility: "ELIGIBLE",
        hostReadiness: "READY",
        modelReadiness: "READY",
        policies: delegatedPolicy,
        requestedExecutionMode: "MAOS_NATIVE",
      }),
    /AI_DEVELOPMENT_DIRECT_EXECUTION_DENIED/u,
  );
  for (const policies of [
    [],
    [
      {
        domainKey: "DEVELOPMENT",
        executionMode: "PROHIBITED" as const,
        status: "ACTIVE" as const,
      },
    ],
    [
      {
        domainKey: "DEVELOPMENT",
        executionMode: "DELEGATE_TO_AIDOS" as const,
        status: "DISABLED" as const,
      },
    ],
    [...delegatedPolicy, ...delegatedPolicy],
  ]) {
    assert.throws(
      () =>
        assertDevelopmentCompatibilityAllowed({
          capabilityKeys: ["CODE_EXECUTION"],
          domainKey: "DEVELOPMENT",
          eligibility: "CONDITIONAL",
          hostReadiness: "READY",
          modelReadiness: "READY",
          policies,
          requestedExecutionMode: "MAOS_NATIVE",
        }),
      /AI_DEVELOPMENT_POLICY_PROHIBITED/u,
    );
  }
});
