# MAOS Development Implementation Guide v1.1 Candidate

**Document ID:** MAOS-DIG-001  
**Status:** CANDIDATE — Development Navigation Guide  
**Architecture Baseline:** MAOS Architecture v1.0 FROZEN  
**Purpose:** Codex / Claude Code / MAOS Development Agents implementation guidance  
**Rule:** This guide does not replace canonical architecture documents. If a conflict exists, frozen architecture and approved Change Requests take precedence.

---

## 1. Purpose

MAOS is a **Human-led Autonomous Multi-Agent Enterprise Operating System**.

Target operating loop:

```text
GOAL → OBSERVE → DETECT GAP/EVENT → PLAN → DECOMPOSE → ASSIGN
→ EXECUTE → VERIFY → REVIEW → DECIDE → LEARN → REPLAN ↺
```

MAOS is the **Enterprise Control Plane / Control OS** that coordinates human employees, AI specialist teams, independent business systems, approvals, evidence, deployment, and operating loops.

MAOS must not become a mega-application that replaces every domain system.

---

## 2. Architecture Authority

Canonical architecture lives under:

```text
D:\10. MAOS\docs\architecture\
```

MAOS Architecture v1.0 is frozen. Architecture changes must follow:

```text
Issue → Change Request → Impact Analysis → Classification
→ Decision / Approval → Architecture Version → Implementation
```

Change classes: C1 Editorial / C2 Minor / C3 Major / C4 Constitutional.

v1.1 additions in this guide are additive candidates until formally approved/frozen.

---

## 3. Canonical Semantics

```text
Agent = WHO
Task = WHAT
Skill = HOW
Memory = WHAT IS KNOWN
Tool/MCP = WHAT CAN ACT
Workflow = IN WHAT ORDER
Model = HOW IT REASONS
Runner = WHERE IT EXECUTES
Approval = MAY
Artifact = RESULT
Evidence = PROOF OF RESULT
Audit = PROOF OF WHO DID WHAT
```

Always preserve:

```text
Task != Run != Job
Event != Audit
AuthN != AuthZ
Review != Approval
QA PASS != Production Approval
Agent != Model != Runner
Skill != Tool Permission
Chat != Source of Truth
AI Output != Trusted Action
```

Human authority always remains above AI authority.

---

## 4. MAOS System Boundary

MAOS manages enterprise coordination, not domain ownership.

MAOS owns/control-plane responsibility for:

- Organization / Department
- Project / Task / Workflow
- Agent / Model Policy / Runner
- Skill / Tool / Permission
- Run / ToolCall
- Review / Approval / Decision
- Artifact / Evidence
- Release / Deployment
- System / Integration Registry
- Audit / Alert / Operating Loop

Independent systems retain domain source-of-truth ownership.

Systems include:

```text
AI-MLS
CRM
RBS
PBN
ERP
Marketing Automation
AI Memory Gateway
```

A System is not an Agent.

---

## 5. AI Memory Gateway Boundary

AI Memory Gateway answers: **What do we know?**  
MAOS answers: **What must be done, by whom, with what, and may it execute?**

Keep in AI Memory Gateway:

- conversation ingestion/archive
- recent buffer / long-term memory
- summaries
- AI conversation imports
- knowledge search/retrieval
- provenance / dedup / quality
- memory API
- gateway backup/restore/monitoring

MAOS owns:

- tasks/workflows
- agents/runs/tool calls
- approval/authority/review
- deployments
- enterprise audit
- cross-system orchestration
- loop control

Context flow:

```text
MAOS decides required context
→ AI Memory Gateway retrieves relevant knowledge
→ MAOS builds Task-specific context
→ Agent executes
```

Do not build a duplicate Second Brain/Vault inside MAOS.

---

## 6. System Development Team

Native MAOS development team roles:

1. Development Lead
2. Requirement / Product Agent
3. Architecture Agent
4. UI / UX Agent
5. Frontend Agent
6. Backend Agent
7. Database Agent
8. Functional Test Agent
9. UX QA Agent
10. Security Review Agent
11. DevOps / Deployment Agent

The team may develop/update MAOS, CRM, AI-MLS, RBS, PBN, ERP, Marketing integrations, and future company systems.

Self-development does not mean self-approval.

---

## 7. Development Loop

