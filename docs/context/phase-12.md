# Phase 12 Context Manifest — Enterprise Production Readiness

Status: **NOT COMPLETE**

## Read First

- `AGENTS.md`
- `docs/handoff/CURRENT.md`
- `docs/context/phase-12.md`
- `skills/maos-phase-executor/SKILL.md`
- `skills/maos-test-evidence/SKILL.md`
- `skills/maos-architecture-check/SKILL.md`

## Goal

Evaluate and harden MAOS enterprise production readiness through verifiable operational, security, recovery, performance, and governance evidence without automatically authorizing or performing production deployment.

## Architecture Baseline

Frozen MAOS Architecture v1.0 remains authoritative. Do not silently modify it. MAOS-018 and MAOS-019 remain candidate guidance unless separately approved. Stop and report `CHANGE_REQUEST_REQUIRED` if Phase 12 requires a frozen-architecture change.

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

## Phase 12 Scope

- production-readiness evidence inventory and validation
- real infrastructure, configuration, credential-reference, DNS, network, and TLS readiness assessment
- backup, restore, disaster-recovery, RPO, and RTO readiness evidence
- security, dependency, secret-handling, isolation, and authorized penetration-test readiness
- production-like load, bounded soak, long-soak, capacity, and reliability evidence
- monitoring, alerting, incident-response, escalation, runbook, and operational-owner readiness
- immutable artifact promotion, human approval, rollback, and deployment-governance verification
- explicit production-gap status with evidence provenance and named human authority references
- minimum Control Room visibility required for readiness and unresolved gaps
- tests and evidence required for an enterprise production-readiness recommendation

## Evidence Rules

- Production readiness requires real evidence.
- Simulated or local evidence must remain explicitly labeled simulated or local.
- Missing, stale, mismatched, unverifiable, or unauthorized evidence fails closed.
- Phase 12 readiness does not imply production deployment approval.
- No simulated evidence may be represented as real production evidence.

## Preserved Boundaries

- `PRODUCTION_READY` remains `NO` unless changed by an authorized Phase 12 gate supported by complete real evidence.
- `PRODUCTION_DEPLOYMENT_APPROVED` remains `NO` unless separately granted by authorized humans.
- Phase 12 is a readiness and gate phase, not automatic deployment authorization.
- Domain systems remain independent sources of truth; MAOS integrates, governs, coordinates, and monitors.
- Human Authority > AI Authority.
- Review != Approval; QA PASS != Production Approval; AI must not self-approve.

## Explicit Non-Goals

- no real production deployment or production mutation
- no production restore without separate explicit authorization
- no production credential entry or secret disclosure in source
- no unauthorized external penetration test
- no silent closure of Phase 1P or Phase 11 production gaps
- no transfer of source-of-truth ownership from independent domain systems
- no frozen-architecture change
- no Phase 13+ implementation

## Verification

Actual execution must include:

- format
- lint
- typecheck
- full tests
- build
- production-readiness evidence validation
- infrastructure, network, TLS, and credential-reference readiness checks where authorized
- backup, restore, DR, RPO, and RTO evidence checks
- monitoring, alerting, incident, runbook, ownership, escalation, and rollback checks
- security-boundary, dependency, secret, and artifact scans
- production-like load, bounded soak, long-soak, and capacity checks where evidence exists
- deployment-governance and human-approval boundary tests
- Control Room readiness and accessibility checks when affected
- clean database initialization and migration replay when persistence changes
- architecture/module boundary checks
- `git diff --check`
- `git status --short`

Do not claim readiness from static reasoning or simulated evidence alone.

## Allowed Recommendation

- `PASS_PHASE_12`
- `REVISE_PHASE_12`
- `CHANGE_REQUEST_REQUIRED`
