import type { SystemsReadInput, SystemReadRecord } from "@maos/database";
import { ApiRequestError, type ApiRoute } from "./app.js";

export function createSystemsReadRoutes(
  repository:
    { list(input: SystemsReadInput): Promise<SystemReadRecord[]> } | undefined,
  binding: {
    environment: string;
    scope: string;
    projectId: string | undefined;
  },
): ApiRoute[] {
  const bound = Object.freeze({ ...binding });
  return [
    {
      method: "GET",
      path: "/api/v1/systems",
      access: {
        resource: "SYSTEM",
        action: "READ",
        risk: "R0",
        environment: bound.environment,
        scope: bound.scope,
      },
      handle: async ({ identity }) => {
        if (!identity || identity.actor_type !== "HUMAN")
          throw new ApiRequestError(403, {
            code: "SYSTEMS_READ_RESTRICTED",
            type: "AUTHORIZATION",
            severity: "INFO",
            retryable: false,
            details: {},
          });
        if (
          !repository ||
          bound.environment !== "staging" ||
          !bound.projectId ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
            bound.projectId,
          )
        )
          throw new ApiRequestError(503, {
            code: "SYSTEMS_READ_UNAVAILABLE",
            type: "DEPENDENCY",
            severity: "WARNING",
            retryable: false,
            details: {},
          });
        const rows = await repository.list({
          actorId: identity.actor_id,
          projectId: bound.projectId,
          scope: bound.scope,
          environment: "staging",
        });
        return {
          entity: {
            systems: rows.map((s) => ({
              id: s.id,
              name: s.name,
              lifecycle: s.lifecycle,
              source_of_truth: s.source_of_truth,
              owner: { id: s.owner.id, type: s.owner.type },
              health: s.health,
            })),
          },
        };
      },
    },
  ];
}
