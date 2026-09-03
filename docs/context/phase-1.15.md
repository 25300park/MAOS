# Phase 1.15 Context Manifest — System Development Agent Team

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`

## Goal

Establish the minimum executable System Development Agent Team foundation required by frozen architecture while preserving specialized roles, human authority, and existing task, workflow, tool, runner, evidence, and audit boundaries.

## Architecture Baseline

- MAOS Architecture v1.0 is frozen and remains authoritative.
- Do not modify frozen architecture during Phase 1.15.
- Agent = WHO, Task = WHAT, Skill = HOW, Model = HOW IT REASONS, Runner = WHERE IT EXECUTES, and Approval = MAY.
- Agent != Model != Runner; Skill != Tool Permission; Review != Approval; QA PASS != Production Approval.
- The team is a governed composition of specialized single-responsibility agents, not one mega-agent and not an autonomous development loop.
- Human authority remains above all AI roles, recommendations, reviews, and execution attempts.
- If implementation requires a frozen-architecture change, stop and report `CHANGE_REQUEST_REQUIRED`.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md` — MAOS-000 Project Constitution
- `docs/architecture/MAOS-001-system-architecture.md` — MAOS-001 System Architecture
- `docs/architecture/MAOS-004-agent-architecture.md` — MAOS-004 Agent Architecture
- `docs/architecture/MAOS-005-task-workflow-architecture.md` — MAOS-005 Task & Workflow Architecture
- `docs/architecture/MAOS-007-skill-architecture.md` — MAOS-007 Skill Architecture
- `docs/architecture/MAOS-008-tool-mcp-architecture.md` — MAOS-008 Tool & MCP Architecture
- `docs/architecture/MAOS-009-approval-architecture.md` — MAOS-009 Approval Architecture
- `docs/architecture/MAOS-010-api-architecture.md` — MAOS-010 API Architecture
- `docs/architecture/MAOS-012-security-architecture.md` — MAOS-012 Security Architecture
- `docs/architecture/MAOS-013-observability-architecture.md` — MAOS-013 Observability Architecture
- `docs/architecture/MAOS-015-development-standards.md` — MAOS-015 Development Standards
- `docs/architecture/MAOS-016-test-strategy.md` — MAOS-016 Test Strategy

## Conditional Architecture Documents

Read only if a concrete dependency or conflict requires it:

- `docs/architecture/MAOS-002-domain-model.md` — MAOS-002 Domain Model
- `docs/architecture/MAOS-003-database-architecture.md` — MAOS-003 Database Architecture
- `docs/architecture/MAOS-006-memory-architecture.md` — MAOS-006 Memory Architecture
- `docs/architecture/MAOS-011-ui-architecture.md` — MAOS-011 UI Architecture
- `docs/architecture/MAOS-014-operations-architecture.md` — MAOS-014 Operations Architecture
- `docs/architecture/MAOS-017-deployment-architecture.md` — MAOS-017 Deployment Architecture
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md` — candidate guidance only

Do not read other architecture documents unless a specific conflict or missing fact requires it.

## Implementation Scope

- Canonical System Development Team definition and membership foundation.
- Specialized Development Lead, Requirement/Product, System Architect, UI/UX, Frontend, Backend, Database, Test, UI QA, Security Review, and DevOps agent-role foundations.
- Role mission, responsibility, allowed-task, forbidden-task, skill, tool, memory-scope, model-policy, runner-policy, approval-policy, handoff-policy, and reporting contracts.
- Team membership, availability, lifecycle, health, and current-assignment visibility.
- Development task assignment by compatible role and explicit capability boundaries.
- Structured handoff package foundation between specialized development roles.
- Separation-of-duties constraints for author, reviewer, approver, and executor where required.
- Default-deny assignment and execution behavior when capability, permission, runner health, approval, or task scope is unclear.
- Structured agent/team events, evidence references, and audit hooks using existing foundations.
- Persistence additions required by frozen Phase 1.15 architecture only.
- Minimum API/service and Control Room operations required to register, inspect, assign, suspend, and hand off development agents.
- Tests for role boundaries, assignment, forbidden tasks, handoff completeness, separation of duties, health, suspension, and default-deny behavior.

## Explicit Non-Goals

- No Development Loop Runtime or autonomous iteration engine.
- No autonomous planning, coding, review, repair, or retry loop.
- No unrestricted local execution, filesystem access, or command access.
- No new Tool, Approval, Workflow, Memory, Audit, or Local Execution engine.
- No Preview/UI Inspector/Test/QA automation expansion.
- No production deployment execution.
- No external or domain-system integration.
- No speculative Phase 1.15A or later implementation.

## Verification

Verification must execute against the actual Phase 1.15 implementation. Static reasoning is not evidence. Run and report:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Team definition and canonical role tests.
- Agent/Model/Runner separation tests.
- Compatible assignment and forbidden-task rejection tests.
- Specialized role-boundary and separation-of-duties tests.
- Structured handoff completeness and scope tests.
- Availability, health, suspension, and default-deny tests.
- Permission, approval, task-scope, and local-execution boundary tests.
- API and Control Room contract tests.
- Clean database initialization and migration replay if persistence changes.
- `npm run check:boundaries`
- Secret and artifact scan covering source, configuration, fixtures, and staged changes.
- `git diff --check`
- `git status --short`

`SKIPPED`, `BLOCKED`, `NOT_RUN`, inferred success, or unreviewed evidence are not PASS.

## Final Recommendation

Allowed:

- `PASS_PHASE_1_15`
- `REVISE_PHASE_1_15`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 1.15 result report. Do not start Phase 1.15A automatically.
