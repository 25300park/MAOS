import { createHash } from "node:crypto";
import type { ActorType, GovernanceDecision } from "@maos/contracts";

export const ACCOUNTING_TAX_ROLES = [
  "FINANCE_COMPLIANCE_LEAD",
  "PH_ACCOUNTING_AGENT",
  "PH_TAX_AGENT",
  "PAYROLL_STATUTORY_AGENT",
  "COMPLIANCE_QA_AGENT",
] as const;
export type AccountingTaxRole = (typeof ACCOUNTING_TAX_ROLES)[number];
export type ErpCapability =
  "READ_FINANCE_SUMMARY" | "READ_OBLIGATIONS" | "PREPARE_COMPLIANCE_WORK";
export type ErpHealth =
  "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "MAINTENANCE" | "UNKNOWN";
export type ComplianceWorkType =
  "VAT" | "EWT_CWT" | "INCOME_TAX" | "STATUTORY" | "PAYROLL_STATUTORY";
export type ComplianceWorkStatus =
  | "DRAFT"
  | "ANALYZED"
  | "DRAFT_READY"
  | "HUMAN_REVIEW"
  | "WAITING_APPROVAL"
  | "READY_FOR_EXTERNAL_ACTION"
  | "BLOCKED";

export interface ErpActor {
  id: string;
  type: ActorType;
}
export interface ErpSystemRegistration {
  capabilities: readonly ErpCapability[];
  credential_reference: string;
  environment_reference: string;
  health: ErpHealth;
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
export interface MoneySummary {
  currency: string;
  total: number;
}
export interface FinanceSummary {
  accounting_period: string;
  account_references: readonly string[];
  cash_summary: MoneySummary;
  evidence_refs: readonly string[];
  observed_at: string;
  payable_summary: MoneySummary;
  receivable_summary: MoneySummary;
  source_record_references: readonly string[];
  tax_relevant_totals: readonly {
    code: string;
    currency: string;
    total: number;
  }[];
}
export interface ComplianceObligation {
  blocker?: string;
  due_date: string;
  evidence_refs: readonly string[];
  id: string;
  missing_data: readonly string[];
  responsible_human_id: string;
  status: "OPEN" | "IN_REVIEW" | "BLOCKED" | "READY" | "COMPLETED";
  type: ComplianceWorkType;
}
export interface ObligationSnapshot {
  evidence_refs: readonly string[];
  observed_at: string;
  obligations: readonly ComplianceObligation[];
  period: string;
  source_reference: string;
}
export interface ErpAccountingTaxAdapter {
  readonly mode: "GOVERNED_REFERENCE_ONLY";
  observeFinance(input: {
    accounting_period: string;
    credential_reference: string;
    signal: AbortSignal;
    source_reference: string;
    system_id: string;
  }): Promise<FinanceSummary>;
  observeObligations(input: {
    accounting_period: string;
    credential_reference: string;
    signal: AbortSignal;
    source_reference: string;
    system_id: string;
  }): Promise<ObligationSnapshot>;
}
export interface AccountingTaxTeamMember {
  agent_id: string;
  assignment_state: "UNASSIGNED" | "ASSIGNED";
  capabilities: readonly ("ANALYZE" | "DRAFT" | "REVIEW")[];
  role: AccountingTaxRole;
  status: "AVAILABLE" | "WORKING" | "WAITING" | "BLOCKED" | "OFFLINE";
}
export const ACCOUNTING_TAX_ROLE_CAPABILITIES: Readonly<
  Record<AccountingTaxRole, readonly ("ANALYZE" | "DRAFT" | "REVIEW")[]>
> = {
  FINANCE_COMPLIANCE_LEAD: ["REVIEW"],
  PH_ACCOUNTING_AGENT: ["ANALYZE", "DRAFT"],
  PH_TAX_AGENT: ["ANALYZE", "DRAFT"],
  PAYROLL_STATUTORY_AGENT: ["ANALYZE", "DRAFT"],
  COMPLIANCE_QA_AGENT: ["REVIEW"],
};
export interface AccountingTaxTeam {
  members: readonly Readonly<AccountingTaxTeamMember>[];
  system_id: string;
}
export interface ComplianceWork {
  accounting_period: string;
  analysis_actor_id?: string;
  approval_id?: string;
  draft_reference?: string;
  draft_version?: number;
  due_date: string;
  evidence_refs: readonly string[];
  external_action_performed: false;
  id: string;
  project_id: string;
  qa_actor_id?: string;
  responsible_human_id: string;
  review_actor_id?: string;
  source_references: readonly string[];
  status: ComplianceWorkStatus;
  system_id: string;
  environment: string;
  type: ComplianceWorkType;
  version: number;
}
export interface ErpIntegrationEvent {
  actor: ErpActor;
  correlation_id: string;
  evidence_refs: readonly string[];
  error_code?: string;
  name: string;
  occurred_at: string;
  project_id?: string;
  system_id: string;
  work_id?: string;
}
export interface ErpAuditRecord {
  action: string;
  actor: ErpActor;
  correlation_id: string;
  evidence_refs: readonly string[];
  error_code?: string;
  project_id?: string;
  result: "SUCCEEDED" | "FAILED" | "DENIED";
  system_id?: string;
  target: {
    id: string;
    type:
      | "ERP_SYSTEM"
      | "ERP_FINANCE"
      | "ERP_OBLIGATION"
      | "COMPLIANCE_WORK"
      | "EXTERNAL_ACTION";
  };
}
export interface ErpAuditPort {
  record(record: ErpAuditRecord): void;
}
export interface ErpApprovalPort {
  evaluate(input: {
    actor: ErpActor;
    approval_id: string;
    target: {
      action: "PREPARE_EXTERNAL_ACCOUNTING_TAX_ACTION";
      environment: string;
      hash: string;
      project_id: string;
      system_id: string;
      version: number;
      work_id: string;
    };
  }): GovernanceDecision;
}

interface ScopeBinding {
  accounting_period: string;
  environment: string;
  project_id: string;
  source_reference: string;
  system_id: string;
}
interface ScopedInput {
  accounting_period: string;
  actor: ErpActor;
  correlation_id: string;
  permission_allowed: boolean;
  project_id: string;
  system_id: string;
}

export class ErpAccountingTaxError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ErpAccountingTaxError";
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
const validMoney = (value: MoneySummary) =>
  nonempty(value.currency) && Number.isFinite(value.total);
const WORK_TYPES: readonly ComplianceWorkType[] = [
  "VAT",
  "EWT_CWT",
  "INCOME_TAX",
  "STATUTORY",
  "PAYROLL_STATUTORY",
];

export class ErpAccountingTaxService {
  private readonly systems = new Map<string, Readonly<ErpSystemRegistration>>();
  private readonly scopes = new Map<string, Readonly<ScopeBinding>>();
  private readonly teams = new Map<string, Readonly<AccountingTaxTeam>>();
  private readonly finance = new Map<string, Readonly<FinanceSummary>>();
  private readonly obligations = new Map<
    string,
    Readonly<ObligationSnapshot>
  >();
  private readonly works = new Map<string, Readonly<ComplianceWork>>();
  private readonly eventLog: Readonly<ErpIntegrationEvent>[] = [];
  private readonly failureScopes = new Set<string>();

