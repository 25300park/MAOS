import assert from "node:assert/strict";
import test from "node:test";

import {
  DelayDriftDetectorService,
  type DelayDriftDetectorConfig,
  type ProjectStatusDto,
} from "../src/index.js";

const PROJECT_ID = "40000000-0000-4000-8000-000000000003";
const NOW = "2026-10-14T12:00:00.000Z";
const HOUR = 60 * 60 * 1_000;

const baseStatus: ProjectStatusDto = Object.freeze({
  projectId: PROJECT_ID,
  projectName: "MAOS",
  mvpGoal: "Complete the working MVP",
  currentPhase: "M5",
  currentTask: "Delay and Drift Detector",
  status: "IN_PROGRESS",
  progressPercent: 60,
  expectedDurationMs: 8 * HOUR,
  phaseStartedAt: "2026-10-14T06:00:00.000Z",
  latestCommit: null,
  lastSuccessfulVerification: null,
  p0Blockers: Object.freeze([]),
  p1BacklogCount: 3,
  reviewCount: 1,
  revisionCount: 0,
  nextAction: "Complete M5",
  humanActionRequired: null,
  updatedAt: "2026-10-14T06:00:00.000Z",
});

const config: DelayDriftDetectorConfig = {
  stalledDurationMultiplier: 1.5,
  blockedThresholdMs: 24 * HOUR,
  allowedReviewCount: 2,
  repeatedReviewCount: 3,
  repeatedRevisionCount: 2,
  taskClassifications: Object.freeze({
    "Delay and Drift Detector": Object.freeze({
      priority: "MVP",
      withinApprovedMvpScope: true,
      mvpRequiredWorkRemaining: true,
    }),
    "Advanced trend charts": Object.freeze({
      priority: "P1",
      withinApprovedMvpScope: false,
      mvpRequiredWorkRemaining: true,
    }),
  }),
};

function detector(statuses: readonly ProjectStatusDto[] = [baseStatus]) {
  const snapshots = statuses.map((status) => structuredClone(status));
  const source = {
    async readProjectStatus(projectId: string) {
      const status = statuses.find((item) => item.projectId === projectId);
      if (!status) throw new Error("PROJECT_STATUS_NOT_FOUND");
      return status;
    },
    async listProjectStatuses() {
      return statuses;
    },
  };
  return {
    service: new DelayDriftDetectorService(source, config, () => new Date(NOW)),
    snapshots,
  };
}

test("normal active project has no detector warning", async () => {
  const result = await detector().service.evaluateProject(PROJECT_ID);

  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.health, {
    developmentHealth: "HEALTHY",
    activeWarningCount: 0,
    primaryWarning: null,
    recommendedAction: null,
  });
});

test("active project materially beyond expected duration is stalled", async () => {
  const status = {
    ...baseStatus,
    phaseStartedAt: "2026-10-13T23:00:00.000Z",
  };
  const result = await detector([status]).service.evaluateProject(PROJECT_ID);

  assert.equal(result.findings[0]?.type, "DEVELOPMENT_STALLED");
  assert.equal(result.findings[0]?.severity, "WARNING");
  assert.equal(result.findings[0]?.recommendedAction, "RESUME_OR_REPLAN");
  assert.deepEqual(result.findings[0]?.evidence, {
    status: "IN_PROGRESS",
    elapsedMs: 13 * HOUR,
    expectedDurationMs: 8 * HOUR,
  });
});

test("active P0 suppresses delay and review governance findings", async () => {
  const status = {
    ...baseStatus,
    currentTask: "Advanced trend charts",
    phaseStartedAt: "2026-10-12T00:00:00.000Z",
    reviewCount: 9,
    revisionCount: 8,
    p0Blockers: [{ code: "P0_SECURITY", summary: "Repair security boundary" }],
  };
  const result = await detector([status]).service.evaluateProject(PROJECT_ID);

  assert.deepEqual(result.findings, []);
});

test("review count beyond the MVP allowance detects over-governance", async () => {
  const status = { ...baseStatus, reviewCount: 3, revisionCount: 1 };
  const result = await detector([status]).service.evaluateProject(PROJECT_ID);

  assert.equal(result.findings[0]?.type, "OVER_GOVERNANCE");
  assert.equal(
    result.findings[0]?.recommendedAction,
    "MOVE_NON_P0_TO_BACKLOG",
  );
  assert.deepEqual(result.findings[0]?.evidence, {
    reviewCount: 3,
    allowedReviewCount: 2,
  });
});

