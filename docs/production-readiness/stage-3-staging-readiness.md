# MAOS Production Gap Closure Stage 3 - Staging Readiness

Date: 2026-09-09

Backup capability assessment recorded: 2026-09-10

Status: `LOCAL_PACKAGING_READY / HUMAN_PROVIDER_ACTION_REQUIRED`

Authorization is limited to non-production staging provisioning. Production provisioning,
production deployment, production credentials, and production DNS mutation remain prohibited.

## Approved Topology

| Component    | Staging target                                 | Local readiness                             | Provider evidence                |
| ------------ | ---------------------------------------------- | ------------------------------------------- | -------------------------------- |
| Control Room | Vercel Preview or protected staging deployment | Vercel request adapter and config ready     | `HUMAN_PROVIDER_ACTION_REQUIRED` |
| Core API     | Railway `staging` environment, Singapore       | start contract and health endpoints ready   | `HUMAN_PROVIDER_ACTION_REQUIRED` |
| Worker       | Railway `staging` environment, Singapore       | start contract and fail-closed health ready | `HUMAN_PROVIDER_ACTION_REQUIRED` |
| PostgreSQL   | Railway `staging` environment, Singapore       | migrations and verification scripts ready   | `HUMAN_PROVIDER_ACTION_REQUIRED` |

Singapore maps to Railway region identifier `asia-southeast1-eqsg3a`. Provider-generated project,
environment, service, deployment, database, domain, and backup IDs must be captured after the human
provider action; none are invented here.

## Railway Backup Capability Assessment

Current-plan assessment:

- Railway native backup: `UNAVAILABLE_ON_CURRENT_PLAN`.
- Railway PITR: `UNAVAILABLE_ON_CURRENT_PLAN`.
- Staging impact: `NON_BLOCKING`; application and migration validation may continue without
  representing backup or recovery as verified.
- Production-readiness impact: `BLOCKING`.

The approved target design is unchanged: Railway native backup/PITR remains the primary backup,
encrypted NAS export remains the secondary backup, RPO remains a one-hour target, and RTO remains a
four-hour target. Native backup, PITR, RPO, restore, and measured RTO/RPO evidence are all
`NOT_VERIFIED`. A Railway plan or provider capability that supplies the approved primary controls
must be selected and evidenced before Production Ready can become YES.

## Vercel Staging Readiness

- Repository-root configuration: `vercel.json`.
- Function entrypoint: `api/control-room.ts`; it delegates to the existing Control Room renderer.
- Install/build: `npm ci`, then `npm run build --workspace @maos/web`.
- Catch-all rewrite: provider default staging URL to `/api/control-room`.
- Default result is the authentication boundary; preview data is not enabled and no identity is
  fabricated. Full authenticated Control Room access requires separately configured organization
  identity/provider integration.
- Required browser-safe variable: `MAOS_PUBLIC_API_ORIGIN`, set to the Railway staging HTTPS URL.
- No database URL, provider token, internal secret, integration token, or backup reference is
  allowed in Vercel browser variables.
- Verify provider default HTTPS, authentication-required page, CSP/frame/content-type headers,
  correlation headers, routing for representative paths, build logs, and deployment source commit.
- Custom production domain and production DNS remain out of scope.

## Railway Staging Readiness

Source-controlled templates:

- `deploy/railway/api.json`
- `deploy/railway/worker.json`

Both use repository-root workspace builds, bounded `ON_FAILURE` restart with three retries,
`/health/ready`, one Singapore replica, and no embedded variables or secret values.

API starts with `npm run start --workspace @maos/api`. `@maos/config` accepts Railway's `PORT`
while preserving `API_PORT` compatibility. Verify `/health`, `/health/live`, `/health/ready`, API
version root, request/correlation headers, readiness failure behavior, and provider restart evidence.

Worker starts with `npm run start --workspace @maos/worker`, binds the provider `PORT` on
`0.0.0.0`, and exposes safe liveness/readiness JSON. Unknown paths are 404 and failed/throwing
dependency readiness is 503. The current readiness callback defaults to process readiness; real
PostgreSQL/queue dependency checks must be wired before staging validation can pass.

API and worker connect to PostgreSQL through Railway private networking. PostgreSQL must not expose
a browser-facing URL or unnecessary TCP proxy. Outbound integration access remains default-deny
and is enabled only for a registered staging integration scope.

## Secret-Name Checklist

