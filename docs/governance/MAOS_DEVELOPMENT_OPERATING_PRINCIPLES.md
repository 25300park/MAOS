# MAOS Development Operating Principles

Human-approved MVP-first priority and release-scope decision, 2026-10-23.
This does not grant deployment, credential, database, or external-system mutation authority.

## Working MVP first; hardening second

MVP_COMPLETION_IS_PRIMARY = TRUE. Before every task classify CURRENT_TASK_REQUIRED_FOR_MVP = YES / NO.
YES requires a direct blocker to functional completion, Staging deployment/startup, Human product testing, a Human-requested MVP defect fix, necessary security/data integrity, or a broken user-visible MVP workflow. Otherwise POST_MVP_DEFERRED.

MVP success requires: Staging starts; core user-facing workflows work; integrated system/project status is visible; Development requests classify/route correctly; DEVELOPMENT delegates to AIDOS or fails closed; unavailable AIDOS operations show safe blocked/Human-required state; Human can test; no known P0 prevents safe testing.

Only P0 blocks release: unsafe MVP deployment or Human testing is blocked. P1 is post-MVP correctness/automation/hardening; P2 is future improvement. Incomplete automation, nonexhaustive proof, future edge cases, Production hardening, optional authority generalization, and operational convenience do not alone justify P0. Human may explicitly reclassify.

Generalized credential lifecycle/key rotation, verifier/evidence/recovery systems, authority abstractions, nonessential migrations, automated completion/attestation/selection infrastructure, and Production-only hardening are normally deferred.

## Autonomous execution and Human gates

Human is not a test runner. Within an approved task Codex performs inspection, search, code/diagnostic changes, tests, regression, build/typecheck/lint, checksums, secret scans, local DB/migration analysis, PowerShell diagnostics, accessible logs, startup checks, root-cause analysis and bounded corrections itself.

Loop: inspect → implement → focused test → diagnose → fix → retest → affected validation → build/typecheck → scoped lint → diff check → secret scan → candidate.
Continue through ordinary test/build/type/lint/import/config/local permission failures when repair is authorized. Do not create a new phase for ordinary defect correction or return for every intermediate failure.

Stop only at candidate PASS, a genuine gate, unavailable external platform, or true P0 architecture/authority conflict. Human gates:

- HUMAN_GATE_PRODUCTION_MUTATION
- HUMAN_GATE_STAGING_DEPLOYMENT_WHEN_EXPLICIT_APPROVAL_REQUIRED
- HUMAN_GATE_SECRET_CUSTODY
- HUMAN_GATE_DESTRUCTIVE_OPERATION
- HUMAN_GATE_PRODUCT_TEST
- HUMAN_GATE_SCOPE_AUTHORITY_CHANGE
- HUMAN_GATE_EXTERNAL_PLATFORM_ACCESS_BLOCKER (no approved automated access path)

Respect access controls, secret custody and existing authorization. No platform-control bypass. Safely solvable approved-scope problems have HUMAN_ACTION_REQUIRED = NO.
Human-requested changes set HUMAN_REQUESTED_FIX = TRUE: implement, validate, correct local failures, report candidate without reopening unrelated architecture. Without a requested fix, autonomous work is limited to current MVP validation, regression detection, P0 security/data integrity and release readiness; no automatic P1/P2 feature starts.

## Scope drift circuit breaker

Before adding any framework, abstraction, governance/authority layer, credential/signing/verifier/evidence system, migration, recovery subsystem, orchestration, policy registry or audit extension ask DOES_THIS_DIRECTLY_BLOCK_MVP = YES / NO. NO means DO_NOT_IMPLEMENT / POST_MVP_DEFERRED; YES means minimum safe bounded work.

Set SCOPE_DRIFT_DETECTED = YES for verifier chains, generalized subsystems spawned by blockers, credential projects spawned by credential fixes, unrelated migration architecture, repeated unchanged PASS evidence, local diagnostics delegated to Human, unapproved P1-to-P0 promotion, governance exceeding product work, a lengthening deployment path, or repeated non-P0 review stops. ACTION = RETURN_TO_SHORTEST_MVP_PATH.

## Validation and governance budgets

