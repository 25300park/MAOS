# MAOS-024 — Verification Policy-Evaluated Routing and Handoff Architecture

## MAOS Architecture v1.6 Candidate

| Item                     | Value                     |
| ------------------------ | ------------------------- |
| Document ID              | MAOS-024                  |
| Version                  | 1.6                       |
| Status                   | APPROVED / FROZEN         |
| Change Class             | C2 Minor Architecture     |
| Current Frozen Baseline  | MAOS Architecture v1.5    |
| Change Request           | MAOS-CR-009 — APPROVED_C2 |
| Freeze Record            | MAOS-FRZ-007              |
| Implementation authority | NONE                      |
| Production authority     | NONE                      |

## 1. Objective

Define deterministic, registry- and policy-evaluated routing of exact governed execution outputs to eligible Verifier roles without conflating Verification with Review, Approval, QA authority, execution authority, or Production Approval.

The governed flow is:

`CommandEnvelope → Plan → Review → Approval → ExecutorRoutingEnvelope → Task/Run/Tool/Runner execution → VerificationHandoffEnvelope → VerificationRoutingEnvelope → existing Task/Run executes Verifier role → Verification Artifact → governed closure, rework, or escalation`

Verification evaluates what actually executed and the evidence it produced. It does not retroactively authorize execution and does not grant downstream authority.

## 2. Architectural decision

Adopt **policy-evaluated Verification routing over exact, immutable execution-output bindings**.

- A `VerificationHandoffEnvelope` records the non-authoritative transfer of exact Run, result, Artifact, Evidence, scope, risk, environment, and verification-criteria references.
- A versioned VerificationEligibilityPolicy evaluates registered Verifier roles, required independence, capabilities, approved Skills, scope, risk, environment, evidence sufficiency, availability, diversity, and quorum.
- A `VerificationRoutingEnvelope` records one deterministic routing decision, candidate evaluation, independence result, fallback/escalation, provenance, idempotency, Evidence, and Audit linkage.
- Verifier work executes only through existing Task/Run machinery.
- A Verification Artifact records the governed outcome without becoming Approval, QA authority, production authorization, or mutation authority.
- Closure and rework are separate governed handoffs to existing lifecycle machinery.

Rejected alternatives:

1. **Verification as an Approval shortcut** — rejected because evidence evaluation cannot grant Human or production authority.
2. **Verification-owned re-execution** — rejected because Verification must not silently rerun or mutate execution outputs.
3. **A parallel QA/workflow engine** — rejected because existing Task, Run, Workflow, Evidence, Audit, and QA semantics remain canonical.

## 3. Verifier role contract

A registered Verifier role contains:

- canonical role and eligible Agent identity references;
- verification mission, supported verification classifications, and forbidden actions;
- Company, Team, Project, System/domain, environment, and risk constraints;
- required capabilities and approved Skill/version constraints;
- independence requirements relative to Planner, Reviewer, Approver, Executor, Task, Run, ToolCall, Runner, and artifact authorship;
- permitted evidence sources and evidence-sufficiency rules;
- verification criteria and policy references;
- reproduction requirements and permitted read-only or separately authorized Tool Permission requirements;
- diversity, quorum, disagreement, timeout, retry, budget, and escalation policies;
- Verification Artifact and closure/rework handoff contracts; and
- Evidence, Audit, redaction, correlation, causation, and retention requirements.

The Verifier receives exact governed inputs only. Assignment grants no execution, artifact mutation, Approval, QA, Tool, Runner, or production authority.

## 4. VerificationHandoffEnvelope

A `VerificationHandoffEnvelope` is a versioned, non-authoritative governed handoff containing:

- handoff ID, version, status, created-at time, source actor/service, and expiry where applicable;
- exact Task, Run, ToolCall, Runner, and ExecutorRoutingEnvelope references;
- exact execution-result reference and version/hash;
- exact Artifact references and versions/hashes;
- the closed Evidence-set manifest and Evidence references with classification/redaction state;
- expected-outcome, acceptance-criteria, and verification-criteria references;
- exact scope, risk, environment, execution-policy, and verification-policy references;
- execution completion/control status and safe error codes;
- correlation ID, causation, provenance, idempotency key, and handoff fingerprint; and
- Evidence and Audit references for handoff creation.

The handoff does not imply Verification PASS, QA PASS, Approval, Production Approval, closure, or execution authority. Any change to a bound result, Artifact, Evidence set, scope, risk, environment, or criteria requires a new governed handoff version.

## 5. VerificationRoutingEnvelope

