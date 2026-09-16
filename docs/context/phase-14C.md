# Phase 14C Context Manifest — Planner / Reviewer Routing

Status: **COMPLETE**

## Goal

Define deterministic, registry- and policy-evaluated Planner/Reviewer role routing without implementing runtime behavior or duplicating existing governed engines.

## Read First

- `AGENTS.md`
- `docs/handoff/CURRENT.md`
- `docs/context/phase-14C.md`
- `docs/architecture/MAOS-004-agent-architecture.md`
- `docs/architecture/MAOS-005-task-workflow-architecture.md`
- `docs/architecture/MAOS-007-skill-architecture.md`
- `docs/architecture/MAOS-009-approval-architecture.md`
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md`
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md`
- `docs/architecture/MAOS-020-company-team-project-portal-architecture-v1.2-candidate.md`
- `docs/architecture/MAOS-021-human-messenger-governed-command-contract-v1.3-candidate.md`
- `docs/architecture/MAOS-022-planner-reviewer-policy-routing-v1.4-candidate.md`
- `docs/change-requests/MAOS-CR-007-planner-reviewer-policy-routing.md`

## Scope

- Planner and Reviewer role contracts;
- non-executing routing schemas and deterministic RoutingPolicy;
- capability, approved Skill, scope, risk, availability, and independence matching;
- model/provider/Runner separation;
- multi-role, quorum, conflict, fallback, timeout, retry, and Human escalation;
- existing Task/Run execution and MAOS-018/019 stop/kill boundaries;
- Evidence/Audit, provenance, idempotency, and mobile visibility; and
- v1.4 candidate C2 governance package.

## Non-goals

- no runtime or UI implementation;
- no Executor routing;
- no raw-message execution, self-review, Planner-selected Reviewer, or free-running Agent negotiation;
- no duplicate Task, Workflow, Approval, Run, Job, Model Router, Evidence, or Audit engine;
- no database migration, dependency, provider, credential, external-System, or production change; and
- no Phase 14D work before explicit Human C2 approval.

## Gate

- Frozen MAOS v1.3: `UNCHANGED`.
- MAOS-022: `APPROVED / FROZEN` as MAOS Architecture v1.4.
- MAOS-CR-007: `APPROVED_C2`.
- Human C2 approval: `GRANTED`.
- C2 blockers: `NONE`.
- Non-blocking findings: `NONE`.
- Candidate correction required: `NO`.
- Phase 14D: `READY` for separately authorized planning.
- Runtime implementation authority: `NONE`.
- Production authority: `NONE`.

## Allowed recommendation

- `PASS_MAOS_PHASE14C_C2_CLOSEOUT`