  constructor(
    private readonly adapter: ErpAccountingTaxAdapter,
    private readonly now: () => Date = () => new Date(),
    private readonly onEvent?: (event: ErpIntegrationEvent) => void,
    private readonly audit?: ErpAuditPort,
    private readonly approval?: ErpApprovalPort,
  ) {
    if (adapter.mode !== "GOVERNED_REFERENCE_ONLY")
      throw new ErpAccountingTaxError("ERP_SAFE_ADAPTER_REQUIRED");
  }

  registerSystem(
    input: ErpSystemRegistration & { actor: ErpActor; correlation_id: string },
  ): Readonly<ErpSystemRegistration> {
    if (
      input.actor.type !== "HUMAN" ||
      input.type !== "DOMAIN_APPLICATION" ||
      input.source_of_truth !== "DOMAIN_SYSTEM"
    )
      throw new ErpAccountingTaxError("ERP_DOMAIN_OWNERSHIP_REQUIRED");
    if (!reference(input.credential_reference, "secretref://"))
      throw new ErpAccountingTaxError("INVALID_ERP_CREDENTIAL_REFERENCE");
    if (
      !reference(input.environment_reference, "configref://") ||
      !reference(input.repository_reference, "registry://") ||
      !reference(input.version_reference, "gitref://") ||
      !reference(input.workroot_reference, "workroot://") ||
      ![input.id, input.name, input.owner_actor_id, input.correlation_id].every(
        nonempty,
      ) ||
      input.capabilities.length === 0 ||
      input.capabilities.some(
        (capability) =>
          ![
            "READ_FINANCE_SUMMARY",
            "READ_OBLIGATIONS",
            "PREPARE_COMPLIANCE_WORK",
          ].includes(capability),
      )
    )
      throw new ErpAccountingTaxError("INVALID_ERP_SYSTEM");
    if (this.systems.has(input.id))
      throw new ErpAccountingTaxError("ERP_SYSTEM_ALREADY_EXISTS");
    const { actor, correlation_id, ...value } = input;
    const stored = freeze({
      ...value,
      capabilities: freeze([...value.capabilities]),
    });
    this.systems.set(stored.id, stored);
    this.emit(actor, correlation_id, "ERP.SYSTEM_REGISTERED", stored.id, []);
    this.record(
      actor,
      correlation_id,
      "REGISTER_SYSTEM",
      stored.id,
      "ERP_SYSTEM",
      [],
    );
    return stored;
  }

