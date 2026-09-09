import { randomUUID } from "node:crypto";
import { createServer, type RequestListener, type Server } from "node:http";
import { createConservativePhase12ReadinessAssessment } from "@maos/module-operations";
import {
  renderControlRoom,
  type AiMlsView,
  type ControlPlaneView,
  type ControlRoomIdentity,
  type CrmView,
  type ErpFinanceView,
  type EnterpriseOrchestrationView,
  type HrLaborView,
  type LegalComplianceView,
  type OperationsView,
  type OptimizationView,
  type RbsAdminView,
} from "./control-room.js";

export const CONTROL_ROOM_PREVIEW_IDENTITY: ControlRoomIdentity = {
  actor_id: "preview-human",
  display_name: "Mina Park",
  permissions: [
    "TODAY:READ",
    "PROJECT:READ",
    "TASK:READ",
    "AI_COMPANY:READ",
    "ENTERPRISE:READ",
    "AGENT:READ",
    "RUN:READ",
    "APPROVAL:READ",
    "APPROVAL:DECIDE",
    "ALERT:READ",
    "OPERATIONS:READ",
    "OPTIMIZATION:READ",
    "SYSTEM:READ",
    "AI_MLS:READ",
    "CRM:READ",
    "CRM:CAPTURE",
    "ERP:READ",
    "HR:READ",
    "LEGAL:READ",
    "DEVELOPMENT:READ",
    "LOCAL_EXECUTION:EXECUTE",
    "LOCAL_EXECUTION:CANCEL",
    "AUDIT:READ",
  ],
  role: "OPERATOR",
};

export const CONTROL_ROOM_PREVIEW_CONTROL_PLANE: ControlPlaneView = {
  blockers: [
    {
      id: "task-platform-evidence",
      owner: { id: "human-platform-owner", type: "HUMAN" },
      status: "WAITING_APPROVAL",
    },
  ],
  next_actions: [{ action: "HUMAN_APPROVAL", id: "task-platform-evidence" }],
  summary: { alerts: 2, projects: 4, runs: 6, systems: 3, tasks: 12 },
  systems: [
    {
      health: "HEALTHY",
      id: "maos",
      lifecycle: "ACTIVE",
      name: "MAOS Core",
      owner: { id: "human-platform-owner", type: "HUMAN" },
      source_of_truth: "MAOS",
    },
    {
      health: "HEALTHY",
      id: "ai-memory-gateway",
      lifecycle: "ACTIVE",
      name: "AI Memory Gateway",
      owner: { id: "human-knowledge-owner", type: "HUMAN" },
      source_of_truth: "DOMAIN_SYSTEM",
    },
    {
      health: "UNKNOWN",
      id: "rbs-homes",
      lifecycle: "ACTIVE",
      name: "RBS Homes",
      owner: { id: "human-domain-owner", type: "HUMAN" },
      source_of_truth: "DOMAIN_SYSTEM",
    },
  ],
};

export const CONTROL_ROOM_PREVIEW_MEMORY_INTEGRATION = {
  average_latency_ms: 38,
  failure_rate: 0,
  gateway_id: "ai-memory-gateway",
  health: "HEALTHY",
  last_context_status: "READY" as const,
  provenance_issues: 0,
  ready: true,
  request_count: 24,
};

export const CONTROL_ROOM_PREVIEW_AI_MLS: AiMlsView = {
  blocked_tasks: 1,
  candidate_counts: { blocked: 1, pending: 6, verified: 3 },
  collection_status: "RUNNING",
  failed_runs: 1,
  health: "DEGRADED",
  ingestion_status: "DEGRADED",
  next_action: "Review failed ingestion and verification backlog",
  source_reference: "ai-mls://sources/internal-feed",
  stale_ingestions: 2,
  verification_backlog: 6,
};

export const CONTROL_ROOM_PREVIEW_CRM: CrmView = {
  blockers: 1,
  contract_deadlines: 2,
  health: "HEALTHY",
  next_actions: [
    "Confirm owner availability",
    "Review viewing confirmation draft",
  ],
  overdue_tasks: 1,
  source_reference: "crm://workspaces/employee-1/today",
  tasks_due_today: 4,
  upcoming_viewings: 2,
  workload: "BALANCED",
};

export const CONTROL_ROOM_PREVIEW_RBS_ADMIN: RbsAdminView = {
  approval_status: "NOT APPROVED",
  blockers: ["Admin API health evidence requires refresh"],
  handoff_status: "READY FOR HUMAN REVIEW",
  next_action: "Refresh Admin health before governed preview progression",
  production_deployment_approved: false,
  systems: [
    {
      api_health: "HEALTHY",
      artifact_reference: "artifact://rbs/preview-candidate",
      deployment_readiness: "NOT_READY",
      environment: "PREVIEW",
      health: "HEALTHY",
      id: "rbs-homes",
      last_verified_at: "2026-09-04T08:30:00Z",
      name: "RBS Homes",
      owner: "RBS Platform Owner",
      qa_status: "PASS",
      release_reference: "release://rbs/preview-candidate",
      rollback_readiness: "READY",
      source_commit: "commit-rbs-candidate",
      source_of_truth: "DOMAIN_SYSTEM",
      type: "PUBLIC_PLATFORM",
    },
    {
      api_health: "UNKNOWN",
      artifact_reference: "artifact://admin/preview-candidate",
      deployment_readiness: "UNKNOWN",
      environment: "PREVIEW",
      health: "UNKNOWN",
      id: "admin-rbs-homes",
      last_verified_at: "STALE",
      name: "Admin RBS Homes",
      owner: "Admin Platform Owner",
      qa_status: "WAITING",
      release_reference: "release://admin/preview-candidate",
      rollback_readiness: "UNKNOWN",
      source_commit: "commit-admin-candidate",
      source_of_truth: "DOMAIN_SYSTEM",
      type: "INTERNAL_PLATFORM",
    },
  ],
};

