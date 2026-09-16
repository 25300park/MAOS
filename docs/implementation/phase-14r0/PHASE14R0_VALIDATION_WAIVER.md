# Phase 14R-0 Bounded Validation Waiver

## Scope

This waiver applies only to the Phase 14R-0 preservation-to-main integration gate. It covers exactly the two failures recorded below. It does not waive any Phase 14R-1 or later test, CI, deployment, staging, production-readiness, or Production gate.

## Exception 1 — isolated environmental OOM

- Failing full-regression target: `apps/api/test/identity-session-routes.test.ts`.
- Observed failure: Node/V8 `Zone` out-of-memory termination during the sequential full regression.
- Classification: `ENVIRONMENTAL`.
- Resource-safe isolated command: `tsx --test --test-concurrency=1 apps/api/test/identity-session-routes.test.ts`.
- Isolated result: `5/5 PASS`.
- Conclusion: Session-route logic passes when isolated; the preservation commits introduced no source change to this test or its runtime.

## Exception 2 — pre-existing deterministic fixture timestamp

- Failing test: `packages/database/test/session-audit-repository.test.ts` — `persists redacted Session audit records across repository reconstruction`.
- Observed failure: PostgreSQL `23514`, constraint `human_project_assignments_check1`.
- Cause: the fixture writes `revoked_at = 2026-09-16T01:10:00.000Z` after creating the assignment with the runtime wall clock. Once the runtime creation time is later than that fixed timestamp, the canonical `revoked_at >= created_at` constraint rejects the setup update before any audit assertion runs.
- Classification: `PRE_EXISTING_DETERMINISTIC`.
- Baseline comparison: migration `0019_staging_session_ingress.sql` has blob `66b64ff3737ae1b1844220649d3bcf21e8490e95` at baseline main `8f07cbb7e7b56fffbfed6c60b218c780c579d0fd`, durable-audit commit `81edf1e5886665ffcf0d73ec40b23e4be387f2cb`, and the preserved branch.
- Baseline reproduction: a clean detached baseline worktree rejected the same fixed-before-created update with PostgreSQL `23514` and `human_project_assignments_check1`.
- Preservation comparison: the Session-audit test blob and repository implementation are unchanged between `81edf1e5886665ffcf0d73ec40b23e4be387f2cb` and the preservation head.
- Conclusion: this is a time-dependent test-fixture defect, not an audit persistence, ordering, or preservation regression.

## Decision

- Phase 1C preservation regression: `NO`.
- Phase 14 governance regression: `NO`.
- Runtime source fix required for this integration: `NO`.
- Bounded Phase 14R-0 integration waiver: `APPROVED_BY_HUMAN_REQUEST`.
- Main integration: permitted only by fast-forward and only with `.gitignore` excluded.

The timestamp fixture should be corrected under a separately scoped test-maintenance change before it is relied upon as a future clean-suite gate. This waiver does not convert its failing result to PASS and must not be reused outside Phase 14R-0.
