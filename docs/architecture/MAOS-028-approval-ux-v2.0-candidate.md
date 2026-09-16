# MAOS-028 — Approval UX Architecture

## MAOS Architecture v2.0 — Approved / Frozen

| Item                     | Value                     |
| ------------------------ | ------------------------- |
| Document ID              | MAOS-028                  |
| Version                  | 2.0 candidate             |
| Status                   | APPROVED / FROZEN         |
| Change Class             | C2 Minor Architecture     |
| Current Frozen Baseline  | MAOS Architecture v1.9    |
| Change Request           | MAOS-CR-013 — APPROVED_C2 |
| Implementation authority | NONE                      |
| Production authority     | NONE                      |

## 1. Objective

Define one canonical desktop/mobile projection of the MAOS-025 `HumanApprovalRequest` and `HumanApprovalDecision` contracts so an authorized Human can make an informed, explicit, current, target-bound decision.

MAOS-028 creates no Approval, Task, Workflow, execution, Evidence, Audit, or business-state engine. The UX displays canonical records and submits governed decision intent to the existing Approval authority. UI state, navigation, acknowledgement, Review PASS, Verification PASS, and QA PASS never create Approval.

## 2. Architectural decision

Approval UX is a non-authoritative projection and interaction boundary over MAOS-025, MAOS-026, and MAOS-027.

- MAOS-025 owns approval requests, decisions, statuses, validity, exact bindings, freshness, expiry, revocation, and supersession.
- MAOS-026 owns governed Evidence/Audit references, integrity, redaction, retention, and queryability.
- MAOS-027 owns mobile presentation, live revalidation, offline, Session, and security boundaries.
- Existing server-side identity, scope, permission, risk, policy, Approval, and production gates remain authoritative.

The UX adds no canonical status. `CLARIFICATION_REQUIRED` remains the MAOS-025 non-authoritative request disposition while Approval stays `PENDING`; `WAITING_HUMAN` remains an owning workflow/task presentation state.

Rejected alternatives:

1. **UI-owned Approval state** — rejected because presentation cannot become authority or SoT.
2. **Generic confirmation modal for all environments** — rejected because it can obscure target, risk, and Production authority.
3. **Separate mobile Approval contract** — rejected because authority semantics must be identical across surfaces.

## 3. Authority-critical presentation contract

Every actionable Approval view must show, before a decision can be submitted:

- requested action and operation;
- exact target identity, target version/hash, and material-state fingerprint status;
- Company, Team, Project, System/domain, and Task/Run scope where applicable;
- risk class and material risk warnings;
- exact environment and an unambiguous Production/non-Production distinction;
- critical Evidence summary and governed Evidence references;
- Plan, Review, Verification, and QA context explicitly labeled as non-authoritative inputs;
- Approval policy reference/version, required authority, step-up/MFA, separation, and multi-step requirements;
- freshness state, validity window, expiry time, consumption, revocation, and supersession state;
- material conflicts, dissent, missing Evidence, uncertainty, and irreversibility; and
- correlation, causation, provenance, and Audit references safe for the viewer.

If required information is missing, inaccessible, stale, materially truncated, or cannot fit an informed presentation, authority-bearing controls remain disabled and the request stays fail-closed.

## 4. Approval Inbox contract

The Approval Inbox is a read-only, scope-filtered projection of canonical requests. Each row/card includes safe identifiers, requested action, target label and version, scope, risk, environment, freshness/expiry, requester, received time, material-warning indicator, and current canonical status/validity.

- Server-side authorization filters records; client filtering never grants visibility.
- Ordering, grouping, search, and attention badges do not alter priority, status, or authority.
- Default views emphasize pending, expiring, high-risk, destructive, and Production requests without auto-selecting a decision.
- Counts and notifications are advisory projections and refresh from canonical state.
- Expired, superseded, rejected, revoked, cancelled, consumed, or inaccessible items remain visibly non-actionable according to retention and access policy.

## 5. Approval Summary Card contract

The summary card is a compact projection for Inbox, portal, Messenger, and mobile surfaces. It presents the minimum authority-critical set: action, target/version, scope, risk, environment, Production marker, Evidence sufficiency, freshness/expiry, policy version, material warnings, and status.

