import assert from "node:assert/strict";
import test from "node:test";
import { runDatabaseRoleApplyAcl } from "./database-role-apply-acl.js";

const passingChecks = {
  identity_matches: true,
  role_attributes_safe: true,
  forbidden_membership_absent: true,
  work_usage: true,
  governance_usage: true,
  ai_usage: true,
  schema_create_absent: true,
  requests_select: true,
  requests_insert: true,
  classifications_select: true,
  classifications_insert: true,
  policy_select: true,
  forbidden_table_privileges_absent: true,
  allowed_columns_exact: true,
  updated_at_trigger_managed: true,
  runtime_owns_object: false,
  runtime_grant_option: false,
  public_requests_privilege: false,
  public_classifications_privilege: false,
  public_work_create: false,
  public_governance_create: false,
  public_ai_create: false,
};

test("one-shot ACL command closes provider admin before opening runtime verification", async () => {
  const events: string[] = [];
  let verificationCalls = 0;
  const admin = {
    close: async () => {
      events.push("admin:close");
    },
    exec: async () => undefined,
    query: async <Row>(sql: string, params?: unknown[]) => {
      if (sql.includes("ACL_ADMIN_IDENTITY"))
        return {
          rows: [
            {
              current_role: "provider_admin",
              privileged_membership: false,
              rolbypassrls: false,
              rolcreatedb: true,
              rolcreaterole: true,
              rolreplication: false,
              rolsuper: true,
            },
          ] as Row[],
        };
      if (sql.includes("ACL_OPERATION_AUTHORITY"))
        return {
          rows: [
            {
              direct_owner: false,
              grant_option: false,
              owner_member: false,
              owner_role: "postgres",
            },
          ] as Row[],
        };
      if (sql.includes("quote_ident"))
        return { rows: [{ quoted: '"app_runtime"' }] as Row[] };
      if (sql.includes("PHASE15C_EXISTING_RUNTIME_BINDING"))
        return { rows: [] as Row[] };
      if (sql.includes("PHASE15C_RUNTIME_ACL_VERIFY")) {
        verificationCalls += 1;
        return {
          rows: [
            { ...passingChecks, work_usage: verificationCalls > 1 },
          ] as Row[],
        };
      }
      if (sql.includes("FROM pg_roles"))
        return { rows: [{ rolname: params?.[0] }] as Row[] };
      return { rows: [] as Row[] };
    },
  };
  const runtime = {
    close: async () => {
      events.push("runtime:close");
    },
    exec: async () => undefined,
    query: async <Row>() => ({ rows: [passingChecks] as Row[] }),
  };
  const openDatabase = async (url: string) => {
    events.push(`open:${url.includes("acl") ? "admin" : "runtime"}`);
    return url.includes("acl") ? admin : runtime;
  };
  const output: string[] = [];
  const result = await runDatabaseRoleApplyAcl(
    {
      DATABASE_URL: "postgresql://runtime@localhost/maos",
      MAOS_DATABASE_ACL_ADMIN_BOOTSTRAP_MODE: "PROVIDER_BOOTSTRAP_ADMIN",
      MAOS_DATABASE_ACL_ADMIN_ROLE: "provider_admin",
      MAOS_DATABASE_ACL_ADMIN_URL: "postgresql://acl@localhost/maos",
      MAOS_DATABASE_MIGRATION_ROLE: "app_migration",
      MAOS_DATABASE_RUNTIME_ROLE: "app_runtime",
      MAOS_ENV: "staging",
    },
    (line) => output.push(line),
    openDatabase,
  );
  assert.equal(result, 0);
  assert.deepEqual(events, [
    "open:admin",
    "admin:close",
    "open:runtime",
    "runtime:close",
  ]);
  assert.equal(
    output.some((line) => line.includes("postgresql://")),
    false,
  );
});

test("production ACL command fails before opening any database connection", async () => {
  let opened = false;
  const result = await runDatabaseRoleApplyAcl(
    { MAOS_ENV: "production" },
    () => undefined,
    async () => {
      opened = true;
      throw new Error("UNEXPECTED_OPEN");
    },
  );
  assert.equal(result, 1);
  assert.equal(opened, false);
});