  getSystem(id: string): Readonly<ErpSystemRegistration> {
    const system = this.systems.get(id);
    if (!system) throw new ErpAccountingTaxError("ERP_SYSTEM_NOT_FOUND");
    return system;
  }

  bindScope(input: ScopeBinding & { actor: ErpActor; correlation_id: string }) {
    this.getSystem(input.system_id);
    if (
      input.actor.type !== "HUMAN" ||
      !period(input.accounting_period) ||
      !nonempty(input.environment) ||
      !nonempty(input.project_id) ||
      !nonempty(input.correlation_id) ||
      input.source_reference !== `erp://periods/${input.accounting_period}`
    )
      throw new ErpAccountingTaxError("INVALID_ERP_SCOPE");
    const { actor, correlation_id, ...value } = input;
    const stored = freeze({ ...value });
    this.scopes.set(
      this.scopeKey(value.system_id, value.project_id, value.accounting_period),
      stored,
    );
    this.emit(
      actor,
      correlation_id,
      "ERP.SCOPE_BOUND",
      value.system_id,
      [],
      value.project_id,
    );
    return stored;
  }

  registerTeam(input: {
    actor: ErpActor;
    correlation_id: string;
    members: readonly AccountingTaxTeamMember[];
    system_id: string;
  }): Readonly<AccountingTaxTeam> {
    this.getSystem(input.system_id);
    const roles = input.members.map(({ role }) => role);
    const agentIds = input.members.map(({ agent_id }) => agent_id);
    if (
      input.actor.type !== "HUMAN" ||
      !nonempty(input.correlation_id) ||
      input.members.length !== ACCOUNTING_TAX_ROLES.length ||
      new Set(roles).size !== ACCOUNTING_TAX_ROLES.length ||
      new Set(agentIds).size !== input.members.length ||
      ACCOUNTING_TAX_ROLES.some((role) => !roles.includes(role)) ||
      input.members.some(
        (member) =>
          !nonempty(member.agent_id) ||
          !["UNASSIGNED", "ASSIGNED"].includes(member.assignment_state) ||
          !["AVAILABLE", "WORKING", "WAITING", "BLOCKED", "OFFLINE"].includes(
            member.status,
          ) ||
          member.capabilities.length === 0 ||
          member.capabilities.some(
            (capability) =>
              !["ANALYZE", "DRAFT", "REVIEW"].includes(capability),
          ) ||
          !this.sameCapabilities(
            member.capabilities,
            ACCOUNTING_TAX_ROLE_CAPABILITIES[member.role],
          ),
      )
    )
      throw new ErpAccountingTaxError("INVALID_ACCOUNTING_TAX_TEAM");
    const stored = freeze({
      members: freeze(
        input.members.map((member) =>
          freeze({ ...member, capabilities: freeze([...member.capabilities]) }),
        ),
      ),
      system_id: input.system_id,
    });
    this.teams.set(input.system_id, stored);
    this.emit(
      input.actor,
      input.correlation_id,
      "ERP.ACCOUNTING_TAX_TEAM_REGISTERED",
      input.system_id,
      [],
    );
    this.record(
      input.actor,
      input.correlation_id,
      "REGISTER_ACCOUNTING_TAX_TEAM",
      input.system_id,
      "ERP_SYSTEM",
      [],
    );
    return stored;
  }

  getTeam(systemId: string): Readonly<AccountingTaxTeam> {
    const team = this.teams.get(systemId);
    if (!team) throw new ErpAccountingTaxError("ACCOUNTING_TAX_TEAM_NOT_FOUND");
    return team;
  }

