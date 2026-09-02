# Phase 1.10 Context Manifest — Skill / Tool / MCP

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`

## Goal

Establish the minimum executable Skill / Tool / MCP foundation required by frozen architecture, while preserving: Skill != Tool Permission and Tool capability != authority.

## Architecture Baseline

- MAOS Architecture v1.0 is frozen and remains authoritative.
- Do not modify frozen architecture during Phase 1.10.
- MAOS-018 and MAOS-019 are candidate references only and are not implementation authority.
- Skill and Tool Permission remain distinct canonical concepts: Skill != Tool Permission.
- Tool capability does not grant authority: Tool capability != authority.
- Canonical identity, permission, authority, approval, evidence, audit, and lifecycle semantics take precedence over implementation convenience.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md` — MAOS-000 Project Constitution
- `docs/architecture/MAOS-002-domain-model.md` — MAOS-002 Domain Model
- `docs/architecture/MAOS-004-agent-architecture.md` — MAOS-004 Agent Architecture
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

- `docs/architecture/MAOS-001-system-architecture.md` — MAOS-001 System Architecture
- `docs/architecture/MAOS-003-database-architecture.md` — MAOS-003 Database Architecture
- `docs/architecture/MAOS-005-task-workflow-architecture.md` — MAOS-005 Task & Workflow Architecture
- `docs/architecture/MAOS-014-operations-architecture.md` — MAOS-014 Operations Architecture
- `docs/architecture/MAOS-017-deployment-architecture.md` — MAOS-017 Deployment Architecture

Do not read other architecture documents unless a specific conflict or missing fact requires it.

## Implementation Scope

- Skill definition, version, and status foundation.
- Skill resolution and precedence foundation.
- Tool definition, type, risk, and lifecycle contracts.
- Tool capability and permission separation.
- MCP and tool-provider registration foundation.
- Tool-call lifecycle contracts.
- Authorization gate before execution.
- Approval gate integration for required tool risk.
- Default-deny tool execution behavior.
- Timeout, cancellation, result, and evidence foundations.
- Structured tool-call events.
- Persistence additions required by frozen architecture.
- Minimum Skill / Tool / MCP API operations.
- Tests for skill resolution, tool permission, risk, approval gating, denial, and lifecycle behavior.
- The minimum executable Skill / Tool / MCP foundation required by later phases.

## Canonical Tool Risk

- `R0` — `READ_ONLY`
- `R1` — `LOW_RISK_WRITE`
- `R2` — `CONTROLLED_WRITE`
- `R3` — `EXTERNAL_ACTION`
- `R4` — `CRITICAL_ACTION`

## Canonical Tool Lifecycle

- `DRAFT`
- `TESTING`
- `ACTIVE`
- `DISABLED`
- `DEPRECATED`
- `ARCHIVED`

## Canonical ToolCall States

- `REQUESTED`
- `AUTHORIZING`
- `WAITING_APPROVAL`
- `AUTHORIZED`
- `EXECUTING`
- `SUCCEEDED`
- `FAILED`
- `DENIED`
- `TIMED_OUT`
- `CANCELLED`

## Explicit Non-Goals

- No Local Execution Bridge implementation.
- No IDE Companion implementation.
- No AI Memory Gateway integration.
- No autonomous Loop Engine.
- No Control Room UI.
- No external or domain-system integration.
- No production deployment.
- No speculative Phase 1.10A or later functionality.

## Verification

Verification must be executed against the actual Phase 1.10 implementation. Static reasoning is not evidence. Run and report:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Skill resolution and precedence tests.
- Tool permission and default-deny tests.
- Risk classification tests.
- Approval-gating tests.
- ToolCall lifecycle tests.
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

- `PASS_PHASE_1_10`
- `REVISE_PHASE_1_10`

Stop after the Phase 1.10 result report. Do not start Phase 1.10A automatically.
