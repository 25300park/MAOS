import type { MigrationDatabase } from "./types.js";
import {
  computePhase14Fingerprint,
  Phase14RuntimeConflictError,
  type CommandEnvelope,
  type CommandEnvelopeTransition,
  type CreateCommandEnvelopeInput,
} from "./phase14-runtime-contracts.js";

type CommandEnvelopeRow = {
  id: string;
  project_id: string;
  human_actor_id: string;
  source_message_ref: string;
  source_message_hash: string;
  prior_command_id: string | null;
  company_scope_ref: string;
  team_scope_ref: string | null;
  project_scope_ref: string;
  system_scope_ref: string | null;
  environment: CommandEnvelope["environment"];
  normalized_intent: string;
  requested_outcome: string;
  command_classification: CommandEnvelope["commandClassification"];
  risk_class: CommandEnvelope["riskClass"];
  policy_ref: string;
  policy_version: string;
  lifecycle_state: CommandEnvelope["lifecycleState"];
  clarification_state: CommandEnvelope["clarificationState"];
  unresolved_fields: string[];
  request_fingerprint: string;
  idempotency_key: string;
  correlation_id: string;
  causation_ref: string | null;
  approval_id: string | null;
  task_id: string | null;
  workflow_instance_id: string | null;
  run_id: string | null;
  evidence_refs: string[];
  audit_refs: string[];
  reason_code: string | null;
  version: number | string;
  created_at: Date | string;
  updated_at: Date | string;
  expires_at: Date | string | null;
};

export class CommandEnvelopeConflictError extends Phase14RuntimeConflictError {
  readonly code = "COMMAND_ENVELOPE_CONFLICT";
  constructor() {
    super("COMMAND_ENVELOPE_CONFLICT");
  }
}

export class CommandEnvelopeVersionConflictError extends Phase14RuntimeConflictError {
  readonly code = "COMMAND_ENVELOPE_VERSION_CONFLICT";
  constructor() {
    super("COMMAND_ENVELOPE_VERSION_CONFLICT");
  }
}

const selectColumns = `
  id, project_id, human_actor_id, source_message_ref, source_message_hash,
  prior_command_id, company_scope_ref, team_scope_ref, project_scope_ref,
  system_scope_ref, environment, normalized_intent, requested_outcome,
  command_classification, risk_class, policy_ref, policy_version,
  lifecycle_state, clarification_state, unresolved_fields,
  request_fingerprint, idempotency_key, correlation_id, causation_ref,
  approval_id, task_id, workflow_instance_id, run_id, evidence_refs,
  audit_refs, reason_code, version, created_at, updated_at, expires_at`;

