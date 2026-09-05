import type { Environment } from "@maos/config";
import {
  ErpAccountingTaxError,
  type ErpAccountingTaxService,
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
  (fields: readonly string[], arrays: readonly string[] = []) =>
  (value: unknown): ValidationResult => {
    const input =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Input)
        : null;
    const numeric = new Set(["max_age_ms", "timeout_ms"]);
    const invalid = fields.filter((field) => {
      if (numeric.has(field))
        return (
          !Number.isSafeInteger(input?.[field]) ||
          (input?.[field] as number) < 1
        );
      if (arrays.includes(field))
        return (
          !Array.isArray(input?.[field]) ||
          (input?.[field] as unknown[]).length === 0
        );
      return !nonempty(input?.[field]);
    });
    return input && invalid.length === 0
      ? { ok: true, value: input }
      : {
          details: invalid.map((field) => ({ code: "INVALID", field })),
          ok: false,
        };
  };
const actor = (identity: IdentityContext | null) => {
  if (!identity) throw new Error("Authenticated ERP route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
};
async function execute(operation: () => unknown | Promise<unknown>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ErpAccountingTaxError)
      throw new ApiRequestError(
        error.code.includes("DENIED") ||
          error.code.includes("REQUIRED") ||
          error.code.includes("FORBIDDEN")
          ? 403
          : 409,
        {
          code: error.code,
          details: {},
          retryable: [
            "ERP_SOURCE_UNAVAILABLE",
            "ERP_REQUEST_TIMED_OUT",
          ].includes(error.code),
          severity: "INFO",
          type: "INTEGRATION_BOUNDARY",
        },
      );
    throw error;
  }
}

export function createErpAccountingTaxRoutes(
  runtime: ErpAccountingTaxService,
  options: { environment: Environment; scope: string },
): ApiRoute[] {
  const access = (
    action: "CREATE" | "EXECUTE" | "MANAGE" | "READ",
    risk: "R0" | "R1" | "R4" = "R0",
  ) => ({
    action,
    environment: options.environment,
    resource: "ERP_INTEGRATION",
    risk,
    scope: options.scope,
  });
  const scoped = (
    context: { correlation_id: string },
    identity: IdentityContext | null,
    input: Input,
  ) => {
    if (input.project_id !== options.scope)
      throw new ApiRequestError(403, {
        code: "ERP_SCOPE_DENIED",
        details: {},
        retryable: false,
        severity: "INFO",
        type: "AUTHORIZATION",
      });
    return {
      accounting_period: input.accounting_period as string,
      actor: actor(identity),
      correlation_id: context.correlation_id,
      permission_allowed: true,
      project_id: input.project_id as string,
      system_id: input.system_id as string,
    };
  };
  const observationFields = [
    "accounting_period",
    "max_age_ms",
    "project_id",
    "system_id",
    "timeout_ms",
  ];
  return [
    {
      access: access("MANAGE", "R1"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        if (value.project_id !== options.scope)
          throw new ApiRequestError(403, {
            code: "ERP_SCOPE_DENIED",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "AUTHORIZATION",
          });
        return execute(() =>
          runtime.bindScope({
            accounting_period: value.accounting_period as string,
            actor: actor(identity),
            correlation_id: context.correlation_id,
            environment: options.environment,
            project_id: value.project_id as string,
            source_reference: value.source_reference as string,
            system_id: value.system_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/erp/scopes",
      validate: validator([
        "accounting_period",
        "project_id",
        "source_reference",
        "system_id",
      ]),
    },
    {
      access: access("READ"),
      handle: () => runtime.readiness(),
      method: "GET",
      path: "/api/v1/integrations/erp/health",
    },
    {
      access: access("READ"),
      handle: () => runtime.getSystem("erp"),
      method: "GET",
      path: "/api/v1/integrations/erp/system",
    },
    {
      access: access("READ"),
      handle: () => runtime.getTeam("erp"),
      method: "GET",
      path: "/api/v1/integrations/erp/team",
    },
    {
      access: access("READ"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        return execute(() =>
          runtime.observeFinance({
            ...scoped(context, identity, value),
            max_age_ms: value.max_age_ms as number,
            timeout_ms: value.timeout_ms as number,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/erp/finance",
      validate: validator(observationFields),
    },
    {
      access: access("READ"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        return execute(() =>
          runtime.observeObligations({
            ...scoped(context, identity, value),
            max_age_ms: value.max_age_ms as number,
            timeout_ms: value.timeout_ms as number,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/erp/obligations",
      validate: validator(observationFields),
    },
    {
      access: access("READ"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        if (value.project_id !== options.scope)
          throw new ApiRequestError(403, {
            code: "ERP_MANAGER_SCOPE_DENIED",
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
            system_id: value.system_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/erp/management",
      validate: validator(["project_id", "system_id"]),
    },
    {
      access: access("CREATE", "R1"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        return execute(() =>
          runtime.createComplianceWork({
            ...scoped(context, identity, value),
            due_date: value.due_date as string,
            evidence_refs: value.evidence_refs as string[],
            responsible_human_id: value.responsible_human_id as string,
            source_references: value.source_references as string[],
            type: value.type as never,
            work_id: value.work_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/erp/works",
      validate: validator(
        [
          "accounting_period",
          "due_date",
          "evidence_refs",
          "project_id",
          "responsible_human_id",
          "source_references",
          "system_id",
          "type",
          "work_id",
        ],
        ["evidence_refs", "source_references"],
      ),
    },
    {
      access: access("EXECUTE", "R4"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        return execute(() =>
          runtime.requestExternalAction({
            ...scoped(context, identity, value),
            action: value.action as never,
            work_id: value.work_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/erp/external-actions",
      validate: validator([
        "accounting_period",
        "action",
        "project_id",
        "system_id",
        "work_id",
      ]),
    },
  ];
}
