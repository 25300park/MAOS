# MAOS-008 Tool & MCP Architecture

| 항목 | 값 |
|---|---|
| Document ID | MAOS-008 |
| Document Type | Tool & MCP Architecture |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Principle
Agent → Skill → Runner → Tool Gateway → Tool/MCP → External System.

## 2. Canonical Tool Types
FILESYSTEM, CLI, API, DATABASE, BROWSER, MCP, DEPLOYMENT, VERSION_CONTROL, COMMUNICATION, STORAGE, OBSERVABILITY.

## 3. Tool Risk
R0 READ_ONLY, R1 LOW_RISK_WRITE, R2 CONTROLLED_WRITE, R3 EXTERNAL_ACTION, R4 CRITICAL_ACTION.

## 4. Capability
각 Capability는 action_type, risk_level, requires_approval, environment_scope를 가진다.
Action: READ, WRITE, EXECUTE, ADMIN.

## 5. Tool Permission
ALLOW, DENY, ALLOW_WITH_APPROVAL.
Effective Permission = Agent Permission ∩ Workflow Permission ∩ Project Policy ∩ Environment Policy ∩ Human Authority.

## 6. Tool Status / Health
Lifecycle: DRAFT, TESTING, ACTIVE, DISABLED, DEPRECATED, ARCHIVED.
Health: HEALTHY, DEGRADED, UNAVAILABLE, MAINTENANCE, UNKNOWN.

## 7. ToolCall Status
REQUESTED, AUTHORIZING, WAITING_APPROVAL, AUTHORIZED, EXECUTING, SUCCEEDED, FAILED, DENIED, TIMED_OUT, CANCELLED.

## 8. Secrets
Secrets는 prompt, memory, artifact, chat, Git, audit metadata에 포함하지 않는다.

## 9. MCP
MCP는 transport/capability provider다. Trust, version pinning, capability mapping, health, sandbox가 필요하다.

## 10. Domain Access
Domain API 우선. Direct Domain DB Write는 기본 금지.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
