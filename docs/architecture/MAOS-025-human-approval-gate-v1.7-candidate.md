# MAOS-025 — Human Approval Gate Architecture

## MAOS Architecture v1.7 — Approved / Frozen

| Item                     | Value                     |
| ------------------------ | ------------------------- |
| Document ID              | MAOS-025                  |
| Version                  | 1.7 candidate             |
| Status                   | APPROVED / FROZEN         |
| Change Class             | C2 Minor Architecture     |
| Current Frozen Baseline  | MAOS Architecture v1.6    |
| Change Request           | MAOS-CR-010 — APPROVED_C2 |
| Implementation authority | NONE                      |
| Production authority     | NONE                      |

## 1. Objective

Define a canonical Human Approval Gate that presents exact governed work to the authorized Human, records an explicit durable decision, and fails closed when authority or any bound input is stale, missing, revoked, or mismatched.

The governed flow is:

`CommandEnvelope → Plan → Review → Approval Requirement → Human Approval Gate → Executor Routing → Task/Run/Tool/Runner execution → Verification → Evidence/Audit`

Human Approval is explicit authority for the exact approved action. It is never inferred and never executes work.

- `Review ≠ Approval`.
- `Verification ≠ Approval`.
- `QA PASS ≠ Production Approval`.
- `Approval ≠ execution`.

## 2. Architectural decision

Extend the existing MAOS-009 Approval architecture with durable `HumanApprovalRequest` and append-only `HumanApprovalDecision` contracts.

- Existing MAOS-009 Approval statuses and validity states remain canonical.
- `CLARIFICATION_REQUIRED` is a non-authoritative request disposition while Approval remains `PENDING`; it is not a new Approval status.
- Supersession is an immutable relationship to a replacement request/decision. The superseded Approval remains historical and becomes unusable through existing `STALE`, `VERSION_MISMATCH`, `TARGET_MISMATCH`, or `POLICY_INVALID` validity semantics.
- Approval binds exact actor, action, operation, target/version/hash, scope, risk, environment, evidence manifest, policy/version, and validity window.
- Approval is revalidated at dispatch and immediately before execution.
- Production Approval is an explicit production-bound authority decision and cannot be derived from staging or non-production Approval.

Rejected alternatives:

1. **Editing MAOS-009 in place** — rejected because it is frozen architecture.
2. **Approval as only a Workflow state** — rejected because authority must be durable, independently queryable, revocable, and target-bound.
3. **A parallel Approval engine** — rejected because existing Approval lifecycle and authority resolution remain canonical.

## 3. HumanApprovalRequest contract

A `HumanApprovalRequest` is a durable, versioned, non-executing request containing:

- request ID, version, status, request disposition, created-at time, expiry, and freshness requirements;
- requesting actor/service identity and authoritative Human approver/authority-owner reference;
- exact action, requested operation, and execution classification;
- exact target type, target identity, target version/hash, and target state fingerprint;
- exact Company, Team, Project, System/domain, and Task/Run scope;
- exact risk class and environment;
- exact Plan, Review, Verification, Task, Run, Artifact, Release, or other governed source references where applicable;
- closed Evidence-presentation manifest and evidence references with hashes/classification;
- Approval policy ID/version, required authority, separation-of-duties, step-up/MFA, and multi-step requirements;
- validity window, expiration, revocation, consumption, and supersession constraints;
- idempotency key and request fingerprint;
- correlation ID, causation references, provenance, Evidence, and Audit links.

`HumanApprovalRequest ≠ Task`, `HumanApprovalRequest ≠ Run`, and `HumanApprovalRequest ≠ Workflow`. The request grants no authority and cannot dispatch work.

## 4. HumanApprovalDecision contract

A `HumanApprovalDecision` is an immutable, append-only, independently queryable Human authority record containing:

- decision ID, request ID/version, decision sequence, and decided-at time;
- authenticated Human actor, authority source, Session/authentication assurance, and step-up/MFA evidence reference where required;
- decision kind: approve, reject, request clarification, revoke, or cancel as permitted by policy;
- resulting canonical Approval status and validity;
- exact action, requested operation, target/version/hash, scope, risk, environment, Evidence manifest, and policy/version fingerprints accepted by the Human;
- bounded Human reason or safe reason-code reference;
- expiration/freshness, consumption, revocation, and supersession references;
- correlation, causation, provenance, Evidence, and Audit references.