  async observeFinance(
    input: ScopedInput & {
      max_age_ms: number;
      signal?: AbortSignal;
      timeout_ms: number;
    },
  ): Promise<Readonly<FinanceSummary>> {
    const { scope, system } = this.authorize(input, "READ_FINANCE_SUMMARY");
    let value: FinanceSummary;
    try {
      value = await this.run(input, (signal) =>
        this.adapter.observeFinance({
          accounting_period: input.accounting_period,
          credential_reference: system.credential_reference,
          signal,
          source_reference: scope.source_reference,
          system_id: input.system_id,
        }),
      );
      this.validateFinance(value, input, scope, input.max_age_ms);
      this.failureScopes.delete(
        `${this.scopeKey(input.system_id, input.project_id, input.accounting_period)}:FINANCE`,
      );
    } catch (error) {
      this.recordFailure(
        input,
        "ERP.FINANCE_SUMMARY_FAILED",
        scope.source_reference,
        error,
        "FINANCE",
      );
      throw error;
    }
    const stored = freeze({
      accounting_period: value.accounting_period,
      account_references: freeze([...value.account_references]),
      cash_summary: freeze({ ...value.cash_summary }),
      evidence_refs: freeze([...value.evidence_refs]),
      observed_at: value.observed_at,
      payable_summary: freeze({ ...value.payable_summary }),
      receivable_summary: freeze({ ...value.receivable_summary }),
      source_record_references: freeze([...value.source_record_references]),
      tax_relevant_totals: freeze(
        value.tax_relevant_totals.map((item) => freeze({ ...item })),
      ),
    });
    this.finance.set(
      this.scopeKey(input.system_id, input.project_id, input.accounting_period),
      stored,
    );
    this.emit(
      input.actor,
      input.correlation_id,
      "ERP.FINANCE_SUMMARY_OBSERVED",
      input.system_id,
      stored.evidence_refs,
      input.project_id,
    );
    this.record(
      input.actor,
      input.correlation_id,
      "OBSERVE_FINANCE_SUMMARY",
      scope.source_reference,
      "ERP_FINANCE",
      stored.evidence_refs,
      "SUCCEEDED",
      undefined,
      input.project_id,
      input.system_id,
    );
    return stored;
  }

  async observeObligations(
    input: ScopedInput & {
      max_age_ms: number;
      signal?: AbortSignal;
      timeout_ms: number;
    },
  ): Promise<Readonly<ObligationSnapshot>> {
    const { scope, system } = this.authorize(input, "READ_OBLIGATIONS");
    let value: ObligationSnapshot;
    try {
      value = await this.run(input, (signal) =>
        this.adapter.observeObligations({
          accounting_period: input.accounting_period,
          credential_reference: system.credential_reference,
          signal,
          source_reference: scope.source_reference,
          system_id: input.system_id,
        }),
      );
      this.validateObligations(value, input, scope, input.max_age_ms);
      this.failureScopes.delete(
        `${this.scopeKey(input.system_id, input.project_id, input.accounting_period)}:OBLIGATIONS`,
      );
    } catch (error) {
      this.recordFailure(
        input,
        "ERP.OBLIGATIONS_FAILED",
        scope.source_reference,
        error,
        "OBLIGATIONS",
      );
      throw error;
    }
    const stored = freeze({
      evidence_refs: freeze([...value.evidence_refs]),
      observed_at: value.observed_at,
      obligations: freeze(
        value.obligations.map((item) =>
          freeze({
            ...item,
            evidence_refs: freeze([...item.evidence_refs]),
            missing_data: freeze([...item.missing_data]),
          }),
        ),
      ),
      period: value.period,
      source_reference: value.source_reference,
    });
    this.obligations.set(
      this.scopeKey(input.system_id, input.project_id, input.accounting_period),
      stored,
    );
    this.emit(
      input.actor,
      input.correlation_id,
      "ERP.OBLIGATIONS_OBSERVED",
      input.system_id,
      stored.evidence_refs,
      input.project_id,
    );
    this.record(
      input.actor,
      input.correlation_id,
      "OBSERVE_OBLIGATIONS",
      stored.source_reference,
      "ERP_OBLIGATION",
      stored.evidence_refs,
      "SUCCEEDED",
      undefined,
      input.project_id,
      input.system_id,
    );
    return stored;
  }

  createComplianceWork(
    input: ScopedInput & {
      due_date: string;
      evidence_refs: readonly string[];
      responsible_human_id: string;
      source_references: readonly string[];
      type: ComplianceWorkType;
      work_id: string;
    },
  ): Readonly<ComplianceWork> {
    const { scope } = this.authorize(input, "PREPARE_COMPLIANCE_WORK");
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
          !item.startsWith(`erp://periods/${input.accounting_period}/`),
      ) ||
      !this.validEvidence(input.evidence_refs)
    )
      throw new ErpAccountingTaxError("INVALID_COMPLIANCE_WORK");
    const stored = this.storeWork({
      accounting_period: input.accounting_period,
      environment: scope.environment,
      due_date: input.due_date,
      evidence_refs: freeze([...input.evidence_refs]),
      external_action_performed: false,
      id: input.work_id,
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
      "ERP.COMPLIANCE_WORK_CREATED",
      input.system_id,
      stored.evidence_refs,
      input.project_id,
      stored.id,
    );
    this.record(
      input.actor,
      input.correlation_id,
      "CREATE_COMPLIANCE_WORK",
      stored.id,
      "COMPLIANCE_WORK",
      stored.evidence_refs,
    );
    return stored;
  }

