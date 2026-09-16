# Phase 14J Context Manifest — Project Portal Integration Architecture

## Status

`COMPLETE`

## Objective

Define registry-driven Project Portal integration with independent Systems while preserving external SoTs, authority, repositories, deployments, native UIs, and MAOS governance.

## Read first

1. `docs/handoff/CURRENT.md`
2. `docs/architecture/MAOS-029-project-portal-integration-v2.1-candidate.md`
3. `docs/change-requests/MAOS-CR-014-project-portal-integration.md`
4. `docs/implementation/phase-14j/PHASE14J_TRACEABILITY_REGISTER.md`

## Direct canonical dependencies

- `docs/architecture/MAOS-028-approval-ux-v2.0-candidate.md`
- `docs/architecture/MAOS-027-mobile-messenger-v1.9-candidate.md`
- `docs/architecture/MAOS-026-evidence-audit-governance-v1.8-candidate.md`
- `docs/architecture/MAOS-025-human-approval-gate-v1.7-candidate.md`
- `docs/architecture/MAOS-024-verification-policy-routing-v1.6-candidate.md`
- `docs/architecture/MAOS-023-executor-policy-routing-v1.5-candidate.md`
- `docs/architecture/MAOS-022-planner-reviewer-policy-routing-v1.4-candidate.md`
- `docs/architecture/MAOS-021-human-messenger-governed-command-contract-v1.3-candidate.md`
- `docs/architecture/MAOS-020-company-team-project-portal-architecture-v1.2-candidate.md`
- `docs/architecture/MAOS-018-autonomous-loop-multi-agent-architecture-v1.1-candidate.md`
- `docs/architecture/MAOS-019-local-execution-bridge-v1.1-candidate.md`

## Scope

- Project/System/environment integration binding;
- registry, repository, Workroot, deployment, and health mappings;
- navigation, read, governed command, Approval, and Evidence/Audit modes;
- capability, authentication/delegation, and classification contracts;
- freshness, degradation, discovery, connector, and lifecycle boundaries;
- mobile Project Portal projection; and
- initial integration inventory.

## Guardrails

- External Systems remain their business SoTs.
- Project Portal Integration grants no authority.
- No duplicate database, registry, authorization, Approval, Workflow, execution, Evidence, or Audit engine.
- No unrestricted embedding, direct UI mutation, credential exposure, or cross-environment leakage.
- Frozen MAOS v2.0 remains unchanged.
- Runtime, provider, integration activation, and Production authority remain `NO`.
- Phase 14K is ready for separately authorized planning only; do not implement it without separate authorization.

## Gate

- MAOS-029: `APPROVED / FROZEN` as MAOS Architecture v2.1.
- MAOS-CR-014: `APPROVED_C2`.
- C2 blockers: `NONE`; non-blocking findings: `NONE`; candidate correction required: `NO`.
- Human C2 approval: `GRANTED`.
- Phase 14K: `READY` for separately authorized planning.
- Production changes: `NO`.
