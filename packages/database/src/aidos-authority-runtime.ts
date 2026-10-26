import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

import {
  validateAidosDelegationInput,
  validateAidosSnapshotBinding,
  type AidosDelegationInput,
  type AidosProjectionBinding,
  type AidosSnapshotBinding,
} from "./aidos-delegation-contracts.js";
import {
  AIDOS_AUTHORITY_SOURCE,
  AIDOS_AVAILABILITY_SOURCE,
  AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
  AIDOS_PROJECT_REGISTRATION_SOURCE,
  type AidosAuthorityBackend,
  type AidosAvailabilityQuery,
  type AidosAvailabilitySnapshot,
  type AidosCanonicalRevalidationObservation,
  type AidosDelegationEligibilityQuery,
  type AidosDelegationEligibilitySnapshot,
  type AidosProjectOnboardingQuery,
  type AidosProjectOnboardingSnapshot,
  type AidosRevalidationQuery,
} from "./routing-authority-read-ports.js";
import { RoutingContractError } from "./routing-contracts.js";

export const AIDOS_EXTERNAL_AUTHORITY_CONTRACT =
  "AIDOS_EXTERNAL_AUTHORITY_PROJECTION_READ/1.0" as const;
export const AIDOS_EXTERNAL_AUTHORITY_MEDIA_TYPE =
  "application/vnd.aidos.external-authority-projection+json;version=1;charset=utf-8" as const;

const resolvePath = "/api/external-authority/v1/projections:resolve";
const revalidatePath = "/api/external-authority/v1/projections:revalidate";
const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const retryableStatuses = new Set([502, 503, 504]);

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface AidosAuthorityRuntimeDependencies {
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly randomUUID?: () => string;
  readonly randomNonce?: () => string;
}

export interface AidosAuthorityRuntimeConfig {
  readonly baseUrl: string;
  readonly readerId: string;
  readonly keyId: string;
  readonly identitySubject: string;
  readonly hmacSecret: string;
  readonly requestTimeoutMs?: number;
  readonly dependencies?: AidosAuthorityRuntimeDependencies;
}

interface ProjectionWire {
  readonly projection_type: string;
  readonly projection_id: string;
  readonly projection_revision: string;
  readonly authority_source: string;
  readonly project_id: string;
  readonly environment: string;
  readonly snapshot_id: string;
  readonly authority_epoch: string;
  readonly observed_at: string;
  readonly valid_until: string;
  readonly currentness_state: string;
  readonly evidence_ref: string;
  readonly evidence_hash: string;
  readonly reason_codes: readonly unknown[];
  readonly body: Record<string, unknown>;
}

interface ResolvedSnapshot {
  readonly availability: AidosAvailabilitySnapshot;
  readonly registration: AidosProjectOnboardingSnapshot;
  readonly eligibility: AidosDelegationEligibilitySnapshot;
}

interface PendingSnapshot {
  readonly promise: Promise<ResolvedSnapshot>;
  readonly consumed: Set<"availability" | "registration" | "eligibility">;
}

function failStale(): never {
  throw new RoutingContractError("AIDOS_AUTHORITY_STALE");
}

function failConflict(): never {
  throw new RoutingContractError("AIDOS_AUTHORITY_CONFLICT");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) failStale();
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
) {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (
    actual.length !== keys.length ||
    actual.some((key, index) => key !== keys[index])
  )
    failStale();
}

function canonicalize(value: unknown): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    )) {
      if (item === undefined) failStale();
      result[key.normalize("NFC")] = canonicalize(item);
    }
    return result;
  }
  failStale();
}

export function serializeAidosCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(serializeAidosCanonicalJson(value), "utf8");
}

