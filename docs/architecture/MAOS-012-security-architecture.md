# MAOS-012 Security Architecture

| 항목 | 값 |
|---|---|
| Document ID | MAOS-012 |
| Document Type | Enterprise AI Security Architecture |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Principles
Zero Trust, Identity Before Action, Least Privilege, DENY > ALLOW, Separation of Duties, Fail Closed, No Secret in AI Context, Private Personal Boundary, Defense in Depth.

## 2. Trust Zones
Human Interface, MAOS Core Services, AI Execution / Runner, Tool / MCP, Domain Systems, External AI Providers, Internet / External Sources.

## 3. Identity
HUMAN, AGENT, SYSTEM. Agent identity는 Model과 분리하고 Shared root token을 금지한다.

## 4. Authorization
RBAC + Scope + Resource + Action + Risk + Environment.

## 5. Tool Security
Agent → Tool Gateway → Authorization → Approval → Secret Resolution → Tool.

## 6. MCP Trust
TRUSTED_INTERNAL, APPROVED_EXTERNAL, RESTRICTED, UNTRUSTED.
Version pinning, checksum, sandbox, capability allowlist.

## 7. Prompt Injection
Untrusted content는 instruction이 아니라 data다.
Policy precedence: Constitution/Security > Legal/Compliance > Company > Department/Domain > Project > Workflow > Tool defaults. Deny wins.

## 8. Data Classification
PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED, PRIVATE_PERSONAL.

## 9. Privacy
Employee Journal/Mood/Private Notes는 Manager/CEO/MAOS Agent에 기본 DENY.

## 10. Secrets
Secret Manager/Vault, Runtime injection, rotation, audit, no values in logs.

## 11. Security Controls
SEC-001 ~ SEC-034 baseline.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
