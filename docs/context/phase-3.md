# Phase 3 Context Manifest — AI Memory & Knowledge Integration

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `skills/maos-phase-executor/SKILL.md`
5. `skills/maos-test-evidence/SKILL.md`
6. `skills/maos-architecture-check/SKILL.md`

## Goal

Generalize the governed AI Memory Gateway integration into reusable task-scoped memory and knowledge context services without moving memory ownership into MAOS or duplicating memory storage.

## Architecture baseline

- Frozen MAOS Architecture v1.0 remains authoritative.
- AI Memory Gateway is the corporate AI memory and retrieval infrastructure and remains the memory source of truth.
- MAOS is the enterprise work and AI control plane. It stores governance metadata, context links, provenance, evidence, and external references only where frozen architecture requires them.
- Do not duplicate AI Memory Gateway memory storage, retrieval indexes, Second Brain, or private personal memory inside MAOS.
- Preserve Human Authority > AI Authority, task scope, least privilege, default deny, provenance, classification, privacy, evidence, and audit boundaries.
- Personal Agent overlap is governed separately. Private personal context must not enter enterprise retrieval without explicit approved policy and sharing authority.
- MAOS-018 and MAOS-019 remain candidate guidance and cannot override frozen v1.0.

## Required architecture documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md`
- `docs/architecture/MAOS-001-system-architecture.md`
- `docs/architecture/MAOS-002-domain-model.md`
- `docs/architecture/MAOS-006-memory-architecture.md`
- `docs/architecture/MAOS-010-api-architecture.md`
- `docs/architecture/MAOS-012-security-architecture.md`
- `docs/architecture/MAOS-013-observability-architecture.md`
- `docs/architecture/MAOS-015-development-standards.md`
- `docs/architecture/MAOS-016-test-strategy.md`

## Conditional architecture documents

Read only when a concrete dependency, conflict, or missing decision requires it:

- `docs/architecture/MAOS-003-database-architecture.md`
- `docs/architecture/MAOS-004-agent-architecture.md`
- `docs/architecture/MAOS-005-task-workflow-architecture.md`
- `docs/architecture/MAOS-007-skill-architecture.md`
- `docs/architecture/MAOS-008-tool-mcp-architecture.md`
- `docs/architecture/MAOS-009-approval-architecture.md`
- `docs/architecture/MAOS-014-operations-architecture.md`
- `docs/architecture/MAOS-017-deployment-architecture.md`
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md`
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md`

## Phase 3 scope

- Reusable MAOS to AI Memory Gateway integration contracts.
- Task-, project-, actor-, purpose-, namespace-, and classification-scoped context requests.
- Context assembly policy and deterministic priority across required artifacts, evidence, and retrieved references.
- Provenance, source, version, timestamp, classification, and retrieval metadata preservation.
- Memory-reference and improvement-candidate governance without storing gateway-owned memory content in MAOS.
- Secure credential references, timeout, cancellation, bounded retry, availability, health, and fail-closed behavior.
- Permission and approval enforcement for retrieval and candidate submission where required.
- Structured integration events, evidence, correlation continuity, and audit hooks.
- Reusable Core API and Control Room visibility required for governed memory context.
- Persistence changes only for MAOS-owned references and governance metadata required by frozen architecture.
- Tests for retrieval, context policy, provenance, scope isolation, privacy, failure, health, and ownership boundaries.

## Explicit non-goals

- No transfer of AI Memory Gateway ownership or source-of-truth responsibility into MAOS.
- No duplicate vector store, memory database, retrieval index, Second Brain, or Personal Agent memory store.
- No migration or deletion of AI Memory Gateway features.
- No Personal Agent runtime migration or silent enterprise/private context sharing.
- No autonomous Loop Engine expansion.
- No CRM, Marketing, AI-MLS, ERP, RBS, or other domain-system integration.
- No real production deployment or production-readiness status change.
- No frozen architecture change.
- No Phase 4 or later implementation.

## Implementation discipline

- Inspect Git status and create/use a short-lived `codex/` Phase 3 branch before implementation.
- Reuse the Phase 1.11 gateway client and the Phase 2 Control Plane; do not create a parallel memory subsystem.
- Store credentials as references only and redact sensitive request, result, event, evidence, and audit fields.
- Reject missing provenance, scope mismatch, private-personal leakage, unavailable dependencies, and unclear authority by default.
- Stop with `CHANGE_REQUEST_REQUIRED` if implementation requires moving memory ownership, changing frozen semantics, or merging Personal Agent responsibility into MAOS.

## Verification

- format
- lint
- typecheck
- tests
- build
- memory integration contract tests
- task/project/actor scope-isolation tests
- context-priority and policy tests
- provenance/source/version preservation tests
- classification and private-personal exclusion tests
- permission/default-deny and approval tests
- timeout/cancellation/bounded-retry tests
- gateway unavailable and health/readiness tests
- API and Control Room contract tests
- clean database initialization and migration replay when persistence changes
- architecture/module-boundary checks
- secret/artifact scan
- `git diff --check`
- `git status --short`

## Allowed recommendation

- `PASS_PHASE_3`
- `REVISE_PHASE_3`
- `CHANGE_REQUEST_REQUIRED`

Stop after the Phase 3 result report. Do not begin Phase 4 automatically.
