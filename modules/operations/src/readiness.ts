import { OperationsError, type OperationsActor } from "./index.js";

export interface BackupReadinessInput {
  backup_id: string;
  checksum_verified: boolean;
  encrypted: boolean;
  evidence_refs: readonly string[];
  last_verified_at: string;
  max_age_ms: number;
  owner_reference: string;
}

export class BackupReadinessRegistry {
  constructor(private readonly now: () => Date = () => new Date()) {}

  assess(input: BackupReadinessInput): {
    backup_id: string;
    reasons: string[];
    status: "RESTORE_ELIGIBLE" | "RESTORE_REJECTED";
  } {
    const reasons: string[] = [];
    if (!input.encrypted) reasons.push("BACKUP_ENCRYPTION_REQUIRED");
    if (!input.checksum_verified) reasons.push("BACKUP_CHECKSUM_UNVERIFIED");
    const verifiedAt = new Date(input.last_verified_at).getTime();
    const age = this.now().getTime() - verifiedAt;
    if (
      !Number.isFinite(verifiedAt) ||
      !Number.isFinite(input.max_age_ms) ||
      input.max_age_ms <= 0 ||
      age < 0 ||
      age > input.max_age_ms
    )
      reasons.push("BACKUP_STALE");
    if (
      input.evidence_refs.length === 0 ||
      !input.owner_reference.startsWith("role:")
    )
      reasons.push("BACKUP_GOVERNANCE_EVIDENCE_REQUIRED");
    return {
      backup_id: input.backup_id,
      reasons,
      status: reasons.length === 0 ? "RESTORE_ELIGIBLE" : "RESTORE_REJECTED",
    };
  }
}

export interface DisasterRecoveryExercise {
  classification: "SIMULATED";
  dependency_ids: readonly string[];
  evidence_refs: readonly string[];
  exercised_at: string;
  id: string;
  owner_reference: string;
  recovery_priority: number;
  rpo_target_reference: string;
  rto_target_reference: string;
  status: "EXERCISED_SIMULATED";
}

export class DisasterRecoveryRegistry {
  readonly #exercises = new Map<string, DisasterRecoveryExercise>();

  recordExercise(input: {
    actor: OperationsActor;
    classification: "SIMULATED";
    dependency_ids: readonly string[];
    evidence_refs: readonly string[];
    exercised_at: string;
    id: string;
    owner_reference: string;
    recovery_priority: number;
    rpo_target_reference: string;
    rto_target_reference: string;
  }): Readonly<DisasterRecoveryExercise> {
    if (input.actor.type !== "HUMAN")
      throw new OperationsError("HUMAN_DR_AUTHORITY_REQUIRED");
    if (
      input.classification !== "SIMULATED" ||
      input.dependency_ids.length === 0 ||
      input.evidence_refs.length === 0 ||
      input.recovery_priority <= 0 ||
      !input.owner_reference.startsWith("role:") ||
      !input.rpo_target_reference.startsWith("policy://") ||
      !input.rto_target_reference.startsWith("policy://")
    )
      throw new OperationsError("INVALID_DR_EXERCISE");
    const exercise = Object.freeze({
      classification: "SIMULATED" as const,
      dependency_ids: Object.freeze([...input.dependency_ids]),
      evidence_refs: Object.freeze([...input.evidence_refs]),
      exercised_at: input.exercised_at,
      id: input.id,
      owner_reference: input.owner_reference,
      recovery_priority: input.recovery_priority,
      rpo_target_reference: input.rpo_target_reference,
      rto_target_reference: input.rto_target_reference,
      status: "EXERCISED_SIMULATED" as const,
    });
    this.#exercises.set(exercise.id, exercise);
    return exercise;
  }
}

export interface Runbook {
  diagnosis: readonly string[];
  escalation: string;
  id: string;
  purpose: string;
  recovery: readonly string[];
  rollback: readonly string[];
  safe_actions: readonly string[];
  symptoms: readonly string[];
  verification: readonly string[];
}

export class RunbookRegistry {
  readonly #runbooks = new Map<string, Runbook>();

