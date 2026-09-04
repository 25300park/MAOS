import type { ActorType } from "@maos/contracts";

export const AI_MLS_CAPABILITIES = [
  "READ_SOURCE_STATUS",
  "READ_CANDIDATE_STATUS",
  "SEARCH_INTERNAL",
  "READ_TASK_STATUS",
  "SIMULATE_HANDOFF",
] as const;
export type AiMlsCapability = (typeof AI_MLS_CAPABILITIES)[number];
export type AiMlsHealth =
  "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "MAINTENANCE" | "UNKNOWN";
export interface AiMlsActor {
  id: string;
  type: ActorType;
}
export interface AiMlsSystemRegistration {
  capabilities: readonly AiMlsCapability[];
  credential_reference: string;
  environment_reference: string;
  health: AiMlsHealth;
  id: string;
  integration_state: "REGISTERED" | "OBSERVABLE" | "DEGRADED" | "DISABLED";
  name: string;
  owner_actor_id: string;
  repository_reference: string;
  source_of_truth: "DOMAIN_SYSTEM";
  type: "INTERNAL_PLATFORM";
  version_reference: string;
  visibility: "INTERNAL_ONLY";
  workroot_reference: string;
}
export interface AiMlsResourceLink {
  project_id: string;
  resource_id: string;
  source_reference: string;
  system_id: string;
  target_hash: string;
  task_id: string;
  version: string;
}
export interface AiMlsIntakeSnapshot {
  candidate_counts: { blocked: number; pending: number; verified: number };
  collection_status: "IDLE" | "RUNNING" | "PAUSED" | "FAILED";
  evidence_refs: readonly string[];
  failed_ingestions: number;
  health: AiMlsHealth;
  ingestion_status: "READY" | "RUNNING" | "DEGRADED" | "FAILED";
  last_verified_result: {
    evidence_ref: string;
    result: "PASS" | "FAIL" | "BLOCKED";
    verified_at: string;
  };
  next_action: string;
  observed_at: string;
  source: { external_resource_ref: string; system_id: string };
  stale_ingestions: number;
  task_visibility: {
    active_ingestion_task_ids: readonly string[];
    blocked_task_ids: readonly string[];
    failed_run_ids: readonly string[];
    verification_task_ids: readonly string[];
  };
  version: string;
}
export interface AiMlsCandidateReference {
  candidate_id: string;
  consent_state: "UNKNOWN" | "PENDING" | "GRANTED" | "DENIED" | "REVOKED";
  contact_state: "NOT_CONTACTED" | "CONTACT_PENDING" | "CONTACTED" | "BLOCKED";
  duplicate_state: "UNKNOWN" | "UNIQUE" | "POSSIBLE_DUPLICATE" | "DUPLICATE";
  evidence_refs: readonly string[];
  freshness: "FRESH" | "STALE";
  publication_eligibility: {
    eligible: boolean;
    informational_only: true;
    reason: string;
  };
  source_reference: string;
  verification_state:
    "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED" | "BLOCKED";
}
export interface AiMlsSearchResult {
  candidates: readonly AiMlsCandidateReference[];
  evidence_refs: readonly string[];
  observed_at: string;
  query_id: string;
  source_system_id: string;
}
export interface AiMlsAdapter {
  readonly mode: "INTERNAL_READ_ONLY";
  observeIntake(input: {
    credential_reference: string;
    resource_id: string;
    signal: AbortSignal;
    system_id: string;
  }): Promise<AiMlsIntakeSnapshot>;
  searchInternal(input: {
    criteria: {
      property_types?: readonly string[];
      region_codes: readonly string[];
    };
    credential_reference: string;
    resource_id: string;
    signal: AbortSignal;
    system_id: string;
  }): Promise<AiMlsSearchResult>;
}
export interface AiMlsEvent {
  actor: AiMlsActor;
  correlation_id: string;
  evidence_refs: readonly string[];
  name: string;
  occurred_at: string;
  project_id?: string;
  resource_id?: string;
  system_id: string;
  task_id?: string;
}
export interface AiMlsAuditRecord {
  action: string;
  actor: AiMlsActor;
  correlation_id: string;
  evidence_refs: readonly string[];
  result: "DENIED" | "SUCCEEDED";
  target: {
    id: string;
    type:
      "AI_MLS_SYSTEM" | "AI_MLS_RESOURCE" | "AI_MLS_SEARCH" | "AI_MLS_HANDOFF";
  };
}
export interface AiMlsAuditPort {
  record(record: AiMlsAuditRecord): void;
}
interface AiMlsReadInput {
  actor: AiMlsActor;
  correlation_id: string;
  max_age_ms: number;
  permission_allowed: boolean;
  project_id: string;
  resource_id: string;
  signal?: AbortSignal;
  system_id: string;
  task_id: string;
  timeout_ms: number;
}
export class AiMlsIntegrationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AiMlsIntegrationError";
  }
}

