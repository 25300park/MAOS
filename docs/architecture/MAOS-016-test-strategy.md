# MAOS-016 Test Strategy

| 항목 | 값 |
|---|---|
| Document ID | MAOS-016 |
| Document Type | Enterprise Test & Verification Strategy |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Principles
Evidence over Assertion. Happy + Negative + Failure + Recovery. QA ≠ Test ≠ Approval. AI Output is untrusted until validated. Regression must stay fixed. Production Verification required.

## 2. Test Layers
T1 Static Validation
T2 Unit
T3 Component/Module
T4 Integration
T5 Contract
T6 Workflow
T7 Agent
T8 Tool/MCP
T9 Security
T10 UI/E2E
T11 Visual/Accessibility
T12 Performance/Reliability
T13 Production Verification

## 3. Agent Testing
Role compliance, task understanding, output schema, skill use, tool selection, memory scope, escalation, forbidden behavior.

## 4. Approval Tests
Valid approval, missing approval, expired/revoked/stale, target mismatch, version mismatch, deny precedence, authority expiry/revocation, SoD, QA≠Approval, fail-closed.

## 5. Security Tests
Authentication, MFA, RBAC, Scope, Private Workspace, Secret exposure, Prompt Injection, SSRF, Path Traversal, SQLi, XSS, CSRF, CORS, Webhook replay/signature, Rate Limit, Privilege Escalation, Kill Switch.

## 6. Memory Tests
Candidate promotion, ACL, stale/conflict, provenance, poisoning, supersede, context budget, privacy.

## 7. Test Result
PASS, FAIL, SKIPPED, BLOCKED. SKIPPED/BLOCKED ≠ PASS.

## 8. Release Gate
Critical test suites must pass against exact commit/artifact.

## 9. Registry
TST-001 ~ TST-036 baseline.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
