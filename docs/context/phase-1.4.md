# Phase 1.4 Context Manifest — Core Database Foundation

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`

## Goal

Establish the executable MAOS Core Database Foundation while preserving frozen v1.0 domain boundaries and canonical semantics.

## Architecture Baseline

- MAOS Architecture v1.0 is frozen and remains authoritative.
- Do not modify frozen architecture during Phase 1.4.
- MAOS-018 and MAOS-019 are candidate references only and are not implementation authority.
- Architecture-defined canonical names, statuses, boundaries, and source-of-truth rules take precedence over implementation convenience.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md` — MAOS-000 Project Constitution
- `docs/architecture/MAOS-002-domain-model.md` — MAOS-002 Domain Model
- `docs/architecture/MAOS-003-database-architecture.md` — MAOS-003 Database Architecture
- `docs/architecture/MAOS-005-task-workflow-architecture.md` — MAOS-005 Task & Workflow Architecture
- `docs/architecture/MAOS-009-approval-architecture.md` — MAOS-009 Approval Architecture
- `docs/architecture/MAOS-012-security-architecture.md` — MAOS-012 Security Architecture
- `docs/architecture/MAOS-015-development-standards.md` — MAOS-015 Development Standards
- `docs/architecture/MAOS-016-test-strategy.md` — MAOS-016 Test Strategy

## Conditional Architecture Documents

Read only if a concrete dependency or conflict requires it:

- `docs/architecture/MAOS-001-system-architecture.md` — MAOS-001 System Architecture
- `docs/architecture/MAOS-004-agent-architecture.md` — MAOS-004 Agent Architecture
- `docs/architecture/MAOS-006-memory-architecture.md` — MAOS-006 Memory Architecture
- `docs/architecture/MAOS-010-api-architecture.md` — MAOS-010 API Architecture
- `docs/architecture/MAOS-013-observability-architecture.md` — MAOS-013 Observability Architecture
- `docs/architecture/MAOS-017-deployment-architecture.md` — MAOS-017 Deployment Architecture

Do not read other architecture documents unless a specific conflict or missing fact requires it.

## Implementation Scope

- Database technology and bootstrap according to frozen architecture.
- Migration infrastructure.
- Canonical schemas and namespaces required for the core persistence foundation.
- Foundational tables and entities required by Phase 1.4 only.
- Constraints, keys, timestamps, identifiers, and lifecycle foundations.
- Migration and bootstrap tests.
- Database configuration without secrets in source.
- Deterministic clean-database initialization and verification.
- The minimum executable persistence foundation required by later phases.

## Explicit Non-Goals

- No AuthN/AuthZ runtime.
- No Approval Engine runtime.
- No Workflow Engine runtime.
- No Agent Runtime.
- No Tool/MCP runtime.
- No AI Memory Gateway integration.
- No UI.
- No external or domain-system integration.
- No production deployment.
- No speculative Phase 1.5 or later functionality.

## Verification

Verification must be executed against the actual Phase 1.4 implementation. Static reasoning is not evidence. Run and report:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Executable database bootstrap and migration.
- Deterministic initialization of a clean database.
- Migration verification, including repeatability or idempotency where the frozen architecture permits it.
- `npm run check:boundaries`
- Secret scan covering source, configuration, migrations, fixtures, and staged changes.
- `git status --short`

`SKIPPED`, `BLOCKED`, `NOT_RUN`, or inferred success is not PASS.

## Final Recommendation

Allowed:

- `PASS_PHASE_1_4`
- `REVISE_PHASE_1_4`

Stop after the Phase 1.4 result report. Do not start Phase 1.5 automatically.
