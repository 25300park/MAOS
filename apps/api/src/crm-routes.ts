import type { Environment } from "@maos/config";
import {
  CrmIntegrationError,
  type CrmHumanWorkService,
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
const validator =
  (fields: readonly string[]) =>
  (value: unknown): ValidationResult => {
    const input =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Input)
        : null;
    const numericFields = new Set(["max_age_ms", "timeout_ms"]);
    const invalid = fields.filter((field) =>
      numericFields.has(field)
        ? input?.[field] === undefined || input[field] === null
        : !nonempty(input?.[field]),
    );
    for (const field of ["max_age_ms", "timeout_ms"])
      if (
        fields.includes(field) &&
        (!Number.isSafeInteger(input?.[field]) ||
          (input?.[field] as number) < 1)
      )
        invalid.push(field);
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
  if (!identity) throw new Error("Authenticated CRM route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
};
async function execute(operation: () => unknown | Promise<unknown>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CrmIntegrationError)
      throw new ApiRequestError(
        error.code.includes("DENIED") || error.code.includes("REQUIRED")
          ? 403
          : 409,
        {
          code: error.code,
          details: {},
          retryable: [
            "CRM_SOURCE_UNAVAILABLE",
            "CRM_REQUEST_TIMED_OUT",
          ].includes(error.code),
          severity: "INFO",
          type: "INTEGRATION_BOUNDARY",
        },
      );
    throw error;
  }
}

export function createCrmRoutes(
  runtime: CrmHumanWorkService,
  options: { environment: Environment; scope: string },
): ApiRoute[] {
  const access = (action: "CREATE" | "MANAGE" | "READ") => ({
    action,
    environment: options.environment,
    resource: "CRM_INTEGRATION",
    risk: "R0" as const,
    scope: options.scope,
  });
  const scoped = (
    context: { correlation_id: string },
    identity: IdentityContext | null,
    input: Input,
  ) => {
    if (input.project_id !== options.scope)
      throw new ApiRequestError(403, {
        code: "CRM_SCOPE_DENIED",
        details: {},
        retryable: false,
        severity: "INFO",
        type: "AUTHORIZATION",
      });
    return {
      actor: actor(identity),
      correlation_id: context.correlation_id,
      employee_id: input.employee_id as string,
      permission_allowed: true,
      project_id: input.project_id as string,
      system_id: input.system_id as string,
    };
  };
  return [
    {
      access: access("READ"),
      handle: () => runtime.readiness(),
      method: "GET",
      path: "/api/v1/integrations/crm/health",
    },
    {
      access: access("READ"),
      handle: () => runtime.getSystem("crm"),
      method: "GET",
      path: "/api/v1/integrations/crm/system",
    },
    {
      access: access("READ"),
      method: "POST",
      path: "/api/v1/integrations/crm/today",
      validate: validator([
        "employee_id",
        "max_age_ms",
        "project_id",
        "system_id",
        "timeout_ms",
      ]),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        return execute(() =>
          runtime.observeToday({
            ...scoped(context, identity, value),
            max_age_ms: value.max_age_ms as number,
            timeout_ms: value.timeout_ms as number,
          }),
        );
      },
    },
    {
      access: access("CREATE"),
      method: "POST",
      path: "/api/v1/integrations/crm/capture",
      validate: validator([
        "employee_id",
        "idempotency_key",
        "project_id",
        "system_id",
        "text",
        "timeout_ms",
      ]),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        return execute(() =>
          runtime.captureWork({
            ...scoped(context, identity, value),
            idempotency_key: value.idempotency_key as string,
            text: value.text as string,
            timeout_ms: value.timeout_ms as number,
          }),
        );
      },
    },
    {
      access: access("CREATE"),
      method: "POST",
      path: "/api/v1/integrations/crm/documents",
      validate: validator([
        "document_type",
        "employee_id",
        "project_id",
        "system_id",
      ]),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        if (
          !Array.isArray(value.source_references) ||
          value.source_references.length === 0
        )
          throw new ApiRequestError(422, {
            code: "INVALID_CRM_DOCUMENT_SOURCES",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "VALIDATION",
          });
        return execute(() =>
          runtime.createDocumentDraft({
            ...scoped(context, identity, value),
            document_type: value.document_type as never,
            source_references: value.source_references as string[],
          }),
        );
      },
    },
    {
      access: access("CREATE"),
      method: "POST",
      path: "/api/v1/integrations/crm/ai-mls-search",
      validate: validator([
        "employee_id",
        "project_id",
        "requirement_reference",
        "system_id",
      ]),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        return execute(() =>
          runtime.createAiMlsSearchSimulation({
            ...scoped(context, identity, value),
            requirement_reference: value.requirement_reference as string,
          }),
        );
      },
    },
    {
      access: access("MANAGE"),
      method: "POST",
      path: "/api/v1/integrations/crm/management",
      validate: validator(["project_id"]),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        if (value.project_id !== options.scope)
          throw new ApiRequestError(403, {
            code: "CRM_MANAGER_SCOPE_DENIED",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "AUTHORIZATION",
          });
        return execute(() =>
          runtime.managementProjection({
            actor: actor(identity),
            correlation_id: context.correlation_id,
            manager_scope_allowed: true,
            project_id: value.project_id as string,
          }),
        );
      },
    },
  ];
}
