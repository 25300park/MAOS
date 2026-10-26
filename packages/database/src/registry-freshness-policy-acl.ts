import type { MigrationDatabase } from "./types.js";

export interface RegistryFreshnessPolicyAclInput {
  readonly aclAdminRole: string;
  readonly bootstrapMode?: "PROVIDER_BOOTSTRAP_ADMIN";
  readonly canonicalRoleContract: {
    readonly environment: string;
    readonly migrationRole: string;
    readonly runtimeRole: string;
    readonly stewardRole: string;
  };
  readonly environment: string;
  readonly migrationRole: string;
  readonly runtimeRole: string;
  readonly stewardRole: string;
}

export interface RegistryFreshnessPolicyAclResult {
  readonly statementCount: number;
  readonly status: "APPLIED" | "REUSED";
}

export interface RegistryFreshnessPolicyAclVerificationResult {
  readonly checks: Readonly<Record<string, boolean>>;
  readonly status: "PASS" | "FAILED";
}

const policyTables = [
  "governance.registry_freshness_policy_versions",
  "governance.registry_freshness_policy_activation_events",
] as const;

const migrationOwnedObjectManifest = Object.freeze({
  functions: [
    {
      identity_arguments: "text, text",
      name: "registry_freshness_applicability_fingerprint",
      object_type: "FUNCTION",
      schema_name: "governance",
    },
    {
      identity_arguments: "",
      name: "reject_registry_freshness_policy_mutation",
      object_type: "FUNCTION",
      schema_name: "governance",
    },
    {
      identity_arguments: "",
      name: "guard_registry_freshness_policy_append",
      object_type: "FUNCTION",
      schema_name: "governance",
    },
    {
      identity_arguments: "",
      name: "guard_registry_freshness_policy_activation_append",
      object_type: "FUNCTION",
      schema_name: "governance",
    },
  ],
  indexes: [
    [
      "ai",
      "domain_execution_constraints_pkey",
      "ai",
      "domain_execution_constraints",
    ],
    [
      "ai",
      "domain_execution_constraints_domain_key_key",
      "ai",
      "domain_execution_constraints",
    ],
    [
      "ai",
      "domain_execution_constraints_id_policy_version_key",
      "ai",
      "domain_execution_constraints",
    ],
    [
      "governance",
      "registry_freshness_policy_versions_pkey",
      "governance",
      "registry_freshness_policy_versions",
    ],
    [
      "governance",
      "registry_freshness_policy_versions_identity_key",
      "governance",
      "registry_freshness_policy_versions",
    ],
    [
      "governance",
      "registry_freshness_policy_versions_number_key",
      "governance",
      "registry_freshness_policy_versions",
    ],
    [
      "governance",
      "registry_freshness_policy_versions_idempotency_key",
      "governance",
      "registry_freshness_policy_versions",
    ],
    [
      "governance",
      "registry_freshness_policy_versions_head_idx",
      "governance",
      "registry_freshness_policy_versions",
    ],
    [
      "governance",
      "registry_freshness_policy_versions_applicability_idx",
      "governance",
      "registry_freshness_policy_versions",
    ],
    [
      "governance",
      "registry_freshness_policy_activation_events_pkey",
      "governance",
      "registry_freshness_policy_activation_events",
    ],
    [
      "governance",
      "registry_freshness_policy_activation_events_sequence_key",
      "governance",
      "registry_freshness_policy_activation_events",
    ],
    [
      "governance",
      "registry_freshness_policy_activation_events_scope_sequence_key",
      "governance",
      "registry_freshness_policy_activation_events",
    ],
    [
      "governance",
      "registry_freshness_policy_activation_events_idempotency_key",
      "governance",
      "registry_freshness_policy_activation_events",
    ],
    [
      "governance",
      "registry_freshness_policy_activation_events_head_idx",
      "governance",
      "registry_freshness_policy_activation_events",
    ],
    [
      "governance",
      "registry_freshness_policy_activation_events_policy_idx",
      "governance",
      "registry_freshness_policy_activation_events",
    ],
  ].map(([schema_name, name, parent_schema_name, parent_name]) => ({
    name,
    object_type: "INDEX",
    parent_name,
    parent_schema_name,
    schema_name,
  })),
  sequences: [],
  tables: [
    ["ai", "domain_execution_constraints"],
    ["governance", "registry_freshness_policy_versions"],
    ["governance", "registry_freshness_policy_activation_events"],
  ].map(([schema_name, name]) => ({
    name,
    object_type: "TABLE",
    schema_name,
  })),
  triggers: [
    [
      "ai",
      "domain_execution_constraints",
      "domain_execution_constraints_guard_development",
    ],
    [
      "governance",
      "registry_freshness_policy_versions",
      "registry_freshness_policy_versions_guard_insert",
    ],
    [
      "governance",
      "registry_freshness_policy_versions",
      "registry_freshness_policy_versions_reject_mutation",
    ],
    [
      "governance",
      "registry_freshness_policy_activation_events",
      "registry_freshness_policy_activation_events_guard_insert",
    ],
    [
      "governance",
      "registry_freshness_policy_activation_events",
      "registry_freshness_policy_activation_events_reject_mutation",
    ],
  ].map(([schema_name, parent_name, name]) => ({
    name,
    object_type: "TRIGGER",
    parent_name,
    schema_name,
  })),
  types: [
    ["ai", "domain_execution_constraints"],
    ["ai", "_domain_execution_constraints"],
    ["governance", "registry_freshness_policy_versions"],
    ["governance", "_registry_freshness_policy_versions"],
    ["governance", "registry_freshness_policy_activation_events"],
    ["governance", "_registry_freshness_policy_activation_events"],
  ].map(([schema_name, name]) => ({
    name,
    object_type: "TYPE",
    schema_name,
  })),
});

