# MAOS Phase 15C Classification / Domain Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a durable MAOS-owned request identity and append-only classification authority that produces only validated, current routing inputs for Phase 15D.

**Architecture:** A Work / Request Intake-owned `work.requests` record is created before classification and is physically referenced by governance-owned immutable classification versions. PostgreSQL enforces lineage, append-only behavior, domain-policy integrity, and Development delegation; repository/runtime services provide idempotent append, deterministic no-fallback current selection, stale detection, Human override governance, read-only diagnostics, and Phase 15D handoff validation. `MAOS_DATABASE_ROLE_CONTRACT_V1` separates the environment-bound migration owner from the least-privilege application runtime before migration 0031 can execute.

**Tech Stack:** PostgreSQL migrations, TypeScript 5.9, Node.js 24, `pg`, PGlite, disposable real PostgreSQL through installed `initdb`/`pg_ctl`/`postgres`/`createdb`/`psql` binaries, Node test runner through `tsx`, MAOS API route composition, MAOS Web server-rendered portal.

**Specs:** `docs/superpowers/2026-10-02-phase15c-classification-domain-routing-design.md`; `docs/superpowers/2026-10-02-phase15c-database-role-governance-contract.md`

## Global Constraints

- Top-level domains are exactly `BUSINESS`, `OPERATIONS`, `RESEARCH`, `ANALYTICS`, `WRITING`, `DEVELOPMENT`, and `MEMORY`.
- `work.requests` is Work / Request Intake authority; classification must never mint request identities.
- `governance.request_classification_versions` is append-only and versioned; no in-place history rewrite.
- Current means the latest version head plus `VALIDATED + NON_STALE + POLICY_RESOLVED`; never fall back to an earlier validated version.
- `ai.domain_execution_constraints` remains the only execution-policy authority; no policy-resolution store may be added.
- `DEVELOPMENT -> DELEGATE_TO_AIDOS`; `CODE_EXECUTION` grants no MAOS-native Development authority.
- Phase 15C selects no Provider, Model, Host, Worker, or Runner and grants no execution authority.
- Audit, Evidence, Event, CommandEnvelope, Task, and portal projection are not classification authority.
- No Production mutation. Staging actions require a separate explicit approval after local verification.
- Do not edit historical migrations. Revalidate the migration head before naming or creating the next migration.
- Do not commit or push without separate authorization.
- Database roles are semantic classes `MIGRATION_OWNER` and `APPLICATION_RUNTIME`; physical names are environment-bound and never appear in migration SQL.
- `DATABASE_URL` is the runtime connection. `MAOS_DATABASE_MIGRATION_URL` is the migration connection. Governed Staging/Production never fall back from the latter to the former.
- `APPLICATION_RUNTIME` receives no DDL, ownership, grant option, privileged membership, broad update, delete, truncate, or PUBLIC-derived write authority.
- Legacy objects use `MODEL_A_BIND_MIGRATION_OWNER_TO_EXISTING_CANONICAL_OBJECT_OWNER`; every required owner/operation/authority row must pass before migration.

### Phase 15C R2 authority reconciliation

This R2 amendment supersedes Task 1 language that treats ownership or grant option as a proxy for every migration operation.

The final preflight matrix requires ownership only for `ai.domain_execution_constraints`; `USAGE, CREATE` on `work`, `governance`, and `ai`; `USAGE` on `core`; `SELECT, INSERT` on `core.schema_migrations`; and `REFERENCES` on `core.organizations`, `core.projects`, and `work.tasks`. It classifies untouched legacy guards, compatibility tables, triggers, and sequences as `NO_OPERATION`. It rejects superuser, `CREATEDB`, `CREATEROLE`, replication, `BYPASSRLS`, database `CREATE`, `core` `CREATE`, grant options, runtime identity collapse, and unexpected privileged memberships.

`applyMigrations` has two explicit modes:

1. `ENSURE` preserves the existing fresh/local bootstrap behavior.
2. `VERIFY_EXISTING` is mandatory for the governed migration command. It performs no registry DDL and validates the existing `core.schema_migrations` schema/table/column/primary-key contract before reading or writing migration metadata.

Tests must prove real PostgreSQL success without database/core `CREATE`, fail-closed missing/malformed registry behavior, each required privilege independently, no grant-option dependency, runtime migration denial, migration 0031 apply/replay, and unchanged historical checksums.

The post-migration ACL step is not executable by this minimal migration principal and is not solved by adding grant option. Its execution authority is a separate governance gate. The R2 recommendation is a separately approved, ephemeral provider/bootstrap administrator execution of the fixed allowlisted ACL transaction, followed by effective-privilege/PUBLIC-leakage verification and immediate disconnect. No new privileged helper, role, membership, ownership transfer, or `SECURITY DEFINER` mechanism is authorized here.

## Review Focus

- Concurrent registration or classification append for one request must converge or conflict without duplicate authority rows; covered by Tasks 1–3.
- A policy row changed after classification validation must make the classification immediately non-consumable; covered by Tasks 4 and 7.
- A Human override aimed at a different request/scope or stale predecessor must fail before persistence/Audit success; covered by Task 6.
- Read APIs and portal projections must redact Evidence/context internals and expose no mutation control; covered by Tasks 8–9.
- Phase 15D must reject non-head, stale, unresolved, or Development-native handoffs even when the caller supplies a valid classification UUID; covered by Task 10.
- A wrong legacy owner, missing owner-role authority, shared governed principal, or migration URL fallback must stop before migration metadata changes; covered by Tasks 1 and 11.

---

## Planned File Structure

