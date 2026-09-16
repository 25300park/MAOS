# MAOS-030 — Development Team Portal Architecture

## MAOS Architecture v2.2 — Approved / Frozen

| Item                     | Value                     |
| ------------------------ | ------------------------- |
| Document ID              | MAOS-030                  |
| Version                  | 2.2 candidate             |
| Status                   | APPROVED / FROZEN         |
| Change Class             | C2 Minor Architecture     |
| Current Frozen Baseline  | MAOS Architecture v2.1    |
| Change Request           | MAOS-CR-015 — APPROVED_C2 |
| Implementation authority | NONE                      |
| Production authority     | NONE                      |

## 1. Objective

Define the Development Team Portal as a governed Project Portal specialization for software delivery. It lets the Human Owner observe, plan, review, approve, dispatch, verify, stop, and audit development work while existing repositories, Git hosts, CI systems, package registries, deployment providers, and environments remain their own sources of truth.

`Development Team Portal ≠ SDLC engine`.

The portal composes MAOS-021 through MAOS-029. It creates no second Task, Workflow, Approval, Runner, Git, CI, deployment, Evidence, or Audit engine.

## 2. Architectural decision

Adopt a versioned `DevelopmentTeamPortal` projection and `DevelopmentProjectBinding` that reference canonical Project, System, Repository, Workroot, Environment, Deployment, Tool, Runner, policy, and Evidence/Audit records.

- Human messages enter through MAOS-021 CommandEnvelope semantics.
- Planner and Reviewer selection follows MAOS-022; Executor selection follows MAOS-023.
- Human Approval follows MAOS-025 and its MAOS-028 UX projection.
- Evidence/Audit follows MAOS-026.
- Local work executes through MAOS-019 behind the Tool Gateway; governed loops and controls follow MAOS-018.
- External repository, CI, package, and deployment systems remain authoritative for their native state.

Rejected alternatives: a portal-owned Git/CI/deploy engine; unrestricted shell, filesystem, network, repository, or credential access; raw-message execution; provider/model-coupled role routing; free-running agent chat; agent-selected peers; automatic push, merge, release, or deployment; and Production authority inferred from review, verification, or QA.

## 3. DevelopmentTeamPortal contract

A `DevelopmentTeamPortal` is a non-authoritative projection containing:

- exact company, team, project, system, and environment scope references;
- one or more versioned `DevelopmentProjectBinding` references;
- allowed command classes and current governed Task/Run summaries;
- Planner, Reviewer, Executor, Verification, and Approval status references;
- repository/worktree/workroot, CI, deployment, and health projections;
- EvidenceBundle and Audit references;
- stop, pause, kill, cancellation, and Human checkpoint affordances; and
- correlation, provenance, freshness, redaction, and policy/version references.

Navigation, visibility, or portal membership grants no repository, filesystem, Tool, Runner, network, merge, deployment, or Production authority.

## 4. DevelopmentProjectBinding

The versioned binding resolves exact canonical references for:

- Company → Team → Project ownership;
- System and software product/component identity;
- repository host, repository, default/protected branches, and ref policy;
- approved Workroot and worktree policy;
- environment, service, deployment, CI, package registry, Tool Provider, Runner, and health sources;
- language/build/test/lint/typecheck contracts and approved Skill versions;
- Tool Permission, network, dependency, secret, Git, release, deployment, rollback, retention, and Evidence/Audit policies.

Missing, stale, ambiguous, revoked, cross-project, cross-environment, or mismatched references fail closed. Material changes create a new binding version; names, local paths, URLs, or provider metadata never repair authority implicitly.

## 5. Repository, branch, worktree, Workroot, and environment binding

Every development dispatch binds the exact repository identity and remote, base ref and resolved commit, working branch/ref, worktree identity, canonical Workroot, target environment, policy versions, Task, and Run. MAOS-019 containment applies to every local path, including symlinks and junctions.

