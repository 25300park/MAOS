# Phase 8 Context Manifest — ERP / Accounting / Tax Integration

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`
5. `skills/maos-test-evidence/SKILL.md`
6. `skills/maos-architecture-check/SKILL.md`

## Goal

Integrate the independently owned ERP with governed accounting and tax analysis, review, and drafting workflows while preserving ERP operational source-of-truth ownership, final human authority, and explicit approval before any real filing, payment, or submission.

## Architecture baseline

- Frozen MAOS Architecture v1.0 remains authoritative.
- ERP remains an independent domain system and the operational source of truth for accounting and tax records.
- MAOS integrates, monitors, coordinates, and governs work; it does not absorb ERP master data or operational ownership.
- The PH Accounting/Tax AI Team provides analysis, review, and drafting support only.
- Human authority remains final for accounting and tax decisions.
- No real filing, payment, submission, or other external mutation may occur without exact, valid human approval.
- Production deployment remains `NOT APPROVED` and production gaps remain separately tracked.
- CRM, AI-MLS, Marketing, RBS, and Admin remain separate governed systems with independent ownership.
- MAOS-018 and MAOS-019 remain candidate guidance and cannot override frozen v1.0.

## Required architecture documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md`
- `docs/architecture/MAOS-001-system-architecture.md`
- `docs/architecture/MAOS-002-domain-model.md`
- `docs/architecture/MAOS-005-task-workflow-architecture.md`
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
- `docs/architecture/MAOS-004-agent-architecture.md`
- `docs/architecture/MAOS-007-skill-architecture.md`
- `docs/architecture/MAOS-008-tool-mcp-architecture.md`
- `docs/architecture/MAOS-011-ui-architecture.md`
- `docs/architecture/MAOS-017-deployment-architecture.md`
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md`
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md`

## Phase 8 scope

- Register and represent ERP as an independently owned domain system and operational source of truth.
- Establish governed ERP integration requests, references, results, provenance, evidence, health, and failure contracts without copying ERP master data.
- Establish PH Accounting/Tax AI Team roles for analysis, review, and drafting with explicit capability and task-scope boundaries.
- Preserve separation among source records, AI analysis, review findings, draft artifacts, evidence, approvals, and executed external actions.
- Support management-level visibility for accounting and tax work status, ownership, blockers, risks, required approvals, and next actions.
- Enforce identity, permission, task scope, environment, tool risk, approval, stale/mismatch, and source-of-truth boundaries.
- Keep all filing, payment, submission, and production mutation paths default-deny and human-authority gated.
- Add only minimum MAOS-owned references and governance metadata required by frozen architecture.
- Add minimum API and Control Room visibility required for governed ERP/accounting/tax coordination.
- Preserve isolation from CRM, AI-MLS, Marketing, RBS, and Admin integrations.

## Explicit non-goals

- No replacement, relocation, or takeover of ERP, its repository, infrastructure, database, or source-of-truth ownership.
- No duplicate ERP accounting or tax master-data store in MAOS.
- No real filing, payment, submission, bank transaction, tax authority action, or production mutation.
- No production deployment, rollback, infrastructure change, or credential configuration.
- No AI self-approval, autonomous final accounting decision, or autonomous final tax decision.
- No unrestricted ERP, filesystem, database, provider, shell, or credential access.
- No production-readiness or production-deployment approval status change.
- No frozen architecture change.
- No Phase 9 or later implementation.

## Implementation discipline

- Inspect Git status and create/use a short-lived `codex/` Phase 8 branch before implementation.
- Reuse existing Control Plane registry, identity, permission, approval, task/workflow, agent-team, observability, audit, release, and integration boundaries.
- Treat unknown identity, ownership, scope, source, environment, authority, approval, evidence, version, or health as denial or explicit degraded state.
- Keep secrets as external references and redact security-sensitive values from logs, events, evidence, audit, and UI.
- Keep analysis and drafts explicitly distinguishable from reviewed, human-approved, and externally executed outcomes.
- Keep simulated and preview evidence explicitly separate from real external or production evidence.
- Stop with `CHANGE_REQUEST_REQUIRED` if implementation requires ERP ownership transfer, duplicate source-of-truth storage, human-authority bypass, real external mutation, or frozen semantic change.

## Verification

- format
- lint
- typecheck
- tests
- build
- ERP registration and source-of-truth boundary tests
- Accounting/Tax AI Team role and separation tests
- analysis, review, and draft lifecycle tests
- human-authority and default-deny tests
- filing, payment, submission, and production-mutation rejection tests
- stale, mismatch, consumed, and approval-validity tests
- system/environment/repository/workroot isolation tests
- API and Control Room contract tests
- timeout, cancellation, unavailable-source, and failure tests
- event, evidence, audit, provenance, and correlation tests
- clean database initialization and migration replay when persistence changes
- architecture/module-boundary checks
- secret/artifact scan
- `git diff --check`
- `git status --short`

## Allowed recommendation

- `PASS_PHASE_8`
- `REVISE_PHASE_8`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 8 result report. Do not begin Phase 9 automatically.
