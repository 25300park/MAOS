# MAOS-021 — Human Messenger and Governed Command Contract

## MAOS Architecture v1.3 Candidate

| Item                     | Value                     |
| ------------------------ | ------------------------- |
| Document ID              | MAOS-021                  |
| Version                  | 1.3                       |
| Status                   | APPROVED / FROZEN         |
| Change Class             | C2 Minor Architecture     |
| Current Frozen Baseline  | MAOS Architecture v1.2    |
| Change Request           | MAOS-CR-006 — APPROVED_C2 |
| Freeze Record            | MAOS-FRZ-004              |
| Implementation authority | NONE                      |
| Production authority     | NONE                      |

## 1. Objective

Define one canonical Human Messenger and Command contract for desktop and mobile. Human language is intent input. It is never execution authority, Approval, a business source of truth, or a substitute for canonical Task, Workflow, Run, Job, Tool, Evidence, or Audit objects.

The governed path is:

`Human Message → CommandEnvelope → Classification / Clarification → Plan → Review → Approval → existing Task / Workflow / Run execution`

Every actionable outcome preserves:

`Identity → Scope → Permission → Risk → Approval → Execution → Evidence → Audit`

## 2. Architectural decision

Introduce `CommandEnvelope` as a pre-Task, immutable-versioned intent and provenance boundary. It may produce or reference canonical governed objects, but it is not itself executable work.

- Messenger captures communication and renders projections.
- Command interpretation resolves intent, target, scope, classification, and risk without granting authority.
- Planner creates a Plan artifact and proposed governed work.
- Reviewer reviews the Plan and governed artifacts, not raw text as authority.
- Approval remains exclusively owned by the existing Approval architecture.
- Executor receives only canonical, authorized execution inputs and never interprets raw Messenger text.
- Existing Task, Workflow, Run, Job, Tool Gateway, MAOS-018, and MAOS-019 lifecycles remain authoritative after dispatch.

Rejected alternatives:

1. Direct message-to-execution because it turns chat into authority and bypasses classification, scope, risk, and Approval.
2. Direct message-to-Task for every message because ambiguous conversation is not necessarily governed work.
3. A parallel command execution engine because it duplicates Task, Workflow, Run, and Approval semantics.

## 3. Human Message boundary

A `HumanMessage` is a communication record containing a message reference, authenticated Human actor reference, channel, received time, content classification, client request reference, optional reply/context references, and safe provenance metadata.

- It records what was communicated, not what is true in a business domain.
- It grants no scope, permission, Approval, execution right, or production authority.
- Content is untrusted input until classified and validated.
- Raw content is not forwarded to an Executor as an execution instruction.
- Sensitive content follows existing classification, retention, redaction, and access policy.
- Chat history is not a business source of truth and does not replace Evidence or Audit.

## 4. CommandEnvelope contract

A `CommandEnvelope` is a canonical, versioned pre-Task object with:

- `command_id`, version, lifecycle state, created/updated times, and expiry when applicable;
- `source_message_ref` and optional prior-command/clarification references;
- authenticated `human_actor_ref` and identity assurance reference;
- Company, Team, Project, System, and environment scope references where resolved;
- normalized intent and requested outcome;
- command classification: read/observe, analyze/plan, governed write/action, control, or prohibited/unsupported;
- risk classification and policy reference using existing MAOS risk semantics;
- provenance: source channel, received time, interpreter/version, and content hash/reference;
- correlation ID, causation reference, and trace context;
- idempotency key and request fingerprint;
- clarification state and unresolved-field list;
- proposed or linked Plan, Review, Approval, Task, Workflow, Run, Job, ToolCall, Evidence, and Audit references; and
- rejection, denial, cancellation, failure, or expiry reason codes without sensitive payloads.

The envelope stores the minimum governed interpretation and references. Domain payloads remain in their authoritative systems or canonical governed artifacts.

## 5. Pre-Task boundary

`CommandEnvelope` is not a Task, Workflow, Approval, Run, Job, Tool invocation, Goal, or MAOS-018 Trigger. It does not own their state machines or persistence semantics.