- Work occurs only inside the authorized Workroot/worktree.
- A worktree does not expand repository or branch authority.
- Dirty-state ownership is inspected before mutation; unrelated Human work is preserved.
- Branch creation, checkout, stage, commit, push, merge, tag/release, and deploy are distinct governed actions.
- Cross-repository, cross-Workroot, cross-environment, protected-branch, and detached-target ambiguity fails closed.

## 6. Governed development command classes

| Class         | Examples                                     | Boundary                                                      |
| ------------- | -------------------------------------------- | ------------------------------------------------------------- |
| Observe       | status, diff, log, health, CI result         | Read-only, freshness-labelled projection                      |
| Analyze/Plan  | diagnose, design, plan, estimate             | Produces governed artifacts, no mutation authority            |
| Review/Verify | review diff, test evidence, reproduce        | Independent governed Task/Run; not Approval                   |
| Edit          | create/update files, format generated output | Exact Workroot/file/tool scope                                |
| Validate      | test, lint, typecheck, build, security scan  | Exact commands, environment, limits, and evidence             |
| Dependency    | add/update/remove/install dependency         | Separate policy, network, lockfile, license/security evidence |
| Git local     | branch, worktree, stage, commit              | Each action separately authorized and evidenced               |
| Git remote    | fetch, push, PR, merge, tag/release          | External effects; exact remote/ref/commit binding             |
| Delivery      | package, deploy, rollback                    | Exact artifact/environment/provider/approval binding          |
| Control       | cancel, pause, stop, kill                    | Existing MAOS-018/019 controls only                           |

Classification does not itself authorize action. Policy may pre-authorize bounded actions; it must never silently bundle a later higher-impact action.

## 7. Software roles and handoffs

### Planner

Receives a CommandEnvelope, exact DevelopmentProjectBinding, registered capabilities/Skills, scope/risk, and policy. It produces a versioned Plan artifact with intended files, commands, dependencies, tests, checkpoints, rollback, and evidence requirements. It never mutates the repository or selects its Reviewer.

### Reviewer

Receives the governed Plan through MAOS-022. It is independent from the Planner identity and Planner Run, evaluates correctness, security, architecture, scope, and evidence, and produces only a versioned Review Artifact or canonical existing Review equivalent. It must not produce a Verification Artifact, a combined Review/Verification artifact, or a verification outcome. Review PASS is not Verification or Approval and confers no execution or Production authority.

### Executor

Receives only an approved, immutable MAOS-023 execution-constraint bundle. It may act only through existing Task/Run, Tool Gateway, Tool Permission, Runner, Workroot, environment, and Approval boundaries. It cannot reinterpret raw messages, widen scope, select new Tools/Runners, or self-approve.

Handoffs contain immutable artifact/version/hash references, exact scope/risk/environment, policy versions, correlation/causation, acceptance criteria, evidence requirements, and status. Agents exchange artifacts, never authority; free-running peer negotiation is prohibited.

`Review ≠ Verification` and `Reviewer ≠ Verifier`. Software verification after implementation is governed exclusively by MAOS-024:

`Executor → Implementation / Result / Evidence → Verification Routing → Verifier Task/Run → Verification Artifact`.

MAOS-024 remains authoritative for verification routing, verification handoff, evidence sufficiency, Verifier independence, and verification outcome. MAOS-030 neither duplicates nor reinterprets those semantics, and a Reviewer can never substitute for a Verifier.

## 8. Model/provider abstraction

Agent role, Model, provider, Runner, Skill, and Tool Permission remain distinct. Routing uses registered role capabilities, approved Skill versions, policy, scope, risk, availability, and independence—not provider/model names. Provider selection is an implementation detail constrained after role routing and cannot change authority.

## 9. Local Execution Bridge and remote execution

MAOS-019 remains the local Runner/Tool Provider behind the Tool Gateway. Each request binds Task/Run, repository, Workroot, environment, Runner/device, Tool, capability, Tool Permission, policy, and Approval. Remote CI/deployment runners use the same governed dispatch principles and remain their systems' execution SoTs. No portal-to-shell, portal-to-runner, or UI-to-provider bypass is permitted.

## 10. File, command, and Tool authority

