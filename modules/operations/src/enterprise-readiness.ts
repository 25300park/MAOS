import { createHash } from "node:crypto";
import { OperationsError, type OperationsActor } from "./index.js";
import {
  RunbookRegistry,
  createPhase11RunbookCatalog,
  type Runbook,
} from "./readiness.js";

export type ReadinessClassification =
  | "READY"
  | "PARTIALLY_READY"
  | "NOT_READY"
  | "SIMULATED_ONLY"
  | "HUMAN_ACTION_REQUIRED";

export type ReadinessArea =
  | "INFRASTRUCTURE"
  | "ENVIRONMENT"
  | "DEPLOYMENT"
  | "ROLLBACK"
  | "BACKUP"
  | "RESTORE"
  | "DR"
  | "SECURITY"
  | "PERFORMANCE"
  | "RELIABILITY"
  | "MONITORING"
  | "ALERTING"
  | "INCIDENT_RESPONSE"
  | "OPERATIONAL_OWNERSHIP"
  | "APPROVAL_AUTHORITY"
  | "RUNBOOKS"
  | "SECRETS"
  | "DNS_NETWORK_TLS"
  | "PROVIDER_INTEGRATION";

export type ReadinessOwnerResponsibility =
  | "PRODUCTION_OWNER"
  | "DEPLOYMENT_APPROVER"
  | "INCIDENT_COMMANDER"
  | "BACKUP_OWNER"
  | "RESTORE_OWNER"
  | "SECURITY_OWNER"
  | "ROLLBACK_AUTHORITY"
  | "ESCALATION_CONTACT";

export interface ReadinessOwner {
  actor_reference: string;
  actor_type: OperationsActor["type"];
  human_identity_reference?: string;
  responsibility: ReadinessOwnerResponsibility;
}

export interface ReadinessRequirement {
  area: ReadinessArea;
  gap?: EnterpriseProductionGap;
  id: string;
  owner_responsibility?: ReadinessOwnerResponsibility;
  real_production_required: boolean;
}

export interface ReadinessEvidence {
  authority_reference?: string;
  classification: "REAL_PRODUCTION" | "NON_PRODUCTION" | "SIMULATED";
  environment: "LOCAL" | "TEST" | "STAGING" | "PRODUCTION";
  evidence_reference: string;
  integrity_sha256: string;
  issuer_reference: string;
  observed_at: string;
  outcome: "PASS" | "FAIL";
  provenance_reference: string;
  requirement_id: string;
  valid_until: string;
}

export interface ReadinessEvidenceSubmission extends ReadinessEvidence {
  artifact_payload: string;
}

export class ProductionReadinessEvidenceRegistry {
  readonly #evidence = new Map<string, Readonly<ReadinessEvidence>>();

  register(input: ReadinessEvidenceSubmission): Readonly<ReadinessEvidence> {
    if (
      input.classification === "REAL_PRODUCTION" ||
      input.environment === "PRODUCTION"
    )
      throw new OperationsError("REAL_PRODUCTION_EVIDENCE_PROVIDER_REQUIRED");
    if (
      input.issuer_reference !== "system://maos/verification" ||
      !["REAL_PRODUCTION", "NON_PRODUCTION", "SIMULATED"].includes(
        input.classification,
      ) ||
      !["LOCAL", "TEST", "STAGING", "PRODUCTION"].includes(input.environment) ||
      !["PASS", "FAIL"].includes(input.outcome) ||
      !input.provenance_reference.startsWith("provenance://") ||
      !/^[0-9a-f]{64}$/u.test(input.integrity_sha256) ||
      createHash("sha256").update(input.artifact_payload).digest("hex") !==
        input.integrity_sha256 ||
      input.artifact_payload.length === 0 ||
      this.#evidence.has(input.evidence_reference)
    )
      throw new OperationsError("UNTRUSTED_READINESS_EVIDENCE");
    const record = Object.fromEntries(
      Object.entries(input).filter(([key]) => key !== "artifact_payload"),
    ) as unknown as ReadinessEvidence;
    const evidence = Object.freeze(record);
    this.#evidence.set(evidence.evidence_reference, evidence);
    return evidence;
  }

