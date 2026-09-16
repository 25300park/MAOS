# MAOS-020 — Registry-Driven Company, Team, and Project Portal Architecture

## MAOS Architecture v1.2

| Item                     | Value                     |
| ------------------------ | ------------------------- |
| Document ID              | MAOS-020                  |
| Version                  | 1.2                       |
| Status                   | APPROVED / FROZEN         |
| Change Class             | C2 Minor Architecture     |
| Current Frozen Baseline  | MAOS Architecture v1.1    |
| Change Request           | MAOS-CR-005 — APPROVED_C2 |
| Freeze Record            | MAOS-FRZ-003              |
| Implementation authority | NONE                      |
| Production authority     | NONE                      |

## 1. Objective

Define MAOS as the Digital Headquarters and Company Operating Portal for a single Human Owner operating multiple independent business systems and governed AI teams.

The portal is one human command surface for observation, navigation, command intent, plan review, Approval, evidence, Audit, and emergency control. It is a registry-driven projection over existing MAOS authority and execution contracts. It is not a new source of truth, workflow engine, approval system, agent runtime, or integration runtime.

## 2. Architectural decision

Select a **registry-driven Company → Team → Project portal composition**.

- The Company Portal aggregates governed state across registered Teams, Projects, Systems, Environments, Deployments, Runs, Approvals, Alerts, Evidence, and Audit.
- A Team Portal is an operating projection for one accountable capability group. A Team may reference one or more independent Systems and Projects without owning their domain data.
- A Project Portal is the exact governed work scope for Tasks, Workflows, Agents, Runs, Approvals, Artifacts, Evidence, Audit, and environment mappings.
- System detail remains a separate registry-backed view and deep link. A System is not silently converted into a Team or Project.
- Every displayed relationship is a typed registry reference. The portal does not infer ownership or authority from labels, URLs, repository location, or UI nesting.

Rejected alternatives:

1. **System-first coupling** is rejected because it conflates deployed Systems with human/AI accountability and Project scope.
2. **Embedded micro-frontends** are rejected because they expand browser, credential, release, and failure trust boundaries and create provider coupling.
3. **Physical centralization** is rejected because independent repositories, deployments, and sources of truth must remain independent.

## 3. Portal hierarchy

```text
Company Portal
├── Today / Operating Briefing
├── Approvals / Alerts / Evidence / Audit
├── Team Portals
│   ├── RBS Homes
│   ├── Admin RBS
│   ├── AI-MLS
│   ├── CRM
│   ├── AI Memory Gateway
│   ├── Marketing Agent
│   ├── Broker Network
│   ├── ERP / Accounting / HR / Labor
│   ├── PH Tax / Accounting / Legal AI Team
│   └── Development Team
├── Project Portals
│   └── Exact project-scoped operating views
└── Registry Views
    ├── Systems / Integrations
    ├── Environments / Services / Deployments
    ├── Repositories / Workroots / Runners
    └── Agents / Skills / Tools / Models
```

The initial portal catalog may use one Team Portal per named operating capability, but the contract does not require a one-to-one Team-to-System relationship. A Team can coordinate several Systems; a System can participate in several Projects through explicit, scoped registry bindings.

## 4. Company Portal contract

The Company Portal is an executive operating projection with:

- company goals and current MAOS-018 LoopRun state;
- Team and Project summaries;
- registered System health and freshness;
- current environment and deployment state;
- Tasks, Runs, blockers, waiting-human states, and budgets;
- Approvals separated from Reviews and QA results;
- Alerts, Incidents, Evidence, and Audit entry points;
- safe command-intent creation; and
- visible Pause, Stop, Cancel, and Kill controls where the current Human Owner has exact authority.

It never writes directly to a domain System. A command creates a governed MAOS object such as a Task, Trigger, ToolCall request, Approval request, or control decision. Execution remains behind the existing API, Tool Gateway, Runner, permission, Approval, evidence, and Audit boundaries.

## 5. Team Portal canonical contract

A `TeamPortalDefinition` is a registry-backed projection containing:

- `team_portal_id`, name, description, lifecycle status, and version;
- accountable Human Owner and approved team/agent references;
- referenced Project IDs and System IDs;
- allowed environment scopes;
- default landing Project, optional System deep links, and navigation policy;
- visible health, work, Approval, Evidence, and Audit capabilities;
- allowed command-intent types and required authority policy references;
- mobile capability subset; and
- configuration provenance, effective time, and evidence references.

