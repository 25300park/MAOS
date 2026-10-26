import { createHash } from "node:crypto";
import type { MigrationDatabase } from "./types.js";

export const PHASE15C_ACL_CONTRACT_VERSION = "PHASE15C_RUNTIME_ACL_V2";

export interface DatabaseRoleAclResult {
  readonly contractFingerprint: string;
  readonly contractVersion: typeof PHASE15C_ACL_CONTRACT_VERSION;
  readonly statementCount: number;
  readonly status: "APPLIED" | "REUSED";
}

export interface DatabaseRoleAclVerificationResult {
  readonly checks: Readonly<Record<string, boolean>>;
  readonly status: "PASS" | "FAILED";
}

export interface AclAuthorityRow {
  readonly authority:
    | "DIRECT_OWNER"
    | "APPROVED_OWNER_ROLE"
    | "GRANT_OPTION"
    | "PROVIDER_BOOTSTRAP_ADMIN"
    | "NONE";
  readonly objectName: string;
  readonly operation: string;
  readonly result: "PASS" | "FAIL";
}

export interface AclAdminAuthorityResult {
  readonly rows: readonly AclAuthorityRow[];
  readonly status: "PASS" | "FAILED";
}

interface AclInput {
  readonly aclAdminRole: string;
  readonly approvedOwnerRoles: readonly string[];
  readonly bootstrapMode?: "PROVIDER_BOOTSTRAP_ADMIN";
  readonly environment?: string;
  readonly migrationRole: string;
  readonly runtimeRole: string;
}

interface ApplyAclInput extends AclInput {
  readonly contractVersion?: string;
  readonly environment: string;
}

interface VerifyAclInput {
  readonly aclAdminRole: string;
  readonly migrationRole: string;
  readonly requireRuntimeIdentity?: boolean;
  readonly runtimeRole: string;
}

interface AclOperation {
  readonly kind: "SCHEMA" | "TABLE" | "COLUMNS";
  readonly objectName: string;
  readonly operation: string;
  readonly privileges: readonly string[];
  readonly requiresOwner: boolean;
  readonly sql: (role: string) => string;
}

interface OperationAuthority {
  readonly direct_owner: boolean;
  readonly grant_option: boolean;
  readonly owner_member: boolean;
  readonly owner_role: string;
}

const ACL_OPERATIONS: readonly AclOperation[] = Object.freeze([
  {
    kind: "TABLE",
    objectName: "work.requests",
    operation: "REVOKE_PUBLIC_WORK_REQUESTS",
    privileges: [],
    requiresOwner: true,
    sql: () => "REVOKE ALL ON work.requests FROM PUBLIC",
  },
  {
    kind: "TABLE",
    objectName: "governance.request_classification_versions",
    operation: "REVOKE_PUBLIC_CLASSIFICATION_VERSIONS",
    privileges: [],
    requiresOwner: true,
    sql: () =>
      "REVOKE ALL ON governance.request_classification_versions FROM PUBLIC",
  },
  {
    kind: "SCHEMA",
    objectName: "work",
    operation: "GRANT_WORK_SCHEMA_USAGE",
    privileges: ["USAGE"],
    requiresOwner: false,
    sql: (role) => `GRANT USAGE ON SCHEMA work TO ${role}`,
  },
  {
    kind: "TABLE",
    objectName: "work.requests",
    operation: "GRANT_WORK_REQUEST_DML",
    privileges: ["SELECT", "INSERT"],
    requiresOwner: false,
    sql: (role) => `GRANT SELECT, INSERT ON work.requests TO ${role}`,
  },
  {
    kind: "COLUMNS",
    objectName: "work.requests",
    operation: "GRANT_WORK_REQUEST_INVALIDATION_UPDATE",
    privileges: [
      "lifecycle_state",
      "invalidated_by_actor_type",
      "invalidated_by_actor_id",
      "invalidation_reason_code",
      "invalidated_at",
    ],
    requiresOwner: false,
    sql: (role) =>
      `GRANT UPDATE (lifecycle_state, invalidated_by_actor_type, invalidated_by_actor_id, invalidation_reason_code, invalidated_at) ON work.requests TO ${role}`,
  },
  {
    kind: "SCHEMA",
    objectName: "governance",
    operation: "GRANT_GOVERNANCE_SCHEMA_USAGE",
    privileges: ["USAGE"],
    requiresOwner: false,
    sql: (role) => `GRANT USAGE ON SCHEMA governance TO ${role}`,
  },
  {
    kind: "TABLE",
    objectName: "governance.request_classification_versions",
    operation: "GRANT_CLASSIFICATION_DML",
    privileges: ["SELECT", "INSERT"],
    requiresOwner: false,
    sql: (role) =>
      `GRANT SELECT, INSERT ON governance.request_classification_versions TO ${role}`,
  },
  {
    kind: "SCHEMA",
    objectName: "ai",
    operation: "GRANT_AI_SCHEMA_USAGE",
    privileges: ["USAGE"],
    requiresOwner: false,
    sql: (role) => `GRANT USAGE ON SCHEMA ai TO ${role}`,
  },
  {
    kind: "TABLE",
    objectName: "ai.domain_execution_constraints",
    operation: "GRANT_DOMAIN_POLICY_SELECT",
    privileges: ["SELECT"],
    requiresOwner: false,
    sql: (role) => `GRANT SELECT ON ai.domain_execution_constraints TO ${role}`,
  },
]);

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