const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const reference = (value: unknown, prefix: string): value is string =>
  nonempty(value) && value.startsWith(prefix) && value.length > prefix.length;
const date = (value: unknown): value is string =>
  nonempty(value) && !Number.isNaN(Date.parse(value));
const freeze = <T extends object>(value: T): Readonly<T> =>
  Object.freeze(value);

export class AiMlsIntegrationService {
  private readonly systems = new Map<
    string,
    Readonly<AiMlsSystemRegistration>
  >();
  private readonly links = new Map<string, Readonly<AiMlsResourceLink>>();
  private readonly intake = new Map<string, Readonly<AiMlsIntakeSnapshot>>();
  private readonly candidates = new Map<
    string,
    {
      candidate: Readonly<AiMlsCandidateReference>;
      project_id: string;
      task_id: string;
    }
  >();
  private readonly eventLog: Readonly<AiMlsEvent>[] = [];
  constructor(
    private readonly adapter: AiMlsAdapter,
    private readonly now: () => Date = () => new Date(),
    private readonly onEvent?: (event: AiMlsEvent) => void,
    private readonly audit?: AiMlsAuditPort,
  ) {
    if (adapter.mode !== "INTERNAL_READ_ONLY")
      throw new AiMlsIntegrationError("AI_MLS_SAFE_ADAPTER_REQUIRED");
  }

  registerSystem(
    input: AiMlsSystemRegistration & {
      actor: AiMlsActor;
      correlation_id: string;
    },
  ): Readonly<AiMlsSystemRegistration> {
    if (input.actor.type !== "HUMAN")
      throw new AiMlsIntegrationError("HUMAN_AI_MLS_OWNER_REQUIRED");
    if (
      input.type !== "INTERNAL_PLATFORM" ||
      input.visibility !== "INTERNAL_ONLY" ||
      input.source_of_truth !== "DOMAIN_SYSTEM"
    )
      throw new AiMlsIntegrationError("AI_MLS_INTERNAL_OWNERSHIP_REQUIRED");
    if (!reference(input.credential_reference, "secretref://"))
      throw new AiMlsIntegrationError("INVALID_AI_MLS_CREDENTIAL_REFERENCE");
    if (
      !reference(input.environment_reference, "configref://") ||
      !reference(input.repository_reference, "registry://") ||
      !reference(input.version_reference, "gitref://") ||
      !reference(input.workroot_reference, "workroot://")
    )
      throw new AiMlsIntegrationError("INVALID_AI_MLS_REFERENCE");
    if (
      !nonempty(input.id) ||
      !nonempty(input.name) ||
      !nonempty(input.owner_actor_id) ||
      input.capabilities.length === 0 ||
      input.capabilities.some(
        (capability) => !AI_MLS_CAPABILITIES.includes(capability),
      )
    )
      throw new AiMlsIntegrationError("INVALID_AI_MLS_SYSTEM");
    if (this.systems.has(input.id))
      throw new AiMlsIntegrationError("AI_MLS_SYSTEM_ALREADY_EXISTS");
    const { actor, correlation_id, ...system } = input;
    const stored = freeze({
      ...system,
      capabilities: freeze([...system.capabilities]),
    });
    this.systems.set(stored.id, stored);
    this.emit(actor, correlation_id, "AI_MLS.SYSTEM_REGISTERED", stored.id, []);
    this.record(
      actor,
      "REGISTER_SYSTEM",
      { id: stored.id, type: "AI_MLS_SYSTEM" },
      correlation_id,
      [],
    );
    return stored;
  }

