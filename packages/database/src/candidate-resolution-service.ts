import type {
  RegistryAuthorityReadPort,
  RegistryAuthoritySnapshot,
  RegistryFreshnessAuthorityEvidence,
  RegistryModelHostBindingSnapshot,
} from "./routing-authority-read-ports.js";
import { canonicalOrdinalCompare } from "./routing-authority-read-ports.js";
import {
  ROUTING_MODES,
  ROUTING_PURPOSES,
  ROUTING_ROLE_CLASSES,
  RoutingContractError,
  type CanonicalDomain,
  type RoutingErrorCode,
  type RoutingMode,
  type RoutingPurpose,
  type RoutingRoleClass,
} from "./routing-contracts.js";
import type {
  RoutingEnvironment,
  RoutingPolicySnapshot,
  SpecializationSnapshot,
} from "./routing-policy-repository.js";
import { deriveRegistryFreshUntil } from "./registry-freshness-policy-read-port.js";

export interface CandidateResolutionInput {
  readonly policy: RoutingPolicySnapshot;
  readonly specialization: SpecializationSnapshot | null;
  readonly canonicalDomain: CanonicalDomain;
  readonly roleClass: RoutingRoleClass;
  readonly routingPurpose: RoutingPurpose;
  readonly routingMode: RoutingMode;
  readonly organizationId: string | null;
  readonly projectId: string | null;
  readonly scopeRef: string;
  readonly environment: RoutingEnvironment;
  readonly requiredCapabilityRefs: readonly string[];
  readonly preferredCapabilityRefs: readonly string[];
  readonly classification: CandidateClassificationLineage;
}

export interface CandidateClassificationLineage {
  readonly identity: string;
  readonly revision: string;
  readonly version: number;
  readonly currentnessProof: string;
}

export interface CandidateCapabilityBindingLineage {
  readonly id: string;
  readonly version: number;
  readonly capabilityId: string;
  readonly capabilityVersion: number;
  readonly requirement: "REQUIRED" | "PREFERRED";
}

export interface CandidateResourceLineage {
  readonly provider: { readonly id: string; readonly version: number };
  readonly model: { readonly id: string; readonly version: number };
  readonly runtimeAdapter: { readonly id: string; readonly version: number };
  readonly modelHostBinding: {
    readonly id: string;
    readonly version: number;
  };
  readonly capabilityBindings: readonly CandidateCapabilityBindingLineage[];
  readonly roleCompatibility: { readonly id: string; readonly version: number };
  readonly specialization: Readonly<{
    id: string;
    versionId: string;
    version: number;
    contentFingerprint: string;
  }> | null;
  readonly routingPolicy: Readonly<{
    id: string;
    versionId: string;
    version: number;
    contentFingerprint: string;
  }>;
  readonly classification: CandidateClassificationLineage;
}

export interface ResolvedRoutingCandidate {
  readonly deterministicRank: number;
  readonly providerId: string;
  readonly modelId: string;
  readonly runtimeAdapterId: string;
  readonly modelHostBindingId: string;
  readonly matchedRequiredCapabilityRefs: readonly string[];
  readonly matchedPreferredCapabilityRefs: readonly string[];
  readonly roleCompatibilityRef: string;
  readonly specializationVersionId: string | null;
  readonly lineage: CandidateResourceLineage;
  readonly rankingEvidence: Readonly<{
    preferredCapabilityMatchCount: number;
    tieBreakers: readonly CandidateTieBreaker[];
  }>;
}

export interface ExcludedRoutingCandidate {
  readonly modelHostBindingId: string;
  readonly reasonCodes: readonly RoutingErrorCode[];
}

export interface CandidateResolutionResult {
  readonly registrySnapshotRef: string | null;
  readonly registrySnapshotRevision: string | null;
  readonly registryObservedAt: string | null;
  readonly registryFreshUntil: string | null;
  readonly registryFreshnessAuthority: RegistryFreshnessAuthorityEvidence | null;
  readonly registryResourceRefs: readonly string[];
  readonly eligibleCandidates: readonly ResolvedRoutingCandidate[];
  readonly excludedCandidates: readonly ExcludedRoutingCandidate[];
  readonly developmentDelegationRequired: boolean;
}