  recordAnalysis(input: {
    actor: ErpActor;
    calculation_input_refs: readonly string[];
    correlation_id: string;
    evidence_refs: readonly string[];
    project_id: string;
    role: AccountingTaxRole;
    work_id: string;
  }) {
    const work = this.work(input.work_id, input.project_id);
    this.requireMember(work.system_id, input.actor, input.role, "ANALYZE");
    if (
      input.actor.type !== "AGENT" ||
      !nonempty(input.correlation_id) ||
      ![
        "PH_ACCOUNTING_AGENT",
        "PH_TAX_AGENT",
        "PAYROLL_STATUTORY_AGENT",
      ].includes(input.role) ||
      work.status !== "DRAFT" ||
      input.calculation_input_refs.length === 0 ||
      input.calculation_input_refs.some(
        (item) => !work.source_references.includes(item),
      ) ||
      !this.validEvidence(input.evidence_refs)
    )
      throw new ErpAccountingTaxError("INVALID_ACCOUNTING_TAX_ANALYSIS");
    return this.transition(
      work,
      {
        analysis_actor_id: input.actor.id,
        evidence_refs: [...work.evidence_refs, ...input.evidence_refs],
        status: "ANALYZED",
      },
      input,
      "ERP.ANALYSIS_RECORDED",
      "RECORD_ANALYSIS",
    );
  }

  createDraft(input: {
    actor: ErpActor;
    correlation_id: string;
    draft_reference: string;
    evidence_refs: readonly string[];
    project_id: string;
    work_id: string;
  }) {
    const work = this.work(input.work_id, input.project_id);
    this.requireMember(
      work.system_id,
      input.actor,
      this.memberRole(work.system_id, input.actor.id),
      "DRAFT",
    );
    if (
      input.actor.type !== "AGENT" ||
      !nonempty(input.correlation_id) ||
      input.actor.id !== work.analysis_actor_id ||
      work.status !== "ANALYZED" ||
      !reference(input.draft_reference, "artifact://") ||
      !this.validEvidence(input.evidence_refs)
    )
      throw new ErpAccountingTaxError("INVALID_ACCOUNTING_TAX_DRAFT");
    return this.transition(
      work,
      {
        draft_reference: input.draft_reference,
        draft_version: work.version + 1,
        evidence_refs: [...work.evidence_refs, ...input.evidence_refs],
        status: "DRAFT_READY",
      },
      input,
      "ERP.DRAFT_CREATED",
      "CREATE_DRAFT",
    );
  }

  recordComplianceQa(input: {
    actor: ErpActor;
    correlation_id: string;
    evidence_refs: readonly string[];
    project_id: string;
    result: "PASS" | "REVISE";
    role: AccountingTaxRole;
    work_id: string;
  }) {
    const work = this.work(input.work_id, input.project_id);
    this.requireMember(work.system_id, input.actor, input.role, "REVIEW");
    if (
      input.actor.type !== "AGENT" ||
      !nonempty(input.correlation_id) ||
      input.role !== "COMPLIANCE_QA_AGENT" ||
      input.actor.id === work.analysis_actor_id ||
      work.status !== "DRAFT_READY" ||
      !this.validEvidence(input.evidence_refs)
    )
      throw new ErpAccountingTaxError("COMPLIANCE_QA_REQUIRED");
    return this.transition(
      work,
      {
        evidence_refs: [...work.evidence_refs, ...input.evidence_refs],
        qa_actor_id: input.actor.id,
        status: input.result === "PASS" ? "HUMAN_REVIEW" : "BLOCKED",
      },
      input,
      "ERP.COMPLIANCE_QA_RECORDED",
      "RECORD_COMPLIANCE_QA",
    );
  }

  recordHumanReview(input: {
    actor: ErpActor;
    correlation_id: string;
    evidence_refs: readonly string[];
    project_id: string;
    work_id: string;
  }) {
    const work = this.work(input.work_id, input.project_id);
    if (
      input.actor.type !== "HUMAN" ||
      !nonempty(input.correlation_id) ||
      input.actor.id !== work.responsible_human_id ||
      work.status !== "HUMAN_REVIEW" ||
      !this.validEvidence(input.evidence_refs)
    )
      throw new ErpAccountingTaxError("HUMAN_ACCOUNTANT_REVIEW_REQUIRED");
    return this.transition(
      work,
      {
        evidence_refs: [...work.evidence_refs, ...input.evidence_refs],
        review_actor_id: input.actor.id,
        status: "WAITING_APPROVAL",
      },
      input,
      "ERP.HUMAN_REVIEW_RECORDED",
      "RECORD_HUMAN_REVIEW",
    );
  }

