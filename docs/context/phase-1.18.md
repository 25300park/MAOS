# Phase 1.18 Context Manifest — RBS / Admin Pilot

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`
5. `skills/maos-test-evidence/SKILL.md`

## Goal

Establish a bounded RBS / Admin pilot that proves MAOS can observe and coordinate an independent domain system through governed integration contracts without absorbing its source of truth or bypassing human authority.

## Architecture Baseline

- MAOS Architecture v1.0 is frozen and authoritative.
- RBS / Admin remains an independent domain system and repository by default.
- RBS / Admin owns its domain master data; MAOS owns structured enterprise work, orchestration, governance, evidence, and audit.
- Integration maturity must progress explicitly; registration or observability does not grant management or execution authority.
- Human Authority > AI Authority; permission, risk, approval, environment, evidence, and audit gates remain mandatory.
- If the pilot requires a frozen-architecture change, domain ownership transfer, or unapproved external mutation, stop and report `CHANGE_REQUEST_REQUIRED`.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md` — MAOS-000 Project Constitution
- `docs/architecture/MAOS-001-system-architecture.md` — MAOS-001 System Architecture
- `docs/architecture/MAOS-002-domain-model.md` — MAOS-002 Domain Model
- `docs/architecture/MAOS-005-task-workflow-architecture.md` — MAOS-005 Task & Workflow Architecture
- `docs/architecture/MAOS-010-api-architecture.md` — MAOS-010 API Architecture
- `docs/architecture/MAOS-012-security-architecture.md` — MAOS-012 Security Architecture
- `docs/architecture/MAOS-013-observability-architecture.md` — MAOS-013 Observability Architecture
- `docs/architecture/MAOS-014-operations-architecture.md` — MAOS-014 Operations Architecture
- `docs/architecture/MAOS-015-development-standards.md` — MAOS-015 Development Standards
- `docs/architecture/MAOS-016-test-strategy.md` — MAOS-016 Test Strategy

## Conditional Architecture Documents

Read only if a concrete dependency or conflict requires it:

- `docs/architecture/MAOS-003-database-architecture.md` — MAOS-003 Database Architecture
- `docs/architecture/MAOS-008-tool-mcp-architecture.md` — MAOS-008 Tool & MCP Architecture
- `docs/architecture/MAOS-009-approval-architecture.md` — MAOS-009 Approval Architecture
- `docs/architecture/MAOS-011-ui-architecture.md` — MAOS-011 UI Architecture
- `docs/architecture/MAOS-017-deployment-architecture.md` — MAOS-017 Deployment Architecture

## Pilot Scope

- RBS / Admin integration registration and explicit maturity level.
- Stable system identity, ownership, environment, endpoint-reference, capability, and health contracts.
- Credential references only; no secret values in source, configuration fixtures, logs, events, artifacts, or prompts.
- Read-only pilot retrieval or synchronization boundary for explicitly approved records and fields.
- Canonical external-reference mapping without duplicating RBS / Admin master-data ownership in MAOS.
- Task/project/correlation binding for every pilot request.
- Authentication, authorization, scope, risk, and default-deny enforcement.
- Timeout, cancellation, retry-bound, unavailable, stale, malformed, and partial-response handling.
- Provenance, source-system, source-record, observed-at, and freshness metadata preservation.
- Structured integration events, evidence, audit hooks, health, and readiness visibility.
- Minimum API/service and Control Room visibility required to inspect the pilot safely.
- Persistence additions only where frozen architecture requires registry, mapping, or evidence records.
- Contract, boundary, security, failure, health, and pilot workflow tests.

## Explicit Non-Goals

- No transfer or duplication of RBS / Admin domain master-data ownership into MAOS.
- No unrestricted write, administrative, filesystem, shell, browser, database, or deployment capability.
- No destructive or production RBS / Admin mutation.
- No credential discovery, storage, or logging.
- No autonomous cross-system loop or self-approval.
- No CRM, Marketing, ERP, AI-MLS, PBN, or unrelated domain-system integration.
- No production deployment.
- No speculative Phase 1.19+ implementation.

## Verification

Verification must execute against the actual Phase 1.18 implementation. Run and report:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Integration registration, identity, ownership, and maturity tests.
- Read-only scope, field allowlist, and default-deny tests.
- External-reference mapping and domain-source-of-truth boundary tests.
- Authentication, permission, risk, and authority tests.
- Provenance, freshness, and evidence-preservation tests.
- Timeout, cancellation, retry-bound, unavailable, malformed, stale, and partial-response tests.
- Health/readiness and API contract tests.
- Control Room pilot visibility and permission tests.
- Audit/event separation and correlation-continuity tests.
- Clean database initialization and migration replay if persistence changes.
- Architecture/module boundary checks.
- Secret and artifact scan covering source, configuration, fixtures, and staged changes.
- `git diff --check`
- `git status --short`

`SKIPPED`, `BLOCKED`, `NOT_RUN`, inferred success, or unreviewed evidence are not PASS.

## Final Recommendation

Allowed:

- `PASS_PHASE_1_18`
- `REVISE_PHASE_1_18`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 1.18 result report. Do not start a later phase automatically.
