# MAOS-CR-012 — Mobile Messenger Architecture

| Item                                    | Value                                    |
| --------------------------------------- | ---------------------------------------- |
| Change Request                          | MAOS-CR-012                              |
| Baseline                                | MAOS Architecture v1.8 APPROVED / FROZEN |
| Target                                  | Adopt MAOS-027 as a v1.9 addition        |
| Class                                   | C2 Minor Architecture                    |
| Status                                  | APPROVED_C2                              |
| Runtime implementation authorization    | NO                                       |
| Production implementation authorization | NO                                       |
| Production deployment authorization     | NO                                       |
| Frozen v1.8 documents modified          | NONE                                     |
| C2 blockers                             | NONE                                     |
| Non-blocking findings                   | NONE                                     |
| Candidate correction required           | NO                                       |
| Approved By                             | HUMAN_REPOSITORY_OWNER                   |
| Approved On                             | 2026-09-16                               |

## 1. Objective

Adopt a mobile-first Messenger presentation and interaction architecture over existing canonical MAOS contracts without creating mobile-specific command, Approval, Workflow, execution, Evidence/Audit, or business-state machinery.

## 2. Motivation

MAOS-020 defines a bounded mobile operating subset, while MAOS-021 through MAOS-026 define command, routing, Approval, execution, Verification, and Evidence/Audit contracts. A cross-contract mobile architecture is required to preserve identical semantics, live authority validation, stale-state safety, offline boundaries, and secure accessible presentation.

## 3. Proposed change

Adopt `MAOS-027 — Mobile Messenger Architecture` as the approved/frozen v1.9 addition defining:

- Mobile Messenger shell and bounded information architecture;
- Command Composer, protected local drafts, and server-owned governed submission;
- clarification and command-status timelines;
- Planner/Reviewer, Approval, Evidence, execution, Verification, and WAITING_HUMAN cards;
- MAOS-025 Approval reuse and MAOS-018/019 pause/stop/kill reuse;
- attention-only notifications and registry-backed deep links;
- offline/reconnect, live revalidation, idempotency, and stale-state fail-closed behavior;
- Session, origin/CSRF, authority, scope, freshness, and sensitive-data boundaries;
- accessibility and exact desktop/mobile semantic parity; and
- desktop-focused forensic/administrative non-goals.

## 4. Preserved semantics

MAOS-026, MAOS-025, MAOS-024, MAOS-023, MAOS-022, MAOS-021, MAOS-020, MAOS-018, MAOS-019, and frozen MAOS v1.8 remain unchanged. Existing Message, CommandEnvelope, Task, Workflow, Approval, Run, Tool Gateway, Runner, Verification, Evidence, Audit, Session, Identity, scope, permission, and production-authority machinery remains authoritative.

## 5. Authority and security boundaries

- Mobile is presentation/interaction only and is not a business SoT.
- Local drafts/caches create no canonical record or authority.
- Governed submissions and actions require live Session, identity, scope, permission, freshness, current state, origin/CSRF where applicable, and idempotency validation.
- Mobile Approval reuses MAOS-025; pause/stop/kill reuse MAOS-018/019.
- Notifications and deep links are non-authoritative opaque references.
- Mobile never directly invokes Tool/Runner authority or interprets raw messages as execution input.
- Secret/credential/Session/cookie/CSRF/API-key material is excluded from UI state, cache, logs, notifications, telemetry, and URLs.

## 6. Rejected alternatives

1. Modify frozen MAOS-020, MAOS-021, or MAOS-025 directly.
2. Use Phase-local-only semantics for cross-contract mobile behavior.
3. Create mobile-specific command, Approval, Workflow, execution, Evidence, Audit, notification-authority, or business-state engines/stores.
4. Permit raw-message execution or direct Tool/Runner invocation.
5. Treat notifications, cached state, device possession, or offline intent as authority.
6. Allow stale Approval/control actions without canonical refresh and revalidation.

## 7. Expected implementation impact

With C2 approval, Phase 14I is architecture-ready for separately authorized planning. Future implementation may add responsive UI components, canonical API projections, protected draft handling, service-worker/cache policy, notification/deep-link adapters, accessibility verification, and mobile E2E tests, but this C2 approval authorizes none of them.

## 8. Verification requirements

Any approved implementation plan must verify:

- no mobile-specific engine, store, authority, or business state;
- local draft/cache non-authority and secret exclusion;
- server-owned canonical message/CommandEnvelope creation;
- live Session, identity, scope, permission, state, freshness, origin/CSRF, and idempotency checks;
- exact MAOS-025 Approval payload and stale-state revalidation;
- MAOS-018/019 pause/stop/kill routing without Tool/Runner authority expansion;
- notification/deep-link non-authority and canonical refresh;
- offline/reconnect conflict, replay, duplicate-effect, and no-auto-action behavior;
- redaction/classification across UI state, logs, telemetry, notifications, cache, and accessibility output;
- command/status/Approval/Evidence/execution/Verification/WAITING_HUMAN presentation;
- desktop/mobile schema and semantic parity;
- accessibility and action-disablement where informed presentation is unavailable; and
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

Before implementation, rejection requires marking MAOS-027 rejected or superseded while retaining frozen v1.8 unchanged. After a future implementation, rollback must disable mobile projections/interactions without deleting canonical Messages, CommandEnvelopes, Plans, Reviews, Approvals, Tasks, Runs, ToolCalls, Artifacts, Evidence, Audit, Verification, or independent System data.

## 11. Approval gates

- MAOS-027: `APPROVED / FROZEN` as MAOS Architecture v1.9.
- MAOS-CR-012: `APPROVED_C2`.
- Human C2 approval: `GRANTED`.
- C2 blockers: `NONE`.
- Non-blocking findings: `NONE`.
- Candidate correction required: `NO`.
- Runtime implementation authorization: `NO`.
- Production implementation authorization: `NO`.
- Production deployment authorization: `NO`.
- Phase 14I readiness: `READY` for separately authorized planning.

Human decision: `APPROVE_MAOS_CR_012_C2`.

Phase 14I is architecture-ready. This C2 approval does not authorize runtime implementation, migration, provider changes, production implementation, or deployment.