function sha256Hex(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeEnvironment(value: string) {
  const normalized = {
    DEVELOPMENT: "development",
    PREVIEW: "preview",
    STAGING: "staging",
    PRODUCTION: "production",
    development: "development",
    preview: "preview",
    staging: "staging",
    production: "production",
  }[value];
  if (!normalized) failConflict();
  return normalized;
}

function normalizeDelegation(input: AidosDelegationInput) {
  const value = validateAidosDelegationInput(input);
  const sortStrings = (items: readonly string[]) =>
    [...items].sort((left, right) =>
      Buffer.compare(
        Buffer.from(JSON.stringify(left)),
        Buffer.from(JSON.stringify(right)),
      ),
    );
  const policyConstraints = value.policyConstraints
    .map((constraint) => ({
      key: constraint.key.normalize("NFC"),
      operator: constraint.operator,
      value: Array.isArray(constraint.value)
        ? sortStrings(constraint.value.map((item) => item.normalize("NFC")))
        : typeof constraint.value === "string"
          ? constraint.value.normalize("NFC")
          : constraint.value,
    }))
    .sort((left, right) =>
      Buffer.compare(canonicalBytes(left), canonicalBytes(right)),
    );
  const contextRefs = value.contextRefs
    .map((ref) => ({
      digest: ref.digest,
      ref_id: ref.refId.normalize("NFC"),
      ref_type: ref.refType,
    }))
    .sort((left, right) =>
      Buffer.compare(
        canonicalBytes([left.ref_type, left.ref_id]),
        canonicalBytes([right.ref_type, right.ref_id]),
      ),
    );
  const artifactRefs = value.artifactRefs
    .map((ref) => ({
      digest: ref.digest,
      ref_id: ref.refId.normalize("NFC"),
      ref_type: ref.refType,
    }))
    .sort((left, right) =>
      Buffer.compare(
        canonicalBytes([left.ref_type, left.ref_id]),
        canonicalBytes([right.ref_type, right.ref_id]),
      ),
    );
  return {
    artifact_refs: artifactRefs,
    context_refs: contextRefs,
    delegation_request_id: value.delegationRequestId.normalize("NFC"),
    development_intent: value.developmentIntent
      .replace(/\r\n?/gu, "\n")
      .normalize("NFC"),
    policy_constraints: policyConstraints,
    preferred_capabilities: sortStrings(value.preferredCapabilities),
    priority: value.priority,
    requested_role_class: value.requestedRoleClass,
    required_capabilities: sortStrings(value.requiredCapabilities),
  };
}

function requireTimestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    !timestampPattern.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    failStale();
  return value;
}

function requireDigest(value: unknown): string {
  if (typeof value !== "string" || !digestPattern.test(value)) failStale();
  return value;
}

function requireUuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) failStale();
  return value;
}

function parseProjection(
  value: unknown,
  expectedType: string,
  outer: {
    authorityEpoch: string;
    environment: string;
    observedAt: string;
    projectRef: string;
    snapshotId: string;
    validUntil: string;
  },
): ProjectionWire {
  const projection = record(value);
  exactKeys(projection, [
    "projection_type",
    "projection_id",
    "projection_revision",
    "authority_source",
    "project_id",
    "environment",
    "snapshot_id",
    "authority_epoch",
    "observed_at",
    "valid_until",
    "currentness_state",
    "evidence_ref",
    "evidence_hash",
    "reason_codes",
    "body",
  ]);
  if (
    projection.projection_type !== expectedType ||
    projection.projection_id !==
      `urn:aidos:projection:${outer.snapshotId}:${expectedType}` ||
    projection.authority_source !== AIDOS_AUTHORITY_SOURCE ||
    projection.project_id !== outer.projectRef ||
    projection.environment !== outer.environment ||
    projection.snapshot_id !== outer.snapshotId ||
    projection.authority_epoch !== outer.authorityEpoch ||
    projection.observed_at !== outer.observedAt ||
    projection.valid_until !== outer.validUntil ||
    projection.currentness_state !== "CURRENT" ||
    typeof projection.evidence_ref !== "string" ||
    !/^aidos-evidence:sha256:[0-9a-f]{64}$/u.test(projection.evidence_ref) ||
    !Array.isArray(projection.reason_codes) ||
    !projection.reason_codes.every((reason) => typeof reason === "string")
  )
    failConflict();
  requireDigest(projection.projection_revision);
  requireDigest(projection.evidence_hash);
  record(projection.body);
  return projection as unknown as ProjectionWire & {
    body: Record<string, unknown>;
  };
}

function projectionBase(projection: ProjectionWire) {
  return {
    projectRef: projection.project_id,
    revision: projection.projection_revision,
    observedAt: projection.observed_at,
    freshUntil: projection.valid_until,
    evidenceRef: projection.evidence_ref,
    source: AIDOS_AUTHORITY_SOURCE,
  } as const;
}