  recordHumanApproval(input: {
    actor: ErpActor;
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
    if (input.actor.type !== "HUMAN")
      throw new ErpAccountingTaxError("HUMAN_ACCOUNTANT_APPROVAL_REQUIRED");
    const work = this.work(input.work_id, input.project_id);
    const decision = this.approval?.evaluate({
      actor: input.actor,
      approval_id: input.approval_id,
      target: {
        action: "PREPARE_EXTERNAL_ACCOUNTING_TAX_ACTION",
        environment: input.environment,
        hash: input.target_hash,
        project_id: input.project_id,
        system_id: input.system_id,
        version: input.target_version,
        work_id: input.work_id,
      },
    });
    if (
      work.status !== "WAITING_APPROVAL" ||
      input.actor.id === work.review_actor_id ||
      !nonempty(input.approval_id) ||
      !nonempty(input.correlation_id) ||
      input.system_id !== work.system_id ||
      input.environment !== work.environment ||
      input.target_hash !== this.targetHash(work.id) ||
      input.target_version !== work.draft_version ||
      !this.validEvidence(input.evidence_refs) ||
      !decision?.allowed ||
      decision.approval_id !== input.approval_id ||
      decision.authority !== "AUTHORIZED" ||
      decision.status !== "APPROVED" ||
      decision.validity !== "VALID"
    )
      throw new ErpAccountingTaxError("INVALID_ACCOUNTING_TAX_APPROVAL");
    return this.transition(
      work,
      {
        approval_id: decision.approval_id,
        evidence_refs: [...work.evidence_refs, ...input.evidence_refs],
        status: "READY_FOR_EXTERNAL_ACTION",
      },
      { ...input, evidence_refs: input.evidence_refs },
      "ERP.HUMAN_APPROVAL_RECORDED",
      "RECORD_HUMAN_APPROVAL",
    );
  }

  requestExternalAction(
    input: ScopedInput & {
      action:
        "BIR_FILING" | "TAX_PAYMENT" | "SEC_SUBMISSION" | "BANK_TRANSACTION";
      work_id: string;
    },
  ): never {
    this.record(
      input.actor,
      input.correlation_id,
      input.action,
      input.work_id,
      "EXTERNAL_ACTION",
      [],
      "DENIED",
    );
    throw new ErpAccountingTaxError("ERP_EXTERNAL_ACTION_FORBIDDEN_PHASE_8");
  }

  targetHash(workId: string): string {
    const work = this.works.get(workId);
    if (!work) throw new ErpAccountingTaxError("COMPLIANCE_WORK_NOT_FOUND");
    return createHash("sha256")
      .update(
        JSON.stringify({
          accounting_period: work.accounting_period,
          draft_reference: work.draft_reference,
          draft_version: work.draft_version,
          id: work.id,
          environment: work.environment,
          project_id: work.project_id,
          system_id: work.system_id,
          source_references: work.source_references,
          type: work.type,
        }),
      )
      .digest("hex");
  }

  managementProjection(input: {
    actor: ErpActor;
    correlation_id: string;
    manager_scope_allowed: boolean;
    project_id: string;
    system_id: string;
  }) {
    if (
      input.actor.type !== "HUMAN" ||
      !input.manager_scope_allowed ||
      !nonempty(input.project_id) ||
      !nonempty(input.correlation_id)
    )
      throw new ErpAccountingTaxError("ERP_MANAGER_SCOPE_DENIED");
    const prefix = `${input.system_id}:${input.project_id}:`;
    const obligationValues = [...this.obligations.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .flatMap(([, snapshot]) => snapshot.obligations);
    const workValues = [...this.works.values()].filter(
      ({ project_id, system_id }) =>
        project_id === input.project_id && system_id === input.system_id,
    );
    const nextDeadline = obligationValues
      .filter(({ status }) => status !== "COMPLETED")
      .map(({ due_date }) => due_date)
      .sort()[0];
    return freeze({
      blocked_items:
        obligationValues.filter(({ status }) => status === "BLOCKED").length +
        workValues.filter(({ status }) => status === "BLOCKED").length,
      deadline_risks: obligationValues.filter(
        ({ due_date, status }) =>
          status !== "COMPLETED" &&
          Date.parse(`${due_date}T23:59:59Z`) - this.now().getTime() <=
            7 * 86_400_000,
      ).length,
      erp_health: this.getSystem(input.system_id).health,
      last_verified_at:
        [...this.finance.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([, summary]) => summary)
          .map(({ observed_at }) => observed_at)
          .sort()
          .at(-1) ?? "UNKNOWN",
      missing_approvals: workValues.filter(
        ({ status }) => status === "WAITING_APPROVAL",
      ).length,
      next_deadline: nextDeadline ?? "NONE",
      open_obligations: obligationValues.filter(
        ({ status }) => status !== "COMPLETED",
      ).length,
      period_status: [...this.finance.keys()].some((key) =>
        key.startsWith(prefix),
      )
        ? "OBSERVED"
        : "UNKNOWN",
      production_external_actions_enabled: false as const,
      risk_summary: freeze({
        missing_data: obligationValues.reduce(
          (sum, item) => sum + item.missing_data.length,
          0,
        ),
        stale_or_unverified:
          this.unverifiedCount(this.finance, prefix) +
          this.unverifiedCount(this.obligations, prefix) +
          [...this.failureScopes].filter((key) => key.startsWith(prefix))
            .length,
      }),
      work_items: workValues.length,
    });
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

  events(): readonly Readonly<ErpIntegrationEvent>[] {
    return [...this.eventLog];
  }

  getWork(id: string): Readonly<ComplianceWork> {
    const work = this.works.get(id);
    if (!work) throw new ErpAccountingTaxError("COMPLIANCE_WORK_NOT_FOUND");
    return work;
  }

  private authorize(input: ScopedInput, capability: ErpCapability) {
    const system = this.getSystem(input.system_id);
    const scope = this.scopes.get(
      this.scopeKey(input.system_id, input.project_id, input.accounting_period),
    );
    if (!input.permission_allowed) {
      this.record(
        input.actor,
        input.correlation_id,
        "AUTHORIZE",
        input.system_id,
        "ERP_SYSTEM",
        [],
        "DENIED",
      );
      throw new ErpAccountingTaxError("ERP_PERMISSION_DENIED");
    }
    if (
      !scope ||
      scope.accounting_period !== input.accounting_period ||
      !system.capabilities.includes(capability) ||
      !nonempty(input.correlation_id)
    ) {
      this.record(
        input.actor,
        input.correlation_id,
        "AUTHORIZE",
        input.system_id,
        "ERP_SYSTEM",
        [],
        "DENIED",
      );
      throw new ErpAccountingTaxError("ERP_SCOPE_DENIED");
    }
    return { scope, system };
  }

  private async run<T>(
    input: { signal?: AbortSignal; timeout_ms: number },
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (!Number.isSafeInteger(input.timeout_ms) || input.timeout_ms < 1)
      throw new ErpAccountingTaxError("INVALID_ERP_TIMEOUT");
    if (input.signal?.aborted)
      throw new ErpAccountingTaxError("ERP_REQUEST_CANCELLED");
    const controller = new AbortController();
    let code = "ERP_REQUEST_CANCELLED";
    const cancel = () => controller.abort();
    input.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      code = "ERP_REQUEST_TIMED_OUT";
      controller.abort();
    }, input.timeout_ms);
    try {
      const aborted = new Promise<never>((_resolve, reject) =>
        controller.signal.addEventListener(
          "abort",
          () => reject(new ErpAccountingTaxError(code)),
          { once: true },
        ),
      );
      return await Promise.race([operation(controller.signal), aborted]);
    } catch (error) {
      if (error instanceof ErpAccountingTaxError) throw error;
      if (controller.signal.aborted) throw new ErpAccountingTaxError(code);
      throw new ErpAccountingTaxError("ERP_SOURCE_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", cancel);
    }
  }

  private validateFinance(
    value: FinanceSummary,
    input: ScopedInput,
    scope: ScopeBinding,
    maxAgeMs: number,
  ) {
    if (
      !Number.isSafeInteger(maxAgeMs) ||
      maxAgeMs < 1 ||
      !date(value.observed_at) ||
      this.now().getTime() - Date.parse(value.observed_at) > maxAgeMs
    )
      throw new ErpAccountingTaxError("ERP_DATA_STALE");
    if (
      value.accounting_period !== input.accounting_period ||
      !value.source_record_references.includes(scope.source_reference) ||
      value.source_record_references.some(
        (item) =>
          item !== scope.source_reference &&
          !item.startsWith(`${scope.source_reference}/`),
      ) ||
      value.account_references.some(
        (item) => !reference(item, "erp://accounts/"),
      ) ||
      !this.validEvidence(value.evidence_refs) ||
      !validMoney(value.cash_summary) ||
      !validMoney(value.payable_summary) ||
      !validMoney(value.receivable_summary) ||
      value.tax_relevant_totals.some(
        (item) =>
          !nonempty(item.code) ||
          !nonempty(item.currency) ||
          !Number.isFinite(item.total),
      )
    )
      throw new ErpAccountingTaxError("INVALID_ERP_FINANCE_SUMMARY");
  }

  private validateObligations(
    value: ObligationSnapshot,
    input: ScopedInput,
    scope: ScopeBinding,
    maxAgeMs: number,
  ) {
    if (
      !Number.isSafeInteger(maxAgeMs) ||
      maxAgeMs < 1 ||
      !date(value.observed_at) ||
      this.now().getTime() - Date.parse(value.observed_at) > maxAgeMs
    )
      throw new ErpAccountingTaxError("ERP_DATA_STALE");
    if (
      value.period !== input.accounting_period ||
      value.source_reference !==
        `erp://obligations/${scope.accounting_period}` ||
      !this.validEvidence(value.evidence_refs) ||
      new Set(value.obligations.map(({ id }) => id)).size !==
        value.obligations.length ||
      value.obligations.some(
        (item) =>
          !nonempty(item.id) ||
          !date(item.due_date) ||
          !nonempty(item.responsible_human_id) ||
          !WORK_TYPES.includes(item.type) ||
          !["OPEN", "IN_REVIEW", "BLOCKED", "READY", "COMPLETED"].includes(
            item.status,
          ) ||
          !this.validEvidence(item.evidence_refs) ||
          item.missing_data.some((ref) => !reference(ref, "erp://")),
      )
    )
      throw new ErpAccountingTaxError("INVALID_ERP_OBLIGATIONS");
  }

  private work(id: string, projectId: string) {
    const work = this.getWork(id);
    if (work.project_id !== projectId)
      throw new ErpAccountingTaxError("ERP_SCOPE_DENIED");
    return work;
  }

  private transition(
    work: Readonly<ComplianceWork>,
    changes: Partial<ComplianceWork>,
    input: {
      actor: ErpActor;
      correlation_id: string;
      evidence_refs?: readonly string[];
      project_id: string;
      work_id: string;
    },
    eventName: string,
    action: string,
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
      action,
      work.id,
      "COMPLIANCE_WORK",
      evidence,
    );
    return stored;
  }

