import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import {
  applyMigrations,
  DevelopmentDelegationContractError,
  DevelopmentDelegationService,
  loadMigrations,
  PostgresDevelopmentDelegationRepository,
  PostgresRoutingDecisionRepository,
  type DevelopmentDelegationRecord,
  type DevelopmentDelegationRepository,
  type DevelopmentExecutionHandoffPort,
  type ProjectStatusDto,
  type RoutingDecisionReadDto,
} from "../src/index.js";

const id = (n: string) => `50000000-0000-4000-8000-${n.padStart(12, "0")}`;
const digest = `sha256:${"a".repeat(64)}`;
const sha = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;
const snapshotId = id("30");

const delegationInput = Object.freeze({
  developmentIntent: "Implement the approved MAOS development task",
  requestedRoleClass: "EXECUTOR" as const,
  requiredCapabilities: Object.freeze(["execute" as const]),
  preferredCapabilities: Object.freeze([]),
  policyConstraints: Object.freeze([]),
  contextRefs: Object.freeze([]),
  artifactRefs: Object.freeze([]),
  priority: 50,
  aidosProjectRef: "aidos-project-maos",
  delegationRequestId: "delegation-request-1",
});

const snapshotBinding = Object.freeze({
  snapshotId,
  authorityEpoch: digest,
  requestDigest: digest,
  projectionBindings: Object.freeze(
    [
      "AIDOS_PROJECT_REGISTRATION_PROJECTION",
      "AIDOS_RUNTIME_AVAILABILITY_PROJECTION",
      "AIDOS_DELEGATION_ELIGIBILITY_PROJECTION",
    ].map((projectionType) =>
      Object.freeze({
        projectionType,
        projectionId: `urn:aidos:projection:${snapshotId}:${projectionType}`,
        projectionRevision: digest,
      }),
    ),
  ),
});

function decision(
  overrides: Partial<RoutingDecisionReadDto> = {},
): RoutingDecisionReadDto {
  return {
    contractVersion: "PHASE15D_ROUTING_OUTPUT_V1",
    routingDecisionId: id("10"),
    routingDecisionStreamId: id("11"),
    routingVersion: 1,
    requestId: id("4"),
    classificationVersionId: id("12"),
    canonicalDomain: "DEVELOPMENT",
    roleClass: "EXECUTOR",
    routingPurpose: "PRIMARY_EXECUTION",
    routingMode: "PRIMARY_EXECUTION",
    specializationMetadata: null,
    requiredCapabilities: ["capability-execute"],
    preferredCapabilities: [],
    eligibleResourceRefs: [],
    selectedProviderRef: null,
    selectedModelRef: null,
    selectedRuntimeAdapterRef: null,
    policyConstraints: {},
    policySnapshotRef: id("13"),
    registrySnapshotRef: "registry-snapshot-1",
    contextRefs: [],
    artifactRefs: [],
    priority: 50,
    humanApprovalState: "NOT_REQUIRED",
    humanApprovalRef: null,
    humanApprovalAuthority: null,
    humanApprovalCheckedAt: null,
    humanApprovalExpiresAt: null,
    developmentDelegationState: "READY_TO_DELEGATE",
    aidosProjectRef: delegationInput.aidosProjectRef,
    aidosRequiredCapabilities: ["execute"],
    aidosAuthorityRevision: digest,
    aidosCheckedAt: "2026-10-14T00:00:00.000Z",
    aidosFreshUntil: "2099-10-14T01:00:00.000Z",
    aidosDelegationInput: delegationInput,
    aidosSnapshotBinding: snapshotBinding as never,
    decisionReasonCodes: [],
    createdAt: "2026-10-14T00:00:00.000Z",
    supersedesRoutingDecisionId: null,
    stalenessState: "CURRENT",
    freshnessReferences: [],
    decisionState: "WAITING",
    selectedModelHostBindingRef: null,
    specializationVersionId: null,
    classificationProof: {
      identity: id("12"),
      version: 1,
      currentnessState: "CURRENT",
      currentnessProof: "classification-current-1",
      policyResolutionRef: id("14"),
      policyResolutionVersion: "1",
      checkedAt: "2026-10-14T00:00:00.000Z",
    },
    policyProof: {
      versionId: id("13"),
      checkedAt: "2026-10-14T00:00:00.000Z",
      freshUntil: "2099-10-14T01:00:00.000Z",
    },
    registryProof: {
      snapshotRef: "registry-snapshot-1",
      revision: digest,
      observedAt: "2026-10-14T00:00:00.000Z",
      freshUntil: "2099-10-14T01:00:00.000Z",
      freshnessAuthority: null,
    },
    ...overrides,
  } as RoutingDecisionReadDto;
}

