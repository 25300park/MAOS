import { createHash } from "node:crypto";
import type { ActorType, GovernanceDecision } from "@maos/contracts";

export const HR_CAPABILITIES = [
  "READ_HR_OPERATIONS",
  "READ_STATUTORY_OBLIGATIONS",
  "PREPARE_HR_LABOR_WORK",
] as const;
export type HrCapability = (typeof HR_CAPABILITIES)[number];
export type HrHealth =
  "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "MAINTENANCE" | "UNKNOWN";
export type LaborAgentAssignment = "ANALYSIS_DRAFT" | "COMPLIANCE_REVIEW";
export type LaborAgentCapability =
  | "RESEARCH_RULES"
  | "GENERATE_CHECKLIST"
  | "DRAFT_NOTICE"
  | "REVIEW_POLICY"
  | "MONITOR_DEADLINE"
  | "IDENTIFY_RISK"
  | "GATHER_EVIDENCE"
  | "COMPLIANCE_REVIEW";
export const LABOR_AGENT_CAPABILITIES: Readonly<
  Record<LaborAgentAssignment, readonly LaborAgentCapability[]>
> = {
  ANALYSIS_DRAFT: [
    "RESEARCH_RULES",
    "GENERATE_CHECKLIST",
    "DRAFT_NOTICE",
    "REVIEW_POLICY",
    "MONITOR_DEADLINE",
    "IDENTIFY_RISK",
    "GATHER_EVIDENCE",
  ],
  COMPLIANCE_REVIEW: ["COMPLIANCE_REVIEW", "IDENTIFY_RISK"],
};
export type HrLaborWorkType =
  | "EMPLOYMENT_DOCUMENT"
  | "POLICY_REVIEW"
  | "LEAVE_ATTENDANCE_NOTICE"
  | "PERFORMANCE_NOTICE"
  | "HR_MEMO"
  | "ONBOARDING_CHECKLIST"
  | "OFFBOARDING_CHECKLIST"
  | "STATUTORY_CHECKLIST";
export type HrLaborWorkStatus =
  | "DRAFT"
  | "ANALYZED"
  | "DRAFT_READY"
  | "COMPLIANCE_REVIEWED"
  | "HUMAN_REVIEW"
  | "WAITING_APPROVAL"
  | "READY_FOR_EXTERNAL_ACTION"
  | "BLOCKED";
export type StatutoryType = "DOLE" | "SSS" | "PHILHEALTH" | "PAG_IBIG";

export interface HrActor {
  id: string;
  type: ActorType;
}
export interface HrSystemRegistration {
  capabilities: readonly HrCapability[];
  credential_reference: string;
  environment_reference: string;
  health: HrHealth;
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
export interface EmployeeWorkReference {
  attendance_reference: string;
  department_reference: string;
  document_references: readonly string[];
  employee_reference: string;
  employment_status_reference: string;
  hr_case_reference?: string;
  leave_reference: string;
  payroll_reference: string;
  performance_reference: string;
  schedule_reference: string;
}
export interface HrOperationalSnapshot {
  attendance_exceptions: number;
  blocked_work: number;
  department_reference: string;
  employee_references: readonly EmployeeWorkReference[];
  evidence_refs: readonly string[];
  kpi_risks: number;
  leave_conflicts: number;
  observed_at: string;
  overdue_work: number;
  source_reference: string;
  team_capacity: "AVAILABLE" | "BALANCED" | "CONSTRAINED" | "UNKNOWN";
  workload: "LOW" | "BALANCED" | "HIGH" | "UNKNOWN";
}
export interface StatutoryObligation {
  blocker?: string;
  due_date: string;
  evidence_refs: readonly string[];
  id: string;
  missing_data_refs: readonly string[];
  responsible_human_id: string;
  status: "OPEN" | "IN_REVIEW" | "BLOCKED" | "READY" | "COMPLETED";
  type: StatutoryType;
}
export interface StatutorySnapshot {
  evidence_refs: readonly string[];
  observed_at: string;
  obligations: readonly StatutoryObligation[];
  period: string;
  source_reference: string;
}
export interface HrLaborAdapter {
  readonly mode: "GOVERNED_REFERENCE_ONLY";
  observeOperations(input: {
    credential_reference: string;
    department_reference: string;
    period: string;
    signal: AbortSignal;
    source_reference: string;
    system_id: string;
  }): Promise<HrOperationalSnapshot>;
  observeStatutoryObligations(input: {
    credential_reference: string;
    department_reference: string;
    period: string;
    signal: AbortSignal;
    source_reference: string;
    system_id: string;
  }): Promise<StatutorySnapshot>;
}
export interface LaborAgentRegistration {
  agent_id: string;
  assignment: LaborAgentAssignment;
  capabilities: readonly LaborAgentCapability[];
  status: "AVAILABLE" | "WORKING" | "WAITING" | "BLOCKED" | "OFFLINE";
}
export interface HrLaborWork {
  analysis_actor_id?: string;
  approval_id?: string;
  department_reference: string;
  draft_reference?: string;
  draft_version?: number;
  due_date: string;
  environment: string;
  evidence_refs: readonly string[];
  external_action_performed: false;
  human_review_actor_id?: string;
  id: string;
  period: string;
  project_id: string;
  responsible_human_id: string;
  review_actor_id?: string;
  source_references: readonly string[];
  status: HrLaborWorkStatus;
  system_id: string;
  type: HrLaborWorkType;
  version: number;
}
export interface HrLaborEvent {
  actor: HrActor;
  correlation_id: string;
  evidence_refs: readonly string[];
  error_code?: string;
  name: string;
  occurred_at: string;
  project_id?: string;
  system_id: string;
  work_id?: string;
}
export interface HrLaborAuditRecord {
  action: string;
  actor: HrActor;
  correlation_id: string;
  evidence_refs: readonly string[];
  error_code?: string;
  project_id?: string;
  result: "SUCCEEDED" | "FAILED" | "DENIED";
  system_id?: string;
  target: {
    id: string;
    type:
      | "HR_SYSTEM"
      | "HR_OPERATIONS"
      | "HR_STATUTORY"
      | "HR_LABOR_WORK"
      | "HR_EXTERNAL_ACTION";
  };
}
export interface HrLaborAuditPort {
  record(record: HrLaborAuditRecord): void;
}
export interface HrLaborApprovalPort {
  evaluate(input: {
    actor: HrActor;
    approval_id: string;
    target: {
      action: "PREPARE_HR_LABOR_EXTERNAL_ACTION";
      environment: string;
      hash: string;
      project_id: string;
      system_id: string;
      version: number;
      work_id: string;
    };
  }): GovernanceDecision;
}
export interface HrLaborPrivacyPort {
  canReadEmployeeReferences(input: {
    actor: HrActor;
    department_reference: string;
    project_id: string;
    system_id: string;
  }): boolean;
}

interface HrScopeBinding {
  department_reference: string;
  environment: string;
  period: string;
  project_id: string;
  purpose: "HR_OPERATIONS" | "LABOR_COMPLIANCE";
  source_reference: string;
  system_id: string;
}
interface HrScopedInput {
  actor: HrActor;
  correlation_id: string;
  department_reference: string;
  period: string;
  permission_allowed: boolean;
  project_id: string;
  purpose: "HR_OPERATIONS" | "LABOR_COMPLIANCE";
  system_id: string;
}

export class HrLaborError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "HrLaborError";
  }
}