Only an explicit `approve` decision by currently authorized Human authority may produce canonical `APPROVED`. Silence, timeout, chat acknowledgement, Review PASS, Verification PASS, QA PASS, execution readiness, prior Approval, or UI navigation never creates Approval.

`HumanApprovalDecision ≠ execution`, `HumanApprovalDecision ≠ verification`, and `HumanApprovalDecision ≠ QA status`.

## 5. Existing status and validity reuse

MAOS-009 remains authoritative:

- Approval status: `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`, `REVOKED`, `CANCELLED`.
- Approval validity: `VALID`, `STALE`, `TARGET_MISMATCH`, `VERSION_MISMATCH`, `AUTHORITY_INVALID`, `POLICY_INVALID`, `CONSUMED`.

This architecture does not duplicate those states.

- `CLARIFICATION_REQUIRED` is a request disposition. Approval status remains `PENDING`, execution remains blocked, and a materially changed response creates a new request version.
- `SUPERSEDED` is an immutable relationship (`superseded_by_request_ref` or `superseded_by_decision_ref`), not a second Approval status. The earlier Approval becomes non-usable through existing validity rules.
- `APPROVED`, `REJECTED`, `EXPIRED`, and `REVOKED` use existing canonical status semantics.

## 6. Exact authority binding

Every Approval binds immutably to:

- authenticated Human actor and authority owner;
- exact action and requested operation;
- exact target type and identity;
- exact target version/hash and material target-state fingerprint;
- exact Company, Team, Project, System/domain, and Task/Run scope;
- exact risk class;
- exact environment;
- exact Evidence-presentation manifest and references;
- exact Approval policy/version and required permission/authority;
- exact validity, expiration, freshness, step-up/MFA, consumption, and multi-step constraints; and
- exact correlation, causation, and provenance chain.

Any material difference requires a new or superseding request and fresh Human decision. Approval scope may be narrower than the request but never broader.

## 7. Evidence presentation contract

The Human must receive enough governed information for an informed decision:

- plain-language action, requested operation, intended outcome, and consequences;
- target identity, current version/hash, material change summary, and affected scope;
- risk class, environment, reversibility, blast radius, and expected side effects;
- Plan, Review, Verification, QA, test, security, dependency, migration, deployment, and rollback evidence references applicable to policy;
- unresolved findings, dissent, missing Evidence, uncertainty, and policy exceptions;
- requested validity duration, consumption semantics, multi-step position, and required step-up/MFA;
- requester, proposed Executor/Runner context where known, and separation-of-duties facts;
- safe correlation/provenance and immutable Evidence manifest hash.

Evidence display must distinguish fact, assertion, Review, Verification, QA, recommendation, and Human authority. Hidden, truncated, stale, inaccessible, materially changed, or policy-insufficient Evidence blocks Approval or requires clarification.

## 8. Approval UI payload

Desktop and mobile consume the same canonical payload:

- request and decision IDs/versions;
- Human actor and current authority context;
- exact action, operation, target/version/hash, scope, risk, and environment;
- Evidence manifest and readable governed references;
- Approval policy/version, expiry/freshness, consumption, revocation, supersession, step-up/MFA, and multi-step requirements;
- allowed decisions and consequences;
- unresolved conditions and safe reason codes;
- correlation, provenance, and Audit references.

The UI cannot synthesize authority, hide material risk, default to Approval, infer consent from dismissal/silence, or submit a decision for a stale payload. Final confirmation must repeat the exact action, target, environment, and material consequences.

## 9. Rejection and return for clarification

- `REJECTED` is an explicit terminal denial for the exact request version. It grants no negative authority beyond that request and cannot be converted to Approval by retry.
- `CLARIFICATION_REQUIRED` keeps the request non-executable and `PENDING`; it records questions, missing Evidence, ambiguity, and permitted responder actions.
- A clarification that changes action, target, target version/hash, scope, risk, environment, Evidence manifest, policy, or authority creates a new request version and invalidates prior decision eligibility.
- Rejection and clarification are durable, audited, and independently queryable.