- `packages/database/migrations/0031_phase15c_classification_domain_routing.sql` — candidate migration only if repository HEAD is still 0030; creates/alters database authority in dependency order.
- `packages/config/src/index.ts`, `packages/config/test/config.test.ts` — exact migration/runtime connection and role-binding configuration, including development-only shared-role compatibility.
- `packages/database/src/database-role-contract.ts` — semantic role types, role/catalog inspection result types, fixed legacy-object matrix, and fail-closed validation.
- `packages/database/src/database-role-acl.ts` — fixed Phase 15C ACL statement set, safe runtime-role binding, ACL application, and effective-privilege verification.
- `scripts/database-role-preflight.ts`, `scripts/database-role-preflight.test.ts` — read-only legacy-owner/role-binding command and tests.
- `scripts/database-role-apply-acl.ts`, `scripts/database-role-apply-acl.test.ts` — governed post-migration ACL command and tests.
- `scripts/testing/disposable-postgres.ts` — local real-PostgreSQL temporary-cluster adapter with bounded startup, restart, and cleanup.
- `scripts/database-role-contract-postgres.test.ts` — real PostgreSQL owner, membership, ACL, denial, and reconnect matrix.
- `packages/database/src/work-request-contracts.ts` — Work / Request Intake-owned request record, lifecycle, registration, invalidation, and read-port contracts.
- `packages/database/src/work-request-repository.ts` — PostgreSQL persistence owned by Work / Request Intake; the only Phase 15C component that inserts canonical requests.
- `packages/database/src/work-request-intake-service.ts` — governed request registration/invalidation and existing Audit/idempotency composition.
- `packages/database/src/request-classification-contracts.ts` — bounded record, input, result, error-code, and handoff types.
- `packages/database/src/request-classification-repository.ts` — PostgreSQL classification append/idempotency/Audit, history, and read-only request/policy validation; it cannot insert requests.
- `packages/database/src/request-classification-runtime.ts` — deterministic current resolver, stale checks, AI validation, Human override, and handoff validator.
- `packages/database/src/index.ts` — package exports only.
- `packages/database/test/request-classification-migration.test.ts` — migration, constraints, ACL, replay, checksum, and trigger tests.
- `packages/database/test/request-classification-repository.test.ts` — persistence, idempotency, target binding, Audit, concurrency, and restart tests.
- `packages/database/test/request-classification-runtime.test.ts` — current selection, policy revalidation, stale, AI, override, and handoff tests.
- `apps/api/src/classification-routes.ts` — authorized read-only diagnostics.
- `apps/api/src/classification-server-composition.ts` — database/repository/runtime composition.
- `apps/api/src/app.ts`, `apps/api/src/server.ts` — bounded route registration only.
- `apps/api/test/classification-routes.test.ts`, `apps/api/test/classification-server-composition.test.ts` — API contract and composition tests.
- `apps/web/src/classification.ts` — safe portal view model/projection.
- `apps/web/src/server.ts` — bounded read-only portal route registration.
- `apps/web/test/classification.test.ts`, `apps/web/test/server.test.ts` — visibility, authorization, redaction, and no-control tests.
- `docs/implementation/phase-15c-classification-domain-routing-evidence.md` — observed local/Staging evidence only after execution.
- `docs/context/phase-15c.md`, `docs/handoff/CURRENT.md` — updated only at the separately approved final closure gate.

## Canonical `work.requests` Persistence Contract

No existing component owns a durable, source-neutral canonical request identity. `WorkEngine` is process-local and owns Project/Task workflow behavior; `PostgresCommandEnvelopeRepository` owns Human-command snapshots. Neither is reused as request authority. The new bounded Work Request Intake repository/service reuses the existing `work` schema, `core.organizations`, `core.projects`, canonical scope/environment fields, and current Audit/idempotency infrastructure.

The exact proposed `work.requests` contract is:

- `id uuid PRIMARY KEY`: globally unique identity minted by the Work Request Intake service before classification.
- `source_system text NOT NULL`, `source_type text NOT NULL`, `source_ref text NOT NULL`: immutable source lineage. Values must resolve through the applicable existing System/source owner-read contract; arbitrary unregistered sources fail closed.
- `source_fingerprint text NOT NULL`: immutable `sha256:<64 lowercase hex>` fingerprint of the canonical source input.
- `organization_id uuid NOT NULL REFERENCES core.organizations(id)`: canonical tenant/organization context; no parallel tenant identifier is added.
- `project_id uuid NOT NULL` plus composite FK `(organization_id, project_id) -> core.projects(organization_id, id)`: canonical project context.
- `company_scope_ref text NOT NULL`, `team_scope_ref text NULL`, `project_scope_ref text NOT NULL`, `system_scope_ref text NULL`: the same governed scope vocabulary and nullability used by `work.command_envelopes`.
- `environment text NOT NULL CHECK (environment IN ('DEVELOPMENT','PREVIEW','STAGING','PRODUCTION'))`: existing MAOS environment vocabulary.
- `lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('REGISTERED','INVALIDATED'))`.
- `registered_by_actor_type text NOT NULL CHECK (... IN ('HUMAN','AGENT','SYSTEM'))`, `registered_by_actor_id uuid NOT NULL`, `registered_at timestamptz NOT NULL`.
- `invalidated_by_actor_type text NULL`, `invalidated_by_actor_id uuid NULL`, `invalidation_reason_code text NULL`, `invalidated_at timestamptz NULL`, constrained as an all-or-none set present only for `INVALIDATED`.
- `idempotency_key text NOT NULL`, `input_fingerprint text NOT NULL`, `correlation_id text NOT NULL`, `causation_ref text NULL`, and `registration_audit_ref text NOT NULL`, using existing governance conventions and Audit storage rather than another idempotency/Audit table.
- `created_at timestamptz NOT NULL`, `updated_at timestamptz NOT NULL`, with database-managed time ordering.

Lifecycle is exact and one-way: insert as `REGISTERED`; optionally transition once from `REGISTERED -> INVALIDATED`; `INVALIDATED` is terminal. No reactivation exists. Classification eligibility is exactly `REGISTERED` plus successful source, organization, project, scope, environment, and optional CommandEnvelope/Task owner-read validation.

Immutable after insert: `id`, all source lineage fields, source/input fingerprints, organization/project, all scope refs, environment, registration actor/time, idempotency key, correlation/causation, and registration Audit reference. The only mutable fields are `lifecycle_state`, invalidation actor/reason/time, and database-managed `updated_at`, changed atomically through the intake invalidation service. `UPDATE` of immutable fields and all `DELETE` operations fail at the database boundary.