const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const reference = (value: unknown, prefix: string): value is string =>
  nonempty(value) && value.startsWith(prefix) && value.length > prefix.length;
const date = (value: string) => !Number.isNaN(Date.parse(value));
const period = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const freeze = <T extends object>(value: T): Readonly<T> =>
  Object.freeze(value);
const countsValid = (values: readonly number[]) =>
  values.every((value) => Number.isSafeInteger(value) && value >= 0);
const WORK_TYPES: readonly HrLaborWorkType[] = [
  "EMPLOYMENT_DOCUMENT",
  "POLICY_REVIEW",
  "LEAVE_ATTENDANCE_NOTICE",
  "PERFORMANCE_NOTICE",
  "HR_MEMO",
  "ONBOARDING_CHECKLIST",
  "OFFBOARDING_CHECKLIST",
  "STATUTORY_CHECKLIST",
];
const STATUTORY_TYPES: readonly StatutoryType[] = [
  "DOLE",
  "SSS",
  "PHILHEALTH",
  "PAG_IBIG",
];
const purposeForWork = (type: HrLaborWorkType): HrScopeBinding["purpose"] =>
  type === "POLICY_REVIEW" || type === "STATUTORY_CHECKLIST"
    ? "LABOR_COMPLIANCE"
    : "HR_OPERATIONS";

export class HrLaborService {
  private readonly systems = new Map<string, Readonly<HrSystemRegistration>>();
  private readonly scopes = new Map<string, Readonly<HrScopeBinding>>();
  private readonly agents = new Map<
    string,
    readonly Readonly<LaborAgentRegistration>[]
  >();
  private readonly operations = new Map<
    string,
    Readonly<HrOperationalSnapshot>
  >();
  private readonly obligations = new Map<string, Readonly<StatutorySnapshot>>();
  private readonly works = new Map<string, Readonly<HrLaborWork>>();
  private readonly eventLog: Readonly<HrLaborEvent>[] = [];

  constructor(
    private readonly adapter: HrLaborAdapter,
    private readonly now: () => Date = () => new Date(),
    private readonly onEvent?: (event: HrLaborEvent) => void,
    private readonly audit?: HrLaborAuditPort,
    private readonly approval?: HrLaborApprovalPort,
    private readonly privacy?: HrLaborPrivacyPort,
  ) {
    if (adapter.mode !== "GOVERNED_REFERENCE_ONLY")
      throw new HrLaborError("HR_SAFE_ADAPTER_REQUIRED");
  }

  registerSystem(
    input: HrSystemRegistration & { actor: HrActor; correlation_id: string },
  ): Readonly<HrSystemRegistration> {
    if (
      input.actor.type !== "HUMAN" ||
      input.type !== "DOMAIN_APPLICATION" ||
      input.source_of_truth !== "DOMAIN_SYSTEM"
    )
      throw new HrLaborError("HR_DOMAIN_OWNERSHIP_REQUIRED");
    if (!reference(input.credential_reference, "secretref://"))
      throw new HrLaborError("INVALID_HR_CREDENTIAL_REFERENCE");
    if (
      !reference(input.environment_reference, "configref://") ||
      !reference(input.repository_reference, "registry://") ||
      !reference(input.version_reference, "gitref://") ||
      !reference(input.workroot_reference, "workroot://") ||
      ![input.id, input.name, input.owner_actor_id, input.correlation_id].every(
        nonempty,
      ) ||
      input.capabilities.length === 0 ||
      input.capabilities.some((item) => !HR_CAPABILITIES.includes(item))
    )
      throw new HrLaborError("INVALID_HR_SYSTEM");
    if (this.systems.has(input.id))
      throw new HrLaborError("HR_SYSTEM_ALREADY_EXISTS");
    const { actor, correlation_id, ...system } = input;
    const stored = freeze({
      ...system,
      capabilities: freeze([...system.capabilities]),
    });
    this.systems.set(stored.id, stored);
    this.emit(actor, correlation_id, "HR.SYSTEM_REGISTERED", stored.id, []);
    this.record(
      actor,
      correlation_id,
      "REGISTER_SYSTEM",
      stored.id,
      "HR_SYSTEM",
      [],
    );
    return stored;
  }

