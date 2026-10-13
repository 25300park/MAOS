# Phase 15D EWP-09 Candidate Manifest

Status: `PREPARED_FOR_HUMAN_REVIEW`

## Source identity

- Repository: `D:\10. MAOS-phase15d-routing`
- Branch: `codex/phase15d-routing-implementation`
- Phase 15C Staging baseline: `e78e1063edc8db2754ac19dff719b750deb50628`
- Approved Phase 15D source head: `0dd0102e08f3d15eb1a386c38daa0442df355acf`
- Commit count in candidate range: `18`
- File count in candidate range: `66`
- Ordered candidate-path-list SHA-256: `c6fb32d46f9f75bb8a24c3e5e32d6664176f303191257013a94caa239220aaf1`

## Exact approved source range

```text
apps/api/src/routing-routes.ts
apps/api/src/routing-server-composition.ts
apps/api/src/server.ts
apps/api/test/routing-routes.test.ts
apps/api/test/routing-server-composition.test.ts
apps/web/src/control-room.ts
apps/web/src/index.ts
apps/web/src/routing.ts
apps/web/src/server.ts
apps/web/test/control-room.test.ts
apps/web/test/routing.test.ts
apps/web/test/server.test.ts
docs/handoff/CURRENT.md
docs/superpowers/2026-10-08-phase15d-implementation-plan.md
docs/superpowers/2026-10-08-phase15d-multi-ai-role-model-routing-design.md
packages/config/src/index.ts
packages/config/test/config.test.ts
packages/database/migrations/0032_phase15d_multi_ai_role_model_routing.sql
packages/database/migrations/0033_phase15b_registry_freshness_policy.sql
packages/database/migrations/0034_phase15d_aidos_delegation_input_binding.sql
packages/database/src/aidos-authority-runtime-factory.ts
packages/database/src/aidos-authority-runtime.ts
packages/database/src/aidos-delegation-contracts.ts
packages/database/src/candidate-resolution-service.ts
packages/database/src/database-role-contract.ts
packages/database/src/human-approval-authority-runtime-factory.ts
packages/database/src/human-approval-runtime.ts
packages/database/src/index.ts
packages/database/src/registry-freshness-policy-acl.ts
packages/database/src/registry-freshness-policy-read-port.ts
packages/database/src/registry-freshness-policy-repository.ts
packages/database/src/registry-freshness-policy-service.ts
packages/database/src/routing-authority-read-ports.ts
packages/database/src/routing-authority-runtime-factory.ts
packages/database/src/routing-contracts.ts
packages/database/src/routing-decision-repository.ts
packages/database/src/routing-decision-service.ts
packages/database/src/routing-policy-repository.ts
packages/database/src/routing-policy-service.ts
packages/database/src/routing-read-service.ts
packages/database/src/routing-validation-service.ts
packages/database/test/aidos-authority-runtime-factory.test.ts
packages/database/test/aidos-delegation-contracts.test.ts
packages/database/test/aidos-delegation-migration.test.ts
packages/database/test/candidate-resolution-service.test.ts
packages/database/test/database.test.ts
packages/database/test/human-approval-authority-runtime-factory.test.ts
packages/database/test/migrations.test.ts
packages/database/test/phase15d-routing-migration.test.ts
packages/database/test/registry-freshness-policy-acl.test.ts
packages/database/test/registry-freshness-policy-migration.test.ts
packages/database/test/registry-freshness-policy-read-port.test.ts
packages/database/test/registry-freshness-policy-repository.test.ts
packages/database/test/registry-freshness-policy-service.test.ts
packages/database/test/routing-authority-read-ports.test.ts
packages/database/test/routing-authority-runtime-factory.test.ts
packages/database/test/routing-decision-repository.test.ts
packages/database/test/routing-decision-service.test.ts
packages/database/test/routing-policy-repository.test.ts
packages/database/test/routing-policy-service.test.ts
packages/database/test/routing-read-service.test.ts
packages/database/test/routing-validation-service.test.ts
scripts/database-migrate-postgres.test.ts
scripts/database-reset-staging.ts
scripts/database-role-contract-postgres.test.ts
scripts/database-role-preflight.test.ts
```

## EWP-09 bounded finalization changes

These files contain only lint/format compliance corrections or EWP-09 evidence updates and require separate Human-reviewed finalization before they can enter a deployable head:

```text
docs/handoff/CURRENT.md
docs/implementation/phase-15d/PHASE15D_EWP09_CANDIDATE_MANIFEST.md
docs/implementation/phase-15d/PHASE15D_EWP09_STAGING_AUTHORIZATION_PACKAGE.md
packages/database/src/aidos-authority-runtime.ts
packages/database/src/aidos-delegation-contracts.ts
packages/database/src/routing-authority-read-ports.ts
packages/database/src/routing-decision-service.ts
packages/database/test/aidos-authority-runtime-factory.test.ts
packages/database/test/aidos-delegation-migration.test.ts
packages/database/test/routing-authority-read-ports.test.ts
packages/database/test/routing-decision-repository.test.ts
packages/database/test/routing-decision-service.test.ts
packages/database/test/routing-read-service.test.ts
packages/database/test/routing-validation-service.test.ts
```

No authority, AIDOS protocol, schema, or runtime behavior change is introduced by these EWP-09 corrections.

## Migration identity

- Migration 0032 SHA-256: `ec3b2b8217c89158c2003e717969e28099717d2e47162b7ae19031b5ad004b4a`
- Migration 0033 SHA-256: `d52d50505d375c2eebbc77e013cf27f271e65a630c0e1bde61a663d191b2f53a`
- Migration 0034 SHA-256: `81db09844d8bc5754578d3fd46a92cb5e68e9c6cbfb6135caa62b3f264b6e531`

## Explicit exclusion

The following pre-existing untracked design document is preserved unchanged and excluded from the candidate manifest, EWP-09 scope, and any future EWP-09 commit:

```text
docs/superpowers/2026-10-11-phase15b-rfa06b0-aidos-projection-read-source-design.md
```

Its verified SHA-256 is `749e4dfde9a3fe98474f3e13c2786a5a869c4d22d030d40597743e41d8ccb971`.

## Exclusions and safety

- Unrelated files included: `NONE`
- AIDOS repository files included: `NONE`
- Secrets or credential values included: `NONE`
- Staging mutation performed: `NO`
- Production mutation performed: `NO`
- Push or deployment performed: `NO`
