import { createHash } from "node:crypto";

import {
  canonicalAuditValue,
  deterministicAuditUuid,
  PostgresAuditRecordRepository,
  type AuditRecordInput,
} from "./audit-record-repository.js";
import type {
  CanonicalDomain,
  RoutingPurpose,
  RoutingRoleClass,
} from "./routing-contracts.js";
import { RoutingContractError } from "./routing-contracts.js";
import type { MigrationDatabase } from "./types.js";

export const ROUTING_POLICY_AUTHORITY =
  "MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD" as const;

export type RoutingPolicyLifecycle =
  "DRAFT" | "ACTIVE" | "SUPERSEDED" | "RETIRED";
export type RoutingEnvironment =
  "DEVELOPMENT" | "PREVIEW" | "STAGING" | "PRODUCTION";
export type RoutingPolicyActorType = "HUMAN" | "AGENT" | "SYSTEM";
export type RoutingPolicyActivationEventType =
  "ACTIVATE" | "SUPERSEDE" | "RETIRE";

export interface RoutingPolicyContext {
  readonly canonicalDomain: CanonicalDomain;
  readonly routingPurpose: RoutingPurpose;
  readonly roleClass: RoutingRoleClass;
  readonly organizationId: string | null;
  readonly projectId: string | null;
  readonly scopeRef: string;
  readonly environment: RoutingEnvironment;
}

export interface RoutingPolicyActivationSnapshot {
  readonly routingPolicyActivationEventId: string;
  readonly routingPolicyId: string;
  readonly routingPolicyVersionId: string;
  readonly applicabilityFingerprint: string;
  readonly selectionSequence: number;
  readonly eventType: RoutingPolicyActivationEventType;
  readonly supersedesActivationEventId: string | null;
  readonly actorType: RoutingPolicyActorType;
  readonly actorId: string;
  readonly reasonCode: string;
  readonly evidenceRefs: readonly string[];
  readonly auditRef: string;
  readonly createdAt: string;
}

export interface RoutingPolicySnapshot extends RoutingPolicyContext {
  readonly routingPolicyVersionId: string;
  readonly routingPolicyId: string;
  readonly version: number;
  readonly supersedesPolicyVersionId: string | null;
  readonly authorityIdentifier: typeof ROUTING_POLICY_AUTHORITY;
  readonly lifecycleIntent: RoutingPolicyLifecycle;
  readonly requiredCapabilityRefs: readonly string[];
  readonly preferredCapabilityRefs: readonly string[];
  readonly policyConstraints: Readonly<Record<string, unknown>>;
  readonly effectiveAt: string;
  readonly expiresAt: string | null;
  readonly contentFingerprint: string;
  readonly createdByActorType: RoutingPolicyActorType;
  readonly createdByActorId: string;
  readonly auditRef: string;
  readonly createdAt: string;
  readonly activation?: RoutingPolicyActivationSnapshot;
}

export interface SpecializationSnapshot {
  readonly specializationVersionId: string;
  readonly specializationId: string;
  readonly version: number;
  readonly supersedesSpecializationVersionId: string | null;
  readonly routingPolicyVersionId: string;
  readonly lifecycle: RoutingPolicyLifecycle;
  readonly specializationKey: string;
  readonly canonicalDomain: CanonicalDomain;
  readonly routingPurpose: RoutingPurpose;
  readonly scopeRef: string;
  readonly environment: RoutingEnvironment;
  readonly requiredCapabilityRefs: readonly string[];
  readonly preferredCapabilityRefs: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly contentFingerprint: string;
  readonly auditRef: string;
  readonly createdAt: string;
}

interface GovernedAppendInput {
  readonly authorityIdentifier: typeof ROUTING_POLICY_AUTHORITY;
  readonly actorType: RoutingPolicyActorType;
  readonly actorId: string;
  readonly evidenceRefs: readonly string[];
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId: string;
}

