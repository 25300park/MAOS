# MAOS Stage 2 Provider Readiness

Date: 2026-09-09

Status: `DESIGN_READY / RESOURCE_AND_DEPLOYMENT_EVIDENCE_PENDING`

Current classification remains `PRODUCTION_READY = NO` and
`PRODUCTION_DEPLOYMENT_APPROVED = NO`.

This is a non-production design for Vercel frontend plus Railway API, worker, and PostgreSQL. It
does not create accounts, resources, domains, variables, deployments, or credentials.

## Ownership and Environment Boundary

| Component | Provider | Source responsibility | Runtime responsibility | Production identifier |
| --- | --- | --- | --- | --- |
| Control Room frontend | Vercel | MAOS repository and reviewed release | Vercel production environment | `HUMAN_ACTION_REQUIRED` |
| Core API | Railway | MAOS `@maos/api` workspace | Railway `maos-api` service | `EVIDENCE_PENDING` |
| Worker | Railway | MAOS `@maos/worker` workspace | Railway `maos-worker` service | `EVIDENCE_PENDING` |
| PostgreSQL | Railway | MAOS migrations; data remains PostgreSQL-owned | Railway Postgres service and volume/PITR | `EVIDENCE_PENDING` |
| Secondary backup | Company NAS | Encrypted portable export | Human-operated company NAS | `EVIDENCE_PENDING` |

Use isolated Vercel Production/Preview settings and isolated Railway `production`/`staging`
environments. Browser traffic reaches the Vercel frontend and the public HTTPS API only. API and
worker reach PostgreSQL through Railway private networking; PostgreSQL has no browser-facing or
unnecessary public connection path. Domain-system sources of truth remain independent.

## Vercel Readiness Contract

- Project root: repository root, with the web workspace as the only frontend target.
- Install: `npm ci` using the committed lockfile and Node 24.x.
- Candidate build: `npm run build --workspace @maos/web` after common quality gates.
- Current blocker: `@maos/web` is a Node HTTP server binding `127.0.0.1`; no Vercel adapter,
  function entrypoint, or static output contract exists. A reviewed non-production packaging
  change and preview proof are required before Vercel readiness can pass.
- Output/runtime: `HUMAN_ACTION_REQUIRED` after the adapter choice; do not guess an output folder.
- Production branch automation must stay disabled or approval-gated until exact deployment
  governance is configured. A Git push is not production Approval.
- Frontend calls only an HTTPS `MAOS_PUBLIC_API_ORIGIN`; it never receives database, internal
  service, provider, or integration secrets.
- Capture deployment ID/URL, source commit, build logs, build checksum, environment/configuration
  version, preview test evidence, promotion actor, and final assigned domain.
- Record a known-good Vercel deployment ID/URL. Any rollback is separately approved and its final
  state verified; provider plan limits may constrain selectable history.

## Railway Readiness Contract

Use one Railway project with distinct `staging` and `production` environments and three services:

| Service | Build/start contract | Health | Networking | Restart/recovery |
| --- | --- | --- | --- | --- |
| `maos-api` | Root context; `npm ci && npm run build`; `npm run start --workspace @maos/api` | `/health/live`, `/health/ready`, `/health` | Public HTTPS ingress; private PostgreSQL | `ON_FAILURE` with bounded retries; repeated failure becomes an incident |
| `maos-worker` | Root context; build exists; production start command is currently missing | Worker heartbeat and dependency readiness must be added/proven | Private PostgreSQL and allowlisted outbound integrations only | Bounded `ON_FAILURE`; reconcile unknown outcomes |
| `Postgres` | Railway managed PostgreSQL | Connection, storage, backup/PITR and replication if selected | Private service-to-database only | Recovery target and traffic switch remain separate operations |

The shared monorepo requires repository-root build context because workspaces depend on shared
packages. Set service-specific start commands and watch paths only after preview validation. Pin
Node 24.x. Record Railway project/environment/service/deployment IDs and source commit for every
evidence set. Do not expose PostgreSQL through a TCP proxy for application traffic.

Production region, recovery region, account/workspace IDs, service IDs, replica counts, plan,
spending boundary, maintenance window, and retention remain `HUMAN_ACTION_REQUIRED`.

## Domain, DNS, and TLS Checklist

Status: `HUMAN_ACTION_REQUIRED` because the production domain is `TO_BE_DECIDED`.

1. Decide the apex/control-room name and whether API uses `api.<domain>` or a Railway hostname.
2. Attach the frontend domain to the Vercel Production environment.
3. Add exactly the A/AAAA/CNAME and ownership records returned by Vercel; never invent values.
4. If using an API subdomain, attach it to Railway and add exactly its returned routing and
   ownership records.
5. Verify certificate issuance, full chain, hostname, expiry monitoring, and automated renewal.
6. Enforce HTTPS and decide canonical host, apex/`www` redirects, and HTTP-to-HTTPS redirect.
7. Approve HSTS only after every required subdomain is HTTPS-capable; record max-age and whether
   `includeSubDomains`/preload are allowed.
8. Validate browser-to-API CORS/origin binding and reject every unapproved origin.
9. Verify `/health`, `/health/live`, and `/health/ready` without sensitive details.
10. Preserve DNS/TLS before-and-after evidence and a separately authorized rollback plan.

## Network and Release Evidence

- Public: browser to Vercel and browser/frontend to Railway API over TLS 1.2+; TLS 1.3 preferred.
- Private: API/worker to PostgreSQL through Railway private DNS and internal connection reference.
- Egress: default deny where controllable; allow only approved integrations, monitoring, backup,
  package/build endpoints, and time/DNS dependencies.
- Every release binds commit, build, artifact/deployment ID, configuration version, migration plan,
  environment, approval, evidence index, and rollback target.
- Build once/promote same artifact remains required. Provider rebuild/redeploy behavior must be
  reconciled with this rule and proven in staging before Production Ready can be considered.

Provider references: https://docs.railway.com/deployments/monorepo,
https://docs.railway.com/reference/healthchecks,
https://docs.railway.com/guides/private-networking,
https://vercel.com/docs/builds, https://vercel.com/docs/environment-variables, and
https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting.