type CandidateTieBreaker =
  | "PROVIDER_ID"
  | "MODEL_ID"
  | "RUNTIME_ADAPTER_ID"
  | "MODEL_HOST_BINDING_ID"
  | "COST_CLASS"
  | "LATENCY_CLASS"
  | "QUALITY_CLASS";

const tieBreakers = new Set<CandidateTieBreaker>([
  "PROVIDER_ID",
  "MODEL_ID",
  "RUNTIME_ADAPTER_ID",
  "MODEL_HOST_BINDING_ID",
  "COST_CLASS",
  "LATENCY_CLASS",
  "QUALITY_CLASS",
]);
const supportedPolicyConstraintKeys = new Set([
  "allowedRoutingModes",
  "candidateTieBreakers",
  "allowedProviderIds",
  "allowedModelIds",
  "allowedRuntimeAdapterIds",
  "allowedExecutionModes",
  "allowedCostClasses",
  "allowedLatencyClasses",
  "allowedQualityClasses",
  "deniedProviderIds",
  "deniedModelIds",
  "deniedRuntimeAdapterIds",
  "humanApprovalRequired",
  "routingDisposition",
]);

const routingDispositions = new Set(["MAOS_NATIVE", "DELEGATE_TO_AIDOS"]);

const unique = <T extends string>(values: readonly T[]): T[] => [
  ...new Set(values),
];
const isReady = (value: {
  status: string;
  healthState: string;
  readinessState: string;
}) =>
  value.status === "ACTIVE" &&
  value.healthState === "HEALTHY" &&
  value.readinessState === "READY";

function stringArray(
  constraints: Readonly<Record<string, unknown>>,
  key: string,
): readonly string[] | undefined {
  const value = constraints[key];
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.length === 0)
  )
    throw new RoutingContractError("POLICY_DENIED");
  return unique(value);
}

function requireValuesInSet(
  constraints: Readonly<Record<string, unknown>>,
  key: string,
  allowed: ReadonlySet<string>,
) {
  const values = stringArray(constraints, key);
  if (values?.some((value) => !allowed.has(value)))
    throw new RoutingContractError("POLICY_DENIED");
}

function validatePolicyConstraintShape(policy: RoutingPolicySnapshot) {
  const constraints = policy.policyConstraints;
  requireValuesInSet(
    constraints,
    "allowedRoutingModes",
    new Set(ROUTING_MODES),
  );
  requireValuesInSet(constraints, "candidateTieBreakers", tieBreakers);
  const approval = constraints.humanApprovalRequired;
  if (approval !== undefined && typeof approval !== "boolean")
    throw new RoutingContractError("POLICY_DENIED");
  const disposition = constraints.routingDisposition;
  if (
    disposition !== undefined &&
    (typeof disposition !== "string" || !routingDispositions.has(disposition))
  )
    throw new RoutingContractError("POLICY_DENIED");
  if (
    (policy.canonicalDomain === "DEVELOPMENT" &&
      disposition !== "DELEGATE_TO_AIDOS") ||
    (policy.canonicalDomain !== "DEVELOPMENT" &&
      disposition !== undefined &&
      disposition !== "MAOS_NATIVE")
  )
    throw new RoutingContractError("POLICY_DENIED");
}

function validatePolicyConstraintReferences(
  policy: RoutingPolicySnapshot,
  snapshot: RegistryAuthoritySnapshot,
) {
  const constraints = policy.policyConstraints;
  const sets = {
    allowedProviderIds: new Set(snapshot.providers.map(({ id }) => id)),
    deniedProviderIds: new Set(snapshot.providers.map(({ id }) => id)),
    allowedModelIds: new Set(snapshot.models.map(({ id }) => id)),
    deniedModelIds: new Set(snapshot.models.map(({ id }) => id)),
    allowedRuntimeAdapterIds: new Set(
      snapshot.runtimeAdapters.map(({ id }) => id),
    ),
    deniedRuntimeAdapterIds: new Set(
      snapshot.runtimeAdapters.map(({ id }) => id),
    ),
    allowedExecutionModes: new Set(
      snapshot.runtimeAdapters.map(({ executionMode }) => executionMode),
    ),
    allowedCostClasses: new Set(
      snapshot.modelHostBindings.map(({ costClass }) => costClass),
    ),
    allowedLatencyClasses: new Set(
      snapshot.modelHostBindings.map(({ latencyClass }) => latencyClass),
    ),
    allowedQualityClasses: new Set(
      snapshot.modelHostBindings.map(({ qualityClass }) => qualityClass),
    ),
  } as const;
  for (const [key, allowed] of Object.entries(sets))
    requireValuesInSet(constraints, key, allowed);
}

