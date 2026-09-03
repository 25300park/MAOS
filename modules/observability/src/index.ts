import { createHash, randomUUID } from "node:crypto";
import type { ActorType } from "@maos/contracts";
import { redactStructuredData } from "@maos/logging";

export type HealthStatus =
  "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "MAINTENANCE" | "UNKNOWN";
export type AuditResult = "SUCCEEDED" | "FAILED" | "DENIED" | "CANCELLED";

export interface ObservationContext {
  approval_id?: string;
  artifact_id?: string;
  correlation_id: string;
  project_id?: string;
  request_id: string;
  run_id?: string;
  span_id: string;
  system_id?: string;
  task_id?: string;
  tool_call_id?: string;
  trace_id: string;
  workflow_instance_id?: string;
}

export interface DomainEvent {
  context: ObservationContext;
  id: string;
  kind: "EVENT";
  name: string;
  occurred_at: string;
  payload: Record<string, unknown>;
}

export interface MetricRecord {
  id: string;
  kind: "METRIC";
  labels: Record<string, string>;
  name: string;
  observed_at: string;
  value: number;
}

export interface TraceRecord {
  context: ObservationContext;
  duration_ms: number;
  id: string;
  kind: "TRACE";
  name: string;
  observed_at: string;
  status: "OK" | "ERROR";
}

export interface AuditRecord {
  action: string;
  actor: { id: string; type: ActorType };
  context: ObservationContext;
  evidence_refs: readonly string[];
  id: string;
  kind: "AUDIT";
  metadata: Record<string, unknown>;
  occurred_at: string;
  previous_hash: string | null;
  record_hash: string;
  result: AuditResult;
  target: { id: string; type: string };
}