```text
Human Request
→ Requirement
→ Architecture Impact
→ Plan
→ Implementation
→ Automated Test
→ Functional QA
→ UX QA
→ Security Review
→ Preview
→ Human Approval
→ Production Deployment
→ Post-deploy Verification
→ Learning
→ Replan ↺
```

AI may not bypass approval, deployment, security, privacy, or audit gates.

---

## 8. Test / UX QA Architecture

### Functional Test Agent
Verifies expected behavior, API/UI contracts, defined flows, and regressions.

### UX QA Agent
Uses the product as a real user and detects:

- excessive clicks
- repeated data entry
- unclear next actions
- confusing navigation
- poor error messages
- workflow friction

### Visual QA Agent
Checks layout, responsiveness, overflow, alignment, missing elements, readability, and visual regression.

### Workflow Scenario Agent
Tests full user goals rather than isolated screens.

### Regression Agent
After fixes:

```text
Issue → Developer Fix → Targeted Re-test → Regression Test → UX Re-test → PASS/REVISE
```

Tester and Developer remain separate roles. QA findings create Issues/Evidence; developers implement fixes through the governed workflow.

Recommended UX issue contract:

```text
UX-ISSUE-ID
Screen
Persona
Scenario
Severity
Problem
Evidence
Expected Behavior
Recommendation
Screenshot/Artifact
Reproduction Steps
```

---

## 9. CRM Human Work UX

CRM is the primary daily work system for human employees. MAOS is not the main daily UI for ordinary employees.

CRM should evolve into a **Human Work OS**, not merely a CRUD database.

Primary navigation:

```text
Today
My Tasks
Customers
Listings
Calendar
Documents
Reports
Search
```

### Natural-language work capture

One human input should be structured into appropriate Customer / Listing / Activity / Task / Schedule / Report records where possible.

Avoid duplicate manual entry.

### Activity visibility

Employees should understand:

- What I did
- What AI did
- What teammate did
- What happens next
- What is waiting
- What requires approval

Do not expose internal terms such as ToolCall or MemoryCandidate to ordinary staff.

### AI Assistant pattern

AI appears in context beside customers, listings, tasks, schedules, and documents rather than forcing employees into a separate AI console.

### Privacy

```text
WORK DATA → governed business visibility
PRIVATE DATA → employee-only unless explicitly shared
```

Private notes, mood, journal, and personal reflections must not automatically appear in management views.

---

## 10. Argo Reference

Argo is a reference architecture, not MAOS source of truth.

Useful patterns:

- Company / Crew visibility
- Task / Activity visibility
- Runner abstraction / fallback
- Workroots
- Device pairing
- Routines
- Tool classification
- maxTurns / timeout / usage / cost tracking
- AI-company UX

MAOS mapping:

```text
Argo Workroot → MAOS System/Project/Repository/Workspace reference
Argo Device Pairing → Runner Registration / Local Execution Bridge
Argo Runner Fallback → Model / Runner Runtime
Argo Routine → Loop / Workflow Runtime
Argo Vault → AI Memory Gateway reference
```

---

## 11. Connect AI Reference

Useful patterns:

- hierarchical CEO/specialist orchestration
- goal-driven autonomous cycle
- agent activity visualization
- daily briefing
- local model option
- loop multi-agent behavior

Do not adopt:

- unrestricted filesystem/shell
- automatic force-push
- chat as source of truth
- uncontrolled free-running agent conversation
- duplicate Second Brain
- mandatory local-only architecture

---

## 12. Local Execution Bridge / IDE Companion

MAOS Control Plane is not an IDE extension. A local daemon/IDE companion is one Runner/Tool Provider.

Potential capabilities:

- file read/write/create/delete/list
- command execution
- git status/diff/commit/branch/worktree
- local browser/UI inspection
- local model access
- artifact collection

Authorization chain:

```text
Identity → Task Scope → Tool Permission → Tool Risk → Approval
→ Execution → Evidence → Audit
```

Capability is not authority.

Required controls include default deny, workspace allowlist, path boundary, command policy, secret redaction, elevated destructive actions, runner registration, kill switch, and revocation.

---

## 13. Marketing Automation System

Marketing Automation remains an independent AI team/system.

Conceptual 10-agent team:

1. CMO
2. Strategy
3. Data Analysis
4. Ads
5. Content
6. Copy
7. Design
8. YouTube
9. QA
10. Publisher

Target channels include Blog, TikTok, Instagram, YouTube, and other approved channels.

MAOS does not micromanage internal content production. MAOS monitors:

- campaign goal/status
- tasks
- QA
- CEO approval
- publisher readiness
- channel state
- KPI
- budget/cost
- alerts/failures
- cross-system opportunities

Example:

```text
CRM detects BGC 2BR demand growth
→ MAOS detects opportunity
→ Marketing System receives campaign request
→ Marketing Team executes
→ QA / Approval / Publisher
→ performance returns to MAOS
→ compare with CRM/RBS outcomes
→ replan
```

---

## 14. Philippines Tax / Accounting / Legal AI Team

Dedicated professional AI team:

1. Finance & Compliance Lead
2. PH Accounting Agent
3. PH Tax Agent
4. Payroll & Statutory Agent
5. Labor Compliance Agent
6. Corporate Legal Agent
7. Contract Review Agent
8. Real Estate Legal Agent
9. Regulatory Research Agent
10. Compliance QA Agent

ERP remains operational source of truth for accounting/HR/labor data.

AI team may research, calculate, classify, draft, review, identify risks, monitor deadlines, and gather evidence.

Final legal/tax/regulatory authority remains with an authorized human professional where required.

---

## 15. Enterprise Team Model

Two broad working modes:

### Human Work Teams
Primary UX is CRM or another domain application. MAOS receives abstractions such as workload, overdue work, capacity, risks, blockers, approvals, and milestones.

### AI Specialist Teams
Examples: Development, Marketing, PH Tax/Accounting/Legal. These may have their own internal workflows; MAOS coordinates and monitors at enterprise level.

---

## 16. Loop Multi-Agent Architecture

Target: **Governed Closed-Loop Multi-Agent Enterprise**.

### L1 Execution Loop
```text
Task → Execute → Verify → Fix/Retry → Complete/Escalate
```

### L2 Review Loop
```text
Artifact → Review → Revise → Re-review → Accept/Block
```

### L3 Operating Loop
```text
Company Goal → Observe State → Detect Gap → Create Actions → Measure Outcome → Replan
```

### L4 Learning Loop
```text
Verified Result → Evidence → Memory Candidate → Pattern Evaluation
→ Skill/Workflow Improvement Candidate
```

Candidate control objects:

- Goal
- Trigger
- LoopPolicy
- LoopRun
- Evaluation
- ReplanDecision
- Budget
- StopCondition

Triggers: EVENT, SCHEDULE, CONDITION, GOAL_GAP, DEADLINE, FAILURE, HUMAN_REQUEST.

Stop conditions include GOAL_REACHED, MAX_ITERATIONS, TIME_BUDGET_EXCEEDED, COST_BUDGET_EXCEEDED, RISK_ESCALATION, WAITING_HUMAN, APPROVAL_REQUIRED, NO_PROGRESS, KILL_SWITCH, FATAL_ERROR.

---

## 17. Agent Collaboration Contract

Preferred governed collaboration:

```text
Task → Artifact → Review Task → Feedback Artifact → Revision Task
```

Avoid uncontrolled free-running AI-to-AI conversation as source of truth.

---

## 18. MAOS Control Room UX

Control Room should answer:

- What are company goals?
- What is running now?
- Why was this task created?
- Who/which agent owns it?
- What happened last?
- What happens next?
- What is blocked?
- What requires approval?
- Which systems are unhealthy?
- What changed since the last briefing?

Important views include Goals, Loop Runs, Tasks, Projects, Systems, Agents, Runs, Approvals, Alerts, Evidence, Deployments, and Daily AI Company Briefing.

Structured status is more important than decorative/cinematic visualization.

---

## 19. Physical Architecture Rule

Do not move all systems into `D:\10. MAOS`.

Systems may remain on AWS, Vercel, Railway, Supabase, local PCs, NAS, or other approved infrastructure.

MAOS provides logical centralization through registries:

- System
- Environment
- Repository
- Workspace / Workroot
- Health
- Deployment
- Runner
- Integration

Secrets are stored as references, not plaintext.

---

## 20. Phase 1 Implementation Order

