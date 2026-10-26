import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import {
  applyMigrations,
  loadMigrations,
  openPostgresDatabase,
  PostgresRoutingDecisionRepository,
  RoutingReadService,
  type AppendRoutingDecisionInput,
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
    INSERT INTO governance.registry_freshness_policy_versions(
      registry_freshness_policy_version_id,registry_freshness_policy_id,
      policy_version,authority_identifier,registry_scope,environment,max_age_ms,
      lifecycle_intent,effective_at,content_fingerprint,idempotency_key,
      created_by_actor_type,created_by_actor_id,reason_code,audit_ref
    ) VALUES('${id("29")}','${id("30")}',1,
      'MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD','PHASE15B_AI_REGISTRY',
      'STAGING',3600000,'ACTIVE',CURRENT_TIMESTAMP,'${sha("9")}',
      'registry-policy-1','SYSTEM','${id("5")}','TEST','${id("4")}');
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
  registryFreshnessPolicyRef: id("30"),
  registryFreshnessPolicyVersion: "1",
  registryFreshnessMaxAgeMs: 3_600_000,
  registrySnapshotHash: sha("f").slice("sha256:".length),
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
  aidosDelegationInput: null,
  aidosSnapshotBinding: null,
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

test("persists exact canonical AIDOS delegation input and snapshot binding", async (t) => {
  const { repository } = await fixture(t);
  const digest = sha("a");
  const aidosDelegationInput = {
    developmentIntent: "Implement the approved change",
    requestedRoleClass: "EXECUTOR" as const,
    requiredCapabilities: ["execute"] as const,
    preferredCapabilities: ["verify"] as const,
    policyConstraints: [] as const,
    contextRefs: [] as const,
    artifactRefs: [] as const,
    priority: 50,
    aidosProjectRef: "aidos-project",
    delegationRequestId: "delegation-request",
  };
  const aidosSnapshotBinding = {
    snapshotId: "018f47a2-5c2d-7b9f-8abc-0123456789ab",
    authorityEpoch: digest,
    requestDigest: digest,
    projectionBindings: [
      {
        projectionType: "AIDOS_PROJECT_REGISTRATION_PROJECTION" as const,
        projectionId:
          "urn:aidos:projection:018f47a2-5c2d-7b9f-8abc-0123456789ab:AIDOS_PROJECT_REGISTRATION_PROJECTION",
        projectionRevision: digest,
      },
      {
        projectionType: "AIDOS_RUNTIME_AVAILABILITY_PROJECTION" as const,
        projectionId:
          "urn:aidos:projection:018f47a2-5c2d-7b9f-8abc-0123456789ab:AIDOS_RUNTIME_AVAILABILITY_PROJECTION",
        projectionRevision: digest,
      },
      {
        projectionType: "AIDOS_DELEGATION_ELIGIBILITY_PROJECTION" as const,
        projectionId:
          "urn:aidos:projection:018f47a2-5c2d-7b9f-8abc-0123456789ab:AIDOS_DELEGATION_ELIGIBILITY_PROJECTION",
        projectionRevision: digest,
      },
    ],
  };
  const created = await repository.appendDecision({
    ...appendInput,
    canonicalDomain: "DEVELOPMENT",
    developmentDelegationState: "READY_TO_DELEGATE",
    aidosProjectRef: "aidos-project",
    aidosRequiredCapabilities: ["execute"],
    aidosAuthorityRevision: "aidos-r1",
    aidosCheckedAt: "2026-10-08T00:00:00.000Z",
    aidosFreshUntil: "2026-10-08T01:00:00.000Z",
    aidosDelegationInput,
    aidosSnapshotBinding,
    decisionState: "SELECTED",
    decisionReasonCodes: ["DELEGATE_TO_AIDOS"],
  });
  assert.deepEqual(created.decision.aidosDelegationInput, aidosDelegationInput);
  assert.deepEqual(created.decision.aidosSnapshotBinding, aidosSnapshotBinding);
});

const overrideAuthority = (targetDecisionId: string) => ({
  authorityId: "authority:routing-override",
  permission: "ROUTING_DECISION:OVERRIDE" as const,
  state: "ACTIVE" as const,
  actorId: id("5"),
  organizationId: id("1"),
  projectId: id("3"),
  scopeRef: "scope",
  environment: "STAGING",
  targetRequestId: id("6"),
  targetRoutingPurpose: "PRIMARY_EXECUTION" as const,
  targetDecisionId,
  checkedAt: "2026-10-08T00:00:00.000Z",
  freshUntil: "2026-10-08T01:00:00.000Z",
});

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
  assert.equal(created.decision.registryFreshnessPolicyRef, id("30"));
  assert.equal(created.decision.registryFreshnessPolicyVersion, "1");
  assert.equal(created.decision.registryFreshnessMaxAgeMs, 3_600_000);
  assert.equal(
    created.decision.registrySnapshotHash,
    sha("f").slice("sha256:".length),
  );
  assert.equal("classificationFreshUntil" in created.decision, false);
  assert.equal(
    (await repository.listHistory(id("6"), "PRIMARY_EXECUTION")).length,
    1,
  );
  assert.equal((await repository.listCandidates(id("20"))).length, 0);
  const audits = await db.query<{
    count: number;
    lineage: Record<string, unknown>;
  }>(
    `SELECT count(*)::int AS count,
      (array_agg(metadata))[1]->'registryFreshnessAuthority' AS lineage
     FROM audit.audit_records WHERE action='ROUTING.DECISION_CREATED'`,
  );
  assert.equal(audits.rows[0]!.count, 1);
  assert.deepEqual(audits.rows[0]!.lineage, {
    policyRef: id("30"),
    policyVersion: "1",
    maxAgeMs: 3_600_000,
    registryObservedAt: "2026-10-08T00:00:00.000Z",
    freshUntil: "2026-10-08T01:00:00.000Z",
    snapshotRef: `registry-snapshot:${sha("f")}`,
    snapshotRevision: "registry-r1",
    snapshotHash: sha("f").slice("sha256:".length),
  });
  await assert.rejects(
    repository.appendDecision({ ...appendInput, canonicalDomain: "WRITING" }),
    /ROUTING_IDEMPOTENCY_CONFLICT/,
  );
});

