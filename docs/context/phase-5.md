# Phase 5 Context Manifest — AI-MLS Integration

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`
5. `skills/maos-test-evidence/SKILL.md`
6. `skills/maos-architecture-check/SKILL.md`

## Goal

Integrate AI-MLS as an independently owned internal-only system that MAOS can monitor and coordinate through governed contracts without transferring source-of-truth ownership or enabling external publication.

## Architecture baseline

- Frozen MAOS Architecture v1.0 remains authoritative.
- AI-MLS remains a separate internal system, repository, runtime, and source of truth.
- MAOS is the enterprise work and AI control plane. It owns governance and coordination references, not AI-MLS domain data or internal operations.
- AI-MLS is `INTERNAL ONLY`; no external listing publication, syndication, customer-facing activation, or production side effect is permitted in Phase 5.
- Human Authority remains above AI Authority. Capability does not imply permission or approval.
- Production readiness and deployment approval remain unchanged and separately tracked.
- MAOS-018 and MAOS-019 remain candidates and cannot override frozen v1.0.

## Required architecture documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md`
- `docs/architecture/MAOS-001-system-architecture.md`
- `docs/architecture/MAOS-002-domain-model.md`
- `docs/architecture/MAOS-004-agent-architecture.md`
- `docs/architecture/MAOS-005-task-workflow-architecture.md`
- `docs/architecture/MAOS-008-tool-mcp-architecture.md`
- `docs/architecture/MAOS-009-approval-architecture.md`
- `docs/architecture/MAOS-010-api-architecture.md`
- `docs/architecture/MAOS-012-security-architecture.md`
- `docs/architecture/MAOS-013-observability-architecture.md`
- `docs/architecture/MAOS-014-operations-architecture.md`
- `docs/architecture/MAOS-015-development-standards.md`
- `docs/architecture/MAOS-016-test-strategy.md`

## Conditional architecture documents

Read only when a concrete dependency, conflict, or missing decision requires it:

- `docs/architecture/MAOS-003-database-architecture.md`
- `docs/architecture/MAOS-006-memory-architecture.md`
- `docs/architecture/MAOS-007-skill-architecture.md`
- `docs/architecture/MAOS-017-deployment-architecture.md`
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md`
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md`

## Phase 5 scope

- Register AI-MLS as an independently owned internal system in the reusable Control Plane registry.
- Define allowlisted identity, capability, health, readiness, version, request, result, artifact, evidence, and correlation contracts.
- Link MAOS projects and tasks to external AI-MLS resources through references without copying master data.
- Observe task/run status, blockers, next actions, and verified evidence needed for governed coordination.
- Support explicitly scoped internal coordination and handoff contracts without replacing AI-MLS workflows, queues, agents, models, or runners.
- Enforce internal-only access, identity, least privilege, default deny, task scope, timeout, cancellation, provenance, and source/version validation.
- Prohibit external publication and other external side effects at service, API, permission, and capability boundaries.
- Preserve structured events, evidence, audit proof, health/readiness visibility, and security-sensitive redaction.
- Add minimum API and Control Room visibility required for governed internal monitoring and coordination.
- Add MAOS-owned reference/governance persistence only where frozen architecture requires it.
- Test independent ownership, internal-only isolation, observation, coordination, denial, provenance, health, and publication prohibition.

## Explicit non-goals

- No takeover of AI-MLS ownership, repository, source of truth, domain records, or internal runtime.
- No duplicate MLS/listing master database, ingestion pipeline, search index, workflow engine, queue, or agent runtime in MAOS.
- No external listing publication, portal syndication, public API exposure, customer communication, or production mutation.
- No unrestricted AI-MLS command, tool, filesystem, provider, or credential access.
- No real production deployment or production-readiness status change.
- No CRM, Marketing, ERP, RBS, or other new cross-system runtime integration.
- No frozen architecture change.
- No Phase 6 or later implementation.

## Implementation discipline

- Inspect Git status and create/use a short-lived `codex/` Phase 5 branch before implementation.
- Reuse Phase 2 Control Plane registries and existing identity, approval, Tool/MCP, observability, audit, and integration boundaries.
- Start with read-only internal observation and add no external or write capability without explicit phase authorization and frozen-architecture basis.
- Keep secrets as external references and redact security-sensitive values from requests, results, events, evidence, and audit records.
- Treat unknown identity, capability, scope, ownership, provenance, health, or authority as denial or explicit degraded state.
- Stop with `CHANGE_REQUEST_REQUIRED` if implementation requires source-of-truth transfer, internal runtime takeover, external publication, or frozen semantic change.

## Verification

- format
- lint
- typecheck
- tests
- build
- AI-MLS system registration and independent ownership tests
- internal-only and source-of-truth boundary tests
- capability and default-deny tests
- project/task/resource scope-isolation tests
- monitoring, coordination, health, and readiness tests
- timeout, cancellation, stale, mismatch, unavailable-source, and idempotency tests
- external-publication rejection tests
- provenance, event, evidence, audit, and correlation tests
- API and Control Room contract tests
- clean database initialization and migration replay when persistence changes
- architecture/module-boundary checks
- secret/artifact scan
- `git diff --check`
- `git status --short`

## Allowed recommendation

- `PASS_PHASE_5`
- `REVISE_PHASE_5`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 5 result report. Do not begin Phase 6 automatically.