  getSystem(id: string): Readonly<AiMlsSystemRegistration> {
    const system = this.systems.get(id);
    if (!system) throw new AiMlsIntegrationError("AI_MLS_SYSTEM_NOT_FOUND");
    return system;
  }

  linkResource(
    input: AiMlsResourceLink & { actor: AiMlsActor; correlation_id: string },
  ): Readonly<AiMlsResourceLink> {
    this.getSystem(input.system_id);
    if (input.actor.type !== "HUMAN" && input.actor.type !== "SYSTEM")
      throw new AiMlsIntegrationError("AI_MLS_LINK_AUTHORITY_REQUIRED");
    if (
      ![
        input.project_id,
        input.resource_id,
        input.task_id,
        input.version,
      ].every(nonempty) ||
      !reference(input.source_reference, "ai-mls://") ||
      !/^sha256:[a-f0-9]{64}$/.test(input.target_hash)
    )
      throw new AiMlsIntegrationError("INVALID_AI_MLS_RESOURCE_LINK");
    const key = this.key(input.system_id, input.resource_id);
    if (this.links.has(key))
      throw new AiMlsIntegrationError("AI_MLS_RESOURCE_ALREADY_LINKED");
    const { actor, correlation_id, ...link } = input;
    const stored = freeze({ ...link });
    this.links.set(key, stored);
    this.emit(
      actor,
      correlation_id,
      "AI_MLS.RESOURCE_LINKED",
      input.system_id,
      [],
      stored,
    );
    return stored;
  }

  async observeIntake(input: AiMlsReadInput): Promise<{
    external_action_performed: false;
    intake: Readonly<AiMlsIntakeSnapshot>;
    visibility: {
      active_ingestion_tasks: readonly string[];
      blocked_tasks: readonly string[];
      failed_runs: readonly string[];
      next_action: string;
      verification_tasks: readonly string[];
    };
  }> {
    const { system, link } = this.authorize(input, "READ_SOURCE_STATUS");
    const result = await this.run(input, (signal) =>
      this.adapter.observeIntake({
        credential_reference: system.credential_reference,
        resource_id: input.resource_id,
        signal,
        system_id: input.system_id,
      }),
    );
    this.validateIntake(result, link, input.max_age_ms);
    const stored = this.freezeIntake(result);
    this.intake.set(this.key(input.system_id, input.resource_id), stored);
    this.emit(
      input.actor,
      input.correlation_id,
      "AI_MLS.INTAKE_OBSERVED",
      input.system_id,
      stored.evidence_refs,
      link,
    );
    this.record(
      input.actor,
      "OBSERVE_INTAKE",
      { id: input.resource_id, type: "AI_MLS_RESOURCE" },
      input.correlation_id,
      stored.evidence_refs,
    );
    return freeze({
      external_action_performed: false as const,
      intake: stored,
      visibility: freeze({
        active_ingestion_tasks:
          stored.task_visibility.active_ingestion_task_ids,
        blocked_tasks: stored.task_visibility.blocked_task_ids,
        failed_runs: stored.task_visibility.failed_run_ids,
        next_action: stored.next_action,
        verification_tasks: stored.task_visibility.verification_task_ids,
      }),
    });
  }

