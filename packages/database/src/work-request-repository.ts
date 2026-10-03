import {
  canonicalAuditValue,
  deterministicAuditUuid,
  PostgresAuditRecordRepository,
} from "./audit-record-repository.js";
import type { MigrationDatabase } from "./types.js";
import type {
  CanonicalWorkRequestInput,
  CanonicalWorkRequestRecord,
  InvalidateWorkRequestInput,
  RegisterWorkRequestResult,
  WorkRequestReadPort,
} from "./work-request-contracts.js";

type Row = {
  id: string;
  source_system: string;
  source_type: string;
  source_ref: string;
  source_fingerprint: string;
  organization_id: string;
  project_id: string;
  company_scope_ref: string;
  team_scope_ref: string | null;
  project_scope_ref: string;
  system_scope_ref: string | null;
  environment: CanonicalWorkRequestRecord["environment"];
  lifecycle_state: CanonicalWorkRequestRecord["lifecycleState"];
  registration_audit_ref: string;
  registered_at: string | Date;
  invalidated_at: string | Date | null;
  invalidation_reason_code: string | null;
  idempotency_key: string;
  input_fingerprint: string;
};

const select = `SELECT id::text,source_system,source_type,source_ref,source_fingerprint,
 organization_id::text,project_id::text,company_scope_ref,team_scope_ref,project_scope_ref,
 system_scope_ref,environment,lifecycle_state,registration_audit_ref::text,registered_at,
 invalidated_at,invalidation_reason_code,idempotency_key,input_fingerprint FROM work.requests`;

function map(row: Row): CanonicalWorkRequestRecord {
  return {
    id: row.id,
    sourceSystem: row.source_system,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    sourceFingerprint: row.source_fingerprint,
    organizationId: row.organization_id,
    projectId: row.project_id,
    companyScopeRef: row.company_scope_ref,
    teamScopeRef: row.team_scope_ref,
    projectScopeRef: row.project_scope_ref,
    systemScopeRef: row.system_scope_ref,
    environment: row.environment,
    lifecycleState: row.lifecycle_state,
    registrationAuditRef: row.registration_audit_ref,
    registeredAt: new Date(row.registered_at).toISOString(),
    invalidatedAt: row.invalidated_at
      ? new Date(row.invalidated_at).toISOString()
      : null,
    invalidationReasonCode: row.invalidation_reason_code,
  };
}

function intent(input: CanonicalWorkRequestInput) {
  return canonicalAuditValue({
    id: input.id,
    sourceSystem: input.sourceSystem,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    sourceFingerprint: input.sourceFingerprint,
    organizationId: input.organizationId,
    projectId: input.projectId,
    companyScopeRef: input.companyScopeRef,
    teamScopeRef: input.teamScopeRef,
    projectScopeRef: input.projectScopeRef,
    systemScopeRef: input.systemScopeRef,
    environment: input.environment,
    inputFingerprint: input.inputFingerprint,
  });
}

export class PostgresWorkRequestRepository implements WorkRequestReadPort {
  #pending: Promise<void> = Promise.resolve();
  constructor(private readonly database: MigrationDatabase) {}

  async findRequest(id: string) {
    const result = await this.database.query<Row>(`${select} WHERE id=$1`, [
      id,
    ]);
    return result.rows[0] ? map(result.rows[0]) : undefined;
  }

