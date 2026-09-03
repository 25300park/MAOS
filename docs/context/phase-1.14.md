# Phase 1.14 Context Manifest — System Development Workspace

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`
5. `skills/maos-ui-review/SKILL.md`

## Goal

Establish the minimum executable System Development Workspace required to inspect and coordinate governed repository work through existing MAOS task, run, tool, local-execution, evidence, and audit boundaries.

## Architecture Baseline

- MAOS Architecture v1.0 is frozen and remains authoritative.
- Do not modify frozen architecture during Phase 1.14.
- The workspace is a governed Control Room surface, not an unrestricted IDE, shell, autonomous development loop, source of authority, or replacement for Git.
- Task, Run, Agent, Model, Runner, Skill, Tool Permission, Approval, Artifact, Evidence, and Audit retain their canonical meanings and remain separate.
- Every repository action must be authenticated, authorized, task-scoped, workspace-scoped, risk-classified, approval-gated where required, and auditable through existing foundations.
- Secrets, credentials, private personal content, hidden chain-of-thought, and unrestricted filesystem or command access must not be exposed.
- If implementation requires a frozen-architecture change, stop and report `CHANGE_REQUEST_REQUIRED`.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md` — MAOS-000 Project Constitution
- `docs/architecture/MAOS-001-system-architecture.md` — MAOS-001 System Architecture
- `docs/architecture/MAOS-004-agent-architecture.md` — MAOS-004 Agent Architecture
- `docs/architecture/MAOS-005-task-workflow-architecture.md` — MAOS-005 Task & Workflow Architecture
- `docs/architecture/MAOS-008-tool-mcp-architecture.md` — MAOS-008 Tool & MCP Architecture
- `docs/architecture/MAOS-009-approval-architecture.md` — MAOS-009 Approval Architecture
- `docs/architecture/MAOS-010-api-architecture.md` — MAOS-010 API Architecture
- `docs/architecture/MAOS-011-ui-architecture.md` — MAOS-011 UI Architecture
- `docs/architecture/MAOS-012-security-architecture.md` — MAOS-012 Security Architecture
- `docs/architecture/MAOS-013-observability-architecture.md` — MAOS-013 Observability Architecture
- `docs/architecture/MAOS-014-operations-architecture.md` — MAOS-014 Operations Architecture
- `docs/architecture/MAOS-015-development-standards.md` — MAOS-015 Development Standards
- `docs/architecture/MAOS-016-test-strategy.md` — MAOS-016 Test Strategy
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md` — candidate guidance only

## Conditional Architecture Documents

Read only if a concrete dependency or conflict requires it:

- `docs/architecture/MAOS-002-domain-model.md` — MAOS-002 Domain Model
- `docs/architecture/MAOS-003-database-architecture.md` — MAOS-003 Database Architecture
- `docs/architecture/MAOS-007-skill-architecture.md` — MAOS-007 Skill Architecture
- `docs/architecture/MAOS-017-deployment-architecture.md` — MAOS-017 Deployment Architecture

Do not read other architecture documents unless a specific conflict or missing fact requires it. MAOS-019 remains candidate guidance and cannot silently change frozen v1.0 architecture.

## Implementation Scope

- System Development Workspace route, navigation, layout, and responsive Control Room integration.
- Repository and approved workroot selection using registered local-runner boundaries.
- Current branch, status, scoped diff, changed-file, and task/run context visibility.
- Read-only source-file browsing within an approved workspace boundary.
- Governed file-change request foundation using existing Tool Permission, Tool Risk, Approval, and Local Execution Bridge contracts.
- Controlled command/test request foundation using registered capabilities and command policy; no direct shell surface.
- Task, owner, blocker, approval, next-action, run, artifact, evidence, and audit-link visibility.
- Request/correlation/trace continuity and structured operational states.
- Explicit loading, empty, unavailable, denied, blocked, approval-required, conflict, timeout, and failure states.
- Security-sensitive redaction and prevention of path, secret, credential, or private-data leakage.
- Accessibility, keyboard operation, desktop-first responsive behavior, and focused workspace tests.

## Explicit Non-Goals

- No System Development Agent Team implementation.
- No autonomous Development Loop Runtime.
- No unrestricted shell, command execution, filesystem access, or arbitrary workroot registration.
- No force-push, production deployment, destructive repository action, or approval bypass.
- No full third-party IDE extension or replacement IDE.
- No new Tool, Approval, Workflow, Audit, or Local Execution engine.
- No external or domain-system integration.
- No production deployment.
- No speculative Phase 1.15 or later implementation.

## Verification

Verification must execute against the actual Phase 1.14 implementation. Static reasoning is not evidence. Run and report:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Workspace route, navigation, and permission-visibility tests.
- Workroot isolation and path traversal/escape rejection tests.
- Repository status, scoped diff, and file-view contract tests.
- File-change and command-request default-deny, risk, and approval-gating tests.
- Task/run/evidence/audit context continuity tests.
- Loading, empty, unavailable, denied, blocked, approval-required, conflict, timeout, and failure-state tests.
- Responsive layout, keyboard, accessibility, and visual QA checks.
- `npm run check:boundaries`
- Secret and artifact scan covering source, configuration, fixtures, and staged changes.
- `git diff --check`
- `git status --short`

`SKIPPED`, `BLOCKED`, `NOT_RUN`, inferred success, or unreviewed screenshots are not PASS.

## Final Recommendation

Allowed:

- `PASS_PHASE_1_14`
- `REVISE_PHASE_1_14`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 1.14 result report. Do not start Phase 1.15 automatically.
