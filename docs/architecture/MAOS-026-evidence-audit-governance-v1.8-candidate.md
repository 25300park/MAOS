# MAOS-026 — Evidence and Audit Governance Architecture

## MAOS Architecture v1.8 — Approved / Frozen

| Item                     | Value                     |
| ------------------------ | ------------------------- |
| Document ID              | MAOS-026                  |
| Version                  | 1.8 candidate             |
| Status                   | APPROVED / FROZEN         |
| Change Class             | C2 Minor Architecture     |
| Current Frozen Baseline  | MAOS Architecture v1.7    |
| Change Request           | MAOS-CR-011 — APPROVED_C2 |
| Implementation authority | NONE                      |
| Production authority     | NONE                      |

## 1. Objective

Define storage-neutral governance contracts that correlate the complete Phase 14 Human-command lifecycle through canonical Evidence and Audit infrastructure without creating a new Evidence store, Audit database, query datastore, or event ledger.

The governed provenance chain is:

`Human Message → CommandEnvelope → PlannerRoutingEnvelope → Plan → ReviewerRoutingEnvelope → Review → HumanApprovalRequest/Decision → ExecutorRoutingEnvelope → Task/Run/Tool/Runner → Result/Artifact/Evidence → VerificationRoutingEnvelope/VerificationHandoffEnvelope → Verification → Closure/Rework/WAITING_HUMAN`

## 2. Architectural decision

MAOS-026 extends MAOS-013 through governance contracts only:

- `EvidenceRecord` describes proof of a result or observation.
- `EvidenceReference` immutably addresses governed Evidence.
- `AuditRecord` describes who or what performed an action, when, under which authority, policy, scope, risk, and environment.
- MAOS-013 IDs, event naming, correlation, redaction, integrity, storage, and query boundaries remain canonical.
- Existing `audit.audit_records`, `audit.observability_events`, Artifact/Evidence persistence, and registered repositories remain the implementation targets; MAOS-026 defines no table or engine.

Explicit separations:

- `Evidence ≠ Audit`.
- `Evidence ≠ Authority`.
- `Audit ≠ Authority`.
- `Visibility ≠ Mutation Authority`.
- Evidence or Audit presence never grants Approval, execution, Verification, QA, or Production authority.

Rejected alternatives:

1. Direct modification of frozen MAOS-013.
2. Phase-local-only documentation for cross-phase provenance semantics.
3. A new Evidence database, Audit database, query datastore, or duplicate event ledger.
4. Evidence/Audit as business authority or portal visibility as mutation authority.

## 3. EvidenceRecord contract

`EvidenceRecord` is a non-authoritative, storage-neutral metadata contract over canonical Evidence and Artifact persistence. It contains:

- `evidence_id`, Evidence type, schema/contract version, and lifecycle state;
- exact governed source type/reference and source version;
- exact target/result/artifact references, versions, and hashes where applicable;
- immutable `governance_scope_ref` resolving the existing canonical Company scope and, where applicable, Team scope, Project scope, and environment without creating new scope semantics;
- immutable `governing_policy_ref` and `governing_policy_version` identifying the exact policy under which the Evidence was created or accepted;
- content location/reference and canonical digest, size/media metadata where applicable, never embedded secret material;
- producer actor/service/Agent/Tool/Runner reference and source-system provenance;
- `generated_at` for when a producer created the content and `observed_at` for when MAOS or an authorized observer witnessed it;
- collection/ingestion time where distinct from generation and observation;
- correlation, causation, command, approval, task, run, tool-call, Runner, result, Artifact, and Verification references where applicable;
- verification state and exact Verification Artifact/reference without implying authority;
- data classification, redaction state/policy, access-policy reference, residency constraints, and retention class/policy;
- integrity algorithm/version and content/manifest hash where applicable; and
- provenance, supersession, archival, and Audit references.

Evidence content and its source, target/result/Artifact version, applicable content/manifest hash, governance scope, governing policy/version, and provenance bindings are immutable for an Evidence version. Any material change, including a scope or policy/version change, creates a new canonical Evidence record/version with explicit derivation and supersession links; it never rewrites the prior record.

## 4. EvidenceReference contract

`EvidenceReference` is an immutable, non-authoritative reference containing:

- canonical `evidence_id` and version;
- exact Evidence type, source/target reference, and applicable Artifact/result version;
- content or manifest hash and integrity algorithm/version where applicable;
- immutable `governance_scope_ref` resolving the exact existing canonical Company scope and, where applicable, Team scope, Project scope, and environment;
- immutable `governing_policy_ref` and `governing_policy_version` identifying the exact policy applicable when the reference was issued;
- generated-at/observed-at facts needed to evaluate freshness;
- source provenance and derivation reference;
- classification, permitted projection/redaction profile, retention class, and access-policy reference; and
- correlation/causation references sufficient to reconnect the canonical chain.

Resolution must verify identity, version, integrity, access, classification, retention state, expected target binding, exact governance scope, and exact governing policy/version. An EvidenceReference cannot be reused across a different scope, policy, or policy version; a material difference requires a new governed reference linked to the prior reference according to canonical derivation/supersession rules. An EvidenceReference is not an Approval, Tool Permission, execution grant, Verification result, QA decision, or Production authorization.

Once issued, the source binding, Artifact/result version binding, applicable content/hash binding, governance scope binding, governing policy/version binding, and provenance binding are immutable. No component may mutate these fields in place or reinterpret them for a new target, scope, policy, or policy version.

## 5. AuditRecord contract

`AuditRecord` extends the canonical MAOS-013 append-only audit contract and existing audit persistence. It contains:

- canonical audit record ID and schema/contract version;
- canonical action/event name and result;
- actor identity/type and authenticated authority source;
- exact target type/ID/version/hash where applicable;
- Company/Team/Project/System and Task/Run scope;
- risk and environment;
- policy/permission/Approval references and versions applicable to the action;
- existing request, correlation, trace/span, workflow, task, run, tool-call, Runner, approval, command, routing, Artifact/result, and Verification references where applicable;
- evidence references and safe redacted metadata;
- event occurrence time, recording time when distinct, and trusted time-source metadata where required;
- idempotency/deduplication reference; and
- previous-record/integrity-chain hash and record hash using the canonical implementation.

Audit is proof of an action and its authority context. It cannot grant or repair permission, Approval, execution, Verification, QA, or Production authority.

## 6. Correlation and causation

The existing MAOS-013 `request_id`, `correlation_id`, `trace_id`, `span_id`, `project_id`, `task_id`, `workflow_instance_id`, `run_id`, `tool_call_id`, `approval_id`, `artifact_id`, `system_id`, and `actor_id` remain canonical.

Phase 14 contracts add references only when their owning approved architecture defines them, including CommandEnvelope, routing envelope, Plan, Review, Human Approval, result, Verification, rework, and closure references. MAOS-026 does not rename or recreate those identifiers.

- Correlation groups records participating in one governed business/command chain.
- Causation identifies the exact preceding decision, event, or version that caused a record.
- Parent/child trace relationships represent technical call flow and do not replace governance causation.
- Every transition preserves the originating Human Message reference through CommandEnvelope provenance without treating raw chat as authority.
- Fan-out and quorum decisions record all parent causes; rework/retry records the original cause plus the governed replacement/retry cause.

## 7. Provenance mapping

| Stage                    | Required provenance                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Human command            | Human actor, Message, CommandEnvelope, classification/clarification, scope, policy    |
| Planner/Reviewer routing | Candidate evaluation, policy/version, selected role, independence, fallback outcome   |
| Plan/Review              | Exact input envelope, role/Run, Artifact/version, findings, dissent, Evidence         |
| Human Approval           | Request/Decision version, actor, authority, exact target, Evidence manifest, validity |
| Executor routing         | Plan/Review/Approval bindings, eligibility, Tool Permission and Runner constraints    |
| Task/Run/Tool/Runner     | Task/Run versions, dispatch, Tool authorization/denial, Runner binding, environment   |
| Result/Artifact/Evidence | Exact producing Run/ToolCall, versions/hashes, generated/observed times, provenance   |
| Verification             | Routing/handoff, exact Run/result/Artifact/Evidence set, policy, outcome, dissent     |
| Stop/Pause/Kill          | Human/system actor, authority, target Run/ToolCall, reason, request/outcome           |
| Rework/retry             | Original failed/insufficient record, governed request, new Task/Run, no silent rerun  |
| WAITING_HUMAN            | Triggering deficiency, unresolved authority/evidence/policy, required Human action    |
| Closure                  | Final outcome, Verification/Approval state, unresolved items, Evidence/Audit refs     |

