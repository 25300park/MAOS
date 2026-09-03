import type { Environment } from "@maos/config";
import type { IdentityContext } from "@maos/module-identity";
import {
  MemoryGatewayError,
  type MemoryAccessPolicy,
  type MemoryGatewayIntegration,
  type MemoryGatewayRetrievalRequest,
} from "@maos/module-knowledge";
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
    if (!(error instanceof MemoryGatewayError)) throw error;
    const statusCode =
      error.code === "MEMORY_ACCESS_DENIED" ||
      error.code === "MEMORY_SCOPE_MISMATCH"
        ? 403
        : error.code === "MEMORY_GATEWAY_NOT_FOUND" ||
            error.code === "MEMORY_REFERENCE_NOT_FOUND"
          ? 404
          : error.code === "GATEWAY_UNAVAILABLE" ||
              error.code === "GATEWAY_FAILURE"
            ? 503
            : error.code === "GATEWAY_TIMED_OUT"
              ? 504
              : error.code.startsWith("INVALID_")
                ? 422
                : 409;
    throw new ApiRequestError(statusCode, {
      code: error.code,
      details: error.details,
      retryable: error.retryable,
      severity: statusCode >= 500 ? "WARNING" : "INFO",
      type:
        statusCode === 403
          ? "AUTHORIZATION"
          : statusCode >= 500
            ? "INTEGRATION"
            : "MEMORY_INTEGRATION",
    });
  }
}

export function createMemoryGatewayRoutes(
  service: MemoryGatewayIntegration,
  options: {
    environment: Environment;
    resolvePolicy: (
      identity: IdentityContext,
      input: Input,
    ) => MemoryAccessPolicy;
    scope: string;
  },
): ApiRoute[] {
  const access = (resource: string) => ({
    action: "READ",
    environment: options.environment,
    resource,
    risk: "R0" as const,
    scope: options.scope,
  });
  return [
    {
      access: access("MEMORY_GATEWAY"),
      method: "POST",
      path: "/api/v1/memory-gateways/status",
      validate: validate(["gateway_id"]),
      handle: ({ input }) =>
        execute(() =>
          service.getGatewayStatus((input as Input).gateway_id as string),
        ),
    },
    {
      access: access("MEMORY_CONTEXT"),
      method: "POST",
      path: "/api/v1/memory/context",
      validate: validate([
        "gateway_id",
        "task_id",
        "project_id",
        "namespace",
        "query",
        "limit",
        "timeout_ms",
      ]),
      handle: ({ context, identity, input }) =>
        execute(() => {
          if (!identity)
            throw new Error("Authenticated memory route missing identity");
          const value = input as Input;
          const request: MemoryGatewayRetrievalRequest = {
            actor: { id: identity.actor_id, type: identity.actor_type },
            correlation_id: context.correlation_id,
            gateway_id: value.gateway_id as string,
            limit: value.limit as number,
            ...(value.max_attempts === undefined
              ? {}
              : { max_attempts: value.max_attempts as number }),
            namespace:
              value.namespace as MemoryGatewayRetrievalRequest["namespace"],
            project_id: value.project_id as string,
            query: value.query as string,
            request_id: context.request_id,
            ...(value.run_id === undefined
              ? {}
              : { run_id: value.run_id as string }),
            task_id: value.task_id as string,
            timeout_ms: value.timeout_ms as number,
          };
          return service.retrieveTaskContext(
            request,
            options.resolvePolicy(identity, value),
          );
        }),
    },
    {
      access: access("MEMORY_REFERENCE"),
      method: "POST",
      path: "/api/v1/memory-references/get",
      validate: validate(["reference_id"]),
      handle: ({ identity, input }) =>
        execute(() => {
          if (!identity)
            throw new Error("Authenticated memory route missing identity");
          const value = input as Input;
          return service.getReference(
            value.reference_id as string,
            options.resolvePolicy(identity, value),
          );
        }),
    },
  ];
}
