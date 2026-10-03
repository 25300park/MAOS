import assert from "node:assert/strict";
import test from "node:test";
import { inspectDatabaseRoleContract } from "@maos/database";

test("legacy owner preflight is read-only and fails closed on an unresolved row", async () => {
  const calls: string[] = [];
  const database = {
    exec: async (sql: string) => {
      calls.push(sql);
    },
    query: async <Row>(sql: string) => {
      calls.push(sql);
      if (sql.includes("FROM pg_roles"))
        return {
          rows: [{ current_user: "migration_owner", rolsuper: false }] as Row[],
        };
      return {
        rows: [
          {
            object_kind: "TABLE",
            object_name: "ai.domain_execution_constraints",
            owner_name: "other_owner",
          },
        ] as Row[],
      };
    },
  };
  const result = await inspectDatabaseRoleContract(database, {
    migrationRole: "migration_owner",
    runtimeRole: "app_runtime",
    approvedOwnerRoles: [],
  });
  assert.equal(result.status, "FAILED");
  assert.equal(
    calls.some((sql) => /^\s*(ALTER|GRANT|REVOKE|CREATE|DROP)\b/iu.test(sql)),
    false,
  );
});

const ownerMatrix = [
  ["SCHEMA", "work"],
  ["SCHEMA", "governance"],
  ["SCHEMA", "ai"],
  ["SCHEMA", "core"],
  ["TABLE", "ai.domain_execution_constraints"],
  ["TABLE", "ai.role_compatibilities"],
  ["TABLE", "core.schema_migrations"],
  ["TABLE", "core.organizations"],
  ["TABLE", "core.projects"],
  ["TABLE", "work.tasks"],
  ["FUNCTION", "ai.guard_development_domain_constraint"],
  ["FUNCTION", "ai.guard_development_role_compatibility"],
  [
    "TRIGGER",
    "ai.domain_execution_constraints.domain_execution_constraints_guard_development",
  ],
  ["TRIGGER", "ai.role_compatibilities.role_compatibilities_guard_development"],
] as const;

test("accepts the operation-aware minimum authority for migration 0031", async () => {
  const database = {
    exec: async () => undefined,
    query: async <Row>(sql: string) => {
      if (sql.includes("FROM pg_roles"))
        return {
          rows: [{ current_user: "migration_owner", rolsuper: false }] as Row[],
        };
      return {
        rows: ownerMatrix.map(([object_kind, object_name]) => ({
          object_exists: true,
          object_kind,
          object_name,
          owner_name:
            object_name === "ai.domain_execution_constraints"
              ? "migration_owner"
              : "legacy_owner",
          privilege_satisfied: [
            "work",
            "governance",
            "ai",
            "core",
            "core.schema_migrations",
            "core.organizations",
            "core.projects",
            "work.tasks",
          ].includes(object_name),
        })) as Row[],
      };
    },
  };

  const result = await inspectDatabaseRoleContract(database, {
    migrationRole: "migration_owner",
    runtimeRole: "app_runtime",
    approvedOwnerRoles: [],
  });

  assert.equal(result.status, "PASS");
  assert.equal(
    result.rows.find(
      ({ objectName }) => objectName === "ai.domain_execution_constraints",
    )?.requirement,
    "OWNER_REQUIRED",
  );
  assert.equal(
    result.rows.filter(
      ({ requirement }) => requirement === "SCHEMA_PRIVILEGE_REQUIRED",
    ).length,
    4,
  );
  assert.equal(
    result.rows.filter(
      ({ requirement }) => requirement === "TABLE_PRIVILEGE_REQUIRED",
    ).length,
    1,
  );
  assert.equal(
    result.rows.filter(
      ({ requirement }) => requirement === "REFERENCES_REQUIRED",
    ).length,
    3,
  );
  assert.equal(
    result.rows.filter(({ requirement }) => requirement === "NO_OPERATION")
      .length,
    5,
  );
});

test("fails closed when an exact required privilege is absent", async () => {
  const database = {
    exec: async () => undefined,
    query: async <Row>(sql: string) =>
      sql.includes("FROM pg_roles")
        ? {
            rows: [
              { current_user: "migration_owner", rolsuper: false },
            ] as Row[],
          }
        : {
            rows: ownerMatrix.map(([object_kind, object_name]) => ({
              object_exists: true,
              object_kind,
              object_name,
              owner_name:
                object_name === "ai.domain_execution_constraints"
                  ? "migration_owner"
                  : "legacy_owner",
              privilege_satisfied:
                object_name !== "work" &&
                [
                  "governance",
                  "ai",
                  "core",
                  "core.schema_migrations",
                  "core.organizations",
                  "core.projects",
                  "work.tasks",
                ].includes(object_name),
            })) as Row[],
          },
  };

  const result = await inspectDatabaseRoleContract(database, {
    migrationRole: "migration_owner",
    runtimeRole: "app_runtime",
    approvedOwnerRoles: [],
  });

  assert.equal(result.status, "FAILED");
  assert.equal(
    result.rows.find(({ objectName }) => objectName === "work")?.authority,
    "DENIED",
  );
});

