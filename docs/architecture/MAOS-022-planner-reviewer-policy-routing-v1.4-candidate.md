# MAOS-022 — Planner and Reviewer Policy-Evaluated Routing Architecture

## MAOS Architecture v1.4 Candidate

| Item                     | Value                     |
| ------------------------ | ------------------------- |
| Document ID              | MAOS-022                  |
| Version                  | 1.4                       |
| Status                   | APPROVED / FROZEN         |
| Change Class             | C2 Minor Architecture     |
| Current Frozen Baseline  | MAOS Architecture v1.3    |
| Change Request           | MAOS-CR-007 — APPROVED_C2 |
| Freeze Record            | MAOS-FRZ-005              |
| Implementation authority | NONE                      |
| Production authority     | NONE                      |

## 1. Objective

Define deterministic, registry- and policy-evaluated routing from a governed CommandEnvelope to Planner and Reviewer roles without allowing raw-message execution, free-form agent selection, self-review, authority bypass, provider coupling, or duplicate Task, Workflow, Approval, Run, or Job machinery.

The governed flow is:

`Human Message → CommandEnvelope → Classification / Clarification → Planner Routing → Plan Artifact → Reviewer Routing → Review Artifact → Approval linkage → existing Task / Workflow / Run execution`

Routing chooses an eligible role and Agent assignment. It does not perform the selected work.

## 2. Architectural decision

Adopt **policy-evaluated role routing**.

- A versioned RoutingPolicy evaluates only registered role, Agent, capability, approved Skill, scope, risk, availability, independence, and policy evidence.
- A `PlannerRoutingEnvelope` or `ReviewerRoutingEnvelope` records the deterministic decision, candidate evaluation, fallback/escalation outcome, provenance, and Audit linkage.
- A RoutingEnvelope is not a Task, Workflow, Approval, Run, Job, ToolCall, Plan, Review, or execution authority.
- Selected Planner and Reviewer activity is dispatched only through existing Task/Run machinery.
- Agent role selection is independent from model/provider and Runner selection.
- The Human Owner remains the final authority wherever existing Approval policy requires Human Approval.

Rejected alternatives:

1. **Workflow-embedded routing as canonical authority** — rejected because routing policy must apply consistently before and across Workflows; a Workflow may invoke the canonical router but cannot redefine authority.
2. **Agent-selected peer routing** — rejected because an Agent must not choose its own Reviewer, expand the candidate set, or negotiate authority through free-running conversation.
3. **Provider/model-coupled routing** — rejected because Agent is WHO and Model is HOW IT REASONS; provider availability cannot redefine role, scope, or authority.

## 3. Planner role contract

A registered Planner role contains:

- canonical role and eligible Agent identity references;
- mission, responsibility, allowed planning classifications, and forbidden actions;
- Company, Team, Project, System, domain, and environment scope constraints;
- required capabilities and approved Skill/version constraints;
- model and Runner policies as separate references, never embedded provider choices;
- risk ceiling, planning budget, timeout, and concurrency policy;
- required input and Plan Artifact output contracts;
- handoff, Evidence, Audit, and escalation policies; and
- lifecycle and availability references.

The Planner receives an immutable CommandEnvelope version and governed context. Raw Human Message content may be available only as classified context referenced by the envelope; it is never execution authority. A Planner may propose work but cannot approve, execute, select its Reviewer, broaden scope, reduce risk, or fabricate missing authority.

## 4. Reviewer role contract

A registered Reviewer role contains:

- canonical role and eligible Agent identity references;
- review domains, criteria, required capabilities, and approved Skill versions;
- allowed scope, risk, environment, and artifact classifications;
- independence and diversity eligibility attributes;
- review timeout, concurrency, quorum participation, and escalation policy;
- governed Plan/Artifact input and Review Artifact output contracts;
- no plan mutation, Approval, execution, or Tool authority by implication; and
- Evidence, Audit, handoff, lifecycle, and availability references.

Review is not Approval. QA PASS is not production Approval. A Reviewer may accept, reject, request revision, identify risk, or escalate according to existing Review semantics, but may not execute or grant authority.

## 5. PlannerRoutingEnvelope

A `PlannerRoutingEnvelope` is a versioned, non-executing routing decision record containing:

