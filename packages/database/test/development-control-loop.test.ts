import assert from "node:assert/strict";
import test from "node:test";

import {
  DevelopmentControlLoopContractError,
  DevelopmentControlLoopService,
  DevelopmentDelegationContractError,
  type DevelopmentDelegationSafeDto,
  type DelayDriftEvaluationDto,
  type PreparedDevelopmentWork,
  type ProjectStatusDto,
} from "../src/index.js";

const PROJECT_ID = "40000000-0000-4000-8000-000000000003";
const REQUEST_ID = "50000000-0000-4000-8000-000000000001";
const NOW = "2026-10-14T14:00:00.000Z";

function status(
  patch: Partial<ProjectStatusDto> = {},
): ProjectStatusDto {
  return {
    projectId: PROJECT_ID,
    projectName: "MAOS",
    mvpGoal: "Working MVP",
    currentPhase: "M7",
    currentTask: "Development Control Loop",
    status: "NOT_STARTED",
    progressPercent: 70,
    expectedDurationMs: 86_400_000,
    phaseStartedAt: "2026-10-14T00:00:00.000Z",
    latestCommit: null,
    lastSuccessfulVerification: null,
    p0Blockers: [],
    p1BacklogCount: 4,
    reviewCount: 1,
    revisionCount: 0,
    nextAction: "Delegate the next governed Development request",
    humanActionRequired: null,
    updatedAt: "2026-10-14T00:00:00.000Z",
    ...patch,
  };
}

