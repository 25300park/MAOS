# Phase 2 Context Manifest — MAOS Core Control Plane MVP

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`
5. `skills/maos-test-evidence/SKILL.md`
6. `skills/maos-architecture-check/SKILL.md`

## Goal

Generalize and harden the Phase 1 vertical-slice foundations into the reusable MAOS Core Control Plane without changing existing domain-system ownership or production approval status.

## Architecture baseline

- Frozen MAOS Architecture v1.0 remains authoritative.
- No frozen architecture document may be changed silently; a concrete incompatibility requires an explicit Change Request.
- Preserve Human Authority > AI Authority, Agent != Model != Runner, Task != Run, Review != Approval, QA PASS != Production Approval, Skill != Tool Permission, default deny, least privilege, separation of duties, exact target binding, evidence, and audit semantics.
- Domain systems remain independent sources of truth. Generalization must not move CRM, Marketing, AI-MLS, ERP, RBS, or other domain ownership into MAOS.
- MAOS-018 and MAOS-019 remain candidate guidance unless separately approved and frozen.

## Required architecture documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md` — MAOS-000 Project Constitution
- `docs/architecture/MAOS-001-system-architecture.md` — MAOS-001 System Architecture
- `docs/architecture/MAOS-002-domain-model.md` — MAOS-002 Domain Model
- `docs/architecture/MAOS-004-agent-architecture.md` — MAOS-004 Agent Architecture
- `docs/architecture/MAOS-005-task-workflow-architecture.md` — MAOS-005 Task & Workflow Architecture
- `docs/architecture/MAOS-007-skill-architecture.md` — MAOS-007 Skill Architecture
- `docs/architecture/MAOS-008-tool-mcp-architecture.md` — MAOS-008 Tool & MCP Architecture
- `docs/architecture/MAOS-009-approval-architecture.md` — MAOS-009 Approval Architecture
- `docs/architecture/MAOS-010-api-architecture.md` — MAOS-010 API Architecture
- `docs/architecture/MAOS-012-security-architecture.md` — MAOS-012 Security Architecture
- `docs/architecture/MAOS-013-observability-architecture.md` — MAOS-013 Observability Architecture
- `docs/architecture/MAOS-014-operations-architecture.md` — MAOS-014 Operations Architecture
- `docs/architecture/MAOS-015-development-standards.md` — MAOS-015 Development Standards
- `docs/architecture/MAOS-016-test-strategy.md` — MAOS-016 Test Strategy

## Conditional architecture documents

Read only when a concrete dependency, conflict, or missing decision requires it:

- `docs/architecture/MAOS-003-database-architecture.md`
- `docs/architecture/MAOS-006-memory-architecture.md`
- `docs/architecture/MAOS-017-deployment-architecture.md`
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md`
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md`

Candidate documents may inform a bounded design review but must not override or silently amend frozen v1.0.

## Phase 2 scope

- Reusable Control Plane services derived from the accepted Phase 1 foundations.
- Generalized registry and runtime foundations without collapsing canonical domain boundaries.
- Cross-project, task, agent, and run orchestration with explicit scope and ownership.
- Generalized system, environment, repository, and runner registries.
- Reusable identity, permission, authority, approval, risk, evidence, and audit enforcement.
- Reusable bounded loop/runtime foundations only where frozen architecture permits them.
- Control Room generalization for governed cross-project and runtime visibility.
- Tests and migration/API changes strictly required by these reusable foundations.
- Production gaps remain separately tracked; Phase 2 must not represent them as solved or grant production authority.

## Explicit non-goals

- No real production deployment.
- No production-readiness or deployment-approval status change.
- No CRM integration.
- No Marketing integration.
- No AI-MLS integration.
- No ERP integration.
- No RBS production mutation.
- No transfer of domain-system source-of-truth ownership into MAOS.
- No frozen architecture change or automatic freeze of MAOS-018/019.
- No Phase 3 or later implementation.

## Implementation discipline

- Inspect Git status and create/use a short-lived `codex/` Phase 2 task branch before implementation.
- Reuse Phase 1 modules and contracts; do not create duplicate orchestration, approval, audit, tool, or registry systems.
- Expand conditional architecture context only for a named dependency or conflict.
- Keep configuration and secret values separate and fail closed at every governance boundary.
- Stop with `CHANGE_REQUEST_REQUIRED` if generalization cannot remain compatible with frozen v1.0.

## Verification

The implementation phase must define and execute evidence appropriate to its final work breakdown, including at minimum:

- format, lint, typecheck, full tests, and build;
- cross-project/task/agent/run scope and isolation tests;
- registry uniqueness, lifecycle, health, and boundary tests;
- reusable governance, default-deny, approval, evidence, and audit tests;
- API and Control Room contract tests for generalized foundations;
- clean database initialization and migration replay when persistence changes;
- architecture/module-boundary checks;
- secret/artifact scan, `git diff --check`, and `git status --short`.

No PASS may be inferred from static reasoning or Phase 1 evidence alone.

## Allowed recommendation

- `PASS_PHASE_2`
- `REVISE_PHASE_2`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 2 result report. Do not begin Phase 3 automatically.
