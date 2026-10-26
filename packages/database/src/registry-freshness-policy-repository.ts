import { createHash } from "node:crypto";

import {
  canonicalAuditValue,
  deterministicAuditUuid,
  PostgresAuditRecordRepository,
  type AuditRecordInput,
} from "./audit-record-repository.js";
import { RoutingContractError } from "./routing-contracts.js";
import type { MigrationDatabase } from "./types.js";

export const REGISTRY_FRESHNESS_POLICY_AUTHORITY =
  "MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD" as const;
export const REGISTRY_FRESHNESS_SCOPE = "PHASE15B_AI_REGISTRY" as const;

export type RegistryFreshnessEnvironment =
  "DEVELOPMENT" | "PREVIEW" | "STAGING" | "PRODUCTION";
export type RegistryFreshnessPolicyLifecycle =
  "DRAFT" | "ACTIVE" | "SUPERSEDED" | "RETIRED";
export type RegistryFreshnessActorType = "HUMAN" | "AGENT" | "SYSTEM";
export type RegistryFreshnessActivationEventType =
  "ACTIVATE" | "SUPERSEDE" | "RETIRE";

interface GovernedInput {
  readonly authorityIdentifier: typeof REGISTRY_FRESHNESS_POLICY_AUTHORITY;
  readonly registryScope: typeof REGISTRY_FRESHNESS_SCOPE;
  readonly environment: RegistryFreshnessEnvironment;
  readonly actorType: RegistryFreshnessActorType;
  readonly actorId: string;
  readonly reasonCode: string;
  readonly evidenceRefs: readonly string[];
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId: string;
}

export interface AppendRegistryFreshnessPolicyVersionInput extends GovernedInput {
  readonly registryFreshnessPolicyVersionId: string;
  readonly registryFreshnessPolicyId: string;
  readonly policyVersion: number;
  readonly supersedesPolicyVersionId: string | null;
  readonly maxAgeMs: number;
  readonly lifecycleIntent: RegistryFreshnessPolicyLifecycle;
  readonly effectiveAt: string;
  readonly contentFingerprint: string;
}

export interface RegistryFreshnessPolicySnapshot {
  readonly policyVersionId: string;
  readonly policyRef: string;
  readonly policyVersion: number;
  readonly supersedesPolicyVersionId: string | null;
  readonly authorityIdentifier: typeof REGISTRY_FRESHNESS_POLICY_AUTHORITY;
  readonly registryScope: typeof REGISTRY_FRESHNESS_SCOPE;
  readonly environment: RegistryFreshnessEnvironment;
  readonly maxAgeMs: number;
  readonly lifecycleIntent: RegistryFreshnessPolicyLifecycle;
  readonly effectiveAt: string;
  readonly contentFingerprint: string;
  readonly actorType: RegistryFreshnessActorType;
  readonly actorId: string;
  readonly reasonCode: string;
  readonly evidenceRefs: readonly string[];
  readonly auditRef: string;
  readonly createdAt: string;
}

export interface RegistryFreshnessApplicability {
  readonly registryScope: typeof REGISTRY_FRESHNESS_SCOPE;
  readonly environment: RegistryFreshnessEnvironment;
}

export interface ActivateRegistryFreshnessPolicyInput extends GovernedInput {
  readonly registryFreshnessPolicyActivationEventId: string;
  readonly registryFreshnessPolicyId: string;
  readonly policyVersion: number;
  readonly expectedActivationEventId: string | null;
}

export interface RetireRegistryFreshnessPolicyInput extends GovernedInput {
  readonly registryFreshnessPolicyActivationEventId: string;
  readonly expectedActivationEventId: string;
  readonly expectedPolicyId: string;
  readonly expectedPolicyVersion: number;
}

export interface AppendRegistryFreshnessActivationEventInput extends GovernedInput {
  readonly registryFreshnessPolicyActivationEventId: string;
  readonly registryFreshnessPolicyId: string;
  readonly policyVersion: number;
  readonly expectedActivationEventId: string | null;
  readonly eventType: RegistryFreshnessActivationEventType;
}