test("repeated review or revision loops produce a distinct finding", async () => {
  const status = { ...baseStatus, reviewCount: 3, revisionCount: 2 };
  const result = await detector([status]).service.evaluateProject(PROJECT_ID);

  assert.deepEqual(
    result.findings.map((finding) => finding.type),
    ["OVER_GOVERNANCE", "REPEATED_REVIEW"],
  );
  assert.equal(
    result.findings[1]?.recommendedAction,
    "CONTINUE_IMPLEMENTATION",
  );
});

test("exact task classification outside approved scope detects scope drift", async () => {
  const status = { ...baseStatus, currentTask: "Advanced trend charts" };
  const result = await detector([status]).service.evaluateProject(PROJECT_ID);

  assert.equal(result.findings[0]?.type, "SCOPE_DRIFT");
  assert.deepEqual(result.findings[0]?.evidence, {
    taskPriority: "P1",
    withinApprovedMvpScope: false,
    mvpRequiredWorkRemaining: true,
  });
});

test("P1 task while required MVP work remains has low MVP alignment", async () => {
  const status = { ...baseStatus, currentTask: "Advanced trend charts" };
  const result = await detector([status]).service.evaluateProject(PROJECT_ID);

  assert.equal(result.findings[1]?.type, "MVP_ALIGNMENT_LOW");
  assert.equal(
    result.findings[1]?.recommendedAction,
    "MOVE_NON_P0_TO_BACKLOG",
  );
  assert.equal(result.findings[1]?.severity, "WARNING");
  assert.equal(result.health.developmentHealth, "WARNING");
});

test("blocked project beyond threshold requires blocker escalation", async () => {
  const status = {
    ...baseStatus,
    status: "BLOCKED" as const,
    updatedAt: "2026-10-13T11:00:00.000Z",
  };
  const result = await detector([status]).service.evaluateProject(PROJECT_ID);

  assert.equal(result.findings[0]?.type, "BLOCKED_TOO_LONG");
  assert.equal(result.findings[0]?.severity, "ACTION_REQUIRED");
  assert.equal(result.findings[0]?.recommendedAction, "ESCALATE_BLOCKER");
});

test("long Human-action block recommends Human intervention", async () => {
  const status = {
    ...baseStatus,
    status: "BLOCKED" as const,
    updatedAt: "2026-10-13T11:00:00.000Z",
    humanActionRequired: "Approve a bounded architecture decision",
  };
  const result = await detector([status]).service.evaluateProject(PROJECT_ID);

  assert.equal(result.findings[0]?.recommendedAction, "HUMAN_ACTION_REQUIRED");
  assert.deepEqual(result.findings[0]?.evidence, {
    status: "BLOCKED",
    blockedDurationMs: 25 * HOUR,
    blockedThresholdMs: 24 * HOUR,
    humanActionRequired: true,
  });
});

test("safe findings omit raw task, blocker, project, and secret material", async () => {
  const status = {
    ...baseStatus,
    currentTask: "Advanced trend charts",
    nextAction: "use password=synthetic-should-not-leak",
    humanActionRequired: "token=synthetic-should-not-leak",
    p0Blockers: [],
  };
  const result = await detector([status]).service.evaluateProject(PROJECT_ID);
  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes("synthetic-should-not-leak"), false);
  assert.equal(serialized.includes("Advanced trend charts"), false);
  assert.equal(serialized.includes("mvpGoal"), false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.findings), true);
});

test("evaluate all returns an independent evaluation for each project", async () => {
  const second = {
    ...baseStatus,
    projectId: "40000000-0000-4000-8000-000000000004",
    projectName: "Second",
    status: "BLOCKED" as const,
    updatedAt: "2026-10-13T11:00:00.000Z",
  };
  const result = await detector([baseStatus, second]).service.evaluateAllProjects();

  assert.equal(result.length, 2);
  assert.equal(result[0]?.projectId, PROJECT_ID);
  assert.equal(result[0]?.findings.length, 0);
  assert.equal(result[1]?.projectId, second.projectId);
  assert.equal(result[1]?.findings[0]?.type, "BLOCKED_TOO_LONG");
});

test("reading findings recomputes without mutating authoritative M4 state", async () => {
  const { service, snapshots } = detector();

  const findings = await service.readCurrentFindings(PROJECT_ID);

  assert.deepEqual(findings, []);
  assert.deepEqual(baseStatus, snapshots[0]);
  assert.equal("developmentHealth" in baseStatus, false);
});
