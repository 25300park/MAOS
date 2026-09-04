import assert from "node:assert/strict";
import test from "node:test";
import {
  BackupRecoveryService,
  EnvironmentRegistry,
  MonitoringReadiness,
  OperationalAuthorityRegistry,
  OperationsError,
  assessDeploymentProviderReadiness,
  runBoundedLoadProfile,
  runBoundedStabilityProfile,
  simulateDisasterRecovery,
  type BackupAdapter,
} from "../src/index.js";

const human = (id: string) => ({ id, type: "HUMAN" as const });
const agent = (id: string) => ({ id, type: "AGENT" as const });

class TestBackupAdapter implements BackupAdapter {
  readonly mode = "TEST_ONLY" as const;
  corruptRestore = false;

  async backup(input: { source_data: string }) {
    return {
      encrypted_payload: Buffer.from(input.source_data).toString("base64"),
      encryption: "AES-256-GCM" as const,
      evidence_ids: ["evidence-test-backup"],
    };
  }

  async restore(input: { encrypted_payload: string }) {
    const restored = Buffer.from(input.encrypted_payload, "base64").toString();
    return {
      evidence_ids: ["evidence-test-restore"],
      restored_data: this.corruptRestore ? `${restored}-corrupt` : restored,
    };
  }
}

test("isolates production identity, configuration, credentials, and authority", () => {
  const registry = new EnvironmentRegistry();
  registry.register({
    configuration_reference: "configref://maos/staging",
    credential_reference: "secretref://maos/staging",
    debug: false,
    health: "HEALTHY",
    isolated: true,
    name: "STAGING",
    origin: "https://staging.maos.example",
    production_authority: [],
    rollback_artifact_id: "artifact-staging-known-good",
    service_identity: "system-maos-staging",
  });
  const production = registry.register({
    configuration_reference: "configref://maos/production",
    credential_reference: "secretref://maos/production",
    debug: false,
    health: "HEALTHY",
    isolated: true,
    name: "PRODUCTION",
    origin: "https://control.maos.example",
    production_authority: ["role:release-approver"],
    rollback_artifact_id: "artifact-production-known-good",
    service_identity: "system-maos-production",
  });
  assert.equal(production.name, "PRODUCTION");
  assert.equal(registry.readiness("PRODUCTION").status, "READY");
  assert.throws(
    () =>
      registry.register({
        ...production,
        credential_reference: "plaintext-password",
        name: "PREVIEW",
      }),
    /SECRET_REFERENCE_REQUIRED/,
  );
  assert.throws(
    () =>
      registry.register({
        ...production,
        configuration_reference: "configref://maos/staging",
        name: "DEVELOPMENT",
      }),
    /ENVIRONMENT_ISOLATION_REQUIRED/,
  );
});

test("performs an integrity-checked test backup and human-authorized restore", async () => {
  const adapter = new TestBackupAdapter();
  const service = new BackupRecoveryService(
    adapter,
    () => new Date("2026-09-04T01:00:00Z"),
  );
  const backup = await service.createBackup({
    actor: human("human-backup-operator"),
    correlation_id: "corr-backup",
    environment: "TEST",
    id: "backup-phase-1p",
    policy: {
      encryption_required: true,
      max_age_ms: 3_600_000,
      retention_days: 7,
    },
    source_data: "phase-1P-test-data",
  });
  assert.equal(
    backup.checksum,
    "d126d786ec7a01ce82b19cec5e9edfd22c3f7df441efda89ee5999a7e3d5a2e7",
  );
  assert.equal(backup.health, "FRESH");
  const restored = await service.restore({
    actor: human("human-recovery-authority"),
    backup_id: backup.id,
    correlation_id: "corr-restore",
    environment: "TEST",
  });
  assert.deepEqual(restored, {
    backup_id: "backup-phase-1p",
    checksum: backup.checksum,
    evidence_ids: ["evidence-test-backup", "evidence-test-restore"],
    status: "VERIFIED",
  });
  await assert.rejects(
    () =>
      service.restore({
        actor: agent("agent-recovery"),
        backup_id: backup.id,
        correlation_id: "corr-restore-agent",
        environment: "TEST",
      }),
    /HUMAN_RECOVERY_AUTHORITY_REQUIRED/,
  );
  await assert.rejects(
    () =>
      service.restore({
        actor: human("human-recovery-authority"),
        backup_id: backup.id,
        correlation_id: "corr-production-restore",
        environment: "PRODUCTION",
      }),
    /PRODUCTION_RESTORE_FORBIDDEN/,
  );
});

test("rejects a corrupted restore and marks stale backup health", async () => {
  const adapter = new TestBackupAdapter();
  let now = new Date("2026-09-04T01:00:00Z");
  const service = new BackupRecoveryService(adapter, () => now);
  const backup = await service.createBackup({
    actor: human("human-backup-operator"),
    correlation_id: "corr-backup",
    environment: "TEST",
    id: "backup-corruption-probe",
    policy: {
      encryption_required: true,
      max_age_ms: 1_000,
      retention_days: 7,
    },
    source_data: "phase-1P-test-data",
  });
  adapter.corruptRestore = true;
  await assert.rejects(
    () =>
      service.restore({
        actor: human("human-recovery-authority"),
        backup_id: backup.id,
        correlation_id: "corr-corrupt",
        environment: "TEST",
      }),
    /RESTORE_INTEGRITY_FAILED/,
  );
  now = new Date("2026-09-04T01:00:02Z");
  assert.equal(service.backupHealth(backup.id), "STALE");
  adapter.corruptRestore = false;
  await assert.rejects(
    () =>
      service.restore({
        actor: human("human-recovery-authority"),
        backup_id: backup.id,
        correlation_id: "corr-stale",
        environment: "TEST",
      }),
    /FRESH_BACKUP_REQUIRED/,
  );
});