## 10. Expiry, freshness, revocation, and cancellation

- Expiration is policy-bound and evaluated against current time; expired Approval has status `EXPIRED` or invalid current validity and cannot execute.
- Freshness covers target, Evidence, authority owner, actor assurance/MFA, policy, environment, risk, and registry state.
- Revocation is an append-only Human or policy-authorized transition to `REVOKED`; it is irreversible for that Approval record.
- Cancellation terminates a pending request without granting or denying authority for a future request.
- Revocation or expiration after dispatch but before execution blocks execution. If execution already began, existing stop/pause/kill and incident controls apply.
- Re-approval creates a new request/decision; it never reactivates the revoked, expired, rejected, cancelled, or superseded record.

## 11. Supersession

Supersession links an older request/decision to its exact replacement while preserving the full historical record.

- Only a governed replacement with explicit reason, correlation, and policy may supersede.
- Supersession never copies Approval authority automatically.
- The prior record becomes non-usable under existing validity semantics.
- Concurrent or replayed supersession uses optimistic version checks and idempotency.
- Evidence and Audit retain the complete chain.

## 12. Dispatch revalidation

Before creating or releasing executable Task/Run work, the dispatch owner revalidates:

- request/decision status, validity, version, hash, expiry, freshness, revocation, consumption, and supersession;
- authenticated Human actor and current authority-owner validity;
- exact action, requested operation, target/version/hash, scope, risk, and environment;
- Evidence-manifest hash and material Evidence freshness;
- Approval policy/version, permission, separation-of-duties, step-up/MFA, and multi-step completion; and
- correlation, idempotency, and exact ExecutorRoutingEnvelope/Task/Run linkage.

Any missing, stale, revoked, consumed, expired, unavailable, or mismatched condition fails closed to `WAITING_HUMAN`, rejection, expiration, or governed replacement according to policy.

## 13. Immediate pre-execution revalidation

Immediately before ToolCall/Runner execution, the execution owner and Tool Gateway revalidate current Approval status and validity, target/version/hash, action, scope, risk, environment, Evidence materiality, policy/version, authority owner, step-up/MFA, multi-step completion, revocation, expiry, consumption, and supersession.

Approval does not itself execute work. The Task/Run, Tool Permission, Tool Gateway, Runner, repository/Workroot, environment, and other canonical execution gates remain independently required.

## 14. Fail-closed changes

Approval becomes unusable when:

- target identity or material target state changed;
- target version/hash changed;
- action or requested operation exceeds the approved action;
- Company/Team/Project/System/Task/Run scope changed;
- risk changed or increased;
- environment changed;
- the Evidence manifest changed materially or required Evidence became stale/unavailable;
- Approval expired, was revoked, consumed, cancelled, rejected, or superseded;
- Approval policy/version or permission requirement changed;
- the authority owner changed, expired, was revoked, or cannot be verified;
- required step-up/MFA or multi-step Approval is missing or stale; or
- dispatch/pre-execution linkage differs from the approved target.

No component may silently repair, widen, or reinterpret Approval.

## 15. Production Approval boundary

- Production Approval is explicit, production-environment-bound, action-bound, target/version/hash-bound, time-bound, revocable, and separately auditable.
- Staging, preview, local, test, prior release, prior target, chat, Review, Verification, or QA authority cannot authorize Production.
- Production requires separately authorized production scope, current Human authority, exact policy, required step-up/MFA, and all policy-defined approval steps.
- `QA PASS`, Verification `PASS`, successful staging execution, or release readiness is supporting Evidence only.
- Production Approval does not execute deployment; existing delivery, Task/Run, Tool Gateway, provider, and production controls remain mandatory.

## 16. High-risk, destructive, and multi-step Approval

R4, destructive, irreversible, credential/security-control, external filing/payment, broad data mutation, or production actions require policy-defined exact Human Approval.

- Step-up/MFA is mandatory where existing policy requires it.
- Multi-step Approval records an ordered or policy-defined set of distinct approval requirements, each with exact actor/role, target, version/hash, scope, risk, environment, validity, and Evidence binding.
- Separation-of-duties may require different Humans or authority roles; one decision cannot satisfy multiple steps unless policy explicitly permits it.
- Missing, rejected, stale, expired, revoked, consumed, or mismatched step blocks the whole approval requirement.
- Later steps cannot silently alter earlier approved inputs; a material change invalidates affected steps and requires fresh decisions.
- Emergency paths remain separately governed and do not imply retroactive Approval.