const splitObjectName = (name: string) => {
  const [schemaName, objectName] = name.split(".");
  return { schemaName: schemaName ?? name, objectName: objectName ?? null };
};

async function inspectOperationAuthority(
  database: Pick<MigrationDatabase, "query">,
  operation: AclOperation,
) {
  const { schemaName, objectName } = splitObjectName(operation.objectName);
  if (operation.kind === "SCHEMA") {
    return database.query<OperationAuthority>(
      `/* ACL_OPERATION_AUTHORITY */ SELECT owner.rolname AS owner_role,current_user=owner.rolname AS direct_owner,pg_has_role(current_user,owner.oid,'USAGE') AS owner_member,NOT EXISTS (SELECT required.privilege FROM unnest($2::text[]) required(privilege) EXCEPT SELECT acl.privilege_type FROM pg_namespace granted CROSS JOIN LATERAL aclexplode(COALESCE(granted.nspacl,acldefault('n',granted.nspowner))) acl WHERE granted.nspname=$1 AND acl.is_grantable AND pg_has_role(current_user,acl.grantee,'USAGE')) AS grant_option FROM pg_namespace target JOIN pg_roles owner ON owner.oid=target.nspowner WHERE target.nspname=$1`,
      [schemaName, [...operation.privileges]],
    );
  }
  if (operation.kind === "COLUMNS") {
    return database.query<OperationAuthority>(
      `/* ACL_OPERATION_AUTHORITY */ SELECT owner.rolname AS owner_role,current_user=owner.rolname AS direct_owner,pg_has_role(current_user,owner.oid,'USAGE') AS owner_member,NOT EXISTS (SELECT required.column_name FROM unnest($3::text[]) required(column_name) EXCEPT SELECT attribute.attname FROM pg_attribute attribute CROSS JOIN LATERAL aclexplode(attribute.attacl) acl WHERE attribute.attrelid=target.oid AND acl.privilege_type='UPDATE' AND acl.is_grantable AND pg_has_role(current_user,acl.grantee,'USAGE')) AS grant_option FROM pg_class target JOIN pg_namespace namespace ON namespace.oid=target.relnamespace JOIN pg_roles owner ON owner.oid=target.relowner WHERE namespace.nspname=$1 AND target.relname=$2`,
      [schemaName, objectName, [...operation.privileges]],
    );
  }
  return database.query<OperationAuthority>(
    `/* ACL_OPERATION_AUTHORITY */ SELECT owner.rolname AS owner_role,current_user=owner.rolname AS direct_owner,pg_has_role(current_user,owner.oid,'USAGE') AS owner_member,NOT EXISTS (SELECT required.privilege FROM unnest($3::text[]) required(privilege) EXCEPT SELECT acl.privilege_type FROM pg_class granted CROSS JOIN LATERAL aclexplode(COALESCE(granted.relacl,acldefault('r',granted.relowner))) acl WHERE granted.oid=target.oid AND acl.is_grantable AND pg_has_role(current_user,acl.grantee,'USAGE')) AS grant_option FROM pg_class target JOIN pg_namespace namespace ON namespace.oid=target.relnamespace JOIN pg_roles owner ON owner.oid=target.relowner WHERE namespace.nspname=$1 AND target.relname=$2`,
    [schemaName, objectName, [...operation.privileges]],
  );
}

