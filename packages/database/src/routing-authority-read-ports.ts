import { createHash } from "node:crypto";

import type {
  AiRegistryCapabilityRecord,
  AiRegistryHostRecord,
  AiRegistryModelCapabilityRecord,
  AiRegistryModelHostBindingRecord,
  AiRegistryModelRecord,
  AiRegistryProviderRecord,
  AiRegistryRepository,
  AiRegistryRoleCompatibilityRecord,
} from "./ai-registry-repository.js";
import { PostgresAiRegistryRepository } from "./ai-registry-repository.js";
import type {
  HumanApprovalExpectedBinding,
  HumanApprovalRequest,
  HumanApprovalRevalidationResult,
} from "./phase14-runtime-contracts.js";
import type { Phase15dClassificationHandoff } from "./request-classification-contracts.js";
import type {
  ClassificationStalenessInput,
  CurrentClassificationResult,
  RequestClassificationRuntime,
  ResolveCurrentClassificationInput,
} from "./request-classification-runtime.js";
import type { PostgresHumanApprovalRuntime } from "./human-approval-runtime.js";
import type { RuntimeDatabase } from "./postgres.js";
import {
  createRegistryFreshnessPolicyReadPort,
  deriveRegistryFreshUntil,
  type RegistryFreshnessPolicyReadPort,
} from "./registry-freshness-policy-read-port.js";
import {
  REGISTRY_FRESHNESS_SCOPE,
  type RegistryFreshnessEnvironment,
} from "./registry-freshness-policy-repository.js";
import {
  RoutingContractError,
  type RoutingErrorCode,
} from "./routing-contracts.js";