## 17. WAITING_HUMAN behavior

Work resolves to `WAITING_HUMAN` when Human authority or an informed decision cannot safely proceed, including:

- Approval is required but absent or pending;
- clarification or additional Evidence is required;
- authority owner is unavailable, invalid, or cannot be resolved;
- target, version/hash, scope, risk, environment, Evidence, or policy changed;
- Approval is stale, expired, revoked, consumed, cancelled, rejected, or superseded;
- step-up/MFA or a required multi-step decision is missing;
- separation-of-duties cannot be satisfied;
- conflicting Approval records or policy ambiguity exist; or
- production authority is missing.

`WAITING_HUMAN` is non-executing. Resume requires a current canonical request/decision and full dispatch/pre-execution revalidation.

## 18. Durability, audit, and provenance

HumanApprovalRequest, HumanApprovalDecision, validity transitions, revocation, rejection, clarification, expiration, consumption, supersession, dispatch validation, and pre-execution validation are durable, append-only where applicable, restart-safe, independently queryable, and correlated.

Evidence/Audit records:

- authenticated Human actor and authority source;
- requester and affected scope/environment;
- exact action, operation, target/version/hash, risk, Evidence-manifest hash, and policy/version;
- decision/status/validity transition and safe reason code;
- step-up/MFA evidence reference without secret material;
- multi-step and separation-of-duties results;
- dispatch and pre-execution revalidation outcomes;
- consumption, rejection, expiry, revocation, cancellation, supersession, and clarification links;
- correlation, causation, provenance, timestamps, and idempotency references.

Secrets, credentials, Session values, MFA secrets, unrestricted private content, and unredacted sensitive Evidence are excluded.

## 19. Retry, replay, and idempotency

- Request creation, decision recording, clarification, rejection, revocation, supersession, consumption, and validation use separate scoped idempotency keys.
- Identical replay returns the same canonical request/decision and transition references.
- Reusing a key with different actor, action, target/version/hash, scope, risk, environment, Evidence manifest, policy, expiry, or authority inputs is a conflict.
- Concurrent decisions use optimistic version checks; only policy-valid transitions commit.
- Retry never infers Approval, extends expiry, restores revoked authority, bypasses clarification, duplicates multi-step decisions, or executes work.

## 20. Mobile and desktop contract

Desktop and mobile use the identical request, decision, binding, status, validity, Evidence, Audit, step-up/MFA, and multi-step contracts.

Mobile may use a reduced layout but must present the exact action, target/version, scope, risk, environment, material consequences, Evidence summary/references, unresolved findings, policy, expiry, and required confirmation. If informed presentation or required authentication is unavailable, Approval is disabled and the request remains `WAITING_HUMAN` for a capable surface.

## 21. Compatibility

- **MAOS-024:** Verification outcomes and Evidence may support Approval but never create it.
- **MAOS-023:** Executor routing consumes exact current Approval references and revalidates them without owning Approval.
- **MAOS-022:** Review and routing outcomes remain separate from Approval.
- **MAOS-021:** chat and CommandEnvelope provide intent/provenance, never Approval by acknowledgement.
- **MAOS-020:** portal/mobile presentation provides visibility and decision entry without implicit authority.
- **MAOS-018:** Task/Run/LoopRun waiting, dispatch, control, and Evidence lifecycles remain authoritative.
- **MAOS-019:** Tool Gateway/Runner execution and immediate authority revalidation remain mandatory.
- **MAOS-009:** existing Approval status, validity, authority resolution, exact target, separation, delegation, runtime revalidation, chat confirmation, and R4 semantics remain canonical.

## 22. Decisions

