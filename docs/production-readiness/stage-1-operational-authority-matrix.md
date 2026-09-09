# MAOS Stage 1 Operational Authority Matrix

Date: 2026-09-09

Status: `STAGE_2_ROLE_ASSIGNMENT_DECISION_RECORDED / IDENTITY_EVIDENCE_PENDING`

The approved person is represented as `PRIMARY_HUMAN_OWNER`; the private identity and contact
record must be stored in the approved operational identity/contact system, not in Git. The same
person may occupy every role, but each role, acknowledgement, decision, and audit event remains
distinct. This assignment does not waive separation between release authorship/QA and exact
production approval.

## Role Matrix

| Governed role | Assigned principal | Accountable for | May authorize | Must not infer or self-grant | Required activation evidence |
| --- | --- | --- | --- | --- | --- |
| Production Owner | `PRIMARY_HUMAN_OWNER` | Production ownership, readiness, windows and risk coordination | Readiness acceptance and delegated operational changes | Deployment Approval or unrelated security/restore authority | Private identity reference, authority source, scope, acknowledgement and review date |
| Deployment Approver | `PRIMARY_HUMAN_OWNER` | Exact production Go/No-Go as a distinct role | One release/environment/evidence/rollback binding | QA substitution, blanket or reusable Approval | Private identity reference, exact scope, validity, conflict disclosure and Approval record |
| Incident Commander | `PRIMARY_HUMAN_OWNER` | Severity, coordination, escalation and recovery decisions | Approved containment/recovery and stop/kill paths | Bypass Approval, privacy, security, restore or rollback authority | Private identity reference, availability window, email route and runbook acknowledgement |
| Security Owner | `PRIMARY_HUMAN_OWNER` | Secret policy, access review, findings and risk routing | Scoped controls and time-bounded residual-risk decisions | Conceal findings, self-close unverified remediation or expose credentials | Private identity reference, scope, access attestation and review cadence |
| Backup Owner | `PRIMARY_HUMAN_OWNER` | Backup schedule, encryption, retention, integrity and monitoring | Backup operations within approved policy | Assert restore integrity or production readiness alone | Private identity reference, targets, schedule, key-reference policy and retention decision |
| Restore Owner | `PRIMARY_HUMAN_OWNER` | Restore authorization, isolation, integrity and cleanup | One exact restore target/data scope under a change record | Destructive active-production restore or self-verify recovery | Private identity reference, target/data authority, independent verifier and window |
| Rollback Authority | `PRIMARY_HUMAN_OWNER` | Exact known-good rollback decision | One exact rollback under an incident/change record | Broad deploy authority, database recovery or Approval reuse | Private identity reference, target binding, validity and independent verification plan |
| Escalation Contact | `PRIMARY_HUMAN_OWNER` | Receipt and routing of operational escalation | Route email escalation according to the contact plan | Production mutation or Approval merely by receiving an alert | Private identity reference, email route, availability and acknowledgement |

## Role Separation With One Person

- The person must select an explicit role for every action; authority does not flow between roles.
- Deployment Approval remains a new exact record, not an implication of ownership, QA or readiness.
- The release author, automated agent, reviewer and QA result cannot approve production.
- Backup creation cannot prove restore success; restore evidence requires an independent verifier.
- Rollback requires a new exact decision and cannot reuse stale, consumed, mismatched or revoked
  deployment authority.
- The single-person assignment is a documented operational concentration risk. Missed availability
  has no current alternate and therefore remains a production blocker until explicitly accepted or
  an alternate is assigned.

## Assignment Record Contract

For each role, store outside Git the stable human identity, authority source, exact scope,
effective/expiry dates, availability, private email/escalation route, conflict disclosure,
runbook acknowledgement, and immutable decision/evidence reference.

The allocation decision is complete. Missing private identity references, acknowledgements,
availability, conflict disclosures, or exact action records remain `HUMAN_ACTION_REQUIRED` and a
production No-Go. This matrix creates no deployment authority and does not set Production Ready.
