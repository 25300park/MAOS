import type { MigrationDatabase } from "./types.js";

export interface DatabaseRoleContractInput {
  readonly migrationRole: string;
  readonly runtimeRole: string;
  readonly approvedOwnerRoles: readonly string[];
}

export type DatabaseRoleRequirement =
  | "OWNER_REQUIRED"
  | "SCHEMA_PRIVILEGE_REQUIRED"
  | "TABLE_PRIVILEGE_REQUIRED"
  | "REFERENCES_REQUIRED"
  | "NO_OPERATION";

export interface DatabaseRolePreflightRow {
  readonly objectKind: string;
  readonly objectName: string;
  readonly ownerName: string | null;
  readonly requiredOperation: string;
  readonly requirement: DatabaseRoleRequirement;
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
  ["SCHEMA", "work", "USAGE_CREATE", "SCHEMA_PRIVILEGE_REQUIRED"],
  ["SCHEMA", "governance", "USAGE_CREATE", "SCHEMA_PRIVILEGE_REQUIRED"],
  ["SCHEMA", "ai", "USAGE_CREATE", "SCHEMA_PRIVILEGE_REQUIRED"],
  ["SCHEMA", "core", "USAGE_ONLY", "SCHEMA_PRIVILEGE_REQUIRED"],
  ["SCHEMA", "audit", "USAGE_ONLY", "SCHEMA_PRIVILEGE_REQUIRED"],
  [
    "TABLE",
    "ai.domain_execution_constraints",
    "ALTER_TABLE_TRIGGER_UPDATE_AND_UNIQUE_INDEX",
    "OWNER_REQUIRED",
  ],
  ["TABLE", "ai.role_compatibilities", "NONE", "NO_OPERATION"],
  [
    "TABLE",
    "core.schema_migrations",
    "SELECT_INSERT",
    "TABLE_PRIVILEGE_REQUIRED",
  ],
  ["TABLE", "core.organizations", "REFERENCES", "REFERENCES_REQUIRED"],
  ["TABLE", "core.projects", "REFERENCES", "REFERENCES_REQUIRED"],
  ["TABLE", "work.tasks", "REFERENCES", "REFERENCES_REQUIRED"],
  ["TABLE", "audit.audit_records", "REFERENCES", "REFERENCES_REQUIRED"],
  ["TABLE", "work.requests", "REFERENCES", "REFERENCES_REQUIRED"],
  [
    "TABLE",
    "governance.request_classification_versions",
    "REFERENCES",
    "REFERENCES_REQUIRED",
  ],
  ["TABLE", "governance.approvals", "REFERENCES", "REFERENCES_REQUIRED"],
  ["TABLE", "ai.model_providers", "REFERENCES", "REFERENCES_REQUIRED"],
  ["TABLE", "ai.models", "REFERENCES", "REFERENCES_REQUIRED"],
  ["TABLE", "ai.host_runtimes", "REFERENCES", "REFERENCES_REQUIRED"],
  ["TABLE", "ai.model_host_bindings", "REFERENCES", "REFERENCES_REQUIRED"],
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
] as const satisfies readonly (readonly [
  string,
  string,
  string,
  DatabaseRoleRequirement,
])[];

interface RoleIdentity {
  can_create_database: boolean;
  current_user: string;
  rolbypassrls: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
  rolreplication: boolean;
  rolsuper: boolean;
  role_memberships: string[] | null;
}

