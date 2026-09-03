import type { ActorType } from "@maos/contracts";

export const MEMORY_NAMESPACES = [
  "/company",
  "/departments",
  "/projects",
  "/agents",
  "/tasks",
  "/decisions",
  "/artifacts",
  "/policies",
  "/operations",
  "/integrations",
] as const;
export type MemoryNamespace = (typeof MEMORY_NAMESPACES)[number];

export const MEMORY_TYPES = [
  "CORPORATE",
  "DEPARTMENT",
  "PROJECT",
  "AGENT",
  "TASK",
  "DECISION",
  "POLICY",
  "OPERATIONAL",
  "INTEGRATION",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const MEMORY_VALIDATIONS = [
  "UNVERIFIED",
  "SYSTEM_VERIFIED",
  "AGENT_VERIFIED",
  "HUMAN_VERIFIED",
  "AUTHORITATIVE",
] as const;
export type MemoryValidation = (typeof MEMORY_VALIDATIONS)[number];

export const MEMORY_CLASSIFICATIONS = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
  "PRIVATE_PERSONAL",
] as const;
export type MemoryClassification = (typeof MEMORY_CLASSIFICATIONS)[number];

export type MemoryGatewayHealth =
  "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "MAINTENANCE" | "UNKNOWN";
export type MemoryGatewayLifecycle = "ACTIVE" | "DISABLED";

export interface MemoryGatewayRegistration {
  credential_ref: string;
  endpoint: string;
  health: MemoryGatewayHealth;
  id: string;
  lifecycle: MemoryGatewayLifecycle;
  name: string;
}

export type MemoryGatewayStatus = Pick<
  MemoryGatewayRegistration,
  "health" | "id" | "lifecycle" | "name"
>;

export interface MemoryAccessPolicy {
  allowed_classifications: readonly MemoryClassification[];
  allowed_namespaces: readonly MemoryNamespace[];
  allowed_types: readonly MemoryType[];
}

export interface MemoryGatewayRetrievalRequest {
  actor: { id: string; type: ActorType };
  correlation_id: string;
  gateway_id: string;
  limit: number;
  max_attempts?: number;
  namespace: MemoryNamespace;
  project_id: string;
  query: string;
  request_id: string;
  run_id?: string;
  task_id: string;
  timeout_ms: number;
}

export interface GatewayMemoryItem {
  classification: MemoryClassification;
  content: string;
  external_memory_id: string;
  namespace: MemoryNamespace;
  provenance: {
    evidence_ids: readonly string[];
    retrieved_at: string;
  };
  scope_id: string;
  source: {
    external_resource_id: string;
    system_id: string;
  };
  type: MemoryType;
  validation: MemoryValidation;
}

export interface MemoryReference extends GatewayMemoryItem {
  gateway_id: string;
  id: string;
}

export interface MemoryGatewayAdapterContext {
  correlation_id: string;
  credential_ref: string;
  request_id: string;
  signal: AbortSignal;
}

export interface MemoryGatewayAdapter {
  retrieve(
    request: MemoryGatewayRetrievalRequest,
    context: MemoryGatewayAdapterContext,
  ): Promise<{ items: readonly GatewayMemoryItem[] }>;
}

export interface MemoryIntegrationEvent {
  actor: { id: string; type: ActorType };
  correlation_id: string;
  evidence: Record<string, unknown>;
  name: string;
  request_id: string;
  run_id?: string;
  task_id: string;
}

export interface MemoryRetrievalResult {
  events: readonly MemoryIntegrationEvent[];
  evidence: {
    excluded_count: number;
    gateway_id: string;
    reference_count: number;
    task_id: string;
  };
  references: readonly MemoryReference[];
}

export class MemoryGatewayError extends Error {
  constructor(
    readonly code: string,
    readonly details: Record<string, unknown> = {},
    readonly retryable = false,
  ) {
    super(code);
  }
}

type GatewayEntry = {
  adapter: MemoryGatewayAdapter;
  registration: MemoryGatewayRegistration;
};