  async searchInternal(
    input: AiMlsReadInput & {
      criteria: {
        property_types?: readonly string[];
        region_codes: readonly string[];
      };
    },
  ): Promise<{
    external_action_performed: false;
    result: Readonly<AiMlsSearchResult>;
    visibility: "INTERNAL_ONLY";
  }> {
    const { system, link } = this.authorize(input, "SEARCH_INTERNAL");
    if (
      !input.criteria ||
      !Array.isArray(input.criteria.region_codes) ||
      input.criteria.region_codes.length === 0 ||
      input.criteria.region_codes.some((value) => !nonempty(value))
    )
      throw new AiMlsIntegrationError("INVALID_AI_MLS_SEARCH");
    const result = await this.run(input, (signal) =>
      this.adapter.searchInternal({
        criteria: input.criteria,
        credential_reference: system.credential_reference,
        resource_id: input.resource_id,
        signal,
        system_id: input.system_id,
      }),
    );
    this.validateSearch(result, link, input.max_age_ms);
    const stored = this.freezeSearch(result);
    for (const candidate of stored.candidates)
      this.candidates.set(candidate.candidate_id, {
        candidate,
        project_id: input.project_id,
        task_id: input.task_id,
      });
    this.emit(
      input.actor,
      input.correlation_id,
      "AI_MLS.INTERNAL_SEARCH_COMPLETED",
      input.system_id,
      stored.evidence_refs,
      link,
    );
    this.record(
      input.actor,
      "SEARCH_INTERNAL",
      { id: stored.query_id, type: "AI_MLS_SEARCH" },
      input.correlation_id,
      stored.evidence_refs,
    );
    return freeze({
      external_action_performed: false as const,
      result: stored,
      visibility: "INTERNAL_ONLY" as const,
    });
  }

  createHandoffSimulation(input: {
    actor: AiMlsActor;
    candidate_id: string;
    correlation_id: string;
    destination_system_id: "crm" | "rbs" | "marketing";
    evidence_refs: readonly string[];
    id: string;
    permission_allowed: boolean;
    project_id: string;
    task_id: string;
  }) {
    if (input.actor.type !== "HUMAN" && input.actor.type !== "SYSTEM")
      throw new AiMlsIntegrationError("AI_MLS_HANDOFF_DENIED");
    const found = this.candidates.get(input.candidate_id);
    if (
      !input.permission_allowed ||
      !found ||
      found.project_id !== input.project_id ||
      found.task_id !== input.task_id ||
      !["crm", "rbs", "marketing"].includes(input.destination_system_id)
    )
      throw new AiMlsIntegrationError("AI_MLS_HANDOFF_DENIED");
    const candidate = found.candidate;
    if (
      candidate.verification_state !== "VERIFIED" ||
      candidate.consent_state !== "GRANTED" ||
      candidate.freshness !== "FRESH" ||
      !candidate.publication_eligibility.informational_only ||
      ![input.id, input.project_id, input.task_id, input.correlation_id].every(
        nonempty,
      ) ||
      input.evidence_refs.length === 0
    )
      throw new AiMlsIntegrationError("AI_MLS_VERIFIED_CONSENT_REQUIRED");
    const result = freeze({
      candidate_reference: candidate.source_reference,
      destination_system_id: input.destination_system_id,
      external_action_performed: false as const,
      id: input.id,
      mode: "SIMULATION_ONLY" as const,
      status: "DRAFT" as const,
    });
    this.emit(
      input.actor,
      input.correlation_id,
      "AI_MLS.HANDOFF_SIMULATED",
      "ai-mls",
      input.evidence_refs,
      {
        project_id: input.project_id,
        resource_id: input.candidate_id,
        task_id: input.task_id,
      },
    );
    this.record(
      input.actor,
      "SIMULATE_HANDOFF",
      { id: input.id, type: "AI_MLS_HANDOFF" },
      input.correlation_id,
      input.evidence_refs,
    );
    return result;
  }