export async function inspectPhase15cAclAdminAuthority(
  database: Pick<MigrationDatabase, "query">,
  input: AclInput,
): Promise<AclAdminAuthorityResult> {
  const identity = await database.query<{
    current_role: string;
    privileged_membership: boolean;
    rolbypassrls: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolreplication: boolean;
    rolsuper: boolean;
  }>(
    `/* ACL_ADMIN_IDENTITY */ SELECT current_user AS current_role,role.rolsuper,role.rolcreatedb,role.rolcreaterole,role.rolreplication,role.rolbypassrls,EXISTS (SELECT 1 FROM pg_roles inherited WHERE inherited.oid<>role.oid AND pg_has_role(current_user,inherited.oid,'MEMBER') AND (inherited.rolsuper OR inherited.rolcreatedb OR inherited.rolcreaterole OR inherited.rolreplication OR inherited.rolbypassrls)) AS privileged_membership FROM pg_roles role WHERE role.rolname=current_user`,
  );
  const actor = identity.rows[0];
  const identitiesSeparated = Boolean(
    actor &&
    actor.current_role === input.aclAdminRole &&
    actor.current_role !== input.runtimeRole &&
    actor.current_role !== input.migrationRole,
  );
  const standardIdentitySafe = Boolean(
    identitiesSeparated &&
    actor &&
    !actor.rolsuper &&
    !actor.rolcreatedb &&
    !actor.rolcreaterole &&
    !actor.rolreplication &&
    !actor.rolbypassrls &&
    !actor.privileged_membership,
  );
  const providerBootstrapAdmin = Boolean(
    identitiesSeparated &&
    actor?.rolsuper &&
    input.bootstrapMode === "PROVIDER_BOOTSTRAP_ADMIN" &&
    input.environment === "staging",
  );
  const rows: AclAuthorityRow[] = [];
  for (const operation of ACL_OPERATIONS) {
    const authority = (await inspectOperationAuthority(database, operation))
      .rows[0];
    const approvedMember = Boolean(
      authority?.owner_member &&
      input.approvedOwnerRoles.includes(authority.owner_role),
    );
    const grantOption = Boolean(
      !operation.requiresOwner && authority?.grant_option,
    );
    const providerOperationAuthority = Boolean(
      providerBootstrapAdmin && authority,
    );
    const kind: AclAuthorityRow["authority"] = providerOperationAuthority
      ? "PROVIDER_BOOTSTRAP_ADMIN"
      : authority?.direct_owner
        ? "DIRECT_OWNER"
        : approvedMember
          ? "APPROVED_OWNER_ROLE"
          : grantOption
            ? "GRANT_OPTION"
            : "NONE";
    rows.push({
      authority: kind,
      objectName: operation.objectName,
      operation: operation.operation,
      result:
        (standardIdentitySafe || providerOperationAuthority) && kind !== "NONE"
          ? "PASS"
          : "FAIL",
    });
  }
  return {
    rows,
    status: rows.every((row) => row.result === "PASS") ? "PASS" : "FAILED",
  };
}

const contractFingerprint = (input: ApplyAclInput) =>
  `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        contractVersion: PHASE15C_ACL_CONTRACT_VERSION,
        bootstrapMode: input.bootstrapMode ?? "STANDARD",
        environment: input.environment,
        objects: ACL_OPERATIONS.map(({ objectName, operation }) => ({
          objectName,
          operation,
        })),
        runtimeRole: input.runtimeRole,
      }),
    )
    .digest("hex")}`;

async function findExistingRuntimeBindings(
  database: Pick<MigrationDatabase, "query">,
  input: ApplyAclInput,
) {
  const excluded = [
    input.runtimeRole,
    input.aclAdminRole,
    input.migrationRole,
    ...input.approvedOwnerRoles,
  ];
  return database.query<{ rolname: string }>(
    `/* PHASE15C_EXISTING_RUNTIME_BINDING */ SELECT role.rolname
       FROM pg_roles role
      WHERE role.rolname<>ALL($1::text[])
        AND NOT role.rolsuper
        AND has_schema_privilege(role.rolname,'work','USAGE')
        AND has_schema_privilege(role.rolname,'governance','USAGE')
        AND has_schema_privilege(role.rolname,'ai','USAGE')
        AND has_table_privilege(role.rolname,'work.requests','SELECT')
        AND has_table_privilege(role.rolname,'work.requests','INSERT')
        AND has_table_privilege(role.rolname,'governance.request_classification_versions','SELECT')
        AND has_table_privilege(role.rolname,'governance.request_classification_versions','INSERT')
        AND has_table_privilege(role.rolname,'ai.domain_execution_constraints','SELECT')
        AND COALESCE((SELECT array_agg(column_name::text ORDER BY column_name::text)=ARRAY[
          'invalidated_at','invalidated_by_actor_id','invalidated_by_actor_type',
          'invalidation_reason_code','lifecycle_state']::text[]
          FROM information_schema.column_privileges
          WHERE table_schema='work' AND table_name='requests'
            AND grantee=role.rolname AND privilege_type='UPDATE'),false)`,
    [excluded],
  );
}

