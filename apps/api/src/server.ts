import { loadApiConfig } from "@maos/config";
import { createLogger } from "@maos/logging";
import { ControlPlaneRegistry } from "@maos/module-control-plane";
import {
  RbsAdminPilotService,
  type DomainReadAdapter,
} from "@maos/module-integration";
import { createApiServer } from "./app.js";
import { createControlPlaneRoutes } from "./control-plane-routes.js";
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
controlPlane.registerSystem({
  id: "maos",
  lifecycle: "ACTIVE",
  name: "MAOS",
  owner: { id: "human-platform-owner", type: "HUMAN" },
  source_of_truth: "MAOS",
  type: "INTERNAL_PLATFORM",
});
const routes = [
  ...createRbsAdminPilotRoutes(pilot, {
    environment: config.environment,
    scope: "project-maos",
  }),
  ...createControlPlaneRoutes(controlPlane, {
    environment: config.environment,
    system_ids: ["maos"],
  }),
];
const server = createApiServer({ ...config, logger, routes });

server.listen(config.port, "0.0.0.0", () => {
  logger.info("api listening", { port: config.port });
});