  publishExternal(input: {
    actor: AiMlsActor;
    candidate_id: string;
    correlation_id: string;
  }): never {
    void input;
    throw new AiMlsIntegrationError("AI_MLS_EXTERNAL_PUBLICATION_FORBIDDEN");
  }
  readiness() {
    const systems = [...this.systems.values()];
    const status =
      systems.length === 0
        ? "NOT_READY"
        : systems.every(({ health }) => health === "HEALTHY") &&
            this.intake.size > 0
          ? "READY"
          : "DEGRADED";
    return freeze({
      adapter_mode: this.adapter.mode,
      observed_resources: this.intake.size,
      registered_systems: systems.length,
      status,
    });
  }
  events(): readonly Readonly<AiMlsEvent>[] {
    return [...this.eventLog];
  }

  private authorize(input: AiMlsReadInput, capability: AiMlsCapability) {
    const system = this.getSystem(input.system_id);
    const link = this.links.get(this.key(input.system_id, input.resource_id));
    if (
      !input.permission_allowed ||
      !link ||
      link.project_id !== input.project_id ||
      link.task_id !== input.task_id ||
      !system.capabilities.includes(capability) ||
      system.visibility !== "INTERNAL_ONLY" ||
      !nonempty(input.correlation_id)
    )
      this.deny(input, "AI_MLS_READ_DENIED");
    if (
      !Number.isSafeInteger(input.timeout_ms) ||
      input.timeout_ms < 1 ||
      !Number.isSafeInteger(input.max_age_ms) ||
      input.max_age_ms < 1
    )
      this.deny(input, "INVALID_AI_MLS_READ_REQUEST");
    return { link: link!, system };
  }
  private async run<T>(
    input: AiMlsReadInput,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (input.signal?.aborted) this.deny(input, "AI_MLS_READ_CANCELLED");
    const controller = new AbortController();
    let code = "AI_MLS_READ_CANCELLED";
    const cancel = () => {
      code = "AI_MLS_READ_CANCELLED";
      controller.abort();
    };
    input.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      code = "AI_MLS_READ_TIMED_OUT";
      controller.abort();
    }, input.timeout_ms);
    try {
      const cancelled = new Promise<never>((_resolve, reject) =>
        controller.signal.addEventListener(
          "abort",
          () => reject(new AiMlsIntegrationError(code)),
          { once: true },
        ),
      );
      return await Promise.race([operation(controller.signal), cancelled]);
    } catch (error) {
      if (error instanceof AiMlsIntegrationError) throw error;
      throw new AiMlsIntegrationError("AI_MLS_SOURCE_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", cancel);
    }
  }
  private validateIntake(
    value: AiMlsIntakeSnapshot,
    link: AiMlsResourceLink,
    maxAgeMs: number,
  ) {
    if (
      value.source.system_id !== link.system_id ||
      value.source.external_resource_ref !== link.source_reference
    )
      throw new AiMlsIntegrationError("AI_MLS_SOURCE_MISMATCH");
    if (value.version !== link.version)
      throw new AiMlsIntegrationError("AI_MLS_VERSION_MISMATCH");
    if (
      !date(value.observed_at) ||
      !date(value.last_verified_result.verified_at) ||
      !reference(value.last_verified_result.evidence_ref, "evidence://") ||
      value.evidence_refs.length === 0 ||
      !nonempty(value.next_action) ||
      [
        value.failed_ingestions,
        value.stale_ingestions,
        value.candidate_counts.blocked,
        value.candidate_counts.pending,
        value.candidate_counts.verified,
      ].some((number) => !Number.isSafeInteger(number) || number < 0)
    )
      throw new AiMlsIntegrationError("INVALID_AI_MLS_INTAKE");
    if (this.now().getTime() - Date.parse(value.observed_at) > maxAgeMs)
      throw new AiMlsIntegrationError("AI_MLS_DATA_STALE");
  }
  private validateSearch(
    value: AiMlsSearchResult,
    link: AiMlsResourceLink,
    maxAgeMs: number,
  ) {
    if (value.source_system_id !== link.system_id)
      throw new AiMlsIntegrationError("AI_MLS_SOURCE_MISMATCH");
    if (
      !nonempty(value.query_id) ||
      !date(value.observed_at) ||
      value.evidence_refs.length === 0 ||
      this.now().getTime() - Date.parse(value.observed_at) > maxAgeMs
    )
      throw new AiMlsIntegrationError("AI_MLS_DATA_STALE");
    const ids = new Set(
      value.candidates.map(({ candidate_id }) => candidate_id),
    );
    if (
      ids.size !== value.candidates.length ||
      value.candidates.some(
        (candidate) =>
          !nonempty(candidate.candidate_id) ||
          !reference(candidate.source_reference, "ai-mls://") ||
          candidate.evidence_refs.length === 0 ||
          candidate.publication_eligibility.informational_only !== true,
      )
    )
      throw new AiMlsIntegrationError("INVALID_AI_MLS_SEARCH_RESULT");
  }
  private freezeIntake(
    value: AiMlsIntakeSnapshot,
  ): Readonly<AiMlsIntakeSnapshot> {
    return freeze({
      ...value,
      candidate_counts: freeze({ ...value.candidate_counts }),
      evidence_refs: freeze([...value.evidence_refs]),
      last_verified_result: freeze({ ...value.last_verified_result }),
      source: freeze({ ...value.source }),
      task_visibility: freeze({
        active_ingestion_task_ids: freeze([
          ...value.task_visibility.active_ingestion_task_ids,
        ]),
        blocked_task_ids: freeze([...value.task_visibility.blocked_task_ids]),
        failed_run_ids: freeze([...value.task_visibility.failed_run_ids]),
        verification_task_ids: freeze([
          ...value.task_visibility.verification_task_ids,
        ]),
      }),
    });
  }
  private freezeSearch(value: AiMlsSearchResult): Readonly<AiMlsSearchResult> {
    return freeze({
      ...value,
      candidates: freeze(
        value.candidates.map((candidate) =>
          freeze({
            ...candidate,
            evidence_refs: freeze([...candidate.evidence_refs]),
            publication_eligibility: freeze({
              ...candidate.publication_eligibility,
            }),
          }),
        ),
      ),
      evidence_refs: freeze([...value.evidence_refs]),
    });
  }
  private deny(input: AiMlsReadInput, code: string): never {
    this.record(
      input.actor,
      code,
      { id: input.resource_id, type: "AI_MLS_RESOURCE" },
      input.correlation_id,
      [],
      "DENIED",
    );
    throw new AiMlsIntegrationError(code);
  }
  private key(systemId: string, resourceId: string) {
    return `${systemId}:${resourceId}`;
  }
  private emit(
    actor: AiMlsActor,
    correlationId: string,
    name: string,
    systemId: string,
    evidenceRefs: readonly string[],
    scope?: Partial<AiMlsResourceLink>,
  ) {
    const event = freeze({
      actor: freeze({ ...actor }),
      correlation_id: correlationId,
      evidence_refs: freeze([...evidenceRefs]),
      name,
      occurred_at: this.now().toISOString(),
      ...(scope?.project_id ? { project_id: scope.project_id } : {}),
      ...(scope?.resource_id ? { resource_id: scope.resource_id } : {}),
      system_id: systemId,
      ...(scope?.task_id ? { task_id: scope.task_id } : {}),
    });
    this.eventLog.push(event);
    this.onEvent?.(event);
  }
  private record(
    actor: AiMlsActor,
    action: string,
    target: AiMlsAuditRecord["target"],
    correlationId: string,
    evidenceRefs: readonly string[],
    result: "DENIED" | "SUCCEEDED" = "SUCCEEDED",
  ) {
    this.audit?.record(
      freeze({
        action,
        actor: freeze({ ...actor }),
        correlation_id: correlationId,
        evidence_refs: freeze([...evidenceRefs]),
        result,
        target: freeze({ ...target }),
      }),
    );
  }
}
