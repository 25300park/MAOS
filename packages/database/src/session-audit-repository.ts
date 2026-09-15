import { createHash, randomUUID } from "node:crypto";
import type { MigrationDatabase } from "./types.js";

export interface StoredSessionAuditInput {
  readonly action: "SESSION.ISSUED" | "SESSION.REVOKED";
  readonly actor_id: string;
  readonly bff_service_actor_id: string;
  readonly correlation_id: string;
  readonly evidence_refs: readonly string[];
  readonly occurred_at: string;
  readonly project_scope: string;
  readonly request_id: string;
  readonly result: "SUCCEEDED";
  readonly session_version: number;
  readonly span_id: string;
  readonly target_id: string;
  readonly tenant_binding_origin: string;
  readonly tenant_binding_ref: string;
  readonly trace_id: string;
}

export interface StoredSessionDenialInput {
  readonly actor_id?: string;
  readonly bff_service_actor_id: string;
  readonly correlation_id: string;
  readonly occurred_at: string;
  readonly project_scope: string;
  readonly reason: string;
  readonly request_id: string;
  readonly span_id: string;
  readonly tenant_binding_ref?: string;
  readonly trace_id: string;
}

export interface StoredSessionAuditRow {
  readonly action: string;
  readonly actor_id: string;
  readonly evidence_refs: string[];
  readonly metadata: Record<string, unknown>;
  readonly occurred_at: Date | string;
  readonly previous_hash: string | null;
  readonly project_id: string | null;
  readonly record_hash: string;
  readonly result: string;
  readonly target_id: string;
}

export interface StoredSessionDenialRow {
  readonly correlation_id: string;
  readonly name: string;
  readonly occurred_at: Date | string;
  readonly payload: Record<string, unknown>;
  readonly project_id: string | null;
}

const AUDIT_APPEND_LOCK = 1_934_518_121;

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

export class PostgresSessionAuditRepository {
  #pending: Promise<void> = Promise.resolve();

  constructor(private readonly database: MigrationDatabase) {}

  recordAudit(input: StoredSessionAuditInput): Promise<void> {
    return this.exclusive(async () => {
      await this.database.exec("BEGIN");
      try {
        await this.database.query("SELECT pg_advisory_xact_lock($1)", [
          AUDIT_APPEND_LOCK,
        ]);
        const binding = await this.database.query<{ project_id: string }>(
          `SELECT project_id
             FROM identity.human_project_assignments
            WHERE id = $1 AND human_id = $2 AND scope = $3
              AND revoked_at IS NULL`,
          [input.tenant_binding_ref, input.actor_id, input.project_scope],
        );
        const projectId = binding.rows[0]?.project_id;
        if (!projectId) {
          throw new Error("Session audit tenant binding unavailable");
        }
        const previous = await this.database.query<{
          occurred_at: Date | string;
          record_hash: string;
        }>(
          `SELECT occurred_at, record_hash FROM audit.audit_records
           ORDER BY occurred_at DESC, id DESC LIMIT 1`,
        );
        const id = randomUUID();
        const previousHash = previous.rows[0]?.record_hash ?? null;
        const previousTime = previous.rows[0]
          ? new Date(previous.rows[0].occurred_at).getTime()
          : Number.NEGATIVE_INFINITY;
        const requestedTime = new Date(input.occurred_at).getTime();
        const occurredAt = new Date(
          Math.max(requestedTime, previousTime + 1),
        ).toISOString();
        const metadata = {
          bff_service_actor_id: input.bff_service_actor_id,
          session_version: input.session_version,
          tenant_binding_origin: input.tenant_binding_origin,
        };
        const recordHash = digest({
          action: input.action,
          actor_id: input.actor_id,
          correlation_id: input.correlation_id,
          evidence_refs: input.evidence_refs,
          id,
          metadata,
          occurred_at: occurredAt,
          previous_hash: previousHash,
          project_id: projectId,
          request_id: input.request_id,
          result: input.result,
          span_id: input.span_id,
          target_id: input.target_id,
          trace_id: input.trace_id,
        });
        await this.database.query(
          `INSERT INTO audit.audit_records (
             id, actor_type, actor_id, action, target_type, target_id,
             result, request_id, correlation_id, trace_id, span_id,
             project_id, evidence_refs, metadata, previous_hash, record_hash,
             occurred_at
           ) VALUES (
             $1, 'HUMAN', $2, $3, 'SESSION', $4, $5, $6, $7, $8, $9,
             $10, $11, $12::jsonb, $13, $14, $15
           )`,
          [
            id,
            input.actor_id,
            input.action,
            input.target_id,
            input.result,
            input.request_id,
            input.correlation_id,
            input.trace_id,
            input.span_id,
            projectId,
            [...input.evidence_refs],
            JSON.stringify(metadata),
            previousHash,
            recordHash,
            occurredAt,
          ],
        );
        await this.database.exec("COMMIT");
      } catch (error) {
        await this.database.exec("ROLLBACK");
        throw error;
      }
    });
  }

  async recordDenial(input: StoredSessionDenialInput): Promise<void> {
    await this.database.query(
      `INSERT INTO audit.observability_events (
         id, name, request_id, correlation_id, trace_id, span_id, project_id,
         payload, occurred_at
       ) VALUES (
         $1, 'SESSION.RESOLUTION_FAILED', $2, $3, $4, $5,
         (SELECT project_id
            FROM identity.human_project_assignments
           WHERE id = $6 AND human_id = $7 AND scope = $8
             AND revoked_at IS NULL
           ORDER BY id LIMIT 1),
         $9::jsonb, $10
       )`,
      [
        randomUUID(),
        input.request_id,
        input.correlation_id,
        input.trace_id,
        input.span_id,
        input.tenant_binding_ref ?? null,
        input.actor_id ?? null,
        input.project_scope,
        JSON.stringify({
          bff_service_actor_id: input.bff_service_actor_id,
          reason: input.reason,
        }),
        input.occurred_at,
      ],
    );
  }

  async queryAuditByEvidenceReference(
    evidenceReference: string,
  ): Promise<StoredSessionAuditRow[]> {
    const result = await this.database.query<StoredSessionAuditRow>(
      `SELECT action, actor_id, target_id, result, project_id, evidence_refs,
              metadata, previous_hash, record_hash, occurred_at
         FROM audit.audit_records
        WHERE $1 = ANY(evidence_refs)
        ORDER BY occurred_at, id`,
      [evidenceReference],
    );
    return result.rows;
  }

  async queryDenials(correlationId: string): Promise<StoredSessionDenialRow[]> {
    const result = await this.database.query<StoredSessionDenialRow>(
      `SELECT name, correlation_id, project_id, payload, occurred_at
         FROM audit.observability_events
        WHERE name = 'SESSION.RESOLUTION_FAILED' AND correlation_id = $1
        ORDER BY occurred_at, id`,
      [correlationId],
    );
    return result.rows;
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#pending.then(operation, operation);
    this.#pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
