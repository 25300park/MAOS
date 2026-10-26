# MAOS Phase 15C — Classification / Domain Routing Design

## 1. Status

- Status: `IN REVIEW`
- Phase: `15C`
- Date: `2026-10-02`
- Scope: written architecture design only
- Prior phase: Phase 15B `COMPLETE / FINAL GATE PASS`
- Implementation, migration creation, runtime mutation, deployment, and Production change are not authorized by this document.

## 2. Purpose

Phase 15C defines a durable, append-only classification authority for canonical requests and optionally their materialized Tasks. It separates domain classification from command input, Task type, stage, role, capability, model, provider, host, and execution authority.

The output is a validated routing input for Phase 15D. It never selects a concrete Provider, Model, Host, Worker, or Runner and never authorizes execution.

## 3. Scope / Non-Goals

In scope:

- frozen top-level domain classification;
- immutable versions and supersession;
- deterministic current selection and stale invalidation;
- policy resolution through `ai.domain_execution_constraints`;
- routing disposition;
- AI-assisted proposals and Human override governance;
- read-only diagnostics and a future governed override contract;
- fail-closed Phase 15D handoff.

Out of scope:

- runtime implementation or migration creation;
- automatic model, provider, host, worker, or runner selection;
- execution, Approval, Tool Permission, or deployment authority;
- changing frozen domain taxonomy;
- MAOS-native Development execution;
- Production changes.

## 4. Frozen Domain Taxonomy

The only Phase 15C top-level domains are:

`BUSINESS`, `OPERATIONS`, `RESEARCH`, `ANALYTICS`, `WRITING`, `DEVELOPMENT`, `MEMORY`.

Phase 15C cannot add, remove, rename, alias, or dynamically mint a top-level domain. Unsupported values fail closed. A `subdomain_key` may refine a domain only when it resolves to a separately governed bounded taxonomy; it cannot create another top-level domain or change execution policy.

## 5. Canonical Semantic Distinctions

The following are independent dimensions:

`DOMAIN != STAGE != ROLE != CAPABILITY != MODEL != PROVIDER != HOST != TASK_TYPE != COMMAND_CLASSIFICATION`

- Domain states what kind of governed work the request represents.
- Stage states where work is in a workflow.
- Role states the responsibility class required later.
- Capability states what a future eligible route must support.
- Model, Provider, and Host are resource identities selected outside Phase 15C.
- Task type describes the materialized work record.
- Command classification and CommandEnvelope intent/risk are input snapshots, not domain authority.

Classification is not an Approval, Tool Permission, execution grant, Task, Run, Evidence record, Audit record, or routing execution.

## 6. Existing Inventory

- `work.command_envelopes` and their versions hold received Human command snapshots, scope, environment, intent/risk inputs, correlation, and references. They are not the domain source of truth.
- `work.tasks` is the optional materialized Task binding. Task identity does not replace canonical request identity.
- `ai.domain_execution_constraints` is the canonical execution-policy authority. It currently stores domain, execution mode, status, reason, policy reference, and policy version.
- Migration 0029 enforces `DEVELOPMENT -> DELEGATE_TO_AIDOS` at the database boundary and rejects direct MAOS Development-compatible role bindings.
- `ai.capabilities` plus `ai.model_capability_bindings` are the normalized capability source of truth. `ai.models.capabilities` is legacy, compatibility-only, and non-authoritative.
- Existing Evidence and Audit infrastructure records proof and transitions. Neither is classification authority.
- Existing Agent runtime maps and portal projections are consumers or caches only.

## 7. Classification Authority

The canonical authority is `GOVERNANCE_APPEND_ONLY_CANONICAL_RECORD`, persisted as immutable versions in a governance-owned classification table.

Each request owns exactly one monotonic version sequence. A new material classification, validation, rejection, invalidation, or Human override appends a version. No historical row is updated or deleted to change its meaning.

Canonical authority fields are the request binding, optional Task binding, version, frozen domain, optional governed subdomain, state, source, policy resolution binding, routing disposition, actor, reason, supersession link, and timestamps required for the row's state.

### 7.1 Canonical request identity authority

Phase 15C selects **Option A: MAOS-owned global request identity**.

