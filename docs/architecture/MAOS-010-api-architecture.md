# MAOS-010 API Architecture

| 항목 | 값 |
|---|---|
| Document ID | MAOS-010 |
| Document Type | API & Integration Contract Architecture |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Principle
API는 Stable Contract다.
`API CONTRACT = RESOURCE + ACTION + SCHEMA + AUTHENTICATION + AUTHORIZATION + VERSION + ERROR + AUDIT`
Base: `/api/v1/`, Internal: `/internal/v1/`.

## 2. API Groups
API-001 Organization
API-002 Department
API-003 Project
API-004 Task
API-005 Workflow
API-006 Agent
API-007 Run
API-008 Model
API-009 Runner
API-010 Skill
API-011 Tool
API-012 Approval
API-013 Review
API-014 Decision
API-015 Artifact
API-016 Evidence
API-017 Memory
API-018 Conversation
API-019 System / Integration
API-020 Notification
API-021 Audit / Event
API-022 Deployment
API-023 Release
API-024 Environment
API-025 Build
API-026 Incident
API-027 Change
API-028 Runbook
API-029 Test Run

## 3. HTTP Governance
401 Authentication failure.
403 Permission / Authority denied.
409 Resource / Workflow / Governance conflict.
422 Structurally valid but unprocessable business input.

## 4. Async
Request → 202 → Task/Run → Worker → Event/Status → Result.
Task는 Business Work, Job은 Technical Execution이다.

## 5. Standard Error
ok=false, stable error.code, type, severity, retryable, details, meta.request_id/correlation_id.

## 6. Events
Canonical event naming: `RESOURCE.ACTION`.
예: TASK.CREATED, RUN.FAILED, APPROVAL.APPROVED, DEPLOYMENT.SUCCEEDED.

## 7. Security
Human / Agent / System identity, resource/field-level authorization, no unrestricted execute, no raw secrets, internal API도 authenticated.

## 8. Concurrency
Optimistic locking, idempotency, atomic task claim, valid-state approval updates.

## 9. Adapters
ADP-001 AI Memory Gateway
ADP-002 Marketing Agent
ADP-003 AI MLS
ADP-004 CRM
ADP-005 RBS Homes
ADP-006 Admin RBS Homes
ADP-007 Accounting
ADP-008 HR

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