function parseResolve(
  value: unknown,
  expected: {
    correlationId: string;
    environment: string;
    projectRef: string;
    delegationRequestId: string;
  },
): ResolvedSnapshot {
  const envelope = record(value);
  exactKeys(envelope, [
    "contract_version",
    "operation",
    "authority_source",
    "project_id",
    "environment",
    "snapshot_id",
    "authority_epoch",
    "observed_at",
    "valid_until",
    "currentness_state",
    "correlation_id",
    "projections",
  ]);
  if (
    envelope.contract_version !== AIDOS_EXTERNAL_AUTHORITY_CONTRACT ||
    envelope.operation !== "RESOLVE" ||
    envelope.authority_source !== AIDOS_AUTHORITY_SOURCE ||
    envelope.project_id !== expected.projectRef ||
    envelope.environment !== expected.environment ||
    envelope.currentness_state !== "CURRENT" ||
    envelope.correlation_id !== expected.correlationId
  )
    failConflict();
  const snapshotId = requireUuid(envelope.snapshot_id);
  const authorityEpoch = requireDigest(envelope.authority_epoch);
  const observedAt = requireTimestamp(envelope.observed_at);
  const validUntil = requireTimestamp(envelope.valid_until);
  if (Date.parse(validUntil) <= Date.parse(observedAt)) failStale();
  const outer = {
    authorityEpoch,
    environment: expected.environment,
    observedAt,
    projectRef: expected.projectRef,
    snapshotId,
    validUntil,
  };
  const projections = record(envelope.projections);
  exactKeys(projections, [
    "project_registration",
    "runtime_availability",
    "delegation_eligibility",
  ]);
  const registration = parseProjection(
    projections.project_registration,
    AIDOS_PROJECT_REGISTRATION_SOURCE,
    outer,
  );
  const availability = parseProjection(
    projections.runtime_availability,
    AIDOS_AVAILABILITY_SOURCE,
    outer,
  );
  const eligibility = parseProjection(
    projections.delegation_eligibility,
    AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
    outer,
  );
  exactKeys(registration.body, [
    "registration_id",
    "registration_state",
    "registration_revision",
    "registration_authority",
    "registration_registry_revision",
    "canonical_project_identity_digest",
    "source_import_digest",
  ]);
  exactKeys(availability.body, [
    "runtime_state",
    "runtime_revision",
    "scheduler_environment_revision",
    "worker_authority_revision",
    "eligible_worker_count",
    "earliest_heartbeat_expiry",
  ]);
  exactKeys(eligibility.body, [
    "delegation_request_id",
    "request_digest",
    "eligibility_state",
    "policy_revision",
    "capability_revision",
    "dispatch_policy_revision",
    "project_revision_binding",
    "matched_required_capabilities",
    "matched_preferred_capabilities",
  ]);
  if (
    !["REGISTERED", "NOT_REGISTERED"].includes(
      String(registration.body.registration_state),
    ) ||
    !["AVAILABLE", "UNAVAILABLE"].includes(
      String(availability.body.runtime_state),
    ) ||
    !["ELIGIBLE", "INELIGIBLE"].includes(
      String(eligibility.body.eligibility_state),
    ) ||
    eligibility.body.delegation_request_id !== expected.delegationRequestId
  )
    failStale();
  const requestDigest = requireDigest(eligibility.body.request_digest);
  const projectionBindings = [registration, availability, eligibility].map(
    (projection) => ({
      projectionType: projection.projection_type,
      projectionId: projection.projection_id,
      projectionRevision: projection.projection_revision,
    }),
  ) as AidosProjectionBinding[];
  const snapshotBinding = validateAidosSnapshotBinding({
    snapshotId,
    authorityEpoch,
    requestDigest,
    projectionBindings,
  });
  const suspended = registration.reason_codes.some((reason) =>
    ["REGISTRATION_SUSPENDED", "REGISTRATION_REVOKED"].includes(String(reason)),
  );
  return Object.freeze({
    availability: Object.freeze({
      ...projectionBase(availability),
      sourceProjection: AIDOS_AVAILABILITY_SOURCE,
      state: availability.body.runtime_state,
    }) as AidosAvailabilitySnapshot,
    registration: Object.freeze({
      ...projectionBase(registration),
      sourceProjection: AIDOS_PROJECT_REGISTRATION_SOURCE,
      state: suspended
        ? "SUSPENDED"
        : registration.body.registration_state === "REGISTERED"
          ? "PROJECT_ONBOARDED"
          : "PROJECT_NOT_ONBOARDED",
    }) as AidosProjectOnboardingSnapshot,
    eligibility: Object.freeze({
      ...projectionBase(eligibility),
      sourceProjection: AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
      state: eligibility.body.eligibility_state,
      snapshotBinding,
    }) as AidosDelegationEligibilitySnapshot,
  });
}

