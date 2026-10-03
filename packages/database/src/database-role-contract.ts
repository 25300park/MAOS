import type { MigrationDatabase } from "./types.js";

export interface DatabaseRoleContractInput {
  readonly migrationRole: string;
  readonly runtimeRole: string;
  readonly approvedOwnerRoles: readonly string[];
}
export interface DatabaseRolePreflightRow {
  readonly objectKind: string;
  readonly objectName: string;
  readonly ownerName: string | null;
  readonly requiredOperation: string;
  readonly requirement: "OWNER" | "PRIVILEGE" | "NO_OPERATION";
  readonly authority:
    | "DIRECT_OWNER"
    | "APPROVED_OWNER_ROLE"
    | "REQUIRED_PRIVILEGE"
    | "NOT_REQUIRED"
    | "DENIED"
    | "UNKNOWN";
  readonly result: "PASS" | "FAIL";
}
export interface DatabaseRolePreflightResult {
  readonly status: "PASS" | "FAILED";
  readonly currentUser: string;
  readonly rows: readonly DatabaseRolePreflightRow[];
}

const fixedObjects = [
  ["SCHEMA", "work", "CREATE_OBJECTS_AND_GRANT_RUNTIME_USAGE", "PRIVILEGE"],
  [
    "SCHEMA",
    "governance",
    "CREATE_OBJECTS_AND_GRANT_RUNTIME_USAGE",
    "PRIVILEGE",
  ],
  [
    "SCHEMA",
    "ai",
    "CREATE_DEPENDENT_OBJECTS_AND_GRANT_RUNTIME_USAGE",
    "PRIVILEGE",
  ],
  [
    "TABLE",
    "ai.domain_execution_constraints",
    "ALTER_TABLE_TRIGGER_AND_UPDATE",
    "OWNER",
  ],
  ["TABLE", "ai.role_compatibilities", "NONE", "NO_OPERATION"],
  ["TABLE", "core.schema_migrations", "SELECT_INSERT", "PRIVILEGE"],
  [
    "FUNCTION",
    "ai.guard_development_domain_constraint",
    "NONE",
    "NO_OPERATION",
  ],
  [
    "FUNCTION",
    "ai.guard_development_role_compatibility",
    "NONE",
    "NO_OPERATION",
  ],
  [
    "TRIGGER",
    "ai.domain_execution_constraints.domain_execution_constraints_guard_development",
    "COVERED_BY_PARENT_TABLE_OWNER",
    "NO_OPERATION",
  ],
  [
    "TRIGGER",
    "ai.role_compatibilities.role_compatibilities_guard_development",
    "NONE",
    "NO_OPERATION",
  ],
] as const;