function exactContext(input: CandidateResolutionInput) {
  const policy = input.policy;
  if (
    Object.keys(policy.policyConstraints).some(
      (key) => !supportedPolicyConstraintKeys.has(key),
    )
  )
    throw new RoutingContractError("POLICY_DENIED");
  validatePolicyConstraintShape(policy);
  if (
    !ROUTING_ROLE_CLASSES.includes(input.roleClass) ||
    !ROUTING_PURPOSES.includes(input.routingPurpose) ||
    !ROUTING_MODES.includes(input.routingMode) ||
    policy.authorityIdentifier !== "MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD" ||
    policy.lifecycleIntent !== "ACTIVE" ||
    policy.canonicalDomain !== input.canonicalDomain ||
    policy.roleClass !== input.roleClass ||
    policy.routingPurpose !== input.routingPurpose ||
    policy.organizationId !== input.organizationId ||
    policy.projectId !== input.projectId ||
    policy.scopeRef !== input.scopeRef ||
    policy.environment !== input.environment
  )
    throw new RoutingContractError("POLICY_DENIED");
  if (
    !input.classification.identity ||
    !input.classification.revision ||
    !Number.isInteger(input.classification.version) ||
    input.classification.version < 1 ||
    !input.classification.currentnessProof
  )
    throw new RoutingContractError("CLASSIFICATION_INVALID");
  const allowedModes = stringArray(
    policy.policyConstraints,
    "allowedRoutingModes",
  );
  if (allowedModes && !allowedModes.includes(input.routingMode))
    throw new RoutingContractError("POLICY_DENIED");
  if (
    input.routingPurpose !== "PRIMARY_EXECUTION" &&
    input.roleClass !== "REVIEWER"
  )
    throw new RoutingContractError("POLICY_DENIED");
  if (
    (input.routingPurpose === "PRIMARY_EXECUTION" &&
      !["PRIMARY_EXECUTION", "FALLBACK"].includes(input.routingMode)) ||
    (input.routingPurpose === "INDEPENDENT_REVIEW" &&
      (input.routingMode !== "INDEPENDENT_REVIEW" ||
        input.roleClass !== "REVIEWER")) ||
    (input.routingPurpose === "ADVERSARIAL_REVIEW" &&
      (input.routingMode !== "ADVERSARIAL_REVIEW" ||
        input.roleClass !== "REVIEWER"))
  )
    throw new RoutingContractError("POLICY_DENIED");
  const specialization = input.specialization;
  if (
    specialization &&
    (specialization.lifecycle !== "ACTIVE" ||
      specialization.routingPolicyVersionId !== policy.routingPolicyVersionId ||
      specialization.canonicalDomain !== input.canonicalDomain ||
      specialization.routingPurpose !== input.routingPurpose ||
      specialization.scopeRef !== input.scopeRef ||
      specialization.environment !== input.environment)
  )
    throw new RoutingContractError("SPECIALIZATION_INVALID");
}

