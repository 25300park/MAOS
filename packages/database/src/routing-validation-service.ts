import type {
  AidosAuthorityReadPort,
  AidosAvailabilitySnapshot,
  AidosDelegationEligibilitySnapshot,
  AidosProjectOnboardingSnapshot,
  ApprovalRequirementQuery,
  ClassificationAuthorityReadPort,
  ClassificationAuthoritySnapshot,
  ExactRequestContext,
  HumanApprovalAuthorityReadPort,
  HumanApprovalSnapshot,
  RegistryAuthorityReadPort,
} from "./routing-authority-read-ports.js";
import {
  AIDOS_AUTHORITY_SOURCE,
  AIDOS_AVAILABILITY_SOURCE,
  AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
  AIDOS_PROJECT_REGISTRATION_SOURCE,
} from "./routing-authority-read-ports.js";
import type {
  CandidateResolutionInput,
  CandidateResolutionResult,
} from "./candidate-resolution-service.js";
import {
  RoutingContractError,
  type DevelopmentDelegationState,
  type RoutingMode,
  type RoutingPurpose,
  type RoutingRoleClass,
} from "./routing-contracts.js";
import type {
  RoutingPolicyContext,
  RoutingPolicySnapshot,
  SpecializationSnapshot,
} from "./routing-policy-repository.js";
import { deriveRegistryFreshUntil } from "./registry-freshness-policy-read-port.js";
import type {
  CanonicalWorkRequestRecord,
  WorkRequestReadPort,
} from "./work-request-contracts.js";
import {
  validateAidosDelegationInput,
  validateAidosSnapshotBinding,
  type AidosDelegationInput,
  type AidosSnapshotBinding,
} from "./aidos-delegation-contracts.js";

export interface RoutingPolicyResolver {
  resolveActivePolicy(
    input: RoutingPolicyContext,
  ): Promise<RoutingPolicySnapshot>;
  resolveSpecialization(
    policyVersionId: string,
    specializationRef: string | null,
    context: RoutingPolicyContext,
  ): Promise<SpecializationSnapshot | null>;
}

export interface CandidateResolver {
  resolve(input: CandidateResolutionInput): Promise<CandidateResolutionResult>;
}

export interface CreateRoutingDecisionInput {
  readonly requestId: string;
  readonly expectedClassificationVersionId: string;
  readonly context: ExactRequestContext;
  readonly scopeRef: string;
  readonly roleClass: RoutingRoleClass;
  readonly routingPurpose: RoutingPurpose;
  readonly routingMode: RoutingMode;
  readonly specializationRef: string | null;
  readonly approval: ApprovalRequirementQuery | null;
  readonly aidosTargetRef: string | null;
  readonly aidosDelegationInput?: AidosDelegationInput | null;
}

export interface ValidatedAidosAuthority {
  readonly projectRef: string;
  readonly availabilityRevision: string;
  readonly registrationRevision: string | null;
  readonly eligibilityRevision: string | null;
  readonly checkedAt: string;
  readonly freshUntil: string;
  readonly evidenceRefs: readonly string[];
  readonly delegationInput: AidosDelegationInput;
  readonly snapshotBinding: AidosSnapshotBinding | null;
}

export interface ValidatedRoutingContext {
  readonly request: CanonicalWorkRequestRecord;
  readonly classification: ClassificationAuthoritySnapshot;
  readonly policy: RoutingPolicySnapshot;
  readonly specialization: ValidatedSpecializationEvidence | null;
  readonly approval: HumanApprovalSnapshot | null;
  readonly candidates: CandidateResolutionResult | null;
  readonly aidos: ValidatedAidosAuthority | null;
  readonly developmentDelegationState: DevelopmentDelegationState;
}

export interface ValidatedSpecializationEvidence {
  readonly specializationVersionId: string;
  readonly specializationId: string;
  readonly version: number;
  readonly routingPolicyVersionId: string;
  readonly specializationKey: string;
  readonly contentFingerprint: string;
  readonly requiredCapabilityRefs: readonly string[];
  readonly preferredCapabilityRefs: readonly string[];
}