export interface RegistryFreshnessActivationSnapshot {
  readonly registryFreshnessPolicyActivationEventId: string;
  readonly policyRef: string;
  readonly policyVersion: number;
  readonly registryScope: typeof REGISTRY_FRESHNESS_SCOPE;
  readonly environment: RegistryFreshnessEnvironment;
  readonly applicabilityFingerprint: string;
  readonly selectionSequence: number;
  readonly eventType: RegistryFreshnessActivationEventType;
  readonly supersedesActivationEventId: string | null;
  readonly eventFingerprint: string;
  readonly authorityIdentifier: typeof REGISTRY_FRESHNESS_POLICY_AUTHORITY;
  readonly actorType: RegistryFreshnessActorType;
  readonly actorId: string;
  readonly reasonCode: string;
  readonly evidenceRefs: readonly string[];
  readonly auditRef: string;
  readonly createdAt: string;
}

export interface RegistryFreshnessCurrentPolicySnapshot {
  readonly policyRef: string;
  readonly policyVersion: number;
  readonly maxAgeMs: number;
  readonly authorityIdentifier: typeof REGISTRY_FRESHNESS_POLICY_AUTHORITY;
  readonly environment: RegistryFreshnessEnvironment;
  readonly registryScope: typeof REGISTRY_FRESHNESS_SCOPE;
  readonly effectiveState: "ACTIVE";
  readonly activationEventRef: string;
  readonly selectionSequence: number;
}

export interface RegistryFreshnessPolicyAppendResult {
  readonly outcome: "CREATED" | "REUSED";
  readonly policy: RegistryFreshnessPolicySnapshot;
  readonly auditRef: string;
}

export interface RegistryFreshnessActivationResult {
  readonly outcome: "CREATED" | "REUSED";
  readonly activation: RegistryFreshnessActivationSnapshot;
  readonly auditRef: string;
}

export interface RegistryFreshnessPolicyRepository {
  appendPolicyVersion(
    input: AppendRegistryFreshnessPolicyVersionInput,
  ): Promise<RegistryFreshnessPolicyAppendResult>;
  findPolicyVersion(
    id: string,
  ): Promise<RegistryFreshnessPolicySnapshot | undefined>;
  resolveCurrentPolicy(
    input: RegistryFreshnessApplicability,
  ): Promise<RegistryFreshnessCurrentPolicySnapshot>;
  appendActivationEvent(
    input: AppendRegistryFreshnessActivationEventInput,
  ): Promise<RegistryFreshnessActivationResult>;
  activatePolicy(
    input: ActivateRegistryFreshnessPolicyInput,
  ): Promise<RegistryFreshnessActivationResult>;
  retireCurrentPolicy(
    input: RetireRegistryFreshnessPolicyInput,
  ): Promise<RegistryFreshnessActivationResult>;
  readActivationHistory(
    input: RegistryFreshnessApplicability,
  ): Promise<readonly RegistryFreshnessActivationSnapshot[]>;
}

type Row = Record<string, unknown>;

const policySelect = `SELECT
  registry_freshness_policy_version_id::text,
  registry_freshness_policy_id::text,
  policy_version,
  supersedes_policy_version_id::text,
  authority_identifier,registry_scope,environment,max_age_ms,
  lifecycle_intent,effective_at,content_fingerprint,
  created_by_actor_type,created_by_actor_id::text,reason_code,evidence_refs,
  audit_ref::text,created_at
  FROM governance.registry_freshness_policy_versions`;

const activationSelect = `SELECT
  registry_freshness_policy_activation_event_id::text,
  registry_freshness_policy_id::text,registry_freshness_policy_version,
  registry_scope,environment,applicability_fingerprint,selection_sequence,
  event_type,supersedes_activation_event_id::text,event_fingerprint,
  authority_identifier,actor_type,actor_id::text,reason_code,evidence_refs,
  audit_ref::text,created_at
  FROM governance.registry_freshness_policy_activation_events`;

const text = (value: unknown) => (value == null ? null : String(value));
const timestamp = (value: unknown) =>
  new Date(value as Date | string).toISOString();
const frozenStrings = (value: unknown): readonly string[] =>
  Object.freeze(Array.isArray(value) ? value.map(String) : []);