export const CONTROL_ROOM_PREVIEW_ERP_FINANCE: ErpFinanceView = {
  blocked_items: 2,
  deadline_risks: 1,
  erp_health: "HEALTHY",
  last_verified_at: "2026-09-05T10:00:00Z",
  missing_approvals: 1,
  next_deadline: "2026-09-10",
  open_obligations: 3,
  period_status: "OBSERVED",
  production_external_actions_enabled: false,
  risk_summary: { missing_data: 2, stale_or_unverified: 1 },
  team_roles: [
    "FINANCE_COMPLIANCE_LEAD",
    "PH_ACCOUNTING_AGENT",
    "PH_TAX_AGENT",
    "PAYROLL_STATUTORY_AGENT",
    "COMPLIANCE_QA_AGENT",
  ],
  work_items: 4,
};

export const CONTROL_ROOM_PREVIEW_HR_LABOR: HrLaborView = {
  attendance_exceptions: 2,
  blocked_approvals: 1,
  blocked_items: 3,
  deadline_risks: 2,
  hr_health: "HEALTHY",
  kpi_risks: 1,
  labor_agents: ["ANALYSIS / DRAFT", "COMPLIANCE REVIEW"],
  last_verified_at: "2026-09-06T10:00:00Z",
  leave_conflicts: 1,
  next_deadline: "2026-09-30",
  open_obligations: 4,
  production_external_actions_enabled: false,
  team_capacity: "CONSTRAINED",
  workload: "HIGH",
};

export const CONTROL_ROOM_PREVIEW_LEGAL_COMPLIANCE: LegalComplianceView = {
  blocked_reviews: 1,
  external_actions_enabled: false,
  high_risk_issues: 2,
  last_verified_at: "2026-09-06T10:00:00Z",
  next_deadline: "2026-09-30T00:00:00Z",
  next_action: "HUMAN_APPROVAL",
  open_deadlines: 4,
  owners: ["human-lawyer"],
  source_states: { current: 7, stale_or_unverified: 1 },
  source_status: "VERIFICATION_REQUIRED",
  team_roles: [
    "FINANCE_COMPLIANCE_LEAD",
    "CORPORATE_LEGAL_AGENT",
    "CONTRACT_REVIEW_AGENT",
    "REAL_ESTATE_LEGAL_AGENT",
    "REGULATORY_RESEARCH_AGENT",
    "LABOR_COMPLIANCE_AGENT",
    "COMPLIANCE_QA_AGENT",
  ],
  waiting_human_approval: 2,
  workload: 8,
};

export const CONTROL_ROOM_PREVIEW_ENTERPRISE: EnterpriseOrchestrationView = {
  approvals_required: 2,
  blockers: 3,
  briefing: {
    completed_work: 4,
    current_work: 7,
    failures: 1,
    major_risks: 2,
    recommended_next_actions: ["REVIEW_APPROVALS", "RESOLVE_BLOCKERS"],
    upcoming_deadlines: ["2026-09-12T00:00:00Z"],
    what_changed: ["ENTERPRISE_SIGNAL.RECORDED"],
  },
  external_mutations_enabled: false,
  goals: { active: 3, at_risk: 1, total: 5 },
  loops: { active: 2, total: 3 },
  plans: { active: 4, total: 6 },
  systems: { healthy: 7, total: 9, unhealthy: 2 },
  tasks: { active: 7, total: 12 },
};

export const CONTROL_ROOM_PREVIEW_OPERATIONS: OperationsView = {
  active_incidents: 1,
  alerts: [
    {
      affected_system: "ai-memory-gateway",
      owner_reference: "role:knowledge-operations",
      severity: "WARNING",
      state: "ACKNOWLEDGED",
    },
  ],
  backup: {
    last_verified_at: "2026-09-09T03:55:00Z",
    status: "RESTORE_ELIGIBLE",
  },
  degraded_systems: ["ai-memory-gateway"],
  dr: { classification: "SIMULATED", status: "EXERCISED_SIMULATED" },
  emergency_stops: 0,
  next_actions: ["Review integration recovery evidence"],
  overall_health: "DEGRADED",
  production_deployment_approved: false,
  production_gaps_open: 10,
  readiness: createConservativePhase12ReadinessAssessment(),
  recovery_state: "MITIGATING",
  security_warnings: 1,
};

