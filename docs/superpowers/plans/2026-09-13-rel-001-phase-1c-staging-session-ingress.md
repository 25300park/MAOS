# REL-001 Phase 1C Staging Session Ingress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the MAOS-CR-003 same-origin Control Room BFF and durable Staging Session ingress without creating production authority or changing existing Operations or email-alert behavior.

**Architecture:** The browser communicates only with the exact approved HTTPS Control Room origin. The Control Room BFF owns browser cookies, origin/CSRF enforcement, and trusted-header filtering; the Railway Core API Identity / Authorization boundary verifies credentials, issues and resolves PostgreSQL-backed Sessions, derives live authority, and records audit/evidence. Existing `CONTROL / OPERATIONS` authentication remains an independent compatibility path and is never reused for Session issuance.

**Tech Stack:** TypeScript 5.9, Node.js 24, Node `http`/`crypto`/`fetch`, npm workspaces, PostgreSQL and PGlite, Node test runner through `tsx`, Vercel Control Room function, Railway Core API.

**Spec:** `docs/change-requests/MAOS-CR-003-staging-session-ingress.md`

## Global constraints

- `MAOS-CR-003` is `APPROVED_C2`; Staging implementation is `AUTHORIZED_FOR_IMPLEMENTATION`.
- Scope is Staging implementation only. Production implementation authorization and production deployment authorization remain `NO`.
- Preserve the 30-minute idle timeout, 12-hour absolute lifetime, and 15-minute applicable MFA freshness window exactly.
- Preserve exact permissions: `CREATE / SESSION / staging / exact-project-scope / R2`, `REVOKE / SESSION / staging / exact-project-scope / R2`, and `PROVISION / IDENTITY / staging / exact-organization-project-scope / R2`.
- The browser must never receive a raw Session identifier in JavaScript, a response body, a URL, `localStorage`, or `sessionStorage`.
- The Session cookie is `__Host-maos_session; HttpOnly; Secure; SameSite=Strict; Path=/` with no `Domain` attribute and no weaker fallback.
- No wildcard, suffix, reflected, opaque/`null`, or preview-pattern origin matching.
- No direct operator SQL, debug endpoint, fabricated MFA state, plaintext credential, production activation, or provider mutation without a later explicit deployment action.
- Existing Staging Operations bearer behavior and alert-email API/Worker behavior must remain green.
- Preserve the pre-existing `.gitignore` modification byte-for-byte; expected SHA-256 is `22701F25090D52D262B452984995D2B12593F454EA6BFFA7C72F0DDCCE3E3B9C`.
- Generated `dist`, build, database, coverage, log, cache, and environment files must not be committed.

## File and responsibility map

| Area             | Planned files                                                                                                                                    | Responsibility                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Shared contracts | `packages/contracts/src/session.ts`, `packages/contracts/src/index.ts`                                                                           | Stable Session, assignment, resolution, and permission value types shared without reversing package boundaries.            |
| Identity policy  | `modules/identity/src/session.ts`, `modules/identity/src/index.ts`                                                                               | Freshness, live authority materialization, optimistic retry, revocation, and authenticator composition.                    |
| Persistence      | `packages/database/migrations/0019_staging_session_ingress.sql`, `packages/database/src/session-repository.ts`, `packages/database/src/index.ts` | Durable human assignments, Sessions, revocation history, atomic conditional updates, and restart-safe reads.               |
| Configuration    | `packages/config/src/index.ts`                                                                                                                   | Exact Staging-only API/BFF configuration and fail-closed production behavior.                                              |
| Core API         | `apps/api/src/staging-session-auth.ts`, `apps/api/src/identity-session-routes.ts`, `apps/api/src/server.ts`, `apps/api/src/app.ts`               | Credential verification, actor provisioning, issuance/revocation, internal Session context, and live route authentication. |
| Control Room BFF | `apps/web/src/session-bff.ts`, `apps/web/src/session-cookies.ts`, `apps/web/src/server.ts`, `apps/web/src/vercel.ts`                             | Same-origin exchange/logout/proxy, cookie/CSRF transport, header stripping, and authenticated rendering.                   |
| Packaging        | `apps/api/package.json`, `apps/web/package.json`, `scripts/staging-packaging.ts`                                                                 | Workspace dependencies and clean Vercel/Railway artifact resolution.                                                       |
| Evidence         | `docs/implementation/rel-001-phase-1c/REL001_PHASE1C_STAGING_SESSION_INGRESS_IMPLEMENTATION_EVIDENCE.md`                                         | Actual verification and Staging evidence classification after implementation.                                              |

## Dependency order

```text
Contracts
  -> Migration
  -> PostgreSQL repositories
  -> Identity Session policy
  -> Staging configuration
  -> API authentication composition
  -> Actor provisioning
  -> Session issue/resolve/revoke API
  -> Audit/evidence integration
  -> BFF cookie/CSRF primitives
  -> BFF routes and proxy
  -> End-to-end/restart/production-denial tests
  -> Packaging and full gates
  -> Separately authorized Staging deployment/evidence
```

## Requested-scope coverage

