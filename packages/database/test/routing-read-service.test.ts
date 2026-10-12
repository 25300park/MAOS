import assert from "node:assert/strict";
import test from "node:test";

import {
  ROUTING_ERROR_CODES,
  RoutingContractError,
  RoutingReadService,
  type AppendRoutingDecisionInput,
  type RoutingCandidateSnapshot,
  type RoutingDecisionAuditInput,
  type RoutingDecisionRecord,
  type RoutingDecisionRepository,
  type RoutingPurpose,
} from "../src/index.js";

const requestId = "00000000-0000-4000-8000-000000000001";
const decisionId = (version: number) =>
  `00000000-0000-4000-8000-${String(version).padStart(12, "0")}`;

function decision(
  version: number,
  overrides: Partial<RoutingDecisionRecord> = {},
): RoutingDecisionRecord {
  return {
    routingDecisionId: decisionId(version),
    routingDecisionStreamId: "00000000-0000-4000-8000-000000000010",
    requestId,
    routingPurpose: "PRIMARY_EXECUTION",
    routingVersion: version,
    supersedesRoutingDecisionId: version === 1 ? null : decisionId(version - 1),
    classificationVersionId: "classification-version-1",
    classificationVersion: 1,
    classificationState: "VALIDATED",
    classificationCurrentnessState: "CURRENT",
    classificationCurrentnessProof: "classification-head-proof",
    classificationPolicyResolutionRef: "domain-policy-1",
    classificationPolicyResolutionVersion: "1",
    canonicalDomain: "OPERATIONS",
    roleClass: "EXECUTOR",
    routingMode: "PRIMARY_EXECUTION",
    specializationVersionId: null,
    routingPolicyVersionId: "routing-policy-version-1",
    selectedProviderRef: "provider-1",
    selectedModelRef: "model-1",
    selectedRuntimeAdapterRef: "runtime-1",
    selectedModelHostBindingRef: "binding-1",
    registrySnapshotRef: "registry-snapshot-1",
    registrySnapshotRevision: "registry-revision-1",
    registryFreshnessPolicyRef: "registry-policy-1",
    registryFreshnessPolicyVersion: "1",
    registryFreshnessMaxAgeMs: 3_600_000,
    registrySnapshotHash: "a".repeat(64),
    registryObservedAt: "2026-10-08T00:00:00.000Z",
    registryFreshUntil: "2026-10-08T01:00:00.000Z",
    requiredCapabilities: ["capability-required"],
    preferredCapabilities: ["capability-preferred"],
    policyConstraints: { maxCost: "bounded" },
    contextRefs: ["context-1"],
    artifactRefs: ["artifact-1"],
    evidenceRefs: ["internal-evidence-1"],
    priority: "NORMAL",
    humanApprovalState: "NOT_REQUIRED",
    humanApprovalRef: null,
    humanApprovalTargetVersion: null,
    humanApprovalTargetHash: null,
    humanApprovalAuthority: null,
    humanApprovalCheckedAt: null,
    humanApprovalExpiresAt: null,
    developmentDelegationState: "NOT_APPLICABLE",
    aidosProjectRef: null,
    aidosRequiredCapabilities: null,
    aidosAuthorityRevision: null,
    aidosCheckedAt: null,
    aidosFreshUntil: null,
    aidosDelegationInput: null,
    aidosSnapshotBinding: null,
    decisionState: "SELECTED",
    decisionReasonCodes: ["ROUTING_ALLOWED"],
    stalenessState: "CURRENT",
    classificationCheckedAt: "2026-10-08T00:00:00.000Z",
    policyCheckedAt: "2026-10-08T00:00:00.000Z",
    policyFreshUntil: "2026-10-08T01:00:00.000Z",
    idempotencyKey: `secret-idempotency-${version}`,
    canonicalIntentFingerprint: `secret-fingerprint-${version}`,
    correlationId: `internal-correlation-${version}`,
    causationRefs: ["internal-cause"],
    auditRef: `internal-audit-${version}`,
    createdAt: `2026-10-08T00:00:0${version}.000Z`,
    ...overrides,
  };
}

