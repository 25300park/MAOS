import assert from "node:assert/strict";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { createLogger } from "@maos/logging";
import { DevelopmentAgentTeam } from "../modules/agent-runtime/src/index.js";
import {
  BackupRecoveryService,
  EnterpriseProductionReadinessEvaluator,
  EnvironmentRegistry,
  MonitoringReadiness,
  OperationalAuthorityRegistry,
  ProductionReadinessEvidenceRegistry,
  assessProductionDeploymentReadiness,
  assessProductionEnvironmentContract,
  assessDeploymentProviderReadiness,
  createPhase12ReadinessRequirements,
  createPhase12RunbookCatalog,
  runBoundedLoadProfile,
  runBoundedStabilityProfile,
  simulateDisasterRecovery,
  type BackupAdapter,
} from "../modules/operations/src/index.js";
import {
  DevelopmentLoopEngine,
  WorkEngine,
} from "../modules/orchestration/src/index.js";
import { createApiServer } from "../apps/api/src/app.js";

class EncryptedTestBackupAdapter implements BackupAdapter {
  readonly mode = "TEST_ONLY" as const;
  readonly #key = randomBytes(32);

  async backup(input: { signal: AbortSignal; source_data: string }) {
    if (input.signal.aborted) throw new Error("BACKUP_CANCELLED");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const encrypted = Buffer.concat([
      cipher.update(input.source_data, "utf8"),
      cipher.final(),
    ]);
    return {
      encrypted_payload: Buffer.concat([
        iv,
        cipher.getAuthTag(),
        encrypted,
      ]).toString("base64"),
      encryption: "AES-256-GCM:test-ephemeral-key",
      evidence_ids: ["evidence-phase-1p-backup"],
    };
  }

