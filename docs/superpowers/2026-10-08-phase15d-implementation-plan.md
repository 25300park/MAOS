# MAOS Phase 15D-B Multi-AI Role / Model Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement append-only, policy-governed Multi-AI role and resource routing that consumes Phase 15C classifications, resolves Phase 15B Registry candidates, and emits non-executing Phase 15E/15F routing metadata.

**Architecture:** PostgreSQL governance tables own immutable policy, specialization, decision-stream, decision-version, and candidate-evidence records. Focused database repositories and services validate the latest Phase 15C head, resolve the exact routing-policy version, filter canonical Phase 15B resources, and append one atomic routing decision plus existing Audit evidence. API and Portal layers expose governed diagnostics and mutation contracts but never create Runs, bind Runners, invoke Tools, or execute Development work.

**Tech Stack:** TypeScript, Node.js, PostgreSQL, existing `@maos/database` adapter/repositories, versioned MAOS API envelopes, server-rendered MAOS Web Portal, Node test runner through `tsx`.

**Spec:** `docs/superpowers/2026-10-08-phase15d-multi-ai-role-model-routing-design.md`

## Global Constraints

- Phase 15D routes; it does not execute.
- Canonical roles are exactly `PLANNER`, `EXECUTOR`, `RESEARCHER`, `ANALYST`, `WRITER`, and `REVIEWER`.
- `DOMAIN_SPECIALIST` is governed specialization metadata, never a role or authority grant.
- `routing_purpose` is `PRIMARY_EXECUTION`, `INDEPENDENT_REVIEW`, or `ADVERSARIAL_REVIEW`.
- `routing_mode` is `PRIMARY_EXECUTION`, `FALLBACK`, `INDEPENDENT_REVIEW`, or `ADVERSARIAL_REVIEW` with the approved purpose/role compatibility matrix.
- `FALLBACK` appends only within the `PRIMARY_EXECUTION` stream and never supersedes review history.
- Current selection is `CURRENT(request_id, routing_purpose)`; no request-global current decision exists.
- `MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD` is the normative policy and specialization authority.
- Phase 15B remains Provider, Model, Host/Runtime Adapter, capability, compatibility, availability, health, and readiness authority.
- Phase 15C remains request-classification and domain-policy-resolution authority.
- `ai.models.capabilities` remains legacy, non-authoritative, and unusable for eligibility.
- `DEVELOPMENT` emits AIDOS delegation metadata only; MAOS-native executor selection is prohibited.
- AI Memory supplies context references only and never becomes execution authority.
- Review evidence is not Verification, QA PASS, Approval, Release authorization, or Human sign-off.
- Routing policy, specialization, stream, decision, and candidate history is append-only and versioned.
- No migration seeds an effective policy, specialization, decision, candidate, permission, or execution authority.
- No historical migration is edited. Migration number `0032` is a candidate and must be revalidated against repository HEAD before implementation.
- Staging, Production, commits, pushes, and deployments require their own Human authorization.

## Review Focus

1. Two concurrent appends to one stream must serialize to one canonical version chain; test in EWP-02.
2. Two active policy chains matching one applicability context must fail `ROUTING_POLICY_CONFLICT`; test in EWP-03.
3. Registry or capability drift after selection must make the decision non-consumable; test in EWP-04 and EWP-05.
4. Exact and conflicting Human-override replay must produce one decision/Audit or fail before mutation; test in EWP-06.
5. A forged Development candidate tuple must fail `DEVELOPMENT_NATIVE_EXECUTION_PROHIBITED`; test in EWP-05 and EWP-06.

---

## File and Interface Map

### New database and service files

- `packages/database/migrations/0032_phase15d_multi_ai_role_model_routing.sql` — candidate forward-only schema migration; number revalidated before creation.
- `packages/database/src/routing-contracts.ts` — frozen enums, persistence records, service inputs/results, `RoutingDecisionOutputV1`, and bounded failures.
- `packages/database/src/routing-authority-read-ports.ts` — four read-only authority ports, typed snapshot/freshness results, and EWP-02-owned concrete adapters/composition bindings to existing canonical authority implementations.
- `packages/database/src/routing-policy-repository.ts` — immutable policy/specialization persistence and exact active-policy reads.
- `packages/database/src/routing-decision-repository.ts` — stream creation, atomic append/idempotency/Audit, history, current head, and candidate snapshots.
- `packages/database/src/routing-policy-service.ts` — exact policy and specialization resolution.
- `packages/database/src/routing-validation-service.ts` — Phase 15C handoff, request context, purpose/mode/role, approval, and staleness validation.
- `packages/database/src/candidate-resolution-service.ts` — Phase 15B Registry filtering, deterministic ranking, and candidate evidence.
- `packages/database/src/routing-decision-service.ts` — orchestration, fallback, Development/AIDOS outcomes, Human-independent decision creation, and canonical output mapping.
- `packages/database/src/routing-read-service.ts` — redacted current/history/by-ID/candidate diagnostic projections.

### New API and Web files

- `apps/api/src/routing-routes.ts` — authenticated/authorized Phase 15D read, decision-create, and override contracts.
- `apps/api/src/routing-server-composition.ts` — database/service composition guarded by Phase 15D runtime configuration.
- `apps/web/src/routing.ts` — read-only routing detail/history/candidate/delegation projection.

### New tests

- `packages/database/test/phase15d-routing-migration.test.ts`
- `packages/database/test/routing-policy-repository.test.ts`
- `packages/database/test/routing-decision-repository.test.ts`
- `packages/database/test/routing-policy-service.test.ts`
- `packages/database/test/routing-authority-read-ports.test.ts`
- `packages/database/test/candidate-resolution-service.test.ts`
- `packages/database/test/routing-validation-service.test.ts`
- `packages/database/test/routing-decision-service.test.ts`
- `apps/api/test/routing-routes.test.ts`
- `apps/api/test/routing-server-composition.test.ts`
- `apps/web/test/routing.test.ts`

### Existing files modified only where required

- `packages/database/src/index.ts` — export Phase 15D contracts/services.
- `packages/database/src/migrations.ts` — discover the new migration through the existing loader only; no special-case runner.
- `packages/database/test/migrations.test.ts`, `packages/database/test/database.test.ts` — explicit migration/checksum/head expectations.
- `packages/database/src/ai-registry-repository.ts` — add bounded snapshot reads only if existing methods cannot return the exact binding/version data; do not add another Registry store.
- `packages/config/src/index.ts`, `packages/config/test/config.test.ts` — disabled-by-default Phase 15D route flag and dependency validation.
- `apps/api/src/server.ts` — register composed routes only when configuration and dependencies are valid.
- `apps/web/src/server.ts` — register the read-only routing Portal surface.
- `scripts/database-role-preflight.ts`, `scripts/database-role-apply-acl.ts` and their tests — only after separate ACL approval, extend fixed allowlists for new governance tables.

## Database Model

| Table | Purpose | Authority owner | Primary key | Canonical references | Immutability/version/current rule | Retention and indexes |
| --- | --- | --- | --- | --- | --- | --- |
| `governance.ai_routing_policy_versions` | Canonical immutable routing-policy content/version chain | `MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD` | `routing_policy_version_id uuid` | capability IDs and bounded applicability references; no Registry copies | `UNIQUE(routing_policy_id, version)`; same-policy immediate predecessor; append-only; effective lifecycle is resolved through activation events, never by updating content rows | Retain permanently; `(routing_policy_id, version DESC)`, applicability, lifecycle-intent, and effective-window indexes |
| `governance.ai_routing_policy_activation_events` | Append-only current-selection authority for policy versions | Same policy authority; not a second policy SoT | `routing_policy_activation_event_id uuid` | exact policy version and prior activation event | one ordered event chain per applicability fingerprint; latest valid event selects or retires the policy; advisory-lock serialized | Retain permanently; applicability/sequence, policy-version, prior-event indexes |
| `governance.ai_routing_specialization_versions` | Policy-version child specialization definitions | Same policy authority | `specialization_version_id uuid` | required `routing_policy_version_id`; normalized capability refs | `UNIQUE(specialization_id, version)`; append-only; selected only beneath the active parent policy version; free-form labels prohibited | Retain permanently; policy-version, specialization head, domain/key indexes |
| `governance.request_routing_decision_streams` | Immutable identity for one request/purpose chain | Governance routing authority | `routing_decision_stream_id uuid` | `request_id -> work.requests(id)` | `UNIQUE(request_id, routing_purpose)`; no update/delete; one request may own all three purpose streams | Retain while request governance history is retained; request/purpose unique index |
| `governance.request_routing_decision_versions` | Canonical immutable routing decisions | Governance routing authority | `routing_decision_id uuid` | stream; exact Phase 15C classification; exact policy version; optional specialization version; Phase 15B provider/model/host binding refs; existing Audit refs | `UNIQUE(stream_id, routing_version)`; immediate same-stream predecessor; advisory lock on stream; current is max version for stream; cross-stream supersession rejected | Retain permanently; stream head, request/purpose join, classification, policy, selected-resource, status/staleness indexes |
| `governance.request_routing_candidate_snapshots` | Immutable eligible/excluded candidate evidence for one decision | Governance routing authority; Registry remains resource authority | `candidate_snapshot_id uuid` | decision; `ai.model_host_bindings`, provider, model, host, capability evidence refs | Insert-only; deterministic unique rank/resource tuple per decision; cannot grant eligibility independently of bound decision/policy | Retain with decision; decision/rank, binding, eligibility/reason indexes |

No Phase 15D evidence table or Audit table is created. Decisions store allowlisted Evidence references and one canonical `audit_ref`; durable action proof reuses `audit.audit_records` through `PostgresAuditRecordRepository`. Phase 15B and Phase 15C rows are referenced by canonical identity/version and never copied as new authority. The policy activation event table is only the append-only selection mechanism required by the already-approved routing-policy authority; it does not create another policy authority.

### Exact persistence contract

All omitted `ON DELETE`/`ON UPDATE` clauses below are forbidden: every physical FK is explicitly `ON DELETE NO ACTION ON UPDATE NO ACTION`. Every Phase 15D table has `BEFORE UPDATE OR DELETE` rejection triggers. UUID defaults may use `gen_random_uuid()` only for MAOS-owned identities; caller-owned or external identities are never minted by routing.

#### `governance.ai_routing_policy_versions`

| Column | Type | Null | Constraint/reference |
| --- | --- | --- | --- |
| `routing_policy_version_id` | `uuid` | no | primary key |
| `routing_policy_id` | `uuid` | no | immutable MAOS policy-chain identity; `UNIQUE(routing_policy_id, routing_policy_version_id)` supports exact composite references |
| `version` | `bigint` | no | `CHECK (version > 0)`, `UNIQUE(routing_policy_id, version)` |
| `supersedes_policy_version_id` | `uuid` | yes | composite self FK `(routing_policy_id, supersedes_policy_version_id)`; when present it must be the immediately prior version |
| `authority_identifier` | `text` | no | exact check `MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD` |
| `lifecycle_intent` | `text` | no | `DRAFT`, `ACTIVE`, `SUPERSEDED`, `RETIRED`; effective selection is derived only from activation events |
| `canonical_domain` | `text` | no | frozen seven-domain check |
| `routing_purpose` | `text` | no | canonical purpose check |
| `role_class` | `text` | no | exact six-role check |
| `organization_id` | `uuid` | yes | FK `core.organizations(id)` |
| `project_id` | `uuid` | yes | requires `organization_id`; composite FK `(organization_id, project_id) -> core.projects(organization_id, id)` |
| `scope_ref` | `text` | no | non-empty canonical scope reference |
| `environment` | `text` | no | `DEVELOPMENT`, `PREVIEW`, `STAGING`, `PRODUCTION` |
| `required_capability_refs` | `uuid[]` | no | non-null/deduplicated; logical owner-read refs to `ai.capabilities(id)` validated before append and on consumption; no copied capability data |
| `preferred_capability_refs` | `uuid[]` | no | same logical-reference rule; cannot satisfy required capability |
| `policy_constraints` | `jsonb` | no | allowlisted versioned schema; object only; no credentials/free-form authority |
| `effective_at` / `expires_at` | `timestamptz` | no/yes | `expires_at IS NULL OR expires_at > effective_at` |
| `content_fingerprint` | `text` | no | `sha256:<64 lowercase hex>` |
| `created_by_actor_type` / `created_by_actor_id` | `text` / `uuid` | no/no | bounded actor type and identity |
| `audit_ref` | `uuid` | no | FK `audit.audit_records(id)` |
| `created_at` | `timestamptz` | no | database timestamp |