function parseRevalidation(
  value: unknown,
  expected: {
    correlationId: string;
    environment: string;
    projectRef: string;
    snapshotBinding: AidosSnapshotBinding;
  },
): AidosCanonicalRevalidationObservation {
  const result = record(value);
  exactKeys(result, [
    "contract_version",
    "operation",
    "correlation_id",
    "project_id",
    "environment",
    "snapshot_id",
    "submitted_authority_epoch",
    "revalidation_state",
    "checked_at",
    "valid_until",
    "projection_results",
  ]);
  if (
    result.contract_version !== AIDOS_EXTERNAL_AUTHORITY_CONTRACT ||
    result.operation !== "REVALIDATE" ||
    result.correlation_id !== expected.correlationId ||
    result.project_id !== expected.projectRef ||
    result.environment !== expected.environment ||
    result.snapshot_id !== expected.snapshotBinding.snapshotId ||
    result.submitted_authority_epoch !==
      expected.snapshotBinding.authorityEpoch ||
    !["CURRENT", "SUPERSEDED", "STALE", "NOT_FOUND"].includes(
      String(result.revalidation_state),
    ) ||
    !Array.isArray(result.projection_results)
  )
    failConflict();
  const state =
    result.revalidation_state as AidosCanonicalRevalidationObservation["state"];
  const checkedAt = requireTimestamp(result.checked_at);
  const validUntil =
    result.valid_until === null ? null : requireTimestamp(result.valid_until);
  if ((state === "CURRENT") !== (validUntil !== null)) failStale();
  const revalidationStates = [
    "CURRENT",
    "STALE",
    "SUPERSEDED",
    "NOT_FOUND",
  ] as const;
  const reasonCodeByState = {
    CURRENT: null,
    SUPERSEDED: "SNAPSHOT_SUPERSEDED",
    STALE: "SNAPSHOT_STALE",
    NOT_FOUND: "SNAPSHOT_METADATA_NOT_FOUND",
  } as const;
  const projectionResults = result.projection_results.map((item, index) => {
    const projection = record(item);
    exactKeys(projection, [
      "projection_type",
      "projection_id",
      "submitted_revision",
      "state",
      "current_revision",
      "reason_code",
    ]);
    const binding = expected.snapshotBinding.projectionBindings[index];
    if (
      !binding ||
      projection.projection_type !== binding.projectionType ||
      projection.projection_id !== binding.projectionId ||
      projection.submitted_revision !== binding.projectionRevision ||
      !revalidationStates.includes(
        projection.state as (typeof revalidationStates)[number],
      ) ||
      (projection.state === "CURRENT" &&
        projection.current_revision !== binding.projectionRevision)
    )
      failConflict();
    const projectionState =
      projection.state as (typeof revalidationStates)[number];
    if (projection.reason_code !== reasonCodeByState[projectionState])
      failConflict();
    if (
      projection.current_revision !== null &&
      typeof projection.current_revision === "string"
    )
      requireDigest(projection.current_revision);
    return Object.freeze({ ...binding });
  });
  if (projectionResults.length === 0) {
    if (state !== "NOT_FOUND") failConflict();
  } else {
    if (projectionResults.length !== 3) failConflict();
    const precedence = new Map([
      ["CURRENT", 0],
      ["STALE", 1],
      ["SUPERSEDED", 2],
      ["NOT_FOUND", 3],
    ] as const);
    const reducedState = result.projection_results.reduce(
      (current, item) => {
        const itemState = record(item)
          .state as (typeof revalidationStates)[number];
        return precedence.get(itemState)! > precedence.get(current)!
          ? itemState
          : current;
      },
      "CURRENT" as (typeof revalidationStates)[number],
    );
    if (reducedState !== state) failConflict();
  }
  return Object.freeze({
    kind: "AIDOS_CANONICAL_REVALIDATION",
    projectRef: expected.projectRef,
    state,
    checkedAt,
    validUntil,
    snapshotBinding: expected.snapshotBinding,
    projectionResults: Object.freeze(projectionResults),
  });
}

