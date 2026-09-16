# MAOS-FRZ-003 Architecture Freeze v1.2

| Item                           | Value                                            |
| ------------------------------ | ------------------------------------------------ |
| Document ID                    | MAOS-FRZ-003                                     |
| Document Type                  | Architecture Change Approval and Freeze Decision |
| Effective Architecture Version | MAOS Architecture v1.2                           |
| Status                         | APPROVED / FROZEN                                |
| Previous Baseline              | MAOS Architecture v1.1 FROZEN                    |
| Change Request                 | MAOS-CR-005 — APPROVED_C2                        |
| Effective Date                 | 2026-09-16                                       |

## 1. Freeze decision

**MAOS ARCHITECTURE v1.2 — APPROVED / FROZEN**

- Architecture conflict: `NONE`.
- Source-of-truth conflict: `NONE`.
- Authority conflict: `NONE`.
- C2 blockers: `NONE`.
- Candidate corrections: `NONE`.
- Production-authority change: `NONE`.
- Runtime source change in freeze action: `NONE`.

## 2. Version relationship

MAOS Architecture v1.0 and v1.1 remain historical frozen baselines. MAOS v1.2 is additive and consists of the complete v1.1 baseline plus:

- MAOS-020 — Registry-Driven Company, Team, and Project Portal Architecture.

MAOS-011, MAOS-018, and MAOS-019 remain unchanged. No System, Agent, Workflow, Approval, Tool, Runner, Evidence, Audit, Memory, or external source-of-truth ownership is replaced or reinterpreted.

## 3. Human approval

The repository-authorized Human Owner granted `APPROVE_MAOS_CR_005_C2` on 2026-09-16 after the Phase 14A governance review found:

- additive architecture: `YES`;
- frozen v1.1 preserved: `YES`;
- authority, MAOS-018, MAOS-019, mobile, Evidence/Audit, decision, risk, assumption, and traceability reviews: `PASS`;
- C2 blockers: `NONE`; and
- candidate corrections: `NONE`.

Approval adopts the architecture only. It grants no runtime implementation, provider change, database migration, external-System mutation, production implementation, or production deployment authority.

## 4. Preserved governance

- Human Authority remains above AI authority.
- Portal visibility and navigation do not grant execution authority.
- `Identity → Scope → Permission → Risk → Approval → Execution → Evidence → Audit` remains mandatory.
- Team, Project, and System remain distinct typed concepts.
- Domain Systems and AI Memory Gateway retain their source-of-truth ownership.
- MAOS-018 remains the governed autonomous-loop architecture.
- MAOS-019 remains the Local Execution Bridge Runner/Tool Provider architecture.
- Existing Workflow, Approval, Agent, Runner, Tool Gateway, Evidence, Audit, and Memory architecture is reused rather than duplicated.
- Production action remains exactly Human-authorized and fail closed.

## 5. Rejected coupling

- System-first ownership coupling;
- embedded micro-frontend federation;
- cross-system source-of-truth merging;
- physical repository centralization;
- duplicate Workflow, Approval, Agent, Runner, Evidence, Audit, Memory, or loop runtimes; and
- trust-boundary expansion without separate governance approval.

Safe typed registry navigation, outbound deep links, and native MAOS portal views remain permitted within the approved authority and redaction boundaries.

## 6. Phase status

- Phase 14A: `COMPLETE`.
- Phase 14B: `READY` for separately authorized planning and implementation.
- Runtime implementation authorization: `NO`.
- Provider change authorization: `NO`.
- Production implementation authorization: `NO`.
- Production deployment authorization: `NO`.
- Production changed by this freeze: `NO`.

## 7. Effective freeze scope

The effective MAOS Architecture v1.2 scope is:

- the full MAOS Architecture v1.1 frozen baseline;
- MAOS-020 Registry-Driven Company, Team, and Project Portal Architecture;
- MAOS-CR-005 approval record; and
- this MAOS-FRZ-003 freeze decision.

Future changes follow normal Change Request governance. Phase 14B implementation must conform to this baseline and may not infer implementation or production authority from architecture approval.

---

## Baseline rule

This document is the final freeze decision for **MAOS Architecture v1.2**. Earlier frozen baselines remain valid historical records. Meaningful future changes require normal Change Request governance and must not be performed as a silent rewrite.
