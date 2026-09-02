# MAOS-011 UI Architecture

| 항목 | 값 |
|---|---|
| Document ID | MAOS-011 |
| Document Type | Enterprise Control Room & UI Architecture |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Principles
Control Room First, Structured State over Chat, Human Authority visible, Privacy by Interface, Domain Deep Link, Explicit State, Canonical Design System, Visual QA required.

Drill-down: Company → Project → Task → Agent → Run → Tool / Artifact / Evidence.

## 2. Global Navigation
Today, Projects, Tasks, Approvals, AI Company, Systems, Artifacts, Decisions, Memory, Skills, Tools, Runs, Alerts, Audit, Development.

## 3. Page Types
PT-01 Dashboard, PT-02 Two Panel, PT-03 List/Table, PT-04 Board/Kanban, PT-05 Form/Settings, PT-06 Report/Chart.

## 4. Screen Registry
UI-001 Today
UI-002 Projects
UI-003 Project Workspace
UI-004 Task Center
UI-005 Task Detail
UI-006 Workflow View
UI-007 AI Company
UI-008 Team Workspace
UI-009 Team Leader Chat
UI-010 Agent Registry
UI-011 Agent Detail
UI-012 Run Inspector
UI-013 Approval Center
UI-014 Systems
UI-015 System Detail
UI-016 Integration Center
UI-017 Artifact Center
UI-018 Decision Center
UI-019 Memory Center
UI-020 Skill Registry
UI-021 Tool Registry
UI-022 MCP Registry
UI-023 Runs
UI-024 Alerts
UI-025 Audit
UI-026 Global Search
UI-027 Notifications
UI-028 My Work
UI-029 Daily Review
UI-030 CRM Communication
UI-031 Development Workspace
UI-032 Preview Workspace
UI-033 Test & QA Center
UI-034 Deployment Center
UI-035 Settings / Governance
UI-036 Executive Reports
UI-037 Executive Chat

## 5. Approval UI
QA PASS, AI Recommendation, Human Approval을 분리 표시한다. Approval status와 validity도 분리한다.

## 6. Personal Work
Company / Personal / CRM을 구분하고 PRIVATE — ONLY YOU를 명확히 표시한다.

## 7. Development Loop
Render → Select → Inspect → Annotate → Source Locate → Fix Task → Agent Modification → Re-render → Visual QA.

## 8. Accessibility
WCAG 2.2 AA target.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
