import type { RegistryAuthorityReadPort } from "./routing-authority-read-ports.js";
import {
  ROUTING_PURPOSES,
  ROUTING_ROLE_CLASSES,
  RoutingContractError,
} from "./routing-contracts.js";
import type {
  ActivateRoutingPolicyVersionInput,
  AppendRoutingPolicyVersionInput,
  AppendSpecializationVersionInput,
  RoutingPolicyContext,
  RoutingPolicyRepository,
  RoutingPolicySnapshot,
  SpecializationSnapshot,
} from "./routing-policy-repository.js";
import { ROUTING_POLICY_AUTHORITY } from "./routing-policy-repository.js";

export interface ResolveActiveRoutingPolicyInput extends RoutingPolicyContext {
  readonly effectiveAt?: string;
}

function exactContext(
  value: RoutingPolicyContext,
  context: RoutingPolicyContext,
) {
  return (
    value.canonicalDomain === context.canonicalDomain &&
    value.routingPurpose === context.routingPurpose &&
    value.roleClass === context.roleClass &&
    value.organizationId === context.organizationId &&
    value.projectId === context.projectId &&
    value.scopeRef === context.scopeRef &&
    value.environment === context.environment
  );
}

function validateTuple(input: AppendRoutingPolicyVersionInput) {
  if (
    !ROUTING_ROLE_CLASSES.includes(input.roleClass) ||
    !ROUTING_PURPOSES.includes(input.routingPurpose) ||
    (input.routingPurpose !== "PRIMARY_EXECUTION" &&
      input.roleClass !== "REVIEWER")
  )
    throw new RoutingContractError("POLICY_DENIED");
  const allowedModes = input.policyConstraints.allowedRoutingModes;
  if (
    allowedModes !== undefined &&
    (!Array.isArray(allowedModes) ||
      allowedModes.some(
        (mode) =>
          ![
            "PRIMARY_EXECUTION",
            "FALLBACK",
            "INDEPENDENT_REVIEW",
            "ADVERSARIAL_REVIEW",
          ].includes(String(mode)),
      ))
  )
    throw new RoutingContractError("POLICY_DENIED");
  if (
    input.canonicalDomain === "DEVELOPMENT" &&
    input.policyConstraints.routingDisposition !== "DELEGATE_TO_AIDOS"
  )
    throw new RoutingContractError("DEVELOPMENT_NATIVE_EXECUTION_PROHIBITED");
}

function requireAuthority(value: string) {
  if (value !== ROUTING_POLICY_AUTHORITY)
    throw new RoutingContractError("POLICY_DENIED");
}

const specializationAuthorityMetadataKeys = new Set([
  "authority",
  "executionAuthority",
  "permission",
  "permissions",
  "roleClass",
  "routingMode",
]);

function validateSpecializationMetadata(
  metadata: Readonly<Record<string, unknown>>,
) {
  if (
    Object.keys(metadata).some((key) =>
      specializationAuthorityMetadataKeys.has(key),
    )
  )
    throw new RoutingContractError("SPECIALIZATION_INVALID");
}

function requireTimestamp(
  value: string,
  code: "POLICY_DENIED" | "ROUTING_POLICY_STALE",
) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new RoutingContractError(code);
  return timestamp;
}

async function validateCapabilities(
  registry: RegistryAuthorityReadPort | undefined,
  required: readonly string[],
  preferred: readonly string[],
  failureCode: "REQUIRED_CAPABILITY_UNAVAILABLE" | "SPECIALIZATION_INVALID",
) {
  const refs = [...new Set([...required, ...preferred])];
  if (refs.length === 0) return;
  if (!registry) throw new RoutingContractError(failureCode);
  const snapshot = await registry.readSnapshot({ resourceRefs: refs });
  const available = new Set(snapshot.capabilities.map(({ id }) => id));
  if (refs.some((ref) => !available.has(ref)))
    throw new RoutingContractError(failureCode);
}

export class RoutingPolicyService {
  constructor(
    private readonly repository: RoutingPolicyRepository,
    private readonly now = () => new Date(),
    private readonly registry?: RegistryAuthorityReadPort,
  ) {}

