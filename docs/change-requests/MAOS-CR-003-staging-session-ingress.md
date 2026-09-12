# MAOS-CR-003 — REL-001 Phase 1C Staging Session Ingress

| Item                                    | Value                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Change Request                          | MAOS-CR-003                                                                                    |
| Baseline                                | MAOS Architecture v1.1 APPROVED / FROZEN                                                       |
| Target                                  | Additive Staging Session ingress architecture contract                                         |
| Class                                   | C2 Minor Architecture                                                                          |
| Status                                  | PROPOSED / APPROVAL REQUIRED                                                                   |
| Scope                                   | Same-origin Control Room BFF/proxy and Identity-owned durable Session ingress for Staging only |
| Frozen architecture conflict            | NO                                                                                             |
| Production implementation authorization | NO                                                                                             |
| Production deployment authorization     | NO                                                                                             |

## 1. Change objective

Adopt the smallest production-style browser ingress contract that exercises the approved REL-001 durable Session model in Staging while preserving existing identity, authorization, approval, audit, environment, and production authority boundaries.

This Change Request standardizes a same-origin Control Room BFF/proxy. The browser communicates only with an approved HTTPS Control Room origin; the BFF owns browser transport controls; Core API Identity / Authorization retains credential verification and all Session and authority ownership.

## 2. Scope

This C2 covers only:

- same-origin browser-to-Control Room Session ingress in Staging;
- BFF cookie, origin, CSRF, and trusted-header controls;
- an authenticated BFF-to-Core API trust hop;
- Identity-owned credential exchange, durable Session issuance, resolution, freshness, rotation/version, and revocation;
- trusted Staging actor and assignment provisioning through a governed Identity operation;
- three new identity-specific permission contracts;
- audit/evidence continuity across browser, BFF, API, and durable Session state; and
- fail-closed configuration and rollback/revocation requirements.

It does not authorize implementation, production configuration, production deployment, a new identity provider, a debug endpoint, direct SQL, or a general-purpose browser authentication subsystem.

## 3. Motivation

REL-001 Phase 1C has resolved the durable Session repository, monotonic versioning, durable revocation history, authoritative tenant/scope derivation, audit references, freshness policy, and restart durability. Production-style Staging ingress remains blocked because frozen architecture does not yet specify browser transport, credential-to-Session exchange ownership, trusted actor provisioning, or an exact CSRF/origin contract.

The same-origin BFF design closes those architecture questions with less browser exposure than a cross-site Railway cookie and without treating a header-only Session carrier as a production-style browser model.

## 4. Authority boundary

- Human Authority remains above AI and service authority.
- Authentication proves an identity; it does not grant action authority.
- The BFF is a transport enforcement point, not an identity, tenant, scope, role, MFA, or permission authority.
- Core API Identity / Authorization owns authoritative actor resolution, Session lifecycle, tenant/scope projection, and live authorization with deny precedence.
- Durable Session state is stored in PostgreSQL under the approved Identity / Authorization persistence boundary.
- A BFF service credential identifies and authorizes only the internal transport hop. It cannot synthesize or replace human authority.
- Session issuance does not approve the actions later attempted through that Session.

## 5. New permission semantics

The following permission contracts are proposed for adoption:

| Purpose                                                          | Action      | Resource   | Environment | Scope                                     | Risk |
| ---------------------------------------------------------------- | ----------- | ---------- | ----------- | ----------------------------------------- | ---- |
| Issue a durable Session after successful credential verification | `CREATE`    | `SESSION`  | `staging`   | exact approved project scope              | `R2` |
| Revoke or administratively terminate a Session                   | `REVOKE`    | `SESSION`  | `staging`   | exact approved project scope              | `R2` |
| Provision a trusted Staging human and assignments                | `PROVISION` | `IDENTITY` | `staging`   | exact approved organization/project scope | `R2` |