const canonicalEnvironments = new Set([
  "development",
  "preview",
  "staging",
  "production",
]);
const roleIdentifierPattern = /^[A-Za-z_][A-Za-z0-9_$]*$/u;

export const REGISTRY_FRESHNESS_POLICY_ROLE_IDENTIFIERS = Object.freeze({
  applicationRuntime: "APPLICATION_RUNTIME",
  migrationOwner: "MIGRATION_OWNER",
  steward: "MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD",
} as const);

function validateRegistryFreshnessPolicyAclInput(
  input: RegistryFreshnessPolicyAclInput,
): void {
  if (!canonicalEnvironments.has(input.environment))
    throw new Error("REGISTRY_FRESHNESS_ACL_ENVIRONMENT_INVALID");
  if (!canonicalEnvironments.has(input.canonicalRoleContract.environment))
    throw new Error("REGISTRY_FRESHNESS_ACL_ENVIRONMENT_INVALID");

  const roles = [
    input.aclAdminRole,
    input.migrationRole,
    input.runtimeRole,
    input.stewardRole,
    input.canonicalRoleContract.migrationRole,
    input.canonicalRoleContract.runtimeRole,
    input.canonicalRoleContract.stewardRole,
  ];
  if (roles.some((role) => !roleIdentifierPattern.test(role)))
    throw new Error("REGISTRY_FRESHNESS_ACL_ROLE_INVALID");
  if (
    new Set([
      input.aclAdminRole,
      input.migrationRole,
      input.runtimeRole,
      input.stewardRole,
    ]).size !== 4
  )
    throw new Error("REGISTRY_FRESHNESS_ACL_ROLE_MAPPING_AMBIGUOUS");

  if (
    input.environment !== input.canonicalRoleContract.environment ||
    input.migrationRole !== input.canonicalRoleContract.migrationRole ||
    input.runtimeRole !== input.canonicalRoleContract.runtimeRole ||
    input.stewardRole !== input.canonicalRoleContract.stewardRole
  )
    throw new Error("REGISTRY_FRESHNESS_ACL_ROLE_CONTRACT_MISMATCH");
}

async function requireCanonicalRoleMapping(
  database: Pick<MigrationDatabase, "query">,
  input: RegistryFreshnessPolicyAclInput,
): Promise<void> {
  const roles = [
    input.aclAdminRole,
    input.migrationRole,
    input.runtimeRole,
    input.stewardRole,
  ];
  const result = await database.query<{ role_count: string }>(
    `SELECT count(*)::text AS role_count
       FROM pg_roles
      WHERE rolname=ANY($1::text[])`,
    [roles],
  );
  if (result.rows[0]?.role_count !== String(roles.length))
    throw new Error("REGISTRY_FRESHNESS_ACL_ROLE_NOT_FOUND");
}

