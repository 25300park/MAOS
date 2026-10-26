# Phase 15C Classification / Domain Routing ??Local Evidence

Date: 2026-10-02
Scope: local implementation only; no Staging or Production access

## Canonical authorities

- `work.requests` owns canonical request identity and permits only `REGISTERED -> INVALIDATED`.
- `governance.request_classification_versions` is append-only, request-versioned classification authority.
- `ai.domain_execution_constraints` remains execution-policy authority.
- `DEVELOPMENT` resolves only to `DELEGATE_TO_AIDOS`; no MAOS-native fallback was introduced.
- Phase 15D receives validated routing input only and no Provider, Model, Host, Worker, or Runner selection.

## Database role and migration evidence

- Disposable PostgreSQL role/owner/ACL verification: PASS (1/1).
- Legacy owner matrix: PASS; wrong owner, missing membership, and indeterminate owner fail closed.
- Migration 0031 apply/replay: PASS; replay applied 0 and skipped 31.
- Runtime role: no superuser, database creation, role creation, ownership, DDL, broad update, delete, truncate, grant, or migration-role `SET ROLE` authority.
- Runtime request invalidation: only approved mutable columns are updateable.
- PUBLIC phase-table leakage: absent.
- Reconnect/restart persistence: PASS.

## Product verification

- Focused Phase 15C and affected registry/API/Web tests: PASS (87/87).
- Staging reset migration-manifest regression: PASS (33/33).
- Typecheck, lint, formatting, boundary check, repository safety scan: PASS.
- API and Web identical-source compilation to isolated output directories: PASS.
- Canonical API/Web build output directories remain host-ACL blocked (`EPERM`); no source/type error was observed.
- Full regression attempt: 846/848 PASS before the reset-manifest correction. The corrected reset suite is 33/33 PASS. The sole remaining unrerun full-suite failure is environmental `EADDRINUSE` because the already-running Runner owns `127.0.0.1:4319`; the service was not changed.

## Safety

- Secrets printed or persisted: none.
- Staging changed: no.
- Production changed: no.
- Commit/push: not performed.