const nonEmpty = (value: string): boolean => value.trim().length > 0;

export class MemoryGatewayIntegration {
  private readonly gateways = new Map<string, GatewayEntry>();
  private readonly references = new Map<string, MemoryReference>();

  constructor(
    private readonly onEvent?: (event: MemoryIntegrationEvent) => void,
  ) {}

  registerGateway(
    registration: MemoryGatewayRegistration,
    adapter: MemoryGatewayAdapter,
  ): MemoryGatewayRegistration {
    if (this.gateways.has(registration.id))
      throw new MemoryGatewayError("MEMORY_GATEWAY_ALREADY_EXISTS");
    if (
      !nonEmpty(registration.id) ||
      !nonEmpty(registration.name) ||
      !nonEmpty(registration.endpoint)
    )
      throw new MemoryGatewayError("INVALID_MEMORY_GATEWAY");
    if (!registration.credential_ref.startsWith("secret://"))
      throw new MemoryGatewayError("INVALID_CREDENTIAL_REFERENCE");
    try {
      const endpoint = new URL(registration.endpoint);
      if (
        endpoint.protocol !== "https:" ||
        endpoint.username.length > 0 ||
        endpoint.password.length > 0
      )
        throw new Error("insecure endpoint");
    } catch {
      throw new MemoryGatewayError("INVALID_GATEWAY_ENDPOINT");
    }
    this.gateways.set(registration.id, { adapter, registration });
    return registration;
  }

  getGateway(id: string): MemoryGatewayRegistration {
    return this.gateway(id).registration;
  }

  getGatewayStatus(id: string): MemoryGatewayStatus {
    const { health, id: gatewayId, lifecycle, name } = this.getGateway(id);
    return { health, id: gatewayId, lifecycle, name };
  }

  updateGatewayHealth(
    id: string,
    health: MemoryGatewayHealth,
  ): MemoryGatewayRegistration {
    const entry = this.gateway(id);
    const registration = { ...entry.registration, health };
    this.gateways.set(id, { ...entry, registration });
    return registration;
  }

  isReady(id: string): boolean {
    const gateway = this.getGateway(id);
    return gateway.lifecycle === "ACTIVE" && gateway.health === "HEALTHY";
  }

  getReference(id: string, policy: MemoryAccessPolicy): MemoryReference {
    const reference = this.references.get(id);
    if (!reference) throw new MemoryGatewayError("MEMORY_REFERENCE_NOT_FOUND");
    this.expectPolicy(policy, reference.namespace);
    if (
      !policy.allowed_types.includes(reference.type) ||
      !policy.allowed_classifications.includes(reference.classification)
    )
      throw new MemoryGatewayError("MEMORY_ACCESS_DENIED");
    return reference;
  }

  async retrieveTaskContext(
    request: MemoryGatewayRetrievalRequest,
    policy: MemoryAccessPolicy,
    externalSignal?: AbortSignal,
  ): Promise<MemoryRetrievalResult> {
    this.validateRequest(request);
    this.expectPolicy(policy, request.namespace);
    const entry = this.gateway(request.gateway_id);
    const requested = this.event(request, "MEMORY.RETRIEVAL_REQUESTED", {});
    const events = [requested];
    this.onEvent?.(requested);
    if (!this.isReady(request.gateway_id)) {
      const error = new MemoryGatewayError("GATEWAY_UNAVAILABLE", {
        health: entry.registration.health,
      });
      this.emitFailure(request, error);
      throw error;
    }
    const controller = new AbortController();
    let abortReason: "cancelled" | "timeout" | null = null;
    const cancel = () => {
      abortReason = "cancelled";
      controller.abort();
    };
    externalSignal?.addEventListener("abort", cancel, { once: true });
    if (externalSignal?.aborted) cancel();
    const timer = setTimeout(() => {
      abortReason = "timeout";
      controller.abort();
    }, request.timeout_ms);

    try {
      const response = await this.retrieveWithRetry(
        entry,
        request,
        controller.signal,
        () => abortReason,
      );
      const accepted: MemoryReference[] = [];
      let excludedCount = 0;
      for (const item of response.items) {
        this.validateItem(item, request, policy);
        if (item.classification === "PRIVATE_PERSONAL") {
          excludedCount += 1;
          continue;
        }
        const reference: MemoryReference = {
          ...item,
          gateway_id: request.gateway_id,
          id: `${request.gateway_id}:${item.external_memory_id}`,
        };
        this.references.set(reference.id, reference);
        accepted.push(reference);
      }
      const evidence = {
        excluded_count: excludedCount,
        gateway_id: request.gateway_id,
        reference_count: accepted.length,
        task_id: request.task_id,
      };
      const succeeded = this.event(
        request,
        "MEMORY.RETRIEVAL_SUCCEEDED",
        evidence,
      );
      events.push(succeeded);
      this.onEvent?.(succeeded);
      return { events, evidence, references: accepted };
    } catch (error) {
      if (error instanceof MemoryGatewayError) this.emitFailure(request, error);
      throw error;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", cancel);
    }
  }

