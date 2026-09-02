# MAOS-000 Project Constitution

| 항목 | 값 |
|---|---|
| Document ID | MAOS-000 |
| Document Type | Project Constitution |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Mission
MRHOMES AI Operating System(MAOS)은 사람의 최종 권한 아래 AI Worker들이 구조적으로 협업하는 Enterprise AI Control Plane이다.

## 2. North Star
`TASK + AGENT + SKILL + MEMORY + TOOL + WORKFLOW + APPROVAL = WORK`

결과는 `ARTIFACT + DECISION + EVENT + MEMORY`로 남는다.

MAOS는 WHO, WHY, WHAT, HOW, SOURCE, REVIEW, APPROVAL, RESULT, MEMORY에 답할 수 있어야 한다.

## 3. Constitutional Principles
1. Human authority is always above AI authority.
2. Structured work is preferred over unstructured conversation.
3. Agent는 전문화된 단일 책임 역할을 가진다.
4. 중요한 결과는 Chat이 아니라 Artifact로 남긴다.
5. Memory는 출처·검증·범위를 가진 Curated Knowledge다.
6. Least Privilege, Separation of Duties, Deny Precedence, Fail Closed를 기본으로 한다.
7. QA PASS와 Human Approval은 동일하지 않다.
8. Model은 교체 가능해야 하며 Agent와 분리한다.
9. 기존 Domain System은 기본적으로 교체하지 않고 연결한다.
10. Domain Master Data는 해당 Domain System이 Source of Truth를 유지한다.
11. 중요한 변경은 Audit 가능하고 재현 가능해야 한다.
12. Configuration을 Hardcoding보다 우선한다.
13. Stable Canonical ID와 Naming을 사용한다.
14. UI는 Enterprise Control Room 원칙을 따른다.
15. Visual QA 없이는 UI 완료로 보지 않는다.

## 4. AI Autonomy Levels
- A0 Advisory
- A1 Internal Preparation
- A2 Controlled Internal Action
- A3 Approved External Action
- A4 Restricted High-Risk Action

## 5. Human Roles
CEO, Human Department Owner, Operator, Reviewer, Approver.
AI Chief of Staff는 Supervisor/Orchestrator이며 Mega Worker가 아니다.

## 6. Project / Workflow Principles
Project는 기본 Business Container다. Agent가 Project를 소유하지 않는다.
Workflow는 Agent와 독립적으로 정의된다.
Skill은 Agent와 분리되며 Tool Permission을 부여하지 않는다.

## 7. Canonical Task Status
DRAFT, READY, QUEUED, IN_PROGRESS, WAITING_DEPENDENCY, WAITING_HUMAN, WAITING_APPROVAL, REVIEW, REVISE, BLOCKED, COMPLETED, FAILED, CANCELLED

## 8. Integration Principles
CP-011 Integrate Existing Domain Systems
CP-012 Domain Autonomy
CP-013 Canonical Integration
CP-014 Progressive Integration
CP-015 System Development Team
CP-016 Agent / Model / Runner Separation
CP-017 Domain System Does Not Become Enterprise Development Core
CP-018 Model and Runner Routing
CP-019 Employee Private Workspace Boundary

## 9. Privacy Boundary
Employee Private Journal, Mood, Private Notes는 기본적으로 회사·관리자·MAOS Agent에 공개되지 않는다.
공유는 명시적 Scope 또는 정책에 의해서만 가능하다.

## 10. Change Governance
C1 Editorial, C2 Minor Architecture, C3 Major Architecture, C4 Constitutional.
No Silent Rewrite.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
