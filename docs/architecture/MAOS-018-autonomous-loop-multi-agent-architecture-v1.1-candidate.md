# MAOS-018 — Autonomous Loop Multi-Agent Architecture
## v1.1 Candidate

| 항목 | 값 |
|---|---|
| Document ID | MAOS-018 |
| Version | v1.1 Candidate |
| Status | PROPOSED |
| Change Class | C2 Minor Architecture |
| Baseline | MAOS Architecture v1.0 FROZEN |

## 1. Objective
MAOS의 Multi-Agent 구조를 일회성 Dispatch에서
Governed Closed-Loop Multi-Agent Operation으로 확장한다.

## 2. Core Loop
GOAL
→ OBSERVE
→ DETECT GAP / EVENT
→ PLAN
→ DECOMPOSE
→ ASSIGN
→ EXECUTE
→ VERIFY
→ REVIEW
→ DECIDE
→ LEARN
→ REPLAN
→ repeat

## 3. Four Loop Types
### L1 Execution Loop
Task → Execute → Verify → Fix/Retry → Complete/Escalate

### L2 Review Loop
Artifact → Review → Revise → Re-review → Accept/Block

### L3 Operating Loop
Company Goal → Observe State → Detect Gap → Create Actions → Measure Outcome → Replan

### L4 Learning Loop
Verified Result → Evidence → Memory Candidate → Pattern Evaluation → Skill/Workflow Improvement Candidate

## 4. Loop Control Objects
- Goal
- Trigger
- LoopPolicy
- LoopRun
- Evaluation
- ReplanDecision
- Budget
- StopCondition

## 5. Trigger Types
- EVENT
- SCHEDULE
- CONDITION
- GOAL_GAP
- DEADLINE
- FAILURE
- HUMAN_REQUEST

## 6. Stop Conditions
- GOAL_REACHED
- MAX_ITERATIONS
- TIME_BUDGET_EXCEEDED
- COST_BUDGET_EXCEEDED
- RISK_ESCALATION
- WAITING_HUMAN
- APPROVAL_REQUIRED
- NO_PROGRESS
- KILL_SWITCH
- FATAL_ERROR

## 7. Agent Collaboration
Default:
Task → Artifact → Review Task → Feedback Artifact → Revision Task

Free-running agent conversation is not the canonical control mechanism.

## 8. Human Authority
Autonomy never overrides:
- Permission
- Authority
- Approval
- Environment policy
- Security policy
- Privacy boundary
- Kill switch

## 9. Local Model Support
Local providers are optional Model Providers:
- Ollama
- LM Studio

Model Router may choose local models for privacy, cost, offline or low-risk work.
MAOS remains provider-neutral and may also use approved cloud providers.

## 10. Control Room Additions
Recommended UI additions:
- Company Goal status
- Current Loop Runs
- Why this task was created
- Trigger source
- Agent currently working
- Last verified result
- Next planned action
- Waiting approval
- Loop budget / iteration count
- Stop / Pause / Resume
- Daily AI Company Briefing

## 11. Memory Boundary
MAOS decides what context is needed.
AI Memory Gateway retrieves governed memory.
Learning results enter Memory Gateway only as candidates until validation.

## 12. Development Team Dogfooding
The System Development Team is the first Loop MVP:

Requirement
→ Plan
→ Implement
→ Test
→ QA
→ Revise
→ Re-test
→ Human Approval
→ Deploy
→ Verify
→ Learn

MAOS may use this loop to improve MAOS itself, but self-modification never bypasses normal
code review, tests, approval and deployment gates.

## 13. Phase Placement
- Phase 1.15A — Development Loop Runtime MVP
- Phase 1.16 — Preview / UI Inspector / Test / QA
- Phase 1.17 — Release / Approval / Deployment
- Phase 1.19 — E2E Loop Verification
- Phase 2 — Generalized Loop Engine
- Phase 10 — Enterprise Cross-System Operating Loop
- Phase 13 — Learning / Optimization Loop

## 14. Non-Goals
- autonomous unrestricted production modification
- unlimited recursive agent loops
- automatic architecture rewriting
- uncontrolled self-improvement
- replacing AI Memory Gateway
- moving all domain systems into MAOS