| Requirement                              | Plan task(s)                              |
| ---------------------------------------- | ----------------------------------------- |
| 1. Identity Session contracts            | Task 1                                    |
| 2. PostgreSQL schema/migration           | Task 2                                    |
| 3. Durable Session repository            | Task 3                                    |
| 4. Trusted actor provisioning operation  | Tasks 3 and 7                             |
| 5. Session issuance endpoint             | Task 8                                    |
| 6. Session resolution middleware/path    | Tasks 6 and 8                             |
| 7. Freshness enforcement                 | Task 4                                    |
| 8. Revocation                            | Tasks 3, 4, and 8                         |
| 9. Optimistic version/concurrency        | Tasks 3 and 4                             |
| 10. Audit/evidence                       | Task 9                                    |
| 11. BFF cookie transport                 | Tasks 10 and 11                           |
| 12. `__Host-maos_session` behavior       | Task 10                                   |
| 13. CSRF token issuance/binding          | Tasks 10 and 11                           |
| 14. Exact-origin enforcement             | Tasks 5, 10, and 11                       |
| 15. Trusted-header stripping             | Tasks 10 and 11                           |
| 16. Core API service identity/delegation | Task 6                                    |
| 17. Control Room BFF routes              | Task 11                                   |
| 18. Staging-only configuration           | Task 5                                    |
| 19. Production fail-closed behavior      | Tasks 5, 6, 11, and 12                    |
| 20. Test plan                            | Tasks 1–13 and the Test sequence          |
| 21. Migration verification               | Tasks 2 and 13 and the Migration sequence |
| 22. Restart durability                   | Tasks 3 and 12                            |
| 23. Rollback strategy                    | Rollback and revocation strategy          |
| 24. Staging deployment sequence          | Staging deployment sequence               |

## Mandatory review checkpoints

1. **Schema checkpoint:** stop after Task 2 if migration review finds destructive SQL, authority snapshots, raw credentials, raw CSRF material, or a requirement to alter frozen architecture.
2. **Authentication checkpoint:** stop after Task 6 if preserving the existing Operations authenticator would require sharing its token or permission with Session issuance.
3. **Browser-exchange checkpoint:** the initial credential exchange has no existing Session and therefore cannot present Session-bound CSRF. It must require exact Origin plus a non-ambient Authorization credential; Session-bound CSRF begins immediately after issuance for every subsequent unsafe request. If security review rejects this precise interpretation, stop for a C2 amendment rather than creating a partial unauthenticated Session.
4. **Provider checkpoint:** no Railway/Vercel variables, migrations, push, or deployment are changed until local gates pass and the human separately authorizes Staging provider action.
5. **Production checkpoint:** any need for production configuration, credential, domain, data, or deployment stops the work.

---

### Task 1: Canonical Session and authority contracts

**Files:**

- Create: `packages/contracts/src/session.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/test/session-contracts.test.ts`
- Create: `modules/identity/src/session.ts`
- Modify: `modules/identity/src/index.ts`
- Test: `modules/identity/test/session.test.ts`

**Implementation objective:** Define immutable Session records, trusted assignment projections, internal failure reasons, repository ports, the three exact permission requests, and a controlled-clock Session service without persistence or HTTP concerns.

**Dependencies:** Approved MAOS-CR-003 and existing `IdentityContext`, `Permission`, `AuthorizationRequest`, `ToolRisk`, and deny-precedence behavior.

**Interfaces:**

```ts
export interface SessionRecord {
  session_id: string;
  actor_id: string;
  tenant_binding_origin: string;
  tenant_binding_ref?: string;
  issued_at: string;
  last_accessed_at: string;
  absolute_expires_at: string;
  session_version: number;
  revoked_at?: string;
  revocation_evidence_ref?: string;
  audit_evidence_ref?: string;
  mfa_verified_at?: string;
  mfa_verification_ref?: string;
}

export interface SessionRepositoryPort {
  create(input: CreateSessionRecord): Promise<SessionRecord>;
  find(sessionId: string): Promise<SessionRecord | null>;
  touch(
    sessionId: string,
    expectedVersion: number,
    accessedAt: string,
  ): Promise<SessionRecord | null>;
  revoke(input: RevokeSessionRecord): Promise<SessionRecord | null>;
  resolveIdentity(actorId: string): Promise<IdentityContext | null>;
}

export const STAGING_SESSION_PERMISSIONS = Object.freeze({
  create: {
    action: "CREATE",
    resource: "SESSION",
    environment: "staging",
    risk: "R2",
  },
  revoke: {
    action: "REVOKE",
    resource: "SESSION",
    environment: "staging",
    risk: "R2",
  },
  provision: {
    action: "PROVISION",
    resource: "IDENTITY",
    environment: "staging",
    risk: "R2",
  },
});
```

- [ ] **RED:** Add contract tests asserting exact field names, no cached grants/scopes, exact permission dimensions, and Session ID non-authority.

- [ ] Run `npx tsx --test packages/contracts/test/session-contracts.test.ts modules/identity/test/session.test.ts`; expect failure because the exports do not exist.

- [ ] **GREEN:** Add only the contracts, repository port, clock/id injection, and permission constants. Keep permission `scope` supplied as an exact non-wildcard value rather than hard-coding a project.

- [ ] Run `npx tsx --test packages/contracts/test/session-contracts.test.ts modules/identity/test/session.test.ts`; require PASS.

- [ ] Commit with `feat: define REL-001 session contracts`.

**GREEN completion criteria:** Types compile, the three authority contracts are exact, no production permission exists, and no Session value itself grants authority.

**Verification command:** `npm run typecheck && npx tsx --test packages/contracts/test/session-contracts.test.ts modules/identity/test/session.test.ts`

---

### Task 2: Forward-only PostgreSQL migration 0019

**Files:**

- Create: `packages/database/migrations/0019_staging_session_ingress.sql`
- Modify: `packages/database/test/database.test.ts`
- Modify: `scripts/database-verify.ts`

**Implementation objective:** Add normalized, constrained durable storage for trusted human project assignments, exact permission assignments, Sessions, and append-only revocation history.

**Dependencies:** Task 1 field names; existing `identity.humans`, `core.organizations`, `core.projects`, migration checksum/replay infrastructure.

**Schema contract:**