Focused tests during implementation. Stable candidate: focused + affected + build/typecheck + changed-file/scoped lint + diff check + secret scan. Full regression only for final MVP release candidate, broad shared-core changes, or explicit Human request. Reuse unchanged PASS evidence; rerun authority/schema/security/integration checks only when source/context changes.

Target product/implementation/bug fixing 75–85%; governance/review/evidence 15–25%. Exceeding the governance budget triggers the circuit breaker. No repeated review loops or competing policy documents. New governance documents require law/security/data integrity or direct MVP release need.

## Current P1-1 reset

Based on the recorded implemented-scope closure in `docs/handoff/CURRENT.md`, not a new live Staging verification:

| Item | MVP_REQUIRED | Disposition |
| --- | --- | --- |
| Selection evidence contract/producer | NO | POST_MVP_DEFERRED |
| Pre-selection tuple snapshot | NO | POST_MVP_DEFERRED |
| Migration 0040 | NO | POST_MVP_DEFERRED; no Staging apply |
| Selected-agent version separation | NO | POST_MVP_DEFERRED; preserve approved semantics/code |
| Independent reconciler live auth | NO | POST_MVP_DEFERRED |
| Completion issuer/query consumer | NO | POST_MVP_DEFERRED; preserve safely implemented bindings |
| Additional Ed25519 completion infrastructure | NO | POST_MVP_DEFERRED; preserve existing verification |
| Shared run CAS work | NO | POST_MVP_DEFERRED; preserve existing safe behavior |
| Automatic PLAN_WORK completion | NO | POST_MVP_DEFERRED |
| Frozen subject automation | NO | POST_MVP_DEFERRED |
| DB-backed automatic SUCCEEDED transition | NO | POST_MVP_DEFERRED |
| P1-1 Railway SSH recovery / additional ACL | NO | POST_MVP_DEFERRED unless a core MVP testing/startup blocker is proven |

Do not delete useful implementation/evidence, weaken live safeguards, or continue based on sunk cost. No new execution, migration, ACL, credential, or policy activation is authorized here. A platform problem is not a release blocker merely because deferred automation needs it.

## MAOS_MVP_RELEASE_TRACK

R1 → R2 → R3 → R4 → R5. No R6/R7/R8 without Human scope expansion.

- R1 — Staging startup/health: application/core APIs healthy; no P0 startup failures.
- R2 — Core user workflow: UI/API usable, project/system status visible, required routing works.
- R3 — Development routing safety: AIDOS delegation when available, otherwise safe blocked state; no native fallback.
- R4 — Human product test: Human uses Staging and records defects; Human-requested defects return to active MVP implementation.
- R5 — Final MVP gate: no P0; P1/P2 explicitly deferred; declare Staging MVP released.

Current true MVP blockers: none established by the supplied implemented-scope evidence. Current live health/usability and Human product acceptance are not newly verified by this policy edit. Next gate is R1 current startup/health confirmation, reusing valid unchanged R2/R3 evidence; then Human R4 and R5. Do not claim MVP_RELEASED from documentation alone.

## Authority preservation

MAOS owns request/routing/coordination/current state. AIDOS owns Development execution/verification/release. Human is ultimate governance authority. DEVELOPMENT delegates to AIDOS or fails closed; no unsafe MAOS-native fallback. Mapping is not selection authority. Existing authentication, signature, approval and data-integrity checks remain intact. Priority/release scope changes do not transfer authority.

## Completion status contract

Every completion report includes:

```text
MVP_SCOPE_CHECK = PASS / FAIL
CURRENT_TASK_REQUIRED_FOR_MVP = YES / NO
MVP_BLOCKER_CLASS = P0 / P1 / P2 / NONE
SCOPE_DRIFT_DETECTED = YES / NO
POST_MVP_DEFERRED = <items or NONE>
HUMAN_ACTION_REQUIRED = YES / NO
HUMAN_ACTION_REASON = NONE / PRODUCTION_MUTATION / STAGING_DEPLOYMENT / SECRET_CUSTODY / DESTRUCTIVE_OPERATION / PRODUCT_TEST / SCOPE_AUTHORITY_CHANGE / EXTERNAL_PLATFORM_ACCESS_BLOCKER
AUTONOMOUS_WORK_COMPLETED = <work>
SHORTEST_PATH_TO_MVP = <bounded next path>
NEXT_MVP_GATE = R1 / R2 / R3 / R4 / R5 / MVP_RELEASED
```
