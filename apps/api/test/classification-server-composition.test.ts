import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, loadMigrations } from "@maos/database";
import {
  composeClassificationRoutes,
  composeStagingClassificationRoutes,
} from "../src/classification-server-composition.js";

const context = {
  organizationId: "85000000-0000-4000-8000-000000000001",
  projectId: "85000000-0000-4000-8000-000000000002",
  companyScopeRef: "company-maos",
  teamScopeRef: "team-development",
  projectScopeRef: "project-maos",
  systemScopeRef: null,
  environment: "STAGING" as const,
};

test("composes from PostgreSQL only and reconstructs safe classification reads", async (t) => {
  const options = {
    environment: "staging" as const,
    scope: "project-maos",
    requestContext: context,
  };
  assert.deepEqual(composeClassificationRoutes(undefined, options), []);
  assert.deepEqual(
    composeStagingClassificationRoutes(undefined, { enabled: false }),
    [],
  );
  assert.throws(
    () =>
      composeStagingClassificationRoutes(undefined, {
        enabled: true,
        environment: "staging",
        scope: "project-maos",
        requestContext: context,
      }),
    /CLASSIFICATION_DATABASE_REQUIRED/,
  );
  const db = new PGlite();
  t.after(() => db.close());
  await applyMigrations(
    db,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  await db.query(
    `INSERT INTO core.organizations(id,name,slug) VALUES($1,'Org','phase15c-org')`,
    [context.organizationId],
  );
  const department = "85000000-0000-4000-8000-000000000008";
  await db.query(
    `INSERT INTO core.departments(id,organization_id,name) VALUES($1,$2,'Department')`,
    [department, context.organizationId],
  );
  await db.query(
    `INSERT INTO core.projects(id,organization_id,department_id,name) VALUES($1,$2,$3,'Project')`,
    [context.projectId, context.organizationId, department],
  );
  const actor = "85000000-0000-4000-8000-000000000003",
    request = "85000000-0000-4000-8000-000000000004",
    classification = "85000000-0000-4000-8000-000000000005";
  await db.query(
    `INSERT INTO identity.humans(id,organization_id,display_name) VALUES($1,$2,'Owner')`,
    [actor, context.organizationId],
  );
  await db.query(
    `INSERT INTO work.requests(id,source_system,source_type,source_ref,source_fingerprint,organization_id,project_id,company_scope_ref,team_scope_ref,project_scope_ref,environment,lifecycle_state,registered_by_actor_type,registered_by_actor_id,idempotency_key,input_fingerprint,correlation_id,registration_audit_ref) VALUES($1,'MAOS','PILOT','source://request','sha256:'||repeat('b',64),$2,$3,$4,$5,$6,'STAGING','REGISTERED','HUMAN',$7,'request-key','sha256:'||repeat('e',64),'corr',$8)`,
    [
      request,
      context.organizationId,
      context.projectId,
      context.companyScopeRef,
      context.teamScopeRef,
      context.projectScopeRef,
      actor,
      "85000000-0000-4000-8000-000000000006",
    ],
  );
  const policy = (
    await db.query<{ id: string; policy_version: string }>(
      `SELECT id::text,policy_version FROM ai.domain_execution_constraints WHERE domain_key='DEVELOPMENT'`,
    )
  ).rows[0]!;
  await db.query(
    `INSERT INTO governance.request_classification_versions(classification_id,request_id,version,domain_key,classification_state,source,routing_disposition,reason_code,evidence_refs,priority_class,validator_rule_ref,validator_rule_version,policy_resolution_ref,policy_resolution_version,created_by_actor_type,created_by_actor_id,validated_at,canonical_payload_fingerprint,idempotency_key,correlation_id,audit_ref) VALUES($1,$2,1,'DEVELOPMENT','VALIDATED','DETERMINISTIC_POLICY','DELEGATE_TO_AIDOS','POLICY_MATCH',ARRAY['evidence://classification'],'NORMAL','rule://deterministic','1',$3,$4,'SYSTEM',$5,CURRENT_TIMESTAMP,'sha256:'||repeat('d',64),'classification-key','corr',$6)`,
    [
      classification,
      request,
      policy.id,
      policy.policy_version,
      actor,
      "85000000-0000-4000-8000-000000000007",
    ],
  );
  const routes = composeClassificationRoutes(db, options);
  assert.equal(routes.length, 2);
  const bootstrapDisabledRoutes = composeStagingClassificationRoutes(db, {
    enabled: true,
    environment: "staging",
    scope: "project-maos",
    requestContext: context,
  });
  assert.equal(bootstrapDisabledRoutes.length, 2);
  const current = (await routes[0]!.handle({
    context: {} as never,
    identity: null,
    input: null,
    params: { requestId: request },
    request: {} as never,
  })) as { classification: { routingDisposition: string } };
  assert.equal(current.classification.routingDisposition, "DELEGATE_TO_AIDOS");
  const restarted = composeClassificationRoutes(db, options);
  const history = (await restarted[1]!.handle({
    context: {} as never,
    identity: null,
    input: null,
    params: { requestId: request },
    request: {} as never,
  })) as { classifications: unknown[] };
  assert.equal(history.classifications.length, 1);
});
