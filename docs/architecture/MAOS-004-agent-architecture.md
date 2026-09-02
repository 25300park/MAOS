# MAOS-004 Agent Architecture

| 항목 | 값 |
|---|---|
| Document ID | MAOS-004 |
| Document Type | Agent Architecture |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Principle
Agent는 역할(WHO)이며 Model이나 Runner가 아니다.

## 2. Hierarchy
CEO → AI Chief of Staff → Team Leader → Specialist / Worker.

## 3. Agent Definition
agent_id, name, department, role, mission, responsibilities, allowed_tasks, forbidden_tasks, skills, tools, memory_scope, model_policy, runner_policy, approval_policy, handoff_policy, reporting.

## 4. Capability Formula
`Role + Skill + Tool Permission + Runner Capability + Model Capability`

## 5. Tool Risk
R0 READ_ONLY, R1 LOW_RISK_WRITE, R2 CONTROLLED_WRITE, R3 EXTERNAL_ACTION, R4 CRITICAL_ACTION.

## 6. Runtime / Lifecycle
Runtime: AVAILABLE, WORKING, WAITING, BLOCKED, OFFLINE.
Lifecycle: DRAFT, ACTIVE, SUSPENDED, DISABLED, RETIRED.

## 7. Handoff Package
handoff_id, task_id, from_agent, to_agent, summary, facts, decisions, constraints, artifacts, open_questions, recommended_next_action, confidence.

## 8. System Development Team
Development Lead, Requirement / Product, System Architect, UI/UX, Frontend, Backend, Database, Test, UI QA, Security Review, DevOps.

## 9. Fail Closed
Permission, Approval, Tool health, System health, Data authority가 불명확하면 고위험 실행을 차단한다.

## 10. Kill Switches
Agent, Department, Tool, Runner, Provider, Global AI.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
