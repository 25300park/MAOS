# Phase 1.12 Context Manifest — Observability / Audit

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`

## Goal

Establish the minimum executable MAOS Observability / Audit foundation required by frozen architecture while preserving the distinct semantics of logs, metrics, traces, events, and audit records.

## Architecture Baseline

- MAOS Architecture v1.0 is frozen and remains authoritative.
- Do not modify frozen architecture during Phase 1.12.
- Observability = Logs + Metrics + Traces + Events + Audit, while Log != Metric != Trace != Event != Audit.
- Audit records must preserve who did what, when, against which resource, under which request/correlation/task/run context, and with what outcome/evidence.
- `UNKNOWN` health is not `HEALTHY`.
- Secrets, credentials, raw private journals, private personal content, and hidden chain-of-thought must never enter logs, events, traces, metrics, or audit metadata.
- Human authority, identity, authorization, approval, evidence, privacy, and source-of-truth boundaries remain unchanged.
- If implementation requires a frozen-architecture change, stop and report `CHANGE_REQUEST_REQUIRED`.

## Required Architecture Documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md` — MAOS-000 Project Constitution
- `docs/architecture/MAOS-002-domain-model.md` — MAOS-002 Domain Model
- `docs/architecture/MAOS-010-api-architecture.md` — MAOS-010 API Architecture
- `docs/architecture/MAOS-012-security-architecture.md` — MAOS-012 Security Architecture
- `docs/architecture/MAOS-013-observability-architecture.md` — MAOS-013 Observability Architecture
- `docs/architecture/MAOS-015-development-standards.md` — MAOS-015 Development Standards
- `docs/architecture/MAOS-016-test-strategy.md` — MAOS-016 Test Strategy

## Conditional Architecture Documents

Read only if a concrete dependency or conflict requires it:

- `docs/architecture/MAOS-001-system-architecture.md` — MAOS-001 System Architecture
- `docs/architecture/MAOS-003-database-architecture.md` — MAOS-003 Database Architecture
- `docs/architecture/MAOS-004-agent-architecture.md` — MAOS-004 Agent Architecture
- `docs/architecture/MAOS-005-task-workflow-architecture.md` — MAOS-005 Task & Workflow Architecture
- `docs/architecture/MAOS-006-memory-architecture.md` — MAOS-006 Memory Architecture
- `docs/architecture/MAOS-008-tool-mcp-architecture.md` — MAOS-008 Tool & MCP Architecture
- `docs/architecture/MAOS-009-approval-architecture.md` — MAOS-009 Approval Architecture
- `docs/architecture/MAOS-014-operations-architecture.md` — MAOS-014 Operations Architecture
- `docs/architecture/MAOS-017-deployment-architecture.md` — MAOS-017 Deployment Architecture

Do not read other architecture documents unless a specific conflict or missing fact requires it.

## Implementation Scope

- Canonical contracts that keep Log, Metric, Trace, Event, and Audit records distinct.
- Structured application logging foundation and security-sensitive redaction integration.
- Request, correlation, trace/span, project, task, workflow, run, tool-call, approval, artifact, system, and actor context propagation where applicable.
- Canonical structured domain and integration event foundation.
- Audit record foundation for actor, action, resource, environment, outcome, evidence, and contextual identifiers.
- Append-only and tamper-evident audit lifecycle foundations required by frozen architecture.
- Minimum metric and trace contracts required to correlate existing API, workflow, agent, tool, local-runner, and memory-gateway execution paths.
- Health-state and dependency-status observability using canonical health semantics.
- Fail-closed validation for malformed, uncorrelated, or security-sensitive audit/event input where required.
- Persistence additions required for MAOS-owned events, audit records, and correlation metadata.
- Minimum authenticated and authorized API operations required to query audit/event evidence by supported scope.
- Tests for correlation, redaction, event/audit separation, actor/resource attribution, append-only behavior, tamper evidence, health semantics, and API contracts.

## Explicit Non-Goals

- No Control Room UI.
- No production metrics, tracing, log aggregation, SIEM, or alerting deployment.
- No incident-management or runbook engine.
- No autonomous Loop Engine.
- No external or domain-system integration.
- No production deployment or production-data ingestion.
- No unrestricted audit export.
- No speculative Phase 1.13 or later functionality.

## Verification

Verification must be executed against the actual Phase 1.12 implementation. Static reasoning is not evidence. Run and report:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Structured-log and redaction tests.
- Correlation and trace-context propagation tests.
- Canonical event-contract tests.
- Audit actor/action/resource/outcome attribution tests.
- Log/Metric/Trace/Event/Audit separation tests.
- Append-only and tamper-evidence tests.
- Health-state semantics tests.
- Authenticated and authorized audit/event API contract tests.
- Clean database initialization and migration replay if persistence changes.
- `npm run check:boundaries`
- Secret and artifact scan covering source, configuration, fixtures, and staged changes.
- `git diff --check`
- `git status --short`

`SKIPPED`, `BLOCKED`, `NOT_RUN`, or inferred success is not PASS.

## Final Recommendation

Allowed:

- `PASS_PHASE_1_12`
- `REVISE_PHASE_1_12`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 1.12 result report. Do not start Phase 1.13 automatically.
