# Phase 14A Context Manifest — Company / Team Portal Architecture

Status: **COMPLETE**

## Goal

Define the governed registry-driven Company → Team → Project portal architecture without implementing UI, modifying independent Systems, merging sources of truth, or duplicating canonical MAOS runtimes.

## Read First

- `AGENTS.md`
- `docs/handoff/CURRENT.md`
- `docs/context/phase-14A.md`
- `docs/architecture/MAOS-011-ui-architecture.md`
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md`
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md`
- `docs/architecture/MAOS-020-company-team-project-portal-architecture-v1.2-candidate.md`
- `docs/change-requests/MAOS-CR-005-company-team-project-portal-architecture.md`

## Scope

- Company, Team, and Project Portal contracts;
- registry-driven composition and mappings;
- health, navigation, mobile, command, Evidence/Audit, and emergency-control boundaries;
- MAOS-018 and MAOS-019 relationship;
- decisions, assumptions, risks, and traceability; and
- C2 adoption package.

## Non-goals

- no UI or runtime implementation;
- no external System modification;
- no database migration or provider change;
- no source-of-truth merge or repository centralization;
- no duplicate Workflow, Approval, Agent, Runner, Evidence, Audit, or loop runtime;
- no production implementation or deployment; and
- no Phase 14B implementation without separate implementation authorization.

## Gate

- MAOS-020: `APPROVED / FROZEN`.
- MAOS-CR-005: `APPROVED_C2`.
- C2 blockers: `NONE`.
- Candidate corrections: `NONE`.
- Phase 14B: `READY` for separately authorized planning and implementation.
- Production authority: `NONE`.

## Allowed recommendation

- `PASS_MAOS_PHASE14A_C2_CLOSEOUT`