## 8. Audit event taxonomy and mapping

Canonical event/action names must first resolve through the existing MAOS-013/observability registry. Known existing names such as `APPROVAL.APPROVE`, `TOOL.EXECUTE`, `RUN.FAIL`, and domain-specific registered actions are reused exactly. A Phase 14 semantic event is added only when registry review proves no equivalent exists.

The following are semantic coverage keys, not permission grants or automatic aliases:

| Semantic coverage             | Preferred canonical form when no existing equivalent exists      |
| ----------------------------- | ---------------------------------------------------------------- |
| Command intake/classification | `COMMAND.RECEIVED`, `COMMAND.CLASSIFIED`                         |
| Clarification required        | `COMMAND.CLARIFICATION_REQUIRED`                                 |
| Planner/Reviewer routing      | `PLANNER.ROUTED`, `REVIEWER.ROUTED`                              |
| Plan/Review completion        | `PLAN.CREATED`, `REVIEW.COMPLETED`                               |
| Approval lifecycle            | Existing MAOS-009/025 actions; add only missing lifecycle action |
| Executor routing              | `EXECUTOR.ROUTED`                                                |
| Task/Run lifecycle            | Existing Task/Run actions; add only missing lifecycle action     |
| Tool authorization/denial     | Existing Tool Gateway actions; no duplicate of `TOOL.EXECUTE`    |
| Runner binding                | `RUNNER.BOUND` only if no registered equivalent exists           |
| Verifier routing/outcome      | `VERIFIER.ROUTED`; existing Verification action when present     |
| Rework                        | `REWORK.REQUESTED`                                               |
| Waiting for Human             | `WAITING_HUMAN.ENTERED`                                          |
| Stop/Kill                     | Existing execution-control actions; add only missing outcome     |
| Command closure               | `COMMAND.COMPLETED`                                              |

The event registry owns the final name, version, payload schema, producer, retention, classification, and deprecated-name mapping. One semantic action maps to one current canonical name. Aliases may resolve historical records for queries but must not generate duplicate events.

## 9. Evidence integrity

- Immutable identity/version and source/target binding are mandatory where Evidence supports governance.
- Content-addressable Evidence uses the canonical approved digest algorithm and algorithm/version metadata.
- Structured Evidence hashes a canonical serialization or closed manifest, never a platform-dependent or display-only representation.
- External Evidence stores an immutable provider/source version plus digest when available; unverifiable external content is marked accordingly and cannot be promoted to verified Evidence.
- Derivation records parent Evidence references, transformation identity/version, actor, timestamps, and output hash.
- Generated-at and observed-at remain distinct; freshness policy uses the applicable timestamp and trusted source.
- Hash equality proves byte/manifest integrity, not truth, sufficiency, Verification, Approval, or authority.

## 10. Audit append-only and integrity

- Canonical Audit records are append-only; correction, revocation, supersession, reconciliation, and archival actions append new linked records.
- Existing `previous_hash` and `record_hash` chaining remains canonical where implemented.
- Hash-chain scope, partitioning, checkpoints, signing, and archival verification follow registered policy; MAOS-026 does not introduce a second chain.
- Missing links, invalid hashes, unexpected sequence gaps, or unavailable integrity metadata fail query integrity state closed and create a governed alert/reconciliation path.
- Observability events and Audit records remain distinct even when emitted for the same action; a correlation link does not merge their semantics.

## 11. Idempotency and duplicate-event handling

- Producers use scoped idempotency keys bound to event/action, source, target/version, correlation, causation, and policy version.
- Identical replay returns the canonical existing reference or records an implementation-defined duplicate disposition without a second authority-changing effect.
- Reusing a key with different bound inputs is a conflict and is audited.
- At-least-once delivery may create duplicate observations only when canonical ingestion policy cannot coalesce them; duplicates are linked and excluded from authority/outcome counts.
- Retry/replay never fabricates Evidence, rewrites Audit, renews Approval, restarts execution, or changes closure state.

