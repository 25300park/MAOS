# REL-001 Phase 1C Staging Session Persistence / Resolution Gap Matrix

Status: HISTORICAL_GAP_SNAPSHOT_SUPERSEDED_BY_CURRENT_PHASE1C_STATUS
Evidence baseline: repository HEAD `4a23c5d8653db28a1054ec87c29545154fb03081`

This matrix records repository evidence only. It does not introduce an authentication protocol, identity provider, credential, role, capability, TTL, MFA operation, or login operation.

Amendment note: later authority decisions resolve the structural and numeric freshness design gaps recorded here. This matrix remains the original repository-evidence snapshot; current classifications are authoritative in `REL001_PHASE1C_COMPLETION_REPORT.md`. Production-style Staging ingress and production implementation remain separately unauthorized.

| Required boundary               | Repository evidence                                                                                                                                | Classification                                      | Blocking reason                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Canonical Session contract      | No Session type, entity, table, migration, repository, or architecture entry was found. `modules/identity` defines `IdentityContext`, not Session. | MISSING                                             | An existing Session model cannot be reused.                                                 |
| Session carrier                 | No runtime use of `x-session-id` was found.                                                                                                        | `x-session-id` REQUIRED BY REL-001, NOT IMPLEMENTED | Carrier semantics have no canonical resolver.                                               |
| Session creation                | No creation service, API, owner, or event was found.                                                                                               | MISSING                                             | Ownership is ambiguous.                                                                     |
| Durable lookup                  | PostgreSQL infrastructure exists, but no Session repository/table exists.                                                                          | MISSING                                             | Persistence owner and lookup contract are undefined.                                        |
| Freshness / expiry              | No Session TTL, issued/last-seen/expiry contract, or policy source exists.                                                                         | UNRESOLVED                                          | A value cannot be invented.                                                                 |
| Revocation                      | No Session revocation state, event, owner, or lookup rule exists.                                                                                  | UNRESOLVED                                          | Revocation authority is ambiguous.                                                          |
| Actor binding                   | `IdentityContext` has actor ID/type and roles; no durable binding from Session exists.                                                             | PARTIAL / BLOCKED                                   | Identity context is not proof of Session binding.                                           |
| Tenant binding                  | `identity.humans` is organization-bound; no Session-to-organization/tenant binding exists.                                                         | UNRESOLVED                                          | Tenant isolation cannot be proven.                                                          |
| Scope binding                   | Permissions contain scope; no Session-scoped grant snapshot or live derivation contract exists.                                                    | UNRESOLVED                                          | `x-session-id` cannot be treated as a scope claim.                                          |
| MFA binding                     | No MFA assertion, freshness, method, or Session field exists.                                                                                      | UNRESOLVED                                          | MFA state cannot be inferred.                                                               |
| Live authorization revalidation | Protected Core API routes authenticate, then call `authorize` against exact action/resource/environment/risk/scope.                                | EXISTING REQUEST BOUNDARY                           | It cannot run from a Session until resolution produces a trusted current `IdentityContext`. |
| Admin Console / Control Room    | Control Room accepts an injected preview identity or renders authentication-required; no shared Session resolver exists.                           | BLOCKED                                             | No production-style shared boundary.                                                        |
| Concealment / errors            | Core API has 401/403 envelopes; no missing/expired/revoked Session disclosure policy exists.                                                       | PARTIAL / BLOCKED                                   | Session-specific error semantics are absent.                                                |
| Restart durability              | Database migrations are durable and replayable; no Session persistence exists.                                                                     | BLOCKED                                             | Restart behavior cannot be specified from evidence.                                         |
| Test fixtures                   | Bearer and injected identity tests exist; no canonical Session fixtures were found.                                                                | MISSING                                             | Existing fixtures do not prove Session semantics.                                           |

## Required classifications

- Session model: `BLOCKED`
- Session carrier: `x-session-id`
- Session creation path: `MISSING`
- Durable persistence owner: `UNRESOLVED`
- Revocation semantics: `UNRESOLVED`
- Expiry/freshness: `UNRESOLVED`
- MFA binding: `UNRESOLVED`
- Tenant/scope binding: `UNRESOLVED`
- Live authorization revalidation: `RESOLVED` only as an existing post-authentication request boundary; Session-to-identity input remains blocked
- Admin Console shared boundary: `BLOCKED`
- Restart durability design: `BLOCKED`
- Production-style Staging Session ingress: `BLOCKED`

## Stop-condition result

The mandatory stop condition is met because Session creation ownership and revocation ownership are ambiguous and no existing canonical Session model is present. Canonicalization requires an approved architecture/product-owner decision before implementation.