  registerRequest(
    input: CanonicalWorkRequestInput,
  ): Promise<RegisterWorkRequestResult> {
    const operation = () => this.#register(input);
    const result = this.#pending.then(operation, operation);
    this.#pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #register(
    input: CanonicalWorkRequestInput,
  ): Promise<RegisterWorkRequestResult> {
    if (!input.evidenceRefs.length)
      throw new Error("WORK_REQUEST_EVIDENCE_REQUIRED");
    await this.database.exec("BEGIN");
    try {
      await this.database.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`${input.organizationId}:${input.projectId}:${input.idempotencyKey}`],
      );
      const existing = await this.database.query<Row>(
        `${select} WHERE id=$1 OR (organization_id=$2 AND project_id=$3 AND idempotency_key=$4) OR (source_system=$5 AND source_type=$6 AND source_ref=$7)`,
        [
          input.id,
          input.organizationId,
          input.projectId,
          input.idempotencyKey,
          input.sourceSystem,
          input.sourceType,
          input.sourceRef,
        ],
      );
      if (existing.rows.length) {
        if (
          existing.rows.length !== 1 ||
          intent(input) !==
            canonicalAuditValue({
              id: existing.rows[0]!.id,
              sourceSystem: existing.rows[0]!.source_system,
              sourceType: existing.rows[0]!.source_type,
              sourceRef: existing.rows[0]!.source_ref,
              sourceFingerprint: existing.rows[0]!.source_fingerprint,
              organizationId: existing.rows[0]!.organization_id,
              projectId: existing.rows[0]!.project_id,
              companyScopeRef: existing.rows[0]!.company_scope_ref,
              teamScopeRef: existing.rows[0]!.team_scope_ref,
              projectScopeRef: existing.rows[0]!.project_scope_ref,
              systemScopeRef: existing.rows[0]!.system_scope_ref,
              environment: existing.rows[0]!.environment,
              inputFingerprint: existing.rows[0]!.input_fingerprint,
            })
        )
          throw new Error("WORK_REQUEST_IDEMPOTENCY_CONFLICT");
        await this.database.exec("COMMIT");
        const request = map(existing.rows[0]!);
        return {
          outcome: "REUSED",
          request,
          auditRef: request.registrationAuditRef,
        };
      }
      const auditRef = deterministicAuditUuid(
        `WORK.REQUEST_REGISTERED:${input.idempotencyKey}`,
      );
      await this.database.query(
        `INSERT INTO work.requests (id,source_system,source_type,source_ref,source_fingerprint,organization_id,project_id,company_scope_ref,team_scope_ref,project_scope_ref,system_scope_ref,environment,registered_by_actor_type,registered_by_actor_id,idempotency_key,input_fingerprint,correlation_id,causation_ref,registration_audit_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          input.id,
          input.sourceSystem,
          input.sourceType,
          input.sourceRef,
          input.sourceFingerprint,
          input.organizationId,
          input.projectId,
          input.companyScopeRef,
          input.teamScopeRef,
          input.projectScopeRef,
          input.systemScopeRef,
          input.environment,
          input.actorType,
          input.actorId,
          input.idempotencyKey,
          input.inputFingerprint,
          input.correlationId,
          input.causationRef,
          auditRef,
        ],
      );
      await new PostgresAuditRecordRepository(
        this.database,
      ).recordInTransaction({
        action: "WORK.REQUEST_REGISTERED",
        actorId: input.actorId,
        actorType: input.actorType,
        targetType: "REQUEST",
        targetId: input.id,
        result: "SUCCEEDED",
        requestId: input.id,
        correlationId: input.correlationId,
        traceId: input.traceId,
        spanId: input.spanId,
        evidenceRefs: input.evidenceRefs,
        metadata: {
          source_system: input.sourceSystem,
          source_type: input.sourceType,
        },
        idempotencyKey: input.idempotencyKey,
        projectId: input.projectId,
        deterministicIdentitySeed: `WORK.REQUEST_REGISTERED:${input.idempotencyKey}`,
      });
      const request = await this.findRequest(input.id);
      if (!request) throw new Error("WORK_REQUEST_PERSISTENCE_FAILED");
      await this.database.exec("COMMIT");
      return { outcome: "CREATED", request, auditRef };
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async invalidateRequest(
    input: InvalidateWorkRequestInput,
  ): Promise<RegisterWorkRequestResult> {
    await this.database.exec("BEGIN");
    try {
      const existing = await this.findRequest(input.requestId);
      if (!existing) throw new Error("WORK_REQUEST_NOT_FOUND");
      if (existing.lifecycleState === "INVALIDATED")
        throw new Error("WORK_REQUEST_INVALIDATED_TERMINAL");
      const auditRef = deterministicAuditUuid(
        `WORK.REQUEST_INVALIDATED:${input.idempotencyKey}`,
      );
      await this.database.query(
        `UPDATE work.requests SET lifecycle_state='INVALIDATED',invalidated_by_actor_type=$2,invalidated_by_actor_id=$3,invalidation_reason_code=$4,invalidated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [input.requestId, input.actorType, input.actorId, input.reasonCode],
      );
      await new PostgresAuditRecordRepository(
        this.database,
      ).recordInTransaction({
        action: "WORK.REQUEST_INVALIDATED",
        actorId: input.actorId,
        actorType: input.actorType,
        targetType: "REQUEST",
        targetId: input.requestId,
        result: "SUCCEEDED",
        requestId: input.requestId,
        correlationId: input.correlationId,
        traceId: input.traceId,
        spanId: input.spanId,
        evidenceRefs: input.evidenceRefs,
        metadata: { reason_code: input.reasonCode },
        idempotencyKey: input.idempotencyKey,
        deterministicIdentitySeed: `WORK.REQUEST_INVALIDATED:${input.idempotencyKey}`,
      });
      const request = await this.findRequest(input.requestId);
      if (!request) throw new Error("WORK_REQUEST_NOT_FOUND");
      await this.database.exec("COMMIT");
      return { outcome: "CREATED", request, auditRef };
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
