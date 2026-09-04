# Phase 6 Context Manifest — CRM / Brokerage / Human Work Integration

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`
5. `skills/maos-test-evidence/SKILL.md`
6. `skills/maos-architecture-check/SKILL.md`

## Goal

Update and integrate the existing CRM MVP as the human employee daily work system, preserving CRM ownership of customer, listing, contract, and work data while enabling governed MAOS monitoring and coordination through natural-language, low-duplication Human Work UX.

## Architecture baseline

- Frozen MAOS Architecture v1.0 remains authoritative.
- CRM remains a separate domain system, repository, runtime, and source of truth for customer, listing, contract, brokerage, and human-work data.
- MAOS integrates, monitors, and coordinates at the enterprise control-plane level; it does not absorb CRM master data or replace employee work ownership.
- The existing CRM MVP must be updated incrementally. Rebuilding it from zero requires separate explicit approval.
- Natural-language work capture and Human Work UX are primary design requirements, not optional presentation layers.
- Employees should not enter the same work into CRM and MAOS separately. Canonical references, derived management projections, and governed synchronization must prevent duplicate entry.
- Private employee journals, mood, notes, drafts, and other private-personal content remain protected by default.
- MAOS receives only management-level operational abstractions, authorized work signals, and governed references—not private employee content.
- Production readiness and deployment approval remain unchanged and separately tracked.
- MAOS-018 and MAOS-019 remain candidates and cannot override frozen v1.0.

## Required architecture documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md`
- `docs/architecture/MAOS-001-system-architecture.md`
- `docs/architecture/MAOS-002-domain-model.md`
- `docs/architecture/MAOS-005-task-workflow-architecture.md`
- `docs/architecture/MAOS-010-api-architecture.md`
- `docs/architecture/MAOS-011-ui-architecture.md`
- `docs/architecture/MAOS-012-security-architecture.md`
- `docs/architecture/MAOS-013-observability-architecture.md`
- `docs/architecture/MAOS-014-operations-architecture.md`
- `docs/architecture/MAOS-015-development-standards.md`
- `docs/architecture/MAOS-016-test-strategy.md`

## Conditional architecture documents

Read only when a concrete dependency, conflict, or missing decision requires it:

- `docs/architecture/MAOS-003-database-architecture.md`
- `docs/architecture/MAOS-004-agent-architecture.md`
- `docs/architecture/MAOS-006-memory-architecture.md`
- `docs/architecture/MAOS-007-skill-architecture.md`
- `docs/architecture/MAOS-008-tool-mcp-architecture.md`
- `docs/architecture/MAOS-009-approval-architecture.md`
- `docs/architecture/MAOS-017-deployment-architecture.md`
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md`
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md`

## Phase 6 scope

- Register the existing CRM MVP as an independently owned domain application in the reusable Control Plane registry.
- Define governed CRM identity, repository, workroot, environment, version, capability, health, request, result, evidence, and correlation contracts.
- Preserve CRM as source of truth for customers, listings, contracts, brokerage activity, and employee daily work.
- Provide natural-language work capture that resolves intent into reviewable CRM work candidates before governed mutation.
- Prevent duplicate data entry through stable CRM references, idempotency, deduplication, and explicit synchronization status.
- Provide employee-centered Human Work UX for daily priorities, customer/listing/contract context, follow-ups, exceptions, and clear next actions.
- Expose only authorized management-level operational abstractions to MAOS, including workload, blockers, deadlines, risk, progress, and aggregate status.
- Preserve private employee content boundaries and field-level authorization; private-personal content is excluded from management and agent projections by default.
- Support scoped task/workflow coordination, deep links, events, evidence, and audit without duplicating CRM workflow or master data.
- Add minimum API and Control Room visibility required for governed CRM monitoring and coordination.
- Add MAOS-owned references and governance metadata only where frozen architecture requires it.
- Test source-of-truth ownership, natural-language capture, deduplication, privacy, scope, management projection, failure, and human-work usability contracts.

## Explicit non-goals

- No CRM rewrite or replacement of the existing CRM MVP.
- No duplicate customer, listing, contract, brokerage, or employee-work master database in MAOS.
- No duplicate employee data entry across CRM and MAOS.
- No exposure of private journals, moods, private notes, drafts, or unauthorized personal content.
- No unrestricted CRM write, database, filesystem, provider, or credential access.
- No automatic external communication, contract execution, financial transaction, listing publication, or production side effect.
- No Marketing, AI-MLS, ERP, RBS, or other cross-system runtime expansion beyond explicitly scoped contract preparation.
- No production deployment or production-readiness status change.
- No frozen architecture change.
- No Phase 7 or later implementation.

## Implementation discipline

- Inspect Git status and create/use a short-lived `codex/` Phase 6 branch before implementation.
- Inspect the existing CRM MVP narrowly before proposing changes; update and reuse its current contracts and UX rather than rebuilding it.
- Reuse existing MAOS Control Plane, identity, permission, approval, task/workflow, observability, audit, and integration boundaries.
- Treat natural-language input as untrusted candidate intent until identity, scope, target, validation, authority, and confirmation checks complete.
- Keep secrets as external references and redact security-sensitive or private-personal values from logs, events, evidence, audit, and management projections.
- Treat unknown identity, field visibility, scope, ownership, consent, provenance, health, or authority as denial or explicit degraded state.
- Stop with `CHANGE_REQUEST_REQUIRED` if implementation requires CRM ownership transfer, private-content disclosure, duplicate master data, a CRM rewrite, or frozen semantic change.

## Verification

- format
- lint
- typecheck
- tests
- build
- CRM system registration and source-of-truth tests
- existing CRM MVP compatibility and incremental-update tests
- natural-language work-capture and confirmation tests
- duplicate-entry prevention and idempotency tests
- customer/listing/contract/work reference tests
- management-level projection and field-authorization tests
- private employee content isolation tests
- task/workflow coordination and deep-link tests
- timeout, cancellation, stale, mismatch, unavailable-source, and failure tests
- Human Work UX, responsive, accessibility, loading, empty, error, and blocked-state tests
- provenance, event, evidence, audit, and correlation tests
- API and Control Room contract tests
- clean database initialization and migration replay when persistence changes
- architecture/module-boundary checks
- secret/artifact scan
- `git diff --check`
- `git status --short`

## Allowed recommendation

- `PASS_PHASE_6`
- `REVISE_PHASE_6`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 6 result report. Do not begin Phase 7 automatically.