- Classification and clarification may complete without creating work.
- Read-only requests may resolve to an authorized query and response without creating a Task when existing contracts allow it.
- Actionable requests create canonical objects only after required fields, scope, authority, risk, and policies are resolved.
- Dispatch records exact output references and versions. Thereafter, canonical Task/Workflow/Run state is authoritative and Messenger only projects it.

## 6. Command lifecycle

The pre-Task lifecycle is:

`RECEIVED → INTERPRETING → CLASSIFIED → PLANNING → REVIEW`

Conditional states:

- `WAITING_HUMAN`: clarification or explicit Human input is required;
- `WAITING_APPROVAL`: a linked canonical Approval is pending;
- `READY`: classification, Plan, Review, authority, and required Approval are valid;
- `DISPATCHED`: canonical Task, Workflow, Goal/Trigger, query, or control request references have been created.

Terminal pre-Task states are `REJECTED`, `DENIED`, `CANCELLED`, `EXPIRED`, and `FAILED`. `DISPATCHED` is terminal for pre-Task orchestration but not proof of execution or completion. Execution progress and outcomes are projected from the linked canonical objects; the Command lifecycle must not add parallel `EXECUTING`, `VERIFYING`, or `COMPLETED` authority semantics.

Transitions require actor, policy, version, correlation, reason, and Audit evidence. Invalid transitions fail closed.

## 7. Classification, ambiguity, and clarification

Classification determines requested operation, target, scope, environment, read/write/control nature, risk, required permission, Approval policy, and evidence expectation.

If material facts are missing or ambiguous, the envelope enters `WAITING_HUMAN` with:

- specific unresolved fields;
- bounded, non-leading clarification prompts;
- current interpretation and assumptions explicitly marked as non-authoritative;
- expiry and safe cancellation behavior; and
- correlation to the originating message and subsequent response.

No scope, target, identity, environment, risk reduction, permission, Approval, or production intent may be silently inferred. A clarification that materially changes intent or scope creates a new envelope version and request fingerprint; previously obtained authority is revalidated.

## 8. Planner handoff

The Planner receives an immutable-versioned CommandEnvelope reference plus resolved intent, scope, constraints, risk context, evidence expectations, and permitted planning capabilities. The source message may be available as classified context, never as authority.

The Planner emits:

- a versioned Plan artifact;
- proposed canonical Task/Workflow/Goal/Trigger/query/control objects;
- dependencies, assumptions, risks, verification, rollback, and evidence requirements;
- required permission and Approval references; and
- correlation and causation links.

The Planner cannot approve, execute, broaden scope, fabricate authority, or convert uncertainty into an executable default.

## 9. Reviewer handoff

The Reviewer receives the CommandEnvelope and exact Plan/artifact versions. Review produces the existing canonical Review/Decision output with findings, disposition, evidence, and required revisions.

Review is not Approval. The Reviewer cannot execute, mutate the Human request, silently widen scope, or satisfy an Approval requirement. Revised Plans receive new versions and invalidate stale review or Approval bindings where policy requires.

## 10. Approval linkage and risk mapping

The CommandEnvelope may record risk and Approval requirement metadata but implements no Approval engine.

- Risk uses existing MAOS risk classifications and policy references; MAOS-019 `R0`, `R2`, `R3`, and `R4` meanings remain unchanged.
- Approval is a typed reference to a canonical Approval record bound to actor, action, scope, target, environment, version/hash, risk, validity, and policy.
- Review, QA PASS, plan acceptance, Messenger confirmation text, or UI visibility never substitutes for Approval.
- Stale, revoked, expired, mismatched, or absent Approval blocks readiness and dispatch.
- Production action always requires separately authorized production scope and applicable Human Approval.

## 11. Executor handoff

The Executor accepts only canonical execution inputs: exact Task/Workflow/Run/Job/ToolCall or MAOS-018/019 control references, current versions, actor/service identity, scope, permission decision, risk decision, Approval reference where required, idempotency key, and evidence/Audit context.

The Executor must not receive or interpret raw Messenger text as an instruction. It cannot broaden scope, replace a missing Approval, select an unregistered target, or convert a Plan into authority. Any mismatch fails closed and produces canonical Evidence and Audit.

