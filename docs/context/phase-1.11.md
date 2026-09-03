# Phase 1.11 Context Manifest — AI Memory Gateway Integration

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`

## Goal

Establish the minimum executable AI Memory Gateway integration required by frozen architecture while preserving the boundary between MAOS work governance and externally curated knowledge.

## Architecture Baseline

- MAOS Architecture v1.0 is frozen and remains authoritative.
- Do not modify frozen architecture during Phase 1.11.
- Memory is curated knowledge, not raw chat, full prompts, logs, or a clone of domain-system data.
- The existing AI Memory Gateway remains an independent system and is reused through an adapter.
- MAOS owns tasks, workflows, agents, runs, tool calls, authority, approval, audit, and orchestration; the gateway owns memory ingestion, search, provenance, deduplication, quality, and storage lifecycle.
- MAOS must not build a duplicate Second Brain, vault, search index, or summarization engine.
- v1.1 candidate guidance does not override frozen v1.0 semantics.
- If integration requires a frozen-architecture change, stop and report `CHANGE_REQUEST_REQUIRED`.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md` — MAOS-000 Project Constitution
- `docs/architecture/MAOS-002-domain-model.md` — MAOS-002 Domain Model
- `docs/architecture/MAOS-006-memory-architecture.md` — MAOS-006 Memory Architecture
- `docs/architecture/MAOS-010-api-architecture.md` — MAOS-010 API Architecture
- `docs/architecture/MAOS-012-security-architecture.md` — MAOS-012 Security Architecture
- `docs/architecture/MAOS-013-observability-architecture.md` — MAOS-013 Observability Architecture
- `docs/architecture/MAOS-015-development-standards.md` — MAOS-015 Development Standards
- `docs/architecture/MAOS-016-test-strategy.md` — MAOS-016 Test Strategy

## Required Development Guidance

- `docs/implementation/MAOS-Development-Implementation-Guide-v1.1-Candidate.md` — use only the AI Memory Gateway boundary guidance; it remains candidate guidance and is not architecture authority.

## Conditional Architecture Documents

Read only if a concrete dependency or conflict requires it:

- `docs/architecture/MAOS-001-system-architecture.md` — MAOS-001 System Architecture
- `docs/architecture/MAOS-003-database-architecture.md` — MAOS-003 Database Architecture
- `docs/architecture/MAOS-004-agent-architecture.md` — MAOS-004 Agent Architecture
- `docs/architecture/MAOS-005-task-workflow-architecture.md` — MAOS-005 Task & Workflow Architecture
- `docs/architecture/MAOS-007-skill-architecture.md` — MAOS-007 Skill Architecture
- `docs/architecture/MAOS-008-tool-mcp-architecture.md` — MAOS-008 Tool & MCP Architecture
- `docs/architecture/MAOS-009-approval-architecture.md` — MAOS-009 Approval Architecture
- `docs/architecture/MAOS-014-operations-architecture.md` — MAOS-014 Operations Architecture
- `docs/architecture/MAOS-017-deployment-architecture.md` — MAOS-017 Deployment Architecture

Do not read other architecture documents unless a specific conflict or missing fact requires it.

## Implementation Scope

- AI Memory Gateway adapter and client contracts.
- Gateway registration, configuration, and health/readiness foundation.
- Runtime credential-reference and secret-injection boundary without secrets in source, logs, prompts, artifacts, or memory payload metadata.
- Canonical memory namespace, type, candidate status, validation, and classification mappings required at the adapter boundary.
- Task-scoped memory retrieval request and response contracts.
- Source, classification, validation, scope, and provenance preservation in retrieved memory references.
- Context assembly boundary that preserves canonical priority and keeps retrieved memory below task instructions, approved decisions, project constraints, and required artifacts.
- Identity, authorization, scope, privacy, and default-deny enforcement for retrieval.
- Default exclusion of `PRIVATE_PERSONAL` content from corporate and executive retrieval.
- Bounded timeout, cancellation, retry, and stable integration-error behavior.
- Request, correlation, task, run, actor, and integration observability propagation without sensitive payload logging.
- Persistence additions only for MAOS-owned gateway registration, external references, retrieval evidence, and integration state required by frozen architecture.
- Minimum API operations required for gateway health, task-scoped retrieval, and memory-reference access.
- Tests for contract mapping, retrieval scope, privacy, provenance, context priority, timeout, cancellation, error handling, health, and API behavior.

## Explicit Non-Goals

- No replacement or reimplementation of AI Memory Gateway.
- No duplicate memory store, vector index, conversation archive, summarization engine, deduplication engine, or backup/restore system inside MAOS.
- No raw chat, full prompt, hidden chain-of-thought, log, or domain database cloning into MAOS memory.
- No ingestion or migration of production memory data.
- No autonomous Loop Engine.
- No Control Room UI.
- No unrelated external or domain-system integration.
- No production deployment.
- No speculative Phase 1.12 or later functionality.

## Verification

Verification must be executed against the actual Phase 1.11 implementation. Static reasoning is not evidence. Run and report:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Gateway registration and health tests.
- Adapter contract and stable error-mapping tests.
- Task-scoped retrieval tests.
- Namespace, type, lifecycle, validation, and classification mapping tests.
- Identity, authorization, scope, and default-deny tests.
- `PRIVATE_PERSONAL` exclusion and privacy-boundary tests.
- Provenance and source-preservation tests.
- Context-priority tests.
- Timeout, cancellation, and bounded-retry tests.
- API contract tests.
- Clean database initialization and migration replay if persistence changes.
- `npm run check:boundaries`
- Secret and artifact scan covering source, configuration, fixtures, and staged changes.
- `git diff --check`
- `git status --short`

`SKIPPED`, `BLOCKED`, `NOT_RUN`, or inferred success is not PASS.

## Final Recommendation

Allowed:

- `PASS_PHASE_1_11`
- `REVISE_PHASE_1_11`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 1.11 result report. Do not start Phase 1.12 automatically.
