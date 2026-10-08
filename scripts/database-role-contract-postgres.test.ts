import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  applyMigrations,
  applyPhase15cRuntimeAcl,
  inspectPhase15cAclAdminAuthority,
  inspectDatabaseRoleContract,
  loadMigrations,
  openPostgresDatabase,
  verifyPhase15cRuntimeAcl,
} from "@maos/database";
import { withDisposablePostgres } from "./testing/disposable-postgres.js";

const migrationDirectory = resolve("packages/database/migrations");
const governedMigrationRole = "phase15c_governed_migration";
const aclAdminRole = "phase15c_acl_admin";
const approvedAclOwnerRoles = ["phase15c_legacy_owner", governedMigrationRole];

const expectedRequirements = Object.freeze({
  NO_OPERATION: 5,
  OWNER_REQUIRED: 1,
  REFERENCES_REQUIRED: 11,
  SCHEMA_PRIVILEGE_REQUIRED: 5,
  TABLE_PRIVILEGE_REQUIRED: 1,
});

test(
  "real PostgreSQL governed registry verification fails closed without bootstrap DDL",
  { timeout: 120_000 },
  async () => {
    await withDisposablePostgres({}, async (context) => {
      const database = await openPostgresDatabase(
        `postgresql://postgres@127.0.0.1:${context.port}/${context.databaseName}`,
      );
      try {
        await assert.rejects(
          applyMigrations(database, [], { registryMode: "VERIFY_EXISTING" }),
          /MIGRATION_REGISTRY_SCHEMA_MISSING/u,
        );
        await database.exec("CREATE SCHEMA core");
        await assert.rejects(
          applyMigrations(database, [], { registryMode: "VERIFY_EXISTING" }),
          /MIGRATION_REGISTRY_TABLE_MISSING/u,
        );
        await database.exec(`
          CREATE TABLE core.schema_migrations (
            id text PRIMARY KEY,
            checksum text NOT NULL,
            applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await assert.rejects(
          applyMigrations(database, [], { registryMode: "VERIFY_EXISTING" }),
          /MIGRATION_REGISTRY_SHAPE_INVALID/u,
        );
      } finally {
        await database.close();
      }
    });
  },
);

test(
  "real PostgreSQL enforces the governed migration and runtime authority boundaries",
  { timeout: 120_000 },
  async () => {
    await withDisposablePostgres({}, async (context) => {
      const migrations = await loadMigrations(migrationDirectory);
      const initializer = await openPostgresDatabase(context.migrationUrl);
      const admin = await openPostgresDatabase(
        `postgresql://postgres@127.0.0.1:${context.port}/${context.databaseName}`,
      );
      try {
        const first = await applyMigrations(
          initializer,
          migrations.filter(({ id }) => id < "0032_"),
        );
        assert.equal(first.applied.length, 31);
        assert.equal(
          (
            await inspectDatabaseRoleContract(admin, {
              approvedOwnerRoles: [],
              migrationRole: "postgres",
              runtimeRole: context.runtimeRole,
            })
          ).status,
          "FAILED",
        );
        await initializer.exec(`
          INSERT INTO core.organizations(id,name,slug)
          VALUES ('00000000-0000-4000-8000-00000000d001','Phase15C ACL','phase15c-acl');
          INSERT INTO core.departments(id,organization_id,name)
          VALUES ('00000000-0000-4000-8000-00000000d002','00000000-0000-4000-8000-00000000d001','Governance');
          INSERT INTO core.projects(id,organization_id,department_id,name)
          VALUES ('00000000-0000-4000-8000-00000000d003','00000000-0000-4000-8000-00000000d001','00000000-0000-4000-8000-00000000d002','ACL');
        `);

        await admin.exec(`
          CREATE ROLE ${governedMigrationRole}
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
          CREATE ROLE phase15c_legacy_owner NOLOGIN;
          CREATE ROLE ${aclAdminRole}
            LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
          GRANT phase15c_legacy_owner, ${governedMigrationRole} TO ${aclAdminRole};
          ALTER SCHEMA work OWNER TO phase15c_legacy_owner;
          ALTER SCHEMA governance OWNER TO phase15c_legacy_owner;
          ALTER SCHEMA ai OWNER TO phase15c_legacy_owner;
          ALTER TABLE ai.domain_execution_constraints OWNER TO ${governedMigrationRole};
          ALTER TABLE ai.role_compatibilities OWNER TO phase15c_legacy_owner;
          ALTER TABLE core.schema_migrations OWNER TO phase15c_legacy_owner;
          ALTER TABLE core.organizations OWNER TO phase15c_legacy_owner;
          ALTER TABLE core.projects OWNER TO phase15c_legacy_owner;
          ALTER TABLE work.tasks OWNER TO phase15c_legacy_owner;
          ALTER FUNCTION ai.guard_development_domain_constraint() OWNER TO phase15c_legacy_owner;
          ALTER FUNCTION ai.guard_development_role_compatibility() OWNER TO phase15c_legacy_owner;
          GRANT USAGE ON SCHEMA core,work TO phase15c_legacy_owner;
          GRANT USAGE,CREATE ON SCHEMA work,governance,ai TO ${governedMigrationRole};
          GRANT USAGE ON SCHEMA core,audit TO ${governedMigrationRole};
          GRANT SELECT,INSERT ON core.schema_migrations TO ${governedMigrationRole};
          GRANT REFERENCES ON core.organizations,core.projects,work.tasks TO ${governedMigrationRole};
          GRANT REFERENCES ON audit.audit_records,work.requests,governance.request_classification_versions,governance.approvals,ai.model_providers,ai.models,ai.host_runtimes,ai.model_host_bindings TO ${governedMigrationRole};
          SET ROLE ${governedMigrationRole};
        `);

        const attributes = await admin.query<{
          rolbypassrls: boolean;
          rolcreatedb: boolean;
          rolcreaterole: boolean;
          rolreplication: boolean;
          rolsuper: boolean;
        }>(`SELECT rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolsuper
              FROM pg_roles WHERE rolname=current_user`);
        assert.deepEqual(attributes.rows, [
          {
            rolbypassrls: false,
            rolcreatedb: false,
            rolcreaterole: false,
            rolreplication: false,
            rolsuper: false,
          },
        ]);
        const forbiddenAuthority = await admin.query<{
          ai_usage_grantable: boolean;
          audit_create: boolean;
          audit_usage_grantable: boolean;
          core_create: boolean;
          database_create: boolean;
          governance_usage_grantable: boolean;
          work_usage_grantable: boolean;
        }>(`SELECT
          has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
          has_schema_privilege(current_user,'audit','CREATE') AS audit_create,
          has_schema_privilege(current_user,'core','CREATE') AS core_create,
          EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='audit' AND grantee.rolname=current_user AND acl.privilege_type='USAGE' AND acl.is_grantable) AS audit_usage_grantable,
          EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='work' AND grantee.rolname=current_user AND acl.privilege_type='USAGE' AND acl.is_grantable) AS work_usage_grantable,
          EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='governance' AND grantee.rolname=current_user AND acl.privilege_type='USAGE' AND acl.is_grantable) AS governance_usage_grantable,
          EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='ai' AND grantee.rolname=current_user AND acl.privilege_type='USAGE' AND acl.is_grantable) AS ai_usage_grantable`);
        assert.deepEqual(forbiddenAuthority.rows, [
          {
            ai_usage_grantable: false,
            audit_create: false,
            audit_usage_grantable: false,
            core_create: false,
            database_create: false,
            governance_usage_grantable: false,
            work_usage_grantable: false,
          },
        ]);

        const inspect = () =>
          inspectDatabaseRoleContract(admin, {
            approvedOwnerRoles: [],
            migrationRole: governedMigrationRole,
            runtimeRole: context.runtimeRole,
          });
        const preflight = await inspect();
        assert.equal(preflight.status, "PASS");
        for (const [requirement, count] of Object.entries(expectedRequirements))
          assert.equal(
            preflight.rows.filter((row) => row.requirement === requirement)
              .length,
            count,
          );

        const requireFailure = async (
          revoke: string,
          restore: string,
          objectName: string,
        ) => {
          await admin.exec(
            `RESET ROLE; ${revoke}; SET ROLE ${governedMigrationRole}`,
          );
          const failed = await inspect();
          assert.equal(failed.status, "FAILED");
          assert.equal(
            failed.rows.find((row) => row.objectName === objectName)?.result,
            "FAIL",
          );
          await admin.exec(
            `RESET ROLE; ${restore}; SET ROLE ${governedMigrationRole}`,
          );
        };

        await requireFailure(
          `REVOKE CREATE ON SCHEMA work FROM ${governedMigrationRole}`,
          `GRANT CREATE ON SCHEMA work TO ${governedMigrationRole}`,
          "work",
        );
        await requireFailure(
          `REVOKE CREATE ON SCHEMA governance FROM ${governedMigrationRole}`,
          `GRANT CREATE ON SCHEMA governance TO ${governedMigrationRole}`,
          "governance",
        );
        await requireFailure(
          `REVOKE CREATE ON SCHEMA ai FROM ${governedMigrationRole}`,
          `GRANT CREATE ON SCHEMA ai TO ${governedMigrationRole}`,
          "ai",
        );
        await requireFailure(
          `REVOKE USAGE ON SCHEMA core FROM ${governedMigrationRole}`,
          `GRANT USAGE ON SCHEMA core TO ${governedMigrationRole}`,
          "core",
        );
        await requireFailure(
          `REVOKE USAGE ON SCHEMA audit FROM ${governedMigrationRole}`,
          `GRANT USAGE ON SCHEMA audit TO ${governedMigrationRole}`,
          "audit",
        );
        await requireFailure(
          `REVOKE SELECT ON core.schema_migrations FROM ${governedMigrationRole}`,
          `GRANT SELECT ON core.schema_migrations TO ${governedMigrationRole}`,
          "core.schema_migrations",
        );
        await requireFailure(
          `REVOKE INSERT ON core.schema_migrations FROM ${governedMigrationRole}`,
          `GRANT INSERT ON core.schema_migrations TO ${governedMigrationRole}`,
          "core.schema_migrations",
        );
        for (const objectName of [
          "core.organizations",
          "core.projects",
          "work.tasks",
          "audit.audit_records",
          "work.requests",
          "governance.request_classification_versions",
          "governance.approvals",
          "ai.model_providers",
          "ai.models",
          "ai.host_runtimes",
          "ai.model_host_bindings",
        ])
          await requireFailure(
            `REVOKE REFERENCES ON ${objectName} FROM ${governedMigrationRole}`,
            `GRANT REFERENCES ON ${objectName} TO ${governedMigrationRole}`,
            objectName,
          );

        await admin.exec(`RESET ROLE; SET ROLE ${context.runtimeRole}`);
        const runtimePreflight = await inspectDatabaseRoleContract(admin, {
          approvedOwnerRoles: [],
          migrationRole: context.runtimeRole,
          runtimeRole: context.runtimeRole,
        });
        assert.equal(runtimePreflight.status, "FAILED");
        await admin.exec(`RESET ROLE; SET ROLE ${governedMigrationRole}`);

        const applied = await applyMigrations(admin, migrations, {
          registryMode: "VERIFY_EXISTING",
        });
        assert.deepEqual(applied.applied, [
          "0032_phase15d_multi_ai_role_model_routing",
        ]);
        const replay = await applyMigrations(admin, migrations, {
          registryMode: "VERIFY_EXISTING",
        });
        assert.equal(replay.applied.length, 0);
        assert.equal(replay.skipped.length, 32);

        await admin.exec("RESET ROLE");
        await assert.rejects(
          applyPhase15cRuntimeAcl(admin, {
            aclAdminRole,
            approvedOwnerRoles: approvedAclOwnerRoles,
            environment: "development",
            migrationRole: governedMigrationRole,
            runtimeRole: context.runtimeRole,
          }),
          /DATABASE_ACL_ADMIN_PREFLIGHT_FAILED/u,
        );
        await admin.exec(`
          REVOKE phase15c_legacy_owner, ${governedMigrationRole} FROM ${aclAdminRole};
          GRANT phase15c_legacy_owner, ${governedMigrationRole} TO ${aclAdminRole} WITH INHERIT FALSE;
        `);
        const noInheritAclAdmin = await openPostgresDatabase(
          `postgresql://${aclAdminRole}@127.0.0.1:${context.port}/${context.databaseName}`,
        );
        try {
          assert.equal(
            (
              await inspectPhase15cAclAdminAuthority(noInheritAclAdmin, {
                aclAdminRole,
                approvedOwnerRoles: approvedAclOwnerRoles,
                migrationRole: governedMigrationRole,
                runtimeRole: context.runtimeRole,
              })
            ).status,
            "FAILED",
          );
        } finally {
          await noInheritAclAdmin.close();
        }
        const providerAdminRole = "postgres";
        const appliedAcl = await applyPhase15cRuntimeAcl(admin, {
          aclAdminRole: providerAdminRole,
          approvedOwnerRoles: [],
          bootstrapMode: "PROVIDER_BOOTSTRAP_ADMIN",
          environment: "staging",
          migrationRole: governedMigrationRole,
          runtimeRole: context.runtimeRole,
        });
        assert.equal(appliedAcl.status, "APPLIED");
        const replayedAcl = await applyPhase15cRuntimeAcl(admin, {
          aclAdminRole: providerAdminRole,
          approvedOwnerRoles: [],
          bootstrapMode: "PROVIDER_BOOTSTRAP_ADMIN",
          environment: "staging",
          migrationRole: governedMigrationRole,
          runtimeRole: context.runtimeRole,
        });
        assert.equal(replayedAcl.status, "REUSED");
        await admin.exec(
          `GRANT REFERENCES ON work.requests TO ${context.runtimeRole}`,
        );
        assert.equal(
          (
            await verifyPhase15cRuntimeAcl(admin, {
              aclAdminRole: providerAdminRole,
              migrationRole: governedMigrationRole,
              requireRuntimeIdentity: false,
              runtimeRole: context.runtimeRole,
            })
          ).status,
          "FAILED",
        );
        await admin.exec(
          `REVOKE REFERENCES ON work.requests FROM ${context.runtimeRole}`,
        );
      } finally {
        await initializer.close();
        await admin.close();
      }

      const runtime = await openPostgresDatabase(context.runtimeUrl);
      try {
        const runtimeIdentity = await runtime.query<{
          rolcreatedb: boolean;
          rolcreaterole: boolean;
          rolsuper: boolean;
        }>(`SELECT rolcreatedb, rolcreaterole, rolsuper
              FROM pg_roles WHERE rolname=current_user`);
        assert.deepEqual(runtimeIdentity.rows, [
          { rolcreatedb: false, rolcreaterole: false, rolsuper: false },
        ]);
        assert.equal(
          (
            await verifyPhase15cRuntimeAcl(runtime, {
              aclAdminRole: "postgres",
              migrationRole: governedMigrationRole,
              requireRuntimeIdentity: true,
              runtimeRole: context.runtimeRole,
            })
          ).status,
          "PASS",
        );

        await runtime.exec(`INSERT INTO work.requests (
          id,source_system,source_type,source_ref,source_fingerprint,
          organization_id,project_id,company_scope_ref,project_scope_ref,
          environment,registered_by_actor_type,registered_by_actor_id,
          idempotency_key,input_fingerprint,correlation_id,registration_audit_ref
        ) VALUES (
          '00000000-0000-4000-8000-00000000d004','MAOS','TEST','test://acl',
          'sha256:${"a".repeat(64)}','00000000-0000-4000-8000-00000000d001',
          '00000000-0000-4000-8000-00000000d003','company','project','STAGING',
          'SYSTEM','00000000-0000-4000-8000-00000000d005','acl-request',
          'sha256:${"b".repeat(64)}','acl-correlation',
          '00000000-0000-4000-8000-00000000d006'
        )`);
        await runtime.exec(`UPDATE work.requests
          SET lifecycle_state='INVALIDATED',
              invalidated_by_actor_type='SYSTEM',
              invalidated_by_actor_id='00000000-0000-4000-8000-00000000d005',
              invalidation_reason_code='ACL_TEST',
              invalidated_at=CURRENT_TIMESTAMP
          WHERE id='00000000-0000-4000-8000-00000000d004'`);
        await assert.rejects(
          runtime.exec("CREATE TABLE work.forbidden(id int)"),
        );
        await assert.rejects(
          runtime.exec(
            `ALTER TABLE work.requests OWNER TO ${context.runtimeRole}`,
          ),
        );
        await assert.rejects(
          runtime.exec(
            `GRANT ${context.runtimeRole} TO ${governedMigrationRole}`,
          ),
        );
        await assert.rejects(runtime.exec(`SET ROLE ${governedMigrationRole}`));
        await assert.rejects(
          runtime.exec("UPDATE work.requests SET source_ref='forbidden'"),
        );
        await assert.rejects(runtime.exec("DELETE FROM work.requests"));
        await assert.rejects(runtime.exec("TRUNCATE work.requests"));
      } finally {
        await runtime.close();
      }

      const reconnected = await openPostgresDatabase(context.runtimeUrl);
      try {
        assert.equal(
          (
            await verifyPhase15cRuntimeAcl(reconnected, {
              aclAdminRole: "postgres",
              migrationRole: governedMigrationRole,
              requireRuntimeIdentity: true,
              runtimeRole: context.runtimeRole,
            })
          ).status,
          "PASS",
        );
      } finally {
        await reconnected.close();
      }
    });
  },
);