Required uniqueness/indexes are `UNIQUE (source_system, source_type, source_ref)`, `UNIQUE (organization_id, project_id, idempotency_key)`, the composite organization/project FK, and indexes on `(organization_id, project_id, environment, lifecycle_state)` and `(project_id, lifecycle_state, registered_at)`.

ACL planning follows `MAOS_DATABASE_ROLE_CONTRACT_V1`. `MIGRATION_OWNER` is bound to the existing legitimate owner principal and remains migration-only. `APPLICATION_RUNTIME` is distinct in governed environments. Runtime receives `USAGE` on `work`, `SELECT`/`INSERT` on `work.requests`, and column-level `UPDATE` only for `lifecycle_state`, `invalidated_by_actor_type`, `invalidated_by_actor_id`, `invalidation_reason_code`, and `invalidated_at`; `updated_at` remains trigger-managed. Runtime receives `USAGE` plus `SELECT`/`INSERT` on `governance.request_classification_versions`, and `USAGE` plus `SELECT` on `ai.domain_execution_constraints`. It receives no ownership, DDL, `DELETE`, `TRUNCATE`, broad table update, grant option, privileged membership, or PUBLIC-derived access.

The exact future configuration contract is:

- `DATABASE_URL`: secret `APPLICATION_RUNTIME` connection.
- `MAOS_DATABASE_MIGRATION_URL`: secret `MIGRATION_OWNER` connection.
- `MAOS_DATABASE_ACL_ADMIN_URL`: secret, server/bootstrap-only `EPHEMERAL_ACL_ADMIN` connection required only for an explicitly authorized fixed ACL operation; it never falls back to the runtime or migration URL.
- `MAOS_DATABASE_RUNTIME_ROLE`: non-secret physical runtime role identifier.
- `MAOS_DATABASE_MIGRATION_ROLE`: non-secret physical migration role identifier.
- `MAOS_DATABASE_ACL_ADMIN_ROLE`: non-secret physical ACL administrator role identifier, distinct from both runtime and migration roles.
- `MAOS_DATABASE_ALLOW_SHARED_LOCAL_ROLE`: exact development-only compatibility flag. Only literal `true` with `MAOS_ENV=development` permits local migration/runtime principal equality. It is rejected in Preview, Staging, and Production and never counts as governed readiness evidence.

The initial cross-domain privilege budget is fixed as follows and must be confirmed against the final repository SQL before the ACL transaction is enabled:

| Concern | Existing canonical object/path | Phase 15C operation | Privilege rule |
| --- | --- | --- | --- |
| Organization | `core.organizations` | exact owner-read validation | reuse existing `SELECT`; no write |
| Project | `core.projects` | exact organization/project owner-read validation | reuse existing `SELECT`; no write |
| Scope | immutable request scope refs; optional `work.command_envelopes`/`work.tasks` lineage | exact context comparison | reuse existing read path only; no scope mutation |
| Identity | existing session/assignment authorization before repository invocation | actor/authority validation | no new Phase 15C direct identity-table privilege unless an existing owner-read port proves it is required |
| Audit | `PostgresAuditRecordRepository` over `audit.audit_records` | atomic success Audit and replay lookup | reuse the repository's exact `SELECT`/`INSERT` contract; no update/delete |
| Evidence | opaque validated Evidence refs and existing owner-read contracts | reference validation only | no inferred Evidence-table grant |
| Idempotency | existing Audit idempotency/fingerprint path | exact replay/conflict resolution | no new table or privilege store |

Any direct SQL path outside this budget, any new cross-domain write, or any privilege whose existing authority cannot be proven is a Human stop condition rather than an ACL expansion.

### Task 1: Migration preflight and atomic authority schema

**Files:**
- Create conditionally: `packages/database/migrations/0031_phase15c_classification_domain_routing.sql`
- Modify: `package.json`
- Modify: `packages/config/src/index.ts`
- Modify: `packages/config/test/config.test.ts`
- Create: `packages/database/src/database-role-contract.ts`
- Create: `packages/database/src/database-role-acl.ts`
- Modify: `packages/database/src/index.ts`
- Modify: `scripts/database-migrate-postgres.ts`
- Modify: `scripts/database-migrate-postgres.test.ts`
- Create: `scripts/database-role-preflight.ts`
- Create: `scripts/database-role-preflight.test.ts`
- Create: `scripts/database-role-apply-acl.ts`
- Create: `scripts/database-role-apply-acl.test.ts`
- Create: `scripts/testing/disposable-postgres.ts`
- Create: `scripts/database-role-contract-postgres.test.ts`
- Modify: `packages/database/test/migrations.test.ts`
- Modify: `packages/database/test/database.test.ts`
- Create: `packages/database/test/request-classification-migration.test.ts`

**Interfaces:**
- Produces `work.requests`, `governance.request_classification_versions`, and extended `ai.domain_execution_constraints` for all later tasks.
- Produces `loadDatabaseMigrationConfig(env): DatabaseMigrationConfig`, where the result contains `migrationUrl`, `migrationRole`, `runtimeRole`, and `allowSharedLocalRole` without logging their secret URLs.
- Produces `inspectDatabaseRoleContract(database, input): Promise<DatabaseRolePreflightResult>` with a fixed legacy-object matrix and no mutation.
- Produces `applyPhase15cRuntimeAcl(database, input): Promise<DatabaseRoleAclResult>` and `verifyPhase15cRuntimeAcl(database, input): Promise<DatabaseRoleAclVerificationResult>`.
- Produces `withDisposablePostgres(options, run): Promise<void>` for isolated real-PostgreSQL tests.
- Defines `DisposablePostgresExecutablePaths { initdb; pgCtl; postgres; createdb; psql }`; the Windows adapter supplies `C:\Program Files\PostgreSQL\18\bin` when explicitly present, while CI injects equivalent system/container executable paths without changing test semantics.