  private storeWork(work: ComplianceWork) {
    const stored = freeze({
      ...work,
      evidence_refs: freeze([...work.evidence_refs]),
      source_references: freeze([...work.source_references]),
    });
    this.works.set(stored.id, stored);
    return stored;
  }

  private validEvidence(values: readonly string[]) {
    return (
      values.length > 0 &&
      values.every((value) => reference(value, "evidence://"))
    );
  }

  private memberRole(systemId: string, agentId: string): AccountingTaxRole {
    const member = this.getTeam(systemId).members.find(
      ({ agent_id }) => agent_id === agentId,
    );
    if (!member)
      throw new ErpAccountingTaxError("ACCOUNTING_TAX_AGENT_NOT_ASSIGNED");
    return member.role;
  }

  private requireMember(
    systemId: string,
    actor: ErpActor,
    role: AccountingTaxRole,
    capability: "ANALYZE" | "DRAFT" | "REVIEW",
  ) {
    const member = this.getTeam(systemId).members.find(
      ({ agent_id }) => agent_id === actor.id,
    );
    if (
      actor.type !== "AGENT" ||
      !member ||
      member.role !== role ||
      member.assignment_state !== "ASSIGNED" ||
      !["AVAILABLE", "WORKING"].includes(member.status) ||
      !member.capabilities.includes(capability)
    )
      throw new ErpAccountingTaxError("ACCOUNTING_TAX_AGENT_NOT_ASSIGNED");
  }

