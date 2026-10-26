import {
  MemoryGatewayError,
  type MemoryAccessPolicy,
  type MemoryClassification,
  type MemoryGatewayIntegration,
  type MemoryGatewayRetrievalRequest,
  type MemoryType,
  type MemoryValidation,
} from "./memory-gateway.js";

export const AI_MEMORY_CONTEXT_AUTHORITY_BOUNDARY = Object.freeze({
  currentProjectStateAuthority: false,
  routingAuthority: false,
  approvalAuthority: false,
  executionAuthority: false,
} as const);

export type AiMemoryContextStatus =
  | "AVAILABLE"
  | "EMPTY"
  | "DEGRADED"
  | "UNAVAILABLE";

export interface ProjectContextQuery {
  readonly projectId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly query: string;
  readonly limit: number;
}

export interface SafeProjectMemoryContextItem {
  readonly memoryRef: string;
  readonly projectId: string;
  readonly sourceType: MemoryType;
  readonly summary: string;
  readonly occurredAt: string;
  readonly validation: MemoryValidation;
  readonly relevance: number | null;
  readonly contextRefs: readonly string[];
  readonly artifactRefs: readonly string[];
}

export interface ProjectContextResult {
  readonly status: AiMemoryContextStatus;
  readonly items: readonly SafeProjectMemoryContextItem[];
  readonly contextRefs: readonly string[];
  readonly artifactRefs: readonly string[];
  readonly warningCode: string | null;
}

export interface AiMemoryProjectContextConfig {
  readonly accessPolicy: {
    readonly allowedClassifications: readonly MemoryClassification[];
    readonly allowedTypes: readonly MemoryType[];
  };
  readonly actor: MemoryGatewayRetrievalRequest["actor"];
  readonly gatewayId: string;
  readonly maxAgeMs: number;
  readonly systemId: string;
  readonly timeoutMs: number;
}

const nonBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const highConfidenceSecret =
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bsk-[A-Za-z0-9]{32,}\b/;
const secretReference = /^secret(?:ref)?:\/\//iu;

function emptyResult(
  status: Exclude<AiMemoryContextStatus, "AVAILABLE">,
  warningCode: string,
): ProjectContextResult {
  return Object.freeze({
    status,
    items: Object.freeze([]),
    contextRefs: Object.freeze([]),
    artifactRefs: Object.freeze([]),
    warningCode,
  });
}

function unique(values: readonly string[]) {
  return Object.freeze([...new Set(values)]);
}

export class AiMemoryProjectContextAdapter {
  private readonly policy: MemoryAccessPolicy;

  constructor(
    private readonly gateway: Pick<
      MemoryGatewayIntegration,
      "assembleTaskContextPackage"
    >,
    private readonly config: AiMemoryProjectContextConfig,
  ) {
    this.policy = Object.freeze({
      allowed_namespaces: Object.freeze(["/projects"] as const),
      allowed_types: Object.freeze([...config.accessPolicy.allowedTypes]),
      allowed_classifications: Object.freeze([
        ...config.accessPolicy.allowedClassifications,
      ]),
    });
  }

  async queryProjectContext(
    input: ProjectContextQuery,
  ): Promise<ProjectContextResult> {
    if (
      !nonBlank(input.projectId) ||
      !nonBlank(input.requestId) ||
      !nonBlank(input.correlationId) ||
      !nonBlank(input.query) ||
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100
    )
      return emptyResult("DEGRADED", "AI_MEMORY_CONTEXT_REJECTED");

    try {
      const result = await this.gateway.assembleTaskContextPackage(
        {
          actor: this.config.actor,
          correlation_id: input.correlationId,
          gateway_id: this.config.gatewayId,
          limit: input.limit,
          namespace: "/projects",
          project_id: input.projectId,
          query: input.query,
          request_id: input.requestId,
          task_id: input.requestId,
          timeout_ms: this.config.timeoutMs,
          agent_id: this.config.actor.id,
          allow_partial: true,
          categories: ["RELEVANT_MEMORY"],
          max_age_ms: this.config.maxAgeMs,
          privacy: { allow_private_personal: false },
          requested_classifications:
            this.config.accessPolicy.allowedClassifications,
          require_provenance: true,
          system_id: this.config.systemId,
        },
        this.policy,
        {
          approved_decisions: [],
          general_corporate_policy: [],
          project_constraints: [],
          required_artifacts: [],
          task_instructions: [input.query],
        },
      );

      const items = Object.freeze(
        result.references.map((reference) => {
          const references = reference.provenance.references ?? [];
          const artifactRefs = references.filter((value) =>
            value.startsWith("artifact://"),
          );
          const contextRefs = references.filter(
            (value) => !value.startsWith("artifact://"),
          );
          return Object.freeze({
            memoryRef: reference.id,
            projectId: input.projectId,
            sourceType: reference.type,
            summary: reference.content,
            occurredAt: reference.provenance.retrieved_at,
            validation: reference.validation,
            relevance: reference.provenance.confidence ?? null,
            contextRefs: unique(contextRefs),
            artifactRefs: unique(artifactRefs),
          });
        }),
      );

      if (items.length === 0) {
        return result.degraded_reasons.length > 0
          ? emptyResult("DEGRADED", "AI_MEMORY_CONTEXT_REJECTED")
          : emptyResult("EMPTY", "AI_MEMORY_EMPTY");
      }
      if (
        items.some(
          (item) =>
            highConfidenceSecret.test(item.summary) ||
            [...item.contextRefs, ...item.artifactRefs].some((reference) =>
              secretReference.test(reference),
            ),
        )
      )
        return emptyResult("DEGRADED", "AI_MEMORY_CONTEXT_REJECTED");
      return Object.freeze({
        status: "AVAILABLE",
        items,
        contextRefs: unique(
          items.flatMap((item) => [item.memoryRef, ...item.contextRefs]),
        ),
        artifactRefs: unique(items.flatMap((item) => item.artifactRefs)),
        warningCode:
          result.degraded_reasons.length > 0
            ? "AI_MEMORY_CONTEXT_PARTIAL"
            : null,
      });
    } catch (error) {
      const rejected =
        error instanceof MemoryGatewayError &&
        (error.code.startsWith("INVALID_") ||
          error.code === "MEMORY_SCOPE_MISMATCH" ||
          error.code === "MEMORY_ACCESS_DENIED" ||
          error.code === "MEMORY_STALE");
      return rejected
        ? emptyResult("DEGRADED", "AI_MEMORY_CONTEXT_REJECTED")
        : emptyResult("UNAVAILABLE", "AI_MEMORY_UNAVAILABLE");
    }
  }
}