```sql
CREATE TABLE identity.human_project_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id uuid NOT NULL REFERENCES identity.humans(id),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  project_id uuid NOT NULL REFERENCES core.projects(id),
  scope text NOT NULL CHECK (length(trim(scope)) > 0 AND scope !~ '[*?]'),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at timestamptz,
  UNIQUE (human_id, organization_id, project_id, scope)
);

CREATE TABLE identity.assignment_permissions (
  assignment_id uuid NOT NULL REFERENCES identity.human_project_assignments(id),
  action text NOT NULL,
  resource text NOT NULL,
  environment text NOT NULL CHECK (environment = 'staging'),
  risk text NOT NULL CHECK (risk = 'R2'),
  effect text NOT NULL CHECK (effect IN ('ALLOW', 'DENY')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (assignment_id, action, resource, environment, risk, effect)
);

CREATE TABLE identity.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES identity.humans(id),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  tenant_binding_origin text NOT NULL CHECK (length(trim(tenant_binding_origin)) > 0),
  tenant_binding_ref text,
  issued_at timestamptz NOT NULL,
  last_accessed_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  session_version bigint NOT NULL DEFAULT 1 CHECK (session_version > 0),
  revoked_at timestamptz,
  revocation_evidence_ref text,
  audit_evidence_ref text,
  mfa_verified_at timestamptz,
  mfa_verification_ref text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (last_accessed_at >= issued_at),
  CHECK (absolute_expires_at = issued_at + INTERVAL '12 hours'),
  CHECK ((mfa_verified_at IS NULL) = (mfa_verification_ref IS NULL)),
  CHECK ((revoked_at IS NULL) = (revocation_evidence_ref IS NULL))
);

CREATE TABLE identity.session_revocations (
  session_id uuid NOT NULL REFERENCES identity.sessions(id),
  revoked_version bigint NOT NULL CHECK (revoked_version > 1),
  revoked_at timestamptz NOT NULL,
  actor_id uuid NOT NULL,
  evidence_ref text NOT NULL CHECK (length(trim(evidence_ref)) > 0),
  PRIMARY KEY (session_id, revoked_version)
);
```

The migration must add triggers that reject changes to immutable Session binding/issuance fields, reject clearing revocation, and reject update/delete on `identity.session_revocations`. It must add indexes for external-subject lookup, active assignment lookup, Session actor lookup, and active Session resolution.

- [ ] **RED:** Extend database tests to expect migration `0019_staging_session_ingress`, 19 applied migrations, immutable bindings, append-only revocation, exact non-wildcard scopes, and absence of credential/token/raw-CSRF columns.

- [ ] Run `npx tsx --test packages/database/test/database.test.ts`; expect failure because migration 0019 is absent.

- [ ] **GREEN:** Add the migration and update only the canonical migration list/count/latest-ID expectations in `scripts/database-verify.ts` and database tests.

- [ ] Run `npm run db:verify` and `npx tsx --test packages/database/test/database.test.ts`; require clean initialization and replay PASS.

- [ ] Stop at the schema checkpoint and inspect `git diff -- packages/database/migrations/0019_staging_session_ingress.sql` before committing.

- [ ] Commit with `feat: add durable staging session schema`.

**GREEN completion criteria:** Migration 0019 is additive, deterministic, idempotent through the migration registry, contains no secrets/authority snapshots, and enforces immutability/revocation constraints.

**Verification command:** `npm run db:verify && npx tsx --test packages/database/test/database.test.ts`

---

### Task 3: Durable Session and assignment repository

**Files:**

- Create: `packages/database/src/session-repository.ts`
- Modify: `packages/database/src/index.ts`
- Create: `packages/database/test/session-repository.test.ts`

**Implementation objective:** Implement parameterized, atomic persistence operations used by Identity without moving policy into the database package.

**Dependencies:** Tasks 1–2.

**Interfaces:**

```ts
export class PostgresSessionRepository {
  constructor(private readonly database: MigrationDatabase) {}
  provisionHuman(input: StoredHumanProvisioning): Promise<StoredHumanIdentity>;
  resolveIdentityByExternalSubject(
    externalSubject: string,
  ): Promise<StoredHumanIdentity | null>;
  resolveIdentityByActorId(
    actorId: string,
  ): Promise<StoredHumanIdentity | null>;
  createSession(input: StoredSessionCreation): Promise<StoredSession>;
  findSession(sessionId: string): Promise<StoredSession | null>;
  touchSession(input: {
    sessionId: string;
    expectedVersion: number;
    accessedAt: string;
  }): Promise<StoredSession | null>;
  revokeSession(input: StoredSessionRevocation): Promise<StoredSession | null>;
}
```

`provisionHuman` uses a single SQL CTE/transactional statement to create-or-resolve the immutable external subject and exact assignments. `touchSession` and `revokeSession` use `WHERE id = $1 AND session_version = $2` and return `null` on conflict. Revocation writes the Session update and history row atomically.

- [ ] **RED:** Add PGlite tests for idempotent identical provisioning, conflicting subject/organization rejection, assignment-derived permissions, version-1 creation, successful N→N+1 touch, stale-version rejection, irreversible revocation, and reconstruction after a new repository instance.

- [ ] Run `npx tsx --test packages/database/test/session-repository.test.ts`; expect module-not-found failure.

- [ ] **GREEN:** Implement minimal SQL methods with positional parameters. Never accept wildcard scope or return credential fields.

- [ ] Run `npx tsx --test packages/database/test/session-repository.test.ts`; require PASS.

- [ ] Commit with `feat: add durable session repository`.

**GREEN completion criteria:** All writes are atomic/conditional, no last-write-wins path exists, revoked state survives reconstruction, and assignment reads produce exact permission data only.

**Verification command:** `npx tsx --test packages/database/test/session-repository.test.ts packages/database/test/database.test.ts`

---

### Task 4: Identity Session lifecycle, freshness, and optimistic resolution

**Files:**

- Modify: `modules/identity/src/session.ts`
- Modify: `modules/identity/src/index.ts`
- Modify: `modules/identity/test/session.test.ts`

