# MAOS-029 — Project Portal Integration Architecture

## MAOS Architecture v2.1 — Approved / Frozen

| Item                     | Value                     |
| ------------------------ | ------------------------- |
| Document ID              | MAOS-029                  |
| Version                  | 2.1 candidate             |
| Status                   | APPROVED / FROZEN         |
| Change Class             | C2 Minor Architecture     |
| Current Frozen Baseline  | MAOS Architecture v2.0    |
| Change Request           | MAOS-CR-014 — APPROVED_C2 |
| Implementation authority | NONE                      |
| Production authority     | NONE                      |

## 1. Objective

Define how MAOS Project Portals discover, identify, navigate to, observe, summarize, and govern interaction with independent business and project systems while each external system retains its own business source of truth, repository, deployment, authority, and native UI.

`Project Portal Integration ≠ system absorption`.

MAOS-029 adds a registry-driven integration contract. It does not move repositories or databases, replace native applications, duplicate business state, create a shared business database, or create a second authorization or execution engine.

## 2. Architectural decision

Adopt a versioned `ProjectPortalIntegration` binding between an existing Project and an existing System for an exact environment. The binding references, rather than owns, canonical registry entities and external capabilities.

- MAOS-020 remains the Company → Team → Project composition authority.
- System, Project, Environment, Repository, Workroot, Deployment, and health identities remain owned by their canonical registries.
- External Systems remain authoritative for their domain data and native actions.
- MAOS governs visibility and command intent through existing identity, scope, permission, risk, Approval, Task/Run, Tool Gateway, Runner, Evidence, and Audit contracts.
- Connectors translate approved canonical requests and responses but own no business rules or authority.

Rejected alternatives:

1. **System-first portal ownership** — rejected because System identity does not define Team accountability or Project authority.
2. **Shared or replicated business database** — rejected because it creates a shadow source of truth.
3. **Unrestricted iframe/micro-frontend federation** — rejected because it expands browser, credential, release, and failure trust boundaries.
4. **Direct UI-to-external mutation** — rejected because it bypasses governed command and execution boundaries.

## 3. ProjectPortalIntegration contract

A `ProjectPortalIntegration` is a non-authoritative, versioned registry binding containing:

- `integration_ref`, version, lifecycle/validity state, and optimistic version;
- exact `company_ref`, `team_ref` where applicable, and `project_ref`;
- exact `system_ref` and canonical Integration/connector definition reference where applicable;
- exact environment binding and environment class;
- zero or more Repository, Workroot, Service, Deployment, Runner, and Tool Provider references;
- allowlisted native-UI route reference and destination classification;
- health/status source references and freshness policy reference;
- versioned capability declarations and integration modes;
- identity/delegation profile reference and authority-policy reference;
- data-classification, minimization, retention, and redaction policy references;
- connector/adapter reference and compatible contract version;
- correlation, causation, Evidence, Audit, provenance, and idempotency references; and
- owner, review time, expiry/revalidation requirements, suspension reason, and retirement reference.

The record contains no credential, token, cookie, Session identifier, private key, provider secret, or copied external business payload. A binding never grants visibility, mutation, Approval, execution, environment, repository, Workroot, Tool, Runner, or Production authority.

## 4. Registry binding contract

Each integration resolves exact, current, versioned references from existing registries:

| Binding dimension    | Canonical owner               | Required behavior                                                      |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| Company/Team/Project | Core/Project Registry         | Resolve exact scope; no scope inferred from labels or navigation       |
| System/Integration   | System/Integration Registry   | Preserve independent System identity and domain ownership              |
| Environment          | Environment/Delivery Registry | Bind exact environment; no cross-environment fallback                  |
| Repository           | Repository Registry           | Reference repository identity and policy, never infer System ownership |
| Workroot             | Workroot Registry / MAOS-019  | Use canonicalized allowed Workroot references only                     |
| Service/Deployment   | Delivery Registry             | Bind exact service, deployment, version, and environment               |
| Health               | Observability/Health Registry | Preserve source, observed time, freshness, and evidence                |
| Connector            | Integration/Tool Registry     | Bind approved adapter version and capability contract                  |

Bindings may be many-to-many and environment-specific. Missing, stale, ambiguous, revoked, retired, cross-scope, or mismatched registry references fail closed. Changes create a new binding version and require governed revalidation; they are never silently repaired from names, URLs, repository paths, or provider metadata.

## 5. Environment mapping