export class HmacAidosAuthorityBackend implements AidosAuthorityBackend {
  readonly #baseUrl: string;
  readonly #readerId: string;
  readonly #keyId: string;
  readonly #identitySubject: string;
  readonly #secret: string;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;
  readonly #randomUUID: () => string;
  readonly #randomNonce: () => string;
  readonly #timeoutMs: number;
  readonly #pending = new Map<string, PendingSnapshot>();

  constructor(config: AidosAuthorityRuntimeConfig) {
    const url = new URL(config.baseUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "") ||
      !config.readerId.trim() ||
      !config.keyId.trim() ||
      !config.identitySubject.trim() ||
      !config.hmacSecret
    )
      failStale();
    this.#baseUrl = url.origin;
    this.#readerId = config.readerId;
    this.#keyId = config.keyId;
    this.#identitySubject = config.identitySubject;
    this.#secret = config.hmacSecret;
    this.#fetch = config.dependencies?.fetch ?? fetch;
    this.#now = config.dependencies?.now ?? (() => new Date());
    this.#randomUUID = config.dependencies?.randomUUID ?? randomUUID;
    this.#randomNonce =
      config.dependencies?.randomNonce ??
      (() => randomBytes(16).toString("base64url"));
    this.#timeoutMs = config.requestTimeoutMs ?? 5_000;
    if (
      !Number.isInteger(this.#timeoutMs) ||
      this.#timeoutMs < 1 ||
      this.#timeoutMs > 5_000
    )
      failStale();
  }