function requireRegistryCurrent(
  snapshot: RegistryAuthoritySnapshot,
  now: Date,
) {
  const observedAt = Date.parse(snapshot.observedAt);
  const freshUntil = Date.parse(snapshot.freshUntil);
  const derivedFreshUntil = deriveRegistryFreshUntil(
    snapshot.observedAt,
    snapshot.freshnessMaxAgeMs,
  );
  if (
    snapshot.authoritySource !== "PHASE15B_AI_REGISTRY" ||
    !/^registry-snapshot:sha256:[a-f0-9]{64}$/.test(snapshot.snapshotRef) ||
    !snapshot.revision ||
    !Number.isFinite(observedAt) ||
    !Number.isFinite(freshUntil) ||
    !snapshot.freshnessPolicyRef ||
    !snapshot.freshnessPolicyVersion ||
    !Number.isSafeInteger(snapshot.freshnessMaxAgeMs) ||
    snapshot.freshnessMaxAgeMs <= 0 ||
    derivedFreshUntil !== snapshot.freshUntil ||
    observedAt > now.getTime() ||
    freshUntil <= now.getTime()
  )
    throw new RoutingContractError("REGISTRY_STALE");
  const allIds = [
    ...snapshot.providers.map(({ id }) => `provider:${id}`),
    ...snapshot.models.map(({ id }) => `model:${id}`),
    ...snapshot.runtimeAdapters.map(({ id }) => `runtime:${id}`),
    ...snapshot.capabilities.map(({ id }) => `capability:${id}`),
    ...snapshot.modelHostBindings.map(({ id }) => `binding:${id}`),
    ...snapshot.modelCapabilities.map(({ id }) => `model-capability:${id}`),
    ...snapshot.roleCompatibilities.map(({ id }) => `role:${id}`),
  ];
  if (new Set(allIds).size !== allIds.length)
    throw new RoutingContractError("REGISTRY_CONFLICT");
  if (
    [
      ...snapshot.providers,
      ...snapshot.models,
      ...snapshot.runtimeAdapters,
      ...snapshot.capabilities,
      ...snapshot.modelHostBindings,
      ...snapshot.modelCapabilities,
      ...snapshot.roleCompatibilities,
    ].some(
      ({ id, version }) => !id || !Number.isInteger(version) || version < 1,
    )
  )
    throw new RoutingContractError("REGISTRY_CONFLICT");
}

function modeCompatible(
  mode: RoutingMode,
  compatibility: RegistryAuthoritySnapshot["roleCompatibilities"][number],
) {
  if (mode === "FALLBACK") return compatibility.fallbackEligible;
  if (mode === "INDEPENDENT_REVIEW")
    return compatibility.independentReviewEligible;
  if (mode === "ADVERSARIAL_REVIEW")
    return compatibility.adversarialReviewEligible;
  return true;
}

function allowedByPolicy(
  constraints: Readonly<Record<string, unknown>>,
  key: string,
  value: string,
) {
  const allowed = stringArray(constraints, key);
  return allowed === undefined || allowed.includes(value);
}

function deniedByPolicy(
  constraints: Readonly<Record<string, unknown>>,
  key: string,
  value: string,
) {
  return stringArray(constraints, key)?.includes(value) ?? false;
}

interface InternalCandidate extends ResolvedRoutingCandidate {
  readonly binding: RegistryModelHostBindingSnapshot;
}

function candidateTieBreakerList(policy: RoutingPolicySnapshot) {
  const configured =
    stringArray(policy.policyConstraints, "candidateTieBreakers") ?? [];
  if (
    configured.some((value) => !tieBreakers.has(value as CandidateTieBreaker))
  )
    throw new RoutingContractError("POLICY_DENIED");
  return configured as readonly CandidateTieBreaker[];
}

function compareByTieBreaker(
  left: InternalCandidate,
  right: InternalCandidate,
  breaker: CandidateTieBreaker,
) {
  const values: Record<CandidateTieBreaker, readonly [string, string]> = {
    PROVIDER_ID: [left.providerId, right.providerId],
    MODEL_ID: [left.modelId, right.modelId],
    RUNTIME_ADAPTER_ID: [left.runtimeAdapterId, right.runtimeAdapterId],
    MODEL_HOST_BINDING_ID: [left.modelHostBindingId, right.modelHostBindingId],
    COST_CLASS: [left.binding.costClass, right.binding.costClass],
    LATENCY_CLASS: [left.binding.latencyClass, right.binding.latencyClass],
    QUALITY_CLASS: [left.binding.qualityClass, right.binding.qualityClass],
  };
  return canonicalOrdinalCompare(values[breaker][0], values[breaker][1]);
}

export class CandidateResolutionService {
  constructor(
    private readonly registry: RegistryAuthorityReadPort,
    private readonly now = () => new Date(),
  ) {}