export interface AppendRoutingPolicyVersionInput
  extends RoutingPolicyContext, GovernedAppendInput {
  readonly routingPolicyVersionId: string;
  readonly routingPolicyId: string;
  readonly expectedPredecessorId: string | null;
  readonly lifecycleIntent: RoutingPolicyLifecycle;
  readonly requiredCapabilityRefs: readonly string[];
  readonly preferredCapabilityRefs: readonly string[];
  readonly policyConstraints: Readonly<Record<string, unknown>>;
  readonly effectiveAt: string;
  readonly expiresAt: string | null;
  readonly contentFingerprint: string;
}

export interface AppendSpecializationVersionInput extends GovernedAppendInput {
  readonly specializationVersionId: string;
  readonly specializationId: string;
  readonly expectedPredecessorId: string | null;
  readonly routingPolicyVersionId: string;
  readonly lifecycle: RoutingPolicyLifecycle;
  readonly specializationKey: string;
  readonly canonicalDomain: CanonicalDomain;
  readonly routingPurpose: RoutingPurpose;
  readonly scopeRef: string;
  readonly environment: RoutingEnvironment;
  readonly requiredCapabilityRefs: readonly string[];
  readonly preferredCapabilityRefs: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly contentFingerprint: string;
}

export interface ActivateRoutingPolicyVersionInput extends GovernedAppendInput {
  readonly routingPolicyActivationEventId: string;
  readonly routingPolicyVersionId: string;
  readonly expectedActivationEventId: string | null;
  readonly reasonCode: string;
}

export interface RoutingPolicyAppendResult {
  readonly outcome: "CREATED" | "REUSED";
  readonly policy: RoutingPolicySnapshot;
  readonly auditRef: string;
}
export interface SpecializationAppendResult {
  readonly outcome: "CREATED" | "REUSED";
  readonly specialization: SpecializationSnapshot;
  readonly auditRef: string;
}
export interface RoutingPolicyActivationResult {
  readonly outcome: "CREATED" | "REUSED";
  readonly activation: RoutingPolicyActivationSnapshot;
  readonly auditRef: string;
}

export interface RoutingPolicyRepository {
  appendPolicyVersion(
    input: AppendRoutingPolicyVersionInput,
  ): Promise<RoutingPolicyAppendResult>;
  appendSpecializationVersion(
    input: AppendSpecializationVersionInput,
  ): Promise<SpecializationAppendResult>;
  activatePolicyVersion(
    input: ActivateRoutingPolicyVersionInput,
  ): Promise<RoutingPolicyActivationResult>;
  findPolicyVersion(id: string): Promise<RoutingPolicySnapshot | undefined>;
  findSpecializationVersion(
    id: string,
  ): Promise<SpecializationSnapshot | undefined>;
  findCurrentSpecializationVersion(
    specializationId: string,
  ): Promise<SpecializationSnapshot | undefined>;
  listCurrentSelections(
    context: RoutingPolicyContext,
  ): Promise<readonly RoutingPolicySnapshot[]>;
}

type Row = Record<string, unknown>;
const text = (value: unknown) => (value == null ? null : String(value));
const array = (value: unknown): readonly string[] =>
  Object.freeze(Array.isArray(value) ? value.map(String) : []);
const timestamp = (value: unknown) =>
  new Date(value as string | Date).toISOString();

const policySelect = `SELECT
  routing_policy_version_id::text,routing_policy_id::text,version,
  supersedes_policy_version_id::text,authority_identifier,lifecycle_intent,
  canonical_domain,routing_purpose,role_class,organization_id::text,
  project_id::text,scope_ref,environment,required_capability_refs,
  preferred_capability_refs,policy_constraints,effective_at,expires_at,
  content_fingerprint,created_by_actor_type,created_by_actor_id::text,
  audit_ref::text,created_at
  FROM governance.ai_routing_policy_versions`;

