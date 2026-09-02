# MAOS-NRM-001 Architecture Normalization

| 항목 | 값 |
|---|---|
| Document ID | MAOS-NRM-001 |
| Document Type | Architecture Normalization Package |
| Version | 1.0 |
| Status | FROZEN CORRECTION LAYER |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Scope
Phase 0 Final Cross-Architecture Review에서 발견된 10개 항목만 정규화한다. Redesign이 아니다.

## 2. Corrections
FCR-001: Quality / Delivery / Operations Domain 및 Persistent Entity 추가.
FCR-002: Tool Risk 정본화 — R0 READ_ONLY, R1 LOW_RISK_WRITE, R2 CONTROLLED_WRITE, R3 EXTERNAL_ACTION, R4 CRITICAL_ACTION.
FCR-003: Tool Type 정본화 — FILESYSTEM, CLI, API, DATABASE, BROWSER, MCP, DEPLOYMENT, VERSION_CONTROL, COMMUNICATION, STORAGE, OBSERVABILITY.
FCR-004: Approval Lifecycle Status와 Runtime Validity 분리.
FCR-005: Skill Status 정본화; TEST/DISCOVER는 lifecycle activity.
FCR-006: Memory Candidate Status — PENDING, APPROVED, REJECTED, MERGED, EXPIRED.
FCR-007: Tool Lifecycle Status와 Health 분리.
FCR-008: ToolCall Status — REQUESTED, AUTHORIZING, WAITING_APPROVAL, AUTHORIZED, EXECUTING, SUCCEEDED, FAILED, DENIED, TIMED_OUT, CANCELLED.
FCR-009: HTTP — 401 Authentication, 403 Permission/Authority, 409 Governance/State conflict, 422 Unprocessable business input.
FCR-010: API-023 ~ API-029 추가 — Release, Environment, Build, Incident, Change, Runbook, Test Run.

## 3. Result
FCR-001 ~ FCR-010: RESOLVED.
Major Architecture Change: NONE.
Freeze Readiness: PASS.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