Indexes: unique chain index above; `(canonical_domain, routing_purpose, role_class, environment, effective_at)` applicability index; `(routing_policy_id, version DESC)` head index; GIN indexes on required/preferred capability UUID arrays only if the query plan proves need. `RETIRED` is terminal for a policy chain. A DRAFT row is never directly selected.

#### `governance.ai_routing_policy_activation_events`

| Column | Type | Null | Constraint/reference |
| --- | --- | --- | --- |
| `routing_policy_activation_event_id` | `uuid` | no | primary key |
| `routing_policy_id` / `routing_policy_version_id` | `uuid` / `uuid` | no/no | composite FK to `ai_routing_policy_versions(routing_policy_id, routing_policy_version_id)` backed by a matching unique key |
| `applicability_fingerprint` | `text` | no | canonical hash of domain/purpose/role/org/project/scope/environment/effective window |
| `selection_sequence` | `bigint` | no | positive; `UNIQUE(applicability_fingerprint, selection_sequence)` |
| `event_type` | `text` | no | `ACTIVATE`, `SUPERSEDE`, `RETIRE` |
| `supersedes_activation_event_id` | `uuid` | yes | self FK; must be prior event for the same applicability fingerprint |
| `actor_type` / `actor_id` | `text` / `uuid` | no/no | governed steward actor |
| `reason_code` | `text` | no | bounded non-empty code |
| `evidence_refs` | `text[]` | no | allowlisted references, no payloads |
| `audit_ref` | `uuid` | no | FK `audit.audit_records(id)` |
| `created_at` | `timestamptz` | no | database timestamp |

Indexes: `(applicability_fingerprint, selection_sequence DESC)`, `(routing_policy_id, routing_policy_version_id)`, and prior-event index. Current selection is the unique latest intact event: `ACTIVATE` selects its version, `SUPERSEDE` points to the replacement activation in the same atomic transaction, and `RETIRE` yields no active selection. The transaction takes `pg_advisory_xact_lock` on the applicability fingerprint, validates the candidate version and steward, re-reads the prior head, appends the new activation/supersession events plus Audit, and commits. A stale expected head or competing activation returns `ROUTING_POLICY_ACTIVATION_CONFLICT`; no row is updated.

#### `governance.ai_routing_specialization_versions`

| Column | Type | Null | Constraint/reference |
| --- | --- | --- | --- |
| `specialization_version_id` | `uuid` | no | primary key |
| `specialization_id` / `version` | `uuid` / `bigint` | no/no | immutable chain; version positive; `UNIQUE(specialization_id, version)` and `UNIQUE(specialization_id, specialization_version_id)` |
| `routing_policy_version_id` | `uuid` | no | FK `ai_routing_policy_versions(routing_policy_version_id)` |
| `supersedes_specialization_version_id` | `uuid` | yes | composite self FK `(specialization_id, supersedes_specialization_version_id) -> (specialization_id, specialization_version_id)`; non-self, acyclic, immediate prior version only |
| `lifecycle` | `text` | no | `DRAFT`, `ACTIVE`, `SUPERSEDED`, `RETIRED`; RETIRED terminal |
| `specialization_key` | `text` | no | governed uppercase key; no caller free-form label |
| `canonical_domain` / `routing_purpose` | `text` / `text` | no/no | must match parent applicability |
| `scope_ref` / `environment` | `text` / `text` | no/no | must match or narrow parent |
| `required_capability_refs` / `preferred_capability_refs` | `uuid[]` / `uuid[]` | no/no | logical owner-read refs to `ai.capabilities(id)`, validated before append/consumption |
| `metadata` | `jsonb` | no | allowlisted non-authority schema only |
| `content_fingerprint` | `text` | no | canonical SHA-256 |
| `audit_ref` / `created_at` | `uuid` / `timestamptz` | no/no | Audit FK and database timestamp |

Indexes: `(routing_policy_version_id, specialization_key)`, `(specialization_id, version DESC)`, and applicability lookup. Selection requires the latest specialization head to be ACTIVE and the parent policy version to be the active policy selection.

#### `governance.request_routing_decision_streams`

| Column | Type | Null | Constraint/reference |
| --- | --- | --- | --- |
| `routing_decision_stream_id` | `uuid` | no | primary key |
| `request_id` | `uuid` | no | FK `work.requests(id)` |
| `routing_purpose` | `text` | no | canonical purpose check; `UNIQUE(request_id, routing_purpose)` and `UNIQUE(routing_decision_stream_id, request_id, routing_purpose)` |
| `created_by_actor_type` / `created_by_actor_id` | `text` / `uuid` | no/no | bounded actor identity |
| `created_at` | `timestamptz` | no | database timestamp |

Indexes: both unique candidate keys above and the request lookup. `routing_decision_stream_id` remains globally unique through its primary key; the redundant three-column candidate key is intentional so the decision FK structurally proves that its denormalized request and purpose belong to that exact stream. The stream is immutable; no request-global version sequence exists.

#### `governance.request_routing_decision_versions`

| Column | Type | Null | Constraint/reference |
| --- | --- | --- | --- |
| `routing_decision_id` | `uuid` | no | primary key; `UNIQUE(routing_decision_stream_id, routing_decision_id)` supports same-stream predecessor FK |
| `routing_decision_stream_id` / `routing_version` | `uuid` / `bigint` | no/no | stream FK; positive; unique pair |
| `request_id` / `routing_purpose` | `uuid` / `text` | no/no | composite FK `(routing_decision_stream_id, request_id, routing_purpose)` to an identically unique stream key |
| `supersedes_routing_decision_id` | `uuid` | yes | composite self-FK `(routing_decision_stream_id, supersedes_routing_decision_id)` to unique `(routing_decision_stream_id, routing_decision_id)`; immediate prior version only |
| `classification_version_id` | `uuid` | no | composite FK `(request_id, classification_version_id) -> governance.request_classification_versions(request_id, classification_id)` |
| `canonical_domain` / `role_class` / `routing_mode` | `text` | no | frozen checks and exact purpose/mode/role compatibility |
| `specialization_version_id` | `uuid` | yes | FK `ai_routing_specialization_versions(specialization_version_id)` |
| `routing_policy_version_id` | `uuid` | no | FK `ai_routing_policy_versions(routing_policy_version_id)` |
| `provider_id` / `model_id` / `runtime_adapter_id` / `model_host_binding_id` | `uuid` | yes | FKs respectively to `ai.model_providers(id)`, `ai.models(id)`, `ai.host_runtimes(id)`, `ai.model_host_bindings(id)`; all four present together for a MAOS selection or all null |
| `registry_snapshot_ref` / `registry_snapshot_revision` | `text` / `text` | no/no | canonical Registry snapshot contract below |
| `registry_observed_at` / `registry_fresh_until` | `timestamptz` | no/no | freshness interval; fresh-until after observation |
| `required_capability_refs` / `preferred_capability_refs` | `uuid[]` / `uuid[]` | no/no | canonical Registry UUID refs, owner-read validated |
| `policy_constraints` / `context_refs` / `artifact_refs` / `evidence_refs` | `jsonb` / `text[]` / `text[]` / `text[]` | no | allowlisted and redacted |
| `priority` | `text` | no | `LOW`, `NORMAL`, `HIGH`, `URGENT` |
| `human_approval_state` | `text` | no | canonical approval-state check |
| `human_approval_ref` / `human_approval_target_version` / `human_approval_target_hash` | `uuid` / `text` / `text` | yes | all-null or all-present composite FK to `governance.approvals(id, target_version, target_hash)` |
| `human_approval_authority` | `text` | yes | required iff approval ref present |
| `human_approval_checked_at` / `human_approval_expires_at` | `timestamptz` | yes | required iff approval ref present; expiry after check |
| `development_delegation_state` | `text` | no | canonical Development state check |
| `aidos_project_ref` | `text` | yes | logical `authority://aidos/projects/<opaque-id>` reference validated by `AidosAuthorityReadPort`; no local FK/SoT |
| `aidos_required_capability_refs` | `uuid[]` | yes | canonical capability UUIDs needed for AIDOS handoff; required for Development and owner-read validated, absent otherwise |
| `aidos_authority_revision` / `aidos_checked_at` / `aidos_fresh_until` | `text` / `timestamptz` / `timestamptz` | yes | all required for Development and absent otherwise |
| `decision_state` / `decision_reason_codes` / `staleness_state` | `text` / `text[]` / `text` | no | bounded checks |
| `classification_checked_at` / `classification_fresh_until` | `timestamptz` | no | exact Phase 15C freshness proof |
| `policy_checked_at` / `policy_fresh_until` | `timestamptz` | no | exact policy freshness proof |
| `idempotency_key` / `canonical_intent_fingerprint` | `text` / `text` | no | unique `(request_id, idempotency_key)`; SHA-256 fingerprint |
| `correlation_id` / `causation_refs` | `text` / `text[]` | no | non-empty bounded references |
| `audit_ref` | `uuid` | no | FK `audit.audit_records(id)` |
| `created_at` | `timestamptz` | no | immutable database timestamp |

Indexes: stream head `(routing_decision_stream_id, routing_version DESC)`; request/purpose; classification; policy; selected binding; approval; staleness/freshness; unique replay key. Database checks require review purposes to use `REVIEWER`, primary purpose to use primary/fallback modes, Development to have all MAOS resource refs null and complete AIDOS proof, and non-Development to have AIDOS fields null. Required approval states require a complete approval reference/freshness tuple.

A deferred constraint trigger joins `model_host_binding_id -> ai.model_host_bindings(model_id, host_id)`, `model_id -> ai.models(provider_id)`, and the supplied Provider/Model/Host IDs, rejecting any non-exact tuple before commit. The candidate table uses the same validator. This proves canonical Registry identity without copying Registry ownership.

### Composite foreign-key validation matrix

| Source table | Source columns | Target table | Target columns | Target PK/UNIQUE | Match |
| --- | --- | --- | --- | --- | --- |
| `ai_routing_policy_versions` | `(routing_policy_id, supersedes_policy_version_id)` | same | `(routing_policy_id, routing_policy_version_id)` | `UNIQUE(routing_policy_id, routing_policy_version_id)` | PASS |
| `ai_routing_policy_activation_events` | `(routing_policy_id, routing_policy_version_id)` | `ai_routing_policy_versions` | same names | `UNIQUE(routing_policy_id, routing_policy_version_id)` | PASS |
| `ai_routing_specialization_versions` | `(specialization_id, supersedes_specialization_version_id)` | same | `(specialization_id, specialization_version_id)` | `UNIQUE(specialization_id, specialization_version_id)` | PASS |
| `request_routing_decision_versions` | `(routing_decision_stream_id, request_id, routing_purpose)` | `request_routing_decision_streams` | same names | `UNIQUE(routing_decision_stream_id, request_id, routing_purpose)` | PASS |
| `request_routing_decision_versions` | `(routing_decision_stream_id, supersedes_routing_decision_id)` | same | `(routing_decision_stream_id, routing_decision_id)` | `UNIQUE(routing_decision_stream_id, routing_decision_id)` | PASS |
| `request_routing_decision_versions` | `(request_id, classification_version_id)` | `request_classification_versions` | `(request_id, classification_id)` | existing `UNIQUE(request_id, classification_id)` | PASS |
| `ai_routing_policy_versions` | `(organization_id, project_id)` | `core.projects` | `(organization_id, id)` | existing `UNIQUE(organization_id, id)` | PASS |
| `request_routing_decision_versions` | `(human_approval_ref, human_approval_target_version, human_approval_target_hash)` | `governance.approvals` | `(id, target_version, target_hash)` | existing `UNIQUE(id, target_version, target_hash)` | PASS |

Every row is emitted as an explicit named FK with `ON DELETE NO ACTION ON UPDATE NO ACTION`. Migration tests query `pg_constraint`/`pg_index` to prove the exact target candidate key exists; prose-only composite references fail the test.

#### `governance.request_routing_candidate_snapshots`

