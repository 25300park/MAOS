# Phase 1.19 Context Manifest — Full E2E + Loop Verification

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`
5. `skills/maos-test-evidence/SKILL.md`

## Goal

Verify the complete Phase 1 vertical slice from human request through governed development, test, QA, approval, release preparation, simulated deployment, verification, and loop learning evidence.

## Architecture Baseline

- MAOS Architecture v1.0 is frozen and authoritative.
- Phase 1.19 verifies the integrated Phase 1 foundations; it does not introduce a new runtime domain or transfer domain-system ownership.
- Preserve Human Authority > AI Authority, Task != Run, Review != Approval, QA PASS != Production Approval, Agent != Model != Runner, Skill != Tool Permission, and Tool capability != authority.
- Production and external mutation remain prohibited; deployment verification must be simulated and bounded.
- If verification requires a frozen-architecture change, approval/security bypass, production action, or expansion beyond Phase 1, stop and report `CHANGE_REQUEST_REQUIRED`.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md` — MAOS-000 Project Constitution
- `docs/architecture/MAOS-001-system-architecture.md` — MAOS-001 System Architecture
- `docs/architecture/MAOS-002-domain-model.md` — MAOS-002 Domain Model
- `docs/architecture/MAOS-004-agent-architecture.md` — MAOS-004 Agent Architecture
- `docs/architecture/MAOS-005-task-workflow-architecture.md` — MAOS-005 Task & Workflow Architecture
- `docs/architecture/MAOS-007-skill-architecture.md` — MAOS-007 Skill Architecture
- `docs/architecture/MAOS-008-tool-mcp-architecture.md` — MAOS-008 Tool & MCP Architecture
- `docs/architecture/MAOS-009-approval-architecture.md` — MAOS-009 Approval Architecture
- `docs/architecture/MAOS-010-api-architecture.md` — MAOS-010 API Architecture
- `docs/architecture/MAOS-011-ui-architecture.md` — MAOS-011 UI Architecture
- `docs/architecture/MAOS-012-security-architecture.md` — MAOS-012 Security Architecture
- `docs/architecture/MAOS-013-observability-architecture.md` — MAOS-013 Observability Architecture
- `docs/architecture/MAOS-014-operations-architecture.md` — MAOS-014 Operations Architecture
- `docs/architecture/MAOS-015-development-standards.md` — MAOS-015 Development Standards
- `docs/architecture/MAOS-016-test-strategy.md` — MAOS-016 Test Strategy
- `docs/architecture/MAOS-017-deployment-architecture.md` — MAOS-017 Deployment Architecture

## Conditional Architecture Documents

Read only if a concrete dependency or conflict requires it:

- `docs/architecture/MAOS-003-database-architecture.md` — MAOS-003 Database Architecture
- `docs/architecture/MAOS-006-memory-architecture.md` — MAOS-006 Memory Architecture
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md` — candidate guidance only
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md` — candidate guidance only

## Verification Scope

- Full Phase 1 vertical-slice E2E: Human Request → Development Team → Test/QA → Human Approval → Release Preparation → simulated deployment → verification.
- Development Loop Runtime verification across requirement, plan, implementation, test, QA, revision, re-test, approval, release preparation, verification, and learning/improvement-candidate states.
- Identity, permission, risk, approval, task scope, allowed-tool, environment, and human-authority enforcement at every transition.
- Agent-team assignment and Agent/Model/Runner separation across task and run execution.
- Skill resolution, tool-call lifecycle, local execution boundaries, and evidence capture where exercised by the slice.
- Failure, timeout, cancellation, waiting-human, approval-required, no-progress, revision, retry, and recovery paths.
- Release gate, exact artifact/version/hash binding, approval freshness, and simulated-deployment constraints.
- Audit, event, evidence, provenance, request/correlation, task, run, artifact, approval, release, and verification continuity.
- Control Room and Development Workspace visibility for owner, status, blockers, approvals, next action, evidence, release, and verification.
- Final Phase 1 MVP readiness evidence and explicit unresolved-risk reporting.
- Only minimal in-scope fixes required to make the existing integrated Phase 1 behavior conform to frozen architecture.

## Explicit Non-Goals

- No new runtime domain or speculative Phase 2 functionality.
- No production deployment or destructive/external mutation.
- No bypass of identity, permission, risk, approval, audit, evidence, or human-authority gates.
- No transfer or duplication of external-system source-of-truth ownership.
- No unrestricted shell, filesystem, tool, or autonomous execution.
- No unapproved architecture change.

## Verification

Verification must execute against the actual integrated Phase 1 implementation. Run and report:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Full vertical-slice E2E tests.
- Development Loop lifecycle and stop-condition tests.
- Failure, revision, retry, recovery, timeout, cancellation, waiting-human, and approval-required tests.
- Identity, permission, risk, approval, task-scope, environment, and human-authority boundary tests.
- Agent-team, model/runner selection, skill/tool, and local-execution boundary tests exercised by the slice.
- Release preparation, exact binding, simulated deployment, and verification tests.
- Audit, event, evidence, provenance, and correlation-continuity tests.
- Control Room and Development Workspace end-to-end visibility tests.
- Clean database initialization and migration replay.
- API contract tests.
- Architecture/module boundary checks.
- Secret and artifact scan.
- `git diff --check`
- `git status --short`

`SKIPPED`, `BLOCKED`, `NOT_RUN`, inferred success, or unreviewed evidence are not PASS.

## Final Recommendation

Allowed:

- `PASS_PHASE_1_19`
- `REVISE_PHASE_1_19`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 1.19 result report. Do not start a later phase automatically.
