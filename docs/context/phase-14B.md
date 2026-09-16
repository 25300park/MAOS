# Phase 14B Context Manifest — Messenger / Command Contract

Status: **COMPLETE**

## Goal

Define the canonical pre-Task Human Messenger and CommandEnvelope contract without implementing runtime behavior or duplicating existing governed engines.

## Read First

- `AGENTS.md`
- `docs/handoff/CURRENT.md`
- `docs/context/phase-14B.md`
- `docs/architecture/MAOS-005-task-workflow-architecture.md`
- `docs/architecture/MAOS-009-approval-architecture.md`
- `docs/architecture/MAOS-013-observability-architecture.md`
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md`
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md`
- `docs/architecture/MAOS-020-company-team-project-portal-architecture-v1.2-candidate.md`
- `docs/architecture/MAOS-021-human-messenger-governed-command-contract-v1.3-candidate.md`
- `docs/change-requests/MAOS-CR-006-human-messenger-governed-command-contract.md`

## Scope

- HumanMessage and CommandEnvelope schemas;
- pre-Task lifecycle, clarification, cancellation, and replay;
- Planner, Reviewer, Approval, and Executor boundaries;
- risk, provenance, Evidence, Audit, and response mappings;
- desktop/mobile semantic equivalence;
- MAOS-018/019 stop/kill mapping; and
- v1.3 candidate C2 governance package.

## Non-goals

- no runtime or UI implementation;
- no new Task, Workflow, Approval, Run, Job, Tool, Evidence, or Audit engine;
- no raw-message execution or free-running agent chat;
- no database migration, dependency, provider, credential, external-System, or production change; and
- no Phase 14C work before explicit Human C2 approval.

## Gate

- Frozen MAOS v1.2: `UNCHANGED`.
- MAOS-021: `APPROVED / FROZEN` as MAOS Architecture v1.3.
- MAOS-CR-006: `APPROVED_C2`.
- Human C2 approval: `GRANTED`.
- C2 blockers: `NONE`.
- Non-blocking findings: `NONE`.
- Candidate correction required: `NO`.
- Phase 14C: `READY` for separately authorized planning.
- Runtime implementation authority: `NONE`.
- Production authority: `NONE`.

## Allowed recommendation

- `PASS_MAOS_PHASE14B_C2_CLOSEOUT`