Each operation requires the exact permission dimensions and remains subject to deny precedence, current assignments, environment checks, and audit. Existing `CONTROL / OPERATIONS / staging / project-maos / R2` authority MUST NOT be reused for Session issuance, revocation, or Identity provisioning.

These contracts create no standing production grant. Runtime grants, role mapping, and authorized human assignees require separate implementation/configuration approval.

## 6. BFF trust boundary

The Control Room BFF owns:

- the browser-facing credential exchange and logout transport;
- Session cookie creation, refresh, and removal;
- exact Origin validation and Session-bound CSRF verification;
- removal of caller-controlled Session, actor, tenant, scope, role, MFA, and internal-service headers;
- separately authenticated HTTPS communication with the Railway Core API; and
- propagation of request, correlation, and trace identifiers.

The BFF must not construct `IdentityContext`, grant permission, accept browser-supplied authority claims, or expose raw Session identifiers to browser code.

## 7. Core API authority ownership

Core API Identity / Authorization owns:

- credential verification through the approved authentication boundary;
- mapping the verified external subject to an active human identity;
- authoritative organization/project assignment resolution;
- durable Session issuance and persistence;
- immutable issuance/binding provenance and monotonic Session version;
- idle, absolute, and applicable MFA freshness enforcement;
- durable revocation and stale-version rejection;
- live tenant/scope derivation and requested-action authorization; and
- bounded audit/evidence references.

The BFF forwards an opaque Session reference and its distinct service credential. The service credential authenticates transport only; the resolved human remains the actor for user actions.

## 8. Trusted actor provisioning authority

Trusted Staging actors must be provisioned through a bounded, idempotent Identity administration operation. Direct SQL, debug routes, migration-seeded environment identities, and silent reuse of Operations authority are prohibited.

The operation accepts a reviewed non-secret manifest containing an intended organization reference, immutable external subject, display metadata, and organization/project assignment references. It must:

- require `PROVISION / IDENTITY / staging / exact-organization-project-scope / R2` from an authorized human administrator;
- create or resolve the human by immutable external-subject binding;
- persist current assignments through Identity-owned persistence;
- reject conflicting subject, organization, or scope bindings rather than overwrite them;
- remain idempotent for an identical manifest; and
- emit actor/action/target/result and bounded evidence references.

No actor name, subject, organization, assignment, or credential value is approved by this C2.

## 9. CSRF and origin contract

- Staging configuration permits exactly one approved HTTPS Control Room origin.
- Wildcard, suffix, reflected, opaque/`null`, and preview-host-pattern origin acceptance is prohibited.
- Safe methods remain side-effect free.
- Every unsafe browser request requires both an `Origin` header exactly equal to the configured origin and a server-generated Session-bound CSRF token in a dedicated request header.
- Missing, malformed, expired, rotated, or mismatched origin/CSRF evidence fails closed before the Core API action executes.
- The CSRF token is not a Session identifier, credential, MFA assertion, or authority claim.
- Session IDs and CSRF tokens must not appear in URLs, logs, metrics, errors, events, or audit payloads.
- Browser-supplied internal identity and service headers are stripped before forwarding.

Implementation must use an approved cryptographic primitive for CSRF material. This C2 does not invent additional numeric entropy or rotation policy.

## 10. Cookie contract

The browser Session cookie is:

- named `__Host-maos_session`;
- `HttpOnly`;
- `Secure`;
- `SameSite=Strict`;
- `Path=/`;
- host-only; and
- emitted without a `Domain` attribute.

It is used only when the deployed Control Room origin satisfies every `__Host-` requirement. The implementation must not silently fall back to a weaker cookie.

Cookie expiry and `Max-Age` must not exceed the lesser of the remaining idle window and remaining absolute lifetime. Refresh may occur only after successful authoritative Session resolution. Logout, revocation, stale version, idle expiry, or absolute expiry clears the browser cookie while preserving durable denial/revocation evidence.