- `planner_routing_id`, version, status, evaluated-at time, and expiry when applicable;
- exact `command_envelope_ref` and CommandEnvelope version/hash;
- routing purpose and required Planner role classification;
- registered candidate-set references and deterministic ordering evidence;
- required and matched capabilities;
- required approved Skill IDs, versions/checksums, and match evidence;
- Company, Team, Project, System, domain, and environment scope evaluation;
- risk class, RoutingPolicy ID/version, and policy-decision evidence;
- availability and capacity observations with freshness;
- selected Planner role and Agent identity references, or no-selection reason;
- fallback attempt/decision and Human escalation outcome;
- idempotency key and routing-input fingerprint;
- correlation ID, causation references, and provenance; and
- Evidence and Audit references.

The envelope never invokes the Planner. A `SELECTED` decision may be consumed once by existing Task/Run creation under current authority and version checks.

## 6. ReviewerRoutingEnvelope

A `ReviewerRoutingEnvelope` is a versioned, non-executing routing decision record containing:

- `reviewer_routing_id`, version, status, evaluated-at time, and expiry when applicable;
- exact CommandEnvelope, Plan Artifact, Planner Agent, Planner Task, and Planner Run references and versions/hashes;
- review purpose, criteria version, risk class, and required Reviewer role classification;
- registered candidate-set references and deterministic ordering evidence;
- capability, approved Skill/version, scope, risk, availability, and RoutingPolicy evidence;
- selected Reviewer role and Agent identity references, or no-selection reason;
- independence evidence against Planner identity and Planner Run;
- required diversity dimensions, reviewer count, quorum threshold, and conflict policy when defined by policy;
- fallback, disagreement, quorum, or Human escalation outcome;
- idempotency key and routing-input fingerprint;
- correlation ID, causation references, and provenance; and
- Evidence and Audit references.

The envelope never invokes the Reviewer and never changes the Plan. Selected review work is created through existing Task/Run machinery.

## 7. Routing decision states

RoutingEnvelope status is limited to routing-decision state:

- `PENDING`: immutable inputs recorded;
- `EVALUATING`: current policy evaluation in progress;
- `SELECTED`: one policy-compliant assignment or approved assignment set recorded;
- `WAITING_HUMAN`: policy cannot safely continue without Human decision;
- `CANCELLED`: routing cancelled before governed Task/Run dispatch;
- `EXPIRED`: inputs, policy, availability, or decision freshness expired; and
- `FAILED`: deterministic evaluation failed without a safe selection.

These states do not duplicate Task, Workflow, Run, or Approval lifecycles. Once a selected assignment is dispatched, canonical Task/Run state is authoritative.

## 8. RoutingPolicy model

A versioned `RoutingPolicy` defines:

- policy ID/version, applicable command classifications, scope, environment, and risk classes;
- required role classifications, capabilities, approved Skills and version constraints;
- allowed Agent registry subsets and lifecycle states;
- scope/domain matching and exclusion rules;
- availability freshness, budget, capacity, timeout, and retry limits;
- deterministic ranking dimensions and tie-breakers;
- Reviewer independence and optional diversity/quorum requirements;
- pre-authorized fallback candidates or candidate groups;
- disagreement, no-candidate, and escalation rules;
- Human control authority;
- Evidence/Audit requirements; and
- effective time, expiry, supersession, and provenance.

Policy changes are governed configuration changes. Routing cannot alter or synthesize policy at runtime.

## 9. Deterministic evaluation order

Routing evaluates the same immutable input and policy version in this order:

1. validate CommandEnvelope or Plan/Artifact reference, version, freshness, and provenance;
2. validate Human/service identity and exact Company/Team/Project/environment scope;
3. load the applicable approved RoutingPolicy version;
4. filter registered active roles and Agent identities by allowed scope and lifecycle;
5. require all declared capabilities and approved Skill versions;
6. enforce risk ceiling, separation, Reviewer independence, and diversity/quorum rules;
7. evaluate fresh availability, capacity, budget, and timeout evidence;
8. rank eligible candidates using policy-defined stable criteria and tie-breakers;
9. select, use a pre-authorized fallback, or enter `WAITING_HUMAN`; and
10. persist the decision, candidate evidence, correlation, Evidence, and Audit references.

The same inputs and policy version yield the same decision unless an explicitly versioned availability snapshot is different. The snapshot becomes part of the routing fingerprint and evidence.

## 10. Capability, Skill, scope, and risk matching

