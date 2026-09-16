# MAOS-CR-008 — Executor Policy-Evaluated Routing

| Item                                    | Value                                    |
| --------------------------------------- | ---------------------------------------- |
| Change Request                          | MAOS-CR-008                              |
| Baseline                                | MAOS Architecture v1.4 APPROVED / FROZEN |
| Target                                  | Adopt MAOS-023 as a v1.5 addition        |
| Class                                   | C2 Minor Architecture                    |
| Status                                  | APPROVED_C2                              |
| Runtime implementation authorization    | NO                                       |
| Production implementation authorization | NO                                       |
| Production deployment authorization     | NO                                       |
| Frozen v1.4 documents modified          | NONE                                     |
| C2 blockers                             | NONE                                     |
| Non-blocking findings                   | NONE                                     |
| Candidate correction required           | NO                                       |
| Approved By                             | HUMAN_REPOSITORY_OWNER                   |
| Approved On                             | 2026-09-16                               |

## 1. Objective

Adopt deterministic, registry- and policy-evaluated Executor routing that preserves reviewed/approved constraints and dispatches only through existing Task/Run, Tool Gateway, and MAOS-019 execution authority.

## 2. Motivation

MAOS-022 intentionally defers Executor routing. Without an explicit contract, implementation could execute raw text, treat review as Approval, couple Executor identity to provider/model/Runner, let an Executor widen Tool or repository access, or duplicate Task/Run and Tool Gateway machinery.

## 3. Proposed change

Adopt `MAOS-023 — Executor Policy-Evaluated Routing Architecture` as the approved/frozen v1.5 addition defining:

- Executor role and non-executing ExecutorRoutingEnvelope contracts;
- immutable execution-constraint bundles;
- exact Plan/Review/Approval version binding;
- scope, risk, environment, capability, Skill, and Tool Permission verification;
- repository, Workroot, and Runner compatibility boundaries;
- dispatch and immediate pre-execution revalidation;
- pre-authorized fallback and `WAITING_HUMAN` escalation;
- retry, replay, idempotency, pause/stop/kill, Evidence, and Audit; and
- reference-only verification handoff with Phase 14E deferral.

## 4. Preserved semantics

MAOS-022, MAOS-021, MAOS-020, MAOS-018, MAOS-019, and frozen MAOS v1.4 remain unchanged. Existing Task, Workflow, Approval, Run, Job, Tool Gateway, Runner, Local Execution Bridge, Model Router, Evidence, and Audit machinery remains authoritative.

- `Agent ≠ Model ≠ Runner`.
- `Skill ≠ Tool Permission`.
- `Approval ≠ execution`.
- `Review ≠ Approval`.
- `QA PASS ≠ Production Approval`.

## 5. Authority and trust boundaries

- ExecutorRoutingEnvelope records a decision only and grants no authority.
- Exact Plan, Review, Approval, scope, risk, environment, Tool Permission, repository/Workroot, Skill, Runner, and policy constraints are immutable and revalidated.
- Executor work executes only through existing Task/Run, Tool Gateway, and MAOS-019 machinery.
- Executor cannot self-approve or expand Tool, Runner, scope, environment, repository, Workroot, Skill, risk, or Approval target.
- Provider/model resolution remains separate from Agent/Executor routing.
- Human authority remains final wherever Approval or escalation is required.

## 6. Rejected alternatives

1. Task-scheduler-owned canonical Executor routing.
2. Tool-Gateway-owned Executor selection.
3. Executor self-selection of Tool, Runner, scope, environment, repository, Workroot, Skill, or Approval target.
4. Provider/model-coupled Executor routing.
5. Raw-message execution.
6. Duplicate execution, Task/Run, Tool Gateway, Runner, Verification, Evidence, or Audit engines.
7. Implicit authority or boundary expansion.

## 7. Expected implementation impact

With C2 approval, Phase 14E is architecture-ready for separately authorized planning. Future implementation may add typed contracts, policy evaluation, registry queries, persistence, API/read models, and portal projections, but this C2 approval authorizes none of them. Verification routing remains outside MAOS-023 and is deferred to Phase 14E.

## 8. Verification requirements

Any approved implementation plan must verify:

- non-executing ExecutorRoutingEnvelope and immutable constraint-bundle contracts;
- exact Plan/Review/Approval version/freshness binding;
- deterministic eligibility and registered Executor/capability/Skill/scope/risk/environment matching;
- independent Tool Permission and repository/Workroot verification;
- Runner compatibility without premature binding;
- dispatch and immediate pre-execution revalidation;
- existing Task/Run, Tool Gateway, and MAOS-019 ownership;
- self-expansion and self-approval denial;
- pre-authorized fallback without constraint relaxation;
- `WAITING_HUMAN` for every unsafe or unresolved condition;
- retry/replay/idempotency and duplicate-effect prevention;
- pause/stop/cancel/kill mapping;
- verification handoff without verification-routing semantics;
- provenance, Evidence, Audit, redaction, and restart reconciliation;
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

Before implementation, rejection requires marking MAOS-023 rejected or superseded while retaining frozen v1.4 unchanged. After a future implementation, rollback must disable Executor-routing entry points without deleting CommandEnvelopes, Plans, Reviews, Approvals, Tasks, Runs, ToolCalls, Artifacts, Evidence, Audit, or independent System data.

## 11. Approval gates

- MAOS-023: `APPROVED / FROZEN` as MAOS Architecture v1.5.
- MAOS-CR-008: `APPROVED_C2`.
- Human C2 approval: `GRANTED`.
- C2 blockers: `NONE`.
- Non-blocking findings: `NONE`.
- Candidate correction required: `NO`.
- Runtime implementation authorization: `NO`.
- Production implementation authorization: `NO`.
- Production deployment authorization: `NO`.
- Phase 14E readiness: `READY` for separately authorized planning.

Human decision: `APPROVE_MAOS_CR_008_C2`.

Phase 14E is architecture-ready. This C2 approval does not authorize runtime implementation, migration, provider changes, production implementation, or deployment.
