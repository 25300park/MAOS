# MAOS Production Gap Closure — Stage 1 Readiness Package

Date: 2026-09-09

Status: `READY_FOR_HUMAN_INPUT / NON_PRODUCTION_ONLY`

This package defines the technical contracts and evidence formats required before production work
can be authorized. It contains no provider account, region, domain, network identifier, credential,
secret value, backup target, production artifact, or human assignment.

## 1. Production Environment Readiness Contract

All unresolved values remain explicit. A value of `HUMAN_ACTION_REQUIRED` is blocking and must not
be replaced with a guessed default.

| Field | Current value | Required contract | Acceptance evidence |
| --- | --- | --- | --- |
| Provider | `HUMAN_ACTION_REQUIRED` | Approved provider identity and `providerref://` registry reference | Human approval, provider ownership, support/escalation and security assessment |
| Account/subscription | `HUMAN_ACTION_REQUIRED` | Non-secret production account reference owned by the Production Owner | Account inventory reference and access review |
| Primary region | `HUMAN_ACTION_REQUIRED` | Approved region satisfying residency, latency, recovery and cost decisions | Region decision and provider capability evidence |
| Recovery region/location | `HUMAN_ACTION_REQUIRED` | Failure-independent recovery location consistent with approved RPO/RTO | DR topology and dependency review |
| Environment identity | `HUMAN_ACTION_REQUIRED` | Unique production environment ID; isolated from development, preview and staging | Registry record, isolation checks and ownership |
| Network | `HUMAN_ACTION_REQUIRED` | Production network/subnet/security-boundary references | Reviewed network inventory and policy results |
| DNS zone/domain | `HUMAN_ACTION_REQUIRED` | Approved public/private zone and exact service names | Domain ownership and change authority |
| TLS certificate | `HUMAN_ACTION_REQUIRED` | Approved certificate-manager reference and renewal policy | Valid chain, hostname, expiry and renewal evidence |
| Secret manager | `HUMAN_ACTION_REQUIRED` | Approved external secret-manager reference | Provider, owner, access policy and rotation evidence |
| Monitoring destination | `HUMAN_ACTION_REQUIRED` | Approved log/metric/trace/alert destination references | Retention, access, redaction and routing evidence |
| Backup target | `HUMAN_ACTION_REQUIRED` | Encrypted, isolated, immutable/retained backup-target reference | Retention, key-reference, checksum and restore evidence |
| Rollback target | `HUMAN_ACTION_REQUIRED` | Known-good release/artifact/configuration/schema compatibility references | Immutable hashes and successful production-like rehearsal |

Production configuration must preserve:

- `MAOS_ENV=production`
- `MAOS_DEBUG=false`
- `MAOS_AUTO_MIGRATE=false`
- `MAOS_PUBLIC_ORIGIN=https://<HUMAN_ACTION_REQUIRED>`
- `MAOS_SERVICE_IDENTITY=system-<HUMAN_ACTION_REQUIRED>`
- `DEPLOYMENT_PROVIDER_REFERENCE=providerref://<HUMAN_ACTION_REQUIRED>`
- `DATABASE_SECRET_REFERENCE=secretref://<HUMAN_ACTION_REQUIRED>`
- `BACKUP_KEY_REFERENCE=secretref://<HUMAN_ACTION_REQUIRED>`
- `API_PORT=<HUMAN_ACTION_REQUIRED>` within 1–65535
- `DATABASE_URL` resolved only at runtime from the approved secret manager; never committed or
  emitted as evidence

Readiness status: the contract package is `READY`; the environment itself is `HUMAN_BLOCKED` until
provider, region, ownership, domain and target decisions are recorded.

## 2. Secret Manager Readiness

### Reference contract

Secret references use an opaque reference such as:

`secretref://<approved-secret-manager>/<production>/<service>/<secret-id>`

The reference may identify a secret but must not contain usernames, passwords, tokens, private
keys, connection strings or resolved secret material.

### Environment mapping