The card may deep-link to the Approval Detail View. It must not expose a one-tap Approval control if any required data, revalidation, authentication assurance, or confirmation step is unavailable. Summarization cannot omit a material warning or change canonical meaning.

## 6. Approval Detail View contract

The detail view presents the complete governed request using progressive disclosure without hiding authority-critical facts. It includes:

1. decision summary and explicit environment banner;
2. exact action, target/version/hash, scope, risk, policy, freshness, and expiry;
3. consequences, reversibility, blast radius, and rollback/stop options where applicable;
4. Plan, Review, Verification, QA, dissent, and unresolved-condition context;
5. Evidence manifest summary with governed drill-down;
6. requester, proposed execution context, separation-of-duties, and multi-step position;
7. provenance, correlation, causation, and immutable decision history; and
8. only the decision actions currently allowed by canonical policy.

Evidence drill-down uses MAOS-026 read-only projections. Visibility grants no mutation, execution, verification, or Approval authority.

## 7. Plan, Review, Verification, and QA context

The UX labels each supporting artifact by type, version, producer, time, scope, and current validity. It must preserve:

- `Review ≠ Approval`;
- `Verification ≠ Approval`;
- `Verification ≠ QA`;
- `QA PASS ≠ Production Approval`; and
- recommendation or readiness evidence is not Human authority.

Conflicting, missing, failed, stale, or superseded supporting artifacts appear as material warnings and disable Approval when policy requires them.

## 8. Evidence presentation

Evidence summaries are derived from the exact closed Evidence manifest bound to the request. Each item exposes safe classification, source, observed/generated time, artifact/result version, integrity status, verification reference, and material finding according to access policy.

- The UI never substitutes a newly fetched or similarly named artifact for the bound Evidence reference.
- Redacted or inaccessible Evidence is identified; it is never silently treated as sufficient.
- Content/hash mismatch, missing required Evidence, stale Evidence, or manifest change triggers fail-closed refresh/mismatch handling.
- Secret values, credentials, bearer tokens, Session/cookie/CSRF material, private keys, and unrestricted sensitive content are never presented or persisted in client state.

## 9. Freshness and expiry presentation

The UX shows server-derived freshness, expiry, and last-validated timestamps in absolute time plus accessible relative context. Client clocks are advisory only.

Action controls disable when validity cannot be confirmed, expiry has passed, refresh is pending, the request was consumed/revoked/superseded, or authentication assurance is stale. A countdown cannot extend validity or replace server evaluation.

## 10. Governed decision interaction contract

Before `APPROVE`, `REJECT`, `CLARIFICATION_REQUIRED`, or policy-permitted `REVOKE`, the client must:

1. refresh the canonical request and latest decision/validity state;
2. revalidate authenticated Session, Human identity, scope, permission, authority, and required step-up/MFA;
3. revalidate exact action, target/version/hash, scope, risk, environment, Evidence manifest, policy/version, freshness, and expiry;
4. compare the refreshed decision fingerprint with the displayed fingerprint;
5. present any change and require a new informed decision; and
6. submit a scoped idempotency key and exact canonical references.

Mismatch, failed refresh, concurrent decision, lost authority, or stale authentication fails closed. The UX never retries an authority-bearing action silently.

### 10.1 APPROVE

Approval requires an explicit affirmative control, a final confirmation repeating action, target, environment, consequences, and material warnings, and any policy-required reason, step-up/MFA, or multi-step action. No control is preselected and keyboard focus does not default to the affirmative action.

### 10.2 REJECT

Rejection explicitly identifies the exact request version and records a policy-valid reason or bounded reason code. It grants no authority and cannot be converted to Approval through retry.

### 10.3 CLARIFICATION_REQUIRED

Clarification records the exact missing fact, Evidence, ambiguity, or question without approving or executing. A material response requires a new request version under MAOS-025; the UI cannot patch the approved target in place.

### 10.4 REVOKE

Revoke is displayed only when policy and current Human authority permit it. Confirmation states the exact Approval, target, environment, effect on queued/in-flight work, and whether stop/pause/kill is separately required. Revocation is append-only and does not delete history or automatically terminate execution.

## 11. High-risk and destructive confirmation

For policy-defined high-risk, R4, destructive, irreversible, security-control, credential, external filing/payment, broad data mutation, or production actions, UX strength increases presentation and confirmation friction without creating authority:

- persistent risk/environment banner and plain-language irreversible consequence;
- exact affected target set and blast radius;
- rollback, recovery, backup, stop, and kill readiness where applicable;
- unresolved warnings and evidence gaps visible immediately;
- no batch Approval unless canonical policy and exact target binding permit it;
- policy-required step-up/MFA, separation, and multi-step progress; and
- typed or repeated confirmation only when canonical policy requires it.

UX friction never replaces server-side policy or Approval validation.

## 12. Production Approval UX

Production is visually and semantically distinct across Inbox, card, detail, confirmation, history, and Audit views.

- Use the explicit label `PRODUCTION APPROVAL`; never an ambiguous generic `Approve` alone.
- Display production environment, target/version/hash, blast radius, rollback/recovery evidence, policy/version, expiry, and required steps in the primary decision region.
- Never infer Production Approval from staging, preview, test, prior release, Review PASS, Verification PASS, QA PASS, or a previous target.
- Non-production and Production requests cannot be combined in one decision interaction.
- Color is supplementary; text, iconography, heading, and accessible announcement convey Production status.

This UX contract grants no Production implementation or deployment authority.

## 13. Superseded, expired, conflict, and mismatch UX

Superseded, expired, revoked, rejected, cancelled, consumed, or invalid requests are visibly locked and retain history. The view identifies the safe reason and governed replacement reference when authorized.

On target/version/hash, scope, risk, environment, Evidence, policy, authority, or freshness mismatch:

- stop the pending action;
- preserve the Human's unsent non-authoritative note where safe;
- show old-versus-current material differences without exposing restricted data;
- require the refreshed request or governed replacement; and
- record the failed revalidation through canonical Audit boundaries.

The client cannot locally repair, widen, reactivate, or supersede a request.

## 14. WAITING_HUMAN presentation

`WAITING_HUMAN` identifies the owning governed record, exact reason, required Human decision or information, deadline/expiry, consequences of inaction, scope/environment, and safe next action. It does not imply that Approval exists or that the current viewer has authority.

Resume occurs only through the canonical owner after a valid decision, clarification, Evidence update, or authority resolution and fresh revalidation.

## 15. Desktop and mobile parity

Desktop and mobile consume identical canonical request, decision, action, binding, policy, freshness, and Audit contracts.

Permitted differences are density, navigation, progressive disclosure, touch interaction, and amount of forensic context shown at once. Neither surface may weaken checks, omit authority-critical data, alter decision semantics, or create surface-specific business state.

Mobile follows MAOS-027: authority-bearing actions require live connectivity and fresh canonical state. If the device cannot present sufficient Evidence, perform required step-up, or display material consequences accessibly, decision controls are disabled and a governed desktop deep-link may be offered.

## 16. Accessibility

- All authority-critical content and controls meet keyboard, screen-reader, focus-order, contrast, target-size, and zoom/reflow requirements.
- Risk, Production, stale, mismatch, and terminal states are conveyed by text and programmatic semantics, not color alone.
- Confirmations announce exact action, target, environment, risk, and consequence before the decision control.
- Timed expiry does not steal focus; users receive accessible warnings and server-confirmed state.
- Evidence summaries and validation errors retain logical headings, labels, and actionable remediation.

Accessibility failure that prevents informed consent disables Approval rather than degrading the evidence requirement.

## 17. Audit and provenance visibility

Authorized viewers receive read-only MAOS-026 projections for request creation, evidence-manifest binding, decision, clarification, rejection, revocation, expiry, supersession, failed validation, dispatch validation, and consumption.

Views preserve Human actor, authority source, action, target/version/hash, scope, risk, environment, policy/version, correlation, causation, Evidence references, event time, and integrity status subject to classification/redaction. Viewing or exporting permitted evidence never grants mutation or authority.

## 18. Security boundary

- Authenticated Session and server-side identity/scope/permission checks are mandatory.
- Same-origin, CSRF, origin, freshness, revocation, and trusted-header controls remain authoritative where applicable.
- Client state contains no bearer token, Session secret/identifier, cookie value, CSRF value, credential, Approval authority token, or private secret.
- Deep links carry only safe opaque references and resolve through current authorization.
- Screenshots, notifications, previews, caches, and telemetry follow classification and redaction policy.

## 19. Idempotency and concurrency