  async restore(input: { encrypted_payload: string; signal: AbortSignal }) {
    if (input.signal.aborted) throw new Error("RESTORE_CANCELLED");
    const encoded = Buffer.from(input.encrypted_payload, "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.#key,
      encoded.subarray(0, 12),
    );
    decipher.setAuthTag(encoded.subarray(12, 28));
    const restored = Buffer.concat([
      decipher.update(encoded.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
    return {
      evidence_ids: ["evidence-phase-1p-restore"],
      restored_data: restored,
    };
  }
}

const environments = new EnvironmentRegistry();
for (const name of ["DEVELOPMENT", "PREVIEW", "STAGING", "PRODUCTION"] as const)
  environments.register({
    configuration_reference: `configref://maos/${name.toLowerCase()}`,
    credential_reference: `secretref://maos/${name.toLowerCase()}`,
    debug: name === "DEVELOPMENT",
    health: "HEALTHY",
    isolated: true,
    name,
    origin: `https://${name.toLowerCase()}.maos.example`,
    production_authority:
      name === "PRODUCTION" ? ["role:release-approver"] : [],
    rollback_artifact_id: `artifact-${name.toLowerCase()}-known-good`,
    service_identity: `system-maos-${name.toLowerCase()}`,
  });
assert.equal(environments.readiness("PRODUCTION").status, "READY");

const ownership = new OperationalAuthorityRegistry();
for (const responsibility of [
  "OPERATIONS_OWNER",
  "RELEASE_APPROVER",
  "INCIDENT_AUTHORITY",
  "ROLLBACK_AUTHORITY",
  "SECURITY_ESCALATION",
  "BACKUP_RECOVERY_AUTHORITY",
] as const)
  ownership.register({
    actor_reference: `role:${responsibility.toLowerCase()}`,
    actor_type: "HUMAN",
    responsibility,
  });
assert.equal(ownership.readiness().status, "READY");

const backupService = new BackupRecoveryService(
  new EncryptedTestBackupAdapter(),
);
const testData = JSON.stringify({ project: "phase-1p", records: [1, 2, 3] });
const backup = await backupService.createBackup({
  actor: { id: "human-backup-operator", type: "HUMAN" },
  correlation_id: "corr-phase-1p-backup",
  environment: "TEST",
  id: "backup-phase-1p-verification",
  policy: {
    encryption_required: true,
    max_age_ms: 3_600_000,
    retention_days: 7,
  },
  source_data: testData,
});
const restore = await backupService.restore({
  actor: { id: "human-recovery-authority", type: "HUMAN" },
  backup_id: backup.id,
  correlation_id: "corr-phase-1p-restore",
  environment: "TEST",
});
assert.equal(restore.status, "VERIFIED");

const databases: PGlite[] = [];
try {
  for (let index = 0; index < 3; index += 1) {
    const database = new PGlite();
    databases.push(database);
    const result = await database.query<{ value: number }>("SELECT 1 AS value");
    assert.equal(result.rows[0]?.value, 1);
  }
} finally {
  await Promise.all(databases.map((database) => database.close()));
}

const server = createApiServer({ environment: "development", service: "api" });
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address() as AddressInfo;
const healthUrl = `http://127.0.0.1:${address.port}/health`;
let apiLoad;
try {
  apiLoad = await runBoundedLoadProfile({
    concurrency: 10,
    max_error_rate: 0,
    max_p95_ms: 500,
    operation: async () => {
      const response = await fetch(healthUrl);
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
    },
    request_count: 100,
  });
  assert.equal(apiLoad.status, "PASS");
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

const logs: string[] = [];
const logger = createLogger({
  environment: "test",
  service: "phase-1p-stability",
  write: (line) => logs.push(line),
});
const work = new WorkEngine();
work.createProject({
  actor: { id: "human-operator", type: "HUMAN" },
  correlation_id: "corr-phase-1p-stability",
  department_id: "department-operations",
  id: "project-phase-1p-stability",
  idempotency_key: "project-phase-1p-stability",
  name: "Phase 1P stability",
  organization_id: "mrhomes",
  owner: { id: "human-operator", type: "HUMAN" },
});
const team = new DevelopmentAgentTeam();
const role = team.getRoleContract("REQUIREMENT_PRODUCT_AGENT");
team.registerMember({
  agent_id: "agent-requirement-stability",
  current_assignment_id: null,
  health: "HEALTHY",
  lifecycle: "ACTIVE",
  model_policy: {
    model_ids: ["model-stability"],
    required_capabilities: ["TEXT"],
  },
  role: "REQUIREMENT_PRODUCT_AGENT",
  runner_policy: {
    required_capabilities: ["LOCAL"],
    runner_ids: ["runner-stability"],
  },
  runtime_status: "AVAILABLE",
  skill_ids: [...role.skill_ids],
  tool_permissions: role.tool_capabilities.map((capability) => ({
    capability,
    effect: "ALLOW" as const,
    risk: "R0" as const,
  })),
});
const loop = new DevelopmentLoopEngine(work, team);
loop.createDefinition({
  allowed_tool_capabilities: ["READ_FILE"],
  id: "definition-phase-1p-stability",
  implementation_role: "BACKEND_AGENT",
  max_cost_amount: 1,
  max_iterations: 1,
  name: "Bounded stability probe",
  no_progress_limit: 1,
  time_budget_ms: 60_000,
  version: 1,
});
let iteration = 0;
const stability = await runBoundedStabilityProfile({
  iterations: 100,
  max_heap_growth_bytes: 128 * 1024 * 1024,
  operation: async () => {
    iteration += 1;
    const runId = `loop-run-stability-${iteration}`;
    loop.trigger({
      actor: { id: "human-operator", type: "HUMAN" },
      correlation_id: `corr-stability-${iteration}`,
      definition_id: "definition-phase-1p-stability",
      id: runId,
      project_id: "project-phase-1p-stability",
      trigger: { id: `request-${iteration}`, type: "HUMAN_REQUEST" },
    });
    loop.cancel(
      runId,
      { id: "human-operator", type: "HUMAN" },
      `corr-stability-${iteration}`,
    );
    logger.info("bounded iteration complete", {
      correlation_id: `corr-stability-${iteration}`,
      run_id: runId,
    });
  },
});
assert.equal(stability.status, "PASS");
assert.equal(logs.length, 100);
assert.equal(team.listMembers()[0]?.runtime_status, "AVAILABLE");

const monitoring = new MonitoringReadiness();
for (const component of [
  "APPLICATION",
  "DATABASE",
  "RUNNER",
  "INTEGRATION",
  "BACKUP",
  "SECURITY_GOVERNANCE",
] as const)
  monitoring.record({
    component,
    correlation_id: "corr-phase-1p-monitoring",
    health: "HEALTHY",
    runbook_reference: `runbook://${component.toLowerCase()}`,
  });
assert.equal(monitoring.readiness().status, "HEALTHY");

const provider = assessDeploymentProviderReadiness({
  artifact_binding: "EXACT_ID_COMMIT_HASH",
  capabilities: ["PREFLIGHT", "DEPLOY", "VERIFY", "ROLLBACK", "EVIDENCE"],
  evidence_required: true,
  human_approval_required: true,
  mode: "STAGING_SAFE",
  production_connected: false,
  provider_reference: "providerref://deployment/future-production",
  supported_environments: ["STAGING", "PRODUCTION"],
});
assert.equal(provider.status, "READY_FOR_PROVIDER_INTEGRATION");

const disasterRecovery = await simulateDisasterRecovery({
  actor: { id: "human-incident-commander", type: "HUMAN" },
  backup_status: "VERIFIED",
  configuration_reference: "configref://maos/production",
  correlation_id: "corr-phase-1p-dr",
  failure: "DATABASE_UNAVAILABLE",
  known_good_artifact_id: "artifact-production-known-good",
  rpo_target_minutes: 60,
  rto_target_minutes: 120,
});

const productionEnvironment = assessProductionEnvironmentContract({
  environment_id: "production",
});
assert.equal(productionEnvironment.classification, "NOT_READY");
assert.equal(productionEnvironment.missing_fields.includes("region"), true);

const deploymentReadiness = assessProductionDeploymentReadiness({
  artifact_integrity_sha256: "0".repeat(64),
  artifact_reference: "artifact://maos/current-build",
  commit_sha: "0000000000000000000000000000000000000000",
  environment_contract_ready: false,
  exact_artifact_verified: true,
  post_deploy_verification_reference: "runbook://post-deploy-verify",
  provider_ready: false,
  rollback_artifact_reference: "artifact://maos/known-good",
});
assert.equal(deploymentReadiness.classification, "NOT_READY");
assert.equal(deploymentReadiness.production_deployment_approved, false);

const observedAt = new Date();
const validUntil = new Date(observedAt.getTime() + 3_600_000);
const localRequirementEvidence = [
  ["encrypted-backup-controls", "NON_PRODUCTION"],
  ["simulated-disaster-recovery", "SIMULATED"],
  ["security-boundary-regression", "NON_PRODUCTION"],
  ["bounded-load", "NON_PRODUCTION"],
  ["retry-recovery-resilience", "NON_PRODUCTION"],
  ["phase-12-verification-gate", "NON_PRODUCTION"],
  ["production-monitoring", "NON_PRODUCTION"],
  ["production-alerting", "NON_PRODUCTION"],
  ["incident-response-exercise", "SIMULATED"],
  ["phase-12-runbooks", "NON_PRODUCTION"],
] as const;
const readiness = new EnterpriseProductionReadinessEvaluator(
  createPhase12ReadinessRequirements(),
).evaluate({
  deployment_readiness: deploymentReadiness,
  enterprise_mvp_ready: true,
  evidence_registry: (() => {
    const registry = new ProductionReadinessEvidenceRegistry();
    for (const [requirement_id, classification] of localRequirementEvidence) {
      const artifactPayload = `${requirement_id}:${classification}`;
      registry.register({
        artifact_payload: artifactPayload,
        classification,
        environment: "TEST",
        evidence_reference: `evidence://phase-12/${requirement_id}`,
        integrity_sha256: createHash("sha256")
          .update(artifactPayload)
          .digest("hex"),
        issuer_reference: "system://maos/verification",
        observed_at: observedAt.toISOString(),
        outcome: "PASS",
        provenance_reference: `provenance://phase-12/${requirement_id}`,
        requirement_id,
        valid_until: validUntil.toISOString(),
      });
    }
    return registry;
  })(),
  owners: [
    "PRODUCTION_OWNER",
    "DEPLOYMENT_APPROVER",
    "INCIDENT_COMMANDER",
    "BACKUP_OWNER",
    "RESTORE_OWNER",
    "SECURITY_OWNER",
    "ROLLBACK_AUTHORITY",
    "ESCALATION_CONTACT",
  ].map((responsibility) => ({
    actor_reference: `role:${responsibility.toLowerCase()}`,
    actor_type: "HUMAN" as const,
    responsibility: responsibility as
      | "PRODUCTION_OWNER"
      | "DEPLOYMENT_APPROVER"
      | "INCIDENT_COMMANDER"
      | "BACKUP_OWNER"
      | "RESTORE_OWNER"
      | "SECURITY_OWNER"
      | "ROLLBACK_AUTHORITY"
      | "ESCALATION_CONTACT",
  })),
  production_preparation_complete: true,
});
assert.equal(readiness.enterprise_mvp_ready, true);
assert.equal(readiness.production_preparation_complete, true);
assert.equal(readiness.production_ready, false);
assert.equal(readiness.production_deployment_approved, false);
assert.equal(readiness.phase_13_ready, true);
assert.equal(readiness.matrix.length, 19);
assert.equal(createPhase12RunbookCatalog().length, 14);

const artifactChecksum = createHash("sha256")
  .update(readFileSync("apps/api/dist/app.js"))
  .digest("hex");

process.stdout.write(
  `${JSON.stringify(
    {
      api_load: apiLoad,
      artifact_checksum: artifactChecksum,
      backup: {
        checksum: backup.checksum,
        classification: "TEST_DATA",
        restore: restore.status,
      },
      database_connections: 3,
      disaster_recovery: disasterRecovery.classification,
      environments: "READY",
      long_soak: "NOT_RUN",
      monitoring: monitoring.readiness().status,
      operational_ownership: ownership.readiness().status,
      phase_12: {
        deployment_readiness: deploymentReadiness,
        production_environment: productionEnvironment,
        readiness,
        runbooks: createPhase12RunbookCatalog().length,
      },
      provider: provider.status,
      stability,
    },
    null,
    2,
  )}\n`,
);