**Implementation objective:** Implement issuance, resolution, live assignment materialization, freshness, one re-resolution after optimistic conflict, MFA-required evaluation, and irreversible revocation as Identity policy.

**Dependencies:** Tasks 1 and 3.

**Interfaces:**

```ts
export interface SessionServiceOptions {
  now: () => Date;
  repository: SessionRepositoryPort;
  audit: SessionAuditSink;
}

export class SessionService {
  issue(input: IssueSessionInput): Promise<IssueSessionResult>;
  resolve(input: {
    sessionId: string;
    mfaRequired: boolean;
    context: AuthenticationRequestContext;
  }): Promise<SessionResolution>;
  revoke(input: {
    sessionId: string;
    expectedVersion: number;
    actor: IdentityContext;
    evidenceRef: string;
    context: AuthenticationRequestContext;
  }): Promise<SessionRecord>;
}
```

The resolver checks, in order: existence, revocation, immutable tenant consistency, `now - lastAccessedAt < 30 minutes`, `now - issuedAt < 12 hours`, applicable `now - mfaVerifiedAt < 15 minutes`, live assignment availability, and exact current identity projection. Only then may it conditionally update `lastAccessedAt` and version. On update conflict it reloads once and repeats all checks; a second conflict fails closed.

- [ ] **RED:** With a fixed clock, add boundary tests immediately before/at 30 minutes, 12 hours, and 15 minutes; add missing MFA, revoked, tenant mismatch, absent assignment, first/second version-conflict, and failed-resolution-does-not-touch tests.

- [ ] Run `npx tsx --test modules/identity/test/session.test.ts`; expect failures for unimplemented lifecycle methods.

- [ ] **GREEN:** Implement the policy in Identity only. Keep internal failure reasons available for redacted events, but expose all invalid Session cases to HTTP as the same authentication failure.

- [ ] Run `npx tsx --test modules/identity/test/session.test.ts modules/identity/test/identity.test.ts`; require PASS.

- [ ] Commit with `feat: enforce durable session lifecycle`.

**GREEN completion criteria:** Exact freshness boundaries, live authorization materialization, optimistic conflict behavior, no fabricated MFA, and no update on invalid Session are proven by controlled-clock tests.

**Verification command:** `npx tsx --test modules/identity/test/session.test.ts modules/identity/test/identity.test.ts`

---

### Task 5: Staging-only configuration and secret references

**Files:**

- Modify: `packages/config/src/index.ts`
- Modify: `packages/config/test/config.test.ts`

**Implementation objective:** Define separate API and BFF configuration that is disabled outside Staging, validates exact HTTPS origins, and never exposes values in errors.

**Dependencies:** Task 1.

**Configuration contract:**

| Variable                                       | Consumer | Secret | Purpose                                                             |
| ---------------------------------------------- | -------- | ------ | ------------------------------------------------------------------- |
| `MAOS_STAGING_SESSION_INGRESS_ENABLED`         | API/Web  | No     | Must equal `true` to activate the Staging-only composition.         |
| `MAOS_STAGING_CONTROL_ROOM_ORIGIN`             | API/Web  | No     | One exact HTTPS origin; no path, query, fragment, or wildcard.      |
| `MAOS_CORE_API_ORIGIN`                         | Web      | No     | Exact HTTPS Railway API origin.                                     |
| `MAOS_STAGING_BFF_SERVICE_BEARER_TOKEN`        | API/Web  | Yes    | Authenticates only the BFF internal hop.                            |
| `MAOS_STAGING_BFF_CSRF_SECRET`                 | Web      | Yes    | HMAC key for Session-bound CSRF tokens.                             |
| `MAOS_STAGING_SESSION_CREDENTIAL_BEARER_TOKEN` | API      | Yes    | Verifies the bounded Staging human credential.                      |
| `MAOS_STAGING_SESSION_EXTERNAL_SUBJECT`        | API      | No     | Maps that credential to the provisioned immutable external subject. |
| `MAOS_STAGING_IDENTITY_ADMIN_BEARER_TOKEN`     | API      | Yes    | Separate bootstrap/provisioning credential.                         |
| `MAOS_STAGING_IDENTITY_ADMIN_ACTOR_ID`         | API      | No     | Audited human provisioning actor identifier.                        |
| `DATABASE_URL`                                 | API      | Yes    | Existing PostgreSQL connection used by Session persistence.         |

- [ ] **RED:** Add tests for valid Staging API/Web configurations; missing fields; HTTP origins; origins with paths; wildcard/preview patterns; equal service/user/admin tokens; and any enabled non-Staging environment.

- [ ] Run `npx tsx --test packages/config/test/config.test.ts`; expect missing-export failures.

- [ ] **GREEN:** Add `loadStagingSessionApiConfig` and `loadStagingSessionBffConfig`. Return `{ enabled: false }` unless explicitly enabled in Staging; throw `STAGING_SESSION_INGRESS_FORBIDDEN` if the enable flag appears in production. Errors name variables but never values.

- [ ] Run `npx tsx --test packages/config/test/config.test.ts`; require PASS.

- [ ] Commit with `feat: add staging session configuration`.

**GREEN completion criteria:** Secrets remain environment-only, exact origins are normalized to `URL.origin`, credential roles cannot share a token, and production cannot activate the feature.

**Verification command:** `npx tsx --test packages/config/test/config.test.ts && npm run typecheck`

---

### Task 6: API authenticator composition and internal service delegation

**Files:**