function mapPolicy(row: Row): RegistryFreshnessPolicySnapshot {
  return Object.freeze({
    policyVersionId: String(row.registry_freshness_policy_version_id),
    policyRef: String(row.registry_freshness_policy_id),
    policyVersion: Number(row.policy_version),
    supersedesPolicyVersionId: text(row.supersedes_policy_version_id),
    authorityIdentifier:
      row.authority_identifier as typeof REGISTRY_FRESHNESS_POLICY_AUTHORITY,
    registryScope: row.registry_scope as typeof REGISTRY_FRESHNESS_SCOPE,
    environment: row.environment as RegistryFreshnessEnvironment,
    maxAgeMs: Number(row.max_age_ms),
    lifecycleIntent: row.lifecycle_intent as RegistryFreshnessPolicyLifecycle,
    effectiveAt: timestamp(row.effective_at),
    contentFingerprint: String(row.content_fingerprint),
    actorType: row.created_by_actor_type as RegistryFreshnessActorType,
    actorId: String(row.created_by_actor_id),
    reasonCode: String(row.reason_code),
    evidenceRefs: frozenStrings(row.evidence_refs),
    auditRef: String(row.audit_ref),
    createdAt: timestamp(row.created_at),
  });
}

function mapActivation(row: Row): RegistryFreshnessActivationSnapshot {
  return Object.freeze({
    registryFreshnessPolicyActivationEventId: String(
      row.registry_freshness_policy_activation_event_id,
    ),
    policyRef: String(row.registry_freshness_policy_id),
    policyVersion: Number(row.registry_freshness_policy_version),
    registryScope: row.registry_scope as typeof REGISTRY_FRESHNESS_SCOPE,
    environment: row.environment as RegistryFreshnessEnvironment,
    applicabilityFingerprint: String(row.applicability_fingerprint),
    selectionSequence: Number(row.selection_sequence),
    eventType: row.event_type as RegistryFreshnessActivationEventType,
    supersedesActivationEventId: text(row.supersedes_activation_event_id),
    eventFingerprint: String(row.event_fingerprint),
    authorityIdentifier:
      row.authority_identifier as typeof REGISTRY_FRESHNESS_POLICY_AUTHORITY,
    actorType: row.actor_type as RegistryFreshnessActorType,
    actorId: String(row.actor_id),
    reasonCode: String(row.reason_code),
    evidenceRefs: frozenStrings(row.evidence_refs),
    auditRef: String(row.audit_ref),
    createdAt: timestamp(row.created_at),
  });
}

function sha256(value: unknown) {
  return `sha256:${createHash("sha256")
    .update(canonicalAuditValue(value))
    .digest("hex")}`;
}

export function registryFreshnessApplicabilityFingerprint(
  input: RegistryFreshnessApplicability,
) {
  return sha256({
    contractVersion: "MAOS_REGISTRY_FRESHNESS_APPLICABILITY_V1",
    environment: input.environment,
    registryScope: input.registryScope,
  });
}

const registryFreshnessEnvironments = new Set([
  "DEVELOPMENT",
  "PREVIEW",
  "STAGING",
  "PRODUCTION",
]);
const registryFreshnessLifecycles = new Set([
  "DRAFT",
  "ACTIVE",
  "SUPERSEDED",
  "RETIRED",
]);
const MAX_DATE_MS = 8_640_000_000_000_000;

function nonBlank(value: string) {
  return typeof value === "string" && value.trim().length > 0;
}

function requireGovernedInput(input: GovernedInput) {
  if (
    input.authorityIdentifier !== REGISTRY_FRESHNESS_POLICY_AUTHORITY ||
    input.registryScope !== REGISTRY_FRESHNESS_SCOPE ||
    !registryFreshnessEnvironments.has(input.environment) ||
    !nonBlank(input.actorId) ||
    !nonBlank(input.reasonCode) ||
    !nonBlank(input.idempotencyKey) ||
    !nonBlank(input.correlationId) ||
    !nonBlank(input.traceId) ||
    !nonBlank(input.spanId) ||
    input.evidenceRefs.some((ref) => !nonBlank(ref))
  ) {
    throw new RoutingContractError("POLICY_DENIED");
  }
}

