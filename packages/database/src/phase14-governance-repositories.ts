import type { MigrationDatabase } from "./types.js";
import {
  computePhase14Fingerprint,
  Phase14RuntimeConflictError,
  type CreateGovernedArtifactRefInput,
  type CreateOrReuseResult,
  type CreatePortalBindingInput,
  type CreateRoutingEnvelopeInput,
  type CreateVerificationHandoffInput,
} from "./phase14-runtime-contracts.js";

type ReplayRow = { fingerprint: string; id: string };

function withoutNulls<T>(
  row: Record<string, unknown> | undefined,
): T | undefined {
  if (!row) return undefined;
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== null),
  ) as T;
}

function requireFingerprint(
  input: Readonly<Record<string, unknown>>,
  field: string,
  provided: string,
): void {
  if (computePhase14Fingerprint(input, field) !== provided) {
    throw new Phase14RuntimeConflictError();
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

async function existingReplay<T extends { id: string }>(
  database: MigrationDatabase,
  query: string,
  params: unknown[],
  expectedId: string,
  expectedFingerprint: string,
  input: T,
): Promise<CreateOrReuseResult<T> | undefined> {
  const result = await database.query<ReplayRow>(query, params);
  if (result.rows.length === 0) return undefined;
  if (
    result.rows.length === 1 &&
    result.rows[0]!.id === expectedId &&
    result.rows[0]!.fingerprint === expectedFingerprint
  ) {
    return { outcome: "REUSED", value: input };
  }
  throw new Phase14RuntimeConflictError();
}

export class PostgresRoutingEnvelopeRepository {
  constructor(private readonly database: MigrationDatabase) {}

  async findById(id: string): Promise<CreateRoutingEnvelopeInput | undefined> {
    const result = await this.database.query<Record<string, unknown>>(
      `SELECT id, project_id AS "projectId", command_envelope_id AS "commandEnvelopeId",
        command_envelope_version AS "commandEnvelopeVersion", command_envelope_hash AS "commandEnvelopeHash",
        routing_kind AS "routingKind", status, input_artifact_id AS "inputArtifactId",
        verification_handoff_id AS "verificationHandoffId", routing_purpose AS "routingPurpose",
        required_role AS "requiredRole", selected_role_ref AS "selectedRoleRef",
        selected_agent_id AS "selectedAgentId", candidate_refs AS "candidateRefs",
        evaluation_refs AS "evaluationRefs", capability_refs AS "capabilityRefs",
        skill_version_refs AS "skillVersionRefs", independence_evidence_ref AS "independenceEvidenceRef",
        risk_class AS "riskClass", environment, routing_policy_ref AS "routingPolicyRef",
        routing_policy_version AS "routingPolicyVersion", approval_id AS "approvalId",
        approval_request_ref AS "approvalRequestRef", approval_decision_ref AS "approvalDecisionRef",
        approval_target_version AS "approvalTargetVersion", approval_target_hash AS "approvalTargetHash",
        repository_id AS "repositoryId", workroot_id AS "workrootId", task_id AS "taskId",
        run_id AS "runId", fallback_outcome AS "fallbackOutcome", no_selection_reason AS "noSelectionReason",
        input_binding_hash AS "inputBindingHash", idempotency_key AS "idempotencyKey",
        routing_input_fingerprint AS "routingInputFingerprint", correlation_id AS "correlationId",
        causation_refs AS "causationRefs", evidence_refs AS "evidenceRefs", audit_refs AS "auditRefs",
        evaluated_at AS "evaluatedAt", expires_at AS "expiresAt"
       FROM governance.routing_envelopes WHERE id = $1`,
      [id],
    );
    return withoutNulls<CreateRoutingEnvelopeInput>(result.rows[0]);
  }

  async findByIdentity(
    projectId: string,
    routingKind: CreateRoutingEnvelopeInput["routingKind"],
    idempotencyKey: string,
  ): Promise<CreateRoutingEnvelopeInput | undefined> {
    const result = await this.database.query<{ id: string }>(
      `SELECT id FROM governance.routing_envelopes
       WHERE project_id = $1 AND routing_kind = $2 AND idempotency_key = $3`,
      [projectId, routingKind, idempotencyKey],
    );
    return result.rows[0] ? this.findById(result.rows[0].id) : undefined;
  }

  async createOrReuse(
    input: CreateRoutingEnvelopeInput,
  ): Promise<CreateOrReuseResult<CreateRoutingEnvelopeInput>> {
    requireFingerprint(
      { ...input },
      "routingInputFingerprint",
      input.routingInputFingerprint,
    );
    const replay = await existingReplay(
      this.database,
      `SELECT id, routing_input_fingerprint AS fingerprint
       FROM governance.routing_envelopes
       WHERE id = $1 OR (project_id = $2 AND routing_kind = $3 AND idempotency_key = $4)`,
      [input.id, input.projectId, input.routingKind, input.idempotencyKey],
      input.id,
      input.routingInputFingerprint,
      input,
    );
    if (replay) return replay;
    try {
      await this.database.query(
        `INSERT INTO governance.routing_envelopes (
           id, project_id, command_envelope_id, command_envelope_version,
           command_envelope_hash, routing_kind, status, input_artifact_id, verification_handoff_id,
           routing_purpose, required_role, selected_role_ref, selected_agent_id,
           candidate_refs, evaluation_refs, capability_refs, skill_version_refs,
           independence_evidence_ref, risk_class, environment,
           routing_policy_ref, routing_policy_version, approval_id,
           approval_request_ref, approval_decision_ref,
           approval_target_version, approval_target_hash, repository_id,
           workroot_id, task_id, run_id, fallback_outcome, no_selection_reason,
           input_binding_hash, idempotency_key, routing_input_fingerprint,
           correlation_id, causation_refs, evidence_refs, audit_refs,
           evaluated_at, expires_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
           $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42
         )`,
        [
          input.id,
          input.projectId,
          input.commandEnvelopeId,
          input.commandEnvelopeVersion,
          input.commandEnvelopeHash,
          input.routingKind,
          input.status,
          input.inputArtifactId ?? null,
          input.verificationHandoffId ?? null,
          input.routingPurpose,
          input.requiredRole,
          input.selectedRoleRef ?? null,
          input.selectedAgentId ?? null,
          input.candidateRefs,
          input.evaluationRefs,
          input.capabilityRefs ?? [],
          input.skillVersionRefs ?? [],
          input.independenceEvidenceRef ?? null,
          input.riskClass,
          input.environment,
          input.routingPolicyRef,
          input.routingPolicyVersion,
          input.approvalId ?? null,
          input.approvalRequestRef ?? null,
          input.approvalDecisionRef ?? null,
          input.approvalTargetVersion ?? null,
          input.approvalTargetHash ?? null,
          input.repositoryId ?? null,
          input.workrootId ?? null,
          input.taskId ?? null,
          input.runId ?? null,
          input.fallbackOutcome ?? null,
          input.noSelectionReason ?? null,
          input.inputBindingHash,
          input.idempotencyKey,
          input.routingInputFingerprint,
          input.correlationId,
          input.causationRefs ?? [],
          input.evidenceRefs ?? [],
          input.auditRefs ?? [],
          input.evaluatedAt,
          input.expiresAt ?? null,
        ],
      );
      return { outcome: "CREATED", value: input };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const concurrentReplay = await existingReplay(
          this.database,
          `SELECT id, routing_input_fingerprint AS fingerprint
           FROM governance.routing_envelopes
           WHERE id = $1 OR (project_id = $2 AND routing_kind = $3 AND idempotency_key = $4)`,
          [input.id, input.projectId, input.routingKind, input.idempotencyKey],
          input.id,
          input.routingInputFingerprint,
          input,
        );
        if (concurrentReplay) return concurrentReplay;
        throw new Phase14RuntimeConflictError();
      }
      throw error;
    }
  }
}

export class PostgresGovernedArtifactRepository {
  constructor(private readonly database: MigrationDatabase) {}

  async findById(
    id: string,
  ): Promise<CreateGovernedArtifactRefInput | undefined> {
    const result = await this.database.query<Record<string, unknown>>(
      `SELECT id, project_id AS "projectId", command_envelope_id AS "commandEnvelopeId",
        artifact_kind AS "artifactKind", artifact_ref AS "artifactRef",
        artifact_version AS "artifactVersion", artifact_hash AS "artifactHash",
        delivery_artifact_id AS "deliveryArtifactId", task_id AS "taskId", run_id AS "runId",
        scope_ref AS "scopeRef", risk_class AS "riskClass", environment,
        policy_ref AS "policyRef", policy_version AS "policyVersion", evidence_refs AS "evidenceRefs",
        audit_refs AS "auditRefs", idempotency_key AS "idempotencyKey",
        input_fingerprint AS "inputFingerprint", correlation_id AS "correlationId",
        causation_ref AS "causationRef", verification_handoff_id AS "verificationHandoffId",
        verification_outcome AS "verificationOutcome",
        verification_resolution AS "verificationResolution",
        rework_handoff_ref AS "reworkHandoffRef",
        evidence_classification AS "evidenceClassification",
        redaction_policy_ref AS "redactionPolicyRef",
        retention_class AS "retentionClass", retention_policy_ref AS "retentionPolicyRef",
        generated_at AS "generatedAt", observed_at AS "observedAt",
        evidence_integrity_algorithm AS "evidenceIntegrityAlgorithm"
       FROM governance.governed_artifact_refs WHERE id = $1`,
      [id],
    );
    return withoutNulls<CreateGovernedArtifactRefInput>(result.rows[0]);
  }

  async createOrReuse(
    input: CreateGovernedArtifactRefInput,
  ): Promise<CreateOrReuseResult<CreateGovernedArtifactRefInput>> {
    requireFingerprint(
      { ...input },
      "inputFingerprint",
      input.inputFingerprint,
    );
    const replay = await existingReplay(
      this.database,
      `SELECT id, input_fingerprint AS fingerprint
       FROM governance.governed_artifact_refs
       WHERE id = $1 OR (project_id = $2 AND idempotency_key = $3)`,
      [input.id, input.projectId, input.idempotencyKey],
      input.id,
      input.inputFingerprint,
      input,
    );
    if (replay) return replay;
    try {
      await this.database.query(
        `INSERT INTO governance.governed_artifact_refs (
           id, project_id, command_envelope_id, artifact_kind, artifact_ref,
           artifact_version, artifact_hash, delivery_artifact_id, task_id, run_id,
           scope_ref, risk_class, environment, policy_ref, policy_version,
           evidence_refs, audit_refs, idempotency_key, input_fingerprint,
           correlation_id, causation_ref, verification_handoff_id,
           verification_outcome, verification_resolution, rework_handoff_ref,
           evidence_classification, redaction_policy_ref, retention_class,
           retention_policy_ref, generated_at, observed_at, evidence_integrity_algorithm
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
         )`,
        [
          input.id,
          input.projectId,
          input.commandEnvelopeId,
          input.artifactKind,
          input.artifactRef,
          input.artifactVersion,
          input.artifactHash,
          input.deliveryArtifactId ?? null,
          input.taskId ?? null,
          input.runId ?? null,
          input.scopeRef,
          input.riskClass,
          input.environment,
          input.policyRef,
          input.policyVersion,
          input.evidenceRefs ?? [],
          input.auditRefs ?? [],
          input.idempotencyKey,
          input.inputFingerprint,
          input.correlationId,
          input.causationRef ?? null,
          input.verificationHandoffId ?? null,
          input.verificationOutcome ?? null,
          input.verificationResolution ?? null,
          input.reworkHandoffRef ?? null,
          input.evidenceClassification ?? "INTERNAL",
          input.redactionPolicyRef ?? "policy://maos-013/secret-exclusion",
          input.retentionClass ?? "STANDARD",
          input.retentionPolicyRef ?? "policy://maos-013/retention/default",
          input.generatedAt ?? new Date(),
          input.observedAt ?? input.generatedAt ?? new Date(),
          input.evidenceIntegrityAlgorithm ?? "SHA-256",
        ],
      );
      return { outcome: "CREATED", value: input };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const concurrentReplay = await existingReplay(
          this.database,
          `SELECT id, input_fingerprint AS fingerprint
           FROM governance.governed_artifact_refs
           WHERE id = $1 OR (project_id = $2 AND idempotency_key = $3)`,
          [input.id, input.projectId, input.idempotencyKey],
          input.id,
          input.inputFingerprint,
          input,
        );
        if (concurrentReplay) return concurrentReplay;
        throw new Phase14RuntimeConflictError();
      }
      throw error;
    }
  }
}