  private emitFailure(
    request: MemoryGatewayRetrievalRequest,
    error: MemoryGatewayError,
  ): void {
    const name =
      error.code === "GATEWAY_TIMED_OUT"
        ? "MEMORY.RETRIEVAL_TIMED_OUT"
        : error.code === "GATEWAY_CANCELLED"
          ? "MEMORY.RETRIEVAL_CANCELLED"
          : "MEMORY.RETRIEVAL_FAILED";
    this.onEvent?.(
      this.event(request, name, {
        error_code: error.code,
        gateway_id: request.gateway_id,
        retryable: error.retryable,
        task_id: request.task_id,
      }),
    );
  }

  private async retrieveWithRetry(
    entry: GatewayEntry,
    request: MemoryGatewayRetrievalRequest,
    signal: AbortSignal,
    abortReason: () => "cancelled" | "timeout" | null,
  ): Promise<{ items: readonly GatewayMemoryItem[] }> {
    const maxAttempts = request.max_attempts ?? 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const aborted = new Promise<never>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () =>
              reject(
                new MemoryGatewayError(
                  abortReason() === "timeout"
                    ? "GATEWAY_TIMED_OUT"
                    : "GATEWAY_CANCELLED",
                ),
              ),
            { once: true },
          );
        });
        const response = await Promise.race([
          aborted,
          entry.adapter.retrieve(request, {
            correlation_id: request.correlation_id,
            credential_ref: entry.registration.credential_ref,
            request_id: request.request_id,
            signal,
          }),
        ]);
        if (signal.aborted)
          throw new MemoryGatewayError(
            abortReason() === "timeout"
              ? "GATEWAY_TIMED_OUT"
              : "GATEWAY_CANCELLED",
          );
        return response;
      } catch (error) {
        if (error instanceof MemoryGatewayError) {
          if (error.retryable && attempt < maxAttempts && !signal.aborted)
            continue;
          throw error;
        }
        throw new MemoryGatewayError("GATEWAY_FAILURE", {}, false);
      }
    }
    throw new MemoryGatewayError("GATEWAY_FAILURE");
  }

  private validateRequest(request: MemoryGatewayRetrievalRequest): void {
    if (
      !nonEmpty(request.actor.id) ||
      !nonEmpty(request.correlation_id) ||
      !nonEmpty(request.project_id) ||
      !nonEmpty(request.query) ||
      !nonEmpty(request.request_id) ||
      !nonEmpty(request.task_id) ||
      !Number.isSafeInteger(request.limit) ||
      request.limit < 1 ||
      request.limit > 100 ||
      !Number.isSafeInteger(request.timeout_ms) ||
      request.timeout_ms < 1 ||
      !Number.isSafeInteger(request.max_attempts ?? 1) ||
      (request.max_attempts ?? 1) < 1 ||
      (request.max_attempts ?? 1) > 3
    )
      throw new MemoryGatewayError("INVALID_MEMORY_RETRIEVAL_REQUEST");
  }

  private expectPolicy(
    policy: MemoryAccessPolicy,
    namespace: MemoryNamespace,
  ): void {
    if (
      !policy.allowed_namespaces.includes(namespace) ||
      policy.allowed_types.length === 0 ||
      policy.allowed_classifications.length === 0
    )
      throw new MemoryGatewayError("MEMORY_ACCESS_DENIED");
  }

  private validateItem(
    item: GatewayMemoryItem,
    request: MemoryGatewayRetrievalRequest,
    policy: MemoryAccessPolicy,
  ): void {
    if (
      item.namespace !== request.namespace ||
      item.scope_id !== request.project_id
    )
      throw new MemoryGatewayError("MEMORY_SCOPE_MISMATCH");
    if (
      !MEMORY_NAMESPACES.includes(item.namespace) ||
      !MEMORY_TYPES.includes(item.type) ||
      !MEMORY_VALIDATIONS.includes(item.validation) ||
      !MEMORY_CLASSIFICATIONS.includes(item.classification)
    )
      throw new MemoryGatewayError("INVALID_MEMORY_CONTRACT");
    if (
      !nonEmpty(item.external_memory_id) ||
      !nonEmpty(item.content) ||
      !nonEmpty(item.source.system_id) ||
      !nonEmpty(item.source.external_resource_id) ||
      !nonEmpty(item.provenance.retrieved_at) ||
      Number.isNaN(Date.parse(item.provenance.retrieved_at))
    )
      throw new MemoryGatewayError("INVALID_MEMORY_PROVENANCE");
    if (
      item.classification !== "PRIVATE_PERSONAL" &&
      (!policy.allowed_types.includes(item.type) ||
        !policy.allowed_classifications.includes(item.classification))
    )
      throw new MemoryGatewayError("MEMORY_ACCESS_DENIED");
  }

  private event(
    request: MemoryGatewayRetrievalRequest,
    name: string,
    evidence: Record<string, unknown>,
  ): MemoryIntegrationEvent {
    return {
      actor: request.actor,
      correlation_id: request.correlation_id,
      evidence,
      name,
      request_id: request.request_id,
      ...(request.run_id ? { run_id: request.run_id } : {}),
      task_id: request.task_id,
    };
  }

  private gateway(id: string): GatewayEntry {
    const gateway = this.gateways.get(id);
    if (!gateway) throw new MemoryGatewayError("MEMORY_GATEWAY_NOT_FOUND");
    return gateway;
  }
}