| Name                                    | Service            | Classification                 | Required for first staging proof                   |
| --------------------------------------- | ------------------ | ------------------------------ | -------------------------------------------------- |
| `MAOS_PUBLIC_API_ORIGIN`                | Vercel frontend    | Browser-safe URL               | YES                                                |
| `MAOS_ENV`                              | Railway API/worker | Server-only configuration      | YES - `staging`                                    |
| `PORT`                                  | Railway API/worker | Provider runtime configuration | Provider supplied                                  |
| `DATABASE_URL`                          | Railway API/worker | Server-only secret             | YES - Railway reference                            |
| `MAOS_DATABASE_MIGRATION_TARGET`        | Migration job only | Server-only confirmation       | YES - exact `staging` during an approved migration |
| `MAOS_PUBLIC_ORIGIN`                    | Railway API        | Server-only configuration      | YES - staging HTTPS URL                            |
| `MAOS_SERVICE_IDENTITY`                 | Railway API/worker | Server-only identity           | YES                                                |
| `DATABASE_SECRET_REFERENCE`             | Railway API/worker | Server-only secret reference   | YES                                                |
| `DEPLOYMENT_PROVIDER_REFERENCE`         | Railway API/worker | Server-only provider reference | YES                                                |
| `BACKUP_KEY_REFERENCE`                  | Backup/export job  | Server-only secret reference   | Before backup proof                                |
| `MAOS_AUTH_CREDENTIAL_REFERENCE`        | Railway API        | Server-only secret reference   | Before authenticated access                        |
| `MAOS_EMAIL_ALERT_CREDENTIAL_REFERENCE` | Alert sender       | Server-only secret reference   | Before alert proof                                 |
| `NAS_BACKUP_CREDENTIAL_REFERENCE`       | Backup/export job  | Server-only secret reference   | Before NAS proof                                   |

Only names/references belong in repository evidence. Values are entered by the human in the exact
provider staging environment and must never be copied into commands, logs, screenshots, or Git.

## Database Migration and Recovery Procedure

1. Create isolated Railway staging PostgreSQL in Singapore and reference its private
   `DATABASE_URL` from API/worker.
2. Capture empty-database identity, PostgreSQL version, region and configuration without secrets.
3. Run `npm run db:verify` locally to verify clean PGlite initialization and deterministic replay;
   this command never migrates staging PostgreSQL.
4. Under exact staging migration authorization, set `MAOS_ENV=staging` and
   `MAOS_DATABASE_MIGRATION_TARGET=staging` in the bounded migration process, then run
   `npm run db:migrate:postgres` with the verified staging `DATABASE_URL`. Production migration
   and application-startup auto-migration remain disabled.
5. Record applied migration IDs/checksums, schema version and health. Re-run
   `npm run db:migrate:postgres`; require all 19 migrations skipped with no checksum drift.
6. Record native backup and PITR as unavailable on the current Railway plan. Do not create backup,
   PITR, RPO, or restore evidence from this assessment.
7. Configure an hourly encrypted logical export and NAS transfer only after key/NAS references are
   present. Alert at 45 minutes and treat 60 minutes as RPO-at-risk.
8. Select and approve a Railway plan or capability supporting the primary native backup/PITR design
   before production-readiness closure.
9. Under separate restore authorization and only after a real backup exists, restore into a new
   isolated staging database, verify checksum/schema/application readiness, and measure RPO/RTO.
   Configuration or a documented procedure alone is not proof.

## Monitoring, Alerts, and Staging Isolation

- Vercel: deployment/build/runtime logs, default HTTPS, function failures and synthetic page check.
- Railway: deployment/build/runtime logs, CPU/memory, restarts, API/worker health and PostgreSQL
  connections/storage. PITR archive health remains unavailable until the required plan capability
  exists and must not be reported as healthy.
- Control Room: governed service, integration, incident, blocker and evidence references; UNKNOWN
  never renders as healthy.
- Email: INFO remains Control Room only; WARNING sends email; CRITICAL sends email plus prominent
  Control Room state. Private email destination remains outside Git.
- Staging uses separate provider environment, database, identities, secret references, URLs,
  deployments and evidence namespace. No production credential, DNS, data or Approval may be reused.

### Monitoring evidence collected 2026-09-11

Real staging health requests, Railway HTTP logs and metrics, and Vercel runtime logs are recorded in
`docs/production-readiness/stage-3-monitoring-email-evidence.md`. Native provider telemetry is
available as secondary evidence and the unauthenticated operations path correctly failed closed.
The Control Room monitoring view, degraded-health alert generation, email delivery,
acknowledgement, escalation, and recovery remain `NOT_VERIFIED`; this partial observation does not
close G07.

## Required Evidence Matrix

| Evidence                  | Minimum acceptance                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Staging deployment        | Provider IDs/status SUCCESS, Singapore region where applicable, source commit, build/config hash and UTC times |
| Frontend/API connectivity | Vercel default HTTPS to Railway staging API, CORS/origin result, correlation continuity and no secret exposure |
| Worker health             | liveness/readiness, dependency-failure 503, restart behavior, heartbeat and bounded retry                      |
| DB migration              | clean initialization, migration checksums/schema version, replay/skips and no drift                            |
| Backup                    | provider backup/PITR IDs, archive freshness, encrypted export manifest and checksums                           |
| Restore                   | separate staging target, exact source, integrity/application checks and measured RPO/RTO                       |
| Monitoring                | dashboards/signals, synthetic checks, redaction and provider/Control Room correlation                          |
| Alerts                    | WARNING/CRITICAL delivery, acknowledgement, escalation and resolution lifecycle                                |
| Rollback                  | exact known-good deployment, approval, rollback status, measured recovery and post-checks                      |

Until these provider-generated results exist, staging validation and all production classifications
remain incomplete.