  register(input: Runbook): Readonly<Runbook> {
    const lists = [
      input.diagnosis,
      input.recovery,
      input.rollback,
      input.safe_actions,
      input.symptoms,
      input.verification,
    ];
    if (
      !input.id ||
      !input.purpose ||
      !input.escalation.startsWith("role:") ||
      lists.some((items) => items.length === 0)
    )
      throw new OperationsError("INCOMPLETE_RUNBOOK");
    const runbook = Object.freeze({
      ...input,
      diagnosis: Object.freeze([...input.diagnosis]),
      recovery: Object.freeze([...input.recovery]),
      rollback: Object.freeze([...input.rollback]),
      safe_actions: Object.freeze([...input.safe_actions]),
      symptoms: Object.freeze([...input.symptoms]),
      verification: Object.freeze([...input.verification]),
    });
    this.#runbooks.set(runbook.id, runbook);
    return runbook;
  }
}

export function createPhase11RunbookCatalog(): readonly Runbook[] {
  const definitions = [
    ["runbook-service-failure", "Recover a failed MAOS service"],
    ["runbook-database-failure", "Recover database availability safely"],
    ["runbook-integration-failure", "Contain an integration failure"],
    ["runbook-deployment-failure", "Contain a simulated deployment failure"],
    ["runbook-rollback", "Prepare a governed rollback"],
    ["runbook-backup", "Verify a non-production backup"],
    ["runbook-restore", "Verify a non-production restore"],
    ["runbook-security-incident", "Respond to a security incident"],
    [
      "runbook-credential-rotation-reference",
      "Coordinate credential rotation by secret reference",
    ],
    ["runbook-kill-switch", "Engage a governed kill switch"],
    ["runbook-emergency-pause", "Pause governed execution safely"],
  ] as const;
  const registry = new RunbookRegistry();
  return definitions.map(([id, purpose]) =>
    registry.register({
      diagnosis: ["Inspect fresh correlated health, event, and audit evidence"],
      escalation: "role:incident-commander",
      id,
      purpose,
      recovery: ["Recover only inside the authorized environment and scope"],
      rollback: [
        "Use the exact known-good artifact or configuration reference",
      ],
      safe_actions: [
        "Pause dependent work and preserve domain-system autonomy",
      ],
      symptoms: ["A governed health or security threshold is not healthy"],
      verification: ["Re-run health, integrity, security, and evidence checks"],
    }),
  );
}

export type ProductionGap =
  | "AUTHORIZED_EXTERNAL_PENETRATION_TEST"
  | "DNS_NETWORK_TLS"
  | "LONG_SOAK"
  | "MEASURED_RPO_RTO"
  | "NAMED_OPERATIONAL_OWNERS"
  | "PRODUCTION_CREDENTIALS"
  | "PRODUCTION_DEPLOYMENT_APPROVAL"
  | "PRODUCTION_LIKE_CAPACITY"
  | "REAL_PRODUCTION_PROVIDER_INFRASTRUCTURE"
  | "REAL_PRODUCTION_RESTORE";

const PRODUCTION_GAPS: readonly ProductionGap[] = [
  "REAL_PRODUCTION_PROVIDER_INFRASTRUCTURE",
  "PRODUCTION_CREDENTIALS",
  "DNS_NETWORK_TLS",
  "REAL_PRODUCTION_RESTORE",
  "MEASURED_RPO_RTO",
  "LONG_SOAK",
  "PRODUCTION_LIKE_CAPACITY",
  "AUTHORIZED_EXTERNAL_PENETRATION_TEST",
  "NAMED_OPERATIONAL_OWNERS",
  "PRODUCTION_DEPLOYMENT_APPROVAL",
];

export interface ProductionGapRecord {
  classification?: "SIMULATED";
  evidence_reference?: string;
  gap: ProductionGap;
  status: "OPEN" | "EVIDENCE_PENDING";
}

export class ProductionGapTracker {
  readonly #records = new Map<ProductionGap, ProductionGapRecord>(
    PRODUCTION_GAPS.map((gap) => [gap, Object.freeze({ gap, status: "OPEN" })]),
  );

  recordEvidence(input: {
    classification: "SIMULATED";
    evidence_reference: string;
    gap: ProductionGap;
  }): Readonly<ProductionGapRecord> {
    if (!input.evidence_reference.startsWith("evidence://"))
      throw new OperationsError("PRODUCTION_GAP_EVIDENCE_REQUIRED");
    const record = Object.freeze({
      classification: input.classification,
      evidence_reference: input.evidence_reference,
      gap: input.gap,
      status: "EVIDENCE_PENDING" as const,
    });
    this.#records.set(input.gap, record);
    return record;
  }

  snapshot(): readonly ProductionGapRecord[] {
    return [...this.#records.values()];
  }
}