- **Authority:** the canonical request identity is a globally unique UUID minted before classification.
- **Owner:** the MAOS Work / Request Intake authority owns the identity through a future canonical `work.requests` contract. Classification, CommandEnvelope, Task, Audit, and Event do not own it.
- **Binding:** every accepted source request is registered exactly once in `work.requests` with immutable source lineage and governed scope/environment bindings before any classification version may be appended. A `work.command_envelopes` record may bind to the request as an input snapshot; it does not become request authority. A `work.tasks` record may bind later as optional materialization; it does not replace the request.
- **Reference:** `governance.request_classification_versions.request_id` is a physical foreign key to `work.requests(id)` with immediate `NO ACTION`/restrictive deletion behavior. Classification cannot mint a request identity as a side effect.
- **Validation:** before proposal, validation, invalidation, or Human override append, the repository must resolve exactly one request whose immutable identity, source lineage, tenant/project/scope, and environment match the operation context and whose governed lifecycle permits classification. Optional CommandEnvelope and Task bindings must independently resolve to that same request and context.
- **Failure:** missing, unknown, mismatched, revoked/invalidated, ambiguous, or inaccessible request authority fails closed before version allocation, idempotency success, classification persistence, or success Audit. There is no orphan chain, source fallback, CommandEnvelope fallback, or Task fallback.

The future `work.requests` persistence shape and lifecycle vocabulary must be defined in the implementation plan and migration design without turning source-specific payloads into request authority. This design fixes ownership and binding; it does not create the table.

## 8. Classification Record Contract

### 8.1 Canonical authority fields

- `classification_id`: immutable UUID primary key.
- `request_id`: required globally unique UUID physically referencing the Work / Request Intake-owned `work.requests(id)` authority.
- `task_id`: nullable canonical Task identity once materialized.
- `version`: positive, request-local monotonic integer.
- `domain_key`: one frozen top-level domain.
- `subdomain_key`: nullable governed refinement.
- `classification_state`: `PROPOSED`, `VALIDATED`, `REJECTED`, or `STALE`.
- `source`: `DETERMINISTIC_POLICY`, `AI_ASSISTED`, or `HUMAN_OVERRIDE`.
- `routing_disposition`: bounded value defined in section 12.
- `reason_code`: bounded non-secret explanation code.
- `created_by_actor_type` and `created_by_actor_id`: accountable actor identity.
- `created_at`: immutable database time.
- `supersedes_classification_id`: nullable self-reference to the immediately prior version.
- `validated_at`: required only for `VALIDATED`.
- `stale_at`: required only for `STALE`.
- `policy_resolution_ref`: required only for `VALIDATED`; directly references the exact `ai.domain_execution_constraints.id` used for validation.
- `policy_resolution_version`: required only for `VALIDATED`; equals the exact `policy_version` of that referenced constraint at validation time.

### 8.2 Canonical routing-input fields

- `requested_role_class`: nullable bounded role class, not an Agent or Model identity.
- `required_capability_refs`: normalized capability references; all must be satisfied later.
- `preferred_capability_refs`: normalized hints; never authority.
- `policy_constraint_refs`: immutable references to additional applicable policy constraints.
- `context_refs`: governed opaque context references.
- `artifact_refs`: governed opaque Artifact references when material to routing.
- `priority_class`: bounded priority input, not scheduling authority.

### 8.3 Input snapshots

- `intent_class_ref` and `intent_snapshot_hash` preserve the classified input lineage.
- `risk_class_ref` and `risk_snapshot_hash` preserve the risk input lineage.
- `evidence_refs` preserve the proof set supporting the classification.

These are immutable input snapshots. They cannot become the domain source of truth and cannot silently change the canonical domain.

### 8.4 Derived or projection-only values

The following are computed and are not persisted as independent authority fields:

- `is_current`, derived from the version chain head;
- `is_superseded`, derived from a later version's supersession link;
- `is_policy_resolved`, derived from state plus a valid current policy resolution;
- `is_non_stale`, derived by validating the chain head and all freshness inputs;
- safe display labels, summaries, and portal grouping;
- selected Provider, Model, Host, Worker, or Runner, which are prohibited from this record.

AI confidence is retained as nullable `confidence_class` (`HIGH`, `MEDIUM`, `LOW`, `UNKNOWN`) only for `AI_ASSISTED` proposals. It is diagnostic metadata, not authority. Raw probabilistic scores are not canonical.

## 9. Versioning / Supersession

