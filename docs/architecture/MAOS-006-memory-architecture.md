# MAOS-006 Memory Architecture

| 항목 | 값 |
|---|---|
| Document ID | MAOS-006 |
| Document Type | Memory Architecture |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Purpose
Memory는 장기 재사용 가능한 Curated Knowledge다. Raw Chat, Full Prompt, Log, Domain DB Clone이 아니다.

## 2. Trust Formula
`SOURCE + CLASSIFICATION + VALIDATION + SCOPE + PROVENANCE = TRUSTED MEMORY`

## 3. Lifecycle
RAW INFORMATION → CANDIDATE → VALIDATION → ACTIVE MEMORY → REFRESH / SUPERSEDE → ARCHIVE / DELETE.

## 4. Namespaces
`/company`, `/departments`, `/projects`, `/agents`, `/tasks`, `/decisions`, `/artifacts`, `/policies`, `/operations`, `/integrations`.

## 5. Types
CORPORATE, DEPARTMENT, PROJECT, AGENT, TASK, DECISION, POLICY, OPERATIONAL, INTEGRATION.

## 6. Candidate Status
PENDING, APPROVED, REJECTED, MERGED, EXPIRED.
MERGED는 merged_into_memory_id 또는 merged_into_candidate_id를 가진다.

## 7. Validation
UNVERIFIED, SYSTEM_VERIFIED, AGENT_VERIFIED, HUMAN_VERIFIED, AUTHORITATIVE.

## 8. Classification
PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED, PRIVATE_PERSONAL.

## 9. Context Priority
Task Instructions > Current Approved Decisions > Project Constraints > Required Artifacts > Relevant Memory > General Corporate Policy.

## 10. Privacy
Private Journal, Mood, Personal Notes는 Corporate Search와 Executive View에 기본 포함되지 않는다.

## 11. Memory Gateway
기존 AI Memory Gateway를 Adapter로 재사용한다.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
