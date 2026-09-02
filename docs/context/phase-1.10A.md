# Phase 1.10A Context Manifest — Local Execution Bridge / IDE Companion MVP

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`

## Goal

Establish the minimum Local Execution Bridge / IDE Companion MVP that allows MAOS to use a registered local runner/tool provider safely under existing identity, task-scope, permission, risk, approval, evidence, and audit boundaries.

## Architecture Baseline

- MAOS Architecture v1.0 is frozen and remains authoritative.
- Do not modify frozen architecture during Phase 1.10A.
- MAOS-019 is proposed v1.1 candidate guidance, not frozen implementation authority.
- MAOS-018 remains a candidate reference only.
- The Local Execution Bridge is a governed Runner/Tool Provider; it does not grant authority and does not replace the MAOS Control Plane.
- Existing identity, task scope, Tool Permission, Tool Risk, Approval, evidence, audit, least-privilege, default-deny, and fail-closed semantics remain authoritative.
- If MAOS-019 requires a frozen-architecture change, stop and report `CHANGE_REQUEST_REQUIRED`; do not implement around the conflict.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md` — MAOS-000 Project Constitution
- `docs/architecture/MAOS-004-agent-architecture.md` — MAOS-004 Agent Architecture
- `docs/architecture/MAOS-008-tool-mcp-architecture.md` — MAOS-008 Tool & MCP Architecture
- `docs/architecture/MAOS-009-approval-architecture.md` — MAOS-009 Approval Architecture
- `docs/architecture/MAOS-010-api-architecture.md` — MAOS-010 API Architecture
- `docs/architecture/MAOS-012-security-architecture.md` — MAOS-012 Security Architecture
- `docs/architecture/MAOS-013-observability-architecture.md` — MAOS-013 Observability Architecture
- `docs/architecture/MAOS-015-development-standards.md` — MAOS-015 Development Standards
- `docs/architecture/MAOS-016-test-strategy.md` — MAOS-016 Test Strategy
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md` — MAOS-019 Local Execution Bridge v1.1 Candidate

## Conditional Architecture Documents

Read only if a concrete dependency or conflict requires it:

- `docs/architecture/MAOS-001-system-architecture.md` — MAOS-001 System Architecture
- `docs/architecture/MAOS-002-domain-model.md` — MAOS-002 Domain Model
- `docs/architecture/MAOS-003-database-architecture.md` — MAOS-003 Database Architecture
- `docs/architecture/MAOS-005-task-workflow-architecture.md` — MAOS-005 Task & Workflow Architecture
- `docs/architecture/MAOS-014-operations-architecture.md` — MAOS-014 Operations Architecture
- `docs/architecture/MAOS-017-deployment-architecture.md` — MAOS-017 Deployment Architecture
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md` — MAOS-018 Autonomous Loop Multi-Agent v1.1 Candidate

Do not read other architecture documents unless a specific conflict or missing fact requires it.

## Implementation Scope

- Local runner registration foundation.
- Local device and runner identity.
- Workspace and workroot allowlist.
- Local capability registration.
- File read/write capability boundary.
- Controlled command execution boundary.
- Git status and diff capability foundation.
- Path boundary enforcement.
- Command policy enforcement.
- Secret redaction.
- Task-scope binding.
- Tool Permission, Tool Risk, and Approval integration using the Phase 1.10 foundation.
- Execution result and evidence collection.
- Timeout and cancellation.
- Runner health and status.
- Kill and revocation foundation.
- Minimum API and contracts needed for local bridge registration and execution.
- Tests for workspace isolation, permission denial, approval gating, path escape rejection, command-policy rejection, redaction, timeout, cancellation, and runner health.

## Explicit Non-Goals

- No unrestricted shell.
- No arbitrary filesystem access.
- No automatic force-push.
- No production deployment execution.
- No autonomous Loop Engine.
- No AI Memory Gateway integration.
- No full IDE extension UI.
- No Control Room UI.
- No external or domain-system integration.
- No speculative Phase 1.11 or later functionality.

## Verification

Verification must be executed against the actual Phase 1.10A implementation. Static reasoning is not evidence. Run and report:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Runner registration tests.
- Workspace and workroot allowlist tests.
- Path traversal and escape rejection tests.
- Command policy tests.
- Permission and default-deny tests.
- Approval-gating tests.
- Secret-redaction tests.
- Timeout and cancellation tests.
- Runner health tests.
- API contract tests.
- `npm run check:boundaries`
- Secret and artifact scan covering source, configuration, fixtures, and staged changes.
- `git diff --check`
- `git status --short`

`SKIPPED`, `BLOCKED`, `NOT_RUN`, or inferred success is not PASS.

## Final Recommendation

Allowed:

- `PASS_PHASE_1_10A`
- `REVISE_PHASE_1_10A`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 1.10A result report. Do not start Phase 1.11 automatically.
