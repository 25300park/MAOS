import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  applyMigrations,
  loadMigrations,
  PostgresRequestClassificationRepository,
  PostgresWorkRequestRepository,
} from "../src/index.js";

const id = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, "0")}`;
const hash = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;

async function fixture(t: test.TestContext) {
  const db = new PGlite();
  t.after(() => db.close());
  await applyMigrations(
    db,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  await db.exec(`INSERT INTO core.organizations(id,name,slug) VALUES('${id("1")}','O','phase15c-o');
    INSERT INTO core.departments(id,organization_id,name) VALUES('${id("2")}','${id("1")}','D');
    INSERT INTO core.projects(id,organization_id,department_id,name) VALUES('${id("3")}','${id("1")}','${id("2")}','P');`);
  const requests = new PostgresWorkRequestRepository(db);
  await requests.registerRequest({
    id: id("4"),
    sourceSystem: "MAOS",
    sourceType: "MESSAGE",
    sourceRef: "message://1",
    sourceFingerprint: hash("a"),
    organizationId: id("1"),
    projectId: id("3"),
    companyScopeRef: "company",
    teamScopeRef: null,
    projectScopeRef: "project",
    systemScopeRef: null,
    environment: "STAGING",
    actorType: "HUMAN",
    actorId: id("5"),
    idempotencyKey: "request",
    inputFingerprint: hash("b"),
    correlationId: "corr",
    causationRef: null,
    evidenceRefs: ["evidence://1"],
    traceId: "trace",
    spanId: "span",
  });
  return {
    db,
    repository: new PostgresRequestClassificationRepository(db, requests),
  };
}

const proposal = {
  classificationId: id("10"),
  requestId: id("4"),
  taskId: null,
  expectedPredecessorId: null,
  domainKey: "BUSINESS" as const,
  subdomainKey: null,
  classificationState: "PROPOSED" as const,
  source: "AI_ASSISTED" as const,
  routingDisposition: "REQUIRE_HUMAN_REVIEW" as const,
  reasonCode: "AI_PROPOSAL",
  requestedRoleClass: "ANALYST",
  requiredCapabilityRefs: ["capability://analysis"],
  preferredCapabilityRefs: [],
  policyConstraintRefs: [],
  contextRefs: [],
  artifactRefs: [],
  evidenceRefs: ["evidence://classification/1"],
  priorityClass: "NORMAL" as const,
  intentClassRef: null,
  intentSnapshotHash: null,
  riskClassRef: null,
  riskSnapshotHash: null,
  confidenceClass: "HIGH" as const,
  validatorRuleRef: null,
  validatorRuleVersion: null,
  policyResolutionRef: null,
  policyResolutionVersion: null,
  actorType: "AGENT" as const,
  actorId: id("6"),
  canonicalPayloadFingerprint: hash("c"),
  idempotencyKey: "classification-1",
  correlationId: "corr-c",
  causationRef: null,
  traceId: "trace-c",
  spanId: "span-c",
  requestContext: {
    organizationId: id("1"),
    projectId: id("3"),
    companyScopeRef: "company",
    teamScopeRef: null,
    projectScopeRef: "project",
    systemScopeRef: null,
    environment: "STAGING" as const,
  },
};

test("appends a monotonic immutable chain with exact replay", async (t) => {
  const { repository } = await fixture(t);
  const created = await repository.appendClassification(proposal);
  const replay = await repository.appendClassification(proposal);
  assert.equal(created.outcome, "CREATED");
  assert.equal(replay.outcome, "REUSED");
  assert.equal(replay.auditRef, created.auditRef);
  await assert.rejects(
    repository.appendClassification({ ...proposal, domainKey: "WRITING" }),
    /CLASSIFICATION_IDEMPOTENCY_CONFLICT/,
  );
  assert.equal((await repository.listClassificationHistory(id("4"))).length, 1);
});

test("rejects unknown and invalidated request authority before append", async (t) => {
  const { repository } = await fixture(t);
  await assert.rejects(
    repository.appendClassification({ ...proposal, requestId: id("99") }),
    /WORK_REQUEST_NOT_FOUND/,
  );
});
