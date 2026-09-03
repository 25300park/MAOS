# Phase 1.13 Context Manifest — MAOS Control Room UI

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`

## Goal

Establish the minimum executable MAOS Control Room UI foundation required by frozen architecture for governed visibility and interaction with existing MAOS capabilities.

## Architecture Baseline

- MAOS Architecture v1.0 is frozen and remains authoritative.
- Do not modify frozen architecture during Phase 1.13.
- The Control Room is an enterprise control interface, not a replacement source of truth, authority engine, workflow engine, audit store, or domain system.
- Human authority remains above AI authority; UI actions must use existing identity, permission, approval, validation, evidence, and audit boundaries.
- Chat is not the source of truth, AI output is not trusted action until validated and authorized, and QA PASS is not production approval.
- Secrets, credentials, private personal content, and hidden chain-of-thought must not be rendered, logged, cached, or persisted by the UI.
- If implementation requires a frozen-architecture change, stop and report `CHANGE_REQUEST_REQUIRED`.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md` — MAOS-000 Project Constitution
- `docs/architecture/MAOS-001-system-architecture.md` — MAOS-001 System Architecture
- `docs/architecture/MAOS-002-domain-model.md` — MAOS-002 Domain Model
- `docs/architecture/MAOS-010-api-architecture.md` — MAOS-010 API Architecture
- `docs/architecture/MAOS-011-ui-architecture.md` — MAOS-011 UI Architecture
- `docs/architecture/MAOS-012-security-architecture.md` — MAOS-012 Security Architecture
- `docs/architecture/MAOS-013-observability-architecture.md` — MAOS-013 Observability Architecture
- `docs/architecture/MAOS-015-development-standards.md` — MAOS-015 Development Standards
- `docs/architecture/MAOS-016-test-strategy.md` — MAOS-016 Test Strategy

## Conditional Architecture Documents

Read only if a concrete dependency or conflict requires it:

- `docs/architecture/MAOS-003-database-architecture.md` — MAOS-003 Database Architecture
- `docs/architecture/MAOS-004-agent-architecture.md` — MAOS-004 Agent Architecture
- `docs/architecture/MAOS-005-task-workflow-architecture.md` — MAOS-005 Task & Workflow Architecture
- `docs/architecture/MAOS-008-tool-mcp-architecture.md` — MAOS-008 Tool & MCP Architecture
- `docs/architecture/MAOS-009-approval-architecture.md` — MAOS-009 Approval Architecture
- `docs/architecture/MAOS-014-operations-architecture.md` — MAOS-014 Operations Architecture
- `docs/architecture/MAOS-017-deployment-architecture.md` — MAOS-017 Deployment Architecture

Do not read other architecture documents unless a specific conflict or missing fact requires it.

## Implementation Scope

- Control Room application shell, navigation, layout, and design-system foundation.
- Authenticated UI boundary and secure identity-context handling using existing Phase 1.6 contracts.
- Read-only operational views for projects, tasks, workflows, approvals, agents, runs, tools, health, events, and audit evidence where existing APIs support them.
- Minimum governed command surfaces only where existing APIs, permissions, authority, approval, validation, and audit contracts already permit the operation.
- Canonical loading, empty, unavailable, degraded, denied, validation, conflict, and failure states.
- Request/correlation/trace continuity from browser requests through existing API contracts.
- Accessible, responsive, keyboard-operable enterprise UI components.
- Security-sensitive redaction and prevention of secret/private-data rendering.
- UI component, contract, interaction, accessibility, responsive, and visual verification foundations.

## Explicit Non-Goals

- No new backend governance, approval, workflow, agent, tool, memory, observability, or audit engine.
- No authority or approval bypass from the UI.
- No unrestricted command console or shell.
- No AI Memory Gateway ownership transfer or duplicate memory store.
- No autonomous Loop Engine.
- No external or domain-system integration.
- No production deployment.
- No speculative Phase 1.14 or later implementation.

## Verification

Verification must execute against the actual Phase 1.13 implementation. Static reasoning is not evidence. Run and report:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Control Room shell and navigation tests.
- Authentication, authorization, denied-state, and redaction tests.
- API contract and request/correlation/trace propagation tests.
- Loading, empty, degraded, unavailable, validation, conflict, and failure-state tests.
- Responsive layout and keyboard/accessibility tests.
- Visual QA at required desktop and mobile viewports.
- `npm run check:boundaries`
- Secret and artifact scan covering source, configuration, fixtures, and staged changes.
- `git diff --check`
- `git status --short`

`SKIPPED`, `BLOCKED`, `NOT_RUN`, inferred success, or unreviewed screenshots are not PASS.

## Final Recommendation

Allowed:

- `PASS_PHASE_1_13`
- `REVISE_PHASE_1_13`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 1.13 result report. Do not start Phase 1.14 automatically.
