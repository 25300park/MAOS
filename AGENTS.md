# MAOS Global Agent Instructions

## MAOS MVP-FIRST EXECUTION AUTHORITY

- MVP_COMPLETION_IS_PRIMARY = TRUE.
- Mandatory operating policy: `docs/governance/MAOS_DEVELOPMENT_OPERATING_PRINCIPLES.md`.
- Before every task report CURRENT_TASK_REQUIRED_FOR_MVP = YES / NO. Only work directly blocking safe MVP completion, Staging startup/deployment, Human product testing, a Human-requested MVP defect fix, or necessary security/data integrity is MVP_REQUIRED. Everything else is POST_MVP_DEFERRED.
- Working MVP first, hardening second. Only P0 blocks release; P1/P2 remain deferred unless Human explicitly reclassifies them. Preserve completed code/evidence; do not continue P1-1 because of sunk effort.
- Before any new framework, authority layer, credential/signing/verifier/evidence system, migration, recovery subsystem, orchestration, policy registry, or audit extension answer DOES_THIS_DIRECTLY_BLOCK_MVP = YES / NO. If NO: DO_NOT_IMPLEMENT / POST_MVP_DEFERRED. If YES: minimum safe bounded implementation only.
- Detect scope drift when review/proof chains grow, a blocker creates a generalized subsystem, unchanged PASS evidence is regenerated, local diagnostics are delegated to Human, P1 becomes a release blocker, governance exceeds product work, the deployment path grows, or non-P0 reviews repeatedly stop implementation. Set SCOPE_DRIFT_DETECTED = YES and RETURN_TO_SHORTEST_MVP_PATH.
- Human is not a test runner. Within approved scope autonomously inspect, implement, diagnose, test, fix, and retest through candidate PASS or a genuine Human gate. Ordinary local failures do not create approval gates or new phases.
- Human gates are limited to Production mutation, explicitly approval-gated Staging deployment, secret custody, destructive operations, product testing, scope/authority changes, and genuinely inaccessible external platforms with no approved automated path. Never bypass platform controls or expand authorization.
- Validation: focused during implementation; focused + affected + build/typecheck + scoped lint + diff check + secret scan for stable candidates. Full regression only for final MVP candidate, broad shared-core change, or explicit Human request. Reuse unchanged PASS evidence.
- Target product/implementation/fixes 75–85%; governance/review/evidence 15–25%. No competing governance documents or repeated review loops. No new governance document unless required for MVP release, law, security, or data integrity.
- MAOS owns request/routing/coordination/current-state authority; AIDOS owns Development execution/verification/release authority; Human remains ultimate authority. DEVELOPMENT delegates to AIDOS or fails closed; no unsafe native fallback. This policy changes priority/release scope, not authority ownership.
- Every completion report includes MVP_SCOPE_CHECK, CURRENT_TASK_REQUIRED_FOR_MVP, MVP_BLOCKER_CLASS, SCOPE_DRIFT_DETECTED, POST_MVP_DEFERRED, HUMAN_ACTION_REQUIRED, HUMAN_ACTION_REASON, AUTONOMOUS_WORK_COMPLETED, SHORTEST_PATH_TO_MVP, and NEXT_MVP_GATE as defined in the operating policy.

## Source of Truth
- `docs/architecture/` is canonical.
- MAOS Architecture v1.0 is frozen.
- Do not silently change frozen architecture.
- Architecture changes require an explicit Change Request.
- v1.1 candidate documents remain proposals until approved.

## Canonical Semantics
- Agent = WHO
- Task = WHAT
- Skill = HOW
- Memory = WHAT IS KNOWN
- Tool/MCP = WHAT CAN ACT
- Workflow = IN WHAT ORDER
- Model = HOW IT REASONS
- Runner = WHERE IT EXECUTES
- Approval = MAY
- Artifact = RESULT
- Evidence = PROOF OF RESULT
- Audit = PROOF OF WHO DID WHAT

Also preserve: Task != Run; Review != Approval; QA PASS != Production Approval; Agent != Model != Runner; Skill != Tool Permission; Chat is not Source of Truth; AI output is not trusted action until validated and authorized.

## Human Authority
- Human authority is always above AI authority.
- AI must not bypass approval, security, privacy, deployment, or authority gates.
- Private employee data remains private unless explicit sharing/policy allows otherwise.

## Repository Boundary
- Primary MAOS repository: `D:\\10. MAOS`
- Do not modify external systems unless the current task explicitly includes them.
- AI-MLS, CRM, RBS, PBN, ERP, Marketing Automation, and AI Memory Gateway remain independent systems/repositories by default.

## Context-Efficiency Rule
- DO NOT read every architecture document automatically.
- First read `docs/handoff/CURRENT.md`.
- Then read the current phase manifest under `docs/context/`.
- Read only architecture documents and source files named by that manifest.
- Expand context only for a concrete conflict, dependency, or missing fact.
- Prefer search/grep before opening large files.
- Avoid `node_modules`, build output, full lockfiles, and large logs unless required.

## Development Rules
- Work on the current phase only.
- Do not begin the next phase automatically.
- Preserve module boundaries.
- Prefer configuration over hardcoding.
- Never place secrets in code, logs, memory, prompts, artifacts, or test fixtures.

## Verification Rule
Never claim PASS from static reasoning alone. Run the verification required by the current phase and report actual results.

## Reporting
Default final implementation report:
- Phase
- Scope
- Files Added/Modified
- Verification
- Architecture Violations
- Remaining Issues
- Git Status
- FINAL RECOMMENDATION: PASS / REVISE

Stop after the report.