function candidate(rank: number): RoutingCandidateSnapshot {
  return {
    candidateSnapshotId: `candidate-${rank}`,
    routingDecisionId: decisionId(2),
    deterministicRank: rank,
    providerId: `provider-${rank}`,
    modelId: `model-${rank}`,
    runtimeAdapterId: `runtime-${rank}`,
    modelHostBindingId: `binding-${rank}`,
    eligibilityState: rank === 1 ? "ELIGIBLE" : "EXCLUDED",
    reasonCodes: rank === 1 ? ["ELIGIBLE"] : ["POLICY_DENIED"],
    capabilityEvidence: {
      provider: { id: `provider-${rank}`, version: 1 },
      model: { id: `model-${rank}`, version: 2 },
      runtimeAdapter: { id: `runtime-${rank}`, version: 3 },
      modelHostBinding: { id: `binding-${rank}`, version: 4 },
      capabilityBindings: [
        {
          id: `capability-binding-${rank}`,
          version: 1,
          capabilityId: "capability-required",
          capabilityVersion: 1,
          requirement: "REQUIRED",
        },
      ],
      roleCompatibility: { id: `role-compatibility-${rank}`, version: 1 },
      specialization: null,
      routingPolicy: {
        id: "routing-policy-1",
        versionId: "routing-policy-version-1",
        version: 1,
        contentFingerprint: "policy-fingerprint",
      },
      classification: {
        identity: "classification-version-1",
        revision: "classification-revision-1",
        version: 1,
        currentnessProof: "classification-head-proof",
      },
      matchedRequiredCapabilityRefs: ["capability-required"],
      matchedPreferredCapabilityRefs: ["capability-preferred"],
      roleClass: "EXECUTOR",
      routingMode: "PRIMARY_EXECUTION",
      unrestrictedSecret: "must-not-cross-read-boundary",
    },
    rankingEvidence: {
      preferredCapabilityMatchCount: 1,
      tieBreakers: ["PROVIDER_ID"],
      unrestrictedSecret: "must-not-cross-read-boundary",
    },
    registrySnapshotRef: "registry-snapshot-1",
    registrySnapshotRevision: "registry-revision-1",
    registryFreshnessPolicyRef: "registry-policy-1",
    registryFreshnessPolicyVersion: "1",
    registryFreshnessMaxAgeMs: 3_600_000,
    registrySnapshotHash: "a".repeat(64),
    observedAt: "2026-10-08T00:00:00.000Z",
    freshUntil: "2026-10-08T01:00:00.000Z",
    createdAt: "2026-10-08T00:00:02.000Z",
  };
}

class ReadRepository implements RoutingDecisionRepository {
  readonly mutationCalls: string[] = [];
  readonly records: RoutingDecisionRecord[] = [];
  readonly candidates = new Map<string, readonly RoutingCandidateSnapshot[]>();

  async findOrCreateStreamIdentity() {
    this.mutationCalls.push("findOrCreateStreamIdentity");
    return "unreachable";
  }
  async findCurrent(request: string, purpose: RoutingPurpose) {
    return this.records
      .filter(
        (record) =>
          record.requestId === request && record.routingPurpose === purpose,
      )
      .sort((left, right) => right.routingVersion - left.routingVersion)[0];
  }
  async findById(request: string, id: string) {
    return this.records.find(
      (record) =>
        record.requestId === request && record.routingDecisionId === id,
    );
  }
  async findDecisionById(id: string) {
    return this.records.find((record) => record.routingDecisionId === id);
  }
  async listHistory(request: string, purpose: RoutingPurpose) {
    return this.records.filter(
      (record) =>
        record.requestId === request && record.routingPurpose === purpose,
    );
  }
  async listCandidates(id: string) {
    return this.candidates.get(id) ?? [];
  }
  async findHumanOverrideAudit() {
    return undefined;
  }
  async recordRoutingAudit(_input: RoutingDecisionAuditInput) {
    this.mutationCalls.push("recordRoutingAudit");
  }
  async appendDecision(_input: AppendRoutingDecisionInput): Promise<never> {
    this.mutationCalls.push("appendDecision");
    throw new Error("read service invoked appendDecision");
  }
}

test("reads only the latest decision in the exact request and purpose stream", async () => {
  const repository = new ReadRepository();
  repository.records.push(
    decision(1),
    decision(2),
    decision(3, {
      routingDecisionId: decisionId(30),
      routingPurpose: "INDEPENDENT_REVIEW",
    }),
  );
  const service = new RoutingReadService({ repository });

  const result = await service.getCurrentDecision({
    requestId,
    routingPurpose: "PRIMARY_EXECUTION",
  });

  assert.equal(result.routingDecisionId, decisionId(2));
  assert.equal(result.routingVersion, 2);
  assert.equal(result.routingPurpose, "PRIMARY_EXECUTION");
  assert.deepEqual(result.registryProof.freshnessAuthority, {
    policyRef: "registry-policy-1",
    policyVersion: "1",
    maxAgeMs: 3_600_000,
    snapshotHash: "a".repeat(64),
  });
  assert.equal("idempotencyKey" in result, false);
  assert.equal("canonicalIntentFingerprint" in result, false);
  assert.deepEqual(repository.mutationCalls, []);
});

test("reads pre-0033 policy-less history without fabricating governed freshness", async () => {
  const repository = new ReadRepository();
  repository.records.push(
    decision(1, {
      registryFreshnessPolicyRef: null,
      registryFreshnessPolicyVersion: null,
      registryFreshnessMaxAgeMs: null,
      registrySnapshotHash: null,
    }),
  );
  const result = await new RoutingReadService({
    repository,
  }).getCurrentDecision({
    requestId,
    routingPurpose: "PRIMARY_EXECUTION",
  });
  assert.equal(result.registryProof.freshnessAuthority, null);
});

