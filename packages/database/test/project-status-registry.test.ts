import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import {
  applyMigrations,
  loadMigrations,
  PostgresProjectStatusRepository,
  ProjectStatusContractError,
  ProjectStatusService,
} from "../src/index.js";

const id = (n: string) => `40000000-0000-4000-8000-${n.padStart(12, "0")}`;

const authority = {
  source: "MAOS_INTERNAL" as const,
  actorType: "SYSTEM" as const,
  actorId: "maos-development-control-loop",
};

const initial = {
  projectId: id("3"),
  mvpGoal: "Complete the MAOS working MVP",
  currentPhase: "M4",
  currentTask: "Project Status Registry",
  status: "IN_PROGRESS" as const,
  progressPercent: 38,
  expectedDurationMs: 86_400_000,
  phaseStartedAt: "2026-10-14T00:00:00.000Z",
  latestCommit: "fce044848bb7c637668db64a9030959e9b8c4c1c",
  lastSuccessfulVerification: "2026-10-13T12:00:00.000Z",
  p0Blockers: [{ code: "M1_BINDINGS", summary: "Staging bindings pending" }],
  p1BacklogCount: 2,
  reviewCount: 1,
  revisionCount: 0,
  nextAction: "Complete M4 locally",
  humanActionRequired: null,
};

async function fixture(t: test.TestContext) {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(
    database,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  await database.exec(`
    INSERT INTO core.organizations(id,name,slug)
    VALUES ('${id("1")}', 'MAOS', 'maos');
    INSERT INTO core.departments(id,organization_id,name)
    VALUES ('${id("2")}', '${id("1")}', 'Development');
    INSERT INTO core.projects(id,organization_id,department_id,name)
    VALUES ('${id("3")}', '${id("1")}', '${id("2")}', 'MAOS');
  `);
  const repository = new PostgresProjectStatusRepository(database);
  return { database, service: new ProjectStatusService(repository) };
}

test("binds, reads, and lists one status against the canonical project identity", async (t) => {
  const { service } = await fixture(t);

  const created = await service.bindProjectStatus(initial, authority);
  const replay = await service.bindProjectStatus(initial, authority);
  const read = await service.readProjectStatus(initial.projectId);
  const listed = await service.listProjectStatuses();

  assert.equal(created.outcome, "CREATED");
  assert.equal(replay.outcome, "REUSED");
  assert.equal(read.projectName, "MAOS");
  assert.equal(read.projectId, initial.projectId);
  assert.deepEqual(read.p0Blockers, initial.p0Blockers);
  assert.equal(Object.isFrozen(read), true);
  assert.equal(Object.isFrozen(read.p0Blockers), true);
  assert.deepEqual(listed, [read]);
  assert.equal("organizationId" in read, false);
  assert.equal("actorId" in read, false);
});

test("updates phase, task, progress, blockers, and Human action through a governed source", async (t) => {
  const { service } = await fixture(t);
  await service.bindProjectStatus(initial, authority);

  const blocked = await service.updateProjectStatus(
    initial.projectId,
    {
      currentPhase: "M5",
      currentTask: "Delay and Drift Detector",
      status: "WAITING_HUMAN",
      progressPercent: 45,
      p0Blockers: [
        { code: "HUMAN_MAX_AGE", summary: "Select Staging maxAgeMs" },
      ],
      humanActionRequired: "Choose the initial Staging Registry maxAgeMs",
      nextAction: "Wait for the bounded Human decision",
    },
    authority,
  );

  assert.equal(blocked.currentPhase, "M5");
  assert.equal(blocked.currentTask, "Delay and Drift Detector");
  assert.equal(blocked.progressPercent, 45);
  assert.equal(blocked.p0Blockers[0]?.code, "HUMAN_MAX_AGE");
  assert.equal(
    blocked.humanActionRequired,
    "Choose the initial Staging Registry maxAgeMs",
  );

  const cleared = await service.updateProjectStatus(
    initial.projectId,
    {
      status: "IN_PROGRESS",
      p0Blockers: [],
      humanActionRequired: null,
      nextAction: "Continue autonomous local implementation",
    },
    authority,
  );
  assert.deepEqual(cleared.p0Blockers, []);
  assert.equal(cleared.humanActionRequired, null);
});

test("persists status updates across repository instances", async (t) => {
  const { database, service } = await fixture(t);
  await service.bindProjectStatus(initial, authority);
  await service.updateProjectStatus(
    initial.projectId,
    { progressPercent: 50, reviewCount: 2, revisionCount: 1 },
    authority,
  );

  const reopened = new ProjectStatusService(
    new PostgresProjectStatusRepository(database),
  );
  const status = await reopened.readProjectStatus(initial.projectId);
  assert.equal(status.progressPercent, 50);
  assert.equal(status.reviewCount, 2);
  assert.equal(status.revisionCount, 1);
});

test("rejects invalid progress and unknown projects without persistence", async (t) => {
  const { service } = await fixture(t);

  await assert.rejects(
    service.bindProjectStatus({ ...initial, progressPercent: 101 }, authority),
    (error) =>
      error instanceof ProjectStatusContractError &&
      error.code === "PROJECT_STATUS_INVALID",
  );
  await assert.rejects(
    service.bindProjectStatus({ ...initial, projectId: id("99") }, authority),
    (error) =>
      error instanceof ProjectStatusContractError &&
      error.code === "PROJECT_NOT_FOUND",
  );
  await assert.rejects(
    service.readProjectStatus(id("99")),
    (error) =>
      error instanceof ProjectStatusContractError &&
      error.code === "PROJECT_STATUS_NOT_FOUND",
  );
});

test("denies unauthorized or mismatched mutation authorities", async (t) => {
  const { service } = await fixture(t);

  await assert.rejects(
    service.bindProjectStatus(initial, {
      source: "AIDOS_RESULT",
      actorType: "SYSTEM",
      actorId: "aidos",
    }),
    (error) =>
      error instanceof ProjectStatusContractError &&
      error.code === "PROJECT_STATUS_UPDATE_DENIED",
  );
  await assert.rejects(
    service.bindProjectStatus(initial, {
      source: "HUMAN_ADMIN",
      actorType: "SYSTEM" as never,
      actorId: "human-1",
    }),
    (error) =>
      error instanceof ProjectStatusContractError &&
      error.code === "PROJECT_STATUS_UPDATE_DENIED",
  );
});