function projectStatus(): ProjectStatusDto {
  return {
    projectId: id("3"),
    projectName: "MAOS",
    mvpGoal: "Working MVP",
    currentPhase: "M2",
    currentTask: "Development delegation",
    status: "IN_PROGRESS",
    progressPercent: 40,
    expectedDurationMs: 86_400_000,
    phaseStartedAt: "2026-10-14T00:00:00.000Z",
    latestCommit: null,
    lastSuccessfulVerification: null,
    p0Blockers: [],
    p1BacklogCount: 0,
    reviewCount: 0,
    revisionCount: 0,
    nextAction: "Delegate",
    humanActionRequired: null,
    updatedAt: "2026-10-14T00:00:00.000Z",
  };
}

function fixture(
  options: {
    readonly decision?: RoutingDecisionReadDto;
    readonly handoffStatus?: "DELEGATED" | "RUNNING" | "SUCCEEDED" | "FAILED";
    readonly handoffFailure?: boolean;
    readonly revalidationFailure?: boolean;
    readonly memoryContextStatus?: "AVAILABLE" | "EMPTY" | "DEGRADED" | "UNAVAILABLE";
    readonly memoryContextThrows?: boolean;
    readonly memoryContextRefs?: readonly string[];
  } = {},
) {
  const records = new Map<string, DevelopmentDelegationRecord>();
  const handoffInputs: unknown[] = [];
  const statusPatches: unknown[] = [];
  const memoryQueries: unknown[] = [];
  let revalidations = 0;
  const repository = {
    async createOrReuse(input: DevelopmentDelegationRecord) {
      const existing = records.get(input.requestId);
      if (existing) return { outcome: "REUSED" as const, delegation: existing };
      records.set(input.requestId, input);
      return { outcome: "CREATED" as const, delegation: input };
    },
    async findByRequest(requestId: string) {
      return records.get(requestId);
    },
    async replace(input: DevelopmentDelegationRecord) {
      records.set(input.requestId, input);
      return input;
    },
  } as unknown as DevelopmentDelegationRepository;
  const handoff = {
    async delegate(input: unknown) {
      handoffInputs.push(input);
      if (options.handoffFailure) throw new Error("synthetic backend error");
      const status = options.handoffStatus ?? "SUCCEEDED";
      return {
        status,
        delegationRef: "aidos-delegation-1",
        resultRef: status === "SUCCEEDED" ? "artifact://result/1" : null,
        failureCode: status === "FAILED" ? "AIDOS_TASK_FAILED" : null,
      };
    },
  } satisfies DevelopmentExecutionHandoffPort;
  const status = projectStatus();
  const service = new DevelopmentDelegationService({
    repository,
    routing: {
      async getCurrentDecision() {
        return options.decision ?? decision();
      },
    },
    aidosAuthority: {
      async revalidate() {
        revalidations += 1;
        if (options.revalidationFailure) throw new Error("AIDOS_UNAVAILABLE");
        return {
          current: true,
          authority: "AIDOS",
          identity: "aidos-project-maos",
          revision: digest,
          checkedAt: "2026-10-14T00:01:00.000Z",
          freshUntil: "2099-10-14T01:00:00.000Z",
          freshnessModel: "AUTHORITY_EXPIRY" as const,
          snapshotBinding: snapshotBinding as never,
        };
      },
    },
    handoff,
    memoryContext: {
      async queryProjectContext(input) {
        memoryQueries.push(input);
        if (options.memoryContextThrows) throw new Error("synthetic memory failure");
        return {
          status: options.memoryContextStatus ?? "AVAILABLE",
          contextRefs:
            (options.memoryContextStatus ?? "AVAILABLE") === "AVAILABLE"
              ? (options.memoryContextRefs ?? ["ai-memory-1:memory-1"])
              : [],
        };
      },
    },
    projectStatus: {
      async readProjectStatus() {
        return status;
      },
      async updateProjectStatus(_projectId, patch) {
        statusPatches.push(patch);
        return { ...status, ...patch } as ProjectStatusDto;
      },
    },
    now: () => "2026-10-14T00:02:00.000Z",
    newId: () => id("20"),
  });
  return {
    service,
    records,
    handoffInputs,
    statusPatches,
    memoryQueries,
    revalidations: () => revalidations,
  };
}