| Phase | Scope |
|---|---|
| 1.3 | Repository / Project Bootstrap |
| 1.4 | Core Database Foundation |
| 1.5 | Core API Foundation |
| 1.6 | Identity / Security / Permission |
| 1.7 | Approval / Authority |
| 1.8 | Project / Task / Workflow Engine |
| 1.9 | Agent / Model / Runner Runtime |
| 1.10 | Skill / Tool / MCP |
| 1.10A | Local Execution Bridge / IDE Companion MVP |
| 1.11 | AI Memory Gateway Integration |
| 1.12 | Observability / Audit |
| 1.13 | MAOS Control Room UI |
| 1.14 | System Development Workspace |
| 1.15 | System Development Agent Team |
| 1.15A | Development Loop Runtime MVP |
| 1.16 | Preview / UI Inspector / Test / QA |
| 1.17 | Release / Approval / Deployment |
| 1.18 | RBS / Admin Pilot |
| 1.19 | Full E2E + Loop Verification |
| Final | MVP Go / No-Go |

Do not reorder phases casually.

---

## 21. Phase 1.16 QA Expansion

Future detailed QA sub-phases:

- 1.16A Functional Test Agent
- 1.16B UX QA Agent
- 1.16C Visual QA Agent
- 1.16D Workflow Scenario Agent
- 1.16E Regression Agent
- 1.16F Developer Fix Loop
- 1.16 Final QA Loop Verification

These do not change current Phase 1.3 scope.

---

## 22. Enterprise Roadmap

| Phase | Focus |
|---|---|
| 2 | Core Control Plane / Generalized Loop |
| 3 | AI Memory & Knowledge Integration |
| 4 | Marketing Automation Integration |
| 5 | AI-MLS Integration |
| 6 | CRM / Brokerage / Human Work Integration |
| 7 | RBS / Admin Integration |
| 8 | ERP / Accounting / Tax Integration |
| 9 | HR / Labor Integration |
| 9A | PH Legal / Regulatory AI Team Integration |
| 10 | Enterprise Cross-System Orchestration |
| 11 | Operations / Reliability / Security Hardening |
| 12 | Enterprise Production Readiness |
| 13 | Optimization / Learning / Expansion |

---

## 23. CRM Phase 6 Direction

Future Phase 6 includes:

- CRM MVP inventory
- MAOS ↔ CRM integration contract
- Human Work UX redesign
- Natural Language Work Capture
- Daily / Weekly / Monthly work loop
- Document Workspace
- Employee AI Assistant
- Task / Schedule / Follow-up automation
- Manager view
- MAOS operational integration
- 3-employee pilot
- Human + AI CRM Go / No-Go

CRM is updated by the MAOS development team; it is not rebuilt from zero without an approved decision.

---

## 24. Context-Efficient Development

Use this hierarchy:

```text
1. AGENTS.md
2. docs/handoff/CURRENT.md
3. Current Phase Context Manifest
4. Relevant SKILL.md
5. Required architecture documents only
6. Relevant source files only
```

Principle: **Carry current state, not full history.**

Do not send full historical conversation context when state files already contain the required information.

---

## 25. Default MAOS Codex Start Prompt

All future Phase instructions use this base:

```text
Read AGENTS.md, docs/handoff/CURRENT.md, and the current Phase Context Manifest.

Use skills/maos-phase-executor/SKILL.md.

Continue the current Phase only.

Do not read all architecture documents.
Read only the architecture documents required by the Phase Context Manifest.

Inspect only the source files relevant to the current Phase.

Run actual verification required by the Phase.

Do not begin the next Phase automatically.

Stop after the current Phase result report.
```

Each Phase adds only its goal, required architecture, implementation scope, non-goals, verification, acceptance criteria, and report format.

---

## 26. Token / Context Efficiency Rules

Codex / Claude Code should:

- search before opening large files
- use focused file/range reads
- avoid `node_modules`
- avoid generated build output
- avoid complete lockfile reads
- avoid full historical logs
- inspect `git diff --stat` before large diffs
- review changed files and related architecture only
- use concise error/tail extracts
- avoid repeatedly reading unchanged architecture
- avoid global codebase analysis unless required

Cross-review:

```text
Developer
→ Change Summary
→ Changed Files
→ Tests
→ Known Risks
→ Reviewer reads relevant architecture + changed scope only
```

---

## 27. Skill Usage

Use only the skill required by the task:

- `maos-phase-executor` — normal Phase implementation
- `maos-architecture-check` — architecture conflict
- `maos-test-evidence` — PASS verification
- `maos-systematic-debug` — bug/failure
- `maos-ui-review` — UI/UX work

Do not load every skill every session.

---

## 28. Test / Evidence Rule

Never claim PASS from reasoning alone.

