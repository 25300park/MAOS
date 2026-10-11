import type { MigrationDatabase } from "./types.js";
import { PostgresCommandAuditRepository } from "./command-audit-repository.js";
import {
  computePhase14Fingerprint,
  Phase14RuntimeConflictError,
  type CreateHumanApprovalRequestInput,
  type CreateOrReuseResult,
  type HumanApprovalDecision,
  type HumanApprovalDecisionInput,
  type HumanApprovalExpectedBinding,
  type HumanApprovalRequest,
  type HumanApprovalRevalidationResult,
  type HumanApprovalStatus,
  type HumanApprovalValidity,
} from "./phase14-runtime-contracts.js";

export class HumanApprovalConflictError extends Phase14RuntimeConflictError {
  readonly code = "HUMAN_APPROVAL_CONFLICT";
  constructor(code = "HUMAN_APPROVAL_CONFLICT") {
    super(code);
  }
}

export class HumanApprovalDeniedError extends Error {
  readonly code: string;
  constructor(code = "HUMAN_APPROVAL_DENIED") {
    super(code);
    this.code = code;
  }
}

export interface HumanApprovalReferenceResolution {
  readonly request: HumanApprovalRequest;
  readonly decision: HumanApprovalDecision;
}

type RequestRow = {
  id: string;
  approval_id: string;
  project_id: string;
  command_envelope_id: string;
  plan_artifact_id: string;
  review_artifact_id: string;
  authority_owner_actor_id: string;
  requested_by_actor_type: CreateHumanApprovalRequestInput["requestedByActorType"];
  requested_by_actor_id: string;
  requested_operation: string;
  target_type: string;
  target_id: string;
  target_version: string;
  target_hash: string;
  company_scope_ref: string;
  team_scope_ref: string | null;
  project_scope_ref: string;
  system_scope_ref: string | null;
  risk_class: CreateHumanApprovalRequestInput["riskClass"];
  environment: CreateHumanApprovalRequestInput["environment"];
  evidence_refs: string[];
  evidence_manifest_hash: string;
  approval_policy_ref: string;
  approval_policy_version: string;
  fresh_until: Date | string;
  expires_at: Date | string;
  idempotency_key: string;
  request_fingerprint: string;
  correlation_id: string;
  causation_refs: string[];
  status: HumanApprovalStatus;
  validity: HumanApprovalValidity;
  created_at: Date | string;
};

type DecisionRow = {
  id: string;
  project_id: string;
  request_id: string;
  approval_id: string;
  actor_type: "HUMAN";
  actor_id: string;
  authority_ref: string;
  decision_type: HumanApprovalDecision["decisionType"];
  resulting_status: HumanApprovalStatus;
  resulting_validity: HumanApprovalValidity;
  reason_code: string;
  evidence_refs: string[];
  replacement_request_id: string | null;
  idempotency_key: string;
  decision_fingerprint: string;
  correlation_id: string;
  causation_refs: string[];
  decided_at: Date | string;
  created_at: Date | string;
};

const requestSelect = `
  r.id, r.approval_id, r.project_id, r.command_envelope_id,
  r.plan_artifact_id, r.review_artifact_id, r.authority_owner_actor_id,
  a.requested_by_actor_type, a.requested_by_actor_id,
  r.requested_operation, r.target_type, r.target_id, r.target_version,
  r.target_hash, r.company_scope_ref, r.team_scope_ref,
  r.project_scope_ref, r.system_scope_ref, r.risk_class, r.environment,
  r.evidence_refs, r.evidence_manifest_hash, r.approval_policy_ref,
  r.approval_policy_version, r.fresh_until, r.expires_at,
  r.idempotency_key, r.request_fingerprint, r.correlation_id,
  r.causation_refs, a.status, a.validity, r.created_at`;

const decisionSelect = `
  d.id, d.project_id, d.request_id, d.approval_id, d.actor_type,
  d.actor_id, d.authority_ref, d.decision_type, d.resulting_status,
  d.resulting_validity, d.reason_code, d.evidence_refs,
  d.replacement_request_id, d.idempotency_key, d.decision_fingerprint,
  d.correlation_id, d.causation_refs, d.decided_at, d.created_at`;