function requirePolicyAppend(
  input: AppendRegistryFreshnessPolicyVersionInput,
  now: Date,
) {
  requireGovernedInput(input);
  const evaluatedAt = now.getTime();
  if (
    !Number.isSafeInteger(input.policyVersion) ||
    input.policyVersion <= 0 ||
    (input.policyVersion === 1) !==
      (input.supersedesPolicyVersionId === null) ||
    !Number.isSafeInteger(input.maxAgeMs) ||
    input.maxAgeMs <= 0 ||
    !Number.isFinite(evaluatedAt) ||
    evaluatedAt + input.maxAgeMs > MAX_DATE_MS ||
    !Number.isFinite(Date.parse(input.effectiveAt)) ||
    !registryFreshnessLifecycles.has(input.lifecycleIntent) ||
    !/^sha256:[a-f0-9]{64}$/u.test(input.contentFingerprint)
  ) {
    throw new RoutingContractError("POLICY_DENIED");
  }
}

function exactPolicyReplay(
  policy: RegistryFreshnessPolicySnapshot,
  input: AppendRegistryFreshnessPolicyVersionInput,
) {
  return (
    policy.policyVersionId === input.registryFreshnessPolicyVersionId &&
    policy.policyRef === input.registryFreshnessPolicyId &&
    policy.policyVersion === input.policyVersion &&
    policy.supersedesPolicyVersionId === input.supersedesPolicyVersionId &&
    policy.authorityIdentifier === input.authorityIdentifier &&
    policy.registryScope === input.registryScope &&
    policy.environment === input.environment &&
    policy.maxAgeMs === input.maxAgeMs &&
    policy.lifecycleIntent === input.lifecycleIntent &&
    policy.effectiveAt === new Date(input.effectiveAt).toISOString() &&
    policy.contentFingerprint === input.contentFingerprint &&
    policy.actorType === input.actorType &&
    policy.actorId === input.actorId &&
    policy.reasonCode === input.reasonCode &&
    canonicalAuditValue(policy.evidenceRefs) ===
      canonicalAuditValue(input.evidenceRefs)
  );
}

function policyAuditInput(
  input: AppendRegistryFreshnessPolicyVersionInput,
): AuditRecordInput {
  return {
    action: "REGISTRY_FRESHNESS_POLICY.VERSION_APPENDED",
    actorId: input.actorId,
    actorType: input.actorType,
    targetType: "REGISTRY_FRESHNESS_POLICY_VERSION",
    targetId: input.registryFreshnessPolicyVersionId,
    result: "SUCCEEDED",
    requestId: `registry-freshness-policy:${input.registryFreshnessPolicyId}`,
    correlationId: input.correlationId,
    traceId: input.traceId,
    spanId: input.spanId,
    evidenceRefs: input.evidenceRefs,
    metadata: {
      authority: input.authorityIdentifier,
      content_fingerprint: input.contentFingerprint,
      environment: input.environment,
      lifecycle_intent: input.lifecycleIntent,
      max_age_ms: input.maxAgeMs,
      policy_version: input.policyVersion,
      predecessor: input.supersedesPolicyVersionId,
      reason_code: input.reasonCode,
      registry_scope: input.registryScope,
    },
    idempotencyKey: input.idempotencyKey,
    deterministicIdentitySeed: `REGISTRY_FRESHNESS_POLICY.VERSION_APPENDED:${input.registryScope}:${input.environment}:${input.idempotencyKey}`,
  };
}