- [ ] **Step 1: Revalidate migration head before editing**

Run `Get-ChildItem packages/database/migrations -File | Sort-Object Name | Select-Object -Last 3 -ExpandProperty Name` and `git status --short`.

Expected: `0030_phase15b_r0_durable_assignment_authority.sql` is the highest migration. If any later migration exists, stop for Human migration-number/dependency review; do not assume 0031.

- [ ] **Step 2: Write failing configuration-contract tests**

In `packages/config/test/config.test.ts` and `scripts/database-migrate-postgres.test.ts`, assert governed Staging/Production require all three new variables, migration connects only through `MAOS_DATABASE_MIGRATION_URL`, role names must be non-empty PostgreSQL identifiers, the two roles must differ, and `DATABASE_URL` fallback fails. Assert `MAOS_DATABASE_ALLOW_SHARED_LOCAL_ROLE=true` works only with `MAOS_ENV=development`; every other value/environment fails closed without opening a connection.

- [ ] **Step 3: Implement the configuration and migration-tool boundary**

Add `DatabaseMigrationConfig` and `loadDatabaseMigrationConfig()` to `packages/config/src/index.ts`. Update `runPostgresMigrationCommand()` to prefer the migration URL, reject governed fallback, compare catalog `current_user` to `MAOS_DATABASE_MIGRATION_ROLE`, and invoke the read-only owner preflight before `applyMigrations()`. Never print either URL or parsed credentials. Add exact package commands `"db:role:preflight": "tsx scripts/database-role-preflight.ts"` and `"db:role:apply-acl": "tsx scripts/database-role-apply-acl.ts"`.

- [ ] **Step 4: Write failing legacy-owner preflight tests**

Test the fixed rows for schemas `work`, `governance`, and `ai`; tables `ai.domain_execution_constraints`, `ai.role_compatibilities`, and `core.schema_migrations`; guard functions `ai.guard_development_domain_constraint()` and `ai.guard_development_role_compatibility()`; both Development guard triggers through their parent-table owners; and every discovered affected sequence. Assert direct owner passes, separately approved pre-existing owner-role authority passes, and wrong/unknown/ambiguous owner, absent membership, runtime-supplied authority, superuser dependence, unapproved transfer, or missing object blocks before migration SQL.

- [ ] **Step 5: Implement `database-role-contract` and the read-only command**

Implement catalog queries with parameters against `pg_roles`, `pg_auth_members`, `pg_namespace`, `pg_class`, `pg_proc`, `pg_trigger`, `information_schema.role_*_grants`, and default-privilege catalogs. `scripts/database-role-preflight.ts` accepts only the fixed environment contract, emits bounded object/operation/authority/result rows, performs no DDL/DML/GRANT/role mutation, and returns non-zero on any failed or indeterminate row.

- [ ] **Step 6: Write failing governed ACL tests**

Assert the runtime role is resolved by parameterized catalog lookup, its identifier is obtained with PostgreSQL `quote_ident($1)`, and only fixed allowlisted statements can execute. Test the exact Work Request, Classification, and domain-policy grants; explicit PUBLIC/runtime revocations; column-level invalidation updates; and denials for immutable/broad update, policy update, classification update/delete, DDL, delete, truncate, ownership, grant option, role administration, and privileged `SET ROLE`.

- [ ] **Step 7: Implement the post-migration ACL command**

Implement `database-role-acl.ts` and `scripts/database-role-apply-acl.ts`. Connect only through `MAOS_DATABASE_ACL_ADMIN_URL`; do not fall back to runtime or migration credentials. Run the exact nine-operation authority preflight, server-quote the runtime identifier, apply the fixed ACL transaction, verify the complete runtime/PUBLIC matrix before commit, replay the deterministic contract as `REUSED`, disconnect the ephemeral administrator, reconnect only as runtime, and emit only safe status evidence. The command never creates roles, credentials, memberships, or ownership transfers. A different contract version or effective runtime role binding fails closed.

- [ ] **Step 8: Inventory cross-domain privileges before granting**

Build a fixed inventory from the actual SQL paths used by Work Request Intake, Classification, authorization, and Audit. At minimum classify: `core.organizations` and `core.projects` owner-read; optional `work.command_envelopes` and `work.tasks` lineage reads; existing identity/session/assignment authorization performed before the repository boundary; `audit.audit_records` operations through `PostgresAuditRecordRepository`; Evidence references as opaque validated refs unless an existing owner-read port requires a table; and Audit-based idempotency with no second store. Record each object, existing repository method, operation, already-approved privilege source, and whether Phase 15C needs a new privilege. Any new cross-domain write or uncertain privilege stops for review; the ACL tool may not infer or broaden it.

- [ ] **Step 9: Write and implement the disposable real-PostgreSQL harness**

Create `scripts/testing/disposable-postgres.ts` around installed binaries discovered from an explicit option or `PATH`: temporary directory, random loopback port, temporary migration/runtime credentials held in process memory, bounded startup, clean restart, and `finally` cleanup. It must never use Local service, Staging, or Production credentials. The adapter boundary accepts executable paths so CI can supply Docker/Testcontainers or system PostgreSQL later without changing role-contract tests; missing binaries produce a bounded environmental result, never a PGlite substitution.

- [ ] **Step 10: Run real-PostgreSQL role/owner tests**

Run `npx.cmd tsx --test --test-concurrency=1 scripts/database-role-contract-postgres.test.ts`. Prove positive owner, wrong owner, missing membership, indeterminate owner, runtime role attributes, no privileged membership, ownership, explicit/default privileges, grant options, PUBLIC leakage, allowed DML, all denials, and reconnect/restart persistence.

- [ ] **Step 11: Write failing migration inventory/checksum tests**

Add explicit fixed expectations for the chosen next migration, preservation of all historical checksums, apply/replay order, and zero inferred backfill. Assert the migration fails if omitted, reordered, or checksum-drifted.

- [ ] **Step 12: Write failing schema/constraint tests**

