# MAOS Stage 3 Human Provider Action Checklist

Date: 2026-09-09

Backup capability assessment recorded: 2026-09-10

Status: `READY_FOR_HUMAN_PROVIDER_ACTION`

This checklist authorizes staging only. Use provider default domains, Singapore for Railway, and no
production credentials or DNS. Record generated identifiers rather than replacing placeholders
before the provider supplies them.

## 1. Vercel

- [ ] Sign in through the human-owned Vercel account and create/select a staging-only project.
- [ ] Connect the MAOS repository without enabling automatic production deployment.
- [ ] Use repository root, Node 24.x, `npm ci`, and
      `npm run build --workspace @maos/web` from `vercel.json`.
- [ ] Add only `MAOS_PUBLIC_API_ORIGIN` as browser-safe staging configuration.
- [ ] Keep every server-only variable absent from browser/build exposure.
- [ ] Deploy to Preview/protected staging using the provider default domain only.
- [ ] Verify default HTTPS, authentication boundary, representative routes and security/correlation
      headers.
- [ ] Record project/deployment IDs, default URL, source commit, build/config checksum, UTC times,
      logs and result. Redact account/private identity data.

## 2. Railway

- [ ] Sign in through the human-owned Railway workspace and create/select a staging-only project.
- [ ] Create a `staging` environment in Singapore (`asia-southeast1-eqsg3a`).
- [ ] Create `maos-api`, `maos-worker`, and PostgreSQL services; record generated IDs.
- [ ] Apply `deploy/railway/api.json` to API and `deploy/railway/worker.json` to worker after reviewing
      the exact provider diff. Do not apply either template to production.
- [ ] Reference PostgreSQL's private `DATABASE_URL` from API and worker; do not expose a TCP proxy
      for application traffic.
- [ ] Enter required server-only staging values directly in Railway according to
      `stage-3-staging-readiness.md`; never paste them into Git/chat/evidence.
- [ ] Give API a provider default public HTTPS domain. Keep worker/PostgreSQL private.
- [ ] Verify API and worker deployment status SUCCESS, Singapore placement, bounded restart policy,
      `/health/live`, `/health/ready`, and failure behavior.
- [ ] Preserve bounded build/runtime logs, metrics and network evidence with secret redaction.

## 3. Database and Backup

- [ ] Verify the database is empty and staging-only, then run the clean migration procedure.
- [ ] Record migration IDs/checksums/schema and successful replay with no drift.
- [x] Record Railway native backup and PITR as `UNAVAILABLE_ON_CURRENT_PLAN`; staging may continue,
      but this remains blocking for Production Ready.
- [ ] Select and approve a Railway plan or capability that supports the unchanged primary native
      backup/PITR design before production-readiness closure.
- [ ] After that capability exists, enable it under a separate exact staging change action and
      capture real archive coverage and health. Do not infer one-hour RPO from configuration.
- [ ] Configure hourly encrypted logical export and write-only NAS transfer after secret references
      and retention are approved.
- [ ] Run restore only after a real backup exists, into a new isolated staging target under separate
      Restore Owner authority; record checksum, application verification and measured RPO/RTO.
- [ ] Keep backup, PITR, RPO and restore status `NOT_VERIFIED` until their required evidence exists.

## 4. Monitoring and Email

- [x] Confirm Vercel and Railway native runtime logs/metrics are available as secondary evidence.
- [ ] Connect the observed provider telemetry to the complete Stage 2 signal and evidence matrix.
- [ ] Configure MAOS Control Room health/evidence references without raw provider payloads.
- [ ] Enter the private email destination and send-only credential in the provider secret store.
- [ ] Test WARNING and CRITICAL delivery, acknowledgement and resolution using synthetic alerts.
- [ ] Confirm no credential, private identity/contact, customer or employee content appears.

Partial real staging evidence is recorded in
`docs/production-readiness/stage-3-monitoring-email-evidence.md`. Provider telemetry availability
does not close the email-alert lifecycle requirements.

## 5. Evidence and Stop Conditions

- [ ] Bind every result to environment/service/deployment IDs, commit, configuration/migration
      versions, UTC time, actor role, evidence checksum and outcome.
- [ ] Stop on production target detection, unexpected DNS request, real production credential,
      unreviewed provider diff, scope mismatch, secret exposure, destructive action, or unknown
      deployment outcome.
- [ ] Do not call staging READY merely because upload/build commands exited successfully. Observe
      exact deployment SUCCESS and run the acceptance checks.
- [ ] Keep `PRODUCTION_READY = NO` and `PRODUCTION_DEPLOYMENT_APPROVED = NO`.

Human provider login and resource creation are now required. This repository task does not perform
them and provides no evidence that Vercel, Railway, PostgreSQL, PITR, NAS, email, or staging URLs
currently exist.