test("simulates ordered disaster recovery with human authority and evidence", async () => {
  const result = await simulateDisasterRecovery({
    actor: human("human-incident-commander"),
    backup_status: "VERIFIED",
    configuration_reference: "configref://maos/production",
    correlation_id: "corr-dr",
    failure: "DATABASE_UNAVAILABLE",
    known_good_artifact_id: "artifact-known-good",
    rpo_target_minutes: 60,
    rto_target_minutes: 120,
  });
  assert.equal(result.classification, "SIMULATED");
  assert.deepEqual(result.recovery_order, [
    "DATABASE",
    "CORE_API",
    "WORKER",
    "CONTROL_ROOM",
    "INTEGRATIONS",
  ]);
  assert.match(result.evidence_id, /^evidence-dr-/);
  await assert.rejects(
    () =>
      simulateDisasterRecovery({
        actor: agent("agent-incident"),
        backup_status: "VERIFIED",
        configuration_reference: "configref://maos/production",
        correlation_id: "corr-dr-agent",
        failure: "DATABASE_UNAVAILABLE",
        known_good_artifact_id: "artifact-known-good",
        rpo_target_minutes: 60,
        rto_target_minutes: 120,
      }),
    /HUMAN_INCIDENT_AUTHORITY_REQUIRED/,
  );
});

test("creates actionable correlated alerts and never treats UNKNOWN as healthy", () => {
  const monitoring = new MonitoringReadiness();
  monitoring.record({
    component: "DATABASE",
    correlation_id: "corr-monitoring",
    health: "UNAVAILABLE",
    runbook_reference: "runbook://database-unavailable",
  });
  monitoring.record({
    component: "BACKUP",
    correlation_id: "corr-monitoring",
    health: "UNKNOWN",
    runbook_reference: "runbook://backup-unavailable",
  });
  assert.equal(monitoring.readiness().status, "UNAVAILABLE");
  assert.deepEqual(
    monitoring.alerts().map(({ component, severity, state }) => ({
      component,
      severity,
      state,
    })),
    [
      { component: "DATABASE", severity: "CRITICAL", state: "OPEN" },
      { component: "BACKUP", severity: "WARNING", state: "OPEN" },
    ],
  );
});

test("requires logical human operational owners without fabricating personnel", () => {
  const registry = new OperationalAuthorityRegistry();
  for (const responsibility of [
    "OPERATIONS_OWNER",
    "RELEASE_APPROVER",
    "INCIDENT_AUTHORITY",
    "ROLLBACK_AUTHORITY",
    "SECURITY_ESCALATION",
    "BACKUP_RECOVERY_AUTHORITY",
  ] as const)
    registry.register({
      actor_reference: `role:${responsibility.toLowerCase()}`,
      actor_type: "HUMAN",
      responsibility,
    });
  assert.equal(registry.readiness().status, "READY");
  assert.throws(
    () =>
      registry.register({
        actor_reference: "agent:operator",
        actor_type: "AGENT",
        responsibility: "OPERATIONS_OWNER",
      }),
    (error) =>
      error instanceof OperationsError &&
      error.code === "HUMAN_OPERATIONAL_AUTHORITY_REQUIRED",
  );
});

test("accepts a staging-safe deployment provider contract without connecting to production", () => {
  assert.deepEqual(
    assessDeploymentProviderReadiness({
      artifact_binding: "EXACT_ID_COMMIT_HASH",
      capabilities: ["PREFLIGHT", "DEPLOY", "VERIFY", "ROLLBACK", "EVIDENCE"],
      evidence_required: true,
      human_approval_required: true,
      mode: "STAGING_SAFE",
      production_connected: false,
      provider_reference: "providerref://deployment/future-production",
      supported_environments: ["STAGING", "PRODUCTION"],
    }),
    {
      classification: "SIMULATED",
      missing_capabilities: [],
      status: "READY_FOR_PROVIDER_INTEGRATION",
    },
  );
  assert.throws(
    () =>
      assessDeploymentProviderReadiness({
        artifact_binding: "EXACT_ID_COMMIT_HASH",
        capabilities: ["PREFLIGHT", "DEPLOY", "VERIFY", "ROLLBACK", "EVIDENCE"],
        evidence_required: true,
        human_approval_required: true,
        mode: "STAGING_SAFE",
        production_connected: true,
        provider_reference: "providerref://deployment/live",
        supported_environments: ["PRODUCTION"],
      }),
    /PRODUCTION_CONNECTION_FORBIDDEN/,
  );
});

test("runs bounded local load and stability profiles against measurable thresholds", async () => {
  let calls = 0;
  const load = await runBoundedLoadProfile({
    concurrency: 5,
    max_error_rate: 0,
    max_p95_ms: 250,
    operation: async () => {
      calls += 1;
    },
    request_count: 50,
  });
  assert.equal(calls, 50);
  assert.equal(load.classification, "LOCAL_BOUNDED");
  assert.equal(load.status, "PASS");
  assert.equal(load.completed_requests, 50);

  const stability = await runBoundedStabilityProfile({
    iterations: 100,
    max_heap_growth_bytes: 64 * 1024 * 1024,
    operation: async () => undefined,
  });
  assert.equal(stability.classification, "LOCAL_BOUNDED");
  assert.equal(stability.status, "PASS");
  assert.equal(stability.completed_iterations, 100);
});
