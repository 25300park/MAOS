# MAOS-CR-004 — Governed Staging Core Tenancy Bootstrap

| Item                                    | Value                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Change Request                          | MAOS-CR-004                                                            |
| Baseline                                | MAOS Architecture v1.1 APPROVED / FROZEN                               |
| Target                                  | Additive governed Core tenancy bootstrap authority surface             |
| Class                                   | C2 Minor Architecture                                                  |
| Status                                  | APPROVED_C2                                                            |
| Scope                                   | One staging-only Core tenancy bootstrap operation                      |
| Frozen architecture conflict            | NO                                                                     |
| Migration impact                        | NO                                                                     |
| Runtime implementation                  | BLOCKED_PENDING_IMPLEMENTATION_AUTHORIZATION                           |
| Production implementation authorization | NO                                                                     |
| Production deployment authorization     | NO                                                                     |
| Decision                                | APPROVE MAOS-CR-004 Governed Staging Core tenancy bootstrap            |
| Approved By                             | HUMAN_REPOSITORY_OWNER — explicit repository-authorized human decision |
| Approved On                             | 2026-09-15                                                             |

## 1. Change objective

Authorize the design and authority surface for one staging-only governed Core tenancy bootstrap operation required before REL-001 Phase 1C Session end-to-end evidence can be collected.

The selected interface is `POST /api/v1/core/bootstrap`. Its exact authority is `BOOTSTRAP / CORE_TENANCY / staging / project-maos / R2 / ALLOW`.

This approval does not authorize runtime implementation, provider configuration, deployment, production use, or execution of the bootstrap operation. Implementation remains blocked until a separate staging implementation authorization is recorded.

## 2. Scope and non-scope

This C2 covers only:

- the staging-only `POST /api/v1/core/bootstrap` contract;
- the dedicated Core tenancy bootstrap permission and credential boundary;
- the exact server-controlled bootstrap manifest;
- durable idempotency and conflict behavior;
- audit/evidence requirements; and
- fail-closed staging and production boundaries.

It does not authorize:

- a debug route or direct SQL;
- a provider bypass;
- generic organization or project administration;
- production implementation or deployment;
- mutation of frozen architecture documents;
- a database migration; or
- runtime implementation under this documentation-only change.

## 3. Motivation

Phase 1C Session issuance requires authoritative organization, department, project, and scope records. The current staging database has the canonical schema but no governed operation for establishing that minimum tenancy state. Direct SQL and reuse of unrelated authority would bypass MAOS governance.

This bounded operation creates or reuses only the approved staging manifest through the Core API authority boundary. It provides the minimum durable prerequisite without making WorkEngine or a caller-supplied request the source of truth.

## 4. Canonical ownership

The authoritative durable entities are:

- `core.organizations`;
- `core.departments`; and
- `core.projects`.

Ownership is fixed as follows:

| Concern                | Owner                                      |
| ---------------------- | ------------------------------------------ |
| Source of truth        | MAOS Core                                  |
| Persistence            | `@maos/database`                           |
| Mutation/authorization | Core API Identity / Authorization boundary |
| Audit                  | Existing Observability / Audit service     |
| Runtime view           | WorkEngine, in memory only                 |

WorkEngine must not become the durable tenancy authority or persistence owner.

## 5. Minimum bootstrap manifest

The operation uses exactly one approved server-side staging manifest containing:

1. one staging organization;
2. one staging department belonging to that organization;
3. one MAOS project belonging to both; and
4. canonical scope `project-maos`.

All IDs, names, slug, relationships, scope, environment, and immutable attributes come from approved server-side staging configuration. They are not accepted from the request body.

## 6. Endpoint contract

### Request

`POST /api/v1/core/bootstrap`

Required headers:

- `Authorization: Bearer <dedicated staging bootstrap credential>`;
- `Idempotency-Key: <opaque bounded key>`; and
- `Content-Type: application/json`.

The body accepts only bounded evidence references:

```json
{
  "evidence_refs": ["evidence://staging/core-bootstrap/..."]
}
```

The request must not accept organization, department, or project identifiers or names; slug; relationships; scope; roles; permissions; actor; environment; or other authority-bearing values.

### Result

- First exact bootstrap: `CREATED`.
- Same idempotency key and same manifest: `REUSED`.
- Existing resources that exactly match the manifest: `REUSED`.
- Any manifest, resource, relationship, lifecycle, partial-state, or idempotency conflict: HTTP `409` with `CORE_BOOTSTRAP_CONFLICT`.

## 7. Authority contract

The operation requires the exact permission:

| Dimension   | Required value |
| ----------- | -------------- |
| Action      | `BOOTSTRAP`    |
| Resource    | `CORE_TENANCY` |
| Environment | `staging`      |
| Scope       | `project-maos` |
| Risk        | `R2`           |
| Effect      | `ALLOW`        |

Authorization uses exact matching with deny precedence. `MAOS_ENV=staging` is required.

The bootstrap actor and bearer credential are dedicated to this operation. The credential must be distinct from Operations, Identity-admin, Session, and BFF service credentials. It should be disabled or revoked after the successful staging bootstrap.

The following permissions must not be reused:

- `CONTROL / OPERATIONS`;
- `PROVISION / IDENTITY`;
- generic `CREATE / ORGANIZATION`; and
- generic `CREATE / PROJECT`.

Production constructs neither this authenticator nor this route and remains fail closed.

## 8. Idempotency and conflict rules

The opaque bounded idempotency key is durably bound to existing `core.projects.idempotency_key`.

Reuse is allowed only when the complete existing organization, department, project, relationships, scope, lifecycle state, immutable attributes, manifest, and key are exact matches. Any mismatch in key, ID, slug, name, relationship, scope, archived state, or partial resource state fails with `CORE_BOOTSTRAP_CONFLICT`.

The operation must never repair, overwrite, rename, reactivate, rebind, or partially complete existing resources. It must not accept multiple checksum-like representations or any caller-selected authority value. All manifest values are immutable through this operation.

## 9. Audit and evidence

The existing Observability / Audit service records:

- the human bootstrap actor;
- the authorization result;
- `CORE_TENANCY.BOOTSTRAPPED`;
- `CREATED` or `REUSED`;
- organization, department, and project IDs;
- scope `project-maos`;
- request, correlation, trace, and span identifiers;
- bounded evidence references; and
- conflict or failure outcome.

Audit records must never contain the bearer credential, `Authorization` header, or other secret material.

## 10. Staging and production boundary

- Scope: `STAGING ONLY`.
- Production implementation authorization: `NO`.
- Production deployment authorization: `NO`.
- Production route/credential: `NONE`.
- Frozen architecture conflict: `NO`.
- Migration impact: `NO`.
- Runtime implementation: `BLOCKED_PENDING_IMPLEMENTATION_AUTHORIZATION`.

No production authority or readiness status is implied by approval of this C2 request.

## 11. Expected bounded implementation surface

After both implementation gates are satisfied, expected files are limited to:

- `packages/config/src/index.ts` and its tests;
- a Core bootstrap repository under `packages/database`, its export, and tests;
- bounded Identity contracts/services and tests;
- `apps/api/src/staging-core-bootstrap-auth.ts`;
- `apps/api/src/core-bootstrap-routes.ts`;
- API composition and focused route/auth/audit/idempotency tests; and
- Phase 1C E2E/evidence records only after authorized live execution.

No migration is required because the durable entities and `core.projects.idempotency_key` already exist.

## 12. Security and governance impact

The change adds a narrow R2 staging authority rather than broadening an existing credential. It preserves Human Authority over service authority, exact permission matching, deny precedence, server-side authority derivation, bounded evidence, secret redaction, and production fail-closed behavior.

Rejecting or rolling back this proposal leaves Session E2E blocked but does not change existing Session, Operations, alert-email, database, or production behavior. After implementation, rollback requires disabling/revoking the dedicated credential and disabling the staging-only route; durable Core records remain governed data and must not be silently deleted.

## 13. Test requirements

An authorized implementation must cover:

- staging-only construction and production fail-closed behavior;
- missing/invalid credential `401` and exact-permission failure `403`;
- deny precedence and credential distinctness;
- rejection of every caller-supplied authority field;
- atomic first creation and exact reuse;
- same-key/same-manifest reuse;
- all mismatch and partial-state `409 CORE_BOOTSTRAP_CONFLICT` cases;
- durable idempotency binding;
- no overwrite, repair, reactivation, rebinding, or partial completion;
- audit success/reuse/conflict/failure events and secret redaction; and
- existing Operations, Identity, Session, alert-email, database, boundary, and production-readiness regressions.

## 14. Implementation gates

The C2 architecture gate is satisfied. Runtime implementation remains blocked until the remaining condition is satisfied:

1. a separate staging implementation authorization is recorded.

Current gate: `BLOCKED_PENDING_IMPLEMENTATION_AUTHORIZATION`.

## 15. Approval record

- MAOS-CR-004: `APPROVED_C2`.
- Runtime implementation: `BLOCKED_PENDING_IMPLEMENTATION_AUTHORIZATION`.
- Production implementation authorization: `NO`.
- Production deployment authorization: `NO`.
