# Phase 13 Context Manifest — Optimization / Learning / Expansion

Status: **NOT COMPLETE**

## Read First

- `AGENTS.md`
- `docs/handoff/CURRENT.md`
- `docs/context/phase-13.md`
- `skills/maos-phase-executor/SKILL.md`
- `skills/maos-test-evidence/SKILL.md`
- `skills/maos-architecture-check/SKILL.md`

## Goal

Establish governed optimization, learning, and expansion foundations that turn verified outcomes into reviewable improvement candidates without uncontrolled self-improvement, silent architecture change, or production deployment authority.

## Architecture Baseline

Frozen MAOS Architecture v1.0 remains authoritative. MAOS-018 and MAOS-019 remain candidates. Do not silently freeze, adopt, or modify either candidate. Stop and report `CHANGE_REQUEST_REQUIRED` if implementation requires changing frozen architecture.

### Required Architecture Documents

- MAOS-000 Project Constitution
- MAOS-001 System Architecture
- MAOS-004 Agent Architecture
- MAOS-005 Task & Workflow Architecture
- MAOS-007 Skill Architecture
- MAOS-008 Tool & MCP Architecture
- MAOS-009 Approval Architecture
- MAOS-012 Security Architecture
- MAOS-013 Observability Architecture
- MAOS-015 Development Standards
- MAOS-016 Test Strategy

### Read Only for a Concrete Dependency or Conflict

- MAOS-002 Domain Model
- MAOS-003 Database Architecture
- MAOS-006 Memory Architecture
- MAOS-010 API Architecture
- MAOS-014 Operations Architecture
- MAOS-017 Deployment Architecture
- MAOS-018 Autonomous Loop Multi-Agent Architecture v1.1 Candidate
- MAOS-019 Local Execution Bridge v1.1 Candidate

## Phase 13 Scope

- verified-result learning signal foundation
- improvement candidate creation, provenance, lifecycle, and evidence binding
- bounded optimization evaluation and comparison foundations
- governed workflow, skill, model, and tool change proposals
- human review and approval boundaries for applicable changes
- rejection, rollback-candidate, pause, cancellation, and escalation foundations
- audit and structured event hooks for candidate generation and decisions
- minimum API and Control Room visibility required for reviewable candidates
- persistence additions only where required by the frozen architecture and Phase 13 scope
- tests for provenance, governance, isolation, approval, rejection, and rollback behavior

## Preserved Boundaries

- Human Authority > AI Authority.
- Verified results may create improvement candidates; they do not directly change runtime behavior.
- Workflow, skill, model, and tool changes remain governed.
- No AI output, test result, review, or QA result constitutes self-approval.
- `PRODUCTION_READY` remains `NO`.
- `PRODUCTION_DEPLOYMENT_APPROVED` remains `NO`.
- Production gaps remain separately tracked until supported by actual authorized production evidence.
- MAOS-018 and MAOS-019 remain candidate guidance only.
- Independent domain systems retain their source-of-truth ownership.

## Explicit Non-Goals

- no uncontrolled or recursive self-improvement
- no automatic application of improvement candidates
- no bypass of human authority, permission, approval, security, privacy, evidence, or audit gates
- no real production deployment or production mutation
- no production credential entry
- no silent closure of production gaps
- no frozen-architecture change
- no Phase 14+ implementation

## Verification

Actual execution must include:

- format
- lint
- typecheck
- full tests
- build
- improvement-candidate provenance and evidence tests
- governance and human-authority tests
- workflow/skill/model/tool change-boundary tests
- rejection, pause, cancellation, escalation, and rollback-candidate tests where applicable
- API and Control Room contract tests where affected
- architecture/module boundary checks
- secret/artifact scan
- `git diff --check`
- `git status --short`

Do not claim PASS from static reasoning.

## Allowed Recommendation

- `PASS_PHASE_13`
- `REVISE_PHASE_13`
- `CHANGE_REQUEST_REQUIRED`