export interface RoutingValidationDependencies {
  readonly workRequests: WorkRequestReadPort;
  readonly classifications: ClassificationAuthorityReadPort;
  readonly policies: RoutingPolicyResolver;
  readonly candidates: CandidateResolver;
  readonly approvals: HumanApprovalAuthorityReadPort;
  readonly aidos: AidosAuthorityReadPort;
  readonly registry: RegistryAuthorityReadPort;
  readonly now?: () => Date;
}

function requestMatches(
  request: CanonicalWorkRequestRecord,
  input: CreateRoutingDecisionInput,
) {
  const context = input.context;
  return (
    request.id === input.requestId &&
    request.lifecycleState === "REGISTERED" &&
    request.organizationId === context.organizationId &&
    request.projectId === context.projectId &&
    request.companyScopeRef === context.companyScopeRef &&
    request.teamScopeRef === context.teamScopeRef &&
    request.projectScopeRef === context.projectScopeRef &&
    request.systemScopeRef === context.systemScopeRef &&
    request.environment === context.environment
  );
}

function requireClassification(
  snapshot: ClassificationAuthoritySnapshot,
  input: CreateRoutingDecisionInput,
) {
  if (
    !snapshot.current ||
    snapshot.identity !== input.expectedClassificationVersionId
  )
    throw new RoutingContractError("CLASSIFICATION_NOT_CURRENT");
  if (snapshot.classificationState !== "VALIDATED")
    throw new RoutingContractError("CLASSIFICATION_NOT_VALIDATED");
  if (snapshot.stalenessState !== "CURRENT")
    throw new RoutingContractError("CLASSIFICATION_STALE");
  if (!snapshot.policyResolved)
    throw new RoutingContractError("CLASSIFICATION_POLICY_UNRESOLVED");
  const handoff = snapshot.handoff;
  if (
    snapshot.freshnessModel !== "REFERENCE_VERSION_CURRENTNESS" ||
    snapshot.authority !== "PHASE15C_CLASSIFICATION" ||
    snapshot.requestId !== input.requestId ||
    snapshot.classificationId !== input.expectedClassificationVersionId ||
    handoff.classificationId !== input.expectedClassificationVersionId ||
    handoff.requestId !== input.requestId ||
    snapshot.classificationVersion !== handoff.version ||
    snapshot.currentnessProof !== handoff.freshnessProof ||
    snapshot.policyResolutionRef !== handoff.policyResolutionRef ||
    snapshot.policyResolutionVersion !== handoff.policyResolutionVersion ||
    handoff.organizationId !== input.context.organizationId ||
    handoff.projectId !== input.context.projectId ||
    handoff.environment !== input.context.environment ||
    (handoff.requestedRoleClass !== null &&
      handoff.requestedRoleClass !== input.roleClass)
  )
    throw new RoutingContractError("CLASSIFICATION_INVALID");
}

function approvalCode(state: HumanApprovalSnapshot["state"]) {
  if (state === "REVOKED") return "HUMAN_APPROVAL_REVOKED" as const;
  if (state === "EXPIRED" || state === "STALE")
    return "HUMAN_APPROVAL_STALE" as const;
  if (state === "MISSING") return "HUMAN_APPROVAL_REQUIRED" as const;
  return "HUMAN_APPROVAL_INVALID" as const;
}

function requireApprovalCurrent(
  approval: HumanApprovalSnapshot,
  query: ApprovalRequirementQuery,
  now: Date,
) {
  if (approval.state !== "APPROVED")
    throw new RoutingContractError(approvalCode(approval.state));
  if (
    approval.authority !== approval.authorityRuleRef ||
    approval.identity !== approval.approvalRef ||
    approval.approvalPolicyRef !== query.expected.approvalPolicyRef ||
    approval.approvalPolicyVersion !== query.expected.approvalPolicyVersion ||
    approval.targetType !== query.expected.targetType ||
    approval.targetId !== query.expected.targetId ||
    approval.targetVersion !== query.expected.targetVersion ||
    approval.targetHash !== query.expected.targetHash ||
    !approval.approvalRef ||
    approval.approvalStatus !== "APPROVED" ||
    approval.approvalValidity !== "VALID"
  )
    throw new RoutingContractError("HUMAN_APPROVAL_INVALID");
  if (
    !approval.current ||
    approval.freshnessModel !== "AUTHORITY_EXPIRY" ||
    !Number.isFinite(Date.parse(approval.checkedAt)) ||
    !Number.isFinite(Date.parse(approval.freshUntil)) ||
    !Number.isFinite(Date.parse(approval.expiresAt)) ||
    Date.parse(approval.freshUntil) <= now.getTime() ||
    Date.parse(approval.expiresAt) <= now.getTime()
  )
    throw new RoutingContractError("HUMAN_APPROVAL_STALE");
}

