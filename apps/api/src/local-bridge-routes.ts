import type { Environment } from "@maos/config";
import {
  LocalBridgeError,
  ToolingError,
  type LocalExecutionBridge,
  type LocalExecutionInput,
  type LocalTaskScope,
  type RegisterLocalRunnerInput,
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

async function execute(operation: () => unknown): Promise<unknown> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof LocalBridgeError) {
      const denied =
        error.code.endsWith("_DENIED") ||
        error.code === "PATH_OUTSIDE_WORKROOT";
      throw new ApiRequestError(denied ? 403 : 409, {
        code: error.code,
        details: error.details,
        retryable: false,
        severity: "INFO",
        type: denied ? "AUTHORIZATION" : "LOCAL_EXECUTION_CONFLICT",
      });
    }
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
}

export function createLocalBridgeRoutes(
  bridge: LocalExecutionBridge,
  options: { environment: Environment; scope: string },
): ApiRoute[] {
  const access = (resource: string, action: string) => ({
    action,
    environment: options.environment,
    resource,
    risk: "R2" as const,
    scope: options.scope,
  });
  return [
    {
      access: access("LOCAL_RUNNER", "CREATE"),
      method: "POST",
      path: "/api/v1/local-runners",
      validate: validate([
        "id",
        "device_id",
        "identity_id",
        "runner_id",
        "provider_id",
        "workroots",
        "capabilities",
        "allowed_commands",
        "health",
      ]),
      handle: ({ input }) =>
        execute(() => ({
          entity: bridge.registerRunner(input as RegisterLocalRunnerInput),
          event: null,
        })),
    },
    {
      access: access("LOCAL_RUNNER", "UPDATE"),
      method: "POST",
      path: "/api/v1/local-runners/health",
      validate: validate(["runner_id", "health"]),
      handle: ({ input }) =>
        execute(() => {
          const value = input as Input;
          return {
            entity: bridge.updateRunnerHealth(
              value.runner_id as string,
              value.health as Parameters<
                LocalExecutionBridge["updateRunnerHealth"]
              >[1],
            ),
            event: null,
          };
        }),
    },
    {
      access: access("LOCAL_RUNNER", "REVOKE"),
      method: "POST",
      path: "/api/v1/local-runners/revoke",
      validate: validate(["runner_id"]),
      handle: ({ input }) =>
        execute(() => ({
          entity: bridge.revokeRunner((input as Input).runner_id as string),
          event: null,
        })),
    },
    {
      access: access("LOCAL_TASK_SCOPE", "CREATE"),
      method: "POST",
      path: "/api/v1/local-task-scopes",
      validate: validate(["runner_id", "task_id", "run_id", "workroot"]),
      handle: ({ input }) =>
        execute(() => ({
          entity: bridge.bindTaskScope(input as LocalTaskScope),
          event: null,
        })),
    },
    {
      access: access("LOCAL_EXECUTION", "EXECUTE"),
      method: "POST",
      path: "/api/v1/local-executions",
      validate: validate([
        "runner_id",
        "task_id",
        "run_id",
        "tool_call_id",
        "capability",
      ]),
      handle: ({ input }) =>
        execute(() => bridge.execute(input as LocalExecutionInput)),
    },
    {
      access: access("LOCAL_EXECUTION", "CANCEL"),
      method: "POST",
      path: "/api/v1/local-executions/cancel",
      validate: validate(["runner_id", "tool_call_id", "reason"]),
      handle: ({ input }) =>
        execute(() => {
          const value = input as Input;
          return bridge.cancelExecution(
            value.runner_id as string,
            value.tool_call_id as string,
            value.reason as string,
          );
        }),
    },
  ];
}
