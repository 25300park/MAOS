# Phase 11 Context Manifest — Operations / Reliability / Security Hardening

Status: **NOT COMPLETE**

## Read First

- `AGENTS.md`
- `docs/handoff/CURRENT.md`
- `docs/context/phase-11.md`
- `skills/maos-phase-executor/SKILL.md`
- `skills/maos-test-evidence/SKILL.md`
- `skills/maos-architecture-check/SKILL.md`

## Goal

Harden the reusable MAOS Core Control Plane for enterprise operations, reliability, and security while preserving frozen architecture, independent domain-system ownership, human authority, and the separately governed production-readiness and deployment-approval gates.

## Architecture Baseline

Frozen MAOS Architecture v1.0 remains authoritative. Do not silently modify it. MAOS-018 and MAOS-019 remain candidate guidance unless separately approved. Stop and report `CHANGE_REQUEST_REQUIRED` if Phase 11 requires a frozen-architecture change.

### Required Architecture Documents

- MAOS-000 Project Constitution
- MAOS-001 System Architecture
- MAOS-010 API Architecture
- MAOS-012 Security Architecture
- MAOS-013 Observability Architecture
- MAOS-014 Operations Architecture
- MAOS-015 Development Standards
- MAOS-016 Test Strategy
- MAOS-017 Deployment Architecture

### Read Only for a Concrete Dependency or Conflict

- MAOS-002 Domain Model
- MAOS-003 Database Architecture
- MAOS-004 Agent Architecture
- MAOS-005 Task & Workflow Architecture
- MAOS-008 Tool & MCP Architecture
- MAOS-009 Approval Architecture
- MAOS-018 Autonomous Loop Multi-Agent Architecture v1.1 Candidate
- MAOS-019 Local Execution Bridge v1.1 Candidate

## Phase 11 Scope

- operational health, readiness, dependency-status, and degradation foundations
- service-level indicator/objective and metrics foundations
- structured alert, escalation, and incident-response foundations
- bounded retry, timeout, cancellation, circuit-breaker, bulkhead, and idempotency hardening where frozen architecture permits
- audit-integrity, evidence-continuity, and security-sensitive redaction hardening
- dependency, configuration, secret, artifact, path, command, tool, permission, and approval boundary verification
- local or simulated backup, restore, and disaster-recovery verification foundations
- bounded load, reliability, and soak verification suitable for non-production evidence
- operations runbook and human owner/approver/rollback-authority references
- Control Room operational visibility only where required for Phase 11
- explicit tracking of production gaps without silently closing them
- tests and evidence for the Phase 11 foundations

## Preserved Boundaries

- Phase 1P production gaps remain separately tracked.
- `PRODUCTION_READY` remains `NO` unless changed by a separately authorized production gate.
- `PRODUCTION_DEPLOYMENT_APPROVED` remains `NO` unless explicitly granted by authorized humans.
- Passing Phase 11 hardening does not authorize or perform production deployment.
- Domain systems remain independent sources of truth; MAOS integrates, governs, coordinates, and monitors.
- Human Authority > AI Authority.
- Review != Approval; QA PASS != Production Approval; AI must not self-approve.

## Explicit Non-Goals

- no real production deployment, production restore, or production mutation
- no production credential, DNS, network, or TLS configuration
- no external penetration test without explicit authorization
- no change to production-readiness or deployment-approval status
- no transfer of source-of-truth ownership from independent domain systems
- no new CRM, Marketing, AI-MLS, ERP, RBS/Admin, HR, Legal, or other domain integration
- no frozen-architecture change
- no Phase 12+ implementation

## Verification

Actual execution must include:

- format
- lint
- typecheck
- tests
- build
- health/readiness and dependency-state tests
- reliability, degradation, retry, timeout, cancellation, and idempotency tests where applicable
- alert, escalation, incident, evidence, and audit-integrity tests
- redaction and security-boundary tests
- local/simulated backup, restore, and disaster-recovery checks where applicable
- bounded load/soak checks defined by the implementation
- API and Control Room contract/accessibility checks when affected
- clean database initialization and migration replay when persistence changes
- architecture/module boundary checks
- dependency, secret, and artifact scan
- `git diff --check`
- `git status --short`

Do not claim PASS from static reasoning.

## Allowed Recommendation

- `PASS_PHASE_11`
- `REVISE_PHASE_11`
- `CHANGE_REQUEST_REQUIRED`
