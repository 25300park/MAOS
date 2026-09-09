# MAOS Stage 1 Operational Authority Matrix

Date: 2026-09-09

Status: `HUMAN_ACTION_REQUIRED`

No personal name, contact address, provider account or production authority is assigned by this
document. Each assignment remains `HUMAN_ACTION_REQUIRED` until an authorized human records and
acknowledges the exact scope.

## Role Matrix

| Governed role | Assignment | Accountable for | May authorize | Must not infer or self-grant | Required assignment evidence |
| --- | --- | --- | --- | --- | --- |
| Production Owner | `HUMAN_ACTION_REQUIRED` | Production service ownership, readiness decision, maintenance windows, risk coordination | Readiness evidence-pack acceptance and operational changes within delegated authority | Deployment Approval, security risk acceptance or restore authority unless separately and compatibly assigned | Name/identity, deputy, scope, contact route, acknowledgement, effective/expiry dates |
| Deployment Approver | `HUMAN_ACTION_REQUIRED` | Independent production Go/No-Go decision for one exact release | Exact release/artifact/configuration/migration/environment deployment Approval | General deployment capability, implementation, QA, execution or self-approval | Authority source, separation-of-duties check, exact approval scope and validity |
| Incident Commander | `HUMAN_ACTION_REQUIRED` | Incident severity, coordination, stop/kill and recovery ordering | Incident actions within current incident authority | Deployment Approval or destructive recovery without the required separate authority | Primary/alternate identities, paging route, incident scope and drill acknowledgement |
| Security Owner | `HUMAN_ACTION_REQUIRED` | Security policy, external test authorization, credential incidents and risk acceptance | Penetration-test scope and time-bounded residual-risk decisions | Concealment or acceptance of unresolved Critical/High risk outside policy | Identity, escalation route, risk-acceptance bounds, expiry/review cadence |
| Backup Owner | `HUMAN_ACTION_REQUIRED` | Backup policy, schedule, retention, integrity and monitoring | Backup configuration within approved policy | Restore execution or proof of recoverability from backup creation alone | Identity, target scope, retention decision and monitoring acknowledgement |
| Restore Owner | `HUMAN_ACTION_REQUIRED` | Restore authorization, target/data scope, integrity and recovery evidence | Exact isolated restore or authorized recovery action | Active production mutation without separate exact approval | Identity, target scope, data authority, alternate and recovery acknowledgement |
| Rollback Authority | `HUMAN_ACTION_REQUIRED` | Exact known-good artifact/configuration rollback decision | One exact rollback under an incident/change record | Broad deploy authority, database recovery or approval reuse | Identity, authority source, target-binding rules, alternate and validity |
| Escalation Contact | `HUMAN_ACTION_REQUIRED` | Receipt and routing of operational escalation when the primary owner is unavailable | Escalation according to the recorded contact tree | Production mutation or approval merely by receiving an alert | Named person/on-call group, contact route, hours, alternate and acknowledgement |

## Minimum Separation of Duties

- The Deployment Approver is not the release author, implementing agent, reviewer, QA actor or
  Deployment Operator for the approved release.
- QA PASS and Review do not grant Deployment Approval.
- The Backup Owner cannot claim recovery PASS without an authorized Restore Owner and independent
  verification.
- Security findings are closed by verified remediation/retest or explicit authorized risk
  acceptance, not by the team that introduced the finding alone.
- Rollback uses a new exact decision and cannot reuse stale, consumed, mismatched or revoked
  deployment authority.
- An Incident Commander may coordinate action but cannot bypass Approval, security, privacy,
  backup/restore or production policy.

## Assignment Record Contract

For each role, record:

- stable human or approved on-call-group identity;
- authority source and organizational owner;
- exact systems, environments and actions in scope;
- effective time, expiry/review time and availability window;
- primary and alternate escalation route;
- conflicts checked and approved combinations, if any;
- acknowledgement of the relevant runbooks; and
- immutable decision/evidence reference without private contact details in management views.

Missing, expired, unavailable, unacknowledged or conflicting assignment is `HUMAN_BLOCKED` and a
production No-Go. This matrix creates no authority until those records exist.