const work: PreparedDevelopmentWork = {
  delegation: {
    requestId: REQUEST_ID,
    projectId: PROJECT_ID,
    routingPurpose: "PRIMARY_EXECUTION",
    context: {
      requestId: REQUEST_ID,
      organizationId: "10000000-0000-4000-8000-000000000001",
      projectId: PROJECT_ID,
      companyScopeRef: "company://maos",
      teamScopeRef: "team://development",
      projectScopeRef: "project://maos",
      systemScopeRef: "system://maos",
      environment: "DEVELOPMENT",
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
    idempotencyKey: "m7-loop-1",
  },
};

function health(
  findings: DelayDriftEvaluationDto["findings"] = [],
): DelayDriftEvaluationDto {
  const primary = findings[0];
  return {
    projectId: PROJECT_ID,
    health: {
      developmentHealth: primary
        ? primary.severity === "ACTION_REQUIRED"
          ? "ACTION_REQUIRED"
          : "WARNING"
        : "HEALTHY",
      activeWarningCount: findings.length,
      primaryWarning: primary?.type ?? null,
      recommendedAction: primary?.recommendedAction ?? null,
    },
    findings,
  };
}

function delegation(
  patch: Partial<DevelopmentDelegationSafeDto> = {},
): DevelopmentDelegationSafeDto {
  return {
    delegationId: "delegation-1",
    requestId: REQUEST_ID,
    projectId: PROJECT_ID,
    routingDecisionId: "decision-1",
    status: "DELEGATED",
    externalDelegationRef: "aidos://delegations/1",
    resultRef: null,
    failureCode: null,
    humanActionRequired: false,
    authorityEvidenceRef: "evidence://aidos/1",
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  };
}

function fixture(options: {
  initial?: ProjectStatusDto;
  work?: PreparedDevelopmentWork | null;
  memory?: "AVAILABLE" | "UNAVAILABLE";
  memoryRefs?: readonly string[];
  delegationResult?: DevelopmentDelegationSafeDto;
  findings?: DelayDriftEvaluationDto["findings"];
} = {}) {
  let current = options.initial ?? status();
  let activeDelegation: DevelopmentDelegationSafeDto | undefined;
  const starts: Array<Record<string, unknown>> = [];
  const handoffs = new Map<string, string>();
  let handoffCreates = 0;
  let healthReads = 0;

  const service = new DevelopmentControlLoopService({
    projectStatus: {
      async readProjectStatus(projectId) {
        if (projectId !== PROJECT_ID) throw new Error("raw backend missing");
        return current;
      },
      async updateProjectStatus(_projectId, patch) {
        current = { ...current, ...patch, updatedAt: NOW };
        return current;
      },
    },
    health: {
      async evaluateProject() {
        healthReads += 1;
        return health(options.findings);
      },
    },
    memoryContext: {
      async queryProjectContext() {
        return {
          status: options.memory ?? "AVAILABLE",
          contextRefs: options.memoryRefs ?? ["memory://projects/maos/1"],
        };
      },
    },
    readyWork: {
      async findReadyDevelopmentWork() {
        return options.work === undefined ? work : options.work;
      },
    },
    delegation: {
      async readCurrent() {
        if (!activeDelegation)
          throw new DevelopmentDelegationContractError(
            "DEVELOPMENT_DELEGATION_NOT_FOUND",
          );
        return activeDelegation;
      },
      async start(input) {
        starts.push(input as unknown as Record<string, unknown>);
        activeDelegation = options.delegationResult ?? delegation();
        if (
          activeDelegation.status === "FAILED" ||
          activeDelegation.status === "BLOCKED"
        ) {
          current = status({
            status: "BLOCKED",
            currentTask: "AIDOS delegation blocked",
            p0Blockers: [
              {
                code: activeDelegation.failureCode ?? "AIDOS_UNAVAILABLE",
                summary: "AIDOS delegation failed",
              },
            ],
            humanActionRequired: "Review the blocked AIDOS delegation",
          });
        } else if (activeDelegation.status === "WAITING_APPROVAL") {
          current = status({
            status: "WAITING_HUMAN",
            humanActionRequired: "Approve Development delegation",
          });
        } else if (activeDelegation.status === "SUCCEEDED") {
          current = status({
            status: "IN_PROGRESS",
            progressPercent: 75,
            lastSuccessfulVerification: NOW,
          });
        } else {
          current = status({ status: "IN_PROGRESS" });
        }
        return activeDelegation;
      },
    },
    handoff: {
      async createHandoff(input) {
        handoffCreates += 1;
        const existing = handoffs.get(input.idempotencyKey);
        const handoffId = existing ?? "handoff-1";
        handoffs.set(input.idempotencyKey, handoffId);
        return {
          outcome: existing ? "REUSED" as const : "CREATED" as const,
          handoff: {
            handoffId,
            requestId: input.requestId,
            sourceRole: input.sourceRole,
            targetRole: input.targetRole,
            status: "PENDING" as const,
            resultRef: null,
            failureReason: null,
            updatedAt: NOW,
          },
        };
      },
    },
    now: () => NOW,
  });

  return {
    service,
    starts,
    get current() {
      return current;
    },
    get handoffCreates() {
      return handoffCreates;
    },
    get healthReads() {
      return healthReads;
    },
  };
}

test("project read with no approved work returns no action", async () => {
  const f = fixture({ work: null });
  const result = await f.service.evaluateAndAdvanceProject(PROJECT_ID);

  assert.equal(result.controlLoopStatus, "NO_ACTION");
  assert.equal(result.projectStatus.projectId, PROJECT_ID);
  assert.equal(f.starts.length, 0);
});

test("unknown project fails with a bounded control-loop error", async () => {
  const f = fixture();

  await assert.rejects(
    f.service.evaluateAndAdvanceProject(
      "40000000-0000-4000-8000-000000000099",
    ),
    (error) =>
      error instanceof DevelopmentControlLoopContractError &&
      error.code === "CONTROL_LOOP_PROJECT_NOT_FOUND" &&
      !error.message.includes("raw backend"),
  );
});

test("ready project creates one M2 delegation", async () => {
  const f = fixture();
  const result = await f.service.evaluateAndAdvanceProject(PROJECT_ID);

  assert.equal(result.controlLoopStatus, "DELEGATED");
  assert.equal(result.delegationRef, "delegation-1");
  assert.equal(f.starts.length, 1);
});

test("repeated unchanged loop reuses active delegation", async () => {
  const f = fixture();
  const first = await f.service.evaluateAndAdvanceProject(PROJECT_ID);
  const second = await f.service.evaluateAndAdvanceProject(PROJECT_ID);

  assert.equal(first.delegationRef, second.delegationRef);
  assert.equal(f.starts.length, 1);
});

test("successful delegation exposes the M4 status update", async () => {
  const f = fixture({
    delegationResult: delegation({
      status: "SUCCEEDED",
      resultRef: "artifact://result/1",
    }),
  });
  const result = await f.service.evaluateAndAdvanceProject(PROJECT_ID);

  assert.equal(result.controlLoopStatus, "COMPLETED");
  assert.equal(result.projectStatus.progressPercent, 75);
  assert.equal(result.projectStatus.lastSuccessfulVerificationPresent, true);
});

test("failed delegation exposes a bounded blocked project state", async () => {
  const f = fixture({
    delegationResult: delegation({
      status: "FAILED",
      externalDelegationRef: "blocked:delegation-1",
      failureCode: "AIDOS_HANDOFF_FAILED",
      humanActionRequired: true,
    }),
  });
  const result = await f.service.evaluateAndAdvanceProject(PROJECT_ID);

  assert.equal(result.controlLoopStatus, "BLOCKED");
  assert.deepEqual(result.projectStatus.p0BlockerCodes, ["AIDOS_HANDOFF_FAILED"]);
  assert.equal(
    result.humanActionRequired,
    "Review the blocked AIDOS delegation",
  );
});

test("existing Human action stops before memory or delegation", async () => {
  const f = fixture({
    initial: status({
      status: "WAITING_HUMAN",
      humanActionRequired: "Approve Staging credential binding",
    }),
  });
  const result = await f.service.evaluateAndAdvanceProject(PROJECT_ID);

  assert.equal(result.controlLoopStatus, "WAITING_HUMAN");
  assert.equal(
    result.humanActionRequired,
    "Approve Staging credential binding",
  );
  assert.equal(f.starts.length, 0);
  assert.deepEqual(result.memoryContextRefs, []);
});

test("M2 approval gate returns waiting Human without execution authority", async () => {
  const f = fixture({
    delegationResult: delegation({
      status: "WAITING_APPROVAL",
      externalDelegationRef: null,
      failureCode: "HUMAN_APPROVAL_REQUIRED",
      humanActionRequired: true,
    }),
  });
  const result = await f.service.evaluateAndAdvanceProject(PROJECT_ID);

  assert.equal(result.controlLoopStatus, "WAITING_HUMAN");
  assert.equal(result.recommendedAction, "HUMAN_ACTION_REQUIRED");
  assert.equal(result.humanActionRequired, "Approve Development delegation");
  assert.equal("execute" in f.service, false);
});

test("available AI Memory refs are attached to the M2 input", async () => {
  const f = fixture({ memoryRefs: ["memory://projects/maos/42"] });
  const result = await f.service.evaluateAndAdvanceProject(PROJECT_ID);

  assert.deepEqual(result.memoryContextRefs, ["memory://projects/maos/42"]);
  assert.deepEqual(f.starts[0]?.memoryContextRefs, [
    "memory://projects/maos/42",
  ]);
});

test("AI Memory unavailability continues with empty context", async () => {
  const f = fixture({ memory: "UNAVAILABLE" });
  const result = await f.service.evaluateAndAdvanceProject(PROJECT_ID);

  assert.equal(result.controlLoopStatus, "DELEGATED");
  assert.deepEqual(result.memoryContextRefs, []);
  assert.deepEqual(f.starts[0]?.memoryContextRefs, []);
});

test("M5 warning is included without taking authority", async () => {
  const f = fixture({
    work: null,
    findings: [
      {
        findingId: `${PROJECT_ID}:SCOPE_DRIFT`,
        projectId: PROJECT_ID,
        type: "SCOPE_DRIFT",
        severity: "WARNING",
        reason: "CURRENT_TASK_OUTSIDE_APPROVED_MVP_SCOPE",
        evidence: {},
        recommendedAction: "MOVE_NON_P0_TO_BACKLOG",
        detectedAt: NOW,
      },
    ],
  });
  const result = await f.service.evaluateAndAdvanceProject(PROJECT_ID);

  assert.equal(result.healthSummary.primaryWarning, "SCOPE_DRIFT");
  assert.equal(result.recommendedAction, "MOVE_NON_P0_TO_BACKLOG");
});

test("active P0 blocker prevents inappropriate advancement", async () => {
  const f = fixture({
    initial: status({
      status: "BLOCKED",
      p0Blockers: [{ code: "P0_SECURITY", summary: "Repair boundary" }],
    }),
  });
  const result = await f.service.evaluateAndAdvanceProject(PROJECT_ID);

  assert.equal(result.controlLoopStatus, "BLOCKED");
  assert.equal(result.recommendedAction, "RESOLVE_P0_BLOCKER");
  assert.equal(f.starts.length, 0);
});

test("required M3 handoff is created once and linked", async () => {
  const handoffWork: PreparedDevelopmentWork = {
    ...work,
    handoff: {
      requestId: REQUEST_ID,
      sourceRole: "PLANNER",
      targetRole: "EXECUTOR",
      contextRefs: ["context://request/1"],
      artifactRefs: [],
      idempotencyKey: "m7-handoff-1",
      actorId: "maos-development-control-loop",
      correlationId: "correlation-1",
      traceId: "trace-1",
      spanId: "span-1",
    },
  };
  const f = fixture({ work: handoffWork });
  const result = await f.service.evaluateAndAdvanceProject(PROJECT_ID);

  assert.equal(result.handoffRef, "handoff-1");
  assert.equal(f.handoffCreates, 1);
});

test("repeated loop creates neither duplicate handoff nor delegation", async () => {
  const handoffWork: PreparedDevelopmentWork = {
    ...work,
    handoff: {
      requestId: REQUEST_ID,
      sourceRole: "PLANNER",
      targetRole: "EXECUTOR",
      contextRefs: [],
      artifactRefs: [],
      idempotencyKey: "m7-handoff-1",
      actorId: "maos-development-control-loop",
      correlationId: "correlation-1",
      traceId: "trace-1",
      spanId: "span-1",
    },
  };
  const f = fixture({ work: handoffWork });
  await f.service.evaluateAndAdvanceProject(PROJECT_ID);
  await f.service.evaluateAndAdvanceProject(PROJECT_ID);

  assert.equal(f.handoffCreates, 1);
  assert.equal(f.starts.length, 1);
});

test("AIDOS unavailable remains blocked with no MAOS executor", async () => {
  const f = fixture({
    delegationResult: delegation({
      status: "BLOCKED",
      externalDelegationRef: null,
      failureCode: "AIDOS_UNAVAILABLE",
      humanActionRequired: true,
    }),
  });
  const result = await f.service.evaluateAndAdvanceProject(PROJECT_ID);

  assert.equal(result.controlLoopStatus, "BLOCKED");
  assert.equal(result.recommendedAction, "HUMAN_ACTION_REQUIRED");
  assert.equal(
    result.humanActionRequired,
    "Review the blocked AIDOS delegation",
  );
  assert.equal("executor" in result, false);
});

test("safe immutable result excludes raw status, backend, and secret values", async () => {
  const f = fixture({
    initial: status({
      nextAction: "password=synthetic-do-not-expose",
      currentTask: "secret task text",
    }),
    memoryRefs: ["secret://synthetic-do-not-expose"],
  });
  const result = await f.service.evaluateAndAdvanceProject(PROJECT_ID);
  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes("synthetic-do-not-expose"), false);
  assert.equal(serialized.includes("secret task text"), false);
  assert.equal("mvpGoal" in result.projectStatus, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.auditTrace), true);
  assert.equal(f.healthReads, 2);
});