| Column | Type | Null | Constraint/reference |
| --- | --- | --- | --- |
| `candidate_snapshot_id` | `uuid` | no | primary key |
| `routing_decision_id` | `uuid` | no | FK `request_routing_decision_versions(routing_decision_id)` |
| `deterministic_rank` | `integer` | no | positive; unique per decision |
| `provider_id` / `model_id` / `runtime_adapter_id` / `model_host_binding_id` | `uuid` | no | canonical Phase 15B FKs as above; unique `(routing_decision_id, model_host_binding_id)` |
| `eligibility_state` | `text` | no | `ELIGIBLE`, `EXCLUDED` |
| `reason_codes` | `text[]` | no | bounded codes |
| `capability_evidence` / `ranking_evidence` | `jsonb` | no | canonical UUID/version references only; no copied Registry metadata or secrets |
| `registry_snapshot_ref` / `registry_snapshot_revision` | `text` / `text` | no/no | must equal parent decision snapshot |
| `observed_at` / `fresh_until` | `timestamptz` | no/no | deterministic freshness proof |
| `created_at` | `timestamptz` | no | database timestamp |

Indexes: decision/rank, binding, eligibility/reason, and snapshot reference. Candidate evidence is immutable and never becomes Registry authority.

## Canonical Constraints and Indexes

- Frozen role check: `PLANNER`, `EXECUTOR`, `RESEARCHER`, `ANALYST`, `WRITER`, `REVIEWER` only.
- Purpose check: `PRIMARY_EXECUTION`, `INDEPENDENT_REVIEW`, `ADVERSARIAL_REVIEW`. Mode check: `PRIMARY_EXECUTION`, `FALLBACK`, `INDEPENDENT_REVIEW`, `ADVERSARIAL_REVIEW`.
- Policy lifecycle check: `DRAFT`, `ACTIVE`, `SUPERSEDED`, `RETIRED`; RETIRED is terminal and effective lifecycle is derived from the activation-event head without mutating content rows.
- Staleness check: `CURRENT`, `STALE_CLASSIFICATION`, `STALE_POLICY`, `STALE_REGISTRY`, `STALE_APPROVAL`, `STALE_AIDOS`, `CONFLICTING`.
- Human approval check: `NOT_REQUIRED`, `REQUIRED_MISSING`, `APPROVED`, `REJECTED`, `EXPIRED`, `REVOKED`, `STALE`, `CONSUMED`. Only `APPROVED` may carry a consumable approval; every state except `NOT_REQUIRED` requires an exact approval reference when one exists, and a required missing reference fails before decision selection.
- Development delegation check: `NOT_APPLICABLE`, `READY_TO_DELEGATE`, `AIDOS_UNAVAILABLE`, `WAITING_AIDOS_ONBOARDING`. `NOT_APPLICABLE` is required outside Development and prohibited for Development.
- Purpose/mode/role check: primary permits `PRIMARY_EXECUTION` or `FALLBACK`; independent/adversarial purposes require `REVIEWER` and their matching mode.
- Development check: selected Provider/Model/Host refs are null for the final executor outcome; delegation state is one of `READY_TO_DELEGATE`, `AIDOS_UNAVAILABLE`, `WAITING_AIDOS_ONBOARDING`.
- Selected resource consistency: Provider, Model, Host, and model-host binding must refer to one exact Phase 15B tuple when selection exists.
- Policy owner check is exactly `MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD`.
- Policy/specialization/decision/candidate tables reject runtime `UPDATE` and `DELETE` through triggers and ACL.
- Decision insert obtains a transaction advisory lock on `routing_decision_stream_id`, validates predecessor version, classification binding, policy version, idempotency fingerprint, and same-stream supersession.
- Head queries use ordered max-version reads and validate one unbroken chain; no mutable `is_current` column.
- `PUBLIC` receives no privileges; the runtime receives only approved `USAGE`, `SELECT`, and bounded `INSERT` needed by repositories. Policy activation/admin append remains outside normal application runtime unless separately approved.

## Canonical Output Mapping

`RoutingDecisionOutputV1` has `contractVersion: "PHASE15D_ROUTING_OUTPUT_V1"` and exactly maps:

`routingDecisionId`, `routingDecisionStreamId`, `routingVersion`, `requestId`, `classificationVersionId`, `canonicalDomain`, `roleClass`, `routingPurpose`, `routingMode`, version-bound `specializationMetadata`, `requiredCapabilities`, `preferredCapabilities`, `eligibleResourceRefs`, optional `selectedProviderRef`, optional `selectedModelRef`, optional `selectedRuntimeAdapterRef`, `policyConstraints`, `policySnapshotRef`, `registrySnapshotRef`, `contextRefs`, `artifactRefs`, `priority`, `humanApprovalState`, optional `humanApprovalRef`, `humanApprovalAuthority`, optional `humanApprovalCheckedAt`, optional `humanApprovalExpiresAt`, `developmentDelegationState`, optional `aidosProjectRef`, optional `aidosRequiredCapabilities`, optional `aidosAuthorityRevision`, optional `aidosCheckedAt`, optional `aidosFreshUntil`, `decisionReasonCodes`, `createdAt`, optional `supersedesRoutingDecisionId`, `stalenessState`, and `freshnessReferences` containing exact classification, policy, Registry, Approval, and AIDOS observations/expiry references as applicable.

The database DTO uses the same semantic fields in snake_case columns; service and API DTOs use the camelCase contract. The Phase 15E/15F handoff is the same V1 semantic contract and its exact per-authority freshness proof. Mappers must be explicit and reject unknown enum values. `OUTPUT != EXECUTION AUTHORITY`, `OUTPUT != APPROVAL`, `OUTPUT != RUN/JOB`, and `OUTPUT != RELEASE AUTHORIZATION`. No DTO includes ToolCall, Runner binding, execution token, credential, or implicit authority.

### External authority read ports

```ts
interface ClassificationAuthorityReadPort {
  readCurrent(requestId: string, context: ExactRequestContext): Promise<Phase15dClassificationHandoff>;
  revalidate(versionId: string, context: ExactRequestContext): Promise<AuthorityFreshnessResult>;
}

interface RegistryAuthorityReadPort {
  readSnapshot(input: RegistrySnapshotQuery): Promise<RegistryAuthoritySnapshot>;
  revalidate(snapshotRef: string, revision: string, resourceRefs: string[]): Promise<AuthorityFreshnessResult>;
}

interface AidosAuthorityReadPort {
  readAidosAvailability(input: AidosAvailabilityQuery): Promise<AidosAvailabilitySnapshot>;
  readProjectOnboardingState(input: AidosProjectOnboardingQuery): Promise<AidosProjectOnboardingSnapshot>;
  readDelegationEligibility(input: AidosDelegationEligibilityQuery): Promise<AidosDelegationEligibilitySnapshot>;
  revalidate(input: AidosRevalidationQuery): Promise<AuthorityFreshnessResult>;
}

interface HumanApprovalAuthorityReadPort {
  resolveRequirement(input: ApprovalRequirementQuery): Promise<HumanApprovalSnapshot>;
  revalidate(approvalRef: string, targetVersion: string, targetHash: string): Promise<AuthorityFreshnessResult>;
}
```

`ClassificationAuthorityReadPort` is an adapter over the Phase 15C runtime and never appends classifications. `RegistryAuthorityReadPort` is an adapter over `AiRegistryRepository` and never writes Registry state. `HumanApprovalAuthorityReadPort` reads `governance.approvals` and the existing approval runtime; Reviewer output is never accepted as approval. `AidosAuthorityReadPort` reads the independently governed AIDOS integration contract; no local AIDOS table is created and routing cannot manufacture availability, onboarding, or delegation eligibility.

`EXTERNAL_AUTHORITY_PORT_ONLY_RULE = REQUIRED`. Every Phase 15D routing service consumes external authority only through `ClassificationAuthorityReadPort`, `RegistryAuthorityReadPort`, `HumanApprovalAuthorityReadPort`, or `AidosAuthorityReadPort`. Direct service-layer dependencies on `RequestClassificationRuntime`, `AiRegistryRepository`, a Human Approval concrete repository/runtime, or an AIDOS concrete client/runtime are prohibited. EWP-02 owns the port contracts, concrete adapters, and composition bindings; concrete authority implementations are permitted only as adapter internals and remain owned by their canonical authority.

#### Common external authority cache contract

`EXTERNAL_AUTHORITY_CACHE_RULE = NON_AUTHORITATIVE_BOUNDED_CACHE_ONLY`.

For every external authority port, cached data is only a disposable read accelerator. It cannot manufacture authority, extend canonical freshness, suppress stale/revoked/unavailable states, replace a required canonical revalidation, or become the Evidence source when canonical authority is required. `MAX_FRESHNESS = GOVERNED_POLICY_BOUND`: the usable cache interval ends at the earliest of the authority-supplied expiry/fresh-until value and `observed_at + max_age` from the governing authority's approved freshness policy. If either the required freshness metadata or governing policy cannot be resolved, the read fails closed rather than using cache state.

Classification cache contract:

- `CLASSIFICATION_CACHE_ALLOWED = YES_BOUNDED_NONAUTHORITATIVE`.
- `CLASSIFICATION_CACHE_AUTHORITY = NON_AUTHORITATIVE`; Phase 15C remains the sole classification authority.
- `CLASSIFICATION_MAX_FRESHNESS = GOVERNED_POLICY_BOUND`, bounded by the Phase 15C handoff `freshUntil` and the Phase 15C classification freshness-policy `max_age`.
- `CLASSIFICATION_REVALIDATION_BYPASSES_CACHE = YES`; creation and consumption revalidation resolve the canonical current Phase 15C head.
- `CLASSIFICATION_STALE_CACHE_BEHAVIOR = FAIL_CLOSED`; an older cached `VALIDATED` version never replaces a stale, missing, conflicting, or non-consumable current head.

Registry cache contract:

- `REGISTRY_CACHE_ALLOWED = YES_BOUNDED_NONAUTHORITATIVE`.
- `REGISTRY_CACHE_AUTHORITY = NON_AUTHORITATIVE`; the Phase 15B Registry remains the sole Provider/Model/Runtime Adapter/capability source of truth.
- `REGISTRY_MAX_FRESHNESS = GOVERNED_POLICY_BOUND`, bounded by `registryFreshUntil` and the Phase 15B Registry freshness-policy `max_age` for the exact resource set.
- `REGISTRY_REVALIDATION_BYPASSES_CACHE = YES`; canonical candidate selection and consumption-time revalidation reread the exact Registry resources and recompute the governed snapshot identity.
- `REGISTRY_STALE_CACHE_BEHAVIOR = FAIL_CLOSED`; stale, disabled, reconciling, conflicting, or unavailable canonical state cannot be hidden by a cached snapshot, and `registrySnapshotRef` identifies canonical source state rather than local cache state.

Human Approval cache contract:

- `HUMAN_APPROVAL_CACHE_ALLOWED = YES_BOUNDED_NONAUTHORITATIVE`.
- `HUMAN_APPROVAL_CACHE_AUTHORITY = NON_AUTHORITATIVE`; Approval remains owned by `governance.approvals` and its governed approval runtime, external to routing.
- `HUMAN_APPROVAL_MAX_FRESHNESS = GOVERNED_POLICY_BOUND`, bounded by the canonical approval expiry and the Approval authority's freshness-policy `max_age`.
- `HUMAN_APPROVAL_REVALIDATION_BYPASSES_CACHE = YES`; whenever approval is required, canonical approval authority is reread before a dependent decision becomes current or consumable.
- `HUMAN_APPROVAL_STALE_CACHE_BEHAVIOR = FAIL_CLOSED`; missing, expired, stale, revoked, consumed, or mismatched approval is never satisfied by cache, Reviewer output, QA output, or Evidence alone.

| Authority | Cache allowed | Cache authoritative | Revalidation required | Cache bypass on revalidation | Stale behavior |
| --- | --- | --- | --- | --- | --- |
| Phase 15C Classification | bounded non-authoritative only | NO | decision creation and every current-consumption/handoff validation | YES | `CLASSIFICATION_STALE`/current-state failure; no older-version fallback |
| Phase 15B Registry | bounded non-authoritative only | NO | candidate selection and every current-consumption/handoff validation | YES | bounded stale/reconciling/conflict/unavailable failure |
| Human Approval | bounded non-authoritative only | NO | every decision creation/consumption that requires approval | YES | bounded missing/stale/revoked/invalid failure |
| AIDOS | bounded non-authoritative process cache only | NO | every Development creation/consumption/handoff validation | YES | bounded AIDOS stale/unavailable/onboarding/ineligible/conflict failure |