An environment mapping binds one integration version to the canonical environment reference, environment class, System endpoint set, applicable Deployment/Service references, health source, data-classification policy, identity/delegation profile, and authority policy.

- Development, test, preview, staging, and Production are distinct bindings.
- A capability authorized in one environment is not inherited by another.
- Production requires separate exact Production authority and policy.
- No fallback may redirect an authority-bearing action to another environment.
- Environment labels in URLs or deployment names are descriptive only; registry binding is authoritative.

## 6. Repository and Workroot mapping

Repository and Workroot references are optional and included only when operationally applicable.

- A Repository reference identifies the registered repository, provider-neutral identity, allowed branch/ref policy, classification, and ownership.
- A Workroot reference identifies the canonical path policy, device/Runner scope, repository linkage, and allowed capabilities under MAOS-019.
- One repository may support several Systems/Projects; one System may use several repositories and Workroots.
- Portal navigation does not grant repository or filesystem access.
- Repository and Workroot changes require a new binding version and current authority checks.

The portal never persists local paths as authority, expands Workroot scope, or bypasses MAOS-019 containment and Tool Gateway validation.

## 7. Deployment mapping

Deployment mapping references exact Service, Deployment, release/artifact version, environment, provider-neutral endpoint reference, observed state, health source, and Evidence/Audit links.

Provider console links are explicit external deep links. They grant no provider authority and contain no credentials. Deployment visibility, deployment command availability, and deployment execution permission are evaluated independently.

## 8. Integration modes

MAOS-029 defines five composable integration-mode facets where no narrower canonical equivalent already exists:

1. `NAVIGATION_ONLY` — safe governed navigation to an allowlisted native UI; no data projection or mutation.
2. `READ_PROJECTION` — read-only, source-attributed, freshness-bound selected status/summary projection.
3. `GOVERNED_COMMAND` — command intent may enter existing CommandEnvelope → routing → Approval → Task/Run/Tool/Runner machinery.
4. `APPROVAL_SURFACE` — present and act on existing canonical Approval records; no new Approval authority.
5. `EVIDENCE_AUDIT_PROJECTION` — read-only MAOS-026 Evidence/Audit projection correlated to the external System.

Modes describe exposed integration behavior; they grant no permission. Each capability entry separately binds mode, scope, environment, risk floor, required permission, Approval policy, Tool/Runner boundary, connector version, data classification, and freshness requirements.

## 9. Capability exposure contract

Every exposed capability contains:

- canonical capability reference/version and external-operation reference;
- integration mode and exact Project/System/environment scope;
- read/write/control classification and minimum risk;
- identity/delegation profile and required permission/policy;
- required Approval, Evidence, verification, and Audit rules;
- Tool, connector, Runner, repository, Workroot, and deployment constraints where applicable;
- request/response schemas, limits, timeout, cancellation, retry, and idempotency behavior;
- availability and version-compatibility state; and
- safe user-facing description and native fallback/deep link.

Capability discovery is allowlist-based. Unknown, removed, incompatible, ambiguous, or unvalidated capabilities are unavailable, not inferred.

## 10. Native UI and deep-link contract

Safe navigation to the external system's native UI is preferred over embedding.

- Links are derived from allowlisted registry route templates and typed opaque identifiers.
- Destination System, environment, and external-navigation warning are visible before leaving MAOS.
- Links contain no bearer token, Session/cookie/CSRF value, credential, Approval token, private payload, or embedded authority.
- Redirect targets, scheme, host, path pattern, environment, and scope are server-validated.
- Single sign-on or delegated login, if separately approved, follows the identity/delegation contract and never passes secrets in URLs.
- Unauthorized, stale, cross-environment, or invalid links fail closed without leaking resource existence.

Micro-frontend or iframe embedding is not a default integration mode and requires a separate trust-boundary architecture review.

## 11. Read projection contract

A read projection contains exact source System/reference, source record/version where permissible, source attribution, observed-at and received-at times, freshness state, environment, scope, classification/redaction, transformation version, integrity/Evidence references, and safe summary payload.

- Projection data is a cache/view, never the business source of truth.
- Freshness policy defines current, stale, unknown, and unavailable display outcomes without redefining external status semantics.
- The UI identifies stale, partial, delayed, simulated, and last-known values.
- MAOS does not write projections back to the external System.
- Sensitive or excessive source data is referenced or summarized, not copied by default.
- Business KPI, operational health, deployment state, security posture, and readiness remain distinct.