A `VerificationRoutingEnvelope` is a versioned, non-authoritative routing decision record containing:

- routing ID, version, status, evaluated-at time, and expiry where applicable;
- exact VerificationHandoffEnvelope and governed Run references with versions/hashes;
- exact result, Artifact, and Evidence-set binding hashes;
- exact scope, risk, environment, verification classification, and VerificationEligibilityPolicy ID/version;
- registered candidate-set references and deterministic ordering evidence;
- eligibility and exclusion reason codes;
- selected Verifier role and Agent identity, or no-selection reason;
- capability and approved Skill/version match evidence;
- independence, diversity, and quorum-policy evaluation;
- evidence-sufficiency precheck and availability snapshot;
- fallback decision or Human escalation outcome;
- idempotency key and routing-input fingerprint;
- correlation ID, causation, provenance, Evidence, and Audit references.

The envelope records one routing decision only. It never executes, grants authority, creates Approval, determines QA status, mutates an Artifact, authorizes a ToolCall, selects a Runner, or closes work.

## 6. Explicit non-equivalence and separation

- `VerificationRoutingEnvelope ≠ Task`.
- `VerificationRoutingEnvelope ≠ Run or Job`.
- `VerificationRoutingEnvelope ≠ Workflow`.
- `VerificationRoutingEnvelope ≠ Approval`.
- `VerificationHandoffEnvelope ≠ authority grant`.
- `Review ≠ Verification`.
- `Verification ≠ Approval`.
- `Verification ≠ QA`.
- `QA PASS ≠ Production Approval`.

Review evaluates a Plan or governed artifact before or around execution according to Review policy. Verification evaluates exact completed execution outputs and Evidence against exact verification criteria. QA may aggregate broader product or release quality evidence. Approval remains a separate authority decision.

## 7. Exact execution-output binding

Every verification decision binds immutably to:

- the exact Task and Run identity/version;
- the exact execution result identity/version/hash;
- every Artifact identity/version/hash under verification;
- the exact closed Evidence-set manifest and references;
- exact expected outcome and verification criteria;
- exact Company, Team, Project, System/domain, and Task/Run scope;
- exact risk class and environment;
- exact execution-policy and verification-policy versions; and
- correlation, causation, provenance, and prior routing/handoff references.

Stale, replaced, missing, mutable, or mismatched bindings fail closed. A newer Artifact, result, Evidence set, Run, or policy is a new verification input and cannot inherit the prior outcome silently.

## 8. VerificationEligibilityPolicy

A versioned `VerificationEligibilityPolicy` defines:

- applicable verification classifications, scopes, environments, and risk classes;
- required Verifier role, registered Agent subsets, lifecycle, and availability freshness;
- required capabilities and approved Skill/version constraints;
- required separation from Planner, Reviewer, Approver, Executor, Task/Run, ToolCall, Runner, and artifact authorship;
- Evidence types, provenance, freshness, integrity, minimum sufficiency, and redaction requirements;
- criteria, reproduction, sampling, negative-check, and failure-injection requirements where applicable;
- diversity, multiple-Verifier, quorum, tie, dissent, and conflict rules;
- permitted read-only or separately authorized Tool Permission requirements;
- deterministic ranking and tie-break rules;
- pre-authorized fallback candidates;
- timeout, retry, budget, no-candidate, and Human-escalation rules;
- outcome, closure, rework, Evidence, Audit, and retention requirements; and
- effective time, expiry, supersession, and provenance.

Policy is governed configuration. Routing, Verifiers, and models cannot synthesize, relax, or override it.

## 9. Deterministic eligibility evaluation

Evaluation uses immutable inputs and one approved policy version in this order:

1. validate the exact VerificationHandoffEnvelope, Task, Run, result, Artifact, and Evidence-set bindings;
2. validate scope, risk, environment, and verification classification;
3. load the applicable approved VerificationEligibilityPolicy;
4. validate evidence integrity, provenance, freshness, completeness, and sufficiency prerequisites;
5. filter registered active Verifier roles/Agents by scope, risk, environment, lifecycle, and availability;
6. require approved capabilities and Skill versions;
7. enforce independence and separation requirements;
8. apply diversity and quorum requirements;
9. validate any Tool Permission needed for reproduction without granting it through routing;
10. rank candidates with policy-defined stable criteria and tie-breakers; and
11. select, use a pre-authorized fallback, or enter `WAITING_HUMAN`, then persist Evidence/Audit.

The same bindings, policy version, registry state, and availability snapshot produce the same decision.

## 10. Verifier independence

