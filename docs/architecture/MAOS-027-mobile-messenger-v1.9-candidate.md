# MAOS-027 — Mobile Messenger Architecture

## MAOS Architecture v1.9 — Approved / Frozen

| Item                     | Value                     |
| ------------------------ | ------------------------- |
| Document ID              | MAOS-027                  |
| Version                  | 1.9 candidate             |
| Status                   | APPROVED / FROZEN         |
| Change Class             | C2 Minor Architecture     |
| Current Frozen Baseline  | MAOS Architecture v1.8    |
| Change Request           | MAOS-CR-012 — APPROVED_C2 |
| Implementation authority | NONE                      |
| Production authority     | NONE                      |

## 1. Objective

Define a mobile-first presentation and interaction projection for the Human Owner over existing canonical MAOS command, routing, Approval, execution-control, Evidence, Audit, and portal contracts.

Mobile and desktop use the same canonical contracts. Only layout density, navigation, summarization, progressive disclosure, and touch interaction may differ.

## 2. Architectural decision

The Mobile Messenger is not a new domain or engine. It projects and invokes existing governed contracts:

- MAOS-021 owns Human Message, CommandEnvelope, clarification, provenance, and command lifecycle.
- MAOS-025 owns HumanApprovalRequest and HumanApprovalDecision.
- MAOS-018/019 own pause, stop, kill, Tool Gateway, and Runner controls.
- MAOS-026 owns Evidence/Audit projections and their redaction/query boundaries.
- MAOS-020 owns Company/Team/Project portal composition and navigation.

Explicit boundaries:

- Mobile Message `≠` authority.
- Mobile UI `≠` business source of truth.
- Local draft `≠` Human Message submission and `≠` CommandEnvelope.
- Raw message `≠` Task, Run, ToolCall, Runner input, or Executor input.
- Notification `≠` current state and `≠` authority.
- Visibility `≠` mutation authority.

MAOS-027 creates no mobile-specific command, Approval, Workflow, execution, Evidence, Audit, notification-authority, or business-state engine.

## 3. Mobile Messenger information architecture

The bounded mobile shell contains:

1. **Attention/Home** — current WAITING_HUMAN, Approval, critical execution, Verification, and control outcomes.
2. **Messenger** — Human Message history, Command Composer, clarification, and command lifecycle summaries.
3. **Command detail** — Plan/Review/routing status, Approval, execution, Verification, rework, and closure timeline.
4. **Approvals** — MAOS-025 request/decision projections with exact Evidence and authority context.
5. **Evidence** — critical redacted summaries and governed links, not forensic administration.
6. **Team/Project links** — exact registry-backed portal navigation.

Full registry administration, policy editing, forensic Audit search/export, bulk operations, secret management, repository editing, terminal access, and complex deployment configuration remain desktop-focused.

## 4. Mobile Messenger Shell

The shell provides authenticated navigation, attention state, connectivity/freshness state, safe account/session controls, and current Company/Team/Project context. It must:

- display the current canonical scope and environment before governed actions;
- distinguish cached, loading, refreshed, stale, unavailable, and conflict states;
- preserve correlation/provenance links without putting authority material in URLs;
- prevent action when Session, scope, permission, freshness, or current state cannot be established; and
- project server-owned state without becoming a cache-backed SoT.

## 5. Command Composer and local draft boundary

The Command Composer captures natural-language or structured Human intent, optional attachments/references, requested outcome, and selected visible portal context.

A local draft:

- is device-local, non-authoritative presentation state;
- is not a submitted Human Message or CommandEnvelope;
- creates no Task, Workflow, Approval, routing, Run, ToolCall, Evidence, Audit, or governed work;
- contains no credential, Session/cookie, CSRF, Approval, Tool/Runner, or authority material;
- is classified and encrypted/protected according to platform policy when retained; and
- may be deleted locally without changing canonical MAOS state.

The composer does not infer final scope, risk, permission, Approval, Tool, Runner, or execution parameters. Governed server-side contracts resolve and validate those facts.

## 6. Governed submission boundary

Before accepting a governed message/command submission, the canonical service validates live:

- authenticated current Session and Human identity;
- exact Company/Team/Project scope and environment;
- authority and permission to submit within that scope;
- state, registry, policy, and Session freshness;
- current canonical target/context rather than cached mobile state;
- exact-origin and CSRF protections where applicable;
- request schema, safe attachment/reference classification, and rate/budget policy; and
- scoped idempotency key, request fingerprint, replay, and conflict rules.

Only the canonical server may create the Human Message and CommandEnvelope-related governed records. The mobile client receives canonical references/status and never constructs authority-bearing execution input.

## 7. Clarification interaction

Clarification projects the MAOS-021 clarification-required state and includes:

- exact command/request version and unresolved questions;
- missing or ambiguous scope, target, outcome, constraints, risk, or Evidence;
- safe allowed response types and consequences;
- prior Human responses and version/provenance references; and
- whether response changes require a new CommandEnvelope version.

A clarification response is intent input only. It cannot silently broaden scope, reduce risk, satisfy Approval, or resume execution. Changed material inputs create the canonical new version and repeat classification/routing policy.

## 8. Command status timeline

The timeline is a read-only projection of canonical lifecycle state and references:

- message received/classified/clarification;
- Planner routing and Plan Artifact;
- Reviewer routing, Review Artifact, dissent, and resolution;
- Human Approval request/decision/validity;
- Executor routing, Task/Run/Tool/Runner execution;
- result/Artifact/Evidence;
- Verification routing/handoff/outcome;
- WAITING_HUMAN, rework, stop/pause/kill, failure, and closure.

Every item exposes safe timestamp, actor/role, scope/environment, correlation, freshness, and governed detail link as permitted. Missing or delayed events show `UNKNOWN` or unavailable, never inferred success.

## 9. Planner, Reviewer, execution, and Verification status

Status cards display canonical decision records and outcomes without granting authority:

- Planner/Reviewer cards show selected role, policy version, current Task/Run status, Artifact reference, independence/dissent, and safe fallback/escalation state.
- Execution cards show Task/Run, environment, current state, elapsed/budget state, Tool/Runner references, current health, and control availability.
- Verification cards show exact bound Run/result/Artifact/Evidence, policy/version, sufficiency, independence/quorum, outcome, rework, and unresolved findings.

Review `≠` Approval, Verification `≠` Approval, and QA PASS `≠` Production Approval.

## 10. Approval card contract

Mobile Approval reuses the exact MAOS-025 HumanApprovalRequest/HumanApprovalDecision payload and lifecycle. The card presents:

- exact actor/authority context;
- action/operation, target/version/hash, scope, risk, and environment;
- Evidence manifest, material consequences, reversibility/blast radius, unresolved findings, and policy/version;
- expiry/freshness, consumption, revocation, supersession, step-up/MFA, and multi-step/separation requirements; and
- explicit allowed decisions with safe confirmation.

Immediately before any authority-bearing decision, the service refreshes canonical state and revalidates Session, actor/authority, target/version/hash, scope/risk/environment, Evidence manifest, policy/version, freshness/expiry, revocation, and step-up/MFA. Missing, stale, changed, or conflicting state disables the action and fails closed.

Dismissal, notification acknowledgement, biometric device unlock by itself, scrolling, silence, prior Approval, Review, Verification, or QA never creates Approval.

## 11. Evidence summary card

Evidence summaries use MAOS-026 read-only projections and show only policy-permitted:

- Evidence type/reference/version, source provenance, generated-at/observed-at, integrity/freshness, classification/redaction, retention/availability, and Verification reference;
- material findings, missing/insufficient Evidence, dissent, and safe links; and
- exact governed target/scope/policy binding required for the pending decision.

Summaries cannot imply completeness, truth, Verification, Approval, mutation, or Production authority. Authority-critical Evidence cannot be omitted; if the mobile surface cannot present it safely and accessibly, the related decision is disabled and remains WAITING_HUMAN for a capable surface.

## 12. WAITING_HUMAN presentation

WAITING_HUMAN is a non-executing canonical state. Mobile presents:

- exact reason and blocking record/version;
- required Human decision, clarification, Evidence, authentication, or policy action;
- deadline/expiry and safe escalation path;
- current scope/environment and consequences of inaction; and
- whether mobile can safely complete the action or must deep-link to desktop.

Resume requires the owning canonical contract and fresh validation; the mobile client cannot clear WAITING_HUMAN locally.

## 13. Stop, pause, and kill controls

Mobile controls are governed entry points to MAOS-018/019 controls only:

- **Pause** requests policy-defined suspension of the exact supported LoopRun/Run.
- **Stop** requests orderly termination of the exact Task/Run/Tool execution.
- **Kill** invokes the canonical emergency kill path for the exact authorized execution target.

Before submission, the service validates live Session, Human identity, exact authority/permission, target/run/version, scope/environment, current control state, risk/Approval requirements, freshness, and idempotency. Final confirmation repeats target, environment, consequences, and reversibility.

Mobile never directly controls a Tool or Runner, changes Tool Permission, widens repository/Workroot access, or authorizes restart. Control acknowledgement is not outcome; the UI separately shows request accepted, enforcement in progress, and verified outcome. Evidence/Audit is retained.

## 14. Notification and attention model

Notifications are non-authoritative attention signals containing only safe opaque references, category/severity, bounded redacted summary, and observation time.

A notification never:

- creates a Human Message, CommandEnvelope, Approval, control request, or canonical state transition;
- implies Approval, Verification, success, current execution state, or authority;
- contains secrets, authority tokens, private payloads, or action-capable URLs; or
- substitutes for a refreshed canonical record.

Opening a notification resolves its opaque reference through the authenticated application, refreshes canonical state, rechecks scope/access, and only then presents any governed action.

## 15. Team and Project deep links

Deep links resolve registry-backed Company/Team/Project and governed record references through the authenticated shell. They contain no bearer token, Session/cookie, CSRF value, Approval token, credential, secret, or embedded authority.

Resolution validates current identity, scope, permission, environment, record availability, classification, and redirect allowlist. Invalid, stale, cross-scope, or unauthorized links fail closed without revealing record existence.

## 16. Offline, reconnect, and idempotent resubmission

Offline/mobile-local state may contain only protected drafts, non-authoritative redacted presentation cache, pending UI intent, and last-known timestamps. It cannot contain authority decisions, action-capable tokens, or a local canonical queue that executes automatically.

On reconnect:

1. reauthenticate/revalidate Session;
2. discard or mark stale all authority-bearing cached projections;
3. refresh exact scope, target, policy, Approval, execution, Evidence, and control state;
4. compare draft/submission fingerprint and canonical idempotency result; and
5. require Human confirmation again when material state changed.

Identical governed replay returns the existing canonical reference/outcome. A reused key with changed content, scope, target, policy, or authority is a conflict. Approval and stop/pause/kill are never automatically replayed after reconnect.

## 17. Mobile Session and security boundary

- Authenticated Session is mandatory for canonical reads and actions.
- Existing same-origin BFF/session transport, exact-origin, CSRF, trusted-header, cookie, freshness, revocation, and production fail-closed contracts remain authoritative where applicable.
- Identity, scope, permission, risk, Approval, and execution checks are server-side and repeated at canonical boundaries.
- Local UI state never persists bearer tokens, Session secrets/identifiers, cookies, CSRF values, credentials, API keys, Approval authority material, or raw secrets.
- Background tasks and notification handlers cannot perform authority-bearing actions.
- Device compromise, screen capture, clipboard, biometric, and local-storage risks are handled by platform/security policy without treating device possession as MAOS authority.

## 18. Sensitive-data masking

All views, notifications, local caches, logs, telemetry, screenshots/previews, accessibility labels, crash reports, and deep links apply canonical classification/redaction. Secret values and restricted private content are excluded rather than visually hidden after persistence.

The UI may reveal only minimum approved identifiers and summaries. Copy/share/export is permission- and classification-bound, audited where required, and unavailable for secret-bearing or non-exportable records.

## 19. Error and stale-state behavior

Any stale, unknown, conflicting, offline, or unverifiable state affecting governed submission, Approval, pause, stop, or kill forces refresh before action. If refresh or revalidation fails:

- no authority-bearing request is sent;
- the UI shows a safe retryable/unavailable state without fabricated success;
- canonical policy determines WAITING_HUMAN, conflict, denial, expiry, or retry; and
- duplicate taps/retries retain the same scoped idempotency key only for identical input.

Optimistic UI may show non-authoritative pending presentation but never APPROVED, stopped, killed, completed, or verified before canonical confirmation.

## 20. Accessibility

The mobile projection must support keyboard/switch access, screen readers, scalable text, adequate contrast, reduced motion, touch target sizing, focus order, semantic labels, and non-color status indicators. Destructive and authority-bearing actions require accessible explicit confirmation and cannot depend on gestures alone.

Summaries preserve authority-critical facts in accessible text. If accessibility or presentation constraints prevent an informed decision, the action remains disabled and WAITING_HUMAN on a capable surface.

## 21. Desktop/mobile contract parity

Desktop and mobile use identical canonical IDs, schemas, lifecycle states, status/validity, scope, risk, policy, Approval, Evidence/Audit, idempotency, and control contracts.

Permitted presentation differences:

- density, navigation, progressive disclosure, summarization, touch interaction, and desktop-only forensic/administrative tooling.

Prohibited semantic differences:

- weaker identity/authority/freshness checks;
- mobile-only command, Approval, Workflow, execution, Evidence/Audit, or business states;
- different Approval, command, control, Evidence, Audit, or retry meaning; and
- hidden authority-critical facts or inferred consent.

## 22. Compatibility

