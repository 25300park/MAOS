import type {
  CanonicalWorkRequestRecord,
  WorkRequestContext,
} from "./work-request-contracts.js";
import type {
  AppendClassificationInput,
  ClassificationAppendResult,
  ClassificationRecord,
  DomainConstraintSnapshot,
  Phase15dClassificationHandoff,
} from "./request-classification-contracts.js";

export interface ClassificationRuntimePort {
  findRequest(id: string): Promise<CanonicalWorkRequestRecord | undefined>;
  findClassificationHead(
    requestId: string,
  ): Promise<ClassificationRecord | undefined>;
  listClassificationHistory(
    requestId: string,
  ): Promise<readonly ClassificationRecord[]>;
  findDomainConstraint(
    id: string,
    policyVersion: string,
  ): Promise<DomainConstraintSnapshot | undefined>;
  appendClassification(
    input: AppendClassificationInput,
  ): Promise<ClassificationAppendResult>;
}

export interface ClassificationStalenessInput {
  readonly requestChanged?: boolean;
  readonly taskChanged?: boolean;
  readonly policyChanged?: boolean;
  readonly capabilitiesChanged?: boolean;
  readonly evidenceInvalid?: boolean;
  readonly humanOverride?: boolean;
  readonly conflictingClassification?: boolean;
  readonly taxonomyInvalid?: boolean;
}
export interface ResolveCurrentClassificationInput extends WorkRequestContext {
  readonly requestId: string;
  readonly staleness?: ClassificationStalenessInput;
}
export interface CurrentClassificationResult {
  readonly request: CanonicalWorkRequestRecord;
  readonly classification: ClassificationRecord;
  readonly policy: DomainConstraintSnapshot;
}

function sameContext(
  request: CanonicalWorkRequestRecord,
  input: ResolveCurrentClassificationInput,
) {
  return (
    request.organizationId === input.organizationId &&
    request.projectId === input.projectId &&
    request.companyScopeRef === input.companyScopeRef &&
    request.teamScopeRef === input.teamScopeRef &&
    request.projectScopeRef === input.projectScopeRef &&
    request.systemScopeRef === input.systemScopeRef &&
    request.environment === input.environment
  );
}

export function detectClassificationStaleness(
  input: ClassificationStalenessInput,
) {
  const reasons = Object.entries(input)
    .filter(([, value]) => value)
    .map(([key]) => key);
  return { stale: reasons.length > 0, reasons };
}

