# MAOS-014 Operations Architecture

| 항목 | 값 |
|---|---|
| Document ID | MAOS-014 |
| Document Type | Operations Architecture |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Principles
Operability by Design, Every Service Has an Owner, Controlled Production Change, Rollback Before Deploy, Backup ≠ Recovery, Alert ≠ Incident, Risk-based Fail Safe/Fail Closed, Domain Autonomy, Human Override, Incident Learning.

## 2. Environments
DEVELOPMENT, STAGING / PREVIEW, PRODUCTION.

## 3. Runbook
Purpose, Symptoms, Checks, Diagnosis, Safe Actions, Escalation, Rollback, Recovery, Verification.

## 4. Deployment Operations
Build → Test → QA → Security → Artifact Freeze → Approval → Deploy → Health → Post-deploy Verification.

## 5. Incident Lifecycle
DETECTED → ACKNOWLEDGED → INVESTIGATING → MITIGATING → RECOVERED → RESOLVED → POSTMORTEM.
Severity: SEV-1 CRITICAL, SEV-2 HIGH, SEV-3 MEDIUM, SEV-4 LOW.

## 6. Operations Targets
Agent, Model Provider, Runner, Tool, MCP, Integration, Queue, Worker, Scheduler, Database, Memory Gateway.

## 7. Backup / Recovery
Backup은 Restore Test와 함께 검증한다. RPO/RTO는 실제 운영 Baseline 후 수치화한다.

## 8. Business Continuity
MAOS Failure ≠ Total Company Failure. Domain Systems는 가능한 범위에서 독립 운영한다.

## 9. Registry
OPS-001 ~ OPS-032 baseline.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
