# Phase 1P Final Context Manifest — Production Go / No-Go

## Read First

1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file
4. `docs/context/phase-1P.md`
5. `docs/implementation/phase-1P-production-readiness-evidence.md`
6. `skills/maos-phase-executor/SKILL.md`
7. `skills/maos-test-evidence/SKILL.md`
8. `skills/maos-architecture-check/SKILL.md`

## Goal

Evaluate the Phase 1P evidence and issue an explicit Production Go / No-Go recommendation without performing deployment, provisioning production access, or beginning Phase 2.

## Decision boundary

- `PRODUCTION_PREPARATION_COMPLETE` means repository-local production-readiness controls and classified evidence are complete.
- `PRODUCTION_DEPLOYMENT_APPROVED` requires separately verified production infrastructure, credentials, ownership, recovery, security, capacity, and exact human deployment authority.
- Preparation completion must never be treated as deployment approval.

## Required architecture documents

Read only:

- `docs/architecture/MAOS-000-project-constitution.md`
- `docs/architecture/MAOS-012-security-architecture.md`
- `docs/architecture/MAOS-013-observability-architecture.md`
- `docs/architecture/MAOS-014-operations-architecture.md`
- `docs/architecture/MAOS-015-development-standards.md`
- `docs/architecture/MAOS-016-test-strategy.md`
- `docs/architecture/MAOS-017-deployment-architecture.md`

Read other frozen architecture only for a concrete conflict or missing decision. MAOS-018 and MAOS-019 remain candidate guidance and must not be frozen or modified without explicit approval.

## Evaluation scope

- Review environment isolation, secret/configuration boundaries, database migration safety, backup/restore, disaster recovery, deployment/rollback, monitoring, security, supply-chain, performance, stability, penetration readiness, and operational ownership evidence.
- Preserve Human Authority > AI Authority, QA PASS != Production Approval, Review != Approval, Approval != Authority, default deny, least privilege, exact artifact binding, and build-once/promote-same-artifact.
- Keep `VERIFIED`, `SIMULATED`, `NOT_RUN`, `BLOCKED`, and `HUMAN_ACTION_REQUIRED` evidence distinct.
- Confirm known production gaps and determine whether every mandatory production prerequisite has real, current, environment-bound evidence.
- Issue an evidence-backed Go / Conditional Go / No-Go recommendation.

## Explicit non-goals

- No source-code or runtime feature implementation.
- No production credentials, cloud/provider connection, DNS/domain change, or external infrastructure mutation.
- No production backup restore, deployment, rollback, or destructive action.
- No Phase 2 implementation.
- No approval, authority, security, evidence, or audit bypass.
- No frozen-architecture change.

## Verification

Run current evidence appropriate to the final gate:

- format, lint, typecheck, full tests, and build;
- database clean initialization, migration application/replay/checksum/failure evidence;
- repository secret/artifact scan and dependency audit availability;
- health/readiness, bounded load/stability, backup/restore, simulated DR, deployment, verification, and rollback evidence;
- architecture/module boundary checks;
- `git diff --check` and `git status --short`.

Do not infer production readiness from simulated evidence. Long-duration soak, external penetration testing, named staffing, approved production RPO/RTO, real provider configuration, and exact human deployment approval must be reported honestly when outstanding.

## Allowed final recommendation

- `GO_PHASE_1P_FINAL`
- `NO_GO_PHASE_1P_FINAL`
- `CHANGE_REQUEST_REQUIRED`

The recommendation closes the classification gate; it must not be represented as production approval. Stop after the Phase 1P Final report. Do not deploy or begin Phase 2 automatically.