export type TaskContextSectionKind =
  | "TASK_INSTRUCTIONS"
  | "APPROVED_DECISIONS"
  | "PROJECT_CONSTRAINTS"
  | "REQUIRED_ARTIFACTS"
  | "RELEVANT_MEMORY"
  | "GENERAL_CORPORATE_POLICY";

export interface TaskContextInput {
  approved_decisions: readonly string[];
  general_corporate_policy: readonly string[];
  project_constraints: readonly string[];
  relevant_memory: readonly string[];
  required_artifacts: readonly string[];
  task_instructions: readonly string[];
}

export function assembleTaskContext(input: TaskContextInput): {
  sections: readonly {
    content: readonly string[];
    kind: TaskContextSectionKind;
  }[];
} {
  return {
    sections: [
      { content: input.task_instructions, kind: "TASK_INSTRUCTIONS" },
      { content: input.approved_decisions, kind: "APPROVED_DECISIONS" },
      { content: input.project_constraints, kind: "PROJECT_CONSTRAINTS" },
      { content: input.required_artifacts, kind: "REQUIRED_ARTIFACTS" },
      { content: input.relevant_memory, kind: "RELEVANT_MEMORY" },
      {
        content: input.general_corporate_policy,
        kind: "GENERAL_CORPORATE_POLICY",
      },
    ],
  };
}
