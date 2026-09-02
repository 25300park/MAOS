# MAOS-009 Approval Architecture

| 항목 | 값 |
|---|---|
| Document ID | MAOS-009 |
| Document Type | Approval Architecture |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Principle
Human은 최종 Business Authority다. Review와 Approval을 분리한다.

## 2. Approval Status
PENDING, APPROVED, REJECTED, EXPIRED, REVOKED, CANCELLED.

## 3. Approval Validity
VALID, STALE, TARGET_MISMATCH, VERSION_MISMATCH, AUTHORITY_INVALID, POLICY_INVALID, CONSUMED.
status=APPROVED, validity=STALE일 수 있으며 실행은 차단된다.

## 4. Authority Resolver
AUTHORIZED, DENIED, REQUIRES_ADDITIONAL_APPROVAL, UNKNOWN.
UNKNOWN은 BLOCK.

## 5. Exact Target
System, Environment, Resource, Artifact, Commit, Release, Customer, Transaction을 정확히 바인딩한다.

## 6. Separation of Duties
Author ≠ Reviewer ≠ Approver ≠ Executor 를 논리적으로 분리한다.

## 7. Delegation
Scoped, expiring, revocable.

## 8. Runtime Revalidation
Execution 직전 approval status, validity, target, version/hash, authority, permission, policy, environment를 재검증한다.

## 9. Chat Approval
Message → Intent → Target Resolution → Authority → Explicit Confirmation → Approval Record.

## 10. R4
Human approval, step-up/MFA, target-bound execution control을 기본으로 한다.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