- Read/list/status/diff and write/create/delete/command operations are separate capabilities.
- Every file target is canonicalized and checked against the Workroot allowlist immediately before action.
- Commands use structured executable/argument/environment contracts; unreviewed shell interpolation is prohibited.
- Destructive operations resolve exact targets and require policy-authorized confirmation/Approval.
- Runtime limits, output redaction, exit status, and artifact capture are mandatory.
- Skill capability never implies Tool Permission.

## 11. Git authority model

| Action      | Required binding and evidence                                         | Authority boundary                       |
| ----------- | --------------------------------------------------------------------- | ---------------------------------------- |
| Edit        | file set, Workroot, before/after hashes                               | No stage/commit implied                  |
| Stage       | exact paths/blob hashes and diff                                      | No commit implied                        |
| Commit      | exact staged-tree hash, parent, author policy, message                | No push implied                          |
| Push        | exact remote, source ref, destination ref, commit, force policy       | External effect; no merge implied        |
| Merge       | exact head/base, reviewed commits, checks, strategy, protected policy | Separate approval; no deploy implied     |
| Tag/Release | exact commit, immutable tag/release metadata                          | Separate release authority               |
| Deploy      | exact artifact/commit, environment, provider, rollback plan           | Separate deployment/Production authority |

Force push, history rewriting, protected-branch mutation, destructive cleanup, and Production operations fail closed unless an exact current policy and explicit Human authority permit them. Commit, push, merge, release, and deploy evidence remains independently queryable.

## 12. Validation and build boundaries

Test, lint, typecheck, build, security, and architecture commands are registry/policy-defined, executed through approved Runners, and bound to the exact repository state. Results include command identity, toolchain version, environment, commit/tree hash, exit code, timestamps, and immutable artifact/evidence references. A PASS never implies Review, Approval, merge, release, or Production Approval.

## 13. Network boundary

Network access is denied by default. A grant binds destination/registry/provider, protocol, port, operation, purpose, data classification, scope, Task/Run, environment, time limit, and policy/Approval. DNS resolution and redirects are revalidated. Fallback cannot broaden destinations or methods. Local-only work remains offline where feasible.

## 14. Dependency-change boundary

A dependency mutation is distinct from file edit and command execution. It binds package/ecosystem, version/range, registry, reason, affected manifests, install scripts, network grant, license/security policy, and exact lockfile result. Evidence includes manifest/lockfile diff, resolver/toolchain version, integrity metadata, audit/license results, tests/build, and secret scan. No dependency or lockfile change is hidden inside an unrelated edit.

## 15. Secret boundary

Secrets enter only as opaque approved runtime references. Raw bearer tokens, Session/CSRF/cookie values, credentials, API keys, signing keys, and private material are forbidden in messages, plans, prompts, source, patches, diffs, commits, logs, artifacts, Evidence, and Audit. Secret-bearing files are excluded from collection. Detection stops the action, redacts evidence, and escalates to the Human; rotation is separately authorized.

## 16. Human checkpoints and authority transitions

Policy determines checkpoints according to scope, risk, environment, reversibility, and external effect. At minimum it evaluates plan approval where required and checkpoints before high-risk code/configuration changes, dependency changes, privileged network use, secret/provider changes, commit where required, push, merge, tag/release, deploy, rollback, and every Production action. A checkpoint displays exact target/version/hash, scope/risk/environment, evidence, policy, expiry, warnings, and rollback. Approval is action-specific, fresh, revocable, and revalidated at dispatch and immediately before execution. Policy may pre-authorize bounded low-risk actions; no blanket Human checkpoint is introduced for every edit or validation command.

## 17. Commit, push, merge, deployment, and rollback

- A commit captures only the approved staged tree and records its parent and provenance.
- Push cannot imply merge; merge cannot imply deploy; staging approval cannot authorize Production.
- Deployment binds exact immutable artifact/commit, environment, service/provider, health criteria, migration/config implications, and rollback plan.
- Production requires explicit Production Approval and provider authority even after Review, Verification, QA, or staging PASS.
- Rollback is a new governed action, not an implicit inverse. It binds the affected deployment/state, recovery artifact/version, data/schema implications, evidence, and Approval.
- Provider and external-system state remain authoritative and are reconciled after every external action.

