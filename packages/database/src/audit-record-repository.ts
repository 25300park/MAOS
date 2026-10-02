import { createHash } from "node:crypto";
import type { MigrationDatabase } from "./types.js";

export interface AuditRecordInput {
  readonly action: string;
  readonly actorId: string;
  readonly actorType: "HUMAN" | "AGENT" | "SYSTEM";
  readonly targetType: string;
  readonly targetId: string;
  readonly result: "SUCCEEDED" | "FAILED" | "DENIED" | "CANCELLED";
  readonly requestId: string;
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly evidenceRefs: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  /** Preserve an established deterministic audit identity while sharing append logic. */
  readonly deterministicIdentitySeed?: string;
  /** Existing command intake retries receive fresh transport tracing identifiers. */
  readonly replayTransportFieldsAreVolatile?: boolean;
  readonly projectId?: string;
  readonly approvalId?: string;
  readonly taskId?: string;
  readonly workflowInstanceId?: string;
  readonly runId?: string;
  readonly toolCallId?: string;
}

const AUDIT_APPEND_LOCK = 1_934_518_121;

export function canonicalAuditValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalAuditValue).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, item]) => `${JSON.stringify(key)}:${canonicalAuditValue(item)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function deterministicAuditUuid(value: string): string {
  const bytes = Buffer.from(
    createHash("sha256").update(value).digest("hex").slice(0, 32),
    "hex",
  );
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class PostgresAuditRecordRepository {
  #pending: Promise<void> = Promise.resolve();

  constructor(private readonly database: MigrationDatabase) {}

  record(input: AuditRecordInput): Promise<void> {
    const operation = () => this.#record(input, true);
    const result = this.#pending.then(operation, operation);
    this.#pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  recordInTransaction(input: AuditRecordInput): Promise<void> {
    return this.#record(input, false);
  }

  async #record(input: AuditRecordInput, ownsTransaction: boolean) {
    if (ownsTransaction) await this.database.exec("BEGIN");
    try {
      await this.database.query("SELECT pg_advisory_xact_lock($1)", [
        AUDIT_APPEND_LOCK,
      ]);
      const id = deterministicAuditUuid(
        input.deterministicIdentitySeed ??
          `${input.action}:${input.idempotencyKey}`,
      );
      const existing = await this.database.query<{
        action: string;
        actor_id: string;
        actor_type: string;
        target_type: string;
        target_id: string;
        result: string;
        request_id: string;
        correlation_id: string;
        trace_id: string;
        span_id: string;
        project_id: string | null;
        approval_id: string | null;
        task_id: string | null;
        workflow_instance_id: string | null;
        run_id: string | null;
        tool_call_id: string | null;
        evidence_refs: string[];
        metadata: unknown;
      }>(
        `SELECT action, actor_id, actor_type, target_type, target_id, result,
                request_id, correlation_id, trace_id, span_id, project_id,
                approval_id, task_id, workflow_instance_id, run_id, tool_call_id,
                evidence_refs, metadata
           FROM audit.audit_records WHERE id = $1`,
        [id],
      );
      if (existing.rows[0]) {
        const row = existing.rows[0];
        const stableActual = input.replayTransportFieldsAreVolatile
          ? {
              ...row,
              request_id: undefined,
              correlation_id: undefined,
              trace_id: undefined,
              span_id: undefined,
            }
          : row;
        const expected = {
          action: input.action,
          actor_id: input.actorId,
          actor_type: input.actorType,
          target_type: input.targetType,
          target_id: input.targetId,
          result: input.result,
          request_id: input.replayTransportFieldsAreVolatile
            ? undefined
            : input.requestId,
          correlation_id: input.replayTransportFieldsAreVolatile
            ? undefined
            : input.correlationId,
          trace_id: input.replayTransportFieldsAreVolatile
            ? undefined
            : input.traceId,
          span_id: input.replayTransportFieldsAreVolatile
            ? undefined
            : input.spanId,
          project_id: input.projectId ?? null,
          approval_id: input.approvalId ?? null,
          task_id: input.taskId ?? null,
          workflow_instance_id: input.workflowInstanceId ?? null,
          run_id: input.runId ?? null,
          tool_call_id: input.toolCallId ?? null,
          evidence_refs: [...input.evidenceRefs],
          metadata: input.metadata,
        };
        if (
          canonicalAuditValue(stableActual) !== canonicalAuditValue(expected)
        ) {
          throw new Error("AUDIT_RECORD_REPLAY_CONFLICT");
        }
        if (ownsTransaction) await this.database.exec("COMMIT");
        return;
      }
      const previous = await this.database.query<{
        occurred_at: Date | string;
        record_hash: string;
      }>(
        "SELECT occurred_at, record_hash FROM audit.audit_records ORDER BY occurred_at DESC, id DESC LIMIT 1",
      );
      const previousHash = previous.rows[0]?.record_hash ?? null;
      const previousTime = previous.rows[0]
        ? new Date(previous.rows[0].occurred_at).getTime()
        : 0;
      const occurredAt = new Date(
        Math.max(Date.now(), previousTime + 1),
      ).toISOString();
      const recordHash = createHash("sha256")
        .update(canonicalAuditValue({ ...input, id, occurredAt, previousHash }))
        .digest("hex");
      await this.database.query(
        `INSERT INTO audit.audit_records (
           id, actor_type, actor_id, action, target_type, target_id, result,
           request_id, correlation_id, trace_id, span_id, project_id,
           evidence_refs, metadata, previous_hash, record_hash, occurred_at,
           approval_id, task_id, workflow_instance_id, run_id, tool_call_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          id,
          input.actorType,
          input.actorId,
          input.action,
          input.targetType,
          input.targetId,
          input.result,
          input.requestId,
          input.correlationId,
          input.traceId,
          input.spanId,
          input.projectId ?? null,
          [...input.evidenceRefs],
          JSON.stringify(input.metadata),
          previousHash,
          recordHash,
          occurredAt,
          input.approvalId ?? null,
          input.taskId ?? null,
          input.workflowInstanceId ?? null,
          input.runId ?? null,
          input.toolCallId ?? null,
        ],
      );
      if (ownsTransaction) await this.database.exec("COMMIT");
    } catch (error) {
      if (ownsTransaction) await this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
