# MAOS Stage 2 Backup, RPO, and RTO Plan

Date: 2026-09-09

Status: `DESIGN_READY / RPO_RTO_EVIDENCE_REQUIRED`

Approved targets are RPO <= 1 hour and RTO <= 4 hours. Neither target is currently proven.

## RPO Assessment

Railway scheduled volume backups alone do not demonstrate a one-hour RPO: published schedules are
daily/weekly/monthly snapshots. The approved design therefore uses three independent layers:

1. Railway PostgreSQL PITR with continuous WAL archiving and monitored archive freshness.
2. Railway volume backups for provider-local snapshot recovery and pre-change checkpoints.
3. Encrypted portable logical exports at least hourly to a controlled staging target, followed by
   transfer to company NAS, so provider/project loss is not the only recovery boundary.

PITR availability, plan eligibility, archive lag, retention, regions, costs, and restore behavior
must be verified on the selected Railway account. A configured schedule is not RPO evidence.

## Proposed Schedule and Retention

| Layer | Frequency | Proposed retention | Purpose | Final decision |
| --- | --- | --- | --- | --- |
| Railway PITR/WAL | Continuous; alert before archive lag reaches 30 minutes | Provider window, minimum 14 days desired | Sub-hour recovery point | Account/plan evidence required |
| Railway volume backup | Daily plus exact pre-change snapshot | 7 daily, 4 weekly, 3 monthly desired | Provider-local restore | Backup Owner approval required |
| Encrypted logical export | Hourly; complete and transfer within 45 minutes | 48 hourly, 14 daily, 12 monthly desired | Portable off-provider recovery | Storage/privacy/cost approval required |
| NAS validation copy | Weekly sample plus quarterly full drill | Approved retention/legal policy | Independent recovery proof | NAS capacity and owner evidence required |

## NAS Secondary Backup Design

- Export to a temporary encrypted container using a key referenced by `BACKUP_KEY_REFERENCE`;
  never write an unencrypted durable dump.
- Filename: `maos_<environment>_<UTC timestamp>_<schema version>_<short manifest hash>.dump.enc`.
- The sidecar manifest records ciphertext SHA-256, byte size, source environment reference, schema
  and migration version, tool version, creation/transfer times, retention class, and evidence ID.
- Transfer through an authenticated encrypted channel using a write-only service identity. The
  restore identity is separate and disabled except for approved drills.
- Verify checksum after transfer and monitor last successful export/transfer age. Two consecutive
  failures or age >= 45 minutes is WARNING; age >= 60 minutes is CRITICAL and RPO is at risk.
- If NAS is unavailable, retain the encrypted export in an approved bounded staging target, retry
  with bounded backoff, alert at thresholds, never block database writes indefinitely, and never
  delete the last verified copy.
- Retention deletion is policy-driven, audited, and prohibited during legal/security hold. NAS
  snapshot/off-site replication is recommended but requires a separate human decision.

## Restore Workflow

1. Incident Commander opens an exact recovery record; Restore Owner selects target time and layer.
2. Verify authority, source, backup age, encryption metadata, checksum, schema compatibility, and
   an isolated empty recovery target.
3. Restore to a new Railway PostgreSQL service or isolated recovery environment; never overwrite
   active production solely for a drill.
4. Apply approved recovery steps and validate domain invariants, readiness, audit continuity, and
   sensitive-data controls.
5. Measure recovery point and recovery time. Traffic switch is a separate approved step.
6. Independently verify, preserve immutable evidence, and clean up only under approved rules.

## Measurement and Evidence

- RPO = incident/reference time minus latest fully recoverable committed transaction time.
- RTO = incident/recovery authorization start time to independently verified service readiness;
  record authorization delay separately.
- Record UTC timestamps, backup/PITR IDs, archive coverage, source/target service IDs, checksum,
  sizes, schema versions, actor/role/action audit, redacted operations, health, failures, cleanup,
  and decision.
- Run a production-like isolated restore and DR drill before readiness review. Real production
  evidence requires separate authority and cannot be replaced by this plan.

References: https://docs.railway.com/guides/postgres-backups-restores and
https://docs.railway.com/volumes/point-in-time-recovery.
