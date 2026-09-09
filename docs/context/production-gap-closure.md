# MAOS Production Gap Closure Plan

Date: 2026-09-09

Status: `STAGE_1_PREPARED / HUMAN_DECISIONS_REQUIRED`

## Goal

Close the evidence and human-authority gaps that currently keep MAOS from being classified as
production-ready or production-deployment approved, without changing MAOS Architecture v1.1,
entering credentials, connecting production systems, or performing a deployment during planning.

Current classifications remain:

- `ENTERPRISE_MVP = COMPLETE`
- `PRODUCTION_PREPARATION_COMPLETE = YES`
- `PRODUCTION_READY = NO`
- `PRODUCTION_DEPLOYMENT_APPROVED = NO`

Source evidence:

- `docs/implementation/phase-1P-production-readiness-evidence.md`
- `docs/implementation/phase-1P-final-production-gate-evidence.md`
- `docs/implementation/phase-12-enterprise-production-readiness-evidence.md`
- `docs/implementation/phase-13-roadmap-completion-evidence.md`
- `docs/operations/phase-1P-production-runbooks.md`
- `docs/architecture/MAOS-FRZ-002-architecture-freeze-v1.1.md`

Stage 1 control package:

- `docs/production-readiness/stage-1-readiness-package.md`
- `docs/production-readiness/stage-1-operational-authority-matrix.md`
- `docs/production-readiness/production-gap-register.md`

## Governing Boundaries

- MAOS Architecture v1.1 is approved/frozen. Any required architecture change must stop this plan
  and enter normal Change Request governance.
- Human Authority > AI Authority. QA, review, test, simulation, or AI recommendation cannot grant
  production Approval.
- Production credentials and resolved secret values must remain in an approved external secret
  manager and must never enter Git, logs, prompts, test fixtures, artifacts, or this plan.
- `SIMULATED`, `LOCAL_BOUNDED`, `TEST_DATA`, `PRODUCTION_LIKE`, and `REAL_PRODUCTION` are distinct
  evidence classes and cannot substitute for one another.
- Every external test, production mutation, restore, deployment, rollback, DNS change, payment, or
  provider action requires separate explicit authorization at execution time.
- Build once and promote the same immutable artifact. Approval must bind the exact release,
  commit, artifact hash, configuration version, migration plan, evidence set, environment and
  rollback target.

## Classification

- `A. HUMAN_ACTION_REQUIRED`: a named authorized human must decide, own, approve, or accept risk.
- `B. TECHNICAL_ACTION_REQUIRED`: engineering or operations must configure or implement a
  controlled capability after the required human decision and authorization.
- `C. EXTERNAL_VALIDATION_REQUIRED`: an independent or external party must validate a claim under
  explicit authorization and a defined test scope.
- `D. PRODUCTION_EVIDENCE_REQUIRED`: representative or real-environment evidence must be captured;
  simulation and local evidence do not close the gap.

`BLOCKING` means the item must close before the gate named in the final column can pass.

## Gap Register and Recommended Order

