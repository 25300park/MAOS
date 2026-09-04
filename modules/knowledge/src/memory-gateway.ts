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

export const MEMORY_INTEGRATION_BOUNDARY = Object.freeze({
  gateway_role: "RETRIEVAL_RANKING_SUMMARIZATION",
  maos_persistence: "REFERENCE_AND_GOVERNANCE_METADATA_ONLY",
  memory_source_of_truth: "AI_MEMORY_GATEWAY",
  provider_router_owner: "MAOS_AGENT_MODEL_RUNNER_RUNTIME",
} as const);

export const MEMORY_OVERLAP_CLASSIFICATION = Object.freeze({
  CODE_EXECUTION: "KEEP",
  CRM_TOOLS: "KEEP",
  DEVELOPMENT_QA_PLANNING: "INTEGRATE",
  GITHUB_TOOLS: "KEEP",
  PENDING_ACTIONS: "INTEGRATE",
  PERSONAL_AGENT: "KEEP",
  PROVIDER_ROUTING: "INTEGRATE",
} as const);

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
    confidence?: number;
    evidence_ids: readonly string[];
    origin?: string;
    project_id?: string;
    quality?: string;
    references?: readonly string[];
    retrieval_reason?: string;
    retrieved_at: string;
    source_identity?: string;
    system_id?: string;
  };
  scope_id: string;
  source: {
    external_resource_id: string;
    system_id: string;
  };
  type: MemoryType;
  validation: MemoryValidation;
  kind?: "KNOWLEDGE" | "MEMORY";
  version?: string;
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
  submitCandidate?(
    candidate: MemoryCandidate,
  ): Promise<{ external_memory_id: string }>;
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

export const TASK_CONTEXT_CATEGORIES = [
  "APPROVED_DECISIONS",
  "PROJECT_CONSTRAINTS",
  "REQUIRED_ARTIFACTS",
  "RELEVANT_MEMORY",
  "GENERAL_CORPORATE_POLICY",
] as const;
export type TaskContextCategory = (typeof TASK_CONTEXT_CATEGORIES)[number];

export interface TaskContextRequest extends MemoryGatewayRetrievalRequest {
  agent_id: string;
  allow_partial: boolean;
  categories: readonly TaskContextCategory[];
  max_age_ms: number;
  privacy: { allow_private_personal: false };
  requested_classifications: readonly MemoryClassification[];
  require_provenance: true;
  system_id: string;
}

export interface MemoryCandidate {
  actor: { id: string; type: ActorType };
  content_hash: string;
  content_reference: string;
  correlation_id: string;
  evidence_ids: readonly string[];
  gateway_id: string;
  id: string;
  merged_external_memory_id?: string;
  project_id: string;
  reviewed_by?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "MERGED" | "EXPIRED";
  task_id: string;
  type: MemoryType;
  validation: MemoryValidation;
}