function sameClassification(
  initial: ClassificationAuthoritySnapshot,
  current: ClassificationAuthoritySnapshot,
) {
  return (
    current.identity === initial.identity &&
    current.revision === initial.revision &&
    current.classificationVersion === initial.classificationVersion &&
    current.currentnessProof === initial.currentnessProof &&
    current.policyResolutionRef === initial.policyResolutionRef &&
    current.policyResolutionVersion === initial.policyResolutionVersion
  );
}

function samePolicy(
  initial: RoutingPolicySnapshot,
  current: RoutingPolicySnapshot,
) {
  return (
    current.routingPolicyId === initial.routingPolicyId &&
    current.routingPolicyVersionId === initial.routingPolicyVersionId &&
    current.version === initial.version &&
    current.contentFingerprint === initial.contentFingerprint &&
    current.lifecycleIntent === "ACTIVE"
  );
}

function sameSpecialization(
  initial: SpecializationSnapshot | null,
  current: SpecializationSnapshot | null,
) {
  if (initial === null || current === null) return initial === current;
  return (
    current.specializationId === initial.specializationId &&
    current.specializationVersionId === initial.specializationVersionId &&
    current.version === initial.version &&
    current.contentFingerprint === initial.contentFingerprint &&
    current.lifecycle === "ACTIVE"
  );
}

function safeSpecialization(
  value: SpecializationSnapshot | null,
): ValidatedSpecializationEvidence | null {
  if (!value) return null;
  return Object.freeze({
    specializationVersionId: value.specializationVersionId,
    specializationId: value.specializationId,
    version: value.version,
    routingPolicyVersionId: value.routingPolicyVersionId,
    specializationKey: value.specializationKey,
    contentFingerprint: value.contentFingerprint,
    requiredCapabilityRefs: Object.freeze([...value.requiredCapabilityRefs]),
    preferredCapabilityRefs: Object.freeze([...value.preferredCapabilityRefs]),
  });
}

function requireAidosSnapshotCurrent(
  snapshot:
    | AidosAvailabilitySnapshot
    | AidosProjectOnboardingSnapshot
    | AidosDelegationEligibilitySnapshot,
  targetRef: string,
  expectedProjection: string,
  now: Date,
) {
  if (
    snapshot.source !== AIDOS_AUTHORITY_SOURCE ||
    snapshot.sourceProjection !== expectedProjection ||
    snapshot.projectRef !== targetRef ||
    !snapshot.revision ||
    !Number.isFinite(Date.parse(snapshot.observedAt)) ||
    !Number.isFinite(Date.parse(snapshot.freshUntil)) ||
    Date.parse(snapshot.observedAt) > now.getTime() ||
    Date.parse(snapshot.freshUntil) <= now.getTime()
  )
    throw new RoutingContractError("AIDOS_AUTHORITY_STALE");
}