export async function inspectDatabaseRoleContract(
  database: Pick<MigrationDatabase, "query" | "exec">,
  input: DatabaseRoleContractInput,
): Promise<DatabaseRolePreflightResult> {
  const identity = await database.query<RoleIdentity>(
    `SELECT current_user,
       role.rolsuper,
       role.rolcreatedb,
       role.rolcreaterole,
       role.rolreplication,
       role.rolbypassrls,
       has_database_privilege(current_user,current_database(),'CREATE') AS can_create_database,
       ARRAY(
         SELECT parent.rolname::text
         FROM pg_auth_members membership
         JOIN pg_roles parent ON parent.oid=membership.roleid
         WHERE membership.member=role.oid
         ORDER BY parent.rolname
       )::text[] AS role_memberships
     FROM pg_roles role WHERE role.rolname=current_user`,
  );
  const current = identity.rows[0];
  const memberships = current?.role_memberships ?? [];
  const unexpectedMembership = memberships.some(
    (role) => !input.approvedOwnerRoles.includes(role),
  );
  if (
    !current ||
    current.current_user !== input.migrationRole ||
    input.migrationRole === input.runtimeRole ||
    current.rolsuper ||
    current.rolcreatedb ||
    current.rolcreaterole ||
    current.rolreplication ||
    current.rolbypassrls ||
    current.can_create_database ||
    unexpectedMembership
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
       WHEN 'TRIGGER' THEN (SELECT pg_get_userbyid(c.relowner) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=split_part(objects.object_name,'.',1) AND c.relname=split_part(objects.object_name,'.',2) AND t.tgname=split_part(objects.object_name,'.',3)) END owner_name,
      CASE objects.object_kind
       WHEN 'SCHEMA' THEN (SELECT n.oid FROM pg_namespace n WHERE n.nspname=objects.object_name)
       WHEN 'TABLE' THEN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=split_part(objects.object_name,'.',1) AND c.relname=split_part(objects.object_name,'.',2) AND c.relkind IN ('r','p'))
       WHEN 'FUNCTION' THEN (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=split_part(objects.object_name,'.',1) AND p.proname=split_part(objects.object_name,'.',2) LIMIT 1)
       WHEN 'TRIGGER' THEN (SELECT c.oid FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=split_part(objects.object_name,'.',1) AND c.relname=split_part(objects.object_name,'.',2) AND t.tgname=split_part(objects.object_name,'.',3)) END object_oid
    FROM objects)
    SELECT catalog.*,(catalog.owner_name IS NOT NULL) AS object_exists,
      CASE catalog.object_name
       WHEN 'work' THEN has_schema_privilege(current_user,catalog.object_oid,'USAGE') AND has_schema_privilege(current_user,catalog.object_oid,'CREATE') AND NOT EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='work' AND grantee.rolname=current_user AND acl.is_grantable)
       WHEN 'governance' THEN has_schema_privilege(current_user,catalog.object_oid,'USAGE') AND has_schema_privilege(current_user,catalog.object_oid,'CREATE') AND NOT EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='governance' AND grantee.rolname=current_user AND acl.is_grantable)
       WHEN 'ai' THEN has_schema_privilege(current_user,catalog.object_oid,'USAGE') AND has_schema_privilege(current_user,catalog.object_oid,'CREATE') AND NOT EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='ai' AND grantee.rolname=current_user AND acl.is_grantable)
       WHEN 'core' THEN has_schema_privilege(current_user,catalog.object_oid,'USAGE') AND NOT has_schema_privilege(current_user,catalog.object_oid,'CREATE') AND NOT EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='core' AND grantee.rolname=current_user AND acl.is_grantable)
       WHEN 'audit' THEN has_schema_privilege(current_user,catalog.object_oid,'USAGE') AND NOT has_schema_privilege(current_user,catalog.object_oid,'CREATE') AND NOT EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='audit' AND grantee.rolname=current_user AND acl.is_grantable)
       WHEN 'core.schema_migrations' THEN has_table_privilege(current_user,catalog.object_oid,'SELECT') AND has_table_privilege(current_user,catalog.object_oid,'INSERT') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='core' AND c.relname='schema_migrations' AND grantee.rolname=current_user AND acl.is_grantable)
       WHEN 'core.organizations' THEN has_table_privilege(current_user,catalog.object_oid,'REFERENCES') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='core' AND c.relname='organizations' AND grantee.rolname=current_user AND acl.privilege_type='REFERENCES' AND acl.is_grantable)
       WHEN 'core.projects' THEN has_table_privilege(current_user,catalog.object_oid,'REFERENCES') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='core' AND c.relname='projects' AND grantee.rolname=current_user AND acl.privilege_type='REFERENCES' AND acl.is_grantable)
       WHEN 'work.tasks' THEN has_table_privilege(current_user,catalog.object_oid,'REFERENCES') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='work' AND c.relname='tasks' AND grantee.rolname=current_user AND acl.privilege_type='REFERENCES' AND acl.is_grantable)
       WHEN 'audit.audit_records' THEN has_table_privilege(current_user,catalog.object_oid,'REFERENCES') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='audit' AND c.relname='audit_records' AND grantee.rolname=current_user AND acl.privilege_type='REFERENCES' AND acl.is_grantable)
       WHEN 'work.requests' THEN has_table_privilege(current_user,catalog.object_oid,'REFERENCES') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='work' AND c.relname='requests' AND grantee.rolname=current_user AND acl.privilege_type='REFERENCES' AND acl.is_grantable)
       WHEN 'governance.request_classification_versions' THEN has_table_privilege(current_user,catalog.object_oid,'REFERENCES') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='governance' AND c.relname='request_classification_versions' AND grantee.rolname=current_user AND acl.privilege_type='REFERENCES' AND acl.is_grantable)
       WHEN 'governance.approvals' THEN has_table_privilege(current_user,catalog.object_oid,'REFERENCES') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='governance' AND c.relname='approvals' AND grantee.rolname=current_user AND acl.privilege_type='REFERENCES' AND acl.is_grantable)
       WHEN 'ai.model_providers' THEN has_table_privilege(current_user,catalog.object_oid,'REFERENCES') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='ai' AND c.relname='model_providers' AND grantee.rolname=current_user AND acl.privilege_type='REFERENCES' AND acl.is_grantable)
       WHEN 'ai.models' THEN has_table_privilege(current_user,catalog.object_oid,'REFERENCES') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='ai' AND c.relname='models' AND grantee.rolname=current_user AND acl.privilege_type='REFERENCES' AND acl.is_grantable)
       WHEN 'ai.host_runtimes' THEN has_table_privilege(current_user,catalog.object_oid,'REFERENCES') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='ai' AND c.relname='host_runtimes' AND grantee.rolname=current_user AND acl.privilege_type='REFERENCES' AND acl.is_grantable)
       WHEN 'ai.model_host_bindings' THEN has_table_privilege(current_user,catalog.object_oid,'REFERENCES') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE n.nspname='ai' AND c.relname='model_host_bindings' AND grantee.rolname=current_user AND acl.privilege_type='REFERENCES' AND acl.is_grantable)
       ELSE NULL END AS privilege_satisfied
    FROM catalog ORDER BY 1,2`);
  const rows: DatabaseRolePreflightRow[] = [];
  for (const object of catalog.rows) {
    const definition = fixedObjects.find(
      ([kind, name]) =>
        kind === object.object_kind && name === object.object_name,
    );
    const requiredOperation = definition?.[2] ?? "UNKNOWN";
    const requirement = definition?.[3] ?? "OWNER_REQUIRED";
    let authority: DatabaseRolePreflightRow["authority"] = "UNKNOWN";
    const objectExists = object.object_exists ?? object.owner_name !== null;
    if (!definition || !objectExists) authority = "UNKNOWN";
    else if (object.owner_name === input.runtimeRole) authority = "DENIED";
    else if (requirement === "NO_OPERATION") authority = "NOT_REQUIRED";
    else if (
      requirement === "OWNER_REQUIRED" &&
      object.owner_name === input.migrationRole
    )
      authority = "DIRECT_OWNER";
    else if (requirement !== "OWNER_REQUIRED" && object.privilege_satisfied)
      authority = "REQUIRED_PRIVILEGE";
    else if (
      requirement === "OWNER_REQUIRED" &&
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
