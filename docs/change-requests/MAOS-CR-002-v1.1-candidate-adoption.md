# MAOS-CR-002 — MAOS v1.1 Candidate Adoption

| 항목 | 값 |
|---|---|
| Change Request | MAOS-CR-002 |
| Baseline | MAOS Architecture v1.0 FROZEN |
| Target | Revised MAOS Architecture v1.1 Candidates |
| Class | C2 Minor Architecture |
| Status | PROPOSED / PENDING HUMAN APPROVAL |
| Scope | Adopt revised MAOS-018 and MAOS-019 additively; no v1.0 redesign |

## 1. Reason for Change

Phase 0–13 produced executable, non-production evidence for governed multi-agent loops and a
task-scoped Local Execution Bridge. MAOS-018 and MAOS-019 describe these additive architecture
extensions, but formal review found that the candidates needed stronger normative contracts before
they could be considered for freeze.

The revisions close only those review gaps:

- generalized Trigger, Evaluation, ReplanDecision, lifecycle, idempotency, exact Approval and
  deployment-boundary contracts for MAOS-018;
- capability/risk/Approval mapping, signed runner registration, link-aware filesystem containment,
  offline authority freshness and fail-closed rules for MAOS-019.

## 2. Affected Architecture Documents

- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md`
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md`

No MAOS Architecture v1.0 frozen document is modified by this Change Request.

## 3. Implementation Evidence

- Phase 1.15A: bounded Development Loop, LoopRun lifecycle, budgets, stop conditions, structured
  multi-agent assignment, artifact/evidence chaining, QA/revision/re-test, and exact human Approval
  before deployment preparation.
- Phase 1.10A: identified local runner, device/runner identity fields, workroot/task/run scope,
  bounded file/command/Git capabilities, Tool Gateway authorization, redaction, timeout,
  cancellation, health and revocation.
- Phase 2: generalized System, Environment, Repository, Workroot and Runner registries plus bounded
  LoopPolicy/LoopRun controls and preserved domain-system ownership.
- Phase 10: bounded cross-system operating loops with reference-only domain data, fail-closed
  execution and no production mutation.
- Phase 13: verified-result improvement candidates with human review, separation of duties, exact
  version/hash Approval, independent verification and no automatic activation.
- Formal-review verification: 45 directly relevant runtime tests passed; architecture/module
  boundary and repository secret/artifact checks passed.

Implementation evidence supports the core semantics. It does not claim that every generalized
Trigger, optional local capability, cryptographic runner registration, link-aware real-filesystem
adapter or offline lease has been implemented or production-validated.

## 4. Formal Review Evidence

Source: `docs/implementation/maos-v1.1-formal-architecture-review.md`

The formal review classified both candidates `REVISE_BEFORE_FREEZE`, found no conflict with frozen
v1.0, and required a separately approved C2 Change Request before adoption. The revised candidate
text incorporates the review's minimum corrections while retaining candidate status.

## 5. Compatibility with Frozen v1.0

The proposed adoption is additive and preserves:

- Human Authority > AI Authority;
- Agent != Model != Runner, Task != Run, Review != Approval, Skill != Tool Permission;
- Tool capability != authority and default-deny execution;
- exact Approval, separation of duties and runtime revalidation;
- Artifact, Evidence, Event and Audit as distinct records;
- domain systems and AI Memory Gateway as independent sources of truth for their domains;
- protected production environments and separate human production approval.

The candidates specialize existing orchestration, runner, tool-provider, security, observability
and deployment principles. They do not replace or weaken a frozen v1.0 domain or authority.

## 6. Security and Governance Impact

Positive controls introduced or clarified:

- authenticated, freshness-checked and idempotent loop Triggers;
- versioned Evaluation/ReplanDecision evidence that cannot grant Approval;
- exact target/version/hash/environment Approval binding for loop progression;
- capability-specific minimum Tool Risk and Approval defaults;
- distinct device and runner identity with signed registration or approved equivalent;
- canonical path containment across symlinks, junctions and reparse points;
- executable-and-argument command policy with redaction and bounded execution;
- offline fail-closed behavior and narrowly scoped signed leases;
- explicit denial of R2–R4, production and destructive offline actions.

No new AI, runner or provider authority is created. The Tool Gateway, Authority Resolver,
Approval, kill/revocation, audit and production gates remain authoritative.

## 7. Migration Impact

Architecture adoption itself requires no data migration and no runtime source change.

Future implementation of currently unproven contracts may require versioned additive persistence
for generalized Trigger, Evaluation, ReplanDecision, signed runner identity/attestation and offline
lease metadata. Any such schema or runtime work requires a separately scoped phase, forward-only
migration, compatibility tests and rollback plan. Existing Phase 0–13 data and APIs remain valid.

## 8. Production Impact

- `PRODUCTION_READY = NO` remains unchanged.
- `PRODUCTION_DEPLOYMENT_APPROVED = NO` remains unchanged.
- This Change Request authorizes no production deployment, credential configuration, external
  mutation or offline production execution.
- Existing production gaps remain separately tracked and cannot be closed by document approval.

## 9. Rollback or Rejection Option

Before approval, reject or withdraw MAOS-CR-002 and retain both documents as v1.1 candidates;
frozen v1.0 remains the sole authority and no runtime rollback is required.

If approved candidate text is later superseded before implementation, revert the architecture
adoption through a new governed documentation Change Request. Runtime or schema behavior must not
be removed or migrated merely because this documentation proposal is rejected.

## 10. Acceptance Conditions

Approval requires a named authorized human reviewer to confirm:

1. the revised candidate text matches the formal review corrections;
2. frozen v1.0 files and runtime source remain unchanged by this documentation revision;
3. optional or unimplemented behavior is clearly identified and cannot be represented as
   production evidence;
4. security, source-of-truth and production-authority boundaries remain intact; and
5. the approval explicitly names MAOS-018 and MAOS-019 and their exact reviewed Git revision.

Approval of this CR permits a separate controlled action to mark the approved documents as frozen
MAOS Architecture v1.1. It does not freeze them automatically.

## 11. Recommendation

`APPROVE_C2_AFTER_FORMAL_HUMAN_REVIEW`

The revised candidates are ready for v1.1 approval review. Until that approval and a separate
freeze action occur, their status remains `PROPOSED` and frozen MAOS Architecture v1.0 remains
authoritative.