export class PostgresVerificationHandoffRepository {
  constructor(private readonly database: MigrationDatabase) {}

  async findById(
    id: string,
  ): Promise<CreateVerificationHandoffInput | undefined> {
    const result = await this.database.query<Record<string, unknown>>(
      `SELECT id, project_id AS "projectId", command_envelope_id AS "commandEnvelopeId",
        executor_routing_id AS "executorRoutingId", task_id AS "taskId", run_id AS "runId",
        tool_call_id AS "toolCallId", runner_id AS "runnerId", status,
        execution_result_ref AS "executionResultRef", execution_result_version AS "executionResultVersion",
        execution_result_hash AS "executionResultHash", artifact_ref_ids AS "artifactRefIds",
        artifact_manifest_hash AS "artifactManifestHash", evidence_refs AS "evidenceRefs",
        evidence_set_hash AS "evidenceSetHash", expected_outcome_ref AS "expectedOutcomeRef",
        acceptance_criteria_ref AS "acceptanceCriteriaRef", verification_criteria_ref AS "verificationCriteriaRef",
        scope_ref AS "scopeRef", risk_class AS "riskClass", environment,
        execution_policy_ref AS "executionPolicyRef", execution_policy_version AS "executionPolicyVersion",
        verification_policy_ref AS "verificationPolicyRef", verification_policy_version AS "verificationPolicyVersion",
        idempotency_key AS "idempotencyKey", handoff_fingerprint AS "handoffFingerprint",
        correlation_id AS "correlationId", causation_refs AS "causationRefs",
        audit_refs AS "auditRefs", expires_at AS "expiresAt"
       FROM governance.verification_handoffs WHERE id = $1`,
      [id],
    );
    return withoutNulls<CreateVerificationHandoffInput>(result.rows[0]);
  }

