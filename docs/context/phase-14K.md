# Phase 14K Context Manifest — Development Team Portal Architecture

## Status

`COMPLETE`

## Objective

Define a governed Development Team Portal specialization without creating a second SDLC, Git, CI, deployment, approval, execution, Evidence, or Audit engine.

## Read first

1. `docs/handoff/CURRENT.md`
2. `docs/architecture/MAOS-030-development-team-portal-v2.2-candidate.md`
3. `docs/change-requests/MAOS-CR-015-development-team-portal.md`
4. `docs/implementation/phase-14k/PHASE14K_TRACEABILITY_REGISTER.md`

## Direct canonical dependencies

- `docs/architecture/MAOS-029-project-portal-integration-v2.1-candidate.md`
- `docs/architecture/MAOS-028-approval-ux-v2.0-candidate.md`
- `docs/architecture/MAOS-027-mobile-messenger-v1.9-candidate.md`
- `docs/architecture/MAOS-026-evidence-audit-governance-v1.8-candidate.md`
- `docs/architecture/MAOS-025-human-approval-gate-v1.7-candidate.md`
- `docs/architecture/MAOS-024-verification-policy-routing-v1.6-candidate.md`
- `docs/architecture/MAOS-023-executor-policy-routing-v1.5-candidate.md`
- `docs/architecture/MAOS-022-planner-reviewer-policy-routing-v1.4-candidate.md`
- `docs/architecture/MAOS-021-human-messenger-governed-command-contract-v1.3-candidate.md`
- `docs/architecture/MAOS-020-company-team-project-portal-architecture-v1.2-candidate.md`
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md`
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md`

## Scope

Development portal/project bindings; repository/branch/worktree/Workroot/environment contracts; software roles and artifact handoffs; Tool/Runner, Git, validation, network, dependency, secret, delivery, rollback, Evidence, recovery, control, status, and mobile boundaries.

## Guardrails

- Existing repositories, Git, CI, package, and deployment systems remain SoTs.
- No raw-message execution, unrestricted access, duplicate engine, or free-running agent chat.
- Push, merge, release, deployment, rollback, and Production are distinct governed actions.
- Secrets never enter prompts, source, patches, commits, logs, artifacts, Evidence, or Audit.
- MAOS-018 through MAOS-029 and frozen v2.1 remain unchanged.
- Runtime, provider, repository, credential, and Production authority remain `NONE`.

## Gate

- MAOS-030: `APPROVED / FROZEN` as MAOS Architecture v2.2.
- MAOS-CR-015: `APPROVED_C2`.
- C2 blockers: `NONE`; candidate correction required: `NO`.
- Human C2 approval: `GRANTED`.
- Phase 14K: `COMPLETE`.
- Phase 14L: `BLOCKED_PENDING_RUNTIME_IMPLEMENTATION`.
- Production changes: `NO`.
