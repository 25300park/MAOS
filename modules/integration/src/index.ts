import { createHash } from "node:crypto";
import type { ActorType, GovernanceDecision } from "@maos/contracts";

export * from "./marketing-automation.js";
export * from "./ai-mls.js";
export * from "./crm-human-work.js";

export const INTEGRATION_MODULE = Object.freeze({
  name: "integration",
  status: "ACTIVE",
});

export type IntegrationMaturity = "I0" | "I1" | "I2";
export type PilotHealth = "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";
export type PilotReadCapability =
  | "READ_SYSTEM_STATUS"
  | "READ_REPOSITORY_STATUS"
  | "READ_ENVIRONMENT_METADATA"
  | "READ_VERSION_METADATA"
  | "READ_DEPLOYMENT_READINESS";
export type PilotAgentRole =
  | "DEVELOPMENT_LEAD"
  | "REQUIREMENT_PRODUCT"
  | "BACKEND"
  | "FUNCTIONAL_TEST"
  | "UX_QA"
  | "SECURITY_REVIEW"
  | "DEVOPS_DEPLOYMENT";
export type PilotStage =
  | "REQUIREMENT"
  | "PLAN"
  | "IMPLEMENT"
  | "TEST"
  | "QA"
  | "APPROVAL_BOUNDARY"
  | "RELEASE_PREPARATION"
  | "SIMULATED_DEPLOYMENT"
  | "VERIFICATION";

export interface PilotActor {
  id: string;
  type: ActorType;
}
export interface DomainSystemRegistration {
  id: string;
  name: string;
  type: "PUBLIC_PLATFORM" | "INTERNAL_PLATFORM";
  source_of_truth: "DOMAIN_SYSTEM";
  maturity: IntegrationMaturity;
  integration_owner_id: string;
  repository_reference: string;
  workroot_reference: string;
  environment_reference: string;
  hosting_reference: string;
  deployment_reference: string;
  health_reference: string;
  credential_reference: string;
  capabilities: readonly PilotReadCapability[];
}
export interface DomainStatusSnapshot {
  source_system_id: string;
  source_record_id: string;
  observed_at: string;
  version: string;
  health: PilotHealth;
  environment: "PREVIEW" | "STAGING" | "PRODUCTION";
  deployment_readiness: "READY" | "NOT_READY" | "UNKNOWN";
  repository_state?: "CLEAN" | "DIRTY" | "UNKNOWN";
  commit?: string;
}
export interface DomainReadAdapter {
  readonly mode: "READ_ONLY";
  read(input: {
    system_id: string;
    signal: AbortSignal;
  }): Promise<DomainStatusSnapshot>;
}
export interface PilotStatusEvidence extends DomainStatusSnapshot {
  evidence_id: string;
  captured_at: string;
  capability: PilotReadCapability;
  correlation_id: string;
  project_id: string;
  pilot_id: string;
  task_id: string;
}
export interface PilotAgentAssignment {
  agent_id: string;
  role: PilotAgentRole;
}
export interface RbsAdminPilot {
  id: string;
  version: string;
  project_id: string;
  requested_by_actor_id: string;
  task_id: string;
  system_id: string;
  repository_reference: string;
  workroot_reference: string;
  assignments: readonly PilotAgentAssignment[];
  stage: "REQUEST" | PilotStage | "VERIFIED";
  status: "ACTIVE" | "WAITING_APPROVAL" | "VERIFIED";
  evidence_ids: readonly string[];
  production_authorized: false;
  deployment_mode?: "SIMULATED";
  release_id?: string;
  deployment_id?: string;
}
export interface PilotEvent {
  name: string;
  handoff_id?: string;
  pilot_id?: string;
  system_id?: string;
  correlation_id: string;
  actor: PilotActor;
  evidence_refs: readonly string[];
  occurred_at: string;
}
export interface PilotAuditRecord {
  actor: PilotActor;
  action: string;
  target: {
    id: string;
    type: "DOMAIN_SYSTEM" | "RBS_ADMIN_HANDOFF" | "RBS_ADMIN_PILOT";
  };
  result: "SUCCEEDED" | "DENIED";
  correlation_id: string;
  evidence_refs: readonly string[];
}
export interface PilotAuditPort {
  record(record: PilotAuditRecord): void;
}
export interface PilotPersistencePort {
  saveSystem(system: Readonly<DomainSystemRegistration>): void;
  savePilot(pilot: Readonly<RbsAdminPilot>): void;
  appendEvidence(evidence: Readonly<PilotStatusEvidence>): void;
}

export type HandoffEvidenceKind =
  "AI_MLS_VERIFICATION" | "CONSENT" | "CRM_APPROVAL" | "EMPLOYEE_REVIEW";
export interface HandoffEvidence {
  ai_mls_candidate_reference: string;
  crm_listing_reference: string;
  environment: "PREVIEW";
  hash: string;
  id: string;
  kind: HandoffEvidenceKind;
  observed_at: string;
  project_id: string;
  status: "VERIFIED";
  target_id: string;
  target_admin_system_id: string;
  target_rbs_system_id: string;
  target_version: string;
  task_id: string;
}
export interface HandoffEvidencePort {
  record?(evidence: Readonly<HandoffEvidence>): "CREATED" | "UNCHANGED";
  resolve(id: string): Readonly<HandoffEvidence> | undefined;
}