## 12. Governed command integration

An external mutation or control request follows:

`Human Message/UI intent → CommandEnvelope → Planner/Reviewer routing → Plan/Review → Human Approval when required → Executor routing → existing Task/Run → Tool Gateway → Connector/Runner → External System → Result/Evidence/Audit → Verification`.

UI controls create only governed intent. They never invoke an external mutation directly. At dispatch and immediately before action, the owning boundaries revalidate identity, scope, permission, risk, environment, target/version, Approval, capability/connector version, external preconditions, Tool Permission, Runner, health/freshness, and revocation.

Retries use scoped idempotency and external idempotency support where available. Unsafe retries, missing external concurrency control, ambiguous outcome, stale authority, or changed target resolve to fail-closed reconciliation or `WAITING_HUMAN`, never blind replay.

## 13. Authority boundary

Portal visibility, registry membership, deep-link access, health visibility, capability advertisement, connector availability, or external authentication never implies command authority.

Both boundaries are mandatory:

1. **MAOS authority** — Identity → Scope → Permission → Risk → Approval → Execution → Evidence → Audit.
2. **External authority** — the external System's current identity, role, policy, target, and operation authorization.

Failure at either boundary denies the action. MAOS cannot grant authority the external System does not accept; external authority cannot bypass MAOS governance for MAOS-originated work.

## 14. Authentication and delegation

Each capability binds exactly one approved identity pattern:

- **Human identity** — the external System authorizes the current Human directly; MAOS preserves correlation without impersonation.
- **Service identity** — a least-privilege MAOS integration service acts within an exact capability/scope/environment.
- **Delegated authority** — a short-lived, audience-bound delegation references the Human and exact approved operation under existing security policy.

Credentials remain in approved secret/runtime providers and are never stored in portal metadata, browser state, URLs, Evidence, logs, or Audit. Service identity never implies Human Approval. Delegation cannot broaden scope, environment, capability, duration, or external role and must support revocation and expiry.

## 15. Data classification boundary

Each projection/capability binds source classification, permitted fields, purpose, scope, residency/transfer restrictions, retention, redaction, and audience policy.

- Default to metadata, status, summary, and opaque reference rather than raw domain records.
- Private employee, financial, customer, legal, credential, and regulated data remain in the authoritative System unless explicit policy permits bounded projection.
- A Project Portal cannot aggregate data across Projects, Companies, environments, or classifications without exact authorization.
- Logs, Evidence, and Audit exclude secrets and minimize business payloads.

## 16. Health, freshness, and degraded state

`PortalIntegrationHealthProjection` contains System/Service/Deployment references, environment, source health/status, normalized display category, observed-at/received-at, freshness deadline, probe/source identity, connector version, Evidence reference, and last successful contact.

Normalized display categories do not overwrite source status. When a System or connector is degraded/unavailable:

- show source-attributed stale/degraded/unknown state and last observation;
- never present last-known data as current;
- keep safe navigation/read functions only when independently valid;
- disable or fail closed authority-bearing actions when current validation/preconditions are unavailable;
- never fall back to a broader credential, environment, connector, Tool, Runner, or direct path; and
- surface bounded recovery guidance and governed native deep links where safe.

## 17. Version and capability discovery

Discovery records external API/schema version, connector version, capability set/version, compatibility range, observed time, validation evidence, and deprecation/sunset metadata.

Discovery is descriptive and non-authoritative. New or changed capability requires validation, policy evaluation, data/security review, and a new integration binding version before exposure. Capability removal immediately disables dependent actions; it does not trigger an older unsafe fallback.

## 18. Connector and adapter boundary

A connector/adapter may:

- translate canonical approved request/response schemas;
- perform protocol, transport, authentication, pagination, rate-limit, timeout, idempotency, and error mapping;
- validate external version/capability compatibility; and
- emit bounded technical Evidence and correlation identifiers.

It must not:

- own external business rules or become business SoT;
- select scope, risk, Approval, Executor, Tool Permission, Runner, or environment;
- reinterpret raw Human text or expand a canonical command;
- store unrestricted credentials or domain data;
- silently retry ambiguous mutations; or
- bypass MAOS or external authorization.

## 19. Evidence and Audit correlation

Cross-system work preserves the full MAOS correlation/causation chain plus safe external references:

- integration/binding and connector versions;
- Project, System, environment, capability, target, Task/Run/Tool/Runner, Approval, and actor references;
- MAOS request/correlation/causation IDs;
- external request, operation, result, and audit references where safely available;
- source and result version/hash, timestamps, idempotency/reconciliation outcome; and
- Evidence/Audit integrity, classification, and redaction metadata.

MAOS-026 remains authoritative. External audit references are correlated, not imported as a duplicate event ledger. Evidence/Audit visibility grants no mutation or business authority.

## 20. Integration lifecycle

Integration lifecycle reuses canonical registry/change states and records governed transitions for proposal, validation, activation, change, suspension, and retirement without creating a second lifecycle engine.

- **Proposal** defines intended binding, modes, owner, and risk.
- **Validation** verifies registry references, environment, classification, identity, connector, capabilities, health, and policy.
- **Activation** requires approved binding version and separately authorized implementation/configuration.
- **Change** creates a new version and repeats affected validation/Approval.
- **Suspension** disables affected projections/actions while retaining history.
- **Retirement** removes active exposure, revokes integration authority/credentials through their owners, and preserves Evidence/Audit.

Activation in one environment never activates another. Rollback selects a previously validated binding only if its dependencies and authority remain current.

## 21. Mobile Project Portal projection

Mobile may expose bounded status, safe native deep links, canonical Approval surfaces, critical Evidence summaries, `WAITING_HUMAN`, and governed stop/pause/kill entry points.

- Mobile uses identical integration, scope, authority, freshness, and security contracts.
- Full registry administration, connector configuration, credential management, and forensic data access remain desktop-focused unless separately approved.
- Stop/pause/kill reuse MAOS-018/019 controls and never directly control external Tools/Runners.
- Stale or offline state is read-only; authority-bearing actions require live refresh and validation.

## 22. Initial integration inventory

This inventory names intended bindings but invents no canonical IDs. Implementation must resolve approved registry references and exact environment/capability policies before activation.

| System/capability group             | Primary authoritative domain             | Initial intended modes                                                                          | Binding emphasis                                                     |
| ----------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| RBS Homes                           | Consumer real-estate platform            | NAVIGATION_ONLY, READ_PROJECTION, EVIDENCE_AUDIT_PROJECTION                                     | Native UI, service/deployment health, customer-data minimization     |
| Admin RBS                           | RBS administration                       | NAVIGATION_ONLY, READ_PROJECTION, GOVERNED_COMMAND, APPROVAL_SURFACE                            | Privileged-operation isolation and exact environment/target Approval |
| AI-MLS                              | Listing intelligence                     | NAVIGATION_ONLY, READ_PROJECTION, GOVERNED_COMMAND, EVIDENCE_AUDIT_PROJECTION                   | Model/result provenance and external listing authority               |
| CRM                                 | Customer/brokerage/human-work SoT        | NAVIGATION_ONLY, READ_PROJECTION, GOVERNED_COMMAND, APPROVAL_SURFACE                            | Private-data classification and bounded command schemas              |
| AI Memory Gateway                   | Corporate AI memory/retrieval SoT        | READ_PROJECTION, GOVERNED_COMMAND, EVIDENCE_AUDIT_PROJECTION                                    | Reference-first retrieval, classification, no memory duplication     |
| Marketing Agent                     | Marketing automation/agent operations    | READ_PROJECTION, GOVERNED_COMMAND, APPROVAL_SURFACE, EVIDENCE_AUDIT_PROJECTION                  | Campaign risk, external action Approval, result evidence             |
| Broker Network                      | Broker-network operations                | NAVIGATION_ONLY, READ_PROJECTION, GOVERNED_COMMAND                                              | Participant scope and external communication authority               |
| ERP / Accounting / HR / Labor       | Financial and workforce SoTs             | NAVIGATION_ONLY, READ_PROJECTION, GOVERNED_COMMAND, APPROVAL_SURFACE                            | Financial/employee privacy and high-risk transaction gates           |
| PH Tax / Accounting / Legal AI Team | Professional analysis/drafting support   | READ_PROJECTION, GOVERNED_COMMAND, APPROVAL_SURFACE, EVIDENCE_AUDIT_PROJECTION                  | Human professional authority; no autonomous filing/legal authority   |
| Development Team Portal             | Development work and delivery projection | NAVIGATION_ONLY, READ_PROJECTION, GOVERNED_COMMAND, APPROVAL_SURFACE, EVIDENCE_AUDIT_PROJECTION | Repository/Workroot/Runner/Deployment boundaries under MAOS-019      |