export function buildRegistryFreshnessPolicyAclStatements(input: {
  readonly runtimeRole: string;
  readonly stewardRole: string;
}): readonly string[] {
  const [versions, activations] = policyTables;
  return Object.freeze([
    `REVOKE ALL ON ${versions} FROM PUBLIC`,
    `REVOKE ALL ON ${activations} FROM PUBLIC`,
    `GRANT USAGE ON SCHEMA governance TO ${input.runtimeRole}`,
    `GRANT SELECT ON ${versions} TO ${input.runtimeRole}`,
    `GRANT SELECT ON ${activations} TO ${input.runtimeRole}`,
    `GRANT USAGE ON SCHEMA governance TO ${input.stewardRole}`,
    `GRANT SELECT, INSERT ON ${versions} TO ${input.stewardRole}`,
    `GRANT SELECT, INSERT ON ${activations} TO ${input.stewardRole}`,
  ]);
}

async function quoteExistingRole(
  database: Pick<MigrationDatabase, "query">,
  roleName: string,
): Promise<string> {
  const result = await database.query<{ quoted: string }>(
    "SELECT quote_ident(rolname) AS quoted FROM pg_roles WHERE rolname=$1",
    [roleName],
  );
  const quoted = result.rows[0]?.quoted;
  if (!quoted) throw new Error("REGISTRY_FRESHNESS_ACL_ROLE_NOT_FOUND");
  return quoted;
}

async function verifyAclAdminAuthority(
  database: Pick<MigrationDatabase, "query">,
  input: RegistryFreshnessPolicyAclInput,
): Promise<boolean> {
  const result = await database.query<{
    current_role_matches: boolean;
    direct_or_owner_member: boolean;
    provider_bootstrap_admin: boolean;
    roles_distinct: boolean;
  }>(
    `SELECT
      current_user=$1 AS current_role_matches,
      $1<>$2 AND $1<>$3 AND $1<>$4 AND $2<>$3 AND $2<>$4 AND $3<>$4 AS roles_distinct,
      COALESCE((
        SELECT bool_and(current_user=owner.rolname OR pg_has_role(current_user,owner.oid,'MEMBER'))
        FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        JOIN pg_roles owner ON owner.oid=relation.relowner
        WHERE (namespace.nspname,relation.relname) IN (
          ('governance','registry_freshness_policy_versions'),
          ('governance','registry_freshness_policy_activation_events')
        )
      ),false) AS direct_or_owner_member,
      COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),false)
        AND $5='PROVIDER_BOOTSTRAP_ADMIN' AND $6='staging'
        AS provider_bootstrap_admin`,
    [
      input.aclAdminRole,
      input.migrationRole,
      input.runtimeRole,
      input.stewardRole,
      input.bootstrapMode ?? "STANDARD",
      input.environment,
    ],
  );
  const row = result.rows[0];
  return Boolean(
    row?.current_role_matches &&
    row.roles_distinct &&
    (row.direct_or_owner_member || row.provider_bootstrap_admin),
  );
}