export interface MemoryIntegrationHealth {
  average_latency_ms: number;
  failure_rate: number;
  gateway_id: string;
  health: MemoryGatewayHealth;
  provenance_issues: number;
  ready: boolean;
  request_count: number;
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

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export class MemoryGatewayIntegration {
  private readonly gateways = new Map<string, GatewayEntry>();
  private readonly references = new Map<string, MemoryReference>();
  private readonly candidates = new Map<string, MemoryCandidate>();
  private readonly metrics = new Map<
    string,
    {
      failures: number;
      latency_ms: number;
      provenance_issues: number;
      requests: number;
    }
  >();

  constructor(
    private readonly onEvent?: (event: MemoryIntegrationEvent) => void,
    private readonly now: () => number = Date.now,
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
    this.metrics.set(registration.id, {
      failures: 0,
      latency_ms: 0,
      provenance_issues: 0,
      requests: 0,
    });
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

  getIntegrationHealth(id: string): MemoryIntegrationHealth {
    const registration = this.getGateway(id);
    const metrics = this.metrics.get(id) ?? {
      failures: 0,
      latency_ms: 0,
      provenance_issues: 0,
      requests: 0,
    };
    const effectiveHealth =
      registration.health === "HEALTHY" && metrics.provenance_issues > 0
        ? "DEGRADED"
        : registration.health;
    return {
      average_latency_ms:
        metrics.requests === 0 ? 0 : metrics.latency_ms / metrics.requests,
      failure_rate:
        metrics.requests === 0 ? 0 : metrics.failures / metrics.requests,
      gateway_id: id,
      health: effectiveHealth,
      provenance_issues: metrics.provenance_issues,
      ready: this.isReady(id) && effectiveHealth === "HEALTHY",
      request_count: metrics.requests,
    };
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
    const startedAt = this.now();
    const metrics = this.metric(request.gateway_id);
    metrics.requests += 1;
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
      metrics.failures += 1;
      if (error instanceof MemoryGatewayError) this.emitFailure(request, error);
      throw error;
    } finally {
      metrics.latency_ms += Math.max(0, this.now() - startedAt);
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", cancel);
    }
  }

  async assembleTaskContextPackage(
    request: TaskContextRequest,
    policy: MemoryAccessPolicy,
    input: Omit<TaskContextInput, "relevant_memory">,
    externalSignal?: AbortSignal,
  ): Promise<{
    degraded_reasons: readonly string[];
    references: readonly MemoryReference[];
    scope: {
      agent_id: string;
      project_id: string;
      system_id: string;
      task_id: string;
    };
    sections: ReturnType<typeof assembleTaskContext>["sections"];
    status: "DEGRADED" | "READY";
  }> {
    this.validateTaskContextRequest(request, policy);
    const result = await this.retrieveTaskContext(
      request,
      policy,
      externalSignal,
    );
    const references: MemoryReference[] = [];
    const degradedReasons = new Set<string>();
    for (const reference of result.references) {
      const reason = this.contextReferenceIssue(reference, request);
      if (!reason) {
        references.push(reference);
        continue;
      }
      this.metric(request.gateway_id).provenance_issues += 1;
      if (!request.allow_partial) throw new MemoryGatewayError(reason);
      degradedReasons.add(reason);
    }
    const assembled = assembleTaskContext({
      ...input,
      relevant_memory: references.map(({ content }) => content),
    });
    const sections = assembled.sections.filter(
      ({ kind }) =>
        kind === "TASK_INSTRUCTIONS" ||
        request.categories.includes(kind as TaskContextCategory),
    );
    const assembledEvent = this.event(
      request,
      degradedReasons.size === 0
        ? "MEMORY.CONTEXT_ASSEMBLED"
        : "MEMORY.CONTEXT_DEGRADED",
      {
        gateway_id: request.gateway_id,
        provenance_issue_count: degradedReasons.size,
        reference_count: references.length,
        task_id: request.task_id,
      },
    );
    this.onEvent?.(assembledEvent);
    return {
      degraded_reasons: [...degradedReasons],
      references,
      scope: {
        agent_id: request.agent_id,
        project_id: request.project_id,
        system_id: request.system_id,
        task_id: request.task_id,
      },
      sections,
      status: degradedReasons.size === 0 ? "READY" : "DEGRADED",
    };
  }

  createMemoryCandidate(
    input: Omit<MemoryCandidate, "status" | "validation">,
  ): MemoryCandidate {
    if (this.candidates.has(input.id))
      throw new MemoryGatewayError("MEMORY_CANDIDATE_ALREADY_EXISTS");
    this.gateway(input.gateway_id);
    if (
      !nonEmpty(input.id) ||
      !nonEmpty(input.actor.id) ||
      !nonEmpty(input.project_id) ||
      !nonEmpty(input.task_id) ||
      !MEMORY_TYPES.includes(input.type) ||
      !nonEmpty(input.content_reference) ||
      !input.content_reference.startsWith("artifact://") ||
      !/^sha256:[a-f0-9]{64}$/.test(input.content_hash) ||
      !Array.isArray(input.evidence_ids) ||
      input.evidence_ids.length === 0 ||
      input.evidence_ids.some((evidenceId) => !nonEmpty(evidenceId))
    )
      throw new MemoryGatewayError("INVALID_MEMORY_CANDIDATE");
    const candidate: MemoryCandidate = {
      ...input,
      status: "PENDING",
      validation: "UNVERIFIED",
    };
    this.candidates.set(candidate.id, candidate);
    this.emitCandidateEvent(
      candidate,
      candidate.actor,
      "MEMORY.CANDIDATE_CREATED",
    );
    return candidate;
  }

  reviewMemoryCandidate(
    id: string,
    review: {
      actor: { id: string; type: ActorType };
      decision: "APPROVE" | "REJECT";
      validation: MemoryValidation;
    },
  ): MemoryCandidate {
    const candidate = this.candidate(id);
    if (review.actor.type !== "HUMAN")
      throw new MemoryGatewayError("HUMAN_MEMORY_REVIEW_REQUIRED");
    if (candidate.status !== "PENDING")
      throw new MemoryGatewayError("MEMORY_CANDIDATE_NOT_PENDING");
    if (
      !["APPROVE", "REJECT"].includes(review.decision) ||
      !MEMORY_VALIDATIONS.includes(review.validation)
    )
      throw new MemoryGatewayError("INVALID_MEMORY_CANDIDATE_REVIEW");
    if (
      review.decision === "APPROVE" &&
      !["HUMAN_VERIFIED", "AUTHORITATIVE"].includes(review.validation)
    )
      throw new MemoryGatewayError("INVALID_MEMORY_CANDIDATE_VALIDATION");
    const reviewed: MemoryCandidate = {
      ...candidate,
      reviewed_by: review.actor.id,
      status: review.decision === "APPROVE" ? "APPROVED" : "REJECTED",
      validation: review.validation,
    };
    this.candidates.set(id, reviewed);
    this.emitCandidateEvent(
      reviewed,
      review.actor,
      review.decision === "APPROVE"
        ? "MEMORY.CANDIDATE_APPROVED"
        : "MEMORY.CANDIDATE_REJECTED",
    );
    return reviewed;
  }

  async submitMemoryCandidate(id: string): Promise<MemoryCandidate> {
    const candidate = this.candidate(id);
    if (candidate.status !== "APPROVED")
      throw new MemoryGatewayError("MEMORY_CANDIDATE_NOT_APPROVED");
    const adapter = this.gateway(candidate.gateway_id).adapter;
    if (!adapter.submitCandidate)
      throw new MemoryGatewayError("MEMORY_CANDIDATE_SUBMISSION_UNAVAILABLE");
    const result = await adapter.submitCandidate(candidate);
    if (!nonEmpty(result.external_memory_id))
      throw new MemoryGatewayError("INVALID_MEMORY_CANDIDATE_RESULT");
    const merged: MemoryCandidate = {
      ...candidate,
      merged_external_memory_id: result.external_memory_id,
      status: "MERGED",
    };
    this.candidates.set(id, merged);
    this.emitCandidateEvent(
      merged,
      { id: merged.reviewed_by!, type: "HUMAN" },
      "MEMORY.CANDIDATE_MERGED",
    );
    return merged;
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

  private validateTaskContextRequest(
    request: TaskContextRequest,
    policy: MemoryAccessPolicy,
  ): void {
    if (
      !nonEmpty(request.agent_id) ||
      !nonEmpty(request.system_id) ||
      (request.actor.type === "AGENT" &&
        request.actor.id !== request.agent_id) ||
      !Array.isArray(request.categories) ||
      request.categories.length === 0 ||
      request.categories.some(
        (category) => !TASK_CONTEXT_CATEGORIES.includes(category),
      ) ||
      !Number.isSafeInteger(request.max_age_ms) ||
      request.max_age_ms < 1 ||
      request.require_provenance !== true ||
      !request.privacy ||
      request.privacy.allow_private_personal !== false ||
      !Array.isArray(request.requested_classifications) ||
      request.requested_classifications.length === 0 ||
      request.requested_classifications.includes("PRIVATE_PERSONAL") ||
      request.requested_classifications.some(
        (classification) =>
          !policy.allowed_classifications.includes(classification),
      )
    )
      throw new MemoryGatewayError("INVALID_TASK_CONTEXT_REQUEST");
  }

  private contextReferenceIssue(
    reference: MemoryReference,
    request: TaskContextRequest,
  ): string | null {
    if (!request.requested_classifications.includes(reference.classification))
      return "MEMORY_CLASSIFICATION_NOT_REQUESTED";
    if (
      !["KNOWLEDGE", "MEMORY"].includes(reference.kind ?? "") ||
      !nonEmpty(reference.version)
    )
      return "INVALID_MEMORY_CONTRACT";
    const provenance = reference.provenance;
    if (
      !nonEmpty(provenance.source_identity ?? "") ||
      !nonEmpty(provenance.origin ?? "") ||
      !nonEmpty(provenance.retrieval_reason ?? "") ||
      !nonEmpty(provenance.project_id ?? "") ||
      !nonEmpty(provenance.system_id ?? "") ||
      provenance.project_id !== request.project_id ||
      provenance.system_id !== request.system_id ||
      !Array.isArray(provenance.references) ||
      provenance.references.length === 0 ||
      typeof provenance.confidence !== "number" ||
      provenance.confidence < 0 ||
      provenance.confidence > 1 ||
      !nonEmpty(provenance.quality ?? "")
    )
      return "INVALID_MEMORY_PROVENANCE";
    if (this.now() - Date.parse(provenance.retrieved_at) > request.max_age_ms)
      return "MEMORY_STALE";
    return null;
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

  private candidate(id: string): MemoryCandidate {
    const candidate = this.candidates.get(id);
    if (!candidate) throw new MemoryGatewayError("MEMORY_CANDIDATE_NOT_FOUND");
    return candidate;
  }

  private emitCandidateEvent(
    candidate: MemoryCandidate,
    actor: { id: string; type: ActorType },
    name: string,
  ): void {
    this.onEvent?.({
      actor,
      correlation_id: candidate.correlation_id,
      evidence: {
        candidate_id: candidate.id,
        evidence_ids: candidate.evidence_ids,
        gateway_id: candidate.gateway_id,
        status: candidate.status,
      },
      name,
      request_id: `memory-candidate:${candidate.id}`,
      task_id: candidate.task_id,
    });
  }

  private metric(id: string) {
    const metric = this.metrics.get(id);
    if (!metric) throw new MemoryGatewayError("MEMORY_GATEWAY_NOT_FOUND");
    return metric;
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