export interface ListingHandoffSimulation {
  ai_mls_candidate_reference: string;
  crm_listing_reference: string;
  evidence_refs: readonly string[];
  external_action_performed: false;
  id: string;
  mode: "SIMULATION_ONLY";
  project_id: string;
  status: "READY_FOR_HUMAN_REVIEW";
  target_hash: string;
  target_system_ids: readonly [string, string];
  target_version: string;
  task_id: string;
  valid_until: string;
}

export function rbsAdminHandoffTargetHash(input: {
  ai_mls_candidate_reference: string;
  crm_listing_reference: string;
  id: string;
  project_id: string;
  target_admin_system_id: string;
  target_rbs_system_id: string;
  target_version: string;
  task_id: string;
}): string {
  const canonical = [
    input.id,
    input.project_id,
    input.task_id,
    input.crm_listing_reference,
    input.ai_mls_candidate_reference,
    input.target_admin_system_id,
    input.target_rbs_system_id,
    input.target_version,
  ].join("\n");
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

export class RbsAdminPilotError extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "RbsAdminPilotError";
  }
}

export class InMemoryHandoffEvidenceRegistry implements HandoffEvidencePort {
  private readonly records = new Map<string, Readonly<HandoffEvidence>>();

  record(evidence: Readonly<HandoffEvidence>): "CREATED" | "UNCHANGED" {
    const existing = this.records.get(evidence.id);
    if (existing) {
      if (
        handoffEvidenceSignature(existing) !==
        handoffEvidenceSignature(evidence)
      )
        throw new RbsAdminPilotError("RBS_ADMIN_HANDOFF_EVIDENCE_ID_CONFLICT");
      return "UNCHANGED";
    }
    this.records.set(evidence.id, freeze({ ...evidence }));
    return "CREATED";
  }

  resolve(id: string): Readonly<HandoffEvidence> | undefined {
    return this.records.get(id);
  }
}

function handoffEvidenceSignature(evidence: Readonly<HandoffEvidence>): string {
  return JSON.stringify([
    evidence.id,
    evidence.kind,
    evidence.project_id,
    evidence.task_id,
    evidence.target_id,
    evidence.target_version,
    evidence.hash,
    evidence.environment,
    evidence.status,
    evidence.observed_at,
    evidence.crm_listing_reference,
    evidence.ai_mls_candidate_reference,
    evidence.target_admin_system_id,
    evidence.target_rbs_system_id,
  ]);
}

const capabilities = new Set<PilotReadCapability>([
  "READ_SYSTEM_STATUS",
  "READ_REPOSITORY_STATUS",
  "READ_ENVIRONMENT_METADATA",
  "READ_VERSION_METADATA",
  "READ_DEPLOYMENT_READINESS",
]);
const healthValues = new Set(["HEALTHY", "DEGRADED", "UNAVAILABLE", "UNKNOWN"]);
const environmentValues = new Set(["PREVIEW", "STAGING", "PRODUCTION"]);
const readinessValues = new Set(["READY", "NOT_READY", "UNKNOWN"]);
const repositoryValues = new Set(["CLEAN", "DIRTY", "UNKNOWN"]);
const roles: readonly PilotAgentRole[] = [
  "DEVELOPMENT_LEAD",
  "REQUIREMENT_PRODUCT",
  "BACKEND",
  "FUNCTIONAL_TEST",
  "UX_QA",
  "SECURITY_REVIEW",
  "DEVOPS_DEPLOYMENT",
];
const order: readonly PilotStage[] = [
  "REQUIREMENT",
  "PLAN",
  "IMPLEMENT",
  "TEST",
  "QA",
  "APPROVAL_BOUNDARY",
  "RELEASE_PREPARATION",
  "SIMULATED_DEPLOYMENT",
  "VERIFICATION",
];
const roleForStage: Readonly<Partial<Record<PilotStage, PilotAgentRole>>> = {
  REQUIREMENT: "REQUIREMENT_PRODUCT",
  PLAN: "DEVELOPMENT_LEAD",
  IMPLEMENT: "BACKEND",
  TEST: "FUNCTIONAL_TEST",
  QA: "UX_QA",
  RELEASE_PREPARATION: "DEVOPS_DEPLOYMENT",
  SIMULATED_DEPLOYMENT: "DEVOPS_DEPLOYMENT",
  VERIFICATION: "FUNCTIONAL_TEST",
};

type RegistrationInput = Omit<
  DomainSystemRegistration,
  "source_of_truth" | "maturity" | "capabilities"
> & {
  actor: PilotActor;
  correlation_id: string;
  source_of_truth: string;
  maturity: string;
  capabilities: readonly string[];
};
type AdvanceInput = {
  actor: PilotActor;
  correlation_id: string;
  evidence_ids: readonly string[];
  pilot_id: string;
  stage: PilotStage;
  branch?: string;
  changed_files?: readonly string[];
  repository_reference?: string;
  workroot_reference?: string;
  approval?: {
    decision: GovernanceDecision;
    environment: string;
    target_id: string;
    target_version: string;
  };
  release_id?: string;
  deployment_id?: string;
  deployment_mode?: string;
};

