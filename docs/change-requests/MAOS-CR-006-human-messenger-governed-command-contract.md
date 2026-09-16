# MAOS-CR-006 — Human Messenger and Governed Command Contract

| Item                                    | Value                                    |
| --------------------------------------- | ---------------------------------------- |
| Change Request                          | MAOS-CR-006                              |
| Baseline                                | MAOS Architecture v1.2 APPROVED / FROZEN |
| Target                                  | Adopt MAOS-021 as a v1.3 addition        |
| Class                                   | C2 Minor Architecture                    |
| Status                                  | APPROVED_C2                              |
| Runtime implementation authorization    | NO                                       |
| Production implementation authorization | NO                                       |
| Production deployment authorization     | NO                                       |
| Frozen v1.2 documents modified          | NONE                                     |
| C2 blockers                             | NONE                                     |
| Non-blocking findings                   | NONE                                     |
| Candidate correction required           | NO                                       |
| Approved By                             | HUMAN_REPOSITORY_OWNER                   |
| Approved On                             | 2026-09-16                               |

## 1. Objective

Adopt a canonical pre-Task Human Messenger and CommandEnvelope architecture that transforms Human intent into governed work without treating chat as a source of truth or execution authority.

## 2. Motivation

MAOS-020 defines structured command intent as the Company Portal entry surface but intentionally does not define the full message, interpretation, clarification, handoff, replay, or provenance contract. Without an explicit contract, runtime implementation could execute raw text, infer authority, duplicate Task/Workflow/Approval/Run engines, or lose the chain from Human request to Evidence and Audit.

## 3. Proposed change

Add `MAOS-021 — Human Messenger and Governed Command Contract` as a v1.3 candidate defining:

- HumanMessage as a communication record only;
- CommandEnvelope as a versioned pre-Task intent/provenance boundary;
- classification, clarification, lifecycle, and idempotency;
- Planner, Reviewer, Approval, and Executor separation;
- governed dispatch into existing canonical Task/Workflow/Run contracts;
- cancellation before dispatch and MAOS-018/019 stop/kill mapping after dispatch;
- desktop/mobile contract equivalence; and
- end-to-end Evidence, Audit, correlation, and causation.

## 4. Preserved semantics

MAOS-020 and frozen MAOS v1.2 remain unchanged. Existing Task, Workflow, Approval, Run, Job, Goal, Trigger, Tool Gateway, Runner, Evidence, and Audit semantics remain authoritative. CommandEnvelope neither replaces nor embeds their state machines.

The authority path remains:

`Identity → Scope → Permission → Risk → Approval → Execution → Evidence → Audit`

## 5. Authority and security boundaries

- Human messages grant no authority.
- Ambiguous intent cannot create authority-bearing work before explicit clarification.
- Planner and Reviewer cannot approve or execute.
- Executor receives only exact canonical authorized inputs and never raw Messenger text as authority.
- Messenger visibility and response wording do not imply permission or Approval.
- Production actions remain separately Human-authorized and target-bound.
- Secrets and authority material are excluded from Message, CommandEnvelope, telemetry, Evidence, and Audit payloads.

## 6. Prohibited outcomes

- chat as SoT;
- raw-message execution;
- duplicate Task, Workflow, Approval, Run, Job, Evidence, or Audit engines;
- free-running agent chat;
- implicit scope, permission, risk, Approval, or production escalation;
- BFF, portal, Planner, or Reviewer execution authority expansion; and
- silent changes to frozen v1.2 architecture.

## 7. Expected implementation impact

If approved, Phase 14C may become architecture-ready for separately authorized planning. Expected future implementation may add typed contracts, API/read models, persistence, and UI projections, but this C2 request does not authorize them. Any migration, dependency, provider, credential, external-System, staging, or production change requires its own implementation evidence and authorization.

## 8. Verification requirements

Any approved implementation plan must verify:

- message and CommandEnvelope schema/version contracts;
- pre-Task separation from Task/Workflow/Approval/Run/Job/ToolCall;
- explicit ambiguity and clarification behavior;
- exact scope, risk, permission, and Approval revalidation;
- Planner/Reviewer/Executor separation and raw-text rejection at execution;
- replay idempotency and conflicting-key denial;
- cancellation and MAOS-018/019 stop/kill routing;
- provenance, Evidence, Audit, correlation, causation, and redaction;
- desktop/mobile semantic equivalence;
- restart/reconciliation behavior;
- production fail-closed behavior; and
- architecture, security, boundary, and regression gates.

## 9. Migration, provider, and production impact

- Database migration authorized: `NO`.
- Dependency or lockfile change authorized: `NO`.
- Provider configuration authorized: `NO`.
- External System modification authorized: `NO`.
- Runtime implementation authorized: `NO`.
- Production implementation authorized: `NO`.
- Production deployment authorized: `NO`.

## 10. Rollback and rejection

Before implementation, rejection requires marking MAOS-021 rejected or superseded while retaining frozen v1.2 unchanged. After a future implementation, rollback must disable Messenger command ingress without deleting canonical Tasks, Workflows, Runs, Approvals, Evidence, Audit, or independent System data.

## 11. Approval gates

- MAOS-021: `APPROVED / FROZEN` as MAOS Architecture v1.3.
- MAOS-CR-006: `APPROVED_C2`.
- Human C2 approval: `GRANTED`.
- C2 blockers: `NONE`.
- Non-blocking findings: `NONE`.
- Candidate correction required: `NO`.
- Runtime implementation authorization: `NO`.
- Production implementation authorization: `NO`.
- Production deployment authorization: `NO`.
- Phase 14C readiness: `READY` for separately authorized planning.

Human decision: `APPROVE_MAOS_CR_006_C2`.

Phase 14C is architecture-ready. This C2 approval does not authorize runtime implementation, migration, provider changes, production implementation, or deployment.
