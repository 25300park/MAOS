import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPhase15cRuntimeAcl,
  inspectPhase15cAclAdminAuthority,
  PHASE15C_ACL_CONTRACT_VERSION,
  verifyPhase15cRuntimeAcl,
} from "@maos/database";

test("ACL application requires nine-operation preflight and uses only fixed statements", async () => {
  const executed: string[] = [];
  let verificationCalls = 0;
  const database = {
    exec: async (sql: string) => {
      executed.push(sql);
    },
    query: async <Row>(sql: string, params?: unknown[]) => {
      if (sql.includes("PHASE15C_RUNTIME_ACL_VERIFY")) {
        verificationCalls += 1;
        const checks: Record<string, boolean> = {
          identity_matches: false,
          role_attributes_safe: true,
          forbidden_membership_absent: true,
          work_usage: verificationCalls > 1,
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
        return { rows: [checks] as Row[] };
      }
      if (sql.includes("quote_ident"))
        return { rows: [{ quoted: '"app_runtime"' }] as Row[] };
      if (sql.includes("ACL_ADMIN_IDENTITY"))
        return {
          rows: [
            {
              current_role: "acl_admin",
              privileged_membership: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false,
              rolsuper: false,
            },
          ] as Row[],
        };
      if (sql.includes("ACL_OPERATION_AUTHORITY"))
        return {
          rows: [
            {
              direct_owner: true,
              grant_option: false,
              owner_member: false,
              owner_role: "acl_owner",
            },
          ] as Row[],
        };
      if (sql.includes("PHASE15C_EXISTING_RUNTIME_BINDING"))
        return { rows: [] as Row[] };
      if (sql.includes("pg_roles"))
        return { rows: [{ rolname: params?.[0] }] as Row[] };
      return { rows: [] as Row[] };
    },
  };
  const result = await applyPhase15cRuntimeAcl(database, {
    aclAdminRole: "acl_admin",
    approvedOwnerRoles: ["acl_owner"],
    environment: "staging",
    migrationRole: "app_migration",
    runtimeRole: "app_runtime",
  });
  assert.equal(result.status, "APPLIED");
  assert.equal(result.statementCount, 9);
  assert.equal(result.contractVersion, PHASE15C_ACL_CONTRACT_VERSION);
  assert.equal(
    (
      await inspectPhase15cAclAdminAuthority(database, {
        aclAdminRole: "acl_admin",
        approvedOwnerRoles: ["acl_owner"],
        migrationRole: "app_migration",
        runtimeRole: "app_runtime",
      })
    ).rows.length,
    9,
  );
  assert.equal(
    executed.some((sql) => sql.includes("GRANT ALL")),
    false,
  );
  assert.equal(
    executed.some((sql) => sql.includes("WITH GRANT OPTION")),
    false,
  );
  assert.equal(
    executed.some((sql) => sql.includes("DELETE")),
    false,
  );
});

test("ACL administration fails closed on contract conflict or insufficient authority", async () => {
  const database = {
    exec: async () => undefined,
    query: async <Row>(sql: string) => {
      if (sql.includes("ACL_ADMIN_IDENTITY"))
        return {
          rows: [
            {
              current_role: "acl_admin",
              privileged_membership: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false,
              rolsuper: false,
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
              owner_role: "unapproved_owner",
            },
          ] as Row[],
        };
      return { rows: [] as Row[] };
    },
  };
  await assert.rejects(
    applyPhase15cRuntimeAcl(database, {
      aclAdminRole: "acl_admin",
      approvedOwnerRoles: [],
      contractVersion: "CONFLICTING_CONTRACT",
      environment: "staging",
      migrationRole: "app_migration",
      runtimeRole: "app_runtime",
    }),
    /DATABASE_ACL_CONTRACT_CONFLICT/,
  );
  const inspected = await inspectPhase15cAclAdminAuthority(database, {
    aclAdminRole: "acl_admin",
    approvedOwnerRoles: [],
    migrationRole: "app_migration",
    runtimeRole: "app_runtime",
  });
  assert.equal(inspected.status, "FAILED");
  assert.equal(inspected.rows.length, 9);
});

test("ACL preflight accepts the exact grant-option alternative", async () => {
  const database = {
    query: async <Row>(sql: string, params?: unknown[]) => {
      if (sql.includes("ACL_ADMIN_IDENTITY"))
        return {
          rows: [
            {
              current_role: "acl_admin",
              privileged_membership: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false,
              rolsuper: false,
            },
          ] as Row[],
        };
      if (sql.includes("ACL_OPERATION_AUTHORITY")) {
        const privileges = params?.at(-1) as readonly string[] | undefined;
        const revokeOperation = privileges?.length === 0;
        return {
          rows: [
            {
              direct_owner: false,
              grant_option: !revokeOperation,
              owner_member: revokeOperation,
              owner_role: "approved_owner",
            },
          ] as Row[],
        };
      }
      return { rows: [] as Row[] };
    },
  };
  const result = await inspectPhase15cAclAdminAuthority(database, {
    aclAdminRole: "acl_admin",
    approvedOwnerRoles: ["approved_owner"],
    migrationRole: "app_migration",
    runtimeRole: "app_runtime",
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.rows.length, 9);
  assert.equal(
    result.rows.some((row) => row.authority === "GRANT_OPTION"),
    true,
  );
});

test("ACL operation failure rolls back the fixed transaction", async () => {
  const executed: string[] = [];
  const database = {
    exec: async (sql: string) => {
      executed.push(sql);
      if (sql.includes("GRANT SELECT, INSERT ON work.requests"))
        throw new Error("SYNTHETIC_ACL_OPERATION_FAILURE");
    },
    query: async <Row>(sql: string, params?: unknown[]) => {
      if (sql.includes("ACL_ADMIN_IDENTITY"))
        return {
          rows: [
            {
              current_role: "acl_admin",
              privileged_membership: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false,
              rolsuper: false,
            },
          ] as Row[],
        };
      if (sql.includes("ACL_OPERATION_AUTHORITY"))
        return {
          rows: [
            {
              direct_owner: true,
              grant_option: false,
              owner_member: false,
              owner_role: "owner",
            },
          ] as Row[],
        };
      if (sql.includes("PHASE15C_RUNTIME_ACL_VERIFY"))
        return { rows: [{}] as Row[] };
      if (sql.includes("PHASE15C_EXISTING_RUNTIME_BINDING"))
        return { rows: [] as Row[] };
      if (sql.includes("quote_ident"))
        return { rows: [{ quoted: '"app_runtime"' }] as Row[] };
      if (sql.includes("pg_roles"))
        return { rows: [{ rolname: params?.[0] }] as Row[] };
      return { rows: [] as Row[] };
    },
  };
  await assert.rejects(
    applyPhase15cRuntimeAcl(database, {
      aclAdminRole: "acl_admin",
      approvedOwnerRoles: ["owner"],
      environment: "staging",
      migrationRole: "app_migration",
      runtimeRole: "app_runtime",
    }),
    /SYNTHETIC_ACL_OPERATION_FAILURE/,
  );
  assert.deepEqual(executed.at(-1), "ROLLBACK");
  assert.equal(executed.includes("COMMIT"), false);
});

test("a different effective runtime binding conflicts before ACL mutation", async () => {
  const executed: string[] = [];
  const database = {
    exec: async (sql: string) => {
      executed.push(sql);
    },
    query: async <Row>(sql: string, params?: unknown[]) => {
      if (sql.includes("ACL_ADMIN_IDENTITY"))
        return {
          rows: [
            {
              current_role: "acl_admin",
              privileged_membership: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false,
              rolsuper: false,
            },
          ] as Row[],
        };
      if (sql.includes("ACL_OPERATION_AUTHORITY"))
        return {
          rows: [
            {
              direct_owner: true,
              grant_option: false,
              owner_member: false,
              owner_role: "owner",
            },
          ] as Row[],
        };
      if (sql.includes("PHASE15C_RUNTIME_ACL_VERIFY"))
        return { rows: [{}] as Row[] };
      if (sql.includes("PHASE15C_EXISTING_RUNTIME_BINDING"))
        return { rows: [{ rolname: "old_runtime" }] as Row[] };
      if (sql.includes("quote_ident"))
        return { rows: [{ quoted: '"app_runtime"' }] as Row[] };
      if (sql.includes("pg_roles"))
        return { rows: [{ rolname: params?.[0] }] as Row[] };
      return { rows: [] as Row[] };
    },
  };
  await assert.rejects(
    applyPhase15cRuntimeAcl(database, {
      aclAdminRole: "acl_admin",
      approvedOwnerRoles: ["owner"],
      environment: "staging",
      migrationRole: "app_migration",
      runtimeRole: "app_runtime",
    }),
    /DATABASE_ACL_ROLE_BINDING_CONFLICT/,
  );
  assert.equal(executed.length, 0);
});

test("runtime ACL verifier fails on forbidden privilege or PUBLIC leakage", async () => {
  const checks: Record<string, boolean> = {
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
  const database = {
    query: async <Row>() => ({ rows: [checks] as Row[] }),
  };
  const input = {
    aclAdminRole: "acl_admin",
    migrationRole: "app_migration",
    runtimeRole: "app_runtime",
  };
  assert.equal(
    (await verifyPhase15cRuntimeAcl(database, input)).status,
    "PASS",
  );
  checks.public_ai_create = true;
  assert.equal(
    (await verifyPhase15cRuntimeAcl(database, input)).status,
    "FAILED",
  );
});