`RoutingValidationService` applies the Classification and Human Approval rules, `CandidateResolutionService` applies the Registry rules, and `RoutingDecisionService` requires their canonical revalidation plus AIDOS revalidation before append or current-consumption handoff. None of these services may silently use cached authority after its bounded window, extend that window, or skip a required cache-bypassing revalidation.

#### Canonical AIDOS authority source

- `AIDOS_AUTHORITY_SOURCE = AIDOS_EXTERNAL_ORCHESTRATOR_INTEGRATION_CONTRACT_V1_1`.
- `AIDOS_PROJECT_REGISTRATION_SOURCE = AIDOS_PROJECT_REGISTRATION_PROJECTION` from that contract.
- `AIDOS_AVAILABILITY_SOURCE = AIDOS_RUNTIME_AVAILABILITY_PROJECTION` from that contract.
- `AIDOS_DELEGATION_ELIGIBILITY_SOURCE = AIDOS_DELEGATION_ELIGIBILITY_PROJECTION` from that contract.

These are read projections of AIDOS-owned authority, not MAOS tables or a second registry. Each snapshot contains the exact AIDOS project/target reference, source contract/version, opaque source revision, observed timestamp, `freshUntil`, bounded state, and safe Evidence reference. A process-local cache is permitted only as `NON_AUTHORITATIVE`, keyed by source identity/revision, expiring no later than `freshUntil`, and bypassed for revalidation. Persistent MAOS caching is prohibited in Phase 15D.

Exact operation contracts:

| Operation | Input | Output | Canonical source | Freshness/failures | Authority/cache |
| --- | --- | --- | --- | --- | --- |
| `readAidosAvailability` | environment, AIDOS target ref, exact tenant/project/scope, correlation ID | `AVAILABLE`, `UNAVAILABLE`, or `UNKNOWN` plus revision/timestamps/Evidence | `AIDOS_RUNTIME_AVAILABILITY_PROJECTION` | expired/unknown -> `AIDOS_AUTHORITY_STALE`; source unavailable -> `AIDOS_UNAVAILABLE`; conflicting revision -> `AIDOS_AUTHORITY_CONFLICT` | AIDOS; read-only; non-authoritative process cache only |
| `readProjectOnboardingState` | `aidosProjectRef`, organization/project/environment/scope | `PROJECT_ONBOARDED`, `PROJECT_NOT_ONBOARDED`, `SUSPENDED`, or `UNKNOWN` plus revision/timestamps/Evidence | `AIDOS_PROJECT_REGISTRATION_PROJECTION` | absent/not onboarded -> `WAITING_AIDOS_ONBOARDING`; stale/unknown -> `AIDOS_AUTHORITY_STALE` | AIDOS; read-only; same cache rule |
| `readDelegationEligibility` | AIDOS project ref, classification version, required capability refs, exact context | `ELIGIBLE`, `INELIGIBLE`, or `UNKNOWN` plus revision/timestamps/Evidence | `AIDOS_DELEGATION_ELIGIBILITY_PROJECTION` | ineligible -> `AIDOS_DELEGATION_INELIGIBLE`; stale/unknown -> `AIDOS_AUTHORITY_STALE`; conflict -> `AIDOS_AUTHORITY_CONFLICT` | AIDOS; read-only; same cache rule |
| `revalidate` | all three snapshot identities/revisions plus expected context | `AuthorityFreshnessResult` | all three projections | any changed/expired/mismatched source fails closed | uncached authoritative read |

Deterministic Development mapping:

| Source condition | Output | Freshness rule | Fail-closed rule | Evidence |
| --- | --- | --- | --- | --- |
| availability `AVAILABLE`, project `PROJECT_ONBOARDED`, eligibility `ELIGIBLE` | `READY_TO_DELEGATE` | all three snapshots current through decision consumption | any drift prevents handoff | all three safe Evidence refs plus revisions |
| availability `UNAVAILABLE` with current observation | `AIDOS_UNAVAILABLE` | availability observation unexpired | no retry through MAOS resources | availability Evidence ref |
| availability `AVAILABLE` and project `PROJECT_NOT_ONBOARDED` | `WAITING_AIDOS_ONBOARDING` | availability/onboarding observations unexpired | no MAOS-native fallback or auto-registration | availability and registration Evidence refs |
| suspended/ineligible | no delegation output; `AIDOS_DELEGATION_INELIGIBLE` | current authoritative observation required | decision fails closed | registration/eligibility Evidence refs |
| stale, unknown, conflicting, unreadable, or expired source | no delegation output; bounded AIDOS authority failure | authoritative reread required | decision fails closed | safe failure Evidence ref when supplied |

### Registry snapshot identity and freshness

`registrySnapshotRef` is the opaque deterministic identifier `registry-snapshot:sha256:<64 lowercase hex>`. Its canonical hash input is the ordered set of exact Provider, Model, Host Runtime, model-host binding, role compatibility, capability, and model-capability-binding identities plus their authoritative `version`, lifecycle/status, health/readiness, and verification-freshness markers returned by one repeatable-read Registry transaction. `registrySnapshotRevision` is the Registry transaction observation marker defined by the adapter (`txid_snapshot_xmin/xmax` plus the canonical hash); `registryObservedAt` is the database observation timestamp and `registryFreshUntil` is the minimum policy-governed expiry across required observations.

The snapshot ref is evidence, not a copied Registry SoT. Candidate rows store only canonical IDs, bounded reason/ranking evidence, versions, and the shared snapshot reference. Revalidation re-reads the same resources and recomputes the canonical hash; changed version/status/health/readiness/capability data, expired `freshUntil`, or any `STALE`/`RECONCILING` marker returns a bounded Registry failure and makes the decision non-consumable.

### AIDOS and Human Approval authority states

The AIDOS adapter applies only the normative mapping table above. An unknown, stale, conflicting, unreadable, suspended, or ineligible AIDOS state cannot become READY. Development always resolves Phase 15C `DELEGATE_TO_AIDOS`, then all required AIDOS port reads; selected MAOS Provider/Model/Runtime Adapter refs remain null. The port has no create/update/delete/registration/delegation operation.

Approval output binds `humanApprovalRef` to `governance.approvals(id)`, `humanApprovalAuthority` to its governed authority rule/decision source, and the exact target version/hash plus checked/expiry timestamps. Missing, expired, stale, revoked, consumed, mismatched, or non-APPROVED authority never satisfies routing. `freshnessReferences` contains typed records `{ authority, identity, revision, checkedAt, freshUntil }`; free-form freshness is prohibited.

## Service Boundary Matrix

| Service | Input | Output | Authority and dependencies | Mutation rights | Fail-closed conditions |
| --- | --- | --- | --- | --- | --- |
| `RoutingValidationService` | request/context, exact classification reference, purpose/mode/role | `ValidatedRoutingContext` | `ClassificationAuthorityReadPort`, `HumanApprovalAuthorityReadPort`, Work Request owner-read | None | missing/mismatched request; non-head/non-VALIDATED/stale classification; unresolved Phase 15C policy; invalid tuple; missing/stale/revoked approval |
| `RoutingPolicyService` | validated domain/purpose/role/context/effective time and optional specialization ref | immutable `RoutingPolicySnapshot` and optional `SpecializationSnapshot` | `RoutingPolicyRepository`; policy activation uses a separately composed steward command path | Runtime read only; steward path may append policy and activation/Audit rows atomically | zero/multiple active selection heads; stale/retired/expired policy; invalid/free-form specialization; capability drift; activation conflict |
| `CandidateResolutionService` | validated context, policy/specialization snapshots, required/preferred capabilities | `CandidateResolutionResult` with ordered eligibility evidence and Registry snapshot | `RegistryAuthorityReadPort` only | None | disabled/stale/reconciling/conflicting Provider/Model/Host/binding/capability; missing required capability; policy denial; non-deterministic tie |
| `RoutingDecisionService` | validated create/fallback/override intent, Evidence/idempotency/correlation context | `RoutingAppendResult` and `RoutingDecisionOutputV1` | `RoutingValidationService`, `RoutingPolicyService`, `CandidateResolutionService`, `ClassificationAuthorityReadPort`, `AidosAuthorityReadPort`, `HumanApprovalAuthorityReadPort`, `RoutingDecisionRepository`, Audit | May append stream/decision/candidate/Audit atomically; no underlying-authority mutation | any dependency failure; wrong stream/head; idempotency conflict; cross-stream supersession; Development native selection |
| `RoutingReadService` | authenticated request/decision ID plus exact context and purpose | redacted current/history/by-ID/candidate views | `RoutingDecisionRepository` plus all four authority read ports for consumption-time freshness | None | unknown/mismatched scope; stale/ambiguous head; unauthorized detail; any authority revalidation failure |

Canonical resolution flow:

`Phase15C current classification -> RoutingValidationService -> RoutingPolicyService role/purpose/capabilities -> CandidateResolutionService Phase15B filter -> policy eligibility/ranking -> immutable candidate set -> RoutingDecisionService atomic append -> RoutingDecisionOutputV1`.

No service in this chain invokes a selected resource or creates execution state.

## Failure Code Model

All service failures use this one-to-one `RoutingErrorCode` map and API error envelopes without raw database/provider errors. No generic fallback may collapse distinct authority states.

| Fail-closed condition | Canonical implementation code |
| --- | --- |
| routing request entity absent | `ROUTING_REQUEST_NOT_FOUND` |
| request exists but no classification satisfies exact latest-current selection | `CLASSIFICATION_NOT_CURRENT` |
| current classification exists but state is not `VALIDATED` | `CLASSIFICATION_NOT_VALIDATED` |
| classification exists but violates its canonical structural/semantic contract | `CLASSIFICATION_INVALID` |
| classification stale | `CLASSIFICATION_STALE` |
| classification policy unresolved | `CLASSIFICATION_POLICY_UNRESOLVED` |
| routing policy missing | `ROUTING_POLICY_MISSING` |
| routing policy stale/expired | `ROUTING_POLICY_STALE` |
| policy head not ACTIVE/retired | `ROUTING_POLICY_INACTIVE` |
| multiple applicable policy heads | `ROUTING_POLICY_CONFLICT` |
| concurrent/stale activation head | `ROUTING_POLICY_ACTIVATION_CONFLICT` |
| policy denies the requested route | `POLICY_DENIED` |
| policy does not authorize fallback | `FALLBACK_NOT_AUTHORIZED` |
| specialization invalid/stale | `SPECIALIZATION_INVALID` |
| required capability unavailable | `REQUIRED_CAPABILITY_UNAVAILABLE` |
| Provider unavailable | `PROVIDER_UNAVAILABLE` |
| Model disabled | `MODEL_DISABLED` |
| Runtime Adapter unavailable | `RUNTIME_ADAPTER_UNAVAILABLE` |
| Registry stale | `REGISTRY_STALE` |
| Registry reconciling | `REGISTRY_RECONCILING` |
| Registry conflicting/ambiguous | `REGISTRY_CONFLICT` |
| no eligible candidate | `NO_ELIGIBLE_CANDIDATE` |
| deterministic tie unavailable | `NONDETERMINISTIC_CANDIDATE_TIE` |
| review independence unsatisfied | `REVIEW_INDEPENDENCE_UNSATISFIED` |
| adversarial policy missing | `ADVERSARIAL_REVIEW_POLICY_MISSING` |
| approval required/missing | `HUMAN_APPROVAL_REQUIRED` |
| approval stale/expired | `HUMAN_APPROVAL_STALE` |
| approval revoked | `HUMAN_APPROVAL_REVOKED` |
| approval target/authority invalid | `HUMAN_APPROVAL_INVALID` |
| Human override violates policy | `HUMAN_OVERRIDE_POLICY_VIOLATION` |
| AIDOS unavailable | `AIDOS_UNAVAILABLE` |
| AIDOS project not onboarded | `WAITING_AIDOS_ONBOARDING` |
| AIDOS authority observation stale/unknown | `AIDOS_AUTHORITY_STALE` |
| AIDOS authority revisions conflict | `AIDOS_AUTHORITY_CONFLICT` |
| AIDOS project currently ineligible | `AIDOS_DELEGATION_INELIGIBLE` |
| Development native selection attempted | `DEVELOPMENT_NATIVE_EXECUTION_PROHIBITED` |
| decision no longer consumable | `ROUTING_DECISION_STALE` |
| stream/head conflict | `ROUTING_STREAM_CONFLICT` |
| cross-stream supersession | `ROUTING_CROSS_STREAM_SUPERSESSION_DENIED` |
| idempotency conflict | `ROUTING_IDEMPOTENCY_CONFLICT` |