Test the exact `work.requests` contract above, including one-way lifecycle and column-level ACL; physical classification FK; seven-domain check; state/source/disposition checks; `(request_id, version)` uniqueness; same-request immediate supersession; append-only update/delete denial; exact policy ID/version binding; target/disposition consistency; and no seeded request/classification rows.

- [ ] **Step 13: Write failing database-boundary negative tests**

Test orphan request, broken/gapped/forked chain, invalid domain, invalid state, stale/validated timestamp inconsistency, delegation without target, target on prohibited/native rows, and attempts to weaken `DEVELOPMENT -> DELEGATE_TO_AIDOS`.

- [ ] **Step 14: Create one transactional migration when HEAD remains 0030**

Order statements as: create/align `work.requests`; extend `ai.domain_execution_constraints`; create `governance.request_classification_versions`; add FK/constraints/indexes; add request and classification append-only/immutability triggers; and extend Development guards. Migration 0031 contains no physical role name, role creation/alteration, credential, membership, ownership transfer, or environment substitution. Static PUBLIC revocation on its own canonical objects is allowed. Runtime grants occur only in the post-migration governed ACL transaction.

- [ ] **Step 15: Verify migration and ACL locally**

Run `npx.cmd tsx --test --test-concurrency=1 packages/config/test/config.test.ts scripts/database-migrate-postgres.test.ts scripts/database-role-preflight.test.ts scripts/database-role-apply-acl.test.ts scripts/database-role-contract-postgres.test.ts packages/database/test/request-classification-migration.test.ts packages/database/test/migrations.test.ts packages/database/test/database.test.ts`.

Expected: all tests pass; owner preflight precedes migration; apply count increments by one; replay applies zero; ACL replay is idempotent; historical checksums remain fixed; no rows, roles, memberships, or credentials are seeded.

- [ ] **Step 16: Record a review checkpoint**

Run `git diff --check` and inspect only the Task 1 configuration, role-contract, migration tooling, disposable PostgreSQL harness, migration, and directly related tests. Do not commit without separate authorization.

### Task 2: Canonical request registration repository

**Files:**
- Create: `packages/database/src/work-request-contracts.ts`
- Create: `packages/database/src/work-request-repository.ts`
- Create: `packages/database/src/work-request-intake-service.ts`
- Create: `packages/database/test/work-request-repository.test.ts`
- Create: `packages/database/test/work-request-intake-service.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**
- Owned by Work / Request Intake, not Classification.
- Produces `CanonicalWorkRequestInput`, `CanonicalWorkRequestRecord`, `WorkRequestReadPort.findRequest(id)`, `WorkRequestIntakeService.registerRequest(input)`, and `WorkRequestIntakeService.invalidateRequest(input)`.
- `registerRequest(input)` returns `{ outcome: "CREATED" | "REUSED"; request: CanonicalWorkRequestRecord; auditRef: string }`.
- Classification receives only `WorkRequestReadPort`; no classification type or repository exposes `registerRequest` or `invalidateRequest`.

- [ ] **Step 1: Define failing request registration tests**

Cover globally unique UUID, immutable `sourceSystem/sourceType/sourceRef/sourceFingerprint`, exact tenant/project/scope/environment binding, active/invalidated lifecycle, exact idempotent replay, conflicting replay, one row, one success Audit, and atomic rollback.

- [ ] **Step 2: Add negative authority tests**

Assert no classification-facing interface can create or invalidate a request; unknown, invalidated, wrong organization/project/scope/environment, ambiguous source identity, and mismatched CommandEnvelope/Task lineage return bounded fail-closed errors.

- [ ] **Step 3: Implement Work Request Intake contracts, repository, and service**

Implement the exact table contract and lifecycle above. Use the existing database transaction, idempotency fingerprint, and Audit repository conventions. Do not add a new idempotency or Audit store. Keep all insert/invalidation methods out of the classification repository.

- [ ] **Step 4: Run the focused repository tests**

Run `npx.cmd tsx --test --test-concurrency=1 packages/database/test/work-request-repository.test.ts packages/database/test/work-request-intake-service.test.ts`.

Expected: request registration and all target-binding negative cases pass.

### Task 3: Append-only classification repository and atomic Audit

**Files:**
- Create: `packages/database/src/request-classification-contracts.ts`
- Create: `packages/database/src/request-classification-repository.ts`
- Create: `packages/database/test/request-classification-repository.test.ts`

**Interfaces:**
- Produces `appendClassification(input: AppendClassificationInput): Promise<ClassificationAppendResult>` and `listClassificationHistory(requestId)`.
- `AppendClassificationInput` carries request/optional Task binding, expected predecessor, canonical payload fingerprint, idempotency key, Evidence/context/Artifact refs, actor, correlation/causation, and the bounded classification fields from the spec.
- Consumes `WorkRequestReadPort` for exact eligibility validation. It has no Work Request creation or lifecycle mutation method.

- [ ] **Step 1: Write failing append/version tests**

Test version 1, immediate predecessor, immutable history, monotonic sequence, exact request/Task binding, one chain head, and no update/delete path.

- [ ] **Step 2: Write failing idempotency/Audit tests**

Same key plus same canonical intent returns `REUSED`, same classification/audit refs, one row, and one Audit. Same key plus different intent fails before a second mutation. Permission/authority is not inferred.

- [ ] **Step 3: Write failing concurrency tests**

Two next-version appends for one request must serialize: one succeeds and the other returns reuse or bounded conflict; no fork or duplicate Audit is possible.

- [ ] **Step 4: Implement transactional append**

Validate the canonical request before idempotency success resolution, lock per request, revalidate predecessor/head, insert classification and existing Audit atomically, and map database failures to bounded error codes without raw data.

- [ ] **Step 5: Run focused tests**

Run `npx.cmd tsx --test --test-concurrency=1 packages/database/test/request-classification-repository.test.ts`.

Expected: all append, replay, Audit, rollback, and concurrency cases pass.

### Task 4: Deterministic current selection and policy revalidation

**Files:**
- Create: `packages/database/src/request-classification-runtime.ts`
- Create: `packages/database/test/request-classification-runtime.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**
- Produces `resolveCurrentClassification(input: ResolveCurrentClassificationInput): Promise<CurrentClassificationResult>`.
- Consumes repository methods `findRequest`, `findClassificationHead`, `verifyClassificationChain`, and `findDomainConstraint(id, policyVersion)`.

