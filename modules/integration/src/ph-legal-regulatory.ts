import { createHash } from "node:crypto";
import type { ActorType, GovernanceDecision } from "@maos/contracts";

export const LEGAL_TEAM_ROLES = [
  "FINANCE_COMPLIANCE_LEAD",
  "CORPORATE_LEGAL_AGENT",
  "CONTRACT_REVIEW_AGENT",
  "REAL_ESTATE_LEGAL_AGENT",
  "REGULATORY_RESEARCH_AGENT",
  "LABOR_COMPLIANCE_AGENT",
  "COMPLIANCE_QA_AGENT",
] as const;
export type LegalTeamRole = (typeof LEGAL_TEAM_ROLES)[number];
export type LegalCapability =
  | "ASSIGN_LEGAL_WORK"
  | "MONITOR_DEADLINES"
  | "IDENTIFY_LEGAL_RISK"
  | "RESEARCH_OFFICIAL_SOURCES"
  | "DRAFT_INTERNAL_GUIDANCE"
  | "REVIEW_CONTRACT"
  | "PREPARE_CORPORATE_CHECKLIST"
  | "REVIEW_REAL_ESTATE_MATTER"
  | "REVIEW_LABOR_MATTER"
  | "COMPLIANCE_QA";
export const LEGAL_ROLE_CAPABILITIES: Readonly<
  Record<LegalTeamRole, readonly LegalCapability[]>
> = {
  FINANCE_COMPLIANCE_LEAD: [
    "ASSIGN_LEGAL_WORK",
    "MONITOR_DEADLINES",
    "IDENTIFY_LEGAL_RISK",
  ],
  CORPORATE_LEGAL_AGENT: [
    "RESEARCH_OFFICIAL_SOURCES",
    "DRAFT_INTERNAL_GUIDANCE",
    "PREPARE_CORPORATE_CHECKLIST",
    "IDENTIFY_LEGAL_RISK",
  ],
  CONTRACT_REVIEW_AGENT: [
    "RESEARCH_OFFICIAL_SOURCES",
    "DRAFT_INTERNAL_GUIDANCE",
    "REVIEW_CONTRACT",
    "IDENTIFY_LEGAL_RISK",
  ],
  REAL_ESTATE_LEGAL_AGENT: [
    "RESEARCH_OFFICIAL_SOURCES",
    "DRAFT_INTERNAL_GUIDANCE",
    "REVIEW_REAL_ESTATE_MATTER",
    "IDENTIFY_LEGAL_RISK",
  ],
  REGULATORY_RESEARCH_AGENT: [
    "RESEARCH_OFFICIAL_SOURCES",
    "DRAFT_INTERNAL_GUIDANCE",
    "MONITOR_DEADLINES",
    "IDENTIFY_LEGAL_RISK",
  ],
  LABOR_COMPLIANCE_AGENT: [
    "RESEARCH_OFFICIAL_SOURCES",
    "DRAFT_INTERNAL_GUIDANCE",
    "REVIEW_LABOR_MATTER",
    "IDENTIFY_LEGAL_RISK",
  ],
  COMPLIANCE_QA_AGENT: ["COMPLIANCE_QA", "IDENTIFY_LEGAL_RISK"],
};

export type LegalWorkType =
  | "LEGAL_RESEARCH"
  | "REGULATORY_ISSUE"
  | "CONTRACT_REVIEW"
  | "COMPLIANCE_CHECKLIST"
  | "CORPORATE_SEC_SUPPORT"
  | "REAL_ESTATE_LEGAL_SUPPORT"
  | "LABOR_LEGAL_SUPPORT";
export type LegalWorkStatus =
  | "DRAFT"
  | "RESEARCHED"
  | "SOURCES_VERIFIED"
  | "ANALYSIS_DRAFTED"
  | "COMPLIANCE_QA_PASSED"
  | "WAITING_HUMAN_APPROVAL"
  | "APPROVED_INTERNAL_GUIDANCE"
  | "BLOCKED";
export type SourceCurrentness = "CURRENT" | "STALE" | "UNVERIFIED";

