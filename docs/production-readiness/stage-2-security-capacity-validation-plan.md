# MAOS Stage 2 Security and Capacity Validation Plan

Date: 2026-09-09

Status: `PLAN_READY / EXECUTION_AND_EXTERNAL_EVIDENCE_REQUIRED`

No load, soak, penetration test, provider mutation, or production deployment is authorized here.

## Production-like Capacity Plan

Use isolated staging with sanitized synthetic data and intended Vercel/Railway plans, regions,
service topology, database configuration, and observability. Bind each run to one commit, build,
configuration, dataset version, environment and acceptance record.

| Target | Workload | Initial profile | Required observations |
| --- | --- | --- | --- |
| Vercel frontend | Navigation, assets, authenticated views, error/empty states | 25 concurrent users ramping to 100; 70% read, 20% refresh/search, 10% state paths | p95/p99 visible latency, errors, edge/function use, cache behavior |
| Railway API | health 5%, reads 65%, governed writes 20%, approval/errors 10% | 25 requests/s ramping to 100; 30-min baseline, 60-min peak | p50/p95/p99, 4xx/5xx, CPU/memory, event-loop delay, connections, timeouts |
| Railway worker | task/run lifecycle, retry, cancellation, integration timeout | ramp 10 to 50 concurrent safe synthetic items | queue depth/age, throughput, retries, unknown outcomes, CPU/memory |
| Railway PostgreSQL | API/worker mix; migrations excluded | expected 12-month dataset and matching concurrency | connections, query p95/p99, locks, cache hit, CPU/memory/storage/IO, WAL lag |

Initial pass criteria: no Critical/High data/governance failure; HTTP 5xx < 1%; no approval,
permission, identity or scope bypass; API p95 < 500 ms and p99 < 1 s except explicit long-running
operations; CPU/memory sustained below 80%; PostgreSQL connections below 70% of configured limit;
no unbounded queue growth; and backup archive lag below 30 minutes. These are proposed safety
baselines and require approval/refinement with observed workload and the 99.9% SLO.

Long soak: minimum 24 hours at expected average load with four one-hour peak windows; extend to 72
hours before the final gate if cost permits. Pass requires no monotonic memory/connection/storage
leak, missed RPO window, unresolved alert, error-budget breach, unstable p95/p99, or failed bounded
recovery. Abort on integrity/security failure, resource >= 90% for 5 minutes, or errors >= 5% for
5 minutes.

## MAOS Core Penetration-Test Preparation

In scope: Control Room web, Core API, authentication, authorization/default-deny, approval exact
binding and stale/mismatch/consumed handling, Tool Gateway, and Local Execution Bridge path,
workroot, command, permission, risk, approval, revocation and redaction boundaries.

Excluded: provider corporate infrastructure, denial-of-service beyond agreed load, social
engineering, physical/NAS intrusion, unrelated domain systems, real customer/employee data,
production, destructive database actions, external actions, and unlisted targets.

Requirements before testing:

1. Independent tester and explicit written authorization from the Security Owner.
2. Exact staging URLs/IPs, dates/time zone, source addresses, accounts/roles, data classification,
   rate limits, contact/stop route, prohibited actions, and evidence handling.
3. Production-like configuration with synthetic data and safe local-runner fixture; no real secrets.
4. Current dependency inventory and architecture/data-flow boundary packet.
5. Immediate stop for suspected production reach, privacy impact, credential exposure,
   persistence, destructive effect, or target mismatch.

Evidence includes signed scope, tester identity, methodology/tool versions, UTC timeline,
target/config/release hashes, raw evidence location/checksum, finding IDs/severity, affected
boundary, redacted proof, remediation commit/build, independent retest, and closure or expiring
human risk acceptance. Any unresolved Critical/High finding blocks Production Ready.

## Remediation and Re-test

Triage without weakening default deny. Fix on a short-lived branch, run affected and full gates,
deploy only to the separately authorized staging target, and have the independent tester retest the
exact fixed release. Self-attestation or a local scan does not replace external validation.
