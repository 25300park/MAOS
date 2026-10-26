import type { Environment } from "@maos/config";
import {
  PostgresRequestClassificationRepository,
  PostgresWorkRequestRepository,
  RequestClassificationRuntime,
  type MigrationDatabase,
  type WorkRequestContext,
} from "@maos/database";
import type { ApiRoute } from "./app.js";
import { createClassificationRoutes } from "./classification-routes.js";

export interface ClassificationCompositionOptions {
  readonly environment: Environment;
  readonly scope: string;
  readonly requestContext: WorkRequestContext;
}

export type StagingClassificationCompositionConfig =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly environment: Environment;
      readonly scope: string;
      readonly requestContext: WorkRequestContext;
    };

export function composeStagingClassificationRoutes(
  database: MigrationDatabase | undefined,
  config: StagingClassificationCompositionConfig,
): ApiRoute[] {
  if (!config.enabled) return [];
  if (!database) throw new Error("CLASSIFICATION_DATABASE_REQUIRED");
  return composeClassificationRoutes(database, config);
}

export function composeClassificationRoutes(
  database: MigrationDatabase | undefined,
  options: ClassificationCompositionOptions,
): ApiRoute[] {
  if (!database) return [];
  const requests = new PostgresWorkRequestRepository(database);
  const repository = new PostgresRequestClassificationRepository(
    database,
    requests,
  );
  const runtime = new RequestClassificationRuntime({
    findRequest: (id) => requests.findRequest(id),
    findClassificationHead: (id) => repository.findClassificationHead(id),
    listClassificationHistory: (id) => repository.listClassificationHistory(id),
    findDomainConstraint: (id, version) =>
      repository.findDomainConstraint(id, version),
    appendClassification: (input) => repository.appendClassification(input),
  });
  return createClassificationRoutes(
    {
      findCurrent: async (requestId) => {
        try {
          return (
            await runtime.resolveCurrentClassification({
              requestId,
              ...options.requestContext,
            })
          ).classification;
        } catch (error) {
          if (
            error instanceof Error &&
            ["WORK_REQUEST_NOT_FOUND", "CLASSIFICATION_MISSING"].includes(
              error.message,
            )
          )
            return undefined;
          throw error;
        }
      },
      listHistory: (requestId) =>
        repository.listClassificationHistory(requestId),
    },
    options,
  );
}
