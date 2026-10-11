import {
  deterministicAuditUuid,
  PostgresAuditRecordRepository,
} from "./audit-record-repository.js";
import {
  RoutingContractError,
  assertRoutingEnums,
  type AppendRoutingDecisionInput,
  type RoutingAppendResult,
  type RoutingCandidateSnapshot,
  type RoutingDecisionRecord,
  type RoutingDecisionRepository,
  type RoutingDecisionAuditInput,
  type RoutingPurpose,
} from "./routing-contracts.js";
import type { MigrationDatabase } from "./types.js";

type Row = Record<string, unknown>;
const decisionSelect = `SELECT routing_decision_id::text,routing_decision_stream_id::text,request_id::text,routing_purpose,routing_version,supersedes_routing_decision_id::text,classification_version_id::text,classification_version,classification_state,classification_currentness_state,classification_currentness_proof,classification_policy_resolution_ref::text,classification_policy_resolution_version,canonical_domain,role_class,routing_mode,specialization_version_id::text,routing_policy_version_id::text,provider_id::text,model_id::text,runtime_adapter_id::text,model_host_binding_id::text,registry_snapshot_ref,registry_snapshot_revision,registry_freshness_policy_id::text,registry_freshness_policy_version::text,registry_max_age_ms::text,registry_observed_at,registry_fresh_until,required_capability_refs,preferred_capability_refs,policy_constraints,context_refs,artifact_refs,evidence_refs,priority,human_approval_state,human_approval_ref::text,human_approval_target_version,human_approval_target_hash,human_approval_authority,human_approval_checked_at,human_approval_expires_at,development_delegation_state,aidos_project_ref,aidos_required_capability_refs,aidos_authority_revision,aidos_checked_at,aidos_fresh_until,decision_state,decision_reason_codes,staleness_state,classification_checked_at,policy_checked_at,policy_fresh_until,idempotency_key,canonical_intent_fingerprint,correlation_id,causation_refs,audit_ref::text,created_at FROM governance.request_routing_decision_versions`;
const candidateSelect = `SELECT candidate_snapshot_id::text,routing_decision_id::text,deterministic_rank,provider_id::text,model_id::text,runtime_adapter_id::text,model_host_binding_id::text,eligibility_state,reason_codes,capability_evidence,ranking_evidence,registry_snapshot_ref,registry_snapshot_revision,registry_freshness_policy_id::text,registry_freshness_policy_version::text,registry_max_age_ms::text,observed_at,fresh_until,created_at FROM governance.request_routing_candidate_snapshots`;
const nullable = (value: unknown) => (value == null ? null : String(value));
const strings = (value: unknown) =>
  Array.isArray(value) ? value.map(String) : [];
const iso = (value: unknown) => new Date(value as string | Date).toISOString();
const nullableIso = (value: unknown) => (value == null ? null : iso(value));
const nullableNumber = (value: unknown) =>
  value == null ? null : Number(value);
const snapshotHash = (value: string, lineagePresent: boolean) =>
  lineagePresent && value.startsWith("registry-snapshot:sha256:")
    ? value.slice("registry-snapshot:sha256:".length)
    : null;
const object = (value: unknown): Readonly<Record<string, unknown>> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function requireRegistryFreshnessLineage(input: AppendRoutingDecisionInput) {
  const lineage = [
    input.registryFreshnessPolicyRef,
    input.registryFreshnessPolicyVersion,
    input.registryFreshnessMaxAgeMs,
    input.registrySnapshotHash,
  ];
  const policyless = lineage.every((value) => value == null);
  if (policyless) {
    if (input.canonicalDomain !== "DEVELOPMENT" || input.candidates.length > 0)
      throw new RoutingContractError("REGISTRY_CONFLICT");
    return;
  }
  const observedAt = Date.parse(input.registryObservedAt);
  const freshUntil = Date.parse(input.registryFreshUntil);
  if (
    lineage.some((value) => value == null) ||
    !Number.isSafeInteger(input.registryFreshnessMaxAgeMs) ||
    input.registryFreshnessMaxAgeMs! <= 0 ||
    !Number.isFinite(observedAt) ||
    !Number.isFinite(freshUntil) ||
    !input.registrySnapshotRef.startsWith("registry-snapshot:sha256:") ||
    input.registrySnapshotHash !==
      input.registrySnapshotRef.slice("registry-snapshot:sha256:".length) ||
    observedAt + input.registryFreshnessMaxAgeMs! !== freshUntil ||
    input.candidates.some(
      (candidate) =>
        candidate.registryFreshnessPolicyRef !==
          input.registryFreshnessPolicyRef ||
        candidate.registryFreshnessPolicyVersion !==
          input.registryFreshnessPolicyVersion ||
        candidate.registryFreshnessMaxAgeMs !==
          input.registryFreshnessMaxAgeMs ||
        candidate.observedAt !== input.registryObservedAt ||
        candidate.freshUntil !== input.registryFreshUntil ||
        candidate.registrySnapshotRef !== input.registrySnapshotRef ||
        candidate.registrySnapshotRevision !== input.registrySnapshotRevision ||
        candidate.registrySnapshotHash !== input.registrySnapshotHash,
    )
  )
    throw new RoutingContractError("REGISTRY_CONFLICT");
}