- Agent role defines WHO; capability states what the registered Agent can perform.
- Skill defines HOW and must be approved, active, correctly scoped, and version/checksum-bound.
- Skill presence never grants Tool Permission, Approval, scope, Runner capability, or execution authority.
- Scope must match exact registered Company, Team, Project, System/domain, and environment constraints.
- Risk uses existing canonical risk classes and may only tighten eligibility, independence, quorum, Approval, and Human escalation requirements.
- Missing, stale, ambiguous, or conflicting evidence makes the candidate ineligible; routing fails closed.
- UI labels, free text, repository paths, model names, provider names, and historical success cannot create eligibility.

## 11. Model, provider, and Runner boundary

`Agent ≠ Model ≠ Runner`.

Role routing selects a registered role and eligible Agent identity. It may emit required reasoning capability, privacy, locality, latency, context, and policy constraints for the existing Model Router, but it never selects or hard-codes a provider/model name as routing authority.

Model/provider resolution occurs separately under current Model policy. Runner resolution occurs separately under Task/Run and MAOS-019 policy. A model or Runner substitution cannot change Agent identity, role, scope, permission, risk, Reviewer independence, or Approval requirements.

## 12. Existing Task/Run execution boundary

A selected RoutingEnvelope authorizes no work by itself. Existing orchestration must create an exact canonical planning or review Task and corresponding Run under current identity, scope, permission, risk, budget, policy, and idempotency checks.

- `RoutingEnvelope ≠ Task`.
- `RoutingEnvelope ≠ Workflow`.
- `RoutingEnvelope ≠ Approval`.
- `RoutingEnvelope ≠ Run or Job`.
- `RoutingEnvelope ≠ Tool invocation`.

Task/Run creation records the consumed RoutingEnvelope version. Stale, expired, cancelled, already-consumed, mismatched, or non-selected decisions cannot dispatch.

## 13. Reviewer independence and self-review prohibition

Reviewer selection must prove:

- Reviewer Agent identity differs from Planner Agent identity;
- Reviewer Run differs from Planner Run;
- the Reviewer did not own or mutate the reviewed Plan version;
- the Reviewer role is eligible for the exact scope, domain, risk, and criteria;
- no policy-defined conflict of interest or disallowed delegation exists; and
- required diversity dimensions are satisfied when policy requires them.

Using a different model instance for the same Planner Agent is not independence. Using the same provider or model for distinct Agent roles is not automatically prohibited unless policy requires model/provider diversity. Planner-selected Reviewer assignment and self-review are always prohibited.

## 14. Multi-Planner rules

Multiple Planners are allowed only when an approved RoutingPolicy specifies count, purpose, budget, independence/diversity dimensions, comparison method, and Human escalation.

- Each Planner receives the same immutable governed input or an explicitly partitioned scope.
- Each Planner runs through a separate canonical Task/Run and produces a separate versioned Plan Artifact.
- Planners do not negotiate through free-running chat or choose a preferred peer output.
- Comparison, synthesis, or selection occurs through a governed Task/Review/Decision contract with complete provenance.
- Failure of one Planner does not silently reduce the required count or diversity.

## 15. Multi-Reviewer and quorum rules

Multiple Reviewers or quorum are used only when an approved policy explicitly defines:

- required reviewer count;
- minimum decision threshold or unanimity requirement;
- independence and diversity dimensions;
- eligible outcome vocabulary;
- abstention, unavailable, timeout, and conflict handling;
- whether revision triggers complete re-review; and
- Human escalation authority.

Each Reviewer operates through a separate Task/Run and emits an independent Review Artifact before aggregation. Quorum aggregates Review outcomes; it never creates Approval. Missing reviewers, failed independence, or unmet quorum cannot be silently waived.

## 16. Conflict and disagreement handling

Review disagreement produces a versioned conflict record referencing every Plan, Review, criterion, finding, and evidence item. The applicable policy may require revision, another pre-authorized independent Reviewer, a governed comparison Task, or `WAITING_HUMAN`.

No Planner, Reviewer, model, or provider may resolve disagreement by majority invention, hidden synthesis, risk reduction, or authority expansion. Unresolved disagreement and policy ambiguity enter `WAITING_HUMAN`.

## 17. Fallback and unavailable-agent behavior

Fallback may choose only an Agent role/identity or group already authorized by the same RoutingPolicy version for the exact scope, risk, environment, capability, Skill, and independence requirements.

