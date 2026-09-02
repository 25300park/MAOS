import type { Environment } from "@maos/config";
import {
  RuntimeError,
  type AgentDefinition,
  type AgentRuntimeEngine,
  type ModelDefinition,
  type ModelProvider,
  type RunnerDefinition,
} from "@maos/module-agent-runtime";
import type { IdentityContext } from "@maos/module-identity";
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

const actor = (identity: IdentityContext | null) => {
  if (!identity)
    throw new Error("Authenticated runtime route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
};

const execute = (operation: () => unknown): unknown => {
  try {
    return operation();
  } catch (error) {
    if (error instanceof RuntimeError)
      throw new ApiRequestError(409, {
        code: error.code,
        details: error.details,
        retryable: false,
        severity: "INFO",
        type: "RUNTIME_CONFLICT",
      });
    throw error;
  }
};

export function createRuntimeRoutes(
  engine: AgentRuntimeEngine,
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
      access: access("MODEL_PROVIDER", "CREATE"),
      method: "POST",
      path: "/api/v1/model-providers",
      validate: validate(["id", "status"]),
      handle: ({ input }) =>
        execute(() => ({
          entity: engine.registerProvider(input as ModelProvider),
          event: null,
        })),
    },
    {
      access: access("MODEL", "CREATE"),
      method: "POST",
      path: "/api/v1/models",
      validate: validate(["id", "provider_id", "capabilities", "lifecycle"]),
      handle: ({ input }) =>
        execute(() => ({
          entity: engine.registerModel(input as ModelDefinition),
          event: null,
        })),
    },
    {
      access: access("RUNNER", "CREATE"),
      method: "POST",
      path: "/api/v1/runners",
      validate: validate(["id", "capabilities", "health", "lifecycle"]),
      handle: ({ input }) =>
        execute(() => ({
          entity: engine.registerRunner(input as RunnerDefinition),
          event: null,
        })),
    },
    {
      access: access("AGENT", "CREATE"),
      method: "POST",
      path: "/api/v1/agents",
      validate: validate([
        "id",
        "department_id",
        "name",
        "role",
        "mission",
        "allowed_task_types",
        "model_policy",
        "runner_policy",
        "runtime_status",
        "lifecycle",
        "version",
      ]),
      handle: ({ input }) =>
        execute(() => ({
          entity: engine.registerAgentDefinition(input as AgentDefinition),
          event: null,
        })),
    },
    {
      access: access("TASK_ASSIGNMENT", "CREATE"),
      method: "POST",
      path: "/api/v1/task-assignments",
      validate: validate([
        "id",
        "task_id",
        "task_type",
        "task_status",
        "agent_id",
        "idempotency_key",
      ]),
      handle: ({ context, identity, input }) =>
        execute(() => {
          const value = input as Input;
          return engine.assignTask({
            agent_id: value.agent_id as string,
            assigned_by: actor(identity),
            correlation_id: context.correlation_id,
            id: value.id as string,
            idempotency_key: value.idempotency_key as string,
            task_id: value.task_id as string,
            task_status: value.task_status as Parameters<
              AgentRuntimeEngine["assignTask"]
            >[0]["task_status"],
            task_type: value.task_type as string,
          });
        }),
    },
    {
      access: access("RUN", "CREATE"),
      method: "POST",
      path: "/api/v1/runs",
      validate: validate([
        "id",
        "task_id",
        "assignment_id",
        "timeout_ms",
        "idempotency_key",
      ]),
      handle: ({ context, input }) =>
        execute(() => {
          const value = input as Input;
          return engine.createRun({
            assignment_id: value.assignment_id as string,
            correlation_id: context.correlation_id,
            id: value.id as string,
            idempotency_key: value.idempotency_key as string,
            task_id: value.task_id as string,
            timeout_ms: value.timeout_ms as number,
          });
        }),
    },
  ];
}
