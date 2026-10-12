import type {
  CandidateCapabilityBindingLineage,
  CandidateClassificationLineage,
  CandidateResourceLineage,
} from "./candidate-resolution-service.js";
import {
  validateAidosDelegationInput,
  validateAidosSnapshotBinding,
} from "./aidos-delegation-contracts.js";
import {
  RoutingContractError,
  toRoutingDecisionOutputV1,
  type RoutingCandidateSnapshot,
  type RoutingDecisionOutputV1,
  type RoutingDecisionRecord,
  type RoutingDecisionRepository,
  type RoutingFreshnessReference,
  type RoutingMode,
  type RoutingPurpose,
  type RoutingRoleClass,
} from "./routing-contracts.js";

export interface RoutingDecisionReadDto extends RoutingDecisionOutputV1 {
  readonly decisionState: RoutingDecisionRecord["decisionState"];
  readonly selectedModelHostBindingRef: string | null;
  readonly specializationVersionId: string | null;
  readonly classificationProof: Readonly<{
    identity: string;
    version: number;
    currentnessState: "CURRENT";
    currentnessProof: string;
    policyResolutionRef: string;
    policyResolutionVersion: string;
    checkedAt: string;
  }>;
  readonly policyProof: Readonly<{
    versionId: string;
    checkedAt: string;
    freshUntil: string;
  }>;
  readonly registryProof: Readonly<{
    snapshotRef: string;
    revision: string;
    observedAt: string;
    freshUntil: string;
    freshnessAuthority: Readonly<{
      policyRef: string;
      policyVersion: string;
      maxAgeMs: number;
      snapshotHash: string;
    }> | null;
  }>;
}

export interface RoutingCandidateReadDto {
  readonly candidateSnapshotId: string;
  readonly routingDecisionId: string;
  readonly deterministicRank: number;
  readonly providerId: string;
  readonly modelId: string;
  readonly runtimeAdapterId: string;
  readonly modelHostBindingId: string;
  readonly eligibilityState: RoutingCandidateSnapshot["eligibilityState"];
  readonly reasonCodes: readonly string[];
  readonly lineage: CandidateResourceLineage;
  readonly matchedRequiredCapabilityRefs: readonly string[];
  readonly matchedPreferredCapabilityRefs: readonly string[];
  readonly roleClass: RoutingRoleClass;
  readonly routingMode: RoutingMode;
  readonly ranking: Readonly<{
    preferredCapabilityMatchCount: number;
    tieBreakers: readonly string[];
  }>;
  readonly registrySnapshotRef: string;
  readonly registrySnapshotRevision: string;
  readonly registryFreshnessPolicyRef: string | null;
  readonly registryFreshnessPolicyVersion: string | null;
  readonly registryFreshnessMaxAgeMs: number | null;
  readonly registrySnapshotHash: string | null;
  readonly observedAt: string;
  readonly freshUntil: string;
  readonly createdAt: string;
}

interface StreamReadInput {
  readonly requestId: string;
  readonly routingPurpose: RoutingPurpose;
}

interface DecisionReadInput extends StreamReadInput {
  readonly routingDecisionId: string;
}

export interface RoutingReadServiceDependencies {
  readonly repository: RoutingDecisionRepository;
}

function object(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RoutingContractError("ROUTING_DECISION_STALE");
  return value as Readonly<Record<string, unknown>>;
}

function string(value: unknown): string {
  if (typeof value !== "string" || value.length === 0)
    throw new RoutingContractError("ROUTING_DECISION_STALE");
  return value;
}

function number(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0)
    throw new RoutingContractError("ROUTING_DECISION_STALE");
  return value as number;
}

function strings(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new RoutingContractError("ROUTING_DECISION_STALE");
  return Object.freeze([...value]);
}

function jsonValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (Array.isArray(value)) return Object.freeze(value.map(jsonValue));
  const source = object(value);
  return Object.freeze(
    Object.fromEntries(
      Object.entries(source).map(([key, item]) => [key, jsonValue(item)]),
    ),
  );
}

function jsonObject(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return jsonValue(value) as Readonly<Record<string, unknown>>;
}

function versionedRef(value: unknown) {
  const source = object(value);
  return Object.freeze({
    id: string(source.id),
    version: number(source.version),
  });
}