function mapPolicy(row: Row): RoutingPolicySnapshot {
  return Object.freeze({
    routingPolicyVersionId: String(row.routing_policy_version_id),
    routingPolicyId: String(row.routing_policy_id),
    version: Number(row.version),
    supersedesPolicyVersionId: text(row.supersedes_policy_version_id),
    authorityIdentifier:
      row.authority_identifier as typeof ROUTING_POLICY_AUTHORITY,
    lifecycleIntent:
      row.lifecycle_intent as RoutingPolicySnapshot["lifecycleIntent"],
    canonicalDomain:
      row.canonical_domain as RoutingPolicySnapshot["canonicalDomain"],
    routingPurpose:
      row.routing_purpose as RoutingPolicySnapshot["routingPurpose"],
    roleClass: row.role_class as RoutingPolicySnapshot["roleClass"],
    organizationId: text(row.organization_id),
    projectId: text(row.project_id),
    scopeRef: String(row.scope_ref),
    environment: row.environment as RoutingPolicySnapshot["environment"],
    requiredCapabilityRefs: array(row.required_capability_refs),
    preferredCapabilityRefs: array(row.preferred_capability_refs),
    policyConstraints: Object.freeze({
      ...((row.policy_constraints ?? {}) as Record<string, unknown>),
    }),
    effectiveAt: timestamp(row.effective_at),
    expiresAt: row.expires_at ? timestamp(row.expires_at) : null,
    contentFingerprint: String(row.content_fingerprint),
    createdByActorType:
      row.created_by_actor_type as RoutingPolicySnapshot["createdByActorType"],
    createdByActorId: String(row.created_by_actor_id),
    auditRef: String(row.audit_ref),
    createdAt: timestamp(row.created_at),
  });
}

function mapActivation(row: Row): RoutingPolicyActivationSnapshot {
  return Object.freeze({
    routingPolicyActivationEventId: String(
      row.routing_policy_activation_event_id,
    ),
    routingPolicyId: String(row.routing_policy_id),
    routingPolicyVersionId: String(row.routing_policy_version_id),
    applicabilityFingerprint: String(row.applicability_fingerprint),
    selectionSequence: Number(row.selection_sequence),
    eventType: row.event_type as RoutingPolicyActivationEventType,
    supersedesActivationEventId: text(row.supersedes_activation_event_id),
    actorType: row.actor_type as RoutingPolicyActorType,
    actorId: String(row.actor_id),
    reasonCode: String(row.reason_code),
    evidenceRefs: array(row.evidence_refs),
    auditRef: String(row.audit_ref),
    createdAt: timestamp(row.created_at),
  });
}

function mapSpecialization(row: Row): SpecializationSnapshot {
  return Object.freeze({
    specializationVersionId: String(row.specialization_version_id),
    specializationId: String(row.specialization_id),
    version: Number(row.version),
    supersedesSpecializationVersionId: text(
      row.supersedes_specialization_version_id,
    ),
    routingPolicyVersionId: String(row.routing_policy_version_id),
    lifecycle: row.lifecycle as RoutingPolicyLifecycle,
    specializationKey: String(row.specialization_key),
    canonicalDomain: row.canonical_domain as CanonicalDomain,
    routingPurpose: row.routing_purpose as RoutingPurpose,
    scopeRef: String(row.scope_ref),
    environment: row.environment as RoutingEnvironment,
    requiredCapabilityRefs: array(row.required_capability_refs),
    preferredCapabilityRefs: array(row.preferred_capability_refs),
    metadata: Object.freeze({
      ...((row.metadata ?? {}) as Record<string, unknown>),
    }),
    contentFingerprint: String(row.content_fingerprint),
    auditRef: String(row.audit_ref),
    createdAt: timestamp(row.created_at),
  });
}

export function routingPolicyApplicabilityFingerprint(
  policy: RoutingPolicySnapshot | AppendRoutingPolicyVersionInput,
): string {
  return `sha256:${createHash("sha256")
    .update(
      canonicalAuditValue({
        canonicalDomain: policy.canonicalDomain,
        routingPurpose: policy.routingPurpose,
        roleClass: policy.roleClass,
        organizationId: policy.organizationId,
        projectId: policy.projectId,
        scopeRef: policy.scopeRef,
        environment: policy.environment,
        effectiveAt: policy.effectiveAt,
        expiresAt: policy.expiresAt,
      }),
    )
    .digest("hex")}`;
}