export interface LegalActor {
  id: string;
  type: ActorType;
}
export interface LegalTeamMember {
  agent_id: string;
  capabilities: readonly LegalCapability[];
  role: LegalTeamRole;
  status: "AVAILABLE" | "WORKING" | "WAITING" | "BLOCKED" | "OFFLINE";
}
export interface LegalFinding {
  authority_reference?: string;
  clause_reference?: string;
  issue_type?: "CLAUSE_RISK" | "MISSING_CLAUSE" | "CONFLICTING_TERM";
  recommendation?: string;
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  summary: string;
}
export interface OfficialSourceVerification {
  authority: "SEC" | "BIR" | "DOLE" | "DHSUD" | "LGU" | "OTHER_APPROVED";
  currentness: SourceCurrentness;
  effective_date?: string;
  jurisdiction: "PH";
  provenance_reference: string;
  publication_date?: string;
  retrieved_at: string;
  source_id: string;
  source_reference: string;
  source_type:
    | "STATUTE"
    | "REGULATION"
    | "AGENCY_ISSUANCE"
    | "OFFICIAL_GUIDANCE"
    | "COURT_DECISION";
  verified_at: string;
}
export interface OfficialSourceAdapter {
  readonly health: "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";
  readonly mode: "OFFICIAL_SOURCE_REFERENCE_ONLY";
  verify(input: {
    jurisdiction: "PH";
    signal: AbortSignal;
    source_reference: string;
  }): Promise<OfficialSourceVerification>;
}
export interface LegalWork {
  approval_id?: string;
  block_reason?: string | undefined;
  deadline: string;
  draft_actor_id?: string;
  draft_reference?: string;
  environment: string;
  evidence_refs: readonly string[];
  external_action_performed: false;
  findings: readonly Readonly<LegalFinding>[];
  human_review_actor_id?: string;
  id: string;
  jurisdiction: "PH";
  matter_reference: string;
  project_id: string;
  purpose: string;
  qa_actor_id?: string;
  research_actor_id?: string;
  responsible_human_id: string;
  source_references: readonly string[];
  sources: readonly Readonly<OfficialSourceVerification>[];
  status: LegalWorkStatus;
  type: LegalWorkType;
  version: number;
}
export interface LegalEvent {
  actor: LegalActor;
  correlation_id: string;
  error_code?: string;
  evidence_refs: readonly string[];
  name: string;
  occurred_at: string;
  governance?: LegalGovernanceMetadata;
  project_id?: string;
  work_id?: string;
}
export interface LegalAuditRecord {
  action: string;
  actor: LegalActor;
  correlation_id: string;
  error_code?: string;
  evidence_refs: readonly string[];
  governance?: LegalGovernanceMetadata;
  project_id?: string;
  result: "SUCCEEDED" | "DENIED" | "FAILED";
  target: {
    id: string;
    type:
      "LEGAL_TEAM" | "LEGAL_WORK" | "LEGAL_SOURCE" | "LEGAL_EXTERNAL_ACTION";
  };
}
export interface LegalGovernanceMetadata {
  approval_id: string;
  authority?: string;
  status?: string;
  target_hash: string;
  target_version: number;
  validity?: string;
}
export interface LegalAuditPort {
  record(record: LegalAuditRecord): void;
}
export interface LegalApprovalPort {
  evaluate(input: {
    actor: LegalActor;
    approval_id: string;
    target: {
      action: "APPROVE_INTERNAL_LEGAL_GUIDANCE";
      environment: string;
      hash: string;
      project_id: string;
      version: number;
      work_id: string;
    };
  }): GovernanceDecision;
}
export interface LegalAuthorityPort {
  canReview(input: {
    actor: LegalActor;
    jurisdiction: "PH";
    matter_reference: string;
    project_id: string;
    purpose: string;
  }): boolean;
}

interface LegalScope {
  environment: string;
  jurisdiction: "PH";
  matter_reference: string;
  project_id: string;
  purpose: string;
}

const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const reference = (value: unknown, prefix: string): value is string =>
  nonempty(value) && value.startsWith(prefix) && value.length > prefix.length;
const timestamp = (value: string) => !Number.isNaN(Date.parse(value));
const evidence = (values: readonly string[]) =>
  values.length > 0 && values.every((value) => reference(value, "evidence://"));
const freeze = <T extends object>(value: T): Readonly<T> =>
  Object.freeze(value);
const WORK_TYPES: readonly LegalWorkType[] = [
  "LEGAL_RESEARCH",
  "REGULATORY_ISSUE",
  "CONTRACT_REVIEW",
  "COMPLIANCE_CHECKLIST",
  "CORPORATE_SEC_SUPPORT",
  "REAL_ESTATE_LEGAL_SUPPORT",
  "LABOR_LEGAL_SUPPORT",
];
const roleForWork = (type: LegalWorkType): LegalTeamRole => {
  if (type === "CONTRACT_REVIEW") return "CONTRACT_REVIEW_AGENT";
  if (type === "REAL_ESTATE_LEGAL_SUPPORT") return "REAL_ESTATE_LEGAL_AGENT";
  if (type === "LABOR_LEGAL_SUPPORT") return "LABOR_COMPLIANCE_AGENT";
  if (type === "LEGAL_RESEARCH" || type === "REGULATORY_ISSUE")
    return "REGULATORY_RESEARCH_AGENT";
  return "CORPORATE_LEGAL_AGENT";
};

export class PhLegalRegulatoryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "PhLegalRegulatoryError";
  }
}

export class PhLegalRegulatoryService {
  private readonly team = new Map<LegalTeamRole, Readonly<LegalTeamMember>>();
  private readonly scopes = new Map<string, Readonly<LegalScope>>();
  private readonly works = new Map<string, Readonly<LegalWork>>();
  private readonly eventLog: Readonly<LegalEvent>[] = [];

  constructor(
    private readonly adapter: OfficialSourceAdapter,
    private readonly now: () => Date = () => new Date(),
    private readonly onEvent?: (event: LegalEvent) => void,
    private readonly audit?: LegalAuditPort,
    private readonly approval?: LegalApprovalPort,
    private readonly authority?: LegalAuthorityPort,
  ) {
    if (adapter.mode !== "OFFICIAL_SOURCE_REFERENCE_ONLY")
      throw new PhLegalRegulatoryError("OFFICIAL_SOURCE_ADAPTER_REQUIRED");
  }