- Create: `apps/api/src/staging-session-auth.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `modules/identity/src/index.ts`
- Create: `apps/api/test/staging-session-auth.test.ts`
- Modify: `apps/api/test/staging-operations-auth.test.ts`

**Implementation objective:** Compose four non-overlapping Staging authentication paths—existing Operations bearer, Identity admin bearer, Session-issuance human bearer, and BFF service-plus-Session—without allowing one credential or permission to substitute for another.

**Dependencies:** Tasks 3–5.

**Interfaces:**

```ts
export interface AuthenticationRequestContext {
  correlation_id: string;
  method: string;
  path: string;
  request_id: string;
  trace_id: string;
  mfa_required: boolean;
}

export type Authenticator = (
  headers: Record<string, HeaderValue>,
  context?: AuthenticationRequestContext,
) => Promise<IdentityContext | null>;

export function createStagingApiAuthenticator(input: {
  operations: Authenticator | undefined;
  sessionService: SessionService;
  sessionCredential: StagingCredentialVerifier;
  identityAdmin: StagingIdentityAdminVerifier;
  bffServiceToken: string;
}): Authenticator;
```

If `x-session-id` or `x-maos-bff-service-authorization` is present, the composite must use only the BFF Session path and fail closed rather than fall through to bearer authentication. Constant-time digest comparison is required for all configured bearer/service credentials. `createApiServer` passes request context and a route-level `mfa_required` flag to the authenticator; existing authenticators remain source-compatible by ignoring the optional second argument.

- [ ] **RED:** Add tests proving each credential maps only to its exact principal/permissions, malformed or partial BFF headers return null, invalid service token cannot fall through, Session IDs/tokens are absent from logs, and existing Operations tests remain unchanged.

- [ ] Run `npx tsx --test apps/api/test/staging-session-auth.test.ts apps/api/test/staging-operations-auth.test.ts`; expect failure before implementation.

- [ ] **GREEN:** Implement constant-time verifiers and the composite; update `app.ts` only enough to pass authentication context and MFA applicability.

- [ ] Run the targeted tests; require PASS, then stop at the authentication checkpoint and inspect the diff for Operations behavior changes.

- [ ] Commit with `feat: compose staging session authentication`.

**GREEN completion criteria:** Operations authentication remains byte-for-byte equivalent in result, Session paths require valid BFF service identity, user/admin credentials are distinct, and no production authenticator is constructed.

**Verification command:** `npx tsx --test apps/api/test/staging-session-auth.test.ts apps/api/test/staging-operations-auth.test.ts apps/api/test/security.test.ts`

---

### Task 7: Governed trusted-actor provisioning operation

**Files:**

- Create: `apps/api/src/identity-provisioning-routes.ts`
- Create: `apps/api/test/identity-provisioning-routes.test.ts`
- Modify: `apps/api/src/server.ts`

**Implementation objective:** Expose one Staging-only, audited, idempotent API operation that provisions a human plus exact organization/project assignments through the repository—never direct operator SQL.

**Dependencies:** Tasks 1–6.

**Route contract:**

```ts
POST /api/v1/identity/provisioning/humans
Authorization: Bearer <identity-admin-credential>
Idempotency-Key: <opaque-request-key>

{
  "display_name": "Staging Operator",
  "external_subject": "approved-provider-subject",
  "organization_id": "uuid",
  "project_id": "uuid",
  "scope": "project-maos",
  "permissions": [
    { "action": "CREATE", "resource": "SESSION", "environment": "staging", "risk": "R2", "effect": "ALLOW" },
    { "action": "REVOKE", "resource": "SESSION", "environment": "staging", "risk": "R2", "effect": "ALLOW" }
  ],
  "evidence_refs": ["evidence://staging/session-provisioning/approved"]
}
```

The checked-in test values above are synthetic. Real actor/organization/project values are supplied only during separately authorized Staging provider action.

- [ ] **RED:** Test missing/invalid credential `401`, wrong exact permission `403`, wildcard/non-Staging/unapproved permission `422`, first request success, identical idempotent replay, conflicting subject/organization/scope `409`, and audit redaction.

- [ ] Run `npx tsx --test apps/api/test/identity-provisioning-routes.test.ts`; expect module-not-found failure.

- [ ] **GREEN:** Implement `createIdentityProvisioningRoutes` with exact `PROVISION / IDENTITY / staging / configured-scope / R2` access and repository-backed idempotency/conflict behavior. Register routes only when Staging Session ingress is enabled.

- [ ] Run the targeted test; require PASS.

- [ ] Commit with `feat: add governed staging actor provisioning`.

**GREEN completion criteria:** No SQL/operator bypass exists; identical input is idempotent; conflicting identity bindings fail; only approved permission tuples can be persisted.

**Verification command:** `npx tsx --test apps/api/test/identity-provisioning-routes.test.ts apps/api/test/governance.test.ts`

---

### Task 8: Session issuance, internal context, resolution, and revocation API

**Files:**

- Create: `apps/api/src/identity-session-routes.ts`
- Create: `apps/api/test/identity-session-routes.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/package.json`

**Implementation objective:** Add Core API endpoints for BFF-mediated issuance, internal context resolution, and current-Session revocation while making the Session authenticator available to all existing protected routes.

**Dependencies:** Tasks 1–7.

**Route contracts:**

```text
POST /api/v1/identity/sessions
  human Authorization bearer + BFF service header
  exact CREATE / SESSION authorization
  returns session_reference only to the authenticated BFF hop

GET /api/v1/identity/session-context
  BFF service header + x-session-id
  performs authentication resolution, not a substitute business permission
  returns current human IdentityContext to the BFF only

POST /api/v1/identity/sessions/revoke
  BFF service header + x-session-id
  exact REVOKE / SESSION authorization
  revokes the current Session and returns no Session identifier