  getSystem(id: string): Readonly<HrSystemRegistration> {
    const system = this.systems.get(id);
    if (!system) throw new HrLaborError("HR_SYSTEM_NOT_FOUND");
    return system;
  }

  bindScope(
    input: HrScopeBinding & { actor: HrActor; correlation_id: string },
  ): Readonly<HrScopeBinding> {
    this.getSystem(input.system_id);
    if (
      input.actor.type !== "HUMAN" ||
      !reference(input.department_reference, "hr://departments/") ||
      !period(input.period) ||
      !nonempty(input.environment) ||
      !nonempty(input.project_id) ||
      !nonempty(input.correlation_id) ||
      !["HR_OPERATIONS", "LABOR_COMPLIANCE"].includes(input.purpose) ||
      input.source_reference !== `${input.department_reference}/${input.period}`
    )
      throw new HrLaborError("INVALID_HR_SCOPE");
    const { actor, correlation_id, ...scope } = input;
    const stored = freeze({ ...scope });
    this.scopes.set(this.scopeKey(scope), stored);
    this.emit(
      actor,
      correlation_id,
      "HR.SCOPE_BOUND",
      scope.system_id,
      [],
      scope.project_id,
    );
    this.record(
      actor,
      correlation_id,
      "BIND_SCOPE",
      scope.source_reference,
      scope.purpose === "LABOR_COMPLIANCE" ? "HR_STATUTORY" : "HR_OPERATIONS",
      [],
      "SUCCEEDED",
      undefined,
      scope.project_id,
      scope.system_id,
    );
    return stored;
  }

  registerLaborAgents(input: {
    actor: HrActor;
    agents: readonly LaborAgentRegistration[];
    correlation_id: string;
    system_id: string;
  }) {
    this.getSystem(input.system_id);
    const assignments = input.agents.map(({ assignment }) => assignment);
    const ids = input.agents.map(({ agent_id }) => agent_id);
    if (
      input.actor.type !== "HUMAN" ||
      !nonempty(input.correlation_id) ||
      input.agents.length !== 2 ||
      new Set(assignments).size !== 2 ||
      new Set(ids).size !== input.agents.length ||
      input.agents.some(
        (agent) =>
          !nonempty(agent.agent_id) ||
          !["AVAILABLE", "WORKING", "WAITING", "BLOCKED", "OFFLINE"].includes(
            agent.status,
          ) ||
          !this.sameCapabilities(
            agent.capabilities,
            LABOR_AGENT_CAPABILITIES[agent.assignment],
          ),
      )
    )
      throw new HrLaborError("INVALID_LABOR_AGENT_TEAM");
    const stored = freeze(
      input.agents.map((agent) =>
        freeze({ ...agent, capabilities: freeze([...agent.capabilities]) }),
      ),
    );
    this.agents.set(input.system_id, stored);
    this.emit(
      input.actor,
      input.correlation_id,
      "HR.LABOR_AGENTS_REGISTERED",
      input.system_id,
      [],
    );
    this.record(
      input.actor,
      input.correlation_id,
      "REGISTER_LABOR_AGENTS",
      input.system_id,
      "HR_SYSTEM",
      [],
    );
    return stored;
  }

  getLaborAgents(systemId: string) {
    const agents = this.agents.get(systemId);
    if (!agents) throw new HrLaborError("LABOR_AGENT_TEAM_NOT_FOUND");
    return [...agents];
  }

  async observeOperations(
    input: HrScopedInput & {
      max_age_ms: number;
      signal?: AbortSignal;
      timeout_ms: number;
      visibility: "HR" | "MANAGER";
    },
  ): Promise<Readonly<HrOperationalSnapshot>> {
    const { scope, system } = this.authorize(
      input,
      "READ_HR_OPERATIONS",
      "HR_OPERATIONS",
    );
    if (
      input.visibility === "HR" &&
      !this.privacy?.canReadEmployeeReferences({
        actor: input.actor,
        department_reference: input.department_reference,
        project_id: input.project_id,
        system_id: input.system_id,
      })
    ) {
      this.record(
        input.actor,
        input.correlation_id,
        "READ_EMPLOYEE_REFERENCES",
        scope.source_reference,
        "HR_OPERATIONS",
        [],
        "DENIED",
        "HR_REFERENCE_SCOPE_DENIED",
        input.project_id,
        input.system_id,
      );
      throw new HrLaborError("HR_REFERENCE_SCOPE_DENIED");
    }
    let value: HrOperationalSnapshot;
    try {
      value = await this.run(input, (signal) =>
        this.adapter.observeOperations({
          credential_reference: system.credential_reference,
          department_reference: input.department_reference,
          period: input.period,
          signal,
          source_reference: scope.source_reference,
          system_id: input.system_id,
        }),
      );
      this.validateOperations(value, input, scope, input.max_age_ms);
    } catch (error) {
      this.failure(
        input,
        "HR.OPERATIONS_FAILED",
        scope.source_reference,
        error,
      );
      throw error;
    }
    const employees =
      input.visibility === "HR"
        ? value.employee_references.map((item) =>
            freeze({
              attendance_reference: item.attendance_reference,
              department_reference: item.department_reference,
              document_references: freeze([...item.document_references]),
              employee_reference: item.employee_reference,
              employment_status_reference: item.employment_status_reference,
              ...(item.hr_case_reference
                ? { hr_case_reference: item.hr_case_reference }
                : {}),
              leave_reference: item.leave_reference,
              payroll_reference: item.payroll_reference,
              performance_reference: item.performance_reference,
              schedule_reference: item.schedule_reference,
            }),
          )
        : [];
    const stored = freeze({
      attendance_exceptions: value.attendance_exceptions,
      blocked_work: value.blocked_work,
      department_reference: value.department_reference,
      employee_references: freeze(employees),
      evidence_refs: freeze([...value.evidence_refs]),
      kpi_risks: value.kpi_risks,
      leave_conflicts: value.leave_conflicts,
      observed_at: value.observed_at,
      overdue_work: value.overdue_work,
      source_reference: value.source_reference,
      team_capacity: value.team_capacity,
      workload: value.workload,
    });
    this.operations.set(this.scopeKey(scope), stored);
    this.emit(
      input.actor,
      input.correlation_id,
      "HR.OPERATIONS_OBSERVED",
      input.system_id,
      stored.evidence_refs,
      input.project_id,
    );
    this.record(
      input.actor,
      input.correlation_id,
      "OBSERVE_OPERATIONS",
      scope.source_reference,
      "HR_OPERATIONS",
      stored.evidence_refs,
      "SUCCEEDED",
      undefined,
      input.project_id,
      input.system_id,
    );
    return stored;
  }