const startInput = {
  requestId: id("4"),
  projectId: id("3"),
  routingPurpose: "PRIMARY_EXECUTION" as const,
  context: {
    organizationId: id("1"),
    projectId: id("3"),
    companyScopeRef: "company://maos",
    teamScopeRef: null,
    projectScopeRef: "project://maos",
    systemScopeRef: null,
    environment: "STAGING" as const,
    requestId: id("4"),
    staleness: {
      requestChanged: false,
      taskChanged: false,
      policyChanged: false,
      capabilitiesChanged: false,
      evidenceInvalid: false,
      humanOverride: false,
      conflictingClassification: false,
      taxonomyInvalid: false,
    },
  },
  idempotencyKey: "m2-delegation-1",
};

test("Development request enters the governed delegation flow", async () => {
  const { service, records } = fixture({ handoffStatus: "DELEGATED" });
  const result = await service.start(startInput);
  assert.equal(result.status, "DELEGATED");
  assert.equal(records.get(startInput.requestId)?.routingDecisionId, id("10"));
});

test("constructs the canonical AIDOS delegation handoff without native selections", async () => {
  const { service, handoffInputs } = fixture();
  await service.start(startInput);
  const handoff = handoffInputs[0] as Record<string, unknown>;
  assert.deepEqual(handoff.delegationInput, delegationInput);
  assert.deepEqual(handoff.snapshotBinding, snapshotBinding);
  assert.deepEqual(handoff.memoryContextRefs, ["ai-memory-1:memory-1"]);
  assert.equal("providerId" in handoff, false);
  assert.equal("modelId" in handoff, false);
});

test("queries bounded project memory before Development handoff without changing AIDOS authority input", async () => {
  const { service, handoffInputs, memoryQueries } = fixture();
  await service.start(startInput);
  assert.deepEqual(memoryQueries, [
    {
      projectId: startInput.projectId,
      requestId: startInput.requestId,
      correlationId: startInput.idempotencyKey,
      query: `Development delegation planning for request ${startInput.requestId}`,
      limit: 10,
    },
  ]);
  const handoff = handoffInputs[0] as Record<string, unknown>;
  assert.deepEqual(handoff.delegationInput, delegationInput);
  assert.deepEqual(handoff.memoryContextRefs, ["ai-memory-1:memory-1"]);
});

test("uses coordinator-provided safe memory refs without a duplicate memory query", async () => {
  const { service, handoffInputs, memoryQueries } = fixture();
  await service.start({
    ...startInput,
    memoryContextRefs: ["memory://projects/maos/m7-context"],
  });

  assert.deepEqual(memoryQueries, []);
  assert.deepEqual(
    (handoffInputs[0] as Record<string, unknown>).memoryContextRefs,
    ["memory://projects/maos/m7-context"],
  );
});

test("unavailable memory does not fail Development delegation or overwrite project status", async () => {
  const { service, handoffInputs, statusPatches } = fixture({
    memoryContextThrows: true,
  });
  const result = await service.start(startInput);
  assert.equal(result.status, "SUCCEEDED");
  assert.deepEqual(
    (handoffInputs[0] as Record<string, unknown>).memoryContextRefs,
    [],
  );
  assert.equal(
    statusPatches.some(
      (patch) =>
        (patch as Record<string, unknown>).currentPhase === "MEMORY" ||
        (patch as Record<string, unknown>).status === "AI_MEMORY_UNAVAILABLE",
    ),
    false,
  );
});