  async createOrReuse(
    input: CreateVerificationHandoffInput,
  ): Promise<CreateOrReuseResult<CreateVerificationHandoffInput>> {
    requireFingerprint(
      { ...input },
      "handoffFingerprint",
      input.handoffFingerprint,
    );
    const replay = await existingReplay(
      this.database,
      `SELECT id, handoff_fingerprint AS fingerprint
       FROM governance.verification_handoffs
       WHERE id = $1 OR (project_id = $2 AND idempotency_key = $3)`,
      [input.id, input.projectId, input.idempotencyKey],
      input.id,
      input.handoffFingerprint,
      input,
    );
    if (replay) return replay;
    try {
      await this.database.query(
        `WITH inserted AS (
         INSERT INTO governance.verification_handoffs (
           id, project_id, command_envelope_id, executor_routing_id,
           task_id, run_id, tool_call_id, runner_id, status,
           execution_result_ref, execution_result_version, execution_result_hash,
           artifact_ref_ids, artifact_manifest_hash, evidence_refs, evidence_set_hash,
           expected_outcome_ref, acceptance_criteria_ref, verification_criteria_ref,
           scope_ref, risk_class, environment, execution_policy_ref,
           execution_policy_version, verification_policy_ref,
           verification_policy_version, idempotency_key, handoff_fingerprint,
           correlation_id, causation_refs, audit_refs, expires_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
           $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
         ) RETURNING id, project_id, command_envelope_id
         )
         INSERT INTO governance.verification_handoff_artifacts (
           handoff_id, project_id, command_envelope_id, artifact_ref_id
         )
         SELECT inserted.id, inserted.project_id, inserted.command_envelope_id, artifact_id
         FROM inserted, unnest($13::uuid[]) AS artifact_id`,
        [
          input.id,
          input.projectId,
          input.commandEnvelopeId,
          input.executorRoutingId,
          input.taskId,
          input.runId,
          input.toolCallId ?? null,
          input.runnerId,
          input.status,
          input.executionResultRef,
          input.executionResultVersion,
          input.executionResultHash,
          input.artifactRefIds,
          input.artifactManifestHash,
          input.evidenceRefs,
          input.evidenceSetHash,
          input.expectedOutcomeRef,
          input.acceptanceCriteriaRef,
          input.verificationCriteriaRef,
          input.scopeRef,
          input.riskClass,
          input.environment,
          input.executionPolicyRef,
          input.executionPolicyVersion,
          input.verificationPolicyRef,
          input.verificationPolicyVersion,
          input.idempotencyKey,
          input.handoffFingerprint,
          input.correlationId,
          input.causationRefs ?? [],
          input.auditRefs ?? [],
          input.expiresAt ?? null,
        ],
      );
      return { outcome: "CREATED", value: input };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const concurrentReplay = await existingReplay(
          this.database,
          `SELECT id, handoff_fingerprint AS fingerprint
           FROM governance.verification_handoffs
           WHERE id = $1 OR (project_id = $2 AND idempotency_key = $3)`,
          [input.id, input.projectId, input.idempotencyKey],
          input.id,
          input.handoffFingerprint,
          input,
        );
        if (concurrentReplay) return concurrentReplay;
        throw new Phase14RuntimeConflictError();
      }
      throw error;
    }
  }
}