test("rejects a superuser migration principal before catalog inspection", async () => {
  let catalogRead = false;
  const result = await inspectDatabaseRoleContract(
    {
      exec: async () => undefined,
      query: async <Row>(sql: string) => {
        if (!sql.includes("FROM pg_roles")) catalogRead = true;
        return {
          rows: [{ current_user: "postgres", rolsuper: true }] as Row[],
        };
      },
    },
    {
      migrationRole: "postgres",
      runtimeRole: "app_runtime",
      approvedOwnerRoles: [],
    },
  );

  assert.equal(result.status, "FAILED");
  assert.equal(catalogRead, false);
  assert.deepEqual(result.rows, []);
});

test("rejects a CREATEDB migration principal before catalog inspection", async () => {
  let catalogRead = false;
  const result = await inspectDatabaseRoleContract(
    {
      exec: async () => undefined,
      query: async <Row>(sql: string) => {
        if (!sql.includes("FROM pg_roles")) catalogRead = true;
        return {
          rows: [
            {
              current_user: "migration_owner",
              rolbypassrls: false,
              rolcreatedb: true,
              rolcreaterole: false,
              rolreplication: false,
              rolsuper: false,
            },
          ] as Row[],
        };
      },
    },
    {
      migrationRole: "migration_owner",
      runtimeRole: "app_runtime",
      approvedOwnerRoles: [],
    },
  );

  assert.equal(result.status, "FAILED");
  assert.equal(catalogRead, false);
  assert.deepEqual(result.rows, []);
});

test("rejects migration and runtime identity collapse before catalog inspection", async () => {
  let catalogRead = false;
  const result = await inspectDatabaseRoleContract(
    {
      exec: async () => undefined,
      query: async <Row>(sql: string) => {
        if (!sql.includes("FROM pg_roles")) catalogRead = true;
        return {
          rows: [
            {
              current_user: "shared_role",
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false,
              rolsuper: false,
            },
          ] as Row[],
        };
      },
    },
    {
      migrationRole: "shared_role",
      runtimeRole: "shared_role",
      approvedOwnerRoles: [],
    },
  );

  assert.equal(result.status, "FAILED");
  assert.equal(catalogRead, false);
  assert.deepEqual(result.rows, []);
});
test("fails closed when migration owner lacks approved owner-role membership", async () => {
  const database = {
    exec: async () => undefined,
    query: async <Row>(sql: string) => {
      if (sql.includes("FROM pg_roles"))
        return {
          rows: [{ current_user: "migration_owner", rolsuper: false }] as Row[],
        };
      if (sql.includes("pg_has_role"))
        return { rows: [{ allowed: false }] as Row[] };
      return {
        rows: ownerMatrix.map(([object_kind, object_name], index) => ({
          object_kind,
          object_name,
          owner_name: index === 0 ? "legacy_owner" : "migration_owner",
        })) as Row[],
      };
    },
  };
  const result = await inspectDatabaseRoleContract(database, {
    migrationRole: "migration_owner",
    runtimeRole: "app_runtime",
    approvedOwnerRoles: ["legacy_owner"],
  });
  assert.equal(result.status, "FAILED");
  assert.equal(result.rows[0]?.authority, "DENIED");
});

test("fails closed when any protected object owner is indeterminate", async () => {
  const database = {
    exec: async () => undefined,
    query: async <Row>(sql: string) =>
      sql.includes("FROM pg_roles")
        ? {
            rows: [
              { current_user: "migration_owner", rolsuper: false },
            ] as Row[],
          }
        : {
            rows: ownerMatrix.map(([object_kind, object_name], index) => ({
              object_kind,
              object_name,
              owner_name: index === 0 ? null : "migration_owner",
            })) as Row[],
          },
  };
  const result = await inspectDatabaseRoleContract(database, {
    migrationRole: "migration_owner",
    runtimeRole: "app_runtime",
    approvedOwnerRoles: [],
  });
  assert.equal(result.status, "FAILED");
  assert.equal(result.rows[0]?.authority, "UNKNOWN");
});