  registerTeam(input: {
    actor: LegalActor;
    correlation_id: string;
    members: readonly LegalTeamMember[];
  }): readonly Readonly<LegalTeamMember>[] {
    if (input.actor.type !== "HUMAN" || !nonempty(input.correlation_id))
      throw new PhLegalRegulatoryError("HUMAN_LEGAL_TEAM_OWNER_REQUIRED");
    const roles = new Set(input.members.map(({ role }) => role));
    if (
      input.members.length !== LEGAL_TEAM_ROLES.length ||
      roles.size !== LEGAL_TEAM_ROLES.length ||
      LEGAL_TEAM_ROLES.some((role) => !roles.has(role)) ||
      input.members.some(
        ({ agent_id, capabilities, role }) =>
          !nonempty(agent_id) ||
          !LEGAL_TEAM_ROLES.includes(role) ||
          capabilities.length !== LEGAL_ROLE_CAPABILITIES[role].length ||
          capabilities.some(
            (capability) => !LEGAL_ROLE_CAPABILITIES[role].includes(capability),
          ) ||
          LEGAL_ROLE_CAPABILITIES[role].some(
            (capability) => !capabilities.includes(capability),
          ),
      )
    )
      throw new PhLegalRegulatoryError("INVALID_LEGAL_TEAM");
    this.team.clear();
    for (const member of input.members)
      this.team.set(
        member.role,
        freeze({ ...member, capabilities: freeze([...member.capabilities]) }),
      );
    this.emit(
      input.actor,
      input.correlation_id,
      "LEGAL.TEAM_REGISTERED",
      [],
      undefined,
    );
    this.record(
      input.actor,
      input.correlation_id,
      "REGISTER_LEGAL_TEAM",
      "ph-legal-team",
      "LEGAL_TEAM",
      [],
    );
    return this.listTeam();
  }

  listTeam(): readonly Readonly<LegalTeamMember>[] {
    return LEGAL_TEAM_ROLES.map((role) => this.team.get(role)).filter(
      (member): member is Readonly<LegalTeamMember> => Boolean(member),
    );
  }

  bindScope(
    input: LegalScope & { actor: LegalActor; correlation_id: string },
  ): Readonly<LegalScope> {
    if (
      input.actor.type !== "HUMAN" ||
      input.jurisdiction !== "PH" ||
      !reference(input.matter_reference, "legalmatter://") ||
      ![
        input.environment,
        input.project_id,
        input.purpose,
        input.correlation_id,
      ].every(nonempty)
    )
      throw new PhLegalRegulatoryError("INVALID_LEGAL_SCOPE");
    const { actor, correlation_id, ...scope } = input;
    const stored = freeze({ ...scope });
    this.scopes.set(this.scopeKey(scope), stored);
    this.emit(actor, correlation_id, "LEGAL.SCOPE_BOUND", [], scope.project_id);
    this.record(
      actor,
      correlation_id,
      "BIND_LEGAL_SCOPE",
      scope.matter_reference,
      "LEGAL_WORK",
      [],
      "SUCCEEDED",
      undefined,
      scope.project_id,
    );
    return stored;
  }

  createWork(input: {
    actor: LegalActor;
    correlation_id: string;
    deadline: string;
    evidence_refs: readonly string[];
    jurisdiction: "PH";
    matter_reference: string;
    permission_allowed: boolean;
    project_id: string;
    purpose: string;
    responsible_human_id: string;
    type: LegalWorkType;
    work_id: string;
  }): Readonly<LegalWork> {
    if (
      input.jurisdiction !== "PH" ||
      !WORK_TYPES.includes(input.type) ||
      !nonempty(input.work_id) ||
      !reference(input.matter_reference, "legalmatter://") ||
      !nonempty(input.purpose) ||
      !nonempty(input.responsible_human_id) ||
      !timestamp(input.deadline) ||
      !evidence(input.evidence_refs) ||
      this.works.has(input.work_id)
    )
      throw new PhLegalRegulatoryError("INVALID_LEGAL_WORK");
    const scope = this.scopes.get(this.scopeKey(input));
    if (!scope || !input.permission_allowed || input.actor.type !== "HUMAN")
      return this.deny(input, "LEGAL_SCOPE_DENIED", "CREATE_LEGAL_WORK");
    if (
      !this.authority?.canReview({
        actor: { id: input.responsible_human_id, type: "HUMAN" },
        jurisdiction: input.jurisdiction,
        matter_reference: input.matter_reference,
        project_id: input.project_id,
        purpose: input.purpose,
      })
    )
      return this.deny(
        input,
        "HUMAN_LEGAL_AUTHORITY_REQUIRED",
        "CREATE_LEGAL_WORK",
      );
    const stored = this.store({
      deadline: input.deadline,
      environment: scope.environment,
      evidence_refs: freeze([...input.evidence_refs]),
      external_action_performed: false,
      findings: freeze([]),
      id: input.work_id,
      jurisdiction: input.jurisdiction,
      matter_reference: input.matter_reference,
      project_id: input.project_id,
      purpose: input.purpose,
      responsible_human_id: input.responsible_human_id,
      source_references: freeze([]),
      sources: freeze([]),
      status: "DRAFT",
      type: input.type,
      version: 1,
    });
    this.activity(input, "LEGAL.WORK_CREATED", stored.evidence_refs);
    return stored;
  }