function sameRegistryFreshnessLineage(
  decision: RoutingDecisionRecord,
  input: AppendRoutingDecisionInput,
) {
  return (
    decision.registryFreshnessPolicyRef === input.registryFreshnessPolicyRef &&
    decision.registryFreshnessPolicyVersion ===
      input.registryFreshnessPolicyVersion &&
    decision.registryFreshnessMaxAgeMs === input.registryFreshnessMaxAgeMs &&
    decision.registryObservedAt === input.registryObservedAt &&
    decision.registryFreshUntil === input.registryFreshUntil &&
    decision.registrySnapshotRef === input.registrySnapshotRef &&
    decision.registrySnapshotRevision === input.registrySnapshotRevision &&
    decision.registrySnapshotHash === input.registrySnapshotHash
  );
}

function mapDecision(row: Row): RoutingDecisionRecord {
  const result: RoutingDecisionRecord = {
    routingDecisionId: String(row.routing_decision_id),
    routingDecisionStreamId: String(row.routing_decision_stream_id),
    requestId: String(row.request_id),
    routingPurpose:
      row.routing_purpose as RoutingDecisionRecord["routingPurpose"],
    routingVersion: Number(row.routing_version),
    supersedesRoutingDecisionId: nullable(row.supersedes_routing_decision_id),
    classificationVersionId: String(row.classification_version_id),
    classificationVersion: Number(row.classification_version),
    classificationState:
      row.classification_state as RoutingDecisionRecord["classificationState"],
    classificationCurrentnessState:
      row.classification_currentness_state as RoutingDecisionRecord["classificationCurrentnessState"],
    classificationCurrentnessProof: String(
      row.classification_currentness_proof,
    ),
    classificationPolicyResolutionRef: String(
      row.classification_policy_resolution_ref,
    ),
    classificationPolicyResolutionVersion: String(
      row.classification_policy_resolution_version,
    ),
    canonicalDomain:
      row.canonical_domain as RoutingDecisionRecord["canonicalDomain"],
    roleClass: row.role_class as RoutingDecisionRecord["roleClass"],
    routingMode: row.routing_mode as RoutingDecisionRecord["routingMode"],
    specializationVersionId: nullable(row.specialization_version_id),
    routingPolicyVersionId: String(row.routing_policy_version_id),
    selectedProviderRef: nullable(row.provider_id),
    selectedModelRef: nullable(row.model_id),
    selectedRuntimeAdapterRef: nullable(row.runtime_adapter_id),
    selectedModelHostBindingRef: nullable(row.model_host_binding_id),
    registrySnapshotRef: String(row.registry_snapshot_ref),
    registrySnapshotRevision: String(row.registry_snapshot_revision),
    registryFreshnessPolicyRef: nullable(row.registry_freshness_policy_id),
    registryFreshnessPolicyVersion: nullable(
      row.registry_freshness_policy_version,
    ),
    registryFreshnessMaxAgeMs: nullableNumber(row.registry_max_age_ms),
    registrySnapshotHash: snapshotHash(
      String(row.registry_snapshot_ref),
      row.registry_freshness_policy_id != null,
    ),
    registryObservedAt: iso(row.registry_observed_at),
    registryFreshUntil: iso(row.registry_fresh_until),
    requiredCapabilities: strings(row.required_capability_refs),
    preferredCapabilities: strings(row.preferred_capability_refs),
    policyConstraints: object(row.policy_constraints),
    contextRefs: strings(row.context_refs),
    artifactRefs: strings(row.artifact_refs),
    evidenceRefs: strings(row.evidence_refs),
    priority: row.priority as RoutingDecisionRecord["priority"],
    humanApprovalState:
      row.human_approval_state as RoutingDecisionRecord["humanApprovalState"],
    humanApprovalRef: nullable(row.human_approval_ref),
    humanApprovalTargetVersion: nullable(row.human_approval_target_version),
    humanApprovalTargetHash: nullable(row.human_approval_target_hash),
    humanApprovalAuthority: nullable(row.human_approval_authority),
    humanApprovalCheckedAt: nullableIso(row.human_approval_checked_at),
    humanApprovalExpiresAt: nullableIso(row.human_approval_expires_at),
    developmentDelegationState:
      row.development_delegation_state as RoutingDecisionRecord["developmentDelegationState"],
    aidosProjectRef: nullable(row.aidos_project_ref),
    aidosRequiredCapabilities:
      row.aidos_required_capability_refs == null
        ? null
        : strings(row.aidos_required_capability_refs),
    aidosAuthorityRevision: nullable(row.aidos_authority_revision),
    aidosCheckedAt: nullableIso(row.aidos_checked_at),
    aidosFreshUntil: nullableIso(row.aidos_fresh_until),
    decisionState: row.decision_state as RoutingDecisionRecord["decisionState"],
    decisionReasonCodes: strings(row.decision_reason_codes),
    stalenessState:
      row.staleness_state as RoutingDecisionRecord["stalenessState"],
    classificationCheckedAt: iso(row.classification_checked_at),
    policyCheckedAt: iso(row.policy_checked_at),
    policyFreshUntil: iso(row.policy_fresh_until),
    idempotencyKey: String(row.idempotency_key),
    canonicalIntentFingerprint: String(row.canonical_intent_fingerprint),
    correlationId: String(row.correlation_id),
    causationRefs: strings(row.causation_refs),
    auditRef: String(row.audit_ref),
    createdAt: iso(row.created_at),
  };
  assertRoutingEnums(result);
  return result;
}

