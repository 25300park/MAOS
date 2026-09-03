# Phase 1.17 Context Manifest — Release / Approval / Deployment

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`

## Goal

Establish the minimum governed Release, Approval, and Deployment foundation required to bind verified artifacts to explicit human authority and controlled environment progression.

## Architecture Baseline

- MAOS Architecture v1.0 is frozen and authoritative.
- Human Authority > AI Authority; Review != Approval; QA PASS != Production Approval.
- Author != Reviewer != Approver != Executor where separation of duties applies.
- Release, approval, deployment, and post-deploy verification remain distinct records and operations.
- Every operation is exact-target, version/hash, environment, authority, permission, evidence, and audit bound.
- If implementation requires a frozen-architecture change or authority expansion, stop and report `CHANGE_REQUEST_REQUIRED`.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md` — MAOS-000 Project Constitution
- `docs/architecture/MAOS-001-system-architecture.md` — MAOS-001 System Architecture
- `docs/architecture/MAOS-005-task-workflow-architecture.md` — MAOS-005 Task & Workflow Architecture
- `docs/architecture/MAOS-009-approval-architecture.md` — MAOS-009 Approval Architecture
- `docs/architecture/MAOS-010-api-architecture.md` — MAOS-010 API Architecture
- `docs/architecture/MAOS-012-security-architecture.md` — MAOS-012 Security Architecture
- `docs/architecture/MAOS-013-observability-architecture.md` — MAOS-013 Observability Architecture
- `docs/architecture/MAOS-014-operations-architecture.md` — MAOS-014 Operations Architecture
- `docs/architecture/MAOS-015-development-standards.md` — MAOS-015 Development Standards
- `docs/architecture/MAOS-016-test-strategy.md` — MAOS-016 Test Strategy
- `docs/architecture/MAOS-017-deployment-architecture.md` — MAOS-017 Deployment Architecture

## Conditional Architecture Documents

Read only if a concrete dependency or conflict requires it:

- `docs/architecture/MAOS-002-domain-model.md` — MAOS-002 Domain Model
- `docs/architecture/MAOS-003-database-architecture.md` — MAOS-003 Database Architecture
- `docs/architecture/MAOS-004-agent-architecture.md` — MAOS-004 Agent Architecture
- `docs/architecture/MAOS-008-tool-mcp-architecture.md` — MAOS-008 Tool & MCP Architecture
- `docs/architecture/MAOS-011-ui-architecture.md` — MAOS-011 UI Architecture

## Implementation Scope

- Release definition, version, status, and immutable candidate identity foundation.
- Exact commit, build, artifact, evidence, test, and environment binding.
- Release-readiness evaluation using completed Phase 1.16 QA evidence.
- Explicit human approval request and exact-target validity integration using the existing Approval foundation.
- Separation of author, reviewer, approver, and executor.
- Environment progression contracts for DEVELOPMENT, STAGING / PREVIEW, and PRODUCTION.
- Deployment plan, attempt, status, timeout, cancellation, rollback-preparation, and failure foundations.
- Runtime revalidation of authority, permission, approval status/validity, target, version/hash, policy, and environment immediately before execution.
- Default-deny behavior for missing, stale, mismatched, revoked, consumed, or unclear authority and evidence.
- Structured release/deployment events, evidence, correlation, audit, and post-deploy verification hooks.
- Kill/revocation controls and fail-closed health/readiness checks.
- Minimum persistence and API/service operations required by frozen architecture.
- Minimum Control Room / Deployment Center visibility for readiness, approval, deployment, rollback preparation, and verification.
- Tests for release binding, readiness, separation of duties, approval validity, environment gates, execution denial, timeout, cancellation, rollback preparation, audit, and post-deploy verification.

## Explicit Non-Goals

- No deployment without explicit valid human authority.
- No AI self-approval, self-release, or unrestricted production execution.
- No force-push or repository-history rewrite.
- No real production deployment unless a later explicit task authorizes the exact target, environment, credentials, and action.
- No unrestricted shell, filesystem, runner, tool, or external-system access.
- No CRM, Marketing, ERP, AI-MLS, RBS/PBN, or other domain-system rollout.
- No speculative later-phase implementation.

## Verification

Verification must execute against the actual Phase 1.17 implementation. Run and report:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Release identity and exact commit/build/artifact binding tests.
- QA evidence and readiness-gate tests.
- Author/reviewer/approver/executor separation tests.
- Missing, stale, mismatched, revoked, consumed, and denied approval tests.
- Environment progression and production default-deny tests.
- Deployment-plan, timeout, cancellation, failure, and rollback-preparation tests.
- Runtime revalidation and kill/revocation tests.
- API and Deployment Center contract tests.
- Audit/event/evidence and post-deploy verification tests.
- Clean database initialization and migration replay if persistence changes.
- Architecture/module boundary checks.
- Secret and artifact scan covering source, configuration, fixtures, and staged changes.
- `git diff --check`
- `git status --short`

`SKIPPED`, `BLOCKED`, `NOT_RUN`, inferred success, or unreviewed evidence are not PASS.

## Final Recommendation

Allowed:

- `PASS_PHASE_1_17`
- `REVISE_PHASE_1_17`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 1.17 result report. Do not start a later phase automatically.