Fallback must never:

- widen Company/Team/Project or environment scope;
- reduce risk, Reviewer independence, diversity, reviewer count, or quorum;
- activate an unregistered, suspended, disabled, or stale Agent;
- accept an unapproved Skill version;
- select by provider/model preference alone;
- grant Tool Permission, Approval, or execution authority; or
- extend retry, time, or cost budget beyond policy.

No eligible candidate, exhausted fallback, unavailable required independence, or stale availability enters `WAITING_HUMAN` rather than silently degrading policy.

## 18. Human escalation

Routing resolves to `WAITING_HUMAN` when policy cannot safely continue, including:

- no eligible candidate;
- retry or timeout exhaustion;
- unresolved disagreement;
- quorum failure;
- required Reviewer independence or diversity unavailable;
- policy ambiguity or conflicting policy; or
- stale/missing scope, risk, availability, or registry evidence.

The escalation package includes safe reason codes, evaluated policy/version, candidate summary, unresolved constraints, allowed Human actions, expiry, correlation, and Evidence/Audit references. Human action may select only a policy-permitted resolution or approve a separately governed policy change; it cannot retroactively make an ineligible candidate eligible through Messenger text alone.

## 19. Timeout, retry, and idempotency

- Each routing evaluation and selected Task/Run has separate policy-bound timeouts.
- A retry reuses the scoped idempotency key and immutable input fingerprint.
- Identical replay returns the same RoutingEnvelope decision and governed work references.
- Reusing a key with different CommandEnvelope, Plan, policy, scope, risk, candidate snapshot, or independence input is a conflict.
- A policy-permitted retry may evaluate the next ranked pre-authorized candidate using a new versioned availability snapshot; it cannot relax any constraint.
- Exhausted attempts enter `WAITING_HUMAN` or a terminal routing state according to policy.
- Retries do not duplicate planning/review Tasks, Runs, Plan/Review Artifacts, or authority-changing effects.

## 20. Correlation, provenance, Evidence, and Audit

The trace remains:

`HumanMessage → CommandEnvelope → PlannerRoutingEnvelope → Planner Task/Run → Plan Artifact → ReviewerRoutingEnvelope → Reviewer Task/Run → Review Artifact → Approval → execution Task/Workflow/Run → Evidence → Audit`

Routing Evidence includes input/version hashes, policy/version, candidate-set references, eligibility/exclusion reason codes, capability/Skill/scope/risk results, availability snapshot, ranking/tie-break result, independence/quorum evidence, fallback/escalation, and selected assignment.

Audit records actor/service identity, action, routing version, target scope/environment, decision, reason, correlation/causation, and evidence references. Sensitive prompts, private content, secrets, credentials, Session material, and unrestricted model reasoning are excluded.

## 21. Stop and cancel interaction

- Before Task/Run dispatch, an authorized cancellation moves the RoutingEnvelope to `CANCELLED` and prevents consumption.
- After a planning or review Task/Run exists, cancel/stop/kill targets the canonical Task, Run, ToolCall, Runner, or MAOS-018 LoopRun through existing controls.
- Cancelling routing does not erase CommandEnvelope, Plan, Review, Evidence, or Audit records.
- Stop/kill never implies a replacement selection or restart; rerouting requires fresh policy evaluation and authority.

## 22. Mobile visibility contract

Desktop and mobile display the same canonical routing decision, role, scope, risk, policy version, availability freshness, independence/quorum state, waiting-human reason, Task/Run references, and Evidence/Audit links permitted to the Human.

Mobile may acknowledge escalation, cancel pre-dispatch routing, or invoke separately authorized canonical stop/kill controls. It cannot edit candidate lists, weaken policy, choose provider/model identities, assign reviewers, waive independence/quorum, or create execution authority.

## 23. Compatibility

- **MAOS-021:** CommandEnvelope is the immutable routing input; raw Human Message is never routing or execution authority.
- **MAOS-020:** Company/Team/Project portal scope and visibility remain distinct from routing eligibility and execution authority.
- **MAOS-018:** Task/Artifact/Review collaboration, LoopRun control, Human escalation, and stop/kill semantics remain authoritative.
- **MAOS-019:** Runner/Tool capability, Tool Permission, timeout, cancellation, and kill controls remain authoritative.
- **MAOS-004:** Agent remains WHO; Model and Runner remain separate.
- **MAOS-005:** Task/Workflow machinery owns Planner/Reviewer work execution.
- **MAOS-007:** Skill remains HOW and does not grant Tool Permission.
- **MAOS-009:** Review remains distinct from Approval; Approval lifecycle remains canonical.

