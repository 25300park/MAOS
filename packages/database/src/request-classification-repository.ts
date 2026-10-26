import {
  canonicalAuditValue,
  deterministicAuditUuid,
  PostgresAuditRecordRepository,
} from "./audit-record-repository.js";
import type { MigrationDatabase } from "./types.js";
import type { WorkRequestReadPort } from "./work-request-contracts.js";
import type {
  AppendClassificationInput,
  ClassificationAppendResult,
  ClassificationRecord,
  DomainConstraintSnapshot,
} from "./request-classification-contracts.js";

type Row = Record<string, unknown>;
const select = `SELECT classification_id::text,request_id::text,task_id::text,version,supersedes_classification_id::text,domain_key,subdomain_key,classification_state,source,routing_disposition,reason_code,requested_role_class,required_capability_refs,preferred_capability_refs,policy_constraint_refs,context_refs,artifact_refs,evidence_refs,priority_class,intent_class_ref,intent_snapshot_hash,risk_class_ref,risk_snapshot_hash,confidence_class,validator_rule_ref,validator_rule_version,policy_resolution_ref::text,policy_resolution_version,created_by_actor_type,created_by_actor_id::text,created_at,validated_at,stale_at,canonical_payload_fingerprint,idempotency_key,correlation_id,causation_ref,audit_ref::text FROM governance.request_classification_versions`;
const s = (v: unknown) => (v == null ? null : String(v));
const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
function map(r: Row): ClassificationRecord {
  return {
    classificationId: String(r.classification_id),
    requestId: String(r.request_id),
    taskId: s(r.task_id),
    version: Number(r.version),
    supersedesClassificationId: s(r.supersedes_classification_id),
    domainKey: r.domain_key as ClassificationRecord["domainKey"],
    subdomainKey: s(r.subdomain_key),
    classificationState:
      r.classification_state as ClassificationRecord["classificationState"],
    source: r.source as ClassificationRecord["source"],
    routingDisposition:
      r.routing_disposition as ClassificationRecord["routingDisposition"],
    reasonCode: String(r.reason_code),
    requestedRoleClass: s(r.requested_role_class),
    requiredCapabilityRefs: arr(r.required_capability_refs),
    preferredCapabilityRefs: arr(r.preferred_capability_refs),
    policyConstraintRefs: arr(r.policy_constraint_refs),
    contextRefs: arr(r.context_refs),
    artifactRefs: arr(r.artifact_refs),
    evidenceRefs: arr(r.evidence_refs),
    priorityClass: r.priority_class as ClassificationRecord["priorityClass"],
    intentClassRef: s(r.intent_class_ref),
    intentSnapshotHash: s(r.intent_snapshot_hash),
    riskClassRef: s(r.risk_class_ref),
    riskSnapshotHash: s(r.risk_snapshot_hash),
    confidenceClass:
      r.confidence_class as ClassificationRecord["confidenceClass"],
    validatorRuleRef: s(r.validator_rule_ref),
    validatorRuleVersion: s(r.validator_rule_version),
    policyResolutionRef: s(r.policy_resolution_ref),
    policyResolutionVersion: s(r.policy_resolution_version),
    createdByActorType:
      r.created_by_actor_type as ClassificationRecord["createdByActorType"],
    createdByActorId: String(r.created_by_actor_id),
    createdAt: new Date(r.created_at as string | Date).toISOString(),
    validatedAt: r.validated_at
      ? new Date(r.validated_at as string | Date).toISOString()
      : null,
    staleAt: r.stale_at
      ? new Date(r.stale_at as string | Date).toISOString()
      : null,
    canonicalPayloadFingerprint: String(r.canonical_payload_fingerprint),
    idempotencyKey: String(r.idempotency_key),
    correlationId: String(r.correlation_id),
    causationRef: s(r.causation_ref),
    auditRef: String(r.audit_ref),
  };
}