function capabilityBindings(value: unknown) {
  if (!Array.isArray(value))
    throw new RoutingContractError("ROUTING_DECISION_STALE");
  return Object.freeze(
    value.map((item): CandidateCapabilityBindingLineage => {
      const source = object(item);
      const requirement = source.requirement;
      if (requirement !== "REQUIRED" && requirement !== "PREFERRED")
        throw new RoutingContractError("ROUTING_DECISION_STALE");
      return Object.freeze({
        id: string(source.id),
        version: number(source.version),
        capabilityId: string(source.capabilityId),
        capabilityVersion: number(source.capabilityVersion),
        requirement,
      });
    }),
  );
}

function classificationLineage(value: unknown): CandidateClassificationLineage {
  const source = object(value);
  return Object.freeze({
    identity: string(source.identity),
    revision: string(source.revision),
    version: number(source.version),
    currentnessProof: string(source.currentnessProof),
  });
}

function specializationLineage(value: unknown) {
  if (value === null) return null;
  const source = object(value);
  return Object.freeze({
    id: string(source.id),
    versionId: string(source.versionId),
    version: number(source.version),
    contentFingerprint: string(source.contentFingerprint),
  });
}

function policyLineage(value: unknown) {
  const source = object(value);
  return Object.freeze({
    id: string(source.id),
    versionId: string(source.versionId),
    version: number(source.version),
    contentFingerprint: string(source.contentFingerprint),
  });
}

function candidateDto(
  candidate: RoutingCandidateSnapshot,
): RoutingCandidateReadDto {
  const evidence = object(candidate.capabilityEvidence);
  const ranking = object(candidate.rankingEvidence);
  const roleClass = evidence.roleClass;
  const routingMode = evidence.routingMode;
  if (
    ![
      "PLANNER",
      "EXECUTOR",
      "RESEARCHER",
      "ANALYST",
      "WRITER",
      "REVIEWER",
    ].includes(roleClass as string) ||
    ![
      "PRIMARY_EXECUTION",
      "FALLBACK",
      "INDEPENDENT_REVIEW",
      "ADVERSARIAL_REVIEW",
    ].includes(routingMode as string)
  )
    throw new RoutingContractError("ROUTING_DECISION_STALE");

  const lineage = Object.freeze({
    provider: versionedRef(evidence.provider),
    model: versionedRef(evidence.model),
    runtimeAdapter: versionedRef(evidence.runtimeAdapter),
    modelHostBinding: versionedRef(evidence.modelHostBinding),
    capabilityBindings: capabilityBindings(evidence.capabilityBindings),
    roleCompatibility: versionedRef(evidence.roleCompatibility),
    specialization: specializationLineage(evidence.specialization),
    routingPolicy: policyLineage(evidence.routingPolicy),
    classification: classificationLineage(evidence.classification),
  }) satisfies CandidateResourceLineage;

  return Object.freeze({
    candidateSnapshotId: candidate.candidateSnapshotId,
    routingDecisionId: candidate.routingDecisionId,
    deterministicRank: candidate.deterministicRank,
    providerId: candidate.providerId,
    modelId: candidate.modelId,
    runtimeAdapterId: candidate.runtimeAdapterId,
    modelHostBindingId: candidate.modelHostBindingId,
    eligibilityState: candidate.eligibilityState,
    reasonCodes: Object.freeze([...candidate.reasonCodes]),
    lineage,
    matchedRequiredCapabilityRefs: strings(
      evidence.matchedRequiredCapabilityRefs,
    ),
    matchedPreferredCapabilityRefs: strings(
      evidence.matchedPreferredCapabilityRefs,
    ),
    roleClass: roleClass as RoutingRoleClass,
    routingMode: routingMode as RoutingMode,
    ranking: Object.freeze({
      preferredCapabilityMatchCount: number(
        ranking.preferredCapabilityMatchCount,
      ),
      tieBreakers: strings(ranking.tieBreakers),
    }),
    registrySnapshotRef: candidate.registrySnapshotRef,
    registrySnapshotRevision: candidate.registrySnapshotRevision,
    registryFreshnessPolicyRef: candidate.registryFreshnessPolicyRef,
    registryFreshnessPolicyVersion: candidate.registryFreshnessPolicyVersion,
    registryFreshnessMaxAgeMs: candidate.registryFreshnessMaxAgeMs,
    registrySnapshotHash: candidate.registrySnapshotHash,
    observedAt: candidate.observedAt,
    freshUntil: candidate.freshUntil,
    createdAt: candidate.createdAt,
  });
}