  async resolve(
    input: CandidateResolutionInput,
  ): Promise<CandidateResolutionResult> {
    exactContext(input);
    if (input.canonicalDomain === "DEVELOPMENT") {
      if (
        input.policy.policyConstraints.routingDisposition !==
        "DELEGATE_TO_AIDOS"
      )
        throw new RoutingContractError(
          "DEVELOPMENT_NATIVE_EXECUTION_PROHIBITED",
        );
      return Object.freeze({
        registrySnapshotRef: null,
        registrySnapshotRevision: null,
        registryObservedAt: null,
        registryFreshUntil: null,
        registryFreshnessAuthority: null,
        registryResourceRefs: Object.freeze([]),
        eligibleCandidates: Object.freeze([]),
        excludedCandidates: Object.freeze([]),
        developmentDelegationRequired: true,
      });
    }

    const required = unique([
      ...input.policy.requiredCapabilityRefs,
      ...(input.specialization?.requiredCapabilityRefs ?? []),
      ...input.requiredCapabilityRefs,
    ]);
    const preferred = unique([
      ...input.policy.preferredCapabilityRefs,
      ...(input.specialization?.preferredCapabilityRefs ?? []),
      ...input.preferredCapabilityRefs,
    ]).filter((value) => !required.includes(value));
    const snapshot = await this.registry.readSnapshot({ resourceRefs: [] });
    requireRegistryCurrent(snapshot, this.now());
    validatePolicyConstraintReferences(input.policy, snapshot);
    const capabilities = new Map(
      snapshot.capabilities
        .filter(({ status }) => status === "ACTIVE")
        .map((value) => [value.id, value]),
    );
    const missingRequired = required.filter((ref) => !capabilities.has(ref));
    if (missingRequired.length > 0)
      throw new RoutingContractError(
        input.specialization?.requiredCapabilityRefs.some((ref) =>
          missingRequired.includes(ref),
        )
          ? "SPECIALIZATION_INVALID"
          : "REQUIRED_CAPABILITY_UNAVAILABLE",
      );

    const providers = new Map(
      snapshot.providers.map((value) => [value.id, value]),
    );
    const models = new Map(snapshot.models.map((value) => [value.id, value]));
    const runtimes = new Map(
      snapshot.runtimeAdapters.map((value) => [value.id, value]),
    );
    const constraints = input.policy.policyConstraints;
    const excluded: ExcludedRoutingCandidate[] = [];
    const eligible: InternalCandidate[] = [];

    for (const binding of snapshot.modelHostBindings) {
      const model = models.get(binding.modelId);
      const runtime = runtimes.get(binding.runtimeAdapterId);
      const provider = model ? providers.get(model.providerId) : undefined;
      const compatibilities = snapshot.roleCompatibilities.filter(
        (value) =>
          value.modelHostBindingId === binding.id &&
          value.modelId === binding.modelId &&
          value.runtimeAdapterId === binding.runtimeAdapterId &&
          value.domainKey === input.canonicalDomain &&
          value.roleKey === input.roleClass &&
          value.status === "ACTIVE" &&
          value.eligibility === "ELIGIBLE" &&
          modeCompatible(input.routingMode, value),
      );
      const compatibility =
        compatibilities.length === 1 ? compatibilities[0] : undefined;
      const candidateCapabilityBindings = snapshot.modelCapabilities.filter(
        (value) => value.modelHostBindingId === binding.id,
      );
      const invalidCapabilityLineage = candidateCapabilityBindings.some(
        (value) =>
          value.modelId !== binding.modelId ||
          value.runtimeAdapterId !== binding.runtimeAdapterId,
      );
      const currentCapabilityBindings = candidateCapabilityBindings.filter(
        (value) =>
          value.status === "ACTIVE" &&
          value.supportLevel === "SUPPORTED" &&
          value.verificationFreshness === "FRESH" &&
          capabilities.has(value.capabilityId),
      );
      const bindingsByCapability = new Map<
        string,
        typeof currentCapabilityBindings
      >();
      for (const value of currentCapabilityBindings) {
        const current = bindingsByCapability.get(value.capabilityId) ?? [];
        bindingsByCapability.set(value.capabilityId, [...current, value]);
      }
      const supported = new Set(bindingsByCapability.keys());
      const reasons: RoutingErrorCode[] = [];
      if (
        !provider ||
        !model ||
        !runtime ||
        compatibilities.length > 1 ||
        invalidCapabilityLineage ||
        [...bindingsByCapability.values()].some(
          (values) => values.length !== 1,
        ) ||
        (runtime.providerId !== null && runtime.providerId !== model.providerId)
      )
        reasons.push("REGISTRY_CONFLICT");
      else {
        if (!isReady(provider)) reasons.push("PROVIDER_UNAVAILABLE");
        if (!isReady(model)) reasons.push("MODEL_DISABLED");
        if (!isReady(runtime) || !isReady(binding))
          reasons.push("RUNTIME_ADAPTER_UNAVAILABLE");
        if (!compatibility) reasons.push("NO_ELIGIBLE_CANDIDATE");
        const unavailableRequired = required.filter(
          (ref) => !supported.has(ref),
        );
        if (unavailableRequired.length > 0) {
          const requiredObservations = candidateCapabilityBindings.filter(
            (value) => unavailableRequired.includes(value.capabilityId),
          );
          if (
            requiredObservations.some(
              ({ verificationFreshness }) =>
                verificationFreshness === "RECONCILING",
            )
          )
            reasons.push("REGISTRY_RECONCILING");
          else if (
            requiredObservations.some(
              ({ verificationFreshness }) => verificationFreshness !== "FRESH",
            )
          )
            reasons.push("REGISTRY_STALE");
          else reasons.push("REQUIRED_CAPABILITY_UNAVAILABLE");
        }
        if (
          !allowedByPolicy(constraints, "allowedProviderIds", provider.id) ||
          !allowedByPolicy(constraints, "allowedModelIds", model.id) ||
          !allowedByPolicy(
            constraints,
            "allowedRuntimeAdapterIds",
            runtime.id,
          ) ||
          !allowedByPolicy(
            constraints,
            "allowedExecutionModes",
            runtime.executionMode,
          ) ||
          !allowedByPolicy(
            constraints,
            "allowedCostClasses",
            binding.costClass,
          ) ||
          !allowedByPolicy(
            constraints,
            "allowedLatencyClasses",
            binding.latencyClass,
          ) ||
          !allowedByPolicy(
            constraints,
            "allowedQualityClasses",
            binding.qualityClass,
          ) ||
          deniedByPolicy(constraints, "deniedProviderIds", provider.id) ||
          deniedByPolicy(constraints, "deniedModelIds", model.id) ||
          deniedByPolicy(constraints, "deniedRuntimeAdapterIds", runtime.id)
        )
          reasons.push("POLICY_DENIED");
      }
      if (
        reasons.length > 0 ||
        !provider ||
        !model ||
        !runtime ||
        !compatibility
      ) {
        excluded.push({
          modelHostBindingId: binding.id,
          reasonCodes: Object.freeze(unique(reasons)),
        });
        continue;
      }
      const matchedPreferred = preferred.filter((ref) => supported.has(ref));
      const capabilityBindingLineage = [
        ...required.map((capabilityId) => ({
          binding: bindingsByCapability.get(capabilityId)![0]!,
          capabilityId,
          requirement: "REQUIRED" as const,
        })),
        ...matchedPreferred.map((capabilityId) => ({
          binding: bindingsByCapability.get(capabilityId)![0]!,
          capabilityId,
          requirement: "PREFERRED" as const,
        })),
      ].map(({ binding: capabilityBinding, capabilityId, requirement }) =>
        Object.freeze({
          id: capabilityBinding.id,
          version: capabilityBinding.version,
          capabilityId,
          capabilityVersion: capabilities.get(capabilityId)!.version,
          requirement,
        }),
      );
      eligible.push({
        deterministicRank: 0,
        providerId: provider.id,
        modelId: model.id,
        runtimeAdapterId: runtime.id,
        modelHostBindingId: binding.id,
        matchedRequiredCapabilityRefs: Object.freeze([...required]),
        matchedPreferredCapabilityRefs: Object.freeze(matchedPreferred),
        roleCompatibilityRef: compatibility.id,
        specializationVersionId:
          input.specialization?.specializationVersionId ?? null,
        lineage: Object.freeze({
          provider: Object.freeze({
            id: provider.id,
            version: provider.version,
          }),
          model: Object.freeze({ id: model.id, version: model.version }),
          runtimeAdapter: Object.freeze({
            id: runtime.id,
            version: runtime.version,
          }),
          modelHostBinding: Object.freeze({
            id: binding.id,
            version: binding.version,
          }),
          capabilityBindings: Object.freeze(capabilityBindingLineage),
          roleCompatibility: Object.freeze({
            id: compatibility.id,
            version: compatibility.version,
          }),
          specialization: input.specialization
            ? Object.freeze({
                id: input.specialization.specializationId,
                versionId: input.specialization.specializationVersionId,
                version: input.specialization.version,
                contentFingerprint: input.specialization.contentFingerprint,
              })
            : null,
          routingPolicy: Object.freeze({
            id: input.policy.routingPolicyId,
            versionId: input.policy.routingPolicyVersionId,
            version: input.policy.version,
            contentFingerprint: input.policy.contentFingerprint,
          }),
          classification: Object.freeze({ ...input.classification }),
        }),
        rankingEvidence: Object.freeze({
          preferredCapabilityMatchCount: matchedPreferred.length,
          tieBreakers: Object.freeze([]),
        }),
        binding,
      });
    }

    if (eligible.length === 0) {
      const reasons = excluded.flatMap(({ reasonCodes }) => reasonCodes);
      const code = (
        [
          "REGISTRY_CONFLICT",
          "PROVIDER_UNAVAILABLE",
          "MODEL_DISABLED",
          "RUNTIME_ADAPTER_UNAVAILABLE",
          "REGISTRY_RECONCILING",
          "REGISTRY_STALE",
          "REQUIRED_CAPABILITY_UNAVAILABLE",
          "POLICY_DENIED",
          "NO_ELIGIBLE_CANDIDATE",
        ] as const
      ).find((candidate) => reasons.includes(candidate));
      throw new RoutingContractError(code ?? "NO_ELIGIBLE_CANDIDATE");
    }

    const breakers = candidateTieBreakerList(input.policy);
    eligible.sort((left, right) => {
      const preferredOrder =
        right.matchedPreferredCapabilityRefs.length -
        left.matchedPreferredCapabilityRefs.length;
      if (preferredOrder !== 0) return preferredOrder;
      for (const breaker of breakers) {
        const result = compareByTieBreaker(left, right, breaker);
        if (result !== 0) return result;
      }
      return 0;
    });
    for (let index = 1; index < eligible.length; index += 1) {
      const previous = eligible[index - 1]!;
      const current = eligible[index]!;
      if (
        previous.matchedPreferredCapabilityRefs.length ===
          current.matchedPreferredCapabilityRefs.length &&
        breakers.every(
          (breaker) => compareByTieBreaker(previous, current, breaker) === 0,
        )
      )
        throw new RoutingContractError("NONDETERMINISTIC_CANDIDATE_TIE");
    }
    const safeEligible = eligible.map((value, index) => {
      const { binding, ...candidate } = value;
      void binding;
      return Object.freeze({
        ...candidate,
        deterministicRank: index + 1,
        rankingEvidence: Object.freeze({
          ...candidate.rankingEvidence,
          tieBreakers: Object.freeze([...breakers]),
        }),
      });
    });
    return Object.freeze({
      registrySnapshotRef: snapshot.snapshotRef,
      registrySnapshotRevision: snapshot.revision,
      registryObservedAt: snapshot.observedAt,
      registryFreshUntil: snapshot.freshUntil,
      registryFreshnessAuthority: Object.freeze({
        policyRef: snapshot.freshnessPolicyRef,
        policyVersion: snapshot.freshnessPolicyVersion,
        maxAgeMs: snapshot.freshnessMaxAgeMs,
        registryObservedAt: snapshot.observedAt,
        freshUntil: snapshot.freshUntil,
        snapshotRef: snapshot.snapshotRef,
        snapshotRevision: snapshot.revision,
        snapshotHash: snapshot.snapshotRef.slice(
          "registry-snapshot:sha256:".length,
        ),
      }),
      registryResourceRefs: Object.freeze(
        unique(
          safeEligible.flatMap((candidate) => [
            candidate.providerId,
            candidate.modelId,
            candidate.runtimeAdapterId,
            candidate.modelHostBindingId,
            candidate.roleCompatibilityRef,
            ...candidate.lineage.capabilityBindings.map(({ id }) => id),
            ...candidate.matchedRequiredCapabilityRefs,
            ...candidate.matchedPreferredCapabilityRefs,
          ]),
        ),
      ),
      eligibleCandidates: Object.freeze(safeEligible),
      excludedCandidates: Object.freeze(excluded),
      developmentDelegationRequired: false,
    });
  }
}