function optional(value: string | null): string | undefined {
  return value ?? undefined;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function exactReplay(
  row: CommandEnvelopeRow,
  input: CreateCommandEnvelopeInput,
): boolean {
  return (
    row.id === input.id &&
    row.project_id === input.projectId &&
    row.human_actor_id === input.humanActorId &&
    row.source_message_ref === input.sourceMessageRef &&
    row.source_message_hash === input.sourceMessageHash &&
    row.prior_command_id === (input.priorCommandId ?? null) &&
    row.company_scope_ref === input.companyScopeRef &&
    row.team_scope_ref === (input.teamScopeRef ?? null) &&
    row.project_scope_ref === input.projectScopeRef &&
    row.system_scope_ref === (input.systemScopeRef ?? null) &&
    row.environment === input.environment &&
    row.normalized_intent === input.normalizedIntent &&
    row.requested_outcome === input.requestedOutcome &&
    row.command_classification === input.commandClassification &&
    row.risk_class === input.riskClass &&
    row.policy_ref === input.policyRef &&
    row.policy_version === input.policyVersion &&
    row.request_fingerprint === input.requestFingerprint &&
    row.idempotency_key === input.idempotencyKey &&
    row.correlation_id === input.correlationId &&
    row.causation_ref === (input.causationRef ?? null)
  );
}

function mapRow(row: CommandEnvelopeRow): CommandEnvelope {
  return {
    id: row.id,
    projectId: row.project_id,
    humanActorId: row.human_actor_id,
    sourceMessageRef: row.source_message_ref,
    sourceMessageHash: row.source_message_hash,
    priorCommandId: optional(row.prior_command_id),
    companyScopeRef: row.company_scope_ref,
    teamScopeRef: optional(row.team_scope_ref),
    projectScopeRef: row.project_scope_ref,
    systemScopeRef: optional(row.system_scope_ref),
    environment: row.environment,
    normalizedIntent: row.normalized_intent,
    requestedOutcome: row.requested_outcome,
    commandClassification: row.command_classification,
    riskClass: row.risk_class,
    policyRef: row.policy_ref,
    policyVersion: row.policy_version,
    lifecycleState: row.lifecycle_state,
    clarificationState: row.clarification_state,
    unresolvedFields: row.unresolved_fields,
    requestFingerprint: row.request_fingerprint,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id,
    causationRef: optional(row.causation_ref),
    approvalId: optional(row.approval_id),
    taskId: optional(row.task_id),
    workflowInstanceId: optional(row.workflow_instance_id),
    runId: optional(row.run_id),
    evidenceRefs: row.evidence_refs,
    auditRefs: row.audit_refs,
    reasonCode: optional(row.reason_code),
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at ?? undefined,
  };
}

export class PostgresCommandEnvelopeRepository {
  constructor(private readonly database: MigrationDatabase) {}

  async findById(id: string): Promise<CommandEnvelope | undefined> {
    const result = await this.database.query<CommandEnvelopeRow>(
      `SELECT ${selectColumns} FROM work.command_envelopes WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async createOrReuse(input: CreateCommandEnvelopeInput): Promise<{
    envelope: CommandEnvelope;
    outcome: "CREATED" | "REUSED";
  }> {
    if (
      computePhase14Fingerprint({ ...input }, "requestFingerprint") !==
      input.requestFingerprint
    ) {
      throw new CommandEnvelopeConflictError();
    }
    const loadReplay = () =>
      this.database.query<CommandEnvelopeRow>(
        `SELECT ${selectColumns} FROM work.command_envelopes
         WHERE (project_id = $1 AND idempotency_key = $2) OR id = $3`,
        [input.projectId, input.idempotencyKey, input.id],
      );
    const existing = await loadReplay();
    if (existing.rows.length > 0) {
      const row = existing.rows[0]!;
      if (existing.rows.length === 1 && exactReplay(row, input)) {
        return { envelope: mapRow(row), outcome: "REUSED" };
      }
      throw new CommandEnvelopeConflictError();
    }

    try {
      const created = await this.database.query<CommandEnvelopeRow>(
        `WITH inserted AS (
         INSERT INTO work.command_envelopes (
           id, project_id, human_actor_id, source_message_ref, source_message_hash,
           prior_command_id, company_scope_ref, team_scope_ref, project_scope_ref,
           system_scope_ref, environment, normalized_intent, requested_outcome,
           command_classification, risk_class, policy_ref, policy_version,
           lifecycle_state, request_fingerprint, idempotency_key, correlation_id,
           causation_ref, evidence_refs, audit_refs, expires_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
           $14, $15, $16, $17, 'RECEIVED', $18, $19, $20, $21, $22, $23, $24
         ) RETURNING *
         ), versioned AS (
           INSERT INTO work.command_envelope_versions (
             command_envelope_id, project_id, version, lifecycle_state,
             command_envelope_hash,
             clarification_state, unresolved_fields, evidence_refs, audit_refs,
             reason_code, transition_actor_type, transition_actor_ref,
             transition_policy_ref, transition_policy_version, correlation_id,
             causation_ref
           ) SELECT id, project_id, version, lifecycle_state, request_fingerprint, clarification_state,
             unresolved_fields, evidence_refs, audit_refs, 'COMMAND_RECEIVED',
             'HUMAN', human_actor_id::text, policy_ref, policy_version,
             correlation_id, causation_ref FROM inserted
         ) SELECT ${selectColumns} FROM inserted`,
        [
          input.id,
          input.projectId,
          input.humanActorId,
          input.sourceMessageRef,
          input.sourceMessageHash,
          input.priorCommandId ?? null,
          input.companyScopeRef,
          input.teamScopeRef ?? null,
          input.projectScopeRef,
          input.systemScopeRef ?? null,
          input.environment,
          input.normalizedIntent,
          input.requestedOutcome,
          input.commandClassification,
          input.riskClass,
          input.policyRef,
          input.policyVersion,
          input.requestFingerprint,
          input.idempotencyKey,
          input.correlationId,
          input.causationRef ?? null,
          input.evidenceRefs ?? [],
          input.auditRefs,
          input.expiresAt ?? null,
        ],
      );
      return { envelope: mapRow(created.rows[0]!), outcome: "CREATED" };
    } catch (error) {
      const concurrent = await loadReplay();
      if (
        concurrent.rows.length === 1 &&
        exactReplay(concurrent.rows[0]!, input)
      ) {
        return { envelope: mapRow(concurrent.rows[0]!), outcome: "REUSED" };
      }
      if (isUniqueViolation(error)) throw new CommandEnvelopeConflictError();
      throw error;
    }
  }

  async transition(input: CommandEnvelopeTransition): Promise<CommandEnvelope> {
    const result = await this.database.query<CommandEnvelopeRow>(
      `WITH updated AS (
         UPDATE work.command_envelopes SET
           lifecycle_state = $3,
           clarification_state = COALESCE($4, clarification_state),
           unresolved_fields = COALESCE($5, unresolved_fields),
           approval_id = COALESCE($6, approval_id),
           task_id = COALESCE($7, task_id),
           workflow_instance_id = COALESCE($8, workflow_instance_id),
           run_id = COALESCE($9, run_id),
           evidence_refs = COALESCE($10, evidence_refs),
           audit_refs = $11,
           reason_code = $12,
           version = version + 1
         WHERE id = $1 AND version = $2
         RETURNING *
         ), versioned AS (
           INSERT INTO work.command_envelope_versions (
             command_envelope_id, project_id, version, lifecycle_state,
             command_envelope_hash,
             clarification_state, unresolved_fields, approval_id,
             approval_request_ref, approval_decision_ref,
             approval_target_version, approval_target_hash, task_id,
             workflow_instance_id, run_id, evidence_refs, audit_refs,
             reason_code, transition_actor_type, transition_actor_ref,
             transition_policy_ref, transition_policy_version, correlation_id,
             causation_ref
           ) SELECT id, project_id, version, lifecycle_state, request_fingerprint, clarification_state,
             unresolved_fields, approval_id, $18, $19, $20, $21, task_id,
             workflow_instance_id, run_id, evidence_refs, audit_refs,
             reason_code, $13, $14, $15, $16, $17, $22 FROM updated
         ) SELECT ${selectColumns} FROM updated`,
      [
        input.id,
        input.expectedVersion,
        input.lifecycleState,
        input.clarificationState ?? null,
        input.unresolvedFields ?? null,
        input.approvalId ?? null,
        input.taskId ?? null,
        input.workflowInstanceId ?? null,
        input.runId ?? null,
        input.evidenceRefs ?? null,
        input.auditRefs,
        input.reasonCode,
        input.transitionActorType,
        input.transitionActorRef,
        input.transitionPolicyRef,
        input.transitionPolicyVersion,
        input.correlationId,
        input.approvalRequestRef ?? null,
        input.approvalDecisionRef ?? null,
        input.approvalTargetVersion ?? null,
        input.approvalTargetHash ?? null,
        input.causationRef ?? null,
      ],
    );
    if (!result.rows[0]) {
      throw new CommandEnvelopeVersionConflictError();
    }
    return mapRow(result.rows[0]);
  }
}
