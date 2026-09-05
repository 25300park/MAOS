import type { Environment } from "@maos/config";
import { HrLaborError, type HrLaborService } from "@maos/module-integration";
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
  if (!identity) throw new Error("Authenticated HR route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
};
async function execute(operation: () => unknown | Promise<unknown>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HrLaborError)
      throw new ApiRequestError(
        error.code.includes("DENIED") ||
          error.code.includes("REQUIRED") ||
          error.code.includes("FORBIDDEN")
          ? 403
          : 409,
        {
          code: error.code,
          details: {},
          retryable: ["HR_SOURCE_UNAVAILABLE", "HR_REQUEST_TIMED_OUT"].includes(
            error.code,
          ),
          severity: "INFO",
          type: "INTEGRATION_BOUNDARY",
        },
      );
    throw error;
  }
}

export function createHrLaborRoutes(
  runtime: HrLaborService,
  options: { environment: Environment; scope: string },
): ApiRoute[] {
  const access = (
    action: "CREATE" | "EXECUTE" | "MANAGE" | "READ",
    risk: "R0" | "R1" | "R4" = "R0",
  ) => ({
    action,
    environment: options.environment,
    resource: "HR_LABOR_INTEGRATION",
    risk,
    scope: options.scope,
  });
  const scoped = (
    context: { correlation_id: string },
    identity: IdentityContext | null,
    input: Input,
    purpose: "HR_OPERATIONS" | "LABOR_COMPLIANCE",
  ) => {
    if (input.project_id !== options.scope)
      throw new ApiRequestError(403, {
        code: "HR_SCOPE_DENIED",
        details: {},
        retryable: false,
        severity: "INFO",
        type: "AUTHORIZATION",
      });
    return {
      actor: actor(identity),
      correlation_id: context.correlation_id,
      department_reference: input.department_reference as string,
      period: input.period as string,
      permission_allowed: true,
      project_id: input.project_id as string,
      purpose,
      system_id: input.system_id as string,
    };
  };
  const observationFields = [
    "department_reference",
    "max_age_ms",
    "period",
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
            code: "HR_SCOPE_DENIED",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "AUTHORIZATION",
          });
        return execute(() =>
          runtime.bindScope({
            actor: actor(identity),
            correlation_id: context.correlation_id,
            department_reference: value.department_reference as string,
            environment: options.environment,
            period: value.period as string,
            project_id: value.project_id as string,
            purpose: value.purpose as "HR_OPERATIONS" | "LABOR_COMPLIANCE",
            source_reference: value.source_reference as string,
            system_id: value.system_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/hr-labor/scopes",
      validate: validator([
        "department_reference",
        "period",
        "project_id",
        "purpose",
        "source_reference",
        "system_id",
      ]),
    },
    {
      access: access("READ"),
      handle: () => runtime.readiness(),
      method: "GET",
      path: "/api/v1/integrations/hr-labor/health",
    },
    {
      access: access("READ"),
      handle: () => runtime.getSystem("erp-hr"),
      method: "GET",
      path: "/api/v1/integrations/hr-labor/system",
    },
    {
      access: access("READ"),
      handle: () => runtime.getLaborAgents("erp-hr"),
      method: "GET",
      path: "/api/v1/integrations/hr-labor/agents",
    },
    {
      access: access("READ"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        return execute(() =>
          runtime.observeOperations({
            ...scoped(context, identity, value, "HR_OPERATIONS"),
            max_age_ms: value.max_age_ms as number,
            timeout_ms: value.timeout_ms as number,
            visibility: "MANAGER",
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/hr-labor/operations",
      validate: validator(observationFields),
    },
    {
      access: access("READ"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        return execute(() =>
          runtime.observeStatutoryObligations({
            ...scoped(context, identity, value, "LABOR_COMPLIANCE"),
            max_age_ms: value.max_age_ms as number,
            timeout_ms: value.timeout_ms as number,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/hr-labor/statutory-obligations",
      validate: validator(observationFields),
    },
    {
      access: access("READ"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        if (value.project_id !== options.scope)
          throw new ApiRequestError(403, {
            code: "HR_MANAGER_SCOPE_DENIED",
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
      path: "/api/v1/integrations/hr-labor/management",
      validate: validator(["project_id", "system_id"]),
    },
    {
      access: access("CREATE", "R1"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        return execute(() =>
          runtime.createWork({
            ...scoped(
              context,
              identity,
              value,
              value.type === "POLICY_REVIEW" ||
                value.type === "STATUTORY_CHECKLIST"
                ? "LABOR_COMPLIANCE"
                : "HR_OPERATIONS",
            ),
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
      path: "/api/v1/integrations/hr-labor/works",
      validate: validator(
        [
          "department_reference",
          "due_date",
          "evidence_refs",
          "period",
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
            ...scoped(
              context,
              identity,
              value,
              [
                "DOLE_SUBMISSION",
                "SSS_SUBMISSION",
                "PHILHEALTH_SUBMISSION",
                "PAG_IBIG_SUBMISSION",
                "STATUTORY_PAYMENT",
              ].includes(value.action as string)
                ? "LABOR_COMPLIANCE"
                : "HR_OPERATIONS",
            ),
            action: value.action as never,
            work_id: value.work_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/hr-labor/external-actions",
      validate: validator([
        "action",
        "department_reference",
        "period",
        "project_id",
        "system_id",
        "work_id",
      ]),
    },
  ];
}
