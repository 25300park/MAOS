# Phase 15D EWP-09 Staging Authorization Package

Status: `PREPARED_NOT_AUTHORIZED_FOR_EXECUTION`

This package records the evidence and Human gates for a future Phase 15D Staging operation. It does not authorize or perform migration, configuration, deployment, or other Staging mutation.

## Candidate

- Source manifest: `docs/implementation/phase-15d/PHASE15D_EWP09_CANDIDATE_MANIFEST.md`
- Approved source head before EWP-09 finalization: `0dd0102e08f3d15eb1a386c38daa0442df355acf`
- AIDOS contract: `AIDOS_EXTERNAL_AUTHORITY_PROJECTION_READ/1.0`
- AIDOS compatibility: `PASS_READ_ONLY`
- MAOS-native Development fallback: `NONE`
- Duplicate AIDOS authority: `NONE`

## Local verification evidence

- Focused Phase 15D tests: `PASS_236_OF_236`
- Affected Phase 15B/15C tests: `PASS_70_OF_70`
- ACL and governed-role tests: `PASS_24_OF_24`
- Full repository regression: `PASS_879_OF_879`
- Typecheck: `PASS`
- Lint: `PASS`
- Format check: `PASS`
- Boundary checks: `PASS`
- Secret scan: `PASS`
- API build: `PASS`
- Web build: `PASS`
- Staging packaging verification: `PASS`
- Migration apply/replay/restart reconstruction through 0034: `PASS`
- Real PostgreSQL concurrency and governed-owner verification: `PASS`

## Intended future targets

The targets below must be verified again by the Human-authorized execution path before any mutation:

- Railway project: `MAOS`
- Railway environment: `staging`
- Railway API service: `MAOS-api`
- Vercel project: `maos-web`
- Vercel target: `Preview`
- Production target: `EXCLUDED`

## Required configuration names

Only names are recorded. No values or credentials are included.

```text
PHASE15D_ROUTING_ENABLED
MAOS_STAGING_AIDOS_AUTHORITY_BASE_URL
MAOS_STAGING_AIDOS_AUTHORITY_READER_ID
MAOS_STAGING_AIDOS_AUTHORITY_KEY_ID
MAOS_STAGING_AIDOS_AUTHORITY_IDENTITY_SUBJECT
MAOS_STAGING_AIDOS_AUTHORITY_HMAC_SECRET
```

Existing governed Staging organization, project, database runtime, migration-owner, and ACL-admin bindings remain prerequisites. Their values must not be copied into this package.

## Human authorization gates

Stop without mutation if any of the following is not exact:

- candidate head or manifest identity;
- migration checksums 0032, 0033, or 0034;
- Railway project, environment, or service target;
- Vercel Preview-only target and Production isolation;
- runtime, migration-owner, steward, ACL-admin, or PUBLIC privilege contract;
- AIDOS `/1.0` compatibility or required credential binding;
- clean candidate scope with no unrelated or excluded untracked files;
- explicit Human authorization for each Staging mutation or deployment step.

## Future authorized sequence

Only after a separate Human approval:

1. Revalidate exact source, target, checksums, secrets-by-presence, and authority identities.
2. Apply governed migrations 0032 through 0034 using the migration owner and canonical migration runner.
3. Apply only the separately approved fixed ACL contract using the provider ACL-admin path.
4. Verify migration replay, runtime least privilege, steward authority, PUBLIC isolation, and restart reconstruction.
5. Deploy the API to Railway Staging only and verify health, readiness, runtime identity, routes, and no startup mutation.
6. Deploy the Web to Vercel Preview only and verify redacted EWP-07 DTO consumption and Production isolation.
7. Keep `PHASE15D_ROUTING_ENABLED` disabled until the separately authorized activation gate is satisfied.

No step in this document is self-authorizing.

## Recovery boundary

If a future Staging verification fails, stop and preserve evidence. Disable the Phase 15D route/consumer feature flag if it had been enabled. Do not fabricate AIDOS authority, select a MAOS-native Development executor, weaken ACL, or rewrite append-only evidence. Schema reversal or destructive recovery requires a separate Human-approved plan.

## Current mutation state

- Staging changed: `NO`
- Production changed: `NO`
- AIDOS changed: `NO`
- Authority changed: `NO`
- Credentials provisioned: `NO`
- Deployment performed: `NO`
- Push performed: `NO`