```

Add an explicit `AUTHENTICATED_INTERNAL` route access mode to `ApiRoute`. It is valid only for the Session-context route, requires the composite BFF Session authenticator, and skips business authorization solely because it is the authentication projection itself. A boundary test must reject use of this access mode by any other route factory.

- [ ] **RED:** Add tests for service token missing/invalid, user credential missing/invalid, exact CREATE denial, successful issue, Session ID absent from browser-facing envelopes/logs, internal context with live assignments, existing route authorization through Session, REVOKE denial/success, revoked/expired Session `401`, and no enumeration detail.

- [ ] Run `npx tsx --test apps/api/test/identity-session-routes.test.ts`; expect failure.

- [ ] **GREEN:** Implement route factory, internal access classification, actual PostgreSQL composition through `DATABASE_URL`, and shutdown cleanup. Add `@maos/database` as an API workspace dependency without adding an external package.

- [ ] Run targeted identity/API tests and existing Operations/alert-email runtime tests; require PASS.

- [ ] Commit with `feat: add staging session API runtime`.

**GREEN completion criteria:** Core API owns every Session lifecycle operation, existing protected routes can consume the resolved identity, invalid Sessions produce stable `401`, exact permission denial remains `403`, and Operations/email routes retain behavior.

**Verification command:** `npx tsx --test apps/api/test/identity-session-routes.test.ts apps/api/test/staging-operations-auth.test.ts apps/api/test/alert-email-runtime.test.ts apps/api/test/security.test.ts`

---

### Task 9: Durable audit/evidence integration

**Files:**

- Modify: `modules/identity/src/session.ts`
- Modify: `apps/api/src/identity-session-routes.ts`
- Modify: `apps/api/src/identity-provisioning-routes.ts`
- Create: `apps/api/test/session-audit.test.ts`

**Implementation objective:** Record human actor and BFF service/delegation evidence without putting secrets or Session identifiers into audit, log, error, metric, or response data.

**Dependencies:** Tasks 4, 7, and 8; existing `ObservabilityAuditService` and request context.

**Audit contract:**

```ts
type SessionAuditAction =
  | "IDENTITY.PROVISIONED"
  | "SESSION.ISSUED"
  | "SESSION.RESOLVED"
  | "SESSION.REVOKED";

interface SessionAuditMetadata {
  bff_service_actor_id: string;
  session_version: number;
  tenant_binding_origin: string;
}
```

The audit target may use the Session UUID internally, but serialized logs and API responses must use only bounded evidence references. Unknown/invalid Session attempts produce a redacted operational failure event rather than an audit record claiming a human actor.

- [ ] **RED:** Assert action/actor/target/result/context/evidence continuity; BFF service metadata separation; hash-chain integrity; and absence of configured tokens, raw Session IDs, CSRF values, and MFA evidence from serialized logs/events/errors.

- [ ] Run `npx tsx --test apps/api/test/session-audit.test.ts`; expect failure.

- [ ] **GREEN:** Add a narrow `SessionAuditSink` adapter over `ObservabilityAuditService` and pass generated audit references into atomic Session writes.

- [ ] Run `npx tsx --test apps/api/test/session-audit.test.ts modules/observability/test/observability.test.ts`; require PASS.

- [ ] Commit with `feat: audit staging session lifecycle`.

**GREEN completion criteria:** Human and BFF service identities are distinct, audit records are correlated and integrity-valid, and secret/identifier redaction is proven.

**Verification command:** `npx tsx --test apps/api/test/session-audit.test.ts modules/observability/test/observability.test.ts`

---

### Task 10: BFF cookie, origin, CSRF, and trusted-header primitives

**Files:**

- Create: `apps/web/src/session-cookies.ts`
- Create: `apps/web/src/session-bff.ts`
- Create: `apps/web/test/session-security.test.ts`
- Modify: `apps/web/package.json`

**Implementation objective:** Implement transport primitives independently from routing so cookie construction, exact-origin checks, CSRF binding, and header stripping can be exhaustively unit tested.

**Dependencies:** Tasks 1 and 5; Node `crypto`; no new third-party dependency.

**Interfaces:**

```ts
export const SESSION_COOKIE = "__Host-maos_session";
export const CSRF_COOKIE = "__Host-maos_csrf";

export function createSessionCookie(
  sessionReference: string,
  maxAgeSeconds: number,
): string;
export function clearSessionCookie(): string;
export function createCsrfToken(
  sessionReference: string,
  csrfSecret: string,
): string;
export function verifyCsrfToken(
  sessionReference: string,
  supplied: string,
  csrfSecret: string,
): boolean;
export function requireExactOrigin(
  headers: IncomingHttpHeaders,
  expectedOrigin: string,
): void;
export function trustedProxyHeaders(headers: IncomingHttpHeaders): Headers;
```

`createCsrfToken` uses HMAC-SHA-256 over the opaque Session reference. `__Host-maos_csrf` is `Secure; SameSite=Strict; Path=/;` without `Domain`; it is intentionally readable only so same-origin Control Room code can copy the token into `x-maos-csrf-token`. It carries no Session ID or authority. It must never enter local/session storage or a URL.

- [ ] **RED:** Test all exact Session-cookie attributes, no `Domain`, bounded max-age, no weaker fallback, exact origin acceptance, similar/suffix/HTTP/`null` rejection, timing-safe CSRF mismatch, Session binding, and removal of inbound `authorization`, `cookie`, `x-session-id`, `x-maos-bff-service-authorization`, actor, tenant, scope, role, and MFA headers.

- [ ] Run `npx tsx --test apps/web/test/session-security.test.ts`; expect missing-module failure.

- [ ] **GREEN:** Implement only pure helpers and add `@maos/config`/`@maos/contracts` workspace dependencies if imported. Do not change `vercel.json` or TypeScript target.

- [ ] Run the targeted test; require PASS, then stop at the browser-exchange checkpoint.

- [ ] Commit with `feat: enforce Control Room session transport`.

**GREEN completion criteria:** Cookie output exactly matches MAOS-CR-003, CSRF tokens are Session-bound, origin matching is equality-only, and untrusted forwarding headers cannot survive.

**Verification command:** `npx tsx --test apps/web/test/session-security.test.ts`

---

### Task 11: Same-origin Control Room BFF routes and authenticated rendering

**Files:**

- Modify: `apps/web/src/session-bff.ts`
- Modify: `apps/web/src/server.ts`
- Modify: `apps/web/src/vercel.ts`
- Create: `apps/web/test/session-bff.test.ts`
- Modify: `apps/web/test/server.test.ts`
- Modify: `apps/web/test/vercel-adapter.test.ts`
- Modify: `scripts/staging-packaging.ts`

**Implementation objective:** Add same-origin exchange/logout/API proxy and authenticated page resolution without exposing Session identifiers or weakening the existing unauthenticated shell.

**Dependencies:** Tasks 5, 8, and 10.

**BFF routes:**

```text
POST /auth/session
  requires exact Origin and non-ambient Authorization credential
  forwards credential plus BFF service identity to Core API issuance
  sets __Host-maos_session and __Host-maos_csrf
  returns { authenticated: true } only

