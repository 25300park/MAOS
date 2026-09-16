# MAOS-CR-009 — Verification Policy-Evaluated Routing and Handoff

| Item                                    | Value                                    |
| --------------------------------------- | ---------------------------------------- |
| Change Request                          | MAOS-CR-009                              |
| Baseline                                | MAOS Architecture v1.5 APPROVED / FROZEN |
| Target                                  | Adopt MAOS-024 as a v1.6 addition        |
| Class                                   | C2 Minor Architecture                    |
| Status                                  | APPROVED_C2                              |
| Runtime implementation authorization    | NO                                       |
| Production implementation authorization | NO                                       |
| Production deployment authorization     | NO                                       |
| Frozen v1.5 documents modified          | NONE                                     |
| C2 blockers                             | NONE                                     |
| Non-blocking findings                   | NONE                                     |
| Candidate correction required           | NO                                       |
| Approved By                             | HUMAN_REPOSITORY_OWNER                   |
| Approved On                             | 2026-09-16                               |

## 1. Objective

Adopt deterministic, policy-evaluated Verification routing and non-authoritative handoffs bound to exact governed execution outputs while preserving existing Task, Run, Workflow, Approval, QA, Evidence, and Audit authority.

## 2. Motivation

MAOS-023 intentionally defers canonical Verification routing. Without an explicit contract, implementations could treat Verification as Approval, infer QA or production authority, validate stale outputs, let Verifiers expand execution scope, silently mutate Artifacts, rerun work, or create duplicate QA and Workflow machinery.

## 3. Proposed change

Adopt `MAOS-024 — Verification Policy-Evaluated Routing and Handoff Architecture` as the approved/frozen v1.6 addition defining:

- Verifier roles and policy-evaluated eligibility;
- non-authoritative VerificationHandoffEnvelope and VerificationRoutingEnvelope contracts;
- exact Run, result, Artifact, Evidence, scope, risk, environment, criteria, and policy binding;
- Review/Verification/QA/Approval/Production Approval separation;
- independence, diversity, multi-Verifier, quorum, and conflict rules;
- evidence sufficiency and fail-closed outcomes;
- existing Task/Run execution boundary for Verifier work;
- reproduction versus re-execution boundaries;
- governed rework, closure, and `WAITING_HUMAN` handoffs;
- retry, replay, idempotency, provenance, Evidence, and Audit; and
- mobile visibility without authority expansion.

## 4. Preserved semantics

MAOS-023, MAOS-022, MAOS-021, MAOS-020, MAOS-018, MAOS-019, and frozen MAOS v1.5 remain unchanged. Existing Task, Run, Workflow, Approval, QA, Tool Gateway, Runner, Evidence, Audit, and production-authority machinery remains authoritative.

- `Agent ≠ Model ≠ Runner`.
- `Skill ≠ Tool Permission`.
- `Review ≠ Verification`.
- `Verification ≠ Approval`.
- `Verification ≠ QA`.
- `QA PASS ≠ Production Approval`.

## 5. Authority and trust boundaries

- VerificationHandoffEnvelope and VerificationRoutingEnvelope grant no authority.
- Verification binds exact completed execution outputs and current policy; it does not authorize or alter execution.
- Verifier work executes only through existing Task/Run and, where needed, Tool Gateway/MAOS-019 controls.
- A Verifier cannot approve, assign QA status, authorize production, mutate inputs, silently rerun work, or expand scope/Tool/Runner authority.
- Evidence insufficiency, independence failure, quorum failure, disagreement, stale binding, unsafe retry, and policy ambiguity fail closed.
- Human authority remains final wherever Approval, production authorization, conflict resolution, or policy change is required.

## 6. Rejected alternatives

1. Verifier acting as Approver.
2. Verification implying QA authority, QA PASS, release readiness, or Production Approval.
3. Verification-owned silent Artifact mutation, retry, or re-execution.
4. Verifier self-expansion of scope, Tool, Runner, repository, Workroot, Skill, evidence access, criteria, or quorum.
5. Free-running Verifier/Executor or peer negotiation.
6. Duplicate QA, Approval, Workflow, Task/Run, Verification, Evidence, or Audit engines.
7. Implicit authority or trust-boundary expansion.

## 7. Expected implementation impact

With C2 approval, Phase 14F is architecture-ready for separately authorized planning. Future implementation may add typed contracts, policy evaluation, registry queries, persistence, API/read models, and portal projections, but this C2 approval authorizes none of them.

## 8. Verification requirements

Any approved implementation plan must verify:

- non-authoritative handoff and routing-envelope contracts;
- exact Task/Run/result/Artifact/Evidence/scope/risk/environment/policy binding;
- deterministic routing and versioned Verifier policy;
- independence, diversity, quorum, dissent, and conflict preservation;
- evidence provenance, integrity, freshness, completeness, and sufficiency;
- existing Task/Run ownership of Verifier work;
- separate Tool Permission and MAOS-019 authority for reproduction;
- no Approval, QA, production, execution, or mutation authority by implication;
- fail-closed insufficient Evidence, stale binding, unavailable independence, quorum failure, disagreement, unsafe retry, and policy ambiguity;
- governed rework and closure handoffs without silent mutation or rerun;
- retry/replay/idempotency and duplicate-effect prevention;
- durable provenance, Evidence, Audit, redaction, and restart reconciliation;
- mobile/desktop visibility equivalence; and
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

Before implementation, rejection requires marking MAOS-024 rejected or superseded while retaining frozen v1.5 unchanged. After a future implementation, rollback must disable Verification-routing entry points without deleting CommandEnvelopes, Plans, Reviews, Approvals, Tasks, Runs, ToolCalls, Results, Artifacts, Verification Artifacts, Evidence, Audit, or independent System data.

## 11. Approval gates

- MAOS-024: `APPROVED / FROZEN` as MAOS Architecture v1.6.
- MAOS-CR-009: `APPROVED_C2`.
- Human C2 approval: `GRANTED`.
- C2 blockers: `NONE`.
- Non-blocking findings: `NONE`.
- Candidate correction required: `NO`.
- Runtime implementation authorization: `NO`.
- Production implementation authorization: `NO`.
- Production deployment authorization: `NO`.
- Phase 14F readiness: `READY` for separately authorized planning.

Human decision: `APPROVE_MAOS_CR_009_C2`.

Phase 14F is architecture-ready. This C2 approval does not authorize runtime implementation, migration, provider changes, production implementation, or deployment.
