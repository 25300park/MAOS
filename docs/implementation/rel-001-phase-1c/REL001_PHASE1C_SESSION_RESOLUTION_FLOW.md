# REL-001 Phase 1C Session Resolution Flow

Status: RESOLVED DESIGN / IMPLEMENTATION NOT AUTHORIZED

1. Receive `x-session-id` as an opaque transport value.
2. Reject missing, malformed, or duplicated carrier values; never interpret the value as a claim.
3. Resolve exactly one durable Session record through the Identity / Authorization-owned repository.
4. Verify record identity, current `sessionVersion`, immutable actor/binding provenance, and absence of revocation.
5. Derive authoritative tenant context from `actorId` through live trusted assignment data; fail closed on mismatch with a persisted binding reference.
6. Derive multidimensional request scope from live canonical role/capability assignments and existing tenant/team/resource rules. Unsupported dimensions remain unavailable.
7. Fail closed when idle time from `lastAccessedAt` is at least 30 minutes, absolute lifetime from `issuedAt` is at least 12 hours, or an MFA-required operation lacks an applicable verification less than 15 minutes old.
8. Materialize the trusted current identity context without copying authority from the carrier or stale Session data.
9. Invoke existing authorization for the exact action/resource/environment/risk/scope.
10. Apply deny precedence and fail closed.
11. Record correlation-safe audit evidence using bounded references only, never raw Session identifiers, credentials, MFA secrets, or raw audit payloads.
12. After successful Session resolution, atomically advance server-managed `lastAccessedAt` and `sessionVersion`; on version conflict, re-resolve rather than overwrite.
13. Return existing 401/403 behavior without revealing whether a Session exists.

## Failure behavior

Missing, unknown, idle-expired, absolute-expired, revoked, version-conflicted, tenant-mismatched, MFA-stale where required, or unverifiable Sessions produce no authenticated identity. Failed resolution never updates `lastAccessedAt`.

## Concurrency and restart behavior

- Create writes record, identity binding, provenance, version 1, and audit reference atomically.
- Revoke requires version N and atomically writes irreversible revocation metadata plus version N+1.
- Version mismatch is a conflict and fails closed.
- A valid Session resolves to the same actor and durable version/state after process restart, followed by live authorization revalidation.
- A revoked Session remains revoked after restart. Process-local maps are never authoritative.

## Shared boundary

Core API and Admin Console / Control Room must consume the same resolver and live authorization boundary. Different processes are allowed; different Session authority models are prohibited. Development Session composition cannot provide Staging authority.