Each decision intent uses an operation-specific idempotency key bound to actor, request/version, decision kind, decision fingerprint, scope, policy, and current authority. Identical replay returns the existing canonical outcome; changed input under the same key is a conflict.

Optimistic concurrency prevents two views/devices from committing incompatible decisions. A losing client refreshes and displays the canonical outcome; it never overwrites or silently retries.

## 20. Non-goals

MAOS-028 does not:

- implement UI or runtime behavior;
- define a new Approval engine, status model, Workflow, Task, Run, Evidence, or Audit system;
- infer Approval from navigation, dismissal, message acknowledgement, silence, or supporting PASS states;
- authorize Production, deployment, execution, Tool, Runner, or provider actions;
- change MAOS-025, MAOS-027, or any frozen v1.9 architecture;
- hide target/version/hash, environment, risk, expiry, policy, or material warnings; or
- permit stale, offline, background, notification, or cached authority-bearing actions.

## 21. Compatibility and traceability

- **MAOS-027:** mobile presentation, live revalidation, offline, security, and parity rules remain authoritative.
- **MAOS-026:** Evidence/Audit integrity, redaction, queryability, and projections remain authoritative.
- **MAOS-025:** all request, decision, status, validity, binding, freshness, expiry, revocation, and production semantics are reused unchanged.
- **MAOS-024:** Verification is supporting context, never Approval.
- **MAOS-023:** approved work still requires current Executor routing and execution gates.
- **MAOS-022:** Review/routing remain separate from Approval.
- **MAOS-021:** message acknowledgement and CommandEnvelope intent never create Approval.
- **MAOS-020:** portal navigation/visibility never implies authority.
- **MAOS-009:** existing Approval engine and lifecycle remain canonical.

## 22. Decisions

1. D14I-001 — Define Approval UX as a non-authoritative projection over MAOS-025.
2. D14I-002 — Require authority-critical data before every Human decision.
3. D14I-003 — Revalidate live canonical state before every authority-bearing action.
4. D14I-004 — Keep Production Approval explicitly distinct across all surfaces.
5. D14I-005 — Use one decision contract across desktop and mobile.
6. D14I-006 — Fail closed when evidence, accessibility, freshness, or binding is insufficient.
7. D14I-007 — Preserve immutable, queryable decision provenance through MAOS-026.

## 23. Risks and assumptions

### Risks

1. R14I-001 — Compact views could omit material context. Control: mandatory authority-critical field set and detail gate.
2. R14I-002 — Stale cached data could authorize changed work. Control: live refresh, fingerprint comparison, and fail-closed mismatch.
3. R14I-003 — Generic controls could obscure Production. Control: persistent explicit Production semantics and isolated decision flow.
4. R14I-004 — Supporting PASS states could be mistaken for authority. Control: explicit semantic labeling and separation.
5. R14I-005 — High-risk confirmation fatigue could produce accidental decisions. Control: policy-driven friction and concise material warnings.
6. R14I-006 — Multi-device concurrency could produce conflicting decisions. Control: optimistic concurrency and idempotency.
7. R14I-007 — Evidence drill-down could leak sensitive data. Control: MAOS-026 classification/redaction and server authorization.
8. R14I-008 — Accessibility defects could prevent informed consent. Control: accessible authority-critical presentation or disabled action.

### Assumptions

1. A14I-001 — MAOS-025 exposes exact immutable request/decision bindings and current validity.
2. A14I-002 — MAOS-026 provides authorized read-only Evidence/Audit projections.
3. A14I-003 — MAOS-027 Session, live-state, mobile, and security contracts remain available.
4. A14I-004 — Canonical policy identifies high-risk confirmation, step-up/MFA, and multi-step requirements.

## 24. Governance gate

Human C2 decision `APPROVE_MAOS_CR_013_C2` adopts MAOS-028 as the approved/frozen MAOS Architecture v2.0 baseline. It establishes cross-surface canonical Approval presentation and interaction semantics without modifying frozen v1.9.

- MAOS-CR-013 is `APPROVED_C2`.
- C2 blockers are `NONE`; non-blocking findings are `NONE`; candidate correction required is `NO`.
- Phase 14I status is `COMPLETE`.
- Phase 14J is `READY` for separately authorized planning.
- Runtime implementation, migration, dependency, provider, Production implementation, and deployment authority remain `NO`.
