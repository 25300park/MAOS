import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  applyMigrations,
  applyRegistryFreshnessPolicyAcl,
  buildRegistryFreshnessPolicyAclStatements,
  loadMigrations,
  openPostgresDatabase,
  verifyRegistryFreshnessPolicyAcl,
} from "../src/index.js";
import { withDisposablePostgres } from "../../../scripts/testing/disposable-postgres.js";

const migrationDirectory = resolve("packages/database/migrations");

test("Registry freshness ACL is fixed to runtime read and steward append/read authority", () => {
  const statements = buildRegistryFreshnessPolicyAclStatements({
    runtimeRole: '"runtime_role"',
    stewardRole: '"steward_role"',
  });

  assert.deepEqual(statements, [
    "REVOKE ALL ON governance.registry_freshness_policy_versions FROM PUBLIC",
    "REVOKE ALL ON governance.registry_freshness_policy_activation_events FROM PUBLIC",
    'GRANT USAGE ON SCHEMA governance TO "runtime_role"',
    'GRANT SELECT ON governance.registry_freshness_policy_versions TO "runtime_role"',
    'GRANT SELECT ON governance.registry_freshness_policy_activation_events TO "runtime_role"',
    'GRANT USAGE ON SCHEMA governance TO "steward_role"',
    'GRANT SELECT, INSERT ON governance.registry_freshness_policy_versions TO "steward_role"',
    'GRANT SELECT, INSERT ON governance.registry_freshness_policy_activation_events TO "steward_role"',
  ]);

  const rendered = statements.join("\n");
  assert.doesNotMatch(
    rendered,
    /\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b|\bREFERENCES\b|\bTRIGGER\b|GRANT OPTION/u,
  );
  assert.doesNotMatch(rendered, /request_routing_decision/u);
});

test("Registry freshness ACL fails closed for noncanonical environments and role mappings", async () => {
  const untouchedDatabase = {
    exec: async () => {
      throw new Error("DATABASE_TOUCHED");
    },
    query: async () => {
      throw new Error("DATABASE_TOUCHED");
    },
  };
  const canonical = {
    aclAdminRole: "acl_admin",
    canonicalRoleContract: {
      environment: "staging",
      migrationRole: "migration_owner",
      runtimeRole: "application_runtime",
      stewardRole: "registry_freshness_steward",
    },
    environment: "staging",
    migrationRole: "migration_owner",
    runtimeRole: "application_runtime",
    stewardRole: "registry_freshness_steward",
  } as const;

  await assert.rejects(
    applyRegistryFreshnessPolicyAcl(untouchedDatabase, {
      ...canonical,
      environment: "PRODUCTION",
    }),
    /REGISTRY_FRESHNESS_ACL_ENVIRONMENT_INVALID/u,
  );
  await assert.rejects(
    applyRegistryFreshnessPolicyAcl(untouchedDatabase, {
      ...canonical,
      environment: "unknown",
    }),
    /REGISTRY_FRESHNESS_ACL_ENVIRONMENT_INVALID/u,
  );
  await assert.rejects(
    applyRegistryFreshnessPolicyAcl(untouchedDatabase, {
      ...canonical,
      runtimeRole: "invalid-role-name",
    }),
    /REGISTRY_FRESHNESS_ACL_ROLE_INVALID/u,
  );
  await assert.rejects(
    applyRegistryFreshnessPolicyAcl(untouchedDatabase, {
      ...canonical,
      stewardRole: canonical.runtimeRole,
    }),
    /REGISTRY_FRESHNESS_ACL_ROLE_MAPPING_AMBIGUOUS/u,
  );
  await assert.rejects(
    applyRegistryFreshnessPolicyAcl(untouchedDatabase, {
      ...canonical,
      runtimeRole: "existing_but_noncanonical_runtime",
    }),
    /REGISTRY_FRESHNESS_ACL_ROLE_CONTRACT_MISMATCH/u,
  );
  await assert.rejects(
    applyRegistryFreshnessPolicyAcl(untouchedDatabase, {
      ...canonical,
      canonicalRoleContract: {
        ...canonical.canonicalRoleContract,
        environment: "production",
      },
      environment: "production",
    }),
    /PRODUCTION_ACL_FORBIDDEN/u,
  );
});

