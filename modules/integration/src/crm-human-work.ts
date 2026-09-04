import type { ActorType } from "@maos/contracts";

export const CRM_CAPABILITIES = [
  "READ_WORK",
  "CAPTURE_WORK",
  "DRAFT_DOCUMENT",
  "SIMULATE_AI_MLS_SEARCH",
] as const;
export type CrmCapability = (typeof CRM_CAPABILITIES)[number];
export type CrmHealth =
  "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "MAINTENANCE" | "UNKNOWN";
export interface CrmActor {
  id: string;
  type: ActorType;
}
export interface CrmSystemRegistration {
  capabilities: readonly CrmCapability[];
  credential_reference: string;
  environment_reference: string;
  health: CrmHealth;
  id: string;
  integration_state: "REGISTERED" | "OBSERVABLE" | "DEGRADED" | "DISABLED";
  name: string;
  owner_actor_id: string;
  repository_reference: string;
  source_of_truth: "DOMAIN_SYSTEM";
  type: "DOMAIN_APPLICATION";
  version_reference: string;
  workroot_reference: string;
}
export type CrmWorkType =
  | "ACTIVITY"
  | "CALENDAR_EVENT"
  | "CONTRACT"
  | "CUSTOMER"
  | "DOCUMENT"
  | "FOLLOW_UP"
  | "LISTING"
  | "REPORT"
  | "TASK"
  | "VIEWING";
export interface CrmWorkCandidate {
  candidate_id: string;
  confidence: number;
  deduplication_key: string;
  evidence_refs: readonly string[];
  original_input_reference: string;
  proposed_records: readonly {
    action: "CREATE" | "LINK" | "UPDATE";
    reference: string;
    type: CrmWorkType;
  }[];
  review_reasons: readonly string[];
}
export interface CrmTodaySnapshot {
  blockers: number;
  contract_deadlines: number;
  evidence_refs: readonly string[];
  next_actions: readonly string[];
  observed_at: string;
  overdue_tasks: number;
  source_reference: string;
  tasks_due_today: number;
  upcoming_viewings: number;
  workload: "LOW" | "BALANCED" | "HIGH";
}
export interface CrmAdapter {
  readonly mode: "GOVERNED_REFERENCE_ONLY";
  observeWork(input: {
    credential_reference: string;
    employee_reference: string;
    signal: AbortSignal;
    system_id: string;
  }): Promise<CrmTodaySnapshot>;
  structureCapture(input: {
    credential_reference: string;
    employee_reference: string;
    idempotency_key: string;
    signal: AbortSignal;
    system_id: string;
    text: string;
  }): Promise<CrmWorkCandidate>;
}
export interface CrmIntegrationEvent {
  actor: CrmActor;
  correlation_id: string;
  evidence_refs: readonly string[];
  name: string;
  occurred_at: string;
  project_id?: string;
  source_reference?: string;
  system_id: string;
}
export interface CrmAuditRecord {
  action: string;
  actor: CrmActor;
  correlation_id: string;
  evidence_refs: readonly string[];
  result: "SUCCEEDED";
  target: {
    id: string;
    type: "CRM_SYSTEM" | "CRM_WORK" | "CRM_DOCUMENT" | "CRM_AI_MLS_HANDOFF";
  };
}
export interface CrmAuditPort {
  record(record: CrmAuditRecord): void;
}

interface ScopeBinding {
  employee_id: string;
  project_id: string;
  source_reference: string;
  system_id: string;
}
interface ScopedInput {
  actor: CrmActor;
  correlation_id: string;
  employee_id: string;
  permission_allowed: boolean;
  project_id: string;
  system_id: string;
}

export class CrmIntegrationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CrmIntegrationError";
  }
}

const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const reference = (value: unknown, prefix: string): value is string =>
  nonempty(value) && value.startsWith(prefix) && value.length > prefix.length;
const freeze = <T extends object>(value: T): Readonly<T> =>
  Object.freeze(value);
const countsAreValid = (values: readonly number[]) =>
  values.every((value) => Number.isSafeInteger(value) && value >= 0);

