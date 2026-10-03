# MAOS Phase 15C Database Role Governance Contract

## 1. Status

- Contract: `MAOS_DATABASE_ROLE_CONTRACT_V1`
- Status: proposed canonical amendment, ready for written review
- Scope: database-role governance and verification design only
- Implementation, migration 0031, role provisioning, ACL mutation, deployment, Staging, and Production are not authorized by this document.

### 1.1 R2 operation-aware authority amendment

This amendment is authoritative over conflicting owner-only language below. Migration 0031 requires ownership only for `ai.domain_execution_constraints`; every other existing object is classified by the exact PostgreSQL operation actually performed.

The governed migration authority is exactly:

- owner: `ai.domain_execution_constraints`;
- schema: `USAGE, CREATE` on `work`, `governance`, and `ai`; `USAGE` only on `core`;
- migration registry: `SELECT, INSERT` on `core.schema_migrations`;
- foreign-key construction: `REFERENCES` on `core.organizations`, `core.projects`, and `work.tasks`;
- no `GRANT OPTION`, database `CREATE`, or `core` schema `CREATE`.

The principal must also be distinct from `APPLICATION_RUNTIME`, have no runtime/bootstrap/admin membership, and have `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, and `NOBYPASSRLS`. Preflight classifies rows as `OWNER_REQUIRED`, `SCHEMA_PRIVILEGE_REQUIRED`, `TABLE_PRIVILEGE_REQUIRED`, `REFERENCES_REQUIRED`, or `NO_OPERATION`; missing or ambiguous authority fails closed and is never repaired automatically.

Governed Staging/Production migration uses an explicit existing-registry mode. It performs no database/schema/table bootstrap, verifies that `core.schema_migrations` already exists with the canonical three-column/primary-key shape, and then uses only its approved `SELECT` and `INSERT` privileges. Missing `core`, missing registry, or incompatible registry shape fails before migration application. The existing ensure/create behavior remains only for explicitly authorized fresh/local initialization.

Migration 0031 performs no operation on `ai.role_compatibilities`, the two existing Development guard functions/triggers, or existing sequences; those rows are `NO_OPERATION`, not ownership requirements. Existing logical behavior remains protected by regression tests.

### 1.2 Post-migration ACL authority remains separate

`MIGRATION_OWNER` cannot execute the complete post-migration runtime ACL transaction without prohibited grant authority on schemas/objects it does not own. R2 therefore does not add `GRANT OPTION` and does not introduce a privileged mechanism. The recommended boundary is a separately approved, one-time provider/bootstrap administrator session that applies the fixed allowlisted ACL transaction, verifies effective runtime privileges and PUBLIC leakage, records redacted evidence, and disconnects immediately. An existing narrowly scoped approved administrative mechanism may be substituted only after separate review. Runtime readiness remains blocked between migration completion and successful ACL verification.

This contract separates semantic database authority from environment-specific PostgreSQL role names. It establishes two semantic role classes: `MIGRATION_OWNER` and `APPLICATION_RUNTIME`. It does not introduce a Phase 15C diagnostic login.

## 2. Problem

MAOS currently receives one opaque `DATABASE_URL`. The migration command and application runtime both connect through that contract. Migrations 0001 through 0030 create no roles, declare no owners, apply no grants or revocations, and establish no governed mapping from a semantic database authority to a physical PostgreSQL role.

That model cannot safely express Phase 15C least privilege. A runtime connection must not inherit DDL, ownership, role administration, or grant authority merely because the same credential previously applied migrations. Conversely, migration SQL must not hard-code environment-specific role names or create deployment credentials.

## 3. Existing Database Authority Model

The current model is environment-bound but not authority-separated:

- `packages/database/src/postgres.ts` opens the principal embedded in a supplied connection string.
- `scripts/database-migrate-postgres.ts` uses `DATABASE_URL` and does not execute `SET ROLE`.
- `apps/api/src/server.ts` opens runtime repositories through the same `DATABASE_URL` contract.
- `packages/config/src/index.ts` defines no migration-specific connection or role identifier.
- migrations 0001 through 0030 contain no `CREATE ROLE`, `CREATE USER`, `OWNER TO`, `GRANT`, `REVOKE`, `SET ROLE`, or `ALTER DEFAULT PRIVILEGES` statement.
- Phase 15B migrations 0029 and 0030 therefore ran as the connection principal and did not establish a reusable runtime ACL profile.

The provider may bind `DATABASE_URL` to an environment-specific role, but the repository does not currently prove that the migration and runtime principals are distinct. This contract replaces that ambiguity prospectively; it does not reinterpret historical migrations.

## 4. Semantic Role Classes

### 4.1 `MIGRATION_OWNER`

The governed schema-change principal. It executes approved migrations, creates or alters approved objects, owns newly created Phase 15C objects, writes migration metadata, and applies approved ACL transitions.

### 4.2 `APPLICATION_RUNTIME`

The application DML principal. It receives only the least-privilege union required by the Phase 15C Work Request Intake and Classification services. A single physical runtime principal does not merge those application authorities; repository and service boundaries remain separately enforced.

### 4.3 No Phase 15C diagnostic role

`DIAGNOSTIC_READONLY_REQUIRED = NO_FOR_PHASE15C`. Authorized application read APIs provide diagnostics. A direct database observer/login would be a new operational authority and requires separate governance.

## 5. Migration Owner Contract

`MIGRATION_OWNER` may:

- connect only for an explicitly governed migration or ACL operation;
- create and alter objects included in an approved migration;
- own the Phase 15C objects it creates;
- write canonical migration metadata;
- grant or revoke the exact ACL approved for the bound runtime role;
- inspect catalogs needed to prove owner, membership, privilege, and leakage state.

`MIGRATION_OWNER` must not:

- serve API, worker, portal, or ordinary application requests;
- execute ordinary application DML outside a bounded migration/verification transaction;
- be supplied as `DATABASE_URL` to an application service;
- delegate its authority through membership or `GRANT OPTION` to `APPLICATION_RUNTIME`;
- provision credentials or create deployment roles as part of migration 0031.

The physical role name is environment-bound and is never an architecture constant or SQL literal in a migration file.

### 5.1 Legacy object ownership bridge

`LEGACY_OBJECT_OWNER_MODEL = MODEL_A_BIND_MIGRATION_OWNER_TO_EXISTING_CANONICAL_OBJECT_OWNER`.

For Phase 15C, each governed environment must bind `MIGRATION_OWNER` to the existing legitimate physical principal that owns every pre-existing MAOS object migration 0031 must alter. That credential becomes migration-only; it must not remain an application runtime credential. The separately provisioned `APPLICATION_RUNTIME` principal receives only the reduced ACL in Section 7.

Model A is selected because it preserves historical ownership and introduces no ownership transfer or new owner-role membership. It is valid only when catalog evidence proves the approved migration principal has legitimate owner authority for every affected object.

The other models are not implicit fallbacks:

- **Model B — governed non-login owner role/membership:** not selected for Phase 15C. It may be proposed later only if repository and environment evidence proves an existing canonical owner role, bounded migration membership, and no `APPLICATION_RUNTIME` membership path.
- **Model C — governed ownership transfer:** not selected and never performed by migration 0031. Any required transfer is a separate infrastructure/bootstrap change with object-by-object downstream-impact review and Human authorization.
- **Model D — privileged/superuser migration principal:** rejected as the default architecture. Emergency use is unsupported by this contract and requires separate governance.

For each existing schema, table, function, trigger parent table, sequence, and migration metadata object migration 0031 needs to create within or alter, preflight must record:

- exact object identity and object kind;
- current owner resolved from the PostgreSQL catalogs;
- exact Phase 15C operation;
- bound migration principal and `current_user`;
- whether authority follows from direct ownership or separately approved owner-role membership;
- the catalog evidence for that authority;
- `PASS` or bounded `FAIL`.

Direct ownership is the Phase 15C default. Owner-role membership is acceptable only when it was separately approved and already exists; the preflight must prove `pg_has_role(current_user, owner, 'USAGE')` and the governed ability to assume the owner identity. Ordinary object privileges do not substitute for ownership where PostgreSQL requires owner authority.

`APPLICATION_RUNTIME` may never appear in the migration authority path, own an affected object, inherit the object owner, or provide credentials for migration 0031.

### 5.2 Required legacy object preflight matrix

The implementation must populate this matrix from the target database before migration 0031. The table below defines the minimum inventory; implementation may add discovered dependent objects but may not omit a row because the expected owner is unknown.

| Object | Catalog owner source | Required Phase 15C operation | Permitted migration authority path | Result |
| --- | --- | --- | --- | --- |
| schema `work` | `pg_namespace.nspowner` | create `work.requests` and its indexes/triggers/functions | bound principal directly owns schema, or separately approved existing owner-role authority | `PASS`/`FAIL` |
| schema `governance` | `pg_namespace.nspowner` | create classification table and its indexes/triggers/functions | same | `PASS`/`FAIL` |
| schema `ai` | `pg_namespace.nspowner` | alter domain-policy objects and create/replace approved guards | same | `PASS`/`FAIL` |
| `ai.domain_execution_constraints` | `pg_class.relowner` | extend the canonical policy contract while preserving Development delegation | bound principal directly owns table, or separately approved existing owner-role authority | `PASS`/`FAIL` |
| `ai.role_compatibilities` | `pg_class.relowner` | preserve or alter the Development compatibility guard if migration 0031 requires it | same | `PASS`/`FAIL` |
| `ai.guard_development_domain_constraint()` | `pg_proc.proowner` | replace/alter only if required by the approved migration | bound principal directly owns function, or separately approved existing owner-role authority | `PASS`/`FAIL` |
| `ai.guard_development_role_compatibility()` | `pg_proc.proowner` | replace/alter only if required by the approved migration | same | `PASS`/`FAIL` |
| `ai.domain_execution_constraints_guard_development` | parent table owner plus `pg_trigger` identity | preserve, replace, or recreate only if required | authority derives from proven ownership of `ai.domain_execution_constraints` | `PASS`/`FAIL` |
| `ai.role_compatibilities_guard_development` | parent table owner plus `pg_trigger` identity | preserve, replace, or recreate only if required | authority derives from proven ownership of `ai.role_compatibilities` | `PASS`/`FAIL` |
| `core.schema_migrations` | `pg_class.relowner` | record migration 0031 checksum/version | bound principal can write migration metadata and its owner path is proven | `PASS`/`FAIL` |
| every existing affected sequence | `pg_class.relowner` | alter/use only if the final migration requires it | direct owner or separately approved existing owner-role authority | `PASS`/`FAIL` |

New objects are owned directly by the bound `MIGRATION_OWNER`. Trigger authority is evaluated through the owner of the trigger's parent table because PostgreSQL triggers do not establish an independent owner identity.

If owners differ across required objects and the single approved principal cannot prove legal owner authority for all of them, migration 0031 is blocked. The preflight must not consolidate ownership, add memberships, or select another credential automatically.

## 6. Application Runtime Contract

`APPLICATION_RUNTIME` is the only Phase 15C application database login. It may exercise only the ACL in Section 7 and the separately approved pre-existing privileges required by existing organization, project, scope, identity, Audit, Evidence, and idempotency paths.

It must be a login role that is not a superuser and has no `CREATEDB`, `CREATEROLE`, `REPLICATION`, or `BYPASSRLS`. It must not own the database, relevant schemas, tables, functions, triggers, or sequences. It must not be a member of `MIGRATION_OWNER` or any role that confers equivalent authority.

Absolute denials are:

- no `CREATE`, `ALTER`, `DROP`, or other DDL;
- no `TRUNCATE`;
- no table `DELETE` unless separately approved outside this contract;
- no object, schema, or database ownership;
- no `GRANT OPTION`;
- no role administration or `CREATE ROLE`;
- no `SET ROLE` path to a more privileged identity;
- no PUBLIC-derived write authority;
- no credential or secret material in role metadata, evidence, or configuration identifiers.

## 7. Phase 15C ACL Matrix

| Semantic boundary | Object | Runtime permission | Explicit denial |
| --- | --- | --- | --- |
| Work Request Intake | schema `work` | `USAGE` | `CREATE` and ownership |
| Work Request Intake | `work.requests` | `SELECT`, `INSERT` | table-wide `UPDATE`, `DELETE`, `TRUNCATE`, references not otherwise required, trigger disablement |
| Work Request Intake | approved invalidation columns | column-level `UPDATE` only on `lifecycle_state`, `invalidated_by_actor_type`, `invalidated_by_actor_id`, `invalidation_reason_code`, and `invalidated_at`; the database trigger alone manages `updated_at` | every immutable request column and direct runtime assignment to `updated_at` |
| Classification | schema `governance` | `USAGE` | `CREATE` and ownership |
| Classification | `governance.request_classification_versions` | `SELECT`, `INSERT` | `UPDATE`, `DELETE`, `TRUNCATE` |
| Domain policy consumption | schema `ai` | `USAGE` | `CREATE` and ownership |
| Domain policy consumption | `ai.domain_execution_constraints` | `SELECT` | runtime mutation of policy rows |

If identity, organization, project, scope, Evidence, Audit, or idempotency access is required, Phase 15C consumes the existing approved privilege. It does not broaden that privilege or silently add new cross-domain write authority.

Sequences and functions receive only the exact privileges required by the final schema. Identity/default sequence access is not granted broadly. Trigger functions remain owner-controlled and are not directly executable by PUBLIC unless PostgreSQL requires invocation through the protected table operation and the verified function privilege model permits it.

## 8. Work Request / Classification Semantic Boundary

`WORK_REQUEST_INTAKE` and `CLASSIFICATION` remain distinct application authorities:

- Work Request Intake owns registration and the terminal `REGISTERED -> INVALIDATED` lifecycle.
- Classification receives a read port for request eligibility and owns immutable classification version appends.
- Classification cannot register or invalidate `work.requests`.
- Work Request Intake cannot append, validate, supersede, or select classification versions.

Phase 15C creates no separate PostgreSQL login for either service. Both map to the one physical `APPLICATION_RUNTIME` role, whose ACL is the bounded union above. Repository interfaces, authorization, database constraints, triggers, and Audit remain responsible for the semantic split. Future service decomposition may map these authorities to separate database principals without changing ownership semantics.

## 9. Environment Physical Binding

The canonical identifiers are semantic classes, not PostgreSQL role names:

- `MIGRATION_OWNER` maps to an environment-provisioned migration principal.
- `APPLICATION_RUNTIME` maps to an environment-provisioned application principal.

Physical names are non-secret environment configuration. Credentials and connection strings remain secret-provider material. The binding must prove exact role existence and attributes before migration or ACL work begins.

For governed Staging and Production, the two physical principals must be distinct, must not inherit one another, and must not converge through a shared privileged membership. Equality of role names, `current_user`, or effective privileged membership fails closed.

## 10. Connection Configuration Contract

The minimal future contract is:

| Variable | Meaning | Classification |
| --- | --- | --- |
| `DATABASE_URL` | `APPLICATION_RUNTIME` connection | secret |
| `MAOS_DATABASE_MIGRATION_URL` | `MIGRATION_OWNER` connection | secret |
| `MAOS_DATABASE_ACL_ADMIN_URL` | explicitly authorized ephemeral `EPHEMERAL_ACL_ADMIN` bootstrap connection | secret |
| `MAOS_DATABASE_RUNTIME_ROLE` | exact physical role name bound to `APPLICATION_RUNTIME` | non-secret identifier |
| `MAOS_DATABASE_MIGRATION_ROLE` | exact physical role name bound to `MIGRATION_OWNER` | non-secret identifier |
| `MAOS_DATABASE_ACL_ADMIN_ROLE` | exact physical role name bound to `EPHEMERAL_ACL_ADMIN` | non-secret identifier |

Runtime code reads only `DATABASE_URL`. Migration tooling requires `MAOS_DATABASE_MIGRATION_URL`. The separately invoked ACL bootstrap command requires `MAOS_DATABASE_ACL_ADMIN_URL`; it never falls back to either runtime or migration connection and normal API/Web/runtime composition never loads it. No command may print any URL.

Activation behavior:

- **Local development:** distinct roles are preferred. A shared connection may be permitted only by an explicit local/test-only compatibility option, only when `MAOS_ENV=development`, and never as evidence for Staging readiness.
- **Disposable tests:** the harness creates unique temporary physical role names and supplies both URLs/identifiers directly to the test process.
- **Staging:** runtime and migration connections/identifiers are required for migration. The ACL admin connection/identifier is additionally required only during an explicitly authorized ACL bootstrap. All three authorities remain distinct and no fallback is permitted.
- **Production:** the same separation is mandatory before any future Production authorization. No fallback is permitted.

After contract activation, absence, ambiguity, equality, mismatch with `current_user`, or a failed role-attribute check is a bounded configuration error, not a reason to reuse `DATABASE_URL`.

## 11. Migration Tool Binding

The selected mechanism is **C: a post-migration governed ACL step**.

Before migration SQL executes, a mandatory legacy-owner preflight connects through `MAOS_DATABASE_MIGRATION_URL`, verifies `current_user` against `MAOS_DATABASE_MIGRATION_ROLE`, populates the Section 5.2 matrix, and proves legal ALTER/create authority for every required existing object. The preflight performs no DDL, ownership change, membership change, grant, or migration metadata write. Any failed or indeterminate row stops before migration 0031 begins.

### Comparison

- **A — migration-runner substitution:** rejected for v1. The current checksum model applies immutable raw SQL. Introducing role substitution into migration text creates checksum, replay, and injection complexity.
- **B — pre-migration bootstrap ACL:** rejected for object ACL. The Phase 15C objects do not yet exist, and broad default privileges risk granting future unrelated objects.
- **C — post-migration governed ACL:** selected. Provision roles first, apply immutable migration SQL as `MIGRATION_OWNER`, then apply the exact ACL in a separate governed transaction before runtime readiness is allowed.

The ACL step accepts `MAOS_DATABASE_RUNTIME_ROLE` as data, not SQL. It must:

1. connect only through `MAOS_DATABASE_ACL_ADMIN_URL`;
2. verify `current_user` exactly matches `MAOS_DATABASE_ACL_ADMIN_ROLE` and is neither migration nor runtime principal;
3. resolve exactly one `pg_roles` row for `MAOS_DATABASE_RUNTIME_ROLE` using a parameterized query;
4. verify all nine fixed operations are authorized by direct ownership, approved owner-role membership, or the exact required grant option, with no privileged/superuser assumption;
5. obtain the SQL identifier using PostgreSQL `quote_ident($1)` and interpolate only that server-quoted identifier into a fixed, allowlisted ACL statement set;
6. apply revocations and grants in one transaction;
7. verify the effective ACL matrix and PUBLIC leakage before commit;
8. replay the exact deterministic contract as `REUSED`, fail closed on contract/role-binding conflict, return only bounded non-secret evidence, and disconnect the ACL admin before runtime verification.

No caller-supplied SQL fragment, schema name, table name, privilege list, or connection-string component may enter the statement template.

The schema migration and ACL operation are two governed stages. Runtime deployment/readiness remains denied between them. ACL failure leaves migration history intact, leaves runtime disabled, and permits idempotent ACL retry after the binding defect is corrected.

## 12. Provisioning Boundary

PostgreSQL role creation, role attributes, memberships, credential issuance, secret storage, rotation, and revocation are deployment-infrastructure responsibilities. They are not migration 0031 responsibilities.

The required order is:

1. infrastructure provisions distinct physical principals and secret references;
2. preflight proves target environment and role bindings without exposing credentials;
3. legacy-owner preflight proves the complete object matrix and migration authority path;
4. `MIGRATION_OWNER` applies migration 0031;
5. the governed ACL step applies and verifies the v1 profile;
6. runtime connects as `APPLICATION_RUNTIME` and passes denial/allowance verification;
7. only then may the environment become ready.

Migration 0031 must not create roles, alter role attributes, store credentials, or hard-code role names.

## 13. Disposable PostgreSQL Verification Harness

The initial harness uses the already installed PostgreSQL binaries (`initdb`, `pg_ctl`, `postgres`, `createdb`, and `psql`) to create an isolated temporary cluster on a random loopback port. This is lower risk for the present repository than adding Testcontainers or requiring Docker, because no Testcontainers dependency exists and the Docker daemon is not available. The harness must remain replaceable by a container-backed adapter for CI portability.

The harness must:

1. create a new temporary data directory outside the repository;
2. initialize a loopback-only disposable cluster with bounded lifetime;
3. generate random test-only migration/runtime role names and credentials in process memory;
4. create distinct roles with the exact negative attributes required above;
5. create representative legacy objects under the migration principal and prove the owner matrix passes;
6. prove a different unapproved principal, the runtime principal, missing membership, and indeterminate ownership all block before migration;
7. apply migrations through the migration principal;
8. run the governed ACL step;
9. reconnect separately as runtime;
10. verify `pg_roles`, `pg_auth_members`, ownership, explicit privileges, default privileges, grant options, and PUBLIC privileges;
11. prove runtime `SELECT`/`INSERT` and approved column updates;
12. prove runtime DDL, broad update, `DELETE`, `TRUNCATE`, ownership, grants, and privileged `SET ROLE` fail;
13. restart the cluster and repeat effective-principal/owner/ACL checks;
14. stop the cluster and remove the disposable data directory.

PGlite remains useful for migration/repository tests but cannot replace the real PostgreSQL role-catalog, ownership, membership, default-privilege, and reconnect gate.

## 14. Staging Requirements

Before any Phase 15C Staging migration:

- the exact Staging project/environment/database target is Human-approved;
- distinct `MIGRATION_OWNER` and `APPLICATION_RUNTIME` principals exist;
- both non-secret role bindings and both secret connection references are present;
- migration tooling rejects `DATABASE_URL` fallback;
- `current_user` exactly matches the approved `MIGRATION_OWNER` binding;
- every Section 5.2 legacy object matrix row passes by direct ownership or separately approved pre-existing owner-role authority;
- no migration authority path depends on `APPLICATION_RUNTIME`, superuser, silent ownership transfer, or a newly added broad membership;
- migration 0031 checksum and provenance are approved;
- the migration is applied/replayed as the bound migration principal;
- the governed ACL step passes;
- runtime allowance and denial matrices pass as the bound runtime principal;
- PUBLIC leakage, ownership, memberships, and grant options pass;
- no Production target or credential is reachable.

Failure at any step leaves Staging runtime readiness blocked.

## 15. Production Requirements

This contract grants no Production authorization. A future Production gate must independently prove:

- distinct provisioned physical principals and credentials;
- exact target and role-binding approval;
- no shared-account compatibility mode;
- migration and ACL provenance/checksums;
- runtime denial matrix, PUBLIC leakage, ownership, and membership checks;
- credential rotation, rollback, and incident procedures;
- no auto-migration and no runtime possession of migration credentials.

## 16. Security / Fail-Closed Rules

- Missing, unknown, duplicate, equal, or privilege-bearing role bindings fail closed.
- Governed Staging/Production migration tooling never falls back to `DATABASE_URL`.
- Unknown object ownership, an owner mismatch, absent owner-role membership, unexpected superuser dependence, or a required unapproved ownership transfer blocks migration 0031 before any migration statement executes.
- The ownership preflight may not repair ownership, add membership, switch to runtime credentials, create a temporary superuser, use `SECURITY DEFINER` escalation, or hard-code an owner role.
- Role identifiers are validated through parameterized catalog queries and server-side identifier quoting.
- Migration 0031 contains no physical role name or credential.
- Runtime cannot own objects, execute DDL, grant privileges, manage roles, or escalate with `SET ROLE`.
- Runtime write authority is explicit; PUBLIC-derived write authority is prohibited.
- Classification remains append-only; request mutation remains column-bounded.
- An ACL verification outage or ambiguous catalog result leaves readiness blocked.
- Logs, Audit, Evidence, and reports contain semantic role classes, safe physical role identifiers where approved, checks/statuses, and no connection string or credential.

## 17. Migration 0031 Impact

Migration 0031 remains the proposed Phase 15C schema migration only while repository HEAD remains 0030. It may create/align `work.requests`, extend `ai.domain_execution_constraints`, and create `governance.request_classification_versions` with their approved constraints and triggers.

The migration must not create database roles or contain environment-specific names. It may revoke inappropriate PUBLIC privileges on its own newly created objects because those identifiers are static and canonical. Grants to `APPLICATION_RUNTIME` occur in the governed post-migration ACL step.

If another migration appears, an existing `work.requests` authority appears, or the separation cannot be expressed without editing migration history, implementation stops for Human review.

## 18. Implementation Plan Amendment Impact

Before local Phase 15C implementation resumes, the approved implementation plan must be amended to add:

- the four-variable connection/role binding contract;
- the Model A legacy-object ownership bridge and complete object inventory;
- object-by-object create/ALTER authority verification before migration;
- migration-owner binding and `current_user` verification;
- failure-before-migration behavior for missing or invalid ownership authority;
- migration-tool use of `MAOS_DATABASE_MIGRATION_URL` and governed-environment no-fallback behavior;
- the post-migration ACL tool and its idempotent transaction;
- role catalog/attribute/membership/ownership/default-privilege/PUBLIC checks;
- the disposable real PostgreSQL harness;
- disposable PostgreSQL ownership-positive and ownership-negative tests;
- local compatibility boundaries;
- Staging legacy-owner preflight and a prohibition on ownership transfer without separate authorization;
- Staging and Production distinct-principal preconditions;
- tests proving no physical role name enters migration 0031.

The amendment must preserve all existing Phase 15C authority, lifecycle, Development delegation, classification, Audit, API, portal, and Phase 15D handoff decisions.

## 19. Human Stop Conditions

Stop before implementation or environment mutation if:

- migration HEAD no longer makes 0031 the next migration;
- role provisioning would require migration 0031 to create credentials or roles;
- a required legacy object owner cannot be resolved exactly;
- the approved migration principal neither owns an affected object nor has separately approved pre-existing owner-role authority;
- migration authority depends on `APPLICATION_RUNTIME`, unexpected superuser access, temporary privilege escalation, `SECURITY DEFINER`, or a broad new membership;
- ownership transfer is required but has not received separate infrastructure/bootstrap approval and downstream-impact review;
- physical role names must be hard-coded in migration SQL;
- Staging or Production cannot provide distinct principals;
- the runtime role requires DDL, ownership, broad update, delete, truncate, grant option, or privileged membership;
- a pre-existing privilege would need silent broadening;
- ACL application cannot safely bind a catalog-validated identifier;
- PUBLIC leakage cannot be proved absent;
- real PostgreSQL verification cannot prove the required denial matrix;
- secrets would enter logs, evidence, source, arguments, or reports;
- implementing the contract would weaken frozen Development delegation or another canonical authority boundary.

## 20. Open Decisions

No architecture decision remains open for the Phase 15C role model. Implementation review must still approve:

- exact non-secret variable naming and local compatibility flag naming;
- the concrete post-migration ACL command/module location;
- the final list of existing cross-domain privileges consumed without broadening;
- the portable CI adapter for the real PostgreSQL harness when the Windows binary path is unavailable.

These are implementation details and may not change the two-role contract, governed-environment separation, ACL matrix, or no-fallback rules.

## 21. Exit Criteria

The contract is ready to unblock implementation-plan revision only when Human review confirms:

- exactly two Phase 15C semantic role classes;
- no Phase 15C diagnostic login;
- environment-bound physical names and infrastructure-owned provisioning;
- Model A binding to the proven existing canonical object owner, with no automatic fallback to membership, transfer, or superuser models;
- a complete object-by-object owner/operation/authority/result matrix that passes before migration;
- `DATABASE_URL` is runtime-only and `MAOS_DATABASE_MIGRATION_URL` is migration-only in governed environments;
- distinct Staging/Production principals with no migration fallback;
- post-migration governed ACL binding with safe identifier handling;
- the exact runtime ACL matrix and absolute denials;
- disposable real PostgreSQL role/ACL/restart verification;
- no migration, role, grant, environment, or Production mutation occurred during design.