- `UNIQUE (request_id, version)` establishes the version sequence.
- Version 1 has no supersedes reference. Every later version must reference version `n-1` for the same request.
- `version` is the canonical ordering. `created_at` is evidence, not an ordering tie-breaker.
- A new version never rewrites the prior row.
- `SUPERSEDED` is not a stored classification state; it is a derived history relation.
- `OVERRIDDEN` is not a stored classification state; Human override is represented by `source = HUMAN_OVERRIDE` on a new version.
- Concurrent attempts to append the same next version serialize and conflict safely; only one chain head may result.

Exact idempotent replay reuses the canonical prior appended version when the same idempotency key and canonical payload fingerprint match. The same key with a different fingerprint fails closed. The future mutation contract must reuse existing idempotency and Audit infrastructure rather than creating another store.

## 10. Current Selection

Current selection is intentionally two-step and does not fall back:

1. Resolve and validate exactly one canonical `work.requests` identity.
2. Resolve exactly one chain head using the highest `version` for `request_id`, with a complete unambiguous supersession chain.
3. Require that head to be `VALIDATED`, non-stale, and bound directly to one current, active, non-conflicting `ai.domain_execution_constraints` identity/version.

The canonical rule is therefore:

`LATEST_VERSION_HEAD + VALIDATED + NON_STALE + POLICY_RESOLVED`

If the latest version is `PROPOSED`, `REJECTED`, or `STALE`, no earlier validated version is reused. Missing versions, forks, duplicate heads, cycles, task/request mismatches, or ambiguous policy results fail closed.

## 11. Stale / Invalidation

Staleness is represented by a new immutable `STALE` version superseding the prior head. The prior row remains unchanged for history. Runtime freshness checks may detect a stale condition before the invalidation version is appended; such detection immediately denies consumption and does not wait for persistence.

Invalidation inputs include:

- material request or intent snapshot change;
- materialized Task identity, version, or classification-relevant content change;
- referenced domain policy version replacement, removal, expiry, or conflict;
- required or preferred capability requirements changing materially;
- Human override;
- supporting Evidence expiry, revocation, integrity failure, or access loss;
- conflicting reclassification or broken supersession lineage;
- frozen taxonomy or supported-subdomain validation failure.

Human override normally appends a new proposal or validated version and therefore supersedes the old head. It cannot mark the old row in place.

## 12. Routing Disposition

Canonical dispositions are:

- `HANDLE_IN_MAOS`
- `DELEGATE_TO_AIDOS`
- `DELEGATE_TO_DOMAIN_SYSTEM`
- `REQUIRE_HUMAN_REVIEW`
- `PROHIBITED`
- `UNCLASSIFIED`

`UNCLASSIFIED` is valid only for unresolved proposals or rejections and cannot be selected as current. `REQUIRE_HUMAN_REVIEW` grants no execution authority. `PROHIBITED` is terminal for that version. Delegation identifies policy disposition only; it does not create a command, session, credential, or execution grant.

The required pipeline is:

`request -> classification proposal -> validation -> policy resolution -> routing disposition -> Phase 15D routing input`

AI classifier output can never flow directly to execution.

## 13. Domain Policy Interaction

`ai.domain_execution_constraints` remains the canonical execution-policy authority.

Policy resolution takes:

1. the proposed frozen `domain_key`;
2. exactly one active domain execution constraint;
3. its exact `policy_ref` and `policy_version`;
4. applicable scoped policy constraints and freshness evidence;
5. a resulting bounded routing disposition and, when delegated, governed target metadata.

A `VALIDATED` classification must bind the exact resolution reference/version. Missing, inactive, ambiguous, expired, stale, conflicting, or unsupported policy produces no consumable classification. Missing domain constraint means `PROHIBITED`, not implicit MAOS handling.

Classification consumes this policy; it never replaces, weakens, or overrides it.

### 13.1 Policy-resolution reference semantics

Phase 15C selects direct policy binding; it does **not** create a separate durable policy-resolution authority.

- `policy_resolution_ref` targets the exact primary identity `ai.domain_execution_constraints.id` used to validate the classification.
- `policy_resolution_version` is the exact immutable comparison value from that row's `policy_version`, not a classification-local counter and not a pointer to Audit or Evidence.
- `ai.domain_execution_constraints` remains the sole execution-policy authority. The classification record retains immutable resolution lineage and a safe snapshot of the resulting disposition, but the snapshot cannot keep a superseded policy effective.
- Current consumption must re-read the referenced constraint and require: identity exists; `domain_key` matches; `status = ACTIVE`; `policy_version` exactly matches; disposition and governed target metadata match the recorded resolution; and freshness/conflict checks pass.
- If the constraint is changed, replaced, disabled, removed, expires, becomes ambiguous, or no longer matches the recorded version/disposition/target, the prior classification becomes immediately non-consumable. The resolver fails closed and a new validated classification version is required. It must not fall back to an earlier classification or another policy row.

