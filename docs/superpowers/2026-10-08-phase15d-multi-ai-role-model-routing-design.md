# MAOS Phase 15D-A — Multi-AI Role / Model Routing Design

## 1. Scope

- Status: `READY FOR WRITTEN DESIGN REVIEW`
- Phase: `15D-A`
- Date: `2026-10-08`
- Scope: architecture and contract design only
- Baseline: Phase 15A, Phase 15B, and Phase 15C are complete

Phase 15D-A defines how MAOS converts one current, validated Phase 15C classification into a governed, immutable routing decision. It selects a responsibility class and an eligible Provider/Model/Runtime Adapter tuple from governed registry state. It does not execute work, create a Run, bind a Runner, invoke a Tool, grant Approval, or grant execution authority.

This design does not authorize implementation, migration creation, deployment, Staging mutation, or Production change.

### 1.1 In scope

- canonical AI role classes;
- routing input and output contracts;
- capability requirements and candidate eligibility;
- primary, fallback, independent-review, and adversarial-review routing;
- deterministic policy, availability, freshness, and Human-authority checks;
- immutable routing-decision versions and Human overrides;
- read-only diagnostics and future governed mutation boundaries;
- Development delegation to AIDOS.

### 1.2 Out of scope

- task execution or Tool invocation;
- Task, Run, Job, Workflow, Agent-instance, or Runner lifecycle management;
- creating or modifying Phase 15C classifications;
- changing the Phase 15B AI Registry authority;
- making AI Memory an execution authority;
- Development execution, verification, or release inside MAOS;
- Production deployment or configuration.

## 2. Authority Boundary

MAOS may:

1. consume the exact current Phase 15C classification;
2. resolve a governed role class and routing mode;
3. resolve required and preferred capability references;
4. filter registered Provider, Model, and Runtime Adapter resources;
5. append a non-executing routing decision;
6. project a separately governed downstream handoff.

MAOS must not treat a routing decision as execution authority.

AIDOS owns Development execution, Development verification, and Development release. AI Memory owns context and knowledge authority only. Human authority remains above AI routing and may override a routing decision only within immutable security, privacy, policy, and external-authority constraints.

## 3. Canonical Terminology

The following meanings remain distinct:

`Agent = WHO`, `Task = WHAT`, `Skill = HOW`, `Memory = WHAT IS KNOWN`, `Tool/MCP = WHAT CAN ACT`, `Workflow = ORDER`, `Model = HOW IT REASONS`, `Runner = WHERE`, `Approval = MAY`, `Artifact = RESULT`, `Evidence = PROOF OF RESULT`, and `Audit = PROOF OF WHO DID WHAT`.

Phase 15D-A additionally fixes:

`ROLE != DOMAIN SPECIALIZATION != REVIEW PURPOSE != ROUTING MODE != MEMORY AUTHORITY != MODEL != PROVIDER != RUNTIME ADAPTER != AGENT INSTANCE != RUNNER`.

Also:

- `Task != Run != Job`;
- `Event != Audit`;
- `AuthN != AuthZ`;
- `Review != Approval`;
- `QA PASS != Production Approval`;
- `Fallback != Independent Review != Adversarial Review`;
- `Routing != Execution`.

## 4. Role Taxonomy

### 4.1 Selected model

Phase 15D-A adopts a minimal orthogonal taxonomy. A canonical role class describes responsibility. Domain specialization, routing mode, Memory integration, and concrete resource selection are separate axes.