PASS requires actual current-phase verification. Evidence may include command, exit code, test count, health response, screenshot, artifact, git status, or relevant error lines.

`SKIPPED`, `BLOCKED`, `NOT_RUN`, or inferred success are not PASS.

---

## 29. Security / Authority Baseline

Tool risk:

- R0 READ_ONLY
- R1 LOW_RISK_WRITE
- R2 CONTROLLED_WRITE
- R3 EXTERNAL_ACTION
- R4 CRITICAL_ACTION

Approval statuses:

- PENDING
- APPROVED
- REJECTED
- EXPIRED
- REVOKED
- CANCELLED

Approval validity includes VALID, STALE, TARGET_MISMATCH, VERSION_MISMATCH, AUTHORITY_INVALID, POLICY_INVALID, CONSUMED.

APPROVED + STALE must block execution/reapproval is required.

Production authority and approval are separate.

---

## 30. Human UX Principle

Ordinary employee systems should optimize:

- next action visibility
- minimum typing/clicks
- no duplicate reporting
- clear status/ownership/blockers
- natural-language capture
- contextual AI assistance
- easy document creation
- consistent navigation
- privacy boundaries

MAOS Control Room may be structurally rich. CRM should remain operationally simple.

---

## 31. AI Team Monitoring Principle

For independent AI teams MAOS should know:

- goal
- health
- active work
- blockers
- cost
- risk
- approvals
- outcomes
- evidence

MAOS does not need every internal prompt or every agent conversation in its primary management view.

---

## 32. Development Governance

Before implementing a feature:

```text
Request → Scope → Architecture Impact → Current Phase?
→ Required Context → Implementation → Verification → Review → Approval if required
```

Avoid opportunistic feature creep. Do not implement future-phase functionality merely because it is convenient.

---

## 33. Current Development State

```text
Phase 0 Architecture Foundation = COMPLETE / FROZEN v1.0
Phase 1.1 MVP Scope = COMPLETE
Phase 1.2 Implementation Breakdown = COMPLETE
Phase 1.3 Repository / Project Bootstrap = CURRENT / NOT COMPLETE
```

Phase 1.3 must complete before Phase 1.4.

---

## 34. Phase 1.3 Scope Reminder

Allowed:

- npm workspace
- apps/web
- apps/api
- apps/worker
- module skeletons
- shared contracts
- config validation
- structured logging
- request/correlation IDs
- health endpoints
- tests
- CI quality sequence

Not allowed:

- DB implementation
- Auth
- Approval Engine
- Workflow Engine
- Agent Runtime
- Memory integration
- Tool runtime
- full Control Room UI
- production deployment
- domain integrations

---

## 35. Reference Architecture Rule

Argo and Connect AI are references only. Use them to improve UX, runner implementation, workroot design, activity visibility, autonomous cycles, daily briefing, and local execution.

They must not override MAOS governance, security, source-of-truth, or architecture freeze rules.

---

## 36. Definition of Success

MAOS succeeds when:

1. Human CEO retains final authority.
2. Human employees work naturally in domain tools.
3. AI teams operate autonomously within policy.
4. AI teams collaborate through governed tasks/artifacts.
5. Independent systems remain connected without forced physical centralization.
6. Actions are observable, reviewable, and auditable.
7. High-risk actions require correct authority and approval.
8. Results create evidence.
9. Verified results can become learning.
10. The organization repeatedly observes → acts → verifies → improves.

Target operating model:

> **One Human CEO + Human Employees + Governed AI Specialist Teams + Connected Business Systems.**

---

## 37. Candidate Freeze Recommendation

This guide may be used immediately as the **development navigation baseline** for Phase 1.3.

- MAOS Architecture v1.0 remains the frozen architecture.
- MAOS-018 / MAOS-019 remain v1.1 Candidate architecture until formally reviewed and approved.
- `CURRENT.md` and Phase Context Manifests carry changing execution state.
- This guide should remain an implementation navigation guide, not a chronological project log.

---

## 38. Developer Final Instruction

Before coding:

```text
Read AGENTS.md
→ Read CURRENT.md
→ Read current Phase Context Manifest
→ Read this guide only when system-level orientation is needed
→ Read required canonical architecture only
→ Inspect relevant code
→ Execute current Phase
→ Verify
→ Report
→ Stop
```

Do not begin a later phase without explicit instruction.

---

**END — MAOS Development Implementation Guide v1.1 Candidate**
