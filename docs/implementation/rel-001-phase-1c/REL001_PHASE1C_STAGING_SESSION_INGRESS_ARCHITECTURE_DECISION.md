# REL-001 Phase 1C Staging Session Ingress Architecture Decision

## Decision status

- Architecture decision package: `READY_FOR_C2_REVIEW`
- Production-style Staging Session ingress: `BLOCKED_PENDING_C2_AND_IMPLEMENTATION_AUTHORIZATION`
- Production implementation authorization: `NO`
- Production behavior: fail closed and unchanged

This document proposes the smallest production-style Staging Session ingress. It does not amend frozen MAOS architecture, authorize implementation, provision an actor, create credentials, or approve production use.

## Preserved Session policy

- Idle timeout: 30 minutes from authoritative `lastAccessedAt`.
- Maximum absolute lifetime: 12 hours from authoritative `issuedAt`.
- Applicable MFA freshness: 15 minutes from authoritative `mfaVerifiedAt`.
- Durable Session ownership, version/concurrency, revocation history, tenant and scope derivation, audit references, and restart durability remain as already resolved.

## Architecture decision

Select **Option A — same-origin BFF/proxy through the Control Room web application** for production-style browser ingress in Staging.

The browser communicates only with the approved HTTPS Control Room origin. The Control Room BFF owns browser transport controls and forwards a narrowly authenticated internal request to the Railway API. The Core API Identity / Authorization boundary remains the authority for credential verification, actor resolution, Session issuance, durable Session state, revocation, freshness, and live authorization.

The design is additive to the current architecture and requires a C2 Change Request before implementation because frozen architecture does not currently define this BFF Session transport, exchange operation, CSRF contract, or the required identity-specific permissions.

## Options evaluated

| Option                       | Trust boundary and ownership                                                                                                                                                 | CORS / CSRF                                                                                                                                                               | Browser exposure                                                                                                                                               | Operations and failure modes                                                                                                                                                   | Production-style Staging semantics                                                                                             | Decision                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| A. Same-origin BFF / proxy   | Browser trusts only the approved Control Room origin. BFF owns the browser cookie and transport policy. Core API owns credential verification and durable Session authority. | No credentialed cross-origin browser API calls. Every unsafe BFF request requires exact-origin validation and a Session-bound CSRF token.                                 | Session identifier is confined to an `HttpOnly` cookie and is never available to browser script, storage, URLs, or response bodies.                            | Requires BFF composition, an internal service-authenticated hop, cookie lifecycle, origin enforcement, and correlation continuity. Failure of either tier fails closed.        | Yes. It exercises the durable Session model through a browser-grade boundary without making Railway the browser cookie origin. | **SELECTED**                             |
| B. Cross-site Railway cookie | Railway API owns the browser cookie across the Control Room and Railway origins.                                                                                             | Requires `SameSite=None`, `Secure`, credentialed CORS, an exact allowlist, preflight support, and independent CSRF binding. Wildcard or reflected origins are prohibited. | Broadens the public API/browser boundary and cross-site credential exposure.                                                                                   | More proxy, browser-policy, DNS, and incident complexity; fragile under preview URLs and an undecided production domain. Misconfigured CORS or CSRF becomes an authority risk. | Technically possible, but not the smallest or safest current design.                                                           | **REJECTED**                             |
| C. Header-only Session ID    | Client owns and sends an opaque Session carrier directly to the API.                                                                                                         | CORS depends on caller. CSRF is generally inapplicable to non-cookie CLI clients.                                                                                         | A browser client would need script-accessible storage or memory and increase disclosure risk. Session IDs remain prohibited in local/session storage and URLs. | Suitable only for controlled CLI/test clients with explicit secret handling; it is not a production-style browser session.                                                     | No.                                                                                                                            | **RESTRICTED TO CONTROLLED CLI/TESTING** |

## Trust-boundary diagram description

```text
Browser
  | HTTPS; exact approved origin; __Host-maos_session cookie; CSRF header
  v
Control Room BFF (Vercel)
  | strips caller-supplied identity/session/service headers
  | HTTPS; internal service authentication; opaque Session reference
  v
MAOS Core API Identity / Authorization (Railway)
  | resolves credential/Session, live actor and assignments, freshness,
  | revocation, version, permission, deny precedence, audit references
  v
Durable MAOS PostgreSQL Session / identity records
```

The BFF is a transport enforcement point, not an authority source. Its internal service credential authenticates the BFF workload only and must not grant, synthesize, or replace human authority.

## Authentication and Session data flow

