import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  applyMigrations,
  applyPhase15cRuntimeAcl,
  inspectDatabaseRoleContract,
  loadMigrations,
  openPostgresDatabase,
  verifyPhase15cRuntimeAcl,
} from "@maos/database";
import { withDisposablePostgres } from "./testing/disposable-postgres.js";

const migrationDirectory = resolve("packages/database/migrations");

test(
  "real PostgreSQL preserves migration ownership and enforces the runtime ACL boundary",
  { timeout: 120_000 },
  async () => {
    await withDisposablePostgres({}, async (context) => {
      const migrations = await loadMigrations(migrationDirectory);
      const migration = await openPostgresDatabase(context.migrationUrl);
      try {
        const attributes = await migration.query<{
          current_user: string;
          rolcreatedb: boolean;
          rolcreaterole: boolean;
          rolsuper: boolean;
        }>(`SELECT current_user, rolcreatedb, rolcreaterole, rolsuper
              FROM pg_roles WHERE rolname=current_user`);
        assert.deepEqual(attributes.rows, [
          {
            current_user: context.migrationRole,
            rolcreatedb: false,
            rolcreaterole: false,
            rolsuper: false,
          },
        ]);

        const first = await applyMigrations(
          migration,
          migrations.filter(({ id }) => id < "0031_"),
        );
        assert.equal(first.applied.length, 30);

        const bootstrap = await openPostgresDatabase(
          `postgresql://postgres@127.0.0.1:${context.port}/${context.databaseName}`,
        );
        try {
          await bootstrap.exec(`
            CREATE ROLE phase15c_legacy_owner NOLOGIN;
            ALTER SCHEMA work OWNER TO phase15c_legacy_owner;
            ALTER SCHEMA governance OWNER TO phase15c_legacy_owner;
            ALTER SCHEMA ai OWNER TO phase15c_legacy_owner;
            ALTER TABLE ai.role_compatibilities OWNER TO phase15c_legacy_owner;
            ALTER TABLE core.schema_migrations OWNER TO phase15c_legacy_owner;
            ALTER FUNCTION ai.guard_development_domain_constraint() OWNER TO phase15c_legacy_owner;
            ALTER FUNCTION ai.guard_development_role_compatibility() OWNER TO phase15c_legacy_owner;
            GRANT USAGE ON SCHEMA work,governance,ai TO ${context.migrationRole} WITH GRANT OPTION;
            GRANT CREATE ON SCHEMA work,governance,ai TO ${context.migrationRole};
            GRANT USAGE ON SCHEMA core TO ${context.migrationRole};
            GRANT SELECT,INSERT ON core.schema_migrations TO ${context.migrationRole};
          `);
        } finally {
          await bootstrap.close();
        }

        const preflight = await inspectDatabaseRoleContract(migration, {
          approvedOwnerRoles: [],
          migrationRole: context.migrationRole,
          runtimeRole: context.runtimeRole,
        });
        assert.equal(preflight.status, "PASS");
        assert.equal(
          preflight.rows.every(({ result }) => result === "PASS"),
          true,
        );
        assert.equal(
          preflight.rows.filter(({ requirement }) => requirement === "OWNER")
            .length,
          1,
        );
        assert.equal(
          preflight.rows.filter(
            ({ requirement }) => requirement === "PRIVILEGE",
          ).length,
          4,
        );
        assert.equal(
          preflight.rows.filter(
            ({ requirement }) => requirement === "NO_OPERATION",
          ).length,
          5,
        );

        const wrongOwner = await inspectDatabaseRoleContract(migration, {
          approvedOwnerRoles: [],
          migrationRole: "not_the_current_owner",
          runtimeRole: context.runtimeRole,
        });
        assert.equal(wrongOwner.status, "FAILED");

        const applied = await applyMigrations(migration, migrations);
        assert.deepEqual(applied.applied, [
          "0031_phase15c_classification_domain_routing",
        ]);
        const replay = await applyMigrations(migration, migrations);
        assert.equal(replay.applied.length, 0);
        assert.equal(replay.skipped.length, 31);

        assert.equal(
          (
            await applyPhase15cRuntimeAcl(migration, {
              runtimeRole: context.runtimeRole,
            })
          ).status,
          "APPLIED",
        );
        await migration.exec(`
          INSERT INTO core.organizations(id,name,slug)
          VALUES ('00000000-0000-4000-8000-00000000d001','Phase15C ACL','phase15c-acl');
          INSERT INTO core.departments(id,organization_id,name)
          VALUES ('00000000-0000-4000-8000-00000000d002','00000000-0000-4000-8000-00000000d001','Governance');
          INSERT INTO core.projects(id,organization_id,department_id,name)
          VALUES ('00000000-0000-4000-8000-00000000d003','00000000-0000-4000-8000-00000000d001','00000000-0000-4000-8000-00000000d002','ACL');
        `);
        assert.equal(
          (
            await applyPhase15cRuntimeAcl(migration, {
              runtimeRole: context.runtimeRole,
            })
          ).status,
          "APPLIED",
        );
      } finally {
        await migration.close();
      }

      const runtime = await openPostgresDatabase(context.runtimeUrl);
      try {
        const runtimeIdentity = await runtime.query<{
          current_user: string;
          rolcreatedb: boolean;
          rolcreaterole: boolean;
          rolsuper: boolean;
        }>(`SELECT current_user, rolcreatedb, rolcreaterole, rolsuper
              FROM pg_roles WHERE rolname=current_user`);
        assert.deepEqual(runtimeIdentity.rows, [
          {
            current_user: context.runtimeRole,
            rolcreatedb: false,
            rolcreaterole: false,
            rolsuper: false,
          },
        ]);
        assert.equal(
          (
            await verifyPhase15cRuntimeAcl(runtime, {
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
        const lifecycle = await runtime.query<{ lifecycle_state: string }>(
          `SELECT lifecycle_state FROM work.requests
            WHERE id='00000000-0000-4000-8000-00000000d004'`,
        );
        assert.equal(lifecycle.rows[0]?.lifecycle_state, "INVALIDATED");

        const ownership = await runtime.query<{
          classification_owner: string;
          request_owner: string;
        }>(`SELECT
          (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='work.requests'::regclass) AS request_owner,
          (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='governance.request_classification_versions'::regclass) AS classification_owner`);
        assert.equal(ownership.rows[0]?.request_owner, context.migrationRole);
        assert.equal(
          ownership.rows[0]?.classification_owner,
          context.migrationRole,
        );

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
            `GRANT ${context.runtimeRole} TO ${context.migrationRole}`,
          ),
        );
        await assert.rejects(runtime.exec(`SET ROLE ${context.migrationRole}`));
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
