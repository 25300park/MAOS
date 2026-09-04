# Phase 7 Context Manifest — RBS / Admin Integration

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`
5. `skills/maos-test-evidence/SKILL.md`
6. `skills/maos-architecture-check/SKILL.md`

## Goal

Integrate RBS and Admin as separate independently owned systems that MAOS can monitor and coordinate through governed contracts while preserving existing AWS infrastructure, domain source-of-truth ownership, and explicit human approval for every production mutation.

## Architecture baseline

- Frozen MAOS Architecture v1.0 remains authoritative.
- RBS is the external consumer real-estate platform.
- Admin is the separate RBS administration system.
- RBS and Admin remain separate domain systems, repositories, runtimes, and sources of truth.
- Existing AWS infrastructure remains independently owned and is not relocated into MAOS.
- MAOS integrates, monitors, and coordinates; it does not absorb RBS/Admin master data or infrastructure ownership.
- Production mutation requires exact, valid human approval and production deployment remains `NOT APPROVED`.
- CRM, AI-MLS, and Marketing remain separate governed systems with their own ownership and integration contracts.
- MAOS-018 and MAOS-019 remain candidate guidance and cannot override frozen v1.0.

## Required architecture documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md`
- `docs/architecture/MAOS-001-system-architecture.md`
- `docs/architecture/MAOS-002-domain-model.md`
- `docs/architecture/MAOS-005-task-workflow-architecture.md`
- `docs/architecture/MAOS-009-approval-architecture.md`
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
- `docs/architecture/MAOS-007-skill-architecture.md`
- `docs/architecture/MAOS-008-tool-mcp-architecture.md`
- `docs/architecture/MAOS-017-deployment-architecture.md`
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md`
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md`

## Phase 7 scope

- Register and represent RBS and Admin as distinct independently owned domain applications.
- Preserve separate system identities, repositories, workroots, environments, versions, owners, health, capabilities, and integration maturity.
- Reuse and harden the existing RBS/Admin read-only pilot foundation rather than creating a parallel integration engine.
- Define governed resource references, requests, results, evidence, correlation, health, and failure contracts without copying domain master data.
- Provide management-level visibility for availability, deployment readiness, operational risk, incidents, integration failures, and next actions.
- Preserve deep links to the owning RBS/Admin systems where authorized.
- Enforce identity, permission, task scope, environment, tool risk, approval, stale/mismatch, and source-of-truth boundaries before any controlled action.
- Keep production mutation unavailable unless exact human approval and all frozen governance requirements are satisfied.
- Add only the minimum MAOS-owned reference and governance persistence required by frozen architecture.
- Add minimum API and Control Room visibility required for governed RBS/Admin monitoring and coordination.
- Preserve CRM, AI-MLS, and Marketing integration isolation and prevent accidental cross-system mutation.

## Explicit non-goals

- No relocation, replacement, or takeover of RBS, Admin, their repositories, their domain databases, or existing AWS infrastructure.
- No duplicate RBS/Admin master-data store in MAOS.
- No production mutation, deployment, rollback, infrastructure change, DNS/network/TLS change, or credential configuration.
- No production-readiness or production-deployment approval status change.
- No public AI-MLS exposure or ungoverned CRM/Marketing coupling.
- No unrestricted AWS, shell, filesystem, database, provider, or credential access.
- No frozen architecture change.
- No Phase 8 or later implementation.

## Implementation discipline

- Inspect Git status and create/use a short-lived `codex/` Phase 7 branch before implementation.
- Reuse existing Control Plane registry, RBS/Admin pilot, identity, permission, approval, task/workflow, observability, audit, release, and integration boundaries.
- Treat unknown identity, ownership, scope, source, environment, health, authority, approval, evidence, or version as denial or explicit degraded state.
- Keep secrets as external references and redact security-sensitive values from logs, events, evidence, audit, and UI.
- Keep simulated or preview evidence explicitly separate from real production evidence.
- Stop with `CHANGE_REQUEST_REQUIRED` if implementation requires ownership transfer, infrastructure relocation, production mutation, bypassing human approval, or frozen semantic change.

## Verification

- format
- lint
- typecheck
- tests
- build
- RBS and Admin registration/separation tests
- source-of-truth and AWS ownership-boundary tests
- read-only observation and health tests
- system/environment/repository/workroot isolation tests
- permission/default-deny and cross-system isolation tests
- approval, stale, mismatch, and production-mutation rejection tests
- API and Control Room contract tests
- timeout, cancellation, unavailable-source, and failure tests
- event, evidence, audit, and correlation tests
- clean database initialization and migration replay when persistence changes
- architecture/module-boundary checks
- secret/artifact scan
- `git diff --check`
- `git status --short`

## Allowed recommendation

- `PASS_PHASE_7`
- `REVISE_PHASE_7`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 7 result report. Do not begin Phase 8 automatically.