- Independence is explicit and policy-driven by verification class, risk, environment, and target.
- A Verifier may be required to differ from the Planner, Reviewer, Approver, Executor, artifact author, execution Agent, execution Run, ToolCall, Runner, provider, or organizational role where policy requires.
- Selection cannot grant execution, Approval, QA, Tool, Runner, scope, or production authority.
- A Verifier cannot approve its own findings, become Approver by assignment, or alter the object under verification.
- If required independence cannot be proven from current registry and provenance evidence, routing fails closed to governed rework only where permitted or `WAITING_HUMAN`.

## 11. Evidence sufficiency

Evidence sufficiency is evaluated against the exact verification criteria and policy version.

- Presence alone is insufficient; Evidence must have required provenance, integrity/hash, freshness, scope/environment binding, classification, and completeness.
- Assertions, logs without required correlation, model output, prior success, UI state, or a partial Artifact cannot silently satisfy policy.
- Missing, stale, corrupt, contradictory, inaccessible, or under-classified Evidence yields `INSUFFICIENT_EVIDENCE`, never `PASS`.
- Policy may permit a bounded governed evidence-collection or rework Task/Run. Otherwise the state becomes `WAITING_HUMAN`.
- Sensitive data is referenced and redacted under existing Evidence policy; it is not copied into routing or handoff envelopes.

## 12. Verifier execution boundary

The canonical boundary is:

`VerificationRoutingEnvelope → existing Task/Run creation → separately authorized Tool Gateway/Runner use where required → Verification Artifact`

The routing envelope does not invoke the Verifier. Existing Task/Run machinery consumes one exact selected envelope version after current policy, binding, independence, scope, risk, environment, and evidence checks. Any ToolCall or reproduction requires separately valid Tool Permission and existing MAOS-019 controls.

The Verifier cannot self-select or expand Tool, Runner, scope, environment, repository, Workroot, Skill, evidence access, verification criteria, quorum, or Approval target.

## 13. Reproduction and re-execution

- **Reproduction** repeats an observation or check under policy-defined, non-mutating or separately authorized conditions and records a new governed verification Task/Run and Evidence chain.
- **Re-execution** repeats or revises the original governed work and therefore requires a new or explicitly linked existing Task/Run/Workflow path with current authority.
- Verification never silently reruns execution, mutates Artifacts, repairs Evidence, or changes results.
- Any reproduction requiring Tools or a Runner uses existing Tool Permission, Tool Gateway, repository/Workroot, environment, and MAOS-019 controls.
- Re-execution cannot inherit stale Approval, scope, Tool Permission, or production authority.

## 14. Multi-Verifier, diversity, and quorum

Higher-risk or policy-selected verification may require multiple independent Verifiers, diverse role/capability classes, separate Runs, or quorum.

- Required count, eligible diversity dimensions, quorum threshold, veto conditions, and aggregation rules are policy-versioned before routing.
- Quorum aggregates Verification Artifacts only; it does not create Approval, QA authority, or Production Approval.
- Missing required participation, failed independence, insufficient diversity, or unmet quorum fails closed.
- Abstention, timeout, dissent, and unavailable Evidence remain visible and cannot be coerced into PASS.

## 15. Conflict and disagreement

Conflicting Verification Artifacts retain every independent outcome and Evidence reference. Policy may request a bounded additional independent verification, governed rework, or Human resolution. Verifiers cannot negotiate authority, select one another, rewrite dissent, or average incompatible outcomes into PASS.

Unresolved disagreement, tie, required veto, independence conflict, or policy ambiguity resolves to `WAITING_HUMAN` unless an explicit governed rework path exists.

## 16. Verification outcome model

A Verification Artifact records one of these policy-scoped outcomes:

- `PASS`: bound criteria are satisfied by sufficient governed Evidence;
- `FAIL`: one or more bound criteria are disproven or unmet;
- `INSUFFICIENT_EVIDENCE`: policy-required Evidence is missing, stale, inaccessible, or invalid;
- `CONFLICTED`: required Verifiers disagree or quorum cannot resolve the result;
- `ERROR`: verification could not complete due to a bounded technical failure; or
- `CANCELLED` or `EXPIRED`: the governed verification work ended without an outcome.

`PASS` means only that the exact bound verification criteria were satisfied. It is not Review approval, QA PASS, Approval, production readiness, or Production Approval.

## 17. Governed rework handoff

`FAIL`, `INSUFFICIENT_EVIDENCE`, or policy-permitted `ERROR` may emit a non-authoritative rework recommendation containing exact failed criteria, safe reason codes, affected bindings, required Evidence, scope/risk/environment, correlation, and Evidence/Audit references.