function persistedFreshnessReferences(
  record: RoutingDecisionRecord,
): readonly RoutingFreshnessReference[] {
  const references: RoutingFreshnessReference[] = [
    Object.freeze({
      authority: "CLASSIFICATION",
      identity: record.classificationVersionId,
      revision: record.classificationCurrentnessProof,
      checkedAt: record.classificationCheckedAt,
      freshnessModel: "REFERENCE_VERSION_CURRENTNESS",
    }),
    Object.freeze({
      authority: "POLICY",
      identity: record.routingPolicyVersionId,
      revision: record.routingPolicyVersionId,
      checkedAt: record.policyCheckedAt,
      freshUntil: record.policyFreshUntil,
      freshnessModel: "AUTHORITY_EXPIRY",
    }),
    Object.freeze({
      authority: "REGISTRY",
      identity: record.registrySnapshotRef,
      revision: record.registrySnapshotRevision,
      checkedAt: record.registryObservedAt,
      freshUntil: record.registryFreshUntil,
      freshnessModel: "AUTHORITY_EXPIRY",
    }),
  ];
  if (
    record.humanApprovalRef &&
    record.humanApprovalCheckedAt &&
    record.humanApprovalExpiresAt
  )
    references.push(
      Object.freeze({
        authority: "APPROVAL",
        identity: record.humanApprovalRef,
        revision:
          record.humanApprovalTargetHash ??
          record.humanApprovalTargetVersion ??
          record.humanApprovalRef,
        checkedAt: record.humanApprovalCheckedAt,
        freshUntil: record.humanApprovalExpiresAt,
        freshnessModel: "AUTHORITY_EXPIRY",
      }),
    );
  if (
    record.aidosProjectRef &&
    record.aidosAuthorityRevision &&
    record.aidosCheckedAt &&
    record.aidosFreshUntil
  )
    references.push(
      Object.freeze({
        authority: "AIDOS",
        identity: record.aidosProjectRef,
        revision: record.aidosAuthorityRevision,
        checkedAt: record.aidosCheckedAt,
        freshUntil: record.aidosFreshUntil,
        freshnessModel: "AUTHORITY_EXPIRY",
      }),
    );
  return Object.freeze(references);
}

function requireDecisionScope(
  record: RoutingDecisionRecord | undefined,
  input: StreamReadInput,
): RoutingDecisionRecord {
  if (
    !record ||
    record.requestId !== input.requestId ||
    record.routingPurpose !== input.routingPurpose
  )
    throw new RoutingContractError("ROUTING_DECISION_STALE");
  return record;
}

export class RoutingReadService {
  constructor(private readonly dependencies: RoutingReadServiceDependencies) {}

