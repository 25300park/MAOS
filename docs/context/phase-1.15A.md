# Phase 1.15A Context Manifest — Development Loop Runtime MVP

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`

## Goal

Establish the minimum governed Development Loop Runtime MVP that coordinates the completed System Development Agent Team through the canonical delivery sequence:

`Requirement → Plan → Implement → Test → QA → Revise → Re-test → Human Approval → Deploy preparation → Verify → Learn`

## Architecture Baseline

- MAOS Architecture v1.0 is frozen and authoritative.
- Agent != Model != Runner; Task != Run; Review != Approval; QA PASS != Production Approval.
- Human authority remains above every AI role, review, recommendation, retry, and execution attempt.
- The loop coordinates existing Phase 1.7–1.15 foundations. It must not duplicate Approval, Workflow, Agent, Tool, Runner, Memory, Audit, or System Development Team engines.
- If implementation requires a frozen-architecture change or authority expansion, stop and report `CHANGE_REQUEST_REQUIRED`.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md` — MAOS-000 Project Constitution
- `docs/architecture/MAOS-001-system-architecture.md` — MAOS-001 System Architecture
- `docs/architecture/MAOS-004-agent-architecture.md` — MAOS-004 Agent Architecture
- `docs/architecture/MAOS-005-task-workflow-architecture.md` — MAOS-005 Task & Workflow Architecture
- `docs/architecture/MAOS-007-skill-architecture.md` — MAOS-007 Skill Architecture
- `docs/architecture/MAOS-008-tool-mcp-architecture.md` — MAOS-008 Tool & MCP Architecture
- `docs/architecture/MAOS-009-approval-architecture.md` — MAOS-009 Approval Architecture
- `docs/architecture/MAOS-010-api-architecture.md` — MAOS-010 API Architecture
- `docs/architecture/MAOS-012-security-architecture.md` — MAOS-012 Security Architecture
- `docs/architecture/MAOS-013-observability-architecture.md` — MAOS-013 Observability Architecture
- `docs/architecture/MAOS-015-development-standards.md` — MAOS-015 Development Standards
- `docs/architecture/MAOS-016-test-strategy.md` — MAOS-016 Test Strategy

## Conditional Architecture Documents

Read only if a concrete dependency or conflict requires it:

- `docs/architecture/MAOS-002-domain-model.md` — MAOS-002 Domain Model
- `docs/architecture/MAOS-003-database-architecture.md` — MAOS-003 Database Architecture
- `docs/architecture/MAOS-006-memory-architecture.md` — MAOS-006 Memory Architecture
- `docs/architecture/MAOS-011-ui-architecture.md` — MAOS-011 UI Architecture
- `docs/architecture/MAOS-014-operations-architecture.md` — MAOS-014 Operations Architecture
- `docs/architecture/MAOS-017-deployment-architecture.md` — MAOS-017 Deployment Architecture
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md` — candidate guidance only
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md` — candidate guidance only

## Implementation Scope

- Development-loop definition and version foundation.
- Canonical loop-stage and execution-state contracts for Requirement, Plan, Implement, Test, QA, Revise, Re-test, Human Approval, Deploy preparation, Verify, and Learn.
- Explicit task, artifact, evidence, review-task, feedback-artifact, revision-task, run, and approval references at each stage.
- Governed stage advancement using existing Workflow and Task transition foundations.
- Compatible specialized-role assignment using the Phase 1.15 System Development Agent Team.
- Structured handoff enforcement between loop stages.
- Bounded retry and revision behavior with explicit attempt limits and escalation.
- Pause, resume, cancel, timeout, failure, blocked, waiting-human, and waiting-approval foundations.
- Default-deny behavior when task scope, capability, permission, runner health, evidence, review, or approval is unclear.
- Human approval gate before any deployment preparation can advance; no AI self-approval.
- Deployment preparation only; no production deployment execution.
- Structured loop events, evidence, correlation, and audit hooks using existing Phase 1.12 foundations.
- Minimum persistence, API/service, and Control Room visibility required for the Development Loop Runtime MVP.
- Tests for stage transitions, assignment, handoff, evidence, review/revision, bounded retry, failure recovery, human authority, and boundary enforcement.

## Explicit Non-Goals

- No unbounded or continuously self-directed autonomous loop.
- No uncontrolled agent-to-agent conversation as source of truth.
- No new Agent, Model, Runner, Skill, Tool, Approval, Workflow, Memory, Audit, or local-execution engine.
- No unrestricted shell, filesystem, tool, runner, or external-system access.
- No AI self-approval, self-deployment, force-push, or production deployment.
- No Preview/UI Inspector/Test/QA automation expansion beyond existing foundations.
- No external or domain-system integration.
- No speculative Phase 1.16+ implementation.

## Verification

Verification must execute against the actual Phase 1.15A implementation. Run and report:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Canonical loop-stage and transition tests.
- Specialized-role assignment and handoff tests.
- Artifact, evidence, review, feedback, revision, and re-test chain tests.
- Bounded retry, failure, timeout, pause, resume, cancel, and escalation tests.
- Human approval, separation-of-duties, and production-execution denial tests.
- Permission, task-scope, runner-health, and default-deny tests.
- API and Control Room contract tests.
- Clean database initialization and migration replay if persistence changes.
- `npm run check:boundaries`
- Secret and artifact scan covering source, configuration, fixtures, and staged changes.
- `git diff --check`
- `git status --short`

`SKIPPED`, `BLOCKED`, `NOT_RUN`, inferred success, or unreviewed evidence are not PASS.

## Final Recommendation

Allowed:

- `PASS_PHASE_1_15A`
- `REVISE_PHASE_1_15A`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 1.15A result report. Do not start Phase 1.16 automatically.
