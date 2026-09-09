# MAOS Stage 2 Secrets Map

Date: 2026-09-09

Status: `REFERENCE_CONTRACT_READY / VALUES_NOT_CONFIGURED`

No value appears in this document. Vercel stores Vercel-scoped values; Railway stores Railway
service values. Source code and MAOS evidence store names and `secretref://` references only.

| Variable/reference | Provider/service owner | Scope | Rotation/revocation/emergency disable | Browser exposed? |
| --- | --- | --- | --- | --- |
| `MAOS_PUBLIC_API_ORIGIN` | Vercel frontend | Production frontend; non-secret HTTPS origin | Change with API promotion; revert configuration/deployment on error | YES |
| `MAOS_ENV` | Vercel/Railway service owner | Exact service environment | Configuration review; disabling means stop deployment/service | NO |
| `MAOS_PUBLIC_ORIGIN` | Railway API | API canonical HTTPS origin | Change with DNS/TLS validation; emergency disable ingress | NO |
| `MAOS_SERVICE_IDENTITY` | Railway API/worker | One identity per service/environment | Replace, revoke old policy, restart/redeploy, verify audit | NO |
| `DATABASE_URL` | Railway API/worker via Postgres reference | Private service-to-database | Rotate DB credential, update consumers, verify, revoke old | NO |
| `DATABASE_SECRET_REFERENCE` | Railway API/worker | Database credential contract reference | Update with credential rotation and evidence | NO |
| `DEPLOYMENT_PROVIDER_REFERENCE` | Deployment governance | Exact provider/environment identity | Revoke provider access and disable promotion workflow | NO |
| `BACKUP_KEY_REFERENCE` | Railway backup/export job | Backup encryption key reference | Dual-key rotation, test decrypt, then revoke old | NO |
| `MAOS_AUTH_CREDENTIAL_REFERENCE` | Railway API | Authentication verifier reference | Issue new, overlap briefly, verify, revoke old | NO |
| `MAOS_INTERNAL_SERVICE_SECRET_REFERENCE` | Railway API/worker | Internal service authentication | Rotate both ends; stop private calls on suspected leak | NO |
| `MAOS_INTEGRATION_TOKEN_REFERENCE` | Owning Railway service | One system/environment/purpose | Provider revoke, reference disable, audit, scoped reissue | NO |
| `MAOS_EMAIL_ALERT_CREDENTIAL_REFERENCE` | Railway alert sender | Send-only email route | Rotate provider credential; emergency disable sender | NO |
| `NAS_BACKUP_CREDENTIAL_REFERENCE` | Railway export job | Write-only NAS backup target | Revoke transfer identity, pause exports, rotate and verify | NO |

Provider-generated Railway Postgres variables may map to `DATABASE_URL` only through provider
reference syntax; never copy resolved values into Git or a browser-visible Vercel variable.

## Least Privilege and Lifecycle

- Separate production from preview/staging values and identities.
- Scope API and worker independently; do not use one wildcard provider token.
- Database application, backup/export, and restore identities are distinct.
- Vercel sensitive values are project/environment scoped. Changes apply to new deployments, so
  rotation requires exact redeployment and verification before old credential revocation.
- Railway variable changes can redeploy services. Treat each production change as governed.
- Emergency disable order: revoke token or deny policy, stop affected integration/service,
  preserve audit evidence, rotate reference, verify clean logs, then explicitly resume.
- Quarterly access review and event-driven rotation are planning baselines; the Security Owner
  approves final intervals and any shorter provider requirement.

## Leakage Verification

Before and after future configuration, scan the repository, inspect bounded build/runtime logs,
check frontend bundles/source maps and response headers, and verify sealed-variable names without
revealing values. Never use reveal modes, shell command-line values, screenshots, tickets, chat, or
evidence payloads for secrets. Any value exposure opens a security incident.

References: https://vercel.com/docs/environment-variables,
https://vercel.com/docs/environment-variables/rotating-secrets, and
https://docs.railway.com/guides/variables.