function exactPolicyReplay(
  policy: RoutingPolicySnapshot,
  input: AppendRoutingPolicyVersionInput,
) {
  return (
    policy.routingPolicyVersionId === input.routingPolicyVersionId &&
    policy.routingPolicyId === input.routingPolicyId &&
    policy.supersedesPolicyVersionId === input.expectedPredecessorId &&
    policy.authorityIdentifier === input.authorityIdentifier &&
    policy.lifecycleIntent === input.lifecycleIntent &&
    policy.canonicalDomain === input.canonicalDomain &&
    policy.routingPurpose === input.routingPurpose &&
    policy.roleClass === input.roleClass &&
    policy.organizationId === input.organizationId &&
    policy.projectId === input.projectId &&
    policy.scopeRef === input.scopeRef &&
    policy.environment === input.environment &&
    policy.effectiveAt === new Date(input.effectiveAt).toISOString() &&
    policy.expiresAt ===
      (input.expiresAt ? new Date(input.expiresAt).toISOString() : null) &&
    policy.contentFingerprint === input.contentFingerprint &&
    policy.createdByActorType === input.actorType &&
    policy.createdByActorId === input.actorId &&
    canonicalAuditValue(policy.requiredCapabilityRefs) ===
      canonicalAuditValue(input.requiredCapabilityRefs) &&
    canonicalAuditValue(policy.preferredCapabilityRefs) ===
      canonicalAuditValue(input.preferredCapabilityRefs) &&
    canonicalAuditValue(policy.policyConstraints) ===
      canonicalAuditValue(input.policyConstraints)
  );
}

function policyAuditInput(
  input: AppendRoutingPolicyVersionInput,
  version: number,
): AuditRecordInput {
  return {
    action: "ROUTING.POLICY_VERSION_CREATED",
    actorId: input.actorId,
    actorType: input.actorType,
    targetType: "ROUTING_POLICY_VERSION",
    targetId: input.routingPolicyVersionId,
    result: "SUCCEEDED",
    requestId: `routing-policy:${input.routingPolicyId}`,
    correlationId: input.correlationId,
    traceId: input.traceId,
    spanId: input.spanId,
    evidenceRefs: input.evidenceRefs,
    metadata: {
      authority: input.authorityIdentifier,
      routing_policy_id: input.routingPolicyId,
      version,
      predecessor: input.expectedPredecessorId,
    },
    idempotencyKey: input.idempotencyKey,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    deterministicIdentitySeed: `ROUTING.POLICY_VERSION_CREATED:${input.routingPolicyId}:${input.idempotencyKey}`,
  };
}

function specializationAuditInput(
  input: AppendSpecializationVersionInput,
  version: number,
): AuditRecordInput {
  return {
    action: "ROUTING.SPECIALIZATION_VERSION_CREATED",
    actorId: input.actorId,
    actorType: input.actorType,
    targetType: "ROUTING_SPECIALIZATION_VERSION",
    targetId: input.specializationVersionId,
    result: "SUCCEEDED",
    requestId: `routing-specialization:${input.specializationId}`,
    correlationId: input.correlationId,
    traceId: input.traceId,
    spanId: input.spanId,
    evidenceRefs: input.evidenceRefs,
    metadata: {
      authority: input.authorityIdentifier,
      routing_policy_version_id: input.routingPolicyVersionId,
      specialization_key: input.specializationKey,
      version,
    },
    idempotencyKey: input.idempotencyKey,
    deterministicIdentitySeed: `ROUTING.SPECIALIZATION_VERSION_CREATED:${input.specializationId}:${input.idempotencyKey}`,
  };
}

function activationAuditInput(
  input: ActivateRoutingPolicyVersionInput,
  policy: RoutingPolicySnapshot,
  applicabilityFingerprint: string,
  selectionSequence: number,
  priorActivationEventId: string | null,
): AuditRecordInput {
  return {
    action: "ROUTING.POLICY_ACTIVATED",
    actorId: input.actorId,
    actorType: input.actorType,
    targetType: "ROUTING_POLICY_VERSION",
    targetId: policy.routingPolicyVersionId,
    result: "SUCCEEDED",
    requestId: `routing-policy:${policy.routingPolicyId}`,
    correlationId: input.correlationId,
    traceId: input.traceId,
    spanId: input.spanId,
    evidenceRefs: input.evidenceRefs,
    metadata: {
      authority: input.authorityIdentifier,
      applicability_fingerprint: applicabilityFingerprint,
      prior_activation_event_id: priorActivationEventId,
      selection_sequence: selectionSequence,
    },
    idempotencyKey: input.idempotencyKey,
    ...(policy.projectId ? { projectId: policy.projectId } : {}),
    deterministicIdentitySeed: `ROUTING.POLICY_ACTIVATED:${applicabilityFingerprint}:${input.idempotencyKey}`,
  };
}