  async #post(path: string, body: Record<string, unknown>): Promise<unknown> {
    const payload = serializeAidosCanonicalJson(body);
    if (Buffer.byteLength(payload) > 64 * 1024) failStale();
    let lastStatus = 0;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const timestamp = Math.floor(this.#now().getTime() / 1000).toString();
      const nonce = this.#randomNonce();
      const correlationId = String(body.correlation_id);
      const contentHash = sha256Hex(payload);
      const signingBytes = [
        "AIDOS-HMAC-READ-V1",
        this.#keyId,
        this.#readerId,
        this.#identitySubject,
        "POST",
        path,
        "",
        contentHash,
        timestamp,
        nonce,
        correlationId,
        AIDOS_EXTERNAL_AUTHORITY_CONTRACT,
      ].join("\n");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
      try {
        const response = await this.#fetch(`${this.#baseUrl}${path}`, {
          method: "POST",
          body: payload,
          signal: controller.signal,
          headers: {
            "content-type": AIDOS_EXTERNAL_AUTHORITY_MEDIA_TYPE,
            "x-aidos-content-sha256": contentHash,
            "x-aidos-correlation-id": correlationId,
            "x-aidos-identity": this.#identitySubject,
            "x-aidos-key-id": this.#keyId,
            "x-aidos-nonce": nonce,
            "x-aidos-reader-id": this.#readerId,
            "x-aidos-signature": createHmac("sha256", this.#secret)
              .update(signingBytes)
              .digest("base64url"),
            "x-aidos-timestamp": timestamp,
          },
        });
        lastStatus = response.status;
        if (retryableStatuses.has(response.status) && attempt === 0) continue;
        if (!response.ok) {
          if (response.status === 409) failConflict();
          failStale();
        }
        if (
          response.headers.get("content-type") !==
          AIDOS_EXTERNAL_AUTHORITY_MEDIA_TYPE
        )
          failStale();
        const text = await response.text();
        if (Buffer.byteLength(text) > 256 * 1024) failStale();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          failStale();
        }
        if (serializeAidosCanonicalJson(parsed) !== text) failStale();
        return parsed;
      } catch (error) {
        if (error instanceof RoutingContractError) throw error;
        if (attempt === 0) continue;
        failStale();
      } finally {
        clearTimeout(timeout);
      }
    }
    if (lastStatus === 409) failConflict();
    failStale();
  }

  #key(input: { environment: string; delegationInput: AidosDelegationInput }) {
    return serializeAidosCanonicalJson({
      environment: normalizeEnvironment(input.environment),
      project_id: input.delegationInput.aidosProjectRef,
      delegation: normalizeDelegation(input.delegationInput),
    });
  }

  #resolve(input: {
    environment: string;
    delegationInput: AidosDelegationInput;
  }) {
    const canonicalInput = validateAidosDelegationInput(input.delegationInput);
    const correlationId = this.#randomUUID();
    const environment = normalizeEnvironment(input.environment);
    return this.#post(resolvePath, {
      contract_version: AIDOS_EXTERNAL_AUTHORITY_CONTRACT,
      operation: "RESOLVE",
      correlation_id: correlationId,
      project_id: canonicalInput.aidosProjectRef,
      environment,
      delegation: normalizeDelegation(canonicalInput),
    }).then((value) =>
      parseResolve(value, {
        correlationId,
        environment,
        projectRef: canonicalInput.aidosProjectRef,
        delegationRequestId: canonicalInput.delegationRequestId,
      }),
    );
  }

  async #read(
    input: { environment: string; delegationInput: AidosDelegationInput },
    projection: "availability" | "registration" | "eligibility",
  ) {
    const key = this.#key(input);
    let pending = this.#pending.get(key);
    if (!pending || pending.consumed.has(projection)) {
      pending = { promise: this.#resolve(input), consumed: new Set() };
      this.#pending.set(key, pending);
    }
    pending.consumed.add(projection);
    try {
      const snapshot = await pending.promise;
      if (pending.consumed.size === 3) this.#pending.delete(key);
      return snapshot[projection];
    } catch (error) {
      this.#pending.delete(key);
      throw error;
    }
  }

  readAidosAvailability(input: AidosAvailabilityQuery) {
    if (input.targetRef !== input.delegationInput.aidosProjectRef)
      failConflict();
    return this.#read(
      input,
      "availability",
    ) as Promise<AidosAvailabilitySnapshot>;
  }

  readProjectOnboardingState(input: AidosProjectOnboardingQuery) {
    if (input.projectRef !== input.delegationInput.aidosProjectRef)
      failConflict();
    return this.#read(
      input,
      "registration",
    ) as Promise<AidosProjectOnboardingSnapshot>;
  }

  readDelegationEligibility(input: AidosDelegationEligibilityQuery) {
    if (input.projectRef !== input.delegationInput.aidosProjectRef)
      failConflict();
    return this.#read(
      input,
      "eligibility",
    ) as Promise<AidosDelegationEligibilitySnapshot>;
  }

  async revalidate(
    input: AidosRevalidationQuery,
  ): Promise<AidosCanonicalRevalidationObservation> {
    const snapshotBinding = validateAidosSnapshotBinding(input.snapshotBinding);
    if (
      input.availability.projectRef !== input.registration.projectRef ||
      input.availability.projectRef !== input.eligibility.projectRef
    )
      failConflict();
    const correlationId = this.#randomUUID();
    const environment = normalizeEnvironment(input.context.environment ?? "");
    const parsed = await this.#post(revalidatePath, {
      contract_version: AIDOS_EXTERNAL_AUTHORITY_CONTRACT,
      operation: "REVALIDATE",
      correlation_id: correlationId,
      project_id: input.availability.projectRef,
      environment,
      snapshot_id: snapshotBinding.snapshotId,
      authority_epoch: snapshotBinding.authorityEpoch,
      request_digest: snapshotBinding.requestDigest,
      projection_bindings: snapshotBinding.projectionBindings.map(
        (binding) => ({
          projection_type: binding.projectionType,
          projection_id: binding.projectionId,
          projection_revision: binding.projectionRevision,
        }),
      ),
    });
    return parseRevalidation(parsed, {
      correlationId,
      environment,
      projectRef: input.availability.projectRef,
      snapshotBinding,
    });
  }
}