export async function inspectDatabaseRoleContract(
  database: Pick<MigrationDatabase, "query" | "exec">,
  input: DatabaseRoleContractInput,
): Promise<DatabaseRolePreflightResult> {
  const identity = await database.query<{
    current_user: string;
    rolsuper: boolean;
  }>(
    `SELECT current_user, role.rolsuper FROM pg_roles role WHERE role.rolname=current_user`,
  );
  const current = identity.rows[0];
  if (
    !current ||
    current.current_user !== input.migrationRole ||
    current.rolsuper
  )
    return {
      status: "FAILED",
      currentUser: current?.current_user ?? "UNKNOWN",
      rows: [],
    };
  const catalog = await database.query<{
    object_exists?: boolean;
    object_kind: string;
    object_name: string;
    owner_name: string | null;
    privilege_satisfied?: boolean | null;
  }>(`WITH objects(object_kind,object_name) AS (VALUES ${fixedObjects.map(([kind, name]) => `('${kind}','${name}')`).join(",")}), catalog AS (
    SELECT objects.object_kind,objects.object_name,
      CASE objects.object_kind
       WHEN 'SCHEMA' THEN (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname=objects.object_name)
       WHEN 'TABLE' THEN (SELECT pg_get_userbyid(c.relowner) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=split_part(objects.object_name,'.',1) AND c.relname=split_part(objects.object_name,'.',2) AND c.relkind IN ('r','p'))
       WHEN 'FUNCTION' THEN (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=split_part(objects.object_name,'.',1) AND p.proname=split_part(objects.object_name,'.',2) LIMIT 1)
       WHEN 'TRIGGER' THEN (SELECT pg_get_userbyid(c.relowner) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=split_part(objects.object_name,'.',1) AND c.relname=split_part(objects.object_name,'.',2) AND t.tgname=split_part(objects.object_name,'.',3)) END owner_name
    FROM objects)
    SELECT catalog.*,(catalog.owner_name IS NOT NULL) AS object_exists,
      CASE catalog.object_name
       WHEN 'work' THEN has_schema_privilege(current_user,'work','USAGE') AND has_schema_privilege(current_user,'work','CREATE') AND EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='work' AND grantee.rolname=current_user AND acl.privilege_type='USAGE' AND acl.is_grantable)
       WHEN 'governance' THEN has_schema_privilege(current_user,'governance','USAGE') AND has_schema_privilege(current_user,'governance','CREATE') AND EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='governance' AND grantee.rolname=current_user AND acl.privilege_type='USAGE' AND acl.is_grantable)
       WHEN 'ai' THEN has_schema_privilege(current_user,'ai','USAGE') AND has_schema_privilege(current_user,'ai','CREATE') AND EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='ai' AND grantee.rolname=current_user AND acl.privilege_type='USAGE' AND acl.is_grantable)
       WHEN 'core.schema_migrations' THEN has_schema_privilege(current_user,'core','USAGE') AND has_table_privilege(current_user,'core.schema_migrations','SELECT') AND has_table_privilege(current_user,'core.schema_migrations','INSERT')
       ELSE NULL END AS privilege_satisfied
    FROM catalog ORDER BY 1,2`);
  const rows: DatabaseRolePreflightRow[] = [];
  for (const object of catalog.rows) {
    const definition = fixedObjects.find(
      ([kind, name]) =>
        kind === object.object_kind && name === object.object_name,
    );
    const requiredOperation = definition?.[2] ?? "UNKNOWN";
    const requirement = definition?.[3] ?? "OWNER";
    let authority: DatabaseRolePreflightRow["authority"] = "UNKNOWN";
    const objectExists = object.object_exists ?? object.owner_name !== null;
    if (!definition || !objectExists) authority = "UNKNOWN";
    else if (object.owner_name === input.runtimeRole) authority = "DENIED";
    else if (requirement === "NO_OPERATION") authority = "NOT_REQUIRED";
    else if (object.owner_name === input.migrationRole)
      authority = "DIRECT_OWNER";
    else if (requirement === "PRIVILEGE" && object.privilege_satisfied)
      authority = "REQUIRED_PRIVILEGE";
    else if (
      requirement === "OWNER" &&
      object.owner_name &&
      input.approvedOwnerRoles.includes(object.owner_name)
    ) {
      const membership = await database.query<{ allowed: boolean }>(
        "SELECT pg_has_role($1,$2,'MEMBER') AS allowed",
        [input.migrationRole, object.owner_name],
      );
      authority = membership.rows[0]?.allowed
        ? "APPROVED_OWNER_ROLE"
        : "DENIED";
    } else if (object.owner_name) authority = "DENIED";
    rows.push({
      objectKind: object.object_kind,
      objectName: object.object_name,
      ownerName: object.owner_name,
      requiredOperation,
      requirement,
      authority,
      result:
        authority === "DIRECT_OWNER" ||
        authority === "APPROVED_OWNER_ROLE" ||
        authority === "REQUIRED_PRIVILEGE" ||
        authority === "NOT_REQUIRED"
          ? "PASS"
          : "FAIL",
    });
  }
  const complete = fixedObjects.every(([kind, name]) =>
    rows.some((row) => row.objectKind === kind && row.objectName === name),
  );
  return {
    status:
      complete && rows.every((row) => row.result === "PASS")
        ? "PASS"
        : "FAILED",
    currentUser: current.current_user,
    rows,
  };
}