function requestFrom(row: RequestRow): HumanApprovalRequest {
  return {
    id: row.id,
    approvalId: row.approval_id,
    projectId: row.project_id,
    commandEnvelopeId: row.command_envelope_id,
    planArtifactId: row.plan_artifact_id,
    reviewArtifactId: row.review_artifact_id,
    authorityOwnerActorId: row.authority_owner_actor_id,
    requestedByActorType: row.requested_by_actor_type,
    requestedByActorId: row.requested_by_actor_id,
    requestedOperation: row.requested_operation,
    targetType: row.target_type,
    targetId: row.target_id,
    targetVersion: row.target_version,
    targetHash: row.target_hash,
    companyScopeRef: row.company_scope_ref,
    ...(row.team_scope_ref ? { teamScopeRef: row.team_scope_ref } : {}),
    projectScopeRef: row.project_scope_ref,
    ...(row.system_scope_ref ? { systemScopeRef: row.system_scope_ref } : {}),
    riskClass: row.risk_class,
    environment: row.environment,
    evidenceRefs: row.evidence_refs,
    evidenceManifestHash: row.evidence_manifest_hash,
    approvalPolicyRef: row.approval_policy_ref,
    approvalPolicyVersion: row.approval_policy_version,
    freshUntil: new Date(row.fresh_until),
    expiresAt: new Date(row.expires_at),
    idempotencyKey: row.idempotency_key,
    requestFingerprint: row.request_fingerprint,
    correlationId: row.correlation_id,
    causationRefs: row.causation_refs,
    status: row.status,
    validity: row.validity,
    createdAt: row.created_at,
  };
}

function decisionFrom(row: DecisionRow): HumanApprovalDecision {
  return {
    id: row.id,
    projectId: row.project_id,
    requestId: row.request_id,
    approvalId: row.approval_id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    authorityRef: row.authority_ref,
    decisionType: row.decision_type,
    approvalStatus: row.resulting_status,
    approvalValidity: row.resulting_validity,
    reasonCode: row.reason_code,
    evidenceRefs: row.evidence_refs,
    ...(row.replacement_request_id
      ? { replacementRequestId: row.replacement_request_id }
      : {}),
    idempotencyKey: row.idempotency_key,
    decisionFingerprint: row.decision_fingerprint,
    correlationId: row.correlation_id,
    causationRefs: row.causation_refs,
    decidedAt: new Date(row.decided_at),
    createdAt: row.created_at,
  };
}