  private recordFailure(
    input: ScopedInput,
    eventName: string,
    targetId: string,
    error: unknown,
    kind: "FINANCE" | "OBLIGATIONS",
  ) {
    const errorCode =
      error instanceof ErpAccountingTaxError
        ? error.code
        : "ERP_SOURCE_UNAVAILABLE";
    this.failureScopes.add(
      `${this.scopeKey(input.system_id, input.project_id, input.accounting_period)}:${kind}`,
    );
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
      "ERP_SYSTEM",
      [],
      "FAILED",
      errorCode,
      input.project_id,
      input.system_id,
    );
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

  private unverifiedCount<T extends { observed_at: string }>(
    observations: ReadonlyMap<string, Readonly<T>>,
    prefix: string,
  ) {
    const scoped = [...observations.entries()].filter(([key]) =>
      key.startsWith(prefix),
    );
    if (scoped.length === 0) return 1;
    return scoped.filter(
      ([, value]) =>
        this.now().getTime() - Date.parse(value.observed_at) > 300_000,
    ).length;
  }

  private scopeKey(
    systemId: string,
    projectId: string,
    accountingPeriod: string,
  ) {
    return `${systemId}:${projectId}:${accountingPeriod}`;
  }

  private emit(
    actor: ErpActor,
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
    actor: ErpActor,
    correlationId: string,
    action: string,
    id: string,
    type: ErpAuditRecord["target"]["type"],
    evidenceRefs: readonly string[],
    result: ErpAuditRecord["result"] = "SUCCEEDED",
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
          : type === "ERP_SYSTEM"
            ? { system_id: id }
            : {}),
        target: freeze({ id, type }),
      }),
    );
  }
}