  private async decisionDto(
    record: RoutingDecisionRecord,
  ): Promise<RoutingDecisionReadDto> {
    const candidates = await this.dependencies.repository.listCandidates(
      record.routingDecisionId,
    );
    if (
      candidates.some(
        (candidate) => candidate.routingDecisionId !== record.routingDecisionId,
      )
    )
      throw new RoutingContractError("ROUTING_DECISION_STALE");
    const output = toRoutingDecisionOutputV1(
      record,
      candidates,
      persistedFreshnessReferences(record),
    );
    return Object.freeze({
      ...output,
      requiredCapabilities: Object.freeze([...output.requiredCapabilities]),
      preferredCapabilities: Object.freeze([...output.preferredCapabilities]),
      eligibleResourceRefs: Object.freeze([...output.eligibleResourceRefs]),
      policyConstraints: jsonObject(output.policyConstraints),
      contextRefs: Object.freeze([...output.contextRefs]),
      artifactRefs: Object.freeze([...output.artifactRefs]),
      aidosRequiredCapabilities: output.aidosRequiredCapabilities
        ? Object.freeze([...output.aidosRequiredCapabilities])
        : null,
      aidosDelegationInput: output.aidosDelegationInput
        ? validateAidosDelegationInput(output.aidosDelegationInput)
        : null,
      aidosSnapshotBinding: output.aidosSnapshotBinding
        ? validateAidosSnapshotBinding(output.aidosSnapshotBinding)
        : null,
      decisionReasonCodes: Object.freeze([...output.decisionReasonCodes]),
      freshnessReferences: Object.freeze(
        output.freshnessReferences.map((reference) =>
          Object.freeze({ ...reference }),
        ),
      ),
      decisionState: record.decisionState,
      selectedModelHostBindingRef: record.selectedModelHostBindingRef,
      specializationVersionId: record.specializationVersionId,
      classificationProof: Object.freeze({
        identity: record.classificationVersionId,
        version: record.classificationVersion,
        currentnessState: record.classificationCurrentnessState,
        currentnessProof: record.classificationCurrentnessProof,
        policyResolutionRef: record.classificationPolicyResolutionRef,
        policyResolutionVersion: record.classificationPolicyResolutionVersion,
        checkedAt: record.classificationCheckedAt,
      }),
      policyProof: Object.freeze({
        versionId: record.routingPolicyVersionId,
        checkedAt: record.policyCheckedAt,
        freshUntil: record.policyFreshUntil,
      }),
      registryProof: Object.freeze({
        snapshotRef: record.registrySnapshotRef,
        revision: record.registrySnapshotRevision,
        observedAt: record.registryObservedAt,
        freshUntil: record.registryFreshUntil,
        freshnessAuthority:
          record.registryFreshnessPolicyRef == null ||
          record.registryFreshnessPolicyVersion == null ||
          record.registryFreshnessMaxAgeMs == null ||
          record.registrySnapshotHash == null
            ? null
            : Object.freeze({
                policyRef: record.registryFreshnessPolicyRef,
                policyVersion: record.registryFreshnessPolicyVersion,
                maxAgeMs: record.registryFreshnessMaxAgeMs,
                snapshotHash: record.registrySnapshotHash,
              }),
      }),
    });
  }

  async getCurrentDecision(
    input: StreamReadInput,
  ): Promise<RoutingDecisionReadDto> {
    const record = requireDecisionScope(
      await this.dependencies.repository.findCurrent(
        input.requestId,
        input.routingPurpose,
      ),
      input,
    );
    return this.decisionDto(record);
  }

  async getDecisionHistory(
    input: StreamReadInput,
  ): Promise<readonly RoutingDecisionReadDto[]> {
    const records = await this.dependencies.repository.listHistory(
      input.requestId,
      input.routingPurpose,
    );
    for (const record of records) requireDecisionScope(record, input);
    const ordered = [...records].sort(
      (left, right) => left.routingVersion - right.routingVersion,
    );
    if (
      ordered.some(
        (record, index) =>
          index > 0 &&
          ordered[index - 1]!.routingVersion === record.routingVersion,
      )
    )
      throw new RoutingContractError("ROUTING_STREAM_CONFLICT");
    return Object.freeze(
      await Promise.all(ordered.map((record) => this.decisionDto(record))),
    );
  }

  async getDecisionById(
    input: DecisionReadInput,
  ): Promise<RoutingDecisionReadDto> {
    const record = requireDecisionScope(
      await this.dependencies.repository.findById(
        input.requestId,
        input.routingDecisionId,
      ),
      input,
    );
    return this.decisionDto(record);
  }

  async getDecisionCandidates(
    input: DecisionReadInput,
  ): Promise<readonly RoutingCandidateReadDto[]> {
    requireDecisionScope(
      await this.dependencies.repository.findById(
        input.requestId,
        input.routingDecisionId,
      ),
      input,
    );
    const candidates = await this.dependencies.repository.listCandidates(
      input.routingDecisionId,
    );
    if (
      candidates.some(
        (candidate) => candidate.routingDecisionId !== input.routingDecisionId,
      )
    )
      throw new RoutingContractError("ROUTING_DECISION_STALE");
    const ordered = [...candidates].sort(
      (left, right) => left.deterministicRank - right.deterministicRank,
    );
    if (
      ordered.some(
        (candidate, index) =>
          index > 0 &&
          ordered[index - 1]!.deterministicRank === candidate.deterministicRank,
      )
    )
      throw new RoutingContractError("NONDETERMINISTIC_CANDIDATE_TIE");
    return Object.freeze(ordered.map(candidateDto));
  }
}