| Application input | Source | Required scope | Repository treatment |
| --- | --- | --- | --- |
| `DATABASE_SECRET_REFERENCE` | External secret-manager reference | API/worker production database client only | Reference permitted; value prohibited |
| `DATABASE_URL` | Runtime resolution of the database reference | Exact service identity, environment and database role | Never committed, logged or stored in evidence |
| `BACKUP_KEY_REFERENCE` | External key/secret reference | Backup writer and authorized restore workflow only | Reference permitted; key material prohibited |
| `DEPLOYMENT_PROVIDER_REFERENCE` | Provider registry reference | Deployment adapter metadata only | Non-secret reference permitted |
| `MAOS_SERVICE_IDENTITY` | Identity registry/configuration | Exact production service | Non-secret identifier permitted |

### Least privilege

- Separate application runtime, migration, backup, restore, deployment and emergency identities.
- Grant only the exact resource, environment, action and validity window required.
- The application runtime identity cannot administer secrets, restore backups or deploy releases.
- The deployment operator cannot approve its own deployment.
- Backup write authority does not imply restore authority.
- Human break-glass access is time-bound, independently approved, audited and revoked after use.

### Rotation and revocation process

1. Security Owner authorizes the exact secret reference, identity and rotation window.
2. Create a new secret version in the external manager without exposing it to MAOS evidence.
3. Validate consumer access using a non-printing health check.
4. Switch the version reference or provider alias using a governed configuration change.
5. Verify health/readiness and authentication behavior.
6. Revoke the prior version and confirm it can no longer authenticate.
7. Record actor/action/target/result, timestamps and reference IDs without resolved values.

### Emergency disable

On suspected leakage, authentication anomaly or authority loss: declare a security incident, stop
affected executions, revoke the exact credential and service session, disable the affected provider
binding, preserve redacted audit/evidence, rotate through the external manager, revalidate health
and require human authorization before resume.

### Leakage verification

- Run repository secret/artifact scanning before every release.
- Scan build logs, application logs, evidence, error envelopes and generated artifacts using
  approved non-secret detectors.
- Verify bearer-like values and secret-shaped keys are redacted.
- A confirmed or uncertain leak is `HUMAN_BLOCKED` and opens an incident; it is never handled as a
  routine retry.

Secret-manager contract status: `READY`. Provider selection, named Security Owner and real
rotation/revocation evidence remain `HUMAN_BLOCKED` and `PRODUCTION_EVIDENCE_PENDING`.

## 3. Network / DNS / TLS Readiness

### Required DNS records

| Record purpose | Record type | Value status | Requirement |
| --- | --- | --- | --- |
| Control Room/Core API public origin | Provider-appropriate `A`, `AAAA`, `CNAME` or alias | `HUMAN_ACTION_REQUIRED` | Exact hostname must match `MAOS_PUBLIC_ORIGIN` and approved ingress |
| Certificate validation | Provider/CA-required validation record | `HUMAN_ACTION_REQUIRED` | Managed through approved DNS authority with expiry cleanup |
| Operational verification | Provider-appropriate health hostname or internal record | `HUMAN_ACTION_REQUIRED` | Must not expose private administration interfaces |

No MX, TXT, service-discovery or domain-verification record is required unless the selected
provider contract demonstrates that requirement. Records must not be invented in advance.

### TLS requirements

- TLS 1.2 minimum; prefer TLS 1.3 where provider compatibility permits.
- Trusted certificate chain, exact hostname coverage, secure key handling and automated renewal.
- Redirect or reject plaintext HTTP according to approved ingress policy.
- Disable obsolete protocols/ciphers and validate HSTS/security headers where appropriate.
- Monitor certificate expiry and renewal failure with named alert ownership.
- Never place certificate private keys in Git or application configuration.

### Network and firewall requirements

- Default-deny ingress; expose only the approved HTTPS entry point and explicitly required health
  path from approved monitors/load balancers.
- Keep databases, secret managers, administration endpoints and internal workers non-public.
- Restrict egress to registered dependencies, update/audit services and explicitly approved
  integration endpoints; preserve DNS resolution and certificate validation requirements.
