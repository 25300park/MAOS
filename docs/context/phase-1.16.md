# Phase 1.16 Context Manifest — Preview / UI Inspector / Test / QA

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`
5. `skills/maos-ui-review/SKILL.md`

## Goal

Establish the minimum governed Preview, UI Inspector, Functional Test, UX QA, Visual QA, scenario, regression, and evidence-driven fix-loop foundation required to verify MAOS user workflows without weakening approval or production boundaries.

## Architecture Baseline

- MAOS Architecture v1.0 is frozen and authoritative.
- Review != Approval; QA PASS != Production Approval; Human Authority > AI Authority.
- Task != Run; Agent != Model != Runner; Evidence records results but does not grant authority.
- Phase 1.16 extends existing Control Room, Development Workspace, Agent Team, Development Loop, evidence, audit, permission, and local-runner foundations rather than duplicating them.
- MAOS-019 remains candidate guidance only.
- If implementation requires a frozen-architecture change or authority expansion, stop and report `CHANGE_REQUEST_REQUIRED`.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md` — MAOS-000 Project Constitution
- `docs/architecture/MAOS-001-system-architecture.md` — MAOS-001 System Architecture
- `docs/architecture/MAOS-004-agent-architecture.md` — MAOS-004 Agent Architecture
- `docs/architecture/MAOS-005-task-workflow-architecture.md` — MAOS-005 Task & Workflow Architecture
- `docs/architecture/MAOS-009-approval-architecture.md` — MAOS-009 Approval Architecture
- `docs/architecture/MAOS-010-api-architecture.md` — MAOS-010 API Architecture
- `docs/architecture/MAOS-011-ui-architecture.md` — MAOS-011 UI Architecture
- `docs/architecture/MAOS-012-security-architecture.md` — MAOS-012 Security Architecture
- `docs/architecture/MAOS-013-observability-architecture.md` — MAOS-013 Observability Architecture
- `docs/architecture/MAOS-015-development-standards.md` — MAOS-015 Development Standards
- `docs/architecture/MAOS-016-test-strategy.md` — MAOS-016 Test Strategy

## Conditional Architecture Documents

Read only if a concrete dependency or conflict requires it:

- `docs/architecture/MAOS-002-domain-model.md` — MAOS-002 Domain Model
- `docs/architecture/MAOS-003-database-architecture.md` — MAOS-003 Database Architecture
- `docs/architecture/MAOS-007-skill-architecture.md` — MAOS-007 Skill Architecture
- `docs/architecture/MAOS-008-tool-mcp-architecture.md` — MAOS-008 Tool & MCP Architecture
- `docs/architecture/MAOS-014-operations-architecture.md` — MAOS-014 Operations Architecture
- `docs/architecture/MAOS-017-deployment-architecture.md` — MAOS-017 Deployment Architecture
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md` — candidate guidance only

## Implementation Scope

- Preview workspace foundation for task-scoped UI verification.
- UI Inspector foundations for visible element, DOM, route, and source-location context where supported safely.
- Functional Test Agent execution across authorized feature, API, UI, navigation, and failure flows.
- UX QA from CEO/operator, Development Lead, and Reviewer/QA personas.
- Visual QA for layout, alignment, overflow, responsiveness, readability, accessibility direction, and regression.
- End-to-end workflow scenarios with explicit goal, prerequisites, actions, expected outcome, actual result, and evidence.
- Loading, empty, error, blocked, approval-required, and permission-denied state verification.
- Screenshot and before/after evidence references without embedding secrets or ungoverned local data.
- A canonical governed fix loop: Test Agent → Issue → Evidence → Fix Task → Developer → Fix → Targeted Test → Regression → UX Re-test → PASS or REVISE.
- UX issue contracts containing scope, persona, route, element, reproduction, expected and actual behavior, severity, evidence, owner, and next action.
- Regression execution after fixes and traceable linkage to task, run, artifact, evidence, and audit records.
- Minimum API, service, and Development Workspace visibility required for Preview / Inspector / Test / QA.
- Permission-aware controls, task-scope binding, runner/tool boundaries, timeout, cancellation, and default-deny behavior.

## Explicit Non-Goals

- No production deployment or production action.
- No QA self-approval or bypass of human approval.
- No unrestricted browser, shell, filesystem, runner, tool, or external-system access.
- No CRM, Marketing, ERP, AI-MLS, RBS/PBN, or other domain-system integration.
- No replacement of the Control Room with a human employee daily-work UI.
- No uncontrolled autonomous testing or self-improvement loop.
- No speculative later-phase implementation.

## Verification

Verification must execute against the actual Phase 1.16 implementation. Run and report:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Functional feature, API, UI, navigation, and failure-flow tests.
- UX persona and next-action clarity tests.
- Visual layout, alignment, overflow, responsive, and readability checks.
- Loading, empty, error, blocked, approval-required, and permission-denied state tests.
- Scenario and regression tests.
- Evidence-driven issue/fix-loop tests.
- Test Agent, UX QA, developer, reviewer, and human-approval separation tests.
- Screenshot, DOM/source-link, before/after, artifact, and evidence contract tests where supported.
- Accessibility checks.
- Permission, task-scope, runner/tool, timeout, cancellation, and default-deny tests.
- Architecture/module boundary checks.
- Secret and artifact scan covering source, configuration, fixtures, and staged changes.
- `git diff --check`
- `git status --short`

`SKIPPED`, `BLOCKED`, `NOT_RUN`, inferred success, or unreviewed evidence are not PASS.

## Final Recommendation

Allowed:

- `PASS_PHASE_1_16`
- `REVISE_PHASE_1_16`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 1.16 result report. Do not start a later phase automatically.
