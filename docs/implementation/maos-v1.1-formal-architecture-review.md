# MAOS v1.1 Candidate Formal Architecture Review

Date: 2026-09-09

Review branch: `codex/maos-v1.1-formal-review`

Reviewed baseline: `09818bd9670e752f1528bde7e697f822ddca3000`

Mode: `REVIEW_ONLY`

## Decision

| Candidate | Classification | Decision basis |
| --- | --- | --- |
| MAOS-018 Autonomous Loop Multi-Agent Architecture v1.1 Candidate | `REVISE_BEFORE_FREEZE` | The implemented system validates bounded loop, multi-agent, evidence, human-authority, stop-condition, and governed-learning semantics. The candidate still names generalized trigger and control objects without normative lifecycle, trust, idempotency, or exact approval contracts, and its deployment wording is broader than the implemented non-production boundary. |
| MAOS-019 Local Execution Bridge / IDE Companion v1.1 Candidate | `REVISE_BEFORE_FREEZE` | The implemented system validates the bounded local-runner core. The candidate also describes unimplemented mutation surfaces, signed registration, and offline continuation without enough normative controls for authority freshness, link-aware path containment, or capability-specific risk and approval. |

Neither candidate conflicts with frozen MAOS Architecture v1.0 as an additive proposal. Neither is ready to become a frozen v1.1 baseline in its current text. Adoption requires the revisions below and a separately approved C2 architecture Change Request. Frozen v1.0 remains authoritative until that occurs.

## Review Baseline

The review compared both candidates with the completed Phase 0–13 repository and the directly relevant frozen documents: MAOS-000, MAOS-001, MAOS-002, MAOS-004, MAOS-005, MAOS-008, MAOS-009, MAOS-012, MAOS-013, and MAOS-017. It used the Phase 1 MVP, Phase 1P, Phase 2, and Phase 13 evidence records and the executable Development Loop, enterprise orchestration, Control Plane, Local Execution Bridge, Tooling, and optimization foundations.

The following frozen boundaries remain intact:

- Human Authority remains above AI Authority.
- Agent, Model, Runner, Task, Run, Skill, Tool Permission, Review, Approval, Event, Evidence, and Audit retain distinct meanings.
- Domain systems retain their own sources of truth; MAOS coordinates and governs by reference.
- A runner or tool provider exposes capability but does not create permission, approval, or production authority.
- QA or review success does not grant production approval.
- Production readiness and production deployment approval remain `NO`.

## MAOS-018 Review

### Implementation evidence

- Phase 1.15A implements the canonical development stages, a versioned definition, LoopRun state, human/task/workflow triggers, evidence-required evaluation, artifact/evidence chaining, agent-team task assignment, allowed-tool checks, usage/cost metadata, iteration/time/cost budgets, no-progress handling, pause/resume/cancel, and all ten candidate stop conditions.
- Exact human approval of an existing artifact is required before `DEPLOY_PREPARATION`; QA is not approval and the loop does not grant production authority.
- Phase 2 generalizes registered LoopPolicy and LoopRun controls with human start/resume/cancel authority, project/system scoping, tool allowlists, budgets, no-progress stopping, and distinct event and audit proof.
- Phase 10 demonstrates bounded cross-system orchestration with reference-only domain data, explicit scope/risk, default-deny execution, human intervention, failure escalation, and no production execution.
- Phase 13 turns verified results into inactive, evidence-bound improvement candidates. Human review, separation of duties, exact version/hash approval, independent verification, and activation remain separate. Architecture changes, self-approval, and production activation are rejected.

### Compatibility and governance

The governed closed-loop model, task/artifact/review collaboration, budget and stop controls, human authority, and prohibition on uncontrolled self-improvement are compatible with frozen v1.0. The candidate adds a reusable loop vocabulary rather than replacing Task, Run, Workflow, Approval, Tool, Evidence, Audit, or domain ownership.

### Required revisions before freeze

1. **Section 4 — Loop Control Objects:** define normative identifiers, versions, lifecycle/status values, ownership, project/environment scope, correlation/evidence references, and idempotency rules. Define `Evaluation` and `ReplanDecision` as explicit contracts, including who may issue or approve each decision. The current implementation demonstrates evaluation and replan behavior but does not establish the complete generalized object model named by the candidate.
2. **Section 5 — Trigger Types:** separate the implemented `HUMAN_REQUEST`, `TASK`, and `WORKFLOW` baseline from proposed `EVENT`, `SCHEDULE`, `CONDITION`, `GOAL_GAP`, `DEADLINE`, and `FAILURE` triggers. For every non-human trigger, require authenticated provenance, freshness, deduplication/idempotency, scope validation, policy authorization, and fail-closed handling before a LoopRun can start.
3. **Sections 7 and 8 — Agent Collaboration / Human Authority:** state explicitly that `Task != Run`, `Review != Approval`, and agents exchange structured task, artifact, evidence, and review references only. Add exact target/version/hash approval binding, separation of duties, runtime revalidation, and named human start/resume/cancel/kill authority for the autonomy level and environment in use.
4. **Section 12 — Development Team Dogfooding:** replace the ambiguous `Deploy` step with `Deploy Preparation → separately authorized environment deployment → Verify`; state that production progression requires the frozen release and production gates and is not authorized by loop completion, QA, or this architecture.
5. **Section 13 — Phase Placement:** replace forward-looking phase placement with an implementation-conformance table that distinguishes implemented non-production foundations from proposed general trigger/autonomy behavior. Do not represent Phase completion as production validation.