export class PostgresPortalBindingRepository {
  constructor(private readonly database: MigrationDatabase) {}

  async findById(
    id: string,
    version: number,
  ): Promise<CreatePortalBindingInput | undefined> {
    const result = await this.database.query<Record<string, unknown>>(
      `SELECT id, version::integer AS version, supersedes_version::integer AS "supersedesVersion", binding_kind AS "bindingKind",
        company_ref AS "companyRef", team_ref AS "teamRef", project_id AS "projectId",
        project_scope_ref AS "projectScopeRef", system_id AS "systemId", system_version AS "systemVersion",
        environment_id AS "environmentId", environment_version AS "environmentVersion",
        repository_id AS "repositoryId", repository_version AS "repositoryVersion",
        workroot_id AS "workrootId", workroot_ref AS "workrootRef", policy_ref AS "policyRef",
        policy_version AS "policyVersion", lifecycle, capability_refs AS "capabilityRefs",
        evidence_refs AS "evidenceRefs", audit_refs AS "auditRefs", idempotency_key AS "idempotencyKey",
        binding_fingerprint AS "bindingFingerprint", correlation_id AS "correlationId",
        expires_at AS "expiresAt"
       FROM core.portal_bindings WHERE id = $1 AND version = $2`,
      [id, version],
    );
    return withoutNulls<CreatePortalBindingInput>(result.rows[0]);
  }