test("rejects derived freshness and decision/candidate lineage mismatches before persistence", async (t) => {
  const { repository } = await fixture(t);
  await assert.rejects(
    repository.appendDecision({
      ...appendInput,
      registryFreshUntil: "2026-10-08T02:00:00.000Z",
    }),
    /REGISTRY_CONFLICT/,
  );
  await assert.rejects(
    repository.appendDecision({
      ...appendInput,
      candidates: [
        {
          candidateSnapshotId: id("31"),
          deterministicRank: 1,
          providerId: id("32"),
          modelId: id("33"),
          runtimeAdapterId: id("34"),
          modelHostBindingId: id("35"),
          eligibilityState: "ELIGIBLE",
          reasonCodes: ["ELIGIBLE"],
          capabilityEvidence: {},
          rankingEvidence: {},
          registrySnapshotRef: appendInput.registrySnapshotRef,
          registrySnapshotRevision: "registry-r2",
          registryFreshnessPolicyRef: appendInput.registryFreshnessPolicyRef,
          registryFreshnessPolicyVersion:
            appendInput.registryFreshnessPolicyVersion,
          registryFreshnessMaxAgeMs: appendInput.registryFreshnessMaxAgeMs,
          registrySnapshotHash: appendInput.registrySnapshotHash,
          observedAt: appendInput.registryObservedAt,
          freshUntil: appendInput.registryFreshUntil,
        },
      ],
    }),
    /REGISTRY_CONFLICT/,
  );
});

