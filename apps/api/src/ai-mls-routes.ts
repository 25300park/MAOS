import type { Environment } from "@maos/config";
import {
  AiMlsIntegrationError,
  type AiMlsIntegrationService,
} from "@maos/module-integration";
import type { IdentityContext } from "@maos/module-identity";
import {
  ApiRequestError,
  type ApiRoute,
  type ValidationResult,
} from "./app.js";

type Input = Record<string, unknown>;
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const validateBase =
  (includeCriteria: boolean) =>
  (value: unknown): ValidationResult => {
    const input =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Input)
        : null;
    const fields = [
      "max_age_ms",
      "project_id",
      "resource_id",
      "system_id",
      "task_id",
      "timeout_ms",
      ...(includeCriteria ? ["criteria"] : []),
    ];
    const invalid = fields.filter(
      (field) => input?.[field] === undefined || input[field] === null,
    );
    for (const field of ["project_id", "resource_id", "system_id", "task_id"])
      if (input && !nonempty(input[field]) && !invalid.includes(field))
        invalid.push(field);
    for (const field of ["max_age_ms", "timeout_ms"])
      if (
        input &&
        (!Number.isSafeInteger(input[field]) || (input[field] as number) < 1) &&
        !invalid.includes(field)
      )
        invalid.push(field);
    if (includeCriteria && input) {
      const criteria =
        input.criteria &&
        typeof input.criteria === "object" &&
        !Array.isArray(input.criteria)
          ? (input.criteria as Input)
          : null;
      if (
        !criteria ||
        !Array.isArray(criteria.region_codes) ||
        criteria.region_codes.length === 0 ||
        !criteria.region_codes.every(nonempty)
      )
        invalid.push("criteria");
    }
    return input && invalid.length === 0
      ? { ok: true, value: input }
      : {
          ok: false,
          details: [...new Set(invalid)].map((field) => ({
            code: "INVALID",
            field,
          })),
        };
  };
const actor = (identity: IdentityContext | null) => {
  if (!identity) throw new Error("Authenticated AI-MLS route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
};
async function execute(operation: () => unknown | Promise<unknown>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AiMlsIntegrationError)
      throw new ApiRequestError(
        error.code.includes("DENIED") || error.code.includes("FORBIDDEN")
          ? 403
          : 409,
        {
          code: error.code,
          details: {},
          retryable: [
            "AI_MLS_SOURCE_UNAVAILABLE",
            "AI_MLS_READ_TIMED_OUT",
          ].includes(error.code),
          severity: "INFO",
          type: "INTEGRATION_BOUNDARY",
        },
      );
    throw error;
  }
}

export function createAiMlsRoutes(
  runtime: AiMlsIntegrationService,
  options: { environment: Environment; scope: string },
): ApiRoute[] {
  const access = {
    action: "READ",
    environment: options.environment,
    resource: "AI_MLS_INTEGRATION",
    risk: "R0" as const,
    scope: options.scope,
  };
  const read = (
    context: { correlation_id: string },
    identity: IdentityContext | null,
    value: Input,
  ) => ({
    actor: actor(identity),
    correlation_id: context.correlation_id,
    max_age_ms: value.max_age_ms as number,
    permission_allowed: true,
    project_id: value.project_id as string,
    resource_id: value.resource_id as string,
    system_id: value.system_id as string,
    task_id: value.task_id as string,
    timeout_ms: value.timeout_ms as number,
  });
  const scope = (value: Input) => {
    if (value.project_id !== options.scope)
      throw new ApiRequestError(403, {
        code: "AI_MLS_SCOPE_MISMATCH",
        details: {},
        retryable: false,
        severity: "INFO",
        type: "AUTHORIZATION",
      });
  };
  return [
    {
      access,
      handle: () => runtime.readiness(),
      method: "GET",
      path: "/api/v1/integrations/ai-mls/health",
    },
    {
      access,
      handle: () => runtime.getSystem("ai-mls"),
      method: "GET",
      path: "/api/v1/integrations/ai-mls/system",
    },
    {
      access,
      method: "POST",
      path: "/api/v1/integrations/ai-mls/intake",
      validate: validateBase(false),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scope(value);
        return execute(() =>
          runtime.observeIntake(read(context, identity, value)),
        );
      },
    },
    {
      access,
      method: "POST",
      path: "/api/v1/integrations/ai-mls/search",
      validate: validateBase(true),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scope(value);
        return execute(() =>
          runtime.searchInternal({
            ...read(context, identity, value),
            criteria: value.criteria as {
              property_types?: readonly string[];
              region_codes: readonly string[];
            },
          }),
        );
      },
    },
  ];
}