  recordResearch(input: {
    actor: LegalActor;
    correlation_id: string;
    evidence_refs: readonly string[];
    findings: readonly LegalFinding[];
    project_id: string;
    source_references: readonly string[];
    work_id: string;
  }): Readonly<LegalWork> {
    const work = this.work(input.work_id, input.project_id);
    this.requireRole(
      input.actor,
      roleForWork(work.type),
      "RESEARCH_OFFICIAL_SOURCES",
      input,
    );
    if (
      work.status !== "DRAFT" ||
      input.findings.length === 0 ||
      input.findings.some(
        ({ risk, summary }) =>
          !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(risk) ||
          !nonempty(summary),
      ) ||
      input.source_references.length === 0 ||
      input.source_references.some((item) => !reference(item, "official://")) ||
      !evidence(input.evidence_refs)
    )
      throw new PhLegalRegulatoryError("INVALID_LEGAL_RESEARCH");
    if (
      work.type === "CONTRACT_REVIEW" &&
      input.findings.some(
        ({
          authority_reference,
          clause_reference,
          issue_type,
          recommendation,
        }) =>
          !reference(authority_reference, "official://") ||
          !reference(clause_reference, "contractref://") ||
          !["CLAUSE_RISK", "MISSING_CLAUSE", "CONFLICTING_TERM"].includes(
            issue_type ?? "",
          ) ||
          !nonempty(recommendation),
      )
    )
      throw new PhLegalRegulatoryError("CONTRACT_FINDING_REFERENCE_REQUIRED");
    const stored = this.transition(work, {
      evidence_refs: [...work.evidence_refs, ...input.evidence_refs],
      findings: input.findings.map((finding) => freeze({ ...finding })),
      research_actor_id: input.actor.id,
      source_references: [...input.source_references],
      status: "RESEARCHED",
    });
    this.activity(input, "LEGAL.RESEARCH_RECORDED", input.evidence_refs);
    return stored;
  }

