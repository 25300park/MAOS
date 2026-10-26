import type { MigrationDatabase } from "./types.js";
import {
  computePhase14Fingerprint,
  Phase14RuntimeConflictError,
  type CommandClarificationReceipt,
  type CreateCommandClarificationReceiptInput,
  type CreateOrReuseResult,
} from "./phase14-runtime-contracts.js";

type ReceiptRow = {
  id: string;
  command_envelope_id: string;
  project_id: string;
  human_actor_id: string;
  resolved_fields: CommandClarificationReceipt["resolvedFields"];
  evidence_refs: string[];
  audit_refs: string[];
  idempotency_key: string;
  response_fingerprint: string;
  correlation_id: string;
  created_at: Date | string;
};

const columns = `id, command_envelope_id, project_id, human_actor_id,
  resolved_fields, evidence_refs, audit_refs, idempotency_key,
  response_fingerprint, correlation_id, created_at`;

function mapRow(row: ReceiptRow): CommandClarificationReceipt {
  return {
    id: row.id,
    commandEnvelopeId: row.command_envelope_id,
    projectId: row.project_id,
    humanActorId: row.human_actor_id,
    resolvedFields: row.resolved_fields,
    evidenceRefs: row.evidence_refs,
    auditRefs: row.audit_refs,
    idempotencyKey: row.idempotency_key,
    responseFingerprint: row.response_fingerprint,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
  };
}

function exact(
  row: ReceiptRow,
  input: CreateCommandClarificationReceiptInput,
): boolean {
  return (
    row.id === input.id &&
    row.command_envelope_id === input.commandEnvelopeId &&
    row.project_id === input.projectId &&
    row.human_actor_id === input.humanActorId &&
    JSON.stringify(row.resolved_fields) ===
      JSON.stringify(input.resolvedFields) &&
    JSON.stringify(row.evidence_refs) === JSON.stringify(input.evidenceRefs) &&
    JSON.stringify(row.audit_refs) === JSON.stringify(input.auditRefs) &&
    row.idempotency_key === input.idempotencyKey &&
    row.response_fingerprint === input.responseFingerprint &&
    row.correlation_id === input.correlationId
  );
}

export class PostgresCommandClarificationRepository {
  constructor(private readonly database: MigrationDatabase) {}

  async findById(id: string): Promise<CommandClarificationReceipt | undefined> {
    const result = await this.database.query<ReceiptRow>(
      `SELECT ${columns} FROM work.command_clarification_receipts WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async createOrReuse(
    input: CreateCommandClarificationReceiptInput,
  ): Promise<CreateOrReuseResult<CommandClarificationReceipt>> {
    if (
      computePhase14Fingerprint({ ...input }, "responseFingerprint") !==
      input.responseFingerprint
    ) {
      throw new Phase14RuntimeConflictError("COMMAND_CLARIFICATION_CONFLICT");
    }
    const load = () =>
      this.database.query<ReceiptRow>(
        `SELECT ${columns} FROM work.command_clarification_receipts
       WHERE id = $1 OR (project_id = $2 AND command_envelope_id = $3 AND idempotency_key = $4)`,
        [
          input.id,
          input.projectId,
          input.commandEnvelopeId,
          input.idempotencyKey,
        ],
      );
    const existing = await load();
    if (existing.rows.length > 0) {
      if (existing.rows.length === 1 && exact(existing.rows[0]!, input)) {
        return { outcome: "REUSED", value: mapRow(existing.rows[0]!) };
      }
      throw new Phase14RuntimeConflictError("COMMAND_CLARIFICATION_CONFLICT");
    }
    try {
      const result = await this.database.query<ReceiptRow>(
        `INSERT INTO work.command_clarification_receipts (
           id, command_envelope_id, project_id, human_actor_id, resolved_fields,
           evidence_refs, audit_refs, idempotency_key, response_fingerprint, correlation_id
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10) RETURNING ${columns}`,
        [
          input.id,
          input.commandEnvelopeId,
          input.projectId,
          input.humanActorId,
          JSON.stringify(input.resolvedFields),
          [...input.evidenceRefs],
          [...input.auditRefs],
          input.idempotencyKey,
          input.responseFingerprint,
          input.correlationId,
        ],
      );
      return { outcome: "CREATED", value: mapRow(result.rows[0]!) };
    } catch (error) {
      const concurrent = await load();
      if (concurrent.rows.length === 1 && exact(concurrent.rows[0]!, input)) {
        return { outcome: "REUSED", value: mapRow(concurrent.rows[0]!) };
      }
      if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new Phase14RuntimeConflictError("COMMAND_CLARIFICATION_CONFLICT");
      }
      throw error;
    }
  }
}
