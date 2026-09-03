import type { Environment } from "@maos/config";
import type {
  ObservabilityAuditService,
  AuditRecord,
} from "@maos/module-observability";
import type { ApiRoute, ValidationResult } from "./app.js";

type Input = Record<string, unknown>;

function validate(value: unknown): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return {
      details: [{ code: "OBJECT_REQUIRED", field: "body" }],
      ok: false,
    };
  const input = value as Input;
  const invalid = ["action", "actor_id", "name", "project_id"].filter(
    (key) => input[key] !== undefined && typeof input[key] !== "string",
  );
  return invalid.length === 0
    ? { ok: true, value: input }
    : {
        details: invalid.map((field) => ({ code: "STRING_REQUIRED", field })),
        ok: false,
      };
}

export function createObservabilityRoutes(
  service: ObservabilityAuditService,
  options: {
    environment: Environment;
    project_ids: readonly string[];
    scope: string;
  },
): ApiRoute[] {
  const projectQuery = (input: Input) => ({
    ...(typeof input.project_id === "string"
      ? { project_id: input.project_id }
      : {}),
  });
  return [
    {
      access: {
        action: "READ",
        environment: options.environment,
        resource: "AUDIT",
        risk: "R0",
        scope: options.scope,
      },
      handle: ({ input }): AuditRecord[] => {
        const value = input as Input;
        return service.queryAudit(
          {
            ...(typeof value.action === "string"
              ? { action: value.action }
              : {}),
            ...(typeof value.actor_id === "string"
              ? { actor_id: value.actor_id }
              : {}),
            ...(typeof value.project_id === "string"
              ? { project_id: value.project_id }
              : {}),
          },
          { allowed: true, project_ids: options.project_ids },
        );
      },
      method: "POST",
      path: "/api/v1/audit/query",
      validate,
    },
    {
      access: {
        action: "READ",
        environment: options.environment,
        resource: "EVENT",
        risk: "R0",
        scope: options.scope,
      },
      handle: ({ input }) => {
        const value = input as Input;
        return service.queryEvents(
          {
            ...projectQuery(value),
            ...(typeof value.name === "string" ? { name: value.name } : {}),
          },
          { allowed: true, project_ids: options.project_ids },
        );
      },
      method: "POST",
      path: "/api/v1/events/query",
      validate,
    },
  ];
}
