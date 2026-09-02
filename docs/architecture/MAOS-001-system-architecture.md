# MAOS-001 System Architecture

| 항목 | 값 |
|---|---|
| Document ID | MAOS-001 |
| Document Type | System Architecture |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Architecture Layers
1. Human Governance
2. Experience / Control Room
3. Orchestration
4. Governance Services
5. AI Execution
6. Corporate Knowledge
7. Integration
8. Domain Systems
9. Platform Infrastructure

## 2. Control Room
Today, Projects, Tasks, Approvals, Agents, Departments, Systems, Artifacts, Decisions, Memory, Runs, Alerts, Audit.
Today는 Critical Issues, Waiting Approval, Projects at Risk, AI Agents Working, Blocked Tasks, Failed Runs, Deadlines, Decisions, Alerts, Department Summary를 제공한다.

## 3. Orchestration
AI Chief of Staff, Task Engine, Workflow Engine, Scheduler, Dependency Resolver, Escalation.
CEO의 System Development Team 직접 지시는 허용되지만 기록된다.

## 4. Governance Services
Approval Engine, Decision Registry, Policy Engine, Authority Resolver, Risk Classification, Audit Enforcement.

## 5. AI Execution
Agent, Model, Runner, Skill, Tool을 분리한다.
Model Router는 task type, role, complexity, context, capability, budget, latency, availability, historical success, security를 입력으로 사용한다.
Runner Router는 실행환경 요구에 따라 Runner를 선택한다.

## 6. Knowledge Layer
AI Memory Gateway, Artifact Registry, Evidence Registry, Decision Registry, Knowledge Search, Context Builder.
Namespaces: `/company`, `/departments`, `/projects`, `/agents`, `/tasks`, `/decisions`, `/artifacts`, `/policies`, `/operations`, `/integrations`.

## 7. Integration Layer
Integration Registry, Adapters, API Gateway, Event Gateway, Webhook ingress, Polling, Canonical mapper, Health monitor, Deep-link resolver.
Integration maturity: I0 Independent, I1 Registered, I2 Observable, I3 Manageable, I4 Orchestrated, I5 Enterprise Integrated.

## 8. Domain Systems
AI MLS, Marketing Agent, CRM / Brokerage, Accounting, HR, rbs-homes.com, admin.rbs-homes.com, AI Memory Gateway.
MAOS는 Control Plane이며 Domain Plane을 흡수하지 않는다.

## 9. Initial Deployment Shape
MVP는 Modular Monolith를 기본으로 한다.

## 10. Run
Task는 여러 Run을 가질 수 있다.
Run status: CREATED, QUEUED, RUNNING, WAITING_TOOL, WAITING_APPROVAL, SUCCEEDED, FAILED, CANCELLED.

## 11. Environments
DEVELOPMENT, STAGING / PREVIEW, PRODUCTION.
Production Deployment는 기본 Developer 권한이 아니다.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