export class CrmHumanWorkService {
  private readonly systems = new Map<string, Readonly<CrmSystemRegistration>>();
  private readonly scopes = new Map<string, Readonly<ScopeBinding>>();
  private readonly captures = new Map<
    string,
    Readonly<{
      candidate: Readonly<CrmWorkCandidate>;
      external_action_performed: false;
      review_required: boolean;
    }>
  >();
  private readonly snapshots = new Map<string, Readonly<CrmTodaySnapshot>>();
  private readonly candidateEmployees = new Map<string, string>();
  private readonly eventLog: Readonly<CrmIntegrationEvent>[] = [];

  constructor(
    private readonly adapter: CrmAdapter,
    private readonly now: () => Date = () => new Date(),
    private readonly onEvent?: (event: CrmIntegrationEvent) => void,
    private readonly audit?: CrmAuditPort,
  ) {
    if (adapter.mode !== "GOVERNED_REFERENCE_ONLY")
      throw new CrmIntegrationError("CRM_SAFE_ADAPTER_REQUIRED");
  }

  registerSystem(
    input: CrmSystemRegistration & {
      actor: CrmActor;
      correlation_id: string;
    },
  ): Readonly<CrmSystemRegistration> {
    if (
      input.actor.type !== "HUMAN" ||
      input.type !== "DOMAIN_APPLICATION" ||
      input.source_of_truth !== "DOMAIN_SYSTEM"
    )
      throw new CrmIntegrationError("CRM_DOMAIN_OWNERSHIP_REQUIRED");
    if (!reference(input.credential_reference, "secretref://"))
      throw new CrmIntegrationError("INVALID_CRM_CREDENTIAL_REFERENCE");
    if (
      !reference(input.environment_reference, "configref://") ||
      !reference(input.repository_reference, "registry://") ||
      !reference(input.version_reference, "gitref://") ||
      !reference(input.workroot_reference, "workroot://") ||
      ![input.id, input.name, input.owner_actor_id, input.correlation_id].every(
        nonempty,
      ) ||
      input.capabilities.length === 0 ||
      input.capabilities.some((item) => !CRM_CAPABILITIES.includes(item))
    )
      throw new CrmIntegrationError("INVALID_CRM_SYSTEM");
    if (this.systems.has(input.id))
      throw new CrmIntegrationError("CRM_SYSTEM_ALREADY_EXISTS");
    const { actor, correlation_id, ...system } = input;
    const stored = freeze({
      ...system,
      capabilities: freeze([...system.capabilities]),
    });
    this.systems.set(stored.id, stored);
    this.emit(actor, correlation_id, "CRM.SYSTEM_REGISTERED", stored.id, []);
    this.record(
      actor,
      correlation_id,
      "REGISTER_SYSTEM",
      stored.id,
      "CRM_SYSTEM",
      [],
    );
    return stored;
  }

  getSystem(id: string): Readonly<CrmSystemRegistration> {
    const system = this.systems.get(id);
    if (!system) throw new CrmIntegrationError("CRM_SYSTEM_NOT_FOUND");
    return system;
  }

  bindEmployeeScope(
    input: ScopeBinding & { actor: CrmActor; correlation_id: string },
  ): Readonly<ScopeBinding> {
    this.getSystem(input.system_id);
    if (
      input.actor.type !== "HUMAN" ||
      ![input.employee_id, input.project_id, input.correlation_id].every(
        nonempty,
      ) ||
      !reference(input.source_reference, "crm://employees/")
    )
      throw new CrmIntegrationError("INVALID_CRM_EMPLOYEE_SCOPE");
    const { actor, correlation_id, ...scope } = input;
    const stored = freeze({ ...scope });
    this.scopes.set(this.scopeKey(scope.system_id, scope.employee_id), stored);
    this.emit(
      actor,
      correlation_id,
      "CRM.EMPLOYEE_SCOPE_BOUND",
      scope.system_id,
      [],
    );
    return stored;
  }