- [ ] **Step 1: Write failing deterministic selection tests**

Assert version number, not timestamp, chooses the head; head must be `VALIDATED`; proposed/rejected/stale head blocks earlier validated versions; gaps, forks, cycles, duplicate heads, and request/Task mismatch fail closed.

- [ ] **Step 2: Write failing policy revalidation tests**

Require exact domain constraint ID, policy version, active status, domain, disposition, target kind/ref/version, and freshness. Change, replacement, disable, removal, expiry, ambiguity, or conflict makes the classification immediately non-consumable.

- [ ] **Step 3: Implement the resolver**

Resolve request authority first, then head/chain, then state/freshness, then the exact policy row. Return a safe immutable snapshot. Do not append, repair, migrate, or fall back.

- [ ] **Step 4: Run focused runtime tests**

Run `npx.cmd tsx --test --test-concurrency=1 packages/database/test/request-classification-runtime.test.ts`.

Expected: selection and policy-change tests pass with no older-version fallback.

### Task 5: Stale detection and immutable invalidation

**Files:**
- Modify: `packages/database/src/request-classification-runtime.ts`
- Modify: `packages/database/src/request-classification-repository.ts`
- Modify: `packages/database/test/request-classification-runtime.test.ts`
- Modify: `packages/database/test/request-classification-repository.test.ts`

**Interfaces:**
- Produces `detectClassificationStaleness(input): StalenessResult` and `appendStaleClassification(input): Promise<ClassificationAppendResult>`.

- [ ] **Step 1: Write failing stale matrix tests**

Cover material request/intent change, Task change, policy change/removal, capability requirement change, Evidence expiry/revocation/integrity failure, Human override, conflicting reclassification, and taxonomy failure.

- [ ] **Step 2: Prove runtime detection denies before persistence**

Assert a stale condition blocks resolution immediately even when no `STALE` version has yet been appended.

- [ ] **Step 3: Implement immutable invalidation**

Append a new `STALE` head through the same atomic/idempotent repository path. Never update the earlier `VALIDATED` row.

- [ ] **Step 4: Run focused stale tests**

Run the two request-classification test files serially and expect all stale/invalidation cases to pass.

### Task 6: AI proposal validation and Human override contract

**Files:**
- Modify: `packages/database/src/request-classification-contracts.ts`
- Modify: `packages/database/src/request-classification-runtime.ts`
- Modify: `packages/database/test/request-classification-runtime.test.ts`
- Modify: `packages/database/test/request-classification-repository.test.ts`

**Interfaces:**
- Produces `proposeAiAssistedClassification(input): Promise<ClassificationAppendResult>`, `validateClassificationProposal(input): Promise<ClassificationAppendResult>`, and `applyHumanClassificationOverride(input): Promise<ClassificationAppendResult>`.
- `validateClassificationProposal` is executed by a `GovernedDeterministicClassificationValidator`; the AI model/output is never the validator.

- [ ] **Step 1: Write failing AI boundary tests**

AI may append only an `AI_ASSISTED` `PROPOSED` version containing domain/subdomain/role/capability/policy-constraint proposals. Assert AI cannot call the validator as authority or directly append `VALIDATED`/`REJECTED`; `UNKNOWN`, `AMBIGUOUS`, `LOW`, `CONFLICTING`, `STALE`, and `MISSING_POLICY` grant no current classification or execution authority.

- [ ] **Step 2: Write failing deterministic validator tests**

Require schema, frozen taxonomy, request/Task lineage, Evidence/context freshness, exact domain-policy ID/version resolution, and a separately governed automatic-validation policy/rule that explicitly permits the result. Persist validator rule identity/version, canonical input fingerprint, and policy-constraint identity/version. Missing, stale, ambiguous, or unauthorized validator policy rejects or leaves the proposal non-current; it never silently validates.

- [ ] **Step 3: Write failing Human override tests**

Require exact request/current predecessor, authorized Human actor, reason, non-empty Evidence, idempotency, correlation/causation, and policy revalidation. Test wrong request/scope/environment, stale predecessor, missing evidence, unauthorized actor, Development-native override, exact replay, and conflicting replay.

- [ ] **Step 4: Implement proposal, deterministic validation, and override orchestration**

AI appends only `PROPOSED`. The governed deterministic validator appends the separate `VALIDATED` or `REJECTED` version after every required validation and rule/policy check; automatic validation is prohibited without an explicit active validation rule. Human override appends a `HUMAN_OVERRIDE` source version through the existing repository/Audit path and remains subject to deterministic validation and domain policy.

- [ ] **Step 5: Run focused AI/override tests**

Run the request-classification runtime and repository files serially; expect one effective version/Audit on exact replay and no mutation on invalid override.

### Task 7: Domain policy extension and Development invariant integration

**Files:**
- Modify: `packages/database/src/ai-registry-repository.ts`
- Modify: `packages/database/test/ai-registry-repository.test.ts`
- Modify: `packages/database/test/ai-registry-migration.test.ts`
- Modify: `packages/database/test/request-classification-runtime.test.ts`

**Interfaces:**
- Extends `AiRegistryDomainConstraintRecord` with `routingDisposition`, `targetKind`, `targetRef`, and `targetVersion`.
- The classification resolver consumes exact constraint identity/version; no policy-resolution record is produced.

- [ ] **Step 1: Write failing constraint projection tests**

Assert exact Option A metadata is reconstructed and the Development row is active, `DELEGATE_TO_AIDOS`, and bound to the canonical AIDOS target.

- [ ] **Step 2: Write failing invariant tests**

Reject Development native/prohibited target drift, generic domain-system fallback, direct MAOS-compatible role binding, target/version removal, and `CODE_EXECUTION` override.