| Order | Gap / closure action | Category | Owner type | Prerequisite | Evidence required | Blocking / gate impact |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Assign named operational authorities: production owner, platform owner, security owner, incident commander, backup/recovery owner, deployment operator, deployment approver, and rollback authority | A. HUMAN_ACTION_REQUIRED | Executive sponsor plus accountable operations leadership | Approved responsibility model and separation-of-duties rules | Dated owner register with named people, alternates, contact/escalation route, authority scope, acknowledgement, and review cadence | BLOCKING — Production Ready |
| 2 | Approve service objectives, recovery objectives, risk thresholds, maintenance windows, data residency, provider/region constraints, and production budget | A. HUMAN_ACTION_REQUIRED | Business owner, production owner, security owner, and recovery owner | Named owners from Order 1; business impact analysis | Signed decision record defining SLOs, error budget, capacity headroom, approved RPO/RTO, retention, risk acceptance limits, and maintenance constraints | BLOCKING — Production Ready |
| 3 | Select and authorize the production provider and infrastructure topology | A. HUMAN_ACTION_REQUIRED | Production owner, security owner, finance/procurement authority | Orders 1–2; frozen-architecture compatibility review | Provider/region decision, responsibility matrix, security/compliance assessment, support and escalation terms, approved cost boundary, and architecture-conformance record | BLOCKING — Production Ready |
| 4 | Provision isolated production infrastructure and a production environment | B. TECHNICAL_ACTION_REQUIRED | Platform engineering under production-owner authority | Order 3; approved infrastructure-as-code and change record | Reviewed infrastructure plan/apply evidence, resource inventory, environment identity, least-privilege service identities, configuration references, isolation tests, drift baseline, and provider health evidence | BLOCKING — Production Ready |
| 5 | Integrate the approved external secret manager and rotation/revocation process | B. TECHNICAL_ACTION_REQUIRED | Security engineering and platform engineering; security owner accountable | Order 4; service identities and approved secret taxonomy | Secret-reference inventory without values, access-policy review, rotation/revocation test, audit trail, break-glass procedure, leakage scan, and proof that plaintext values never entered source or logs | BLOCKING — Production Ready |
| 6 | Configure and validate DNS, network controls, certificates, and TLS | B. TECHNICAL_ACTION_REQUIRED | Network/platform engineering; production and security owners accountable | Orders 4–5; approved domain and certificate authority | DNS records and propagation evidence, firewall/ingress/egress rules, private connectivity where required, certificate chain and expiry monitoring, TLS configuration scan, reachability/denial tests, and rollback procedure | BLOCKING — Production Ready |
| 7 | Connect production monitoring, logs, traces, metrics, alert routing, and on-call escalation | B. TECHNICAL_ACTION_REQUIRED | Site reliability/operations; incident commander accountable | Orders 1, 4, and 6; approved SLOs from Order 2 | Real environment telemetry, redaction validation, dashboard and alert tests, synthetic health/readiness checks, paging acknowledgement, escalation drill, retention/access policy, and correlation continuity | BLOCKING — Production Ready |
| 8 | Operationalize encrypted production backup and restore controls | B. TECHNICAL_ACTION_REQUIRED | Database/platform engineering; backup/recovery owner accountable | Orders 4–5; approved retention and RPO/RTO from Order 2 | Scheduled encrypted backup evidence, key-reference and access controls, immutable retention, checksum verification, restore runbook, monitoring/alerting, expiry test, and deletion/retention policy evidence | BLOCKING — Production Ready |
| 9 | Execute an authorized real production-infrastructure backup/restore exercise into an isolated recovery target | D. PRODUCTION_EVIDENCE_REQUIRED | Backup/recovery operator with independent verifier | Order 8; exact production backup and isolated restore targets, approved non-customer validation payload or separately authorized data handling, maintenance window, rollback and evidence plan | Real provider backup ID/hash, encryption/checksum verification, authorized actor records, isolated production-infrastructure restore result, integrity and application verification, measured restore duration, cleanup evidence, and incident observations | BLOCKING — Production Ready; a staging restore does not close this gap, and any restore touching active production data requires separate explicit approval |
| 10 | Execute provider disaster-recovery exercise and measure achievable RPO/RTO | D. PRODUCTION_EVIDENCE_REQUIRED | Incident commander and recovery owner with platform/database teams | Orders 2, 7, 8, and 9; approved DR scenario and safe failover/failback plan | Timeline, last recoverable point, measured data-loss window, measured service-recovery duration, failover/failback results, dependency status, decision log, evidence references, and variance against approved RPO/RTO | BLOCKING — Production Ready |
| 11 | Complete dependency advisory audit and remediate or explicitly accept findings | B. TECHNICAL_ACTION_REQUIRED | Security engineering and dependency owners | Reproducible lockfile/build; authorized advisory service access | Complete current dependency inventory and advisory report, severity triage, remediation evidence, retest, and named human risk acceptance with expiry for any unresolved finding | BLOCKING for unresolved Critical/High; lower accepted findings follow security policy |
| 12 | Authorize and conduct an independent external penetration test against an approved non-production or production-like target | C. EXTERNAL_VALIDATION_REQUIRED | Independent authorized tester; security owner accountable | Orders 4–7 and 11; signed scope, rules of engagement, data boundary, test window, contacts and stop conditions | Final signed report, scope and dates, methodology, findings with severity, remediation and retest evidence, and explicit closure or time-bounded human risk acceptance; no unresolved Critical/High finding | BLOCKING — Production Ready |
| 13 | Establish production-like load model, capacity targets, and bottleneck baseline | B. TECHNICAL_ACTION_REQUIRED | Performance engineering/SRE with product and production owners | Orders 2, 4, and 7; representative sanitized workload and SLOs | Workload model, dataset classification, concurrency/throughput targets, resource limits, capacity test procedure, observability queries, abort thresholds, and scaling assumptions | BLOCKING — Production Ready |
| 14 | Run production-like capacity and failure testing | D. PRODUCTION_EVIDENCE_REQUIRED | Performance engineering/SRE; production owner accepts results | Order 13; isolated authorized target and test window | Throughput, latency percentiles, error rate, saturation, dependency behavior, resource headroom, bottlenecks, failover/degradation results, repeatability, and pass/fail against approved SLOs | BLOCKING — Production Ready |
| 15 | Run a bounded long-duration soak | D. PRODUCTION_EVIDENCE_REQUIRED | SRE/performance engineering | Orders 7, 13, and 14; approved duration and abort thresholds | Start/end times, representative load, error/latency trends, resource and connection trends, leak/drift analysis, alert behavior, incidents, recovery, and explicit result against acceptance thresholds | BLOCKING — Production Ready |
| 16 | Rehearse release promotion and rollback on the production-like environment using the exact immutable artifact process | D. PRODUCTION_EVIDENCE_REQUIRED | Deployment operator and rollback authority; independent verifier | Orders 4–15; release candidate, known-good rollback artifact, migration rehearsal, approvals for the rehearsal | Build provenance, commit/artifact/configuration/migration hashes, promotion evidence, smoke/integration/health results, rollback trigger and measured recovery, data verification, and actor/action/target audit proof | BLOCKING — Production Ready; rehearsal is not production deployment evidence |
| 17 | Assemble the Production Readiness Evidence Pack and issue the readiness classification | A. HUMAN_ACTION_REQUIRED | Production owner with security, recovery, incident and business owners | All Orders 1–16 closed or formally rejected; no unresolved mandatory evidence | Immutable evidence index, gap register with no hidden open blocker, architecture-conformance review, security/performance/recovery sign-offs, owner attestations, exact release candidate and rollback references | BLOCKING — `PRODUCTION_READY` remains `NO` until an authorized human records `YES` from this pack |
| 18 | Grant or deny exact production deployment Approval | A. HUMAN_ACTION_REQUIRED | Independent named deployment approver with valid authority and separation of duties | Order 17 records `PRODUCTION_READY = YES`; exact deployment request and current evidence | Approval record bound to release ID, commit, artifact hash, configuration and migration versions, production environment, evidence set, validity window, deployment operator and rollback target; stale/mismatch/consumed/revoked checks | BLOCKING — `PRODUCTION_DEPLOYMENT_APPROVED` remains `NO` until this exact approval is valid |
| 19 | Perform the separately authorized controlled production deployment and post-deployment verification | D. PRODUCTION_EVIDENCE_REQUIRED | Deployment operator; production owner and incident commander supervising | Valid Order 18 approval, active change window, healthy dependencies, backup, rollback authority and kill/stop controls | Real deployment timeline and audit, exact artifact verification, migration result, health/smoke/integration/SLO evidence, monitoring and alert evidence, incident status, and human verification decision | BLOCKING — final production rollout completion; this plan does not authorize execution |
| 20 | Exercise or execute authorized rollback when the approved scenario requires it, then close the production evidence register | D. PRODUCTION_EVIDENCE_REQUIRED | Rollback authority and deployment operator with recovery owner | Order 19 or a separately approved production rollback exercise; known-good artifact and data recovery plan | Rollback decision and authority, exact known-good artifact/hash, execution timeline, measured recovery, data integrity, health/SLO verification, audit trail, and residual-risk decision | BLOCKING for final rollback-confidence closure; never execute solely to manufacture evidence |