export async function applyPhase15cRuntimeAcl(
  database: Pick<MigrationDatabase, "query" | "exec">,
  input: ApplyAclInput,
): Promise<DatabaseRoleAclResult> {
  if (input.environment === "production")
    throw new Error("PRODUCTION_ACL_FORBIDDEN");
  if (
    input.contractVersion !== undefined &&
    input.contractVersion !== PHASE15C_ACL_CONTRACT_VERSION
  )
    throw new Error("DATABASE_ACL_CONTRACT_CONFLICT");
  const preflight = await inspectPhase15cAclAdminAuthority(database, input);
  if (preflight.status !== "PASS")
    throw new Error("DATABASE_ACL_ADMIN_PREFLIGHT_FAILED");
  const role = await quotedRole(database, input.runtimeRole);
  const before = await verifyPhase15cRuntimeAcl(database, {
    aclAdminRole: input.aclAdminRole,
    migrationRole: input.migrationRole,
    requireRuntimeIdentity: false,
    runtimeRole: input.runtimeRole,
  });
  if (before.status !== "PASS") {
    const existing = await findExistingRuntimeBindings(database, input);
    if (existing.rows.length > 0)
      throw new Error("DATABASE_ACL_ROLE_BINDING_CONFLICT");
  }
  await database.exec("BEGIN");
  try {
    for (const operation of ACL_OPERATIONS)
      await database.exec(operation.sql(role));
    const after = await verifyPhase15cRuntimeAcl(database, {
      aclAdminRole: input.aclAdminRole,
      migrationRole: input.migrationRole,
      requireRuntimeIdentity: false,
      runtimeRole: input.runtimeRole,
    });
    if (after.status !== "PASS")
      throw new Error("DATABASE_RUNTIME_ACL_POST_VERIFY_FAILED");
    await database.exec("COMMIT");
    return {
      contractFingerprint: contractFingerprint(input),
      contractVersion: PHASE15C_ACL_CONTRACT_VERSION,
      statementCount: ACL_OPERATIONS.length,
      status: before.status === "PASS" ? "REUSED" : "APPLIED",
    };
  } catch (error) {
    await database.exec("ROLLBACK");
    throw error;
  }
}

