import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export type OperationsActor = {
  id: string;
  type: "HUMAN" | "AGENT" | "SYSTEM";
};
export type EnvironmentName =
  "DEVELOPMENT" | "PREVIEW" | "STAGING" | "PRODUCTION";
export type OperationsHealth =
  "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "MAINTENANCE" | "UNKNOWN";

export class OperationsError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export interface EnvironmentProfile {
  configuration_reference: string;
  credential_reference: string;
  debug: boolean;
  health: OperationsHealth;
  isolated: boolean;
  name: EnvironmentName;
  origin: string;
  production_authority: readonly string[];
  rollback_artifact_id: string;
  service_identity: string;
}

export class EnvironmentRegistry {
  readonly #profiles = new Map<EnvironmentName, Readonly<EnvironmentProfile>>();

  register(input: EnvironmentProfile): Readonly<EnvironmentProfile> {
    if (
      !input.credential_reference.startsWith("secretref://") ||
      input.credential_reference.length === "secretref://".length
    )
      throw new OperationsError("SECRET_REFERENCE_REQUIRED");
    if (!input.configuration_reference.startsWith("configref://"))
      throw new OperationsError("CONFIGURATION_REFERENCE_REQUIRED");
    if (
      [...this.#profiles.values()].some(
        (profile) =>
          profile.name !== input.name &&
          (profile.configuration_reference === input.configuration_reference ||
            profile.credential_reference === input.credential_reference ||
            profile.service_identity === input.service_identity),
      )
    )
      throw new OperationsError("ENVIRONMENT_ISOLATION_REQUIRED");
    if (!input.isolated)
      throw new OperationsError("ENVIRONMENT_ISOLATION_REQUIRED");
    if (input.name === "PRODUCTION") {
      if (input.debug) throw new OperationsError("PRODUCTION_DEBUG_FORBIDDEN");
      if (!input.origin.startsWith("https://"))
        throw new OperationsError("HTTPS_ORIGIN_REQUIRED");
      if (input.production_authority.length === 0)
        throw new OperationsError("PRODUCTION_AUTHORITY_REQUIRED");
    }
    if (!input.rollback_artifact_id || !input.service_identity)
      throw new OperationsError("ENVIRONMENT_CONFIGURATION_INCOMPLETE");
    const profile = Object.freeze({
      ...input,
      production_authority: Object.freeze([...input.production_authority]),
    });
    this.#profiles.set(profile.name, profile);
    return profile;
  }

  readiness(name: EnvironmentName): {
    status: "READY" | "NOT_READY";
    reasons: readonly string[];
  } {
    const profile = this.#profiles.get(name);
    if (!profile)
      return { reasons: ["ENVIRONMENT_NOT_REGISTERED"], status: "NOT_READY" };
    const reasons: string[] = [];
    if (profile.health !== "HEALTHY") reasons.push(`HEALTH_${profile.health}`);
    if (name === "PRODUCTION" && profile.production_authority.length === 0)
      reasons.push("PRODUCTION_AUTHORITY_REQUIRED");
    return { reasons, status: reasons.length === 0 ? "READY" : "NOT_READY" };
  }
}

export interface BackupAdapter {
  readonly mode: "TEST_ONLY" | "STAGING_SAFE";
  backup(input: { signal: AbortSignal; source_data: string }): Promise<{
    encrypted_payload: string;
    encryption: string;
    evidence_ids: readonly string[];
  }>;
  restore(input: {
    encrypted_payload: string;
    signal: AbortSignal;
  }): Promise<{ evidence_ids: readonly string[]; restored_data: string }>;
}

export interface BackupRecord {
  checksum: string;
  correlation_id: string;
  created_at: string;
  encryption: string;
  environment: "TEST" | "STAGING";
  evidence_ids: readonly string[];
  expires_at: string;
  health: "FRESH" | "STALE";
  id: string;
  max_age_ms: number;
  retention_days: number;
}

interface StoredBackup extends BackupRecord {
  encrypted_payload: string;
}

