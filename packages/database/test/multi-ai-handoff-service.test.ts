import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import {
  applyMigrations,
  loadMigrations,
  MultiAiHandoffContractError,
  MultiAiHandoffService,
  PostgresMultiAiHandoffRepository,
  type MultiAiHandoffRecord,
  type MultiAiHandoffRepository,
  type ProjectStatusDto,
} from "../src/index.js";

const id = (n: string) => `60000000-0000-4000-8000-${n.padStart(12, "0")}`;
const digest = (character: string) => `sha256:${character.repeat(64)}`;

function projectStatus(): ProjectStatusDto {
  return {
    projectId: id("3"),
    projectName: "MAOS",
    mvpGoal: "Working MVP",
    currentPhase: "M3",
    currentTask: "Prepare handoff",
    status: "IN_PROGRESS",
    progressPercent: 50,
    expectedDurationMs: 86_400_000,
    phaseStartedAt: "2026-10-14T00:00:00.000Z",
    latestCommit: null,
    lastSuccessfulVerification: null,
    p0Blockers: [],
    p1BacklogCount: 0,
    reviewCount: 0,
    revisionCount: 0,
    nextAction: "Create handoff",
    humanActionRequired: null,
    updatedAt: "2026-10-14T00:00:00.000Z",
  };
}