function requireSymbolic(value: string, prefix: string, code: string) {
  if (!value.startsWith(prefix) || value.length <= prefix.length)
    throw new RbsAdminPilotError(code);
}
function freeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

export class RbsAdminPilotService {
  private readonly systems = new Map<
    string,
    Readonly<DomainSystemRegistration>
  >();
  private readonly pilots = new Map<string, RbsAdminPilot>();
  private readonly eventLog: PilotEvent[] = [];
  private readonly observedHealth = new Map<
    string,
    { health: PilotHealth; observed_at: string }
  >();
  private readonly observedStatus = new Map<
    string,
    Readonly<PilotStatusEvidence>
  >();
  private lastHandoff?: Readonly<ListingHandoffSimulation>;
  constructor(
    private readonly adapter: DomainReadAdapter,
    private readonly now: () => Date = () => new Date(),
    private readonly audit?: PilotAuditPort,
    private readonly persistence?: PilotPersistencePort,
    private readonly handoffEvidence?: HandoffEvidencePort,
  ) {
    if (adapter.mode !== "READ_ONLY")
      throw new RbsAdminPilotError("READ_ONLY_ADAPTER_REQUIRED");
  }

  registerSystem(input: RegistrationInput): Readonly<DomainSystemRegistration> {
    if (input.actor.type !== "HUMAN")
      throw new RbsAdminPilotError("HUMAN_OWNER_REQUIRED");
    if (input.source_of_truth !== "DOMAIN_SYSTEM")
      throw new RbsAdminPilotError("DOMAIN_SOURCE_OF_TRUTH_REQUIRED");
    if (!["I0", "I1", "I2"].includes(input.maturity))
      throw new RbsAdminPilotError("PILOT_MATURITY_EXCEEDED");
    if (!input.credential_reference.startsWith("secretref://"))
      throw new RbsAdminPilotError("INVALID_CREDENTIAL_REFERENCE");
    if (
      !input.capabilities.length ||
      input.capabilities.some(
        (item) => !capabilities.has(item as PilotReadCapability),
      )
    )
      throw new RbsAdminPilotError("READ_ONLY_CAPABILITY_REQUIRED");
    requireSymbolic(
      input.repository_reference,
      "registry://",
      "INVALID_REPOSITORY_REFERENCE",
    );
    requireSymbolic(
      input.workroot_reference,
      "workroot://",
      "INVALID_WORKROOT_REFERENCE",
    );
    for (const reference of [
      input.environment_reference,
      input.hosting_reference,
      input.deployment_reference,
      input.health_reference,
    ])
      requireSymbolic(reference, "registry://", "INVALID_SYSTEM_REFERENCE");
    if (this.systems.has(input.id))
      throw new RbsAdminPilotError("DOMAIN_SYSTEM_ALREADY_REGISTERED");
    const { actor, correlation_id, ...record } = input;
    const stored = freeze({
      ...record,
      capabilities: freeze([...record.capabilities]),
    } as DomainSystemRegistration);
    this.systems.set(stored.id, stored);
    this.persistence?.saveSystem(stored);
    this.record(
      actor,
      "REGISTERED",
      { id: stored.id, type: "DOMAIN_SYSTEM" },
      correlation_id,
      [],
    );
    return stored;
  }

  listSystems(): readonly Readonly<DomainSystemRegistration>[] {
    return [...this.systems.values()];
  }

  readiness(): Readonly<{
    adapter_mode: "READ_ONLY";
    registered_systems: number;
    status: "READY" | "DEGRADED" | "NOT_READY";
  }> {
    const observed = [...this.observedHealth.values()].filter(
      ({ observed_at }) =>
        this.now().getTime() - Date.parse(observed_at) <= 5 * 60 * 1000,
    );
    return freeze({
      adapter_mode: this.adapter.mode,
      registered_systems: this.systems.size,
      status:
        observed.length === this.systems.size &&
        observed.every(({ health }) => health === "HEALTHY")
          ? "READY"
          : observed.length > 0
            ? "DEGRADED"
            : "NOT_READY",
    });
  }

