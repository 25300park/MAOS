import { loadApiConfig } from "@maos/config";
import { createLogger } from "@maos/logging";
import { ControlPlaneRegistry } from "@maos/module-control-plane";
import { MemoryGatewayIntegration } from "@maos/module-knowledge";
import { ObservabilityAuditService } from "@maos/module-observability";
import {
  MonitoringReadiness,
  OperationsHardeningService,
} from "@maos/module-operations";
import {
  EnterpriseOrchestrationService,
  type EnterpriseSystemReference,
} from "@maos/module-orchestration";
import {
  AiMlsIntegrationService,
  ACCOUNTING_TAX_ROLES,
  ACCOUNTING_TAX_ROLE_CAPABILITIES,
  CrmHumanWorkService,
  ErpAccountingTaxService,
  HR_CAPABILITIES,
  HrLaborService,
  LABOR_AGENT_CAPABILITIES,
  LEGAL_ROLE_CAPABILITIES,
  LEGAL_TEAM_ROLES,
  MARKETING_ROLES,
  MarketingIntegrationService,
  PhLegalRegulatoryService,
  InMemoryHandoffEvidenceRegistry,
  RbsAdminPilotService,
  type DomainReadAdapter,
  type AiMlsAdapter,
  type CrmAdapter,
  type ErpAccountingTaxAdapter,
  type HrLaborAdapter,
  type MarketingAdapter,
  type OfficialSourceAdapter,
} from "@maos/module-integration";
import { createApiServer } from "./app.js";
import { createAiMlsRoutes } from "./ai-mls-routes.js";
import { createCrmRoutes } from "./crm-routes.js";
import { createErpAccountingTaxRoutes } from "./erp-accounting-tax-routes.js";
import { createEnterpriseOrchestrationRoutes } from "./enterprise-orchestration-routes.js";
import { createHrLaborRoutes } from "./hr-labor-routes.js";
import { createPhLegalRegulatoryRoutes } from "./ph-legal-regulatory-routes.js";
import { createControlPlaneRoutes } from "./control-plane-routes.js";
import { createMemoryGatewayRoutes } from "./memory-gateway-routes.js";
import { createMarketingRoutes } from "./marketing-routes.js";
import { createObservabilityRoutes } from "./observability-routes.js";
import { createOperationsRoutes } from "./operations-routes.js";
import { createRbsAdminPilotRoutes } from "./rbs-admin-routes.js";