## 12. Classification, redaction, and secret exclusion

Every Evidence/Audit record carries or resolves canonical classification and access policy. Collection, persistence, projection, export, search, and archival apply least-privilege redaction.

The following are prohibited from Evidence/Audit payloads, metadata, hashes intended for user comparison, logs, portal projections, and mobile projections unless an existing separately approved policy explicitly requires a non-reversible reference:

- bearer tokens and authorization headers;
- Session secrets/identifiers beyond approved opaque references;
- cookie values and CSRF values;
- credentials, passwords, API keys, private keys, and recovery material;
- raw secret material or reversible encodings; and
- unrestricted private content outside its approved classified store.

Redaction records the policy/version and fields/categories removed without persisting the removed secret. Hashes of low-entropy secrets are also prohibited because they enable guessing.

## 13. Retention, archival, and legal hold

- Existing canonical retention classes and policies govern Evidence and Audit independently by classification, jurisdiction, purpose, authority, and record type.
- Retention, archival, restore, disposal, legal hold, and exception actions are policy-versioned and audited.
- Append-only does not mean indefinite retention; policy-authorized archival or cryptographic disposal preserves required tombstone/provenance without violating holds.
- Linked records may have different retention classes. Queries expose unavailable/archived/disposed status rather than silently breaking provenance.
- MAOS-026 creates no independent retention scheduler, archive, or storage tier.

## 14. Query and search contract

Authorized queries may resolve records by existing canonical references, including:

- request, correlation, causation, trace/span;
- actor, project/scope, environment, action/event, result, risk, and time range;
- exact governance scope reference and governing policy reference/version where the existing canonical query boundary supports those dimensions;
- command, routing, Plan/Review, Approval;
- Task/Run/ToolCall/Runner;
- result/Artifact/Evidence; and
- Verification, rework, WAITING_HUMAN, stop/kill, and closure references.

Queries are read-only, scope/permission/classification filtered, redacted, paginated, retention-aware, and independently queryable from the producing process. Scope and policy/version filters resolve existing canonical references and do not create new scope semantics or a parallel index. Search results expose integrity and availability state. Query access is itself audited where policy requires. No new query datastore is authorized.

## 15. Portal and mobile visibility

Company, Team, and Project portals expose read-only governed projections over canonical Evidence/Audit queries:

- command-to-closure timeline;
- exact Plan, Review, Approval, execution, and Verification references;
- critical Evidence summaries, integrity/freshness/classification state, and safe links;
- execution state and stop/pause/kill request/outcome; and
- unresolved findings, rework, WAITING_HUMAN, retention, and availability state.

Visibility never grants mutation, Approval, execution, Verification, QA, Evidence administration, Audit administration, or Production authority. Actions shown beside records use their own canonical authorization flows.

Mobile uses the same canonical query/projection contract with a bounded presentation sufficient for pending Approval Evidence, execution state, critical Audit events, stop/kill outcome, and unresolved Human action. Authority-critical facts cannot be omitted. Full forensic search, export, retention administration, and integrity-chain investigation may remain desktop-focused.

## 16. Compatibility

- **MAOS-025:** Approval Evidence manifests and decisions retain exact Evidence/Audit provenance without gaining authority from records.
- **MAOS-024:** Verification binds exact Evidence sets and produces governed Verification provenance.
- **MAOS-023:** Executor routing and dispatch decisions remain separate from Audit and execution authority.
- **MAOS-022:** Planner/Reviewer routing candidate evaluation and independence remain auditable decision records.
- **MAOS-021:** Human Message and CommandEnvelope remain intent/provenance, never authority.
- **MAOS-020:** portal visibility is registry-driven, read-only, and non-authoritative.
- **MAOS-018:** Loop/Task/Run control, stop/kill, rework, and WAITING_HUMAN lifecycles remain authoritative.
- **MAOS-019:** Tool Gateway and Runner remain execution/authorization boundaries and emit redacted Evidence/Audit.
- **MAOS-013:** observability correlation, canonical Audit infrastructure, IDs, redaction, integrity, storage, and query boundaries remain authoritative.

## 17. Decisions