  readPrivateEmployeeData(
    input: HrScopedInput & { employee_reference: string },
  ): never {
    this.record(
      input.actor,
      input.correlation_id,
      "READ_PRIVATE_EMPLOYEE_DATA",
      input.employee_reference,
      "HR_OPERATIONS",
      [],
      "DENIED",
      "PRIVATE_EMPLOYEE_DATA_DENIED",
      input.project_id,
      input.system_id,
    );
    throw new HrLaborError("PRIVATE_EMPLOYEE_DATA_DENIED");
  }

  async observeStatutoryObligations(
    input: HrScopedInput & {
      max_age_ms: number;
      signal?: AbortSignal;
      timeout_ms: number;
    },
  ): Promise<Readonly<StatutorySnapshot>> {
    const { scope, system } = this.authorize(
      input,
      "READ_STATUTORY_OBLIGATIONS",
      "LABOR_COMPLIANCE",
    );
    let value: StatutorySnapshot;
    try {
      value = await this.run(input, (signal) =>
        this.adapter.observeStatutoryObligations({
          credential_reference: system.credential_reference,
          department_reference: input.department_reference,
          period: input.period,
          signal,
          source_reference: scope.source_reference,
          system_id: input.system_id,
        }),
      );
      this.validateObligations(value, scope, input.max_age_ms);
    } catch (error) {
      this.failure(
        input,
        "HR.STATUTORY_OBSERVATION_FAILED",
        scope.source_reference,
        error,
      );
      throw error;
    }
    const stored = freeze({
      evidence_refs: freeze([...value.evidence_refs]),
      observed_at: value.observed_at,
      obligations: freeze(
        value.obligations.map((item) =>
          freeze({
            ...(item.blocker ? { blocker: item.blocker } : {}),
            due_date: item.due_date,
            evidence_refs: freeze([...item.evidence_refs]),
            id: item.id,
            missing_data_refs: freeze([...item.missing_data_refs]),
            responsible_human_id: item.responsible_human_id,
            status: item.status,
            type: item.type,
          }),
        ),
      ),
      period: value.period,
      source_reference: value.source_reference,
    });
    this.obligations.set(this.scopeKey(scope), stored);
    this.emit(
      input.actor,
      input.correlation_id,
      "HR.STATUTORY_OBLIGATIONS_OBSERVED",
      input.system_id,
      stored.evidence_refs,
      input.project_id,
    );
    this.record(
      input.actor,
      input.correlation_id,
      "OBSERVE_STATUTORY_OBLIGATIONS",
      stored.source_reference,
      "HR_STATUTORY",
      stored.evidence_refs,
      "SUCCEEDED",
      undefined,
      input.project_id,
      input.system_id,
    );
    return stored;
  }

  createWork(
    input: HrScopedInput & {
      due_date: string;
      evidence_refs: readonly string[];
      responsible_human_id: string;
      source_references: readonly string[];
      type: HrLaborWorkType;
      work_id: string;
    },
  ): Readonly<HrLaborWork> {
    const { scope } = this.authorize(
      input,
      "PREPARE_HR_LABOR_WORK",
      purposeForWork(input.type),
    );
    if (
      this.works.has(input.work_id) ||
      !nonempty(input.work_id) ||
      !date(input.due_date) ||
      !nonempty(input.responsible_human_id) ||
      !WORK_TYPES.includes(input.type) ||
      input.source_references.length === 0 ||
      !input.source_references.includes(scope.source_reference) ||
      input.source_references.some(
        (item) =>
          item !== scope.source_reference &&
          !item.startsWith(`${scope.source_reference}/`),
      ) ||
      !this.validEvidence(input.evidence_refs)
    )
      throw new HrLaborError("INVALID_HR_LABOR_WORK");
    const stored = this.storeWork({
      department_reference: input.department_reference,
      due_date: input.due_date,
      environment: scope.environment,
      evidence_refs: freeze([...input.evidence_refs]),
      external_action_performed: false,
      id: input.work_id,
      period: input.period,
      project_id: input.project_id,
      responsible_human_id: input.responsible_human_id,
      source_references: freeze([...input.source_references]),
      status: "DRAFT",
      system_id: input.system_id,
      type: input.type,
      version: 1,
    });
    this.emit(
      input.actor,
      input.correlation_id,
      "HR.LABOR_WORK_CREATED",
      input.system_id,
      stored.evidence_refs,
      input.project_id,
      stored.id,
    );
    this.record(
      input.actor,
      input.correlation_id,
      "CREATE_HR_LABOR_WORK",
      stored.id,
      "HR_LABOR_WORK",
      stored.evidence_refs,
    );
    return stored;
  }