A Team Portal grants no authority. Membership, navigation visibility, command availability, and execution permission are evaluated independently. Hiding a command in the UI is not authorization; showing it is not permission.

## 6. Project Portal canonical contract

A `ProjectPortalDefinition` binds one canonical MAOS Project to its operating context:

- `project_portal_id` and canonical `project_id`;
- organization and department references;
- Project scope and lifecycle status;
- System and Integration references;
- Environment, Service, Deployment, and external-resource references;
- Repository, Workroot, Runner, and Tool Provider references;
- Tasks, Workflows, Agents, Runs, Artifacts, Evidence, Decisions, Reviews, and Approvals;
- health and freshness policy references;
- allowed command-intent types; and
- portal version, provenance, and Audit references.

Project Portal scope is authoritative only when derived from the current Project and Identity/Authorization state. Repository path, deployment name, branch, browser route, or Team membership never creates Project authority.

## 7. Registry-driven composition

Portal composition consumes existing canonical registries and adds no parallel registry.

| Portal concern                    | Canonical source                   |
| --------------------------------- | ---------------------------------- |
| Human identity, roles, scope      | Identity / Authorization           |
| Organization, department, project | Core Registry                      |
| System and integration identity   | System / Integration Registry      |
| Environment and deployment        | Delivery Registry                  |
| Repository and workroot           | Repository / Workroot Registry     |
| Runner and capability             | Runner / Tool Registry             |
| Agent, model, skill, tool         | AI and Tool Registries             |
| Task, workflow, run               | Work and Execution domains         |
| Approval and decision             | Governance domain                  |
| Artifact and evidence             | Knowledge / Evidence domain        |
| Health, alert, incident           | Operations / Observability domains |
| Immutable accountability          | Audit domain                       |

Portal definitions store references and presentation policy only. Domain data is read through approved APIs, integration contracts, or deep links. Unregistered resources are unavailable rather than guessed.

## 8. Environment, repository, workroot, and deployment mapping

A `PortalResourceBinding` contains:

- canonical Project and System references;
- environment (`local`, `development`, `staging`, or separately authorized production scope);
- repository identity and provider reference;
- default branch/reference policy without embedded credentials;
- Workroot identity and canonical path policy;
- Runner and Tool Provider references;
- Service and Deployment references;
- source-of-truth owner;
- health/evidence sources;
- lifecycle state, version, and validity interval; and
- configuration evidence and Audit references.

Bindings are many-to-many and environment-specific. The portal must not assume that one repository equals one System, one Team, or one Deployment. Secrets remain external runtime references and are never portal metadata.

MAOS-019 governs local Workroot and Runner execution. Remote deployments remain governed by MAOS delivery and provider integration contracts. A portal deep link may open an external provider console, but it conveys no provider authority.

## 9. Health and status aggregation

A `PortalHealthProjection` contains the source status, normalized display status, observed time, freshness state, environment, System/Service/Deployment references, evidence references, and source identity.

Aggregation rules:

- preserve source status and evidence; never replace it with an unexplained aggregate;
- display freshness and `UNKNOWN` when current evidence is absent;
- aggregate by the most severe current authoritative child state, while allowing drill-down to every contributor;
- keep operational health, deployment status, readiness, security posture, and business KPI status separate;
- never interpret an HTTP success, deployment `READY`, test PASS, or AI recommendation as production approval; and
- prevent stale or untrusted observations from enabling commands.

The Company Portal summarizes; Team and Project Portals explain. The underlying System remains the source of truth for its domain state.

## 10. Human command surface and authority

The canonical command path remains:

`Identity → Scope → Permission → Risk → Approval → Execution → Evidence → Audit`

The portal may create a structured `CommandIntent` with actor, target, Project/System/environment scope, requested action, parameters, risk classification, idempotency key, evidence expectations, and correlation context. It must not directly execute a free-form chat response.

- Read-only inspection requires exact scope and permission.
- Controlled writes, external actions, destructive operations, credential/security changes, and production actions use the existing risk and Approval policies.
- Production actions require exact Human Approval bound to the action, target, version/hash, environment, and validity window.
- AI plans are reviewable proposals. Review, recommendation, QA PASS, and Loop completion never grant Approval.
- Commands fail closed if registry binding, identity, scope, health freshness, permission, policy, Approval, Runner, or provider state is missing or stale.

## 11. Single Human Owner authority model

The company may have one Human Owner, but the Owner is still represented by a durable Human identity with scoped roles and permissions.