  async readStatus(input: {
    actor: PilotActor;
    capability: PilotReadCapability;
    correlation_id: string;
    permission_allowed: boolean;
    pilot_id: string;
    project_id?: string;
    system_id: string;
    task_id: string;
    timeout_ms: number;
    signal?: AbortSignal;
  }): Promise<{
    entity: Readonly<PilotStatusEvidence>;
    event: Readonly<PilotEvent>;
  }> {
    const system = this.systems.get(input.system_id);
    const pilot = this.pilots.get(input.pilot_id);
    if (
      !system ||
      !pilot ||
      pilot.system_id !== input.system_id ||
      pilot.project_id !== input.project_id ||
      pilot.task_id !== input.task_id ||
      !input.permission_allowed ||
      !input.task_id ||
      !input.project_id ||
      !input.correlation_id ||
      input.actor.type === "HUMAN" ||
      !system.capabilities.includes(input.capability)
    )
      return this.failRead(input, "PILOT_READ_DENIED");
    if (input.signal?.aborted)
      return this.failRead(input, "PILOT_READ_CANCELLED");
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    input.signal?.addEventListener("abort", onAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new RbsAdminPilotError("PILOT_READ_TIMED_OUT"));
          controller.abort();
        }, input.timeout_ms);
      });
      const cancellation = new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new RbsAdminPilotError("PILOT_READ_CANCELLED")),
          { once: true },
        );
      });
      let snapshot: DomainStatusSnapshot;
      try {
        snapshot = await Promise.race([
          this.adapter.read({
            system_id: input.system_id,
            signal: controller.signal,
          }),
          timeout,
          cancellation,
        ]);
      } catch (error) {
        if (error instanceof RbsAdminPilotError)
          return this.failRead(input, error.code);
        return this.failRead(input, "PILOT_SOURCE_UNAVAILABLE");
      }
      if (
        !snapshot.source_record_id ||
        snapshot.source_system_id !== input.system_id ||
        !snapshot.version ||
        Number.isNaN(Date.parse(snapshot.observed_at))
      )
        return this.failRead(input, "INVALID_PILOT_PROVENANCE");
      if (
        !healthValues.has(snapshot.health) ||
        !environmentValues.has(snapshot.environment) ||
        !readinessValues.has(snapshot.deployment_readiness) ||
        (snapshot.repository_state !== undefined &&
          !repositoryValues.has(snapshot.repository_state))
      )
        return this.failRead(input, "INVALID_PILOT_STATUS");
      if (Date.parse(snapshot.observed_at) - this.now().getTime() > 60 * 1000)
        return this.failRead(input, "PILOT_STATUS_FUTURE");
      if (
        this.now().getTime() - Date.parse(snapshot.observed_at) >
        5 * 60 * 1000
      )
        return this.failRead(input, "PILOT_STATUS_STALE");
      const evidence = freeze({
        source_system_id: snapshot.source_system_id,
        source_record_id: snapshot.source_record_id,
        observed_at: snapshot.observed_at,
        version: snapshot.version,
        health: snapshot.health,
        environment: snapshot.environment,
        deployment_readiness: snapshot.deployment_readiness,
        ...(snapshot.repository_state
          ? { repository_state: snapshot.repository_state }
          : {}),
        ...(snapshot.commit ? { commit: snapshot.commit } : {}),
        evidence_id: `evidence:${input.system_id}:${snapshot.source_record_id}:${snapshot.version}:${snapshot.observed_at}`,
        captured_at: this.now().toISOString(),
        capability: input.capability,
        correlation_id: input.correlation_id,
        project_id: input.project_id,
        pilot_id: input.pilot_id,
        task_id: input.task_id,
      });
      this.observedStatus.set(input.system_id, evidence);
      this.observedHealth.set(input.system_id, {
        health: snapshot.health,
        observed_at: snapshot.observed_at,
      });
      const event = this.emit({
        name: "RBS_ADMIN_STATUS.OBSERVED",
        system_id: input.system_id,
        correlation_id: input.correlation_id,
        actor: input.actor,
        evidence_refs: [evidence.evidence_id],
        occurred_at: this.now().toISOString(),
      });
      this.record(
        input.actor,
        "STATUS_OBSERVED",
        { id: input.system_id, type: "DOMAIN_SYSTEM" },
        input.correlation_id,
        [evidence.evidence_id],
      );
      this.persistence?.appendEvidence(evidence);
      return { entity: evidence, event };
    } finally {
      if (timer) clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
    }
  }

  operationalView(): Readonly<{
    approval_status: "NOT APPROVED";
    blockers: readonly string[];
    handoff_status: "NOT_PREPARED" | "READY_FOR_HUMAN_REVIEW" | "STALE";
    next_action: string;
    production_deployment_approved: false;
    systems: readonly Readonly<{
      api_health: PilotHealth;
      artifact_reference: string;
      deployment_readiness: "NOT_READY" | "READY" | "UNKNOWN";
      environment: "PREVIEW" | "STAGING" | "PRODUCTION" | "UNKNOWN";
      health: PilotHealth;
      hosting_reference: string;
      id: string;
      integration_owner_id: string;
      last_verified_at: string;
      name: string;
      owner: string;
      qa_status: "PASS" | "WAITING";
      release_reference: string;
      repository_reference: string;
      repository_state: "CLEAN" | "DIRTY" | "UNKNOWN";
      rollback_readiness: "NOT_APPLICABLE" | "UNKNOWN";
      source_commit: string;
      source_of_truth: "DOMAIN_SYSTEM";
      type: "PUBLIC_PLATFORM" | "INTERNAL_PLATFORM";
      workroot_reference: string;
    }>[];
  }> {
    const systems = [...this.systems.values()].map((system) => {
      const cached = this.observedStatus.get(system.id);
      const fresh =
        cached &&
        this.now().getTime() - Date.parse(cached.observed_at) <= 5 * 60 * 1000
          ? cached
          : undefined;
      const pilot = [...this.pilots.values()].find(
        ({ system_id }) => system_id === system.id,
      );
      const qaPassed =
        pilot &&
        pilot.stage !== "REQUEST" &&
        [
          "QA",
          "APPROVAL_BOUNDARY",
          "RELEASE_PREPARATION",
          "SIMULATED_DEPLOYMENT",
          "VERIFIED",
        ].includes(pilot.stage);
      return freeze({
        api_health: fresh?.health ?? ("UNKNOWN" as const),
        artifact_reference:
          pilot?.evidence_ids.find((id) => id.startsWith("artifact-")) ??
          "NOT_AVAILABLE",
        deployment_readiness:
          fresh?.deployment_readiness ?? ("UNKNOWN" as const),
        environment: fresh?.environment ?? ("UNKNOWN" as const),
        health: fresh?.health ?? ("UNKNOWN" as const),
        hosting_reference: system.hosting_reference,
        id: system.id,
        integration_owner_id: system.integration_owner_id,
        last_verified_at: fresh
          ? fresh.observed_at
          : cached
            ? "STALE"
            : "NOT_OBSERVED",
        name: system.name,
        owner: system.integration_owner_id,
        qa_status: qaPassed ? ("PASS" as const) : ("WAITING" as const),
        release_reference: pilot?.release_id ?? "NOT_PREPARED",
        repository_reference: system.repository_reference,
        repository_state: fresh?.repository_state ?? ("UNKNOWN" as const),
        rollback_readiness: pilot?.deployment_id
          ? ("NOT_APPLICABLE" as const)
          : ("UNKNOWN" as const),
        source_commit: fresh?.commit ?? "NOT_OBSERVED",
        source_of_truth: system.source_of_truth,
        type: system.type,
        workroot_reference: system.workroot_reference,
      });
    });
    const blockers = systems
      .filter(({ health }) => health !== "HEALTHY")
      .map(({ name }) => `${name} requires fresh healthy evidence`);
    return freeze({
      approval_status: "NOT APPROVED" as const,
      blockers: freeze(blockers),
      handoff_status: this.lastHandoff
        ? this.now().getTime() <= Date.parse(this.lastHandoff.valid_until)
          ? this.lastHandoff.status
          : ("STALE" as const)
        : ("NOT_PREPARED" as const),
      next_action:
        blockers[0] ??
        (this.lastHandoff
          ? "Human review of the simulation candidate"
          : "Prepare a governed handoff simulation"),
      production_deployment_approved: false as const,
      systems: freeze(systems),
    });
  }

  registerHandoffEvidence(
    input: HandoffEvidence & {
      actor: PilotActor;
      correlation_id: string;
    },
  ): Readonly<HandoffEvidence> {
    const { actor, correlation_id, ...evidence } = input;
    if (actor.type !== "SYSTEM" || !this.handoffEvidence?.record)
      throw new RbsAdminPilotError("RBS_ADMIN_EVIDENCE_REGISTRATION_DENIED");
    if (
      !/^evidence-[A-Za-z0-9._-]+$/.test(evidence.id) ||
      ![
        "AI_MLS_VERIFICATION",
        "CONSENT",
        "CRM_APPROVAL",
        "EMPLOYEE_REVIEW",
      ].includes(evidence.kind) ||
      !evidence.crm_listing_reference.startsWith("crm://") ||
      !evidence.ai_mls_candidate_reference.startsWith("ai-mls://") ||
      !this.systems.has(evidence.target_admin_system_id) ||
      !this.systems.has(evidence.target_rbs_system_id) ||
      evidence.hash !==
        rbsAdminHandoffTargetHash({
          ai_mls_candidate_reference: evidence.ai_mls_candidate_reference,
          crm_listing_reference: evidence.crm_listing_reference,
          id: evidence.target_id,
          project_id: evidence.project_id,
          target_admin_system_id: evidence.target_admin_system_id,
          target_rbs_system_id: evidence.target_rbs_system_id,
          target_version: evidence.target_version,
          task_id: evidence.task_id,
        }) ||
      evidence.status !== "VERIFIED" ||
      evidence.environment !== "PREVIEW" ||
      Number.isNaN(Date.parse(evidence.observed_at))
    )
      throw new RbsAdminPilotError("INVALID_RBS_ADMIN_HANDOFF_EVIDENCE");
    const stored = freeze({ ...evidence });
    const registration = this.handoffEvidence.record(stored);
    if (registration === "UNCHANGED") return stored;
    this.emit({
      actor,
      correlation_id,
      evidence_refs: [stored.id],
      handoff_id: stored.target_id,
      name: "RBS_ADMIN.HANDOFF_EVIDENCE_REGISTERED",
      occurred_at: this.now().toISOString(),
    });
    this.record(
      actor,
      "REGISTER_HANDOFF_EVIDENCE",
      { id: stored.target_id, type: "RBS_ADMIN_HANDOFF" },
      correlation_id,
      [stored.id],
    );
    return stored;
  }

  prepareListingHandoffSimulation(input: {
    actor: PilotActor;
    ai_mls_candidate_reference: string;
    ai_mls_verification_evidence_id: string;
    ai_mls_status: string;
    consent_evidence_id: string;
    consent_status: string;
    correlation_id: string;
    crm_approval_evidence_id: string;
    crm_listing_reference: string;
    employee_review_evidence_id: string;
    employee_review_status: string;
    id: string;
    mode: string;
    permission_allowed: boolean;
    project_id: string;
    target_admin_system_id: string;
    target_hash: string;
    target_rbs_system_id: string;
    target_version: string;
    task_id: string;
  }): Readonly<ListingHandoffSimulation> {
    const deny = (code: string): never => {
      this.emit({
        actor: input.actor,
        correlation_id: input.correlation_id,
        evidence_refs: [],
        handoff_id: input.id,
        name: `RBS_ADMIN.HANDOFF_${code}`,
        occurred_at: this.now().toISOString(),
      });
      this.record(
        input.actor,
        code,
        { id: input.id, type: "RBS_ADMIN_HANDOFF" },
        input.correlation_id,
        [],
        "DENIED",
      );
      throw new RbsAdminPilotError(code);
    };
    if (input.mode !== "SIMULATED")
      return deny("RBS_ADMIN_PRODUCTION_MUTATION_FORBIDDEN");
    if (
      !input.permission_allowed ||
      input.actor.type !== "HUMAN" ||
      !input.project_id ||
      !input.task_id ||
      !input.correlation_id
    )
      return deny("RBS_ADMIN_HANDOFF_DENIED");
    if (input.ai_mls_status !== "VERIFIED")
      return deny("RBS_ADMIN_HANDOFF_NOT_VERIFIED");
    if (input.consent_status !== "CONFIRMED")
      return deny("RBS_ADMIN_HANDOFF_NOT_CONSENTED");
    if (input.employee_review_status !== "APPROVED")
      return deny("RBS_ADMIN_EMPLOYEE_REVIEW_REQUIRED");
    const admin = this.systems.get(input.target_admin_system_id);
    const rbs = this.systems.get(input.target_rbs_system_id);
    if (
      !admin ||
      !rbs ||
      admin.id === rbs.id ||
      admin.type !== "INTERNAL_PLATFORM" ||
      rbs.type !== "PUBLIC_PLATFORM"
    )
      return deny("RBS_ADMIN_SYSTEM_BOUNDARY_REQUIRED");
    const evidenceIds = [
      input.ai_mls_verification_evidence_id,
      input.consent_evidence_id,
      input.employee_review_evidence_id,
      input.crm_approval_evidence_id,
    ];
    if (
      !input.id ||
      !input.crm_listing_reference.startsWith("crm://") ||
      !input.ai_mls_candidate_reference.startsWith("ai-mls://") ||
      !input.ai_mls_verification_evidence_id ||
      !input.consent_evidence_id ||
      !input.employee_review_evidence_id ||
      !input.crm_approval_evidence_id ||
      !input.target_version ||
      !/^sha256:[a-f0-9]{64}$/.test(input.target_hash) ||
      input.target_hash !== rbsAdminHandoffTargetHash(input) ||
      new Set(evidenceIds).size !== evidenceIds.length ||
      evidenceIds.some((id) => !/^evidence-[A-Za-z0-9._-]+$/.test(id))
    )
      return deny("INVALID_RBS_ADMIN_HANDOFF");
    const expectedKinds: readonly HandoffEvidenceKind[] = [
      "AI_MLS_VERIFICATION",
      "CONSENT",
      "EMPLOYEE_REVIEW",
      "CRM_APPROVAL",
    ];
    const resolved = evidenceIds.map((id) => this.handoffEvidence?.resolve(id));
    if (
      resolved.some((item, index) => {
        if (!item) return true;
        const observed = Date.parse(item.observed_at);
        return (
          item.id !== evidenceIds[index] ||
          item.kind !== expectedKinds[index] ||
          item.status !== "VERIFIED" ||
          item.environment !== "PREVIEW" ||
          item.project_id !== input.project_id ||
          item.task_id !== input.task_id ||
          item.target_id !== input.id ||
          item.target_admin_system_id !== input.target_admin_system_id ||
          item.target_rbs_system_id !== input.target_rbs_system_id ||
          item.target_version !== input.target_version ||
          item.crm_listing_reference !== input.crm_listing_reference ||
          item.ai_mls_candidate_reference !==
            input.ai_mls_candidate_reference ||
          item.hash !== input.target_hash ||
          Number.isNaN(observed) ||
          observed - this.now().getTime() > 60 * 1000 ||
          this.now().getTime() - observed > 5 * 60 * 1000
        );
      })
    )
      return deny("RBS_ADMIN_HANDOFF_EVIDENCE_INVALID");
    const evidenceRefs = freeze(evidenceIds);
    const result = freeze({
      ai_mls_candidate_reference: input.ai_mls_candidate_reference,
      crm_listing_reference: input.crm_listing_reference,
      evidence_refs: evidenceRefs,
      external_action_performed: false as const,
      id: input.id,
      mode: "SIMULATION_ONLY" as const,
      project_id: input.project_id,
      status: "READY_FOR_HUMAN_REVIEW" as const,
      target_hash: input.target_hash,
      target_system_ids: freeze([
        input.target_admin_system_id,
        input.target_rbs_system_id,
      ]) as readonly [string, string],
      target_version: input.target_version,
      task_id: input.task_id,
      valid_until: new Date(
        Math.min(...resolved.map((item) => Date.parse(item!.observed_at))) +
          5 * 60 * 1000,
      ).toISOString(),
    });
    this.emit({
      actor: input.actor,
      correlation_id: input.correlation_id,
      evidence_refs: evidenceRefs,
      handoff_id: input.id,
      name: "RBS_ADMIN.HANDOFF_SIMULATION_PREPARED",
      occurred_at: this.now().toISOString(),
    });
    this.record(
      input.actor,
      "PREPARE_HANDOFF_SIMULATION",
      { id: input.id, type: "RBS_ADMIN_HANDOFF" },
      input.correlation_id,
      evidenceRefs,
    );
    this.lastHandoff = result;
    return result;
  }

  createPilot(input: {
    actor: PilotActor;
    assignments: readonly PilotAgentAssignment[];
    correlation_id: string;
    id: string;
    project_id: string;
    repository_reference: string;
    request_evidence_id: string;
    system_id: string;
    task_id: string;
    workroot_reference: string;
  }): Readonly<RbsAdminPilot> {
    if (input.actor.type !== "HUMAN")
      throw new RbsAdminPilotError("HUMAN_REQUEST_REQUIRED");
    const system = this.systems.get(input.system_id);
    if (
      !system ||
      input.repository_reference !== system.repository_reference ||
      input.workroot_reference !== system.workroot_reference
    )
      throw new RbsAdminPilotError("PILOT_REPOSITORY_SCOPE_MISMATCH");
    const assigned = new Set(input.assignments.map((item) => item.role));
    if (
      roles.some((role) => !assigned.has(role)) ||
      assigned.size !== input.assignments.length
    )
      throw new RbsAdminPilotError("PILOT_TEAM_INCOMPLETE");
    const pilot: RbsAdminPilot = {
      id: input.id,
      version: "pilot-v1",
      project_id: input.project_id,
      requested_by_actor_id: input.actor.id,
      task_id: input.task_id,
      system_id: input.system_id,
      repository_reference: input.repository_reference,
      workroot_reference: input.workroot_reference,
      assignments: freeze([...input.assignments]),
      stage: "REQUEST",
      status: "ACTIVE",
      evidence_ids: freeze([input.request_evidence_id]),
      production_authorized: false,
    };
    this.pilots.set(pilot.id, pilot);
    this.persistence?.savePilot(freeze({ ...pilot }));
    this.emit({
      name: "RBS_ADMIN_PILOT.CREATED",
      pilot_id: pilot.id,
      correlation_id: input.correlation_id,
      actor: input.actor,
      evidence_refs: [input.request_evidence_id],
      occurred_at: this.now().toISOString(),
    });
    this.record(
      input.actor,
      "CREATED",
      { id: pilot.id, type: "RBS_ADMIN_PILOT" },
      input.correlation_id,
      [input.request_evidence_id],
    );
    return freeze({ ...pilot });
  }

  advancePilot(input: AdvanceInput): {
    entity: Readonly<RbsAdminPilot>;
    event: Readonly<PilotEvent>;
  } {
    if (
      input.stage === "SIMULATED_DEPLOYMENT" &&
      input.deployment_mode !== "SIMULATED"
    )
      throw new RbsAdminPilotError("PRODUCTION_WRITE_FORBIDDEN");
    const pilot = this.pilots.get(input.pilot_id);
    if (!pilot) throw new RbsAdminPilotError("PILOT_NOT_FOUND");
    const expected =
      order[
        pilot.stage === "REQUEST"
          ? 0
          : order.indexOf(pilot.stage as PilotStage) + 1
      ];
    if (input.stage !== expected)
      throw new RbsAdminPilotError("INVALID_PILOT_TRANSITION");
    const requiredRole = roleForStage[input.stage];
    if (requiredRole) {
      const assignment = pilot.assignments.find(
        (item) => item.role === requiredRole,
      );
      if (
        input.actor.type !== "AGENT" ||
        assignment?.agent_id !== input.actor.id
      )
        throw new RbsAdminPilotError("PILOT_ROLE_REQUIRED");
    }
    if (!input.evidence_ids.length)
      throw new RbsAdminPilotError("PILOT_EVIDENCE_REQUIRED");
    if (input.stage === "IMPLEMENT") this.validateImplementation(pilot, input);
    if (input.stage === "APPROVAL_BOUNDARY")
      this.validateApproval(pilot, input);
    if (input.stage === "RELEASE_PREPARATION" && !input.release_id)
      throw new RbsAdminPilotError("RELEASE_REFERENCE_REQUIRED");
    if (input.stage === "SIMULATED_DEPLOYMENT" && !input.deployment_id)
      throw new RbsAdminPilotError("DEPLOYMENT_REFERENCE_REQUIRED");
    const next: RbsAdminPilot = {
      ...pilot,
      stage: input.stage === "VERIFICATION" ? "VERIFIED" : input.stage,
      status:
        input.stage === "QA"
          ? "WAITING_APPROVAL"
          : input.stage === "VERIFICATION"
            ? "VERIFIED"
            : "ACTIVE",
      evidence_ids: freeze([...pilot.evidence_ids, ...input.evidence_ids]),
      ...(input.release_id ? { release_id: input.release_id } : {}),
      ...(input.deployment_id
        ? {
            deployment_id: input.deployment_id,
            deployment_mode: "SIMULATED" as const,
          }
        : {}),
    };
    this.pilots.set(next.id, next);
    this.persistence?.savePilot(freeze({ ...next }));
    const event = this.emit({
      name: `RBS_ADMIN_PILOT.${input.stage}`,
      pilot_id: next.id,
      correlation_id: input.correlation_id,
      actor: input.actor,
      evidence_refs: input.evidence_ids,
      occurred_at: this.now().toISOString(),
    });
    this.record(
      input.actor,
      input.stage,
      { id: next.id, type: "RBS_ADMIN_PILOT" },
      input.correlation_id,
      input.evidence_ids,
    );
    return { entity: freeze({ ...next }), event };
  }

  listPilots(): readonly Readonly<RbsAdminPilot>[] {
    return [...this.pilots.values()].map((item) => freeze({ ...item }));
  }

  getPilot(id: string): Readonly<RbsAdminPilot> | undefined {
    const pilot = this.pilots.get(id);
    return pilot ? freeze({ ...pilot }) : undefined;
  }
  events(pilotId?: string): readonly Readonly<PilotEvent>[] {
    return this.eventLog.filter(
      (item) => !pilotId || item.pilot_id === pilotId,
    );
  }

  private validateImplementation(pilot: RbsAdminPilot, input: AdvanceInput) {
    if (
      input.repository_reference !== pilot.repository_reference ||
      input.workroot_reference !== pilot.workroot_reference
    )
      throw new RbsAdminPilotError("PILOT_REPOSITORY_SCOPE_MISMATCH");
    if (!input.branch?.startsWith("codex/") || !input.changed_files?.length)
      throw new RbsAdminPilotError("PILOT_CHANGESET_REQUIRED");
    if (
      input.changed_files.some(
        (path) => path.includes("..") || /^[\\/]|^[A-Za-z]:/.test(path),
      )
    )
      throw new RbsAdminPilotError("PILOT_PATH_ESCAPE");
  }
  private validateApproval(pilot: RbsAdminPilot, input: AdvanceInput) {
    const approval = input.approval;
    if (input.actor.type !== "HUMAN")
      throw new RbsAdminPilotError("HUMAN_APPROVAL_REQUIRED");
    if (
      !approval?.decision.allowed ||
      !approval.decision.approval_id ||
      approval.decision.authority !== "AUTHORIZED" ||
      approval.decision.status !== "APPROVED" ||
      approval.decision.validity !== "VALID" ||
      approval.environment !== "PREVIEW" ||
      approval.target_id !== pilot.id ||
      approval.target_version !== pilot.version
    )
      throw new RbsAdminPilotError("INVALID_PILOT_APPROVAL");
    if (
      input.actor.id === pilot.requested_by_actor_id ||
      pilot.assignments.some(({ agent_id }) => agent_id === input.actor.id)
    )
      throw new RbsAdminPilotError("APPROVAL_SEPARATION_REQUIRED");
  }

  private failRead(
    input: { actor: PilotActor; correlation_id: string; system_id: string },
    code: string,
  ): never {
    const eventName =
      code === "PILOT_SOURCE_UNAVAILABLE" ? "UNAVAILABLE" : code;
    if (this.systems.has(input.system_id))
      this.observedStatus.delete(input.system_id);
    if (this.systems.has(input.system_id))
      this.observedHealth.set(input.system_id, {
        health: code === "PILOT_SOURCE_UNAVAILABLE" ? "UNAVAILABLE" : "UNKNOWN",
        observed_at: this.now().toISOString(),
      });
    this.emit({
      name: `RBS_ADMIN_STATUS.${eventName}`,
      system_id: input.system_id,
      correlation_id: input.correlation_id,
      actor: input.actor,
      evidence_refs: [],
      occurred_at: this.now().toISOString(),
    });
    this.record(
      input.actor,
      code,
      { id: input.system_id, type: "DOMAIN_SYSTEM" },
      input.correlation_id,
      [],
      "DENIED",
    );
    throw new RbsAdminPilotError(code);
  }
  private emit(event: PilotEvent): Readonly<PilotEvent> {
    const frozen = freeze({
      ...event,
      evidence_refs: freeze([...event.evidence_refs]),
    });
    this.eventLog.push(frozen);
    return frozen;
  }
  private record(
    actor: PilotActor,
    action: string,
    target: PilotAuditRecord["target"],
    correlation_id: string,
    evidence_refs: readonly string[],
    result: "SUCCEEDED" | "DENIED" = "SUCCEEDED",
  ) {
    this.audit?.record({
      actor: { ...actor },
      action,
      target: { ...target },
      result,
      correlation_id,
      evidence_refs: [...evidence_refs],
    });
  }
}