function requireCandidateLineage(
  result: CandidateResolutionResult,
  classification: ClassificationAuthoritySnapshot,
  policy: RoutingPolicySnapshot,
  specialization: SpecializationSnapshot | null,
) {
  const resourceRefs = new Set(result.registryResourceRefs);
  for (const candidate of result.eligibleCandidates) {
    const lineage = candidate.lineage;
    const expectedCapabilities = new Set([
      ...candidate.matchedRequiredCapabilityRefs,
      ...candidate.matchedPreferredCapabilityRefs,
    ]);
    const actualCapabilities = new Set(
      lineage.capabilityBindings.map(({ capabilityId }) => capabilityId),
    );
    if (
      lineage.provider.id !== candidate.providerId ||
      lineage.model.id !== candidate.modelId ||
      lineage.runtimeAdapter.id !== candidate.runtimeAdapterId ||
      lineage.modelHostBinding.id !== candidate.modelHostBindingId ||
      lineage.roleCompatibility.id !== candidate.roleCompatibilityRef ||
      [
        lineage.provider.version,
        lineage.model.version,
        lineage.runtimeAdapter.version,
        lineage.modelHostBinding.version,
        lineage.roleCompatibility.version,
      ].some((version) => !Number.isInteger(version) || version < 1) ||
      lineage.routingPolicy.id !== policy.routingPolicyId ||
      lineage.routingPolicy.versionId !== policy.routingPolicyVersionId ||
      lineage.routingPolicy.version !== policy.version ||
      lineage.routingPolicy.contentFingerprint !== policy.contentFingerprint ||
      lineage.classification.identity !== classification.identity ||
      lineage.classification.revision !== classification.revision ||
      lineage.classification.version !== classification.classificationVersion ||
      lineage.classification.currentnessProof !==
        classification.currentnessProof ||
      (specialization === null
        ? lineage.specialization !== null
        : lineage.specialization?.id !== specialization.specializationId ||
          lineage.specialization.versionId !==
            specialization.specializationVersionId ||
          lineage.specialization.version !== specialization.version ||
          lineage.specialization.contentFingerprint !==
            specialization.contentFingerprint) ||
      expectedCapabilities.size !== actualCapabilities.size ||
      lineage.capabilityBindings.length !== expectedCapabilities.size ||
      [...expectedCapabilities].some(
        (value) => !actualCapabilities.has(value),
      ) ||
      candidate.matchedRequiredCapabilityRefs.some(
        (capabilityId) =>
          !lineage.capabilityBindings.some(
            (value) =>
              value.capabilityId === capabilityId &&
              value.requirement === "REQUIRED",
          ),
      ) ||
      candidate.matchedPreferredCapabilityRefs.some(
        (capabilityId) =>
          !lineage.capabilityBindings.some(
            (value) =>
              value.capabilityId === capabilityId &&
              value.requirement === "PREFERRED",
          ),
      ) ||
      lineage.capabilityBindings.some(
        ({ id, version, capabilityVersion }) =>
          !resourceRefs.has(id) || version < 1 || capabilityVersion < 1,
      ) ||
      ![
        candidate.providerId,
        candidate.modelId,
        candidate.runtimeAdapterId,
        candidate.modelHostBindingId,
        candidate.roleCompatibilityRef,
        ...expectedCapabilities,
      ].every((value) => resourceRefs.has(value))
    )
      throw new RoutingContractError("REGISTRY_CONFLICT");
  }
}

