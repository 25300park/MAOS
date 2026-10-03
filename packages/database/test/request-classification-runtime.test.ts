import assert from "node:assert/strict";
import test from "node:test";
import {
  RequestClassificationRuntime,
  detectClassificationStaleness,
  type AppendClassificationInput,
} from "../src/index.js";

const current = {
  classificationId: "c",
  requestId: "r",
  taskId: null,
  version: 2,
  supersedesClassificationId: "p",
  domainKey: "DEVELOPMENT",
  subdomainKey: null,
  classificationState: "VALIDATED",
  source: "DETERMINISTIC_POLICY",
  routingDisposition: "DELEGATE_TO_AIDOS",
  reasonCode: "VALID",
  requestedRoleClass: "DEVELOPER",
  requiredCapabilityRefs: ["capability://code"],
  preferredCapabilityRefs: [],
  policyConstraintRefs: [],
  contextRefs: [],
  artifactRefs: [],
  evidenceRefs: ["evidence://1"],
  priorityClass: "NORMAL",
  intentClassRef: null,
  intentSnapshotHash: null,
  riskClassRef: null,
  riskSnapshotHash: null,
  confidenceClass: null,
  validatorRuleRef: "rule://classification",
  validatorRuleVersion: "1",
  policyResolutionRef: "policy",
  policyResolutionVersion: "1",
  createdByActorType: "SYSTEM",
  createdByActorId: "actor",
  createdAt: new Date().toISOString(),
  validatedAt: new Date().toISOString(),
  staleAt: null,
  canonicalPayloadFingerprint: "sha256:" + "a".repeat(64),
  idempotencyKey: "k",
  correlationId: "corr",
  causationRef: null,
  auditRef: "audit",
} as const;
const request = {
  id: "r",
  lifecycleState: "REGISTERED",
  organizationId: "o",
  projectId: "p",
  companyScopeRef: "c",
  teamScopeRef: null,
  projectScopeRef: "ps",
  systemScopeRef: null,
  environment: "STAGING",
  sourceSystem: "MAOS",
  sourceType: "MESSAGE",
  sourceRef: "message://1",
  sourceFingerprint: "sha256:" + "b".repeat(64),
  registrationAuditRef: "audit-request",
  registeredAt: new Date().toISOString(),
  invalidatedAt: null,
  invalidationReasonCode: null,
} as const;

test("resolves only latest validated non-stale exact policy", async () => {
  const runtime = new RequestClassificationRuntime({
    findRequest: async () => request,
    findClassificationHead: async () => current,
    listClassificationHistory: async () => [
      {
        ...current,
        version: 1,
        classificationId: "p",
        supersedesClassificationId: null,
      },
      current,
    ],
    findDomainConstraint: async () => ({
      id: "policy",
      domainKey: "DEVELOPMENT",
      executionMode: "DELEGATE_TO_AIDOS",
      routingDisposition: "DELEGATE_TO_AIDOS",
      targetKind: "AIDOS",
      targetRef: "authority://aidos/development",
      targetVersion: "MAOS-031",
      status: "ACTIVE",
      policyVersion: "1",
    }),
    appendClassification: async () => {
      throw new Error("not used");
    },
  });
  const result = await runtime.resolveCurrentClassification({
    requestId: "r",
    organizationId: "o",
    projectId: "p",
    companyScopeRef: "c",
    teamScopeRef: null,
    projectScopeRef: "ps",
    systemScopeRef: null,
    environment: "STAGING",
  });
  assert.equal(result.classification.domainKey, "DEVELOPMENT");
  assert.equal(result.policy.targetKind, "AIDOS");
});

test("policy drift and stale material deny without persistence", async () => {
  assert.equal(
    detectClassificationStaleness({ policyChanged: true }).stale,
    true,
  );
  const runtime = new RequestClassificationRuntime({
    findRequest: async () => request,
    findClassificationHead: async () => current,
    listClassificationHistory: async () => [
      {
        ...current,
        version: 1,
        classificationId: "p",
        supersedesClassificationId: null,
      },
      current,
    ],
    findDomainConstraint: async () => ({
      id: "policy",
      domainKey: "DEVELOPMENT",
      executionMode: "DELEGATE_TO_AIDOS",
      routingDisposition: "DELEGATE_TO_AIDOS",
      targetKind: "AIDOS",
      targetRef: "authority://aidos/development",
      targetVersion: "MAOS-031",
      status: "ACTIVE",
      policyVersion: "2",
    }),
    appendClassification: async () => {
      throw new Error("not used");
    },
  });
  await assert.rejects(
    runtime.resolveCurrentClassification({
      requestId: "r",
      organizationId: "o",
      projectId: "p",
      companyScopeRef: "c",
      teamScopeRef: null,
      projectScopeRef: "ps",
      systemScopeRef: null,
      environment: "STAGING",
    }),
    /CLASSIFICATION_POLICY_DRIFT/,
  );
  for (const stale of [
    { requestChanged: true },
    { taskChanged: true },
    { policyChanged: true },
    { capabilitiesChanged: true },
    { evidenceInvalid: true },
    { humanOverride: true },
    { conflictingClassification: true },
    { taxonomyInvalid: true },
  ]) {
    await assert.rejects(
      runtime.resolveCurrentClassification({
        requestId: "r",
        organizationId: "o",
        projectId: "p",
        companyScopeRef: "c",
        teamScopeRef: null,
        projectScopeRef: "ps",
        systemScopeRef: null,
        environment: "STAGING",
        staleness: stale,
      }),
      /CLASSIFICATION_STALE/,
    );
  }
});

