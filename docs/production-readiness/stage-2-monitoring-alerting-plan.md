# MAOS Stage 2 Monitoring and Alerting Plan

Date: 2026-09-09

Status: `DESIGN_READY / ROUTING_AND_RUNTIME_EVIDENCE_PENDING`

MAOS Control Room is the primary governed view. Railway and Vercel native deployment/runtime logs
and metrics are secondary evidence. Email is the approved active alert route; its address remains
private and `HUMAN_ACTION_REQUIRED` outside Git.

## Monitoring Matrix

| Area | Signal and threshold baseline | Severity | Email condition | Evidence source |
| --- | --- | --- | --- | --- |
| Frontend | deployment failed; 5xx > 1% for 5 min; availability below SLO window | WARNING/CRITICAL | Failure or sustained threshold | Vercel logs and synthetic HTTPS check |
| API | readiness non-healthy twice; 5xx > 1% for 5 min; p95 above approved budget | WARNING/CRITICAL | Sustained degradation/unavailable | `/health*`, Railway metrics/logs, MAOS correlation |
| Worker | heartbeat absent twice; queue age or failures above approved limit | WARNING/CRITICAL | Missed heartbeat/growing saturation | Control Room state and Railway metrics/logs |
| PostgreSQL | connection failure; resource >= 80/90%; archive lag >= 30/60 min | WARNING/CRITICAL | Sustained warning or critical | Railway metrics, PITR status, backup manifest |
| Integrations | required dependency unavailable/stale; timeout/error budget breach | WARNING/CRITICAL | Required integration failure | MAOS readiness/events and provider logs |
| Backup | age >= 45/60 min; checksum or restore failure | WARNING/CRITICAL | Every warning/critical | Railway backup/PITR and NAS transfer monitor |
| Security | auth/approval anomaly, leakage, revoked runner active | CRITICAL | Immediate | MAOS audit/security events and bounded logs |

Final latency, queue, resource, error-rate, and time-window thresholds require production-like load
evidence; these are baselines, not proven capacity limits. Unknown is never healthy.

## Severity and Email Route

- INFO: Control Room only; routine success, planned change, resolved transient condition.
- WARNING: email plus Control Room; degradation, sustained threshold, backup freshness approaching
  RPO, or acknowledgement required.
- CRITICAL: immediate email plus prominent Control Room state; required-service outage,
  security/secret event, RPO breach, integrity risk, or kill/rollback decision.

Subject: `[MAOS][<SEVERITY>][<ENVIRONMENT>][<SYSTEM>] <ALERT_CODE> - action required`.

The body contains affected system, severity, first detected UTC, current health, correlation and
incident references, evidence links, required human action, acknowledgement instruction, and
runbook link. It never contains credentials, private payloads, tokens, or customer/employee data.
Acknowledgement records role, private identity reference and UTC time; it does not close the
incident. Resolution requires recovery verification, cause/status, evidence, residual risk and
follow-up owner.

Baseline acknowledgement objectives: CRITICAL 15 minutes, WARNING 60 minutes, INFO next business
review. The owner must accept availability expectations and configure an alternate/fail-safe route
before production readiness review.

## Incident and Evidence Workflow

1. Deduplicate by environment/system/alert code while preserving count and correlation.
2. Create or attach the governed incident and display system, owner role, blocker and next action.
3. Email by severity; record delivery/acknowledgement without the private address.
4. Escalate missed acknowledgement to a separately recorded emergency route. Single-person
   coverage remains a risk until an alternate is assigned or explicitly accepted.
5. Follow the versioned runbook, record actor/action/target/result/evidence audit references,
   verify recovery, then resolve. Alerts/events remain distinct from Audit.

Runbooks: `docs/operations/phase-1P-production-runbooks.md`.
