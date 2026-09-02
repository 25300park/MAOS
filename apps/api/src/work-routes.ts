import type { Environment } from "@maos/config";
import type { IdentityContext } from "@maos/module-identity";
import {
  WorkError,
  type TaskStatus,
  type WorkEngine,
} from "@maos/module-orchestration";
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
  if (!identity) throw new Error("Authenticated work route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
};
const execute = (operation: () => unknown): unknown => {
  try {
    return operation();
  } catch (error) {
    if (error instanceof WorkError)
      throw new ApiRequestError(409, {
        code: error.code,
        details: error.details,
        retryable: false,
        severity: "INFO",
        type: "WORKFLOW_CONFLICT",
      });
    throw error;
  }
};

export function createWorkRoutes(
  engine: WorkEngine,
  options: { environment: Environment; scope: string },
): ApiRoute[] {
  const access = (resource: string, action: string) => ({
    action,
    environment: options.environment,
    resource,
    risk: "R1" as const,
    scope: options.scope,
  });
  const context = (
    identity: IdentityContext | null,
    correlation_id: string,
    idempotency_key: string,
  ) => ({ actor: actor(identity), correlation_id, idempotency_key });
  return [
    {
      access: access("PROJECT", "CREATE"),
      method: "POST",
      path: "/api/v1/projects",
      validate: validate([
        "id",
        "organization_id",
        "department_id",
        "name",
        "idempotency_key",
      ]),
      handle: ({ context: request, identity, input }) =>
        execute(() => {
          const value = input as Input;
          return engine.createProject({
            ...context(
              identity,
              request.correlation_id,
              value.idempotency_key as string,
            ),
            department_id: value.department_id as string,
            id: value.id as string,
            name: value.name as string,
            organization_id: value.organization_id as string,
            owner: actor(identity),
          });
        }),
    },
    {
      access: access("TASK", "CREATE"),
      method: "POST",
      path: "/api/v1/tasks",
      validate: validate([
        "id",
        "project_id",
        "title",
        "task_type",
        "idempotency_key",
      ]),
      handle: ({ context: request, identity, input }) =>
        execute(() => {
          const value = input as Input;
          return engine.createTask({
            ...context(
              identity,
              request.correlation_id,
              value.idempotency_key as string,
            ),
            id: value.id as string,
            owner: actor(identity),
            project_id: value.project_id as string,
            status: "DRAFT",
            task_type: value.task_type as string,
            title: value.title as string,
          });
        }),
    },
    {
      access: access("TASK", "TRANSITION"),
      method: "POST",
      path: "/api/v1/tasks/transition",
      validate: validate([
        "task_id",
        "to",
        "expected_version",
        "idempotency_key",
      ]),
      handle: ({ context: request, identity, input }) =>
        execute(() => {
          const value = input as Input;
          return engine.transitionTask({
            ...context(
              identity,
              request.correlation_id,
              value.idempotency_key as string,
            ),
            expected_version: value.expected_version as number,
            task_id: value.task_id as string,
            to: value.to as TaskStatus,
          });
        }),
    },
    {
      access: access("WORKFLOW", "CREATE"),
      method: "POST",
      path: "/api/v1/workflows",
      validate: validate([
        "id",
        "project_id",
        "name",
        "steps",
        "idempotency_key",
      ]),
      handle: ({ context: request, identity, input }) =>
        execute(() => {
          const value = input as Input;
          return engine.createWorkflowDefinition({
            ...context(
              identity,
              request.correlation_id,
              value.idempotency_key as string,
            ),
            id: value.id as string,
            name: value.name as string,
            owner: actor(identity),
            project_id: value.project_id as string,
            steps: value.steps as Parameters<
              WorkEngine["createWorkflowDefinition"]
            >[0]["steps"],
          });
        }),
    },
  ];
}