function activationAuditInput(
  input: AppendRegistryFreshnessActivationEventInput,
  policy: RegistryFreshnessPolicySnapshot,
  activation: {
    readonly eventType: RegistryFreshnessActivationEventType;
    readonly selectionSequence: number;
    readonly supersedesActivationEventId: string | null;
  },
): AuditRecordInput {
  const action =
    activation.eventType === "RETIRE"
      ? "REGISTRY_FRESHNESS_POLICY.RETIRED"
      : "REGISTRY_FRESHNESS_POLICY.ACTIVATED";
  return {
    action,
    actorId: input.actorId,
    actorType: input.actorType,
    targetType: "REGISTRY_FRESHNESS_POLICY_VERSION",
    targetId: policy.policyVersionId,
    result: "SUCCEEDED",
    requestId: `registry-freshness-policy:${policy.policyRef}`,
    correlationId: input.correlationId,
    traceId: input.traceId,
    spanId: input.spanId,
    evidenceRefs: input.evidenceRefs,
    metadata: {
      authority: input.authorityIdentifier,
      environment: input.environment,
      event_type: activation.eventType,
      max_age_ms: policy.maxAgeMs,
      policy_id: policy.policyRef,
      policy_version: policy.policyVersion,
      previous_activation_event_id: activation.supersedesActivationEventId,
      reason_code: input.reasonCode,
      registry_scope: input.registryScope,
      selection_sequence: activation.selectionSequence,
    },
    idempotencyKey: input.idempotencyKey,
    deterministicIdentitySeed: `${action}:${input.registryScope}:${input.environment}:${input.idempotencyKey}`,
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
    ) {
      throw new RoutingContractError("ROUTING_IDEMPOTENCY_CONFLICT");
    }
    throw error;
  }
}

type RequestedActivation =
  | { readonly kind: "AUTO" }
  | {
      readonly kind: "EXACT";
      readonly eventType: RegistryFreshnessActivationEventType;
    };

export class PostgresRegistryFreshnessPolicyRepository implements RegistryFreshnessPolicyRepository {
  constructor(
    private readonly database: MigrationDatabase,
    private readonly now = () => new Date(),
  ) {}

  async findPolicyVersion(id: string) {
    const result = await this.database.query<Row>(
      `${policySelect} WHERE registry_freshness_policy_version_id=$1`,
      [id],
    );
    return result.rows[0] ? mapPolicy(result.rows[0]) : undefined;
  }

