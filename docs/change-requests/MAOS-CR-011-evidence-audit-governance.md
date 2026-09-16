# MAOS-CR-011 — Evidence and Audit Governance

| Item                                    | Value                                    |
| --------------------------------------- | ---------------------------------------- |
| Change Request                          | MAOS-CR-011                              |
| Baseline                                | MAOS Architecture v1.7 APPROVED / FROZEN |
| Target                                  | Adopt MAOS-026 as a v1.8 addition        |
| Class                                   | C2 Minor Architecture                    |
| Status                                  | APPROVED_C2                              |
| Runtime implementation authorization    | NO                                       |
| Production implementation authorization | NO                                       |
| Production deployment authorization     | NO                                       |
| Frozen v1.7 documents modified          | NONE                                     |
| C2 blockers                             | NONE                                     |
| Candidate correction required           | NO                                       |
| Approved By                             | HUMAN_REPOSITORY_OWNER                   |
| Approved On                             | 2026-09-16                               |

## 1. Objective

Adopt storage-neutral Evidence/Audit governance contracts that preserve complete Phase 14 provenance through existing MAOS-013 infrastructure without creating duplicate stores, ledgers, taxonomies, retention machinery, or authority.

## 2. Motivation

MAOS-013 defines canonical observability and correlation, while MAOS-020 through MAOS-025 introduce cross-phase Human command, routing, Approval, execution, Verification, rework, and portal flows. An additive contract is required to keep Evidence and Audit distinct, correlated, immutable where required, append-only where canonical, secret-safe, retention-bound, and independently queryable.

## 3. Proposed change

Adopt `MAOS-026 — Evidence and Audit Governance Architecture` as the approved/frozen v1.8 addition defining:

- storage-neutral EvidenceRecord, EvidenceReference, and AuditRecord contracts;
- Evidence/Audit/authority and visibility/mutation separation;
- canonical correlation, causation, and end-to-end provenance;
- registry-first Audit event taxonomy mapping without semantic duplicates;
- immutable Evidence binding and canonical hash/content integrity;
- append-only Audit and existing hash-chain integrity;
- retry/replay/idempotency and duplicate-event handling;
- classification, redaction, secret exclusion, retention, archival, legal hold, and disposal;
- independently queryable canonical references without a new datastore; and
- read-only Company/Team/Project and bounded mobile projections.

## 4. Preserved semantics

MAOS-025, MAOS-024, MAOS-023, MAOS-022, MAOS-021, MAOS-020, MAOS-013, MAOS-018, MAOS-019, and frozen MAOS v1.7 remain unchanged. Existing Identity, Approval, Task, Run, Workflow, Tool Gateway, Runner, Artifact, Evidence, Audit, observability, classification, retention, query, and production-authority machinery remains authoritative.

- `Evidence ≠ Audit`.
- `Evidence ≠ Authority`.
- `Audit ≠ Authority`.
- `Visibility ≠ Mutation Authority`.

## 5. Authority and trust boundaries

- Evidence proves a result/observation; Audit proves an action and authority context.
- Neither record type grants Approval, execution, Verification, QA, mutation, or Production authority.
- Portal/mobile access is scope-, permission-, classification-, retention-, and redaction-bound.
- Existing record owners remain sources of truth for their entities; MAOS-026 stores no copied business SoT.
- Existing Task/Run, Tool Gateway, Runner, Approval, and Human authority gates remain independently mandatory.

## 6. Rejected alternatives

1. Modify frozen MAOS-013 directly.
2. Use Phase-local-only documentation for cross-phase provenance.
3. Create a new Evidence database, Audit database, query datastore, duplicate event ledger, retention system, or integrity chain.
4. Emit both legacy and new event names for one semantic action.
5. Make Evidence/Audit authoritative for business actions or infer mutation authority from visibility.
6. Persist secrets or unrestricted private material in Evidence/Audit.

## 7. Expected implementation impact

With C2 approval, Phase 14H is architecture-ready for separately authorized planning. Future implementation may add typed contracts, registry mappings, policy evaluation, persistence adapters, queries, integrity verification, and portal projections, but this C2 approval authorizes none of them.

## 8. Verification requirements

Any approved implementation plan must verify:

- reuse of MAOS-013 IDs, repositories, event names, integrity, redaction, retention, storage, and query boundaries;
- no new Evidence/Audit/query store or duplicate event ledger;
- immutable Evidence references and version/hash/provenance binding;
- append-only Audit records and canonical integrity-chain validation;
- complete correlation/causation across every Phase 14 transition;
- actor/authority, scope/risk/environment, policy/version, and canonical entity references;
- generated-at versus observed-at behavior and Evidence freshness;
- registry-first event mapping with no duplicate semantic events;
- idempotent replay, conflict detection, and duplicate-effect prevention;
- classification/redaction/secret exclusion across persistence, query, export, portal, and mobile projections;
- retention, archive, legal hold, disposal, and broken-link visibility;
- independently queryable, access-controlled, redacted records after producer restart;
- portal/mobile read-only behavior with no authority expansion; and
- production fail-closed, architecture, security, boundary, and regression gates.

## 9. Migration, provider, and production impact

- Database migration authorized: `NO`.
- Dependency or lockfile change authorized: `NO`.
- Provider configuration authorized: `NO`.
- External System modification authorized: `NO`.
- Runtime implementation authorized: `NO`.
- Production implementation authorized: `NO`.
- Production deployment authorized: `NO`.

## 10. Rollback and rejection

Before implementation, rejection requires marking MAOS-026 rejected or superseded while retaining frozen v1.7 unchanged. After a future implementation, rollback must disable Phase 14 Evidence/Audit projections or producers without deleting canonical Evidence, Audit, correlation, retention, integrity, or independently owned System data.

## 11. Approval gates

- MAOS-026: `APPROVED / FROZEN` as MAOS Architecture v1.8.
- MAOS-CR-011: `APPROVED_C2`.
- Human C2 approval: `GRANTED`.
- C2 blockers: `NONE`.
- Candidate correction required: `NO`.
- Runtime implementation authorization: `NO`.
- Production implementation authorization: `NO`.
- Production deployment authorization: `NO`.
- Phase 14H readiness: `READY` for separately authorized planning.

Human decision: `APPROVE_MAOS_CR_011_C2`.

Phase 14H is architecture-ready. This C2 approval does not authorize runtime implementation, migration, provider changes, production implementation, or deployment.