  async createOrReuse(
    input: CreatePortalBindingInput,
  ): Promise<CreateOrReuseResult<CreatePortalBindingInput>> {
    requireFingerprint(
      { ...input },
      "bindingFingerprint",
      input.bindingFingerprint,
    );
    const replay = await existingReplay(
      this.database,
      `SELECT id, binding_fingerprint AS fingerprint
       FROM core.portal_bindings
       WHERE (id = $1 AND version = $2)
          OR (project_id = $3 AND binding_kind = $4 AND idempotency_key = $5)`,
      [
        input.id,
        input.version,
        input.projectId,
        input.bindingKind,
        input.idempotencyKey,
      ],
      input.id,
      input.bindingFingerprint,
      input,
    );
    if (replay) return replay;
    try {
      await this.database.query(
        `INSERT INTO core.portal_bindings (
           id, version, supersedes_version, binding_kind, company_ref, team_ref, project_id, project_scope_ref,
           system_id, system_version, environment_id, environment_version,
           repository_id, repository_version, workroot_id, workroot_ref, policy_ref,
           policy_version, lifecycle, capability_refs, evidence_refs, audit_refs,
           idempotency_key, binding_fingerprint, correlation_id, expires_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26
         )`,
        [
          input.id,
          input.version,
          input.supersedesVersion ?? null,
          input.bindingKind,
          input.companyRef,
          input.teamRef ?? null,
          input.projectId,
          input.projectScopeRef,
          input.systemId ?? null,
          input.systemVersion ?? null,
          input.environmentId ?? null,
          input.environmentVersion ?? null,
          input.repositoryId ?? null,
          input.repositoryVersion ?? null,
          input.workrootId ?? null,
          input.workrootRef ?? null,
          input.policyRef,
          input.policyVersion,
          input.lifecycle,
          input.capabilityRefs ?? [],
          input.evidenceRefs ?? [],
          input.auditRefs ?? [],
          input.idempotencyKey,
          input.bindingFingerprint,
          input.correlationId,
          input.expiresAt ?? null,
        ],
      );
      return { outcome: "CREATED", value: input };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const concurrentReplay = await existingReplay(
          this.database,
          `SELECT id, binding_fingerprint AS fingerprint
           FROM core.portal_bindings
           WHERE (id = $1 AND version = $2)
              OR (project_id = $3 AND binding_kind = $4 AND idempotency_key = $5)`,
          [
            input.id,
            input.version,
            input.projectId,
            input.bindingKind,
            input.idempotencyKey,
          ],
          input.id,
          input.bindingFingerprint,
          input,
        );
        if (concurrentReplay) return concurrentReplay;
        throw new Phase14RuntimeConflictError();
      }
      throw error;
    }
  }
}