  list(): readonly Readonly<ReadinessEvidence>[] {
    return Object.freeze([...this.#evidence.values()]);
  }
}

export type EnterpriseProductionGap =
  | "REAL_PRODUCTION_PROVIDER_INFRASTRUCTURE"
  | "PRODUCTION_ENVIRONMENT"
  | "PRODUCTION_CREDENTIALS"
  | "DNS_NETWORK_TLS"
  | "REAL_PRODUCTION_DEPLOYMENT"
  | "REAL_ROLLBACK"
  | "REAL_PRODUCTION_RESTORE"
  | "MEASURED_RPO_RTO"
  | "LONG_SOAK"
  | "PRODUCTION_LIKE_CAPACITY"
  | "AUTHORIZED_EXTERNAL_PENETRATION_TEST"
  | "NAMED_OPERATIONAL_OWNERS"
  | "PRODUCTION_DEPLOYMENT_APPROVAL";

export interface ReadinessMatrixEntry {
  area: ReadinessArea;
  classification: ReadinessClassification;
  evidence_classifications: readonly ReadinessEvidence["classification"][];
  evidence_refs: readonly string[];
  gap_ids: readonly EnterpriseProductionGap[];
  requirement_ids: readonly string[];
}

export interface EnterpriseReadinessAssessment {
  enterprise_mvp_ready: boolean;
  matrix: readonly ReadinessMatrixEntry[];
  phase_13_ready: boolean;
  production_deployment_approved: boolean;
  production_gaps: readonly EnterpriseProductionGap[];
  production_preparation_complete: boolean;
  production_ready: boolean;
}

const AREAS: readonly ReadinessArea[] = [
  "INFRASTRUCTURE",
  "ENVIRONMENT",
  "DEPLOYMENT",
  "ROLLBACK",
  "BACKUP",
  "RESTORE",
  "DR",
  "SECURITY",
  "PERFORMANCE",
  "RELIABILITY",
  "MONITORING",
  "ALERTING",
  "INCIDENT_RESPONSE",
  "OPERATIONAL_OWNERSHIP",
  "APPROVAL_AUTHORITY",
  "RUNBOOKS",
  "SECRETS",
  "DNS_NETWORK_TLS",
  "PROVIDER_INTEGRATION",
];

const requirement = (
  id: string,
  area: ReadinessArea,
  realProductionRequired: boolean,
  options: {
    gap?: EnterpriseProductionGap;
    owner?: ReadinessOwnerResponsibility;
  } = {},
): ReadinessRequirement => ({
  area,
  id,
  real_production_required: realProductionRequired,
  ...(options.gap ? { gap: options.gap } : {}),
  ...(options.owner ? { owner_responsibility: options.owner } : {}),
});

export function createPhase12ReadinessRequirements(): readonly ReadinessRequirement[] {
  return Object.freeze([
    requirement("real-provider-infrastructure", "INFRASTRUCTURE", true, {
      gap: "REAL_PRODUCTION_PROVIDER_INFRASTRUCTURE",
    }),
    requirement("production-environment", "ENVIRONMENT", true, {
      gap: "PRODUCTION_ENVIRONMENT",
    }),
    requirement("real-production-deployment", "DEPLOYMENT", true, {
      gap: "REAL_PRODUCTION_DEPLOYMENT",
    }),
    requirement("real-rollback", "ROLLBACK", true, { gap: "REAL_ROLLBACK" }),
    requirement("encrypted-backup-controls", "BACKUP", false),
    requirement("real-production-restore", "RESTORE", true, {
      gap: "REAL_PRODUCTION_RESTORE",
      owner: "RESTORE_OWNER",
    }),
    requirement("simulated-disaster-recovery", "DR", false),
    requirement("measured-rpo-rto", "DR", true, {
      gap: "MEASURED_RPO_RTO",
    }),
    requirement("security-boundary-regression", "SECURITY", false),
    requirement("authorized-external-penetration-test", "SECURITY", true, {
      gap: "AUTHORIZED_EXTERNAL_PENETRATION_TEST",
      owner: "SECURITY_OWNER",
    }),
    requirement("bounded-load", "PERFORMANCE", false),
    requirement("long-soak", "PERFORMANCE", true, { gap: "LONG_SOAK" }),
    requirement("production-like-capacity", "PERFORMANCE", true, {
      gap: "PRODUCTION_LIKE_CAPACITY",
    }),
    requirement("retry-recovery-resilience", "RELIABILITY", false),
    requirement("phase-12-verification-gate", "RELIABILITY", false),
    requirement("production-monitoring", "MONITORING", true),
    requirement("production-alerting", "ALERTING", true),
    requirement("incident-response-exercise", "INCIDENT_RESPONSE", false, {
      owner: "INCIDENT_COMMANDER",
    }),
    requirement("production-owner", "OPERATIONAL_OWNERSHIP", false, {
      gap: "NAMED_OPERATIONAL_OWNERS",
      owner: "PRODUCTION_OWNER",
    }),
    requirement("backup-owner", "OPERATIONAL_OWNERSHIP", false, {
      gap: "NAMED_OPERATIONAL_OWNERS",
      owner: "BACKUP_OWNER",
    }),
    requirement("restore-owner", "OPERATIONAL_OWNERSHIP", false, {
      gap: "NAMED_OPERATIONAL_OWNERS",
      owner: "RESTORE_OWNER",
    }),
    requirement("rollback-authority", "OPERATIONAL_OWNERSHIP", false, {
      gap: "NAMED_OPERATIONAL_OWNERS",
      owner: "ROLLBACK_AUTHORITY",
    }),
    requirement("escalation-contact", "OPERATIONAL_OWNERSHIP", false, {
      gap: "NAMED_OPERATIONAL_OWNERS",
      owner: "ESCALATION_CONTACT",
    }),
    requirement("deployment-approver", "APPROVAL_AUTHORITY", false, {
      owner: "DEPLOYMENT_APPROVER",
    }),
    requirement("phase-12-runbooks", "RUNBOOKS", false),
    requirement("production-secret-manager", "SECRETS", true, {
      gap: "PRODUCTION_CREDENTIALS",
    }),
    requirement("dns-network-tls", "DNS_NETWORK_TLS", true, {
      gap: "DNS_NETWORK_TLS",
    }),
    requirement(
      "production-provider-integration",
      "PROVIDER_INTEGRATION",
      true,
    ),
  ]);
}

type RequirementState =
  | "READY"
  | "PARTIAL"
  | "SIMULATED"
  | "MISSING"
  | "FAILED"
  | "STALE"
  | "MISSING_OWNER";

export class EnterpriseProductionReadinessEvaluator {
  readonly #requirements: readonly ReadinessRequirement[];

  constructor(
    requirements: readonly ReadinessRequirement[],
    private readonly now: () => Date = () => new Date(),
  ) {
    const ids = new Set(requirements.map(({ id }) => id));
    if (
      requirements.length === 0 ||
      ids.size !== requirements.length ||
      AREAS.some((area) => !requirements.some((item) => item.area === area))
    )
      throw new OperationsError("INVALID_READINESS_REQUIREMENTS");
    this.#requirements = requirements.map((item) => Object.freeze({ ...item }));
  }

  evaluate(input: {
    deployment_readiness: ReturnType<
      typeof assessProductionDeploymentReadiness
    >;
    enterprise_mvp_ready: boolean;
    evidence_registry: ProductionReadinessEvidenceRegistry;
    owners: readonly ReadinessOwner[];
    production_preparation_complete: boolean;
  }): EnterpriseReadinessAssessment {
    this.validateOwners(input.owners);
    const evidenceRecords = input.evidence_registry.list();
    this.validateEvidence(evidenceRecords);
    const ownerResponsibilities = new Set(
      input.owners
        .filter(({ human_identity_reference }) =>
          human_identity_reference?.startsWith("identity://human/"),
        )
        .map(({ responsibility }) => responsibility),
    );
    const states = new Map<string, RequirementState>();
    for (const requirement of this.#requirements) {
      if (
        requirement.owner_responsibility &&
        !ownerResponsibilities.has(requirement.owner_responsibility)
      ) {
        states.set(requirement.id, "MISSING_OWNER");
        continue;
      }
      const evidence = evidenceRecords
        .filter(({ requirement_id }) => requirement_id === requirement.id)
        .sort(
          (left, right) =>
            new Date(right.observed_at).getTime() -
            new Date(left.observed_at).getTime(),
        )[0];
      if (!evidence) {
        states.set(requirement.id, "MISSING");
        continue;
      }
      if (evidence.outcome === "FAIL") {
        states.set(requirement.id, "FAILED");
        continue;
      }
      if (new Date(evidence.valid_until).getTime() < this.now().getTime()) {
        states.set(requirement.id, "STALE");
        continue;
      }
      if (evidence.classification === "SIMULATED") {
        states.set(requirement.id, "SIMULATED");
        continue;
      }
      if (
        requirement.real_production_required &&
        evidence.classification !== "REAL_PRODUCTION"
      ) {
        states.set(requirement.id, "PARTIAL");
        continue;
      }
      states.set(requirement.id, "READY");
    }

    const matrix = AREAS.map((area): ReadinessMatrixEntry => {
      const requirements = this.#requirements.filter(
        (item) => item.area === area,
      );
      const areaStates = requirements.map(({ id }) => states.get(id)!);
      const evidence = evidenceRecords.filter(({ requirement_id }) =>
        requirements.some(({ id }) => id === requirement_id),
      );
      return Object.freeze({
        area,
        classification: classify(areaStates),
        evidence_refs: Object.freeze(
          evidence.map(({ evidence_reference }) => evidence_reference),
        ),
        evidence_classifications: Object.freeze(
          unique(evidence.map(({ classification }) => classification)),
        ),
        gap_ids: Object.freeze(
          unique(
            requirements
              .filter(({ id }) => states.get(id) !== "READY")
              .flatMap(({ gap }) => (gap ? [gap] : [])),
          ),
        ),
        requirement_ids: Object.freeze(requirements.map(({ id }) => id)),
      });
    });
    const productionGaps = unique([
      ...matrix.flatMap(({ gap_ids }) => gap_ids),
      ...(input.deployment_readiness.production_deployment_approved
        ? []
        : (["PRODUCTION_DEPLOYMENT_APPROVAL"] as const)),
    ]);
    return Object.freeze({
      enterprise_mvp_ready: input.enterprise_mvp_ready,
      matrix: Object.freeze(matrix),
      phase_13_ready:
        input.enterprise_mvp_ready &&
        input.production_preparation_complete &&
        states.get("phase-12-verification-gate") === "READY",
      production_deployment_approved:
        input.deployment_readiness.production_deployment_approved,
      production_gaps: Object.freeze(productionGaps),
      production_preparation_complete: input.production_preparation_complete,
      production_ready: matrix.every(
        ({ classification }) => classification === "READY",
      ),
    });
  }

  private validateOwners(owners: readonly ReadinessOwner[]): void {
    if (
      owners.some(
        (owner) =>
          owner.actor_type !== "HUMAN" ||
          !owner.actor_reference.startsWith("role:") ||
          (owner.human_identity_reference !== undefined &&
            !owner.human_identity_reference.startsWith("identity://human/")),
      )
    )
      throw new OperationsError("HUMAN_OPERATIONAL_AUTHORITY_REQUIRED");
  }

  private validateEvidence(evidence: readonly ReadinessEvidence[]): void {
    const ids = new Set(this.#requirements.map(({ id }) => id));
    for (const item of evidence) {
      if (!ids.has(item.requirement_id))
        throw new OperationsError("UNKNOWN_READINESS_REQUIREMENT");
      if (
        !item.evidence_reference.startsWith("evidence://") ||
        !Number.isFinite(new Date(item.observed_at).getTime()) ||
        !Number.isFinite(new Date(item.valid_until).getTime()) ||
        new Date(item.valid_until).getTime() <
          new Date(item.observed_at).getTime()
      )
        throw new OperationsError("INVALID_READINESS_EVIDENCE");
    }
  }
}

function classify(
  states: readonly RequirementState[],
): ReadinessClassification {
  if (states.some((state) => state === "FAILED" || state === "STALE"))
    return "NOT_READY";
  if (states.some((state) => state === "MISSING_OWNER"))
    return "HUMAN_ACTION_REQUIRED";
  const evidenceStates = states.filter((state) => state !== "MISSING");
  if (evidenceStates.length === 0) return "NOT_READY";
  if (states.includes("MISSING") || states.includes("PARTIAL"))
    return "PARTIALLY_READY";
  if (states.includes("SIMULATED")) return "SIMULATED_ONLY";
  return "READY";
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export interface ProductionEnvironmentContract {
  approver_reference?: string;
  deployment_target_reference?: string;
  dns_reference?: string;
  environment_id: string;
  health_endpoint?: string;
  monitoring_endpoint?: string;
  network_reference?: string;
  owner_reference?: string;
  provider_reference?: string;
  region?: string;
  rollback_target_reference?: string;
  secret_manager_reference?: string;
  tls_reference?: string;
}

const PRODUCTION_ENVIRONMENT_FIELDS = [
  "provider_reference",
  "region",
  "network_reference",
  "dns_reference",
  "tls_reference",
  "secret_manager_reference",
  "deployment_target_reference",
  "health_endpoint",
  "monitoring_endpoint",
  "rollback_target_reference",
  "owner_reference",
  "approver_reference",
] as const;

export function assessProductionEnvironmentContract(
  input: ProductionEnvironmentContract,
): {
  classification: "READY" | "NOT_READY";
  contract: Readonly<ProductionEnvironmentContract>;
  missing_fields: readonly (typeof PRODUCTION_ENVIRONMENT_FIELDS)[number][];
} {
  if (input.environment_id !== "production")
    throw new OperationsError("PRODUCTION_ENVIRONMENT_REQUIRED");
  if (
    input.secret_manager_reference &&
    !input.secret_manager_reference.startsWith("secretref://")
  )
    throw new OperationsError("SECRET_REFERENCE_REQUIRED");
  if (
    [input.health_endpoint, input.monitoring_endpoint]
      .filter((value): value is string => !!value)
      .some((value) => !value.startsWith("https://")) ||
    [input.owner_reference, input.approver_reference]
      .filter((value): value is string => !!value)
      .some((value) => !value.startsWith("role:"))
  )
    throw new OperationsError("INVALID_PRODUCTION_ENVIRONMENT_CONTRACT");
  const missing = PRODUCTION_ENVIRONMENT_FIELDS.filter(
    (field) => !input[field]?.trim(),
  );
  return Object.freeze({
    classification: missing.length === 0 ? "READY" : "NOT_READY",
    contract: Object.freeze({ ...input }),
    missing_fields: Object.freeze(missing),
  });
}

export interface ProductionDeploymentReadinessInput {
  artifact_integrity_sha256: string;
  artifact_reference: string;
  commit_sha: string;
  environment_contract_ready: boolean;
  exact_artifact_verified: boolean;
  post_deploy_verification_reference: string;
  provider_ready: boolean;
  rollback_artifact_reference: string;
}

export function assessProductionDeploymentReadiness(
  input: ProductionDeploymentReadinessInput,
): {
  classification: "NOT_READY" | "READY_FOR_HUMAN_APPROVAL";
  missing_controls: readonly string[];
  production_deployment_approved: boolean;
} {
  const missing = [
    ["artifact_reference", input.artifact_reference.startsWith("artifact://")],
    ["commit_sha", /^[0-9a-f]{40}$/u.test(input.commit_sha)],
    [
      "artifact_integrity_sha256",
      /^[0-9a-f]{64}$/u.test(input.artifact_integrity_sha256),
    ],
    ["exact_artifact_verified", input.exact_artifact_verified],
    ["environment_contract", input.environment_contract_ready],
    ["provider", input.provider_ready],
    [
      "rollback_artifact_reference",
      input.rollback_artifact_reference.startsWith("artifact://"),
    ],
    [
      "post_deploy_verification_reference",
      input.post_deploy_verification_reference.startsWith("runbook://"),
    ],
  ]
    .filter(([, present]) => !present)
    .map(([control]) => control as string);
  const approved = false;
  return Object.freeze({
    classification:
      missing.length > 0 ? "NOT_READY" : "READY_FOR_HUMAN_APPROVAL",
    missing_controls: Object.freeze(missing),
    production_deployment_approved: approved,
  });
}

export function createConservativePhase12ReadinessAssessment(): EnterpriseReadinessAssessment {
  return new EnterpriseProductionReadinessEvaluator(
    createPhase12ReadinessRequirements(),
  ).evaluate({
    deployment_readiness: assessProductionDeploymentReadiness({
      artifact_integrity_sha256: "0".repeat(64),
      artifact_reference: "artifact://maos/current-build",
      commit_sha: "0000000000000000000000000000000000000000",
      environment_contract_ready: false,
      exact_artifact_verified: false,
      post_deploy_verification_reference: "runbook://post-deploy-verify",
      provider_ready: false,
      rollback_artifact_reference: "artifact://maos/known-good",
    }),
    enterprise_mvp_ready: true,
    evidence_registry: new ProductionReadinessEvidenceRegistry(),
    owners: [],
    production_preparation_complete: true,
  });
}

export function createPhase12RunbookCatalog(): readonly Runbook[] {
  const registry = new RunbookRegistry();
  const additional = [
    ["runbook-deploy", "Execute an authorized exact-artifact deployment"],
    ["runbook-runner-failure", "Contain and recover a runner failure"],
    [
      "runbook-disaster-recovery",
      "Execute an authorized disaster recovery exercise",
    ],
  ] as const;
  return Object.freeze([
    ...createPhase11RunbookCatalog(),
    ...additional.map(([id, purpose]) =>
      registry.register({
        diagnosis: ["Inspect correlated health, audit, and evidence records"],
        escalation: "role:incident-commander",
        id,
        purpose,
        recovery: ["Recover only within the authorized environment and scope"],
        rollback: ["Restore the exact known-good artifact or configuration"],
        safe_actions: ["Pause dependent work and preserve domain autonomy"],
        symptoms: ["A readiness or operational control is not healthy"],
        verification: [
          "Verify health, integrity, scope, and evidence continuity",
        ],
      }),
    ),
  ]);
}