Expected HTTP mappings: malformed input `400`, authentication `401`, authorization/policy denial `403`, missing canonical resource `404`, stale/conflict/idempotency/ambiguous state `409`, semantic contract violation `422`, and bounded unavailable dependency `503`.

`CLASSIFICATION_NOT_FOUND` is not introduced because the approved Phase 15D-A design does not define it separately: an absent routing request is `ROUTING_REQUEST_NOT_FOUND`; for an existing request, absence of a consumable current classification is `CLASSIFICATION_NOT_CURRENT`. These remain distinct from not validated, invalid, and stale states.

## Future Database ACL Matrix

Every matrix entry is `FUTURE_SEPARATE_AUTHORIZATION`; this plan authorizes no role/grant change. Values are exactly `YES`, `NO`, or `CONDITIONAL_GOVERNED_PATH`. `MIGRATION_OWNER` remains a governed non-superuser owner used only by the separately authorized migration command. `APPLICATION_RUNTIME` never inherits provider-admin, ACL-admin, superuser, migration-owner, or steward membership.

| Table/entity | Authority class | SELECT | INSERT | UPDATE | DELETE | DDL_CREATE | DDL_ALTER | DDL_DROP | OWNERSHIP | GRANT_OPTION |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ai_routing_policy_versions` | APPLICATION_RUNTIME | YES | NO | NO | NO | NO | NO | NO | NO | NO |
| same | MIGRATION_OWNER | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH |
| same | MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD_PATH | YES | CONDITIONAL_GOVERNED_PATH | NO | NO | NO | NO | NO | NO | NO |
| same | READ_ONLY_PROJECTION | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| same | PUBLIC | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| `ai_routing_policy_activation_events` | APPLICATION_RUNTIME | YES | NO | NO | NO | NO | NO | NO | NO | NO |
| same | MIGRATION_OWNER | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH |
| same | MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD_PATH | YES | CONDITIONAL_GOVERNED_PATH | NO | NO | NO | NO | NO | NO | NO |
| same | READ_ONLY_PROJECTION | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| same | PUBLIC | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| `ai_routing_specialization_versions` | APPLICATION_RUNTIME | YES | NO | NO | NO | NO | NO | NO | NO | NO |
| same | MIGRATION_OWNER | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH |
| same | MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD_PATH | YES | CONDITIONAL_GOVERNED_PATH | NO | NO | NO | NO | NO | NO | NO |
| same | READ_ONLY_PROJECTION | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| same | PUBLIC | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| `request_routing_decision_streams` | APPLICATION_RUNTIME | YES | YES | NO | NO | NO | NO | NO | NO | NO |
| same | MIGRATION_OWNER | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH |
| same | MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD_PATH | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| same | READ_ONLY_PROJECTION | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| same | PUBLIC | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| `request_routing_decision_versions` | APPLICATION_RUNTIME | YES | YES | NO | NO | NO | NO | NO | NO | NO |
| same | MIGRATION_OWNER | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH |
| same | MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD_PATH | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| same | READ_ONLY_PROJECTION | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| same | PUBLIC | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| `request_routing_candidate_snapshots` | APPLICATION_RUNTIME | YES | YES | NO | NO | NO | NO | NO | NO | NO |
| same | MIGRATION_OWNER | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH | CONDITIONAL_GOVERNED_PATH |
| same | MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD_PATH | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| same | READ_ONLY_PROJECTION | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| same | PUBLIC | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| redacted routing views | APPLICATION_RUNTIME | YES | NO | NO | NO | NO | NO | NO | NO | NO |
| same | READ_ONLY_PROJECTION | CONDITIONAL_GOVERNED_PATH | NO | NO | NO | NO | NO | NO | NO | NO |
| same | PUBLIC | NO | NO | NO | NO | NO | NO | NO | NO | NO |

`CONDITIONAL_GOVERNED_PATH` for `MIGRATION_OWNER` records the inherent capability of the table owner but permits its use only inside the exact separately authorized migration transaction; it is never a normal API/Web/runtime credential. The steward path is a separately authenticated service composition and DB role that can append policy content, specialization, and activation events only; it receives no decision-table privilege. `READ_ONLY_PROJECTION` has no base-table privilege and may SELECT only separately approved redacted views. `PUBLIC` has no schema, table, view, sequence, function, or default privilege.

Human override is not a DB role and grants no direct SQL privilege. The flow is `Human authority -> authorized EWP-07 API -> EWP-06 service -> APPLICATION_RUNTIME INSERT of a new routing decision/candidate/Audit transaction`; historical rows remain UPDATE/DELETE denied. Schema `USAGE`, exact table/view privileges, functions, sequences, default privileges, memberships, and privilege escalation are verified object-by-object. ACL implementation may extend fixed allowlists only after separate Human authorization and must prove replay idempotency, runtime reconnect, PUBLIC absence, and no provider-admin/superuser dependency.

## Test Strategy Matrix

| Layer | Required coverage |
| --- | --- |
| Contract/unit | exact six roles, purpose/mode valid and invalid matrix, complete output V1 mapping including Approval/AIDOS/freshness, one-to-one failure-code mapping proving request-not-found/current/not-validated/invalid remain distinct, redaction, deterministic fingerprints |
| Migration/repository | real PostgreSQL apply/replay/checksum, `pg_constraint` proof for every composite target key, mismatched stream request/purpose rejection, specialization predecessor enforcement, six-table constraints, append-only history, locks, replay, Audit rollback |
| Policy | immutable content versions, atomic activation event, concurrent activation conflict, effective supersession/retirement, overlapping applicability conflict, expiry/staleness, specialization validation |
| Registry resolution | canonical snapshot identity/revision/freshness recomputation, Provider/Model/Host/binding/capability states, legacy capability rejection, required/preferred behavior, deterministic ranking, stale/reconciling denial |
| Service | explicit authority-port boundaries; service construction uses port doubles/fakes and rejects direct concrete external-authority dependencies; adapter tests keep repositories/runtimes behind ports; bounded non-authoritative cache reads and cache-bypassing revalidation for Classification, Registry, Approval, and AIDOS; stale-cache rejection; old cached classification cannot replace the current head; Registry reconciling/canonical-snapshot checks; Approval expired/revoked/reviewer-substitution denial; AIDOS available/onboarded/eligible, unavailable, not-onboarded, ineligible, and stale-source mappings; stale/invalid Phase 15C input; concurrent streams; fallback isolation; output non-authority |
| API | AuthN/AuthZ, input validation, exact envelopes/status codes, idempotency, safe errors, current/history/by-ID/candidates, override, disabled composition |
| UI/observability | authorized projection, unauthorized denial, stream/mode distinctions, redaction, no controls, bounded logs/metrics, serverless import boundary |
| Integration/restart | PostgreSQL reconstruction, cache independence, policy/Registry/AIDOS drift, exact operation-level ACL allow/deny matrix, runtime UPDATE/DELETE denial, steward isolation, PUBLIC denial, migration-only DDL, API/Web contract, no Run/ToolCall/Runner mutation |
| Regression | Phase 15B Registry, Phase 15C classification, Audit, identity/session, API/Web builds, typecheck/lint/format/boundaries/repository scan/full suite |

---

### EWP-01: Database Migration, Ownership, and ACL Contract

**Scope:** Add the six Phase 15D governance tables, constraints, triggers, indexes, migration verification, and an explicitly reviewed least-privilege ACL plan. No seed, backfill, policy activation, decision creation, or runtime auto-migration.

**Prerequisites:** Approved Phase 15D-A design; read-only repository migration-head check; exact Phase 15B/15C/Approval/Audit FK targets present. EWP-01 produces database structure only and does not produce service contracts.

**Files:**
- Create after migration-head approval: `packages/database/migrations/0032_phase15d_multi_ai_role_model_routing.sql`
- Create: `packages/database/test/phase15d-routing-migration.test.ts`
- Modify: `packages/database/test/migrations.test.ts`
- Modify: `packages/database/test/database.test.ts`
- Modify only after ACL approval: `scripts/database-role-preflight.ts`, `scripts/database-role-apply-acl.ts`
- Test: `scripts/database-role-preflight.test.ts`, `scripts/database-role-apply-acl.test.ts`, `scripts/database-role-contract-postgres.test.ts`

**Interfaces:**
- Consumes: migration loader in `packages/database/src/migrations.ts`; Phase 15B tables; `work.requests`; Phase 15C classifications; existing Audit table.
- Produces: the exact tables and constraints in “Database Model,” candidate checksum, and read-only role/ACL verification manifest.

**Authority boundary:** Migration owner creates schema objects. A separately authorized policy/governance admin may append policy versions. Application runtime receives no DDL, ownership, GRANT OPTION, broad update/delete, or migration authority.

- [ ] **Step 1: Revalidate migration HEAD and write failing schema tests**

  Read the exact repository migration head. `0032` is a candidate only. If HEAD is not exactly `0031_phase15c_classification_domain_routing`, stop, recalculate the migration number and dependencies, update checksum expectations, and obtain a new Human migration review. Add tests named `creates_phase15d_routing_authority_without_seed_data`, `enforces_every_composite_fk_candidate_key`, `rejects_mismatched_stream_request_or_purpose`, `enforces_specialization_predecessor_key`, `enforces_stream_local_versioning`, `rejects_cross_stream_supersession`, `rejects_phase15d_history_mutation`, `rejects_development_native_selection`, and `preserves_phase15b_phase15c_authority`.

- [ ] **Step 2: Run the migration tests and confirm RED**

  Run: `npx.cmd tsx --test packages/database/test/phase15d-routing-migration.test.ts`

  Expected: FAIL because migration/table objects do not exist.

- [ ] **Step 3: Create the minimal forward-only migration**

  Implement the exact six-table model, FKs, checks, append-only triggers, advisory-lock policy-activation and stream-predecessor guards, indexes, `PUBLIC` revocation, and no effective rows. Use `ai.host_runtimes` as the physical Runtime Adapter/Host authority and `ai.model_host_bindings` to prove the selected tuple.

- [ ] **Step 4: Add explicit checksum and replay expectations**

  Pin migrations `0001`–`0031` unchanged and the exact new checksum. Require first apply `APPLIED=32`, replay `APPLIED=0/SKIPPED=32`, and no routing/policy/specialization rows after migration.

- [ ] **Step 5: Verify real PostgreSQL semantics**

  Run the focused migration tests and disposable PostgreSQL apply/replay. Query catalogs to prove every composite FK target has the exact PK/UNIQUE key. Assert mismatched request/purpose and wrong specialization predecessor fail, concurrent same-stream inserts serialize, separate-purpose streams coexist, invalid role/purpose/mode tuples fail, update/delete fail, and rollback leaves no partial stream/decision/candidate/Audit.

- [ ] **Step 6: Design and gate ACL changes before applying them**

  Extend existing fixed allowlists only after Human ACL approval. Prove runtime table ownership/DDL/GRANT/DELETE/TRUNCATE/UPDATE denial, `PUBLIC` absence, policy-admin separation, exact runtime inserts where required, and ACL replay idempotency.

- [ ] **Step 7: Verify EWP-01**

  Run: focused migration tests, `packages/database/test/migrations.test.ts`, `packages/database/test/database.test.ts`, database role tests, real PostgreSQL apply/replay, checksum scan, and `git diff --check`.

**Pass criteria:** All six tables and every invariant exist; historical checksums remain unchanged; no seed/backfill/effective authority; real PostgreSQL apply/replay and ACL denial pass.

**Rollback:** Before any shared environment, discard the unapproved migration. After an approved environment apply, use service feature disablement and retain additive tables; no destructive down migration or history rewrite. A separately reviewed forward recovery migration is required for schema defects.

**Human approval required:** migration-number/checksum review, real Staging migration execution, ownership/ACL application, commit, and push.

---

### EWP-02: Contracts, Streams, Decision Repository, and Candidate Evidence

**Scope:** Implement exact TypeScript contracts, EWP-02-owned external-authority adapters/composition bindings, and atomic persistence without candidate-selection business logic.

**Prerequisites:** EWP-01 schema contract approved and its exact generated column/FK names frozen; no service EWP may start against draft EWP-02 contracts.

**Files:**
- Create: `packages/database/src/routing-contracts.ts`
- Create: `packages/database/src/routing-authority-read-ports.ts`
- Create: `packages/database/src/routing-decision-repository.ts`
- Create: `packages/database/test/routing-authority-read-ports.test.ts`
- Create: `packages/database/test/routing-decision-repository.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**
- Produces:
  - `RoutingRoleClass`, `RoutingPurpose`, `RoutingMode`, `RoutingDecisionState`, `RoutingStalenessState`.
  - `RoutingDecisionOutputV1` with `contractVersion: "PHASE15D_ROUTING_OUTPUT_V1"`.
  - `AppendRoutingDecisionInput`, `RoutingCandidateSnapshotInput`, `RoutingAppendResult`.
  - `RoutingDecisionRepository` methods `findOrCreateStreamIdentity`, `findCurrent`, `findById`, `listHistory`, `listCandidates`, and `appendDecision`.