## 18. Development EvidenceBundle

A versioned `DevelopmentEvidenceBundle` references, without duplicating storage:

- CommandEnvelope, Plan, Review, Approval, routing, Task/Run, and Verification artifacts;
- repository/branch/worktree/Workroot/environment bindings and before/after commit/tree hashes;
- changed-file inventory, diff/patch hash, generated artifacts, and architecture checks;
- structured Tool/command records and redacted outputs;
- test, lint, typecheck, build, security, secret, dependency, license, and CI results;
- dependency/manifest/lockfile evidence;
- conditional network-activity evidence proving whether access was requested, authorized, used, or denied, using canonical existing references where available;
- secret/provider change references and their exact governed outcomes where applicable;
- commit, push, PR, merge, tag/release, deployment, health, rollback, and reconciliation references;
- execution result and MAOS-024 Verification Routing, Handoff, Verifier Task/Run, and Verification Artifact references;
- errors, retries, stop/pause/kill outcomes, checkpoint decisions, correlation, causation, provenance, retention, and redaction metadata.

The bundle uses MAOS-026/013 Evidence/Audit storage and immutable bindings. It grants no authority and stores no secrets.

Where network activity is applicable, the bundle's governed network-evidence record contains canonical equivalents of:

- `network_access_requested` and the originating Task/Run/Tool request reference;
- `network_access_authorized`, `network_authority_ref`, and the exact approved `network_scope`;
- the approved network target, domain, or service only where its classification policy permits persistence;
- `network_use_observed` and `network_use_evidence_refs`; and
- `network_denial_refs` for denied or blocked attempts.

These fields prove request, authorization, approved scope, observed use, and denial without persisting credentials, bearer tokens, API keys, headers, connection strings, or other secret material. A network grant is evidence of authority evaluation, not a reusable credential or authority grant.

Completeness is conditional on actions that occurred. For every applicable action, the bundle explicitly references the Plan, Review, Approval, changed-file inventory, diff/patch hash, tests, build, lint, typecheck, dependency and lockfile changes, network request/grant/use/denial, secret/provider changes, commit, push, merge, deployment, rollback, execution result, and MAOS-024 verification outputs. It does not manufacture empty evidence for actions that did not occur; instead, applicability and absence are represented by canonical status/provenance metadata.

## 19. Error, retry, and recovery

Failures classify as stale binding, dirty-state conflict, Tool/Runner unavailable, command failure, validation failure, network denial, dependency conflict, secret detection, Git conflict, CI/deploy failure, or policy/Approval failure. The system preserves evidence and current repository/provider state, avoids destructive cleanup, and enters bounded retry, governed rework, rollback proposal, or `WAITING_HUMAN`. Retry preserves provenance/idempotency and cannot weaken constraints or duplicate external effects.

## 20. Stop, pause, kill, and cancellation

Pre-dispatch cancellation follows MAOS-021. Active execution uses MAOS-018/019 pause, stop, or kill against exact Task/Run/Tool/Runner references. Stop/kill cannot silently discard a dirty worktree, conceal partial external effects, or delete recovery evidence. After termination, MAOS records residual processes, locks, worktree state, provider state, reconciliation requirements, and Human next steps.

## 21. Status and mobile projection

Desktop shows the exact repository, branch, worktree, HEAD/relevant commit, dirty/clean state, plan/review/approval, active Run, validation, CI, delivery, evidence, handoff ownership, and controls without becoming the Git SoT. The bounded mobile subset shows command/clarification, status timeline, approval-critical evidence, validation/deployment state, `WAITING_HUMAN`, and stop/pause/kill. Mobile cannot edit arbitrary files, open a shell, manage registries, or bypass refresh/revalidation; canonical contracts remain identical.

## 22. Non-goals