const config = loadApiConfig(process.env);
const logger = createLogger(config);
const unavailableAdapter: DomainReadAdapter = {
  mode: "READ_ONLY",
  read: async () => {
    throw new Error("No external RBS/Admin adapter is configured");
  },
};
const handoffEvidence = new InMemoryHandoffEvidenceRegistry();
const pilot = new RbsAdminPilotService(
  unavailableAdapter,
  undefined,
  undefined,
  undefined,
  handoffEvidence,
);
const unavailableAiMlsAdapter: AiMlsAdapter = {
  mode: "INTERNAL_READ_ONLY",
  observeIntake: async () => {
    throw new Error("No external AI-MLS adapter is configured");
  },
  searchInternal: async () => {
    throw new Error("No external AI-MLS adapter is configured");
  },
};
const aiMls = new AiMlsIntegrationService(unavailableAiMlsAdapter);
aiMls.registerSystem({
  actor: { id: "human-ai-mls-owner", type: "HUMAN" },
  capabilities: [
    "READ_SOURCE_STATUS",
    "READ_CANDIDATE_STATUS",
    "SEARCH_INTERNAL",
    "READ_TASK_STATUS",
    "SIMULATE_HANDOFF",
  ],
  correlation_id: "bootstrap:ai-mls-integration",
  credential_reference: "secretref://ai-mls/readonly",
  environment_reference: "configref://ai-mls/internal",
  health: "UNKNOWN",
  id: "ai-mls",
  integration_state: "REGISTERED",
  name: "AI-MLS",
  owner_actor_id: "human-ai-mls-owner",
  repository_reference: "registry://ai-mls/repository",
  source_of_truth: "DOMAIN_SYSTEM",
  type: "INTERNAL_PLATFORM",
  version_reference: "gitref://ai-mls/main",
  visibility: "INTERNAL_ONLY",
  workroot_reference: "workroot://ai-mls",
});
const unavailableCrmAdapter: CrmAdapter = {
  mode: "GOVERNED_REFERENCE_ONLY",
  observeWork: async () => {
    throw new Error("No external CRM adapter is configured");
  },
  structureCapture: async () => {
    throw new Error("No external CRM adapter is configured");
  },
};
const crm = new CrmHumanWorkService(unavailableCrmAdapter);
crm.registerSystem({
  actor: { id: "human-crm-owner", type: "HUMAN" },
  capabilities: [
    "READ_WORK",
    "CAPTURE_WORK",
    "DRAFT_DOCUMENT",
    "SIMULATE_AI_MLS_SEARCH",
  ],
  correlation_id: "bootstrap:crm-integration",
  credential_reference: "secretref://crm/integration",
  environment_reference: "configref://crm/development",
  health: "UNKNOWN",
  id: "crm",
  integration_state: "REGISTERED",
  name: "CRM / Brokerage",
  owner_actor_id: "human-crm-owner",
  repository_reference: "registry://crm/repository",
  source_of_truth: "DOMAIN_SYSTEM",
  type: "DOMAIN_APPLICATION",
  version_reference: "gitref://crm/main",
  workroot_reference: "workroot://crm",
});
const unavailableErpAdapter: ErpAccountingTaxAdapter = {
  mode: "GOVERNED_REFERENCE_ONLY",
  observeFinance: async () => {
    throw new Error("No external ERP adapter is configured");
  },
  observeObligations: async () => {
    throw new Error("No external ERP adapter is configured");
  },
};
const erpObservability = new ObservabilityAuditService();
const erpObservationContext = (
  correlationId: string,
  systemId: string,
  projectId?: string,
) => ({
  correlation_id: correlationId,
  ...(projectId ? { project_id: projectId } : {}),
  request_id: `erp:${correlationId}`,
  span_id: `erp:${correlationId}:span`,
  system_id: systemId,
  trace_id: `erp:${correlationId}:trace`,
});
const erp = new ErpAccountingTaxService(
  unavailableErpAdapter,
  undefined,
  (event) =>
    erpObservability.recordEvent({
      context: erpObservationContext(
        event.correlation_id,
        event.system_id,
        event.project_id,
      ),
      name: event.name,
      payload: {
        evidence_refs: event.evidence_refs,
        ...(event.error_code ? { error_code: event.error_code } : {}),
        ...(event.work_id ? { work_id: event.work_id } : {}),
      },
    }),
  {
    record: (record) =>
      erpObservability.recordAudit({
        action: record.action.includes(".")
          ? record.action
          : `ERP.${record.action}`,
        actor: record.actor,
        context: erpObservationContext(
          record.correlation_id,
          record.system_id ?? "erp",
          record.project_id,
        ),
        evidence_refs: record.evidence_refs,
        ...(record.error_code
          ? { metadata: { error_code: record.error_code } }
          : {}),
        result: record.result,
        target: record.target,
      }),
  },
  {
    evaluate: () => ({
      allowed: false,
      authority: "UNKNOWN",
      validity: "AUTHORITY_INVALID",
    }),
  },
);
erp.registerSystem({
  actor: { id: "human-finance-owner", type: "HUMAN" },
  capabilities: [
    "READ_FINANCE_SUMMARY",
    "READ_OBLIGATIONS",
    "PREPARE_COMPLIANCE_WORK",
  ],
  correlation_id: "bootstrap:erp-accounting-tax",
  credential_reference: "secretref://erp/readonly",
  environment_reference: "configref://erp/development",
  health: "UNKNOWN",
  id: "erp",
  integration_state: "REGISTERED",
  name: "ERP / Accounting",
  owner_actor_id: "human-finance-owner",
  repository_reference: "registry://erp/repository",
  source_of_truth: "DOMAIN_SYSTEM",
  type: "DOMAIN_APPLICATION",
  version_reference: "gitref://erp/main",
  workroot_reference: "workroot://erp",
});
erp.registerTeam({
  actor: { id: "human-finance-owner", type: "HUMAN" },
  correlation_id: "bootstrap:erp-accounting-tax",
  members: ACCOUNTING_TAX_ROLES.map((role) => ({
    agent_id: `agent-${role.toLowerCase()}`,
    assignment_state: "UNASSIGNED" as const,
    capabilities: ACCOUNTING_TAX_ROLE_CAPABILITIES[role],
    role,
    status: "OFFLINE" as const,
  })),
  system_id: "erp",
});
const unavailableHrAdapter: HrLaborAdapter = {
  mode: "GOVERNED_REFERENCE_ONLY",
  observeOperations: async () => {
    throw new Error("No external ERP/HR adapter is configured");
  },
  observeStatutoryObligations: async () => {
    throw new Error("No external ERP/HR adapter is configured");
  },
};
const hr = new HrLaborService(
  unavailableHrAdapter,
  undefined,
  (event) =>
    erpObservability.recordEvent({
      context: erpObservationContext(
        event.correlation_id,
        event.system_id,
        event.project_id,
      ),
      name: event.name,
      payload: {
        evidence_refs: event.evidence_refs,
        ...(event.error_code ? { error_code: event.error_code } : {}),
        ...(event.work_id ? { work_id: event.work_id } : {}),
      },
    }),
  {
    record: (record) =>
      erpObservability.recordAudit({
        action: record.action.includes(".")
          ? record.action
          : `HR.${record.action}`,
        actor: record.actor,
        context: erpObservationContext(
          record.correlation_id,
          record.system_id ?? "erp-hr",
          record.project_id,
        ),
        evidence_refs: record.evidence_refs,
        ...(record.error_code
          ? { metadata: { error_code: record.error_code } }
          : {}),
        result: record.result,
        target: record.target,
      }),
  },
  {
    evaluate: () => ({
      allowed: false,
      authority: "UNKNOWN",
      validity: "AUTHORITY_INVALID",
    }),
  },
);
hr.registerSystem({
  actor: { id: "human-hr-owner", type: "HUMAN" },
  capabilities: HR_CAPABILITIES,
  correlation_id: "bootstrap:hr-labor",
  credential_reference: "secretref://erp-hr/readonly",
  environment_reference: "configref://erp-hr/development",
  health: "UNKNOWN",
  id: "erp-hr",
  integration_state: "REGISTERED",
  name: "ERP / HR",
  owner_actor_id: "human-hr-owner",
  repository_reference: "registry://erp-hr/repository",
  source_of_truth: "DOMAIN_SYSTEM",
  type: "DOMAIN_APPLICATION",
  version_reference: "gitref://erp-hr/main",
  workroot_reference: "workroot://erp-hr",
});
hr.registerLaborAgents({
  actor: { id: "human-hr-owner", type: "HUMAN" },
  agents: (["ANALYSIS_DRAFT", "COMPLIANCE_REVIEW"] as const).map(
    (assignment) => ({
      agent_id: `agent-labor-${assignment.toLowerCase()}`,
      assignment,
      capabilities: LABOR_AGENT_CAPABILITIES[assignment],
      status: "OFFLINE" as const,
    }),
  ),
  correlation_id: "bootstrap:hr-labor",
  system_id: "erp-hr",
});
const unavailableOfficialSourceAdapter: OfficialSourceAdapter = {
  health: "UNAVAILABLE",
  mode: "OFFICIAL_SOURCE_REFERENCE_ONLY",
  verify: async () => {
    throw new Error("No approved official-source adapter is configured");
  },
};
const legal = new PhLegalRegulatoryService(
  unavailableOfficialSourceAdapter,
  undefined,
  (event) =>
    erpObservability.recordEvent({
      context: erpObservationContext(
        event.correlation_id,
        "ph-legal-regulatory",
        event.project_id,
      ),
      name: event.name,
      payload: {
        evidence_refs: event.evidence_refs,
        ...(event.error_code ? { error_code: event.error_code } : {}),
        ...(event.governance ? { governance: event.governance } : {}),
        ...(event.work_id ? { work_id: event.work_id } : {}),
      },
    }),
  {
    record: (record) =>
      erpObservability.recordAudit({
        action: record.action.includes(".")
          ? record.action
          : `LEGAL.${record.action}`,
        actor: record.actor,
        context: erpObservationContext(
          record.correlation_id,
          "ph-legal-regulatory",
          record.project_id,
        ),
        evidence_refs: record.evidence_refs,
        ...(record.error_code || record.governance
          ? {
              metadata: {
                ...(record.error_code ? { error_code: record.error_code } : {}),
                ...(record.governance ? { governance: record.governance } : {}),
              },
            }
          : {}),
        result: record.result,
        target: record.target,
      }),
  },
  {
    evaluate: () => ({
      allowed: false,
      authority: "UNKNOWN",
      validity: "AUTHORITY_INVALID",
    }),
  },
);
legal.registerTeam({
  actor: { id: "human-legal-owner", type: "HUMAN" },
  correlation_id: "bootstrap:ph-legal-regulatory",
  members: LEGAL_TEAM_ROLES.map((role) => ({
    agent_id: `agent-${role.toLowerCase()}`,
    capabilities: LEGAL_ROLE_CAPABILITIES[role],
    role,
    status: "OFFLINE" as const,
  })),
});
const unavailableMarketingAdapter: MarketingAdapter = {
  mode: "READ_ONLY_SIMULATION",
  observeCampaign: async () => {
    throw new Error("No external Marketing adapter is configured");
  },
};
const marketing = new MarketingIntegrationService(unavailableMarketingAdapter);
marketing.registerSystem({
  actor: { id: "human-marketing-owner", type: "HUMAN" },
  capabilities: [
    "READ_CAMPAIGN_STATUS",
    "READ_TEAM_STATUS",
    "READ_KPI_STATUS",
    "SIMULATE_PUBLISH",
  ],
  correlation_id: "bootstrap:marketing-integration",
  credential_reference: "secretref://marketing-automation/readonly",
  environment_reference: "configref://marketing-automation/preview",
  health: "UNKNOWN",
  id: "marketing-automation",
  integration_state: "REGISTERED",
  name: "Marketing Automation",
  owner_actor_id: "human-marketing-owner",
  repository_reference: "registry://marketing-automation/repository",
  source_of_truth: "DOMAIN_SYSTEM",
  type: "AI_AGENT_SYSTEM",
  version_reference: "gitref://marketing-automation/main",
  workroot_reference: "workroot://marketing-automation",
});
marketing.registerTeam({
  actor: { id: "human-marketing-owner", type: "HUMAN" },
  correlation_id: "bootstrap:marketing-integration",
  members: MARKETING_ROLES.map((role) => ({
    assignment_state: "UNASSIGNED" as const,
    capabilities: ["STATUS_VISIBILITY"],
    current_work_reference: `marketing://agents/${role.toLowerCase()}`,
    external_agent_id: `marketing-${role.toLowerCase()}`,
    health: "UNKNOWN" as const,
    role,
    status: "OFFLINE" as const,
  })),
  system_id: "marketing-automation",
});
for (const system of [
  { id: "rbs-homes", name: "RBS Homes", type: "PUBLIC_PLATFORM" as const },
  {
    id: "admin-rbs-homes",
    name: "Admin RBS Homes",
    type: "INTERNAL_PLATFORM" as const,
  },
])
  pilot.registerSystem({
    actor: { id: "human-platform-owner", type: "HUMAN" },
    capabilities: [
      "READ_SYSTEM_STATUS",
      "READ_REPOSITORY_STATUS",
      "READ_ENVIRONMENT_METADATA",
      "READ_VERSION_METADATA",
      "READ_DEPLOYMENT_READINESS",
    ],
    correlation_id: "bootstrap:rbs-admin-pilot",
    credential_reference: `secretref://${system.id}/pilot-readonly`,
    deployment_reference: `registry://${system.id}/deployment`,
    environment_reference: `registry://${system.id}/environment`,
    health_reference: `registry://${system.id}/health`,
    hosting_reference: `registry://${system.id}/infrastructure`,
    integration_owner_id: "human-platform-owner",
    maturity: "I2",
    repository_reference: `registry://${system.id}/repository`,
    source_of_truth: "DOMAIN_SYSTEM",
    workroot_reference: `workroot://${system.id}`,
    ...system,
  });