- Ownership does not create an implicit global bypass.
- The Owner may hold multiple explicit roles, but each action is evaluated against its exact scope and environment.
- Step-up/MFA and target-bound Approval remain required where policy requires them.
- If separation of duties cannot be satisfied by the one-person operating model, the action remains blocked or requires an explicitly approved policy exception; MAOS must not silently self-approve.
- Delegated AI, service, Runner, and provider identities remain distinct from the Human Owner.
- Session, authority, and credential revocation remain available at Company, Team, Project, System, Runner, and Session boundaries where supported by canonical contracts.

## 12. Cross-portal navigation

- Canonical entry: Company → Team → Project → Task/Run/Evidence or System detail.
- Breadcrumbs carry typed IDs and return paths, not authority.
- Global search returns registry entities filtered by current Identity and scope.
- Cross-Team navigation requires visibility in the destination scope.
- System links open System Detail first; external application/provider links are explicit deep links with destination and environment labels.
- Portal state must not be encoded with credentials, Session IDs, approval tokens, or other authority material in URLs.
- Backlinks preserve correlation and evidence context without copying domain data.

## 13. Evidence and Audit visibility

Every actionable view exposes the associated request, Task, Run, ToolCall, Approval, Artifact, Evidence, Deployment, and Audit references that exist. The UI distinguishes:

- source observation from MAOS interpretation;
- plan from approved action;
- Review and QA from Approval;
- execution result from verified outcome; and
- Evidence from Audit.

Evidence views are redacted by classification and permission. Audit views are append-only projections and remain independently queryable through canonical Audit authority. The portal never stores secret values, raw credentials, private employee content, or copied external source-of-truth records merely to improve display convenience.

## 14. Pause, stop, cancel, and kill entry points

Controls are contextual and explicit:

- **Pause**: move a resumable LoopRun or supported Run to a non-executing state after authority revalidation.
- **Stop**: request governed graceful termination and preserve partial evidence.
- **Cancel**: terminate eligible queued or active work according to its lifecycle contract.
- **Kill**: invoke the canonical emergency kill switch for the exact LoopRun, Run, ToolCall, Runner, or local execution boundary.

Each control requires current Human identity, exact scope, permission, risk classification, and Approval where required. The action records actor, reason, target version, environment, time, evidence, and Audit. Kill never deletes Evidence, Audit, or domain data and never grants authority to restart. Resume requires fresh authorization and policy validation.

MAOS-018 owns LoopRun control semantics. MAOS-019 owns local execution cancellation, timeout, kill, and revocation enforcement. The portal is only the governed entry surface.

## 15. Mobile-first operating subset

The mobile subset supports:

- Today and company briefing;
- Team/Project health summaries and freshness;
- Alerts, Incidents, blockers, and waiting-human queues;
- exact Approval review with target/risk/environment context;
- bounded command intents with predeclared schemas;
- Pause, Stop, Cancel, and emergency Kill where safe and authorized;
- compact Evidence/Audit timelines; and
- secure deep links to the full portal.

Mobile does not provide unrestricted terminal access, workflow/permission design, bulk administration, secret management, broad policy editing, repository editing, or complex deployment configuration. High-risk controls require step-up verification and explicit confirmation.

## 16. Relationship to MAOS-018

MAOS-020 visualizes and controls MAOS-018 objects; it does not create a second autonomous-loop runtime.

- Company Portal surfaces Goals, LoopRuns, evaluations, budgets, stop conditions, next actions, and waiting-human/Approval states.
- Team and Project Portals filter the same canonical objects by registered scope.
- Plan review results remain Reviews or Decisions and do not become Approval.
- Pause/Stop/Kill actions call MAOS-018 lifecycle controls through canonical APIs.
- Free-running agent chat remains non-canonical. Agent collaboration remains Task → Artifact → Review → Revision.

## 17. Relationship to MAOS-019

MAOS-020 surfaces MAOS-019 Runner, device, Workroot, capability, health, Task/Run, evidence, and control state.

- Local Bridge remains a Runner/Tool Provider behind the Tool Gateway.
- Portal registration and health visibility grant capability only, never Tool Permission or Approval.
- Filesystem, command, offline lease, redaction, revocation, and kill policies remain owned by MAOS-019.
- The Development Team Portal may deep-link to the IDE Companion while keeping the Control Room as the authoritative command surface.

## 18. Integration boundaries

