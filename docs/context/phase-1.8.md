# Phase 1.8 Context Manifest — Project / Task / Workflow Engine

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`

## Goal

Establish the minimum executable Project / Task / Workflow Engine foundation required by frozen architecture.

## Architecture Baseline

- MAOS Architecture v1.0 is frozen and remains authoritative.
- Do not modify frozen architecture during Phase 1.8.
- MAOS-018 and MAOS-019 are candidate references only and are not implementation authority.
- Canonical project, task, workflow, approval, identity, audit, and evidence semantics take precedence over implementation convenience.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md` — MAOS-000 Project Constitution
- `docs/architecture/MAOS-002-domain-model.md` — MAOS-002 Domain Model
- `docs/architecture/MAOS-005-task-workflow-architecture.md` — MAOS-005 Task & Workflow Architecture
- `docs/architecture/MAOS-009-approval-architecture.md` — MAOS-009 Approval Architecture
- `docs/architecture/MAOS-010-api-architecture.md` — MAOS-010 API Architecture
- `docs/architecture/MAOS-012-security-architecture.md` — MAOS-012 Security Architecture
- `docs/architecture/MAOS-013-observability-architecture.md` — MAOS-013 Observability Architecture
- `docs/architecture/MAOS-015-development-standards.md` — MAOS-015 Development Standards
- `docs/architecture/MAOS-016-test-strategy.md` — MAOS-016 Test Strategy

## Conditional Architecture Documents

Read only if a concrete dependency or conflict requires it:

- `docs/architecture/MAOS-001-system-architecture.md` — MAOS-001 System Architecture
- `docs/architecture/MAOS-003-database-architecture.md` — MAOS-003 Database Architecture
- `docs/architecture/MAOS-004-agent-architecture.md` — MAOS-004 Agent Architecture
- `docs/architecture/MAOS-014-operations-architecture.md` — MAOS-014 Operations Architecture

Do not read other architecture documents unless a specific conflict or missing fact requires it.

## Implementation Scope

- Project foundation.
- Task foundation.
- Canonical task statuses and transitions.
- Dependency and blocking foundation.
- Workflow definition foundation.
- Workflow execution-state foundation.
- Task and workflow ownership and identity references.
- Approval and waiting-state integration with the existing Phase 1.7 foundation.
- Idempotent state-transition behavior where required.
- Persistence additions required by frozen architecture.
- API foundation required for Project / Task / Workflow operations.
- Structured events and evidence hooks required by architecture.
- Project, task, and workflow tests.
- The minimum executable Project / Task / Workflow Engine foundation required by later phases.

## Explicit Non-Goals

- No Agent Runtime.
- No model or runner routing.
- No Skill/Tool/MCP runtime.
- No AI Memory Gateway integration.
- No Control Room UI.
- No external or domain-system integration.
- No production deployment.
- No speculative Phase 1.9 or later functionality.

## Verification

Verification must be executed against the actual Phase 1.8 implementation. Static reasoning is not evidence. Run and report:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Project lifecycle tests.
- Canonical task transition tests.
- Invalid transition rejection tests.
- Dependency and blocking tests.
- Workflow-state tests.
- Approval and waiting-state integration tests.
- API contract tests.
- Clean database initialization.
- Migration replay.
- `npm run check:boundaries`
- Secret scan covering source, configuration, fixtures, and staged changes.
- `git status --short`

`SKIPPED`, `BLOCKED`, `NOT_RUN`, or inferred success is not PASS.

## Final Recommendation

Allowed:

- `PASS_PHASE_1_8`
- `REVISE_PHASE_1_8`

Stop after the Phase 1.8 result report. Do not start Phase 1.9 automatically.