  recordAnalysis(input: {
    actor: HrActor;
    correlation_id: string;
    evidence_refs: readonly string[];
    project_id: string;
    source_references: readonly string[];
    work_id: string;
  }) {
    const work = this.work(input.work_id, input.project_id);
    this.requireAgent(work.system_id, input.actor, "ANALYSIS_DRAFT");
    if (
      work.status !== "DRAFT" ||
      !nonempty(input.correlation_id) ||
      input.source_references.length === 0 ||
      input.source_references.some(
        (reference) => !work.source_references.includes(reference),
      ) ||
      !this.validEvidence(input.evidence_refs)
    )
      throw new HrLaborError("INVALID_HR_LABOR_ANALYSIS");
    return this.transition(
      work,
      {
        analysis_actor_id: input.actor.id,
        evidence_refs: [...work.evidence_refs, ...input.evidence_refs],
        status: "ANALYZED",
      },
      input,
      "HR.ANALYSIS_RECORDED",
    );
  }

  createDraft(input: {
    actor: HrActor;
    correlation_id: string;
    draft_reference: string;
    evidence_refs: readonly string[];
    project_id: string;
    work_id: string;
  }) {
    const work = this.work(input.work_id, input.project_id);
    this.requireAgent(work.system_id, input.actor, "ANALYSIS_DRAFT");
    if (
      input.actor.id !== work.analysis_actor_id ||
      work.status !== "ANALYZED" ||
      !nonempty(input.correlation_id) ||
      !reference(input.draft_reference, "artifact://") ||
      !this.validEvidence(input.evidence_refs)
    )
      throw new HrLaborError("INVALID_HR_LABOR_DRAFT");
    return this.transition(
      work,
      {
        draft_reference: input.draft_reference,
        draft_version: work.version + 1,
        evidence_refs: [...work.evidence_refs, ...input.evidence_refs],
        status: "DRAFT_READY",
      },
      input,
      "HR.DRAFT_CREATED",
    );
  }

  recordComplianceReview(input: {
    actor: HrActor;
    correlation_id: string;
    evidence_refs: readonly string[];
    project_id: string;
    result: "PASS" | "REVISE";
    work_id: string;
  }) {
    const work = this.work(input.work_id, input.project_id);
    this.requireAgent(work.system_id, input.actor, "COMPLIANCE_REVIEW");
    if (
      input.actor.id === work.analysis_actor_id ||
      work.status !== "DRAFT_READY" ||
      !nonempty(input.correlation_id) ||
      !this.validEvidence(input.evidence_refs)
    )
      throw new HrLaborError("LABOR_COMPLIANCE_REVIEW_REQUIRED");
    return this.transition(
      work,
      {
        evidence_refs: [...work.evidence_refs, ...input.evidence_refs],
        review_actor_id: input.actor.id,
        status: input.result === "PASS" ? "HUMAN_REVIEW" : "BLOCKED",
      },
      input,
      "HR.COMPLIANCE_REVIEW_RECORDED",
    );
  }

  recordHumanReview(input: {
    actor: HrActor;
    correlation_id: string;
    evidence_refs: readonly string[];
    project_id: string;
    work_id: string;
  }) {
    const work = this.work(input.work_id, input.project_id);
    if (
      input.actor.type !== "HUMAN" ||
      input.actor.id !== work.responsible_human_id ||
      work.status !== "HUMAN_REVIEW" ||
      !nonempty(input.correlation_id) ||
      !this.validEvidence(input.evidence_refs)
    )
      throw new HrLaborError("HUMAN_HR_REVIEW_REQUIRED");
    return this.transition(
      work,
      {
        evidence_refs: [...work.evidence_refs, ...input.evidence_refs],
        human_review_actor_id: input.actor.id,
        status: "WAITING_APPROVAL",
      },
      input,
      "HR.HUMAN_REVIEW_RECORDED",
    );
  }