POST /auth/logout
  requires exact Origin plus x-maos-csrf-token
  forwards opaque Session reference server-side for revocation
  always clears both cookies after the Core API attempt

/api/v1/*
  requires valid Session cookie
  unsafe methods additionally require exact Origin plus CSRF header
  strips untrusted headers and injects service identity plus Session reference

Control Room HTML routes
  resolve /api/v1/identity/session-context server-to-server
  render live identity on success; render the existing authentication-required view otherwise
```

- [ ] **RED:** Use a local fake Core API to test successful exchange, exact `Set-Cookie`, no Session ID in body/HTML/logs, authenticated reload, safe GET proxy, unsafe CSRF/origin rejection, trusted-header stripping, logout revocation/clear, upstream timeout/failure, and production-disabled behavior.

- [ ] Run `npx tsx --test apps/web/test/session-bff.test.ts apps/web/test/server.test.ts apps/web/test/vercel-adapter.test.ts`; expect failure.

- [ ] **GREEN:** Wrap the existing Control Room handler with the optional Staging BFF runtime. Preserve the current handler unchanged when disabled. Use `fetch` injection for deterministic tests and `AbortSignal.timeout` for bounded upstream calls using the existing provider execution limits.

- [ ] Update `scripts/staging-packaging.ts` so a clean `@maos/web` build proves every added workspace runtime dependency is built/resolvable; do not use committed `dist` or Vercel `includeFiles` as the primary fix.

- [ ] Run targeted Web tests and `npm run verify:staging-packaging`; require PASS.

- [ ] Commit with `feat: add same-origin Control Room session BFF`.

**GREEN completion criteria:** Browser traffic stays same-origin, Session references stay server-only, exact Origin and CSRF protect unsafe traffic, authenticated rendering uses live Core API identity, and disabled behavior matches the current Control Room.

**Verification command:** `npx tsx --test apps/web/test/session-bff.test.ts apps/web/test/server.test.ts apps/web/test/vercel-adapter.test.ts && npm run verify:staging-packaging`

---

### Task 12: End-to-end durability, isolation, and regression suite

**Files:**

- Create: `apps/api/test/staging-session-ingress-e2e.test.ts`
- Modify: `scripts/phase-1.19-e2e.test.ts` only if its existing cross-component harness is required; otherwise leave it unchanged.
- Modify: `packages/database/test/session-repository.test.ts`
- Modify: `apps/web/test/session-bff.test.ts`

**Implementation objective:** Prove the complete Browser→BFF→API→PostgreSQL path, restart durability, failure concealment, and preservation of unrelated authentication/email behavior.

**Dependencies:** Tasks 1–11.

- [ ] **RED:** Build an E2E fixture with PGlite, actual API server, actual BFF server, fixed clock, synthetic secrets, and no network/provider calls. Add assertions for provisioning→issuance→authenticated request→touch/version increment→restart→resolve→logout/revocation→restart→401.

- [ ] Add tests for tenant/scope mismatch, explicit deny, 30-minute idle boundary, 12-hour absolute boundary, required MFA missing/15-minute boundary, concurrent touches, stale version, service revocation, origin mismatch, CSRF mismatch, and redaction.

- [ ] Run `npx tsx --test apps/api/test/staging-session-ingress-e2e.test.ts`; expect failures until all actual composition points are connected.

- [ ] **GREEN:** Connect only missing composition seams. Do not add test-only runtime bypasses or global singleton state.

- [ ] Run the E2E test twice in fresh processes and require PASS both times.

- [ ] Run regression targets for Operations auth and email alert API/Worker; require unchanged results.

- [ ] Commit with `test: verify staging session ingress end to end`.

**GREEN completion criteria:** Durable and revoked Sessions survive process reconstruction, concurrency fails closed, all sensitive values are absent from output, and Operations/email behavior remains intact.

**Verification command:** `npx tsx --test apps/api/test/staging-session-ingress-e2e.test.ts apps/api/test/staging-operations-auth.test.ts apps/api/test/alert-email-runtime.test.ts apps/worker/test/alert-email-runtime.test.ts packages/database/test/alert-email-repository.test.ts`

---

### Task 13: Clean migration replay, packaging, full gates, and evidence record

**Files:**

- Modify: `scripts/staging-packaging.ts` only if Task 11 did not complete its final dependency assertion.
- Create: `docs/implementation/rel-001-phase-1c/REL001_PHASE1C_STAGING_SESSION_INGRESS_IMPLEMENTATION_EVIDENCE.md`
- Modify: `docs/implementation/rel-001-phase-1c/REL001_PHASE1C_COMPLETION_REPORT.md`
- Modify: `docs/implementation/rel-001-phase-1c/REL001_PHASE1C_MASTER_INDEX.md`

**Implementation objective:** Verify from a clean generated-artifact/database state, document actual evidence without claiming deployment, and prepare—not execute—the Staging rollout.

**Dependencies:** Tasks 1–12.

- [ ] Remove only generated workspace `dist` directories after enumerating and validating that each target is inside `apps`, `modules`, or `packages`; preserve `.gitignore` and all source/doc files.

- [ ] Run `npm test` and require the pretest build to recreate required artifacts automatically.

- [ ] Run the full gate sequence:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run db:verify
npm run check:boundaries
npm run smoke:health
npm run verify:staging-packaging
npm run scan:repository
git diff --check
git status --short
```

- [ ] Confirm migration replay applies `0001`–`0019` once and skips all 19 on replay; confirm no `dist`, database, environment, credential, log, cache, or coverage artifact is staged.

- [ ] Record exact commands/results, test totals, migration IDs, security/redaction results, architecture-boundary result, `.gitignore` hash, and `STAGING_DEPLOYMENT_NOT_PERFORMED` in the evidence document.

- [ ] Update the Phase 1C report/index to `IMPLEMENTED_LOCALLY / STAGING_EVIDENCE_PENDING` only if every local gate passes. Do not mark Staging deployed or production ready.

- [ ] Commit implementation evidence separately with `docs: record REL-001 phase 1C implementation evidence`.

**GREEN completion criteria:** Every local gate passes from clean state, migration replay is deterministic, evidence is exact, and only `.gitignore` remains as the pre-existing unstaged modification.

**Verification command:** the full gate sequence above.

---

## Migration sequence

1. Load the existing checksum-verified migrations 0001–0018.
2. Apply `0019_staging_session_ingress` to a clean PGlite database.
3. Verify all tables, keys, constraints, triggers, indexes, and absence of sensitive columns.
4. Replay all migrations and require 19 skipped with no schema mutation.
5. Run repository lifecycle and restart tests against PGlite.
6. Before any Railway action, review 0019 as additive/forward-only and capture the current Staging schema version.
7. After separate human authorization, apply 0019 through the repository migration command—not interactive/direct SQL—and capture checksum/schema-version evidence.
8. Do not down-migrate. Disable runtime and forward-fix if Staging verification fails.

## Test sequence

1. Contract and permission tests.
2. Migration schema/constraint/replay tests.
3. PostgreSQL repository lifecycle/restart tests.
4. Identity fixed-clock freshness/concurrency tests.
5. Configuration isolation/fail-closed tests.
6. API authentication-composition tests, including unchanged Operations auth.
7. Provisioning, issuance, context, revocation, 401/403, and audit tests.
8. BFF cookie/origin/CSRF/header-filter tests.
9. Browser→BFF→API→PostgreSQL E2E twice in fresh processes.
10. Alert-email API/Worker and repository regression tests.
11. Clean-artifact full suite and all repository gates.

## Staging deployment sequence — separate human authorization required

1. Confirm local implementation/evidence commits and a clean branch; do not include `.gitignore`.
2. Obtain explicit authorization to push/merge and allow configured Staging auto-deploys.
3. In provider secret stores only, configure distinct BFF service, BFF CSRF, Session credential, and Identity admin secrets; configure exact non-secret Staging origins/subject/actor references. Never print values.
4. Keep `MAOS_STAGING_SESSION_INGRESS_ENABLED` disabled while deploying the Core API artifact that understands migration 0019.
5. Apply migration 0019 to Railway Staging through the governed migration command and capture checksum/replay evidence.
6. Enable the Core API Staging Session composition; verify `/health`, `/health/live`, `/health/ready`, existing Operations bearer behavior, and alert-email health.
7. Invoke the governed provisioning endpoint once with approved human/organization/project inputs and capture idempotent replay/audit evidence.
8. Deploy the Control Room BFF with the same exact HTTPS origin and service credential, then enable Staging ingress.
9. Verify exchange, exact cookies, authenticated reload, protected API proxy, idle/version update, logout/revocation, API restart durability, and redaction using synthetic/non-production actions.
10. Verify controlled origin/CSRF/service-token failures and recovery; capture timestamps, service/deployment identifiers, correlation IDs, and bounded evidence references.
11. Leave production variables, production deployment, DNS, and production authority unchanged.

## Rollback and revocation strategy

1. Disable `MAOS_STAGING_SESSION_INGRESS_ENABLED` in both Staging services under explicit provider authorization.
2. Revoke issued Staging Sessions through the governed API operation; never delete Session/revocation/audit records.
3. Rotate/revoke Staging BFF, CSRF, user, and Identity admin credentials in provider secret stores.
4. Re-deploy the last known-good Staging API/Web artifacts if application rollback is required.
5. Retain additive migration 0019 and use a forward fix; do not perform a destructive down migration.
6. Confirm existing Operations authentication, email delivery runtime, health endpoints, and Control Room unauthenticated shell recover.
7. Record rollback actor, target artifact, result, correlation, and evidence references.

## Final execution stop conditions

Stop and report instead of continuing if any of the following occurs:

- frozen architecture must change beyond MAOS-CR-003;
- exact Origin or trusted actor/organization/project inputs are unavailable;
- a plaintext or shared credential is required;
- existing Operations or alert-email behavior must be weakened;
- direct SQL or a debug bypass appears necessary;
- Session/CSRF material would enter browser storage, URLs, or logs contrary to the contract;
- optimistic concurrency, revocation, or restart durability cannot be proven;
- production configuration, production data, production credentials, or deployment are required;
- migration 0019 cannot remain additive and forward-only; or
- `.gitignore` hash changes from the preserved value.

## Plan result

`REL001_PHASE1C_IMPLEMENTATION_PLAN_READY`

This planning step performs no code change. Execution may start only on an implementation branch/worktree under the existing Staging-only authorization and must stop before provider action unless that action is separately approved.