test("M8 final gate completes one governed control loop without duplicate work", async () => {
  const completeWork: PreparedDevelopmentWork = {
    ...work,
    handoff: {
      requestId: REQUEST_ID,
      sourceRole: "PLANNER",
      targetRole: "EXECUTOR",
      contextRefs: ["context://request/m8"],
      artifactRefs: ["artifact://input/m8"],
      idempotencyKey: "m8-final-gate-handoff",
      actorId: "maos-development-control-loop",
      correlationId: "m8-final-gate-correlation",
      traceId: "m8-final-gate-trace",
      spanId: "m8-final-gate-span",
    },
  };
  const f = fixture({
    work: completeWork,
    memoryRefs: ["memory://projects/maos/m8"],
    delegationResult: delegation({
      status: "SUCCEEDED",
      resultRef: "artifact://result/m8",
    }),
  });

  const first = await f.service.evaluateAndAdvanceProject(PROJECT_ID);
  const replay = await f.service.evaluateAndAdvanceProject(PROJECT_ID);

  assert.equal(first.controlLoopStatus, "COMPLETED");
  assert.equal(first.delegationRef, "delegation-1");
  assert.equal(first.handoffRef, "handoff-1");
  assert.deepEqual(first.memoryContextRefs, ["memory://projects/maos/m8"]);
  assert.equal(first.projectStatus.progressPercent, 75);
  assert.equal(first.projectStatus.lastSuccessfulVerificationPresent, true);
  assert.equal(first.healthSummary.developmentHealth, "HEALTHY");
  assert.deepEqual(first.auditTrace, [
    "CONTROL_LOOP_EVALUATED",
    "ACTION_SELECTED:READY_TO_DELEGATE",
    "HANDOFF_CREATED",
    "DELEGATION_CREATED_OR_REUSED",
    "POST_UPDATE_HEALTH_EVALUATED",
  ]);
  assert.equal(replay.controlLoopStatus, "COMPLETED");
  assert.equal(f.starts.length, 1);
  assert.equal(f.handoffCreates, 1);
  assert.equal(f.healthReads, 3);
  assert.equal("executor" in first, false);
});