The browser must not persist Session identifiers in `localStorage`, `sessionStorage`, URLs, response bodies, or script-readable cookies.

## 11. Session freshness bounds

The already approved numeric policy remains unchanged:

- idle timeout: 30 minutes from authoritative `lastAccessedAt`;
- maximum absolute lifetime: 12 hours from immutable `issuedAt`; and
- applicable MFA freshness: 15 minutes from authoritative `mfaVerifiedAt`.

MFA state may be recorded only from authoritative upstream evidence. Missing applicable MFA evidence fails closed and must never be invented by the BFF, credential exchange, provisioning operation, or Session repository.

## 12. Session revocation behavior

- Revocation is durable, append-preserving, irreversible for the revoked Session version, atomic, and restart-safe.
- A revoked, stale-version, idle-expired, absolute-expired, or otherwise invalid Session fails closed.
- Logout requests Identity / Authorization revocation before the BFF expires the browser cookie.
- Administrative revocation requires the exact `REVOKE / SESSION` permission.
- Loss or rotation of the BFF service credential disables the internal hop but does not erase Session or audit history.
- Kill/revocation handling must be safe under retries and concurrent requests.

## 13. Audit and evidence requirements

Audit must preserve proof of who did what without conflating human and service identity:

- the authoritative resolved human actor and Session version;
- the BFF service identity as transport/delegation evidence;
- credential exchange, Session issuance, resolution denial, refresh, logout, revocation, and provisioning actions;
- target, result, tenant/scope derivation, request/correlation/trace references; and
- bounded evidence references for authorization and lifecycle decisions.

Raw credentials, service secrets, Session identifiers, CSRF tokens, and MFA evidence are redacted from all operational and audit surfaces.

## 14. Staging-only enforcement

- Exchange, provisioning, cookie, and Session forwarding are enabled only by explicit Staging configuration.
- The configured environment, exact HTTPS origin, exact scopes, service credential reference, durable Session store, and required permissions must all be present.
- Missing or inconsistent configuration fails closed.
- Existing preview identities and Operations bearer authority are invalid substitutes.
- Staging credentials, cookies, Sessions, actors, and service identities do not cross environment boundaries.

## 15. Production fail-closed behavior

- Production implementation authorization is `NO`.
- Production deployment authorization is `NO`.
- Production exposes no Staging credential exchange or actor-provisioning operation.
- Production accepts no Staging credential, BFF service identity, Session, cookie, origin, or permission grant.
- An automatic provider deployment label does not create MAOS production authority.
- No debug bypass, compatibility fallback, or environment inference may activate this ingress in production.

## 16. Migration impact

The C2 documentation itself requires no migration. A later implementation may require additive, forward-only persistence for organization/project assignments, Session lifecycle data, revocation history, and a non-reversible CSRF verifier/reference if those capabilities are not already executable in the approved schema.

Before any migration is authorized, implementation planning must verify existing schema coverage, define keys/constraints/idempotency, preserve existing records, provide clean initialization and replay tests, and document disable/rollback behavior. No direct SQL or migration-seeded trusted actor is permitted.

## 17. Security impact

Expected positive impact:

- raw Session identifiers remain outside browser JavaScript;
- cross-site credentialed CORS is avoided;
- browser mutations require two independent checks: exact origin and Session-bound CSRF proof;
- authority remains live-derived and default-deny;
- internal service and human identities remain distinct;
- exact permissions replace implicit Operations authority reuse; and
- sensitive transport/authentication material is explicitly redacted.

Residual risks requiring implementation evidence include BFF compromise, service-credential compromise, CSRF verifier defects, header forwarding mistakes, cookie scope mistakes, actor provisioning conflicts, Session replay/concurrency, and stale assignment projection.

## 18. Test requirements

A later authorized implementation must include:

