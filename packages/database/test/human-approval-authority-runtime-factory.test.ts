import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  applyMigrations,
  createGovernedHumanApprovalAuthorityReadPort,
  loadMigrations,
  openPostgresDatabase,
  RoutingContractError,
} from "../src/index.js";
import { withDisposablePostgres } from "../../../scripts/testing/disposable-postgres.js";

const id = (suffix: string) =>
  `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const hash = (value: string) => `sha256:${value.repeat(64)}`;

test(
  "canonical Human Approval factory resolves exact approval lineage and reflects revocation",
  { timeout: 120_000 },
  async () => {
    await withDisposablePostgres({}, async ({ migrationUrl }) => {
      const database = await openPostgresDatabase(migrationUrl);
      try {
        await applyMigrations(
          database,
          await loadMigrations(resolve("packages/database/migrations")),
        );
        await database.exec(`
          INSERT INTO core.organizations(id,name,slug)
            VALUES('${id("2")}','Approval Org','approval-org');
          INSERT INTO core.departments(id,organization_id,name)
            VALUES('${id("12")}','${id("2")}','Approval Team');
          INSERT INTO core.projects(id,organization_id,department_id,name)
            VALUES('${id("8")}','${id("2")}','${id("12")}','Approval Project');
          INSERT INTO identity.humans(id,organization_id,display_name)
            VALUES('${id("1")}','${id("2")}','Approver');
          INSERT INTO work.command_envelopes(
            id,project_id,human_actor_id,source_message_ref,source_message_hash,
            company_scope_ref,project_scope_ref,environment,normalized_intent,
            requested_outcome,command_classification,risk_class,policy_ref,
            policy_version,lifecycle_state,request_fingerprint,idempotency_key,
            correlation_id
          ) VALUES(
            '${id("9")}','${id("8")}','${id("1")}','message:approval','${hash("e")}',
            'company','project','STAGING','approve route','approved route',
            'GOVERNED_WRITE_ACTION','R2','command-policy','1','WAITING_APPROVAL',
            '${hash("f")}','command-approval','correlation'
          );
          INSERT INTO governance.governed_artifact_refs(
            id,project_id,command_envelope_id,artifact_kind,artifact_ref,
            artifact_version,artifact_hash,scope_ref,risk_class,environment,
            policy_ref,policy_version,idempotency_key,input_fingerprint,correlation_id
          ) VALUES
            ('${id("10")}','${id("8")}','${id("9")}','PLAN','plan:1','1',
             '${hash("1")}','project','R2','STAGING','artifact-policy','1',
             'artifact-plan','${hash("2")}','correlation'),
            ('${id("5")}','${id("8")}','${id("9")}','REVIEW','review:1','7',
             '${hash("a")}','project','R2','STAGING','artifact-policy','1',
             'artifact-review','${hash("3")}','correlation');
          INSERT INTO governance.authority_rules(
            id,actor_type,actor_id,action,effect,environment,resource,risk,scope,
            valid_from,valid_until
          ) VALUES(
            '${id("3")}','HUMAN','${id("1")}','ROUTE','ALLOW','STAGING',
            'REVIEW_ARTIFACT','R2','project',CURRENT_TIMESTAMP - interval '1 hour',
            CURRENT_TIMESTAMP + interval '1 day'
          );
          INSERT INTO governance.approvals(
            id,target_type,target_id,target_version,target_hash,status,validity,
            requested_by_actor_type,requested_by_actor_id,approved_by_actor_type,
            approved_by_actor_id,expires_at
          ) VALUES(
            '${id("4")}','REVIEW_ARTIFACT','${id("5")}','7','${hash("a")}',
            'APPROVED','VALID','SYSTEM','${id("6")}','HUMAN','${id("1")}',
            CURRENT_TIMESTAMP + interval '1 day'
          );
          INSERT INTO governance.human_approval_requests(
            id,approval_id,project_id,command_envelope_id,plan_artifact_id,
            review_artifact_id,authority_owner_actor_id,requested_operation,
            target_type,target_id,target_version,target_hash,company_scope_ref,
            project_scope_ref,risk_class,environment,evidence_refs,
            evidence_manifest_hash,approval_policy_ref,approval_policy_version,
            fresh_until,expires_at,idempotency_key,request_fingerprint,
            correlation_id,causation_refs
          ) VALUES(
            '${id("7")}','${id("4")}','${id("8")}','${id("9")}',
            '${id("10")}','${id("5")}','${id("1")}','ROUTE',
            'REVIEW_ARTIFACT','${id("5")}','7','${hash("a")}',
            'company','project','R2','STAGING',ARRAY['evidence:1'],'${hash("b")}',
            'approval-policy','1',CURRENT_TIMESTAMP + interval '1 hour',
            CURRENT_TIMESTAMP + interval '1 day','approval-request-1','${hash("c")}',
            'correlation',ARRAY['cause:1']
          );
          INSERT INTO governance.human_approval_decisions(
            id,project_id,request_id,approval_id,actor_type,actor_id,authority_ref,
            decision_type,resulting_status,resulting_validity,reason_code,
            evidence_refs,idempotency_key,decision_fingerprint,correlation_id,
            causation_refs,decided_at
          ) VALUES(
            '${id("11")}','${id("8")}','${id("7")}','${id("4")}',
            'HUMAN','${id("1")}','${id("3")}','APPROVED','APPROVED','VALID',
            'APPROVED',ARRAY['evidence:1'],'approval-decision-1','${hash("d")}',
            'correlation',ARRAY['cause:1'],CURRENT_TIMESTAMP
          );
        `);

        const port = createGovernedHumanApprovalAuthorityReadPort(database);
        assert.equal(
          port.constructor.name,
          "GovernedHumanApprovalAuthorityAdapter",
        );
        assert.equal("decide" in port, false);
        assert.equal("createRequest" in port, false);
        const first = await port.revalidate(id("4"), "7", hash("a"));
        const second = await port.revalidate(id("4"), "7", hash("a"));
        assert.deepEqual(first, second);
        assert.equal(first.approvalRef, id("4"));
        assert.equal(first.approvalRequestRef, id("7"));
        assert.equal(first.approvalDecisionRef, id("11"));
        assert.equal(first.authorityRuleRef, id("3"));
        assert.equal(first.targetType, "REVIEW_ARTIFACT");
        assert.equal(first.targetId, id("5"));
        assert.equal(first.targetVersion, "7");
        assert.equal(first.targetHash, hash("a"));
        assert.equal(first.companyScopeRef, "company");
        assert.equal(first.projectScopeRef, "project");
        assert.equal(first.environment, "STAGING");

        await assert.rejects(
          port.revalidate(id("404"), "7", hash("a")),
          (error) =>
            error instanceof RoutingContractError &&
            error.code === "HUMAN_APPROVAL_INVALID",
        );

        const expected = {
          targetType: "REVIEW_ARTIFACT",
          targetId: id("5"),
          targetVersion: "7",
          targetHash: hash("a"),
          companyScopeRef: "company",
          projectScopeRef: "project",
          riskClass: "R2",
          environment: "STAGING",
          requestedOperation: "ROUTE",
          evidenceManifestHash: hash("b"),
          approvalPolicyRef: "approval-policy",
          approvalPolicyVersion: "1",
        } as const;
        for (const mismatch of [
          { targetType: "WRONG" },
          { targetId: id("99") },
          { targetVersion: "8" },
          { targetHash: hash("f") },
          { companyScopeRef: "wrong-company" },
          { projectScopeRef: "wrong-project" },
          { environment: "PREVIEW" as const },
        ])
          await assert.rejects(
            port.resolveRequirement({
              approvalRequestId: id("7"),
              expected: { ...expected, ...mismatch },
            }),
            (error) =>
              error instanceof RoutingContractError &&
              error.code === "HUMAN_APPROVAL_INVALID",
          );

        for (const [version, targetHash] of [
          ["8", hash("a")],
          ["7", hash("f")],
        ] as const)
          await assert.rejects(
            port.revalidate(id("4"), version, targetHash),
            (error) =>
              error instanceof RoutingContractError &&
              error.code === "HUMAN_APPROVAL_INVALID",
          );

        await database.exec(
          `UPDATE governance.authority_rules SET revoked_at=CURRENT_TIMESTAMP WHERE id='${id("3")}'`,
        );
        await assert.rejects(
          port.revalidate(id("4"), "7", hash("a")),
          (error) =>
            error instanceof RoutingContractError &&
            error.code === "HUMAN_APPROVAL_INVALID",
        );
        await database.exec(
          `UPDATE governance.authority_rules SET revoked_at=NULL WHERE id='${id("3")}'`,
        );

        for (const [status, validity, code] of [
          ["REJECTED", "POLICY_INVALID", "HUMAN_APPROVAL_INVALID"],
          ["EXPIRED", "STALE", "HUMAN_APPROVAL_STALE"],
          ["APPROVED", "STALE", "HUMAN_APPROVAL_STALE"],
        ] as const) {
          await database.exec(`
            UPDATE governance.approvals
            SET status='${status}',validity='${validity}',version=version+1,
                updated_at=CURRENT_TIMESTAMP
            WHERE id='${id("4")}'
          `);
          await assert.rejects(
            port.revalidate(id("4"), "7", hash("a")),
            (error) =>
              error instanceof RoutingContractError && error.code === code,
          );
        }

        await database.exec(`
          UPDATE governance.approvals
          SET status='APPROVED',validity='VALID',version=version+1,
              updated_at=CURRENT_TIMESTAMP
          WHERE id='${id("4")}'
        `);

        await database.exec(`
          UPDATE governance.approvals
          SET status='REVOKED',validity='POLICY_INVALID',version=version+1,
              updated_at=CURRENT_TIMESTAMP
          WHERE id='${id("4")}'
        `);
        await assert.rejects(
          port.revalidate(id("4"), "7", hash("a")),
          (error) =>
            error instanceof RoutingContractError &&
            error.code === "HUMAN_APPROVAL_REVOKED",
        );

        await database.exec(`
          UPDATE governance.approvals
          SET status='APPROVED',validity='VALID',version=version+1,
              updated_at=CURRENT_TIMESTAMP
          WHERE id='${id("4")}';
          INSERT INTO governance.human_approval_decisions(
            id,project_id,request_id,approval_id,actor_type,actor_id,authority_ref,
            decision_type,resulting_status,resulting_validity,reason_code,
            evidence_refs,idempotency_key,decision_fingerprint,correlation_id,
            causation_refs,decided_at
          ) VALUES(
            '${id("13")}','${id("8")}','${id("7")}','${id("4")}',
            'HUMAN','${id("1")}','${id("3")}','APPROVED','APPROVED','VALID',
            'APPROVED',ARRAY['evidence:2'],'approval-decision-2','${hash("9")}',
            'correlation',ARRAY['cause:2'],CURRENT_TIMESTAMP + interval '1 second'
          )
        `);
        await assert.rejects(
          port.revalidate(id("4"), "7", hash("a")),
          (error) =>
            error instanceof RoutingContractError &&
            error.code === "HUMAN_APPROVAL_INVALID",
        );
      } finally {
        await database.close();
      }
    });
  },
);

test("factory fails closed for missing or ambiguous approval references", async () => {
  const missing = createGovernedHumanApprovalAuthorityReadPort({
    query: async () => ({ rows: [] }),
    exec: async () => undefined,
  } as never);
  await assert.rejects(
    missing.revalidate(id("4"), "7", hash("a")),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "HUMAN_APPROVAL_INVALID",
  );

  const ambiguous = createGovernedHumanApprovalAuthorityReadPort({
    query: async () => ({ rows: [{ id: id("7") }, { id: id("8") }] }),
    exec: async () => undefined,
  } as never);
  await assert.rejects(
    ambiguous.revalidate(id("4"), "7", hash("a")),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "HUMAN_APPROVAL_INVALID",
  );
});
