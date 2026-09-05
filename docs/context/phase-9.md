# Phase 9 Context Manifest — HR / Labor Integration

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`
5. `skills/maos-test-evidence/SKILL.md`
6. `skills/maos-architecture-check/SKILL.md`

## Goal

Integrate the independently owned ERP/HR system with governed HR and labor-compliance analysis, review, and drafting support while preserving employee privacy, operational source-of-truth ownership, and final authority for human HR or authorized management.

## Architecture Baseline

- Frozen MAOS Architecture v1.0 remains authoritative.
- The ERP/HR system remains an independent domain system and the operational source of truth for HR, employment, payroll, statutory, and labor records.
- MAOS integrates, monitors, coordinates, and governs work through scoped references; it does not absorb ERP/HR master data or operational ownership.
- The Labor Compliance Agent provides analysis, review, and drafting support only.
- Human HR or authorized management retains final authority for HR, labor, statutory, and employee decisions.
- Employee private data remains protected by identity, purpose, scope, and privacy boundaries.
- No real DOLE, SSS, PhilHealth, Pag-IBIG, or other government/statutory submission is permitted in Phase 9.
- Production deployment remains `NOT APPROVED`; production gaps remain separately tracked.
- Phase 9A is not authorized by this manifest.
- MAOS-018 and MAOS-019 remain candidate guidance and cannot override frozen v1.0.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md`
- `docs/architecture/MAOS-001-system-architecture.md`
- `docs/architecture/MAOS-002-domain-model.md`
- `docs/architecture/MAOS-004-agent-architecture.md`
- `docs/architecture/MAOS-005-task-workflow-architecture.md`
- `docs/architecture/MAOS-009-approval-architecture.md`
- `docs/architecture/MAOS-010-api-architecture.md`
- `docs/architecture/MAOS-012-security-architecture.md`
- `docs/architecture/MAOS-013-observability-architecture.md`
- `docs/architecture/MAOS-014-operations-architecture.md`
- `docs/architecture/MAOS-015-development-standards.md`
- `docs/architecture/MAOS-016-test-strategy.md`

## Conditional Architecture Documents

Read only when a concrete dependency, conflict, or missing decision requires it:

- `docs/architecture/MAOS-003-database-architecture.md`
- `docs/architecture/MAOS-006-memory-architecture.md`
- `docs/architecture/MAOS-007-skill-architecture.md`
- `docs/architecture/MAOS-008-tool-mcp-architecture.md`
- `docs/architecture/MAOS-011-ui-architecture.md`
- `docs/architecture/MAOS-017-deployment-architecture.md`
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md`
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md`

## Phase 9 Scope

- Register and represent the ERP/HR system as an independently owned operational source of truth.
- Establish governed HR/labor integration requests, references, results, provenance, evidence, health, and failure contracts without copying employee master records into MAOS.
- Establish the Labor Compliance Agent foundation for scoped analysis, review, and drafting support with explicit capability and assignment boundaries.
- Represent HR/labor work through references for obligations, deadlines, supporting documents, findings, drafts, blockers, risk, responsible humans, review, and approval state.
- Preserve separation among source records, AI analysis, review findings, draft artifacts, evidence, approval, and any external action.
- Provide privacy-safe management visibility for status, ownership, blockers, deadlines, risks, required approvals, and next actions.
- Enforce identity, employee/purpose scope, environment, permission, authority, approval, freshness, provenance, and source-of-truth boundaries.
- Add only minimum MAOS-owned governance metadata and references required by frozen architecture.
- Add minimum API and Control Room visibility required for governed HR/labor coordination.
- Keep ERP/Accounting/Tax, CRM, AI-MLS, Marketing, RBS, and Admin integrations independently governed.

## Explicit Non-goals

- No replacement, relocation, or takeover of the ERP/HR system, repository, infrastructure, database, or source-of-truth ownership.
- No duplicate employee, payroll, benefits, attendance, statutory, disciplinary, or other private HR master-data store in MAOS.
- No real DOLE, SSS, PhilHealth, Pag-IBIG, tax, payroll, bank, government, or statutory submission.
- No autonomous hiring, termination, compensation, disciplinary, legal, or employee-impacting final decision.
- No AI self-approval or bypass of human HR/authorized management authority.
- No unrestricted ERP/HR, filesystem, database, provider, shell, or credential access.
- No production deployment, production mutation, rollback, infrastructure change, or credential configuration.
- No production-readiness or production-deployment approval status change.
- No frozen architecture change.
- No Phase 9A or later implementation.

## Implementation Discipline

- Inspect Git status and create/use a short-lived `codex/` Phase 9 task branch before implementation.
- Reuse existing Control Plane, identity, permission, approval, task/workflow, agent-team, observability, audit, and integration boundaries.
- Treat unknown identity, employee/purpose scope, ownership, source, environment, authority, approval, evidence, version, consent, privacy classification, or health as denial or explicit degraded state.
- Keep secrets as external references and redact credentials, employee-private content, and security-sensitive values from logs, events, evidence, audit, and management UI.
- Keep AI analysis and drafts explicitly distinguishable from human-reviewed, human-approved, and externally executed outcomes.
- Keep simulation and preview evidence explicitly separate from real external or production evidence.
- Stop with `CHANGE_REQUEST_REQUIRED` if implementation requires source-of-truth transfer, duplicate private HR storage, human-authority bypass, real external submission, production mutation, or frozen semantic change.

## Verification

- format
- lint
- typecheck
- tests
- build
- ERP/HR registration and source-of-truth boundary tests
- Labor Compliance Agent role, assignment, capability, and separation tests
- employee privacy, purpose-scope, and management-projection tests
- HR/labor obligation, deadline, blocker, and risk tests
- analysis, review, drafting, evidence, and human-authority lifecycle tests
- default-deny and cross-scope rejection tests
- DOLE, SSS, PhilHealth, Pag-IBIG, and production-mutation rejection tests
- stale, mismatch, consumed, and approval-validity tests
- timeout, cancellation, unavailable-source, and failure tests
- API and Control Room contract tests
- event, evidence, audit, provenance, and correlation tests
- clean database initialization and migration replay when persistence changes
- architecture/module-boundary checks
- secret/artifact scan
- `git diff --check`
- `git status --short`

## Allowed Recommendation

- `PASS_PHASE_9`
- `REVISE_PHASE_9`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 9 result report. Do not begin Phase 9A automatically.
