import type { Environment } from "@maos/config";
import type { GovernanceDecision } from "@maos/contracts";
import {
  RbsAdminPilotError,
  type PilotReadCapability,
  type RbsAdminPilotService,
} from "@maos/module-integration";
import type { IdentityContext } from "@maos/module-identity";
import {
  ApiRequestError,
  type ApiRoute,
  type ValidationResult,
} from "./app.js";

type Input = Record<string, unknown>;
const readCapabilities = new Set([
  "READ_SYSTEM_STATUS",
  "READ_REPOSITORY_STATUS",
  "READ_ENVIRONMENT_METADATA",
  "READ_VERSION_METADATA",
  "READ_DEPLOYMENT_READINESS",
]);
const pilotStages = new Set([
  "REQUIREMENT",
  "PLAN",
  "IMPLEMENT",
  "TEST",
  "QA",
  "APPROVAL_BOUNDARY",
  "RELEASE_PREPARATION",
  "SIMULATED_DEPLOYMENT",
  "VERIFICATION",
]);
const pilotRoles = new Set([
  "DEVELOPMENT_LEAD",
  "REQUIREMENT_PRODUCT",
  "BACKEND",
  "FUNCTIONAL_TEST",
  "UX_QA",
  "SECURITY_REVIEW",
  "DEVOPS_DEPLOYMENT",
]);
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every(nonempty);
const required =
  (fields: readonly string[]) =>
  (value: unknown): ValidationResult => {
    const input =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Input)
        : null;
    const missing = fields.filter(
      (field) => input?.[field] === undefined || input[field] === null,
    );
    return input && missing.length === 0
      ? { ok: true, value: input }
      : {
          ok: false,
          details: missing.map((field) => ({ code: "REQUIRED", field })),
        };
  };
const invalid = (fields: readonly string[]): ValidationResult => ({
  details: fields.map((field) => ({ code: "INVALID", field })),
  ok: false,
});
const statusInput = (value: unknown): ValidationResult => {
  const base = required([
    "system_id",
    "project_id",
    "pilot_id",
    "task_id",
    "capability",
    "timeout_ms",
  ])(value);
  if (!base.ok) return base;
  const input = base.value as Input;
  const failures = ["system_id", "project_id", "pilot_id", "task_id"].filter(
    (field) => !nonempty(input[field]),
  );
  if (!readCapabilities.has(input.capability as string))
    failures.push("capability");
  if (
    !Number.isInteger(input.timeout_ms) ||
    (input.timeout_ms as number) < 1 ||
    (input.timeout_ms as number) > 30_000
  )
    failures.push("timeout_ms");
  return failures.length ? invalid(failures) : base;
};
const createInput = (value: unknown): ValidationResult => {
  const base = required([
    "id",
    "project_id",
    "task_id",
    "system_id",
    "repository_reference",
    "workroot_reference",
    "request_evidence_id",
    "assignments",
  ])(value);
  if (!base.ok) return base;
  const input = base.value as Input;
  const failures = [
    "id",
    "project_id",
    "task_id",
    "system_id",
    "repository_reference",
    "workroot_reference",
    "request_evidence_id",
  ].filter((field) => !nonempty(input[field]));
  if (
    !Array.isArray(input.assignments) ||
    input.assignments.length !== pilotRoles.size ||
    input.assignments.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        !nonempty((item as Input).agent_id) ||
        !pilotRoles.has((item as Input).role as string),
    )
  )
    failures.push("assignments");
  return failures.length ? invalid(failures) : base;
};
const advanceInput = (value: unknown): ValidationResult => {
  const base = required(["pilot_id", "stage", "evidence_ids"])(value);
  if (!base.ok) return base;
  const input = base.value as Input;
  const failures: string[] = [];
  if (!nonempty(input.pilot_id)) failures.push("pilot_id");
  if (!pilotStages.has(input.stage as string)) failures.push("stage");
  if (!strings(input.evidence_ids)) failures.push("evidence_ids");
  if (input.changed_files !== undefined && !strings(input.changed_files))
    failures.push("changed_files");
  if (input.stage === "IMPLEMENT") {
    for (const field of [
      "branch",
      "repository_reference",
      "workroot_reference",
    ])
      if (!nonempty(input[field])) failures.push(field);
    if (!strings(input.changed_files)) failures.push("changed_files");
  }
  if (input.stage === "RELEASE_PREPARATION" && !nonempty(input.release_id))
    failures.push("release_id");
  if (input.stage === "SIMULATED_DEPLOYMENT") {
    if (!nonempty(input.deployment_id)) failures.push("deployment_id");
    if (input.deployment_mode !== "SIMULATED") failures.push("deployment_mode");
  }
  return failures.length ? invalid(failures) : base;
};
const actor = (identity: IdentityContext | null) => {
  if (!identity) throw new Error("Authenticated pilot route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
};
async function execute(operation: () => unknown | Promise<unknown>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RbsAdminPilotError)
      throw new ApiRequestError(
        [
          "PILOT_READ_DENIED",
          "HUMAN_APPROVAL_REQUIRED",
          "PRODUCTION_WRITE_FORBIDDEN",
        ].includes(error.code)
          ? 403
          : 409,
        {
          code: error.code,
          details: {},
          retryable: ["PILOT_READ_TIMED_OUT"].includes(error.code),
          severity: "INFO",
          type: "INTEGRATION_BOUNDARY",
        },
      );
    throw error;
  }
}

