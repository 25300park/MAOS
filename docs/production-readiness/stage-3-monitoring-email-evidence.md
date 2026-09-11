# MAOS Stage 3 Monitoring and Email Alert Evidence

Date: 2026-09-11

Status: `PARTIAL_STAGING_EVIDENCE / EMAIL_ALERT_LIFECYCLE_OPEN`

This record contains real staging observations only. It does not establish production readiness,
production deployment approval, or a completed email-alert lifecycle.

## Evidence Scope

- Observation window: 2026-09-11T01:21:00.671Z through 2026-09-11T01:23:14.842Z.
- Railway project: `5cafd9ce-7da2-48a9-b4ca-fcc361b8c698`.
- Railway environment: `c8859061-e91a-420f-9e3d-9afba50a858f` (`staging`).
- Railway API service/deployment: `d907beca-edc0-4b1e-9def-be31a3c15ebd` /
  `718cfc33-f142-4313-976c-de030175f81d`.
- Railway worker service/deployment: `cc391f39-1933-4de1-9c40-aa4bcf437b99` /
  `cd4e1316-173f-4827-97e6-c9b0b113133f`.
- Railway PostgreSQL service/deployment: `2bd39b2e-6ef8-47fd-b575-f841b0c51f57` /
  `b500c574-77ee-4072-a190-ea878c81403a`.
- Vercel deployment: `dpl_rhBUZGDhWGsTmf72zE1oz9F8MfVw`.
- No provider configuration, credential, deployment, or production mutation was performed.

## Collected Evidence

| Path | Real staging result | Evidence status |
| --- | --- | --- |
| Railway API `/health` | HTTP 200; request, correlation, and trace identifiers echoed | `COLLECTED` |
| Railway API `/health/live` | HTTP 200; request, correlation, and trace identifiers echoed | `COLLECTED` |
| Railway API `/health/ready` | HTTP 200; request, correlation, and trace identifiers echoed | `COLLECTED` |
| Railway API `/api/v1/operations/alerts` without credentials | HTTP 401; default-deny boundary preserved | `COLLECTED_CONTROLLED_FAILURE` |
| Railway HTTP logs | All four requests recorded in Singapore against the exact API deployment | `COLLECTED` |
| Railway metrics | API, worker, and PostgreSQL resource metrics available for the one-hour window | `COLLECTED` |
| Vercel Control Room URL | HTTP 200; authentication-required view rendered | `COLLECTED_AUTH_BOUNDARY` |
| Vercel runtime logs | Three serverless GET `/` records returned HTTP 200 for the exact deployment | `COLLECTED` |

The Railway metrics window was 2026-09-11T00:22:09Z through 2026-09-11T01:22:11Z.
The API summary contained four requests: three 2xx responses and one controlled 4xx response, with
p95 51 ms. Metrics were also returned for the worker and PostgreSQL services. These observations
prove telemetry availability only; they are not capacity or soak evidence.

The controlled 401 proves that the alert endpoint remains fail-closed without authentication. It
does not prove alert generation, a degraded-health transition, or email delivery.

## Redaction and Secret Safety

- Response bodies and selected provider log metadata were checked for bearer credentials, API-key,
  password, and private-key shapes; none were detected.
- Vercel log messages were reduced to a secret-shape boolean and were not copied into this record.
- No email address, credential value, provider token, private payload, customer data, or employee
  data was recorded.
- This is a bounded observation, not proof that every provider log is free of sensitive data.

## Evidence Not Collected

The repository contains no email delivery adapter or mail-provider dependency, and the deployed API
does not configure an authentication verifier for protected operations routes. Therefore the
following required staging evidence remains `NOT_VERIFIED`:

- successful operational alert generation from a real degraded-health transition;
- WARNING or CRITICAL email delivery;
- human acknowledgement of the delivered alert;
- missed-acknowledgement escalation behavior;
- recovery/clear transition linked to the original alert and evidence chain.

Provider log and metric availability cannot substitute for those missing results. G07 remains
blocking for Production Ready until a separately approved implementation/configuration path exists,
the private staging recipient and send-only credential are configured outside Git, and the complete
synthetic lifecycle is executed and evidenced.