export async function verifyRegistryFreshnessPolicyAcl(
  database: Pick<MigrationDatabase, "query">,
  input: RegistryFreshnessPolicyAclInput,
): Promise<RegistryFreshnessPolicyAclVerificationResult> {
  validateRegistryFreshnessPolicyAclInput(input);
  await requireCanonicalRoleMapping(database, input);
  const result = await database.query<Record<string, boolean>>(
    `SELECT
      current_user=$4 AS acl_admin_identity_matches,
      COALESCE((SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname=$1),false) AS runtime_attributes_safe,
      COALESCE((SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname=$2),false) AS steward_attributes_safe,
      COALESCE((SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname=$3),false)
        AND NOT has_database_privilege($3,current_database(),'CREATE')
        AS migration_attributes_safe,
      NOT pg_has_role($1,$3,'MEMBER') AND NOT pg_has_role($1,$4,'MEMBER')
        AND NOT EXISTS (SELECT 1 FROM pg_roles inherited
          WHERE inherited.rolname<>$1 AND pg_has_role($1,inherited.oid,'MEMBER')
            AND (inherited.rolsuper OR inherited.rolcreatedb OR inherited.rolcreaterole
              OR inherited.rolreplication OR inherited.rolbypassrls))
        AS runtime_privileged_membership_absent,
      NOT pg_has_role($2,$3,'MEMBER') AND NOT pg_has_role($2,$4,'MEMBER')
        AND NOT EXISTS (SELECT 1 FROM pg_roles inherited
          WHERE inherited.rolname<>$2 AND pg_has_role($2,inherited.oid,'MEMBER')
            AND (inherited.rolsuper OR inherited.rolcreatedb OR inherited.rolcreaterole
              OR inherited.rolreplication OR inherited.rolbypassrls))
        AS steward_privileged_membership_absent,
      NOT EXISTS (SELECT 1 FROM pg_roles inherited
        WHERE inherited.rolname<>$3 AND pg_has_role($3,inherited.oid,'MEMBER'))
        AS migration_privileged_membership_absent,
      has_schema_privilege($1,'governance','USAGE') AS runtime_schema_usage,
      NOT has_schema_privilege($1,'governance','CREATE') AS runtime_schema_create_absent,
      has_table_privilege($1,'governance.registry_freshness_policy_versions','SELECT') AS runtime_versions_select,
      has_table_privilege($1,'governance.registry_freshness_policy_activation_events','SELECT') AS runtime_activations_select,
      NOT has_table_privilege($1,'governance.registry_freshness_policy_versions','INSERT')
        AND NOT has_table_privilege($1,'governance.registry_freshness_policy_versions','UPDATE')
        AND NOT has_table_privilege($1,'governance.registry_freshness_policy_versions','DELETE')
        AND NOT has_table_privilege($1,'governance.registry_freshness_policy_versions','TRUNCATE')
        AND NOT has_table_privilege($1,'governance.registry_freshness_policy_versions','REFERENCES')
        AND NOT has_table_privilege($1,'governance.registry_freshness_policy_versions','TRIGGER')
        AND NOT has_table_privilege($1,'governance.registry_freshness_policy_activation_events','INSERT')
        AND NOT has_table_privilege($1,'governance.registry_freshness_policy_activation_events','UPDATE')
        AND NOT has_table_privilege($1,'governance.registry_freshness_policy_activation_events','DELETE')
        AND NOT has_table_privilege($1,'governance.registry_freshness_policy_activation_events','TRUNCATE')
        AND NOT has_table_privilege($1,'governance.registry_freshness_policy_activation_events','REFERENCES')
        AND NOT has_table_privilege($1,'governance.registry_freshness_policy_activation_events','TRIGGER')
        AS runtime_mutation_absent,
      NOT EXISTS (
        SELECT 1 FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='governance'
          AND relation.relname IN (
            'request_routing_decision_streams',
            'request_routing_decision_versions',
            'request_routing_candidate_snapshots'
          )
          AND has_table_privilege($1,relation.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      ) AS runtime_routing_mutation_absent,
      NOT EXISTS (
        SELECT 1 FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='governance'
          AND relation.relkind IN ('r','p','v','m','f')
          AND relation.relname NOT IN (
            'registry_freshness_policy_versions',
            'registry_freshness_policy_activation_events',
            'request_classification_versions'
          )
          AND has_table_privilege($1,relation.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      ) AND NOT has_table_privilege(
        $1,'governance.request_classification_versions',
        'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      ) AS runtime_unrelated_governance_mutation_absent,
      has_schema_privilege($2,'governance','USAGE') AS steward_schema_usage,
      NOT has_schema_privilege($2,'governance','CREATE') AS steward_schema_create_absent,
      has_table_privilege($2,'governance.registry_freshness_policy_versions','SELECT')
        AND has_table_privilege($2,'governance.registry_freshness_policy_versions','INSERT')
        AS steward_versions_append_read,
      has_table_privilege($2,'governance.registry_freshness_policy_activation_events','SELECT')
        AND has_table_privilege($2,'governance.registry_freshness_policy_activation_events','INSERT')
        AS steward_activations_append_read,
      NOT has_table_privilege($2,'governance.registry_freshness_policy_versions','UPDATE')
        AND NOT has_table_privilege($2,'governance.registry_freshness_policy_versions','DELETE')
        AND NOT has_table_privilege($2,'governance.registry_freshness_policy_versions','TRUNCATE')
        AND NOT has_table_privilege($2,'governance.registry_freshness_policy_versions','REFERENCES')
        AND NOT has_table_privilege($2,'governance.registry_freshness_policy_versions','TRIGGER')
        AND NOT has_table_privilege($2,'governance.registry_freshness_policy_activation_events','UPDATE')
        AND NOT has_table_privilege($2,'governance.registry_freshness_policy_activation_events','DELETE')
        AND NOT has_table_privilege($2,'governance.registry_freshness_policy_activation_events','TRUNCATE')
        AND NOT has_table_privilege($2,'governance.registry_freshness_policy_activation_events','REFERENCES')
        AND NOT has_table_privilege($2,'governance.registry_freshness_policy_activation_events','TRIGGER')
        AS steward_broad_mutation_absent,
      NOT EXISTS (
        SELECT 1 FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='governance'
          AND relation.relkind IN ('r','p','v','m','f')
          AND relation.relname NOT IN (
            'registry_freshness_policy_versions',
            'registry_freshness_policy_activation_events'
          )
          AND has_table_privilege($2,relation.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      ) AS steward_unrelated_governance_mutation_absent,
      NOT EXISTS (
        SELECT 1 FROM pg_namespace namespace
        JOIN pg_roles owner ON owner.oid=namespace.nspowner
        WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
          AND (pg_has_role($1,owner.oid,'MEMBER') OR pg_has_role($2,owner.oid,'MEMBER'))
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        JOIN pg_roles owner ON owner.oid=relation.relowner
        WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
          AND (pg_has_role($1,owner.oid,'MEMBER') OR pg_has_role($2,owner.oid,'MEMBER'))
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_proc procedure
        JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
        JOIN pg_roles owner ON owner.oid=procedure.proowner
        WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
          AND (pg_has_role($1,owner.oid,'MEMBER') OR pg_has_role($2,owner.oid,'MEMBER'))
      ) AS runtime_steward_ownership_absent,
      NOT EXISTS (
        SELECT 1 FROM pg_namespace namespace
        CROSS JOIN LATERAL aclexplode(namespace.nspacl) acl
        WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
          AND acl.is_grantable
          AND (pg_has_role($1,acl.grantee,'USAGE') OR pg_has_role($2,acl.grantee,'USAGE'))
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        CROSS JOIN LATERAL aclexplode(relation.relacl) acl
        WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
          AND acl.is_grantable
          AND (pg_has_role($1,acl.grantee,'USAGE') OR pg_has_role($2,acl.grantee,'USAGE'))
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_attribute attribute
        JOIN pg_class relation ON relation.oid=attribute.attrelid
        JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
        WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
          AND acl.is_grantable
          AND (pg_has_role($1,acl.grantee,'USAGE') OR pg_has_role($2,acl.grantee,'USAGE'))
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_proc procedure
        JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
        CROSS JOIN LATERAL aclexplode(procedure.proacl) acl
        WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
          AND acl.is_grantable
          AND (pg_has_role($1,acl.grantee,'USAGE') OR pg_has_role($2,acl.grantee,'USAGE'))
      ) AS runtime_steward_grant_option_absent,
      NOT EXISTS (
        SELECT 1 FROM pg_namespace namespace
        CROSS JOIN LATERAL aclexplode(namespace.nspacl) acl
        WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
          AND acl.is_grantable AND pg_has_role($3,acl.grantee,'USAGE')
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        CROSS JOIN LATERAL aclexplode(relation.relacl) acl
        WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
          AND relation.relowner<>(SELECT oid FROM pg_roles WHERE rolname=$3)
          AND acl.is_grantable AND pg_has_role($3,acl.grantee,'USAGE')
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_attribute attribute
        JOIN pg_class relation ON relation.oid=attribute.attrelid
        JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
        WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
          AND relation.relowner<>(SELECT oid FROM pg_roles WHERE rolname=$3)
          AND acl.is_grantable AND pg_has_role($3,acl.grantee,'USAGE')
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_proc procedure
        JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
        CROSS JOIN LATERAL aclexplode(procedure.proacl) acl
        WHERE namespace.nspname !~ '^pg_' AND namespace.nspname<>'information_schema'
          AND procedure.proowner<>(SELECT oid FROM pg_roles WHERE rolname=$3)
          AND acl.is_grantable AND pg_has_role($3,acl.grantee,'USAGE')
      ) AS migration_grant_option_absent,
      has_schema_privilege($3,'work','USAGE')
        AND has_schema_privilege($3,'work','CREATE')
        AND has_schema_privilege($3,'governance','USAGE')
        AND has_schema_privilege($3,'governance','CREATE')
        AND has_schema_privilege($3,'ai','USAGE')
        AND has_schema_privilege($3,'ai','CREATE')
        AND has_schema_privilege($3,'core','USAGE')
        AND NOT has_schema_privilege($3,'core','CREATE')
        AND has_schema_privilege($3,'audit','USAGE')
        AND NOT has_schema_privilege($3,'audit','CREATE')
        AND NOT EXISTS (
          SELECT 1 FROM pg_namespace namespace
          WHERE namespace.nspname !~ '^pg_'
            AND namespace.nspname NOT IN (
              'information_schema','public','work','governance','ai','core','audit'
            )
            AND has_schema_privilege($3,namespace.oid,'USAGE,CREATE')
        ) AS migration_schema_authority_exact,
      NOT EXISTS (
        SELECT 1 FROM pg_namespace namespace
        JOIN pg_roles owner ON owner.oid=namespace.nspowner
        WHERE namespace.nspname !~ '^pg_'
          AND namespace.nspname<>'information_schema'
          AND owner.rolname=$3
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        JOIN pg_roles owner ON owner.oid=relation.relowner
        WHERE namespace.nspname !~ '^pg_'
          AND namespace.nspname<>'information_schema'
          AND owner.rolname=$3
          AND NOT (
            relation.relkind IN ('r','p') AND EXISTS (
              SELECT 1
              FROM jsonb_to_recordset($5::jsonb) AS allowed(
                schema_name text,
                name text,
                object_type text
              )
              WHERE allowed.object_type='TABLE'
                AND allowed.schema_name=namespace.nspname
                AND allowed.name=relation.relname
            )
            OR (
              relation.relkind='i'
              AND EXISTS (
                SELECT 1 FROM pg_index index_entry
                JOIN pg_class parent ON parent.oid=index_entry.indrelid
                JOIN pg_namespace parent_namespace ON parent_namespace.oid=parent.relnamespace
                JOIN jsonb_to_recordset($6::jsonb) AS allowed(
                  schema_name text,
                  name text,
                  object_type text,
                  parent_schema_name text,
                  parent_name text
                ) ON allowed.object_type='INDEX'
                  AND allowed.schema_name=namespace.nspname
                  AND allowed.name=relation.relname
                  AND allowed.parent_schema_name=parent_namespace.nspname
                  AND allowed.parent_name=parent.relname
                WHERE index_entry.indexrelid=relation.oid
              )
            )
          )
      ) AND NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset($5::jsonb) AS allowed(
          schema_name text,
          name text,
          object_type text
        )
        LEFT JOIN pg_namespace namespace ON namespace.nspname=allowed.schema_name
        LEFT JOIN pg_class relation ON relation.relnamespace=namespace.oid
          AND relation.relname=allowed.name
          AND relation.relkind IN ('r','p')
        LEFT JOIN pg_roles owner ON owner.oid=relation.relowner
        WHERE allowed.object_type<>'TABLE'
          OR relation.oid IS NULL
          OR owner.rolname<>$3
      ) AND NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset($6::jsonb) AS allowed(
          schema_name text,
          name text,
          object_type text,
          parent_schema_name text,
          parent_name text
        )
        LEFT JOIN pg_namespace namespace ON namespace.nspname=allowed.schema_name
        LEFT JOIN pg_class relation ON relation.relnamespace=namespace.oid
          AND relation.relname=allowed.name
          AND relation.relkind='i'
        LEFT JOIN pg_roles owner ON owner.oid=relation.relowner
        LEFT JOIN pg_index index_entry ON index_entry.indexrelid=relation.oid
        LEFT JOIN pg_class parent ON parent.oid=index_entry.indrelid
        LEFT JOIN pg_namespace parent_namespace ON parent_namespace.oid=parent.relnamespace
        WHERE allowed.object_type<>'INDEX'
          OR relation.oid IS NULL
          OR owner.rolname<>$3
          OR parent_namespace.nspname<>allowed.parent_schema_name
          OR parent.relname<>allowed.parent_name
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_proc procedure
        JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
        JOIN pg_roles owner ON owner.oid=procedure.proowner
        WHERE namespace.nspname !~ '^pg_'
          AND namespace.nspname<>'information_schema'
          AND owner.rolname=$3
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_to_recordset($7::jsonb) AS allowed(
              schema_name text,
              name text,
              object_type text,
              identity_arguments text
            )
            WHERE allowed.object_type='FUNCTION'
              AND allowed.schema_name=namespace.nspname
              AND allowed.name=procedure.proname
              AND allowed.identity_arguments=oidvectortypes(procedure.proargtypes)
          )
      ) AND NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset($7::jsonb) AS allowed(
          schema_name text,
          name text,
          object_type text,
          identity_arguments text
        )
        LEFT JOIN pg_namespace namespace ON namespace.nspname=allowed.schema_name
        LEFT JOIN pg_proc procedure ON procedure.pronamespace=namespace.oid
          AND procedure.proname=allowed.name
          AND oidvectortypes(procedure.proargtypes)=allowed.identity_arguments
        LEFT JOIN pg_roles owner ON owner.oid=procedure.proowner
        WHERE allowed.object_type<>'FUNCTION'
          OR procedure.oid IS NULL
          OR owner.rolname<>$3
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_type type_entry
        JOIN pg_namespace namespace ON namespace.oid=type_entry.typnamespace
        JOIN pg_roles owner ON owner.oid=type_entry.typowner
        WHERE namespace.nspname !~ '^pg_'
          AND namespace.nspname<>'information_schema'
          AND owner.rolname=$3
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_to_recordset($8::jsonb) AS allowed(
              schema_name text,
              name text,
              object_type text
            )
            WHERE allowed.object_type='TYPE'
              AND allowed.schema_name=namespace.nspname
              AND allowed.name=type_entry.typname
          )
      ) AND NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset($8::jsonb) AS allowed(
          schema_name text,
          name text,
          object_type text
        )
        LEFT JOIN pg_namespace namespace ON namespace.nspname=allowed.schema_name
        LEFT JOIN pg_type type_entry ON type_entry.typnamespace=namespace.oid
          AND type_entry.typname=allowed.name
        LEFT JOIN pg_roles owner ON owner.oid=type_entry.typowner
        WHERE allowed.object_type<>'TYPE'
          OR type_entry.oid IS NULL
          OR owner.rolname<>$3
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_trigger trigger_entry
        JOIN pg_class parent ON parent.oid=trigger_entry.tgrelid
        JOIN pg_namespace namespace ON namespace.oid=parent.relnamespace
        JOIN pg_roles owner ON owner.oid=parent.relowner
        WHERE NOT trigger_entry.tgisinternal
          AND owner.rolname=$3
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_to_recordset($9::jsonb) AS allowed(
              schema_name text,
              parent_name text,
              name text,
              object_type text
            )
            WHERE allowed.object_type='TRIGGER'
              AND allowed.schema_name=namespace.nspname
              AND allowed.parent_name=parent.relname
              AND allowed.name=trigger_entry.tgname
          )
      ) AND NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset($9::jsonb) AS allowed(
          schema_name text,
          parent_name text,
          name text,
          object_type text
        )
        LEFT JOIN pg_namespace namespace ON namespace.nspname=allowed.schema_name
        LEFT JOIN pg_class parent ON parent.relnamespace=namespace.oid
          AND parent.relname=allowed.parent_name
        LEFT JOIN pg_roles owner ON owner.oid=parent.relowner
        LEFT JOIN pg_trigger trigger_entry ON trigger_entry.tgrelid=parent.oid
          AND trigger_entry.tgname=allowed.name
          AND NOT trigger_entry.tgisinternal
        WHERE allowed.object_type<>'TRIGGER'
          OR trigger_entry.oid IS NULL
          OR owner.rolname<>$3
      ) AS migration_ownership_exact,
      NOT EXISTS (
        SELECT 1 FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname !~ '^pg_'
          AND namespace.nspname<>'information_schema'
          AND relation.relkind IN ('r','p','v','m','f')
          AND relation.relowner<>(SELECT oid FROM pg_roles WHERE rolname=$3)
          AND NOT CASE
            WHEN (namespace.nspname,relation.relname)=('core','schema_migrations')
              THEN has_table_privilege($3,relation.oid,'SELECT')
                AND has_table_privilege($3,relation.oid,'INSERT')
                AND NOT has_table_privilege(
                  $3,relation.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
                )
            WHEN (namespace.nspname,relation.relname) IN (
              ('core','organizations'),
              ('core','projects'),
              ('work','tasks'),
              ('audit','audit_records'),
              ('work','requests'),
              ('governance','request_classification_versions'),
              ('governance','approvals'),
              ('ai','model_providers'),
              ('ai','models'),
              ('ai','host_runtimes'),
              ('ai','model_host_bindings')
            ) THEN has_table_privilege($3,relation.oid,'REFERENCES')
              AND NOT has_table_privilege(
                $3,relation.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER'
              )
            ELSE NOT has_table_privilege(
              $3,relation.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
            )
          END
      ) AS migration_table_authority_exact,
      NOT has_table_privilege('public','governance.registry_freshness_policy_versions','SELECT')
        AND NOT has_table_privilege('public','governance.registry_freshness_policy_versions','INSERT')
        AND NOT has_table_privilege('public','governance.registry_freshness_policy_versions','UPDATE')
        AND NOT has_table_privilege('public','governance.registry_freshness_policy_versions','DELETE')
        AND NOT has_table_privilege('public','governance.registry_freshness_policy_versions','TRUNCATE')
        AND NOT has_table_privilege('public','governance.registry_freshness_policy_versions','REFERENCES')
        AND NOT has_table_privilege('public','governance.registry_freshness_policy_versions','TRIGGER')
        AND NOT has_table_privilege('public','governance.registry_freshness_policy_activation_events','SELECT')
        AND NOT has_table_privilege('public','governance.registry_freshness_policy_activation_events','INSERT')
        AND NOT has_table_privilege('public','governance.registry_freshness_policy_activation_events','UPDATE')
        AND NOT has_table_privilege('public','governance.registry_freshness_policy_activation_events','DELETE')
        AND NOT has_table_privilege('public','governance.registry_freshness_policy_activation_events','TRUNCATE')
        AND NOT has_table_privilege('public','governance.registry_freshness_policy_activation_events','REFERENCES')
        AND NOT has_table_privilege('public','governance.registry_freshness_policy_activation_events','TRIGGER')
        AS public_privileges_absent,
      NOT has_schema_privilege('public','governance','USAGE')
        AND NOT has_schema_privilege('public','governance','CREATE')
        AS public_schema_privileges_absent`,
    [
      input.runtimeRole,
      input.stewardRole,
      input.migrationRole,
      input.aclAdminRole,
      JSON.stringify(migrationOwnedObjectManifest.tables),
      JSON.stringify(migrationOwnedObjectManifest.indexes),
      JSON.stringify(migrationOwnedObjectManifest.functions),
      JSON.stringify(migrationOwnedObjectManifest.types),
      JSON.stringify(migrationOwnedObjectManifest.triggers),
    ],
  );
  const checks = result.rows[0] ?? {};
  const status = Object.values(checks).every((value) => value === true)
    ? "PASS"
    : "FAILED";
  return { checks, status };
}