  async captureWork(
    input: ScopedInput & {
      idempotency_key: string;
      signal?: AbortSignal;
      text: string;
      timeout_ms: number;
    },
  ) {
    const { scope, system } = this.authorize(input, "CAPTURE_WORK");
    if (!nonempty(input.idempotency_key) || !nonempty(input.text))
      throw new CrmIntegrationError("INVALID_CRM_CAPTURE");
    const replayKey = `${input.system_id}:${input.employee_id}:${input.idempotency_key}`;
    const existing = this.captures.get(replayKey);
    if (existing) return existing;
    const candidate = await this.run(input, (signal) =>
      this.adapter.structureCapture({
        credential_reference: system.credential_reference,
        employee_reference: scope.source_reference,
        idempotency_key: input.idempotency_key,
        signal,
        system_id: input.system_id,
        text: input.text,
      }),
    );
    this.validateCandidate(candidate);
    const storedCandidate = freeze({
      ...candidate,
      evidence_refs: freeze([...candidate.evidence_refs]),
      proposed_records: freeze(
        candidate.proposed_records.map((record) => freeze({ ...record })),
      ),
      review_reasons: freeze([...candidate.review_reasons]),
    });
    const result = freeze({
      candidate: storedCandidate,
      external_action_performed: false as const,
      review_required:
        candidate.confidence < 0.9 || candidate.review_reasons.length > 0,
    });
    this.captures.set(replayKey, result);
    this.candidateEmployees.set(
      storedCandidate.candidate_id,
      input.employee_id,
    );
    this.emit(
      input.actor,
      input.correlation_id,
      "CRM.WORK_CAPTURE_CANDIDATE_CREATED",
      input.system_id,
      storedCandidate.evidence_refs,
      input.project_id,
      storedCandidate.original_input_reference,
    );
    this.record(
      input.actor,
      input.correlation_id,
      "CREATE_CAPTURE_CANDIDATE",
      storedCandidate.candidate_id,
      "CRM_WORK",
      storedCandidate.evidence_refs,
    );
    return result;
  }

  confirmCandidate(input: {
    actor: CrmActor;
    candidate_id: string;
    correlation_id: string;
    employee_id: string;
    permission_allowed: boolean;
  }) {
    const found = [...this.captures.values()].find(
      ({ candidate }) => candidate.candidate_id === input.candidate_id,
    );
    if (
      input.actor.type !== "HUMAN" ||
      input.actor.id !== input.employee_id ||
      !input.permission_allowed ||
      !found ||
      this.candidateEmployees.get(input.candidate_id) !== input.employee_id
    )
      throw new CrmIntegrationError("HUMAN_CRM_REVIEW_REQUIRED");
    return freeze({
      candidate_id: input.candidate_id,
      external_action_performed: false as const,
      status: "REVIEWED_MUTATION_REQUEST" as const,
    });
  }

  async observeToday(
    input: ScopedInput & {
      max_age_ms: number;
      signal?: AbortSignal;
      timeout_ms: number;
    },
  ): Promise<Readonly<CrmTodaySnapshot>> {
    const { scope, system } = this.authorize(input, "READ_WORK");
    const snapshot = await this.run(input, (signal) =>
      this.adapter.observeWork({
        credential_reference: system.credential_reference,
        employee_reference: scope.source_reference,
        signal,
        system_id: input.system_id,
      }),
    );
    this.validateSnapshot(snapshot, input.max_age_ms);
    const stored = freeze({
      ...snapshot,
      evidence_refs: freeze([...snapshot.evidence_refs]),
      next_actions: freeze([...snapshot.next_actions]),
    });
    this.snapshots.set(
      this.scopeKey(input.system_id, input.employee_id),
      stored,
    );
    this.emit(
      input.actor,
      input.correlation_id,
      "CRM.TODAY_OBSERVED",
      input.system_id,
      stored.evidence_refs,
      input.project_id,
      stored.source_reference,
    );
    this.record(
      input.actor,
      input.correlation_id,
      "OBSERVE_TODAY",
      stored.source_reference,
      "CRM_WORK",
      stored.evidence_refs,
    );
    return stored;
  }