Rework is created only through existing Task/Run/Workflow semantics with current identity, scope, permission, risk, Approval where required, idempotency, and Evidence/Audit. Verification cannot mutate the original Artifact, revise the Plan, rerun execution, or create authority. New results produce new versions and require fresh verification routing.

## 18. Closure handoff

A passing Verification Artifact may emit a non-authoritative closure handoff containing the exact Verification Artifact, Task/Run, result, Artifact, Evidence-set, criteria/policy, scope/risk/environment, quorum, correlation, and Audit references.

The closure consumer revalidates current versions and its own closure policy. Closure does not imply QA PASS, release readiness, deployment permission, production authorization, or Approval. Those remain separately governed.

## 19. WAITING_HUMAN escalation

Routing or verification resolves to `WAITING_HUMAN` when policy cannot safely continue, including:

- no eligible Verifier;
- missing, stale, replaced, or mismatched Task/Run/result/Artifact/Evidence binding;
- insufficient or contradictory Evidence without an authorized rework path;
- required independence or diversity unavailable;
- quorum failure or unresolved disagreement;
- scope, risk, or environment mismatch;
- exhausted timeout, retry, or pre-authorized fallback;
- unsafe reproduction or re-execution request;
- policy ambiguity, conflict, expiry, or missing registry evidence; or
- any request to treat Verification as Approval, QA authority, or Production Approval.

The escalation package carries safe reason codes, immutable binding summaries, evaluated policy/version, candidate and quorum summaries, unresolved conditions, permitted Human actions, expiry, correlation, and Evidence/Audit references.

## 20. Retry, replay, and idempotency

- Handoff creation, routing, Verifier dispatch, outcome recording, rework, and closure use separate scoped idempotency keys bound to immutable fingerprints.
- Identical replay returns the same envelope, Verification Artifact, and existing Task/Run references.
- Reusing a key with different Run, result, Artifact, Evidence set, criteria, scope, risk, environment, policy, independence, or quorum inputs is a conflict.
- A retry may select only a pre-authorized eligible Verifier under identical or stricter constraints.
- Retries cannot weaken Evidence, independence, diversity, quorum, scope, risk, environment, or criteria requirements.
- Retries do not duplicate Task, Run, ToolCall, Verification Artifact, rework, closure, authority-changing effect, or external action.

## 21. Correlation, provenance, Evidence, and Audit

The trace remains:

`HumanMessage → CommandEnvelope → Plan → Review → Approval → ExecutorRoutingEnvelope → Task/Run/ToolCall/Runner → Result/Artifact/Evidence → VerificationHandoffEnvelope → VerificationRoutingEnvelope → Verifier Task/Run → Verification Artifact → Closure/Rework → Evidence/Audit`

Evidence records exact binding manifests, policy/version, candidate evaluation, eligibility/exclusion reasons, independence/diversity/quorum evaluation, evidence-sufficiency decision, reproduction/re-execution references, outcome, dissent, retry, rework/closure handoff, and safe error codes.

Audit records actor/service identity, action, scope/environment, policy/version, routing and outcome decisions, lifecycle transition, Human intervention, correlation/causation, and Evidence references. Secrets, credentials, unrestricted model reasoning, and protected content beyond policy are excluded.

## 22. Mobile visibility

Desktop and mobile expose the same canonical handoff, routing, binding, Verifier role, independence, evidence-sufficiency, quorum, outcome, rework/closure, and Evidence/Audit references available to the Human.

Mobile may acknowledge `WAITING_HUMAN`, inspect Evidence permitted by policy, or invoke separately authorized canonical actions. It cannot change bindings, candidates, independence, criteria, policy, quorum, scope, risk, environment, Tool/Runner authority, outcome, QA status, or Approval.

## 23. Compatibility

- **MAOS-023:** consumes the exact non-authoritative execution-result handoff while preserving Executor, Task/Run, Tool Gateway, Runner, and immutable-constraint boundaries.
- **MAOS-022:** reuses policy-evaluated role routing, deterministic selection, independence, diversity, quorum, fallback, and Human escalation without changing Planner/Reviewer semantics.
- **MAOS-021:** preserves CommandEnvelope provenance and prohibits raw-message authority.
- **MAOS-020:** portal visibility remains separate from Verification, QA, Approval, and execution authority.
- **MAOS-018:** existing Task/Run/LoopRun verification, evaluation, rework, retry, and Human-control lifecycles remain authoritative.
- **MAOS-019:** any Tool/Runner reproduction remains behind Tool Permission, Tool Gateway, Workroot, Runner, revocation, Evidence, and control boundaries.
- **MAOS-005/009/013/016:** existing Task/Workflow, Approval, Evidence/Audit, and test/QA semantics remain canonical.

