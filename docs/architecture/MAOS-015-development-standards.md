# MAOS-015 Development Standards

| 항목 | 값 |
|---|---|
| Document ID | MAOS-015 |
| Document Type | Development Standards |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Principles
Architecture Before Implementation. AI Code = Human Code quality requirements. Small Reviewable Changes. Configuration over Hardcoding. Secure by Default. Testable by Design. No Silent Architecture Drift.

## 2. Repository
MAOS Core는 Modular Monolith. 기존 Domain System Repository는 독립 유지 가능.

## 3. Git
main + short-lived task branches. Direct main development 기본 금지. AI Agent도 isolated workspace/worktree를 사용한다.
Commit format 권장: `type(scope): summary`.

## 4. Canonical Terms
Task, Run, Approval, Artifact, Agent 등의 Architecture 용어를 코드에서도 동일하게 사용한다.

## 5. Configuration / Secrets
Config와 Secret 분리. .env commit 금지. Startup validation, fail-fast.

## 6. API
Contract-first, schema validation, stable error codes, request/correlation IDs, idempotency.

## 7. Database
Versioned migration, no manual production schema edit, constraints, transactions, optimistic locking.

## 8. AI-generated Code
Format/Lint → Typecheck → Tests → Review → Security.

## 9. UI
Design System, Functional QA, Responsive, Accessibility, Visual QA 모두 필요.

## 10. CI
Install → Format Check → Lint → Typecheck → Unit/Integration Test → Build → Security Scan. CI PASS ≠ Production Deploy.

## 11. DoD
Requirement satisfied, tests PASS, review complete, artifacts/evidence linked, documentation updated, security/approval/deployment gates satisfied as applicable.

## 12. Registry
DEV-001 ~ DEV-036 baseline.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