  managementProjection(input: {
    actor: CrmActor;
    correlation_id: string;
    manager_scope_allowed: boolean;
    project_id: string;
  }) {
    if (
      input.actor.type !== "HUMAN" ||
      !input.manager_scope_allowed ||
      !nonempty(input.correlation_id) ||
      !nonempty(input.project_id)
    )
      throw new CrmIntegrationError("CRM_MANAGER_SCOPE_DENIED");
    const snapshots = [...this.snapshots.entries()].filter(([key]) => {
      const scope = this.scopes.get(key);
      return scope?.project_id === input.project_id;
    });
    return freeze({
      blockers: snapshots.reduce((sum, [, item]) => sum + item.blockers, 0),
      contract_deadlines: snapshots.reduce(
        (sum, [, item]) => sum + item.contract_deadlines,
        0,
      ),
      employee_count: snapshots.length,
      overdue_tasks: snapshots.reduce(
        (sum, [, item]) => sum + item.overdue_tasks,
        0,
      ),
      upcoming_viewings: snapshots.reduce(
        (sum, [, item]) => sum + item.upcoming_viewings,
        0,
      ),
      workload: freeze({
        BALANCED: snapshots.filter(([, item]) => item.workload === "BALANCED")
          .length,
        HIGH: snapshots.filter(([, item]) => item.workload === "HIGH").length,
        LOW: snapshots.filter(([, item]) => item.workload === "LOW").length,
      }),
    });
  }

  createDocumentDraft(
    input: ScopedInput & {
      document_type:
        | "VIEWING_CONFIRMATION"
        | "OFFER_LETTER"
        | "CLIENT_REQUIREMENT"
        | "OWNER_REQUEST"
        | "CONTRACT_SUMMARY"
        | "HANDOVER_CHECKLIST"
        | "RENEWAL_NOTICE"
        | "DAILY_REPORT"
        | "WEEKLY_REPORT"
        | "MONTHLY_REPORT";
      source_references: readonly string[];
    },
  ) {
    this.authorize(input, "DRAFT_DOCUMENT");
    if (
      input.source_references.length === 0 ||
      input.source_references.some((item) => !reference(item, "crm://"))
    )
      throw new CrmIntegrationError("INVALID_CRM_DOCUMENT_SOURCES");
    const result = freeze({
      document_type: input.document_type,
      external_action_performed: false as const,
      source_references: freeze([...input.source_references]),
      status: "EMPLOYEE_REVIEW_REQUIRED" as const,
    });
    this.record(
      input.actor,
      input.correlation_id,
      "CREATE_DOCUMENT_DRAFT",
      input.source_references[0]!,
      "CRM_DOCUMENT",
      [],
    );
    return result;
  }

  createAiMlsSearchSimulation(
    input: ScopedInput & { requirement_reference: string },
  ) {
    this.authorize(input, "SIMULATE_AI_MLS_SEARCH");
    if (!reference(input.requirement_reference, "crm://requirements/"))
      throw new CrmIntegrationError("INVALID_CRM_REQUIREMENT_REFERENCE");
    const result = freeze({
      external_action_performed: false as const,
      mode: "SIMULATION_ONLY" as const,
      requirement_reference: input.requirement_reference,
      visibility: "INTERNAL_ONLY" as const,
    });
    this.record(
      input.actor,
      input.correlation_id,
      "SIMULATE_AI_MLS_SEARCH",
      input.requirement_reference,
      "CRM_AI_MLS_HANDOFF",
      [],
    );
    return result;
  }

  readiness() {
    const systems = [...this.systems.values()];
    return freeze({
      adapter_mode: this.adapter.mode,
      observed_employee_scopes: this.snapshots.size,
      registered_systems: systems.length,
      status:
        systems.length === 0
          ? "NOT_READY"
          : systems.every(({ health }) => health === "HEALTHY")
            ? "READY"
            : "DEGRADED",
    });
  }

  events(): readonly Readonly<CrmIntegrationEvent>[] {
    return [...this.eventLog];
  }

