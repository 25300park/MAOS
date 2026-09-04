import type { Environment } from "@maos/config";
import {
  ControlPlaneError,
  type ControlPlaneRegistry,
  type SystemRegistration,
} from "@maos/module-control-plane";
import {
  ApiRequestError,
  type ApiRoute,
  type ValidationResult,
} from "./app.js";

type Input = Record<string, unknown>;

const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const lifecycles = new Set([
  "DRAFT",
  "ACTIVE",
  "SUSPENDED",
  "DISABLED",
  "RETIRED",
]);
const sources = new Set(["MAOS", "DOMAIN_SYSTEM"]);
const systemTypes = new Set([
  "DOMAIN_APPLICATION",
  "AI_AGENT_SYSTEM",
  "PUBLIC_PLATFORM",
  "INTERNAL_PLATFORM",
  "INFRASTRUCTURE",
  "MEMORY_SYSTEM",
  "EXTERNAL_SERVICE",
]);

function validateSystem(value: unknown): ValidationResult {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Input)
      : null;
  const owner = input?.owner;
  const validOwner =
    owner !== null &&
    typeof owner === "object" &&
    !Array.isArray(owner) &&
    nonempty((owner as Input).id) &&
    ["HUMAN", "AGENT", "SYSTEM"].includes((owner as Input).type as string);
  const fields = ["id", "name", "lifecycle", "source_of_truth", "type"];
  const invalidFields = fields.filter((field) => !nonempty(input?.[field]));
  if (!lifecycles.has(input?.lifecycle as string))
    invalidFields.push("lifecycle");
  if (!sources.has(input?.source_of_truth as string))
    invalidFields.push("source_of_truth");
  if (!systemTypes.has(input?.type as string)) invalidFields.push("type");
  if (!validOwner) invalidFields.push("owner");
  return input && invalidFields.length === 0
    ? { ok: true, value: input }
    : {
        details: invalidFields.map((field) => ({ code: "INVALID", field })),
        ok: false,
      };
}

function execute(operation: () => unknown) {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ControlPlaneError)
      throw new ApiRequestError(409, {
        code: error.code,
        details: {},
        retryable: false,
        severity: "INFO",
        type: "CONTROL_PLANE_BOUNDARY",
      });
    throw error;
  }
}

export function createControlPlaneRoutes(
  registry: ControlPlaneRegistry,
  options: {
    environment: Environment;
    system_ids: readonly string[];
  },
): ApiRoute[] {
  const access = (action: "READ" | "CREATE") => ({
    action,
    environment: options.environment,
    resource: "CONTROL_PLANE",
    risk: action === "READ" ? ("R0" as const) : ("R2" as const),
    scope: options.system_ids[0] ?? "none",
  });
  return [
    {
      access: access("READ"),
      handle: () => ({
        entity: registry.projectControlPlane({
          system_ids: options.system_ids,
        }),
      }),
      method: "GET",
      path: "/api/v1/control-plane",
    },
    {
      access: access("CREATE"),
      handle: ({ input }) => {
        const value = input as unknown as SystemRegistration;
        if (!options.system_ids.includes(value.id))
          throw new ApiRequestError(403, {
            code: "CONTROL_PLANE_SCOPE_MISMATCH",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "AUTHORIZATION",
          });
        return execute(() => ({ entity: registry.registerSystem(value) }));
      },
      method: "POST",
      path: "/api/v1/control-plane/systems",
      validate: validateSystem,
    },
  ];
}