Evidence and Audit may prove the resolution and change, but they are not the target of `policy_resolution_ref` and do not become policy authority.

## 14. Domain System Policy Encoding

### 14.1 Alternatives

- **Option A — extend `ai.domain_execution_constraints`:** one authority owns execution mode, routing disposition, and optional governed target metadata. It gives deterministic restart reconstruction and minimizes competing source-of-truth risk. It requires a forward migration and careful preservation of the Development database invariant.
- **Option B — separate domain-system mapping referenced by the constraint:** cleaner normalization for many targets, but creates another policy lifecycle and a greater risk that mapping and constraint disagree. It is unnecessary for the Phase 15C one-disposition contract.
- **Option C — store domain-system delegation in classification:** rejected because it makes classification an execution-policy authority, duplicates policy across versions, and permits Human or AI reclassification to alter execution targets.

### 14.2 Selected model

Select **Option A**.

A future migration should extend `ai.domain_execution_constraints` with bounded policy metadata such as:

- `routing_disposition`;
- `target_kind` nullable (`AIDOS`, `DOMAIN_SYSTEM`);
- `target_ref` nullable governed registry reference;
- `target_version` nullable;
- target freshness or policy-evidence reference where required.

Database constraints must make target fields mandatory for delegation and absent for native/prohibited handling. `DEVELOPMENT` remains immutably `DELEGATE_TO_AIDOS` with the canonical AIDOS target. Classification stores only the exact policy-resolution reference/version and resulting disposition; it does not copy mutable target configuration as authority.

## 15. AI-assisted Classification

### 15.1 Deterministic policy

Deterministic rules may create a `PROPOSED` version or, where a separately approved policy explicitly allows deterministic validation, a policy-resolved `VALIDATED` version. The rule identity/version and input fingerprint must be recorded.

### 15.2 AI-assisted proposal

AI may propose domain, governed subdomain, requested role class, required/preferred capability references, and policy-constraint references. AI output is always `PROPOSED` until deterministic schema, taxonomy, lineage, freshness, and policy validation succeeds and a separate immutable `VALIDATED` version is appended.

`UNKNOWN`, `AMBIGUOUS`, `LOW_CONFIDENCE`, `CONFLICTING`, `STALE`, and `MISSING_POLICY` are bounded reason classes. They grant no authority and resolve to `REQUIRE_HUMAN_REVIEW`, `PROHIBITED`, or a non-current rejected/stale state according to policy.

### 15.3 Human authority

Human decisions remain above AI authority but do not bypass policy. A Human can correct classification through the governed override mechanism, not by mutating AI output or granting execution directly.

## 16. Human Override

A Human override appends one immutable version with:

- `source = HUMAN_OVERRIDE`;
- authenticated actor identity and current authority proof;
- mandatory bounded reason;
- non-empty Evidence references;
- correlation, causation, and Audit context;
- exact previous classification reference;
- idempotency key and canonical intent fingerprint;
- re-run taxonomy, lineage, staleness, and domain-policy validation.

The override cannot mutate history, skip current selection, bypass policy, authorize a stale classification, grant direct execution, or change `DEVELOPMENT -> DELEGATE_TO_AIDOS`. An invalid or unauthorized override is rejected before an effective version or success Audit is appended.

## 17. Persistence Proposal

No migration is created by this design. A later approved migration is expected.

Proposed table: `governance.request_classification_versions`.

Core database contract:

- primary key: `classification_id uuid`;
- request binding: required `request_id uuid` with an immediate physical foreign key to Work / Request Intake-owned `work.requests(id)`;
- optional Task binding: `task_id uuid` referencing `work.tasks(id)` where the request has materialized;
- version uniqueness: `UNIQUE (request_id, version)`;
- request-owner validation before version allocation or successful idempotency/Audit resolution;
- supersedes self-reference with same-request, immediately-prior-version enforcement;
- frozen domain `CHECK`;
- state, source, disposition, actor, timestamp, and state-specific consistency checks;
- arrays of opaque Evidence, context, Artifact, capability, and policy-constraint references with non-empty member validation;
- canonical payload fingerprint and existing idempotency/Audit linkage;
- append-only database trigger rejecting `UPDATE` and `DELETE` by runtime paths;
- transactional next-version append with request-scoped advisory locking or equivalent serialization;
- composite integrity for `policy_resolution_ref` plus `policy_resolution_version` against the exact domain constraint identity/version contract;
- indexes on `(request_id, version DESC)`, `task_id`, `(domain_key, classification_state)`, policy resolution reference, and GIN indexes only for justified reference queries.

The current query first finds `max(version)` for the request, verifies exactly one unbroken head, then validates state and policy freshness. A partial unique `is_current` flag is rejected because `is_current` would require mutable historical rows.

Proposed migration name: `0031_phase15c_request_classification_authority.sql`. The migration number is a proposal and must be revalidated against the repository head before implementation.

## 18. API / UI Boundary

Minimum read-only surfaces may expose, subject to exact authorization and redaction:

- current classification summary;
- immutable classification history;
- validation/staleness state and bounded reason;
- routing disposition;
- policy-resolution status and safe reference metadata.

No response exposes credentials, secrets, sensitive raw context, or unredacted Evidence. No surface selects or administers Provider, Model, Host, Worker, or Runner.

A future Human override endpoint/UI is separately governed. It must require Human authority, target/request scope, prior-version binding, reason, Evidence, idempotency, correlation/causation, canonical fingerprint, and durable Audit. It creates a version; it never patches one. Phase 15C design does not authorize implementing that mutation surface.

## 19. Failure / Fail-closed Matrix

| Condition | Required result |
| --- | --- |
| Missing classification | deny Phase 15D handoff; report bounded missing state |
| Unknown/missing canonical request identity | reject before chain/version creation; no orphan classification |
| Request scope/environment/source mismatch | reject before persistence or success Audit |
| Multiple/forked current heads | deny; lineage conflict |
| Unknown or unsupported domain | reject/prohibit; no fallback domain |
| Ambiguous domain | require Human review; no execution authority |
| Low-confidence AI result | remain proposal or require Human review |
| Stale classification | deny; never reuse older validated version |
| Missing policy | `PROHIBITED`; no implicit native handling |
| Conflicting/ambiguous policy | deny; policy conflict |
| Stale/expired policy | deny until new policy-resolved version exists |
| Unsupported required capability | deny handoff as unsatisfied requirement |
| Invalid Human override | reject before effective append/success Audit |
| Development direct-execution attempt | deny at classification, policy, and database authority boundaries |
| AI Memory acting as execution authority | deny; Memory supplies context only |
| CommandEnvelope treated as domain SoT | deny/non-conformant consumer |
| Audit/Event treated as domain SoT | deny/non-conformant consumer |
| Phase 15D receives non-head version | reject as superseded/stale input |
| Phase 15D receives missing validation/policy resolution | reject |
| Duplicate version or broken chain | transaction rollback; no partial authority |
| Task/request binding mismatch | reject and require governed reclassification |

Every failure retains safe diagnostic Evidence/Audit according to existing policy but creates no execution authority.

## 20. DEVELOPMENT / AIDOS Boundary

For `domain_key = DEVELOPMENT`:

- routing disposition is exactly `DELEGATE_TO_AIDOS`;
- policy resolution must bind the immutable active Development constraint and canonical AIDOS target;
- `HANDLE_IN_MAOS`, generic domain-system delegation, and MAOS-native fallback are prohibited;
- no MAOS Executor, Planner fallback, Worker, Runner, Model, Host, role compatibility, or `CODE_EXECUTION` capability may override the disposition;
- AIDOS remains Development execution, verification, and release authority under the frozen Phase 15A contract.

Missing or conflicting Development policy resolves to `PROHIBITED`, never MAOS-native handling.

## 21. Phase 15D Handoff

Phase 15D may consume only a handoff built from the exact current classification:

- classification ID and version;
- request ID and optional Task ID;
- domain and optional governed subdomain;
- routing disposition;
- requested role class;
- required and preferred normalized capability references;
- policy-constraint references and exact policy-resolution reference/version;
- context and Artifact references;
- priority class;
- correlation/causation references and freshness proof.

