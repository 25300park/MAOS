# Phase 1.7 Context Manifest — Approval / Authority

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`

## Goal

Establish the minimum executable Approval / Authority foundation required by frozen architecture without implementing later workflow or agent runtime behavior.

## Architecture Baseline

- MAOS Architecture v1.0 is frozen and remains authoritative.
- Do not modify frozen architecture during Phase 1.7.
- MAOS-018 and MAOS-019 are candidate references only and are not implementation authority.
- Human authority, least privilege, deny precedence, fail-closed behavior, and canonical approval and authority semantics take precedence over implementation convenience.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md` — MAOS-000 Project Constitution
- `docs/architecture/MAOS-002-domain-model.md` — MAOS-002 Domain Model
- `docs/architecture/MAOS-009-approval-architecture.md` — MAOS-009 Approval Architecture
- `docs/architecture/MAOS-010-api-architecture.md` — MAOS-010 API Architecture
- `docs/architecture/MAOS-012-security-architecture.md` — MAOS-012 Security Architecture
- `docs/architecture/MAOS-015-development-standards.md` — MAOS-015 Development Standards
- `docs/architecture/MAOS-016-test-strategy.md` — MAOS-016 Test Strategy

## Conditional Architecture Documents

Read only if a concrete dependency or conflict requires it:

- `docs/architecture/MAOS-001-system-architecture.md` — MAOS-001 System Architecture
- `docs/architecture/MAOS-003-database-architecture.md` — MAOS-003 Database Architecture
- `docs/architecture/MAOS-005-task-workflow-architecture.md` — MAOS-005 Task & Workflow Architecture
- `docs/architecture/MAOS-013-observability-architecture.md` — MAOS-013 Observability Architecture

Do not read other architecture documents unless a specific conflict or missing fact requires it.

## Implementation Scope

- Approval request foundation.
- Authority evaluation foundation.
- Approval status and validity contracts.
- Exact target, version, and hash binding where required.
- Stale, mismatch, and consumed handling.
- Separation of authority and approval.
- Deny precedence.
- API 403 and 409 foundations for approval and authority outcomes.
- Audit and evidence hooks only as required by frozen architecture.
- Persistence additions only if required by Phase 1.7 architecture.
- Approval and authority tests.
- The minimum executable Approval / Authority foundation required by later phases.

## Explicit Non-Goals

- No Workflow Engine.
- No Agent Runtime.
- No Tool/MCP runtime.
- No AI Memory Gateway integration.
- No Control Room UI.
- No external or domain-system integration.
- No production deployment.
- No speculative Phase 1.8 or later functionality.

## Verification

Verification must be executed against the actual Phase 1.7 implementation. Static reasoning is not evidence. Run and report:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Approval status and validity tests.
- Authority and default-deny tests.
- Stale, mismatch, and consumed tests.
- API 403 and 409 contract tests.
- `npm run check:boundaries`
- Secret scan covering source, configuration, fixtures, and staged changes.
- `git status --short`

`SKIPPED`, `BLOCKED`, `NOT_RUN`, or inferred success is not PASS.

## Final Recommendation

Allowed:

- `PASS_PHASE_1_7`
- `REVISE_PHASE_1_7`

Stop after the Phase 1.7 result report. Do not start Phase 1.8 automatically.
