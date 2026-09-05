# Phase 9A Context Manifest — PH Legal / Regulatory AI Team Integration

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`
5. `skills/maos-test-evidence/SKILL.md`
6. `skills/maos-architecture-check/SKILL.md`

## Goal

Establish a governed PH Legal / Regulatory AI Team integration for current-source research, drafting, independent review, risk identification, and compliance support while preserving final legal authority for a human lawyer or authorized professional.

## Architecture Baseline

- Frozen MAOS Architecture v1.0 remains authoritative.
- MAOS coordinates, monitors, and governs work; it does not become the operational source of truth for external or domain-system records.
- ERP/HR, CRM, RBS/Admin, AI-MLS, Marketing, and other domain systems remain independent sources of truth for their own domains.
- The PH Legal / Regulatory AI Team supports research, drafting, review, risk identification, and compliance work only.
- AI output is not an authoritative legal conclusion, legal advice, professional representation, approval, or permission to act.
- A human lawyer or authorized professional retains final legal authority.
- Current official Philippine regulatory sources must be verified at execution time whenever the result depends on current law, regulation, filing rules, deadlines, or official guidance.
- No external legal or regulatory filing, submission, signing, payment, or representation is permitted in Phase 9A.
- Production deployment remains `NOT APPROVED`; production gaps remain separately tracked.
- MAOS-018 and MAOS-019 remain candidate guidance and cannot override frozen v1.0.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md`
- `docs/architecture/MAOS-001-system-architecture.md`
- `docs/architecture/MAOS-002-domain-model.md`
- `docs/architecture/MAOS-004-agent-architecture.md`
- `docs/architecture/MAOS-005-task-workflow-architecture.md`
- `docs/architecture/MAOS-006-memory-architecture.md`
- `docs/architecture/MAOS-007-skill-architecture.md`
- `docs/architecture/MAOS-008-tool-mcp-architecture.md`
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
- `docs/architecture/MAOS-011-ui-architecture.md`
- `docs/architecture/MAOS-017-deployment-architecture.md`
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md`
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md`

## Phase 9A Scope

- Register the PH Legal / Regulatory AI Team with explicit research, drafting, review, risk-identification, and compliance-support capabilities.
- Establish governed legal/regulatory work requests, jurisdiction, purpose, matter references, source references, findings, drafts, review results, risks, deadlines, blockers, evidence, provenance, and freshness contracts.
- Require current official Philippine source verification at execution time where the work depends on current regulatory information.
- Preserve a clear distinction among source material, AI analysis, AI draft, independent review, human legal review, human approval, and external action.
- Provide privacy-safe, privilege-aware, purpose-scoped management visibility for status, owner, deadlines, blockers, risk, required human review, approval, and next action.
- Enforce identity, matter, project, purpose, jurisdiction, environment, permission, authority, approval, source freshness, provenance, confidentiality, and source-of-truth boundaries.
- Add only the minimum MAOS-owned governance metadata and references required by frozen architecture.
- Add only the minimum API and Control Room visibility required for governed legal/regulatory coordination.
- Keep ERP/HR, CRM, RBS/Admin, AI-MLS, Marketing, and other integrations independently governed.

## Explicit Non-goals

- No autonomous authoritative legal conclusion, legal advice, legal opinion, or final compliance determination.
- No replacement of a human lawyer, authorized professional, regulator, court, government portal, or domain system.
- No external filing, submission, signing, payment, representation, communication, or government-system mutation.
- No duplicate legal matter, customer, employee, listing, contract, financial, or other domain master-data store in MAOS.
- No disclosure of privileged, confidential, private employee, customer, or case content outside explicit policy and authority.
- No unrestricted browser, tool, MCP, filesystem, database, shell, provider, or credential access.
- No production deployment, production mutation, rollback, infrastructure change, or credential configuration.
- No production-readiness or production-deployment approval status change.
- No frozen architecture change.
- No Phase 10 or later implementation.

## Implementation Discipline

- Inspect Git status and create/use a short-lived `codex/` Phase 9A task branch before implementation.
- Reuse existing identity, permission, approval, task/workflow, agent-team, tool/MCP, knowledge, observability, audit, and integration boundaries.
- Treat unknown identity, matter, purpose, jurisdiction, source, freshness, provenance, confidentiality, environment, authority, approval, evidence, version, ownership, or health as denial or explicit degraded state.
- Verify current official Philippine sources during execution where applicable; do not rely on stale model knowledge as legal authority.
- Keep secrets and credentials as external references and redact privileged, confidential, private, and security-sensitive content from logs, events, evidence, audit, and management UI.
- Keep AI analysis and drafts visibly distinct from independent review, human legal review, human approval, and externally executed outcomes.
- Stop with `CHANGE_REQUEST_REQUIRED` if implementation requires source-of-truth transfer, privileged/private-data exposure, human-authority bypass, external legal/regulatory action, production mutation, or frozen semantic change.

## Verification

- format
- lint
- typecheck
- tests
- build
- Legal / Regulatory AI Team registration, role, assignment, capability, and separation tests
- official-source verification, provenance, jurisdiction, and freshness tests
- legal/regulatory research, analysis, drafting, review, risk, deadline, blocker, and evidence tests
- human lawyer / authorized-professional review and approval boundary tests
- autonomous legal-authority rejection tests
- external filing, submission, signing, payment, representation, and production-mutation rejection tests
- confidentiality, privilege, privacy, purpose-scope, default-deny, and cross-scope tests
- stale, mismatched, consumed, revoked, and invalid approval tests
- timeout, cancellation, unavailable-source, and failure tests
- API and Control Room contract tests
- event, evidence, audit, provenance, and correlation tests
- clean database initialization and migration replay when persistence changes
- architecture/module-boundary checks
- secret/artifact scan
- `git diff --check`
- `git status --short`

## Allowed Recommendation

- `PASS_PHASE_9A`
- `REVISE_PHASE_9A`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 9A result report. Do not begin Phase 10 automatically.