- [ ] **Step 3: Align repository record mapping**

Map the new authoritative columns without reading legacy capability arrays or adding mutation APIs.

- [ ] **Step 4: Run AI Registry and classification policy tests**

Run the two AI Registry test files plus request-classification runtime tests serially; expect all Development and policy-change cases to pass.

### Task 8: Authorized read-only diagnostic API

**Files:**
- Create: `apps/api/src/classification-routes.ts`
- Create: `apps/api/src/classification-server-composition.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Create: `apps/api/test/classification-routes.test.ts`
- Create: `apps/api/test/classification-server-composition.test.ts`

**Interfaces:**
- Produces authorized `GET` routes for current classification and immutable history.
- Consumes a `ClassificationReadPort` returning safe views only.

- [ ] **Step 1: Write failing route tests**

Test current/history reads, missing identity denial, wrong scope/environment denial, missing request, stale/current state, and absence/405 for POST/PUT/PATCH/DELETE.

- [ ] **Step 2: Write failing redaction tests**

Responses may include safe IDs, version, domain, state, disposition, bounded reason, timestamps, and safe policy status. Assert no raw context, Evidence content, credential/secret, model/provider/host/worker/runner selection, or internal Audit payload.

- [ ] **Step 3: Implement routes and composition**

Use the existing exact authorization service and `SYSTEM:READ`/R0 pattern where governance review confirms it is the canonical read permission. Do not add a bypass or mutation route.

- [ ] **Step 4: Run API tests**

Run `npx.cmd tsx --test --test-concurrency=1 apps/api/test/classification-routes.test.ts apps/api/test/classification-server-composition.test.ts`.

Expected: reads pass only for exact authorization; mutations are absent.

### Task 9: Safe read-only portal projection

**Files:**
- Create: `apps/web/src/classification.ts`
- Modify: `apps/web/src/server.ts`
- Create: `apps/web/test/classification.test.ts`
- Modify: `apps/web/test/server.test.ts`

**Interfaces:**
- Produces `buildClassificationPortalView(snapshot)` with safe current/history diagnostic display.
- Consumes authenticated API reads only; no direct database access.

- [ ] **Step 1: Write failing portal projection tests**

Test authorized visibility, unauthorized denial/hiding, current versus history distinction, validation/staleness and policy status, domain/disposition distinction, and restart reconstruction from API data.

- [ ] **Step 2: Write failing forbidden-control tests**

Assert no override button/API, execution control, Provider/Model/Host selection, Worker/Runner selection, or Development-native action appears.

- [ ] **Step 3: Implement safe projection and route**

Render only redacted diagnostic fields and preserve `DEVELOPMENT -> DELEGATE_TO_AIDOS` visibly without making it actionable.

- [ ] **Step 4: Run Web tests**

Run `npx.cmd tsx --test --test-concurrency=1 apps/web/test/classification.test.ts apps/web/test/server.test.ts`.

Expected: safe authorized read-only view passes and forbidden controls remain absent.

### Task 10: Phase 15D handoff validator

**Files:**
- Modify: `packages/database/src/request-classification-contracts.ts`
- Modify: `packages/database/src/request-classification-runtime.ts`
- Modify: `packages/database/test/request-classification-runtime.test.ts`

**Interfaces:**
- Produces `buildPhase15dClassificationHandoff(input): Promise<Phase15dClassificationHandoff>` and `validatePhase15dClassificationHandoff(input): Promise<ValidatedPhase15dClassificationHandoff>`.

- [ ] **Step 1: Write failing handoff contract tests**

Require classification/request IDs, optional Task ID, version, domain/subdomain, disposition, requested role class, required/preferred capability refs, policy constraints and exact policy ref/version, context/Artifact refs, priority, correlation/causation, and freshness proof.

- [ ] **Step 2: Write failing rejection tests**

Reject non-head, stale, unvalidated, unresolved, policy-drifted, request-invalidated, scope/environment-mismatched, unsupported capability, and Development-native handoffs.

- [ ] **Step 3: Assert forbidden selections are structurally absent**

Type/runtime tests must prove no selected Provider, Model, Host, Worker, or Runner field is accepted or emitted.

- [ ] **Step 4: Implement build and validation methods**

Both methods re-use current-resolution logic and grant no execution authority. Validation must occur again at consumption time.

- [ ] **Step 5: Run handoff tests**

Run the request-classification runtime file serially and expect all handoff cases to pass.

### Task 11: Restart, concurrency, ACL, security, and release gates

**Files:**
- Modify only if evidence requires: files created in Tasks 1–10
- Test: `scripts/database-role-contract-postgres.test.ts`
- Create: `docs/implementation/phase-15c-classification-domain-routing-evidence.md`

**Interfaces:**
- Verifies the complete local deliverable; introduces no new product interface.

- [ ] **Step 1: Run restart/reconstruction tests**

Dispose and recreate repository/runtime instances against the same database. Assert request, chain head, stale state, exact policy binding, idempotency result, and Audit reconstruct without process-local authority.

- [ ] **Step 2: Run concurrency tests against disposable PostgreSQL**

Test simultaneous request registration, next-version append, override, policy change versus current read, and handoff validation. Require one head and fail-closed ambiguous outcomes.

- [ ] **Step 3: Verify role, owner, ACL, and security boundaries**

Using the disposable real PostgreSQL harness, assert migration/runtime `current_user` and role attributes, the complete legacy-owner matrix, no privileged membership path, migration ownership of new objects, exact cross-domain privilege budget, runtime required schema usage/DML, column-level invalidation update, no DDL/ownership/grant option/PUBLIC leakage, broad-update/delete/truncate/SET ROLE denial, append-only classification denial, and reconnect persistence. PGlite results cannot replace this gate.

- [ ] **Step 4: Run focused and affected suites**

Run all new classification tests first, then affected database, AI Registry, command intake, session/auth, API, and Web suites serially. Record exact totals.

- [ ] **Step 5: Run static/release gates**

Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run format:check`, `npm.cmd run check:boundaries`, `npm.cmd run scan:repository`, `npm.cmd run build --workspace @maos/api`, `npm.cmd run build --workspace @maos/web`, and `git diff --check`.