  async resolveActivePolicy(
    input: ResolveActiveRoutingPolicyInput,
  ): Promise<RoutingPolicySnapshot> {
    const selections = await this.repository.listCurrentSelections(input);
    if (selections.length === 0)
      throw new RoutingContractError("ROUTING_POLICY_MISSING");
    if (selections.length !== 1)
      throw new RoutingContractError("ROUTING_POLICY_CONFLICT");
    const policy = selections[0]!;
    if (!exactContext(policy, input))
      throw new RoutingContractError("POLICY_DENIED");
    if (policy.lifecycleIntent !== "ACTIVE")
      throw new RoutingContractError("ROUTING_POLICY_INACTIVE");
    const effectiveAt = requireTimestamp(
      policy.effectiveAt,
      "ROUTING_POLICY_STALE",
    );
    const evaluatedAt = input.effectiveAt
      ? requireTimestamp(input.effectiveAt, "ROUTING_POLICY_STALE")
      : this.now().getTime();
    const expiresAt = policy.expiresAt
      ? requireTimestamp(policy.expiresAt, "ROUTING_POLICY_STALE")
      : null;
    if (
      effectiveAt > evaluatedAt ||
      (expiresAt !== null && expiresAt <= evaluatedAt)
    )
      throw new RoutingContractError("ROUTING_POLICY_STALE");
    await validateCapabilities(
      this.registry,
      policy.requiredCapabilityRefs,
      policy.preferredCapabilityRefs,
      "REQUIRED_CAPABILITY_UNAVAILABLE",
    );
    return policy;
  }

  async resolveSpecialization(
    policyVersionId: string,
    specializationRef: string | null,
    context: RoutingPolicyContext,
  ): Promise<SpecializationSnapshot | null> {
    if (specializationRef === null) return null;
    const specialization =
      await this.repository.findSpecializationVersion(specializationRef);
    const current = specialization
      ? await this.repository.findCurrentSpecializationVersion(
          specialization.specializationId,
        )
      : undefined;
    if (
      !specialization ||
      !current ||
      current.specializationVersionId !==
        specialization.specializationVersionId ||
      specialization.routingPolicyVersionId !== policyVersionId ||
      specialization.lifecycle !== "ACTIVE" ||
      specialization.canonicalDomain !== context.canonicalDomain ||
      specialization.routingPurpose !== context.routingPurpose ||
      specialization.scopeRef !== context.scopeRef ||
      specialization.environment !== context.environment
    )
      throw new RoutingContractError("SPECIALIZATION_INVALID");
    await validateCapabilities(
      this.registry,
      specialization.requiredCapabilityRefs,
      specialization.preferredCapabilityRefs,
      "SPECIALIZATION_INVALID",
    );
    return specialization;
  }
}

export class RoutingPolicyStewardService {
  constructor(
    private readonly repository: RoutingPolicyRepository,
    private readonly registry?: RegistryAuthorityReadPort,
  ) {}

  async createPolicyVersion(input: AppendRoutingPolicyVersionInput) {
    requireAuthority(input.authorityIdentifier);
    validateTuple(input);
    await validateCapabilities(
      this.registry,
      input.requiredCapabilityRefs,
      input.preferredCapabilityRefs,
      "REQUIRED_CAPABILITY_UNAVAILABLE",
    );
    return this.repository.appendPolicyVersion(input);
  }

  async createSpecializationVersion(input: AppendSpecializationVersionInput) {
    requireAuthority(input.authorityIdentifier);
    if (!/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(input.specializationKey))
      throw new RoutingContractError("SPECIALIZATION_INVALID");
    validateSpecializationMetadata(input.metadata);
    const policy = await this.repository.findPolicyVersion(
      input.routingPolicyVersionId,
    );
    if (
      !policy ||
      policy.authorityIdentifier !== ROUTING_POLICY_AUTHORITY ||
      policy.lifecycleIntent === "RETIRED" ||
      policy.canonicalDomain !== input.canonicalDomain ||
      policy.routingPurpose !== input.routingPurpose ||
      policy.scopeRef !== input.scopeRef ||
      policy.environment !== input.environment
    )
      throw new RoutingContractError("SPECIALIZATION_INVALID");
    await validateCapabilities(
      this.registry,
      input.requiredCapabilityRefs,
      input.preferredCapabilityRefs,
      "SPECIALIZATION_INVALID",
    );
    return this.repository.appendSpecializationVersion(input);
  }

  async activatePolicyVersion(input: ActivateRoutingPolicyVersionInput) {
    requireAuthority(input.authorityIdentifier);
    if (
      !input.reasonCode.trim() ||
      input.evidenceRefs.some((ref) => !ref.trim())
    )
      throw new RoutingContractError("POLICY_DENIED");
    return this.repository.activatePolicyVersion(input);
  }
}
