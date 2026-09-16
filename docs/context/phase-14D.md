# Phase 14D Context Manifest — Executor Routing

Status: **COMPLETE**

## Goal

Define deterministic, registry- and policy-evaluated Executor routing while preserving existing Task/Run, Tool Gateway, and MAOS-019 execution authority.

## Read First

- `AGENTS.md`
- `docs/handoff/CURRENT.md`
- `docs/context/phase-14D.md`
- `docs/architecture/MAOS-004-agent-architecture.md`
- `docs/architecture/MAOS-005-task-workflow-architecture.md`
- `docs/architecture/MAOS-007-skill-architecture.md`
- `docs/architecture/MAOS-008-tool-mcp-architecture.md`
- `docs/architecture/MAOS-009-approval-architecture.md`
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md`
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md`
- `docs/architecture/MAOS-020-company-team-project-portal-architecture-v1.2-candidate.md`
- `docs/architecture/MAOS-021-human-messenger-governed-command-contract-v1.3-candidate.md`
- `docs/architecture/MAOS-022-planner-reviewer-policy-routing-v1.4-candidate.md`
- `docs/architecture/MAOS-023-executor-policy-routing-v1.5-candidate.md`
- `docs/change-requests/MAOS-CR-008-executor-policy-routing.md`

## Scope

- Executor role, routing envelope, and immutable execution constraints;
- Plan/Review/Approval/scope/risk/environment eligibility;
- capability, approved Skill, Tool Permission, repository, Workroot, Runner, and availability matching;
- dispatch and immediate pre-execution revalidation;
- fallback, waiting-human, retry, idempotency, and control mapping;
- reference-only verification handoff, Evidence/Audit, provenance, and mobile visibility; and
- v1.5 candidate C2 governance package.

## Non-goals

- no runtime or UI implementation;
- no canonical verification routing;
- no raw-message execution, self-approval, or Executor authority expansion;
- no duplicate Task, Workflow, Approval, Run, Job, Tool Gateway, Runner, execution, Verification, Evidence, or Audit engine;
- no database migration, dependency, provider, credential, external-System, or production change; and
- no Phase 14E implementation without separate authorization.

## Gate

- Frozen MAOS v1.4: `UNCHANGED`.
- MAOS-023: `APPROVED / FROZEN` as MAOS Architecture v1.5.
- MAOS-CR-008: `APPROVED_C2`.
- Phase 14E: `READY` for separately authorized planning.
- Runtime implementation authority: `NONE`.
- Production authority: `NONE`.

## Allowed recommendation

- `PASS_MAOS_PHASE14D_V15_CANDIDATE_C2_PACKAGE`
