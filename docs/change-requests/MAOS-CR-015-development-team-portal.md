# MAOS-CR-015 — Development Team Portal Architecture

| Item                    | Value                             |
| ----------------------- | --------------------------------- |
| Change Request          | MAOS-CR-015                       |
| Class                   | C2 Minor Architecture             |
| Target                  | Adopt MAOS-030 as a v2.2 addition |
| Status                  | APPROVED_C2                       |
| Current frozen baseline | MAOS Architecture v2.1            |
| Runtime authority       | NONE                              |
| Provider authority      | NONE                              |
| Production authority    | NONE                              |
| Human C2 decision       | GRANTED — 2026-09-16              |

## 1. Change request

Adopt `MAOS-030 — Development Team Portal Architecture` as the candidate v2.2 addition defining a governed software-development Project Portal specialization.

## 2. Reason

MAOS-020 through MAOS-029 define portals, governed commands, role routing, execution, verification, approval, Evidence/Audit, mobile, and integration boundaries. Frozen v2.1 does not yet bind those contracts into a canonical development surface with repository/worktree/Workroot, Git, validation, dependency, network, secret, delivery, recovery, and development evidence semantics.

## 3. Additive boundary

MAOS-030 reuses existing canonical engines and registries. It creates no SDLC, Git, CI, deployment, Task, Workflow, Approval, Runner, Evidence, or Audit engine; grants no Tool, repository, network, provider, or Production authority; and leaves MAOS-018 through MAOS-029 and frozen v2.1 unchanged.

## 4. Proposed contracts

1. DevelopmentTeamPortal and DevelopmentProjectBinding.
2. Exact repository/branch/worktree/Workroot/environment binding.
3. Software Planner, Reviewer, Executor, and artifact-handoff boundaries.
4. MAOS-019 local execution and Tool Gateway integration.
5. File, command, Tool, Git, network, dependency, and secret authority contracts.
6. Distinct commit, push, merge, tag/release, deploy, and rollback gates.
7. Validation/build and DevelopmentEvidenceBundle contracts.
8. Human checkpoints, recovery, stop/pause/kill, status, and mobile projection.

## 5. C2 acceptance criteria

C2 may approve only if MAOS-030:

- is a non-authoritative Project Portal specialization rather than a duplicate SDLC engine;
- preserves exact repository, ref, worktree, Workroot, scope, environment, policy, and Approval bindings;
- preserves Agent/Model/Runner, Skill/Tool Permission, Review/Approval, and QA/Production Approval separation;
- keeps Git and delivery transitions distinct and fail-closed;
- default-denies unapproved network, dependency, filesystem, and secret access;
- reuses MAOS-018/019 controls and MAOS-021 through 029 contracts;
- retains immutable, redacted, independently queryable Evidence/Audit provenance;
- prohibits autonomous push, merge, release, deploy, or authority expansion; and
- leaves frozen v2.1 unchanged.

## 6. Implementation and production gate

Human C2 approval adopts MAOS-030 and makes Phase 14L architecture-ready for separately authorized planning only. It does not authorize runtime implementation, repository/provider mutation, credential use, deployment, or Production action.

## 7. Current decision

- MAOS-CR-015: `APPROVED_C2`.
- MAOS-030: `APPROVED / FROZEN` as MAOS Architecture v2.2.
- Human C2 approval: `GRANTED`.
- C2 blockers: `NONE`.
- Candidate correction required: `NO`.
- Phase 14K: `COMPLETE`.
- Phase 14L: `READY` for separately authorized planning.
- Production changes: `NO`.