export class RequestClassificationRuntime {
  constructor(private readonly repository: ClassificationRuntimePort) {}
  async resolveCurrentClassification(
    input: ResolveCurrentClassificationInput,
  ): Promise<CurrentClassificationResult> {
    const request = await this.repository.findRequest(input.requestId);
    if (!request) throw new Error("WORK_REQUEST_NOT_FOUND");
    if (request.lifecycleState !== "REGISTERED")
      throw new Error("WORK_REQUEST_NOT_REGISTERED");
    if (!sameContext(request, input))
      throw new Error("WORK_REQUEST_CONTEXT_MISMATCH");
    if (input.staleness && detectClassificationStaleness(input.staleness).stale)
      throw new Error("CLASSIFICATION_STALE");
    const history = await this.repository.listClassificationHistory(
      input.requestId,
    );
    const head = await this.repository.findClassificationHead(input.requestId);
    if (!head) throw new Error("CLASSIFICATION_MISSING");
    const ordered = [...history].sort((a, b) => a.version - b.version);
    if (
      ordered.length !== head.version ||
      ordered.at(-1)?.classificationId !== head.classificationId ||
      ordered.some(
        (record, index) =>
          record.version !== index + 1 ||
          (index === 0
            ? record.supersedesClassificationId !== null
            : record.supersedesClassificationId !==
              ordered[index - 1]!.classificationId),
      )
    )
      throw new Error("CLASSIFICATION_CHAIN_INVALID");
    if (head.classificationState !== "VALIDATED")
      throw new Error(`CLASSIFICATION_HEAD_${head.classificationState}`);
    if (!head.policyResolutionRef || !head.policyResolutionVersion)
      throw new Error("CLASSIFICATION_POLICY_UNRESOLVED");
    const policy = await this.repository.findDomainConstraint(
      head.policyResolutionRef,
      head.policyResolutionVersion,
    );
    if (
      !policy ||
      policy.status !== "ACTIVE" ||
      policy.domainKey !== head.domainKey ||
      policy.routingDisposition !== head.routingDisposition ||
      policy.policyVersion !== head.policyResolutionVersion
    )
      throw new Error("CLASSIFICATION_POLICY_DRIFT");
    if (
      head.domainKey === "DEVELOPMENT" &&
      (head.routingDisposition !== "DELEGATE_TO_AIDOS" ||
        policy.targetKind !== "AIDOS")
    )
      throw new Error("DEVELOPMENT_NATIVE_EXECUTION_FORBIDDEN");
    return { request, classification: head, policy };
  }
  async proposeAiAssistedClassification(input: AppendClassificationInput) {
    if (
      input.classificationState !== "PROPOSED" ||
      input.source !== "AI_ASSISTED"
    )
      throw new Error("AI_VALIDATION_AUTHORITY_DENIED");
    return this.repository.appendClassification(input);
  }
  async validateClassificationProposal(
    input: AppendClassificationInput & {
      automaticValidationAuthorized: boolean;
    },
  ) {
    if (
      !input.automaticValidationAuthorized ||
      !input.validatorRuleRef ||
      !input.validatorRuleVersion ||
      !input.policyResolutionRef ||
      !input.policyResolutionVersion ||
      !input.evidenceRefs.length
    )
      throw new Error("CLASSIFICATION_VALIDATOR_POLICY_REQUIRED");
    if (
      input.source !== "DETERMINISTIC_POLICY" ||
      input.classificationState !== "VALIDATED"
    )
      throw new Error("AI_VALIDATION_AUTHORITY_DENIED");
    if (
      input.domainKey === "DEVELOPMENT" &&
      input.routingDisposition !== "DELEGATE_TO_AIDOS"
    )
      throw new Error("DEVELOPMENT_NATIVE_EXECUTION_FORBIDDEN");
    return this.repository.appendClassification(input);
  }
  async applyHumanClassificationOverride(
    input: AppendClassificationInput & { humanAuthorized: boolean },
  ) {
    if (
      !input.humanAuthorized ||
      input.source !== "HUMAN_OVERRIDE" ||
      input.classificationState !== "PROPOSED" ||
      !input.evidenceRefs.length ||
      !input.reasonCode ||
      !input.expectedPredecessorId
    )
      throw new Error("HUMAN_OVERRIDE_DENIED");
    if (
      input.domainKey === "DEVELOPMENT" &&
      input.routingDisposition !== "DELEGATE_TO_AIDOS"
    )
      throw new Error("DEVELOPMENT_NATIVE_EXECUTION_FORBIDDEN");
    return this.repository.appendClassification(input);
  }
  appendStaleClassification(input: AppendClassificationInput) {
    if (input.classificationState !== "STALE")
      throw new Error("STALE_VERSION_REQUIRED");
    return this.repository.appendClassification(input);
  }
  buildPhase15dClassificationHandoff(input: {
    classification: ClassificationRecord;
    policy: Pick<
      DomainConstraintSnapshot,
      | "id"
      | "policyVersion"
      | "routingDisposition"
      | "targetKind"
      | "targetRef"
      | "targetVersion"
    >;
    freshnessProof: string;
    organizationId: string;
    projectId: string;
    environment: string;
  }): Phase15dClassificationHandoff {
    const c = input.classification;
    if (
      c.classificationState !== "VALIDATED" ||
      !c.policyResolutionRef ||
      !c.policyResolutionVersion
    )
      throw new Error("PHASE15D_CLASSIFICATION_NOT_VALIDATED");
    if (
      c.policyResolutionRef !== input.policy.id ||
      c.policyResolutionVersion !== input.policy.policyVersion ||
      c.routingDisposition !== input.policy.routingDisposition
    )
      throw new Error("PHASE15D_POLICY_MISMATCH");
    if (
      c.domainKey === "DEVELOPMENT" &&
      (c.routingDisposition !== "DELEGATE_TO_AIDOS" ||
        input.policy.targetKind !== "AIDOS")
    )
      throw new Error("DEVELOPMENT_NATIVE_EXECUTION_FORBIDDEN");
    if (!input.freshnessProof) throw new Error("PHASE15D_FRESHNESS_REQUIRED");
    return {
      classificationId: c.classificationId,
      requestId: c.requestId,
      taskId: c.taskId,
      version: c.version,
      domainKey: c.domainKey,
      subdomainKey: c.subdomainKey,
      routingDisposition: c.routingDisposition,
      requestedRoleClass: c.requestedRoleClass,
      requiredCapabilityRefs: c.requiredCapabilityRefs,
      preferredCapabilityRefs: c.preferredCapabilityRefs,
      policyConstraintRefs: c.policyConstraintRefs,
      policyResolutionRef: c.policyResolutionRef,
      policyResolutionVersion: c.policyResolutionVersion,
      contextRefs: c.contextRefs,
      artifactRefs: c.artifactRefs,
      priorityClass: c.priorityClass,
      correlationId: c.correlationId,
      causationRef: c.causationRef,
      freshnessProof: input.freshnessProof,
      organizationId: input.organizationId,
      projectId: input.projectId,
      environment: input.environment,
    };
  }
  async validatePhase15dClassificationHandoff(
    input: Phase15dClassificationHandoff &
      ResolveCurrentClassificationInput & {
        supportedCapabilityRefs?: readonly string[];
      },
  ) {
    const current = await this.resolveCurrentClassification(input);
    const c = current.classification;
    if (
      c.classificationId !== input.classificationId ||
      c.version !== input.version
    )
      throw new Error("PHASE15D_NON_CURRENT_CLASSIFICATION");
    if (
      c.requestId !== input.requestId ||
      c.taskId !== input.taskId ||
      c.domainKey !== input.domainKey ||
      c.routingDisposition !== input.routingDisposition ||
      c.policyResolutionRef !== input.policyResolutionRef ||
      c.policyResolutionVersion !== input.policyResolutionVersion
    )
      throw new Error("PHASE15D_HANDOFF_MISMATCH");
    if (!input.freshnessProof) throw new Error("PHASE15D_FRESHNESS_REQUIRED");
    if (
      input.supportedCapabilityRefs &&
      input.requiredCapabilityRefs.some(
        (ref) => !input.supportedCapabilityRefs!.includes(ref),
      )
    )
      throw new Error("PHASE15D_CAPABILITY_UNSUPPORTED");
    return Object.freeze({ ...input, validated: true as const });
  }
}
