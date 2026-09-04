import type { Environment } from "@maos/config";
import {
  MarketingIntegrationError,
  type MarketingIntegrationService,
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
const observeInput = (value: unknown): ValidationResult => {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Input)
      : null;
  const fields = [
    "campaign_id",
    "max_age_ms",
    "project_id",
    "system_id",
    "task_id",
    "timeout_ms",
  ];
  const invalid = fields.filter(
    (field) => input?.[field] === undefined || input[field] === null,
  );
  for (const field of ["campaign_id", "project_id", "system_id", "task_id"])
    if (input && !nonempty(input[field]) && !invalid.includes(field))
      invalid.push(field);
  for (const field of ["max_age_ms", "timeout_ms"])
    if (
      input &&
      (!Number.isSafeInteger(input[field]) || (input[field] as number) < 1) &&
      !invalid.includes(field)
    )
      invalid.push(field);
  return input && invalid.length === 0
    ? { ok: true, value: input }
    : {
        ok: false,
        details: invalid.map((field) => ({ code: "INVALID", field })),
      };
};
const actor = (identity: IdentityContext | null) => {
  if (!identity)
    throw new Error("Authenticated Marketing route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
};
async function execute(operation: () => unknown | Promise<unknown>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof MarketingIntegrationError)
      throw new ApiRequestError(
        [
          "MARKETING_READ_DENIED",
          "MARKETING_PUBLISH_DENIED",
          "REAL_PUBLISHING_FORBIDDEN",
          "MARKETING_APPROVAL_REQUIRED",
        ].includes(error.code)
          ? 403
          : 409,
        {
          code: error.code,
          details: {},
          retryable:
            error.code === "MARKETING_SOURCE_UNAVAILABLE" ||
            error.code === "MARKETING_READ_TIMED_OUT",
          severity: "INFO",
          type: "INTEGRATION_BOUNDARY",
        },
      );
    throw error;
  }
}

export function createMarketingRoutes(
  runtime: MarketingIntegrationService,
  options: { environment: Environment; scope: string },
): ApiRoute[] {
  const access = (action: "READ" | "CREATE") => ({
    action,
    environment: options.environment,
    resource: "MARKETING_INTEGRATION",
    risk: action === "READ" ? ("R0" as const) : ("R2" as const),
    scope: options.scope,
  });
  return [
    {
      access: access("READ"),
      handle: () => runtime.readiness(),
      method: "GET",
      path: "/api/v1/integrations/marketing/health",
    },
    {
      access: access("READ"),
      handle: () => ({ entities: runtime.listTeam("marketing-automation") }),
      method: "GET",
      path: "/api/v1/integrations/marketing/team",
    },
    {
      access: access("READ"),
      method: "POST",
      path: "/api/v1/integrations/marketing/campaigns/observe",
      validate: observeInput,
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        if (value.project_id !== options.scope)
          throw new ApiRequestError(403, {
            code: "MARKETING_SCOPE_MISMATCH",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "AUTHORIZATION",
          });
        return execute(() =>
          runtime.observeCampaign({
            actor: actor(identity),
            campaign_id: value.campaign_id as string,
            correlation_id: context.correlation_id,
            max_age_ms: value.max_age_ms as number,
            permission_allowed: true,
            project_id: value.project_id as string,
            system_id: value.system_id as string,
            task_id: value.task_id as string,
            timeout_ms: value.timeout_ms as number,
          }),
        );
      },
    },
  ];
}