- **MAOS-026:** mobile Evidence/Audit is read-only, redacted, retention-aware, and non-authoritative.
- **MAOS-025:** Approval cards reuse exact HumanApprovalRequest/Decision and revalidation.
- **MAOS-024:** Verification status preserves exact Run/result/Artifact/Evidence binding and authority separation.
- **MAOS-023:** execution status does not alter Executor routing or execution constraints.
- **MAOS-022:** Planner/Reviewer status preserves policy routing and independence.
- **MAOS-021:** Messenger/clarification/composer use Human Message and CommandEnvelope boundaries.
- **MAOS-020:** shell/navigation/deep links remain registry-driven portal projections.
- **MAOS-018:** LoopRun/Task/Run pause/stop/kill and WAITING_HUMAN remain canonical.
- **MAOS-019:** Tool Gateway/Runner authorization, cancellation, timeout, kill, redaction, and reconnect controls remain canonical.

## 23. Decisions

1. D14H-001 — Define mobile strictly as a presentation/interaction projection over existing contracts.
2. D14H-002 — Permit protected local drafts and cache only as non-authoritative device state.
3. D14H-003 — Require live Session, scope, authority, freshness, origin/CSRF, and idempotency validation for governed submission.
4. D14H-004 — Reuse MAOS-025 for Approval and MAOS-018/019 for pause/stop/kill without direct Tool/Runner control.
5. D14H-005 — Treat notifications and deep links as non-authoritative opaque attention/navigation references.
6. D14H-006 — Fail stale/offline authority-bearing actions closed and require refreshed canonical state.
7. D14H-007 — Preserve one desktop/mobile contract with bounded mobile presentation and desktop-focused administration.

## 24. Risks and assumptions

### Risks

1. R14H-001 — Cached state enables stale Approval/control. Control: mandatory refresh and live revalidation.
2. R14H-002 — Local draft is mistaken for governed work. Control: explicit non-authoritative boundary and server-only creation.
3. R14H-003 — Notification acknowledgement is mistaken for authority. Control: opaque attention-only notifications.
4. R14H-004 — Retry duplicates commands or controls. Control: scoped idempotency, fingerprints, and conflicts.
5. R14H-005 — Mobile summary omits critical Evidence/risk. Control: mandatory facts or action disablement.
6. R14H-006 — Deep links leak secrets/scope. Control: opaque references and authenticated resolution.
7. R14H-007 — Device/local telemetry exposes sensitive data. Control: collection-time exclusion and canonical redaction.
8. R14H-008 — Mobile diverges from desktop semantics. Control: shared contracts and parity verification.

### Assumptions

1. A14H-001 — Existing same-origin Session/BFF and server authority contracts support mobile-responsive web use.
2. A14H-002 — Canonical services expose versioned read models and idempotent action endpoints.
3. A14H-003 — Existing portal registry mappings provide stable opaque Team/Project/record deep links.
4. A14H-004 — Platform accessibility, protected draft storage, notification, and secure lifecycle APIs can satisfy policy without storing authority material.

## 25. Prohibited architecture and non-goals

- no modification of MAOS-020, MAOS-021, MAOS-025, or any frozen v1.8 architecture;
- no Phase-local-only substitute for cross-contract semantics;
- no mobile-specific command, Approval, Workflow, execution, Evidence, Audit, notification-authority, or business-state engine/store;
- no raw-message execution or direct Tool/Runner invocation;
- no notification-as-authority, stale Approval/control, inferred scope/risk/permission, or offline authority-bearing action;
- no unrestricted forensic Audit, registry/policy administration, secret management, terminal, repository editor, or deployment console;
- no runtime, schema/migration, dependency, provider, credential, production implementation, or deployment change; and
- no Phase 14I work before explicit Human C2 approval.

## 26. Traceability and Phase 14I gate

| Requirement                     | Canonical owner | MAOS-027 contribution                                     |
| ------------------------------- | --------------- | --------------------------------------------------------- |
| Evidence/Audit projection       | MAOS-026        | Read-only redacted summaries and governed links           |
| Human Approval                  | MAOS-025        | Exact cards, decisions, freshness, and revalidation       |
| Verification status             | MAOS-024        | Bound result/Evidence/criteria/outcome visibility         |
| Executor/execution status       | MAOS-023        | Non-authoritative routing/Task/Run status                 |
| Planner/Reviewer status         | MAOS-022        | Routing, Artifact, independence, dissent visibility       |
| Messenger/Command/clarification | MAOS-021        | Composer, lifecycle, clarification, idempotent submission |
| Portal navigation               | MAOS-020        | Registry-driven Company/Team/Project deep links           |
| Loop/Task/Run control           | MAOS-018        | WAITING_HUMAN, pause/stop/kill lifecycle                  |
| Tool/Runner control             | MAOS-019        | Authorization, cancellation/kill, reconnect, redaction    |

Human C2 decision `APPROVE_MAOS_CR_012_C2` adopts this document as the approved/frozen MAOS Architecture v1.9 baseline. Phase 14I is `READY` for separately authorized planning. This approval grants no runtime implementation, migration, provider, production implementation, or production deployment authority.