## 12. Idempotency and replay

Idempotency binds the authenticated actor, source channel, client request/message reference, normalized command fingerprint, scope, and policy version.

- An identical replay returns the same CommandEnvelope and linked governed references.
- Reuse of an idempotency key with a different fingerprint is rejected as a conflict.
- Network retries do not duplicate Task, Workflow, Approval, Run, Job, ToolCall, or authority-changing effects.
- Planner revisions and clarification changes create explicit versions; they are not hidden retries.
- Dispatch records allow deterministic reconciliation after timeout or restart.

## 13. Cancellation, stop, and kill

- **Cancel** applies to a non-dispatched CommandEnvelope or planning/review flow and prevents future dispatch. It does not erase Message, Evidence, or Audit.
- After dispatch, cancellation targets the linked canonical Task, Workflow, Run, Job, or control contract according to its own lifecycle.
- **Stop** requests governed graceful termination through MAOS-018 or the applicable execution owner.
- **Kill** invokes the exact emergency control governed by MAOS-018 or MAOS-019 for a LoopRun, Run, ToolCall, Runner, or local execution boundary.

Stop/kill requires fresh identity, scope, permission, risk, Approval where required, target version, reason, Evidence, and Audit. A Messenger message alone cannot stop or kill execution, and a successful control does not authorize restart.

## 14. Evidence, Audit, correlation, and provenance

The complete chain is retained:

`HumanMessage → CommandEnvelope/version → Clarification → Plan/version → Review → Approval → Task/Workflow/Run/ToolCall → Artifact → Evidence → Audit`

Required records preserve correlation ID, causation references, actor, scope, target/environment, policy/version, idempotency fingerprint, transition/outcome, and redacted evidence references. Audit remains append-only and independently queryable under existing Audit authority. Messenger displays projections and links; it does not create a parallel evidence store or Audit subsystem.

Secrets, bearer tokens, cookies, Session IDs, CSRF values, raw credentials, private content beyond policy, and unrestricted raw prompts are excluded from command telemetry and Audit metadata.

## 15. Messenger response contract

A response projection contains:

- command reference and current pre-Task state;
- safe summary of interpreted intent, target, and scope;
- clarification questions or denial/rejection reason;
- Plan, Review, Approval, Task, Workflow, Run, Evidence, and Audit references available to the actor;
- waiting-human/Approval state, freshness, and next permitted Human action;
- safe error code, retryability, and correlation reference; and
- source timestamps and stale/unknown indicators.

Messenger responses never imply authority from natural-language phrasing and never expose sensitive identifiers or credentials.

## 16. Desktop and mobile compatibility

Desktop and mobile use the identical HumanMessage, CommandEnvelope, lifecycle, authority, idempotency, Evidence, and Audit contracts. Only presentation and the allowed interaction subset differ.

Mobile supports bounded command entry, clarification, status, Approval review, and governed cancel/stop/kill confirmation permitted by MAOS-020. It does not gain abbreviated authority, unrestricted terminal access, policy editing, secret handling, or silent high-risk defaults.

## 17. Security and failure boundaries

- Authentication precedes command creation; authorization is revalidated at every authority-bearing transition.
- Scope and target derive from canonical registries, never UI nesting or free text alone.
- Missing/stale identity, scope, registry, risk, Approval, policy, execution, or health evidence fails closed.
- Timeout may yield `WAITING_HUMAN`, `EXPIRED`, or `FAILED` according to policy; it never implies success.
- Denial and rejection are distinct: denial is an authority/policy outcome; rejection is invalid, unsafe, prohibited, or unsupported intent.
- No free-running chat loop may continue creating work without explicit governed transitions and budgets.
- Trusted output filtering and redaction apply across Messenger, Planner, Reviewer, and Executor handoffs.

## 18. Relationship to existing architecture

