# Phase 1.9 Context Manifest — Agent / Model / Runner Runtime

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`

## Goal

Establish the minimum executable Agent / Model / Runner Runtime foundation required by frozen architecture, while preserving the canonical separation: Agent != Model != Runner.

## Architecture Baseline

- MAOS Architecture v1.0 is frozen and remains authoritative.
- Do not modify frozen architecture during Phase 1.9.
- MAOS-018 and MAOS-019 are candidate references only and are not implementation authority.
- Agent, Model, and Runner remain distinct canonical concepts: Agent != Model != Runner.
- Canonical task, identity, security, observability, evidence, and audit semantics take precedence over implementation convenience.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md` — MAOS-000 Project Constitution
- `docs/architecture/MAOS-002-domain-model.md` — MAOS-002 Domain Model
- `docs/architecture/MAOS-004-agent-architecture.md` — MAOS-004 Agent Architecture
- `docs/architecture/MAOS-005-task-workflow-architecture.md` — MAOS-005 Task & Workflow Architecture
- `docs/architecture/MAOS-008-tool-mcp-architecture.md` — MAOS-008 Tool & MCP Architecture
- `docs/architecture/MAOS-010-api-architecture.md` — MAOS-010 API Architecture
- `docs/architecture/MAOS-012-security-architecture.md` — MAOS-012 Security Architecture
- `docs/architecture/MAOS-013-observability-architecture.md` — MAOS-013 Observability Architecture
- `docs/architecture/MAOS-015-development-standards.md` — MAOS-015 Development Standards
- `docs/architecture/MAOS-016-test-strategy.md` — MAOS-016 Test Strategy

## Conditional Architecture Documents

Read only if a concrete dependency or conflict requires it:

- `docs/architecture/MAOS-001-system-architecture.md` — MAOS-001 System Architecture
- `docs/architecture/MAOS-003-database-architecture.md` — MAOS-003 Database Architecture
- `docs/architecture/MAOS-006-memory-architecture.md` — MAOS-006 Memory Architecture
- `docs/architecture/MAOS-009-approval-architecture.md` — MAOS-009 Approval Architecture
- `docs/architecture/MAOS-014-operations-architecture.md` — MAOS-014 Operations Architecture
- `docs/architecture/MAOS-017-deployment-architecture.md` — MAOS-017 Deployment Architecture

Do not read other architecture documents unless a specific conflict or missing fact requires it.

## Implementation Scope

- Agent definition and runtime foundation.
- Model provider and model capability contracts.
- Runner definition and runtime foundation.
- Agent != Model != Runner enforcement.
- Agent-to-task assignment foundation.
- Runner availability and health foundation.
- Model and runner selection-policy foundation.
- Provider and runner fallback foundation where allowed by frozen architecture.
- Execution request and result contracts.
- Timeout and cancellation foundations.
- Usage and cost metadata foundations where required.
- Structured run events and evidence hooks.
- Persistence additions required by frozen architecture.
- Minimum API operations required for Agent / Model / Runner.
- Tests for assignment, selection, fallback, timeout, and boundary enforcement.
- The minimum executable Agent / Model / Runner Runtime foundation required by later phases.

## Explicit Non-Goals

- No Skill execution runtime.
- No Tool/MCP execution runtime.
- No Local Execution Bridge.
- No AI Memory Gateway integration.
- No autonomous loop engine.
- No Control Room UI.
- No external or domain-system integration.
- No production deployment.
- No speculative Phase 1.10 or later functionality.

## Verification

Verification must be executed against the actual Phase 1.9 implementation. Static reasoning is not evidence. Run and report:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Agent/Model/Runner separation tests.
- Task assignment tests.
- Runner health and availability tests.
- Selection-policy tests.
- Fallback tests where applicable.
- Timeout and cancellation tests.
- API contract tests.
- Clean database initialization.
- Migration replay.
- `npm run check:boundaries`
- Secret and artifact scan covering source, configuration, fixtures, and staged changes.
- `git diff --check`
- `git status --short`

`SKIPPED`, `BLOCKED`, `NOT_RUN`, or inferred success is not PASS.

## Final Recommendation

Allowed:

- `PASS_PHASE_1_9`
- `REVISE_PHASE_1_9`

Stop after the Phase 1.9 result report. Do not start Phase 1.10 automatically.
