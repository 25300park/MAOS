# MAOS-023 — Executor Policy-Evaluated Routing Architecture

## MAOS Architecture v1.5 Candidate

| Item                     | Value                     |
| ------------------------ | ------------------------- |
| Document ID              | MAOS-023                  |
| Version                  | 1.5                       |
| Status                   | APPROVED / FROZEN         |
| Change Class             | C2 Minor Architecture     |
| Current Frozen Baseline  | MAOS Architecture v1.4    |
| Change Request           | MAOS-CR-008 — APPROVED_C2 |
| Freeze Record            | MAOS-FRZ-006              |
| Implementation authority | NONE                      |
| Production authority     | NONE                      |

## 1. Objective

Define deterministic, registry- and policy-evaluated routing of reviewed and, where required, approved work to an Executor role without allowing raw-message execution, Planner/Reviewer authority leakage, self-approval, provider/model coupling, Tool Permission expansion, repository/workroot expansion, or duplicate execution machinery.

The governed flow is:

`CommandEnvelope → Planner Routing → Plan Artifact → Reviewer Routing → Review Artifact → Approval linkage → Executor Routing → existing Task/Run → Tool Gateway → Tool/Runner execution → Verification → Evidence/Audit`

Executor routing selects an eligible role and Agent under immutable execution constraints. It does not execute or grant authority.

## 2. Architectural decision

Adopt **policy-evaluated Executor eligibility and dispatch routing**.

- A versioned ExecutionEligibilityPolicy evaluates exact Plan, Review, Approval, scope, risk, environment, capability, approved Skill, Tool Permission, repository/workroot, Runner compatibility, availability, and policy evidence.
- An `ExecutorRoutingEnvelope` records the deterministic decision, candidate evaluation, immutable execution-constraint bundle, fallback/escalation, provenance, and Evidence/Audit linkage.
- The envelope is not a Task, Workflow, Approval, Run, Job, ToolCall, Runner binding, Tool selection, or execution authority.
- Existing Task/Run machinery creates work. The Tool Gateway authorizes ToolCalls. MAOS-019 owns Runner binding and execution controls.
- Constraints are revalidated at dispatch and immediately before execution.
- Verification receives governed result references; canonical verification-routing semantics are deferred to Phase 14E.

Rejected alternatives:

1. **Task-scheduler-owned canonical Executor routing** — rejected because scheduling work cannot silently own role eligibility and authority policy.
2. **Tool-Gateway-owned Executor selection** — rejected because Tool authorization cannot select the Agent role that owns execution responsibility.
3. **Executor self-selection** — rejected because an Executor cannot expand Tool, Runner, scope, environment, repository, workroot, Skill, or Approval target.

## 3. Executor role contract

A registered Executor role contains:

- canonical role and eligible Agent identity references;
- mission, responsibilities, allowed execution classifications, and forbidden actions;
- Company, Team, Project, System/domain, and environment scope constraints;
- required capabilities and approved Skill/version constraints;
- required Tool Permission classes and risk ceilings;
- allowed repository, Workroot, and Runner-compatibility policy references;
- model, provider, Tool, and Runner policies as separate references;
- Task/Run input, result/artifact, verification, Evidence, and Audit contracts;
- timeout, retry, budget, concurrency, cancellation, pause, stop, and kill policies; and
- lifecycle, availability, fallback, handoff, and escalation references.

The Executor receives only canonical governed execution inputs. It cannot reinterpret raw Human Messages, broaden Plan scope, modify Review findings, create or approve authority, select its own Approval target, or weaken any execution constraint.

## 4. ExecutorRoutingEnvelope

An `ExecutorRoutingEnvelope` is a versioned, non-executing decision record containing:

- `executor_routing_id`, version, status, evaluated-at time, and expiry where applicable;
- exact CommandEnvelope, governed Plan Artifact, Review Artifact, and Approval references with versions/hashes;
- execution classification and required Executor role;
- registered candidate-set references and deterministic ordering evidence;
- selected Executor role and Agent identity, or no-selection reason;
- capability and approved Skill/version match evidence;
- scope, risk, environment, and ExecutionEligibilityPolicy ID/version;
- required Tool Permission and eligibility evidence;
- repository and Workroot boundary references and match evidence;
- Runner compatibility and availability evidence without creating a Runner binding;
- immutable execution-constraint bundle reference/hash;
- fallback attempt/decision and Human escalation outcome;
- idempotency key and routing-input fingerprint;
- correlation ID, causation references, and provenance; and
- Evidence and Audit references.

The envelope records one routing decision only. It never executes, grants authority, creates work, authorizes a ToolCall, selects a Tool/provider/model, or binds a Runner.

## 5. Explicit non-equivalence

- `ExecutorRoutingEnvelope ≠ Task`.
- `ExecutorRoutingEnvelope ≠ Run or Job`.
- `ExecutorRoutingEnvelope ≠ Approval`.
- `ExecutorRoutingEnvelope ≠ ToolCall or Tool invocation`.
- `ExecutorRoutingEnvelope ≠ Runner binding`.
- `ExecutorRoutingEnvelope ≠ Workflow`.

Existing canonical lifecycles remain authoritative after dispatch.

## 6. Immutable execution-constraint bundle

The routing result references a content-addressed, immutable bundle containing:

- exact CommandEnvelope, Plan, Review, Approval, routing policy, and eligibility-policy versions/hashes;
- actor/service identity and selected Executor role/Agent;
- Company, Team, Project, System/domain, Task, and intended Run scope;
- risk class, action classification, and environment;
- required capabilities and approved Skill IDs/versions/checksums;
- required Tool Permission, allowed Tool capability/action classes, and policy versions;
- repository identity, allowed reference policy, protected-target rules, and source-of-truth owner;
- Workroot identity and canonical path policy;
- eligible Runner capability/attestation/health requirements, not a Runner binding;
- budget, timeout, retry, cancellation, stop/kill, verification, Evidence, and Audit requirements;
- validity/freshness window and revocation inputs; and
- provenance, correlation, causation, and bundle hash.

The bundle freezes constraints; it creates no authority. Any stale, revoked, missing, or mismatched element blocks dispatch or execution. Changing any element requires a new governed version, fresh routing, and fresh Approval where policy requires.

## 7. ExecutionEligibilityPolicy

A versioned `ExecutionEligibilityPolicy` defines:

- applicable execution classifications, scopes, environments, and risk classes;
- required Executor role, registered Agent subsets, lifecycle, and availability freshness;
- required capabilities and approved Skill/version constraints;
- required Review disposition and exact Plan/Review version binding;
- Approval requirement, target/version/hash binding, validity, consumption, and separation rules;
- Tool Permission, Tool capability/action class, and Tool-policy requirements;
- repository, reference, protected-target, and Workroot constraints;
- Runner compatibility, capability, attestation, health, locality, and revocation requirements;
- deterministic ranking/tie-break criteria;
- pre-authorized fallback candidates or groups;
- timeout, retry, budget, no-candidate, and Human escalation rules;
- verification, Evidence, and Audit requirements; and
- effective time, expiry, supersession, and provenance.

Policy is governed configuration. Routing cannot synthesize, relax, or override it at runtime.

## 8. Deterministic eligibility evaluation

Evaluation uses immutable inputs and one approved policy version in this order:

1. validate CommandEnvelope, Plan, Review, and their exact versions/hashes;
2. validate Review disposition without treating Review or QA PASS as Approval;
3. validate required Approval state, freshness, target, action, version/hash, environment, policy, and authority;
4. validate exact Company/Team/Project/System scope, risk, and environment;
5. load the applicable approved ExecutionEligibilityPolicy;
6. filter registered active Executor roles/Agents by scope, risk ceiling, lifecycle, and availability;
7. require all capabilities and approved Skill versions;
8. require exact Tool Permission and Tool-policy compatibility;
9. enforce repository, reference, protected-target, and Workroot boundaries;
10. require an eligible Runner capability/attestation/health class without binding a Runner;
11. rank with policy-defined stable criteria and tie-breakers; and
12. select, use a pre-authorized fallback, or enter `WAITING_HUMAN`, then persist Evidence/Audit.

