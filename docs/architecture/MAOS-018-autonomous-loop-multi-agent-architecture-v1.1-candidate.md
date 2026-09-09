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
- Goal: `goal_id`, owner, project/system scope, objective, success criteria, version and status.
- Trigger: `trigger_id`, type, source identity, source reference, project/system/environment scope,
  observed-at time, payload hash, policy version and idempotency key.
- LoopPolicy: `loop_policy_id`, version, autonomy level, allowed tools, budget, stop conditions,
  approval requirements and named human control authority.
- LoopRun: `loop_run_id`, Goal/Trigger/LoopPolicy references, project/system/environment scope,
  correlation ID, iteration, usage, current status, current Task/Run references and evidence references.
- Evaluation: the schema in Section 4.1.
- ReplanDecision: the schema in Section 4.2.
- Budget: maximum iterations, elapsed time and cost/usage limits. Exhaustion stops the LoopRun;
  it never silently expands a limit.
- StopCondition: one canonical value from Section 6, with actor, time, reason and evidence references.

### 4.1 Evaluation Schema

An Evaluation is immutable evidence for one LoopRun iteration and contains:

- `evaluation_id`, `loop_run_id`, `loop_run_version`, `iteration`
- evaluator identity and evaluator role
- evaluated Task, Run and Artifact references
- outcome: `PASS`, `REVISE`, `WAITING_HUMAN`, `NO_PROGRESS`, `RISK_ESCALATION`,
  `KILL_SWITCH` or `FATAL_ERROR`
- criteria version, result hash, evidence references, cost/usage and evaluated-at time
- correlation ID and idempotency key

An Evaluation may recommend the next action but does not grant Approval or deployment authority.
Review and QA outcomes remain distinct from Approval.

### 4.2 ReplanDecision Schema

A ReplanDecision is a version-bound decision derived from an Evaluation and contains:

- `replan_decision_id`, `loop_run_id`, `loop_run_version`, `evaluation_id`
- decision: `CONTINUE`, `RETRY`, `REVISE_PLAN`, `PAUSE`, `WAITING_HUMAN`,
  `REQUEST_APPROVAL`, `STOP` or `ESCALATE`
- reason, next Task/Workflow reference, policy version and remaining budget snapshot
- deciding actor, required authority, evidence references, decided-at time and idempotency key

A ReplanDecision cannot expand scope, budget, Tool Permission, autonomy level or environment authority.
Such a change requires a new authorized policy version and, where applicable, exact human Approval.

### 4.3 Lifecycle and Idempotency

LoopRun status is:
`CREATED`, `RUNNING`, `PAUSED`, `WAITING_HUMAN`, `WAITING_APPROVAL`, `STOPPED`,
`COMPLETED`, `FAILED`, `CANCELLED` or `ESCALATED`.

- Only an authorized Trigger may create a LoopRun. A LoopRun becomes `RUNNING` only after its
  identity, scope and LoopPolicy version are validated.
- `WAITING_HUMAN` and `WAITING_APPROVAL` are non-executing states. Resume requires current
  authority and policy revalidation.
- A terminal LoopRun cannot be reopened. Continued work requires a new linked LoopRun.
- Trigger and LoopRun creation are idempotent by scoped idempotency key. Replaying the same key
  and payload returns the existing result; reusing the key with a different payload is denied.
- An Evaluation and ReplanDecision are unique for their LoopRun version and iteration. Replays of
  the same immutable hash are idempotent; stale versions, mismatched hashes and conflicting
  decisions are rejected.
- State transitions use version checks so concurrent or stale writers fail closed.

## 5. Trigger Types

Implemented baseline triggers:
- HUMAN_REQUEST
- TASK
- WORKFLOW

Generalized triggers proposed by this candidate:
- EVENT
- SCHEDULE
- CONDITION
- GOAL_GAP
- DEADLINE
- FAILURE

Every Trigger must carry authenticated source provenance, observed-at time, payload hash,
project/system/environment scope, LoopPolicy version and an idempotency key. Before creating a
LoopRun, MAOS verifies source trust, freshness, deduplication, scope, policy authorization and the
named human control authority. Missing, stale, duplicated, mismatched or unauthorized trigger
context fails closed. A non-human Trigger may request work but cannot grant permission, Approval,
budget expansion or production authority.

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
Task != Run and Review != Approval. Agents collaborate through scoped, versioned Task, Artifact,
Evidence and Review references; a message or model output is not execution or approval authority.

## 8. Human Authority
Autonomy never overrides:
- Permission
- Authority
- Approval
- Environment policy
- Security policy
- Privacy boundary
- Kill switch

The LoopPolicy identifies the human authority allowed to start, pause, resume, cancel and kill a
LoopRun for the exact project and environment. Authority and Approval are evaluated separately.
Where Approval is required, it binds the approval ID and approver to the exact LoopRun, action,
target ID, target version/hash, policy version, environment and validity window. Separation of
duties and runtime revalidation apply; stale, mismatched, consumed, expired or revoked Approval is
rejected. Loop completion, Evaluation PASS, Review or QA never creates Approval.

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
→ Deploy Preparation
→ Separately Authorized Environment Deployment
→ Verify
→ Learn

MAOS may use this loop to improve MAOS itself, but self-modification never bypasses normal
code review, tests, approval and deployment gates.
Production deployment additionally requires the frozen release, security, operations and exact
human production-approval gates. Loop completion, QA or this candidate never authorizes production.

## 13. Phase Placement

| Implementation evidence | Candidate compatibility |
|---|---|
| Phase 1.15A — Development Loop Runtime MVP | bounded Development Loop, task/artifact/evidence chain, budgets and stop conditions |
| Phase 2 — Core Control Plane | reusable LoopPolicy/LoopRun, registry scope and human control |
| Phase 10 — Enterprise Cross-System Orchestration | bounded reference-only operating loop with domain ownership preserved |
| Phase 13 — Optimization / Learning / Expansion | verified-result improvement candidates without self-approval or automatic activation |

This evidence is non-production. Generalized Trigger types and broader autonomy behavior remain
subject to their own implementation, security and verification evidence.

## 14. Non-Goals
- autonomous unrestricted production modification
- unlimited recursive agent loops
- automatic architecture rewriting
- uncontrolled self-improvement
- replacing AI Memory Gateway
- moving all domain systems into MAOS