## Evidence Acceptance Rules

Every closure record must include:

1. gap identifier and evidence classification;
2. exact system, provider, environment, region and time window;
3. named actor, authority and independent verifier where required;
4. exact release, commit, artifact/configuration/migration versions and hashes where applicable;
5. procedure/runbook version, inputs, acceptance thresholds and stop conditions;
6. raw-result reference, immutable checksum, summarized result and observed failures;
7. correlation, event and audit references without secrets or private payloads;
8. explicit `PASS`, `FAIL`, `BLOCKED` or `NOT_RUN` result; and
9. expiry/revalidation date for evidence that can become stale.

Missing, stale, simulated-as-real, mismatched, unverifiable, or redacted-beyond-validation evidence
does not close a gap. An `UNKNOWN` dependency or result remains blocking.

## Gate Sequence

### Gate 1 — Production Foundation Ready

Orders 1–8 close: named authority, approved objectives/provider, isolated infrastructure,
secret-manager integration, DNS/network/TLS, observability and backup capability.

### Gate 2 — Independent and Representative Validation Ready

Orders 9–16 close: restore/DR with measured RPO/RTO, dependency audit, external penetration test,
production-like capacity, long soak, and exact-artifact release/rollback rehearsal.

### Gate 3 — Production Ready Decision