The named business and AI systems remain independently deployed and governed. MAOS integrates them through registered APIs, events, observations, commands, evidence references, and explicit deep links.

- RBS Homes and Admin RBS remain separate operational systems.
- AI-MLS, CRM, AI Memory Gateway, Marketing Agent, Broker Network, ERP/Accounting/HR/Labor, and legal/tax/accounting AI capabilities retain their own domain ownership.
- Development Team Portal coordinates governed MAOS development without replacing repositories, IDEs, CI, Vercel, Railway, or other providers.
- A portal may aggregate state but must show ownership, environment, source, freshness, and evidence.
- Cross-system workflows reference domain records; they do not merge or duplicate them into a new portal source of truth.

## 19. Decisions, assumptions, and risks

### Decisions

1. Use registry-driven composition rather than System-driven navigation ownership.
2. Keep Team, Project, and System as separate concepts connected by typed references.
3. Use structured command intents, not free-running agent chat, as the human command surface.
4. Reuse existing Workflow, Approval, Agent, Runner, Evidence, Audit, and autonomous-loop runtimes.
5. Treat mobile as a bounded operating subset, not a full administration surface.

### Assumptions

1. Every visible System, environment, repository, Workroot, deployment, and Runner can be assigned a canonical registry identity before it becomes actionable.
2. Existing Systems expose sufficient health, evidence, API, event, or deep-link contracts for observation without copying their source-of-truth data.
3. The single Human Owner can be represented through existing durable Identity, Session, scope, permission, and Approval contracts.
4. Phase 14B will implement projections incrementally and will not require all external Systems to be modified simultaneously.

### Risks

1. **Stale aggregation** could present misleading company state. Mitigation: mandatory observed-at, source, freshness, and `UNKNOWN` behavior.
2. **Authority confusion** could make navigation appear to grant execution rights. Mitigation: independent server-side authorization and explicit UI authority state.
3. **Registry drift** could misbind repository, Workroot, or deployment targets. Mitigation: versioned bindings, verification evidence, and fail-closed commands.
4. **Single-owner concentration** increases credential and approval risk. Mitigation: step-up/MFA, revocation, target-bound approvals, and no implicit superuser bypass.
5. **Status flattening** could hide domain-specific failures. Mitigation: preserve source status and drill-down contributors.
6. **Provider or System coupling** could turn MAOS into a fragile shell. Mitigation: provider-neutral registry references and explicit deep links.
7. **Mobile high-risk action error** could cause unintended control. Mitigation: bounded schemas, confirmation, step-up, and restricted mobile capabilities.

## 20. Prohibited coupling and non-goals

- no System-first ownership model;
- no embedded micro-frontend federation;
- no cross-system source-of-truth merging;
- no physical repository centralization;
- no duplicate Workflow, Approval, Agent, Runner, Evidence, Audit, or autonomous-loop runtime;
- no free-running agent chat control plane;
- no browser-held provider credentials;
- no wildcard cross-origin trust;
- no unregistered direct execution path;
- no automatic production action or deployment;
- no authority derived from portal hierarchy, deep links, repository paths, or deployment names; and
- no expansion of trust boundaries without an approved Change Request and implementation evidence.

## 21. Traceability

| Requirement                   | Existing architecture | MAOS-020 extension                                    |
| ----------------------------- | --------------------- | ----------------------------------------------------- |
| Control Room and drill-down   | MAOS-011              | Registry-driven Company/Team/Project composition      |
| System and Project separation | MAOS-001, MAOS-002    | Typed portal references without SoT transfer          |
| Human authority and Approval  | MAOS-009, MAOS-012    | Structured command and emergency-control entry points |
| Evidence and Audit            | MAOS-013              | Cross-portal visibility and correlation               |
| Environments and Deployments  | MAOS-017              | Portal resource bindings and status projection        |
| Autonomous loops              | MAOS-018              | Goal/LoopRun visibility and lifecycle controls        |
| Local execution               | MAOS-019              | Runner/Workroot visibility and governed controls      |

MAOS-011, MAOS-018, and MAOS-019 remain unchanged. MAOS-020 is adopted into the frozen v1.2 baseline through MAOS-CR-005 and MAOS-FRZ-003.

## 22. Phase 14B gate

Phase 14B is `READY` for separately authorized planning and implementation because MAOS-CR-005 is `APPROVED_C2`. This readiness grants no runtime implementation, provider change, migration, production implementation, or production deployment authority; each remains separately gated and must be explicitly authorized and verified.
