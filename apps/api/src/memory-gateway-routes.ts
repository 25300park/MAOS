import type { Environment } from "@maos/config";
import type { IdentityContext } from "@maos/module-identity";
import {
  MemoryGatewayError,
  type MemoryAccessPolicy,
  type MemoryGatewayIntegration,
  type MemoryGatewayRetrievalRequest,
  type TaskContextInput,
  type TaskContextRequest,
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
  const candidateAccess = (action: "CREATE" | "REVIEW" | "SUBMIT") => ({
    action,
    environment: options.environment,
    resource: "MEMORY_CANDIDATE",
    risk: "R2" as const,
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
      access: access("MEMORY_INTEGRATION_HEALTH"),
      method: "POST",
      path: "/api/v1/memory-gateways/health",
      validate: validate(["gateway_id"]),
      handle: ({ input }) =>
        execute(() =>
          service.getIntegrationHealth((input as Input).gateway_id as string),
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
      access: access("MEMORY_CONTEXT_PACKAGE"),
      method: "POST",
      path: "/api/v1/memory/context-packages/assemble",
      validate: validate([
        "agent_id",
        "allow_partial",
        "approved_decisions",
        "categories",
        "gateway_id",
        "general_corporate_policy",
        "limit",
        "max_age_ms",
        "namespace",
        "privacy",
        "project_constraints",
        "project_id",
        "query",
        "requested_classifications",
        "require_provenance",
        "required_artifacts",
        "system_id",
        "task_id",
        "task_instructions",
        "timeout_ms",
      ]),
      handle: ({ context, identity, input }) =>
        execute(() => {
          if (!identity)
            throw new Error("Authenticated memory route missing identity");
          const value = input as Input;
          const request: TaskContextRequest = {
            actor: { id: identity.actor_id, type: identity.actor_type },
            agent_id: value.agent_id as string,
            allow_partial: value.allow_partial as boolean,
            categories: value.categories as TaskContextRequest["categories"],
            correlation_id: context.correlation_id,
            gateway_id: value.gateway_id as string,
            limit: value.limit as number,
            max_age_ms: value.max_age_ms as number,
            namespace: value.namespace as TaskContextRequest["namespace"],
            privacy: value.privacy as TaskContextRequest["privacy"],
            project_id: value.project_id as string,
            query: value.query as string,
            requested_classifications:
              value.requested_classifications as TaskContextRequest["requested_classifications"],
            request_id: context.request_id,
            require_provenance:
              value.require_provenance as TaskContextRequest["require_provenance"],
            ...(value.run_id === undefined
              ? {}
              : { run_id: value.run_id as string }),
            system_id: value.system_id as string,
            task_id: value.task_id as string,
            timeout_ms: value.timeout_ms as number,
          };
          const contextInput: Omit<TaskContextInput, "relevant_memory"> = {
            approved_decisions: value.approved_decisions as readonly string[],
            general_corporate_policy:
              value.general_corporate_policy as readonly string[],
            project_constraints: value.project_constraints as readonly string[],
            required_artifacts: value.required_artifacts as readonly string[],
            task_instructions: value.task_instructions as readonly string[],
          };
          return service.assembleTaskContextPackage(
            request,
            options.resolvePolicy(identity, value),
            contextInput,
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
    {
      access: candidateAccess("CREATE"),
      method: "POST",
      path: "/api/v1/memory-candidates/create",
      validate: validate([
        "content_hash",
        "content_reference",
        "evidence_ids",
        "gateway_id",
        "id",
        "project_id",
        "task_id",
        "type",
      ]),
      handle: ({ context, identity, input }) =>
        execute(() => {
          if (!identity)
            throw new Error("Authenticated memory route missing identity");
          const value = input as Input;
          return service.createMemoryCandidate({
            actor: { id: identity.actor_id, type: identity.actor_type },
            content_hash: value.content_hash as string,
            content_reference: value.content_reference as string,
            correlation_id: context.correlation_id,
            evidence_ids: value.evidence_ids as readonly string[],
            gateway_id: value.gateway_id as string,
            id: value.id as string,
            project_id: value.project_id as string,
            task_id: value.task_id as string,
            type: value.type as Parameters<
              typeof service.createMemoryCandidate
            >[0]["type"],
          });
        }),
    },
    {
      access: candidateAccess("REVIEW"),
      method: "POST",
      path: "/api/v1/memory-candidates/review",
      validate: validate(["candidate_id", "decision", "validation"]),
      handle: ({ identity, input }) =>
        execute(() => {
          if (!identity)
            throw new Error("Authenticated memory route missing identity");
          const value = input as Input;
          return service.reviewMemoryCandidate(value.candidate_id as string, {
            actor: { id: identity.actor_id, type: identity.actor_type },
            decision: value.decision as "APPROVE" | "REJECT",
            validation: value.validation as Parameters<
              typeof service.reviewMemoryCandidate
            >[1]["validation"],
          });
        }),
    },
    {
      access: candidateAccess("SUBMIT"),
      method: "POST",
      path: "/api/v1/memory-candidates/submit",
      validate: validate(["candidate_id"]),
      handle: ({ input }) =>
        execute(() =>
          service.submitMemoryCandidate(
            (input as Input).candidate_id as string,
          ),
        ),
    },
  ];
}
