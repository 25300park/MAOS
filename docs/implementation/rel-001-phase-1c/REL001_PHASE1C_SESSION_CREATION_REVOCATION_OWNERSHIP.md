# REL-001 Phase 1C Session Creation / Revocation Ownership

Status: OWNERSHIP AND FRESHNESS POLICY RESOLVED

The approved amendment assigns one bounded durable Session repository/UoW to the existing Identity / Authorization boundary. It authorizes no new login protocol, identity provider, token format, role, capability, or external service.

## Canonical ownership

| Responsibility                | Canonical owner                                                    | Boundary                                                                          |
| ----------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Create trusted Session record | Identity / Authorization boundary                                  | Requires prior trusted server-side identity proof; introduces no login operation. |
| Persist and resolve Session   | Identity / Authorization boundary                                  | One bounded repository/UoW using existing persistence patterns where possible.    |
| Revoke Session                | Identity / Authorization boundary under existing authorized action | Atomic, append-preserving, versioned, auditable, and irreversible.                |
| Tenant derivation             | Live AuthorizationService / trusted assignment lookup              | Persisted binding is consistency evidence only.                                   |
| Scope derivation              | Live canonical authorization assignments                           | No caller scope, wildcard, or new hierarchy.                                      |
| Audit semantics               | Existing Audit boundary                                            | Session stores only opaque `auditEvidenceRef`; no raw payload.                    |
| MFA authority                 | Existing privileged-operation validation                           | Session stores no secret and grants no MFA authority.                             |

## Separation of responsibility

- Trusted server-side identity proof precedes atomic Session creation.
- Persistence records bounded authenticated continuity.
- Resolution materializes context; it does not authorize an action.
- Authorization remains the existing live action/resource/environment/risk/scope evaluation.
- Revocation invalidates continuity, increments `sessionVersion`, survives restart, and cannot alter roles or permissions.

## Freshness policy ownership

The approved human policy establishes a 30-minute idle timeout, 12-hour maximum absolute lifetime, and 15-minute applicable MFA freshness window. Identity / Authorization enforces Session freshness; existing privileged-operation validation retains MFA authority. Production implementation authorization remains NO.