  recordHumanApproval(input: {
    actor: HrActor;
    approval_id: string;
    correlation_id: string;
    environment: string;
    evidence_refs: readonly string[];
    project_id: string;
    system_id: string;
    target_hash: string;
    target_version: number;
    work_id: string;
  }) {
    if (input.actor.type !== "HUMAN") {
      this.record(
        input.actor,
        input.correlation_id,
        "APPROVE_HR_LABOR_WORK",
        input.work_id,
        "HR_LABOR_WORK",
        input.evidence_refs,
        "DENIED",
        "HUMAN_HR_APPROVAL_REQUIRED",
        input.project_id,
        input.system_id,
      );
      throw new HrLaborError("HUMAN_HR_APPROVAL_REQUIRED");
    }
    const work = this.work(input.work_id, input.project_id);
    if (
      work.status !== "WAITING_APPROVAL" ||
      input.actor.id === work.human_review_actor_id ||
      !nonempty(input.approval_id) ||
      !nonempty(input.correlation_id) ||
      input.system_id !== work.system_id ||
      input.environment !== work.environment ||
      input.target_hash !== this.targetHash(work.id) ||
      input.target_version !== work.draft_version ||
      !this.validEvidence(input.evidence_refs)
    ) {
      this.record(
        input.actor,
        input.correlation_id,
        "APPROVE_HR_LABOR_WORK",
        input.work_id,
        "HR_LABOR_WORK",
        input.evidence_refs,
        "DENIED",
        "INVALID_HR_LABOR_APPROVAL",
        input.project_id,
        input.system_id,
      );
      throw new HrLaborError("INVALID_HR_LABOR_APPROVAL");
    }
    const decision = this.approval?.evaluate({
      actor: input.actor,
      approval_id: input.approval_id,
      target: {
        action: "PREPARE_HR_LABOR_EXTERNAL_ACTION",
        environment: input.environment,
        hash: input.target_hash,
        project_id: input.project_id,
        system_id: input.system_id,
        version: input.target_version,
        work_id: input.work_id,
      },
    });
    if (
      !decision?.allowed ||
      decision.approval_id !== input.approval_id ||
      decision.authority !== "AUTHORIZED" ||
      decision.status !== "APPROVED" ||
      decision.validity !== "VALID"
    ) {
      this.record(
        input.actor,
        input.correlation_id,
        "APPROVE_HR_LABOR_WORK",
        input.work_id,
        "HR_LABOR_WORK",
        input.evidence_refs,
        "DENIED",
        "INVALID_HR_LABOR_APPROVAL",
        input.project_id,
        input.system_id,
      );
      throw new HrLaborError("INVALID_HR_LABOR_APPROVAL");
    }
    return this.transition(
      work,
      {
        approval_id: decision.approval_id,
        evidence_refs: [...work.evidence_refs, ...input.evidence_refs],
        status: "READY_FOR_EXTERNAL_ACTION",
      },
      { ...input, evidence_refs: input.evidence_refs },
      "HR.HUMAN_APPROVAL_RECORDED",
    );
  }

  requestExternalAction(
    input: HrScopedInput & {
      action:
        | "DOLE_SUBMISSION"
        | "SSS_SUBMISSION"
        | "PHILHEALTH_SUBMISSION"
        | "PAG_IBIG_SUBMISSION"
        | "STATUTORY_PAYMENT"
        | "DISCIPLINARY_ACTION"
        | "TERMINATION"
        | "HIRING_DECISION";
      work_id: string;
    },
  ): never {
    this.record(
      input.actor,
      input.correlation_id,
      input.action,
      input.work_id,
      "HR_EXTERNAL_ACTION",
      [],
      "DENIED",
      undefined,
      input.project_id,
      input.system_id,
    );
    throw new HrLaborError("HR_EXTERNAL_ACTION_FORBIDDEN_PHASE_9");
  }

  targetHash(workId: string): string {
    const work = this.getWork(workId);
    return createHash("sha256")
      .update(
        JSON.stringify({
          department_reference: work.department_reference,
          draft_reference: work.draft_reference,
          draft_version: work.draft_version,
          environment: work.environment,
          id: work.id,
          period: work.period,
          project_id: work.project_id,
          source_references: work.source_references,
          system_id: work.system_id,
          type: work.type,
        }),
      )
      .digest("hex");
  }