export async function applyRegistryFreshnessPolicyAcl(
  database: Pick<MigrationDatabase, "query" | "exec">,
  input: RegistryFreshnessPolicyAclInput,
): Promise<RegistryFreshnessPolicyAclResult> {
  validateRegistryFreshnessPolicyAclInput(input);
  if (input.environment === "production")
    throw new Error("PRODUCTION_ACL_FORBIDDEN");
  const before = await verifyRegistryFreshnessPolicyAcl(database, input);
  if (before.status === "PASS") return { statementCount: 8, status: "REUSED" };
  if (!(await verifyAclAdminAuthority(database, input)))
    throw new Error("REGISTRY_FRESHNESS_ACL_ADMIN_PREFLIGHT_FAILED");

  const runtimeRole = await quoteExistingRole(database, input.runtimeRole);
  const stewardRole = await quoteExistingRole(database, input.stewardRole);
  const statements = buildRegistryFreshnessPolicyAclStatements({
    runtimeRole,
    stewardRole,
  });
  await database.exec("BEGIN");
  try {
    for (const statement of statements) await database.exec(statement);
    const after = await verifyRegistryFreshnessPolicyAcl(database, input);
    if (after.status !== "PASS")
      throw new Error("REGISTRY_FRESHNESS_ACL_POST_VERIFY_FAILED");
    await database.exec("COMMIT");
    return { statementCount: statements.length, status: "APPLIED" };
  } catch (error) {
    await database.exec("ROLLBACK");
    throw error;
  }
}