export async function verifyPhase15cRuntimeAcl(
  database: Pick<MigrationDatabase, "query">,
  input: VerifyAclInput,
): Promise<DatabaseRoleAclVerificationResult> {
  const result = await database.query<Record<string, boolean>>(
    `/* PHASE15C_RUNTIME_ACL_VERIFY */ SELECT
    current_user=$1 AS identity_matches,
    COALESCE((SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname=$1),false) AS role_attributes_safe,
    NOT pg_has_role($1,$2,'MEMBER') AND NOT pg_has_role($1,$3,'MEMBER') AND NOT EXISTS (SELECT 1 FROM pg_roles inherited WHERE inherited.rolname<>$1 AND pg_has_role($1,inherited.oid,'MEMBER') AND (inherited.rolsuper OR inherited.rolcreatedb OR inherited.rolcreaterole OR inherited.rolreplication OR inherited.rolbypassrls)) AS forbidden_membership_absent,
    has_schema_privilege($1,'work','USAGE') AS work_usage,has_schema_privilege($1,'governance','USAGE') AS governance_usage,has_schema_privilege($1,'ai','USAGE') AS ai_usage,
    NOT has_schema_privilege($1,'work','CREATE') AND NOT has_schema_privilege($1,'governance','CREATE') AND NOT has_schema_privilege($1,'ai','CREATE') AS schema_create_absent,
    has_table_privilege($1,'work.requests','SELECT') AS requests_select,has_table_privilege($1,'work.requests','INSERT') AS requests_insert,
    has_table_privilege($1,'governance.request_classification_versions','SELECT') AS classifications_select,has_table_privilege($1,'governance.request_classification_versions','INSERT') AS classifications_insert,
    has_table_privilege($1,'ai.domain_execution_constraints','SELECT') AS policy_select,
    NOT has_table_privilege($1,'work.requests','UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND NOT has_table_privilege($1,'governance.request_classification_versions','UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND NOT has_table_privilege($1,'ai.domain_execution_constraints','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS forbidden_table_privileges_absent,
    COALESCE((SELECT array_agg(column_name::text ORDER BY column_name::text)=ARRAY['invalidated_at','invalidated_by_actor_id','invalidated_by_actor_type','invalidation_reason_code','lifecycle_state']::text[] FROM information_schema.column_privileges WHERE table_schema='work' AND table_name='requests' AND grantee=$1 AND privilege_type='UPDATE'),false) AS allowed_columns_exact,
    EXISTS (SELECT 1 FROM pg_trigger trigger JOIN pg_class relation ON relation.oid=trigger.tgrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace JOIN pg_proc procedure ON procedure.oid=trigger.tgfoid WHERE namespace.nspname='work' AND relation.relname='requests' AND trigger.tgname='requests_guard_mutation' AND NOT trigger.tgisinternal AND pg_get_functiondef(procedure.oid) LIKE '%NEW.updated_at := CURRENT_TIMESTAMP%') AS updated_at_trigger_managed,
    EXISTS (SELECT 1 FROM pg_namespace namespace JOIN pg_roles owner ON owner.oid=namespace.nspowner WHERE namespace.nspname IN ('work','governance','ai') AND owner.rolname=$1) OR EXISTS (SELECT 1 FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace JOIN pg_roles owner ON owner.oid=relation.relowner WHERE (namespace.nspname,relation.relname) IN (('work','requests'),('governance','request_classification_versions'),('ai','domain_execution_constraints')) AND owner.rolname=$1) OR EXISTS (SELECT 1 FROM pg_proc procedure JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace JOIN pg_roles owner ON owner.oid=procedure.proowner WHERE (namespace.nspname,procedure.proname) IN (('work','guard_request_mutation'),('governance','guard_request_classification_append'),('governance','reject_request_classification_mutation')) AND owner.rolname=$1) AS runtime_owns_object,
    EXISTS (SELECT 1 FROM pg_namespace namespace CROSS JOIN LATERAL aclexplode(COALESCE(namespace.nspacl,acldefault('n',namespace.nspowner))) acl WHERE namespace.nspname IN ('work','governance','ai') AND acl.is_grantable AND pg_has_role($1,acl.grantee,'USAGE')) OR EXISTS (SELECT 1 FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl,acldefault('r',relation.relowner))) acl WHERE (namespace.nspname,relation.relname) IN (('work','requests'),('governance','request_classification_versions'),('ai','domain_execution_constraints')) AND acl.is_grantable AND pg_has_role($1,acl.grantee,'USAGE')) OR EXISTS (SELECT 1 FROM pg_attribute attribute JOIN pg_class relation ON relation.oid=attribute.attrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace CROSS JOIN LATERAL aclexplode(attribute.attacl) acl WHERE (namespace.nspname,relation.relname) IN (('work','requests'),('governance','request_classification_versions'),('ai','domain_execution_constraints')) AND acl.is_grantable AND pg_has_role($1,acl.grantee,'USAGE')) AS runtime_grant_option,
    has_table_privilege('public','work.requests','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS public_requests_privilege,
    has_table_privilege('public','governance.request_classification_versions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS public_classifications_privilege,
    has_schema_privilege('public','work','CREATE') AS public_work_create,has_schema_privilege('public','governance','CREATE') AS public_governance_create,has_schema_privilege('public','ai','CREATE') AS public_ai_create`,
    [input.runtimeRole, input.aclAdminRole, input.migrationRole],
  );
  const checks = result.rows[0] ?? {};
  const requiredTrue = [
    "role_attributes_safe",
    "forbidden_membership_absent",
    "work_usage",
    "governance_usage",
    "ai_usage",
    "schema_create_absent",
    "requests_select",
    "requests_insert",
    "classifications_select",
    "classifications_insert",
    "policy_select",
    "forbidden_table_privileges_absent",
    "allowed_columns_exact",
    "updated_at_trigger_managed",
  ];
  const requiredFalse = [
    "runtime_owns_object",
    "runtime_grant_option",
    "public_requests_privilege",
    "public_classifications_privilege",
    "public_work_create",
    "public_governance_create",
    "public_ai_create",
  ];
  const pass =
    (input.requireRuntimeIdentity === false ||
      checks.identity_matches === true) &&
    requiredTrue.every((key) => checks[key] === true) &&
    requiredFalse.every((key) => checks[key] === false);
  return { checks, status: pass ? "PASS" : "FAILED" };
}
