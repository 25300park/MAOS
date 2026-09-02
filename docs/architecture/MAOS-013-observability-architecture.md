# MAOS-013 Observability Architecture

| 항목 | 값 |
|---|---|
| Document ID | MAOS-013 |
| Document Type | Observability Architecture |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Principle
Observability = Logs + Metrics + Traces + Events + Audit.
단 Log ≠ Metric ≠ Trace ≠ Event ≠ Audit.

## 2. Correlation
request_id, correlation_id, trace_id/span_id, project_id, task_id, workflow_instance_id, run_id, tool_call_id, approval_id, artifact_id, system_id, actor_id.

End-to-end: UI/API → Orchestrator → Task/Workflow → Agent Run → Model Call → Tool Gateway → Tool/MCP → Adapter → Domain System → Artifact/Event.

## 3. Logging
Structured logging. Secret, raw private journal, credential, hidden CoT를 로그하지 않는다.
Levels: DEBUG, INFO, WARN, ERROR, FATAL.

## 4. Metrics
Project, Task, Workflow, Agent, Model, Runner, Skill, Tool/MCP, API, Integration, Approval, Memory, Cost, Security, Quality를 분리 측정한다.

## 5. Health
HEALTHY, DEGRADED, UNAVAILABLE, MAINTENANCE, UNKNOWN. UNKNOWN ≠ HEALTHY.

## 6. Alerts
Severity: INFO, NOTICE, WARNING, CRITICAL.
State: OPEN, ACKNOWLEDGED, RESOLVED, SUPPRESSED.

## 7. Cost
Run Cost → Task → Project → Department → Company AI Cost.

## 8. Registry
OBS-001 ~ OBS-035 baseline.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