export class RoutingValidationService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: RoutingValidationDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  private async revalidateCommonAuthorities(
    input: CreateRoutingDecisionInput,
    policyContext: RoutingPolicyContext,
    classification: ClassificationAuthoritySnapshot,
    policy: RoutingPolicySnapshot,
    specialization: SpecializationSnapshot | null,
    approval: HumanApprovalSnapshot | null,
  ) {
    const currentClassification =
      await this.dependencies.classifications.readCurrent(
        input.requestId,
        input.context,
      );
    requireClassification(currentClassification, input);
    if (!sameClassification(classification, currentClassification))
      throw new RoutingContractError("CLASSIFICATION_NOT_CURRENT");
    const classificationProof =
      await this.dependencies.classifications.revalidate(
        classification.identity,
        input.context,
      );
    if (
      !classificationProof.current ||
      classificationProof.authority !== classification.authority ||
      classificationProof.identity !== classification.identity ||
      classificationProof.revision !== classification.revision ||
      classificationProof.freshnessModel !== "REFERENCE_VERSION_CURRENTNESS"
    )
      throw new RoutingContractError("CLASSIFICATION_NOT_CURRENT");

    const currentPolicy =
      await this.dependencies.policies.resolveActivePolicy(policyContext);
    if (!samePolicy(policy, currentPolicy))
      throw new RoutingContractError("ROUTING_POLICY_STALE");
    const currentSpecialization =
      await this.dependencies.policies.resolveSpecialization(
        currentPolicy.routingPolicyVersionId,
        input.specializationRef,
        policyContext,
      );
    if (!sameSpecialization(specialization, currentSpecialization))
      throw new RoutingContractError("SPECIALIZATION_INVALID");

    if (approval && input.approval) {
      const currentApproval = await this.dependencies.approvals.revalidate(
        approval.approvalRef!,
        approval.targetVersion,
        approval.targetHash,
      );
      requireApprovalCurrent(currentApproval, input.approval, this.now());
      if (
        currentApproval.identity !== approval.identity ||
        currentApproval.revision !== approval.revision ||
        currentApproval.authority !== approval.authority ||
        currentApproval.authorityRuleRef !== approval.authorityRuleRef ||
        currentApproval.approvalPolicyRef !== approval.approvalPolicyRef ||
        currentApproval.approvalPolicyVersion !==
          approval.approvalPolicyVersion ||
        currentApproval.targetType !== approval.targetType ||
        currentApproval.targetId !== approval.targetId ||
        currentApproval.targetVersion !== approval.targetVersion ||
        currentApproval.targetHash !== approval.targetHash
      )
        throw new RoutingContractError("HUMAN_APPROVAL_INVALID");
    }
  }

  async validate(
    input: CreateRoutingDecisionInput,
  ): Promise<ValidatedRoutingContext> {
    if (input.requestId !== input.context.requestId)
      throw new RoutingContractError("CLASSIFICATION_INVALID");
    const request = await this.dependencies.workRequests.findRequest(
      input.requestId,
    );
    if (!request) throw new RoutingContractError("ROUTING_REQUEST_NOT_FOUND");
    if (!requestMatches(request, input))
      throw new RoutingContractError("CLASSIFICATION_INVALID");

    const classification = await this.dependencies.classifications.readCurrent(
      input.requestId,
      input.context,
    );
    requireClassification(classification, input);
    const policyContext: RoutingPolicyContext = {
      canonicalDomain: classification.handoff.domainKey,
      routingPurpose: input.routingPurpose,
      roleClass: input.roleClass,
      organizationId: input.context.organizationId,
      projectId: input.context.projectId,
      scopeRef: input.scopeRef,
      environment: input.context.environment,
    };
    const policy =
      await this.dependencies.policies.resolveActivePolicy(policyContext);
    const specialization =
      await this.dependencies.policies.resolveSpecialization(
        policy.routingPolicyVersionId,
        input.specializationRef,
        policyContext,
      );

    const approvalRequired = policy.policyConstraints.humanApprovalRequired;
    if (approvalRequired !== undefined && typeof approvalRequired !== "boolean")
      throw new RoutingContractError("POLICY_DENIED");
    if (approvalRequired === true && !input.approval)
      throw new RoutingContractError("HUMAN_APPROVAL_REQUIRED");
    let approval: HumanApprovalSnapshot | null = null;
    if (input.approval) {
      approval = await this.dependencies.approvals.resolveRequirement(
        input.approval,
      );
      requireApprovalCurrent(approval, input.approval, this.now());
    }

    if (classification.handoff.domainKey === "DEVELOPMENT") {
      if (
        classification.handoff.routingDisposition !== "DELEGATE_TO_AIDOS" ||
        policy.policyConstraints.routingDisposition !== "DELEGATE_TO_AIDOS" ||
        !input.aidosTargetRef
      )
        throw new RoutingContractError(
          "DEVELOPMENT_NATIVE_EXECUTION_PROHIBITED",
        );
      if (!input.aidosDelegationInput)
        throw new RoutingContractError("WAITING_AIDOS_DELEGATION_INPUT");
      const delegationInput = validateAidosDelegationInput(
        input.aidosDelegationInput,
      );
      if (delegationInput.aidosProjectRef !== input.aidosTargetRef)
        throw new RoutingContractError("WAITING_AIDOS_DELEGATION_INPUT");
      const aidosQuery = {
        projectRef: input.aidosTargetRef,
        organizationId: input.context.organizationId,
        projectId: input.context.projectId,
        environment: input.context.environment,
        scopeRef: input.scopeRef,
        delegationInput,
      };
      const availability = await this.dependencies.aidos.readAidosAvailability({
        environment: input.context.environment,
        targetRef: input.aidosTargetRef,
        organizationId: input.context.organizationId,
        projectId: input.context.projectId,
        scopeRef: input.scopeRef,
        correlationId: classification.handoff.correlationId,
        delegationInput,
      });
      requireAidosSnapshotCurrent(
        availability,
        input.aidosTargetRef,
        AIDOS_AVAILABILITY_SOURCE,
        this.now(),
      );
      if (availability.state === "UNKNOWN")
        throw new RoutingContractError("AIDOS_AUTHORITY_STALE");
      if (availability.state === "UNAVAILABLE") {
        const currentAvailability =
          await this.dependencies.aidos.readAidosAvailability({
            environment: input.context.environment,
            targetRef: input.aidosTargetRef,
            organizationId: input.context.organizationId,
            projectId: input.context.projectId,
            scopeRef: input.scopeRef,
            correlationId: classification.handoff.correlationId,
            delegationInput,
          });
        requireAidosSnapshotCurrent(
          currentAvailability,
          input.aidosTargetRef,
          AIDOS_AVAILABILITY_SOURCE,
          this.now(),
        );
        if (
          currentAvailability.state !== "UNAVAILABLE" ||
          currentAvailability.revision !== availability.revision
        )
          throw new RoutingContractError("AIDOS_AUTHORITY_CONFLICT");
        await this.revalidateCommonAuthorities(
          input,
          policyContext,
          classification,
          policy,
          specialization,
          approval,
        );
        return Object.freeze({
          request,
          classification,
          policy,
          specialization: safeSpecialization(specialization),
          approval,
          candidates: null,
          aidos: Object.freeze({
            projectRef: input.aidosTargetRef,
            availabilityRevision: availability.revision,
            registrationRevision: null,
            eligibilityRevision: null,
            checkedAt: availability.observedAt,
            freshUntil: availability.freshUntil,
            evidenceRefs: Object.freeze([availability.evidenceRef]),
            delegationInput,
            snapshotBinding: null,
          }),
          developmentDelegationState: "AIDOS_UNAVAILABLE",
        });
      }
      const registration =
        await this.dependencies.aidos.readProjectOnboardingState(aidosQuery);
      requireAidosSnapshotCurrent(
        registration,
        input.aidosTargetRef,
        AIDOS_PROJECT_REGISTRATION_SOURCE,
        this.now(),
      );
      if (registration.state === "UNKNOWN")
        throw new RoutingContractError("AIDOS_AUTHORITY_STALE");
      if (registration.state === "PROJECT_NOT_ONBOARDED") {
        const [currentAvailability, currentRegistration] = await Promise.all([
          this.dependencies.aidos.readAidosAvailability({
            environment: input.context.environment,
            targetRef: input.aidosTargetRef,
            organizationId: input.context.organizationId,
            projectId: input.context.projectId,
            scopeRef: input.scopeRef,
            correlationId: classification.handoff.correlationId,
            delegationInput,
          }),
          this.dependencies.aidos.readProjectOnboardingState(aidosQuery),
        ]);
        requireAidosSnapshotCurrent(
          currentAvailability,
          input.aidosTargetRef,
          AIDOS_AVAILABILITY_SOURCE,
          this.now(),
        );
        requireAidosSnapshotCurrent(
          currentRegistration,
          input.aidosTargetRef,
          AIDOS_PROJECT_REGISTRATION_SOURCE,
          this.now(),
        );
        if (
          currentAvailability.state !== "AVAILABLE" ||
          currentAvailability.revision !== availability.revision ||
          currentRegistration.state !== "PROJECT_NOT_ONBOARDED" ||
          currentRegistration.revision !== registration.revision
        )
          throw new RoutingContractError("AIDOS_AUTHORITY_CONFLICT");
        await this.revalidateCommonAuthorities(
          input,
          policyContext,
          classification,
          policy,
          specialization,
          approval,
        );
        return Object.freeze({
          request,
          classification,
          policy,
          specialization: safeSpecialization(specialization),
          approval,
          candidates: null,
          aidos: Object.freeze({
            projectRef: input.aidosTargetRef,
            availabilityRevision: availability.revision,
            registrationRevision: registration.revision,
            eligibilityRevision: null,
            checkedAt: new Date(
              Math.max(
                Date.parse(availability.observedAt),
                Date.parse(registration.observedAt),
              ),
            ).toISOString(),
            freshUntil: new Date(
              Math.min(
                Date.parse(availability.freshUntil),
                Date.parse(registration.freshUntil),
              ),
            ).toISOString(),
            evidenceRefs: Object.freeze([
              availability.evidenceRef,
              registration.evidenceRef,
            ]),
            delegationInput,
            snapshotBinding: null,
          }),
          developmentDelegationState: "WAITING_AIDOS_ONBOARDING",
        });
      }
      if (registration.state !== "PROJECT_ONBOARDED")
        throw new RoutingContractError("AIDOS_DELEGATION_INELIGIBLE");
      const eligibility =
        await this.dependencies.aidos.readDelegationEligibility({
          ...aidosQuery,
          classificationVersionId: classification.identity,
          delegationInput,
        });
      requireAidosSnapshotCurrent(
        eligibility,
        input.aidosTargetRef,
        AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
        this.now(),
      );
      if (eligibility.state === "UNKNOWN")
        throw new RoutingContractError("AIDOS_AUTHORITY_STALE");
      if (eligibility.state !== "ELIGIBLE")
        throw new RoutingContractError("AIDOS_DELEGATION_INELIGIBLE");
      const snapshotBinding = validateAidosSnapshotBinding(
        eligibility.snapshotBinding,
      );
      const snapshotRevisions = new Map(
        snapshotBinding.projectionBindings.map((binding) => [
          binding.projectionType,
          binding.projectionRevision,
        ]),
      );
      if (
        snapshotRevisions.get(AIDOS_AVAILABILITY_SOURCE) !==
          availability.revision ||
        snapshotRevisions.get(AIDOS_PROJECT_REGISTRATION_SOURCE) !==
          registration.revision ||
        snapshotRevisions.get(AIDOS_DELEGATION_ELIGIBILITY_SOURCE) !==
          eligibility.revision
      )
        throw new RoutingContractError("AIDOS_AUTHORITY_CONFLICT");
      const checkedAt = new Date(
        Math.max(
          Date.parse(availability.observedAt),
          Date.parse(registration.observedAt),
          Date.parse(eligibility.observedAt),
        ),
      ).toISOString();
      const freshUntil = new Date(
        Math.min(
          Date.parse(availability.freshUntil),
          Date.parse(registration.freshUntil),
          Date.parse(eligibility.freshUntil),
        ),
      ).toISOString();
      const aidosProof = await this.dependencies.aidos.revalidate({
        availability: {
          projectRef: availability.projectRef,
          revision: availability.revision,
        },
        registration: {
          projectRef: registration.projectRef,
          revision: registration.revision,
        },
        eligibility: {
          projectRef: eligibility.projectRef,
          revision: eligibility.revision,
        },
        context: input.context,
        snapshotBinding,
      });
      if (
        !aidosProof.current ||
        aidosProof.authority !== AIDOS_AUTHORITY_SOURCE ||
        aidosProof.identity !== input.aidosTargetRef ||
        aidosProof.revision !==
          [
            availability.revision,
            registration.revision,
            eligibility.revision,
          ].join(":") ||
        aidosProof.freshnessModel !== "AUTHORITY_EXPIRY" ||
        JSON.stringify(aidosProof.snapshotBinding) !==
          JSON.stringify(snapshotBinding) ||
        !Number.isFinite(Date.parse(aidosProof.freshUntil)) ||
        Date.parse(aidosProof.freshUntil) <= this.now().getTime()
      )
        throw new RoutingContractError("AIDOS_AUTHORITY_CONFLICT");
      await this.revalidateCommonAuthorities(
        input,
        policyContext,
        classification,
        policy,
        specialization,
        approval,
      );
      return Object.freeze({
        request,
        classification,
        policy,
        specialization: safeSpecialization(specialization),
        approval,
        candidates: null,
        aidos: Object.freeze({
          projectRef: input.aidosTargetRef,
          availabilityRevision: availability.revision,
          registrationRevision: registration.revision,
          eligibilityRevision: eligibility.revision,
          checkedAt,
          freshUntil,
          evidenceRefs: Object.freeze([
            availability.evidenceRef,
            registration.evidenceRef,
            eligibility.evidenceRef,
          ]),
          delegationInput,
          snapshotBinding: aidosProof.snapshotBinding,
        }),
        developmentDelegationState: "READY_TO_DELEGATE",
      });
    }

    if (classification.handoff.routingDisposition === "DELEGATE_TO_AIDOS")
      throw new RoutingContractError("POLICY_DENIED");
    const candidates = await this.dependencies.candidates.resolve({
      policy,
      specialization,
      canonicalDomain: classification.handoff.domainKey,
      roleClass: input.roleClass,
      routingPurpose: input.routingPurpose,
      routingMode: input.routingMode,
      organizationId: input.context.organizationId,
      projectId: input.context.projectId,
      scopeRef: input.scopeRef,
      environment: input.context.environment,
      requiredCapabilityRefs: classification.handoff.requiredCapabilityRefs,
      preferredCapabilityRefs: classification.handoff.preferredCapabilityRefs,
      classification: Object.freeze({
        identity: classification.identity,
        revision: classification.revision,
        version: classification.classificationVersion,
        currentnessProof: classification.currentnessProof,
      }),
    });
    requireCandidateLineage(candidates, classification, policy, specialization);
    const registryAuthority = candidates.registryFreshnessAuthority;
    if (
      !candidates.registrySnapshotRef ||
      !candidates.registrySnapshotRevision ||
      !registryAuthority
    )
      throw new RoutingContractError("REGISTRY_STALE");
    const expectedFreshUntil = deriveRegistryFreshUntil(
      registryAuthority.registryObservedAt,
      registryAuthority.maxAgeMs,
    );
    if (
      registryAuthority.snapshotRef !== candidates.registrySnapshotRef ||
      registryAuthority.snapshotRevision !==
        candidates.registrySnapshotRevision ||
      registryAuthority.registryObservedAt !== candidates.registryObservedAt ||
      registryAuthority.freshUntil !== candidates.registryFreshUntil ||
      expectedFreshUntil !== registryAuthority.freshUntil ||
      Date.parse(registryAuthority.registryObservedAt) > this.now().getTime() ||
      Date.parse(registryAuthority.freshUntil) <= this.now().getTime()
    )
      throw new RoutingContractError("REGISTRY_STALE");
    const registryProof = await this.dependencies.registry.revalidate({
      ...registryAuthority,
      resourceRefs: [...candidates.registryResourceRefs],
    });
    if (
      !registryProof.current ||
      registryProof.authority !== "PHASE15B_REGISTRY" ||
      registryProof.identity !== candidates.registrySnapshotRef ||
      registryProof.revision !== candidates.registrySnapshotRevision ||
      registryProof.freshnessModel !== "AUTHORITY_EXPIRY" ||
      registryProof.policyRef !== registryAuthority.policyRef ||
      registryProof.policyVersion !== registryAuthority.policyVersion ||
      registryProof.maxAgeMs !== registryAuthority.maxAgeMs ||
      registryProof.registryObservedAt !==
        registryAuthority.registryObservedAt ||
      registryProof.snapshotRef !== registryAuthority.snapshotRef ||
      registryProof.snapshotRevision !== registryAuthority.snapshotRevision ||
      registryProof.snapshotHash !== registryAuthority.snapshotHash ||
      registryProof.freshUntil !== registryAuthority.freshUntil ||
      !Number.isFinite(Date.parse(registryProof.freshUntil)) ||
      Date.parse(registryProof.freshUntil) <= this.now().getTime()
    )
      throw new RoutingContractError("REGISTRY_CONFLICT");
    await this.revalidateCommonAuthorities(
      input,
      policyContext,
      classification,
      policy,
      specialization,
      approval,
    );
    return Object.freeze({
      request,
      classification,
      policy,
      specialization: safeSpecialization(specialization),
      approval,
      candidates,
      aidos: null,
      developmentDelegationState: "NOT_APPLICABLE",
    });
  }
}