1. D14F-001 — Extend MAOS-009 with durable HumanApprovalRequest and append-only HumanApprovalDecision records.
2. D14F-002 — Bind Approval to exact actor, action, operation, target/version/hash, scope, risk, environment, Evidence manifest, policy, and validity.
3. D14F-003 — Reuse existing Approval statuses/validity and model clarification/supersession without duplicate Approval states.
4. D14F-004 — Revalidate Approval at dispatch and immediately before execution.
5. D14F-005 — Keep Review, Verification, QA, Approval, execution, and Production Approval semantically distinct.
6. D14F-006 — Require policy-defined step-up/MFA, separation, and multi-step decisions for high-risk actions.
7. D14F-007 — Use one canonical approval contract across desktop and mobile with no reduced authority checks.

## 23. Risks and assumptions

### Risks

1. R14F-001 — UI acknowledgement or silence could be mistaken for Approval. Control: explicit authenticated decision only.
2. R14F-002 — Stale target or Evidence could execute. Control: exact binding and two-stage revalidation.
3. R14F-003 — Clarification or supersession could duplicate lifecycle states. Control: request disposition/linkage plus existing validity semantics.
4. R14F-004 — Approval could be mistaken for execution. Control: independent Task/Run/Tool/Runner gates.
5. R14F-005 — Staging Approval could leak into Production. Control: exact immutable environment and production authority binding.
6. R14F-006 — Mobile presentation could omit material risk. Control: mandatory canonical payload and disablement when insufficient.
7. R14F-007 — Multi-step decisions could collapse separation of duties. Control: explicit step identities, roles, order, and distinctness policy.
8. R14F-008 — Retry could duplicate or revive authority. Control: scoped idempotency, optimistic concurrency, and irreversible transitions.

### Assumptions

1. A14F-001 — Existing Identity/Session/Permission contracts can prove current Human actor, authority owner, and step-up/MFA evidence.
2. A14F-002 — Existing durable Approval persistence can support immutable versions, append-only decisions, and independent queries without a parallel engine.
3. A14F-003 — Existing Task/Run/Tool Gateway consumers can revalidate exact Approval bindings at dispatch and pre-execution.
4. A14F-004 — Existing Evidence/Audit contracts can persist presentation manifests, decisions, transitions, validation outcomes, and provenance.

## 24. Prohibited architecture and non-goals

- no Approval inferred from silence, timeout, chat acknowledgement, UI navigation, Review, Verification, QA, prior Approval, or execution readiness;
- no AI Agent approving a Human-required action;
- no Approval executing work or bypassing Task/Run, Tool Permission, Tool Gateway, Runner, environment, or provider controls;
- no stale, cross-target, cross-version, cross-scope, cross-risk, cross-environment, or cross-policy Approval reuse;
- no staging, preview, local, or test Approval authorizing Production;
- no silent extension, reactivation, repair, widening, or transfer of Approval;
- no duplicate Approval, Workflow, Task, Run, Evidence, Audit, Identity, or Session engine;
- no runtime implementation, migration, dependency, provider, credential, or production change; and
- no modification of frozen MAOS v1.6 without approved C2 governance.

## 25. Traceability and Phase 14G gate

| Requirement                        | Canonical owner    | MAOS-025 contribution                                    |
| ---------------------------------- | ------------------ | -------------------------------------------------------- |
| Verification/Evidence input        | MAOS-024           | Supporting evidence without implied authority            |
| Executor dispatch                  | MAOS-023           | Exact Approval linkage and repeated validation           |
| Planner/Reviewer separation        | MAOS-022           | Review remains non-authoritative                         |
| Command/chat boundary              | MAOS-021           | No inferred Approval from messages                       |
| Portal/mobile presentation         | MAOS-020           | Informed decision surface without implicit authority     |
| Task/Run/control lifecycle         | MAOS-005, MAOS-018 | Waiting, dispatch, and execution remain canonical        |
| Tool/Runner execution              | MAOS-019           | Pre-execution revalidation and independent gates         |
| Approval status/validity/authority | MAOS-009           | Extended durable request/decision binding                |
| Evidence/Audit                     | MAOS-013           | Presentation, decision, transition, and validation proof |

Human C2 decision `APPROVE_MAOS_CR_010_C2` adopts this document as the approved/frozen MAOS Architecture v1.7 baseline. Phase 14G is `READY` for separately authorized planning. This approval grants no runtime implementation, migration, provider, production implementation, or production deployment authority.
