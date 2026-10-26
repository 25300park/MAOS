import type { Environment } from "@maos/config";
import {
  AiRegistryReadService,
  PostgresAiRegistryRepository,
  type MigrationDatabase,
} from "@maos/database";
import type { ApiRoute } from "./app.js";
import { createAiRegistryRoutes } from "./ai-registry-routes.js";

export function composeAiRegistryRoutes(
  database: MigrationDatabase | undefined,
  options: { environment: Environment; scope: string },
): ApiRoute[] {
  if (!database) return [];
  const repository = new PostgresAiRegistryRepository(database);
  const service = new AiRegistryReadService(repository);
  return createAiRegistryRoutes(service, options);
}