## 24. Decisions

1. D14C-001 — Use policy-evaluated deterministic role routing.
2. D14C-002 — Store routing decisions in non-executing Planner/Reviewer RoutingEnvelopes.
3. D14C-003 — Execute all selected Planner/Reviewer work through existing Task/Run machinery.
4. D14C-004 — Separate Agent-role routing from model/provider and Runner resolution.
5. D14C-005 — Prohibit Planner self-review and Planner-selected Reviewer assignment.
6. D14C-006 — Permit multi-role and quorum routing only through explicit approved policy.
7. D14C-007 — Fail closed to `WAITING_HUMAN` when safe policy continuation is unavailable.

## 25. Risks and assumptions

### Risks

1. R14C-001 — Stale registry or availability data could misroute work. Control: freshness-bound snapshots and revalidation.
2. R14C-002 — Capability labels could be mistaken for authority. Control: separate scope, permission, risk, Approval, and Task/Run checks.
3. R14C-003 — Provider coupling could collapse Agent and Model semantics. Control: capability constraints and separate Model Router.
4. R14C-004 — Fallback could weaken governance. Control: same-policy pre-authorization and no constraint relaxation.
5. R14C-005 — Self-review or hidden conflicts could invalidate Review. Control: explicit identity/Run/ownership independence evidence.
6. R14C-006 — Quorum aggregation could be mistaken for Approval. Control: Review aggregation remains non-authoritative.
7. R14C-007 — Retries could duplicate Plans or Reviews. Control: scoped idempotency and deterministic dispatch reconciliation.
8. R14C-008 — Multi-Agent negotiation could become free-running chat. Control: Task/Artifact/Review references only.

### Assumptions

1. A14C-001 — Agent, Skill, scope, policy, and availability registries expose versioned identifiers and lifecycle state.
2. A14C-002 — Existing Task/Run machinery can consume an exact RoutingEnvelope version idempotently.
3. A14C-003 — Existing Review artifacts can express independent outcomes without granting Approval.
4. A14C-004 — Existing Audit/Evidence contracts can persist candidate evaluation, independence, quorum, fallback, and escalation references.

## 26. Prohibited architecture and non-goals

- no raw Human Message routing or execution;
- no workflow-embedded routing as canonical routing authority;
- no agent-selected peer routing or Planner-selected Reviewer;
- no self-review;
- no free-running agent negotiation or conversation layer;
- no provider/model-coupled role routing;
- no silent scope, risk, independence, quorum, permission, Approval, or authority relaxation;
- no duplicate Task, Workflow, Approval, Run, Job, Model Router, Evidence, or Audit engine;
- no Executor routing, which is deferred to Phase 14D;
- no runtime implementation, migration, dependency, provider, credential, or production change; and
- no modification of frozen MAOS v1.3 without approved C2 governance.

## 27. Traceability and Phase 14D gate

| Requirement                      | Canonical owner    | MAOS-022 contribution                          |
| -------------------------------- | ------------------ | ---------------------------------------------- |
| Command and pre-Task boundary    | MAOS-021           | Immutable routing inputs and role handoffs     |
| Portal scope/visibility          | MAOS-020           | Scope inputs without authority inference       |
| Agent role semantics             | MAOS-004           | Registered Planner/Reviewer contracts          |
| Task/Workflow execution          | MAOS-005           | Existing planning/review Task/Run dispatch     |
| Skill semantics                  | MAOS-007           | Approved Skill/version matching                |
| Review and Approval separation   | MAOS-009           | Reviewer outcomes and Approval linkage         |
| Autonomous collaboration/control | MAOS-018           | Task/Artifact/Review and stop/kill reuse       |
| Runner/Tool execution boundary   | MAOS-019           | Capability versus Tool Permission separation   |
| Correlation, Evidence, and Audit | MAOS-010, MAOS-013 | Deterministic decision evidence and provenance |

Phase 14D is `READY` for separately authorized planning because MAOS-CR-007 is `APPROVED_C2`. This approval grants no runtime implementation, migration, provider, production implementation, or production deployment authority.