- Produces the four exact external read-port interfaces plus their concrete adapters and composition bindings: `ClassificationAuthorityReadPort`, `RegistryAuthorityReadPort`, `AidosAuthorityReadPort`, and `HumanApprovalAuthorityReadPort`. Adapters may call canonical external-authority implementation details internally, but routing services receive only port interfaces and never duplicate authority state.
- Consumes: `MigrationDatabase`, `PostgresAuditRecordRepository.recordInTransaction`, canonical Phase 15B/15C IDs.

**Authority boundary:** Repository enforces persistence integrity only; it cannot classify, activate policy, select candidates, execute, or broaden authority.

- [ ] **Step 1: Write failing contract and repository tests**

  Cover concurrent purpose streams, one stream per request/purpose, stream-local versions, cross-stream predecessor rejection, fallback confined to primary stream, immutable history, exact replay `REUSED`, conflicting replay failure, one candidate set, one success Audit, and distinct `ROUTING_REQUEST_NOT_FOUND`, `CLASSIFICATION_NOT_CURRENT`, `CLASSIFICATION_NOT_VALIDATED`, and `CLASSIFICATION_INVALID` mappings.

- [ ] **Step 2: Run focused tests and confirm RED**

  Run: `npx.cmd tsx --test packages/database/test/routing-decision-repository.test.ts`

- [ ] **Step 3: Implement frozen contracts and explicit DTO mappers**

  Define exact enums/fields from the approved design. Implement `toRoutingDecisionOutputV1(record, candidates)` and reject unknown database values rather than defaulting.

- [ ] **Step 4: Implement authority port contracts and boundary tests**

  Define the four interfaces and EWP-02-owned adapters exactly as listed above. Contract tests prove concrete repositories/runtimes remain behind adapters, adapters cannot append/mutate owning authorities, snapshot/freshness fields are mandatory, every allowed cache is bounded and non-authoritative, every revalidation bypasses cache, all AIDOS operations name `AIDOS_EXTERNAL_ORCHESTRATOR_INTEGRATION_CONTRACT_V1_1`, and unknown/stale/conflicting authority states fail closed.

- [ ] **Step 5: Implement atomic repository append**

  In one transaction: resolve exact request and stream, obtain stream advisory lock, resolve canonical prior result by idempotency key/fingerprint, validate immediate predecessor, insert decision, insert ordered candidate snapshots, and append Audit. Conflicting replay exits before an effective mutation.

- [ ] **Step 6: Implement stream-scoped reads**

  `findCurrent(requestId, purpose)` returns only the latest intact stream head. `listHistory` never merges purposes. `findById` verifies request/scope at the service boundary.

- [ ] **Step 7: Verify EWP-02**

  Run repository tests against PGlite where supported and disposable PostgreSQL for locks/concurrency/rollback; run typecheck and `git diff --check`.

**Pass criteria:** Concurrent streams coexist; same-stream appends serialize; fallback cannot touch review streams; exact replay has one decision and one Audit; history is immutable.

**Rollback:** Disable consumers and retain additive immutable records. No row deletion or version rewrite.

**Human approval required:** repository implementation review and commit authorization.

---

### EWP-03: Routing Policy and Specialization Services

**Scope:** Implement canonical append-only policy/specialization reads and governed administrative append interfaces; do not expose policy mutation through public API in this phase.

**Prerequisites:** EWP-01 policy/version/activation tables and EWP-02 frozen contracts/read-port types are complete.

**Files:**
- Create: `packages/database/src/routing-policy-repository.ts`
- Create: `packages/database/src/routing-policy-service.ts`
- Create: `packages/database/test/routing-policy-repository.test.ts`
- Create: `packages/database/test/routing-policy-service.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**
- Produces `RoutingPolicySnapshot`, `SpecializationSnapshot`, `RoutingPolicyRepository`, and `RoutingPolicyService.resolveActivePolicy(input): Promise<RoutingPolicySnapshot>`.
- `resolveSpecialization(policyVersionId, specializationRef, context): Promise<SpecializationSnapshot | null>`.
- Governed command interface `activatePolicyVersion(input: ActivateRoutingPolicyVersionInput): Promise<RoutingPolicyActivationResult>` exists only in separately composed steward administration, never in runtime routing/API composition.
- Consumes exact domain, purpose, role, scope, environment, risk/policy constraints, effective time, and capability references.

**Authority boundary:** Only `MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD` can append/activate governed policy state through a later separately authorized admin composition. Runtime routing is read-only against policy.

- [ ] **Step 1: Write failing policy lifecycle and selection tests**

  Test DRAFT denial, one effective ACTIVE selection, immutable historical ACTIVE intent interpreted as superseded only through activation events, RETIRED terminal behavior, zero match, overlapping match conflict, expiry, scope mismatch, and immutable version evidence.

- [ ] **Step 2: Write failing specialization tests**

  Test no free-form value, exact policy child binding, domain/purpose/context mismatch, stale version, capability reference validation, and inability to create a role/permission/authority.

- [ ] **Step 3: Run tests and confirm RED**

  Run both EWP-03 test files.

- [ ] **Step 4: Implement atomic steward activation**

  In one transaction validate the candidate version/steward/Evidence, lock the applicability fingerprint, re-read the expected activation head, append the new activation/current-selection and supersession events plus Audit, and commit. A competing or stale head fails `ROUTING_POLICY_ACTIVATION_CONFLICT`; no policy content row is updated.

- [ ] **Step 5: Implement repository and deterministic service selection**

  Select policy heads first, then require exactly one applicable ACTIVE policy. Resolve specialization only beneath that policy version. Return immutable snapshots/fingerprints for decision evidence.

- [ ] **Step 6: Verify EWP-03**

  Run focused repository/service tests, concurrent activation tests on real PostgreSQL, typecheck, and database constraint tests.

**Pass criteria:** Policy ownership/lifecycle is exact, ambiguous applicability fails closed, specialization only narrows, and decisions cannot mutate policy.

**Rollback:** Disable Phase 15D routing; retain policy history. Never reactivate an older policy implicitly.

**Human approval required:** policy schema/admin-boundary review; any policy activation or Staging policy data requires separate Human authorization.

---

### EWP-04: Phase 15B Registry Candidate Resolution

**Scope:** Resolve eligible Provider/Model/Host binding candidates solely from canonical Registry state and immutable routing policy.

**Prerequisites:** EWP-01 Registry FK targets and EWP-02 `RegistryAuthorityReadPort`/snapshot DTO are frozen; EWP-03 policy snapshot contract is complete.

**Files:**
- Create: `packages/database/src/candidate-resolution-service.ts`
- Create: `packages/database/test/candidate-resolution-service.test.ts`


**Interfaces:**
- Produces `CandidateResolutionService.resolve(input: CandidateResolutionInput): Promise<CandidateResolutionResult>` and consumes the EWP-02-owned `RegistryAuthorityReadPort` binding.
- Result contains `registrySnapshotRef`, ordered `eligibleCandidates`, excluded-candidate reason codes, and no selected execution binding.
- Consumes `RoutingPolicySnapshot`, optional `SpecializationSnapshot`, role/purpose/mode, required/preferred capability IDs, environment/security constraints, and `RegistryAuthorityReadPort` only. Dependency shape: `CandidateResolutionService -> RegistryAuthorityReadPort -> Phase 15B Registry adapter -> AiRegistryRepository/canonical Phase 15B source`.

**Authority boundary:** Reads Registry only through `RegistryAuthorityReadPort`. `AiRegistryRepository = ADAPTER_IMPLEMENTATION_DETAIL`; it must not be injected into `CandidateResolutionService`, and Phase 15B Registry remains authority. The service cannot update health/readiness, capability bindings, credentials, policy, or decisions.

- [ ] **Step 1: Write failing resolution tests**

  Use `RegistryAuthorityReadPort` doubles/fakes and prove `CandidateResolutionService` cannot be constructed with a direct `AiRegistryRepository` dependency. Cover provider unavailable, model disabled, host unavailable, binding disabled, capability absent/unsupported, capability `STALE`/`RECONCILING`, fresh bounded cache reads, stale-cache rejection, canonical revalidation bypassing cache and recomputing the snapshot, policy denial, preferred capability ranking, deterministic tie-break, no hard-coded vendor priority, and legacy capability fallback rejection.

- [ ] **Step 2: Run focused test and confirm RED**

  Run: `npx.cmd tsx --test packages/database/test/candidate-resolution-service.test.ts`

- [ ] **Step 3: Consume the exact Registry authority port**

  Inject only `RegistryAuthorityReadPort`. The EWP-02-owned Phase 15B adapter may internally use `AiRegistryRepository` to read `ai.model_providers`, `ai.models`, `ai.host_runtimes`, `ai.model_host_bindings`, `ai.capabilities`, `ai.model_capability_bindings`, and `ai.role_compatibilities` and build the canonical `registry-snapshot:sha256:...` identity in one repeatable-read transaction. EWP-04 never receives the concrete repository and never copies Registry rows into a competing store.

- [ ] **Step 4: Implement deterministic filter/rank**

  Apply required capabilities before preferred ranking; apply role compatibility and purpose flags; apply policy/security/environment; then stable policy-defined ordering. If tied without an approved tie-break, return `NONDETERMINISTIC_CANDIDATE_TIE` rather than selecting arbitrarily.

- [ ] **Step 5: Verify post-decision staleness**

  Change a test Registry version/readiness/capability binding after selection and assert the bound decision becomes non-consumable in EWP-05 validation.

- [ ] **Step 6: Verify EWP-04**

  Run candidate tests, affected Registry tests, typecheck, and secret scan.

**Pass criteria:** Candidate set is deterministic, fully evidenced, Registry-authoritative, vendor-neutral, and fail-closed on stale/reconciling/disabled state.

**Rollback:** Disable Phase 15D; no Registry mutation exists to roll back.

**Human approval required:** candidate-service/port-boundary review and commit authorization; any adapter-internal `AiRegistryRepository` surface expansion remains an EWP-02 review item.

---

### EWP-05: Validation and Routing Decision Services

**Scope:** Orchestrate Phase 15C validation, policy/specialization resolution, Registry candidates, stream-local decision append, fallback, output mapping, and Development/AIDOS outcomes without execution.

**Prerequisites:** EWP-02 contracts/repository and all four read-port adapters/bindings; EWP-03 policy service; EWP-04 candidate service.

**Files:**
- Create: `packages/database/src/routing-validation-service.ts`
- Create: `packages/database/src/routing-decision-service.ts`
- Create: `packages/database/src/routing-read-service.ts`
- Create: `packages/database/test/routing-validation-service.test.ts`
- Create: `packages/database/test/routing-decision-service.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**
- `RoutingValidationService.validate(input: CreateRoutingDecisionInput): Promise<ValidatedRoutingContext>`.
- `RoutingDecisionService.createDecision(input): Promise<RoutingAppendResult>`.
- `RoutingDecisionService.createFallback(input): Promise<RoutingAppendResult>` restricted to primary stream.
- `RoutingDecisionService.validateForHandoff(decisionId, expectedContext): Promise<RoutingDecisionOutputV1>`.
- `RoutingReadService` exposes redacted current/history/by-ID/candidate views.
- EWP-05 consumes the EWP-02-owned `ClassificationAuthorityReadPort`, `HumanApprovalAuthorityReadPort`, and `AidosAuthorityReadPort` bindings. Dependency shape: `RoutingDecisionService -> ClassificationAuthorityReadPort -> Phase 15C Classification adapter -> RequestClassificationRuntime/canonical Phase 15C source`. `RequestClassificationRuntime = ADAPTER_IMPLEMENTATION_DETAIL`; it is never injected into a Phase 15D routing service. The AIDOS adapter is read-only and persists no AIDOS authority.