1. A human submits an approved Staging credential to a same-origin BFF exchange endpoint over HTTPS. The browser holds it only for that request; it is never persisted by browser storage or logged.
2. The BFF enforces the exact approved Control Room origin, request limits, content type, and redaction, then forwards the credential to the Core API exchange operation using independently configured internal service authentication.
3. The Core API uses the existing authentication boundary to verify the credential and resolve its authoritative `external_subject`.
4. Identity / Authorization resolves an active `identity.humans` record and current organization/project assignments. Actor, tenant, and scope are derived from trusted records, not the request.
5. MFA is recorded only when authoritative upstream evidence exists. Absence of applicable evidence cannot be converted into a fresh MFA claim.
6. The Core API atomically creates the durable Session with authoritative `issuedAt`, `lastAccessedAt`, absolute expiry, version, binding provenance, and audit reference.
7. The Core API returns an opaque Session reference only to the authenticated BFF. The BFF sets the browser cookie and does not return the Session identifier in a body, URL, or log.
8. On later requests, the BFF extracts the cookie server-side, strips any browser-supplied internal headers, and forwards the opaque Session reference plus its service credential.
9. The Core API resolves the Session, enforces idle and absolute freshness, revocation and version, derives live tenant/scope, and performs the requested authorization. Successful resolution alone does not grant action authority.
10. Logout or revocation is processed by Identity / Authorization, retained durably, audited, and followed by cookie expiration at the BFF.

## Credential-to-Session exchange ownership

- **Core API Identity / Authorization owns** credential verification, actor resolution, Session issuance, persistence, rotation/version, revocation, freshness, and authority projection.
- **Control Room BFF owns** browser-facing exchange transport, cookie creation/removal, CSRF and origin enforcement, internal-hop authentication, and removal of untrusted forwarding headers.
- The BFF must never construct `IdentityContext`, tenant, scope, roles, permissions, or MFA evidence.
- The Core API must expose a bounded exchange result to the BFF; it must not expose raw Session identifiers to browser JavaScript.

## Trusted Staging actor provisioning

Trusted actors must be provisioned through a bounded, idempotent Identity administration operation, not direct SQL, debug routes, migration-seeded environment identities, or the Operations health permission.

The approved input is a non-secret provisioning manifest containing only the intended organization reference, external subject, display metadata, and organization/project assignment references. The operation:

- requires a separately authorized human administrator;
- resolves or creates the `identity.humans` record by an immutable external-subject binding;
- creates current organization and project assignments through Identity-owned persistence;
- rejects conflicting subject, organization, or scope bindings instead of overwriting them;
- emits audit/evidence references for actor and assignment creation or update; and
- is staging-only until a separate production decision is approved.

Exact actor, organization, assignment, and credential values remain human/provider configuration decisions and are not invented by this package.

## Permission design

Session issuance and actor provisioning need identity-specific permissions. Existing `CONTROL / OPERATIONS / staging / project-maos / R2` authority must not be reused silently.

Proposed C2 permission contracts are:

| Operation                                                        | Action      | Resource   | Environment | Scope                                     | Risk |
| ---------------------------------------------------------------- | ----------- | ---------- | ----------- | ----------------------------------------- | ---- |
| Issue a durable Session after successful credential verification | `CREATE`    | `SESSION`  | `staging`   | exact approved project scope              | `R2` |
| Revoke or administratively terminate a Session                   | `REVOKE`    | `SESSION`  | `staging`   | exact approved project scope              | `R2` |
| Provision a trusted Staging human and assignments                | `PROVISION` | `IDENTITY` | `staging`   | exact approved organization/project scope | `R2` |

These names are proposed architecture contracts, not active grants. C2 review must approve their canonical vocabulary and ownership before implementation. Authentication proves identity; each operation still requires exact authorization with deny precedence.

## CSRF and origin contract

- Allow exactly one configured HTTPS Control Room origin for the Staging browser ingress. Wildcards, suffix matching, reflected origins, opaque/`null` origins, and preview-host patterns are prohibited.
- Browser calls to Railway are not part of this design; the BFF-to-API hop is server-to-server and separately authenticated.
- Safe methods must remain side-effect free.
- Every state-changing BFF request requires both:
  - an `Origin` header exactly equal to the configured origin; and
  - a server-generated, Session-bound CSRF token supplied in a dedicated request header.
- The CSRF token is not a Session identifier, credential, MFA assertion, or authority claim. It must not appear in URLs or logs. Only a non-reversible verifier/reference may be retained server-side.
- Missing, malformed, stale, or mismatched origin/CSRF evidence fails closed before the Core API action is invoked.
- The BFF strips browser-supplied Session, actor, tenant, scope, role, MFA, and internal-service headers before constructing the trusted internal request.

Token entropy and rotation mechanics must use an approved platform cryptographic primitive during implementation; this review does not invent an additional numeric policy.