| Role ID | Role name | Purpose | Allowed domains | Required capability rule | Prohibited authority | Class | Human approval | AIDOS boundary | Memory boundary |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PLANNER` | Planner | Decompose governed intent and propose ordered work | All seven domains subject to policy | Exact planning/decomposition capability references | No execution, Approval, Tool authority, self-review selection, or scope expansion | Non-executing preparation | Policy-dependent | Development plans are routing metadata for AIDOS, not MAOS execution instructions | May consume referenced context; cannot write or become Memory SoT |
| `EXECUTOR` | Executor | Perform authorized AI work for non-Development domains | All frozen domains except MAOS-native `DEVELOPMENT`; `MEMORY` is limited to non-authoritative processing | Exact domain/action capabilities and downstream authority prerequisites | No self-Approval, authority creation, policy weakening, Runner binding, or Development execution | Execution-role metadata | Required wherever downstream policy requires it | For `DEVELOPMENT`, metadata may exist, but final authority and resource handoff are AIDOS-only | Cannot create authoritative Memory state or bypass the Memory gateway |
| `RESEARCHER` | Researcher | Locate, compare, and cite governed information | All seven domains subject to source and privacy policy | Research, retrieval, provenance, and source-verification references | No final domain decision, external submission, or execution authority | Supporting work | Policy-dependent | Development research may support AIDOS only | Retrieval uses governed context references; no direct Memory authority |
| `ANALYST` | Analyst | Analyze, compare, infer, and evaluate governed inputs | All seven domains subject to domain policy | Analysis and domain-specific evaluation references | No Approval, autonomous external action, or source-of-truth mutation | Supporting work | Policy-dependent | Development analysis is advisory to AIDOS | Context is referenced and redacted; analysis cannot rewrite Memory authority |
| `WRITER` | Writer | Produce governed documents or content artifacts | All seven domains subject to content and domain policy | Writing, transformation, and required domain capability references | No publication, filing, signing, deployment, or Approval by implication | Artifact-producing work | Required for externally consequential output when policy says so | Development-domain output remains delegated to AIDOS | May use context references but cannot persist authoritative Memory |
| `REVIEWER` | Reviewer | Provide an independent or adversarial assessment | All seven domains subject to independence policy | Review criteria plus exact domain/capability references | No execution, mutation of reviewed material, Approval, or self-selection | Review-only | Human escalation is policy-driven; review never substitutes for Approval | Development verification/release authority remains AIDOS; MAOS review metadata cannot override it | May inspect bounded context; cannot modify Memory authority |

### 4.2 Orthogonal axes

- `DOMAIN_SPECIALIST` is governed specialization metadata attached to a role requirement or candidate. It is not a role class.
- `QA_REVIEWER` means `REVIEWER + INDEPENDENT_REVIEW` under a QA-oriented review policy. It is not a seventh role.
- `ADVERSARIAL_REVIEWER` means `REVIEWER + ADVERSARIAL_REVIEW`. It is not a separate role.
- `MEMORY_CONTEXT_PROVIDER` is AI Memory context-authority integration, not an AI execution role.
- `FALLBACK` is a routing mode, not a role.

### 4.3 Development invariant

The existence of `EXECUTOR` never grants MAOS Development authority:

`DEVELOPMENT -> optional EXECUTOR role metadata -> DELEGATE_TO_AIDOS -> AIDOS authority`.

For a Development request, MAOS-native final Executor selection is prohibited. A selected MAOS Provider/Model/Runtime Adapter tuple cannot be emitted as a Development executor. `CODE_EXECUTION`, role compatibility, availability, Human override, or fallback cannot weaken this rule.

## 5. Routing Input Contract

The canonical input is a reference-bound `RoutingInput`, not a copy of classification authority:

- `request_id`;
- `classification_version_id` and exact request-local version;
- `canonical_domain` and optional governed specialization reference;
- `classification_confidence` where the Phase 15C record provides it;
- `classification_status`;
- `classification_policy_resolution_ref` and version;
- `routing_disposition`;
- optional `requested_role_class` as non-authoritative intent;
- `required_capability_refs[]`;
- optional `preferred_capability_refs[]`;
- `policy_constraint_refs[]`;
- bounded `context_refs[]` owned by AI Memory or another canonical context owner;
- bounded `artifact_refs[]`;
- governed `priority`;
- exact tenant, organization, project, scope, and environment binding;
- correlation, causation, Evidence, and Audit context.

Before routing, the resolver must re-read the Phase 15C authority and require the exact latest head to be `VALIDATED`, non-stale, policy-resolved, request-bound, context-matched, and consumable. Caller-supplied classification fields are comparison inputs only. A requested role or preferred capability cannot override domain policy or add authority.

## 6. Routing Policy and Specialization Authority

### 6.1 Routing policy authority

- `ROUTING_POLICY_AUTHORITY = MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD` is the normative canonical authority identifier. “MAOS Governance, operated by the accountable Routing Policy Steward” is its explanatory human-readable description. Neither an AI model, routing decision, Registry resource, Agent, nor runtime service owns policy. Routing decisions reference immutable policy versions owned by this authority.
- `ROUTING_POLICY_STORAGE`: the future canonical authority is an append-only governance-owned contract such as `governance.ai_routing_policy_versions`. Existing Phase 14 routing-policy definitions must be aligned into this authority rather than copied into a competing store. The exact physical name is revalidated before migration creation.
- `ROUTING_POLICY_VERSIONING`: every material change creates a new immutable policy ID/version. Historical versions remain readable for reconstruction and Evidence; decisions reference the exact policy identity/version they evaluated.
- `ROUTING_POLICY_LIFECYCLE`: `DRAFT`, `ACTIVE`, `SUPERSEDED`, `RETIRED`, governed by `MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD`. Only `ACTIVE` is selectable. Activation atomically supersedes the prior active version for the same exact applicability key. `RETIRED` is terminal.
- `ROUTING_POLICY_SELECTION`: resolve exactly one `ACTIVE` version by canonical domain, routing purpose, role class, organization/project/scope, environment, risk/policy constraints, and effective-time window. Zero or multiple matches fail closed. No broad, nearest, default-vendor, or cross-scope fallback is permitted.
- `ROUTING_POLICY_STALENESS`: supersession, retirement, disablement, expiry, applicability drift, capability-reference drift, or a changed immutable policy fingerprint makes every bound routing decision immediately non-consumable. A fresh version in the same decision stream is required.

Routing decisions can reference and evaluate policy but can never create, patch, activate, supersede, retire, or reinterpret it. Audit and Evidence prove policy transitions; they do not become policy authority.

### 6.2 Specialization metadata authority

`DOMAIN_SPECIALIST` remains metadata, not a canonical role. `MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD` is also the normative specialization-metadata authority and owns governed specialization definitions as versioned policy metadata, stored with or immediately under the canonical routing-policy authority, such as immutable `governance.ai_routing_specialization_versions` referenced by policy ID/version.

Specialization lifecycle is `DRAFT`, `ACTIVE`, `SUPERSEDED`, `RETIRED`; only one exact active version may match an applicability key. A specialization definition binds a frozen domain, bounded specialization key, required or preferred normalized capability references, permitted routing purposes, scope/environment restrictions, and effective/freshness metadata.

Free-form specialization labels are prohibited in routing inputs, decisions, APIs, and UI. The resolver must validate an exact specialization identity/version, active lifecycle, domain match, routing-purpose match, scope/environment match, and referenced capability existence. Registry state remains authoritative for whether a concrete resource has the required capabilities. Specialization may only narrow candidate eligibility or ranking; it cannot create a role, capability, permission, Approval, execution authority, or Development exception.

## 7. Candidate Resolution

Phase 15B remains the canonical AI Registry authority. Phase 15D-A does not create a parallel Provider, Model, capability, or Runtime Adapter registry.

Deterministic resolution order:

1. validate the exact Phase 15C head and request/context bindings;
2. resolve one active routing-policy version for domain, routing purpose, role class, mode, scope, risk, and environment;
3. derive required capabilities from immutable policy plus validated Phase 15C requirements;
4. treat preferred capabilities only as policy-bounded ranking inputs;
5. read normalized capabilities exclusively from `ai.capabilities` and `ai.model_capability_bindings`;
6. reject `ai.models.capabilities` as an authoritative fallback;
7. filter active, enabled, fresh Models and their exact Providers;
8. filter compatible active Runtime Adapters and required environment/security constraints;
9. apply provider, model, adapter, data-handling, residency, security, cost, latency, and Human-approval policies where approved;
10. apply deterministic ranking and stable policy-defined tie-breaking;
11. record the complete eligible set and exclusion reason codes;
12. select one tuple or fail closed.

Vendor or model names must never define priority in source code. Cost and latency participate only when an approved policy defines their units, freshness, maximum age, ordering, and tie-break semantics.

Selected resources are references to one exact Provider, Model, and Runtime Adapter state. Selection does not select an Agent instance or Runner and creates no execution binding.

## 8. Routing Purpose and Modes

The three axes are intentionally orthogonal:

- `role_class` answers **WHO is responsible**: one of the six canonical role classes.
- `routing_purpose` answers **WHY this immutable decision stream exists**: `PRIMARY_EXECUTION`, `INDEPENDENT_REVIEW`, or `ADVERSARIAL_REVIEW`.
- `routing_mode` answers **HOW this decision version selects or replaces resources**: `PRIMARY_EXECUTION`, `FALLBACK`, `INDEPENDENT_REVIEW`, or `ADVERSARIAL_REVIEW`.

Allowed combinations are exact. A `PRIMARY_EXECUTION` purpose permits `PRIMARY_EXECUTION` or `FALLBACK` mode. An `INDEPENDENT_REVIEW` purpose requires `REVIEWER + INDEPENDENT_REVIEW`. An `ADVERSARIAL_REVIEW` purpose requires `REVIEWER + ADVERSARIAL_REVIEW`. All other combinations fail closed.

### 8.1 `PRIMARY_EXECUTION`

Selects the first policy-compliant resource tuple for the required non-review role. It requires current classification, policy, Registry, availability, and approval state. For Development it emits AIDOS delegation metadata rather than a MAOS executor tuple.

### 8.2 `FALLBACK`

Fallback is a replacement version inside the existing `PRIMARY_EXECUTION` decision stream. It is never a separate review stream and never changes `routing_purpose`. It is permitted only after a recorded primary candidate becomes unavailable, stale, denied, or otherwise unusable for a bounded policy reason. The fallback must satisfy the same required role, capabilities, security, scope, environment, and approval constraints unless an approved policy explicitly requires stronger constraints. It appends a new stream-local decision version and supersedes the failed/blocked primary version. It cannot overwrite or supersede independent/adversarial review history.

### 8.3 `INDEPENDENT_REVIEW`

Independent review requires `role_class = REVIEWER`, explicit review criteria, and policy-defined separation from the subject decision or artifact. Independence may require different model, provider, runtime adapter, prompt lineage, prior Run, Agent, or organizational conflict dimensions. A fallback candidate is not automatically independent.

`REVIEWER + INDEPENDENT_REVIEW` produces review evidence or opinion only. It is not canonical Verification, QA PASS, Approval, Release authorization, or Human sign-off. It may inform those later independent authorities but cannot replace them.

### 8.4 `ADVERSARIAL_REVIEW`

Adversarial review requires `role_class = REVIEWER` and an explicit contradiction-search or challenge policy. It records the adversarial objective, independence/diversity evidence, review criteria, and bounded output contract. It does not authorize hostile actions, scope expansion, execution, or Approval.

`REVIEWER + ADVERSARIAL_REVIEW` produces challenge evidence only. It is not canonical Verification, QA PASS, Approval, Release authorization, or Human sign-off and cannot replace any of them.

## 9. Fail-Closed Rules

Routing emits no selected decision when:

- the request or classification identity is missing, mismatched, or ambiguous;
- the supplied classification is not the exact latest head;
- classification state is not `VALIDATED`;
- classification, its policy binding, or its context is stale;
- classification policy is unresolved, missing, disabled, or conflicting;
- required capability references are missing, unknown, or unavailable;
- the normalized capability source of truth cannot be read consistently;
- a Model or Provider is disabled, stale, unavailable, or policy-denied;
- a compatible Runtime Adapter is missing, unavailable, or stale;
- Registry state is stale, reconciling, ambiguous, or internally inconsistent;
- required Human approval is absent, expired, stale, mismatched, or consumed;
- an independent/adversarial review candidate fails separation policy;
- a fallback is not pre-authorized by policy;
- routing purpose, routing mode, and role class form a prohibited combination;
- a decision attempts to supersede a different decision stream;
- a Development route lacks the exact active AIDOS delegation path;
- candidate ranking is non-deterministic or tied without a policy tie-breaker.

No failure falls back to an earlier classification, an earlier routing decision, legacy capability metadata, an unregistered resource, or a MAOS-native Development executor.

## 10. Development / AIDOS Boundary

For `canonical_domain = DEVELOPMENT`:

1. Phase 15D-A validates the exact `DELEGATE_TO_AIDOS` Phase 15C disposition and AIDOS target;
2. it may resolve role and capability metadata needed by the AIDOS handoff;
3. it must not emit a MAOS Provider/Model/Runtime Adapter tuple as final Development executor;
4. it emits `development_delegation_state = READY_TO_DELEGATE`, `AIDOS_UNAVAILABLE`, or `WAITING_AIDOS_ONBOARDING`;
5. downstream dispatch is a separate governed action owned by the AIDOS integration boundary.

If AIDOS is unavailable, MAOS returns `AIDOS_UNAVAILABLE`. If the project/system is not registered with AIDOS, MAOS returns `WAITING_AIDOS_ONBOARDING`. Neither condition permits MAOS-native fallback. AIDOS remains authoritative for Development execution, verification, and release.

## 11. Persistence Model

The proposed canonical authority is an append-only table such as `governance.request_routing_decision_versions`. The exact name and migration number must be revalidated during implementation planning.

Each row contains:

- `routing_decision_id` immutable UUID;
- `routing_decision_stream_id` immutable UUID identifying one request/purpose decision chain;
- `request_id` physically bound to `work.requests(id)`;
- `classification_version_id` physically or compositionally bound to the exact Phase 15C record;
- `routing_purpose`, fixed for the stream as `PRIMARY_EXECUTION`, `INDEPENDENT_REVIEW`, or `ADVERSARIAL_REVIEW`;
- positive stream-local `routing_version`;
- `supersedes_routing_decision_id` referencing the immediately prior version in the same stream;
- `canonical_domain` snapshot for comparison;
- `role_class`;
- `routing_mode`;
- optional governed specialization reference;
- required and preferred capability reference sets;
- selected Provider, Model, and Runtime Adapter references, nullable for denied/waiting/AIDOS-delegated outcomes;
- decision status and bounded reason codes;
- routing-policy identity/version;
- Phase 15C policy-resolution reference/version;
- Registry snapshot reference/version/fingerprint;
- availability/freshness observation reference and expiry;
- Human approval reference/state where required;
- Development delegation state;
- context, Artifact, Evidence, Audit, correlation, and causation references;
- canonical intent fingerprint and existing idempotency binding;
- actor and immutable database timestamp.

Eligible candidate evidence should be stored as immutable child entries, such as `governance.request_routing_decision_candidates`, keyed by routing decision and deterministic rank. Each entry records the exact resource tuple, eligibility/exclusion state, bounded reason codes, capability-match evidence, policy inputs, freshness, and ranking evidence. These entries prove evaluation; they do not become Registry authority.

One request may own concurrent primary, independent-review, and adversarial-review streams. There is at most one stream per exact `(request_id, routing_purpose)` unless a later separately governed policy explicitly introduces another purpose identity. Current selection is `CURRENT(request_id, routing_purpose)`, resolved as the unique latest unbroken version of that stream. There is no request-global current decision.

Database rules must enforce append-only history, unique `(request_id, routing_purpose) -> routing_decision_stream_id`, unique `(routing_decision_stream_id, routing_version)`, stream-local immediate supersession, immutable request/purpose binding for a stream, role/purpose/mode compatibility, state-specific selected-resource nullability, and the Development no-native-selection invariant. Cross-stream supersession is rejected. Execution status, Run state, ToolCall state, and downstream completion do not belong in routing authority.

## 12. Human Override

A Human override appends a new routing-decision version within the targeted existing stream. It never updates or deletes prior decisions and cannot supersede another stream. Creating a new stream requires an explicitly authorized new routing purpose and its own policy/current-selection contract; changing a mode alone never creates a stream.

It requires:

- authenticated Human actor and exact override authority;
- request, classification head, prior routing decision, scope, and environment binding;
- bounded reason code and non-empty Evidence references;
- correlation, causation, and Audit context;
- idempotency key and canonical intent fingerprint;
- complete classification, policy, Registry, capability, security, freshness, and approval revalidation.

Exact replay returns the canonical prior result without another decision or success Audit. Conflicting replay fails before an effective append. Human override revalidation resolves the exact immutable policy version owned by `MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD`. It may choose among policy-eligible resources or require re-evaluation, but cannot select disabled resources, bypass immutable security/privacy constraints, convert Review into Approval, cross decision streams, or authorize MAOS-native Development execution.

## 13. Canonical Routing Output Contract

The canonical Phase 15E/15F input is an immutable `RoutingDecisionOutput` containing:

- `routing_decision_id`;
- `routing_decision_stream_id`;
- `routing_version`;
- `request_id`;
- `classification_version_id`;
- `canonical_domain`;
- `role_class`;
- `routing_purpose`;
- `routing_mode`;
- version-bound `specialization_metadata` reference or `null`;
- `required_capabilities[]`;
- `preferred_capabilities[]`;
- `eligible_resource_refs[]` referencing immutable candidate evidence;
- optional `selected_provider_ref`;
- optional `selected_model_ref`;
- optional `selected_runtime_adapter_ref`;
- `policy_constraints[]`;
- exact `policy_snapshot_ref` including routing-policy identity/version;
- exact `registry_snapshot_ref`;
- bounded `context_refs[]`;
- bounded `artifact_refs[]`;
- governed `priority`;
- `human_approval_state` plus a reference when required;
- `development_delegation_state`;
- optional `aidos_project_ref`;
- optional `aidos_required_capabilities[]`;
- `decision_reason_codes[]`;
- immutable `created_at`;
- optional `supersedes_routing_decision_id` within the same stream;
- `staleness_state` and freshness expiry/reference.

Selected resource references are absent for denied, waiting, and AIDOS-delegated outcomes according to state-specific constraints. Development output carries AIDOS metadata only and never a MAOS-native final executor tuple.

This output is routing metadata only. It grants no execution authority. It is not a Run, Job, Approval, Verification, QA result, Release authorization, ToolCall, or Runner binding. Phase 15E/15F must revalidate the exact stream head, classification, policy, Registry snapshot, staleness, scope/environment, Approval state, and Development delegation before accepting it.

## 14. API Contract

Future APIs are versioned and separately authorization-gated:

- `POST /api/v1/routing/requests/:requestId/decisions` — internal governed evaluation and append; never dispatches execution;
- `GET /api/v1/routing/requests/:requestId/current?routingPurpose=...` — stream-scoped current decision diagnostic;
- `GET /api/v1/routing/requests/:requestId/history?routingPurpose=...` — immutable stream history;
- `GET /api/v1/routing/decisions/:routingDecisionId/candidates` — redacted candidate evaluation evidence;
- `POST /api/v1/routing/requests/:requestId/overrides` — future Human-only append contract, separately authorized.

Mutation requests must carry exact classification binding, routing intent, idempotency, Evidence, and correlation/causation context. Responses expose bounded identifiers, states, reason codes, and safe resource metadata only. No endpoint accepts arbitrary Provider/Model names as authority, invokes a selected resource, creates a Run, or returns secrets, credentials, raw prompts, sensitive context, or unrestricted Registry metadata.

## 15. UI / Observability

The Portal may display:

- current routing status and immutable history;
- role class, routing mode, and governed specialization;
- required/matched capability summaries;
- selected resource references using safe display metadata;
- candidate exclusion reason codes;
- policy, Registry, availability, approval, and staleness states;
- Development delegation state;
- safe Evidence/Audit links.

The UI must visibly distinguish fallback, independent review, adversarial review, and Human Approval. It must not expose routing as execution, provide model-selection controls without separately authorized override authority, expose credentials or raw context, or present AIDOS delegation as MAOS execution.

Operational telemetry may measure bounded counts, durations, result classes, freshness, and failure codes. Logs must exclude credentials, raw prompts, private context, connection details, and unredacted Evidence.

## 16. Security

- exact authentication and authorization precede all reads and mutations;
- tenant, organization, project, request, scope, and environment match exactly;
- DENY precedence applies at classification, routing policy, Registry, capability, and approval layers;
- resource references are resolved from canonical registries, never trusted from caller labels;
- required capabilities cannot be satisfied by preferred capabilities;
- legacy capability metadata cannot grant eligibility;
- context and Artifact references are allowlisted and redacted by owning authority;
- secrets and credentials never enter routing records, APIs, UI, logs, Evidence, or Audit payloads;
- append and idempotency/Audit success remain atomic;
- runtime roles receive only minimum read/append privileges; no DDL, ownership, GRANT OPTION, migration authority, or broad PUBLIC access;
- Development denial is enforced in database, repository, service, and output validation layers.

## 17. Audit / Evidence

Audit and Evidence prove routing activity but are not routing, classification, policy, Registry, or execution authority.

Minimum bounded events:

- routing evaluation requested;
- routing decision selected, denied, waiting, or failed;
- fallback considered and selected/rejected;
- independent/adversarial review selection;
- stale/invalidation detection;
- Human override appended/rejected/reused;
- AIDOS delegation ready/unavailable/onboarding-required;
- downstream handoff projected.

Audit records actor, action, target decision, request, classification version, result, reason, correlation, causation, and safe Evidence references. Candidate and policy details remain referenced or safely summarized; no secret or sensitive context is copied into Audit.

## 18. Staleness / Reconciliation

The current routing decision is the latest version within one exact `(request_id, routing_purpose)` stream. Primary, independent-review, and adversarial-review heads coexist and are resolved independently. Consumers must never use a request-global head or fall back to an older `SELECTED` version within a stream. A fallback appends only to the primary stream; it never overwrites review history.

A decision becomes non-consumable when any bound input changes or expires, including:

- a new Phase 15C classification head;
- Phase 15C policy-resolution change;
- routing-policy supersession, disablement, or expiry;
- capability binding change;
- Provider, Model, or Runtime Adapter disablement or material version change;
- Registry snapshot becoming stale, reconciling, conflicting, or unavailable;
- availability evidence expiry;
- Human Approval expiry, revocation, mismatch, or consumption;
- AIDOS target or onboarding-state change;
- request lifecycle, scope, environment, or context mismatch.

Staleness is detected deterministically at consumption time and may also cause a new immutable stale/denied routing version according to later approved implementation policy. No reconciler may silently mutate history, repair Registry data, broaden policy, or execute work. Restart reconstruction reads PostgreSQL authorities and revalidates every bound version; caches are disposable accelerators only.

## 19. Failure Codes

Bounded failure codes include:

- `ROUTING_REQUEST_NOT_FOUND`;
- `CLASSIFICATION_NOT_CURRENT`;
- `CLASSIFICATION_NOT_VALIDATED`;
- `CLASSIFICATION_STALE`;
- `CLASSIFICATION_POLICY_UNRESOLVED`;
- `ROUTING_POLICY_MISSING`;
- `ROUTING_POLICY_CONFLICT`;
- `REQUIRED_CAPABILITY_UNAVAILABLE`;
- `REGISTRY_STALE`;
- `REGISTRY_RECONCILING`;
- `REGISTRY_CONFLICT`;
- `MODEL_DISABLED`;
- `PROVIDER_UNAVAILABLE`;
- `RUNTIME_ADAPTER_UNAVAILABLE`;
- `NO_ELIGIBLE_CANDIDATE`;
- `NONDETERMINISTIC_CANDIDATE_TIE`;
- `FALLBACK_NOT_AUTHORIZED`;
- `REVIEW_INDEPENDENCE_UNSATISFIED`;
- `ADVERSARIAL_REVIEW_POLICY_MISSING`;
- `HUMAN_APPROVAL_REQUIRED`;
- `HUMAN_APPROVAL_INVALID`;
- `HUMAN_OVERRIDE_POLICY_VIOLATION`;
- `AIDOS_UNAVAILABLE`;
- `WAITING_AIDOS_ONBOARDING`;
- `DEVELOPMENT_NATIVE_EXECUTION_PROHIBITED`;
- `ROUTING_DECISION_STALE`;
- `ROUTING_IDEMPOTENCY_CONFLICT`;
- `ROUTING_STREAM_CONFLICT`;
- `ROUTING_CROSS_STREAM_SUPERSESSION_DENIED`;
- `SPECIALIZATION_INVALID`;
- `ROUTING_POLICY_STALE`.

Failures expose no raw database, provider, model, adapter, credential, prompt, stack, or sensitive context data.

## 20. Migration Impact

Implementation will require a future forward-only migration after repository-head revalidation. This design does not reserve a migration number.

Likely database changes:

- immutable routing-decision streams and append-only stream-local versions;
- immutable candidate-evaluation entries;
- canonical immutable role-routing policy versions, lifecycle, capability requirements, and active-selection constraints;
- canonical versioned specialization metadata under the routing-policy authority;
- foreign-key/reference integrity to `work.requests`, Phase 15C classifications, Phase 15B Registry resources, capabilities, and approved policy identities;
- append-only and Development-boundary constraints/triggers;
- current/history/candidate lookup indexes;
- minimum runtime ACL and read-only diagnostic access;
- migration apply/replay/checksum, concurrency, stale-policy, and restart-reconstruction verification.

The migration must not seed an effective routing decision, grant execution authority, create a Run, select a vendor, or alter historical migrations.

## 21. Implementation Phases

Any later implementation plan should separate:

1. repository-head and existing-policy inventory;
2. canonical role-routing policy and specialization schema with frozen vocabulary;
3. immutable decision-stream, append-only version, and candidate persistence;
4. deterministic input/current-head validator;
5. Registry/capability candidate resolver;
6. routing-mode and independence evaluators;
7. Development/AIDOS output guard;
8. Human override and idempotency/Audit transaction;
9. read-only diagnostics and Portal projection;
10. downstream handoff validator without execution;
11. migration replay, concurrency, staleness, restart, ACL, redaction, and security tests;
12. separately authorized Staging verification with Production exclusion.

No implementation phase may silently begin execution, deployment, Phase 15E/15F work, or Production mutation.

## 22. Acceptance Criteria

The design is satisfied only when a future implementation proves:

1. exactly six canonical role classes and no vendor-bound roles;
2. specialization, routing purpose, routing mode, Memory authority, and concrete resources remain separate axes;
3. `ROLE != MODEL != PROVIDER != RUNTIME ADAPTER != AGENT INSTANCE != RUNNER`;
4. Phase 15D consumes only the exact latest validated, non-stale, policy-resolved Phase 15C classification;
5. normalized Phase 15B capability and Registry state is the only resource-selection authority;
6. required capabilities, security, scope, environment, availability, and policy all match exactly;
7. concurrent primary, independent-review, and adversarial-review streams coexist without sharing a current head;
8. versioning, supersession, and current selection are stream-local;
9. fallback replaces only a primary-stream decision and never overwrites review history;
10. fallback, independent review, and adversarial review are distinct and evidenced;
11. Review evidence never becomes Verification, QA PASS, Approval, Release authorization, or Human sign-off;
12. specialization metadata is version-bound, prohibits free-form labels, narrows candidates only, and creates no authority;
13. every decision is Evidence-bound to one immutable active routing-policy version;
14. the canonical output contains all required Phase 15E/15F fields and grants no execution authority;
15. Development never emits a MAOS-native executor and always resolves through AIDOS or a bounded waiting/failure state;
16. AI Memory supplies governed context only;
17. routing decisions and Human overrides are immutable, versioned, idempotent, and auditable;
18. exact replay creates one decision and one success Audit; conflicting replay fails before another effective append;
19. stale inputs make the latest stream decision non-consumable without fallback to history;
20. restart reconstruction uses durable canonical authorities rather than cache state;
21. APIs and UI remain diagnostic/governed and redact secrets and sensitive context;
22. no execution, ToolCall, Run, Runner binding, deployment, or Production authority is introduced.

## 23. Alignment Review

- **Phase 15A:** PASS — MAOS retains orchestration/routing authority while AIDOS retains Development execution, verification, and release.
- **Phase 15B:** PASS — Provider, Model, Runtime Adapter, normalized capability, availability, health, and readiness remain Registry-owned and distinct.
- **Phase 15C:** PASS — routing consumes only the latest validated, non-stale, policy-resolved classification and never becomes classification authority.
- **AIDOS v1.1:** PASS — Development produces a governed delegation handoff or bounded unavailable/onboarding state; no MAOS-native fallback exists.
- **Canonical semantics:** PASS — `ROLE != MODEL`, `ROLE != AGENT INSTANCE`, `ROUTING != EXECUTION`, `REVIEW != APPROVAL`, `FALLBACK != REVIEW`, `SPECIALIZATION != ROLE`, `POLICY != DECISION`, `DECISION STREAM != REQUEST`, and `DEVELOPMENT != MAOS EXECUTION`.

## 24. Design Decisions and Blockers

- Open design decisions: `NONE`.
- Open blockers: `NONE` for written design review.
- Schema change required: `YES`, future and separately authorized.
- API change required: `YES`, future and separately authorized.
- UI change required: `YES`, future read-only/governed projection and separately authorized.
- Implementation performed: `NO`.
- Database changed: `NO`.
- Staging changed: `NO`.
- Production changed: `NO`.

