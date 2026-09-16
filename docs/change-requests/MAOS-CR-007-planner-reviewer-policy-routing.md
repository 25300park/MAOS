# MAOS-CR-007 — Planner and Reviewer Policy-Evaluated Routing

| Item                                    | Value                                    |
| --------------------------------------- | ---------------------------------------- |
| Change Request                          | MAOS-CR-007                              |
| Baseline                                | MAOS Architecture v1.3 APPROVED / FROZEN |
| Target                                  | Adopt MAOS-022 as a v1.4 addition        |
| Class                                   | C2 Minor Architecture                    |
| Status                                  | APPROVED_C2                              |
| Runtime implementation authorization    | NO                                       |
| Production implementation authorization | NO                                       |
| Production deployment authorization     | NO                                       |
| Frozen v1.3 documents modified          | NONE                                     |
| C2 blockers                             | NONE                                     |
| Non-blocking findings                   | NONE                                     |
| Candidate correction required           | NO                                       |
| Approved By                             | HUMAN_REPOSITORY_OWNER                   |
| Approved On                             | 2026-09-16                               |

## 1. Objective

Adopt deterministic, registry- and policy-evaluated Planner/Reviewer role routing for governed CommandEnvelopes while preserving existing Task, Workflow, Approval, Run, Job, Model, Runner, Skill, Evidence, and Audit authority.

## 2. Motivation

MAOS-021 defines Planner and Reviewer boundaries but does not define candidate eligibility, routing policy, fallback, independence, quorum, disagreement, timeout, or Human escalation. Without an explicit contract, implementation could select agents informally, couple roles to providers/models, allow Planner self-review, weaken risk policy through fallback, or create a parallel orchestration engine.

## 3. Proposed change

Add `MAOS-022 — Planner and Reviewer Policy-Evaluated Routing Architecture` as a v1.4 candidate defining:

- Planner and Reviewer role contracts;
- non-executing PlannerRoutingEnvelope and ReviewerRoutingEnvelope schemas;
- deterministic RoutingPolicy inputs and evaluation order;
- capability, approved Skill/version, scope, risk, availability, and independence matching;
- model/provider/Runner separation;
- pre-authorized fallback and Human escalation;
- multi-Planner, multi-Reviewer, diversity, quorum, and conflict rules;
- timeout, retry, idempotency, cancellation, Evidence, and Audit; and
- existing Task/Run execution and MAOS-018/019 control boundaries.

## 4. Preserved semantics

MAOS-021, MAOS-020, MAOS-018, MAOS-019, and frozen MAOS v1.3 remain unchanged. Existing Task, Workflow, Approval, Run, Job, Tool, Model Router, Runner, Skill, Evidence, and Audit machinery remains authoritative.

- `Agent ≠ Model ≠ Runner`.
- `Skill ≠ Tool Permission`.
- `Review ≠ Approval`.
- `QA PASS ≠ Production Approval`.

## 5. Authority and trust boundaries

- CommandEnvelope is the exact routing input; raw Messenger text is not routing or execution authority.
- RoutingEnvelopes record decisions and never execute work.
- Planner/Reviewer work executes only through existing Task/Run machinery.
- Planner cannot approve or select its Reviewer.
- Reviewer cannot execute or grant Approval.
- Fallback cannot relax scope, risk, independence, quorum, permission, or Approval.
- Provider/model and Runner selection remain separate governed decisions.
- Human authority remains final where policy requires Human Approval or escalation.

## 6. Rejected alternatives

1. Workflow-embedded routing as canonical authority.
2. Agent-selected peer routing or Planner-selected Reviewer assignment.
3. Free-running Agent negotiation.
4. Provider/model-coupled role routing.
5. Silent fallback, independence, quorum, risk, scope, or authority relaxation.
6. Duplicate orchestration, Approval, Model Router, Evidence, or Audit engines.

## 7. Expected implementation impact

If approved, Phase 14D may become architecture-ready for separately authorized planning. Future implementation may add typed routing contracts, policy evaluation, registry queries, persistence, API/read models, and portal projections, but this C2 request authorizes none of them. Executor routing remains outside MAOS-022 and is deferred to Phase 14D.

## 8. Verification requirements

Any approved implementation plan must verify:

- schema/version and non-executing RoutingEnvelope contracts;
- deterministic evaluation and tie-breaking;
- registered role/capability/approved Skill/scope/risk/availability matching;
- exact model/provider/Runner separation;
- existing Task/Run-only dispatch and idempotent consumption;
- Planner/Reviewer identity and Run independence;
- self-review and Planner-selected Reviewer denial;
- multi-role, diversity, quorum, and disagreement behavior;
- pre-authorized fallback without constraint relaxation;
- `WAITING_HUMAN` for unsafe or unresolved conditions;
- timeout/retry/idempotency and duplicate-work prevention;
- cancellation and MAOS-018/019 stop/kill routing;
- provenance, Evidence, Audit, correlation, redaction, and restart reconciliation;
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

Before implementation, rejection requires marking MAOS-022 rejected or superseded while retaining frozen v1.3 unchanged. After a future implementation, rollback must disable routing entry points without deleting CommandEnvelopes, Tasks, Workflows, Runs, Reviews, Approvals, Evidence, Audit, or independent System data.

## 11. Approval gates

- MAOS-022: `APPROVED / FROZEN` as MAOS Architecture v1.4.
- MAOS-CR-007: `APPROVED_C2`.
- Human C2 approval: `GRANTED`.
- C2 blockers: `NONE`.
- Non-blocking findings: `NONE`.
- Candidate correction required: `NO`.
- Runtime implementation authorization: `NO`.
- Production implementation authorization: `NO`.
- Production deployment authorization: `NO`.
- Phase 14D readiness: `READY` for separately authorized planning.

Human decision: `APPROVE_MAOS_CR_007_C2`.

Phase 14D is architecture-ready. This C2 approval does not authorize runtime implementation, migration, provider changes, production implementation, or deployment.