- Separate production from development, preview and staging networks and identities.
- Log accepted/denied network decisions without sensitive payloads.
- Define operator access, emergency revocation and provider-level denial controls.

### Health endpoints

- `/health`: aggregate service status without sensitive dependency detail.
- `/health/live`: process liveness only.
- `/health/ready`: readiness including mandatory dependency health; `UNKNOWN` is not healthy.

### Validation checklist

- [ ] Named DNS/network change authority assigned.
- [ ] Exact domains, provider ingress and network identifiers approved.
- [ ] DNS ownership and rollback/time-to-live plan verified.
- [ ] Ingress allowlist and denial tests completed.
- [ ] Egress allowlist and unexpected-destination denial tests completed.
- [ ] Database/secret/admin endpoints confirmed non-public.
- [ ] Certificate chain, hostname, protocol, cipher and expiry checks passed.
- [ ] HTTP/TLS redirect or rejection and security headers passed.
- [ ] Health endpoints return expected status through the intended path.
- [ ] Monitoring detects certificate, DNS, ingress and readiness failures.
- [ ] Evidence contains no credentials, private keys or private network secrets.

Checklist status: `READY`. Real values and validation remain `HUMAN_ACTION_REQUIRED` and
`PRODUCTION_EVIDENCE_PENDING`; no DNS or provider mutation is authorized by this package.

## 4. Backup / Restore Readiness

### Backup design

- Source: exact production database/environment and schema-version references.
- Target: approved isolated backup target with immutable retention where supported.
- Encryption: approved provider encryption at rest and in transit; key material remains external
  and only `BACKUP_KEY_REFERENCE` is recorded.
- Integrity: cryptographic checksum, backup ID, creation time, source environment, schema version,
  tool/provider version, size and completion status.
- Retention: `HUMAN_ACTION_REQUIRED` until business, legal, privacy, RPO and cost requirements are
  approved. Expiry and deletion require governed evidence.
- Access: backup writer, restore operator and verifier are distinct scoped roles where required.

### Restore workflow

1. Record exact human restore authorization, source backup, isolated target and data-handling scope.
2. Verify backup freshness, checksum, encryption/key reference, schema version and retention state.
3. Confirm target isolation, capacity, network denial, monitoring and cleanup plan.
4. Restore without changing the active production workload.
5. Verify checksum, schema, row/object integrity, application readiness and representative paths.
6. Record start, usable-service, full-verification and cleanup timestamps.
7. Have an independent verifier sign the result; classify failures and open incidents.
8. Destroy or retain the isolated target only under the approved retention/data-handling decision.

### Restore evidence format

| Field | Required value |
| --- | --- |
| Evidence classification | `REAL_PRODUCTION`, `PRODUCTION_LIKE`, `TEST_DATA`, or `SIMULATED` |
| Backup identity | Provider backup reference and immutable checksum |
| Source/target | Opaque environment and resource references |
| Authority | Named human Approval and restore operator references |
| Versions | Schema, application, configuration and restore-tool versions |
| Timeline | Backup point, exercise start, data available, service ready, verification complete |
| Results | Integrity, readiness, representative-path and cleanup outcomes |
| Correlation | Incident/change, event, evidence and audit references |
| Decision | `PASS`, `FAIL`, `BLOCKED` or `NOT_RUN` with independent verifier |

### RPO/RTO measurement

- RPO is the elapsed time between the last recoverable committed data point and the declared
  disruption point.
- RTO is measured from the declared disruption/start decision until the restored service satisfies
  the approved readiness and representative verification criteria.
- Record provider timestamps, MAOS correlation time, clock source, excluded intervals and variance
  from human-approved objectives.
- The prior 60-minute RPO and 120-minute RTO are provisional only; Stage 1 does not approve them.

Backup/restore design status: `READY`. Retention, targets, owners and objectives are
`HUMAN_BLOCKED`; real production-infrastructure restore and measured RPO/RTO remain
`PRODUCTION_EVIDENCE_PENDING`.