  managementProjection(input: {
    actor: HrActor;
    correlation_id: string;
    manager_scope_allowed: boolean;
    project_id: string;
    system_id: string;
  }) {
    if (
      input.actor.type !== "HUMAN" ||
      !input.manager_scope_allowed ||
      !nonempty(input.correlation_id) ||
      !nonempty(input.project_id)
    )
      throw new HrLaborError("HR_MANAGER_SCOPE_DENIED");
    const prefix = `${input.system_id}:${input.project_id}:`;
    const snapshots = [...this.operations.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value);
    const obligations = [...this.obligations.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .flatMap(([, value]) => value.obligations);
    const works = [...this.works.values()].filter(
      (work) =>
        work.system_id === input.system_id &&
        work.project_id === input.project_id,
    );
    const sum = (
      key:
        | "attendance_exceptions"
        | "blocked_work"
        | "kpi_risks"
        | "leave_conflicts"
        | "overdue_work",
    ) => snapshots.reduce((total, item) => total + item[key], 0);
    const nextDeadline = obligations
      .filter(({ status }) => status !== "COMPLETED")
      .map(({ due_date }) => due_date)
      .sort()[0];
    const projection = freeze({
      attendance_exceptions: sum("attendance_exceptions"),
      blocked_approvals: works.filter(
        ({ status }) => status === "WAITING_APPROVAL",
      ).length,
      blocked_items:
        sum("blocked_work") +
        obligations.filter(({ status }) => status === "BLOCKED").length +
        works.filter(({ status }) => status === "BLOCKED").length,
      deadline_risks: obligations.filter(
        ({ due_date, status }) =>
          status !== "COMPLETED" &&
          Date.parse(`${due_date}T23:59:59Z`) - this.now().getTime() <=
            7 * 86_400_000,
      ).length,
      hr_health: this.getSystem(input.system_id).health,
      kpi_risks: sum("kpi_risks"),
      last_verified_at:
        snapshots
          .map(({ observed_at }) => observed_at)
          .sort()
          .at(-1) ?? "UNKNOWN",
      leave_conflicts: sum("leave_conflicts"),
      next_deadline: nextDeadline ?? "NONE",
      open_obligations: obligations.filter(
        ({ status }) => status !== "COMPLETED",
      ).length,
      overdue_work: sum("overdue_work"),
      production_external_actions_enabled: false as const,
      team_capacity: snapshots.at(-1)?.team_capacity ?? "UNKNOWN",
      workload: snapshots.at(-1)?.workload ?? "UNKNOWN",
    });
    this.record(
      input.actor,
      input.correlation_id,
      "READ_HR_MANAGEMENT_PROJECTION",
      input.system_id,
      "HR_SYSTEM",
      [],
      "SUCCEEDED",
      undefined,
      input.project_id,
      input.system_id,
    );
    return projection;
  }

  readiness() {
    const systems = [...this.systems.values()];
    return freeze({
      adapter_mode: this.adapter.mode,
      registered_systems: systems.length,
      status:
        systems.length === 0
          ? "NOT_READY"
          : systems.every(({ health }) => health === "HEALTHY")
            ? "READY"
            : "DEGRADED",
    });
  }

  events(): readonly Readonly<HrLaborEvent>[] {
    return [...this.eventLog];
  }

  getWork(id: string): Readonly<HrLaborWork> {
    const work = this.works.get(id);
    if (!work) throw new HrLaborError("HR_LABOR_WORK_NOT_FOUND");
    return work;
  }

  private authorize(
    input: HrScopedInput,
    capability: HrCapability,
    expectedPurpose: HrScopeBinding["purpose"],
  ) {
    const system = this.systems.get(input.system_id);
    const scope = this.scopes.get(
      this.scopeKey({
        department_reference: input.department_reference,
        period: input.period,
        project_id: input.project_id,
        purpose: input.purpose,
        system_id: input.system_id,
      }),
    );
    const errorCode = !input.permission_allowed
      ? "HR_PERMISSION_DENIED"
      : !system ||
          !scope ||
          input.purpose !== expectedPurpose ||
          !nonempty(input.correlation_id) ||
          !system.capabilities.includes(capability)
        ? "HR_SCOPE_DENIED"
        : undefined;
    if (errorCode) {
      this.record(
        input.actor,
        input.correlation_id,
        `AUTHORIZE_${capability}`,
        input.system_id,
        "HR_SYSTEM",
        [],
        "DENIED",
        errorCode,
        input.project_id,
        input.system_id,
      );
      throw new HrLaborError(errorCode);
    }
    if (!scope || !system) throw new HrLaborError("HR_SCOPE_DENIED");
    return { scope, system };
  }

  private validateOperations(
    value: HrOperationalSnapshot,
    input: HrScopedInput,
    scope: HrScopeBinding,
    maxAgeMs: number,
  ) {
    this.validateFresh(value.observed_at, maxAgeMs);
    if (
      value.department_reference !== input.department_reference ||
      value.source_reference !== scope.source_reference ||
      !this.validEvidence(value.evidence_refs) ||
      !countsValid([
        value.attendance_exceptions,
        value.blocked_work,
        value.kpi_risks,
        value.leave_conflicts,
        value.overdue_work,
      ]) ||
      !["AVAILABLE", "BALANCED", "CONSTRAINED", "UNKNOWN"].includes(
        value.team_capacity,
      ) ||
      !["LOW", "BALANCED", "HIGH", "UNKNOWN"].includes(value.workload) ||
      value.employee_references.some(
        (item) =>
          item.department_reference !== input.department_reference ||
          !reference(item.employee_reference, "hr://employees/") ||
          !reference(item.employment_status_reference, "hr://employment/") ||
          !reference(item.schedule_reference, "hr://schedules/") ||
          !reference(item.attendance_reference, "hr://attendance/") ||
          !reference(item.leave_reference, "hr://leave/") ||
          !reference(item.payroll_reference, "hr://payroll/") ||
          !reference(item.performance_reference, "hr://performance/") ||
          (item.hr_case_reference !== undefined &&
            !reference(item.hr_case_reference, "hr://cases/")) ||
          item.document_references.some(
            (document) => !reference(document, "hr://documents/"),
          ),
      )
    )
      throw new HrLaborError("INVALID_HR_OPERATIONAL_SNAPSHOT");
  }

  private validateObligations(
    value: StatutorySnapshot,
    scope: HrScopeBinding,
    maxAgeMs: number,
  ) {
    this.validateFresh(value.observed_at, maxAgeMs);
    if (
      value.period !== scope.period ||
      value.source_reference !== `${scope.source_reference}/statutory` ||
      !this.validEvidence(value.evidence_refs) ||
      new Set(value.obligations.map(({ id }) => id)).size !==
        value.obligations.length ||
      value.obligations.some(
        (item) =>
          !nonempty(item.id) ||
          !STATUTORY_TYPES.includes(item.type) ||
          !date(item.due_date) ||
          !nonempty(item.responsible_human_id) ||
          !["OPEN", "IN_REVIEW", "BLOCKED", "READY", "COMPLETED"].includes(
            item.status,
          ) ||
          !this.validEvidence(item.evidence_refs) ||
          item.missing_data_refs.some(
            (missingDataRef) =>
              !missingDataRef.startsWith(`${value.source_reference}/`),
          ),
      )
    )
      throw new HrLaborError("INVALID_HR_STATUTORY_SNAPSHOT");
  }

  private validateFresh(observedAt: string, maxAgeMs: number) {
    if (
      !Number.isSafeInteger(maxAgeMs) ||
      maxAgeMs < 1 ||
      !date(observedAt) ||
      this.now().getTime() - Date.parse(observedAt) > maxAgeMs
    )
      throw new HrLaborError("HR_DATA_STALE");
  }

  private async run<T>(
    input: { signal?: AbortSignal; timeout_ms: number },
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (!Number.isSafeInteger(input.timeout_ms) || input.timeout_ms < 1)
      throw new HrLaborError("INVALID_HR_TIMEOUT");
    if (input.signal?.aborted) throw new HrLaborError("HR_REQUEST_CANCELLED");
    const controller = new AbortController();
    let code = "HR_REQUEST_CANCELLED";
    const cancel = () => controller.abort();
    input.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      code = "HR_REQUEST_TIMED_OUT";
      controller.abort();
    }, input.timeout_ms);
    try {
      const aborted = new Promise<never>((_resolve, reject) =>
        controller.signal.addEventListener(
          "abort",
          () => reject(new HrLaborError(code)),
          { once: true },
        ),
      );
      return await Promise.race([operation(controller.signal), aborted]);
    } catch (error) {
      if (error instanceof HrLaborError) throw error;
      if (controller.signal.aborted) throw new HrLaborError(code);
      throw new HrLaborError("HR_SOURCE_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", cancel);
    }
  }

  private requireAgent(
    systemId: string,
    actor: HrActor,
    assignment: LaborAgentAssignment,
  ) {
    const agent = this.getLaborAgents(systemId).find(
      ({ agent_id }) => agent_id === actor.id,
    );
    if (
      actor.type !== "AGENT" ||
      !agent ||
      agent.assignment !== assignment ||
      !["AVAILABLE", "WORKING"].includes(agent.status)
    )
      throw new HrLaborError("LABOR_AGENT_NOT_ASSIGNED");
  }

  private work(id: string, projectId: string) {
    const work = this.getWork(id);
    if (work.project_id !== projectId)
      throw new HrLaborError("HR_SCOPE_DENIED");
    return work;
  }

  private transition(
    work: Readonly<HrLaborWork>,
    changes: Partial<HrLaborWork>,
    input: {
      actor: HrActor;
      correlation_id: string;
      evidence_refs?: readonly string[];
      project_id: string;
      work_id: string;
    },
    eventName: string,
  ) {
    const stored = this.storeWork({
      ...work,
      ...changes,
      version: work.version + 1,
    });
    const evidence = input.evidence_refs ?? [];
    this.emit(
      input.actor,
      input.correlation_id,
      eventName,
      work.system_id,
      evidence,
      input.project_id,
      work.id,
    );
    this.record(
      input.actor,
      input.correlation_id,
      eventName,
      work.id,
      "HR_LABOR_WORK",
      evidence,
    );
    return stored;
  }

  private storeWork(work: HrLaborWork) {
    const stored = freeze({
      ...work,
      evidence_refs: freeze([...work.evidence_refs]),
      source_references: freeze([...work.source_references]),
    });
    this.works.set(stored.id, stored);
    return stored;
  }

  private scopeKey(scope: {
    department_reference: string;
    period: string;
    project_id: string;
    purpose: string;
    system_id: string;
  }) {
    return `${scope.system_id}:${scope.project_id}:${scope.department_reference}:${scope.period}:${scope.purpose}`;
  }

  private sameCapabilities(
    actual: readonly string[],
    expected: readonly string[],
  ) {
    return (
      actual.length === expected.length &&
      expected.every((capability) => actual.includes(capability))
    );
  }

  private validEvidence(values: readonly string[]) {
    return (
      values.length > 0 &&
      values.every((item) => reference(item, "evidence://"))
    );
  }

  private failure(
    input: HrScopedInput,
    eventName: string,
    targetId: string,
    error: unknown,
  ) {
    const errorCode =
      error instanceof HrLaborError ? error.code : "HR_SOURCE_UNAVAILABLE";
    this.emit(
      input.actor,
      input.correlation_id,
      eventName,
      input.system_id,
      [],
      input.project_id,
      undefined,
      errorCode,
    );
    this.record(
      input.actor,
      input.correlation_id,
      eventName,
      targetId,
      "HR_SYSTEM",
      [],
      "FAILED",
      errorCode,
      input.project_id,
      input.system_id,
    );
  }

  private emit(
    actor: HrActor,
    correlationId: string,
    name: string,
    systemId: string,
    evidenceRefs: readonly string[],
    projectId?: string,
    workId?: string,
    errorCode?: string,
  ) {
    const event = freeze({
      actor: freeze({ ...actor }),
      correlation_id: correlationId,
      evidence_refs: freeze([...evidenceRefs]),
      ...(errorCode ? { error_code: errorCode } : {}),
      name,
      occurred_at: this.now().toISOString(),
      ...(projectId ? { project_id: projectId } : {}),
      system_id: systemId,
      ...(workId ? { work_id: workId } : {}),
    });
    this.eventLog.push(event);
    this.onEvent?.(event);
  }

  private record(
    actor: HrActor,
    correlationId: string,
    action: string,
    id: string,
    type: HrLaborAuditRecord["target"]["type"],
    evidenceRefs: readonly string[],
    result: HrLaborAuditRecord["result"] = "SUCCEEDED",
    errorCode?: string,
    projectId?: string,
    systemId?: string,
  ) {
    const work = this.works.get(id);
    const resolvedProjectId = projectId ?? work?.project_id;
    const resolvedSystemId = systemId ?? work?.system_id;
    this.audit?.record(
      freeze({
        action,
        actor: freeze({ ...actor }),
        correlation_id: correlationId,
        evidence_refs: freeze([...evidenceRefs]),
        ...(errorCode ? { error_code: errorCode } : {}),
        ...(resolvedProjectId ? { project_id: resolvedProjectId } : {}),
        result,
        ...(resolvedSystemId
          ? { system_id: resolvedSystemId }
          : type === "HR_SYSTEM"
            ? { system_id: id }
            : {}),
        target: freeze({ id, type }),
      }),
    );
  }
}
