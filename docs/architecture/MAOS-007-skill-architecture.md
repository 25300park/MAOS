# MAOS-007 Skill Architecture

| 항목 | 값 |
|---|---|
| Document ID | MAOS-007 |
| Document Type | Skill Architecture |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Principle
Skill = HOW. Agent, Tool, Memory, Workflow와 분리한다.

## 2. Skill Status
DRAFT, REVIEW, APPROVED, ACTIVE, DEPRECATED, DISABLED, ARCHIVED.
Lifecycle Activity: DISCOVER, AUTHOR, REVIEW, TEST, APPROVE, ACTIVATE, DEPRECATE, DISABLE, ARCHIVE.
TEST와 DISCOVER는 Persistent Status가 아니다.

## 3. Categories
GENERAL, DEVELOPMENT, DESIGN, DATA, REAL_ESTATE, MARKETING, FINANCE, HR, SECURITY, OPERATIONS, COMMUNICATION, GOVERNANCE.

## 4. Scopes
GLOBAL, DEPARTMENT, PROJECT, DOMAIN_SYSTEM, AGENT.

## 5. Package
`skill/SKILL.md` + references/examples/checklist/QA.

## 6. Resolution Priority
Task-specific > Project > Workflow > Department > Agent Default > Global.
Constitution/Policy가 Skill보다 우선한다.

## 7. Initial Development Skills
requirements-analysis, system-design, frontend-development, backend-development, database-development, software-testing, visual-qa, security-review, deployment-preparation, structured-handoff, ui-inspection-workflow.

## 8. UI Skills
intranet-style → Design System Skill reference.
ui-inspector → Tool/MCP이며 사용절차는 ui-inspection-workflow Skill.

## 9. Runtime
정확한 Skill version/checksum을 Run에 기록한다.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