Minimal change: revise these sections only; preserve the candidate's core loop, four loop types, canonical stop conditions, Memory Gateway boundary, and non-goals.

## MAOS-019 Review

### Implementation evidence

- Phase 1.10A implements distinct device, identity, provider, and runner identifiers; normalized allowlisted workroots; task/run binding; a bounded capability set (`READ_FILE`, `WRITE_FILE`, `RUN_COMMAND`, `GIT_STATUS`, `GIT_DIFF`); command allowlisting; shell-control rejection; lexical path escape rejection; health; revocation; cancellation; timeout; and structured redacted evidence.
- Every local action executes through the Phase 1.10 ToolCall lifecycle. Tool/provider health, capability, environment, intersected permission layers, Tool Risk, and Approval are evaluated before execution; missing permission defaults to deny.
- Runner revocation marks the runner unavailable and cancels active ToolCalls. Runner identity and health do not grant authority.
- Phase 2 generalizes System, Environment, Repository, Workroot, and Runner registries, rejects cross-system bindings, stores credential references rather than secrets, and keeps external systems authoritative with cross-system writes denied by default.

### Compatibility and governance

The Local Execution Bridge is compatible with the frozen Runner and Tool Provider boundaries when it remains behind the Tool Gateway and existing permission, risk, approval, evidence, audit, and production gates. It does not need to own project/task truth, tool authority, approval authority, or external-system truth.

### Required revisions before freeze

1. **Section 3 — Responsibilities:** split capabilities into the implemented core and optional future capabilities. `CREATE_FILE`, `DELETE_FILE`, Git commit/branch/worktree, browser/UI automation, local-model, service-control, and artifact-upload capabilities require separate implementation and security evidence. Add a capability-to-action/risk/approval/environment matrix; destructive and production-affecting operations must remain unavailable until separately approved.
2. **Sections 2 and 4 — Principle / Governance:** make the Tool Gateway the mandatory execution path for every bridge call and bind each request to an exact ToolCall, task, run, project, environment, runner, workroot, capability, policy version, and approval target. State explicitly that device/runner registration, health, and local possession never confer permission or authority.
3. **Section 5 — Security:** distinguish device identity from runner identity and specify enrollment, credential/attestation rotation, replay protection, and revocation freshness. Replace generic path-boundary wording with canonical filesystem containment requirements that account for symlinks, junctions, reparse points, case normalization, and time-of-check/time-of-use changes. The current MVP proves lexical containment only and does not prove cryptographically signed registration.
4. **Section 5 — Security:** define command execution as executable-plus-argument policy rather than an unrestricted shell string; require working-directory binding, environment-variable allowlisting, output limits, timeout/cancellation, redaction before persistence/logging, and default deny for shell metacharacters or command composition.
5. **Section 7 — Offline / Local-first:** require fail-closed behavior when current identity, permission, approval, policy, task scope, or revocation state cannot be verified. If offline execution remains in scope, allow it only under explicit, short-lived, signed, capability- and target-bound leases with revocation/expiry rules and later evidence reconciliation; otherwise remove offline execution from the frozen baseline.
6. **Sections 8 and 10 — Phase Placement / Architectural Result:** replace roadmap language with a conformance table, identify the implemented MVP boundary, and state that optional IDE UX and expanded capabilities cannot be inferred from current evidence or used to claim production readiness.

Minimal change: revise these sections only; preserve the runner/tool-provider role, workroot model, governance chain, default deny, secret-reference rule, revocation, and non-goals.

## Executed Verification

- Targeted runtime tests: `45` passed, `0` failed. Covered Phase 1.15A Development Loop, Phase 10 enterprise orchestration, Phase 1.10A Local Execution Bridge, Phase 2 Control Plane, and Phase 13 governed optimization.
- Architecture/module boundary check: `PASS`.
- Repository secret/artifact scan: `PASS` (Git emitted a non-fatal warning that the sandbox could not read the user's global ignore file).
- `git diff --check`: `PASS` before this evidence file was added.
- No production action, external mutation, deployment, push, or candidate/frozen-architecture edit was performed.

## Formal Result

- Frozen v1.0 conflict: `NO`
- Duplicated authority: `NO` in the implemented boundary; the revisions above make this unambiguous for the proposed wider surface.
- Source-of-truth conflict: `NO`
- Security regression: `NO` in the implemented MVP; expanded and offline behavior must not be frozen without the listed controls.
- Production-authority bypass: `NO`
- Change Request required: `YES` — a separately approved C2 Change Request is required to adopt a revised candidate as Architecture v1.1.
- Production status: `UNCHANGED`
- Final recommendation: `REVISE_V1_1`