Order 17 may set `PRODUCTION_READY = YES` only when Gates 1–2 pass and no Critical/High security
finding, recovery breach, capacity breach, owner gap or unknown mandatory result remains.
`PRODUCTION_DEPLOYMENT_APPROVED` remains `NO` at this gate.

### Gate 4 — Exact Production Go / No-Go

Order 18 is a separate human decision. `GO` requires a current exact-bound Approval, healthy
dependencies, an active change window, named deployment/incident/rollback authorities, verified
backup, tested rollback target and unchanged evidence hashes. Any mismatch, expiry, revocation,
unknown health or material change is `NO_GO`.

### Gate 5 — Controlled Deployment Evidence Closure

Orders 19–20 occur only under separate execution authority after Gate 4. Actual deployment,
verification and any justified rollback evidence close the operational rollout record; they are
never prerequisites manufactured before authorization.

## Final Production Go/No-Go Prerequisites

Final production `GO` requires all of the following:

- approved provider, region, infrastructure and isolated production environment;
- external secret manager, service identities, rotation/revocation and no secret leakage;
- validated DNS, network, TLS, telemetry, alerting and on-call escalation;
- named production, incident, backup/recovery, security, deployment, approval and rollback owners;
- approved and measured RPO/RTO with successful representative restore and provider DR evidence;
- complete dependency audit and independently verified penetration-test closure with no unresolved
  Critical/High finding;
- passed production-like capacity, failure and long-soak thresholds with documented headroom and
  known bottlenecks;
- immutable build-once release evidence and successful production-like promotion/rollback rehearsal;
- `PRODUCTION_READY = YES` recorded by authorized humans from the exact evidence pack;
- current exact human production Approval with separation of duties and stale/mismatch rejection;
- healthy mandatory dependencies, valid maintenance window, known-good rollback artifact, verified
  backup and active kill/stop authority.

Until every applicable prerequisite is proven, the decision remains `NO_GO`,
`PRODUCTION_READY = NO`, and `PRODUCTION_DEPLOYMENT_APPROVED = NO`.

## Execution Handoff

This document authorizes planning only. Gap closure should proceed as separately approved,
short-lived work packages in the recommended order. Each package must identify its exact external
target and requested authority before any provider, credential, DNS, security-test, restore,
deployment or rollback action. Stop and request a Change Request if execution would modify frozen
MAOS Architecture v1.1.
