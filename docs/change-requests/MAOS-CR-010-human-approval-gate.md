# MAOS-CR-010 — Human Approval Gate

| Item                                    | Value                                    |
| --------------------------------------- | ---------------------------------------- |
| Change Request                          | MAOS-CR-010                              |
| Baseline                                | MAOS Architecture v1.6 APPROVED / FROZEN |
| Target                                  | Adopt MAOS-025 as a v1.7 addition        |
| Class                                   | C2 Minor Architecture                    |
| Status                                  | APPROVED_C2                              |
| Runtime implementation authorization    | NO                                       |
| Production implementation authorization | NO                                       |
| Production deployment authorization     | NO                                       |
| Frozen v1.6 documents modified          | NONE                                     |
| C2 blockers                             | NONE                                     |
| Non-blocking findings                   | NONE                                     |
| Candidate correction required           | NO                                       |
| Approved By                             | HUMAN_REPOSITORY_OWNER                   |
| Approved On                             | 2026-09-16                               |

## 1. Objective

Adopt a durable, exact-bound Human Approval Gate that extends existing MAOS-009 semantics without allowing chat, Review, Verification, QA, execution readiness, or prior Approval to substitute for explicit current Human authority.

## 2. Motivation

MAOS-009 establishes canonical Approval status, validity, exact target, separation, delegation, runtime revalidation, chat confirmation, and R4 principles. Phase 14 routing now requires an additive contract for durable requests/decisions, exact Evidence presentation, scope/risk/environment binding, clarification, supersession, multi-step Approval, mobile parity, and two-stage revalidation.

## 3. Proposed change

Adopt `MAOS-025 — Human Approval Gate Architecture` as the approved/frozen v1.7 addition defining:

- durable HumanApprovalRequest and append-only HumanApprovalDecision contracts;
- exact actor/action/operation/target/version/hash/scope/risk/environment/Evidence/policy binding;
- reuse of existing Approval status and validity states;
- rejection, clarification disposition, expiry, revocation, cancellation, consumption, and supersession linkage;
- dispatch and immediate pre-execution revalidation;
- explicit Production Approval and high-risk/destructive boundaries;
- policy-defined step-up/MFA, separation-of-duties, and multi-step Approval;
- evidence presentation and canonical desktop/mobile payloads;
- waiting-human, retry, replay, idempotency, durability, Evidence, Audit, and provenance.

## 4. Preserved semantics

MAOS-024, MAOS-023, MAOS-022, MAOS-021, MAOS-020, MAOS-018, MAOS-019, MAOS-009, and frozen MAOS v1.6 remain unchanged. Existing Identity, Session, Permission, Approval, Task, Run, Workflow, Tool Gateway, Runner, Evidence, Audit, QA, and production-authority machinery remains authoritative.

- `Review ≠ Approval`.
- `Verification ≠ Approval`.
- `QA PASS ≠ Production Approval`.
- `Approval ≠ execution`.
- Human authority remains above AI authority.

## 5. Authority and trust boundaries

- HumanApprovalRequest grants no authority.
- Only an explicit authenticated, currently authorized HumanApprovalDecision may create canonical APPROVED status.
- Approval binds exact inputs and cannot be inferred, widened, repaired, transferred, or reused across target/version/scope/risk/environment/policy changes.
- AI Agents, Reviewers, Verifiers, QA, Executors, models, Tools, Runners, providers, and UI components cannot grant Human-required authority.
- Approval remains distinct from dispatch and execution.
- Production authority is explicit, environment-bound, step-up/MFA-bound where required, and non-transferable from staging.

## 6. Rejected alternatives

1. Modify frozen MAOS-009 silently.
2. Treat Approval as only a Workflow or UI state.
3. Infer Approval from chat, acknowledgement, silence, Review, Verification, QA, prior success, or prior Approval.
4. Add duplicate Approval statuses where existing status/validity plus request disposition/linkage suffices.
5. Create a parallel Approval, Workflow, Identity, Session, Evidence, or Audit engine.
6. Let Approval execute work or bypass independent execution controls.

## 7. Expected implementation impact

With C2 approval, Phase 14G is architecture-ready for separately authorized planning. Future implementation may add typed contracts, persistence extensions, policy evaluation, API/read models, and portal/mobile projections, but this C2 approval authorizes none of them.

## 8. Verification requirements

Any approved implementation plan must verify:

- durable, append-only, independently queryable request/decision and lifecycle evidence;
- exact actor/action/operation/target/version/hash/scope/risk/environment/Evidence/policy binding;
- existing status/validity reuse without duplicate lifecycle states;
- no inference from chat, silence, Review, Verification, QA, readiness, or prior Approval;
- rejection, clarification, expiry, revocation, cancellation, consumption, and supersession behavior;
- dispatch and immediate pre-execution fail-closed revalidation;
- authority-owner, step-up/MFA, separation-of-duties, and multi-step checks;
- production/non-production isolation;
- evidence presentation sufficiency and desktop/mobile contract equivalence;
- retry/replay/idempotency and optimistic concurrency;
- existing Task/Run/Tool Gateway/Runner ownership of execution;
- durable provenance, Evidence, Audit, redaction, and restart reconciliation; and
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

Before implementation, rejection requires marking MAOS-025 rejected or superseded while retaining frozen v1.6 unchanged. After a future implementation, rollback must disable Human Approval Gate entry points without deleting Approval requests, decisions, statuses, validity transitions, Evidence, Audit, Tasks, Runs, Artifacts, or independent System data.

## 11. Approval gates

- MAOS-025: `APPROVED / FROZEN` as MAOS Architecture v1.7.
- MAOS-CR-010: `APPROVED_C2`.
- Human C2 approval: `GRANTED`.
- C2 blockers: `NONE`.
- Non-blocking findings: `NONE`.
- Candidate correction required: `NO`.
- Runtime implementation authorization: `NO`.
- Production implementation authorization: `NO`.
- Production deployment authorization: `NO`.
- Phase 14G readiness: `READY` for separately authorized planning.

Human decision: `APPROVE_MAOS_CR_010_C2`.

Phase 14G is architecture-ready. This C2 approval does not authorize runtime implementation, migration, provider changes, production implementation, or deployment.