The same inputs, policy version, and availability snapshot produce the same decision. The snapshot is versioned into the routing fingerprint and evidence.

## 9. Approval verification

Approval and execution remain distinct.

- Approval is validated only when required by risk, action, environment, policy, or target.
- It must bind the exact actor/approver, action, target, Plan/Review or execution version/hash, environment, policy version, validity window, and consumption state.
- Review PASS, QA PASS, routing selection, Task readiness, or Executor availability cannot substitute for Approval.
- Missing, stale, expired, revoked, consumed, mismatched, or unauthorized Approval blocks routing/dispatch and enters `WAITING_HUMAN` where Human remediation is allowed.
- The Executor cannot approve itself, change the Approval target, or reinterpret Approval scope.

## 10. Scope, risk, and environment verification

- Scope derives from canonical Company, Team, Project, System/domain, Task, and environment registries.
- Requested action and target must remain within reviewed Plan scope and Approval scope.
- Risk uses existing canonical classification and may only tighten eligibility, Approval, Tool Permission, Runner, verification, and Human escalation.
- Environment is exact and immutable for one decision; staging, local, and production authority are not interchangeable.
- Production requires separately authorized production scope and exact Human Approval.
- UI routes, free text, repository paths, model/provider names, prior success, and Agent preference cannot infer or widen authority.

## 11. Capability, Skill, and Tool Permission verification

- Agent role defines WHO; capability records registered ability.
- Skill defines HOW and must be approved, active, correctly scoped, and exact-version/checksum-bound.
- `Skill ≠ Tool Permission`.
- Tool Permission is independently validated for action type, target, scope, environment, risk, Tool/policy version, and Approval requirement.
- Capability or Skill presence never grants Tool Permission, Runner access, repository access, Approval, or execution authority.
- The Executor cannot substitute an unapproved Skill or request a broader Tool Permission than the constraint bundle.

## 12. Repository, Workroot, and environment boundary

- Repository identity comes from the canonical registry; a path or remote URL is not authority.
- Allowed branch/reference, protected target, source-of-truth owner, and mutation policy are explicit.
- Workroot identity and allowed canonical path are bound to the exact Project, environment, Runner class, and Task/Run.
- Path traversal, symlink escape, alternate checkout, unregistered repository, and out-of-bound Workroot fail closed.
- Environment variables and credentials remain runtime references and are never copied into the RoutingEnvelope or constraint bundle.
- Fallback cannot change repository, Workroot, reference, protected-target, or environment authority.

## 13. Model/provider, Tool, and Runner boundary

`Agent ≠ Model ≠ Runner`.

- Executor routing selects an eligible Executor role/Agent, never a provider/model name.
- It may emit reasoning-capability, privacy, locality, context, and policy constraints for the existing Model Router.
- Tool selection and ToolCall authorization occur later through the existing Tool Gateway.
- Runner binding occurs later through existing Task/Run and MAOS-019 authority.
- Runner eligibility evidence proves compatible capability, attestation, health, locality, Workroot, and policy; it does not bind or authorize a Runner.
- Substituting a model, provider, Tool, or Runner cannot change Agent identity, scope, risk, Approval, Tool Permission, repository/Workroot, or environment constraints.

## 14. Dispatch and revalidation boundary

The canonical boundary is:

`ExecutorRoutingEnvelope → existing Task/Run creation → Tool Gateway authorization → Tool selection → MAOS-019 Runner binding → execution`

At **dispatch**, existing orchestration revalidates:

- envelope/constraint-bundle status, version, freshness, and unconsumed idempotency state;
- Plan/Review versions and required Approval validity/target/version;
- scope, risk, environment, selected Executor identity, and policy versions;
- capabilities, approved Skill versions, Tool Permission;
- repository/Workroot boundaries; and
- Runner eligibility requirements.

Immediately **before execution**, the Tool Gateway and execution owner revalidate current Approval/revocation, scope, risk, environment, Tool Permission, Tool/policy version, repository/Workroot, Skill version, Runner identity/health/attestation, and constraint-bundle hash.

Any stale, revoked, consumed, missing, or mismatched condition fails closed. Routing does not create the Task/Run, authorize the ToolCall, select the Tool, or bind the Runner.

## 15. Routing decision states

ExecutorRoutingEnvelope status is limited to routing-decision state:

- `PENDING`, `EVALUATING`, `SELECTED`, `WAITING_HUMAN`, `CANCELLED`, `EXPIRED`, or `FAILED`.

`SELECTED` is not execution readiness unless dispatch revalidation succeeds. Once consumed into an existing Task/Run, canonical Task/Run/ToolCall state is authoritative.

## 16. Fallback and unavailable behavior

Fallback may select only an Executor role/Agent already authorized by the same policy version for the exact immutable constraint bundle, or a stricter compatible policy outcome.

Fallback must never:

- broaden Company/Team/Project/System or environment scope;
- relax, replace, or bypass Approval;
- reduce Tool Permission or Tool-policy requirements;
- weaken risk, verification, Evidence, or Audit controls;
- expand repository, reference, protected-target, or Workroot access;
- substitute an unauthorized Skill/version;
- bind or permit an unauthorized/incompatible Runner;
- increase budget, retry, timeout, or concurrency beyond policy; or
- create execution authority.

## 17. WAITING_HUMAN escalation

Routing resolves to `WAITING_HUMAN` when policy cannot safely continue, including:

- no eligible Executor;
- stale, missing, expired, revoked, consumed, or mismatched Approval;
- Plan or Review version/hash mismatch;
- scope, risk, or environment mismatch;
- Tool Permission or Tool-policy mismatch;
- repository, reference, protected-target, or Workroot mismatch;
- Runner incompatibility, stale health, failed attestation, or revocation;
- exhausted retry/timeout/fallback;
- policy ambiguity or conflicting policy; or
- stale/missing registry or availability evidence.

The escalation package carries safe reason codes, immutable constraint summary, evaluated policy/version, candidate summary, unresolved conditions, allowed Human actions, expiry, correlation, and Evidence/Audit references. Human Messenger text cannot make an ineligible candidate eligible; policy or authority changes require separately governed actions.

## 18. Executor authority limits

The Executor must never self-select, replace, or expand:

- Tool or Tool action;
- Runner or Runner capability;
- Company/Team/Project/System scope;
- environment;
- repository, reference, protected target, or Workroot;
- Skill/version;
- risk classification;
- Approval target/version/hash; or
- budget, timeout, retry, evidence, or verification requirements.

Attempts to change constraints are denied, audited, and escalated according to policy.

## 19. Retry, replay, and idempotency

- Routing and dispatch use separate scoped idempotency keys tied to immutable input and constraint-bundle fingerprints.
- Identical replay returns the same ExecutorRoutingEnvelope and existing Task/Run references.
- Reusing a key with different Plan, Review, Approval, scope, risk, environment, Tool Permission, repository/Workroot, Skill, Runner eligibility, policy, or snapshot is a conflict.
- A policy-permitted retry may evaluate the next ranked pre-authorized Executor using a versioned availability snapshot; constraints cannot be relaxed.
- Dispatch consumes an exact selected envelope version once; concurrent/stale consumers fail through version checks.
- Retries do not duplicate Task, Run, ToolCall, Artifact, authority-changing effect, or external action.

