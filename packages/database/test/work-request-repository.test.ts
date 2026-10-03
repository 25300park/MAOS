import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  applyMigrations,
  loadMigrations,
  PostgresWorkRequestRepository,
} from "../src/index.js";

const ids = {
  actor: "00000000-0000-4000-8000-00000000c001",
  department: "00000000-0000-4000-8000-00000000c002",
  organization: "00000000-0000-4000-8000-00000000c003",
  project: "00000000-0000-4000-8000-00000000c004",
  request: "00000000-0000-4000-8000-00000000c005",
};
const hash = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;

async function fixture(t: test.TestContext) {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(
    database,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  await database.exec(`INSERT INTO core.organizations(id,name,slug) VALUES('${ids.organization}','Phase15C','phase15c');
    INSERT INTO core.departments(id,organization_id,name) VALUES('${ids.department}','${ids.organization}','Governance');
    INSERT INTO core.projects(id,organization_id,department_id,name) VALUES('${ids.project}','${ids.organization}','${ids.department}','Classification');`);
  return new PostgresWorkRequestRepository(database);
}

const input = {
  id: ids.request,
  sourceSystem: "MAOS",
  sourceType: "MESSAGE",
  sourceRef: "message://phase15c/1",
  sourceFingerprint: hash("a"),
  organizationId: ids.organization,
  projectId: ids.project,
  companyScopeRef: "company-maos",
  teamScopeRef: "team-governance",
  projectScopeRef: "project-phase15c",
  systemScopeRef: null,
  environment: "STAGING" as const,
  actorType: "HUMAN" as const,
  actorId: ids.actor,
  idempotencyKey: "request-1",
  inputFingerprint: hash("b"),
  correlationId: "correlation-1",
  causationRef: null,
  evidenceRefs: ["evidence://request/1"],
  traceId: "trace-1",
  spanId: "span-1",
};

test("registers once, reuses exact intent, and rejects conflicting replay", async (t) => {
  const repository = await fixture(t);
  const created = await repository.registerRequest(input);
  const replay = await repository.registerRequest(input);
  assert.equal(created.outcome, "CREATED");
  assert.equal(replay.outcome, "REUSED");
  assert.equal(replay.auditRef, created.auditRef);
  await assert.rejects(
    repository.registerRequest({ ...input, sourceRef: "message://different" }),
    /WORK_REQUEST_IDEMPOTENCY_CONFLICT/,
  );
});

test("invalidates once and preserves terminal request history", async (t) => {
  const repository = await fixture(t);
  await repository.registerRequest(input);
  const invalidated = await repository.invalidateRequest({
    requestId: ids.request,
    actorType: "HUMAN",
    actorId: ids.actor,
    reasonCode: "SOURCE_WITHDRAWN",
    evidenceRefs: ["evidence://request/invalidate"],
    idempotencyKey: "invalidate-1",
    correlationId: "correlation-2",
    traceId: "trace-2",
    spanId: "span-2",
  });
  assert.equal(invalidated.request.lifecycleState, "INVALIDATED");
  await assert.rejects(
    repository.invalidateRequest({
      requestId: ids.request,
      actorType: "HUMAN",
      actorId: ids.actor,
      reasonCode: "SECOND",
      evidenceRefs: ["evidence://request/invalidate"],
      idempotencyKey: "invalidate-2",
      correlationId: "correlation-3",
      traceId: "trace-3",
      spanId: "span-3",
    }),
    /WORK_REQUEST_INVALIDATED_TERMINAL/,
  );
});