function mapCandidate(row: Row): RoutingCandidateSnapshot {
  return {
    candidateSnapshotId: String(row.candidate_snapshot_id),
    routingDecisionId: String(row.routing_decision_id),
    deterministicRank: Number(row.deterministic_rank),
    providerId: String(row.provider_id),
    modelId: String(row.model_id),
    runtimeAdapterId: String(row.runtime_adapter_id),
    modelHostBindingId: String(row.model_host_binding_id),
    eligibilityState:
      row.eligibility_state as RoutingCandidateSnapshot["eligibilityState"],
    reasonCodes: strings(row.reason_codes),
    capabilityEvidence: object(row.capability_evidence),
    rankingEvidence: object(row.ranking_evidence),
    registrySnapshotRef: String(row.registry_snapshot_ref),
    registrySnapshotRevision: String(row.registry_snapshot_revision),
    registryFreshnessPolicyRef: nullable(row.registry_freshness_policy_id),
    registryFreshnessPolicyVersion: nullable(
      row.registry_freshness_policy_version,
    ),
    registryFreshnessMaxAgeMs: nullableNumber(row.registry_max_age_ms),
    registrySnapshotHash: snapshotHash(
      String(row.registry_snapshot_ref),
      row.registry_freshness_policy_id != null,
    ),
    observedAt: iso(row.observed_at),
    freshUntil: iso(row.fresh_until),
    createdAt: iso(row.created_at),
  };
}

export class PostgresRoutingDecisionRepository implements RoutingDecisionRepository {
  constructor(private readonly database: MigrationDatabase) {}

