# REL-001 Phase 1C Canonical Session Record Contract

Status: CANONICALIZED / FRESHNESS BOUNDS APPROVED

## Existing contracts reused

- Actor categories: `HUMAN`, `AGENT`, `SYSTEM`.
- Runtime projection: `IdentityContext` with actor ID/type and roles.
- Authorization dimensions: action, resource, environment, risk, and scope; explicit deny precedes allow.
- Persistence baseline: UTC timestamps, constraints, optimistic locking, archive semantics, secret references, idempotency, and correlation IDs.

This reuse does not create a new authentication model.

## Canonical owner

The existing Identity / Authorization boundary owns one bounded durable Session repository and unit of work. It creates, resolves, and revokes trusted Session records; preserves version/history metadata; provides restart-safe lookup; and retains bounded audit references.

It is not a generic identity platform, cross-domain store, business-domain database, login system, or identity provider. Existing repository technology should be reused; if none fits, one identity-owned bounded store is authorized. No external database or service is authorized.

## Canonical minimum record

| Field                   | Rule                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `sessionId`             | Canonical opaque identifier and lookup key; immutable after creation. It carries no authority.                                      |
| `actorId`               | Trusted actor binding; immutable after creation.                                                                                    |
| `tenantBindingOrigin`   | Safe reference to trusted server-side binding origin; immutable after creation.                                                     |
| `createdAt`             | UTC creation time; immutable.                                                                                                       |
| `issuedAt`              | UTC issuance time; immutable.                                                                                                       |
| `sessionVersion`        | Integer starting at 1; monotonically increments on every authoritative mutable-state change. Caller values are never authoritative. |
| `revokedAt`             | Nullable UTC revocation time. Once set, it cannot be cleared.                                                                       |
| `revocationEvidenceRef` | Nullable opaque safe reference written with revocation; no raw evidence or secret.                                                  |
| `auditEvidenceRef`      | Nullable opaque safe reference for creation or authoritative mutation; Audit retains semantic ownership.                            |
| `tenantBindingRef`      | Optional consistency reference. It never overrides live tenant derivation.                                                          |
| `lastAccessedAt`        | Server-managed UTC time of latest successful Session resolution; initialized to `issuedAt`.                                         |
| `mfaVerifiedAt`         | Optional server-verified UTC time used only when an operation requires MFA freshness.                                               |
| `mfaVerificationRef`    | Optional opaque safe reference to canonical MFA verification; never an MFA secret or authority grant.                               |

The initial repository omits cached grants, flattened scope, and MFA secrets.

## Lifecycle, concurrency, and atomicity

- Creation atomically writes the record, trusted actor/binding provenance, version 1, and bounded audit reference.
- Resolution is read-only initially and performs structural freshness checks.
- Revocation atomically writes `revokedAt`, revocation evidence, audit reference, and version N+1.
- Revocation is append-preserving and irreversible through normal Session operations. There is no reactivate operation.
- Mutation reads version N and succeeds only when writing N+1. A mismatch is a conflict and fails closed; last-write-wins is prohibited.
- Successful Session resolution atomically advances `lastAccessedAt` and `sessionVersion`. A concurrent conflict requires fresh resolution and never silently overwrites state.
- Partial Session authority state is prohibited.

## Tenant, scope, and MFA

- Tenant authority is derived from `actorId` through live AuthorizationService/trusted assignment lookup. Caller tenant data is never authoritative.
- Persisted tenant references are consistency evidence only. Mismatch with current assignment fails closed with no silent rebinding.
- Effective request scope derives from the trusted actor plus live canonical role/capability assignments and existing tenant/team/resource rules.
- Scope is not flattened into a new free-form or wildcard string. Unsupported dimensions remain unavailable and fail closed.
- Session stores no MFA secret and grants no MFA authority. Safe canonical verification linkage may be used only when existing policy requires it; privileged operations still perform existing MFA validation.

## Freshness

Structural freshness is resolved: the record exists, is not revoked, has a valid current version, passes tenant consistency, and is followed by live authorization revalidation.

Time-bound freshness is resolved by human policy decision:

- Idle timeout: 30 minutes from authoritative `lastAccessedAt`. At or beyond 30 minutes without successful resolution, the Session fails closed.
- Maximum absolute lifetime: 12 hours from immutable `issuedAt`. At or beyond 12 hours, the Session fails closed regardless of activity.
- Applicable MFA freshness: 15 minutes from authoritative `mfaVerifiedAt`. An MFA-required operation fails closed when the timestamp/reference is absent or at least 15 minutes old.

Only the server may write freshness metadata. Successful Session resolution updates `lastAccessedAt` atomically after current-record checks succeed. Expired or revoked Sessions never update access metadata. Session resolution does not grant MFA authority; privileged operations still perform canonical MFA validation.

## Invariants

- Session lookup does not grant authority.
- `x-session-id` does not assert actor, tenant, scope, role, permission, or MFA.
- Missing, revoked, malformed, version-conflicted, tenant-mismatched, idle-expired, absolute-expired, MFA-stale where required, or unverifiable records produce no trusted identity.
- Authorization is evaluated live after resolution.
- Raw reusable credentials, MFA secrets, and raw audit payloads are never persisted or logged.
- Production remains fail closed.

## Freshness decision result

`PASS_REL001_PHASE1C_SESSION_FRESHNESS_BOUNDS`

This decision does not authorize production implementation or production-style Staging ingress.
