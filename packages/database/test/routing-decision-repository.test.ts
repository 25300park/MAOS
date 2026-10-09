import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import {
  applyMigrations,
  loadMigrations,
  openPostgresDatabase,
  PostgresRoutingDecisionRepository,
} from "../src/index.js";
import { withDisposablePostgres } from "../../../scripts/testing/disposable-postgres.js";

const id = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, "0")}`;
const sha = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;

async function fixture(t: test.TestContext) {
  const db = new PGlite();
  t.after(() => db.close());
  await applyMigrations(
    db,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  await db.exec(`
    INSERT INTO core.organizations(id,name,slug) VALUES('${id("1")}','O','ewp02-o');
    INSERT INTO core.departments(id,organization_id,name) VALUES('${id("2")}','${id("1")}','D');
    INSERT INTO core.projects(id,organization_id,department_id,name) VALUES('${id("3")}','${id("1")}','${id("2")}','P');
    INSERT INTO audit.audit_records(id,actor_type,actor_id,action,target_type,target_id,result,request_id,correlation_id,trace_id,span_id,record_hash)
      VALUES('${id("4")}','SYSTEM','${id("5")}','ROUTING.CREATE','ROUTING_POLICY','${id("4")}','SUCCEEDED','seed','seed','seed','seed',repeat('a',64));
    INSERT INTO work.requests(id,source_system,source_type,source_ref,source_fingerprint,organization_id,project_id,company_scope_ref,project_scope_ref,environment,registered_by_actor_type,registered_by_actor_id,idempotency_key,input_fingerprint,correlation_id,registration_audit_ref)
      VALUES('${id("6")}','MAOS','TEST','request:1','${sha("b")}','${id("1")}','${id("3")}','company','project','STAGING','SYSTEM','${id("5")}','request-1','${sha("c")}','corr','${id("4")}');
    INSERT INTO ai.domain_execution_constraints(
      id,domain_key,execution_mode,status,reason_code,policy_ref,policy_version,
      routing_disposition
    ) VALUES (
      '${id("8")}','OPERATIONS','MAOS_NATIVE','ACTIVE','ROUTING_ALLOWED',
      'policy:operations','1','MAOS_NATIVE'
    );
    INSERT INTO governance.request_classification_versions(classification_id,request_id,version,domain_key,classification_state,source,routing_disposition,reason_code,policy_resolution_ref,policy_resolution_version,created_by_actor_type,created_by_actor_id,validated_at,canonical_payload_fingerprint,idempotency_key,correlation_id,audit_ref)
      VALUES('${id("7")}','${id("6")}',1,'OPERATIONS','VALIDATED','DETERMINISTIC_POLICY','MAOS_NATIVE','VALID','${id("8")}','1','SYSTEM','${id("5")}',CURRENT_TIMESTAMP,'${sha("d")}','classification-1','corr','${id("4")}');
    INSERT INTO governance.ai_routing_policy_versions(routing_policy_version_id,routing_policy_id,version,authority_identifier,lifecycle_intent,canonical_domain,routing_purpose,role_class,scope_ref,environment,effective_at,content_fingerprint,created_by_actor_type,created_by_actor_id,audit_ref)
      VALUES('${id("9")}','${id("10")}',1,'MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD','ACTIVE','OPERATIONS','PRIMARY_EXECUTION','EXECUTOR','scope','STAGING',CURRENT_TIMESTAMP,'${sha("e")}','SYSTEM','${id("5")}','${id("4")}');
  `);
  return { db, repository: new PostgresRoutingDecisionRepository(db) };
}

const appendInput = {
  routingDecisionId: id("20"),
  routingDecisionStreamId: id("21"),
  requestId: id("6"),
  routingPurpose: "PRIMARY_EXECUTION" as const,
  expectedPredecessorId: null,
  classificationVersionId: id("7"),
  classificationVersion: 1,
  classificationState: "VALIDATED" as const,
  classificationCurrentnessState: "CURRENT" as const,
  classificationCurrentnessProof: sha("d"),
  classificationPolicyResolutionRef: id("8"),
  classificationPolicyResolutionVersion: "1",
  canonicalDomain: "OPERATIONS" as const,
  roleClass: "EXECUTOR" as const,
  routingMode: "PRIMARY_EXECUTION" as const,
  specializationVersionId: null,
  routingPolicyVersionId: id("9"),
  selectedProviderRef: null,
  selectedModelRef: null,
  selectedRuntimeAdapterRef: null,
  selectedModelHostBindingRef: null,
  registrySnapshotRef: `registry-snapshot:${sha("f")}`,
  registrySnapshotRevision: "registry-r1",
  registryObservedAt: "2026-10-08T00:00:00.000Z",
  registryFreshUntil: "2026-10-08T01:00:00.000Z",
  requiredCapabilities: [] as string[],
  preferredCapabilities: [] as string[],
  policyConstraints: {},
  contextRefs: [] as string[],
  artifactRefs: [] as string[],
  evidenceRefs: ["evidence:routing:1"],
  priority: "NORMAL" as const,
  humanApprovalState: "NOT_REQUIRED" as const,
  humanApprovalRef: null,
  humanApprovalTargetVersion: null,
  humanApprovalTargetHash: null,
  humanApprovalAuthority: null,
  humanApprovalCheckedAt: null,
  humanApprovalExpiresAt: null,
  developmentDelegationState: "NOT_APPLICABLE" as const,
  aidosProjectRef: null,
  aidosRequiredCapabilities: null,
  aidosAuthorityRevision: null,
  aidosCheckedAt: null,
  aidosFreshUntil: null,
  decisionState: "DENIED" as const,
  decisionReasonCodes: ["POLICY_DENIED"],
  stalenessState: "CURRENT" as const,
  classificationCheckedAt: "2026-10-08T00:00:00.000Z",
  policyCheckedAt: "2026-10-08T00:00:00.000Z",
  policyFreshUntil: "2026-10-08T01:00:00.000Z",
  idempotencyKey: "route-1",
  canonicalIntentFingerprint: sha("1"),
  correlationId: "corr-route",
  causationRefs: [] as string[],
  actorType: "SYSTEM" as const,
  actorId: id("5"),
  traceId: "trace-route",
  spanId: "span-route",
  projectId: id("3"),
  candidates: [] as const,
};

test("persists immutable stream-local versions with exact replay", async (t) => {
  const { db, repository } = await fixture(t);
  const created = await repository.appendDecision(appendInput);
  const replay = await repository.appendDecision(appendInput);
  assert.equal(created.outcome, "CREATED");
  assert.equal(replay.outcome, "REUSED");
  assert.equal(created.decision.classificationVersionId, id("7"));
  assert.equal(created.decision.classificationVersion, 1);
  assert.equal(created.decision.classificationState, "VALIDATED");
  assert.equal(created.decision.classificationCurrentnessState, "CURRENT");
  assert.equal(created.decision.classificationCurrentnessProof, sha("d"));
  assert.equal(created.decision.classificationPolicyResolutionRef, id("8"));
  assert.equal(created.decision.classificationPolicyResolutionVersion, "1");
  assert.equal("classificationFreshUntil" in created.decision, false);
  assert.equal(
    (await repository.listHistory(id("6"), "PRIMARY_EXECUTION")).length,
    1,
  );
  assert.equal((await repository.listCandidates(id("20"))).length, 0);
  const audits = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM audit.audit_records WHERE action='ROUTING.DECISION_CREATED'",
  );
  assert.equal(audits.rows[0]!.count, 1);
  await assert.rejects(
    repository.appendDecision({ ...appendInput, canonicalDomain: "WRITING" }),
    /ROUTING_IDEMPOTENCY_CONFLICT/,
  );
});

test("keeps purpose streams independent and confines fallback to primary", async (t) => {
  const { repository } = await fixture(t);
  const review = {
    ...appendInput,
    routingDecisionId: id("30"),
    routingDecisionStreamId: id("31"),
    routingPurpose: "INDEPENDENT_REVIEW" as const,
    routingMode: "INDEPENDENT_REVIEW" as const,
    roleClass: "REVIEWER" as const,
    idempotencyKey: "review-1",
  };
  await Promise.all([
    repository.appendDecision(appendInput),
    repository.appendDecision(review),
  ]);
  assert.equal(
    (await repository.findCurrent(id("6"), "PRIMARY_EXECUTION"))
      ?.routingVersion,
    1,
  );
  assert.equal(
    (await repository.findCurrent(id("6"), "INDEPENDENT_REVIEW"))
      ?.routingVersion,
    1,
  );
  await assert.rejects(
    repository.appendDecision({
      ...review,
      routingDecisionId: id("32"),
      routingMode: "FALLBACK",
      idempotencyKey: "bad-fallback",
    }),
    /FALLBACK_NOT_AUTHORIZED/,
  );
});

test("rejects missing request and cross-stream predecessor", async (t) => {
  const { repository } = await fixture(t);
  await assert.rejects(
    repository.appendDecision({ ...appendInput, requestId: id("99") }),
    /ROUTING_REQUEST_NOT_FOUND/,
  );
  await repository.appendDecision(appendInput);
  await assert.rejects(
    repository.appendDecision({
      ...appendInput,
      routingDecisionId: id("40"),
      routingDecisionStreamId: id("41"),
      routingPurpose: "ADVERSARIAL_REVIEW",
      routingMode: "ADVERSARIAL_REVIEW",
      roleClass: "REVIEWER",
      expectedPredecessorId: id("20"),
      idempotencyKey: "cross-stream",
    }),
    /ROUTING_CROSS_STREAM_SUPERSESSION_DENIED/,
  );
});

test(
  "real PostgreSQL separates exact replay from distinct competing successors",
  { timeout: 120_000 },
  async () => {
    await withDisposablePostgres({}, async (context) => {
      const first = await openPostgresDatabase(context.migrationUrl);
      const second = await openPostgresDatabase(context.migrationUrl);
      try {
        await applyMigrations(
          first,
          await loadMigrations(resolve("packages/database/migrations")),
        );
        await first.exec(`
        INSERT INTO core.organizations(id,name,slug) VALUES('${id("1")}','O','ewp02-real-o');
        INSERT INTO core.departments(id,organization_id,name) VALUES('${id("2")}','${id("1")}','D');
        INSERT INTO core.projects(id,organization_id,department_id,name) VALUES('${id("3")}','${id("1")}','${id("2")}','P');
        INSERT INTO audit.audit_records(id,actor_type,actor_id,action,target_type,target_id,result,request_id,correlation_id,trace_id,span_id,record_hash)
          VALUES('${id("4")}','SYSTEM','${id("5")}','ROUTING.CREATE','ROUTING_POLICY','${id("4")}','SUCCEEDED','seed','seed','seed','seed',repeat('a',64));
        INSERT INTO work.requests(id,source_system,source_type,source_ref,source_fingerprint,organization_id,project_id,company_scope_ref,project_scope_ref,environment,registered_by_actor_type,registered_by_actor_id,idempotency_key,input_fingerprint,correlation_id,registration_audit_ref)
          VALUES('${id("6")}','MAOS','TEST','request:1','${sha("b")}','${id("1")}','${id("3")}','company','project','STAGING','SYSTEM','${id("5")}','request-1','${sha("c")}','corr','${id("4")}');
        INSERT INTO ai.domain_execution_constraints(id,domain_key,execution_mode,status,reason_code,policy_ref,policy_version,routing_disposition)
          VALUES('${id("8")}','OPERATIONS','MAOS_NATIVE','ACTIVE','ROUTING_ALLOWED','policy:operations','1','MAOS_NATIVE');
        INSERT INTO governance.request_classification_versions(classification_id,request_id,version,domain_key,classification_state,source,routing_disposition,reason_code,policy_resolution_ref,policy_resolution_version,created_by_actor_type,created_by_actor_id,validated_at,canonical_payload_fingerprint,idempotency_key,correlation_id,audit_ref)
          VALUES('${id("7")}','${id("6")}',1,'OPERATIONS','VALIDATED','DETERMINISTIC_POLICY','MAOS_NATIVE','VALID','${id("8")}','1','SYSTEM','${id("5")}',CURRENT_TIMESTAMP,'${sha("d")}','classification-1','corr','${id("4")}');
        INSERT INTO governance.ai_routing_policy_versions(routing_policy_version_id,routing_policy_id,version,authority_identifier,lifecycle_intent,canonical_domain,routing_purpose,role_class,scope_ref,environment,effective_at,content_fingerprint,created_by_actor_type,created_by_actor_id,audit_ref)
          VALUES('${id("9")}','${id("10")}',1,'MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD','ACTIVE','OPERATIONS','PRIMARY_EXECUTION','EXECUTOR','scope','STAGING',CURRENT_TIMESTAMP,'${sha("e")}','SYSTEM','${id("5")}','${id("4")}');
      `);
        const firstRepository = new PostgresRoutingDecisionRepository(first);
        const secondRepository = new PostgresRoutingDecisionRepository(second);
        const results = await Promise.all([
          firstRepository.appendDecision(appendInput),
          secondRepository.appendDecision(appendInput),
        ]);
        assert.deepEqual(results.map((x) => x.outcome).sort(), [
          "CREATED",
          "REUSED",
        ]);
        await assert.rejects(
          secondRepository.appendDecision({
            ...appendInput,
            canonicalDomain: "WRITING",
          }),
          /ROUTING_IDEMPOTENCY_CONFLICT/,
        );
        const competing = await Promise.allSettled([
          firstRepository.appendDecision({
            ...appendInput,
            routingDecisionId: id("30"),
            expectedPredecessorId: appendInput.routingDecisionId,
            idempotencyKey: "route-successor-a",
            canonicalIntentFingerprint: sha("2"),
            contextRefs: ["successor:a"],
          }),
          secondRepository.appendDecision({
            ...appendInput,
            routingDecisionId: id("31"),
            expectedPredecessorId: appendInput.routingDecisionId,
            idempotencyKey: "route-successor-b",
            canonicalIntentFingerprint: sha("3"),
            contextRefs: ["successor:b"],
          }),
        ]);
        assert.equal(
          competing.filter(({ status }) => status === "fulfilled").length,
          1,
        );
        const rejected = competing.filter(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        );
        assert.equal(rejected.length, 1);
        assert.match(String(rejected[0]!.reason), /ROUTING_STREAM_CONFLICT/);
        const head = await firstRepository.findCurrent(
          appendInput.requestId,
          appendInput.routingPurpose,
        );
        assert.equal(head?.routingVersion, 2);
        const counts = await first.query<{
          decisions: string;
          audits: string;
          version_two_heads: string;
        }>(`
        SELECT
          (SELECT count(*)::text FROM governance.request_routing_decision_versions) AS decisions,
          (SELECT count(*)::text FROM audit.audit_records WHERE action='ROUTING.DECISION_CREATED') AS audits,
          (SELECT count(*)::text FROM governance.request_routing_decision_versions WHERE routing_version=2) AS version_two_heads
      `);
        assert.deepEqual(counts.rows[0], {
          decisions: "2",
          audits: "2",
          version_two_heads: "1",
        });
      } finally {
        await second.close();
        await first.close();
      }
    });
  },
);