## Cookie contract

Use `__Host-maos_session` only when the deployed Control Room endpoint satisfies all prefix constraints:

- `HttpOnly`
- `Secure`
- `SameSite=Strict`
- `Path=/`
- host-only cookie
- no `Domain` attribute

Its expiry and `Max-Age` must never exceed the lesser of the remaining 30-minute idle window and remaining 12-hour absolute lifetime. Refresh occurs only after successful authoritative Session resolution. Logout, revocation, stale version, idle expiry, or absolute expiry clears the cookie and leaves the durable denial/revocation evidence intact.

If a deployment cannot satisfy the `__Host-` constraints, ingress remains blocked; it must not silently fall back to a weaker cookie.

## Internal forwarding and audit identity

The BFF terminates the browser cookie and forwards:

- an opaque Session reference in the canonical internal Session carrier;
- a distinct service credential identifying the BFF workload; and
- request, correlation, and trace identifiers.

The service identity authorizes only the internal transport/exchange surface. The resolved human actor remains the actor for user actions. Audit records preserve both identities without conflation:

- human actor and authoritative Session version;
- BFF service identity as transport/delegation evidence;
- action, target, result, tenant/scope derivation, request/correlation/trace references; and
- bounded evidence references for issuance, denial, revocation, and expiry.

Raw credentials, Session identifiers, CSRF tokens, and MFA evidence are redacted from logs, events, errors, metrics, and audit payloads.

## Staging and production enforcement

- All exchange, cookie, and provisioning operations require explicit `staging` environment configuration and exact approved origins/scopes.
- Missing origin, service credential, actor binding, assignment, Session store, or required permission fails closed.
- Development preview identities and the existing Operations bearer permission are invalid substitutes.
- Production exposes no Staging exchange/provisioning operation and accepts no Staging credential or Session authority.
- Production implementation and deployment remain unauthorized.

## Affected modules and files for a later authorized implementation

Likely bounded changes are:

- `apps/web`: same-origin exchange/logout/proxy endpoints, cookie and CSRF handling, trusted-header stripping, and BFF tests.
- `apps/api`: Identity-owned Session exchange/revoke endpoints, internal service authentication composition, Session resolution middleware, and audit correlation.
- `modules/identity`: Session issuance/revocation services, actor/assignment provisioning contracts, and the new permission vocabulary after C2 approval.
- `packages/config`: exact Staging origin, cookie, internal service credential reference, and fail-closed configuration contracts.
- `packages/database`: durable actor-assignment persistence only if the approved model is not already executable; schema work must be a separate reviewed migration.
- `modules/observability`: bounded Session/exchange audit-event integration after event vocabulary approval.

No implementation file is changed by this decision package.

## Test strategy for later implementation

- credential exchange success and rejection through the actual BFF/API composition;
- missing/invalid credential `401` and authenticated-but-unauthorized `403`;
- exact `CREATE / SESSION`, `REVOKE / SESSION`, and `PROVISION / IDENTITY` grants with deny precedence;
- actor provisioning idempotency and conflicting-binding rejection;
- trusted tenant/scope derivation and rejection of caller claims;
- secure `__Host-` cookie attributes and no identifier in body, URL, browser storage, or logs;
- exact-origin acceptance and wildcard, suffix, reflected, missing, and `null` origin rejection;
- CSRF missing, mismatch, reuse-after-rotation, revoked-Session, and expired-Session rejection;
- 30-minute idle, 12-hour absolute, and 15-minute applicable MFA freshness boundaries using a controlled clock;
- Session version rotation, concurrent stale-version rejection, logout, revocation, and restart durability;
- BFF header stripping and internal service credential default-deny behavior;
- human actor plus BFF service evidence continuity across request/correlation/trace/audit records;
- redaction tests for credential, Session, CSRF, and MFA material; and
- production configuration proving the Staging ingress is absent/fail-closed.

## Migration and frozen-architecture impact

- **Frozen architecture conflict:** none if this proposal is adopted through normal C2 governance.
- **Frozen architecture amendment/change request:** required before implementation because browser Session transport, exchange/provisioning ownership, identity-specific permissions, CSRF/origin rules, and the internal BFF trust hop are new normative contracts.
- **Migration impact:** possible for organization/project assignment persistence and Session/CSRF verifier support; determine in the C2 implementation design against the existing schema. No migration is authorized here.
- **Production status:** unchanged. Production-style Staging ingress remains blocked pending C2 approval and separate implementation authorization.

## Final architecture recommendation

`REL001_PHASE1C_STAGING_SESSION_INGRESS_ARCHITECTURE_READY`

The architecture decision package is ready for C2 review. This status does not mean the ingress is implemented or authorized for production.