export const CONTROL_ROOM_PREVIEW_OPTIMIZATION: OptimizationView = {
  approvals_needed: 1,
  candidates: [
    {
      activation_state: "INACTIVE",
      confidence: 0.86,
      expected_benefit: "Reduce repeated revision cycles",
      id: "candidate-workflow-evidence-gate",
      observed_pattern: "Repeated incomplete QA evidence",
      owner: "human-platform-reviewer",
      review_state: "PENDING",
      risk: "R2",
      type: "WORKFLOW",
    },
    {
      activation_state: "READY_FOR_ACTIVATION",
      confidence: 0.74,
      expected_benefit: "Lower development-loop latency and usage cost",
      id: "candidate-model-runner-policy",
      observed_pattern: "Repeated resource inefficiency",
      owner: "human-platform-approver",
      review_state: "APPROVED",
      risk: "R1",
      type: "MODEL",
    },
  ],
  cost_performance_signals: 2,
  production_deployment_approved: false,
  production_ready: false,
  recurring_issues: 3,
  recommended_next_actions: [
    "REVIEW candidate-workflow-evidence-gate",
    "VERIFY candidate-model-runner-policy binding",
  ],
  ux_findings: 1,
};

export interface ControlRoomServerOptions {
  ai_mls?: AiMlsView | undefined;
  control_plane?: ControlPlaneView | undefined;
  crm?: CrmView | undefined;
  erp_finance?: ErpFinanceView | undefined;
  enterprise?: EnterpriseOrchestrationView | undefined;
  hr_labor?: HrLaborView | undefined;
  identity?: ControlRoomIdentity | null;
  legal_compliance?: LegalComplianceView | undefined;
  memory_integration?:
    typeof CONTROL_ROOM_PREVIEW_MEMORY_INTEGRATION | undefined;
  operations?: OperationsView | undefined;
  optimization?: OptimizationView | undefined;
  rbs_admin?: RbsAdminView | undefined;
}

export function createControlRoomRequestHandler(
  options: ControlRoomServerOptions = {},
): RequestListener {
  const identity = options.identity ?? null;
  return (request, response) => {
    const requestId =
      request.headers["x-request-id"]?.toString() ?? randomUUID();
    const correlationId =
      request.headers["x-correlation-id"]?.toString() ?? randomUUID();
    const traceId = request.headers["x-trace-id"]?.toString() ?? randomUUID();
    const spanId = randomUUID();
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const html = renderControlRoom({
      ai_mls: options.ai_mls,
      control_plane: options.control_plane,
      crm: options.crm,
      erp_finance: options.erp_finance,
      enterprise: options.enterprise,
      hr_labor: options.hr_labor,
      context: {
        correlation_id: correlationId,
        request_id: requestId,
        span_id: spanId,
        trace_id: traceId,
      },
      identity,
      legal_compliance: options.legal_compliance,
      memory_integration: options.memory_integration,
      operations: options.operations,
      optimization: options.optimization,
      path,
      rbs_admin: options.rbs_admin,
    });
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "x-correlation-id": correlationId,
      "x-frame-options": "DENY",
      "x-request-id": requestId,
      "x-span-id": spanId,
      "x-trace-id": traceId,
    });
    response.end(html);
  };
}

export function createControlRoomServer(
  options: ControlRoomServerOptions = {},
): Server {
  return createServer(createControlRoomRequestHandler(options));
}

if (process.argv[1]?.endsWith("server.js")) {
  const preview = process.env.MAOS_UI_PREVIEW === "true";
  const port = Number(process.env.MAOS_WEB_PORT ?? "5180");
  const server = createControlRoomServer({
    ai_mls: preview ? CONTROL_ROOM_PREVIEW_AI_MLS : undefined,
    control_plane: preview ? CONTROL_ROOM_PREVIEW_CONTROL_PLANE : undefined,
    crm: preview ? CONTROL_ROOM_PREVIEW_CRM : undefined,
    erp_finance: preview ? CONTROL_ROOM_PREVIEW_ERP_FINANCE : undefined,
    enterprise: preview ? CONTROL_ROOM_PREVIEW_ENTERPRISE : undefined,
    hr_labor: preview ? CONTROL_ROOM_PREVIEW_HR_LABOR : undefined,
    identity: preview ? CONTROL_ROOM_PREVIEW_IDENTITY : null,
    legal_compliance: preview
      ? CONTROL_ROOM_PREVIEW_LEGAL_COMPLIANCE
      : undefined,
    memory_integration: preview
      ? CONTROL_ROOM_PREVIEW_MEMORY_INTEGRATION
      : undefined,
    operations: preview ? CONTROL_ROOM_PREVIEW_OPERATIONS : undefined,
    optimization: preview ? CONTROL_ROOM_PREVIEW_OPTIMIZATION : undefined,
    rbs_admin: preview ? CONTROL_ROOM_PREVIEW_RBS_ADMIN : undefined,
  });
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(
      `MAOS Control Room listening on http://127.0.0.1:${port}\n`,
    );
  });
}