async function requireExactAuditReplay(
  database: MigrationDatabase,
  input: AuditRecordInput,
) {
  try {
    await new PostgresAuditRecordRepository(database).recordInTransaction(
      input,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "AUDIT_RECORD_REPLAY_CONFLICT"
    )
      throw new RoutingContractError("ROUTING_IDEMPOTENCY_CONFLICT");
    throw error;
  }
}

export class PostgresPhase15dRoutingPolicyRepository implements RoutingPolicyRepository {
  constructor(private readonly database: MigrationDatabase) {}

  async findPolicyVersion(id: string) {
    const result = await this.database.query<Row>(
      `${policySelect} WHERE routing_policy_version_id=$1`,
      [id],
    );
    return result.rows[0] ? mapPolicy(result.rows[0]) : undefined;
  }

  async findSpecializationVersion(id: string) {
    const result = await this.database.query<Row>(
      `SELECT specialization_version_id::text,specialization_id::text,version,
       supersedes_specialization_version_id::text,routing_policy_version_id::text,
       lifecycle,specialization_key,canonical_domain,routing_purpose,scope_ref,
       environment,required_capability_refs,preferred_capability_refs,metadata,
       content_fingerprint,audit_ref::text,created_at
       FROM governance.ai_routing_specialization_versions
       WHERE specialization_version_id=$1`,
      [id],
    );
    return result.rows[0] ? mapSpecialization(result.rows[0]) : undefined;
  }

  async findCurrentSpecializationVersion(specializationId: string) {
    const result = await this.database.query<Row>(
      `SELECT specialization_version_id::text,specialization_id::text,version,
       supersedes_specialization_version_id::text,routing_policy_version_id::text,
       lifecycle,specialization_key,canonical_domain,routing_purpose,scope_ref,
       environment,required_capability_refs,preferred_capability_refs,metadata,
       content_fingerprint,audit_ref::text,created_at
       FROM governance.ai_routing_specialization_versions
       WHERE specialization_id=$1
       ORDER BY version DESC LIMIT 1`,
      [specializationId],
    );
    return result.rows[0] ? mapSpecialization(result.rows[0]) : undefined;
  }

  async listCurrentSelections(context: RoutingPolicyContext) {
    const result = await this.database.query<Row>(
      `WITH latest AS (
         SELECT DISTINCT ON (applicability_fingerprint) *
         FROM governance.ai_routing_policy_activation_events
         ORDER BY applicability_fingerprint,selection_sequence DESC,
                  routing_policy_activation_event_id DESC
       )
       SELECT p.*,
         e.routing_policy_activation_event_id::text,
         e.applicability_fingerprint,e.selection_sequence,e.event_type,
         e.supersedes_activation_event_id::text,e.actor_type,e.actor_id::text,
         e.reason_code,e.evidence_refs,e.audit_ref::text AS activation_audit_ref,
         e.created_at AS activation_created_at
       FROM latest e
       JOIN governance.ai_routing_policy_versions p
         ON p.routing_policy_id=e.routing_policy_id
        AND p.routing_policy_version_id=e.routing_policy_version_id
       WHERE e.event_type <> 'RETIRE'
         AND p.canonical_domain=$1 AND p.routing_purpose=$2 AND p.role_class=$3
         AND p.organization_id IS NOT DISTINCT FROM $4::uuid
         AND p.project_id IS NOT DISTINCT FROM $5::uuid
         AND p.scope_ref=$6 AND p.environment=$7
       ORDER BY p.routing_policy_id,p.version DESC`,
      [
        context.canonicalDomain,
        context.routingPurpose,
        context.roleClass,
        context.organizationId,
        context.projectId,
        context.scopeRef,
        context.environment,
      ],
    );
    return result.rows.map((row) =>
      Object.freeze({
        ...mapPolicy(row),
        activation: mapActivation({
          routing_policy_activation_event_id:
            row.routing_policy_activation_event_id,
          routing_policy_id: row.routing_policy_id,
          routing_policy_version_id: row.routing_policy_version_id,
          applicability_fingerprint: row.applicability_fingerprint,
          selection_sequence: row.selection_sequence,
          event_type: row.event_type,
          supersedes_activation_event_id: row.supersedes_activation_event_id,
          actor_type: row.actor_type,
          actor_id: row.actor_id,
          reason_code: row.reason_code,
          evidence_refs: row.evidence_refs,
          audit_ref: row.activation_audit_ref,
          created_at: row.activation_created_at,
        }),
      }),
    );
  }