1. actual BFF-to-API credential exchange success and rejection;
2. missing/invalid authentication `401` and authenticated-but-unauthorized `403`;
3. exact new permission grants and deny precedence;
4. provisioning idempotency and conflicting-binding rejection;
5. authoritative actor, tenant, scope, and MFA derivation;
6. complete `__Host-` cookie attributes and no identifier exposure;
7. exact-origin success plus wildcard, suffix, reflected, missing, and `null` rejection;
8. missing, mismatched, rotated, reused, revoked, and expired CSRF/Session rejection;
9. controlled-clock tests for 30-minute idle, 12-hour absolute, and 15-minute MFA freshness;
10. Session version/concurrency, logout, revocation, and restart durability;
11. BFF trusted-header stripping and internal service authentication;
12. audit/correlation continuity and human/service identity separation;
13. credential, Session, CSRF, MFA, and service-secret redaction; and
14. production configuration proving the Staging ingress is absent and fail-closed.

## 19. Rollback and revocation considerations

Before C2 approval, reject or withdraw MAOS-CR-003; the Phase 1C ingress remains blocked and no runtime rollback is required.

After a future Staging implementation, bounded disablement must support:

- disabling the exchange/proxy ingress by explicit configuration;
- revoking all Sessions issued through the affected exchange/version;
- rotating or revoking the BFF service credential and Staging credential;
- clearing browser cookies through the same-origin BFF;
- retaining durable Session revocation and audit/evidence records;
- stopping provisioning grants independently from existing actor records; and
- reverting application/configuration changes without destructive database deletion.

Rollback cannot convert revoked Sessions back to valid or erase proof of prior actions.

## 20. Implementation gate criteria

Staging implementation remains blocked until all of the following are satisfied:

1. an authorized human approves MAOS-CR-003 and the exact reviewed revision;
2. the new permission vocabulary and Identity ownership are accepted as additive architecture;
3. a separately authorized bounded implementation scope and branch are established;
4. the approved HTTPS Control Room origin and Staging environment boundary are identified;
5. non-secret actor/organization/assignment provisioning inputs and an authorized provisioning owner are approved;
6. internal service and user credential references are defined without plaintext secrets;
7. any additive migration receives schema, replay, rollback/disablement, and boundary review;
8. all tests in Section 18 and repository quality/security gates pass from a clean state;
9. Staging evidence proves cookie, CSRF, Session, revocation, authorization, audit, redaction, and restart behavior; and
10. production remains disabled, fail-closed, not ready, and not deployment-approved.

Approval of this C2 authorizes architecture adoption only. It does not itself authorize implementation, credential configuration, provider mutation, production deployment, or production use.

## Traceability

- Architecture decision: `docs/implementation/rel-001-phase-1c/REL001_PHASE1C_STAGING_SESSION_INGRESS_ARCHITECTURE_DECISION.md`
- Phase decision register: `docs/implementation/rel-001-phase-1c/REL001_PHASE1C_DECISION_REGISTER.md`
- Phase master index: `docs/implementation/rel-001-phase-1c/REL001_PHASE1C_MASTER_INDEX.md`
- Phase completion/status: `docs/implementation/rel-001-phase-1c/REL001_PHASE1C_COMPLETION_REPORT.md`
- Canonical Session contract: `docs/implementation/rel-001-phase-1c/REL001_PHASE1C_CANONICAL_SESSION_RECORD_CONTRACT.md`
- Session ownership: `docs/implementation/rel-001-phase-1c/REL001_PHASE1C_SESSION_CREATION_REVOCATION_OWNERSHIP.md`
- Session resolution: `docs/implementation/rel-001-phase-1c/REL001_PHASE1C_SESSION_RESOLUTION_FLOW.md`
- Security readiness: `docs/implementation/rel-001-phase-1c/REL001_PHASE1C_SESSION_SECURITY_READINESS_MATRIX.md`

## Approval decision

`PENDING_C2_HUMAN_APPROVAL`

Staging implementation remains `BLOCKED_PENDING_C2_APPROVAL_AND_IMPLEMENTATION_AUTHORIZATION`.