  private authorize(input: ScopedInput, capability: CrmCapability) {
    const system = this.getSystem(input.system_id);
    const scope = this.scopes.get(
      this.scopeKey(input.system_id, input.employee_id),
    );
    if (!input.permission_allowed)
      throw new CrmIntegrationError("CRM_PERMISSION_DENIED");
    if (
      !scope ||
      scope.project_id !== input.project_id ||
      input.actor.id !== input.employee_id ||
      input.actor.type !== "HUMAN" ||
      !system.capabilities.includes(capability) ||
      !nonempty(input.correlation_id)
    )
      throw new CrmIntegrationError("CRM_SCOPE_DENIED");
    return { scope, system };
  }

  private async run<T>(
    input: { signal?: AbortSignal; timeout_ms: number },
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (!Number.isSafeInteger(input.timeout_ms) || input.timeout_ms < 1)
      throw new CrmIntegrationError("INVALID_CRM_TIMEOUT");
    if (input.signal?.aborted)
      throw new CrmIntegrationError("CRM_REQUEST_CANCELLED");
    const controller = new AbortController();
    let code = "CRM_REQUEST_CANCELLED";
    const cancel = () => controller.abort();
    input.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      code = "CRM_REQUEST_TIMED_OUT";
      controller.abort();
    }, input.timeout_ms);
    try {
      const aborted = new Promise<never>((_resolve, reject) =>
        controller.signal.addEventListener(
          "abort",
          () => reject(new CrmIntegrationError(code)),
          { once: true },
        ),
      );
      return await Promise.race([operation(controller.signal), aborted]);
    } catch (error) {
      if (error instanceof CrmIntegrationError) throw error;
      throw new CrmIntegrationError("CRM_SOURCE_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", cancel);
    }
  }

  private validateCandidate(value: CrmWorkCandidate) {
    if (
      !nonempty(value.candidate_id) ||
      !nonempty(value.deduplication_key) ||
      !reference(value.original_input_reference, "crm://captures/") ||
      value.confidence < 0 ||
      value.confidence > 1 ||
      value.evidence_refs.length === 0 ||
      value.evidence_refs.some((item) => !reference(item, "evidence://")) ||
      value.proposed_records.length === 0 ||
      value.proposed_records.some(
        (item) => !reference(item.reference, "crm://"),
      )
    )
      throw new CrmIntegrationError("INVALID_CRM_CAPTURE_RESULT");
  }

  private validateSnapshot(value: CrmTodaySnapshot, maxAgeMs: number) {
    if (
      !Number.isSafeInteger(maxAgeMs) ||
      maxAgeMs < 1 ||
      !reference(value.source_reference, "crm://") ||
      Number.isNaN(Date.parse(value.observed_at)) ||
      this.now().getTime() - Date.parse(value.observed_at) > maxAgeMs ||
      value.evidence_refs.length === 0 ||
      value.next_actions.some((item) => !nonempty(item)) ||
      !countsAreValid([
        value.blockers,
        value.contract_deadlines,
        value.overdue_tasks,
        value.tasks_due_today,
        value.upcoming_viewings,
      ])
    )
      throw new CrmIntegrationError("INVALID_OR_STALE_CRM_WORK");
  }

  private emit(
    actor: CrmActor,
    correlationId: string,
    name: string,
    systemId: string,
    evidenceRefs: readonly string[],
    projectId?: string,
    sourceReference?: string,
  ) {
    const event = freeze({
      actor: freeze({ ...actor }),
      correlation_id: correlationId,
      evidence_refs: freeze([...evidenceRefs]),
      name,
      occurred_at: this.now().toISOString(),
      ...(projectId ? { project_id: projectId } : {}),
      ...(sourceReference ? { source_reference: sourceReference } : {}),
      system_id: systemId,
    });
    this.eventLog.push(event);
    this.onEvent?.(event);
  }

  private scopeKey(systemId: string, employeeId: string) {
    return `${systemId}:${employeeId}`;
  }

  private record(
    actor: CrmActor,
    correlationId: string,
    action: string,
    id: string,
    type: CrmAuditRecord["target"]["type"],
    evidenceRefs: readonly string[],
  ) {
    this.audit?.record(
      freeze({
        action,
        actor: freeze({ ...actor }),
        correlation_id: correlationId,
        evidence_refs: freeze([...evidenceRefs]),
        result: "SUCCEEDED" as const,
        target: freeze({ id, type }),
      }),
    );
  }
}