test(
  "real PostgreSQL enforces migration ownership, runtime read-only, steward append-only, and PUBLIC none",
  { timeout: 120_000 },
  async () => {
    await withDisposablePostgres({}, async (context) => {
      const migration = await openPostgresDatabase(context.migrationUrl);
      const admin = await openPostgresDatabase(
        `postgresql://postgres@127.0.0.1:${context.port}/${context.databaseName}`,
      );
      const stewardRole = "registry_freshness_steward";
      const input = {
        aclAdminRole: "postgres",
        bootstrapMode: "PROVIDER_BOOTSTRAP_ADMIN" as const,
        canonicalRoleContract: {
          environment: "staging",
          migrationRole: context.migrationRole,
          runtimeRole: context.runtimeRole,
          stewardRole,
        },
        environment: "staging",
        migrationRole: context.migrationRole,
        runtimeRole: context.runtimeRole,
        stewardRole,
      };
      try {
        const migrations = await loadMigrations(migrationDirectory);
        const applied = await applyMigrations(migration, migrations);
        assert.equal(
          applied.applied.at(-1),
          "0033_phase15b_registry_freshness_policy",
        );
        assert.equal(applied.applied.length, 33);
        assert.deepEqual(await applyMigrations(migration, migrations), {
          applied: [],
          skipped: migrations.map(({ id }) => id),
        });

        await admin.exec(`
          REASSIGN OWNED BY ${context.migrationRole} TO postgres;
          ALTER TABLE ai.domain_execution_constraints OWNER TO ${context.migrationRole};
          ALTER TABLE governance.registry_freshness_policy_versions OWNER TO ${context.migrationRole};
          ALTER TABLE governance.registry_freshness_policy_activation_events OWNER TO ${context.migrationRole};
          ALTER FUNCTION governance.registry_freshness_applicability_fingerprint(text,text)
            OWNER TO ${context.migrationRole};
          ALTER FUNCTION governance.reject_registry_freshness_policy_mutation()
            OWNER TO ${context.migrationRole};
          ALTER FUNCTION governance.guard_registry_freshness_policy_append()
            OWNER TO ${context.migrationRole};
          ALTER FUNCTION governance.guard_registry_freshness_policy_activation_append()
            OWNER TO ${context.migrationRole};
          GRANT USAGE, CREATE ON SCHEMA work, governance, ai TO ${context.migrationRole};
          GRANT USAGE ON SCHEMA core, audit TO ${context.migrationRole};
          GRANT SELECT, INSERT ON core.schema_migrations TO ${context.migrationRole};
          GRANT REFERENCES ON
            core.organizations,
            core.projects,
            work.tasks,
            audit.audit_records,
            work.requests,
            governance.request_classification_versions,
            governance.approvals,
            ai.model_providers,
            ai.models,
            ai.host_runtimes,
            ai.model_host_bindings
            TO ${context.migrationRole};
          CREATE ROLE ${stewardRole}
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
          CREATE ROLE registry_freshness_grant_probe
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
          CREATE ROLE registry_freshness_noncanonical_runtime
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
        `);
        const owners = await admin.query<{ owner: string }>(`
          SELECT DISTINCT owner.rolname AS owner
          FROM pg_class relation
          JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
          JOIN pg_roles owner ON owner.oid=relation.relowner
          WHERE (namespace.nspname,relation.relname) IN (
            ('governance','registry_freshness_policy_versions'),
            ('governance','registry_freshness_policy_activation_events')
          )
        `);
        assert.deepEqual(owners.rows, [{ owner: context.migrationRole }]);

        await assert.rejects(
          verifyRegistryFreshnessPolicyAcl(admin, {
            ...input,
            canonicalRoleContract: {
              ...input.canonicalRoleContract,
              runtimeRole: "registry_freshness_missing_role",
            },
            runtimeRole: "registry_freshness_missing_role",
          }),
          /REGISTRY_FRESHNESS_ACL_ROLE_NOT_FOUND/u,
        );
        await assert.rejects(
          verifyRegistryFreshnessPolicyAcl(admin, {
            ...input,
            runtimeRole: "registry_freshness_noncanonical_runtime",
          }),
          /REGISTRY_FRESHNESS_ACL_ROLE_CONTRACT_MISMATCH/u,
        );

        const first = await applyRegistryFreshnessPolicyAcl(admin, input);
        assert.deepEqual(first, { statementCount: 8, status: "APPLIED" });
        assert.deepEqual(await applyRegistryFreshnessPolicyAcl(admin, input), {
          statementCount: 8,
          status: "REUSED",
        });
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).status,
          "PASS",
        );

        await admin.exec(`
          CREATE FUNCTION governance.registry_freshness_applicability_fingerprint(integer)
          RETURNS text LANGUAGE sql IMMUTABLE AS 'SELECT $1::text';
          ALTER FUNCTION governance.registry_freshness_applicability_fingerprint(integer)
            OWNER TO ${context.migrationRole};
        `);
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).checks
            .migration_ownership_exact,
          false,
        );
        await admin.exec(
          "DROP FUNCTION governance.registry_freshness_applicability_fingerprint(integer)",
        );

        for (const [indexName, tableName, columns] of [
          [
            "registry_freshness_policy_versions_unapproved_idx",
            "governance.registry_freshness_policy_versions",
            "reason_code",
          ],
          [
            "registry_freshness_policy_versions_head_idx_wrong_parent",
            "governance.registry_freshness_policy_activation_events",
            "selection_sequence",
          ],
          [
            "registry_freshness_policy_activation_events_extra_idx",
            "governance.registry_freshness_policy_activation_events",
            "event_type",
          ],
        ] as const) {
          await admin.exec(
            `CREATE INDEX ${indexName} ON ${tableName} (${columns})`,
          );
          assert.equal(
            (await verifyRegistryFreshnessPolicyAcl(admin, input)).checks
              .migration_ownership_exact,
            false,
          );
          await admin.exec(`DROP INDEX governance.${indexName}`);
        }

        await admin.exec(`
          CREATE TYPE governance.registry_freshness_applicability_fingerprint
            AS (value integer);
          ALTER TYPE governance.registry_freshness_applicability_fingerprint
            OWNER TO ${context.migrationRole};
        `);
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).checks
            .migration_ownership_exact,
          false,
        );
        await admin.exec(
          "DROP TYPE governance.registry_freshness_applicability_fingerprint",
        );

        await admin.exec(
          `ALTER TABLE governance.registry_freshness_policy_versions OWNER TO ${context.runtimeRole}`,
        );
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).checks
            .runtime_steward_ownership_absent,
          false,
        );
        await admin.exec(
          `ALTER TABLE governance.registry_freshness_policy_versions OWNER TO ${context.migrationRole}`,
        );

        await admin.exec(`
          CREATE ROLE registry_freshness_owner_role
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
          CREATE ROLE registry_freshness_owner_bridge
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
          ALTER TABLE work.tasks OWNER TO registry_freshness_owner_role;
          GRANT registry_freshness_owner_role TO ${context.runtimeRole};
        `);
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).checks
            .runtime_steward_ownership_absent,
          false,
        );
        await admin.exec(`
          REVOKE registry_freshness_owner_role FROM ${context.runtimeRole};
          GRANT registry_freshness_owner_role TO registry_freshness_owner_bridge;
          GRANT registry_freshness_owner_bridge TO ${context.runtimeRole};
        `);
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).checks
            .runtime_steward_ownership_absent,
          false,
        );
        await admin.exec(`
          REVOKE registry_freshness_owner_bridge FROM ${context.runtimeRole};
          GRANT registry_freshness_owner_role TO ${stewardRole};
        `);
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).checks
            .runtime_steward_ownership_absent,
          false,
        );
        await admin.exec(`
          REVOKE registry_freshness_owner_role FROM ${stewardRole};
          GRANT registry_freshness_owner_bridge TO ${stewardRole};
        `);
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).checks
            .runtime_steward_ownership_absent,
          false,
        );
        await admin.exec(`
          REVOKE registry_freshness_owner_bridge FROM ${stewardRole};
          REVOKE registry_freshness_owner_role FROM registry_freshness_owner_bridge;
          ALTER TABLE work.tasks OWNER TO postgres;
          DROP ROLE registry_freshness_owner_bridge;
          DROP ROLE registry_freshness_owner_role;
        `);

        const ownershipDriftObjects = [
          { name: "governance.approvals", restoreReferences: true },
          {
            name: "governance.request_routing_decision_versions",
            restoreReferences: false,
          },
          { name: "ai.model_providers", restoreReferences: true },
          { name: "work.tasks", restoreReferences: true },
          { name: "core.organizations", restoreReferences: true },
        ] as const;
        for (const object of ownershipDriftObjects) {
          await admin.exec(
            `ALTER TABLE ${object.name} OWNER TO ${context.migrationRole}`,
          );
          assert.equal(
            (await verifyRegistryFreshnessPolicyAcl(admin, input)).checks
              .migration_ownership_exact,
            false,
          );
          await admin.exec(`ALTER TABLE ${object.name} OWNER TO postgres`);
          if (object.restoreReferences) {
            await admin.exec(
              `GRANT REFERENCES ON ${object.name} TO ${context.migrationRole}`,
            );
          }
        }

        for (const privilege of [
          "SELECT",
          "INSERT",
          "UPDATE",
          "DELETE",
          "TRUNCATE",
          "REFERENCES",
          "TRIGGER",
        ]) {
          await admin.exec(
            `GRANT ${privilege} ON governance.request_routing_decision_versions TO ${context.migrationRole}`,
          );
          assert.equal(
            (await verifyRegistryFreshnessPolicyAcl(admin, input)).checks
              .migration_table_authority_exact,
            false,
          );
          await admin.exec(
            `REVOKE ${privilege} ON governance.request_routing_decision_versions FROM ${context.migrationRole}`,
          );
        }
        await admin.exec(`
          CREATE SCHEMA registry_freshness_unrelated_schema AUTHORIZATION postgres;
          GRANT CREATE ON SCHEMA registry_freshness_unrelated_schema TO ${context.migrationRole};
        `);
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).checks
            .migration_schema_authority_exact,
          false,
        );
        await admin.exec("DROP SCHEMA registry_freshness_unrelated_schema");

        await admin.exec(`
          CREATE ROLE registry_freshness_migration_parent
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
          GRANT registry_freshness_migration_parent TO ${context.migrationRole};
        `);
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).checks
            .migration_privileged_membership_absent,
          false,
        );
        await admin.exec(`
          REVOKE registry_freshness_migration_parent FROM ${context.migrationRole};
          DROP ROLE registry_freshness_migration_parent;
        `);

        for (const [enableAttribute, disableAttribute] of [
          ["SUPERUSER", "NOSUPERUSER"],
          ["CREATEDB", "NOCREATEDB"],
          ["CREATEROLE", "NOCREATEROLE"],
          ["REPLICATION", "NOREPLICATION"],
          ["BYPASSRLS", "NOBYPASSRLS"],
        ] as const) {
          await admin.exec(
            `ALTER ROLE ${context.migrationRole} ${enableAttribute}`,
          );
          assert.equal(
            (await verifyRegistryFreshnessPolicyAcl(admin, input)).checks
              .migration_attributes_safe,
            false,
          );
          await admin.exec(
            `ALTER ROLE ${context.migrationRole} ${disableAttribute}`,
          );
        }

        await admin.exec(
          `GRANT SELECT ON governance.registry_freshness_policy_versions TO ${context.runtimeRole} WITH GRANT OPTION`,
        );
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).status,
          "FAILED",
        );
        await admin.exec(
          `REVOKE GRANT OPTION FOR SELECT ON governance.registry_freshness_policy_versions FROM ${context.runtimeRole}`,
        );

        await admin.exec(
          `GRANT SELECT ON governance.approvals TO ${stewardRole} WITH GRANT OPTION`,
        );
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).status,
          "FAILED",
        );
        await admin.exec(
          `REVOKE SELECT ON governance.approvals FROM ${stewardRole}`,
        );

        await admin.exec(
          `GRANT INSERT ON governance.approvals TO ${context.runtimeRole}`,
        );
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).status,
          "FAILED",
        );
        await admin.exec(
          `REVOKE INSERT ON governance.approvals FROM ${context.runtimeRole}`,
        );

        const approvalsOwner = await admin.query<{ owner: string }>(`
          SELECT owner.rolname AS owner
          FROM pg_class relation
          JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
          JOIN pg_roles owner ON owner.oid=relation.relowner
          WHERE namespace.nspname='governance' AND relation.relname='approvals'
        `);
        await admin.exec(
          `ALTER TABLE governance.approvals OWNER TO ${context.runtimeRole}`,
        );
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).status,
          "FAILED",
        );
        await admin.exec(
          `ALTER TABLE governance.approvals OWNER TO ${approvalsOwner.rows[0]!.owner}`,
        );

        await admin.exec(`
          CREATE TABLE public.registry_freshness_unrelated_probe (id integer);
          GRANT SELECT ON public.registry_freshness_unrelated_probe
            TO ${context.migrationRole} WITH GRANT OPTION;
        `);
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).status,
          "FAILED",
        );
        await admin.exec(
          "DROP TABLE public.registry_freshness_unrelated_probe",
        );
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).status,
          "PASS",
        );

        await admin.exec(
          "GRANT TRUNCATE ON governance.registry_freshness_policy_versions TO PUBLIC",
        );
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).status,
          "FAILED",
        );
        await admin.exec(`
          REVOKE TRUNCATE ON governance.registry_freshness_policy_versions FROM PUBLIC;
          CREATE ROLE registry_freshness_forbidden_parent
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
          GRANT INSERT ON governance.request_routing_decision_versions
            TO registry_freshness_forbidden_parent;
          GRANT registry_freshness_forbidden_parent TO ${stewardRole};
        `);
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).status,
          "FAILED",
        );
        await admin.exec(`
          REVOKE registry_freshness_forbidden_parent FROM ${stewardRole};
          REVOKE INSERT ON governance.request_routing_decision_versions
            FROM registry_freshness_forbidden_parent;
          DROP ROLE registry_freshness_forbidden_parent;
        `);
        assert.equal(
          (await verifyRegistryFreshnessPolicyAcl(admin, input)).status,
          "PASS",
        );

        await admin.exec(`
          INSERT INTO audit.audit_records (
            id,actor_type,actor_id,action,target_type,target_id,result,
            request_id,correlation_id,trace_id,span_id,record_hash
          ) VALUES (
            '20000000-0000-4000-8000-000000000001','SYSTEM',
            '20000000-0000-4000-8000-000000000002','REGISTRY_FRESHNESS_POLICY.TEST',
            'REGISTRY_FRESHNESS_POLICY','20000000-0000-4000-8000-000000000003',
            'SUCCEEDED','rfa01','rfa01','rfa01-trace','rfa01-span',repeat('a',64)
          );
          SET ROLE ${context.runtimeRole};
          SELECT count(*) FROM governance.registry_freshness_policy_versions;
        `);
        await assert.rejects(
          admin.exec(`
          INSERT INTO governance.registry_freshness_policy_versions (
            registry_freshness_policy_version_id,registry_freshness_policy_id,
            policy_version,authority_identifier,registry_scope,environment,
            max_age_ms,lifecycle_intent,effective_at,content_fingerprint,
            idempotency_key,created_by_actor_type,created_by_actor_id,reason_code,audit_ref
          ) VALUES (
            '20000000-0000-4000-8000-000000000004',
            '20000000-0000-4000-8000-000000000003',1,
            'MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD',
            'PHASE15B_AI_REGISTRY','STAGING',60000,'ACTIVE',CURRENT_TIMESTAMP,
            'sha256:' || repeat('b',64),'runtime-denied','SYSTEM',
            '20000000-0000-4000-8000-000000000002','TEST',
            '20000000-0000-4000-8000-000000000001'
          )
        `),
        );
        await assert.rejects(
          admin.exec("TRUNCATE governance.registry_freshness_policy_versions"),
        );
        await admin.exec(
          "GRANT SELECT ON governance.registry_freshness_policy_versions TO registry_freshness_grant_probe",
        );
        await assert.rejects(
          admin.exec(
            "ALTER TABLE governance.registry_freshness_policy_versions ADD COLUMN forbidden text",
          ),
        );
        await admin.exec("RESET ROLE");
        assert.equal(
          (
            await admin.query<{ allowed: boolean }>(
              "SELECT has_table_privilege('registry_freshness_grant_probe','governance.registry_freshness_policy_versions','SELECT') AS allowed",
            )
          ).rows[0]?.allowed,
          false,
        );
        await admin.exec(`SET ROLE ${stewardRole};`);
        await admin.exec(`
          INSERT INTO governance.registry_freshness_policy_versions (
            registry_freshness_policy_version_id,registry_freshness_policy_id,
            policy_version,authority_identifier,registry_scope,environment,
            max_age_ms,lifecycle_intent,effective_at,content_fingerprint,
            idempotency_key,created_by_actor_type,created_by_actor_id,reason_code,audit_ref
          ) VALUES (
            '20000000-0000-4000-8000-000000000004',
            '20000000-0000-4000-8000-000000000003',1,
            'MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD',
            'PHASE15B_AI_REGISTRY','STAGING',60000,'ACTIVE',CURRENT_TIMESTAMP,
            'sha256:' || repeat('b',64),'steward-append','SYSTEM',
            '20000000-0000-4000-8000-000000000002','TEST',
            '20000000-0000-4000-8000-000000000001'
          )
        `);
        await assert.rejects(
          admin.exec(`
          UPDATE governance.registry_freshness_policy_versions
          SET reason_code='DENIED'
          WHERE registry_freshness_policy_version_id='20000000-0000-4000-8000-000000000004'
        `),
        );
        await assert.rejects(
          admin.exec(
            "DELETE FROM governance.request_routing_decision_versions WHERE false",
          ),
        );
        await assert.rejects(
          admin.exec("DELETE FROM governance.approvals WHERE false"),
        );
        await assert.rejects(
          admin.exec(
            "ALTER TABLE governance.registry_freshness_policy_versions ADD COLUMN forbidden text",
          ),
        );
        await admin.exec(
          "GRANT SELECT ON governance.registry_freshness_policy_versions TO registry_freshness_grant_probe",
        );
        await admin.exec("RESET ROLE");
        assert.equal(
          (
            await admin.query<{ allowed: boolean }>(
              "SELECT has_table_privilege('registry_freshness_grant_probe','governance.registry_freshness_policy_versions','SELECT') AS allowed",
            )
          ).rows[0]?.allowed,
          false,
        );
        await admin.exec(`SET ROLE ${stewardRole}`);
        await assert.rejects(
          admin.exec(`
          DELETE FROM governance.registry_freshness_policy_versions
          WHERE registry_freshness_policy_version_id='20000000-0000-4000-8000-000000000004'
        `),
        );
      } finally {
        await admin.exec("RESET ROLE").catch(() => undefined);
        await admin.close();
        await migration.close();
      }
    });
  },
);