const controlPlane = new ControlPlaneRegistry();
const operationsMonitoring = new MonitoringReadiness();
const operations = new OperationsHardeningService(
  () => new Date(),
  operationsMonitoring,
);
const enterpriseSystems: EnterpriseSystemReference[] = [
  { health: "HEALTHY", id: "maos", source_of_truth: "MAOS" },
  {
    health: "UNKNOWN",
    id: "ai-memory-gateway",
    source_of_truth: "DOMAIN_SYSTEM",
  },
  {
    health: "UNKNOWN",
    id: "marketing-automation",
    source_of_truth: "DOMAIN_SYSTEM",
  },
  { health: "UNKNOWN", id: "ai-mls", source_of_truth: "DOMAIN_SYSTEM" },
  { health: "UNKNOWN", id: "crm", source_of_truth: "DOMAIN_SYSTEM" },
  { health: "UNKNOWN", id: "rbs-homes", source_of_truth: "DOMAIN_SYSTEM" },
  {
    health: "UNKNOWN",
    id: "admin-rbs-homes",
    source_of_truth: "DOMAIN_SYSTEM",
  },
  { health: "UNKNOWN", id: "erp", source_of_truth: "DOMAIN_SYSTEM" },
  { health: "UNKNOWN", id: "erp-hr", source_of_truth: "DOMAIN_SYSTEM" },
  {
    health: "UNKNOWN",
    id: "ph-legal-regulatory",
    source_of_truth: "DOMAIN_SYSTEM",
  },
];
const enterprise = new EnterpriseOrchestrationService(
  enterpriseSystems,
  undefined,
  {
    evaluate: ({ approval_id }) => ({
      allowed: false,
      approval_id,
      authority: "UNKNOWN",
    }),
  },
);
for (const system of enterpriseSystems)
  operations.registerTarget({
    environment: "DEVELOPMENT",
    health: system.health,
    id: `${system.id}-integration`,
    kind: system.id === "maos" ? "APPLICATION" : "INTEGRATION",
    owner_reference:
      system.id === "maos"
        ? "role:platform-operations"
        : "role:integration-owner",
    system_id: system.id,
  });
