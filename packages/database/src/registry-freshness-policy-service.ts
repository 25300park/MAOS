import type {
  ActivateRegistryFreshnessPolicyInput,
  AppendRegistryFreshnessPolicyVersionInput,
  RegistryFreshnessApplicability,
  RegistryFreshnessPolicyRepository,
  RetireRegistryFreshnessPolicyInput,
} from "./registry-freshness-policy-repository.js";
import {
  REGISTRY_FRESHNESS_POLICY_AUTHORITY,
  REGISTRY_FRESHNESS_SCOPE,
} from "./registry-freshness-policy-repository.js";
import { RoutingContractError } from "./routing-contracts.js";

const environments = new Set([
  "DEVELOPMENT",
  "PREVIEW",
  "STAGING",
  "PRODUCTION",
]);
const lifecycles = new Set(["DRAFT", "ACTIVE", "SUPERSEDED", "RETIRED"]);
const MAX_DATE_MS = 8_640_000_000_000_000;

function nonBlank(value: string) {
  return typeof value === "string" && value.trim().length > 0;
}

function requireGovernedInput(input: {
  readonly authorityIdentifier: string;
  readonly registryScope: string;
  readonly environment: string;
  readonly actorId: string;
  readonly reasonCode: string;
  readonly evidenceRefs: readonly string[];
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId: string;
}) {
  if (
    input.authorityIdentifier !== REGISTRY_FRESHNESS_POLICY_AUTHORITY ||
    input.registryScope !== REGISTRY_FRESHNESS_SCOPE ||
    !environments.has(input.environment) ||
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

export class RegistryFreshnessPolicyService {
  constructor(
    private readonly repository: RegistryFreshnessPolicyRepository,
    private readonly now = () => new Date(),
  ) {
    void this.repository;
    void this.now;
  }

  async appendPolicyVersion(input: AppendRegistryFreshnessPolicyVersionInput) {
    requireGovernedInput(input);
    const evaluatedAt = this.now().getTime();
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
      !lifecycles.has(input.lifecycleIntent) ||
      !/^sha256:[a-f0-9]{64}$/u.test(input.contentFingerprint)
    ) {
      throw new RoutingContractError("POLICY_DENIED");
    }
    return await this.repository.appendPolicyVersion(input);
  }
  async resolveCurrentPolicy(input: RegistryFreshnessApplicability) {
    if (
      input.registryScope !== REGISTRY_FRESHNESS_SCOPE ||
      !environments.has(input.environment)
    ) {
      throw new RoutingContractError("POLICY_DENIED");
    }
    return await this.repository.resolveCurrentPolicy(input);
  }
  async activatePolicy(input: ActivateRegistryFreshnessPolicyInput) {
    requireGovernedInput(input);
    if (
      !Number.isSafeInteger(input.policyVersion) ||
      input.policyVersion <= 0
    ) {
      throw new RoutingContractError("POLICY_DENIED");
    }
    return await this.repository.activatePolicy(input);
  }
  async retireCurrentPolicy(input: RetireRegistryFreshnessPolicyInput) {
    requireGovernedInput(input);
    if (
      !nonBlank(input.expectedActivationEventId) ||
      !nonBlank(input.expectedPolicyId) ||
      !Number.isSafeInteger(input.expectedPolicyVersion) ||
      input.expectedPolicyVersion <= 0
    ) {
      throw new RoutingContractError("POLICY_DENIED");
    }
    return await this.repository.retireCurrentPolicy(input);
  }
}
