# MAOS-017 Deployment Architecture

| 항목 | 값 |
|---|---|
| Document ID | MAOS-017 |
| Document Type | Release & Deployment Architecture |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Principles
Build Once, Promote Same Artifact. Deployment ≠ Release. Deployment ≠ Completion. Exact Artifact Deployment. Production Protected. Rollback Prepared Before Deploy. Configuration Deployment Governed. Domain Systems Deploy Independently. No Silent Production Change.

## 2. Deployable Units
APPLICATION, DATABASE_MIGRATION, AGENT_DEFINITION, SKILL, WORKFLOW_DEFINITION, POLICY, TOOL_CONFIGURATION, MCP_CONFIGURATION, INTEGRATION_ADAPTER, INFRASTRUCTURE_CONFIGURATION.

## 3. Release
Release = Source Commit + Artifacts + Configuration Versions + Test Evidence. Release Candidate는 immutable하다.

## 4. Environments
DEVELOPMENT → PREVIEW → STAGING → PRODUCTION. 가능한 동일 Artifact를 승격한다.

## 5. Production Gate
Release valid, tests PASS, QA PASS, Security PASS if required, Approval valid, target unchanged, rollback ready, production healthy.

## 6. Deployment Status
REQUESTED, VALIDATING, QUEUED, DEPLOYING, VERIFYING, SUCCEEDED, FAILED, ROLLING_BACK, ROLLED_BACK, CANCELLED.

## 7. Verification
Health + Smoke + Changed Feature + Integration Verification.

## 8. Database
Versioned Migration, Expand/Contract, Backup Gate, Migration Lock, Rollback/Forward Fix plan.

## 9. Agent / Skill / Workflow / Policy Deployment
각각 versioned deployable configuration이며 신규 Run/Instance에 version activation을 적용한다.

## 10. Domain Systems
AI MLS, Marketing, CRM 등은 독립 Release Lifecycle을 유지하고 Adapter Compatibility를 관리한다.

## 11. Registry
DEP-001 ~ DEP-036 baseline.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
