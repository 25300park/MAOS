# MAOS-CR-001 — Connect AI Pattern Adoption

| 항목 | 값 |
|---|---|
| Change Request | MAOS-CR-001 |
| Baseline | MAOS Architecture v1.0 FROZEN |
| Target | MAOS Architecture v1.1 Candidate |
| Class | C2 Minor Architecture |
| Status | PROPOSED / USER-DIRECTED |
| Scope | Additive only; no redesign |

## 1. Purpose
Connect AI에서 확인된 장점을 MAOS에 선택적으로 반영한다.
기존 MAOS v1.0의 Project, Task, Workflow, Agent, Skill, Tool, Approval, Memory, Audit,
Security, Deployment 구조는 유지한다.

## 2. Adopt
1. CEO/Chief of Staff 중심 Hierarchical Orchestration
2. Goal-driven autonomous operating cycle
3. Task execution loop: execute → verify → revise → retry
4. Review loop: draft → critique → revise → verify
5. Company operating loop: observe → detect gap → plan → act → measure → replan
6. Learning loop: result → evidence → memory candidate → skill/process improvement
7. Local Model Provider support through Ollama / LM Studio adapters
8. AI Company activity visibility in Control Room UI
9. Daily briefing / unattended-operation summary concept
10. Event / schedule / condition / goal-gap driven loop triggers

## 3. Do Not Adopt
- unrestricted filesystem/terminal access
- automatic force-push
- chat as Source of Truth
- free-running agent-to-agent conversation as core orchestration
- Second Brain duplication inside MAOS
- 100% local-only model restriction
- bypass of Approval / Tool Gateway / Security policies

## 4. Governance
All autonomous loops remain subject to:
Task validity, Permission, Authority, Tool Risk, Approval, Exact Target,
Retry Budget, Cost Budget, Kill Switch, Audit and Human Override.

## 5. System Boundary
AI Memory Gateway:
- conversation/archive/import
- memory/retrieval/provenance
- summarization
- memory candidate lifecycle

MAOS:
- goal
- project/task/workflow
- agent/model/runner
- context policy
- tool permission
- review/approval
- run/audit
- loop orchestration
- deployment

## 6. Phase Integration
### Phase 1
Add a bounded Development Loop MVP after System Development Agent Team is operational.

### Phase 2
Generalize loop primitives into the Core Control Plane:
Goal, Trigger, LoopPolicy, LoopRun, Evaluation, Replan.

### Phase 10
Activate cross-domain Enterprise Operating Loop across CRM, AI-MLS, RBS, PBN, ERP and Marketing.

### Phase 13
Add learning/optimization loops based on verified outcomes, cost and quality.

## 7. Acceptance
This CR is additive and must not reopen MAOS v1.0 architectural foundations.