const memoryGateway = new MemoryGatewayIntegration();
memoryGateway.registerGateway(
  {
    credential_ref: "secret://ai-memory-gateway/service-token",
    endpoint: "https://ai-memory-gateway.internal/v1",
    health: "UNKNOWN",
    id: "ai-memory-gateway",
    lifecycle: "ACTIVE",
    name: "AI Memory Gateway",
  },
  {
    retrieve: async () => {
      throw new Error("No AI Memory Gateway adapter is configured");
    },
  },
);
controlPlane.registerSystem({
  id: "maos",
  lifecycle: "ACTIVE",
  name: "MAOS",
  owner: { id: "human-platform-owner", type: "HUMAN" },
  source_of_truth: "MAOS",
  type: "INTERNAL_PLATFORM",
});
const routes = [
  ...createOperationsRoutes(
    operations,
    {
      environment: config.environment,
      scope: "project-maos",
    },
    erpObservability,
  ),
  ...createObservabilityRoutes(erpObservability, {
    environment: config.environment,
    project_ids: ["project-maos"],
    scope: "project-maos",
  }),
  ...createEnterpriseOrchestrationRoutes(enterprise, {
    environment: config.environment,
    scope: "project-maos",
  }),
  ...createErpAccountingTaxRoutes(erp, {
    environment: config.environment,
    scope: "project-maos",
  }),
  ...createHrLaborRoutes(hr, {
    environment: config.environment,
    scope: "project-maos",
  }),
  ...createPhLegalRegulatoryRoutes(legal, {
    environment: config.environment,
    scope: "project-maos",
  }),
  ...createCrmRoutes(crm, {
    environment: config.environment,
    scope: "project-maos",
  }),
  ...createAiMlsRoutes(aiMls, {
    environment: config.environment,
    scope: "project-maos",
  }),
  ...createMarketingRoutes(marketing, {
    environment: config.environment,
    scope: "project-maos",
  }),
  ...createRbsAdminPilotRoutes(pilot, {
    environment: config.environment,
    scope: "project-maos",
  }),
  ...createControlPlaneRoutes(controlPlane, {
    environment: config.environment,
    system_ids: ["maos"],
  }),
  ...createMemoryGatewayRoutes(memoryGateway, {
    environment: config.environment,
    resolvePolicy: () => ({
      allowed_classifications: ["PUBLIC", "INTERNAL"],
      allowed_namespaces: [
        "/projects",
        "/tasks",
        "/decisions",
        "/artifacts",
        "/policies",
      ],
      allowed_types: ["PROJECT", "TASK", "DECISION", "POLICY"],
    }),
    scope: "project-maos",
  }),
];
const server = createApiServer({ ...config, logger, routes });

server.listen(config.port, "0.0.0.0", () => {
  logger.info("api listening", { port: config.port });
});
