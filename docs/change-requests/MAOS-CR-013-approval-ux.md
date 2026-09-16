# MAOS-CR-013 — Approval UX Architecture

| Item                    | Value                             |
| ----------------------- | --------------------------------- |
| Change Request          | MAOS-CR-013                       |
| Class                   | C2 Minor Architecture             |
| Target                  | Adopt MAOS-028 as a v2.0 addition |
| Status                  | APPROVED_C2                       |
| Current frozen baseline | MAOS Architecture v1.9            |
| Runtime authority       | NONE                              |
| Production authority    | NONE                              |
| Human C2 decision       | GRANTED — 2026-09-16              |

## 1. Change request

Adopt `MAOS-028 — Approval UX Architecture` as the candidate v2.0 addition defining a canonical desktop/mobile projection of existing `HumanApprovalRequest` and `HumanApprovalDecision` semantics.

The proposal standardizes Approval Inbox, card, detail, evidence presentation, action interactions, stale-state behavior, high-risk confirmation, explicit Production Approval presentation, mobile/desktop parity, accessibility, and Audit/provenance visibility.

## 2. Reason

MAOS-025 defines canonical Human Approval authority and MAOS-027 defines mobile projection boundaries, but frozen v1.9 does not yet define a complete cross-surface UX contract ensuring that exact target/version/hash, scope, risk, environment, Evidence, policy, freshness, and Production distinction are consistently presented before an authority-bearing Human action.

## 3. Additive boundary

MAOS-028:

- projects existing Approval semantics only;
- creates no Approval status, engine, Task, Workflow, Run, Evidence, Audit, or execution system;
- retains server-side identity, scope, permission, risk, policy, Approval, and production controls;
- reuses MAOS-026 Evidence/Audit projections and MAOS-027 mobile/security rules;
- preserves all MAOS-020 through MAOS-027 semantics; and
- grants no runtime, provider, migration, Production, or deployment authority.

## 4. Proposed contracts

1. Approval Inbox, Summary Card, and Detail View.
2. Mandatory authority-critical field presentation.
3. Evidence summary and governed drill-down.
4. Plan/Review/Verification/QA semantic separation.
5. Freshness, expiry, supersession, mismatch, and conflict UX.
6. Explicit approve, reject, clarification, and policy-permitted revoke interactions.
7. Policy-driven high-risk/destructive confirmation.
8. Visually and semantically distinct Production Approval flow.
9. Live refresh and fail-closed revalidation before every decision.
10. Identical desktop/mobile canonical contracts and accessible presentation.
11. Read-only Audit/provenance visibility.

## 5. Authority preservation

- UX presentation does not create authority.
- Only an explicit authenticated canonical Human decision may create Approval.
- Review PASS, Verification PASS, QA PASS, navigation, acknowledgement, silence, notification, and prior decisions grant no Approval.
- Production Approval remains separately explicit and cannot derive from non-production authority.
- Stale, mismatched, expired, revoked, consumed, superseded, inaccessible, or insufficient state fails closed.

## 6. Frozen baseline impact

- Frozen MAOS v1.9 changed: `NO`.
- MAOS-027 through MAOS-020 changed: `NO`.
- MAOS-025 Approval semantics changed: `NO`.
- Existing Approval engine changed: `NO`.
- Production changes: `NO`.

## 7. C2 acceptance criteria

C2 may approve only if review confirms:

- the UX is a non-authoritative projection;
- target/version/hash, scope/risk/environment, Evidence, policy/version, freshness/expiry, warnings, and Production distinction are mandatory;
- every decision performs live refresh/revalidation and fails closed on mismatch;
- high-risk friction remains policy-driven and grants no authority;
- desktop and mobile share identical canonical semantics;
- accessibility is required for informed consent;
- no new Approval or execution engine is introduced; and
- frozen v1.9 remains unchanged.

## 8. Implementation and production gate

This Change Request authorizes no implementation. Human C2 approval makes Phase 14J architecture-ready for separately authorized planning only. Runtime implementation, source changes, database migration, dependencies, provider configuration, Production implementation, and deployment remain separately governed and unauthorized.

## 9. Current decision

- MAOS-CR-013: `APPROVED_C2`.
- MAOS-028: `APPROVED / FROZEN` as MAOS Architecture v2.0.
- Human C2 approval: `GRANTED`.
- C2 blockers: `NONE`.
- Non-blocking findings: `NONE`.
- Candidate correction required: `NO`.
- Phase 14I: `COMPLETE`.
- Phase 14J: `READY` for separately authorized planning.
- Production changes: `NO`.