## 20. Pause, stop, cancel, and kill

- Before Task/Run dispatch, authorized cancellation moves the envelope to `CANCELLED` and prevents consumption.
- After Task/Run creation, pause/cancel/stop/kill targets existing MAOS-018 Task/LoopRun and MAOS-019 Run/ToolCall/Runner controls.
- Control actions require current identity, scope, permission, risk, Approval where required, target version, reason, Evidence, and Audit.
- Stop/kill does not authorize replacement, rerouting, or restart; fresh routing and authority are required.
- Routing cancellation never deletes Plan, Review, Approval, Evidence, or Audit records.

## 21. Verification handoff

Execution completion emits a governed handoff containing:

- Task, Run, ToolCall, Runner, and execution-result references;
- result and Artifact references with versions/hashes;
- expected-outcome and verification-criteria references;
- Evidence references and redaction/classification state;
- executed constraint-bundle and policy references;
- correlation and causation references;
- execution status, timeout/control outcomes, and safe error codes; and
- Audit references.

The handoff grants no verification, Review, Approval, or production authority. Phase 14D does not define verifier selection, verification routing, or verification quorum; those canonical semantics are deferred to Phase 14E.

## 22. Correlation, provenance, Evidence, and Audit

The trace remains:

`HumanMessage → CommandEnvelope → Plan → Review → Approval → ExecutorRoutingEnvelope → Task/Run → ToolCall/Runner → Result/Artifact → Verification → Evidence → Audit`

Routing Evidence includes exact input/version hashes, policy/version, candidate evaluation, eligibility/exclusion reason codes, constraint-bundle hash, capability/Skill/Tool Permission results, scope/risk/environment, repository/Workroot, Runner compatibility/availability, ranking/tie-break, fallback/escalation, and selected assignment.

Audit records actor/service identity, action, routing version, target scope/environment, decision, dispatch/pre-execution validation, control outcome, correlation/causation, and evidence references. Secrets, credentials, Session material, raw messages, private content beyond policy, and unrestricted model reasoning are excluded.

## 23. Mobile visibility

Desktop and mobile display the same canonical routing decision, selected Executor role, scope, risk, environment, Approval status/freshness, Tool Permission class, repository/Workroot boundary, Runner-eligibility freshness, constraint-bundle version, waiting-human reason, Task/Run references, and Evidence/Audit links available to the Human.

Mobile cannot modify candidate sets, constraints, policy, Approval targets, Tool Permission, repository/Workroot, Runner, environment, or model/provider selection. It may acknowledge escalation, cancel pre-dispatch routing, or invoke separately authorized canonical control actions.

## 24. Compatibility

- **MAOS-022:** deterministic role routing, policy/versioning, fallback, and Human escalation patterns are extended to Executor selection.
- **MAOS-021:** CommandEnvelope and Plan/Review/Approval provenance remain the governed input chain; raw Human Message is never execution input.
- **MAOS-020:** portal scope/visibility remains separate from execution eligibility and authority.
- **MAOS-018:** Task/Run/LoopRun lifecycle, execution loop, verification, and pause/stop/cancel/kill remain authoritative.
- **MAOS-019:** Tool Gateway, Tool Permission, Runner/Workroot binding, execution, timeout, revocation, Evidence, and kill controls remain authoritative.
- **MAOS-004/005:** Agent role and existing Task/Workflow/Run machinery remain canonical.
- **MAOS-007/008:** Skill and Tool/Tool Permission remain distinct.
- **MAOS-009:** Approval remains separate and is revalidated immediately before execution.

## 25. Decisions

1. D14D-001 — Use policy-evaluated deterministic Executor routing.
2. D14D-002 — Store selection and constraints in a non-executing ExecutorRoutingEnvelope.
3. D14D-003 — Freeze execution constraints in a content-addressed immutable bundle without creating authority.
4. D14D-004 — Require validation at routing, dispatch, and immediately before execution.
5. D14D-005 — Preserve Task/Run, Tool Gateway, and MAOS-019 ownership of execution.
6. D14D-006 — Permit fallback only under identical or stricter pre-authorized constraints.
7. D14D-007 — Defer canonical verification routing to Phase 14E.

