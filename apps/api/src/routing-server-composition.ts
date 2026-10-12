import type { StagingPhase15dRoutingConfig } from "@maos/config";
import {
  CandidateResolutionService,
  composeRoutingAuthorityReadPorts,
  createExternalAidosAuthorityReadPort,
  createGovernedHumanApprovalAuthorityReadPort,
  createPhase15bRegistryAuthorityReadPort,
  createPhase15cClassificationAuthorityReadPort,
  PostgresPhase15dRoutingPolicyRepository,
  PostgresRoutingDecisionRepository,
  PostgresWorkRequestRepository,
  RoutingContractError,
  RoutingDecisionService,
  RoutingPolicyService,
  RoutingReadService,
  RoutingValidationService,
  type RuntimeDatabase,
} from "@maos/database";
import type { ApiRoute } from "./app.js";
import {
  createRoutingRoutes,
  type RoutingApiServices,
  type RoutingRouteOptions,
} from "./routing-routes.js";

export type StagingRoutingCompositionConfig =
  | { readonly enabled: false }
  | (Extract<StagingPhase15dRoutingConfig, { enabled: true }> &
      Pick<
        RoutingRouteOptions,
        "environment" | "requestContext" | "resolveOverrideAuthority"
      >);

export function createCanonicalRoutingServices(
  database: RuntimeDatabase,
  config: Pick<
    Extract<StagingPhase15dRoutingConfig, { enabled: true }>,
    "aidos"
  > & { readonly environment: RoutingRouteOptions["environment"] },
): RoutingApiServices {
  const workRequests = new PostgresWorkRequestRepository(database);
  const authorities = composeRoutingAuthorityReadPorts({
    classification: createPhase15cClassificationAuthorityReadPort(database),
    registry: createPhase15bRegistryAuthorityReadPort(
      database,
      config.environment.toUpperCase() as
        "DEVELOPMENT" | "PREVIEW" | "STAGING" | "PRODUCTION",
    ),
    approval: createGovernedHumanApprovalAuthorityReadPort(database),
    aidos: createExternalAidosAuthorityReadPort(config.aidos),
  });
  const registryAuthority = authorities.registry;
  const policyRepository = new PostgresPhase15dRoutingPolicyRepository(
    database,
  );
  const policies = new RoutingPolicyService(
    policyRepository,
    undefined,
    registryAuthority,
  );
  const repository = new PostgresRoutingDecisionRepository(database);
  const reads = new RoutingReadService({ repository });
  const validation = new RoutingValidationService({
    workRequests,
    classifications: authorities.classification,
    policies,
    candidates: new CandidateResolutionService(registryAuthority),
    approvals: authorities.approval,
    aidos: authorities.aidos,
    registry: registryAuthority,
  });
  const decisions = new RoutingDecisionService({ validation, repository });
  return Object.freeze({
    reads,
    decisions,
    resourceScopes: {
      resolveRequestScope: async (requestId: string) => {
        const request = await workRequests.findRequest(requestId);
        if (!request)
          throw new RoutingContractError("ROUTING_REQUEST_NOT_FOUND");
        return {
          organizationId: request.organizationId,
          projectId: request.projectId,
          scopeRef: request.projectScopeRef,
          environment: request.environment,
        };
      },
    },
    policies,
  });
}

function requireCompleteServices(services: RoutingApiServices): void {
  const required = [
    services.resourceScopes?.resolveRequestScope,
    services.reads?.getCurrentDecision,
    services.reads?.getDecisionHistory,
    services.reads?.getDecisionById,
    services.reads?.getDecisionCandidates,
    services.decisions?.createDecision,
    services.decisions?.applyHumanOverride,
    services.policies?.getPolicyVersion,
  ];
  if (required.some((dependency) => typeof dependency !== "function"))
    throw new Error("PHASE15D_ROUTING_SERVICES_INCOMPLETE");
}

export function composeStagingRoutingRoutes(
  servicesOrDatabase: RoutingApiServices | RuntimeDatabase | undefined,
  config: StagingRoutingCompositionConfig,
): ApiRoute[] {
  if (!config.enabled) return [];
  if (!servicesOrDatabase)
    throw new Error("PHASE15D_ROUTING_SERVICES_REQUIRED");
  const services =
    "query" in servicesOrDatabase
      ? createCanonicalRoutingServices(servicesOrDatabase, config)
      : servicesOrDatabase;
  requireCompleteServices(services);
  return createRoutingRoutes(services, {
    environment: config.environment,
    scope: config.scope,
    requestContext: config.requestContext,
    resolveOverrideAuthority: config.resolveOverrideAuthority,
  });
}