  async findOrCreateStreamIdentity(input: {
    requestId: string;
    purpose: RoutingPurpose;
    streamId: string;
    actorType: "HUMAN" | "AGENT" | "SYSTEM";
    actorId: string;
  }): Promise<string> {
    const request = await this.database.query<Row>(
      "SELECT id FROM work.requests WHERE id=$1 AND lifecycle_state='REGISTERED'",
      [input.requestId],
    );
    if (!request.rows[0])
      throw new RoutingContractError("ROUTING_REQUEST_NOT_FOUND");
    const existing = await this.database.query<Row>(
      "SELECT routing_decision_stream_id::text FROM governance.request_routing_decision_streams WHERE request_id=$1 AND routing_purpose=$2",
      [input.requestId, input.purpose],
    );
    if (existing.rows[0]) {
      const id = String(existing.rows[0].routing_decision_stream_id);
      if (id !== input.streamId)
        throw new RoutingContractError("ROUTING_STREAM_CONFLICT");
      return id;
    }
    await this.database.query(
      "INSERT INTO governance.request_routing_decision_streams(routing_decision_stream_id,request_id,routing_purpose,created_by_actor_type,created_by_actor_id) VALUES($1,$2,$3,$4,$5)",
      [
        input.streamId,
        input.requestId,
        input.purpose,
        input.actorType,
        input.actorId,
      ],
    );
    return input.streamId;
  }

  async findCurrent(requestId: string, purpose: RoutingPurpose) {
    const result = await this.database.query<Row>(
      `${decisionSelect} WHERE request_id=$1 AND routing_purpose=$2 ORDER BY routing_version DESC LIMIT 1`,
      [requestId, purpose],
    );
    return result.rows[0] ? mapDecision(result.rows[0]) : undefined;
  }
  async findById(requestId: string, decisionId: string) {
    const result = await this.database.query<Row>(
      `${decisionSelect} WHERE request_id=$1 AND routing_decision_id=$2`,
      [requestId, decisionId],
    );
    return result.rows[0] ? mapDecision(result.rows[0]) : undefined;
  }
  async listHistory(requestId: string, purpose: RoutingPurpose) {
    const result = await this.database.query<Row>(
      `${decisionSelect} WHERE request_id=$1 AND routing_purpose=$2 ORDER BY routing_version`,
      [requestId, purpose],
    );
    return result.rows.map(mapDecision);
  }
  async listCandidates(decisionId: string) {
    const result = await this.database.query<Row>(
      `${candidateSelect} WHERE routing_decision_id=$1 ORDER BY deterministic_rank`,
      [decisionId],
    );
    return result.rows.map(mapCandidate);
  }

  async findHumanOverrideAudit(auditRef: string) {
    const result = await this.database.query<{
      actor_id: string;
      action: string;
      metadata: unknown;
    }>("SELECT actor_id,action,metadata FROM audit.audit_records WHERE id=$1", [
      auditRef,
    ]);
    const row = result.rows[0];
    if (!row || row.action !== "ROUTING.OVERRIDE_CREATED") return undefined;
    const metadata = row.metadata as
      AppendRoutingDecisionInput["auditMetadata"] | undefined;
    if (!metadata?.authority) return undefined;
    return { actorId: row.actor_id, metadata };
  }

  async recordRoutingAudit(input: RoutingDecisionAuditInput) {
    await new PostgresAuditRecordRepository(this.database).record({
      action: input.action,
      actorId: input.actorId,
      actorType: input.actorType,
      targetType: "ROUTING_DECISION",
      targetId: input.targetDecisionId,
      result: input.result,
      requestId: input.requestId,
      projectId: input.projectId,
      correlationId: input.correlationId,
      traceId: input.traceId,
      spanId: input.spanId,
      evidenceRefs: input.evidenceRefs,
      metadata: input.metadata,
      idempotencyKey: input.idempotencyKey,
      deterministicIdentitySeed: `${input.action}:${input.requestId}:${input.idempotencyKey}`,
    });
  }

