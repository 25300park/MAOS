import type { Environment } from "@maos/config";
import type {
  AiRegistryCapabilityView,
  AiRegistryHostView,
  AiRegistryModelCapabilityView,
  AiRegistryModelView,
  AiRegistryProviderView,
} from "@maos/database";
import { ApiRequestError, type ApiRoute } from "./app.js";

export interface AiRegistryReadPort {
  listProviders(): Promise<readonly AiRegistryProviderView[]>;
  findProvider(id: string): Promise<AiRegistryProviderView | undefined>;
  listModels(): Promise<readonly AiRegistryModelView[]>;
  findModel(id: string): Promise<AiRegistryModelView | undefined>;
  listHosts(): Promise<readonly AiRegistryHostView[]>;
  findHost(id: string): Promise<AiRegistryHostView | undefined>;
  listCapabilities(): Promise<readonly AiRegistryCapabilityView[]>;
  findCapability(id: string): Promise<AiRegistryCapabilityView | undefined>;
  listModelCapabilities(
    modelId: string,
  ): Promise<readonly AiRegistryModelCapabilityView[]>;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const STABLE_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const TAXONOMY_KEY = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u;

function identifier(raw: string | undefined): string {
  let value = "";
  try {
    value = decodeURIComponent(raw ?? "");
  } catch {
    value = "";
  }
  if (
    value.length === 0 ||
    value.length > 128 ||
    (!UUID.test(value) && !STABLE_KEY.test(value) && !TAXONOMY_KEY.test(value))
  ) {
    throw new ApiRequestError(422, {
      code: "AI_REGISTRY_IDENTIFIER_INVALID",
      details: {},
      retryable: false,
      severity: "INFO",
      type: "VALIDATION",
    });
  }
  return value;
}

async function resolveEntity<T>(
  id: string,
  find: (id: string) => Promise<T | undefined>,
  list: () => Promise<readonly T[]>,
  key: (entity: T) => string,
): Promise<T | undefined> {
  if (UUID.test(id)) return find(id);
  const matches = (await list()).filter((entity) => key(entity) === id);
  return matches.length === 1 ? matches[0] : undefined;
}

function notFound(entity: string): never {
  throw new ApiRequestError(404, {
    code: "AI_REGISTRY_ENTITY_NOT_FOUND",
    details: { entity },
    retryable: false,
    severity: "INFO",
    type: "NOT_FOUND",
  });
}

const providerResponse = (value: AiRegistryProviderView) => ({
  defaultRegion: value.defaultRegion,
  displayName: value.displayName,
  healthState: value.healthState,
  id: value.id,
  providerKey: value.providerKey,
  providerType: value.providerType,
  readinessState: value.readinessState,
  status: value.status,
  version: value.version,
});

const modelResponse = (value: AiRegistryModelView) => ({
  displayName: value.displayName,
  healthState: value.healthState,
  id: value.id,
  lifecycle: value.lifecycle,
  modelFamily: value.modelFamily,
  modelKey: value.modelKey,
  modelVersion: value.modelVersion,
  providerId: value.providerId,
  readinessState: value.readinessState,
  version: value.version,
});

const hostResponse = (value: AiRegistryHostView) => ({
  adapterRef: value.adapterRef,
  displayName: value.displayName,
  executionMode: value.executionMode,
  healthState: value.healthState,
  hostKey: value.hostKey,
  hostType: value.hostType,
  id: value.id,
  interactiveRequired: value.interactiveRequired,
  networkRequired: value.networkRequired,
  providerId: value.providerId,
  readinessState: value.readinessState,
  status: value.status,
  version: value.version,
});

const capabilityResponse = (value: AiRegistryCapabilityView) => ({
  capabilityClass: value.capabilityClass,
  capabilityKey: value.capabilityKey,
  description: value.description,
  id: value.id,
  status: value.status,
  version: value.version,
});

const modelCapabilityResponse = (value: AiRegistryModelCapabilityView) => ({
  capabilityClass: value.capabilityClass,
  capabilityId: value.capabilityId,
  capabilityKey: value.capabilityKey,
  confidenceClass: value.confidenceClass,
  description: value.description,
  hostId: value.hostId,
  hostKey: value.hostKey,
  id: value.id,
  modelHostBindingId: value.modelHostBindingId,
  modelId: value.modelId,
  status: value.status,
  supportLevel: value.supportLevel,
  verificationFreshness: value.verificationFreshness,
  verifiedAt: value.verifiedAt,
  version: value.version,
});

export function createAiRegistryRoutes(
  service: AiRegistryReadPort,
  options: { environment: Environment; scope: string },
): ApiRoute[] {
  const access = {
    action: "READ",
    environment: options.environment,
    resource: "SYSTEM",
    risk: "R0",
    scope: options.scope,
  } as const;
  return [
    {
      access,
      handle: async () => ({
        entities: (await service.listProviders()).map(providerResponse),
      }),
      method: "GET",
      path: "/api/v1/ai-registry/providers",
    },
    {
      access,
      handle: async ({ params }) => {
        const id = identifier(params.id);
        const entity = await resolveEntity(
          id,
          (value) => service.findProvider(value),
          () => service.listProviders(),
          (value) => value.providerKey,
        );
        return {
          entity: entity ? providerResponse(entity) : notFound("PROVIDER"),
        };
      },
      method: "GET",
      path: "/api/v1/ai-registry/providers/:id",
    },
    {
      access,
      handle: async () => ({
        entities: (await service.listModels()).map(modelResponse),
      }),
      method: "GET",
      path: "/api/v1/ai-registry/models",
    },
    {
      access,
      handle: async ({ params }) => {
        const id = identifier(params.id);
        const entity = await resolveEntity(
          id,
          (value) => service.findModel(value),
          () => service.listModels(),
          (value) => value.modelKey,
        );
        return { entity: entity ? modelResponse(entity) : notFound("MODEL") };
      },
      method: "GET",
      path: "/api/v1/ai-registry/models/:id",
    },
    {
      access,
      handle: async () => ({
        entities: (await service.listHosts()).map(hostResponse),
      }),
      method: "GET",
      path: "/api/v1/ai-registry/hosts",
    },
    {
      access,
      handle: async ({ params }) => {
        const id = identifier(params.id);
        const entity = await resolveEntity(
          id,
          (value) => service.findHost(value),
          () => service.listHosts(),
          (value) => value.hostKey,
        );
        return { entity: entity ? hostResponse(entity) : notFound("HOST") };
      },
      method: "GET",
      path: "/api/v1/ai-registry/hosts/:id",
    },
    {
      access,
      handle: async () => ({
        entities: (await service.listCapabilities()).map(capabilityResponse),
      }),
      method: "GET",
      path: "/api/v1/ai-registry/capabilities",
    },
    {
      access,
      handle: async ({ params }) => {
        const id = identifier(params.id);
        const entity = await resolveEntity(
          id,
          (value) => service.findCapability(value),
          () => service.listCapabilities(),
          (value) => value.capabilityKey,
        );
        return {
          entity: entity ? capabilityResponse(entity) : notFound("CAPABILITY"),
        };
      },
      method: "GET",
      path: "/api/v1/ai-registry/capabilities/:id",
    },
    {
      access,
      handle: async ({ params }) => {
        const id = identifier(params.id);
        const entity = await resolveEntity(
          id,
          (value) => service.findModel(value),
          () => service.listModels(),
          (value) => value.modelKey,
        );
        if (!entity) notFound("MODEL");
        return {
          entities: (await service.listModelCapabilities(entity.id)).map(
            modelCapabilityResponse,
          ),
        };
      },
      method: "GET",
      path: "/api/v1/ai-registry/models/:id/capabilities",
    },
  ];
}