**Authority boundary:** Services append routing metadata only. They cannot create Task/Run/Job/ToolCall, bind Runner, invoke provider/model, write Memory, approve, verify, release, or deploy.

- [ ] **Step 1: Write failing input/current-head tests**

  Use port doubles/fakes rather than concrete external-authority repositories/runtimes. Prove `RoutingDecisionService` and `RoutingValidationService` cannot be composed with a direct `RequestClassificationRuntime` dependency. Assert missing request, wrong tenant/project/scope/environment, non-head classification, non-VALIDATED classification, stale/unresolved Phase 15C policy, fresh bounded classification cache use where permitted, stale-cache rejection, cache-bypassing current-head revalidation, refusal to fall back to an older cached validated classification, required Approval cache insufficiency, expired/revoked Approval denial, Reviewer/QA non-substitution, and broken classification handoff all fail before policy/Registry/decision/Audit mutation.

- [ ] **Step 2: Write failing stream/mode tests**

  Assert primary/review/adversarial coexist, mode compatibility is exact, fallback appends primary only, reviewer replacement stays in its review stream/mode, and no request-global current result exists.

- [ ] **Step 3: Write failing Development boundary tests**

  Assert available+onboarded+eligible -> `READY_TO_DELEGATE`, unavailable -> `AIDOS_UNAVAILABLE`, available+not-onboarded -> `WAITING_AIDOS_ONBOARDING`, ineligible -> `AIDOS_DELEGATION_INELIGIBLE`, and stale/unknown/conflicting observations fail closed. Any selected MAOS resource tuple for Development fails `DEVELOPMENT_NATIVE_EXECUTION_PROHIBITED`; `CODE_EXECUTION` cannot override.

- [ ] **Step 4: Implement validation and orchestration**

  Call `ClassificationAuthorityReadPort` for the Phase 15C handoff, then EWP-03 policy/specialization, EWP-04 candidate resolution, and EWP-02 atomic append. The EWP-02-owned Classification adapter may internally invoke `RequestClassificationRuntime.validatePhase15dClassificationHandoff`; EWP-05 domain services never call that concrete runtime directly. Do not duplicate their checks.

- [ ] **Step 5: Implement current-consumption revalidation**

  Re-read the exact stream head and use the four explicit authority ports to revalidate the Phase 15C head, Registry snapshot/resources, Human approval, and AIDOS state; re-read policy version, specialization version, and request context through their owning MAOS repositories/services. Any drift returns bounded stale/denied output and never falls back to history.

- [ ] **Step 6: Prove output has no execution authority**

  Assert `RoutingDecisionOutputV1` has no Run/Job/ToolCall/Runner/credential/execution token and cannot be passed directly to existing executor runtimes without a future Phase 15E/15F adapter.

- [ ] **Step 7: Verify EWP-05**

  Run EWP-05 tests, EWP-02–04 affected tests, typecheck, boundary check, and repository scan.

**Pass criteria:** Exact input produces one immutable decision/output; all stale/invalid states fail closed; Development never selects MAOS-native execution; no execution API is reachable.

**Rollback:** Disable Phase 15D route composition. Preserve immutable decisions and mark them non-consumable by feature/policy state; never delete or downgrade.

**Human approval required:** service-boundary review and commit authorization.

---

### EWP-06: Human Override Service and Durable Audit/Evidence

**Scope:** Implement Human override as an atomic stream-local append using existing durable Audit/idempotency infrastructure. This EWP exposes no API route.

**Prerequisites:** EWP-02 repository/atomic append; EWP-03 policy revalidation; EWP-04 Registry snapshot revalidation; EWP-05 validation/decision services and Approval/AIDOS ports.

**Files:**
- Modify: `packages/database/src/routing-decision-service.ts`
- Modify: `packages/database/src/routing-decision-repository.ts`
- Test: `packages/database/test/routing-decision-service.test.ts`, `packages/database/test/routing-decision-repository.test.ts`

**Interfaces:**
- `HumanRoutingOverrideRequest` includes request/stream/prior decision, proposed eligible resource or reevaluation intent, actor, reason, Evidence refs, idempotency key, correlation/causation, and exact context.
- `RoutingDecisionService.applyHumanOverride(input): Promise<RoutingAppendResult>`.
- Reuses `PostgresAuditRecordRepository` and the four authority read ports; no new Audit, Approval, or idempotency store.

**Authority boundary:** Human authority is above AI selection but not immutable security, privacy, policy, Registry, Approval, or AIDOS boundaries. Database authority is runtime INSERT/SELECT on decision records only; no policy or external-authority mutation.

- [ ] **Step 1: Write failing Human authority tests**

  Test non-Human actor, missing/wrong override permission, wrong stream/prior head, cross-stream attempt, stale policy, disabled resource, missing/stale/revoked Approval, missing Evidence/reason, and Development native selection.

- [ ] **Step 2: Write replay/concurrency/atomicity tests**

  Exact replay returns the same decision/audit ref with one decision and one Audit. Same key/different canonical intent fails before a second append. Concurrent overrides serialize on the stream head. Injected Audit failure rolls back decision/candidates.

- [ ] **Step 3: Run focused tests and confirm RED**

- [ ] **Step 4: Implement minimal override flow**

  Resolve exact current stream head, authenticate/authorize Human through the caller boundary, revalidate Phase 15C/policy/specialization/Registry/Approval/AIDOS state, then use the EWP-02 append transaction. Never patch the prior decision.

- [ ] **Step 5: Add bounded Audit events**

  Use `ROUTING.DECISION_CREATED`, `ROUTING.DECISION_REUSED`, `ROUTING.OVERRIDE_CREATED`, `ROUTING.OVERRIDE_REJECTED`, `ROUTING.DECISION_STALE`, and `ROUTING.AIDOS_DELEGATION_STATE`. Audit contains safe actor/target/result/reason/reference metadata only.

- [ ] **Step 6: Verify EWP-06**

  Run override, repository, Audit-integrity, redaction, concurrency, and transaction rollback tests; real PostgreSQL is required for lock/rollback behavior.

**Pass criteria:** Human override is stream-local, append-only, policy-revalidated, idempotent, atomic with Audit, and unable to weaken safety boundaries.

**Rollback:** Keep the API route absent/disabled and retain immutable history.

**Human approval required:** Human authority/action contract review and commit authorization.

---

### EWP-07: Governed API Contracts and Composition

**Scope:** Add versioned authenticated/authorized API routes, including the already-implemented EWP-06 override service, and disabled-by-default composition. Policy administration remains out of scope.

**Prerequisites:** EWP-02 contracts/repositories, EWP-03 policy reads, EWP-04 candidate resolution, EWP-05 decision/read services, and EWP-06 Human override service are complete.

**Files:**
- Create: `apps/api/src/routing-routes.ts`
- Create: `apps/api/src/routing-server-composition.ts`
- Create: `apps/api/test/routing-routes.test.ts`
- Create: `apps/api/test/routing-server-composition.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `packages/config/src/index.ts`
- Test: `packages/config/test/config.test.ts`

**Interfaces and endpoints:**

| Method/path | AuthZ | Input/output | Idempotency/Audit | Primary failures |
| --- | --- | --- | --- | --- |
| `GET /api/v1/routing/requests/:requestId/current?routingPurpose=...` | exact `ROUTING_DECISION:READ`, project/scope/environment | safe `RoutingDecisionOutputV1` | no mutation | 400, 401, 403, 404, 409 stale |
| `GET /api/v1/routing/requests/:requestId/history?routingPurpose=...` | same | immutable stream history | none | 400/401/403/404 |
| `GET /api/v1/routing/decisions/:routingDecisionId` | same | one redacted decision | none | 401/403/404 |
| `GET /api/v1/routing/decisions/:routingDecisionId/candidates` | same plus candidate-diagnostic permission if policy requires | redacted evidence | none | 401/403/404 |
| `POST /api/v1/routing/requests/:requestId/decisions` | exact `ROUTING_DECISION:CREATE` | create request -> output | required idempotency/Evidence/correlation/causation; one Audit | bounded 400/401/403/404/409/422/503 |
| `POST /api/v1/routing/requests/:requestId/overrides` | Human-only `ROUTING_DECISION:OVERRIDE` | EWP-06 request -> output | required idempotency/reason/Evidence/exact prior decision; one Audit | bounded 400/401/403/404/409/422/503 |
| `GET /api/v1/routing/policies/:policyId/versions/:version` | exact `ROUTING_POLICY:READ` | safe immutable policy snapshot | read-only | 401/403/404 |

- [ ] **Step 1: Write failing route/authentication/authorization tests**

  Cover all endpoints, missing authentication, wrong project/scope/environment, wrong action, malformed identifiers, redaction, and canonical failure-code envelopes.

- [ ] **Step 2: Write failing mutation-adapter tests**

  Cover missing idempotency/Evidence/correlation, exact replay `REUSED`, conflicting replay `409`, stale dependency `409/503`, override service delegation, and no execution side effect.

- [ ] **Step 3: Run API tests and confirm RED**

- [ ] **Step 4: Implement routes and configuration**

  Follow classification route/composition conventions. `PHASE15D_ROUTING_ENABLED` defaults false. Enabled composition fails closed when any repository, authority read port, Audit, or auth dependency is missing.

- [ ] **Step 5: Register routes without startup mutation**

  Modify `apps/api/src/server.ts` only to compose/register. Startup must not migrate, seed/activate policy, apply ACL, create decisions, or contact AIDOS.

- [ ] **Step 6: Verify EWP-07**

  Run focused API/config tests, all API tests, API typecheck/build, boundary check, secret scan, and `git diff --check`; real PostgreSQL is not required beyond already-covered repository transactions.

**Pass criteria:** Routes use canonical envelopes, exact authorization, bounded errors, and redaction; disabled mode preserves old API behavior; no execution/startup mutation exists.

**Rollback:** Disable `PHASE15D_ROUTING_ENABLED` and deploy prior service code. Additive database history remains.

**Human approval required:** route/action vocabulary review, deployment configuration, commit, push, and any Staging deployment.

---

### EWP-08: Read-Only Portal and Observability Projection

**Scope:** Add safe diagnostic UI and structured metrics/log projections only. No model-selection or execution controls.

**Prerequisites:** EWP-07 read APIs and canonical redacted DTOs are complete; the Web receives no database or authority-port access.

**Files:**
- Create: `apps/web/src/routing.ts`
- Create: `apps/web/test/routing.test.ts`
- Modify: `apps/web/src/server.ts`
- Test affected: Web server/auth/session tests

**Interfaces:**
- Consumes only the EWP-06 read APIs through existing authenticated BFF/API boundaries.
- Produces `RoutingPortalView` and `renderRoutingPortal(view)` with current stream heads, history, candidate explanation, policy/Registry snapshot status, staleness, override history, and Development delegation state.

**Authority boundary:** Read-only. No policy mutation, override control unless separately approved later, model picker, execution, Tool, Runner, AIDOS action, or Approval control.

- [ ] **Step 1: Write failing projection/redaction tests**

  Assert primary/review/adversarial streams display separately; fallback is not review; Review is not Approval/QA; AIDOS state is visible; credentials/raw context/prompts/connection data are absent.

- [ ] **Step 2: Run focused Web test and confirm RED**

- [ ] **Step 3: Implement safe projection and renderer**

  Follow `apps/web/src/classification.ts` conventions. Render bounded reason codes and reference metadata; do not trust upstream labels as HTML.

- [ ] **Step 4: Add observability contract**

  Record only bounded route latency/result/failure-code counts and correlation IDs. No raw candidate metadata, context, Evidence payload, prompt, or secret.

- [ ] **Step 5: Verify EWP-08**

  Run focused Web tests, all Web tests, typecheck/build, serverless runtime import test, accessibility/security assertions, and secret scan.

**Pass criteria:** Authorized users see safe diagnostics; unauthorized users are denied; no operational control or secret is exposed; serverless Web imports no database package.

**Rollback:** Remove/disable Portal route; API and database history remain unchanged.

**Human approval required:** UI surface review, Preview deployment, commit, and push.

---

### EWP-09: Local Integration, Compatibility, and Staging Package

**Scope:** Verify complete local behavior, compatibility, restart reconstruction, ACL posture, packaging, and produce a Staging authorization package. Do not mutate Staging.

**Prerequisites:** EWP-01 through EWP-08 individually PASS with their Human review gates recorded; exact candidate manifest contains no unrelated files.

**Files/areas:** All Phase 15D files, affected Phase 15B/15C tests, `scripts/staging-packaging.ts` only if a new explicit manifest is required, and redacted evidence documentation only when authorized.

**Interfaces:** Consumes EWP-01–08 outputs; produces verification evidence and exact Staging candidate manifest.

**Compatibility/rollback strategy:**

- `PHASE15D_ROUTING_ENABLED=false` preserves old API/Web behavior.
- Migration is additive, forward-only, and has no backfill; existing Phase 15B/15C reads remain unchanged.
- Mixed deployment: new database + old service is safe because old code ignores new tables; new service + old database fails composition/readiness closed and registers no Phase 15D mutation route.
- Partial policy deployment produces `ROUTING_POLICY_MISSING`, never default policy or vendor fallback.
- Stale decisions remain immutable and non-consumable; no downgrade to earlier decisions.
- Service rollback disables routes/consumer code and retains evidence; schema rollback is a separately approved forward recovery migration.

- [ ] **Step 1: Run focused Phase 15D suites**

  Include migration, policy, specialization, stream/versioning, candidate, validation, decision, override, API, and Web tests.

- [ ] **Step 2: Run affected Phase 15B/15C suites**

  Run AI Registry migration/repository, request classification migration/repository/runtime, work request, Audit, config, auth/session, API composition, and Web server tests.

- [ ] **Step 3: Run real PostgreSQL verification**

  Apply/replay through candidate HEAD, verify checksum/history, concurrency, restart/reconnect reconstruction, the complete operation-level ACL matrix, runtime UPDATE/DELETE/DDL/ownership/GRANT denial, exact allowed reads/inserts, steward-only policy append, migration-only DDL, redacted-view-only projection, and `PUBLIC` absence.

- [ ] **Step 4: Run repository-wide gates once**

  Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run format:check`, `npm.cmd run check:boundaries`, `npm.cmd run scan:repository`, API build, Web build, `npm.cmd test`, and `git diff --check`.

