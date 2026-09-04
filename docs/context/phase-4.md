# Phase 4 Context Manifest — Marketing Automation Integration

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`
5. `skills/maos-test-evidence/SKILL.md`
6. `skills/maos-architecture-check/SKILL.md`

## Goal

Integrate Marketing Automation as an independently owned 10-agent AI team/system that MAOS can monitor, coordinate, and collaborate with without micromanaging its internal marketing workflow or permitting unapproved production publishing.

## Architecture baseline

- Frozen MAOS Architecture v1.0 remains authoritative.
- Marketing Automation remains a separate domain system, repository, source of truth, and internally managed 10-agent AI team.
- MAOS is the enterprise work and AI control plane. It governs cross-system scope, identity, permission, approval, evidence, audit, and coordination contracts.
- MAOS may observe Marketing Automation status, coordinate agreed outcomes, and collaborate through explicit capability contracts. It must not replace or micromanage Marketing Automation's internal workflow, agent routing, content process, or domain data.
- Production publishing is an external action and requires explicit human approval, exact target/version/hash binding, current authority, and execution-time revalidation.
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

## Phase 4 scope

- Register Marketing Automation as an independently owned external/domain system in the reusable Control Plane registry.
- Represent its 10-agent team, roles, capabilities, availability, and ownership through external references without copying or replacing its internal agent runtime.
- Define governed system, project, task, campaign, request, result, artifact, evidence, health, and correlation contracts needed for MAOS collaboration.
- Provide capability discovery and explicit integration maturity/health foundations without assuming unsupported write access.
- Support task-scoped coordination and handoff between MAOS work and Marketing Automation outcomes while preserving Task != Run and external source-of-truth ownership.
- Observe allowlisted operational status, blockers, next actions, evidence, and failure/degraded state without importing unnecessary domain data.
- Enforce identity, least privilege, default deny, Tool Permission, Tool Risk, approval, task scope, timeout, cancellation, and idempotency at the integration boundary.
- Enforce explicit human approval and exact target/version/hash validation before any production publishing-capable transition.
- Preserve structured events, evidence, audit proof, request/correlation continuity, redaction, and health/readiness visibility.
- Add minimum API and Control Room visibility required for governed monitoring, coordination, and collaboration.
- Add MAOS-owned reference/governance persistence only where frozen architecture requires it.
- Test team/system independence, scope isolation, capability boundaries, monitored status, coordination/handoff, denial, approval gating, failure, and provenance.

## Explicit non-goals

- No takeover of Marketing Automation ownership, repository, source of truth, or internal 10-agent runtime.
- No MAOS micromanagement or replacement of internal marketing workflow, planning, agent assignment, model routing, content generation, or campaign logic.
- No duplicate marketing domain database, campaign master data, content repository, queue, or approval engine inside MAOS.
- No unrestricted Marketing Automation command, tool, filesystem, provider, or publishing access.
- No real production publishing, posting, campaign activation, budget mutation, credential configuration, or external side effect.
- No production deployment or production-readiness status change.
- No CRM, AI-MLS, ERP, RBS, or other new domain-system integration.
- No frozen architecture change.
- No Phase 5 or later implementation.

## Implementation discipline

- Inspect Git status and create/use a short-lived `codex/` Phase 4 branch before implementation.
- Reuse Phase 2 Control Plane registries and existing identity, approval, Tool/MCP, observability, audit, and integration boundaries.
- Begin with read-only/observable capabilities; add no write capability without an explicit frozen-architecture basis and phase authorization.
- Keep secrets as external references and redact security-sensitive request, result, event, evidence, and audit fields.
- Treat unknown identity, capability, scope, ownership, health, provenance, or authority as denial or explicit degraded state.
- Stop with `CHANGE_REQUEST_REQUIRED` if implementation requires ownership transfer, internal workflow takeover, frozen semantic change, or unapproved production publishing.

## Verification

- format
- lint
- typecheck
- tests
- build
- Marketing Automation system/team registration tests
- independent ownership and source-of-truth tests
- 10-agent reference/capability contract tests
- monitoring and health/readiness tests
- task/campaign scope-isolation tests
- coordination and handoff tests
- permission/default-deny and Tool Risk tests
- production-publishing approval and stale/mismatch rejection tests
- timeout/cancellation/idempotency and degraded-mode tests
- provenance, event, evidence, audit, and correlation tests
- API and Control Room contract tests
- clean database initialization and migration replay when persistence changes
- architecture/module-boundary checks
- secret/artifact scan
- `git diff --check`
- `git status --short`

## Allowed recommendation

- `PASS_PHASE_4`
- `REVISE_PHASE_4`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 4 result report. Do not begin Phase 5 automatically.