test("AI can propose but cannot directly validate and Phase15D has no selected runtime entities", async () => {
  const runtime = new RequestClassificationRuntime({} as never);
  await assert.rejects(
    runtime.proposeAiAssistedClassification({
      classificationState: "VALIDATED",
    } as never),
    /AI_VALIDATION_AUTHORITY_DENIED/,
  );
  const handoff = runtime.buildPhase15dClassificationHandoff({
    classification: current,
    policy: {
      id: "policy",
      policyVersion: "1",
      routingDisposition: "DELEGATE_TO_AIDOS",
      targetKind: "AIDOS",
      targetRef: "authority://aidos/development",
      targetVersion: "MAOS-031",
    },
    freshnessProof: "fresh",
    organizationId: "o",
    projectId: "p",
    environment: "STAGING",
  });
  assert.equal("selectedModelId" in handoff, false);
  assert.equal(handoff.routingDisposition, "DELEGATE_TO_AIDOS");
});

test("deterministic validation and Human override remain separately governed", async () => {
  const appended: unknown[] = [];
  const runtime = new RequestClassificationRuntime({
    appendClassification: async (input: AppendClassificationInput) => {
      appended.push(input);
      return { outcome: "CREATED", classification: current, auditRef: "audit" };
    },
  } as never);
  const base = {
    ...current,
    classificationId: "next",
    expectedPredecessorId: "c",
    actorType: "SYSTEM",
    actorId: "actor",
    traceId: "trace",
    spanId: "span",
    requestContext: {
      organizationId: "o",
      projectId: "p",
      companyScopeRef: "c",
      teamScopeRef: null,
      projectScopeRef: "ps",
      systemScopeRef: null,
      environment: "STAGING",
    },
  };
  await assert.rejects(
    runtime.validateClassificationProposal({
      ...base,
      source: "AI_ASSISTED",
      automaticValidationAuthorized: true,
    } as never),
    /AI_VALIDATION_AUTHORITY_DENIED/,
  );
  await assert.rejects(
    runtime.validateClassificationProposal({
      ...base,
      source: "DETERMINISTIC_POLICY",
      validatorRuleRef: null,
      automaticValidationAuthorized: true,
    } as never),
    /CLASSIFICATION_VALIDATOR_POLICY_REQUIRED/,
  );
  await runtime.validateClassificationProposal({
    ...base,
    source: "DETERMINISTIC_POLICY",
    automaticValidationAuthorized: true,
  } as never);
  await assert.rejects(
    runtime.applyHumanClassificationOverride({
      ...base,
      source: "HUMAN_OVERRIDE",
      classificationState: "VALIDATED",
      humanAuthorized: true,
    } as never),
    /HUMAN_OVERRIDE_DENIED/,
  );
  await runtime.applyHumanClassificationOverride({
    ...base,
    source: "HUMAN_OVERRIDE",
    classificationState: "PROPOSED",
    humanAuthorized: true,
  } as never);
  assert.equal(appended.length, 2);
});

test("Phase15D handoff revalidates head, context, policy, freshness and capabilities", async () => {
  const runtime = new RequestClassificationRuntime({
    findRequest: async () => request,
    findClassificationHead: async () => current,
    listClassificationHistory: async () => [
      {
        ...current,
        version: 1,
        classificationId: "p",
        supersedesClassificationId: null,
      },
      current,
    ],
    findDomainConstraint: async () => ({
      id: "policy",
      domainKey: "DEVELOPMENT",
      executionMode: "DELEGATE_TO_AIDOS",
      routingDisposition: "DELEGATE_TO_AIDOS",
      targetKind: "AIDOS",
      targetRef: "authority://aidos/development",
      targetVersion: "MAOS-031",
      status: "ACTIVE",
      policyVersion: "1",
    }),
    appendClassification: async () => {
      throw new Error("not used");
    },
  });
  const handoff = runtime.buildPhase15dClassificationHandoff({
    classification: current,
    policy: {
      id: "policy",
      policyVersion: "1",
      routingDisposition: "DELEGATE_TO_AIDOS",
      targetKind: "AIDOS",
      targetRef: "authority://aidos/development",
      targetVersion: "MAOS-031",
    },
    freshnessProof: "fresh",
    organizationId: "o",
    projectId: "p",
    environment: "STAGING",
  });
  const context = {
    ...handoff,
    requestId: "r",
    organizationId: "o",
    projectId: "p",
    companyScopeRef: "c",
    teamScopeRef: null,
    projectScopeRef: "ps",
    systemScopeRef: null,
    environment: "STAGING" as const,
  };
  assert.equal(
    (
      await runtime.validatePhase15dClassificationHandoff({
        ...context,
        supportedCapabilityRefs: ["capability://code"],
      })
    ).validated,
    true,
  );
  await assert.rejects(
    runtime.validatePhase15dClassificationHandoff({
      ...context,
      supportedCapabilityRefs: [],
    }),
    /PHASE15D_CAPABILITY_UNSUPPORTED/,
  );
  await assert.rejects(
    runtime.validatePhase15dClassificationHandoff({
      ...context,
      classificationId: "other",
      supportedCapabilityRefs: ["capability://code"],
    }),
    /PHASE15D_NON_CURRENT_CLASSIFICATION/,
  );
  assert.throws(
    () =>
      runtime.buildPhase15dClassificationHandoff({
        classification: current,
        policy: {
          id: "other",
          policyVersion: "1",
          routingDisposition: "DELEGATE_TO_AIDOS",
          targetKind: "AIDOS",
          targetRef: null,
          targetVersion: null,
        },
        freshnessProof: "fresh",
        organizationId: "o",
        projectId: "p",
        environment: "STAGING",
      }),
    /PHASE15D_POLICY_MISMATCH/,
  );
});