The handoff excludes selected Provider, Model, Host, Worker, and Runner. Phase 15D must revalidate `LATEST + VALIDATED + NON_STALE + POLICY_RESOLVED` at consumption and reject stale or mismatched data. The handoff is a routing input, not execution authority.

Phase 15D must also resolve `request_id` through `work.requests` and require the same governed scope/environment binding. A request that is unknown, invalidated, or inconsistent with the optional CommandEnvelope/Task lineage is rejected even if a classification row exists.

## 22. Security / Audit / Evidence

- Human authority, least privilege, exact scope/environment matching, default deny, and Phase 14M security controls remain in force.
- Classification rows reference Evidence but do not embed secrets or private raw source content.
- Evidence proves inputs and validation. Audit proves who performed or caused each proposal, validation, rejection, invalidation, and override.
- Evidence, Audit, Event, and CommandEnvelope are not classification authority.
- Append, override, and invalidation use existing idempotency, correlation, causation, Evidence, and hash-chain Audit infrastructure.
- Audit failure causes the governed append transaction to fail closed where the existing atomic governance path requires it.
- Read APIs and portal projections are permission-, scope-, environment-, classification-, and redaction-bound.
- No classification state grants Tool Permission, Approval, session, credential, network, deployment, or Production authority.

## 23. Verification Strategy

Future implementation must use tests that prove:

1. rows are immutable and deletes/updates fail;
2. versions are monotonic and supersession is same-request and gap-free;
3. concurrent append yields one chain head;
4. current selection uses version, never timestamp, and never falls back;
5. request/Task, snapshot, Evidence, and policy changes invalidate safely;
6. stale version append and runtime stale detection both block consumption;
7. exact replay reuses one version/Audit and conflicting replay fails closed;
8. Human override requires actor, authority, reason, Evidence, prior reference, idempotency, and Audit;
9. AI output remains non-authoritative until separately validated;
10. missing/conflicting/stale policy fails closed;
11. `DEVELOPMENT` always delegates to AIDOS and direct execution attempts fail at database and repository boundaries;
12. restart reconstructs authority only from durable records;
13. Audit/Evidence/Event/CommandEnvelope cannot substitute as classification SoT;
14. Phase 15D rejects stale, non-head, unvalidated, or unresolved classification;
15. classification grants no execution authority;
16. Phase 15C contains no Provider/Model/Host/Worker/Runner selection;
17. read APIs are authorized and redacted; mutation methods are absent unless separately approved;
18. Production targets remain denied.

## 24. Migration Impact

A forward-only migration is required for future implementation, but is not authorized or created by this design.

Expected migration impact:

- create or align the Work / Request Intake-owned canonical `work.requests` identity contract before adding classification foreign keys; no classification-side request minting is allowed;
- create `governance.request_classification_versions` with append-only/version/lineage constraints and indexes;
- extend `ai.domain_execution_constraints` under Option A with explicit disposition/target metadata and exact consistency checks;
- provide an exact constraint identity/version binding usable by `policy_resolution_ref` and `policy_resolution_version` without introducing a policy-resolution table;
- preserve and extend, never weaken, the existing Development immutability and role-compatibility triggers;
- add no historical classification backfill inferred from CommandEnvelope, Audit, Event, Task, or portal data;
- seed no fabricated non-Development readiness or delegation target;
- provide apply, replay, checksum, concurrency, restart, ACL, and historical-migration integrity tests.

Production execution remains separately gated.

## 25. Open Decisions

None. The architecture decision, frozen taxonomy, Option A domain-system policy encoding, append-only model, current-selection rule, override model, and Phase 15D boundary are resolved for written-design review.

Implementation details such as exact repository interfaces, API route names, migration checksum, and rollout sequence belong to a separately reviewed implementation plan and are not open architecture decisions.

## 26. Exit Criteria

The written design is ready for review when it demonstrates all of the following:

- one append-only governance classification authority;
- immutable request-local versions with deterministic, no-fallback current selection;
- frozen domain taxonomy and explicit semantic separations;
- policy resolution through `ai.domain_execution_constraints`;
- Option A target encoding without classification execution authority;
- governed AI proposal and Human override boundaries;
- complete fail-closed behavior;
- immutable Development delegation to AIDOS;
- Phase 15D receives routing inputs only;
- Audit/Evidence/CommandEnvelope remain non-authoritative;
- future migration impact is identified without creating a migration;
- no implementation, runtime, deployment, or Production change.