## 24. Decisions

1. D14E-001 — Use policy-evaluated deterministic Verification routing over exact immutable execution-output bindings.
2. D14E-002 — Separate the non-authoritative VerificationHandoffEnvelope from the non-executing VerificationRoutingEnvelope.
3. D14E-003 — Execute Verifier activity only through existing Task/Run machinery.
4. D14E-004 — Enforce policy-defined independence, diversity, quorum, and evidence sufficiency.
5. D14E-005 — Preserve Review, Verification, QA, Approval, and Production Approval as distinct semantics.
6. D14E-006 — Route failure and insufficient Evidence through governed rework or Human escalation without silent mutation or re-execution.
7. D14E-007 — Emit non-authoritative closure/rework handoffs while preserving downstream authority gates.

## 25. Risks and assumptions

### Risks

1. R14E-001 — Verification PASS could be mistaken for Approval or production authorization. Control: explicit semantic separation and downstream revalidation.
2. R14E-002 — Stale Artifact/result bindings could validate obsolete work. Control: exact versions/hashes and fail-closed routing.
3. R14E-003 — Evidence presence could be mistaken for sufficiency. Control: policy-defined provenance, integrity, freshness, and completeness checks.
4. R14E-004 — Verifier assignment could violate separation of duties. Control: explicit provenance-based independence evaluation.
5. R14E-005 — Quorum aggregation could hide dissent. Control: preserve individual outcomes, vetoes, abstentions, and Evidence.
6. R14E-006 — Rework could become silent mutation or execution. Control: existing Task/Run/Workflow authority and new output versions.
7. R14E-007 — Retry could duplicate verification or external effects. Control: scoped idempotency and exact binding fingerprints.
8. R14E-008 — Reproduction could expand Tool/Runner or data access. Control: separate current Tool Permission and MAOS-019 authorization.

### Assumptions

1. A14E-001 — Canonical registries expose versioned Verifier roles, capabilities, Skills, availability, and independence inputs.
2. A14E-002 — Existing Task/Run machinery can consume exact routing references and preserve verification provenance.
3. A14E-003 — Existing Evidence/Audit contracts can persist immutable binding manifests, sufficiency decisions, outcomes, dissent, and handoffs.
4. A14E-004 — Existing Workflow, Approval, QA, and production gates can consume Verification Artifact references without treating them as authority.

## 26. Prohibited architecture and non-goals

- no Verifier acting as Approver;
- no Verification implying Review acceptance, QA authority, QA PASS, production readiness, or Production Approval;
- no Verifier self-expansion of scope, environment, evidence access, Tool, Runner, repository, Workroot, Skill, criteria, quorum, or Approval target;
- no silent Artifact/result/Evidence mutation;
- no silent re-execution, retry, closure, release, or deployment;
- no free-running Verifier/Executor negotiation or Verifier-selected peer authority;
- no duplicate QA, Approval, Workflow, Task, Run, Verification, Evidence, or Audit engine;
- no raw Human Message execution or authority;
- no runtime implementation, migration, dependency, provider, credential, or production change; and
- no modification of frozen MAOS v1.5 without approved C2 governance.

## 27. Traceability and Phase 14F gate

| Requirement                          | Canonical owner    | MAOS-024 contribution                              |
| ------------------------------------ | ------------------ | -------------------------------------------------- |
| Execution and verification handoff   | MAOS-023           | Exact result/Artifact/Evidence handoff             |
| Planner/Reviewer provenance          | MAOS-022           | Prior governed routing and independence references |
| Command/provenance boundary          | MAOS-021           | No raw-message authority                           |
| Portal visibility                    | MAOS-020           | Visibility without mutation authority              |
| Task/Run/Workflow and loop lifecycle | MAOS-005, MAOS-018 | Existing Verifier execution and rework ownership   |
| Tool/Runner reproduction             | MAOS-019           | Existing Tool Gateway and Runner authority         |
| Approval separation                  | MAOS-009           | Verification never grants Approval                 |
| Evidence/Audit and test/QA           | MAOS-013, MAOS-016 | Sufficiency, outcome, provenance, and separation   |

Phase 14F is `READY` for separately authorized planning because MAOS-CR-009 is `APPROVED_C2`. This approval grants no runtime implementation, migration, provider, production implementation, or production deployment authority.