The listed modes are candidate exposure intent, not authorization or proof of live capability.

## 23. Non-goals

MAOS-029 does not:

- implement or activate any integration;
- move or merge repositories, databases, deployments, native UIs, or business SoTs;
- define shared business tables or unrestricted data replication;
- create a duplicate registry, authorization, Approval, command, Workflow, execution, Evidence, or Audit engine;
- permit unrestricted iframe/micro-frontend embedding;
- permit direct UI-to-external mutation or credential display;
- grant cross-environment, cross-Project, provider, Tool, Runner, or Production authority;
- make an adapter the owner of business rules; or
- modify any frozen v2.0 architecture.

## 24. Compatibility and traceability

- **MAOS-028:** Approval UX remains the Human decision surface; integration does not create Approval.
- **MAOS-027:** mobile parity, live validation, offline, Session, and security boundaries remain authoritative.
- **MAOS-026:** Evidence/Audit integrity, correlation, redaction, and queryability remain authoritative.
- **MAOS-025:** exact Human Approval binding and revalidation remain authoritative.
- **MAOS-024:** Verification evaluates exact governed results, not portal summaries.
- **MAOS-023:** Executor routing owns eligible execution selection; adapters do not.
- **MAOS-022:** Planner/Reviewer routing remains policy-driven and independent.
- **MAOS-021:** Human Message/CommandEnvelope provenance and pre-Task boundary remain authoritative.
- **MAOS-020:** Company/Team/Project portal hierarchy and registry-driven composition remain authoritative.
- **MAOS-018:** stop/pause/kill and autonomous-loop governance remain authoritative.
- **MAOS-019:** Tool Gateway, Runner, Repository, and Workroot execution controls remain mandatory.

## 25. Decisions

1. D14J-001 — Model integration as a versioned Project/System/environment registry binding.
2. D14J-002 — Keep external Systems authoritative for business state and native actions.
3. D14J-003 — Define five composable non-authoritative integration modes.
4. D14J-004 — Route every external mutation through existing governed command/execution machinery.
5. D14J-005 — Prefer allowlisted native deep links over embedded external UIs.
6. D14J-006 — Keep connectors limited to protocol translation and transport.
7. D14J-007 — Fail closed on stale registry, authority, capability, health, or environment state.

## 26. Risks and assumptions

### Risks

1. R14J-001 — Projection data becomes a shadow SoT. Control: source attribution, freshness, bounded fields, and no write-back.
2. R14J-002 — Registry drift targets the wrong System/environment. Control: exact versioned refs and fail-closed revalidation.
3. R14J-003 — Direct UI action bypasses governance. Control: canonical CommandEnvelope and Task/Run/Tool path.
4. R14J-004 — Credential/delegation leakage crosses trust boundaries. Control: secret-provider isolation and short-lived bounded delegation.
5. R14J-005 — Connector accumulates domain logic. Control: schema/transport-only connector contract.
6. R14J-006 — Degraded fallback broadens authority. Control: no broader fallback and explicit stale/degraded state.
7. R14J-007 — Cross-system correlation leaks sensitive data. Control: opaque refs, classification, redaction, and minimization.
8. R14J-008 — Inventory modes are mistaken for authorization. Control: label as candidate intent and require activation validation.

### Assumptions

1. A14J-001 — Canonical registries provide stable typed refs and version/freshness metadata.
2. A14J-002 — External Systems expose approved native routes, read/status interfaces, or connector capabilities as applicable.
3. A14J-003 — Existing MAOS command, Approval, Task/Run, Tool Gateway, Runner, Evidence, and Audit contracts remain available.
4. A14J-004 — Each System owner can define classification, identity/delegation, environment, and capability policies before activation.

## 27. Governance gate

Human C2 decision `APPROVE_MAOS_CR_014_C2` adopts MAOS-029 as the approved/frozen MAOS Architecture v2.1 baseline. It adds a canonical cross-system Project Portal integration binding without modifying frozen v2.0.

- MAOS-CR-014 is `APPROVED_C2`.
- C2 blockers are `NONE`; non-blocking findings are `NONE`; candidate correction required is `NO`.
- Phase 14J status is `COMPLETE`.
- Phase 14K is `READY` for separately authorized planning.
- Runtime implementation, integration activation, migration, dependency, provider, Production implementation, and deployment authority remain `NO`.