function fixture() {
  const records = new Map<string, MultiAiHandoffRecord>();
  const statusPatches: unknown[] = [];
  const repository: MultiAiHandoffRepository = {
    async createOrReuse(input) {
      const existing = [...records.values()].find(
        (record) => record.idempotencyKey === input.idempotencyKey,
      );
      if (existing) return { outcome: "REUSED", handoff: existing };
      records.set(input.handoffId, input);
      return { outcome: "CREATED", handoff: input };
    },
    async findById(handoffId) {
      return records.get(handoffId);
    },
    async replace(input) {
      records.set(input.handoffId, input);
      return input;
    },
  };
  const status = projectStatus();
  const service = new MultiAiHandoffService({
    repository,
    requests: {
      async findRequest(requestId) {
        return requestId === id("4")
          ? {
              id: requestId,
              sourceSystem: "MAOS",
              sourceType: "TASK",
              sourceRef: "task:m3",
              sourceFingerprint: "sha256:request",
              organizationId: id("1"),
              projectId: id("3"),
              companyScopeRef: "company://maos",
              teamScopeRef: null,
              projectScopeRef: "project://maos",
              systemScopeRef: null,
              environment: "STAGING",
              lifecycleState: "REGISTERED",
              registrationAuditRef: id("6"),
              registeredAt: "2026-10-14T00:00:00.000Z",
              invalidatedAt: null,
              invalidationReasonCode: null,
            }
          : undefined;
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
    now: () => "2026-10-14T00:01:00.000Z",
  });
  return { service, records, statusPatches };
}

const createInput = {
  requestId: id("4"),
  sourceRole: "PLANNER" as const,
  targetRole: "EXECUTOR" as const,
  contextRefs: ["context://request/4", "ai-memory-1:memory-1"],
  artifactRefs: ["artifact://plan/1"],
  actorId: id("5"),
  idempotencyKey: "handoff-m3-1",
  correlationId: "correlation-m3",
  traceId: "trace-m3",
  spanId: "span-m3",
};

test("valid PLANNER to EXECUTOR handoff is created", async () => {
  const { service } = fixture();
  const result = await service.createHandoff(createInput);
  assert.equal(result.outcome, "CREATED");
  assert.equal(result.handoff.sourceRole, "PLANNER");
  assert.equal(result.handoff.targetRole, "EXECUTOR");
  assert.equal(result.handoff.status, "PENDING");
});

test("request identity is preserved", async () => {
  const { service, records } = fixture();
  const result = await service.createHandoff(createInput);
  assert.equal(records.get(result.handoff.handoffId)?.requestId, id("4"));
});

test("context references are preserved", async () => {
  const { service, records } = fixture();
  const result = await service.createHandoff(createInput);
  assert.deepEqual(records.get(result.handoff.handoffId)?.contextRefs, [
    "context://request/4",
    "ai-memory-1:memory-1",
  ]);
});

test("artifact references are preserved", async () => {
  const { service, records } = fixture();
  const result = await service.createHandoff(createInput);
  assert.deepEqual(records.get(result.handoff.handoffId)?.artifactRefs, [
    "artifact://plan/1",
  ]);
});

test("start transition moves a pending handoff to in progress", async () => {
  const { service } = fixture();
  const created = await service.createHandoff(createInput);
  const started = await service.startHandoff(created.handoff.handoffId, {
    actorId: id("5"),
    correlationId: "correlation-m3",
    traceId: "trace-m3",
    spanId: "span-m3",
  });
  assert.equal(started.status, "IN_PROGRESS");
});

test("success stores the exact result reference", async () => {
  const { service, records } = fixture();
  const created = await service.createHandoff(createInput);
  await service.startHandoff(created.handoff.handoffId, {
    actorId: id("5"),
    correlationId: "c",
    traceId: "t",
    spanId: "s",
  });
  const completed = await service.completeHandoff(
    created.handoff.handoffId,
    "artifact://result/1",
    { actorId: id("5"), correlationId: "c", traceId: "t", spanId: "s" },
  );
  assert.equal(completed.status, "SUCCEEDED");
  assert.equal(
    records.get(completed.handoffId)?.resultRef,
    "artifact://result/1",
  );
});

test("failure stores only a bounded failure reason", async () => {
  const { service } = fixture();
  const created = await service.createHandoff(createInput);
  await service.startHandoff(created.handoff.handoffId, {
    actorId: id("5"),
    correlationId: "c",
    traceId: "t",
    spanId: "s",
  });
  const failed = await service.failHandoff(
    created.handoff.handoffId,
    "HANDOFF_EXECUTION_FAILED",
    { actorId: id("5"), correlationId: "c", traceId: "t", spanId: "s" },
  );
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.failureReason, "HANDOFF_EXECUTION_FAILED");
  assert.equal(failed.resultRef, null);
});

test("invalid source or target roles are rejected", async () => {
  const { service } = fixture();
  await assert.rejects(
    service.createHandoff({ ...createInput, sourceRole: "EXECUTOR" }),
    (error) =>
      error instanceof MultiAiHandoffContractError &&
      error.code === "HANDOFF_ROLE_PAIR_INVALID",
  );
  await assert.rejects(
    service.createHandoff({ ...createInput, targetRole: "PLANNER" }),
    (error) =>
      error instanceof MultiAiHandoffContractError &&
      error.code === "HANDOFF_ROLE_PAIR_INVALID",
  );
});

test("unknown request and unknown handoff fail safely", async () => {
  const { service } = fixture();
  await assert.rejects(
    service.createHandoff({ ...createInput, requestId: id("99") }),
    (error) =>
      error instanceof MultiAiHandoffContractError &&
      error.code === "HANDOFF_REQUEST_NOT_FOUND",
  );
  await assert.rejects(
    service.readHandoff(id("99")),
    (error) =>
      error instanceof MultiAiHandoffContractError &&
      error.code === "HANDOFF_NOT_FOUND",
  );
});

test("M4 status is updated when handoff starts", async () => {
  const { service, statusPatches } = fixture();
  const created = await service.createHandoff(createInput);
  await service.startHandoff(created.handoff.handoffId, {
    actorId: id("5"),
    correlationId: "c",
    traceId: "t",
    spanId: "s",
  });
  assert.deepEqual(statusPatches.at(-1), {
    currentTask: "PLANNER -> EXECUTOR handoff",
    status: "IN_PROGRESS",
    nextAction: "Complete handoff",
    humanActionRequired: null,
  });
});

test("M4 status records successful handoff verification", async () => {
  const { service, statusPatches } = fixture();
  const created = await service.createHandoff(createInput);
  await service.startHandoff(created.handoff.handoffId, {
    actorId: id("5"),
    correlationId: "c",
    traceId: "t",
    spanId: "s",
  });
  await service.completeHandoff(
    created.handoff.handoffId,
    "artifact://result/1",
    {
      actorId: id("5"),
      correlationId: "c",
      traceId: "t",
      spanId: "s",
    },
  );
  assert.deepEqual(statusPatches.at(-1), {
    currentTask: "PLANNER -> EXECUTOR handoff succeeded",
    status: "IN_PROGRESS",
    progressPercent: 55,
    lastSuccessfulVerification: "2026-10-14T00:01:00.000Z",
    nextAction: "Continue governed project work",
    humanActionRequired: null,
  });
});

test("M4 status records a failed handoff blocker", async () => {
  const { service, statusPatches } = fixture();
  const created = await service.createHandoff(createInput);
  await service.startHandoff(created.handoff.handoffId, {
    actorId: id("5"),
    correlationId: "c",
    traceId: "t",
    spanId: "s",
  });
  await service.failHandoff(
    created.handoff.handoffId,
    "HANDOFF_EXECUTION_FAILED",
    {
      actorId: id("5"),
      correlationId: "c",
      traceId: "t",
      spanId: "s",
    },
  );
  assert.deepEqual(statusPatches.at(-1), {
    currentTask: "PLANNER -> EXECUTOR handoff failed",
    status: "BLOCKED",
    p0Blockers: [
      { code: "HANDOFF_EXECUTION_FAILED", summary: "Multi-AI handoff failed" },
    ],
    nextAction: "Resolve handoff blocker",
    humanActionRequired: null,
  });
});

test("safe DTO excludes context, artifacts, idempotency, and backend state", async () => {
  const { service } = fixture();
  const result = await service.createHandoff(createInput);
  assert.equal("contextRefs" in result.handoff, false);
  assert.equal("artifactRefs" in result.handoff, false);
  assert.equal("idempotencyKey" in result.handoff, false);
  assert.equal("version" in result.handoff, false);
});

test("service introduces no MAOS-native execution path", () => {
  const { service } = fixture();
  assert.equal("execute" in service, false);
  assert.equal("selectModel" in service, false);
  assert.equal("selectRuntime" in service, false);
});

test("PostgreSQL persistence preserves handoff identity and audit trace", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(
    database,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  await database.exec(`
    INSERT INTO core.organizations(id,name,slug) VALUES('${id("1")}','MAOS','maos-m3');
    INSERT INTO core.departments(id,organization_id,name) VALUES('${id("2")}','${id("1")}','Development');
    INSERT INTO core.projects(id,organization_id,department_id,name) VALUES('${id("3")}','${id("1")}','${id("2")}','MAOS');
    INSERT INTO audit.audit_records(
      id,actor_type,actor_id,action,target_type,target_id,result,request_id,
      correlation_id,trace_id,span_id,record_hash
    ) VALUES('${id("6")}','SYSTEM','${id("5")}','WORK.REQUEST_REGISTERED','REQUEST',
      '${id("4")}','SUCCEEDED','${id("4")}','seed','seed','seed',repeat('a',64));
    INSERT INTO work.requests(
      id,source_system,source_type,source_ref,source_fingerprint,organization_id,
      project_id,company_scope_ref,project_scope_ref,environment,
      registered_by_actor_type,registered_by_actor_id,idempotency_key,
      input_fingerprint,correlation_id,registration_audit_ref
    ) VALUES('${id("4")}','MAOS','TASK','task:m3','${digest("b")}','${id("1")}',
      '${id("3")}','company','project','STAGING','SYSTEM','${id("5")}',
      'request-m3','${digest("c")}','seed','${id("6")}');
  `);
  const repository = new PostgresMultiAiHandoffRepository(database);
  const service = new MultiAiHandoffService({
    repository,
    requests: {
      async findRequest(requestId) {
        return requestId === id("4")
          ? {
              id: id("4"),
              sourceSystem: "MAOS",
              sourceType: "TASK",
              sourceRef: "task:m3",
              sourceFingerprint: "sha256:request",
              organizationId: id("1"),
              projectId: id("3"),
              companyScopeRef: "company",
              teamScopeRef: null,
              projectScopeRef: "project",
              systemScopeRef: null,
              environment: "STAGING",
              lifecycleState: "REGISTERED",
              registrationAuditRef: id("6"),
              registeredAt: "2026-10-14T00:00:00.000Z",
              invalidatedAt: null,
              invalidationReasonCode: null,
            }
          : undefined;
      },
    },
    now: () => "2026-10-14T00:01:00.000Z",
  });
  const created = await service.createHandoff(createInput);
  await service.startHandoff(created.handoff.handoffId, {
    actorId: id("5"),
    correlationId: "c",
    traceId: "t",
    spanId: "s",
  });
  await service.completeHandoff(
    created.handoff.handoffId,
    "artifact://result/1",
    {
      actorId: id("5"),
      correlationId: "c",
      traceId: "t",
      spanId: "s",
    },
  );
  const reopened = new PostgresMultiAiHandoffRepository(database);
  const persisted = await reopened.findById(created.handoff.handoffId);
  assert.equal(persisted?.requestId, id("4"));
  assert.deepEqual(persisted?.contextRefs, [
    "context://request/4",
    "ai-memory-1:memory-1",
  ]);
  assert.deepEqual(persisted?.artifactRefs, ["artifact://plan/1"]);
  assert.equal(persisted?.resultRef, "artifact://result/1");
  const audit = await database.query<{ action: string }>(
    "SELECT action FROM audit.audit_records WHERE target_id=$1 ORDER BY occurred_at",
    [created.handoff.handoffId],
  );
  assert.deepEqual(
    audit.rows.map((row) => row.action),
    ["HANDOFF.CREATED", "HANDOFF.STARTED", "HANDOFF.SUCCEEDED"],
  );
});