## 5. Observability / Incident Readiness

### Production monitoring checklist

- [ ] API/worker process liveness and readiness.
- [ ] Database availability, connection saturation, migration/schema mismatch and backup status.
- [ ] Request rate, errors, latency percentiles and saturation against approved SLOs.
- [ ] Queue/task/run/loop backlog, timeout, cancellation, failure and no-progress indicators.
- [ ] Tool/provider/runner and integration health with `UNKNOWN` preserved.
- [ ] Authentication/authorization denial, approval mismatch and security-control events.
- [ ] DNS, TLS certificate, ingress, egress and provider health.
- [ ] Cost/usage budgets and unexpected growth.
- [ ] Redaction and audit-chain integrity checks.

### Alert routing and acknowledgement

Alerts route by service, environment, severity and owning role. Every alert includes a correlation
ID, first/last observed time, current health, affected target, safe summary, runbook reference and
acknowledgement deadline. Routing destinations remain `HUMAN_ACTION_REQUIRED` until named owners
and an approved paging provider exist.

| Severity | Meaning | Initial owner | Acknowledgement objective |
| --- | --- | --- | --- |
| SEV-1 | Active or imminent customer, security, data-integrity or broad availability impact | Incident Commander | `HUMAN_ACTION_REQUIRED` |
| SEV-2 | Major degradation or failed critical dependency with bounded impact | Production Owner/on-call | `HUMAN_ACTION_REQUIRED` |
| SEV-3 | Limited degradation, capacity risk or recoverable operational failure | Service owner | `HUMAN_ACTION_REQUIRED` |
| SEV-4 | Informational condition or planned follow-up | Service owner | `HUMAN_ACTION_REQUIRED` |

### Escalation and incident control

1. Alert receiver acknowledges and validates the affected environment and evidence.
2. SEV-1/SEV-2 pages the Incident Commander and Production Owner; security or data events also page
   the Security Owner and Backup/Restore Owner as applicable.
3. Incident Commander owns coordination, severity changes, stop/kill decision and recovery order.
4. Deployment Approver authority remains separate; incident response cannot create general deploy
   authority.
5. Rollback Authority authorizes the exact known-good rollback target; database recovery requires
   Restore Owner authority.
6. Preserve redacted event/evidence and actor/action/target/result Audit records.
7. Close only after recovery verification, residual-risk decision and follow-up ownership.

Runbook references:

- `docs/operations/phase-1P-production-runbooks.md#service-unavailable`
- `docs/operations/phase-1P-production-runbooks.md#failed-deployment`
- `docs/operations/phase-1P-production-runbooks.md#rollback`
- `docs/operations/phase-1P-production-runbooks.md#backup-and-recovery`
- `docs/operations/phase-1P-production-runbooks.md#secret-or-configuration-failure`
- `docs/operations/phase-1P-production-runbooks.md#emergency-stop`

### Incident evidence format

Record incident ID, severity, environment/system references, detected/acknowledged/mitigated/
recovered/closed times, named incident authority, affected SLOs, correlated alerts/events/audit,
actions and exact approvals, rollback/recovery evidence, customer/privacy assessment, residual risk,
root-cause status and follow-up owner. Never include secrets or private payloads.

Observability/incident contract status: `READY`. Real destinations, acknowledgement objectives,
named owners, routing tests and production telemetry remain `HUMAN_BLOCKED` or
`PRODUCTION_EVIDENCE_PENDING`.

## 6. Stage 1 Exit Boundary

Stage 1 prepares contracts and checklists only. It does not close real infrastructure, external
validation or production-evidence gaps. Exit requires:

- this package and the authority matrix accepted for human completion;
- every gap represented in the execution register;
- no plaintext credential or invented provider value;
- frozen architecture and runtime source unchanged; and
- required repository verification passing.

The next action is human assignment and provider/objective selection. No Stage 2 external or
production action may begin solely because this package is marked ready.
