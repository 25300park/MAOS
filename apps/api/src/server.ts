import { loadApiConfig } from "@maos/config";
import { createLogger } from "@maos/logging";
import { ControlPlaneRegistry } from "@maos/module-control-plane";
import { MemoryGatewayIntegration } from "@maos/module-knowledge";
import {
  AiMlsIntegrationService,
  MARKETING_ROLES,
  MarketingIntegrationService,
  RbsAdminPilotService,
  type DomainReadAdapter,
  type AiMlsAdapter,
  type MarketingAdapter,
} from "@maos/module-integration";
import { createApiServer } from "./app.js";
import { createAiMlsRoutes } from "./ai-mls-routes.js";
import { createControlPlaneRoutes } from "./control-plane-routes.js";
import { createMemoryGatewayRoutes } from "./memory-gateway-routes.js";
import { createMarketingRoutes } from "./marketing-routes.js";
import { createRbsAdminPilotRoutes } from "./rbs-admin-routes.js";

const config = loadApiConfig(process.env);
const logger = createLogger(config);
const unavailableAdapter: DomainReadAdapter = {
  mode: "READ_ONLY",
  read: async () => {
    throw new Error("No external RBS/Admin adapter is configured");
  },
};
const pilot = new RbsAdminPilotService(unavailableAdapter);
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