- Runtime or UI implementation.
- A new SDLC, Git, CI, deployment, package, Task, Workflow, Approval, Runner, Evidence, or Audit engine.
- Repository migration, SoT merger, or provider replacement.
- Raw-message execution, unrestricted filesystem/shell/network access, or credential distribution.
- Agent self-routing, self-approval, reviewer execution, or autonomous push/merge/deploy.
- Production implementation or deployment authority.

## 23. Compatibility

MAOS-030 is additive to MAOS-020 through MAOS-029 and preserves MAOS-018/019. Existing canonical Task, Run, Workflow, Approval, Tool Gateway, Tool Permission, Runner, Repository, Workroot, Environment, Deployment, Evidence, and Audit semantics remain authoritative. Frozen v2.1 documents remain unchanged.

- MAOS-020 supplies Company/Team/Project portal composition.
- MAOS-021 supplies CommandEnvelope and pre-Task command semantics.
- MAOS-022 supplies Planner/Reviewer routing and independence.
- MAOS-023 supplies Executor routing and execution constraints.
- MAOS-024 exclusively supplies Verification routing, handoff, evidence sufficiency, Verifier independence, and outcome semantics.
- MAOS-025 and MAOS-028 supply Human Approval authority and Approval UX.
- MAOS-026 supplies Evidence/Audit governance.
- MAOS-027 supplies the bounded mobile projection.
- MAOS-029 supplies external Project Portal integration bindings.
- MAOS-018 and MAOS-019 supply governed-loop controls and local execution.

## 24. Decisions

1. **D14K-001** — Model the Development Team Portal as a Project Portal specialization, not an SDLC engine.
2. **D14K-002** — Bind every dispatch to exact repository, ref, worktree, Workroot, and environment records.
3. **D14K-003** — Reuse MAOS role routing and existing Task/Run/Tool/Runner execution machinery.
4. **D14K-004** — Treat Git and delivery transitions as distinct, independently authorized actions.
5. **D14K-005** — Default-deny network, dependency, filesystem, and secret access beyond exact policy grants.
6. **D14K-006** — Use immutable DevelopmentEvidenceBundle references through existing Evidence/Audit infrastructure.
7. **D14K-007** — Require bounded recovery and Human escalation rather than silent repair or authority expansion.

## 25. Risks

1. **R14K-001** — Portal becomes a shadow SDLC engine; controlled by projection-only composition and existing execution machinery.
2. **R14K-002** — Repository/worktree drift targets the wrong files; controlled by immutable refs, containment, and pre-action revalidation.
3. **R14K-003** — Git actions silently escalate from local to remote; controlled by distinct action/Approval boundaries.
4. **R14K-004** — Commands or dependencies introduce supply-chain/network risk; controlled by default deny and dedicated evidence.
5. **R14K-005** — Secrets enter prompts, diffs, logs, or artifacts; controlled by opaque refs, exclusion, scanning, stop, and escalation.
6. **R14K-006** — Multi-agent handoff leaks authority or loses provenance; controlled by immutable artifact handoffs and policy routing.
7. **R14K-007** — Failed execution leaves unsafe partial state; controlled by state capture, reconciliation, bounded recovery, and Human checkpoints.
8. **R14K-008** — Validation PASS is mistaken for merge/deploy authority; controlled by explicit semantic separation and Production gates.

## 26. Assumptions

1. **A14K-001** — Canonical Repository, Workroot, Environment, Tool, Runner, and Deployment registries provide stable versioned references.
2. **A14K-002** — Git, CI, package, and deployment providers expose governed interfaces and retain native SoT authority.
3. **A14K-003** — MAOS-018 through MAOS-029 remain available and semantically unchanged.
4. **A14K-004** — Project owners define protected refs, commands, network/dependency policy, checkpoints, and rollback requirements before activation.

## 27. Governance result

Human C2 decision `APPROVE_MAOS_CR_015_C2` adopts MAOS-030 as the approved/frozen MAOS Architecture v2.2 baseline. Phase 14K is `COMPLETE`, Phase 14L is `READY` for separately authorized planning, C2 blockers are `NONE`, candidate correction required is `NO`, and Production changes are `NO`. Runtime, provider, repository, credential, and Production changes remain unauthorized.