test("secret-bearing memory references are omitted before Development handoff", async () => {
  const { service, handoffInputs } = fixture({
    memoryContextRefs: ["secret://ai-memory/raw-credential"],
  });
  await service.start(startInput);
  assert.deepEqual(
    (handoffInputs[0] as Record<string, unknown>).memoryContextRefs,
    [],
  );
});

test("incomplete canonical input waits without calling AIDOS", async () => {
  const { service, handoffInputs } = fixture({
    decision: decision({ aidosDelegationInput: null }),
  });
  const result = await service.start(startInput);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.failureCode, "WAITING_AIDOS_DELEGATION_INPUT");
  assert.equal(handoffInputs.length, 0);
});

test("AIDOS unavailable fails closed before handoff", async () => {
  const { service, handoffInputs } = fixture({
    decision: decision({ developmentDelegationState: "AIDOS_UNAVAILABLE" }),
  });
  const result = await service.start(startInput);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.failureCode, "AIDOS_UNAVAILABLE");
  assert.equal(handoffInputs.length, 0);
});

test("AIDOS revalidation failure persists a blocked state before handoff", async () => {
  const { service, handoffInputs, records } = fixture({
    revalidationFailure: true,
  });
  const result = await service.start(startInput);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.failureCode, "AIDOS_UNAVAILABLE");
  assert.equal(records.get(startInput.requestId)?.status, "BLOCKED");
  assert.equal(handoffInputs.length, 0);
});

test("approval-required Development request waits before handoff", async () => {
  const { service, handoffInputs } = fixture({
    decision: decision({ humanApprovalState: "REQUIRED_MISSING" }),
  });
  const result = await service.start(startInput);
  assert.equal(result.status, "WAITING_APPROVAL");
  assert.equal(result.humanActionRequired, true);
  assert.equal(handoffInputs.length, 0);
});

test("successful delegation state and result reference persist", async () => {
  const { service, records } = fixture({ handoffStatus: "SUCCEEDED" });
  const result = await service.start(startInput);
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.resultRef, "artifact://result/1");
  assert.equal(records.get(startInput.requestId)?.status, "SUCCEEDED");
});

test("failed delegation state persists with a bounded failure", async () => {
  const { service, records } = fixture({ handoffStatus: "FAILED" });
  const result = await service.start(startInput);
  assert.equal(result.status, "FAILED");
  assert.equal(result.failureCode, "AIDOS_TASK_FAILED");
  assert.equal(records.get(startInput.requestId)?.status, "FAILED");
});

test("safe DTO exposes result references without canonical input or raw backend data", async () => {
  const { service } = fixture({ handoffStatus: "SUCCEEDED" });
  const result = await service.start(startInput);
  assert.equal(result.resultRef, "artifact://result/1");
  assert.equal("delegationInput" in result, false);
  assert.equal("snapshotBinding" in result, false);
  assert.equal("rawError" in result, false);
});

test("successful delegation advances the M4 status projection", async () => {
  const { service, statusPatches } = fixture({ handoffStatus: "SUCCEEDED" });
  await service.start(startInput);
  const patch = statusPatches.at(-1) as Record<string, unknown>;
  assert.equal(patch.progressPercent, 45);
  assert.equal(patch.lastSuccessfulVerification, "2026-10-14T00:02:00.000Z");
  assert.deepEqual(patch.p0Blockers, []);
});

test("failed delegation blocks the M4 status projection", async () => {
  const { service, statusPatches } = fixture({ handoffStatus: "FAILED" });
  await service.start(startInput);
  const patch = statusPatches.at(-1) as Record<string, unknown>;
  assert.equal(patch.status, "BLOCKED");
  assert.deepEqual(patch.p0Blockers, [
    { code: "AIDOS_TASK_FAILED", summary: "AIDOS delegation failed" },
  ]);
});

test("never exposes a MAOS-native Development execution path", async () => {
  const { service, revalidations } = fixture();
  await service.start(startInput);
  assert.equal(revalidations(), 1);
  assert.equal("executeLocally" in service, false);
  assert.equal("selectModel" in service, false);
});

test("rejects non-Development routing decisions", async () => {
  const { service } = fixture({
    decision: decision({ canonicalDomain: "BUSINESS" }),
  });
  await assert.rejects(
    service.start(startInput),
    (error) =>
      error instanceof DevelopmentDelegationContractError &&
      error.code === "DEVELOPMENT_CLASSIFICATION_REQUIRED",
  );
});

