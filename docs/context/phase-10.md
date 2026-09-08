# Phase 10 Context Manifest — Enterprise Cross-System Orchestration

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`
5. `skills/maos-test-evidence/SKILL.md`
6. `skills/maos-architecture-check/SKILL.md`

## Goal

Establish the minimum governed enterprise cross-system orchestration foundation that coordinates independent systems and AI teams without transferring source-of-truth ownership or weakening human authority, permission, approval, evidence, audit, privacy, or production boundaries.

## Architecture Baseline

- Frozen MAOS Architecture v1.0 remains authoritative.
- MAOS coordinates independent systems and AI teams; it does not absorb their domain ownership or operational source of truth.
- CRM, RBS/Admin, Marketing, AI-MLS, ERP/HR, AI Memory Gateway, and other connected systems remain independently governed.
- Every cross-system operation requires explicit project, task, actor, source, target, purpose, environment, permission, authority, risk, and evidence scope.
- Human Authority remains above AI Authority.
- No production action is permitted without explicit, current, exact-bound human approval and separately approved production readiness.
- `PRODUCTION_READY` and `PRODUCTION_DEPLOYMENT_APPROVED` remain `NO`; production gaps remain separately tracked.
- MAOS-018 and MAOS-019 remain candidate guidance and cannot override frozen v1.0.

## Required Architecture Documents

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

## Conditional Architecture Documents

Read only when a concrete dependency, conflict, or missing decision requires it:

- `docs/architecture/MAOS-003-database-architecture.md`
- `docs/architecture/MAOS-006-memory-architecture.md`
- `docs/architecture/MAOS-007-skill-architecture.md`
- `docs/architecture/MAOS-011-ui-architecture.md`
- `docs/architecture/MAOS-017-deployment-architecture.md`
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md`
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md`

## Phase 10 Scope

- Define cross-system orchestration requests, plans, steps, dependencies, ownership, state, results, evidence, and audit references.
- Coordinate existing domain-system and AI-team capabilities through registered contracts rather than direct source-of-truth access.
- Preserve task, run, agent, model, runner, skill, tool, approval, artifact, evidence, and audit separation.
- Enforce source and target system identity, project/task scope, purpose, environment, permission, risk, authority, approval, data classification, provenance, and freshness boundaries.
- Default deny unknown, stale, mismatched, unavailable, unverified, unauthorized, or cross-scope operations.
- Support bounded orchestration pause, resume, cancellation, timeout, failure, compensation preparation, and human escalation foundations where frozen architecture permits.
- Preserve structured cross-system events, evidence continuity, actor/action/target/result audit proof, and privacy-safe management visibility.
- Add only the minimum API, persistence, and Control Room foundations required for Phase 10 orchestration.

## Explicit Non-goals

- No transfer or duplication of domain-system source-of-truth ownership.
- No unrestricted cross-system read or write access.
- No autonomous human-authority, legal, HR, financial, customer, publishing, regulatory, or deployment decision.
- No real production mutation, deployment, rollback, filing, submission, signing, payment, publication, or external representation.
- No production credential configuration or production-readiness status change.
- No private employee, customer, privileged, legal, payroll, medical, or disciplinary content in management projections, logs, events, evidence, or prompts without explicit policy and authority.
- No frozen architecture change.
- No Phase 11 or later implementation.

## Verification

- format
- lint
- typecheck
- tests
- build
- cross-system registration, scope, planning, dependency, lifecycle, failure, timeout, cancellation, and escalation tests
- source-of-truth ownership and cross-scope rejection tests
- permission, risk, authority, approval, stale/mismatch, and default-deny tests
- privacy, confidentiality, provenance, evidence, audit, and correlation-continuity tests
- API and Control Room contract tests where implemented
- clean database initialization and migration replay when persistence changes
- architecture/module-boundary checks
- secret/artifact scan
- `git diff --check`
- `git status --short`

## Allowed Recommendation

- `PASS_PHASE_10`
- `REVISE_PHASE_10`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 10 result report. Do not begin Phase 11 automatically.