1. D14G-001 — Define storage-neutral EvidenceRecord, EvidenceReference, and AuditRecord governance contracts over MAOS-013.
2. D14G-002 — Preserve Evidence/Audit/authority separation and non-authoritative visibility.
3. D14G-003 — Reuse canonical IDs, taxonomy, integrity, repositories, and query/storage boundaries before adding semantics.
4. D14G-004 — Preserve end-to-end correlation/causation and immutable versioned provenance across Phase 14.
5. D14G-005 — Require append-only Audit, immutable Evidence versions, scoped idempotency, and duplicate-effect prevention.
6. D14G-006 — Apply canonical classification, redaction, retention, archival, and secret exclusion to every projection.
7. D14G-007 — Provide read-only portal/mobile projections without mutation or business authority.

## 18. Risks and assumptions

### Risks

1. R14G-001 — Duplicate event names fragment queries. Control: registry-first semantic mapping with one canonical name.
2. R14G-002 — Evidence presence is mistaken for authority or truth. Control: explicit non-authoritative contract and independent Verification/Approval.
3. R14G-003 — Correlation gaps break provenance. Control: required canonical context and causation validation at each transition.
4. R14G-004 — Secrets enter Evidence/Audit or projections. Control: collection-time exclusion, redaction policy, and restricted references.
5. R14G-005 — Retry duplicates events or effects. Control: scoped idempotency, conflict detection, and duplicate disposition.
6. R14G-006 — Retention removal silently breaks chains. Control: retention-aware tombstone/archive status and audited disposal.
7. R14G-007 — Mobile omits authority-critical facts. Control: mandatory bounded payload or disablement of the related action.
8. R14G-008 — Audit visibility becomes mutation authority. Control: separate read permission and canonical action authorization.

### Assumptions

1. A14G-001 — Existing MAOS-013 and durable audit repositories can persist/query the required references without a parallel store.
2. A14G-002 — Phase 14 record owners expose stable canonical IDs/versions suitable for immutable references.
3. A14G-003 — Existing classification, redaction, retention, and access policies can be resolved by versioned policy reference.
4. A14G-004 — Existing portal/API boundaries can project scoped read models without granting mutation authority.

## 19. Prohibited architecture and non-goals

- no direct modification of MAOS-013 or any frozen v1.7 architecture;
- no Phase-local-only substitute for cross-phase canonical semantics;
- no new Evidence database, Audit database, query datastore, event ledger, retention subsystem, or parallel integrity chain;
- no duplicate event emitted under old and new names;
- no Evidence/Audit as business authority and no mutation authority from visibility;
- no secret persistence, reversible secret fingerprints, or unauthorized private content;
- no runtime, schema/migration, dependency, provider, credential, production implementation, or deployment change; and
- no Phase 14H work before explicit Human C2 approval.

## 20. Traceability and Phase 14H gate

| Requirement                    | Canonical owner    | MAOS-026 contribution                                      |
| ------------------------------ | ------------------ | ---------------------------------------------------------- |
| Observability/Audit foundation | MAOS-013           | Storage-neutral Phase 14 governance contracts              |
| Approval provenance            | MAOS-009, MAOS-025 | Exact request/decision/Evidence/validity linkage           |
| Verification provenance        | MAOS-024           | Exact routing/handoff/result/Evidence linkage              |
| Executor provenance            | MAOS-023           | Eligibility, dispatch, Task/Run/Tool/Runner linkage        |
| Planner/Reviewer provenance    | MAOS-022           | Candidate, policy, selection, independence, Artifact links |
| Command provenance             | MAOS-021           | Message-to-CommandEnvelope correlation and causation       |
| Portal visibility              | MAOS-020           | Read-only Company/Team/Project projections                 |
| Task/Run/control provenance    | MAOS-005, MAOS-018 | Execution, stop/kill, retry/rework, WAITING_HUMAN links    |
| Tool/Runner provenance         | MAOS-008, MAOS-019 | Authorization/denial, binding, execution, redaction links  |

Human C2 decision `APPROVE_MAOS_CR_011_C2` adopts this document as the approved/frozen MAOS Architecture v1.8 baseline. Phase 14H is `READY` for separately authorized planning. This approval grants no runtime implementation, migration, provider, production implementation, or production deployment authority.