Expected: all pass; no secret, architecture boundary, or Production mutation finding.

- [ ] **Step 6: Run full regression only after focused/affected PASS**

Run `npm.cmd test` because shared schema, authorization, and routing inputs changed. Record exact pass/fail/skip totals and diagnose the first meaningful failure before any rerun.

- [ ] **Step 7: Record local evidence**

Write observed commands/results, migration checksum, historical checksum verification, test totals, changed-file list, secret scan, and Production exclusion. Do not mark Staging or Phase 15C complete.

### Task 12: Separately authorized Staging verification and closure preparation

**Files:**
- Modify after successful live verification: `docs/implementation/phase-15c-classification-domain-routing-evidence.md`
- Modify only at final closure: `docs/context/phase-15c.md`, `docs/handoff/CURRENT.md`

**Interfaces:**
- Consumes the exact locally verified candidate and produces redacted Staging evidence only.

- [ ] **Step 1: Stop for explicit Staging authorization**

Before any provider login, migration, deployment, grant, or live request, present target project/environment/service identities, migration checksum, candidate provenance, rollback posture, and Production exclusion for Human approval.

Also present the bound physical migration/runtime role identifiers, proof they are distinct and share no privileged membership, `current_user` equality with the approved migration binding, the complete legacy-owner preflight matrix, and confirmation that both governed URLs exist without exposing them. Any missing/failed/indeterminate row stops before login-driven mutation or migration.

- [ ] **Step 2: Apply and replay the approved migration in Staging**

Connect only through `MAOS_DATABASE_MIGRATION_URL`; never fall back to `DATABASE_URL`. Rerun the owner preflight immediately before apply, verify applied count, replay skipped count, checksum, historical checksums, constraint/trigger inventory, zero backfill, and Production target exclusion. Then run `npm.cmd run db:role:apply-acl`, reconnect through runtime `DATABASE_URL`, and verify the full allowance/denial matrix before readiness.

- [ ] **Step 3: Deploy only approved Staging services**

Deploy API before Web. Verify health and restart reconstruction before exposing the portal projection. Do not modify Production variables or services.

- [ ] **Step 4: Run live positive and negative matrix**

Verify governed request registration, deterministic/AI proposal validation, immutable Human override through an explicitly approved test identity, current selection, policy change stale denial, exact replay, concurrent reads, read-only API/UI, Development delegation, Phase 15D validator, redaction, and mutation denial.

- [ ] **Step 5: Update redacted evidence and stop for final review**

Do not update `docs/handoff/CURRENT.md` to complete or begin Phase 15D until a separate final gate approves the observed Staging evidence.

## Migration Ordering and Dependencies

1. Revalidate HEAD and reserve the next migration number; current observation is 0030, so 0031 is only the conditional candidate.
2. Load and validate the exact `MAOS_DATABASE_ROLE_CONTRACT_V1` bindings; governed environments require distinct principals and no URL fallback.
3. Run the read-only legacy-object owner/operation/authority matrix; any failed or indeterminate row blocks before migration.
4. Create `work.requests` first because Work / Request Intake owns request identity.
5. Extend `ai.domain_execution_constraints` while preserving the existing Development trigger boundary.
6. Create `governance.request_classification_versions` with physical references to both authorities.
7. Install append-only, lineage, target/disposition, and Development guards in the same transaction.
8. Replay migration and verify checksum/history before any runtime grant.
9. Apply the separate governed runtime ACL transaction, then reconnect as runtime and verify the allowance/denial matrix.

A prerequisite migration is not needed while HEAD remains 0030 because one transactional migration can safely create separate request and classification authorities in dependency order. If another migration independently introduces or changes `work.requests`, stop and reconcile ownership/schema rather than duplicating it.

## Human Stop Conditions

Stop before continuing when any of the following occurs:

- repository HEAD no longer makes 0031 the next migration or another `work.requests` contract appears;
- `MAOS_DATABASE_MIGRATION_URL`, migration role, or runtime role binding is missing/invalid in a governed environment, or migration tooling would fall back to `DATABASE_URL`;
- Staging/Production migration and runtime principals are equal or share a privileged membership path;
- a legacy object owner cannot be resolved, the bound migration principal lacks direct/separately approved pre-existing owner-role authority, or ownership depends on runtime/superuser/temporary escalation/`SECURITY DEFINER`/unapproved transfer;
- the real PostgreSQL harness cannot prove owner, membership, ACL, PUBLIC leakage, denial, and reconnect behavior;
- final SQL requires a cross-domain privilege outside the fixed inventory or silently broadens an existing authority;
- implementation would create a second request, classification, policy-resolution, idempotency, Audit, or Evidence authority;
- physical FK/ownership cannot preserve Work versus Governance boundaries;
- existing Development database guards would need weakening or bypass;
- a destructive migration, inferred historical backfill, or history rewrite is required;
- exact request scope/environment/lifecycle semantics conflict with frozen architecture;
- Staging credential/provider interaction or any live mutation is required without explicit approval;
- any Production target or mutation is implicated;
- secret material would need to be printed, persisted, or copied;
- an authorization, migration, concurrency, restart, checksum, redaction, or fail-closed test cannot pass without changing approved semantics.

## Production Exclusion

- Migration execution, deployments, variables, data writes, and portal aliases target no Production resource.
- Local implementation and disposable PostgreSQL verification use no Production URL, role, credential, identifier, or provider connection.
- Production requires distinct provisioned principals, has no shared-role compatibility and no migration-URL fallback, and remains blocked until a separately approved future gate verifies its complete owner/ACL matrix.
- Runtime code must reject Production mutation unless a future separately governed phase explicitly authorizes it.
- Staging evidence must record exact target identities and `PRODUCTION_CHANGED = NO`.
- Phase 15C completion does not authorize Phase 15D or Production rollout.