- [ ] **Step 5: Produce bounded Staging package**

  Record exact candidate SHA/status, migration checksum, historical checksums, required non-secret variables/feature flag, role/ACL preflight plan, rollback posture, API/Web targets, Production exclusion, and Human stop conditions.

**Pass criteria:** All local/real-PostgreSQL/static/build/full-regression gates pass; candidate contains only Phase 15D dependencies; Staging remains unchanged.

**Rollback:** No environment mutation occurred. Discard candidate changes or disable the feature flag.

**Human approval required:** candidate commit/push, migration/ACL, Staging variables, API deploy, Web deploy.

---

### EWP-10: Separately Authorized Staging Verification and Final Gate

**Scope:** Execute only after a new Human authorization naming exact candidate, Railway/Vercel targets, database roles, migration checksum, ACL operations, and rollback plan.

**Files/areas:** No source changes expected. Redacted evidence and phase context/handoff updates only after successful final review.

**Prerequisites:** EWP-09 PASS; exact target identity; non-superuser migration/runtime roles; separately authorized ephemeral ACL administration if still required; Production excluded; recovery plan approved.

- [ ] **Step 1: Run read-only target/source/role preflight**

  Stop on any project/environment/service/branch/SHA/role/owner/checksum/privilege mismatch.

- [ ] **Step 2: Apply the one authorized migration and replay**

  Require exact checksum, expected new head, replay `APPLIED=0/SKIPPED=32`, unchanged historical checksums, and zero effective policy/decision rows unless separately authorized data exists.

- [ ] **Step 3: Apply separately approved fixed ACL operations**

  Require preflight, atomic apply, idempotent replay, runtime reconnect, least privilege, `PUBLIC` absence, and privileged connection cleanup.

- [ ] **Step 4: Deploy API with feature disabled, then explicitly gate enablement**

  Verify health/readiness/startup-no-mutation first. Enabling routing requires separately approved active policy/specialization data and exact Registry/classification prerequisites; otherwise fail closed.

- [ ] **Step 5: Verify live routing without execution**

  Verify read routes, unauthenticated denial, authenticated scoped reads, concurrent stream creation under authorized test data, fallback isolation, stale handling, Development AIDOS outcomes, exact replay, Audit, redaction, restart reconstruction, and absence of Run/ToolCall/Runner/deployment effects.

- [ ] **Step 6: Deploy and verify Web Preview only**

  Verify read-only surfaces, stream distinctions, no controls, Staging API binding, redaction, and Production isolation.

- [ ] **Step 7: Run final Phase 15D gate**

  Reconcile source, DB, policy, Registry, API, Web, Audit/Evidence, security, restart, and Production-exclusion evidence. Do not begin Phase 15E/15F implementation.

**Pass criteria:** Staging proves durable non-executing routing, Development-only AIDOS delegation, exact least privilege, restart safety, and complete Production isolation.

**Rollback:** Disable Phase 15D feature/routes, restore prior API/Web deployment, retain additive schema and immutable evidence, and use only a separately approved forward recovery migration for database defects.

**Human approval required:** every mutation/deploy step, evidence closeout, and any final status update.

---

## EWP Contract Matrix

This matrix is normative together with each EWP section. It makes prerequisites, database authority, external ports, and verification scope explicit without duplicating the detailed steps/files/rollback/pass/approval text above.

| EWP | Prerequisites | Canonical input -> output | DB authority / external ports | Focused and affected verification | Real PostgreSQL |
| --- | --- | --- | --- | --- | --- |
| 01 | approved design; HEAD read | existing FK authorities -> six additive tables and ACL manifest | migration owner only; no runtime port | migration/constraint/role tests; existing migration suite | required: apply/replay/FK/triggers/locks/ACL denial |
| 02 | EWP-01 schema names frozen | schema + Phase 15A/B/C identifiers -> contracts, four authority ports/adapters/bindings, atomic repository | runtime bounded SELECT/INSERT; Audit repository | contract/repository/adapter-boundary/Audit tests; database exports | required: stream locks, replay, rollback |
| 03 | EWP-01 + EWP-02 | steward policy intent -> immutable policy/specialization snapshots and activation events | steward INSERT/SELECT; `RoutingPolicyRepository` | lifecycle/activation/specialization tests; migration constraints | required: concurrent activation atomicity |
| 04 | EWP-01 + EWP-02 + EWP-03 snapshot types | policy + Registry authority -> deterministic candidate snapshot | read-only `RegistryAuthorityReadPort` | candidate and Registry repository tests | required for repeatable-read snapshot identity |
| 05 | EWP-02–04 | current classification/policy/Registry/Approval/AIDOS -> decision output | runtime decision INSERT/SELECT; all four authority ports | validation/decision/read/output tests; Phase 15C/Approval/AIDOS adapters | required for integrated append/revalidation |
| 06 | EWP-02–05 | exact Human override intent -> new stream-local version/Audit | same decision append; no policy/external mutation | override/replay/concurrency/Audit tests | required for locks and rollback |
| 07 | EWP-02–06 | authenticated API request -> bounded DTO/error | no new DB right; consumes services/ports | route/config/auth/API tests | not beyond repository integration |
| 08 | EWP-07 | authenticated read DTO -> redacted Portal/metrics | no DB credential or mutation | Web projection/auth/redaction/serverless tests | no |
| 09 | EWP-01–08 PASS | exact local candidate -> verification/evidence/Staging package | read-only verification plus disposable DB | focused, affected, builds, full regression, scans | required full apply/replay/reconnect/ACL matrix |
| 10 | EWP-09 + separate target/mutation approval | approved candidate/targets -> Staging evidence/final gate | only separately approved migration/ACL/runtime roles | live API/Web/auth/restart/Production-isolation gates | required on exact Staging target |

Every EWP has bounded files/areas, authority boundary, pass criteria, rollback/recovery, and Human approval text in its detailed section. No EWP consumes an artifact produced by a later EWP.

## EWP Dependency Sequence

`EWP-01 -> EWP-02 -> EWP-03 -> EWP-04 -> EWP-05 -> EWP-06 -> EWP-07 -> EWP-08 -> EWP-09 -> EWP-10`

EWP-01 is the database foundation. EWP-02 is the sole owner of TypeScript repository/service/external-port contracts, concrete external-authority adapters, and composition bindings. EWP-03 requires EWP-02; EWP-04 requires EWP-02 and EWP-03 policy snapshot types. EWP-05 is the integration gate and consumes EWP-02–04 without duplicating them. EWP-06 adds the override service before EWP-07 exposes any override route. EWP-08 remains read-only. EWP-10 is prohibited until all prior EWPs pass and a separate Staging authorization is recorded.

An executable plan-consistency test parses this dependency list and the EWP prerequisite metadata, rejects missing/later/cyclic dependencies, and pins the order `01,02,03,04,05,06,07,08,09,10`. It specifically asserts that override route exposure depends on EWP-06 and that EWP-03/EWP-04 depend on EWP-02 contracts.

## Cross-Phase Consistency Gate

- Phase 15A: `ROLE != MODEL`, `MODEL != PROVIDER`, `MODEL != RUNNER`, and routing never creates execution authority.
- Phase 15B: Registry tables and normalized capabilities remain the only Provider/Model/Runtime Adapter/capability authority; Phase 15D stores references/evidence only.
- Phase 15C: only the latest validated, non-stale, policy-resolved classification is consumable; Phase 15D never classifies or mutates classification.
- Phase 15D-A: `ROUTING != EXECUTION`, `REVIEW != APPROVAL`, `FALLBACK != REVIEW`, `SPECIALIZATION != ROLE`, `POLICY != DECISION`, and `DECISION STREAM != REQUEST` remain structural contracts.
- AIDOS v1.1: `DEVELOPMENT != MAOS EXECUTION`; the canonical source is `AIDOS_EXTERNAL_ORCHESTRATOR_INTEGRATION_CONTRACT_V1_1` and MAOS reads its three projections through `AidosAuthorityReadPort` without manufacturing, persisting, or executing AIDOS authority.

EWP-09 must run explicit architecture assertions for all invariants above. If the named AIDOS v1.1 projections are unavailable or semantically incompatible, implementation fails closed and stops for Human architecture review; it may not substitute a MAOS-owned source.

## Human Stop Conditions

Stop before continuing if:

- migration HEAD is not exactly the revalidated predecessor;
- a historical checksum changes;
- implementation needs a second Registry, classification, Audit, Evidence, or idempotency store;
- policy ownership cannot remain `MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD`;
- a required FK/reference would create cross-authority write ownership;
- runtime needs DDL, ownership, GRANT OPTION, broad update/delete/truncate, or migration authority;
- routing requires a hard-coded vendor/model priority;
- a route or DTO creates execution authority;
- Development requires a MAOS-native fallback;
- review would become Verification, QA PASS, Approval, or Release authorization;
- Staging or Production access becomes necessary before its explicit gate;
- any secret would enter source, logs, Evidence, Audit, UI, or a report;
- the implementation requires changing the approved Phase 15D-A architecture.

## Plan Acceptance Gates

- Database model defines exact owner, PK, FKs, immutability, versioning, current selection, retention, and indexes for every Phase 15D entity.
- Policy and specialization use one canonical authority and no free-form authority-bearing metadata.
- Streams, versions, fallback isolation, current selection, and concurrent purposes are explicit.
- Services have single responsibilities, typed interfaces, dependencies, mutation rights, and fail-closed conditions.
- Registry integration consumes Phase 15B normalized authority without copying it.
- Output/API/Phase 15E/15F DTO mappings are versioned and non-executing.
- Human override is append-only, stream-local, policy-revalidated, idempotent, atomic, and auditable.
- Migration/ACL/Staging/Production actions remain separately authorized.
- Compatibility never falls back to older classifications, decisions, policies, legacy capabilities, or unsafe Development execution.
