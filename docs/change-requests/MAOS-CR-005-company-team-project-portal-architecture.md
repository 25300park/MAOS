# MAOS-CR-005 — Registry-Driven Company, Team, and Project Portal Architecture

| Item                                    | Value                                          |
| --------------------------------------- | ---------------------------------------------- |
| Change Request                          | MAOS-CR-005                                    |
| Baseline                                | MAOS Architecture v1.1 APPROVED / FROZEN       |
| Target                                  | Adopt MAOS-020 as a v1.2 architecture addition |
| Class                                   | C2 Minor Architecture                          |
| Status                                  | APPROVED_C2                                    |
| Runtime implementation authorization    | NO                                             |
| Production implementation authorization | NO                                             |
| Production deployment authorization     | NO                                             |
| Frozen documents modified               | NONE                                           |
| C2 blockers                             | NONE                                           |
| Candidate corrections                   | NONE                                           |
| Approved By                             | HUMAN_REPOSITORY_OWNER                         |
| Approved On                             | 2026-09-16                                     |

## 1. Objective

Adopt a registry-driven Company → Team → Project portal architecture so MAOS can serve as the Digital Headquarters and single governed human command surface without replacing independent Systems or duplicating canonical runtimes.

## 2. Motivation

MAOS v1.1 defines the Control Room, governed autonomous loops, and local execution bridge, but it does not yet define how multiple independent business Systems and AI Teams compose into one Company operating hierarchy. Without an explicit contract, implementation could conflate Team, Project, and System identities; expand browser trust; duplicate control engines; or silently merge domain sources of truth.

## 3. Proposed change

Add `MAOS-020 — Registry-Driven Company, Team, and Project Portal Architecture` to a future v1.2 frozen baseline.

The change defines:

- Company, Team, and Project Portal contracts;
- registry-driven System, Environment, Repository, Workroot, Runner, Service, and Deployment mappings;
- health/status aggregation and freshness;
- structured Human command intents;
- navigation, mobile, Evidence/Audit, and emergency-control boundaries;
- integration with MAOS-018 and MAOS-019; and
- explicit prohibited coupling and non-goals.

## 4. Authority and trust boundaries

The portal does not grant authority. Every action remains governed by:

`Identity → Scope → Permission → Risk → Approval → Execution → Evidence → Audit`

Production action remains Human-authorized and target-bound. The single Human Owner has no implicit global bypass. AI recommendations, Reviews, QA PASS, Loop completion, UI visibility, registry membership, and navigation do not grant Approval.

## 5. Preserved ownership

- Independent Systems keep their source-of-truth data and deployment ownership.
- MAOS remains an integration, observation, command, Approval, Evidence, and Audit control plane.
- Team, Project, and System remain distinct entities.
- Existing Workflow, Approval, Agent, Runner, Tool Gateway, Evidence, Audit, MAOS-018 loop, and MAOS-019 bridge runtimes are reused.
- Repositories and deployments remain physically independent.

## 6. Rejected alternatives

1. **System-first coupling** — rejected because it confuses System lifecycle with Team accountability and Project authority.
2. **Micro-frontend embedding** — rejected because it broadens browser, credential, release, and failure trust boundaries.
3. **Cross-system SoT merge** — rejected because it duplicates domain truth and weakens ownership.
4. **Duplicate control runtimes** — rejected for Workflow, Approval, Agent, Runner, Evidence, Audit, and autonomous loops.
5. **Ungoverned trust expansion** — rejected; new origins, providers, credentials, or execution paths require separate approval.

## 7. Expected implementation impact

With C2 approval recorded, Phase 14B may proceed to separately authorized planning and implementation of bounded portal projections, registry bindings, APIs, and UI surfaces. The expected implementation must prefer existing entities and read models. Any new persistence, API, provider, or deployment impact must be justified in a separate implementation plan and authorization.

No implementation is authorized by this proposed C2 request.

## 8. Security and privacy impact

- exact server-side authorization remains mandatory;
- portal navigation does not imply authority;
- secret values, Session material, and provider credentials are prohibited from portal metadata and URLs;
- private employee and domain data remain behind their existing policy boundaries;
- mobile high-risk actions require bounded schemas, confirmation, and step-up where policy requires;
- stale or missing registry/health state fails closed for commands; and
- every command/control action requires Evidence and Audit.

## 9. Migration and provider impact

- Database migration authorized: `NO`.
- Provider configuration authorized: `NO`.
- External System modification authorized: `NO`.
- Production implementation authorized: `NO`.
- Production deployment authorized: `NO`.

Any later need for these changes must be separately evidenced and authorized.

## 10. Verification requirements

An approved Phase 14B plan must cover:

- hierarchy and registry-reference contract tests;
- Team/Project/System separation;
- source ownership and no-copy boundaries;
- health source/freshness and unknown-state behavior;
- exact navigation visibility and server-side authority tests;
- command-intent risk/Approval/evidence/Audit gates;
- pause/stop/cancel/kill lifecycle and denial cases;
- mobile subset restrictions and accessibility;
- MAOS-018 and MAOS-019 reuse without parallel runtimes;
- cross-portal correlation and redaction;
- production fail-closed behavior; and
- architecture, secret, boundary, and regression gates.

## 11. Rollback and rejection

Before implementation, rejection requires only retaining MAOS v1.1 as the frozen baseline and marking MAOS-020 rejected or superseded. After implementation, rollback must disable new portal projections and command entry points without deleting independent System data, Evidence, Audit, Tasks, Runs, Approvals, or registry records.

## 12. Approval gates

Approved state:

- MAOS-020 candidate: `CREATED`.
- MAOS-CR-005: `APPROVED_C2`.
- Human C2 approval: `GRANTED`.
- C2 blockers: `NONE`.
- Candidate corrections: `NONE`.
- Phase 14B readiness: `READY`.
- Runtime implementation authorization: `NO`.
- Production implementation authorization: `NO`.
- Production deployment authorization: `NO`.

Human decision: `APPROVE_MAOS_CR_005_C2`.

Phase 14B is architecture-ready. Runtime implementation, provider changes, database migrations, and production implementation/deployment remain separately gated and unauthorized by this C2 approval.