export class ObservabilityAuditError extends Error {
  constructor(
    readonly code: "AUDIT_ACCESS_DENIED" | "INVALID_AUDIT_RECORD",
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

const nonEmpty = (value: string | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;
const CANONICAL_NAME = /^[A-Z][A-Z0-9_]*\.[A-Z][A-Z0-9_]*$/;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function validateContext(context: ObservationContext): void {
  if (
    !nonEmpty(context.request_id) ||
    !nonEmpty(context.correlation_id) ||
    !nonEmpty(context.trace_id) ||
    !nonEmpty(context.span_id)
  ) {
    throw new ObservabilityAuditError("INVALID_AUDIT_RECORD", {
      reason: "MISSING_CORRELATION_CONTEXT",
    });
  }
}

export class ObservabilityAuditService {
  readonly #audits: AuditRecord[] = [];
  readonly #events: DomainEvent[] = [];
  readonly #metrics: MetricRecord[] = [];
  readonly #traces: TraceRecord[] = [];
  readonly #now: () => Date;
  readonly #id: () => string;

  constructor(options: { id?: () => string; now?: () => Date } = {}) {
    this.#id = options.id ?? randomUUID;
    this.#now = options.now ?? (() => new Date());
  }

  recordEvent(input: {
    context: ObservationContext;
    name: string;
    payload?: Record<string, unknown>;
  }): DomainEvent {
    validateContext(input.context);
    if (!CANONICAL_NAME.test(input.name))
      throw new ObservabilityAuditError("INVALID_AUDIT_RECORD", {
        reason: "INVALID_EVENT_NAME",
      });
    const event: DomainEvent = {
      context: { ...input.context },
      id: this.#id(),
      kind: "EVENT",
      name: input.name,
      occurred_at: this.#now().toISOString(),
      payload: redactStructuredData(input.payload ?? {}) as Record<
        string,
        unknown
      >,
    };
    this.#events.push(event);
    return structuredClone(event);
  }

  recordMetric(input: {
    labels?: Record<string, string>;
    name: string;
    value: number;
  }): MetricRecord {
    if (!/^[a-z][a-z0-9_]*$/.test(input.name) || !Number.isFinite(input.value))
      throw new ObservabilityAuditError("INVALID_AUDIT_RECORD", {
        reason: "INVALID_METRIC",
      });
    const metric: MetricRecord = {
      id: this.#id(),
      kind: "METRIC",
      labels: { ...(input.labels ?? {}) },
      name: input.name,
      observed_at: this.#now().toISOString(),
      value: input.value,
    };
    this.#metrics.push(metric);
    return structuredClone(metric);
  }

  recordTrace(input: {
    context: ObservationContext;
    duration_ms: number;
    name: string;
    status: "OK" | "ERROR";
  }): TraceRecord {
    validateContext(input.context);
    if (!nonEmpty(input.name) || input.duration_ms < 0)
      throw new ObservabilityAuditError("INVALID_AUDIT_RECORD", {
        reason: "INVALID_TRACE",
      });
    const trace: TraceRecord = {
      ...input,
      context: { ...input.context },
      id: this.#id(),
      kind: "TRACE",
      observed_at: this.#now().toISOString(),
    };
    this.#traces.push(trace);
    return structuredClone(trace);
  }

  recordAudit(input: {
    action: string;
    actor: { id: string; type: ActorType };
    context: ObservationContext;
    evidence_refs: readonly string[];
    metadata?: Record<string, unknown>;
    result: AuditResult;
    target: { id: string; type: string };
  }): AuditRecord {
    validateContext(input.context);
    if (
      !CANONICAL_NAME.test(input.action) ||
      !nonEmpty(input.actor.id) ||
      !nonEmpty(input.target.id) ||
      !/^[A-Z][A-Z0-9_]*$/.test(input.target.type) ||
      input.evidence_refs.some((reference) => !nonEmpty(reference))
    ) {
      throw new ObservabilityAuditError("INVALID_AUDIT_RECORD");
    }
    const previous_hash = this.#audits.at(-1)?.record_hash ?? null;
    const unsigned = {
      action: input.action,
      actor: { ...input.actor },
      context: { ...input.context },
      evidence_refs: [...input.evidence_refs],
      id: this.#id(),
      kind: "AUDIT" as const,
      metadata: redactStructuredData(input.metadata ?? {}) as Record<
        string,
        unknown
      >,
      occurred_at: this.#now().toISOString(),
      previous_hash,
      result: input.result,
      target: { ...input.target },
    };
    const record: AuditRecord = { ...unsigned, record_hash: digest(unsigned) };
    this.#audits.push(record);
    return structuredClone(record);
  }

  queryAudit(
    query: { action?: string; actor_id?: string; project_id?: string },
    access: { allowed: boolean; project_ids: readonly string[] },
  ): AuditRecord[] {
    if (!access.allowed)
      throw new ObservabilityAuditError("AUDIT_ACCESS_DENIED");
    return this.#audits
      .filter(
        (record) =>
          (!query.action || record.action === query.action) &&
          (!query.actor_id || record.actor.id === query.actor_id) &&
          (!query.project_id ||
            record.context.project_id === query.project_id) &&
          !!record.context.project_id &&
          access.project_ids.includes(record.context.project_id),
      )
      .map((record) => structuredClone(record));
  }

  queryEvents(
    query: { name?: string; project_id?: string },
    access: { allowed: boolean; project_ids: readonly string[] },
  ): DomainEvent[] {
    if (!access.allowed)
      throw new ObservabilityAuditError("AUDIT_ACCESS_DENIED");
    return this.#events
      .filter(
        (event) =>
          (!query.name || event.name === query.name) &&
          (!query.project_id ||
            event.context.project_id === query.project_id) &&
          !!event.context.project_id &&
          access.project_ids.includes(event.context.project_id),
      )
      .map((event) => structuredClone(event));
  }

  verifyAuditIntegrity(): boolean {
    return this.#audits.every((record, index) => {
      const { record_hash, ...unsigned } = record;
      return (
        record.previous_hash ===
          (index === 0 ? null : this.#audits[index - 1]?.record_hash) &&
        digest(unsigned) === record_hash
      );
    });
  }

  aggregateHealth(checks: readonly { name: string; status: HealthStatus }[]): {
    checks: readonly { name: string; status: HealthStatus }[];
    status: HealthStatus;
  } {
    const priority: readonly HealthStatus[] = [
      "UNAVAILABLE",
      "DEGRADED",
      "MAINTENANCE",
      "UNKNOWN",
      "HEALTHY",
    ];
    return {
      checks: checks.map((check) => ({ ...check })),
      status:
        priority.find((status) =>
          checks.some((check) => check.status === status),
        ) ?? "UNKNOWN",
    };
  }
}
