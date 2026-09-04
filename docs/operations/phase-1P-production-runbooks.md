# Phase 1P Production Readiness Runbooks

Status: PREPARATION ONLY — no production deployment is authorized by Phase 1P.

These runbooks preserve the MAOS boundaries `Review != Approval`, `QA PASS != Production Approval`, and `Backup != Recovery`. Every production action requires a separately recorded human approval bound to the exact artifact, environment, and configuration version.

## Environment model

| Environment | Purpose | Data | Deployment authority |
| --- | --- | --- | --- |
| development | Developer verification | Synthetic/local | Developer |
| preview | Automated and integration verification | Synthetic | CI/operator |
| staging | Release rehearsal and recovery exercise | Sanitized/non-production | Release operator |
| production | Customer workload | Production | Explicit human production approver |

Configuration and credential values must be supplied through external secret references. Production requires HTTPS origins, non-debug logging, migration automation disabled, a known rollback artifact, and separate deployment authority.

## Operational ownership

Before a go/no-go review, assign named humans or on-call groups to these logical roles:

- production owner
- release approver
- deployment operator
- incident commander
- database recovery operator
- security escalation owner

Role identifiers in source are ownership contracts, not proof that staffing is complete. Missing or unavailable ownership is a no-go condition.

## Pre-deployment checklist

Purpose: establish that a release candidate is safe to present for human approval.

Checks:

1. Verify the exact Git commit and immutable artifact checksum.
2. Run format, lint, typecheck, tests, build, database verification, module-boundary checks, repository safety scan, and bounded readiness verification.
3. Verify production configuration using secret references only; never print resolved values.
4. Verify a fresh encrypted backup and a successful restore exercise in test or staging.
5. Validate migrations under an acquired deployment lock with destructive automatic migration disabled.
6. Confirm health, readiness, metrics, alert routes, runbooks, rollback artifact, and operational owners.
7. Bind the human approval to the exact artifact checksum, environment, configuration version, and migration plan.

Escalation: any mismatch, stale backup, unknown health, missing owner, failed gate, or unbound approval is a no-go.

## Release approval

Purpose: authorize one immutable release candidate, not a general capability to deploy.

Checks: the approval target must contain the exact release ID, source commit, artifact ID and checksum, configuration version, target environment, evidence set, and migration plan. The author, reviewer, QA actor, approver, and executor must satisfy separation-of-duty rules. Denied, stale, mismatched, revoked, consumed, or missing approval fails closed.

Safe action: record an approval through the existing Phase 1.7 authority boundary. QA evidence and review evidence are inputs; neither grants production authority.

## Deployment

Purpose: provide a controlled procedure for a future authorized deployment. Phase 1P does not execute it.

Safe actions:

1. Confirm the approval remains valid and unconsumed immediately before execution.
2. Promote the already-built artifact; do not rebuild for production.
3. Apply the reviewed migration plan while holding the deployment lock.
4. Record actor, action, target, result, correlation identifiers, artifact checksum, and evidence references.

## Post-deployment verification

1. Verify `/health`, `/health/live`, and `/health/ready`, schema version, error rate, latency, worker availability, and integration health.
2. Recalculate the deployed artifact checksum and compare it with the approved checksum.
3. Execute the approved smoke and integration checks and retain correlated evidence.
4. Keep the release observation window open until the human release owner closes it.

Rollback: stop progression and follow the rollback runbook if any mandatory signal fails or becomes unknown.

## Failed deployment

Symptoms: provider failure, timeout, cancelled execution, checksum mismatch, failed health verification, or incomplete evidence.

Safe actions: stop further promotion, mark the deployment failed, preserve provider and MAOS evidence, consume or revoke the failed approval, and evaluate rollback against the known-good artifact. Retry requires a new exact approval and must never reuse ambiguous or consumed authority.

## Rollback

Symptoms: readiness failure, elevated error rate, migration failure, data-integrity warning, security alert, or operator kill switch.

Diagnosis:

1. Correlate deployment, audit, application, and infrastructure events.
2. Determine whether the failure is application-only or includes schema/data changes.
3. Preserve evidence before changing state.

Safe actions:

1. Invoke the kill/revocation control and stop new work.
2. Revoke the active deployment authorization.
3. Promote the recorded known-good artifact using a new, exact human approval.
4. If data recovery is required, use a verified backup and the recovery procedure; never treat artifact rollback as database recovery.
5. Verify health, readiness, schema compatibility, and representative read/write paths.

Escalation: the incident commander owns the decision. Destructive database recovery requires database recovery authority and separate evidence.

## Backup and recovery

Purpose: prove recoverability, not merely backup creation.

Policy foundation:

- backups must record checksum, creation time, retention, encryption metadata, source environment, and schema version;
- restore exercises use test or staging only during Phase 1P;
- backup freshness and integrity must pass before recovery starts;
- production restore is prohibited by the Phase 1P runtime;
- provisional planning targets are RPO 60 minutes and RTO 120 minutes until measured production requirements are approved.

Recovery exercise:

1. Select a non-production target and a verified encrypted backup.
2. Restore with an authorized human recovery operator.
3. Validate checksum, schema version, record integrity, and application readiness.
4. Record elapsed time and the recoverable data point.
5. Mark RPO/RTO as measured only after representative infrastructure evidence exists.

## Migration failure

Symptoms: migration transaction fails, lock is lost, schema version differs, or application readiness fails.

Safe actions:

1. Stop deployment and retain the migration error and correlation ID.
2. Confirm the failed migration left no partial schema change.
3. Do not retry a destructive migration automatically.
4. Restore or roll forward only under the reviewed plan and explicit human authority.
5. Re-run clean initialization and migration replay before resubmission.

## Service unavailable

Checks: distinguish liveness, readiness, dependency health, runner health, database connectivity, and gateway availability. `UNKNOWN` is not `HEALTHY`.

Safe actions: stop new executions, cancel or pause bounded work, preserve queued tasks, inspect correlated failures, and restore dependencies in this order: database, Core API, worker, Control Room, integrations.

Escalation: page the production owner and incident commander. Do not bypass authorization, approval, or dependency health gates.

## Secret or configuration failure

Symptoms: unresolved secret reference, plaintext credential detection, wrong environment binding, debug mode in production, or unsafe origin.

Safe actions:

1. Fail closed and redact values from logs and evidence.
2. Revoke the affected credential through the external secret owner.
3. Correct the reference or environment binding without committing a value.
4. Re-run configuration validation, repository safety scan, and affected security tests.

Escalation: notify the security escalation owner. A suspected exposed credential is an incident, not a routine deployment retry.

## Emergency stop

Purpose: stop unsafe activity while preserving human authority and evidence.

1. Invoke the registered kill switch or runner revocation.
2. Prevent new tasks, runs, and tool calls from starting.
3. Cancel safe-to-cancel work and quarantine uncertain work for human review.
4. Preserve audit records, artifacts, and correlated operational events.
5. Require explicit human authorization before resuming.

Verification: confirm execution is stopped, permissions are revoked, readiness reports the degraded state, alerts are correlated, and the incident owner acknowledges control.

## Security and penetration-readiness checklist

Attack surface: Core API and validation envelope, authentication and authorization middleware, approval/authority evaluation, ToolCall and local bridge boundaries, file paths/workroots, command policy, gateway/provider adapters, database migrations, Control Room actions, logs, evidence, and audit queries.

Automated checks required before go/no-go:

- missing/invalid authentication and 401 behavior;
- authorization default deny, explicit-deny precedence, and 403 behavior;
- stale/mismatched/consumed approval and authority bypass rejection;
- input validation, stable error disclosure, and security headers;
- path traversal, absolute-path escape, command-control syntax, and privilege escalation rejection;
- secret redaction in logs, results, evidence, and UI;
- append-only audit integrity and actor/action/target/result proof;
- dependency advisory audit and repository secret/artifact scan.

External penetration testing is `HUMAN_ACTION_REQUIRED` before production approval. It must target an explicitly authorized non-production environment and must not be inferred from local automated checks.

## Dependency update policy

Use a committed lockfile, reproducible `npm ci`, reviewed update pull requests, automated tests/build/audit, and immutable artifact checksums. High or critical advisories block a production candidate until removed, mitigated, or explicitly risk-accepted by the authorized human security owner. Dependency updates must not silently broaden runtime authority or production access.
