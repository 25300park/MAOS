import type { Environment } from "@maos/config";
import type { GovernanceDecision } from "@maos/contracts";
import {
  ToolingError,
  type PermissionLayers,
  type SkillBinding,
  type SkillDefinition,
  type ToolDefinition,
  type ToolingEngine,
  type ToolProvider,
} from "@maos/module-tooling";
import {
  ApiRequestError,
  type ApiRoute,
  type ValidationResult,
} from "./app.js";

type Input = Record<string, unknown>;

const asInput = (value: unknown): Input | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Input)
    : null;

const validate =
  (required: readonly string[]) =>
  (value: unknown): ValidationResult => {
    const input = asInput(value);
    const missing = required.filter(
      (key) => input?.[key] === undefined || input[key] === null,
    );
    return input && missing.length === 0
      ? { ok: true, value: input }
      : {
          ok: false,
          details: missing.map((field) => ({ code: "REQUIRED", field })),
        };
  };

const execute = (operation: () => unknown): unknown => {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ToolingError)
      throw new ApiRequestError(409, {
        code: error.code,
        details: error.details,
        retryable: false,
        severity: "INFO",
        type: "TOOLING_CONFLICT",
      });
    throw error;
  }
};

export function createToolingRoutes(
  engine: ToolingEngine,
  options: { environment: Environment; scope: string },
): ApiRoute[] {
  const access = (resource: string, action: string) => ({
    action,
    environment: options.environment,
    resource,
    risk: "R1" as const,
    scope: options.scope,
  });
  return [
    {
      access: access("SKILL", "CREATE"),
      method: "POST",
      path: "/api/v1/skills",
      validate: validate([
        "id",
        "name",
        "category",
        "scope",
        "status",
        "version",
        "checksum",
      ]),
      handle: ({ input }) =>
        execute(() => ({
          entity: engine.registerSkill(input as SkillDefinition),
          event: null,
        })),
    },
    {
      access: access("SKILL_BINDING", "CREATE"),
      method: "POST",
      path: "/api/v1/skill-bindings",
      validate: validate(["skill_id", "source"]),
      handle: ({ input }) =>
        execute(() => ({
          entity: engine.bindSkill(input as SkillBinding),
          event: null,
        })),
    },
    {
      access: access("TOOL_PROVIDER", "CREATE"),
      method: "POST",
      path: "/api/v1/tool-providers",
      validate: validate([
        "id",
        "name",
        "provider_type",
        "version",
        "checksum",
        "trust",
        "lifecycle",
        "health",
      ]),
      handle: ({ input }) =>
        execute(() => ({
          entity: engine.registerProvider(input as ToolProvider),
          event: null,
        })),
    },
    {
      access: access("TOOL", "CREATE"),
      method: "POST",
      path: "/api/v1/tools",
      validate: validate([
        "id",
        "provider_id",
        "name",
        "type",
        "risk",
        "lifecycle",
        "health",
        "capabilities",
      ]),
      handle: ({ input }) =>
        execute(() => ({
          entity: engine.registerTool(input as ToolDefinition),
          event: null,
        })),
    },
    {
      access: access("TOOL_CALL", "CREATE"),
      method: "POST",
      path: "/api/v1/tool-calls",
      validate: validate([
        "id",
        "run_id",
        "agent_id",
        "tool_id",
        "capability_id",
        "action_type",
        "environment",
        "timeout_ms",
        "idempotency_key",
      ]),
      handle: ({ context, input }) =>
        execute(() => {
          const value = input as Input;
          return engine.requestToolCall({
            action_type: value.action_type as Parameters<
              ToolingEngine["requestToolCall"]
            >[0]["action_type"],
            agent_id: value.agent_id as string,
            capability_id: value.capability_id as string,
            correlation_id: context.correlation_id,
            environment: value.environment as string,
            id: value.id as string,
            idempotency_key: value.idempotency_key as string,
            run_id: value.run_id as string,
            timeout_ms: value.timeout_ms as number,
            tool_id: value.tool_id as string,
          });
        }),
    },
    {
      access: access("TOOL_CALL", "AUTHORIZE"),
      method: "POST",
      path: "/api/v1/tool-calls/authorize",
      validate: validate(["call_id", "permissions"]),
      handle: ({ input }) =>
        execute(() => {
          const value = input as Input;
          return engine.authorizeToolCall(value.call_id as string, {
            ...(value.approval
              ? { approval: value.approval as GovernanceDecision }
              : {}),
            permissions: value.permissions as PermissionLayers,
          });
        }),
    },
  ];
}