  async verifySources(input: {
    actor: LegalActor;
    correlation_id: string;
    project_id: string;
    signal?: AbortSignal;
    timeout_ms: number;
    work_id: string;
  }): Promise<Readonly<LegalWork>> {
    const work = this.work(input.work_id, input.project_id);
    this.requireRole(
      input.actor,
      "REGULATORY_RESEARCH_AGENT",
      "RESEARCH_OFFICIAL_SOURCES",
      input,
    );
    if (
      work.status !== "RESEARCHED" ||
      !Number.isSafeInteger(input.timeout_ms) ||
      input.timeout_ms < 1
    )
      throw new PhLegalRegulatoryError("INVALID_SOURCE_VERIFICATION");
    if (this.adapter.health !== "HEALTHY")
      return this.failVerification(work, input, "LEGAL_SOURCE_UNAVAILABLE");
    if (input.signal?.aborted)
      return this.failVerification(
        work,
        input,
        "LEGAL_SOURCE_VERIFICATION_CANCELLED",
      );
    const controller = new AbortController();
    const abort = () => controller.abort();
    input.signal?.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(
            new PhLegalRegulatoryError("LEGAL_SOURCE_VERIFICATION_TIMED_OUT"),
          );
        }, input.timeout_ms);
      });
      const cancellation = new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => {
            if (!timedOut)
              reject(
                new PhLegalRegulatoryError(
                  "LEGAL_SOURCE_VERIFICATION_CANCELLED",
                ),
              );
          },
          { once: true },
        );
      });
      const sources: OfficialSourceVerification[] = [];
      for (const source_reference of work.source_references) {
        let result: OfficialSourceVerification;
        try {
          result = await Promise.race([
            this.adapter.verify({
              jurisdiction: "PH",
              signal: controller.signal,
              source_reference,
            }),
            timeout,
            cancellation,
          ]);
        } catch (error) {
          const code = timedOut
            ? "LEGAL_SOURCE_VERIFICATION_TIMED_OUT"
            : error instanceof PhLegalRegulatoryError
              ? error.code
              : "LEGAL_SOURCE_UNAVAILABLE";
          return this.failVerification(work, input, code);
        }
        if (!this.validSource(result, source_reference))
          return this.failVerification(
            work,
            input,
            "INVALID_LEGAL_SOURCE_PROVENANCE",
          );
        if (result.currentness !== "CURRENT") {
          this.transition(work, {
            block_reason: "LEGAL_SOURCE_NOT_CURRENT",
            sources: [...sources, result],
            status: "BLOCKED",
          });
          return this.failVerification(
            this.work(work.id, work.project_id),
            input,
            "LEGAL_SOURCE_NOT_CURRENT",
            false,
            [result.provenance_reference],
          );
        }
        sources.push(freeze({ ...result }));
      }
      const stored = this.transition(work, {
        evidence_refs: [
          ...work.evidence_refs,
          ...sources.map(({ provenance_reference }) => provenance_reference),
        ],
        sources,
        status: "SOURCES_VERIFIED",
      });
      this.activity(
        input,
        "LEGAL.SOURCES_VERIFIED",
        sources.map(({ provenance_reference }) => provenance_reference),
      );
      return stored;
    } finally {
      if (timer) clearTimeout(timer);
      input.signal?.removeEventListener("abort", abort);
    }
  }

  retrySourceVerification(input: {
    actor: LegalActor;
    correlation_id: string;
    evidence_refs: readonly string[];
    project_id: string;
    work_id: string;
  }): Readonly<LegalWork> {
    const work = this.work(input.work_id, input.project_id);
    this.requireRole(
      input.actor,
      "REGULATORY_RESEARCH_AGENT",
      "RESEARCH_OFFICIAL_SOURCES",
      input,
    );
    if (
      work.status !== "BLOCKED" ||
      !work.block_reason?.startsWith("LEGAL_SOURCE_") ||
      this.adapter.health !== "HEALTHY" ||
      !evidence(input.evidence_refs)
    )
      throw new PhLegalRegulatoryError("INVALID_SOURCE_VERIFICATION_RETRY");
    const stored = this.transition(work, {
      block_reason: undefined,
      evidence_refs: [...work.evidence_refs, ...input.evidence_refs],
      sources: [],
      status: "RESEARCHED",
    });
    this.activity(
      input,
      "LEGAL.SOURCE_VERIFICATION_RETRY_REQUESTED",
      input.evidence_refs,
    );
    return stored;
  }

  recordDraft(input: {
    actor: LegalActor;
    artifact_reference: string;
    correlation_id: string;
    evidence_refs: readonly string[];
    project_id: string;
    work_id: string;
  }): Readonly<LegalWork> {
    const work = this.work(input.work_id, input.project_id);
    this.requireRole(
      input.actor,
      roleForWork(work.type),
      "DRAFT_INTERNAL_GUIDANCE",
      input,
    );
    if (
      work.status !== "SOURCES_VERIFIED" ||
      input.actor.id !== work.research_actor_id ||
      !reference(input.artifact_reference, "artifact://") ||
      !evidence(input.evidence_refs)
    )
      throw new PhLegalRegulatoryError("INVALID_LEGAL_DRAFT");
    const stored = this.transition(work, {
      draft_actor_id: input.actor.id,
      draft_reference: input.artifact_reference,
      evidence_refs: [...work.evidence_refs, ...input.evidence_refs],
      status: "ANALYSIS_DRAFTED",
    });
    this.activity(input, "LEGAL.DRAFT_RECORDED", input.evidence_refs);
    return stored;
  }

  recordComplianceQa(input: {
    actor: LegalActor;
    correlation_id: string;
    evidence_refs: readonly string[];
    project_id: string;
    result: "PASS" | "REVISE";
    work_id: string;
  }): Readonly<LegalWork> {
    const work = this.work(input.work_id, input.project_id);
    this.requireRole(
      input.actor,
      "COMPLIANCE_QA_AGENT",
      "COMPLIANCE_QA",
      input,
    );
    if (!["PASS", "REVISE"].includes(input.result))
      throw new PhLegalRegulatoryError("INVALID_LEGAL_QA_RESULT");
    if (
      work.status !== "ANALYSIS_DRAFTED" ||
      input.actor.id === work.draft_actor_id ||
      !evidence(input.evidence_refs)
    )
      throw new PhLegalRegulatoryError("COMPLIANCE_QA_SEPARATION_REQUIRED");
    const stored = this.transition(work, {
      evidence_refs: [...work.evidence_refs, ...input.evidence_refs],
      qa_actor_id: input.actor.id,
      status: input.result === "PASS" ? "COMPLIANCE_QA_PASSED" : "BLOCKED",
    });
    this.activity(input, "LEGAL.COMPLIANCE_QA_RECORDED", input.evidence_refs);
    return stored;
  }

  recordHumanReview(input: {
    actor: LegalActor;
    correlation_id: string;
    evidence_refs: readonly string[];
    project_id: string;
    work_id: string;
  }): Readonly<LegalWork> {
    const work = this.work(input.work_id, input.project_id);
    if (
      input.actor.type !== "HUMAN" ||
      input.actor.id !== work.responsible_human_id ||
      work.status !== "COMPLIANCE_QA_PASSED" ||
      !evidence(input.evidence_refs)
    )
      return this.deny(
        input,
        "HUMAN_LEGAL_REVIEW_REQUIRED",
        "REVIEW_LEGAL_WORK",
      );
    if (
      !this.authority?.canReview({
        actor: input.actor,
        jurisdiction: work.jurisdiction,
        matter_reference: work.matter_reference,
        project_id: work.project_id,
        purpose: work.purpose,
      })
    )
      return this.deny(
        input,
        "HUMAN_LEGAL_AUTHORITY_REQUIRED",
        "REVIEW_LEGAL_WORK",
      );
    const stored = this.transition(work, {
      evidence_refs: [...work.evidence_refs, ...input.evidence_refs],
      human_review_actor_id: input.actor.id,
      status: "WAITING_HUMAN_APPROVAL",
    });
    this.activity(input, "LEGAL.HUMAN_REVIEW_RECORDED", input.evidence_refs);
    return stored;
  }

  recordHumanApproval(input: {
    actor: LegalActor;
    approval_id: string;
    correlation_id: string;
    evidence_refs: readonly string[];
    project_id: string;
    target_hash: string;
    target_version: number;
    work_id: string;
  }): Readonly<LegalWork> {
    const work = this.work(input.work_id, input.project_id);
    const deny = (code: string, decision?: GovernanceDecision): never => {
      const governance = {
        approval_id: input.approval_id,
        ...(decision?.authority ? { authority: decision.authority } : {}),
        ...(decision?.status ? { status: decision.status } : {}),
        target_hash: input.target_hash,
        target_version: input.target_version,
        ...(decision?.validity ? { validity: decision.validity } : {}),
      };
      this.emit(
        input.actor,
        input.correlation_id,
        "LEGAL.INTERNAL_GUIDANCE_APPROVAL_DENIED",
        input.evidence_refs,
        input.project_id,
        input.work_id,
        code,
        governance,
      );
      this.record(
        input.actor,
        input.correlation_id,
        "APPROVE_INTERNAL_LEGAL_GUIDANCE",
        input.work_id,
        "LEGAL_WORK",
        input.evidence_refs,
        "DENIED",
        code,
        input.project_id,
        governance,
      );
      throw new PhLegalRegulatoryError(code);
    };
    if (input.actor.type !== "HUMAN")
      return deny("HUMAN_LEGAL_APPROVAL_REQUIRED");
    if (
      work.status !== "WAITING_HUMAN_APPROVAL" ||
      input.actor.id === work.human_review_actor_id ||
      !evidence(input.evidence_refs) ||
      input.target_version !== work.version ||
      input.target_hash !== this.targetHash(work.id) ||
      work.sources.length === 0 ||
      work.sources.some((source) => !this.sourceIsCurrent(source))
    )
      return deny("INVALID_LEGAL_APPROVAL_TARGET");
    const decision = this.approval?.evaluate({
      actor: input.actor,
      approval_id: input.approval_id,
      target: {
        action: "APPROVE_INTERNAL_LEGAL_GUIDANCE",
        environment: work.environment,
        hash: input.target_hash,
        project_id: work.project_id,
        version: work.version,
        work_id: work.id,
      },
    });
    if (
      !decision?.allowed ||
      decision.approval_id !== input.approval_id ||
      decision.authority !== "AUTHORIZED" ||
      decision.status !== "APPROVED" ||
      decision.validity !== "VALID"
    )
      return deny("LEGAL_APPROVAL_INVALID", decision);
    const stored = this.transition(work, {
      approval_id: input.approval_id,
      evidence_refs: [...work.evidence_refs, ...input.evidence_refs],
      status: "APPROVED_INTERNAL_GUIDANCE",
    });
    this.activity(
      input,
      "LEGAL.INTERNAL_GUIDANCE_APPROVED",
      input.evidence_refs,
      {
        approval_id: input.approval_id,
        authority: decision.authority,
        status: decision.status,
        target_hash: input.target_hash,
        target_version: input.target_version,
        validity: decision.validity,
      },
    );
    return stored;
  }

  requestExternalAction(input: {
    action: string;
    actor: LegalActor;
    correlation_id: string;
    permission_allowed: boolean;
    project_id: string;
    work_id: string;
  }): never {
    const code = "LEGAL_EXTERNAL_ACTION_FORBIDDEN_PHASE_9A";
    this.emit(
      input.actor,
      input.correlation_id,
      "LEGAL.EXTERNAL_ACTION_DENIED",
      [],
      input.project_id,
      input.work_id,
      code,
    );
    this.record(
      input.actor,
      input.correlation_id,
      input.action,
      input.work_id,
      "LEGAL_EXTERNAL_ACTION",
      [],
      "DENIED",
      code,
      input.project_id,
    );
    throw new PhLegalRegulatoryError(code);
  }

  targetHash(workId: string): string {
    const work = this.getWork(workId);
    const canonical = [
      work.id,
      work.project_id,
      work.matter_reference,
      work.type,
      work.version,
      work.draft_reference ?? "",
      ...work.sources.map(
        ({ source_id, verified_at }) => `${source_id}:${verified_at}`,
      ),
    ].join("\n");
    return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
  }

  managementProjection(input: {
    actor: LegalActor;
    permission_allowed: boolean;
    project_id: string;
  }) {
    if (!input.permission_allowed || input.actor.type !== "HUMAN")
      throw new PhLegalRegulatoryError("LEGAL_MANAGEMENT_VIEW_DENIED");
    const works = [...this.works.values()].filter(
      ({ project_id }) => project_id === input.project_id,
    );
    const sources = works.flatMap(({ sources }) => sources);
    const current = sources.filter((source) => this.sourceIsCurrent(source));
    const unresolved = works.filter(
      ({ source_references, sources }) =>
        source_references.length === 0 ||
        sources.length < source_references.length,
    ).length;
    const staleOrUnverified = sources.length - current.length + unresolved;
    const deadlines = works.filter(
      ({ status }) => status !== "APPROVED_INTERNAL_GUIDANCE",
    );
    return freeze({
      blocked_reviews: works.filter(({ status }) => status === "BLOCKED")
        .length,
      external_actions_enabled: false as const,
      high_risk_issues: works
        .flatMap(({ findings }) => findings)
        .filter(({ risk }) => risk === "HIGH" || risk === "CRITICAL").length,
      last_verified_at:
        current
          .map(({ verified_at }) => verified_at)
          .sort()
          .at(-1) ?? "NOT_VERIFIED",
      next_deadline:
        deadlines.map(({ deadline }) => deadline).sort()[0] ?? "NONE",
      next_action:
        sources.length - current.length > 0
          ? ("SOURCE_REVERIFICATION" as const)
          : works.some(({ status }) => status === "WAITING_HUMAN_APPROVAL")
            ? ("HUMAN_APPROVAL" as const)
            : works.some(({ status }) => status === "BLOCKED")
              ? ("RESOLVE_BLOCKER" as const)
              : works.length > 0
                ? ("CONTINUE_LEGAL_REVIEW" as const)
                : ("NONE" as const),
      open_deadlines: deadlines.length,
      owners: [
        ...new Set(
          works.map(({ responsible_human_id }) => responsible_human_id),
        ),
      ].sort(),
      source_states: {
        current: current.length,
        stale_or_unverified: staleOrUnverified,
      },
      source_status:
        staleOrUnverified === 0 && current.length > 0
          ? ("CURRENT" as const)
          : current.length === 0
            ? ("NOT_VERIFIED" as const)
            : ("VERIFICATION_REQUIRED" as const),
      waiting_human_approval: works.filter(
        ({ status }) => status === "WAITING_HUMAN_APPROVAL",
      ).length,
      workload: works.length,
    });
  }

  readiness() {
    return freeze({
      external_actions_enabled: false as const,
      official_source_mode: this.adapter.mode,
      source_health: this.adapter.health,
      status:
        this.team.size === LEGAL_TEAM_ROLES.length &&
        [...this.team.values()].every(({ status }) =>
          ["AVAILABLE", "WORKING"].includes(status),
        ) &&
        Boolean(this.approval) &&
        Boolean(this.authority) &&
        this.adapter.health === "HEALTHY"
          ? ("READY" as const)
          : ("NOT_READY" as const),
      team_members: this.team.size,
    });
  }

  events(): readonly Readonly<LegalEvent>[] {
    return [...this.eventLog];
  }

  getWork(id: string): Readonly<LegalWork> {
    const work = this.works.get(id);
    if (!work) throw new PhLegalRegulatoryError("LEGAL_WORK_NOT_FOUND");
    return work;
  }

  private scopeKey(
    input: Pick<
      LegalScope,
      "jurisdiction" | "matter_reference" | "project_id" | "purpose"
    >,
  ) {
    return [
      input.project_id,
      input.matter_reference,
      input.purpose,
      input.jurisdiction,
    ].join("|");
  }

  private requireRole(
    actor: LegalActor,
    role: LegalTeamRole,
    capability: LegalCapability,
    input?: { correlation_id: string; project_id: string; work_id: string },
  ) {
    const member = this.team.get(role);
    if (
      actor.type !== "AGENT" ||
      member?.agent_id !== actor.id ||
      !["AVAILABLE", "WORKING"].includes(member.status) ||
      !member.capabilities.includes(capability)
    ) {
      if (input) {
        this.emit(
          actor,
          input.correlation_id,
          "LEGAL.ACCESS_DENIED",
          [],
          input.project_id,
          input.work_id,
          "LEGAL_AGENT_ROLE_DENIED",
        );
        this.record(
          actor,
          input.correlation_id,
          capability,
          input.work_id,
          "LEGAL_WORK",
          [],
          "DENIED",
          "LEGAL_AGENT_ROLE_DENIED",
          input.project_id,
        );
      }
      throw new PhLegalRegulatoryError("LEGAL_AGENT_ROLE_DENIED");
    }
  }

  private work(id: string, projectId: string) {
    const work = this.getWork(id);
    if (work.project_id !== projectId)
      throw new PhLegalRegulatoryError("LEGAL_SCOPE_DENIED");
    return work;
  }

  private store(work: LegalWork): Readonly<LegalWork> {
    const stored = freeze({
      ...work,
      evidence_refs: freeze([...work.evidence_refs]),
      findings: freeze(work.findings.map((finding) => freeze({ ...finding }))),
      source_references: freeze([...work.source_references]),
      sources: freeze(work.sources.map((source) => freeze({ ...source }))),
    });
    this.works.set(stored.id, stored);
    return stored;
  }

  private transition(work: Readonly<LegalWork>, patch: Partial<LegalWork>) {
    return this.store({
      ...work,
      ...patch,
      version: work.version + 1,
    } as LegalWork);
  }

  private validSource(
    source: OfficialSourceVerification,
    expectedReference: string,
  ) {
    const verified = Date.parse(source.verified_at);
    const retrieved = Date.parse(source.retrieved_at);
    const publication = source.publication_date
      ? Date.parse(source.publication_date)
      : undefined;
    const effective = source.effective_date
      ? Date.parse(source.effective_date)
      : undefined;
    const current = this.now().getTime();
    return (
      source.source_reference === expectedReference &&
      source.jurisdiction === "PH" &&
      nonempty(source.source_id) &&
      ["SEC", "BIR", "DOLE", "DHSUD", "LGU", "OTHER_APPROVED"].includes(
        source.authority,
      ) &&
      [
        "STATUTE",
        "REGULATION",
        "AGENCY_ISSUANCE",
        "OFFICIAL_GUIDANCE",
        "COURT_DECISION",
      ].includes(source.source_type) &&
      reference(source.provenance_reference, "evidence://") &&
      timestamp(source.retrieved_at) &&
      timestamp(source.verified_at) &&
      (source.publication_date === undefined ||
        timestamp(source.publication_date)) &&
      (source.effective_date === undefined ||
        timestamp(source.effective_date)) &&
      retrieved <= verified &&
      verified <= current + 60_000 &&
      current - retrieved <= 24 * 60 * 60 * 1000 &&
      (publication === undefined || publication <= retrieved) &&
      (effective === undefined || effective <= verified) &&
      ["CURRENT", "STALE", "UNVERIFIED"].includes(source.currentness)
    );
  }

  private sourceIsCurrent(source: OfficialSourceVerification) {
    const verified = Date.parse(source.verified_at);
    const retrieved = Date.parse(source.retrieved_at);
    const current = this.now().getTime();
    return (
      source.currentness === "CURRENT" &&
      Number.isFinite(verified) &&
      Number.isFinite(retrieved) &&
      retrieved <= verified &&
      verified <= current + 60_000 &&
      current - retrieved <= 24 * 60 * 60 * 1000
    );
  }

  private failVerification(
    work: Readonly<LegalWork>,
    input: {
      actor: LegalActor;
      correlation_id: string;
      project_id: string;
      work_id: string;
    },
    code: string,
    transition = true,
    evidence_refs: readonly string[] = [],
  ): never {
    if (transition && work.status !== "BLOCKED")
      this.transition(work, { block_reason: code, status: "BLOCKED" });
    this.emit(
      input.actor,
      input.correlation_id,
      "LEGAL.SOURCE_VERIFICATION_FAILED",
      evidence_refs,
      input.project_id,
      input.work_id,
      code,
    );
    this.record(
      input.actor,
      input.correlation_id,
      "VERIFY_OFFICIAL_SOURCE",
      input.work_id,
      "LEGAL_SOURCE",
      evidence_refs,
      "FAILED",
      code,
      input.project_id,
    );
    throw new PhLegalRegulatoryError(code);
  }

  private activity(
    input: {
      actor: LegalActor;
      correlation_id: string;
      project_id: string;
      work_id: string;
    },
    name: string,
    evidence_refs: readonly string[],
    governance?: LegalGovernanceMetadata,
  ) {
    this.emit(
      input.actor,
      input.correlation_id,
      name,
      evidence_refs,
      input.project_id,
      input.work_id,
      undefined,
      governance,
    );
    this.record(
      input.actor,
      input.correlation_id,
      name,
      input.work_id,
      "LEGAL_WORK",
      evidence_refs,
      "SUCCEEDED",
      undefined,
      input.project_id,
      governance,
    );
  }

  private emit(
    actor: LegalActor,
    correlation_id: string,
    name: string,
    evidence_refs: readonly string[],
    project_id?: string,
    work_id?: string,
    error_code?: string,
    governance?: LegalGovernanceMetadata,
  ) {
    const event = freeze({
      actor: freeze({ ...actor }),
      correlation_id,
      ...(error_code ? { error_code } : {}),
      evidence_refs: freeze([...evidence_refs]),
      name,
      occurred_at: this.now().toISOString(),
      ...(governance ? { governance: freeze({ ...governance }) } : {}),
      ...(project_id ? { project_id } : {}),
      ...(work_id ? { work_id } : {}),
    });
    this.eventLog.push(event);
    this.onEvent?.(event);
    return event;
  }

  private record(
    actor: LegalActor,
    correlation_id: string,
    action: string,
    id: string,
    type: LegalAuditRecord["target"]["type"],
    evidence_refs: readonly string[],
    result: LegalAuditRecord["result"] = "SUCCEEDED",
    error_code?: string,
    project_id?: string,
    governance?: LegalGovernanceMetadata,
  ) {
    this.audit?.record({
      action,
      actor: { ...actor },
      correlation_id,
      ...(error_code ? { error_code } : {}),
      evidence_refs: [...evidence_refs],
      ...(governance ? { governance: { ...governance } } : {}),
      ...(project_id ? { project_id } : {}),
      result,
      target: { id, type },
    });
  }

  private deny(
    input: {
      actor: LegalActor;
      correlation_id: string;
      evidence_refs: readonly string[];
      project_id: string;
      work_id: string;
    },
    code: string,
    action: string,
  ): never {
    this.emit(
      input.actor,
      input.correlation_id,
      "LEGAL.ACCESS_DENIED",
      input.evidence_refs,
      input.project_id,
      input.work_id,
      code,
    );
    this.record(
      input.actor,
      input.correlation_id,
      action,
      input.work_id,
      "LEGAL_WORK",
      input.evidence_refs,
      "DENIED",
      code,
      input.project_id,
    );
    throw new PhLegalRegulatoryError(code);
  }
}