export function canonicalOrdinalCompare(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export const AIDOS_AUTHORITY_SOURCE =
  "AIDOS_EXTERNAL_ORCHESTRATOR_INTEGRATION_CONTRACT_V1_1" as const;
export const AIDOS_PROJECT_REGISTRATION_SOURCE =
  "AIDOS_PROJECT_REGISTRATION_PROJECTION" as const;
export const AIDOS_AVAILABILITY_SOURCE =
  "AIDOS_RUNTIME_AVAILABILITY_PROJECTION" as const;
export const AIDOS_DELEGATION_ELIGIBILITY_SOURCE =
  "AIDOS_DELEGATION_ELIGIBILITY_PROJECTION" as const;

export type ExactRequestContext = Omit<
  ResolveCurrentClassificationInput,
  "staleness"
> & {
  readonly staleness: Required<ClassificationStalenessInput>;
};
interface AuthorityResultBase {
  readonly current: boolean;
  readonly authority: string;
  readonly identity: string;
  readonly revision: string;
  readonly checkedAt: string;
}
export interface AuthorityReferenceCurrentnessResult extends AuthorityResultBase {
  readonly freshnessModel: "REFERENCE_VERSION_CURRENTNESS";
}
export interface AuthorityExpiryResult extends AuthorityResultBase {
  readonly freshUntil: string;
  readonly freshnessModel: "AUTHORITY_EXPIRY";
}
export type AuthorityFreshnessResult =
  AuthorityReferenceCurrentnessResult | AuthorityExpiryResult;
export interface ClassificationAuthoritySnapshot extends AuthorityReferenceCurrentnessResult {
  readonly handoff: Phase15dClassificationHandoff;
  readonly classificationId: string;
  readonly requestId: string;
  readonly classificationState: "VALIDATED";
  readonly stalenessState: "CURRENT";
  readonly policyResolved: true;
  readonly policyResolutionRef: string;
  readonly policyResolutionVersion: string;
  readonly classificationVersion: number;
  readonly currentnessProof: string;
  readonly validatedAt: string;
}
export interface ClassificationAuthorityReadPort {
  readCurrent(
    requestId: string,
    context: ExactRequestContext,
  ): Promise<ClassificationAuthoritySnapshot>;
  revalidate(
    versionId: string,
    context: ExactRequestContext,
  ): Promise<AuthorityFreshnessResult>;
}

interface SafeRegistryBase {
  readonly id: string;
  readonly version: number;
  readonly status: string;
}
export interface RegistryProviderSnapshot extends SafeRegistryBase {
  readonly kind: "PROVIDER";
  readonly healthState: string;
  readonly readinessState: string;
}
export interface RegistryModelSnapshot extends SafeRegistryBase {
  readonly kind: "MODEL";
  readonly providerId: string;
  readonly healthState: string;
  readonly readinessState: string;
}
export interface RegistryRuntimeAdapterSnapshot extends SafeRegistryBase {
  readonly kind: "RUNTIME_ADAPTER";
  readonly providerId: string | null;
  readonly executionMode: string;
  readonly healthState: string;
  readonly readinessState: string;
}
export interface RegistryCapabilitySnapshot extends SafeRegistryBase {
  readonly kind: "CAPABILITY";
  readonly capabilityKey: string;
  readonly capabilityClass: string;
}
export interface RegistryModelHostBindingSnapshot extends SafeRegistryBase {
  readonly kind: "MODEL_HOST_BINDING";
  readonly modelId: string;
  readonly runtimeAdapterId: string;
  readonly healthState: string;
  readonly readinessState: string;
  readonly costClass: string;
  readonly latencyClass: string;
  readonly qualityClass: string;
}
export interface RegistryModelCapabilitySnapshot extends SafeRegistryBase {
  readonly kind: "MODEL_CAPABILITY_BINDING";
  readonly modelId: string;
  readonly modelHostBindingId: string;
  readonly runtimeAdapterId: string;
  readonly capabilityId: string;
  readonly supportLevel: string;
  readonly confidenceClass: string;
  readonly verificationFreshness: string;
}
export interface RegistryRoleCompatibilitySnapshot extends SafeRegistryBase {
  readonly kind: "ROLE_COMPATIBILITY";
  readonly modelId: string;
  readonly modelHostBindingId: string;
  readonly runtimeAdapterId: string;
  readonly domainKey: string;
  readonly roleKey: string;
  readonly eligibility: string;
  readonly fallbackEligible: boolean;
  readonly independentReviewEligible: boolean;
  readonly adversarialReviewEligible: boolean;
}
export interface RegistrySnapshotQuery {
  readonly resourceRefs: readonly string[];
}
export interface RegistryTransactionSnapshot {
  readonly xmin: string;
  readonly xmax: string;
}
interface RegistryCanonicalObservation {
  readonly authoritySource: "PHASE15B_AI_REGISTRY";
  readonly transactionSnapshot: RegistryTransactionSnapshot;
  readonly observedAt: string;
  readonly freshUntil: string;
  readonly freshnessPolicyRef: string;
  readonly freshnessPolicyVersion: string;
  readonly freshnessMaxAgeMs: number;
  readonly providers: readonly AiRegistryProviderRecord[];
  readonly models: readonly AiRegistryModelRecord[];
  readonly runtimeAdapters: readonly AiRegistryHostRecord[];
  readonly capabilities: readonly AiRegistryCapabilityRecord[];
  readonly modelHostBindings: readonly AiRegistryModelHostBindingRecord[];
  readonly modelCapabilities: readonly AiRegistryModelCapabilityRecord[];
  readonly roleCompatibilities: readonly AiRegistryRoleCompatibilityRecord[];
}
interface RegistryCanonicalSnapshotBackend {
  readCanonicalSnapshot(
    input: RegistrySnapshotQuery,
  ): Promise<RegistryCanonicalObservation>;
}
export interface RegistryAuthoritySnapshot {
  readonly snapshotRef: string;
  readonly revision: string;
  readonly authoritySource: "PHASE15B_AI_REGISTRY";
  readonly transactionSnapshot: RegistryTransactionSnapshot;
  readonly freshnessPolicyRef: string;
  readonly freshnessPolicyVersion: string;
  readonly freshnessMaxAgeMs: number;
  readonly observedAt: string;
  readonly freshUntil: string;
  readonly providers: readonly RegistryProviderSnapshot[];
  readonly models: readonly RegistryModelSnapshot[];
  readonly runtimeAdapters: readonly RegistryRuntimeAdapterSnapshot[];
  readonly capabilities: readonly RegistryCapabilitySnapshot[];
  readonly modelHostBindings: readonly RegistryModelHostBindingSnapshot[];
  readonly modelCapabilities: readonly RegistryModelCapabilitySnapshot[];
  readonly roleCompatibilities: readonly RegistryRoleCompatibilitySnapshot[];
}
export interface RegistryAuthorityReadPort {
  readSnapshot(
    input: RegistrySnapshotQuery,
  ): Promise<RegistryAuthoritySnapshot>;
  revalidate(
    snapshotRef: string,
    revision: string,
    resourceRefs: string[],
  ): Promise<AuthorityFreshnessResult>;
}

class PostgresPhase15bRegistrySnapshotBackend implements RegistryCanonicalSnapshotBackend {
  constructor(
    private readonly database: RuntimeDatabase,
    private readonly registry: AiRegistryRepository,
    private readonly freshnessPolicy: RegistryFreshnessPolicyReadPort,
    private readonly environment: RegistryFreshnessEnvironment,
  ) {}

  async readCanonicalSnapshot(
    _input: RegistrySnapshotQuery,
  ): Promise<RegistryCanonicalObservation> {
    await this.database.exec("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    try {
      const marker = await this.database.query<{
        xmin: string;
        xmax: string;
        observed_at: Date | string;
        isolation_level: string;
        read_only: string;
      }>(
        `SELECT txid_snapshot_xmin(txid_current_snapshot())::text AS xmin,
                txid_snapshot_xmax(txid_current_snapshot())::text AS xmax,
                transaction_timestamp() AS observed_at,
                current_setting('transaction_isolation') AS isolation_level,
                current_setting('transaction_read_only') AS read_only`,
      );
      if (
        marker.rows.length !== 1 ||
        marker.rows[0]!.isolation_level !== "repeatable read" ||
        marker.rows[0]!.read_only !== "on"
      )
        throw new RoutingContractError("REGISTRY_STALE");
      const policy = await this.freshnessPolicy.resolveCurrentPolicy({
        registryScope: REGISTRY_FRESHNESS_SCOPE,
        environment: this.environment,
      });
      const providers = await this.registry.listProviders();
      const models = await this.registry.listModels();
      const runtimeAdapters = await this.registry.listHosts();
      const capabilities = await this.registry.listCapabilities();
      const modelHostBindings = await this.registry.listModelHostBindings();
      const roleCompatibilities = await this.registry.listRoleCompatibilities();
      const modelCapabilities = (
        await Promise.all(
          models.map((model) => this.registry.listModelCapabilities(model.id)),
        )
      ).flat();
      const observedAt = new Date(marker.rows[0]!.observed_at).toISOString();
      const freshUntil = deriveRegistryFreshUntil(observedAt, policy.maxAgeMs);
      await this.database.exec("COMMIT");
      return {
        authoritySource: "PHASE15B_AI_REGISTRY",
        transactionSnapshot: {
          xmin: marker.rows[0]!.xmin,
          xmax: marker.rows[0]!.xmax,
        },
        observedAt,
        freshUntil,
        freshnessPolicyRef: policy.policyRef,
        freshnessPolicyVersion: String(policy.policyVersion),
        freshnessMaxAgeMs: policy.maxAgeMs,
        providers,
        models,
        runtimeAdapters,
        capabilities,
        modelHostBindings,
        modelCapabilities,
        roleCompatibilities,
      };
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

export interface ApprovalRequirementQuery {
  readonly approvalRequestId: string;
  readonly expected: HumanApprovalExpectedBinding;
}
export interface HumanApprovalSnapshot extends AuthorityExpiryResult {
  readonly state:
    "APPROVED" | "REJECTED" | "MISSING" | "EXPIRED" | "REVOKED" | "STALE";
  readonly approvalRef: string | null;
  readonly authorityRuleRef: string;
  readonly approvalPolicyRef: string;
  readonly approvalPolicyVersion: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly targetVersion: string;
  readonly targetHash: string;
  readonly approvalStatus: string;
  readonly approvalValidity: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly reasonCode: string;
}
export interface HumanApprovalAuthorityReadPort {
  resolveRequirement(
    input: ApprovalRequirementQuery,
  ): Promise<HumanApprovalSnapshot>;
  revalidate(
    approvalRef: string,
    targetVersion: string,
    targetHash: string,
  ): Promise<HumanApprovalSnapshot>;
}

export interface AidosAvailabilityQuery {
  readonly environment: string;
  readonly targetRef: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly scopeRef: string;
  readonly correlationId: string;
}
export interface AidosProjectOnboardingQuery {
  readonly projectRef: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly environment: string;
  readonly scopeRef: string;
}
export interface AidosDelegationEligibilityQuery extends AidosProjectOnboardingQuery {
  readonly classificationVersionId: string;
  readonly requiredCapabilityRefs: readonly string[];
}
export interface AidosProjectionReference {
  readonly projectRef: string;
  readonly revision: string;
}
export interface AidosRevalidationQuery {
  readonly availability: AidosProjectionReference;
  readonly registration: AidosProjectionReference;
  readonly eligibility: AidosProjectionReference;
  readonly context: ExactRequestContext;
}
interface AidosSnapshotBase {
  readonly projectRef: string;
  readonly revision: string;
  readonly observedAt: string;
  readonly freshUntil: string;
  readonly evidenceRef: string;
  readonly source: typeof AIDOS_AUTHORITY_SOURCE;
}
export interface AidosAvailabilitySnapshot extends AidosSnapshotBase {
  readonly sourceProjection: typeof AIDOS_AVAILABILITY_SOURCE;
  readonly state: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
}
export interface AidosProjectOnboardingSnapshot extends AidosSnapshotBase {
  readonly sourceProjection: typeof AIDOS_PROJECT_REGISTRATION_SOURCE;
  readonly state:
    "PROJECT_ONBOARDED" | "PROJECT_NOT_ONBOARDED" | "SUSPENDED" | "UNKNOWN";
}
export interface AidosDelegationEligibilitySnapshot extends AidosSnapshotBase {
  readonly sourceProjection: typeof AIDOS_DELEGATION_ELIGIBILITY_SOURCE;
  readonly state: "ELIGIBLE" | "INELIGIBLE" | "UNKNOWN";
}
export interface AidosRevalidationObservation {
  readonly availability: AidosAvailabilitySnapshot;
  readonly registration: AidosProjectOnboardingSnapshot;
  readonly eligibility: AidosDelegationEligibilitySnapshot;
}
export interface AidosAuthorityReadPort {
  readAidosAvailability(
    input: AidosAvailabilityQuery,
  ): Promise<AidosAvailabilitySnapshot>;
  readProjectOnboardingState(
    input: AidosProjectOnboardingQuery,
  ): Promise<AidosProjectOnboardingSnapshot>;
  readDelegationEligibility(
    input: AidosDelegationEligibilityQuery,
  ): Promise<AidosDelegationEligibilitySnapshot>;
  revalidate(input: AidosRevalidationQuery): Promise<AuthorityFreshnessResult>;
}

interface ClassificationBackend {
  resolveCurrentClassification(
    input: ResolveCurrentClassificationInput,
  ): Promise<CurrentClassificationResult>;
  buildPhase15dClassificationHandoff: RequestClassificationRuntime["buildPhase15dClassificationHandoff"];
  validatePhase15dClassificationHandoff: RequestClassificationRuntime["validatePhase15dClassificationHandoff"];
}

const zonedTimestamp =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;

function requireFiniteTimestamp(value: unknown, code: RoutingErrorCode) {
  const match = typeof value === "string" ? zonedTimestamp.exec(value) : null;
  if (!match) throw new RoutingContractError(code);
  const [, year, month, day, hour, minute, second, offsetHour, offsetMinute] =
    match.map(Number);
  const daysInMonth = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  if (
    month! < 1 ||
    month! > 12 ||
    day! < 1 ||
    day! > daysInMonth ||
    hour! > 23 ||
    minute! > 59 ||
    second! > 59 ||
    offsetHour! > 23 ||
    offsetMinute! > 59
  )
    throw new RoutingContractError(code);
  const timestamp = Date.parse(match[0]);
  if (!Number.isFinite(timestamp)) throw new RoutingContractError(code);
  return timestamp;
}

function requireFutureTimestamp(
  value: unknown,
  floor: number,
  code: RoutingErrorCode,
) {
  const timestamp = requireFiniteTimestamp(value, code);
  if (!Number.isFinite(floor) || timestamp <= floor)
    throw new RoutingContractError(code);
  return new Date(timestamp).toISOString();
}

function mapClassificationFailure(error: unknown): never {
  const code = error instanceof Error ? error.message : "";
  if (code === "WORK_REQUEST_NOT_FOUND")
    throw new RoutingContractError("ROUTING_REQUEST_NOT_FOUND");
  if (code === "CLASSIFICATION_MISSING")
    throw new RoutingContractError("CLASSIFICATION_NOT_CURRENT");
  if (code === "CLASSIFICATION_HEAD_STALE" || code === "CLASSIFICATION_STALE")
    throw new RoutingContractError("CLASSIFICATION_STALE");
  if (code.startsWith("CLASSIFICATION_HEAD_"))
    throw new RoutingContractError("CLASSIFICATION_NOT_VALIDATED");
  if (code.includes("POLICY"))
    throw new RoutingContractError("CLASSIFICATION_POLICY_UNRESOLVED");
  throw new RoutingContractError("CLASSIFICATION_INVALID");
}

const classificationStalenessKeys = [
  "requestChanged",
  "taskChanged",
  "policyChanged",
  "capabilitiesChanged",
  "evidenceInvalid",
  "humanOverride",
  "conflictingClassification",
  "taxonomyInvalid",
] as const;

function requireClassificationFreshnessEvidence(
  context: ExactRequestContext,
): void {
  if (
    !context.staleness ||
    classificationStalenessKeys.some(
      (key) =>
        typeof context.staleness[key] !== "boolean" || context.staleness[key],
    )
  )
    throw new RoutingContractError("CLASSIFICATION_STALE");
}

export class Phase15cClassificationAuthorityAdapter implements ClassificationAuthorityReadPort {
  constructor(
    private readonly runtime: ClassificationBackend,
    private readonly now = () => new Date(),
  ) {}
  async readCurrent(
    requestId: string,
    context: ExactRequestContext,
  ): Promise<ClassificationAuthoritySnapshot> {
    try {
      requireClassificationFreshnessEvidence(context);
      if (context.requestId !== requestId)
        throw new RoutingContractError("CLASSIFICATION_INVALID");
      const current = await this.runtime.resolveCurrentClassification(context);
      const checkedAt = this.now().toISOString();
      if (
        current.classification.classificationState !== "VALIDATED" ||
        !current.classification.validatedAt
      )
        throw new RoutingContractError("CLASSIFICATION_NOT_VALIDATED");
      if (
        current.classification.staleAt ||
        !current.classification.policyResolutionRef ||
        !current.classification.policyResolutionVersion
      )
        throw new RoutingContractError("CLASSIFICATION_STALE");
      const handoff = this.runtime.buildPhase15dClassificationHandoff({
        classification: current.classification,
        policy: current.policy,
        freshnessProof: current.classification.canonicalPayloadFingerprint,
        organizationId: current.request.organizationId,
        projectId: current.request.projectId,
        environment: current.request.environment,
      });
      await this.runtime.validatePhase15dClassificationHandoff({
        ...handoff,
        ...context,
      });
      return Object.freeze({
        handoff,
        current: true,
        authority: "PHASE15C_CLASSIFICATION",
        identity: current.classification.classificationId,
        revision: [
          current.classification.version,
          current.classification.policyResolutionRef,
          current.classification.policyResolutionVersion,
          current.classification.canonicalPayloadFingerprint,
        ].join(":"),
        checkedAt,
        freshnessModel: "REFERENCE_VERSION_CURRENTNESS" as const,
        classificationId: current.classification.classificationId,
        requestId: current.classification.requestId,
        classificationState: "VALIDATED" as const,
        stalenessState: "CURRENT" as const,
        policyResolved: true as const,
        policyResolutionRef: current.classification.policyResolutionRef,
        policyResolutionVersion: current.classification.policyResolutionVersion,
        classificationVersion: current.classification.version,
        currentnessProof: current.classification.canonicalPayloadFingerprint,
        validatedAt: new Date(current.classification.validatedAt).toISOString(),
      });
    } catch (error) {
      if (error instanceof RoutingContractError) throw error;
      return mapClassificationFailure(error);
    }
  }
  async revalidate(
    versionId: string,
    context: ExactRequestContext,
  ): Promise<AuthorityFreshnessResult> {
    try {
      const current = await this.readCurrent(context.requestId, context);
      if (current.classificationId !== versionId)
        throw new RoutingContractError("CLASSIFICATION_NOT_CURRENT");
      return current;
    } catch (error) {
      if (error instanceof RoutingContractError) throw error;
      return mapClassificationFailure(error);
    }
  }
}

export class Phase15bRegistryAuthorityAdapter implements RegistryAuthorityReadPort {
  constructor(
    private readonly backend: RegistryCanonicalSnapshotBackend,
    private readonly clock: { now(): Date } = {
      now: () => new Date(),
    },
  ) {}
  static fromPostgres(
    database: RuntimeDatabase,
    environment: RegistryFreshnessEnvironment,
  ) {
    return new Phase15bRegistryAuthorityAdapter(
      new PostgresPhase15bRegistrySnapshotBackend(
        database,
        new PostgresAiRegistryRepository(database),
        createRegistryFreshnessPolicyReadPort(database),
        environment,
      ),
    );
  }
  async readSnapshot(
    input: RegistrySnapshotQuery,
  ): Promise<RegistryAuthoritySnapshot> {
    const observation = await this.backend.readCanonicalSnapshot(input);
    const observedAt = requireFiniteTimestamp(
      observation.observedAt,
      "REGISTRY_STALE",
    );
    const freshUntil = requireFutureTimestamp(
      observation.freshUntil,
      Math.max(observedAt, this.clock.now().getTime()),
      "REGISTRY_STALE",
    );
    if (
      observation.authoritySource !== "PHASE15B_AI_REGISTRY" ||
      !observation.transactionSnapshot.xmin ||
      !observation.transactionSnapshot.xmax ||
      !observation.freshnessPolicyRef ||
      !observation.freshnessPolicyVersion ||
      !Number.isSafeInteger(observation.freshnessMaxAgeMs) ||
      observation.freshnessMaxAgeMs <= 0
    )
      throw new RoutingContractError("REGISTRY_STALE");
    if (
      observation.modelCapabilities.some(
        (value) => value.verificationFreshness === "RECONCILING",
      )
    )
      throw new RoutingContractError("REGISTRY_RECONCILING");
    if (
      observation.modelCapabilities.some((value) =>
        ["STALE", "UNKNOWN"].includes(value.verificationFreshness),
      )
    )
      throw new RoutingContractError("REGISTRY_STALE");
    const {
      providers,
      models,
      runtimeAdapters: hosts,
      capabilities,
      modelHostBindings: bindings,
      modelCapabilities,
      roleCompatibilities: roles,
    } = observation;
    const included = new Set(input.resourceRefs);
    if (included.size > 0) {
      let changed = true;
      while (changed) {
        const before = included.size;
        for (const binding of bindings) {
          if (included.has(binding.id)) {
            included.add(binding.modelId);
            included.add(binding.hostId);
          }
        }
        for (const capability of modelCapabilities) {
          if (
            included.has(capability.id) ||
            included.has(capability.modelHostBindingId)
          ) {
            included.add(capability.id);
            included.add(capability.modelId);
            included.add(capability.modelHostBindingId);
            included.add(capability.hostId);
            included.add(capability.capabilityId);
          }
        }
        for (const compatibility of roles) {
          if (
            included.has(compatibility.id) ||
            included.has(compatibility.modelHostBindingId)
          ) {
            included.add(compatibility.id);
            included.add(compatibility.modelId);
            included.add(compatibility.modelHostBindingId);
            included.add(compatibility.hostId);
          }
        }
        for (const model of models)
          if (included.has(model.id)) included.add(model.providerId);
        for (const host of hosts)
          if (included.has(host.id) && host.providerId)
            included.add(host.providerId);
        changed = included.size !== before;
      }
    }
    const include = (id: string) => included.size === 0 || included.has(id);
    const byId = <T extends { readonly id: string }>(left: T, right: T) =>
      canonicalOrdinalCompare(left.id, right.id);
    const mapped = {
      providers: providers
        .filter((x) => include(x.id))
        .map((x) => ({
          kind: "PROVIDER" as const,
          id: x.id,
          version: x.version,
          status: x.status,
          healthState: x.healthState,
          readinessState: x.readinessState,
        }))
        .sort(byId),
      models: models
        .filter((x) => include(x.id))
        .map((x) => ({
          kind: "MODEL" as const,
          id: x.id,
          version: x.version,
          status: x.lifecycle,
          providerId: x.providerId,
          healthState: x.healthState,
          readinessState: x.readinessState,
        }))
        .sort(byId),
      runtimeAdapters: hosts
        .filter((x) => include(x.id))
        .map((x) => ({
          kind: "RUNTIME_ADAPTER" as const,
          id: x.id,
          version: x.version,
          status: x.status,
          providerId: x.providerId,
          executionMode: x.executionMode,
          healthState: x.healthState,
          readinessState: x.readinessState,
        }))
        .sort(byId),
      capabilities: capabilities
        .filter((x) => include(x.id))
        .map((x) => ({
          kind: "CAPABILITY" as const,
          id: x.id,
          version: x.version,
          status: x.status,
          capabilityKey: x.capabilityKey,
          capabilityClass: x.capabilityClass,
        }))
        .sort(byId),
      modelHostBindings: bindings
        .filter((x) => include(x.id))
        .map((x) => ({
          kind: "MODEL_HOST_BINDING" as const,
          id: x.id,
          version: x.version,
          status: x.lifecycle,
          modelId: x.modelId,
          runtimeAdapterId: x.hostId,
          healthState: x.healthState,
          readinessState: x.readinessState,
          costClass: x.costClass,
          latencyClass: x.latencyClass,
          qualityClass: x.qualityClass,
        }))
        .sort(byId),
      modelCapabilities: modelCapabilities
        .filter((x) => include(x.id))
        .map((x) => ({
          kind: "MODEL_CAPABILITY_BINDING" as const,
          id: x.id,
          version: x.version,
          status: x.status,
          modelId: x.modelId,
          modelHostBindingId: x.modelHostBindingId,
          runtimeAdapterId: x.hostId,
          capabilityId: x.capabilityId,
          supportLevel: x.supportLevel,
          confidenceClass: x.confidenceClass,
          verificationFreshness: x.verificationFreshness,
        }))
        .sort(byId),
      roleCompatibilities: roles
        .filter((x) => include(x.id))
        .map((x) => ({
          kind: "ROLE_COMPATIBILITY" as const,
          id: x.id,
          version: x.version,
          status: x.status,
          modelId: x.modelId,
          modelHostBindingId: x.modelHostBindingId,
          runtimeAdapterId: x.hostId,
          domainKey: x.domainKey,
          roleKey: x.roleKey,
          eligibility: x.eligibility,
          fallbackEligible: x.fallbackEligible,
          independentReviewEligible: x.independentReviewEligible,
          adversarialReviewEligible: x.adversarialReviewEligible,
        }))
        .sort(byId),
    };
    const canonical = JSON.stringify(
      Object.values(mapped)
        .flat()
        .sort((a, b) => canonicalOrdinalCompare(a.id, b.id)),
    );
    const hash = createHash("sha256").update(canonical).digest("hex");
    return {
      snapshotRef: `registry-snapshot:sha256:${hash}`,
      revision: `registry-revision:${observation.transactionSnapshot.xmin}:${observation.transactionSnapshot.xmax}:sha256:${hash}`,
      authoritySource: observation.authoritySource,
      transactionSnapshot: observation.transactionSnapshot,
      freshnessPolicyRef: observation.freshnessPolicyRef,
      freshnessPolicyVersion: observation.freshnessPolicyVersion,
      freshnessMaxAgeMs: observation.freshnessMaxAgeMs,
      observedAt: new Date(observedAt).toISOString(),
      freshUntil,
      ...mapped,
    };
  }
  async revalidate(
    snapshotRef: string,
    revision: string,
    resourceRefs: string[],
  ): Promise<AuthorityFreshnessResult> {
    const current = await this.readSnapshot({ resourceRefs: [] });
    if (current.snapshotRef !== snapshotRef || current.revision !== revision)
      throw new RoutingContractError("REGISTRY_CONFLICT");
    const currentResourceRefs = new Set([
      ...current.providers.map(({ id }) => id),
      ...current.models.map(({ id }) => id),
      ...current.runtimeAdapters.map(({ id }) => id),
      ...current.capabilities.map(({ id }) => id),
      ...current.modelHostBindings.map(({ id }) => id),
      ...current.modelCapabilities.map(({ id }) => id),
      ...current.roleCompatibilities.map(({ id }) => id),
    ]);
    if (
      resourceRefs.some((resourceRef) => !currentResourceRefs.has(resourceRef))
    )
      throw new RoutingContractError("REGISTRY_CONFLICT");
    return {
      current: true,
      authority: "PHASE15B_REGISTRY",
      identity: snapshotRef,
      revision,
      checkedAt: current.observedAt,
      freshUntil: current.freshUntil,
      freshnessModel: "AUTHORITY_EXPIRY",
    };
  }
}

type ApprovalBackend = Pick<
  PostgresHumanApprovalRuntime,
  "findRequest" | "resolveDecisionAuthorityRef" | "revalidate"
>;
function requireApprovalAllowed(result: HumanApprovalRevalidationResult): void {
  if (result.allowed) return;
  if (result.status === "REVOKED")
    throw new RoutingContractError("HUMAN_APPROVAL_REVOKED");
  if (result.status === "EXPIRED" || result.validity === "STALE")
    throw new RoutingContractError("HUMAN_APPROVAL_STALE");
  throw new RoutingContractError("HUMAN_APPROVAL_INVALID");
}
export class GovernedHumanApprovalAuthorityAdapter implements HumanApprovalAuthorityReadPort {
  constructor(
    private readonly runtime: ApprovalBackend,
    private readonly expectedByApprovalRef: (
      ref: string,
      version: string,
      hash: string,
    ) => Promise<
      { requestId: string; expected: HumanApprovalExpectedBinding } | undefined
    >,
  ) {}
  async resolveRequirement(
    input: ApprovalRequirementQuery,
  ): Promise<HumanApprovalSnapshot> {
    const request = await this.runtime.findRequest(input.approvalRequestId);
    if (!request) throw new RoutingContractError("HUMAN_APPROVAL_REQUIRED");
    const result = await this.runtime.revalidate(
      input.approvalRequestId,
      input.expected,
    );
    requireApprovalAllowed(result);
    const authorityRef = await this.runtime.resolveDecisionAuthorityRef(
      request.id,
      request.authorityOwnerActorId,
    );
    if (!authorityRef) throw new RoutingContractError("HUMAN_APPROVAL_INVALID");
    return this.map(result, request, input.expected, authorityRef);
  }
  async revalidate(
    approvalRef: string,
    targetVersion: string,
    targetHash: string,
  ): Promise<HumanApprovalSnapshot> {
    const binding = await this.expectedByApprovalRef(
      approvalRef,
      targetVersion,
      targetHash,
    );
    if (!binding) throw new RoutingContractError("HUMAN_APPROVAL_INVALID");
    const request = await this.runtime.findRequest(binding.requestId);
    if (
      !request ||
      request.approvalId !== approvalRef ||
      request.targetVersion !== targetVersion ||
      request.targetHash !== targetHash
    )
      throw new RoutingContractError("HUMAN_APPROVAL_INVALID");
    const result = await this.runtime.revalidate(
      binding.requestId,
      binding.expected,
    );
    requireApprovalAllowed(result);
    const authorityRef = await this.runtime.resolveDecisionAuthorityRef(
      request.id,
      request.authorityOwnerActorId,
    );
    if (!authorityRef) throw new RoutingContractError("HUMAN_APPROVAL_INVALID");
    return this.map(result, request, binding.expected, authorityRef);
  }
  private map(
    result: HumanApprovalRevalidationResult,
    request: HumanApprovalRequest,
    expected: HumanApprovalExpectedBinding,
    authorityRuleRef: string,
  ): HumanApprovalSnapshot {
    requireApprovalAllowed(result);
    return {
      current: true,
      authority: authorityRuleRef,
      identity: result.approvalId,
      revision: [
        result.approvalId,
        expected.targetVersion,
        expected.targetHash,
        authorityRuleRef,
      ].join(":"),
      checkedAt: new Date().toISOString(),
      freshUntil: new Date(request.freshUntil).toISOString(),
      freshnessModel: "AUTHORITY_EXPIRY",
      state: "APPROVED",
      approvalRef: result.approvalId,
      authorityRuleRef,
      approvalPolicyRef: request.approvalPolicyRef,
      approvalPolicyVersion: request.approvalPolicyVersion,
      targetType: request.targetType,
      targetId: request.targetId,
      targetVersion: request.targetVersion,
      targetHash: request.targetHash,
      approvalStatus: result.status,
      approvalValidity: result.validity,
      issuedAt: new Date(request.createdAt).toISOString(),
      expiresAt: new Date(request.expiresAt).toISOString(),
      reasonCode: result.reasonCode,
    };
  }
}

interface AidosAuthorityBackend {
  readAidosAvailability(
    input: AidosAvailabilityQuery,
  ): Promise<AidosAvailabilitySnapshot>;
  readProjectOnboardingState(
    input: AidosProjectOnboardingQuery,
  ): Promise<AidosProjectOnboardingSnapshot>;
  readDelegationEligibility(
    input: AidosDelegationEligibilityQuery,
  ): Promise<AidosDelegationEligibilitySnapshot>;
  revalidate(
    input: AidosRevalidationQuery,
  ): Promise<AidosRevalidationObservation>;
}
function requireCurrent<
  T extends AidosSnapshotBase & { readonly sourceProjection: string },
>(snapshot: T, expectedProjection: string): T {
  const observedAt = requireFiniteTimestamp(
    snapshot.observedAt,
    "AIDOS_AUTHORITY_STALE",
  );
  requireFutureTimestamp(
    snapshot.freshUntil,
    Math.max(observedAt, Date.now()),
    "AIDOS_AUTHORITY_STALE",
  );
  if (
    snapshot.source !== AIDOS_AUTHORITY_SOURCE ||
    snapshot.sourceProjection !== expectedProjection ||
    !snapshot.revision
  )
    throw new RoutingContractError("AIDOS_AUTHORITY_STALE");
  return snapshot;
}
export class ExternalAidosAuthorityAdapter implements AidosAuthorityReadPort {
  constructor(private readonly backend: AidosAuthorityBackend) {}
  async readAidosAvailability(input: AidosAvailabilityQuery) {
    const value = requireCurrent(
      await this.backend.readAidosAvailability(input),
      AIDOS_AVAILABILITY_SOURCE,
    );
    if (value.state === "UNKNOWN")
      throw new RoutingContractError("AIDOS_AUTHORITY_STALE");
    if (value.state === "UNAVAILABLE")
      throw new RoutingContractError("AIDOS_UNAVAILABLE");
    return value;
  }
  async readProjectOnboardingState(input: AidosProjectOnboardingQuery) {
    const value = requireCurrent(
      await this.backend.readProjectOnboardingState(input),
      AIDOS_PROJECT_REGISTRATION_SOURCE,
    );
    if (value.state === "UNKNOWN")
      throw new RoutingContractError("AIDOS_AUTHORITY_STALE");
    if (value.state === "PROJECT_NOT_ONBOARDED")
      throw new RoutingContractError("WAITING_AIDOS_ONBOARDING");
    if (value.state === "SUSPENDED")
      throw new RoutingContractError("AIDOS_DELEGATION_INELIGIBLE");
    return value;
  }
  async readDelegationEligibility(input: AidosDelegationEligibilityQuery) {
    const value = requireCurrent(
      await this.backend.readDelegationEligibility(input),
      AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
    );
    if (value.state === "UNKNOWN")
      throw new RoutingContractError("AIDOS_AUTHORITY_STALE");
    if (value.state === "INELIGIBLE")
      throw new RoutingContractError("AIDOS_DELEGATION_INELIGIBLE");
    return value;
  }
  async revalidate(input: AidosRevalidationQuery) {
    const value = await this.backend.revalidate(input);
    const availability = requireCurrent(
      value.availability,
      AIDOS_AVAILABILITY_SOURCE,
    );
    const registration = requireCurrent(
      value.registration,
      AIDOS_PROJECT_REGISTRATION_SOURCE,
    );
    const eligibility = requireCurrent(
      value.eligibility,
      AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
    );
    if (
      availability.projectRef !== input.availability.projectRef ||
      availability.revision !== input.availability.revision ||
      registration.projectRef !== input.registration.projectRef ||
      registration.revision !== input.registration.revision ||
      eligibility.projectRef !== input.eligibility.projectRef ||
      eligibility.revision !== input.eligibility.revision ||
      availability.projectRef !== registration.projectRef ||
      availability.projectRef !== eligibility.projectRef
    )
      throw new RoutingContractError("AIDOS_AUTHORITY_CONFLICT");
    if (availability.state === "UNKNOWN")
      throw new RoutingContractError("AIDOS_AUTHORITY_STALE");
    if (availability.state === "UNAVAILABLE")
      throw new RoutingContractError("AIDOS_UNAVAILABLE");
    if (registration.state === "UNKNOWN")
      throw new RoutingContractError("AIDOS_AUTHORITY_STALE");
    if (registration.state === "PROJECT_NOT_ONBOARDED")
      throw new RoutingContractError("WAITING_AIDOS_ONBOARDING");
    if (registration.state === "SUSPENDED")
      throw new RoutingContractError("AIDOS_DELEGATION_INELIGIBLE");
    if (eligibility.state === "UNKNOWN")
      throw new RoutingContractError("AIDOS_AUTHORITY_STALE");
    if (eligibility.state === "INELIGIBLE")
      throw new RoutingContractError("AIDOS_DELEGATION_INELIGIBLE");
    return {
      current: true,
      authority: AIDOS_AUTHORITY_SOURCE,
      identity: availability.projectRef,
      revision: [
        availability.revision,
        registration.revision,
        eligibility.revision,
      ].join(":"),
      checkedAt: new Date(
        Math.max(
          new Date(availability.observedAt).getTime(),
          new Date(registration.observedAt).getTime(),
          new Date(eligibility.observedAt).getTime(),
        ),
      ).toISOString(),
      freshUntil: new Date(
        Math.min(
          new Date(availability.freshUntil).getTime(),
          new Date(registration.freshUntil).getTime(),
          new Date(eligibility.freshUntil).getTime(),
        ),
      ).toISOString(),
      freshnessModel: "AUTHORITY_EXPIRY" as const,
    };
  }
}

export function composeRoutingAuthorityReadPorts(input: {
  classification: ClassificationAuthorityReadPort;
  registry: RegistryAuthorityReadPort;
  approval: HumanApprovalAuthorityReadPort;
  aidos: AidosAuthorityReadPort;
}) {
  return Object.freeze({ ...input });
}