const digest = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export class BackupRecoveryService {
  readonly #backups = new Map<string, StoredBackup>();

  constructor(
    private readonly adapter: BackupAdapter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createBackup(input: {
    actor: OperationsActor;
    correlation_id: string;
    environment: "TEST" | "STAGING";
    id: string;
    policy: {
      encryption_required: boolean;
      max_age_ms: number;
      retention_days: number;
    };
    source_data: string;
  }): Promise<BackupRecord> {
    if (input.actor.type !== "HUMAN")
      throw new OperationsError("HUMAN_BACKUP_AUTHORITY_REQUIRED");
    if (
      !input.id ||
      !input.source_data ||
      input.policy.max_age_ms <= 0 ||
      input.policy.retention_days <= 0
    )
      throw new OperationsError("INVALID_BACKUP_REQUEST");
    const result = await this.adapter.backup({
      signal: new AbortController().signal,
      source_data: input.source_data,
    });
    if (input.policy.encryption_required && !result.encryption)
      throw new OperationsError("BACKUP_ENCRYPTION_REQUIRED");
    const created = this.now();
    const stored: StoredBackup = {
      checksum: digest(input.source_data),
      correlation_id: input.correlation_id,
      created_at: created.toISOString(),
      encrypted_payload: result.encrypted_payload,
      encryption: result.encryption,
      environment: input.environment,
      evidence_ids: Object.freeze([...result.evidence_ids]),
      expires_at: new Date(
        created.getTime() + input.policy.retention_days * 86_400_000,
      ).toISOString(),
      health: "FRESH",
      id: input.id,
      max_age_ms: input.policy.max_age_ms,
      retention_days: input.policy.retention_days,
    };
    this.#backups.set(input.id, stored);
    return this.publicRecord(stored);
  }

  async restore(input: {
    actor: OperationsActor;
    backup_id: string;
    correlation_id: string;
    environment: "TEST" | "STAGING" | "PRODUCTION";
  }): Promise<{
    backup_id: string;
    checksum: string;
    evidence_ids: readonly string[];
    status: "VERIFIED";
  }> {
    if (input.actor.type !== "HUMAN")
      throw new OperationsError("HUMAN_RECOVERY_AUTHORITY_REQUIRED");
    if (input.environment === "PRODUCTION")
      throw new OperationsError("PRODUCTION_RESTORE_FORBIDDEN");
    const backup = this.#backups.get(input.backup_id);
    if (!backup) throw new OperationsError("BACKUP_NOT_FOUND");
    if (this.backupHealth(backup.id) !== "FRESH")
      throw new OperationsError("FRESH_BACKUP_REQUIRED");
    const restored = await this.adapter.restore({
      encrypted_payload: backup.encrypted_payload,
      signal: new AbortController().signal,
    });
    if (digest(restored.restored_data) !== backup.checksum)
      throw new OperationsError("RESTORE_INTEGRITY_FAILED");
    return {
      backup_id: backup.id,
      checksum: backup.checksum,
      evidence_ids: Object.freeze([
        ...backup.evidence_ids,
        ...restored.evidence_ids,
      ]),
      status: "VERIFIED",
    };
  }

  backupHealth(id: string): "FRESH" | "STALE" {
    const backup = this.#backups.get(id);
    if (!backup) throw new OperationsError("BACKUP_NOT_FOUND");
    return this.now().getTime() - new Date(backup.created_at).getTime() <=
      backup.max_age_ms
      ? "FRESH"
      : "STALE";
  }

  private publicRecord(backup: StoredBackup): BackupRecord {
    return Object.freeze({
      checksum: backup.checksum,
      correlation_id: backup.correlation_id,
      created_at: backup.created_at,
      encryption: backup.encryption,
      environment: backup.environment,
      evidence_ids: backup.evidence_ids,
      expires_at: backup.expires_at,
      health: this.backupHealth(backup.id),
      id: backup.id,
      max_age_ms: backup.max_age_ms,
      retention_days: backup.retention_days,
    });
  }
}

export async function simulateDisasterRecovery(input: {
  actor: OperationsActor;
  backup_status: "VERIFIED" | "MISSING" | "FAILED";
  configuration_reference: string;
  correlation_id: string;
  failure:
    "DATABASE_UNAVAILABLE" | "SERVICE_UNAVAILABLE" | "CONFIGURATION_FAILURE";
  known_good_artifact_id: string;
  rpo_target_minutes: number;
  rto_target_minutes: number;
}): Promise<{
  classification: "SIMULATED";
  evidence_id: string;
  recovery_order: readonly string[];
}> {
  if (input.actor.type !== "HUMAN")
    throw new OperationsError("HUMAN_INCIDENT_AUTHORITY_REQUIRED");
  if (input.backup_status !== "VERIFIED")
    throw new OperationsError("VERIFIED_BACKUP_REQUIRED");
  if (
    !input.configuration_reference.startsWith("configref://") ||
    !input.known_good_artifact_id ||
    input.rpo_target_minutes <= 0 ||
    input.rto_target_minutes <= 0
  )
    throw new OperationsError("RECOVERY_PLAN_INCOMPLETE");
  return {
    classification: "SIMULATED",
    evidence_id: `evidence-dr-${randomUUID()}`,
    recovery_order: Object.freeze([
      "DATABASE",
      "CORE_API",
      "WORKER",
      "CONTROL_ROOM",
      "INTEGRATIONS",
    ]),
  };
}

export interface MonitoringSignal {
  component:
    | "APPLICATION"
    | "DATABASE"
    | "RUNNER"
    | "INTEGRATION"
    | "BACKUP"
    | "SECURITY_GOVERNANCE";
  correlation_id: string;
  health: OperationsHealth;
  runbook_reference: string;
}

export interface OperationalAlert {
  component: MonitoringSignal["component"];
  correlation_id: string;
  runbook_reference: string;
  severity: "NOTICE" | "WARNING" | "CRITICAL";
  state: "OPEN";
}

export class MonitoringReadiness {
  readonly #signals = new Map<
    MonitoringSignal["component"],
    MonitoringSignal
  >();
  readonly #alerts: OperationalAlert[] = [];

  record(input: MonitoringSignal): void {
    if (
      !input.correlation_id ||
      !input.runbook_reference.startsWith("runbook://")
    )
      throw new OperationsError("ACTIONABLE_MONITORING_EVIDENCE_REQUIRED");
    this.#signals.set(input.component, Object.freeze({ ...input }));
    if (input.health !== "HEALTHY")
      this.#alerts.push(
        Object.freeze({
          component: input.component,
          correlation_id: input.correlation_id,
          runbook_reference: input.runbook_reference,
          severity:
            input.health === "UNAVAILABLE"
              ? "CRITICAL"
              : input.health === "MAINTENANCE"
                ? "NOTICE"
                : "WARNING",
          state: "OPEN" as const,
        }),
      );
  }

  readiness(): { status: OperationsHealth } {
    const health = [...this.#signals.values()].map((signal) => signal.health);
    if (health.includes("UNAVAILABLE")) return { status: "UNAVAILABLE" };
    if (health.includes("DEGRADED")) return { status: "DEGRADED" };
    if (health.includes("UNKNOWN")) return { status: "UNKNOWN" };
    if (health.includes("MAINTENANCE")) return { status: "MAINTENANCE" };
    return { status: health.length > 0 ? "HEALTHY" : "UNKNOWN" };
  }

  alerts(): ReadonlyArray<Readonly<OperationalAlert>> {
    return this.#alerts.map((alert) => ({ ...alert }));
  }
}

export type OperationalResponsibility =
  | "OPERATIONS_OWNER"
  | "RELEASE_APPROVER"
  | "INCIDENT_AUTHORITY"
  | "ROLLBACK_AUTHORITY"
  | "SECURITY_ESCALATION"
  | "BACKUP_RECOVERY_AUTHORITY";

export class OperationalAuthorityRegistry {
  readonly #assignments = new Map<OperationalResponsibility, string>();

  register(input: {
    actor_reference: string;
    actor_type: OperationsActor["type"];
    responsibility: OperationalResponsibility;
  }): void {
    if (input.actor_type !== "HUMAN")
      throw new OperationsError("HUMAN_OPERATIONAL_AUTHORITY_REQUIRED");
    if (!input.actor_reference.startsWith("role:"))
      throw new OperationsError("LOGICAL_ROLE_REFERENCE_REQUIRED");
    this.#assignments.set(input.responsibility, input.actor_reference);
  }

  readiness(): {
    missing: OperationalResponsibility[];
    status: "READY" | "NOT_READY";
  } {
    const required: OperationalResponsibility[] = [
      "OPERATIONS_OWNER",
      "RELEASE_APPROVER",
      "INCIDENT_AUTHORITY",
      "ROLLBACK_AUTHORITY",
      "SECURITY_ESCALATION",
      "BACKUP_RECOVERY_AUTHORITY",
    ];
    const missing = required.filter((item) => !this.#assignments.has(item));
    return { missing, status: missing.length === 0 ? "READY" : "NOT_READY" };
  }
}

const DEPLOYMENT_PROVIDER_CAPABILITIES = [
  "PREFLIGHT",
  "DEPLOY",
  "VERIFY",
  "ROLLBACK",
  "EVIDENCE",
] as const;

export function assessDeploymentProviderReadiness(input: {
  artifact_binding: "EXACT_ID_COMMIT_HASH" | "UNBOUND";
  capabilities: readonly string[];
  evidence_required: boolean;
  human_approval_required: boolean;
  mode: "STAGING_SAFE";
  production_connected: boolean;
  provider_reference: string;
  supported_environments: readonly EnvironmentName[];
}): {
  classification: "SIMULATED";
  missing_capabilities: string[];
  status: "READY_FOR_PROVIDER_INTEGRATION" | "NOT_READY";
} {
  if (input.production_connected)
    throw new OperationsError("PRODUCTION_CONNECTION_FORBIDDEN");
  if (!input.provider_reference.startsWith("providerref://"))
    throw new OperationsError("PROVIDER_REFERENCE_REQUIRED");
  const missing = DEPLOYMENT_PROVIDER_CAPABILITIES.filter(
    (capability) => !input.capabilities.includes(capability),
  );
  const ready =
    missing.length === 0 &&
    input.artifact_binding === "EXACT_ID_COMMIT_HASH" &&
    input.evidence_required &&
    input.human_approval_required &&
    input.supported_environments.includes("PRODUCTION");
  return {
    classification: "SIMULATED",
    missing_capabilities: missing,
    status: ready ? "READY_FOR_PROVIDER_INTEGRATION" : "NOT_READY",
  };
}

export async function runBoundedLoadProfile(input: {
  concurrency: number;
  max_error_rate: number;
  max_p95_ms: number;
  operation: () => Promise<void>;
  request_count: number;
}): Promise<{
  classification: "LOCAL_BOUNDED";
  completed_requests: number;
  error_rate: number;
  p95_ms: number;
  status: "PASS" | "FAIL";
}> {
  if (
    input.request_count < 1 ||
    input.request_count > 10_000 ||
    input.concurrency < 1 ||
    input.concurrency > input.request_count ||
    input.max_error_rate < 0 ||
    input.max_error_rate > 1 ||
    input.max_p95_ms <= 0
  )
    throw new OperationsError("INVALID_BOUNDED_LOAD_PROFILE");
  let completed = 0;
  let errors = 0;
  const durations: number[] = [];
  for (
    let offset = 0;
    offset < input.request_count;
    offset += input.concurrency
  ) {
    const count = Math.min(input.concurrency, input.request_count - offset);
    await Promise.all(
      Array.from({ length: count }, async () => {
        const started = performance.now();
        try {
          await input.operation();
        } catch {
          errors += 1;
        } finally {
          durations.push(performance.now() - started);
          completed += 1;
        }
      }),
    );
  }
  durations.sort((a, b) => a - b);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? 0;
  const errorRate = errors / completed;
  return {
    classification: "LOCAL_BOUNDED",
    completed_requests: completed,
    error_rate: errorRate,
    p95_ms: p95,
    status:
      errorRate <= input.max_error_rate && p95 <= input.max_p95_ms
        ? "PASS"
        : "FAIL",
  };
}

export async function runBoundedStabilityProfile(input: {
  iterations: number;
  max_heap_growth_bytes: number;
  operation: () => Promise<void>;
}): Promise<{
  classification: "LOCAL_BOUNDED";
  completed_iterations: number;
  heap_growth_bytes: number;
  status: "PASS" | "FAIL";
}> {
  if (
    input.iterations < 1 ||
    input.iterations > 100_000 ||
    input.max_heap_growth_bytes < 0
  )
    throw new OperationsError("INVALID_BOUNDED_STABILITY_PROFILE");
  const startedHeap = process.memoryUsage().heapUsed;
  let completed = 0;
  let failed = false;
  for (let index = 0; index < input.iterations; index += 1) {
    try {
      await input.operation();
      completed += 1;
    } catch {
      failed = true;
      break;
    }
  }
  const growth = Math.max(0, process.memoryUsage().heapUsed - startedHeap);
  return {
    classification: "LOCAL_BOUNDED",
    completed_iterations: completed,
    heap_growth_bytes: growth,
    status:
      !failed &&
      completed === input.iterations &&
      growth <= input.max_heap_growth_bytes
        ? "PASS"
        : "FAIL",
  };
}

export * from "./hardening.js";
export * from "./alert-delivery.js";
export * from "./alert-runtime.js";
export * from "./readiness.js";
export * from "./reliability.js";
export * from "./enterprise-readiness.js";
