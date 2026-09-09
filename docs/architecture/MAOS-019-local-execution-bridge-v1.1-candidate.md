# MAOS-019 — Local Execution Bridge / IDE Companion Architecture
## MAOS Architecture v1.1

| 항목 | 값 |
|---|---|
| Document ID | MAOS-019 |
| Version | 1.1 |
| Status | APPROVED / FROZEN |
| Change Class | C2 Minor Architecture |
| Previous Baseline | MAOS Architecture v1.0 FROZEN |
| Approval | MAOS-CR-002 |
| Freeze Record | MAOS-FRZ-002 |

## 1. Purpose

MAOS 전체를 VS Code Extension으로 전환하지 않고,
로컬 PC의 파일 시스템, Git, 터미널, 브라우저, 로컬 모델 및 개발 도구를
안전하게 사용할 수 있는 Local Execution Bridge를 둔다.

## 2. Principle

MAOS Control Plane ≠ IDE Extension.

MAOS는 Web/Server 기반 Enterprise Control Plane을 유지한다.
IDE Extension 또는 Local Daemon은 MAOS의 Runner/Tool Provider 중 하나로 동작한다.
The Tool Gateway is the mandatory execution path for every bridge action. Device identity, runner
identity, registration, health and local possession expose capability only; they do not grant Tool
Permission, Approval or production authority.

## 3. Responsibilities

Implemented MVP capability foundation:
- READ_FILE
- WRITE_FILE
- RUN_COMMAND
- GIT_STATUS
- GIT_DIFF

Optional capabilities requiring separate implementation and security evidence:
- CREATE_FILE / DELETE_FILE / LIST_DIRECTORY
- GIT_COMMIT / GIT_BRANCH / GIT_WORKTREE
- LOCAL_BROWSER / UI_INSPECTION
- LOCAL_MODEL access (Ollama / LM Studio)
- LOCAL_SERVICE_INSPECTION / LOCAL_SERVICE_CONTROL
- LOCAL_ARTIFACT_COLLECTION / ARTIFACT_UPLOAD

The following table defines minimum risk and default Approval treatment. Environment, data
classification, command, target and policy may raise risk but may never lower it.

| Capability | Minimum Tool Risk | Approval rule |
|---|---|---|
| READ_FILE, LIST_DIRECTORY, GIT_STATUS, GIT_DIFF, LOCAL_SERVICE_INSPECTION | R0 READ_ONLY | No Approval by default; exact permission and scope remain required |
| WRITE_FILE, CREATE_FILE, RUN_COMMAND, GIT_COMMIT, GIT_BRANCH, GIT_WORKTREE | R2 CONTROLLED_WRITE | Exact human Approval required by default |
| DELETE_FILE, LOCAL_SERVICE_CONTROL | R2 CONTROLLED_WRITE | Exact human Approval required; elevate broad, destructive or protected-target actions to R4 |
| UI_INSPECTION, LOCAL_BROWSER read-only inspection | R0 READ_ONLY | No Approval by default; exact permission and scope remain required |
| LOCAL_BROWSER external action, ARTIFACT_UPLOAD | R3 EXTERNAL_ACTION | Exact human Approval required |
| LOCAL_MODEL local inference | R0 READ_ONLY | No Approval by default; data-classification and context-export policy remain required |
| Any production, credential, security-control or irreversible action | R4 CRITICAL_ACTION | Independent exact human Approval and production authority required |

An optional capability is unavailable by default until registered with its exact action type,
environment, risk, command/path policy and evidence contract.

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
Each request binds an exact ToolCall to project, Task, Run, environment, device, runner, workroot,
capability, Tool/Policy version and, when required, Approval target/version/hash. The Tool Gateway
revalidates current provider/runner health, permission, risk, Approval and revocation state before
execution. A mismatch or missing value fails closed.

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
- signed and identified runner registration

Device identity and runner identity are distinct. Registration must bind both identities to an
approved provider, capability set, workroots, policy version and credential/attestation lifecycle.
Metadata may be recorded for an identified but unverified runner, but it is non-executable until
its signed registration or approved equivalent is verified. Enrollment, rotation, expiry, replay
protection and revocation freshness are required; runner health never substitutes for identity or
authorization.

Filesystem containment uses canonical filesystem identity, not lexical prefix checks alone:

- canonicalize and verify the configured workroot and existing target before access;
- resolve symlinks, Windows junctions and reparse points and deny any target whose resolved object
  leaves the approved workroot;
- normalize drive, separator and case semantics for the host filesystem;
- for creation, canonicalize the existing parent and verify the final child remains contained;
- bind the opened object to the validated target and revalidate where needed to prevent
  time-of-check/time-of-use replacement.

Command execution is an executable-plus-arguments contract bound to the approved workroot. The
policy allowlists executables, arguments, working directory and environment variables, limits
output, and rejects shell composition/metacharacters by default. Results and evidence are redacted
before logging or persistence. Timeout, cancellation, kill and revocation remain enforceable while
the command is active.

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

Online authority validation is the default. The bridge fails closed whenever current identity,
permission, Approval, policy, task/run scope or revocation freshness cannot be verified.

Offline work is limited to R0 and explicitly approved R1 actions under a short-lived, signed lease
that binds the exact identity, runner, project, Task, Run, environment, workroot, capability,
target, Tool/Policy version, budget and expiry. Offline execution is denied for R2–R4, production,
destructive, credential, security-control and external actions. Expired, mismatched, consumed or
revoked leases fail closed. On reconnection, evidence and audit records are reconciled before new
work; reconciliation never retroactively grants authority.

MAOS remains hybrid/provider-neutral, not 100% local-only.

## 8. Phase Placement

| Implementation evidence | Candidate compatibility |
|---|---|
| Phase 1.10 — Skill / Tool / MCP | ToolCall, permission, risk, Approval, timeout, cancellation and evidence gates |
| Phase 1.10A — Local Execution Bridge MVP | identified task-scoped runner, workroot, bounded capabilities, command policy, redaction, health and revocation |
| Phase 1.13 — Control Room UI | structured runner, Run, evidence and Approval visibility |
| Phase 2 — Core Control Plane | generalized System, Environment, Repository, Workroot and Runner registries |

Signed registration, link-aware filesystem containment, offline leases and optional expanded
capabilities require separate implementation and security evidence. Current evidence is
non-production and does not establish production readiness.

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
It remains a Runner/Tool Provider behind the Tool Gateway and owns no Task truth, Tool Permission,
Approval, source-of-truth data or production authority.