function exactFingerprint(
  value: Readonly<Record<string, unknown>>,
  field: string,
  provided: string,
): void {
  if (computePhase14Fingerprint(value, field) !== provided) {
    throw new HumanApprovalConflictError();
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

const approvalOperationQueues = new WeakMap<object, Promise<void>>();

export class PostgresHumanApprovalRuntime {
  readonly #audit: PostgresCommandAuditRepository;

  constructor(private readonly database: MigrationDatabase) {
    this.#audit = new PostgresCommandAuditRepository(database);
  }

  findRequest(id: string): Promise<HumanApprovalRequest | undefined> {
    return this.#findRequest("r.id = $1", [id]);
  }

  async resolveApprovalReference(
    approvalRef: string,
  ): Promise<HumanApprovalReferenceResolution | undefined> {
    const requests = await this.database.query<RequestRow>(
      `SELECT ${requestSelect}
       FROM governance.human_approval_requests r
       JOIN governance.approvals a ON a.id = r.approval_id
       WHERE r.approval_id = $1
       ORDER BY r.created_at, r.id
       LIMIT 2`,
      [approvalRef],
    );
    if (requests.rows.length > 1) throw new HumanApprovalConflictError();
    const requestRow = requests.rows[0];
    if (!requestRow) return undefined;
    const decisions = await this.database.query<DecisionRow>(
      `SELECT ${decisionSelect}
       FROM governance.human_approval_decisions d
       WHERE d.request_id = $1 AND d.approval_id = $2
         AND d.decision_type = 'APPROVED'
       ORDER BY d.decided_at DESC, d.id DESC
       LIMIT 2`,
      [requestRow.id, approvalRef],
    );
    if (decisions.rows.length > 1) throw new HumanApprovalConflictError();
    const decisionRow = decisions.rows[0];
    if (!decisionRow) return undefined;
    return Object.freeze({
      request: requestFrom(requestRow),
      decision: decisionFrom(decisionRow),
    });
  }

  async resolveDecisionAuthorityRef(
    requestId: string,
    actorId: string,
  ): Promise<string | undefined> {
    const result = await this.database.query<{ id: string }>(
      `SELECT authority.id::text
       FROM governance.human_approval_requests request
       JOIN governance.authority_rules authority
         ON authority.actor_type = 'HUMAN'
        AND authority.actor_id = $2
        AND authority.action = request.requested_operation
        AND authority.resource = request.target_type
        AND authority.environment = request.environment
        AND authority.risk = request.risk_class
        AND authority.scope = request.project_scope_ref
        AND authority.effect = 'ALLOW'
        AND authority.revoked_at IS NULL
        AND authority.archived_at IS NULL
        AND authority.valid_from <= CURRENT_TIMESTAMP
        AND (authority.valid_until IS NULL OR authority.valid_until > CURRENT_TIMESTAMP)
       WHERE request.id = $1
         AND request.authority_owner_actor_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM governance.authority_rules denied
           WHERE (denied.actor_id IS NULL OR (
                   denied.actor_type = 'HUMAN' AND denied.actor_id = $2))
             AND denied.action = request.requested_operation
             AND denied.resource = request.target_type
             AND denied.environment = request.environment
             AND denied.risk = request.risk_class
             AND denied.scope = request.project_scope_ref
             AND denied.effect = 'DENY'
             AND denied.revoked_at IS NULL
             AND denied.archived_at IS NULL
             AND denied.valid_from <= CURRENT_TIMESTAMP
             AND (denied.valid_until IS NULL OR denied.valid_until > CURRENT_TIMESTAMP)
         )
       ORDER BY authority.created_at, authority.id LIMIT 1`,
      [requestId, actorId],
    );
    return result.rows[0]?.id;
  }

  async findDecision(id: string): Promise<HumanApprovalDecision | undefined> {
    const result = await this.database.query<DecisionRow>(
      `SELECT ${decisionSelect}
       FROM governance.human_approval_decisions d WHERE d.id = $1`,
      [id],
    );
    return result.rows[0] ? decisionFrom(result.rows[0]) : undefined;
  }

  createRequest(
    input: CreateHumanApprovalRequestInput,
  ): Promise<CreateOrReuseResult<HumanApprovalRequest>> {
    return this.#enqueue(async () => {
      const result = await this.#createRequest(input);
      await this.#recordRequestedAudit(input);
      return result;
    });
  }

  decide(
    input: HumanApprovalDecisionInput,
  ): Promise<CreateOrReuseResult<HumanApprovalDecision>> {
    return this.#enqueue(async () => {
      try {
        const result = await this.#decide(input);
        await this.#recordDecisionAudit(input, result.value);
        return result;
      } catch (error) {
        if (error instanceof HumanApprovalDeniedError) {
          await this.#recordDeniedDecision(input, error.code);
        }
        throw error;
      }
    });
  }

  revalidate(
    requestId: string,
    expected: HumanApprovalExpectedBinding,
  ): Promise<HumanApprovalRevalidationResult> {
    return this.#enqueue(() => this.#revalidate(requestId, expected));
  }

  revalidatePendingDecision(
    requestId: string,
    expected: HumanApprovalExpectedBinding,
  ): Promise<HumanApprovalRevalidationResult> {
    return this.#enqueue(async () => {
      const request = await this.findRequest(requestId);
      if (!request)
        throw new HumanApprovalDeniedError("APPROVAL_REQUEST_NOT_FOUND");
      const clock = await this.database.query<{ now: Date | string }>(
        "SELECT CURRENT_TIMESTAMP AS now",
      );
      const now = new Date(clock.rows[0]!.now).getTime();
      let reasonCode = "VALID";
      if (request.status !== "PENDING") reasonCode = request.status;
      else if (request.validity !== "VALID") reasonCode = request.validity;
      else if (new Date(request.expiresAt).getTime() <= now)
        reasonCode = "EXPIRED";
      else if (new Date(request.freshUntil).getTime() <= now)
        reasonCode = "STALE";
      else if (request.targetType !== expected.targetType)
        reasonCode = "TARGET_TYPE_MISMATCH";
      else if (request.targetId !== expected.targetId)
        reasonCode = "TARGET_MISMATCH";
      else if (request.targetVersion !== expected.targetVersion)
        reasonCode = "VERSION_MISMATCH";
      else if (request.targetHash !== expected.targetHash)
        reasonCode = "STALE_TARGET_HASH";
      else if (
        request.companyScopeRef !== expected.companyScopeRef ||
        request.teamScopeRef !== expected.teamScopeRef ||
        request.projectScopeRef !== expected.projectScopeRef ||
        request.systemScopeRef !== expected.systemScopeRef
      )
        reasonCode = "SCOPE_MISMATCH";
      else if (request.riskClass !== expected.riskClass)
        reasonCode = "RISK_MISMATCH";
      else if (request.environment !== expected.environment)
        reasonCode = "ENVIRONMENT_MISMATCH";
      else if (request.requestedOperation !== expected.requestedOperation)
        reasonCode = "OPERATION_MISMATCH";
      else if (request.evidenceManifestHash !== expected.evidenceManifestHash)
        reasonCode = "EVIDENCE_MISMATCH";
      else if (
        request.approvalPolicyRef !== expected.approvalPolicyRef ||
        request.approvalPolicyVersion !== expected.approvalPolicyVersion
      )
        reasonCode = "POLICY_MISMATCH";
      return {
        allowed: reasonCode === "VALID",
        approvalId: request.approvalId,
        reasonCode,
        status: request.status,
        validity: request.validity,
      };
    });
  }

  async #revalidate(
    requestId: string,
    expected: HumanApprovalExpectedBinding,
  ): Promise<HumanApprovalRevalidationResult> {
    await this.database.exec("BEGIN");
    let request: HumanApprovalRequest;
    let reasonCode = "VALID";
    try {
      const requestResult = await this.database.query<RequestRow>(
        `SELECT ${requestSelect}
         FROM governance.human_approval_requests r
         JOIN governance.approvals a ON a.id = r.approval_id
         WHERE r.id = $1 FOR SHARE OF a`,
        [requestId],
      );
      if (!requestResult.rows[0])
        throw new HumanApprovalDeniedError("APPROVAL_REQUEST_NOT_FOUND");
      request = requestFrom(requestResult.rows[0]);
      const superseded = await this.database.query<{ present: boolean }>(
        `SELECT EXISTS (
         SELECT 1 FROM governance.human_approval_decisions
         WHERE request_id = $1 AND decision_type = 'SUPERSEDED'
       ) AS present`,
        [requestId],
      );
      const clock = await this.database.query<{ now: Date | string }>(
        "SELECT CURRENT_TIMESTAMP AS now",
      );
      const now = new Date(clock.rows[0]!.now);
      const approvalDecision = await this.database.query<{
        actor_id: string;
        authority_ref: string;
      }>(
        `SELECT actor_id, authority_ref
         FROM governance.human_approval_decisions
         WHERE request_id = $1 AND decision_type = 'APPROVED'
         ORDER BY created_at DESC, id DESC LIMIT 1`,
        [requestId],
      );
      if (superseded.rows[0]?.present) reasonCode = "SUPERSEDED";
      else if (request.status !== "APPROVED") reasonCode = request.status;
      else if (request.validity !== "VALID") reasonCode = request.validity;
      else if (
        !approvalDecision.rows[0] ||
        !(await this.#authorityActive({
          actorId: approvalDecision.rows[0].actor_id,
          authorityRef: approvalDecision.rows[0].authority_ref,
          operation: request.requestedOperation,
          resource: request.targetType,
          environment: request.environment,
          risk: request.riskClass,
          scope: request.projectScopeRef,
        }))
      )
        reasonCode = "AUTHORITY_INVALID";
      else if (new Date(request.expiresAt).getTime() <= now.getTime())
        reasonCode = "EXPIRED";
      else if (new Date(request.freshUntil).getTime() <= now.getTime())
        reasonCode = "STALE";
      else if (request.targetType !== expected.targetType)
        reasonCode = "TARGET_TYPE_MISMATCH";
      else if (request.targetId !== expected.targetId)
        reasonCode = "TARGET_MISMATCH";
      else if (request.targetVersion !== expected.targetVersion)
        reasonCode = "VERSION_MISMATCH";
      else if (request.targetHash !== expected.targetHash)
        reasonCode = "STALE_TARGET_HASH";
      else if (
        request.companyScopeRef !== expected.companyScopeRef ||
        request.teamScopeRef !== expected.teamScopeRef ||
        request.projectScopeRef !== expected.projectScopeRef ||
        request.systemScopeRef !== expected.systemScopeRef
      )
        reasonCode = "SCOPE_MISMATCH";
      else if (request.riskClass !== expected.riskClass)
        reasonCode = "RISK_MISMATCH";
      else if (request.environment !== expected.environment)
        reasonCode = "ENVIRONMENT_MISMATCH";
      else if (request.requestedOperation !== expected.requestedOperation)
        reasonCode = "OPERATION_MISMATCH";
      else if (request.evidenceManifestHash !== expected.evidenceManifestHash)
        reasonCode = "EVIDENCE_MISMATCH";
      else if (
        request.approvalPolicyRef !== expected.approvalPolicyRef ||
        request.approvalPolicyVersion !== expected.approvalPolicyVersion
      )
        reasonCode = "POLICY_MISMATCH";
      await this.database.exec("COMMIT");
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }

    const result: HumanApprovalRevalidationResult = {
      allowed: reasonCode === "VALID",
      approvalId: request.approvalId,
      reasonCode,
      status: request.status,
      validity: request.validity,
    };
    if (!result.allowed) {
      const expectedBindingFingerprint = computePhase14Fingerprint(
        expected as unknown as Readonly<Record<string, unknown>>,
        "now",
      );
      await this.#audit.recordAudit({
        action: "APPROVAL.REVALIDATION_DENIED",
        actorId: request.authorityOwnerActorId,
        actorType: "SYSTEM",
        commandId: request.commandEnvelopeId,
        projectId: request.projectId,
        requestId: request.id,
        correlationId: request.correlationId,
        traceId: request.correlationId,
        spanId: `${request.id}:revalidation:${reasonCode}`,
        evidenceRefs: request.evidenceRefs,
        targetType: "HUMAN_APPROVAL_REQUEST",
        targetId: request.id,
        approvalId: request.approvalId,
        result: "DENIED",
        metadata: {
          approval_request_id: request.id,
          approval_revalidation_ref: `${request.id}:${reasonCode}:${expectedBindingFingerprint}`,
          reason_code: reasonCode,
          expected_binding_fingerprint: expectedBindingFingerprint,
        },
      });
    }
    return result;
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const pending =
      approvalOperationQueues.get(this.database) ?? Promise.resolve();
    const result = pending.then(operation, operation);
    approvalOperationQueues.set(
      this.database,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  async #authorityActive(input: {
    actorId: string;
    authorityRef: string;
    operation: string;
    resource: string;
    environment: string;
    risk: string;
    scope: string;
  }): Promise<boolean> {
    const authority = await this.database.query<{ authorized: boolean }>(
      `SELECT (
         EXISTS (
           SELECT 1 FROM governance.authority_rules allow_rule
           WHERE allow_rule.id::text = $1
             AND allow_rule.actor_type = 'HUMAN'
             AND allow_rule.actor_id = $2
             AND allow_rule.action = $3
             AND allow_rule.resource = $4
             AND allow_rule.environment = $5
             AND allow_rule.risk = $6
             AND allow_rule.scope = $7
             AND allow_rule.effect = 'ALLOW'
             AND allow_rule.revoked_at IS NULL
             AND allow_rule.archived_at IS NULL
             AND allow_rule.valid_from <= CURRENT_TIMESTAMP
             AND (allow_rule.valid_until IS NULL OR allow_rule.valid_until > CURRENT_TIMESTAMP)
             AND EXISTS (
               SELECT 1 FROM identity.humans human_actor
               WHERE human_actor.id = $2 AND human_actor.archived_at IS NULL
             )
         ) AND NOT EXISTS (
           SELECT 1 FROM governance.authority_rules deny_rule
           WHERE (deny_rule.actor_id IS NULL OR (
                   deny_rule.actor_type = 'HUMAN' AND deny_rule.actor_id = $2))
             AND deny_rule.action = $3
             AND deny_rule.resource = $4
             AND deny_rule.environment = $5
             AND deny_rule.risk = $6
             AND deny_rule.scope = $7
             AND deny_rule.effect = 'DENY'
             AND deny_rule.revoked_at IS NULL
             AND deny_rule.archived_at IS NULL
             AND deny_rule.valid_from <= CURRENT_TIMESTAMP
             AND (deny_rule.valid_until IS NULL OR deny_rule.valid_until > CURRENT_TIMESTAMP)
         )
       ) AS authorized`,
      [
        input.authorityRef,
        input.actorId,
        input.operation,
        input.resource,
        input.environment,
        input.risk,
        input.scope,
      ],
    );
    return authority.rows[0]?.authorized === true;
  }

  async #findRequest(
    predicate: string,
    params: unknown[],
  ): Promise<HumanApprovalRequest | undefined> {
    const result = await this.database.query<RequestRow>(
      `SELECT ${requestSelect}
       FROM governance.human_approval_requests r
       JOIN governance.approvals a ON a.id = r.approval_id
       WHERE ${predicate}`,
      params,
    );
    return result.rows[0] ? requestFrom(result.rows[0]) : undefined;
  }

  async #createRequest(
    input: CreateHumanApprovalRequestInput,
  ): Promise<CreateOrReuseResult<HumanApprovalRequest>> {
    exactFingerprint(
      input as unknown as Readonly<Record<string, unknown>>,
      "requestFingerprint",
      input.requestFingerprint,
    );
    await this.database.exec("BEGIN");
    try {
      const existing = await this.#findRequest(
        "r.id = $1 OR (r.project_id = $2 AND r.idempotency_key = $3)",
        [input.id, input.projectId, input.idempotencyKey],
      );
      if (existing) {
        if (
          existing.id !== input.id ||
          existing.requestFingerprint !== input.requestFingerprint
        )
          throw new HumanApprovalConflictError();
        await this.database.exec("COMMIT");
        return { outcome: "REUSED", value: existing };
      }
      const source = await this.database.query<Record<string, unknown>>(
        `SELECT c.project_id, c.human_actor_id, c.company_scope_ref,
           c.team_scope_ref, c.project_scope_ref, c.system_scope_ref,
           c.risk_class, c.environment,
           p.artifact_kind AS plan_kind, p.scope_ref AS plan_scope,
           p.risk_class AS plan_risk, p.environment AS plan_environment,
           r.artifact_kind AS review_kind, r.artifact_version AS review_version,
           r.artifact_hash AS review_hash, r.scope_ref AS review_scope,
           r.risk_class AS review_risk, r.environment AS review_environment,
           rr.id AS reviewer_routing_id
         FROM work.command_envelopes c
         JOIN governance.governed_artifact_refs p
           ON p.id = $3 AND p.project_id = c.project_id
             AND p.command_envelope_id = c.id
         JOIN governance.governed_artifact_refs r
           ON r.id = $4 AND r.project_id = c.project_id
             AND r.command_envelope_id = c.id
         JOIN governance.routing_envelopes rr
           ON r.causation_ref = 'routing://' || rr.id::text
             AND rr.project_id = c.project_id
             AND rr.command_envelope_id = c.id
             AND rr.routing_kind = 'REVIEWER'
             AND rr.status = 'SELECTED'
             AND rr.input_artifact_id = p.id
         WHERE c.id = $1 AND c.project_id = $2`,
        [
          input.commandEnvelopeId,
          input.projectId,
          input.planArtifactId,
          input.reviewArtifactId,
        ],
      );
      const row = source.rows[0];
      if (
        !row ||
        row.plan_kind !== "PLAN" ||
        row.review_kind !== "REVIEW" ||
        row.human_actor_id !== input.authorityOwnerActorId ||
        row.company_scope_ref !== input.companyScopeRef ||
        row.team_scope_ref !== (input.teamScopeRef ?? null) ||
        row.project_scope_ref !== input.projectScopeRef ||
        row.system_scope_ref !== (input.systemScopeRef ?? null) ||
        row.risk_class !== input.riskClass ||
        row.environment !== input.environment ||
        row.plan_scope !== input.projectScopeRef ||
        row.review_scope !== input.projectScopeRef ||
        row.plan_risk !== input.riskClass ||
        row.review_risk !== input.riskClass ||
        row.plan_environment !== input.environment ||
        row.review_environment !== input.environment ||
        !row.reviewer_routing_id ||
        input.targetType !== "REVIEW_ARTIFACT" ||
        input.targetId !== input.reviewArtifactId ||
        row.review_version !== input.targetVersion ||
        row.review_hash !== input.targetHash
      ) {
        throw new HumanApprovalDeniedError("APPROVAL_REQUEST_BINDING_MISMATCH");
      }
      await this.database.query(
        `INSERT INTO governance.approvals (
           id, target_type, target_id, target_version, target_hash,
           status, validity, requested_by_actor_type, requested_by_actor_id,
           expires_at
         ) VALUES ($1,$2,$3,$4,$5,'PENDING','VALID',$6,$7,$8)`,
        [
          input.approvalId,
          input.targetType,
          input.targetId,
          input.targetVersion,
          input.targetHash,
          input.requestedByActorType,
          input.requestedByActorId,
          input.expiresAt,
        ],
      );
      await this.database.query(
        `INSERT INTO governance.human_approval_requests (
           id, approval_id, project_id, command_envelope_id,
           plan_artifact_id, review_artifact_id, authority_owner_actor_id,
           requested_operation, target_type, target_id, target_version,
           target_hash, company_scope_ref, team_scope_ref, project_scope_ref,
           system_scope_ref, risk_class, environment, evidence_refs,
           evidence_manifest_hash, approval_policy_ref, approval_policy_version,
           fresh_until, expires_at, idempotency_key, request_fingerprint,
           correlation_id, causation_refs
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
           $19,$20,$21,$22,$23,$24,$25,$26,$27,$28
         )`,
        [
          input.id,
          input.approvalId,
          input.projectId,
          input.commandEnvelopeId,
          input.planArtifactId,
          input.reviewArtifactId,
          input.authorityOwnerActorId,
          input.requestedOperation,
          input.targetType,
          input.targetId,
          input.targetVersion,
          input.targetHash,
          input.companyScopeRef,
          input.teamScopeRef ?? null,
          input.projectScopeRef,
          input.systemScopeRef ?? null,
          input.riskClass,
          input.environment,
          [...input.evidenceRefs],
          input.evidenceManifestHash,
          input.approvalPolicyRef,
          input.approvalPolicyVersion,
          input.freshUntil,
          input.expiresAt,
          input.idempotencyKey,
          input.requestFingerprint,
          input.correlationId,
          [...input.causationRefs],
        ],
      );
      const created = await this.#findRequest("r.id = $1", [input.id]);
      if (!created)
        throw new Error("HUMAN_APPROVAL_REQUEST_PERSISTENCE_FAILED");
      await this.database.exec("COMMIT");
      return { outcome: "CREATED", value: created };
    } catch (error) {
      await this.database.exec("ROLLBACK");
      if (isUniqueViolation(error)) {
        const existing = await this.#findRequest(
          "r.id = $1 OR (r.project_id = $2 AND r.idempotency_key = $3)",
          [input.id, input.projectId, input.idempotencyKey],
        );
        if (
          existing?.id === input.id &&
          existing.requestFingerprint === input.requestFingerprint
        ) {
          return { outcome: "REUSED", value: existing };
        }
        throw new HumanApprovalConflictError();
      }
      throw error;
    }
  }

  async #decide(
    input: HumanApprovalDecisionInput,
  ): Promise<CreateOrReuseResult<HumanApprovalDecision>> {
    exactFingerprint(
      input as unknown as Readonly<Record<string, unknown>>,
      "decisionFingerprint",
      input.decisionFingerprint,
    );
    await this.database.exec("BEGIN");
    try {
      const requestResult = await this.database.query<RequestRow>(
        `SELECT ${requestSelect}
         FROM governance.human_approval_requests r
         JOIN governance.approvals a ON a.id = r.approval_id
         WHERE r.id = $1 AND r.project_id = $2 FOR UPDATE OF a`,
        [input.requestId, input.projectId],
      );
      const requestRow = requestResult.rows[0];
      if (!requestRow)
        throw new HumanApprovalDeniedError("APPROVAL_REQUEST_NOT_FOUND");
      if (
        input.actorType !== "HUMAN" ||
        input.actorId !== requestRow.authority_owner_actor_id
      ) {
        throw new HumanApprovalDeniedError("HUMAN_APPROVAL_AUTHORITY_DENIED");
      }
      const replay = await this.database.query<DecisionRow>(
        `SELECT ${decisionSelect} FROM governance.human_approval_decisions d
         WHERE d.id = $1 OR (
           d.project_id = $2 AND d.request_id = $3 AND d.idempotency_key = $4
         )`,
        [input.id, input.projectId, input.requestId, input.idempotencyKey],
      );
      if (replay.rows[0]) {
        const existing = replay.rows[0];
        if (
          existing.id !== input.id ||
          existing.decision_fingerprint !== input.decisionFingerprint
        )
          throw new HumanApprovalConflictError();
        await this.database.exec("COMMIT");
        return { outcome: "REUSED", value: decisionFrom(existing) };
      }
      const clock = await this.database.query<{ now: Date | string }>(
        "SELECT CURRENT_TIMESTAMP AS now",
      );
      const now = new Date(clock.rows[0]!.now);
      if (
        !(await this.#authorityActive({
          actorId: input.actorId,
          authorityRef: input.authorityRef,
          operation: requestRow.requested_operation,
          resource: requestRow.target_type,
          environment: requestRow.environment,
          risk: requestRow.risk_class,
          scope: requestRow.project_scope_ref,
        }))
      ) {
        throw new HumanApprovalDeniedError("HUMAN_APPROVAL_AUTHORITY_DENIED");
      }
      let status = requestRow.status;
      let validity = requestRow.validity;
      if (input.decisionType === "APPROVED") {
        if (status !== "PENDING" || validity !== "VALID")
          throw new HumanApprovalDeniedError("APPROVAL_NOT_PENDING");
        if (new Date(requestRow.expires_at).getTime() <= now.getTime())
          throw new HumanApprovalDeniedError("APPROVAL_EXPIRED");
        status = "APPROVED";
      } else if (input.decisionType === "REJECTED") {
        if (status !== "PENDING")
          throw new HumanApprovalDeniedError("APPROVAL_NOT_PENDING");
        status = "REJECTED";
        validity = "POLICY_INVALID";
      } else if (input.decisionType === "CLARIFICATION_REQUIRED") {
        if (status !== "PENDING")
          throw new HumanApprovalDeniedError("APPROVAL_NOT_PENDING");
      } else if (input.decisionType === "REVOKED") {
        if (status !== "APPROVED")
          throw new HumanApprovalDeniedError("APPROVAL_NOT_APPROVED");
        status = "REVOKED";
        validity = "POLICY_INVALID";
      } else if (input.decisionType === "EXPIRED") {
        if (status !== "PENDING" && status !== "APPROVED")
          throw new HumanApprovalDeniedError("APPROVAL_TERMINAL");
        if (new Date(requestRow.expires_at).getTime() > now.getTime())
          throw new HumanApprovalDeniedError("APPROVAL_NOT_EXPIRED");
        status = "EXPIRED";
        validity = "STALE";
      } else if (input.decisionType === "SUPERSEDED") {
        if (status !== "PENDING" && status !== "APPROVED")
          throw new HumanApprovalDeniedError("APPROVAL_TERMINAL");
        if (!input.replacementRequestId)
          throw new HumanApprovalDeniedError("REPLACEMENT_REQUEST_REQUIRED");
        const replacement = await this.database.query<{ id: string }>(
          `SELECT id FROM governance.human_approval_requests
           WHERE id = $1 AND project_id = $2
             AND command_envelope_id = $3
             AND authority_owner_actor_id = $4
             AND requested_operation = $5
             AND target_type = $6
             AND company_scope_ref = $7
             AND team_scope_ref IS NOT DISTINCT FROM $8
             AND project_scope_ref = $9
             AND system_scope_ref IS NOT DISTINCT FROM $10
             AND risk_class = $11 AND environment = $12
             AND approval_policy_ref = $13 AND approval_policy_version = $14`,
          [
            input.replacementRequestId,
            input.projectId,
            requestRow.command_envelope_id,
            requestRow.authority_owner_actor_id,
            requestRow.requested_operation,
            requestRow.target_type,
            requestRow.company_scope_ref,
            requestRow.team_scope_ref,
            requestRow.project_scope_ref,
            requestRow.system_scope_ref,
            requestRow.risk_class,
            requestRow.environment,
            requestRow.approval_policy_ref,
            requestRow.approval_policy_version,
          ],
        );
        if (!replacement.rows[0])
          throw new HumanApprovalDeniedError("REPLACEMENT_REQUEST_NOT_FOUND");
        validity = "STALE";
      } else if (input.decisionType === "CANCELLED") {
        if (status !== "PENDING")
          throw new HumanApprovalDeniedError("APPROVAL_NOT_PENDING");
        status = "CANCELLED";
        validity = "POLICY_INVALID";
      }

      if (input.decisionType !== "CLARIFICATION_REQUIRED")
        await this.database.query(
          `UPDATE governance.approvals SET
           status = $2, validity = $3,
           approved_by_actor_type = CASE WHEN $4 = 'APPROVED' THEN 'HUMAN' ELSE approved_by_actor_type END,
           approved_by_actor_id = CASE WHEN $4 = 'APPROVED' THEN $5 ELSE approved_by_actor_id END,
           version = version + 1, updated_at = $6
         WHERE id = $1`,
          [
            requestRow.approval_id,
            status,
            validity,
            input.decisionType,
            input.actorId,
            input.decidedAt,
          ],
        );
      await this.database.query(
        `INSERT INTO governance.human_approval_decisions (
           id, project_id, request_id, approval_id, actor_type, actor_id,
           authority_ref, decision_type, resulting_status, resulting_validity,
           reason_code, evidence_refs, replacement_request_id, idempotency_key,
           decision_fingerprint, correlation_id, causation_refs, decided_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
         )`,
        [
          input.id,
          input.projectId,
          input.requestId,
          requestRow.approval_id,
          input.actorType,
          input.actorId,
          input.authorityRef,
          input.decisionType,
          status,
          validity,
          input.reasonCode,
          [...input.evidenceRefs],
          input.replacementRequestId ?? null,
          input.idempotencyKey,
          input.decisionFingerprint,
          input.correlationId,
          [...input.causationRefs],
          input.decidedAt,
        ],
      );
      const persisted = await this.database.query<DecisionRow>(
        `SELECT ${decisionSelect} FROM governance.human_approval_decisions d
         WHERE d.id = $1`,
        [input.id],
      );
      const value = persisted.rows[0]
        ? decisionFrom(persisted.rows[0])
        : undefined;
      if (!value) throw new Error("HUMAN_APPROVAL_DECISION_PERSISTENCE_FAILED");
      await this.database.exec("COMMIT");
      return { outcome: "CREATED", value };
    } catch (error) {
      await this.database.exec("ROLLBACK");
      if (isUniqueViolation(error)) throw new HumanApprovalConflictError();
      throw error;
    }
  }

  async #recordDeniedDecision(
    input: HumanApprovalDecisionInput,
    reasonCode: string,
  ): Promise<void> {
    const request = await this.findRequest(input.requestId);
    if (!request) return;
    await this.#audit.recordAudit({
      action: "APPROVAL.DECISION_DENIED",
      actorId: input.actorId,
      actorType: input.actorType,
      commandId: request.commandEnvelopeId,
      projectId: input.projectId,
      requestId: input.requestId,
      correlationId: input.correlationId,
      traceId: input.correlationId,
      spanId: input.id,
      evidenceRefs: input.evidenceRefs,
      targetType: "HUMAN_APPROVAL_REQUEST",
      targetId: input.requestId,
      approvalId: request.approvalId,
      result: "DENIED",
      metadata: {
        approval_request_id: input.requestId,
        approval_decision_id: input.id,
        decision_type: input.decisionType,
        reason_code: reasonCode,
      },
    });
  }

  async #recordRequestedAudit(
    input: CreateHumanApprovalRequestInput,
  ): Promise<void> {
    await this.#audit.recordAudit({
      action: "APPROVAL.REQUESTED",
      actorId: input.requestedByActorId,
      actorType: input.requestedByActorType,
      commandId: input.commandEnvelopeId,
      projectId: input.projectId,
      requestId: input.id,
      correlationId: input.correlationId,
      traceId: input.correlationId,
      spanId: input.id,
      evidenceRefs: input.evidenceRefs,
      targetType: "HUMAN_APPROVAL_REQUEST",
      targetId: input.id,
      approvalId: input.approvalId,
      metadata: {
        approval_request_id: input.id,
        target_version: input.targetVersion,
        target_hash: input.targetHash,
        scope_ref: input.projectScopeRef,
        risk_class: input.riskClass,
        environment: input.environment,
        operation: input.requestedOperation,
        policy_ref: input.approvalPolicyRef,
        policy_version: input.approvalPolicyVersion,
      },
    });
  }

  async #recordDecisionAudit(
    input: HumanApprovalDecisionInput,
    decision: HumanApprovalDecision,
  ): Promise<void> {
    const request = await this.findRequest(input.requestId);
    if (!request) throw new Error("HUMAN_APPROVAL_REQUEST_NOT_FOUND");
    await this.#audit.recordAudit({
      action: `APPROVAL.${input.decisionType}`,
      actorId: input.actorId,
      actorType: "HUMAN",
      commandId: request.commandEnvelopeId,
      projectId: input.projectId,
      requestId: input.requestId,
      correlationId: input.correlationId,
      traceId: input.correlationId,
      spanId: input.id,
      evidenceRefs: input.evidenceRefs,
      targetType: "HUMAN_APPROVAL_REQUEST",
      targetId: input.requestId,
      approvalId: request.approvalId,
      metadata: {
        approval_request_id: input.requestId,
        approval_decision_id: input.id,
        decision_type: input.decisionType,
        resulting_status: decision.approvalStatus,
        resulting_validity: decision.approvalValidity,
        reason_code: input.reasonCode,
      },
    });
  }
}
