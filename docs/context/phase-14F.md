# Phase 14F Context Manifest — Human Approval Gate

Status: **COMPLETE**

## Goal

Define a durable, exact-bound Human Approval Gate that preserves existing Approval status/validity and keeps Review, Verification, QA, Approval, execution, and Production Approval distinct.

## Read First

- `AGENTS.md`
- `docs/handoff/CURRENT.md`
- `docs/context/phase-14F.md`
- `docs/architecture/MAOS-009-approval-architecture.md`
- `docs/architecture/MAOS-012-security-architecture.md`
- `docs/architecture/MAOS-013-observability-architecture.md`
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md`
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md`
- `docs/architecture/MAOS-020-company-team-project-portal-architecture-v1.2-candidate.md`
- `docs/architecture/MAOS-021-human-messenger-governed-command-contract-v1.3-candidate.md`
- `docs/architecture/MAOS-022-planner-reviewer-policy-routing-v1.4-candidate.md`
- `docs/architecture/MAOS-023-executor-policy-routing-v1.5-candidate.md`
- `docs/architecture/MAOS-024-verification-policy-routing-v1.6-candidate.md`
- `docs/architecture/MAOS-025-human-approval-gate-v1.7-candidate.md`
- `docs/change-requests/MAOS-CR-010-human-approval-gate.md`

## Scope

- HumanApprovalRequest and HumanApprovalDecision contracts;
- exact actor/action/operation/target/version/hash/scope/risk/environment/Evidence/policy binding;
- existing status/validity reuse, rejection, clarification, expiry, revocation, cancellation, consumption, and supersession;
- dispatch and immediate pre-execution revalidation;
- Production Approval, high-risk/destructive, step-up/MFA, separation-of-duties, and multi-step rules;
- evidence presentation and desktop/mobile payload parity;
- waiting-human, durability, audit, provenance, retry, and idempotency; and
- v1.7 candidate C2 governance package.

## Non-goals

- no runtime or UI implementation;
- no duplicate Approval, Workflow, Task, Run, Identity, Session, Evidence, or Audit engine;
- no Approval inference from chat, silence, Review, Verification, QA, readiness, or prior Approval;
- no AI Approval for Human-required authority;
- no Approval execution or bypass of execution gates;
- no database migration, dependency, provider, credential, external-System, or production change; and
- no Phase 14G work before explicit Human C2 approval.

## Gate

- Frozen MAOS v1.6: `UNCHANGED`.
- MAOS-025: `APPROVED / FROZEN` as MAOS Architecture v1.7.
- MAOS-CR-010: `APPROVED_C2`.
- Human C2 approval: `GRANTED`.
- C2 blockers: `NONE`.
- Non-blocking findings: `NONE`.
- Candidate correction required: `NO`.
- Phase 14G: `READY` for separately authorized planning.
- Runtime implementation authority: `NONE`.
- Production authority: `NONE`.

## Allowed recommendation

- `PASS_MAOS_PHASE14F_C2_CLOSEOUT`