test("persists Human override Audit atomically and rolls back on Audit failure", async (t) => {
  const { db, repository } = await fixture(t);
  await repository.appendDecision(appendInput);
  const override = {
    ...appendInput,
    routingDecisionId: id("22"),
    expectedPredecessorId: appendInput.routingDecisionId,
    idempotencyKey: "override-1",
    canonicalIntentFingerprint: sha("9"),
    actorType: "HUMAN" as const,
    auditAction: "ROUTING.OVERRIDE_CREATED" as const,
    auditMetadata: {
      authority: overrideAuthority(appendInput.routingDecisionId),
      overrideTargetDecisionId: appendInput.routingDecisionId,
      overrideIntentType: "REEVALUATE_CANONICAL",
      reasonCode: "HUMAN_REQUESTED_REEVALUATION",
      reasonText: "Re-evaluate under current canonical authority.",
    },
  } satisfies AppendRoutingDecisionInput;
  const result = await repository.appendDecision(override);
  assert.equal(result.outcome, "CREATED");
  const audit = await db.query<{
    action: string;
    metadata: Record<string, unknown>;
  }>("SELECT action,metadata FROM audit.audit_records WHERE id=$1", [
    result.auditRef,
  ]);
  assert.equal(audit.rows[0]?.action, "ROUTING.OVERRIDE_CREATED");
  assert.equal(
    (audit.rows[0]?.metadata.authority as { authorityId?: string })
      ?.authorityId,
    "authority:routing-override",
  );
  assert.equal(
    (await repository.findHumanOverrideAudit(result.auditRef))?.metadata
      .authority.authorityId,
    "authority:routing-override",
  );
  await repository.recordRoutingAudit({
    action: "ROUTING.OVERRIDE_REJECTED",
    actorId: id("5"),
    actorType: "HUMAN",
    requestId: id("6"),
    projectId: id("3"),
    targetDecisionId: result.decision.routingDecisionId,
    result: "DENIED",
    evidenceRefs: ["evidence:rejection"],
    correlationId: "corr-rejection",
    traceId: "trace-rejection",
    spanId: "span-rejection",
    idempotencyKey: "override-rejected",
    metadata: {
      routingPurpose: "PRIMARY_EXECUTION",
      reasonCode: "HUMAN_OVERRIDE_POLICY_VIOLATION",
    },
  });
  const rejectionAudit = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM audit.audit_records WHERE action='ROUTING.OVERRIDE_REJECTED'",
  );
  assert.equal(rejectionAudit.rows[0]?.count, 1);

  await db.exec(`
    CREATE OR REPLACE FUNCTION audit.reject_phase15d_override_for_test()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='ROUTING.OVERRIDE_CREATED' THEN RAISE EXCEPTION 'bounded test rejection'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER reject_phase15d_override_for_test
      BEFORE INSERT ON audit.audit_records
      FOR EACH ROW EXECUTE FUNCTION audit.reject_phase15d_override_for_test();
  `);
  await assert.rejects(
    repository.appendDecision({
      ...override,
      routingDecisionId: id("23"),
      expectedPredecessorId: result.decision.routingDecisionId,
      idempotencyKey: "override-rollback",
      canonicalIntentFingerprint: sha("8"),
    }),
    /bounded test rejection/,
  );
  assert.equal(
    (
      await repository.listHistory(
        appendInput.requestId,
        appendInput.routingPurpose,
      )
    ).length,
    2,
  );
  assert.equal((await repository.listCandidates(id("23"))).length, 0);
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
  "real PostgreSQL preserves exact freshness lineage across replay and competing overrides",
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
        INSERT INTO governance.registry_freshness_policy_versions(
          registry_freshness_policy_version_id,registry_freshness_policy_id,
          policy_version,authority_identifier,registry_scope,environment,max_age_ms,
          lifecycle_intent,effective_at,content_fingerprint,idempotency_key,
          created_by_actor_type,created_by_actor_id,reason_code,audit_ref
        ) VALUES('${id("29")}','${id("30")}',1,
          'MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD','PHASE15B_AI_REGISTRY',
          'STAGING',3600000,'ACTIVE',CURRENT_TIMESTAMP,'${sha("9")}',
          'registry-policy-real-1','SYSTEM','${id("5")}','TEST','${id("4")}');
        INSERT INTO governance.registry_freshness_policy_versions(
          registry_freshness_policy_version_id,registry_freshness_policy_id,
          policy_version,authority_identifier,registry_scope,environment,max_age_ms,
          lifecycle_intent,effective_at,content_fingerprint,idempotency_key,
          created_by_actor_type,created_by_actor_id,reason_code,audit_ref
        ) VALUES('${id("36")}','${id("37")}',1,
          'MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD','PHASE15B_AI_REGISTRY',
          'STAGING',7200000,'ACTIVE',CURRENT_TIMESTAMP,'${sha("8")}',
          'registry-policy-real-2','SYSTEM','${id("5")}','TEST','${id("4")}');
        INSERT INTO ai.model_providers(id,name,status)
          VALUES('${id("32")}','RFA05 Provider','ACTIVE');
        INSERT INTO ai.models(id,provider_id,name,lifecycle,capabilities)
          VALUES('${id("33")}','${id("32")}','RFA05 Model','ACTIVE',ARRAY['routing']);
        INSERT INTO ai.host_runtimes(
          id,provider_id,host_key,display_name,host_type,execution_mode,
          network_required,credential_mode,adapter_ref
        ) VALUES('${id("34")}','${id("32")}','rfa05-host','RFA05 Host',
          'PROVIDER_API','REMOTE_API',true,'NONE','adapter:rfa05');
        INSERT INTO ai.model_host_bindings(id,model_id,host_id)
          VALUES('${id("35")}','${id("33")}','${id("34")}');
      `);
        const firstRepository = new PostgresRoutingDecisionRepository(first);
        const secondRepository = new PostgresRoutingDecisionRepository(second);
        const realInput: AppendRoutingDecisionInput = {
          ...appendInput,
          candidates: [
            {
              candidateSnapshotId: id("31"),
              deterministicRank: 1,
              providerId: id("32"),
              modelId: id("33"),
              runtimeAdapterId: id("34"),
              modelHostBindingId: id("35"),
              eligibilityState: "ELIGIBLE",
              reasonCodes: ["ELIGIBLE"],
              capabilityEvidence: {},
              rankingEvidence: {},
              registrySnapshotRef: appendInput.registrySnapshotRef,
              registrySnapshotRevision: appendInput.registrySnapshotRevision,
              registryFreshnessPolicyRef:
                appendInput.registryFreshnessPolicyRef,
              registryFreshnessPolicyVersion:
                appendInput.registryFreshnessPolicyVersion,
              registryFreshnessMaxAgeMs: appendInput.registryFreshnessMaxAgeMs,
              registrySnapshotHash: appendInput.registrySnapshotHash,
              observedAt: appendInput.registryObservedAt,
              freshUntil: appendInput.registryFreshUntil,
            },
          ],
        };
        const results = await Promise.all([
          firstRepository.appendDecision(realInput),
          secondRepository.appendDecision(realInput),
        ]);
        assert.deepEqual(results.map((x) => x.outcome).sort(), [
          "CREATED",
          "REUSED",
        ]);
        const persistedDecision = await firstRepository.findById(
          appendInput.requestId,
          appendInput.routingDecisionId,
        );
        assert.equal(
          (
            await firstRepository.findDecisionById(
              appendInput.routingDecisionId,
            )
          )?.requestId,
          appendInput.requestId,
        );
        assert.deepEqual(
          {
            policyRef: persistedDecision?.registryFreshnessPolicyRef,
            policyVersion: persistedDecision?.registryFreshnessPolicyVersion,
            maxAgeMs: persistedDecision?.registryFreshnessMaxAgeMs,
            registryObservedAt: persistedDecision?.registryObservedAt,
            freshUntil: persistedDecision?.registryFreshUntil,
            snapshotRef: persistedDecision?.registrySnapshotRef,
            snapshotRevision: persistedDecision?.registrySnapshotRevision,
            snapshotHash: persistedDecision?.registrySnapshotHash,
          },
          {
            policyRef: id("30"),
            policyVersion: "1",
            maxAgeMs: 3_600_000,
            registryObservedAt: "2026-10-08T00:00:00.000Z",
            freshUntil: "2026-10-08T01:00:00.000Z",
            snapshotRef: `registry-snapshot:${sha("f")}`,
            snapshotRevision: "registry-r1",
            snapshotHash: sha("f").slice("sha256:".length),
          },
        );
        const decisionAudit = await first.query<{
          lineage: Record<string, unknown>;
        }>(
          "SELECT metadata->'registryFreshnessAuthority' AS lineage FROM audit.audit_records WHERE id=$1",
          [persistedDecision!.auditRef],
        );
        assert.deepEqual(decisionAudit.rows[0]!.lineage, {
          policyRef: id("30"),
          policyVersion: "1",
          maxAgeMs: 3_600_000,
          registryObservedAt: "2026-10-08T00:00:00.000Z",
          freshUntil: "2026-10-08T01:00:00.000Z",
          snapshotRef: `registry-snapshot:${sha("f")}`,
          snapshotRevision: "registry-r1",
          snapshotHash: sha("f").slice("sha256:".length),
        });
        const persistedCandidates = await firstRepository.listCandidates(
          appendInput.routingDecisionId,
        );
        assert.equal(persistedCandidates.length, 1);
        assert.deepEqual(
          {
            policyRef: persistedCandidates[0]!.registryFreshnessPolicyRef,
            policyVersion:
              persistedCandidates[0]!.registryFreshnessPolicyVersion,
            maxAgeMs: persistedCandidates[0]!.registryFreshnessMaxAgeMs,
            registryObservedAt: persistedCandidates[0]!.observedAt,
            freshUntil: persistedCandidates[0]!.freshUntil,
            snapshotRef: persistedCandidates[0]!.registrySnapshotRef,
            snapshotRevision: persistedCandidates[0]!.registrySnapshotRevision,
            snapshotHash: persistedCandidates[0]!.registrySnapshotHash,
          },
          {
            policyRef: persistedDecision!.registryFreshnessPolicyRef,
            policyVersion: persistedDecision!.registryFreshnessPolicyVersion,
            maxAgeMs: persistedDecision!.registryFreshnessMaxAgeMs,
            registryObservedAt: persistedDecision!.registryObservedAt,
            freshUntil: persistedDecision!.registryFreshUntil,
            snapshotRef: persistedDecision!.registrySnapshotRef,
            snapshotRevision: persistedDecision!.registrySnapshotRevision,
            snapshotHash: persistedDecision!.registrySnapshotHash,
          },
        );
        const readDecision = await new RoutingReadService({
          repository: firstRepository,
        }).getDecisionById({
          routingDecisionId: appendInput.routingDecisionId,
        });
        assert.deepEqual(
          {
            policyRef: readDecision.registryProof.freshnessAuthority?.policyRef,
            policyVersion:
              readDecision.registryProof.freshnessAuthority?.policyVersion,
            maxAgeMs: readDecision.registryProof.freshnessAuthority?.maxAgeMs,
            registryObservedAt: readDecision.registryProof.observedAt,
            freshUntil: readDecision.registryProof.freshUntil,
            snapshotRef: readDecision.registryProof.snapshotRef,
            snapshotRevision: readDecision.registryProof.revision,
            snapshotHash:
              readDecision.registryProof.freshnessAuthority?.snapshotHash,
          },
          {
            policyRef: id("30"),
            policyVersion: "1",
            maxAgeMs: 3_600_000,
            registryObservedAt: "2026-10-08T00:00:00.000Z",
            freshUntil: "2026-10-08T01:00:00.000Z",
            snapshotRef: `registry-snapshot:${sha("f")}`,
            snapshotRevision: "registry-r1",
            snapshotHash: sha("f").slice("sha256:".length),
          },
        );
        const replayCounts = async () =>
          (
            await first.query<{
              decisions: string;
              candidates: string;
              audits: string;
            }>(`
              SELECT
                (SELECT count(*)::text FROM governance.request_routing_decision_versions) AS decisions,
                (SELECT count(*)::text FROM governance.request_routing_candidate_snapshots) AS candidates,
                (SELECT count(*)::text FROM audit.audit_records WHERE action='ROUTING.DECISION_CREATED') AS audits
            `)
          ).rows[0];
        assert.deepEqual(await replayCounts(), {
          decisions: "1",
          candidates: "1",
          audits: "1",
        });

        const freshnessDriftCases: readonly AppendRoutingDecisionInput[] = [
          {
            ...realInput,
            registryFreshnessPolicyVersion: "2",
            candidates: realInput.candidates.map((candidate) => ({
              ...candidate,
              registryFreshnessPolicyVersion: "2",
            })),
          },
          {
            ...realInput,
            registryFreshnessMaxAgeMs: 7_200_000,
            registryFreshUntil: "2026-10-08T02:00:00.000Z",
            candidates: realInput.candidates.map((candidate) => ({
              ...candidate,
              registryFreshnessMaxAgeMs: 7_200_000,
              freshUntil: "2026-10-08T02:00:00.000Z",
            })),
          },
          {
            ...realInput,
            registryObservedAt: "2026-10-08T00:30:00.000Z",
            registryFreshUntil: "2026-10-08T01:30:00.000Z",
            candidates: realInput.candidates.map((candidate) => ({
              ...candidate,
              observedAt: "2026-10-08T00:30:00.000Z",
              freshUntil: "2026-10-08T01:30:00.000Z",
            })),
          },
          { ...realInput, registryFreshUntil: "2026-10-08T02:00:00.000Z" },
          {
            ...realInput,
            registrySnapshotRevision: "registry-r2",
            candidates: realInput.candidates.map((candidate) => ({
              ...candidate,
              registrySnapshotRevision: "registry-r2",
            })),
          },
        ];
        for (const drift of freshnessDriftCases)
          await assert.rejects(
            secondRepository.appendDecision(drift),
            /(ROUTING_IDEMPOTENCY_CONFLICT|REGISTRY_CONFLICT)/,
          );

        for (const mismatchedCandidate of [
          {
            ...realInput.candidates[0]!,
            registryFreshnessPolicyVersion: "2",
          },
          {
            ...realInput.candidates[0]!,
            registrySnapshotRevision: "registry-r2",
          },
        ])
          await assert.rejects(
            secondRepository.appendDecision({
              ...realInput,
              candidates: [mismatchedCandidate],
            }),
            /REGISTRY_CONFLICT/,
          );
        assert.deepEqual(await replayCounts(), {
          decisions: "1",
          candidates: "1",
          audits: "1",
        });

        const currentFreshness = {
          registryFreshnessPolicyRef: id("37"),
          registryFreshnessPolicyVersion: "1",
          registryFreshnessMaxAgeMs: 7_200_000,
          registryObservedAt: "2026-10-08T00:30:00.000Z",
          registryFreshUntil: "2026-10-08T02:30:00.000Z",
          registrySnapshotRef: `registry-snapshot:${sha("7")}`,
          registrySnapshotRevision: "registry-r2",
          registrySnapshotHash: sha("7").slice("sha256:".length),
        } as const;
        const overrideA: AppendRoutingDecisionInput = {
          ...appendInput,
          ...currentFreshness,
          routingDecisionId: id("40"),
          expectedPredecessorId: appendInput.routingDecisionId,
          idempotencyKey: "route-successor-a",
          canonicalIntentFingerprint: sha("2"),
          contextRefs: ["successor:a"],
          actorType: "HUMAN",
          auditAction: "ROUTING.OVERRIDE_CREATED",
          auditMetadata: {
            authority: overrideAuthority(appendInput.routingDecisionId),
            overrideTargetDecisionId: appendInput.routingDecisionId,
            overrideIntentType: "REEVALUATE_CANONICAL",
            reasonCode: "HUMAN_REQUESTED_REEVALUATION",
            reasonText: "Concurrent override A.",
          },
        };
        const overrideB: AppendRoutingDecisionInput = {
          ...overrideA,
          routingDecisionId: id("41"),
          idempotencyKey: "route-successor-b",
          canonicalIntentFingerprint: sha("3"),
          contextRefs: ["successor:b"],
          auditMetadata: {
            authority: overrideAuthority(appendInput.routingDecisionId),
            overrideTargetDecisionId: appendInput.routingDecisionId,
            overrideIntentType: "REEVALUATE_CANONICAL",
            reasonCode: "HUMAN_REQUESTED_REEVALUATION",
            reasonText: "Concurrent override B.",
          },
        };
        const competing = await Promise.allSettled([
          firstRepository.appendDecision(overrideA),
          secondRepository.appendDecision(overrideB),
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
        assert.deepEqual(
          {
            policyRef: head?.registryFreshnessPolicyRef,
            policyVersion: head?.registryFreshnessPolicyVersion,
            maxAgeMs: head?.registryFreshnessMaxAgeMs,
            registryObservedAt: head?.registryObservedAt,
            freshUntil: head?.registryFreshUntil,
            snapshotRef: head?.registrySnapshotRef,
            snapshotRevision: head?.registrySnapshotRevision,
            snapshotHash: head?.registrySnapshotHash,
          },
          {
            policyRef: id("37"),
            policyVersion: "1",
            maxAgeMs: 7_200_000,
            registryObservedAt: "2026-10-08T00:30:00.000Z",
            freshUntil: "2026-10-08T02:30:00.000Z",
            snapshotRef: `registry-snapshot:${sha("7")}`,
            snapshotRevision: "registry-r2",
            snapshotHash: sha("7").slice("sha256:".length),
          },
        );
        const winnerInput =
          competing[0]!.status === "fulfilled" ? overrideA : overrideB;
        assert.equal(
          (await firstRepository.appendDecision(winnerInput)).outcome,
          "REUSED",
        );
        await assert.rejects(
          firstRepository.appendDecision({
            ...winnerInput,
            registrySnapshotRevision: "registry-r3",
          }),
          /ROUTING_IDEMPOTENCY_CONFLICT/,
        );
        const overrideAudit = await first.query<{
          lineage: Record<string, unknown>;
        }>(
          "SELECT metadata->'registryFreshnessAuthority' AS lineage FROM audit.audit_records WHERE id=$1",
          [head!.auditRef],
        );
        assert.deepEqual(overrideAudit.rows[0]!.lineage, {
          policyRef: id("37"),
          policyVersion: "1",
          maxAgeMs: 7_200_000,
          registryObservedAt: "2026-10-08T00:30:00.000Z",
          freshUntil: "2026-10-08T02:30:00.000Z",
          snapshotRef: `registry-snapshot:${sha("7")}`,
          snapshotRevision: "registry-r2",
          snapshotHash: sha("7").slice("sha256:".length),
        });
        const counts = await first.query<{
          decisions: string;
          decision_audits: string;
          override_audits: string;
          version_two_heads: string;
        }>(`
        SELECT
          (SELECT count(*)::text FROM governance.request_routing_decision_versions) AS decisions,
          (SELECT count(*)::text FROM audit.audit_records WHERE action='ROUTING.DECISION_CREATED') AS decision_audits,
          (SELECT count(*)::text FROM audit.audit_records WHERE action='ROUTING.OVERRIDE_CREATED') AS override_audits,
          (SELECT count(*)::text FROM governance.request_routing_decision_versions WHERE routing_version=2) AS version_two_heads
      `);
        assert.deepEqual(counts.rows[0], {
          decisions: "2",
          decision_audits: "1",
          override_audits: "1",
          version_two_heads: "1",
        });
      } finally {
        await second.close();
        await first.close();
      }
    });
  },
);