export class PostgresRequestClassificationRepository {
  #pending: Promise<void> = Promise.resolve();
  constructor(
    private readonly database: MigrationDatabase,
    private readonly requests: WorkRequestReadPort,
  ) {}
  listClassificationHistory = async (requestId: string) => {
    const r = await this.database.query<Row>(
      `${select} WHERE request_id=$1 ORDER BY version`,
      [requestId],
    );
    return r.rows.map(map);
  };
  findClassificationHead = async (requestId: string) => {
    const r = await this.database.query<Row>(
      `${select} WHERE request_id=$1 ORDER BY version DESC LIMIT 1`,
      [requestId],
    );
    return r.rows[0] ? map(r.rows[0]) : undefined;
  };
  async findDomainConstraint(
    id: string,
    policyVersion: string,
  ): Promise<DomainConstraintSnapshot | undefined> {
    const r = await this.database.query<Row>(
      `SELECT id::text,domain_key,execution_mode,routing_disposition,target_kind,target_ref,target_version,status,policy_version FROM ai.domain_execution_constraints WHERE id=$1 AND policy_version=$2`,
      [id, policyVersion],
    );
    const x = r.rows[0];
    return x
      ? {
          id: String(x.id),
          domainKey: String(x.domain_key),
          executionMode: String(x.execution_mode),
          routingDisposition:
            x.routing_disposition as DomainConstraintSnapshot["routingDisposition"],
          targetKind: x.target_kind as DomainConstraintSnapshot["targetKind"],
          targetRef: s(x.target_ref),
          targetVersion: s(x.target_version),
          status: x.status as DomainConstraintSnapshot["status"],
          policyVersion: String(x.policy_version),
        }
      : undefined;
  }
  appendClassification(
    input: AppendClassificationInput,
  ): Promise<ClassificationAppendResult> {
    const op = () => this.#append(input);
    const result = this.#pending.then(op, op);
    this.#pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  async #append(
    input: AppendClassificationInput,
  ): Promise<ClassificationAppendResult> {
    const request = await this.requests.findRequest(input.requestId);
    if (!request) throw new Error("WORK_REQUEST_NOT_FOUND");
    if (request.lifecycleState !== "REGISTERED")
      throw new Error("WORK_REQUEST_NOT_REGISTERED");
    const context = canonicalAuditValue({
      organizationId: request.organizationId,
      projectId: request.projectId,
      companyScopeRef: request.companyScopeRef,
      teamScopeRef: request.teamScopeRef,
      projectScopeRef: request.projectScopeRef,
      systemScopeRef: request.systemScopeRef,
      environment: request.environment,
    });
    if (context !== canonicalAuditValue(input.requestContext))
      throw new Error("WORK_REQUEST_CONTEXT_MISMATCH");
    if (
      input.source === "AI_ASSISTED" &&
      input.classificationState !== "PROPOSED"
    )
      throw new Error("AI_VALIDATION_AUTHORITY_DENIED");
    await this.database.exec("BEGIN");
    try {
      await this.database.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [input.requestId],
      );
      const existing = await this.database.query<Row>(
        `${select} WHERE request_id=$1 AND idempotency_key=$2`,
        [input.requestId, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        const record = map(existing.rows[0]);
        const replayMatches =
          record.classificationId === input.classificationId &&
          record.canonicalPayloadFingerprint ===
            input.canonicalPayloadFingerprint &&
          record.domainKey === input.domainKey &&
          record.subdomainKey === input.subdomainKey &&
          record.classificationState === input.classificationState &&
          record.source === input.source &&
          record.routingDisposition === input.routingDisposition &&
          record.reasonCode === input.reasonCode &&
          record.policyResolutionRef === input.policyResolutionRef &&
          record.policyResolutionVersion === input.policyResolutionVersion;
        if (!replayMatches)
          throw new Error("CLASSIFICATION_IDEMPOTENCY_CONFLICT");
        await this.database.exec("COMMIT");
        return {
          outcome: "REUSED",
          classification: record,
          auditRef: record.auditRef,
        };
      }
      const head = await this.findClassificationHead(input.requestId);
      if ((head?.classificationId ?? null) !== input.expectedPredecessorId)
        throw new Error("CLASSIFICATION_PREDECESSOR_CONFLICT");
      const version = (head?.version ?? 0) + 1;
      const auditRef = deterministicAuditUuid(
        `GOVERNANCE.CLASSIFICATION_APPENDED:${input.requestId}:${input.idempotencyKey}`,
      );
      await this.database.query(
        `INSERT INTO governance.request_classification_versions (classification_id,request_id,task_id,version,supersedes_classification_id,domain_key,subdomain_key,classification_state,source,routing_disposition,reason_code,requested_role_class,required_capability_refs,preferred_capability_refs,policy_constraint_refs,context_refs,artifact_refs,evidence_refs,priority_class,intent_class_ref,intent_snapshot_hash,risk_class_ref,risk_snapshot_hash,confidence_class,validator_rule_ref,validator_rule_version,policy_resolution_ref,policy_resolution_version,created_by_actor_type,created_by_actor_id,validated_at,stale_at,canonical_payload_fingerprint,idempotency_key,correlation_id,causation_ref,audit_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,CASE WHEN $8='VALIDATED' THEN CURRENT_TIMESTAMP END,CASE WHEN $8='STALE' THEN CURRENT_TIMESTAMP END,$31,$32,$33,$34,$35)`,
        [
          input.classificationId,
          input.requestId,
          input.taskId,
          version,
          input.expectedPredecessorId,
          input.domainKey,
          input.subdomainKey,
          input.classificationState,
          input.source,
          input.routingDisposition,
          input.reasonCode,
          input.requestedRoleClass,
          input.requiredCapabilityRefs,
          input.preferredCapabilityRefs,
          input.policyConstraintRefs,
          input.contextRefs,
          input.artifactRefs,
          input.evidenceRefs,
          input.priorityClass,
          input.intentClassRef,
          input.intentSnapshotHash,
          input.riskClassRef,
          input.riskSnapshotHash,
          input.confidenceClass,
          input.validatorRuleRef,
          input.validatorRuleVersion,
          input.policyResolutionRef,
          input.policyResolutionVersion,
          input.actorType,
          input.actorId,
          input.canonicalPayloadFingerprint,
          input.idempotencyKey,
          input.correlationId,
          input.causationRef,
          auditRef,
        ],
      );
      await new PostgresAuditRecordRepository(
        this.database,
      ).recordInTransaction({
        action: "GOVERNANCE.CLASSIFICATION_APPENDED",
        actorId: input.actorId,
        actorType: input.actorType,
        targetType: "CLASSIFICATION",
        targetId: input.classificationId,
        result: "SUCCEEDED",
        requestId: input.requestId,
        correlationId: input.correlationId,
        traceId: input.traceId,
        spanId: input.spanId,
        evidenceRefs: input.evidenceRefs,
        metadata: {
          domain_key: input.domainKey,
          state: input.classificationState,
          version,
        },
        idempotencyKey: input.idempotencyKey,
        projectId: input.requestContext.projectId,
        ...(input.taskId ? { taskId: input.taskId } : {}),
        deterministicIdentitySeed: `GOVERNANCE.CLASSIFICATION_APPENDED:${input.requestId}:${input.idempotencyKey}`,
      });
      const row = await this.database.query<Row>(
        `${select} WHERE classification_id=$1`,
        [input.classificationId],
      );
      const classification = map(row.rows[0]!);
      await this.database.exec("COMMIT");
      return { outcome: "CREATED", classification, auditRef };
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