  async appendPolicyVersion(
    input: AppendRoutingPolicyVersionInput,
  ): Promise<RoutingPolicyAppendResult> {
    if (input.authorityIdentifier !== ROUTING_POLICY_AUTHORITY)
      throw new RoutingContractError("POLICY_DENIED");
    await this.database.exec("BEGIN");
    try {
      await this.database.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [input.routingPolicyId],
      );
      const auditRef = deterministicAuditUuid(
        `ROUTING.POLICY_VERSION_CREATED:${input.routingPolicyId}:${input.idempotencyKey}`,
      );
      const replay = await this.database.query<Row>(
        `${policySelect} WHERE audit_ref=$1`,
        [auditRef],
      );
      if (replay.rows[0]) {
        const policy = mapPolicy(replay.rows[0]);
        if (!exactPolicyReplay(policy, input))
          throw new RoutingContractError("ROUTING_IDEMPOTENCY_CONFLICT");
        await requireExactAuditReplay(
          this.database,
          policyAuditInput(input, policy.version),
        );
        await this.database.exec("COMMIT");
        return { outcome: "REUSED", policy, auditRef };
      }
      const head = await this.database.query<Row>(
        `${policySelect} WHERE routing_policy_id=$1 ORDER BY version DESC LIMIT 1`,
        [input.routingPolicyId],
      );
      const predecessor = head.rows[0] ? mapPolicy(head.rows[0]) : undefined;
      if (
        (predecessor?.routingPolicyVersionId ?? null) !==
        input.expectedPredecessorId
      )
        throw new RoutingContractError("ROUTING_POLICY_CONFLICT");
      const version = (predecessor?.version ?? 0) + 1;
      await new PostgresAuditRecordRepository(
        this.database,
      ).recordInTransaction(policyAuditInput(input, version));
      await this.database.query(
        `INSERT INTO governance.ai_routing_policy_versions(
           routing_policy_version_id,routing_policy_id,version,
           supersedes_policy_version_id,authority_identifier,lifecycle_intent,
           canonical_domain,routing_purpose,role_class,organization_id,project_id,
           scope_ref,environment,required_capability_refs,preferred_capability_refs,
           policy_constraints,effective_at,expires_at,content_fingerprint,
           created_by_actor_type,created_by_actor_id,audit_ref)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,
           $17,$18,$19,$20,$21,$22)`,
        [
          input.routingPolicyVersionId,
          input.routingPolicyId,
          version,
          input.expectedPredecessorId,
          input.authorityIdentifier,
          input.lifecycleIntent,
          input.canonicalDomain,
          input.routingPurpose,
          input.roleClass,
          input.organizationId,
          input.projectId,
          input.scopeRef,
          input.environment,
          [...input.requiredCapabilityRefs],
          [...input.preferredCapabilityRefs],
          JSON.stringify(input.policyConstraints),
          input.effectiveAt,
          input.expiresAt,
          input.contentFingerprint,
          input.actorType,
          input.actorId,
          auditRef,
        ],
      );
      const policy = await this.findPolicyVersion(input.routingPolicyVersionId);
      await this.database.exec("COMMIT");
      return { outcome: "CREATED", policy: policy!, auditRef };
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async appendSpecializationVersion(
    input: AppendSpecializationVersionInput,
  ): Promise<SpecializationAppendResult> {
    if (input.authorityIdentifier !== ROUTING_POLICY_AUTHORITY)
      throw new RoutingContractError("POLICY_DENIED");
    await this.database.exec("BEGIN");
    try {
      await this.database.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [input.specializationId],
      );
      const auditRef = deterministicAuditUuid(
        `ROUTING.SPECIALIZATION_VERSION_CREATED:${input.specializationId}:${input.idempotencyKey}`,
      );
      const replay = await this.database.query<Row>(
        `SELECT specialization_version_id::text FROM governance.ai_routing_specialization_versions WHERE audit_ref=$1`,
        [auditRef],
      );
      if (replay.rows[0]) {
        const specialization = await this.findSpecializationVersion(
          String(replay.rows[0].specialization_version_id),
        );
        if (
          !specialization ||
          specialization.specializationVersionId !==
            input.specializationVersionId ||
          specialization.contentFingerprint !== input.contentFingerprint ||
          specialization.routingPolicyVersionId !==
            input.routingPolicyVersionId ||
          specialization.specializationId !== input.specializationId ||
          specialization.supersedesSpecializationVersionId !==
            input.expectedPredecessorId ||
          specialization.lifecycle !== input.lifecycle ||
          specialization.specializationKey !== input.specializationKey ||
          specialization.canonicalDomain !== input.canonicalDomain ||
          specialization.routingPurpose !== input.routingPurpose ||
          specialization.scopeRef !== input.scopeRef ||
          specialization.environment !== input.environment ||
          canonicalAuditValue(specialization.requiredCapabilityRefs) !==
            canonicalAuditValue(input.requiredCapabilityRefs) ||
          canonicalAuditValue(specialization.preferredCapabilityRefs) !==
            canonicalAuditValue(input.preferredCapabilityRefs) ||
          canonicalAuditValue(specialization.metadata) !==
            canonicalAuditValue(input.metadata)
        )
          throw new RoutingContractError("ROUTING_IDEMPOTENCY_CONFLICT");
        await requireExactAuditReplay(
          this.database,
          specializationAuditInput(input, specialization.version),
        );
        await this.database.exec("COMMIT");
        return { outcome: "REUSED", specialization, auditRef };
      }
      const head = await this.database.query<Row>(
        `SELECT specialization_version_id::text,version
         FROM governance.ai_routing_specialization_versions
         WHERE specialization_id=$1 ORDER BY version DESC LIMIT 1`,
        [input.specializationId],
      );
      if (
        (text(head.rows[0]?.specialization_version_id) ?? null) !==
        input.expectedPredecessorId
      )
        throw new RoutingContractError("SPECIALIZATION_INVALID");
      const version = Number(head.rows[0]?.version ?? 0) + 1;
      await new PostgresAuditRecordRepository(
        this.database,
      ).recordInTransaction(specializationAuditInput(input, version));
      await this.database.query(
        `INSERT INTO governance.ai_routing_specialization_versions(
           specialization_version_id,specialization_id,version,
           supersedes_specialization_version_id,routing_policy_version_id,
           lifecycle,specialization_key,canonical_domain,routing_purpose,
           scope_ref,environment,required_capability_refs,preferred_capability_refs,
           metadata,content_fingerprint,audit_ref)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16)`,
        [
          input.specializationVersionId,
          input.specializationId,
          version,
          input.expectedPredecessorId,
          input.routingPolicyVersionId,
          input.lifecycle,
          input.specializationKey,
          input.canonicalDomain,
          input.routingPurpose,
          input.scopeRef,
          input.environment,
          [...input.requiredCapabilityRefs],
          [...input.preferredCapabilityRefs],
          JSON.stringify(input.metadata),
          input.contentFingerprint,
          auditRef,
        ],
      );
      const specialization = await this.findSpecializationVersion(
        input.specializationVersionId,
      );
      await this.database.exec("COMMIT");
      return { outcome: "CREATED", specialization: specialization!, auditRef };
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async activatePolicyVersion(
    input: ActivateRoutingPolicyVersionInput,
  ): Promise<RoutingPolicyActivationResult> {
    if (input.authorityIdentifier !== ROUTING_POLICY_AUTHORITY)
      throw new RoutingContractError("POLICY_DENIED");
    await this.database.exec("BEGIN");
    try {
      const policy = await this.findPolicyVersion(input.routingPolicyVersionId);
      if (!policy) throw new RoutingContractError("ROUTING_POLICY_MISSING");
      if (
        policy.authorityIdentifier !== ROUTING_POLICY_AUTHORITY ||
        policy.lifecycleIntent !== "ACTIVE"
      )
        throw new RoutingContractError("ROUTING_POLICY_INACTIVE");
      const fingerprint = routingPolicyApplicabilityFingerprint(policy);
      await this.database.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [fingerprint],
      );
      const auditRef = deterministicAuditUuid(
        `ROUTING.POLICY_ACTIVATED:${fingerprint}:${input.idempotencyKey}`,
      );
      const replay = await this.database.query<Row>(
        `SELECT * FROM governance.ai_routing_policy_activation_events WHERE audit_ref=$1`,
        [auditRef],
      );
      if (replay.rows[0]) {
        const activation = mapActivation(replay.rows[0]);
        if (
          activation.routingPolicyActivationEventId !==
            input.routingPolicyActivationEventId ||
          activation.routingPolicyVersionId !== input.routingPolicyVersionId ||
          activation.supersedesActivationEventId !==
            input.expectedActivationEventId ||
          activation.actorType !== input.actorType ||
          activation.actorId !== input.actorId ||
          activation.reasonCode !== input.reasonCode ||
          canonicalAuditValue(activation.evidenceRefs) !==
            canonicalAuditValue(input.evidenceRefs)
        )
          throw new RoutingContractError("ROUTING_IDEMPOTENCY_CONFLICT");
        await requireExactAuditReplay(
          this.database,
          activationAuditInput(
            input,
            policy,
            activation.applicabilityFingerprint,
            activation.selectionSequence,
            activation.supersedesActivationEventId,
          ),
        );
        await this.database.exec("COMMIT");
        return { outcome: "REUSED", activation, auditRef };
      }
      const head = await this.database.query<Row>(
        `SELECT * FROM governance.ai_routing_policy_activation_events
         WHERE applicability_fingerprint=$1
         ORDER BY selection_sequence DESC,routing_policy_activation_event_id DESC
         LIMIT 1`,
        [fingerprint],
      );
      const prior = head.rows[0] ? mapActivation(head.rows[0]) : undefined;
      if (
        (prior?.routingPolicyActivationEventId ?? null) !==
        input.expectedActivationEventId
      )
        throw new RoutingContractError("ROUTING_POLICY_ACTIVATION_CONFLICT");
      if (prior?.eventType === "RETIRE")
        throw new RoutingContractError("ROUTING_POLICY_INACTIVE");
      const sequence = (prior?.selectionSequence ?? 0) + 1;
      const eventType = prior ? "SUPERSEDE" : "ACTIVATE";
      await new PostgresAuditRecordRepository(
        this.database,
      ).recordInTransaction(
        activationAuditInput(
          input,
          policy,
          fingerprint,
          sequence,
          prior?.routingPolicyActivationEventId ?? null,
        ),
      );
      await this.database.query(
        `INSERT INTO governance.ai_routing_policy_activation_events(
           routing_policy_activation_event_id,routing_policy_id,
           routing_policy_version_id,applicability_fingerprint,
           selection_sequence,event_type,supersedes_activation_event_id,
           actor_type,actor_id,reason_code,evidence_refs,audit_ref)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          input.routingPolicyActivationEventId,
          policy.routingPolicyId,
          policy.routingPolicyVersionId,
          fingerprint,
          sequence,
          eventType,
          prior?.routingPolicyActivationEventId ?? null,
          input.actorType,
          input.actorId,
          input.reasonCode,
          [...input.evidenceRefs],
          auditRef,
        ],
      );
      const inserted = await this.database.query<Row>(
        `SELECT * FROM governance.ai_routing_policy_activation_events
         WHERE routing_policy_activation_event_id=$1`,
        [input.routingPolicyActivationEventId],
      );
      const activation = mapActivation(inserted.rows[0]!);
      await this.database.exec("COMMIT");
      return { outcome: "CREATED", activation, auditRef };
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