export function createRbsAdminPilotRoutes(
  runtime: RbsAdminPilotService,
  options: {
    environment: Environment;
    scope: string;
    resolveApproval?: (input: {
      identity: IdentityContext;
      pilot_id: string;
      target_version: string;
    }) =>
      | Promise<{
          decision: GovernanceDecision;
          environment: string;
          target_id: string;
          target_version: string;
        }>
      | {
          decision: GovernanceDecision;
          environment: string;
          target_id: string;
          target_version: string;
        };
  },
): ApiRoute[] {
  const access = (action: string) => ({
    action,
    environment: options.environment,
    resource: "RBS_ADMIN_PILOT",
    risk: action === "READ" ? ("R0" as const) : ("R2" as const),
    scope: options.scope,
  });
  return [
    {
      access: access("READ"),
      handle: () => runtime.readiness(),
      method: "GET",
      path: "/api/v1/integrations/rbs-admin/health",
    },
    {
      access: access("READ"),
      handle: () => ({ entities: runtime.listSystems() }),
      method: "GET",
      path: "/api/v1/integrations/rbs-admin/systems",
    },
    {
      access: access("READ"),
      method: "POST",
      path: "/api/v1/integrations/rbs-admin/status",
      validate: statusInput,
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        if (value.project_id !== options.scope)
          throw new ApiRequestError(403, {
            code: "PILOT_SCOPE_MISMATCH",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "AUTHORIZATION",
          });
        return execute(() =>
          runtime.readStatus({
            actor: actor(identity),
            capability: value.capability as PilotReadCapability,
            correlation_id: context.correlation_id,
            permission_allowed: true,
            pilot_id: value.pilot_id as string,
            project_id: value.project_id as string,
            system_id: value.system_id as string,
            task_id: value.task_id as string,
            timeout_ms: value.timeout_ms as number,
          }),
        );
      },
    },
    {
      access: access("READ"),
      handle: () => ({ entities: runtime.listPilots() }),
      method: "GET",
      path: "/api/v1/integrations/rbs-admin/pilots",
    },
    {
      access: access("CREATE"),
      method: "POST",
      path: "/api/v1/integrations/rbs-admin/pilots",
      validate: createInput,
      handle: ({ context, identity, input }) =>
        execute(() => {
          const value = input as Input;
          if (value.project_id !== options.scope)
            throw new ApiRequestError(403, {
              code: "PILOT_SCOPE_MISMATCH",
              details: {},
              retryable: false,
              severity: "INFO",
              type: "AUTHORIZATION",
            });
          return runtime.createPilot({
            ...(input as Parameters<RbsAdminPilotService["createPilot"]>[0]),
            actor: actor(identity),
            correlation_id: context.correlation_id,
          });
        }),
    },
    {
      access: access("ADVANCE"),
      method: "POST",
      path: "/api/v1/integrations/rbs-admin/pilots/advance",
      validate: advanceInput,
      handle: async ({ context, identity, input }) =>
        execute(async () => {
          const value = input as Input;
          const current = runtime.getPilot(value.pilot_id as string);
          if (!current || current.project_id !== options.scope)
            throw new ApiRequestError(403, {
              code: "PILOT_SCOPE_MISMATCH",
              details: {},
              retryable: false,
              severity: "INFO",
              type: "AUTHORIZATION",
            });
          let approval:
            | Parameters<RbsAdminPilotService["advancePilot"]>[0]["approval"]
            | undefined;
          if (value.stage === "APPROVAL_BOUNDARY") {
            if (!options.resolveApproval)
              throw new ApiRequestError(403, {
                code: "APPROVAL_REQUIRED",
                details: {},
                retryable: false,
                severity: "INFO",
                type: "GOVERNANCE",
              });
            if (!identity)
              throw new Error("Authenticated pilot route missing identity");
            approval = await options.resolveApproval({
              identity,
              pilot_id: current.id,
              target_version: current.version,
            });
          }
          const { approval: _untrustedApproval, ...safeInput } =
            input as Parameters<RbsAdminPilotService["advancePilot"]>[0];
          void _untrustedApproval;
          return runtime.advancePilot({
            ...safeInput,
            actor: actor(identity),
            correlation_id: context.correlation_id,
            ...(approval ? { approval } : {}),
          });
        }),
    },
  ];
}
