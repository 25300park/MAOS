import type { MigrationDatabase } from "./types.js";
export interface DatabaseRoleAclResult {
  readonly status: "APPLIED";
  readonly statementCount: number;
}
export interface DatabaseRoleAclVerificationResult {
  readonly status: "PASS" | "FAILED";
  readonly checks: Readonly<Record<string, boolean>>;
}

async function quotedRole(
  database: Pick<MigrationDatabase, "query">,
  runtimeRole: string,
) {
  const role = await database.query<{ rolname: string }>(
    "SELECT rolname FROM pg_roles WHERE rolname=$1",
    [runtimeRole],
  );
  if (!role.rows[0]) throw new Error("DATABASE_RUNTIME_ROLE_NOT_FOUND");
  const quoted = await database.query<{ quoted: string }>(
    "SELECT quote_ident($1) AS quoted",
    [runtimeRole],
  );
  if (!quoted.rows[0]?.quoted)
    throw new Error("DATABASE_RUNTIME_ROLE_QUOTE_FAILED");
  return quoted.rows[0].quoted;
}

export async function applyPhase15cRuntimeAcl(
  database: Pick<MigrationDatabase, "query" | "exec">,
  input: { runtimeRole: string },
): Promise<DatabaseRoleAclResult> {
  const role = await quotedRole(database, input.runtimeRole);
  const statements = [
    `REVOKE ALL ON work.requests FROM PUBLIC`,
    `REVOKE ALL ON governance.request_classification_versions FROM PUBLIC`,
    `GRANT USAGE ON SCHEMA work TO ${role}`,
    `GRANT SELECT, INSERT ON work.requests TO ${role}`,
    `GRANT UPDATE (lifecycle_state, invalidated_by_actor_type, invalidated_by_actor_id, invalidation_reason_code, invalidated_at) ON work.requests TO ${role}`,
    `GRANT USAGE ON SCHEMA governance TO ${role}`,
    `GRANT SELECT, INSERT ON governance.request_classification_versions TO ${role}`,
    `GRANT USAGE ON SCHEMA ai TO ${role}`,
    `GRANT SELECT ON ai.domain_execution_constraints TO ${role}`,
  ];
  await database.exec("BEGIN");
  try {
    for (const statement of statements) await database.exec(statement);
    await database.exec("COMMIT");
    return { status: "APPLIED", statementCount: statements.length };
  } catch (error) {
    await database.exec("ROLLBACK");
    throw error;
  }
}

export async function verifyPhase15cRuntimeAcl(
  database: Pick<MigrationDatabase, "query">,
  input: { runtimeRole: string },
): Promise<DatabaseRoleAclVerificationResult> {
  const result = await database.query<Record<string, boolean>>(
    `SELECT has_schema_privilege($1,'work','USAGE') AS work_usage,has_table_privilege($1,'work.requests','SELECT') AS requests_select,has_table_privilege($1,'work.requests','INSERT') AS requests_insert,has_table_privilege($1,'work.requests','DELETE') AS requests_delete,has_table_privilege($1,'work.requests','TRUNCATE') AS requests_truncate,EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl WHERE n.nspname='work' AND acl.grantee=0 AND acl.privilege_type='CREATE') AS public_create`,
    [input.runtimeRole],
  );
  const checks = result.rows[0] ?? {};
  const pass =
    checks.work_usage === true &&
    checks.requests_select === true &&
    checks.requests_insert === true &&
    checks.requests_delete === false &&
    checks.requests_truncate === false &&
    checks.public_create === false;
  return { status: pass ? "PASS" : "FAILED", checks };
}