test("missing current decision fails with a frozen canonical code", async () => {
  const service = new RoutingReadService({ repository: new ReadRepository() });
  await assert.rejects(
    service.getCurrentDecision({
      requestId,
      routingPurpose: "PRIMARY_EXECUTION",
    }),
    (error: unknown) =>
      error instanceof RoutingContractError &&
      error.code === "ROUTING_DECISION_STALE",
  );
});

test("returns complete stream-local history in deterministic version order", async () => {
  const repository = new ReadRepository();
  repository.records.push(
    decision(2, {
      decisionReasonCodes: ["HUMAN_REQUESTED_REEVALUATION"],
      humanApprovalState: "APPROVED",
      humanApprovalRef: "approval-1",
      humanApprovalAuthority: "HUMAN",
    }),
    decision(1),
    decision(3, {
      routingDecisionId: decisionId(30),
      routingPurpose: "ADVERSARIAL_REVIEW",
    }),
  );
  const service = new RoutingReadService({ repository });

  const result = await service.getDecisionHistory({
    requestId,
    routingPurpose: "PRIMARY_EXECUTION",
  });

  assert.deepEqual(
    result.map(({ routingVersion }) => routingVersion),
    [1, 2],
  );
  assert.deepEqual(result[1]!.decisionReasonCodes, [
    "HUMAN_REQUESTED_REEVALUATION",
  ]);
  assert.equal(result[1]!.supersedesRoutingDecisionId, decisionId(1));
});

test("reads the exact immutable decision and rejects purpose mismatch without substitution", async () => {
  const repository = new ReadRepository();
  repository.records.push(decision(1), decision(2));
  const service = new RoutingReadService({ repository });

  const result = await service.getDecisionById({
    routingDecisionId: decisionId(1),
  });
  assert.equal(result.routingDecisionId, decisionId(1));
  assert.equal(result.routingVersion, 1);

  await assert.rejects(
    service.getDecisionById({
      routingDecisionId: decisionId(99),
    }),
    (error: unknown) =>
      error instanceof RoutingContractError &&
      error.code === "ROUTING_DECISION_STALE",
  );
});

test("returns deterministic decision-bound candidate DTOs with allowlisted lineage", async () => {
  const repository = new ReadRepository();
  repository.records.push(decision(2));
  repository.candidates.set(decisionId(2), [candidate(2), candidate(1)]);
  const service = new RoutingReadService({ repository });

  const result = await service.getDecisionCandidates({
    routingDecisionId: decisionId(2),
  });

  assert.deepEqual(
    result.map(({ deterministicRank }) => deterministicRank),
    [1, 2],
  );
  assert.equal(result[0]!.lineage.provider.id, "provider-1");
  assert.equal(result[0]!.lineage.capabilityBindings.length, 1);
  assert.equal(result[0]!.ranking.preferredCapabilityMatchCount, 1);
  assert.equal(result[0]!.registryFreshnessPolicyRef, "registry-policy-1");
  assert.equal(result[0]!.registryFreshnessPolicyVersion, "1");
  assert.equal(result[0]!.registryFreshnessMaxAgeMs, 3_600_000);
  assert.equal(result[0]!.registrySnapshotHash, "a".repeat(64));
  assert.equal(JSON.stringify(result).includes("unrestrictedSecret"), false);
  assert.equal(JSON.stringify(result).includes("must-not-cross"), false);
});

test("preserves persisted Development AIDOS states without execution side effects", async () => {
  const states = [
    ["READY_TO_DELEGATE", "DELEGATE_TO_AIDOS"],
    ["AIDOS_UNAVAILABLE", "AIDOS_UNAVAILABLE"],
    ["WAITING_AIDOS_ONBOARDING", "WAITING_AIDOS_ONBOARDING"],
  ] as const;
  for (const [developmentDelegationState, reasonCode] of states) {
    const repository = new ReadRepository();
    repository.records.push(
      decision(1, {
        canonicalDomain: "DEVELOPMENT",
        selectedProviderRef: null,
        selectedModelRef: null,
        selectedRuntimeAdapterRef: null,
        selectedModelHostBindingRef: null,
        developmentDelegationState,
        aidosProjectRef: "aidos-project-1",
        aidosRequiredCapabilities: ["development"],
        decisionState: "WAITING",
        decisionReasonCodes: [reasonCode],
      }),
    );
    const service = new RoutingReadService({ repository });

    const result = await service.getCurrentDecision({
      requestId,
      routingPurpose: "PRIMARY_EXECUTION",
    });

    assert.equal(result.canonicalDomain, "DEVELOPMENT");
    assert.equal(result.developmentDelegationState, developmentDelegationState);
    assert.deepEqual(result.decisionReasonCodes, [reasonCode]);
    assert.equal(result.selectedProviderRef, null);
    assert.deepEqual(repository.mutationCalls, []);
  }
});

test("does not add read-service failure codes", () => {
  assert.equal(ROUTING_ERROR_CODES.length, 41);
  assert.equal(
    ROUTING_ERROR_CODES.some((code) => code.includes("READ_SERVICE")),
    false,
  );
});