## 26. Risks and assumptions

### Risks

1. R14D-001 — Stale Approval or policy could authorize obsolete work. Control: exact version/freshness binding and repeated revalidation.
2. R14D-002 — Capability/Skill could be mistaken for Tool authority. Control: independent Tool Permission validation.
3. R14D-003 — Routing could leak into execution ownership. Control: non-executing envelope and canonical Task/Run/Tool Gateway boundaries.
4. R14D-004 — Fallback could widen access. Control: same or stricter immutable constraints only.
5. R14D-005 — Repository/Workroot drift could target the wrong checkout. Control: registry identity, canonical paths, protected-target rules, and Runner binding checks.
6. R14D-006 — Provider/model/Runner coupling could change authority. Control: separate resolution and immutable authority constraints.
7. R14D-007 — Retry could duplicate external effects. Control: routing/dispatch idempotency, single consumption, and ToolCall reconciliation.
8. R14D-008 — Verification handoff could be treated as QA or Approval. Control: reference-only handoff and Phase 14E governance gate.

### Assumptions

1. A14D-001 — Canonical registries expose versioned Executor, Skill, Tool Permission, repository, Workroot, Runner, environment, and availability state.
2. A14D-002 — Existing Task/Run and Tool Gateway accept exact immutable constraint references and support pre-execution revalidation.
3. A14D-003 — Existing Approval contracts bind action, target, version/hash, environment, policy, validity, and consumption state.
4. A14D-004 — Existing Evidence/Audit contracts persist routing, dispatch, execution, control, and verification-handoff references.

## 27. Prohibited architecture and non-goals

- no raw Human Message execution;
- no Task-scheduler-owned canonical Executor routing;
- no Tool-Gateway-owned Executor selection;
- no Executor self-selection of Tool, Runner, scope, environment, repository, Workroot, Skill, risk, or Approval target;
- no provider/model-coupled role routing;
- no implicit authority, Approval, Tool Permission, scope, environment, repository/Workroot, or Runner expansion;
- no duplicate Task, Workflow, Approval, Run, Job, Tool Gateway, Runner, execution, Model Router, Verification, Evidence, or Audit engine;
- no canonical verification-routing semantics, which are deferred to Phase 14E;
- no runtime implementation, migration, dependency, provider, credential, or production change; and
- no modification of frozen MAOS v1.4 without approved C2 governance.

## 28. Traceability and Phase 14E gate

| Requirement                      | Canonical owner    | MAOS-023 contribution                               |
| -------------------------------- | ------------------ | --------------------------------------------------- |
| Planner/Reviewer routing chain   | MAOS-022           | Reviewed/approved handoff to Executor routing       |
| Command/provenance boundary      | MAOS-021           | Governed inputs; no raw-message execution           |
| Portal scope/visibility          | MAOS-020           | Visibility without execution authority              |
| Agent role semantics             | MAOS-004           | Registered Executor role contract                   |
| Task/Workflow/Run execution      | MAOS-005, MAOS-018 | Existing dispatch and execution ownership           |
| Skill and Tool Permission        | MAOS-007, MAOS-008 | Independent exact eligibility checks                |
| Approval authority               | MAOS-009           | Exact linkage and pre-execution validation          |
| Tool Gateway/Runner/Workroot     | MAOS-019           | Existing authorization, binding, and control        |
| Correlation, Evidence, and Audit | MAOS-010, MAOS-013 | Decision, dispatch, execution, and handoff evidence |

Phase 14E is `READY` for separately authorized planning because MAOS-CR-008 is `APPROVED_C2`. This approval grants no runtime implementation, migration, provider, production implementation, or production deployment authority.
