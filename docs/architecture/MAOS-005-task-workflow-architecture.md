# MAOS-005 Task & Workflow Architecture

| 항목 | 값 |
|---|---|
| Document ID | MAOS-005 |
| Document Type | Task & Workflow Architecture |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Hierarchy
Organization → Department → Project → Task → Subtask → Run.
Task는 공식 Work Unit이며 Workflow는 순서와 Dependency다.

## 2. Task Types
PLANNING, ANALYSIS, RESEARCH, DESIGN, DEVELOPMENT, DATABASE, TEST, QA, SECURITY, DEPLOYMENT, CONTENT, MARKETING, VERIFICATION, REVIEW, APPROVAL_PREPARATION, FOLLOW_UP, REPORTING, OPERATIONS.

## 3. Task Status
DRAFT, READY, QUEUED, IN_PROGRESS, WAITING_DEPENDENCY, WAITING_HUMAN, WAITING_APPROVAL, REVIEW, REVISE, BLOCKED, COMPLETED, FAILED, CANCELLED.

## 4. Sources
CEO, Employee, Chat, Workflow, Domain Event, Schedule, Agent, Integration, Manual UI.

## 5. Candidate Policies
AUTO_ACCEPT, EMPLOYEE_CONFIRM, TEAM_LEADER_CONFIRM, HUMAN_APPROVAL.

## 6. Dependencies
REQUIRES, BLOCKS, RELATED. Cycle detection required.

## 7. Workflow Gates
DEPENDENCY_GATE, REVIEW_GATE, APPROVAL_GATE, SECURITY_GATE, HUMAN_INPUT_GATE.

## 8. Failure Categories
TRANSIENT, PERMISSION, DEPENDENCY, INPUT, VALIDATION, SECURITY, EXTERNAL_SYSTEM, UNKNOWN.

## 9. WF-DEV-001
CEO REQUEST → REQUIREMENT → ARCHITECTURE IMPACT → UI/UX / TECH DESIGN → IMPLEMENTATION → AUTOMATED TEST → QA → SECURITY REVIEW → PREVIEW → HUMAN APPROVAL → PRODUCTION DEPLOY → POST-DEPLOY VERIFY.

## 10. Completion
Evidence-based completion. QA ≠ Approval. Task ≠ Job.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