- **MAOS-020:** Messenger is the human command surface within Company, Team, and Project Portals; portal visibility remains separate from authority.
- **MAOS-018:** Goal, Trigger, LoopRun, pause/stop/cancel/kill, budget, and waiting-human semantics remain owned by the autonomous-loop architecture.
- **MAOS-019:** Tool Gateway, Runner, Workroot, permission, timeout, cancellation, kill, and evidence controls remain owned by the Local Execution Bridge.
- **MAOS-005:** Task and Workflow remain the canonical work units and orchestration definitions.
- **MAOS-009:** Approval lifecycle and authority remain canonical and unchanged.
- **MAOS-010/013:** API idempotency, stable errors, correlation, observability, Evidence, and Audit contracts are reused.

## 19. Decisions

1. D14B-001 — Introduce a pre-Task CommandEnvelope rather than mapping raw messages directly to work.
2. D14B-002 — Keep Command lifecycle limited to interpretation, governance, and dispatch; project execution state from canonical objects.
3. D14B-003 — Enforce Planner, Reviewer, Approval, and Executor separation.
4. D14B-004 — Use one contract for desktop and mobile.
5. D14B-005 — Bind replay to actor, source, request fingerprint, scope, and policy version.
6. D14B-006 — Map post-dispatch stop/kill exclusively to MAOS-018/019 controls.

## 20. Risks and assumptions

### Risks

1. R14B-001 — Intent misclassification could create wrong governed work. Control: explicit classification, clarification, review, and fail-closed dispatch.
2. R14B-002 — Natural language could appear to grant authority. Control: independent identity, scope, permission, risk, and Approval decisions.
3. R14B-003 — Retry storms could duplicate work. Control: strong idempotency and deterministic dispatch reconciliation.
4. R14B-004 — Lifecycle duplication could diverge from Task/Run truth. Control: terminal `DISPATCHED` pre-Task boundary and reference-based projections.
5. R14B-005 — Raw content could leak sensitive data. Control: classification, minimal references, redaction, and restricted retention.
6. R14B-006 — Mobile shortcuts could weaken governance. Control: identical canonical contract and bounded presentation subset.
7. R14B-007 — Stale Plans or Approvals could execute. Control: version/hash binding and transition-time revalidation.

### Assumptions

1. A14B-001 — Existing Identity, registry, Task, Workflow, Approval, Run, Evidence, and Audit APIs can accept typed references from CommandEnvelope.
2. A14B-002 — Existing risk policy provides the canonical classifications needed by commands.
3. A14B-003 — Channels can provide a stable authenticated actor and client request/message reference.
4. A14B-004 — Portal projections can render linked canonical state without copying its source-of-truth data.

## 21. Prohibited architecture and non-goals

- no chat or Messenger as a source of truth;
- no raw-message execution;
- no duplicate Task, Workflow, Approval, Run, Job, Tool, Evidence, or Audit engine;
- no free-running agent chat;
- no implicit authority, scope, risk reduction, production intent, or Approval escalation;
- no Executor interpretation of raw Messenger text;
- no browser-held provider credential or authority token;
- no Session, credential, secret, or Approval token in messages, URLs, telemetry, or evidence;
- no modification of independent business Systems or their sources of truth;
- no runtime implementation, migration, provider change, or production change under this candidate; and
- no modification of frozen MAOS v1.2 documents without approved C2 governance.

## 22. Traceability and Phase 14C gate

| Requirement                  | Canonical owner | MAOS-021 contribution                      |
| ---------------------------- | --------------- | ------------------------------------------ |
| Portal command surface       | MAOS-020        | HumanMessage and CommandEnvelope contracts |
| Task/Workflow semantics      | MAOS-005        | Typed pre-Task dispatch references         |
| Approval authority           | MAOS-009        | Risk and Approval linkage only             |
| API/idempotency              | MAOS-010        | Command replay and conflict rules          |
| Evidence/Audit/correlation   | MAOS-013        | End-to-end provenance chain                |
| Autonomous execution/control | MAOS-018        | Goal/Trigger/LoopRun handoff and controls  |
| Local Tool/Runner execution  | MAOS-019        | Exact Executor and stop/kill boundary      |

Phase 14C is `READY` for separately authorized planning because MAOS-CR-006 is `APPROVED_C2`. This approval grants no runtime implementation, migration, provider, production implementation, or production deployment authority.