test("PostgreSQL repository persists and reuses one exact delegation", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(
    database,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  await database.exec(`
    INSERT INTO core.organizations(id,name,slug)
      VALUES('${id("1")}','MAOS','maos-m2');
    INSERT INTO core.departments(id,organization_id,name)
      VALUES('${id("2")}','${id("1")}','Development');
    INSERT INTO core.projects(id,organization_id,department_id,name)
      VALUES('${id("3")}','${id("1")}','${id("2")}','MAOS');
    INSERT INTO audit.audit_records(
      id,actor_type,actor_id,action,target_type,target_id,result,request_id,
      correlation_id,trace_id,span_id,record_hash
    ) VALUES(
      '${id("6")}','SYSTEM','${id("5")}','ROUTING.CREATE','ROUTING_POLICY',
      '${id("6")}','SUCCEEDED','seed','seed','seed','seed',repeat('a',64)
    );
    INSERT INTO work.requests(
      id,source_system,source_type,source_ref,source_fingerprint,
      organization_id,project_id,company_scope_ref,project_scope_ref,
      environment,registered_by_actor_type,registered_by_actor_id,
      idempotency_key,input_fingerprint,correlation_id,registration_audit_ref
    ) VALUES(
      '${id("4")}','MAOS','TEST','request:m2','${sha("b")}',
      '${id("1")}','${id("3")}','company','project','STAGING','SYSTEM',
      '${id("5")}','request-m2','${sha("c")}','corr','${id("6")}'
    );
    INSERT INTO governance.request_classification_versions(
      classification_id,request_id,version,domain_key,classification_state,
      source,routing_disposition,reason_code,policy_resolution_ref,
      policy_resolution_version,created_by_actor_type,created_by_actor_id,
      validated_at,canonical_payload_fingerprint,idempotency_key,
      correlation_id,audit_ref
    ) VALUES(
      '${id("7")}','${id("4")}',1,'DEVELOPMENT','VALIDATED',
      'DETERMINISTIC_POLICY','DELEGATE_TO_AIDOS','VALID',
      '00000000-0000-4000-8000-000000015301','2.3',
      'SYSTEM','${id("5")}',CURRENT_TIMESTAMP,'${sha("d")}',
      'classification-m2','corr','${id("6")}'
    );
    INSERT INTO governance.ai_routing_policy_versions(
      routing_policy_version_id,routing_policy_id,version,
      authority_identifier,lifecycle_intent,canonical_domain,routing_purpose,
      role_class,scope_ref,environment,effective_at,content_fingerprint,
      created_by_actor_type,created_by_actor_id,audit_ref
    ) VALUES(
      '${id("9")}','${id("13")}',1,
      'MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD','ACTIVE','DEVELOPMENT',
      'PRIMARY_EXECUTION','EXECUTOR','scope','STAGING',CURRENT_TIMESTAMP,
      '${sha("e")}','SYSTEM','${id("5")}','${id("6")}'
    );
    INSERT INTO governance.registry_freshness_policy_versions(
      registry_freshness_policy_version_id,registry_freshness_policy_id,
      policy_version,authority_identifier,registry_scope,environment,max_age_ms,
      lifecycle_intent,effective_at,content_fingerprint,idempotency_key,
      created_by_actor_type,created_by_actor_id,reason_code,audit_ref
    ) VALUES(
      '${id("14")}','${id("15")}',1,
      'MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD',
      'PHASE15B_AI_REGISTRY','STAGING',3600000,'ACTIVE',CURRENT_TIMESTAMP,
      '${sha("f")}','registry-policy-m2','SYSTEM','${id("5")}','TEST',
      '${id("6")}'
    );
  `);
  const routing = new PostgresRoutingDecisionRepository(database);
  await routing.appendDecision({
    routingDecisionId: id("10"),
    routingDecisionStreamId: id("11"),
    requestId: id("4"),
    routingPurpose: "PRIMARY_EXECUTION",
    expectedPredecessorId: null,
    classificationVersionId: id("7"),
    classificationVersion: 1,
    classificationState: "VALIDATED",
    classificationCurrentnessState: "CURRENT",
    classificationCurrentnessProof: sha("d"),
    classificationPolicyResolutionRef: "00000000-0000-4000-8000-000000015301",
    classificationPolicyResolutionVersion: "2.3",
    canonicalDomain: "DEVELOPMENT",
    roleClass: "EXECUTOR",
    routingMode: "PRIMARY_EXECUTION",
    specializationVersionId: null,
    routingPolicyVersionId: id("9"),
    selectedProviderRef: null,
    selectedModelRef: null,
    selectedRuntimeAdapterRef: null,
    selectedModelHostBindingRef: null,
    registrySnapshotRef: `registry-snapshot:${sha("a")}`,
    registrySnapshotRevision: "registry-r1",
    registryFreshnessPolicyRef: id("15"),
    registryFreshnessPolicyVersion: "1",
    registryFreshnessMaxAgeMs: 3_600_000,
    registrySnapshotHash: sha("a").slice("sha256:".length),
    registryObservedAt: "2026-10-14T00:00:00.000Z",
    registryFreshUntil: "2026-10-14T01:00:00.000Z",
    requiredCapabilities: [],
    preferredCapabilities: [],
    policyConstraints: {},
    contextRefs: [],
    artifactRefs: [],
    evidenceRefs: ["evidence:routing:m2"],
    priority: "NORMAL",
    humanApprovalState: "NOT_REQUIRED",
    humanApprovalRef: null,
    humanApprovalTargetVersion: null,
    humanApprovalTargetHash: null,
    humanApprovalAuthority: null,
    humanApprovalCheckedAt: null,
    humanApprovalExpiresAt: null,
    developmentDelegationState: "READY_TO_DELEGATE",
    aidosProjectRef: delegationInput.aidosProjectRef,
    aidosRequiredCapabilities: ["execute"],
    aidosAuthorityRevision: digest,
    aidosCheckedAt: "2026-10-14T00:00:00.000Z",
    aidosFreshUntil: "2099-10-14T01:00:00.000Z",
    aidosDelegationInput: delegationInput,
    aidosSnapshotBinding: snapshotBinding as never,
    decisionState: "SELECTED",
    decisionReasonCodes: ["DELEGATE_TO_AIDOS"],
    stalenessState: "CURRENT",
    classificationCheckedAt: "2026-10-14T00:00:00.000Z",
    policyCheckedAt: "2026-10-14T00:00:00.000Z",
    policyFreshUntil: "2099-10-14T01:00:00.000Z",
    idempotencyKey: "routing-m2",
    canonicalIntentFingerprint: sha("1"),
    correlationId: "corr-m2",
    causationRefs: [],
    actorType: "SYSTEM",
    actorId: id("5"),
    traceId: "trace-m2",
    spanId: "span-m2",
    projectId: id("3"),
    candidates: [],
  });

  const repository = new PostgresDevelopmentDelegationRepository(database);
  const createInput = {
    delegationId: id("20"),
    requestId: id("4"),
    projectId: id("3"),
    routingDecisionId: id("10"),
    aidosProjectRef: delegationInput.aidosProjectRef,
    delegationRequestId: delegationInput.delegationRequestId,
    status: "READY_TO_DELEGATE" as const,
    failureCode: null,
    humanActionRequired: false,
    idempotencyKey: "development-delegation-m2",
    createdAt: "2026-10-14T00:02:00.000Z",
  };
  const created = await repository.createOrReuse(createInput);
  const replay = await repository.createOrReuse({
    ...createInput,
    delegationId: id("21"),
  });
  const succeeded = await repository.replace({
    ...created.delegation,
    status: "SUCCEEDED",
    externalDelegationRef: "aidos-delegation-1",
    resultRef: "artifact://result/1",
    authorityEvidenceRef: "evidence://aidos/1",
    updatedAt: "2026-10-14T00:03:00.000Z",
  });

  assert.equal(created.outcome, "CREATED");
  assert.equal(replay.outcome, "REUSED");
  assert.equal(replay.delegation.delegationId, id("20"));
  assert.equal(succeeded.status, "SUCCEEDED");
  assert.equal(
    (await repository.findByRequest(id("4")))?.resultRef,
    "artifact://result/1",
  );
});
