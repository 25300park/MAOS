# Phase 1P Context Manifest — Production Readiness Preparation

## Goal

Convert the accepted Phase 1 MVP into a production-readiness candidate by closing or explicitly classifying production-readiness gaps without performing production deployment.

## Required Architecture

Read only:

- `docs/architecture/MAOS-012-security-architecture.md`
- `docs/architecture/MAOS-013-observability-architecture.md`
- `docs/architecture/MAOS-014-operations-architecture.md`
- `docs/architecture/MAOS-015-development-standards.md`
- `docs/architecture/MAOS-016-test-strategy.md`
- `docs/architecture/MAOS-017-deployment-architecture.md`

Read other frozen architecture only for a concrete dependency or conflict. MAOS-018 and MAOS-019 remain candidates and may be reviewed for freeze readiness but must not be frozen or modified in this phase.

## Scope

- Development, Preview/Staging, and Production environment identity and isolation.
- Secret-reference, production configuration, startup validation, and redaction readiness.
- Migration checksum, lock, replay, failure, backup-gate, and schema-version readiness.
- Test-data backup, integrity, retention, encryption expectation, restore, and restore-verification contracts.
- Safe simulated disaster recovery, deployment preflight, same-artifact promotion, verification, and rollback.
- Health, monitoring, alerts, security/governance failures, correlation, and operational evidence.
- Non-destructive security, dependency, bounded load, and bounded stability verification.
- Operational ownership and production runbooks using actual MAOS controls.
- Explicit VERIFIED, SIMULATED, NOT_RUN, BLOCKED, and HUMAN_ACTION_REQUIRED evidence classification.
- Freeze-readiness review of MAOS-018 and MAOS-019 only.

## Non-Goals and Stop Conditions

- No real production deployment, production credentials, cloud credentials, DNS changes, paid-service authorization, destructive external mutation, or production-data restore.
- No Phase 2 implementation.
- No frozen-architecture modification or automatic freeze of candidate architecture.
- No weakening of default deny, least privilege, exact artifact binding, separation of duties, or human authority.
- Stop with `HUMAN_ACTION_REQUIRED`, `BLOCKED`, or `CHANGE_REQUEST_REQUIRED` when completion requires any prohibited action.

## Verification

- Format, lint, typecheck, full tests, and build.
- Clean database initialization, migration application/replay/checksum/failure handling.
- Test backup, integrity, restore, and restored-system verification.
- Simulated deployment preflight, artifact validation, deployment, verification, and rollback.
- Auth/AuthZ, approval/authority, redaction, path, command, validation, and error-disclosure regression.
- Dependency audit and supply-chain evidence.
- Health/readiness, monitoring, alert, and runbook validation.
- Bounded load, timeout/failure, and stability tests; long soak must be reported accurately if not run.
- Architecture/module boundaries, secret/artifact scan, `git diff --check`, and `git status --short`.

## Recommendation

Allowed: `PASS_PHASE_1P`, `REVISE_PHASE_1P`, `BLOCKED_PHASE_1P`, or `CHANGE_REQUEST_REQUIRED`.