  async appendDecision(
    input: AppendRoutingDecisionInput,
  ): Promise<RoutingAppendResult> {
    requireRegistryFreshnessLineage(input);
    if (
      input.routingPurpose !== "PRIMARY_EXECUTION" &&
      input.routingMode === "FALLBACK"
    )
      throw new RoutingContractError("FALLBACK_NOT_AUTHORIZED");
    await this.database.exec("BEGIN");
    try {
      await this.database.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`${input.requestId}:${input.routingPurpose}`],
      );
      const request = await this.database.query<Row>(
        "SELECT id FROM work.requests WHERE id=$1 AND lifecycle_state='REGISTERED'",
        [input.requestId],
      );
      if (!request.rows[0])
        throw new RoutingContractError("ROUTING_REQUEST_NOT_FOUND");
      const replay = await this.database.query<Row>(
        `${decisionSelect} WHERE request_id=$1 AND idempotency_key=$2`,
        [input.requestId, input.idempotencyKey],
      );
      if (replay.rows[0]) {
        const decision = mapDecision(replay.rows[0]);
        if (
          decision.routingDecisionId !== input.routingDecisionId ||
          decision.canonicalIntentFingerprint !==
            input.canonicalIntentFingerprint ||
          decision.routingPurpose !== input.routingPurpose ||
          decision.canonicalDomain !== input.canonicalDomain ||
          decision.routingMode !== input.routingMode ||
          !sameRegistryFreshnessLineage(decision, input)
        )
          throw new RoutingContractError("ROUTING_IDEMPOTENCY_CONFLICT");
        const candidates = await this.listCandidates(
          decision.routingDecisionId,
        );
        await this.database.exec("COMMIT");
        return {
          outcome: "REUSED",
          decision,
          candidates,
          auditRef: decision.auditRef,
        };
      }
      if (input.expectedPredecessorId) {
        const predecessor = await this.database.query<Row>(
          `${decisionSelect} WHERE routing_decision_id=$1`,
          [input.expectedPredecessorId],
        );
        if (predecessor.rows[0]) {
          const prior = mapDecision(predecessor.rows[0]);
          if (
            prior.requestId !== input.requestId ||
            prior.routingPurpose !== input.routingPurpose
          )
            throw new RoutingContractError(
              "ROUTING_CROSS_STREAM_SUPERSESSION_DENIED",
            );
        }
      }
      await this.findOrCreateStreamIdentity({
        requestId: input.requestId,
        purpose: input.routingPurpose,
        streamId: input.routingDecisionStreamId,
        actorType: input.actorType,
        actorId: input.actorId,
      });
      const head = await this.findCurrent(
        input.requestId,
        input.routingPurpose,
      );
      if ((head?.routingDecisionId ?? null) !== input.expectedPredecessorId)
        throw new RoutingContractError("ROUTING_STREAM_CONFLICT");
      const version = (head?.routingVersion ?? 0) + 1;
      const auditAction = input.auditAction ?? "ROUTING.DECISION_CREATED";
      const auditRef = deterministicAuditUuid(
        `${auditAction}:${input.requestId}:${input.idempotencyKey}`,
      );
      await new PostgresAuditRecordRepository(
        this.database,
      ).recordInTransaction({
        action: auditAction,
        actorId: input.actorId,
        actorType: input.actorType,
        targetType: "ROUTING_DECISION",
        targetId: input.routingDecisionId,
        result: "SUCCEEDED",
        requestId: input.requestId,
        projectId: input.projectId,
        correlationId: input.correlationId,
        traceId: input.traceId,
        spanId: input.spanId,
        evidenceRefs: input.evidenceRefs,
        metadata: {
          purpose: input.routingPurpose,
          version,
          state: input.decisionState,
          ...(input.auditMetadata ?? {}),
          registryFreshnessAuthority:
            input.registryFreshnessPolicyRef == null
              ? null
              : {
                  policyRef: input.registryFreshnessPolicyRef,
                  policyVersion: input.registryFreshnessPolicyVersion,
                  maxAgeMs: input.registryFreshnessMaxAgeMs,
                  registryObservedAt: input.registryObservedAt,
                  freshUntil: input.registryFreshUntil,
                  snapshotRef: input.registrySnapshotRef,
                  snapshotRevision: input.registrySnapshotRevision,
                  snapshotHash: input.registrySnapshotHash,
                },
        },
        idempotencyKey: input.idempotencyKey,
        deterministicIdentitySeed: `${auditAction}:${input.requestId}:${input.idempotencyKey}`,
      });
      await this.database.query(
        `INSERT INTO governance.request_routing_decision_versions(
          routing_decision_id,routing_decision_stream_id,request_id,routing_purpose,routing_version,supersedes_routing_decision_id,classification_version_id,classification_version,classification_state,classification_currentness_state,classification_currentness_proof,classification_policy_resolution_ref,classification_policy_resolution_version,canonical_domain,role_class,routing_mode,specialization_version_id,routing_policy_version_id,provider_id,model_id,runtime_adapter_id,model_host_binding_id,registry_snapshot_ref,registry_snapshot_revision,registry_freshness_policy_id,registry_freshness_policy_version,registry_max_age_ms,registry_observed_at,registry_fresh_until,required_capability_refs,preferred_capability_refs,policy_constraints,context_refs,artifact_refs,evidence_refs,priority,human_approval_state,human_approval_ref,human_approval_target_version,human_approval_target_hash,human_approval_authority,human_approval_checked_at,human_approval_expires_at,development_delegation_state,aidos_project_ref,aidos_required_capability_refs,aidos_authority_revision,aidos_checked_at,aidos_fresh_until,decision_state,decision_reason_codes,staleness_state,classification_checked_at,policy_checked_at,policy_fresh_until,idempotency_key,canonical_intent_fingerprint,correlation_id,causation_refs,audit_ref)
         VALUES(${Array.from({ length: 60 }, (_, i) => `$${i + 1}`).join(",")})`,
        [
          input.routingDecisionId,
          input.routingDecisionStreamId,
          input.requestId,
          input.routingPurpose,
          version,
          input.expectedPredecessorId,
          input.classificationVersionId,
          input.classificationVersion,
          input.classificationState,
          input.classificationCurrentnessState,
          input.classificationCurrentnessProof,
          input.classificationPolicyResolutionRef,
          input.classificationPolicyResolutionVersion,
          input.canonicalDomain,
          input.roleClass,
          input.routingMode,
          input.specializationVersionId,
          input.routingPolicyVersionId,
          input.selectedProviderRef,
          input.selectedModelRef,
          input.selectedRuntimeAdapterRef,
          input.selectedModelHostBindingRef,
          input.registrySnapshotRef,
          input.registrySnapshotRevision,
          input.registryFreshnessPolicyRef,
          input.registryFreshnessPolicyVersion,
          input.registryFreshnessMaxAgeMs,
          input.registryObservedAt,
          input.registryFreshUntil,
          input.requiredCapabilities,
          input.preferredCapabilities,
          input.policyConstraints,
          input.contextRefs,
          input.artifactRefs,
          input.evidenceRefs,
          input.priority,
          input.humanApprovalState,
          input.humanApprovalRef,
          input.humanApprovalTargetVersion,
          input.humanApprovalTargetHash,
          input.humanApprovalAuthority,
          input.humanApprovalCheckedAt,
          input.humanApprovalExpiresAt,
          input.developmentDelegationState,
          input.aidosProjectRef,
          input.aidosRequiredCapabilities,
          input.aidosAuthorityRevision,
          input.aidosCheckedAt,
          input.aidosFreshUntil,
          input.decisionState,
          input.decisionReasonCodes,
          input.stalenessState,
          input.classificationCheckedAt,
          input.policyCheckedAt,
          input.policyFreshUntil,
          input.idempotencyKey,
          input.canonicalIntentFingerprint,
          input.correlationId,
          input.causationRefs,
          auditRef,
        ],
      );
      for (const candidate of [...input.candidates].sort(
        (a, b) => a.deterministicRank - b.deterministicRank,
      )) {
        await this.database.query(
          `INSERT INTO governance.request_routing_candidate_snapshots(candidate_snapshot_id,routing_decision_id,deterministic_rank,provider_id,model_id,runtime_adapter_id,model_host_binding_id,eligibility_state,reason_codes,capability_evidence,ranking_evidence,registry_snapshot_ref,registry_snapshot_revision,registry_freshness_policy_id,registry_freshness_policy_version,registry_max_age_ms,observed_at,fresh_until) VALUES(${Array.from({ length: 18 }, (_, i) => `$${i + 1}`).join(",")})`,
          [
            candidate.candidateSnapshotId,
            input.routingDecisionId,
            candidate.deterministicRank,
            candidate.providerId,
            candidate.modelId,
            candidate.runtimeAdapterId,
            candidate.modelHostBindingId,
            candidate.eligibilityState,
            candidate.reasonCodes,
            candidate.capabilityEvidence,
            candidate.rankingEvidence,
            candidate.registrySnapshotRef,
            candidate.registrySnapshotRevision,
            candidate.registryFreshnessPolicyRef,
            candidate.registryFreshnessPolicyVersion,
            candidate.registryFreshnessMaxAgeMs,
            candidate.observedAt,
            candidate.freshUntil,
          ],
        );
      }
      const saved = await this.findById(
        input.requestId,
        input.routingDecisionId,
      );
      if (!saved) throw new RoutingContractError("ROUTING_STREAM_CONFLICT");
      const candidates = await this.listCandidates(input.routingDecisionId);
      await this.database.exec("COMMIT");
      return { outcome: "CREATED", decision: saved, candidates, auditRef };
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
