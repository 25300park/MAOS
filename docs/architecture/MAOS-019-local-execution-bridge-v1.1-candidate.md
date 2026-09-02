# MAOS-019 — Local Execution Bridge / IDE Companion Architecture
## v1.1 Candidate

| 항목 | 값 |
|---|---|
| Document ID | MAOS-019 |
| Version | v1.1 Candidate |
| Status | PROPOSED |
| Change Class | C2 Minor Architecture |
| Baseline | MAOS Architecture v1.0 FROZEN |

## 1. Purpose

MAOS 전체를 VS Code Extension으로 전환하지 않고,
로컬 PC의 파일 시스템, Git, 터미널, 브라우저, 로컬 모델 및 개발 도구를
안전하게 사용할 수 있는 Local Execution Bridge를 둔다.

## 2. Principle

MAOS Control Plane ≠ IDE Extension.

MAOS는 Web/Server 기반 Enterprise Control Plane을 유지한다.
IDE Extension 또는 Local Daemon은 MAOS의 Runner/Tool Provider 중 하나로 동작한다.

## 3. Responsibilities

Local Execution Bridge may provide:
- READ_FILE
- WRITE_FILE
- CREATE_FILE
- DELETE_FILE
- LIST_DIRECTORY
- RUN_COMMAND
- GIT_STATUS / DIFF / COMMIT / BRANCH / WORKTREE
- LOCAL_BROWSER / UI INSPECTION hook
- LOCAL_MODEL access (Ollama / LM Studio)
- local service health inspection
- local artifact collection

## 4. Governance

Every local action must still pass:
Identity
→ Task scope
→ Tool Permission
→ Tool Risk
→ Approval when required
→ Execution
→ Evidence
→ Audit

The bridge never grants authority by itself.

## 5. Security

- default deny
- workspace allowlist
- command allow/deny policy
- path boundary enforcement
- secret redaction
- no unrestricted shell by default
- destructive actions require elevated risk classification
- production credentials remain external secret references
- kill switch and session revocation
- signed/identified runner registration

## 6. UX

The IDE Companion may show:
- current MAOS Task
- assigned Agent
- current Run
- files changed
- command executed
- test result
- approval required
- next action
- pause/stop

Cinematic or animated visualization may be used only as a supplementary UX layer.
Canonical status must always be represented by structured state, text, badges, timeline and evidence.

## 7. Offline / Local-first

The bridge may continue low-risk approved local work when MAOS policy allows.
MAOS remains hybrid/provider-neutral, not 100% local-only.

## 8. Phase Placement

Recommended insertion:

Phase 1.10  Skill / Tool / MCP
→ Phase 1.10A Local Execution Bridge / IDE Companion MVP
→ Phase 1.11 AI Memory Gateway Integration

Phase 1.13 Control Room UI:
- add Agent activity visualization
- add Run timeline / current step visualization
- add IDE deep link / local runner status

Phase 2:
- generalize Runner Registry and remote/local execution providers

## 9. Non-Goals

- converting MAOS into a VS Code-only product
- bypassing Tool Gateway
- unrestricted local terminal control
- automatic production deployment
- replacing Codex / Claude Code
- requiring all company users to use an IDE

## 10. Architectural Result

MAOS remains the enterprise brain/control plane.
Local Execution Bridge becomes one of its hands.