  async appendPolicyVersion(
    input: AppendRegistryFreshnessPolicyVersionInput,
  ): Promise<RegistryFreshnessPolicyAppendResult> {
    requirePolicyAppend(input, this.now());
    await this.database.exec("BEGIN");
    try {
      await this.database.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [input.registryFreshnessPolicyId],
      );
      const replay = await this.database.query<Row>(
        `${policySelect}
         WHERE registry_scope=$1 AND environment=$2 AND idempotency_key=$3`,
        [input.registryScope, input.environment, input.idempotencyKey],
      );
      if (replay.rows[0]) {
        const policy = mapPolicy(replay.rows[0]);
        if (!exactPolicyReplay(policy, input)) {
          throw new RoutingContractError("ROUTING_IDEMPOTENCY_CONFLICT");
        }
        await requireExactAuditReplay(this.database, policyAuditInput(input));
        await this.database.exec("COMMIT");
        return { outcome: "REUSED", policy, auditRef: policy.auditRef };
      }
      const head = await this.database.query<Row>(
        `${policySelect}
         WHERE registry_freshness_policy_id=$1
         ORDER BY policy_version DESC LIMIT 1`,
        [input.registryFreshnessPolicyId],
      );
      const predecessor = head.rows[0] ? mapPolicy(head.rows[0]) : undefined;
      if (
        input.policyVersion !== (predecessor?.policyVersion ?? 0) + 1 ||
        input.supersedesPolicyVersionId !==
          (predecessor?.policyVersionId ?? null)
      ) {
        throw new RoutingContractError("ROUTING_POLICY_CONFLICT");
      }
      const auditInput = policyAuditInput(input);
      const auditRef = deterministicAuditUuid(
        auditInput.deterministicIdentitySeed!,
      );
      await new PostgresAuditRecordRepository(
        this.database,
      ).recordInTransaction(auditInput);
      await this.database.query(
        `INSERT INTO governance.registry_freshness_policy_versions(
           registry_freshness_policy_version_id,registry_freshness_policy_id,
           policy_version,supersedes_policy_version_id,authority_identifier,
           registry_scope,environment,max_age_ms,lifecycle_intent,effective_at,
           content_fingerprint,idempotency_key,created_by_actor_type,
           created_by_actor_id,reason_code,evidence_refs,audit_ref)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          input.registryFreshnessPolicyVersionId,
          input.registryFreshnessPolicyId,
          input.policyVersion,
          input.supersedesPolicyVersionId,
          input.authorityIdentifier,
          input.registryScope,
          input.environment,
          input.maxAgeMs,
          input.lifecycleIntent,
          input.effectiveAt,
          input.contentFingerprint,
          input.idempotencyKey,
          input.actorType,
          input.actorId,
          input.reasonCode,
          [...input.evidenceRefs],
          auditRef,
        ],
      );
      const policy = await this.findPolicyVersion(
        input.registryFreshnessPolicyVersionId,
      );
      if (!policy) throw new RoutingContractError("ROUTING_POLICY_MISSING");
      await this.database.exec("COMMIT");
      return { outcome: "CREATED", policy, auditRef };
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async resolveCurrentPolicy(
    input: RegistryFreshnessApplicability,
  ): Promise<RegistryFreshnessCurrentPolicySnapshot> {
    const result = await this.database.query<Row>(
      `WITH latest AS (
         SELECT max(selection_sequence) AS selection_sequence
         FROM governance.registry_freshness_policy_activation_events
         WHERE registry_scope=$1 AND environment=$2
       )
       SELECT event.registry_freshness_policy_activation_event_id::text,
              event.registry_freshness_policy_id::text,
              event.registry_freshness_policy_version,event.registry_scope,
              event.environment,event.selection_sequence,event.event_type,
              policy.max_age_ms,policy.lifecycle_intent,policy.authority_identifier
       FROM governance.registry_freshness_policy_activation_events event
       JOIN latest ON latest.selection_sequence=event.selection_sequence
       JOIN governance.registry_freshness_policy_versions policy
         ON policy.registry_freshness_policy_id=event.registry_freshness_policy_id
        AND policy.policy_version=event.registry_freshness_policy_version
       WHERE event.registry_scope=$1 AND event.environment=$2`,
      [input.registryScope, input.environment],
    );
    if (result.rows.length === 0) {
      throw new RoutingContractError("ROUTING_POLICY_MISSING");
    }
    if (result.rows.length !== 1) {
      throw new RoutingContractError("ROUTING_POLICY_CONFLICT");
    }
    const row = result.rows[0]!;
    if (row.event_type === "RETIRE") {
      throw new RoutingContractError("ROUTING_POLICY_MISSING");
    }
    if (
      !["ACTIVATE", "SUPERSEDE"].includes(String(row.event_type)) ||
      row.lifecycle_intent !== "ACTIVE" ||
      row.authority_identifier !== REGISTRY_FRESHNESS_POLICY_AUTHORITY ||
      row.registry_scope !== input.registryScope ||
      row.environment !== input.environment
    ) {
      throw new RoutingContractError("ROUTING_POLICY_CONFLICT");
    }
    return Object.freeze({
      policyRef: String(row.registry_freshness_policy_id),
      policyVersion: Number(row.registry_freshness_policy_version),
      maxAgeMs: Number(row.max_age_ms),
      authorityIdentifier:
        row.authority_identifier as typeof REGISTRY_FRESHNESS_POLICY_AUTHORITY,
      environment: row.environment as RegistryFreshnessEnvironment,
      registryScope: row.registry_scope as typeof REGISTRY_FRESHNESS_SCOPE,
      effectiveState: "ACTIVE",
      activationEventRef: String(
        row.registry_freshness_policy_activation_event_id,
      ),
      selectionSequence: Number(row.selection_sequence),
    });
  }

  async readActivationHistory(
    input: RegistryFreshnessApplicability,
  ): Promise<readonly RegistryFreshnessActivationSnapshot[]> {
    const result = await this.database.query<Row>(
      `${activationSelect}
       WHERE registry_scope=$1 AND environment=$2
       ORDER BY selection_sequence,registry_freshness_policy_activation_event_id`,
      [input.registryScope, input.environment],
    );
    return Object.freeze(result.rows.map(mapActivation));
  }

  appendActivationEvent(input: AppendRegistryFreshnessActivationEventInput) {
    return this.#appendActivation(input, {
      kind: "EXACT",
      eventType: input.eventType,
    });
  }

  activatePolicy(input: ActivateRegistryFreshnessPolicyInput) {
    return this.#appendActivation(
      { ...input, eventType: "ACTIVATE" },
      { kind: "AUTO" },
    );
  }

  retireCurrentPolicy(input: RetireRegistryFreshnessPolicyInput) {
    return this.#appendActivation(
      {
        ...input,
        registryFreshnessPolicyId: input.expectedPolicyId,
        policyVersion: input.expectedPolicyVersion,
        eventType: "RETIRE",
      },
      { kind: "EXACT", eventType: "RETIRE" },
    );
  }

  async #appendActivation(
    input: AppendRegistryFreshnessActivationEventInput,
    requested: RequestedActivation,
  ): Promise<RegistryFreshnessActivationResult> {
    requireGovernedInput(input);
    if (
      !Number.isSafeInteger(input.policyVersion) ||
      input.policyVersion <= 0
    ) {
      throw new RoutingContractError("POLICY_DENIED");
    }
    const applicabilityFingerprint =
      registryFreshnessApplicabilityFingerprint(input);
    await this.database.exec("BEGIN");
    try {
      await this.database.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [applicabilityFingerprint],
      );
      const replay = await this.database.query<Row>(
        `${activationSelect}
         WHERE registry_scope=$1 AND environment=$2 AND idempotency_key=$3`,
        [input.registryScope, input.environment, input.idempotencyKey],
      );
      if (replay.rows[0]) {
        const activation = mapActivation(replay.rows[0]);
        const policy = await this.#findPolicyByIdentity(
          activation.policyRef,
          activation.policyVersion,
        );
        if (!policy) throw new RoutingContractError("ROUTING_POLICY_MISSING");
        const expectedFingerprint = this.#eventFingerprint(
          input,
          activation.eventType,
          activation.selectionSequence,
          activation.supersedesActivationEventId,
        );
        if (
          activation.registryFreshnessPolicyActivationEventId !==
            input.registryFreshnessPolicyActivationEventId ||
          activation.policyRef !== input.registryFreshnessPolicyId ||
          activation.policyVersion !== input.policyVersion ||
          activation.supersedesActivationEventId !==
            input.expectedActivationEventId ||
          activation.authorityIdentifier !== input.authorityIdentifier ||
          activation.actorType !== input.actorType ||
          activation.actorId !== input.actorId ||
          activation.reasonCode !== input.reasonCode ||
          activation.eventFingerprint !== expectedFingerprint ||
          canonicalAuditValue(activation.evidenceRefs) !==
            canonicalAuditValue(input.evidenceRefs) ||
          (requested.kind === "EXACT" &&
            activation.eventType !== requested.eventType)
        ) {
          throw new RoutingContractError("ROUTING_IDEMPOTENCY_CONFLICT");
        }
        await requireExactAuditReplay(
          this.database,
          activationAuditInput(input, policy, activation),
        );
        await this.database.exec("COMMIT");
        return {
          outcome: "REUSED",
          activation,
          auditRef: activation.auditRef,
        };
      }

      const policy = await this.#findPolicyByIdentity(
        input.registryFreshnessPolicyId,
        input.policyVersion,
      );
      if (
        !policy ||
        policy.authorityIdentifier !== input.authorityIdentifier ||
        policy.registryScope !== input.registryScope ||
        policy.environment !== input.environment
      ) {
        throw new RoutingContractError("ROUTING_POLICY_MISSING");
      }
      if (policy.lifecycleIntent !== "ACTIVE") {
        throw new RoutingContractError("ROUTING_POLICY_INACTIVE");
      }
      const head = await this.database.query<Row>(
        `${activationSelect}
         WHERE registry_scope=$1 AND environment=$2
         ORDER BY selection_sequence DESC LIMIT 1`,
        [input.registryScope, input.environment],
      );
      const prior = head.rows[0] ? mapActivation(head.rows[0]) : undefined;
      if (
        (prior?.registryFreshnessPolicyActivationEventId ?? null) !==
        input.expectedActivationEventId
      ) {
        throw new RoutingContractError("ROUTING_POLICY_ACTIVATION_CONFLICT");
      }
      const eventType =
        requested.kind === "AUTO"
          ? prior && prior.eventType !== "RETIRE"
            ? "SUPERSEDE"
            : "ACTIVATE"
          : requested.eventType;
      if (
        (eventType === "ACTIVATE" && prior?.eventType !== "RETIRE" && prior) ||
        (eventType === "SUPERSEDE" &&
          (!prior ||
            prior.eventType === "RETIRE" ||
            (prior.policyRef === input.registryFreshnessPolicyId &&
              prior.policyVersion === input.policyVersion))) ||
        (eventType === "RETIRE" &&
          (!prior ||
            prior.eventType === "RETIRE" ||
            prior.policyRef !== input.registryFreshnessPolicyId ||
            prior.policyVersion !== input.policyVersion))
      ) {
        throw new RoutingContractError("ROUTING_POLICY_ACTIVATION_CONFLICT");
      }
      const selectionSequence = (prior?.selectionSequence ?? 0) + 1;
      const supersedesActivationEventId =
        prior?.registryFreshnessPolicyActivationEventId ?? null;
      const eventFingerprint = this.#eventFingerprint(
        input,
        eventType,
        selectionSequence,
        supersedesActivationEventId,
      );
      const auditInput = activationAuditInput(input, policy, {
        eventType,
        selectionSequence,
        supersedesActivationEventId,
      });
      const auditRef = deterministicAuditUuid(
        auditInput.deterministicIdentitySeed!,
      );
      await new PostgresAuditRecordRepository(
        this.database,
      ).recordInTransaction(auditInput);
      await this.database.query(
        `INSERT INTO governance.registry_freshness_policy_activation_events(
           registry_freshness_policy_activation_event_id,
           registry_freshness_policy_id,registry_freshness_policy_version,
           registry_scope,environment,applicability_fingerprint,
           selection_sequence,event_type,supersedes_activation_event_id,
           event_fingerprint,idempotency_key,authority_identifier,actor_type,
           actor_id,reason_code,evidence_refs,audit_ref)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          input.registryFreshnessPolicyActivationEventId,
          input.registryFreshnessPolicyId,
          input.policyVersion,
          input.registryScope,
          input.environment,
          applicabilityFingerprint,
          selectionSequence,
          eventType,
          supersedesActivationEventId,
          eventFingerprint,
          input.idempotencyKey,
          input.authorityIdentifier,
          input.actorType,
          input.actorId,
          input.reasonCode,
          [...input.evidenceRefs],
          auditRef,
        ],
      );
      const inserted = await this.database.query<Row>(
        `${activationSelect}
         WHERE registry_freshness_policy_activation_event_id=$1`,
        [input.registryFreshnessPolicyActivationEventId],
      );
      const activation = mapActivation(inserted.rows[0]!);
      await this.database.exec("COMMIT");
      return { outcome: "CREATED", activation, auditRef };
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async #findPolicyByIdentity(policyId: string, policyVersion: number) {
    const result = await this.database.query<Row>(
      `${policySelect}
       WHERE registry_freshness_policy_id=$1 AND policy_version=$2`,
      [policyId, policyVersion],
    );
    return result.rows[0] ? mapPolicy(result.rows[0]) : undefined;
  }

  #eventFingerprint(
    input: AppendRegistryFreshnessActivationEventInput,
    eventType: RegistryFreshnessActivationEventType,
    selectionSequence: number,
    supersedesActivationEventId: string | null,
  ) {
    return sha256({
      actorId: input.actorId,
      actorType: input.actorType,
      authorityIdentifier: input.authorityIdentifier,
      correlationId: input.correlationId,
      environment: input.environment,
      eventType,
      evidenceRefs: input.evidenceRefs,
      idempotencyKey: input.idempotencyKey,
      policyId: input.registryFreshnessPolicyId,
      policyVersion: input.policyVersion,
      reasonCode: input.reasonCode,
      registryScope: input.registryScope,
      selectionSequence,
      spanId: input.spanId,
      supersedesActivationEventId,
      traceId: input.traceId,
    });
  }
}
