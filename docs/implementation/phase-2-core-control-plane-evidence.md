# Phase 2 Core Control Plane MVP Evidence

## Scope

Phase 2 generalizes the accepted Phase 1 foundations through a thin Control Plane composition layer. It does not replace the existing work, agent runtime, skill/tool, governance, observability, local bridge, memory gateway, quality, or release engines.

## Implemented boundaries

- Registered System, Environment, Repository, Workroot, Runner, and Integration metadata with explicit lifecycle, health, ownership, and source-of-truth fields.
- Bound Project, Task, and Run records without collapsing `Task != Run` or `Agent != Model != Runner`.
- Rejected cross-system and cross-project references and unavailable runners.
- Preserved domain-system ownership and denied cross-system writes by default.
- Added permission/approval decision enforcement with default deny at the API boundary.
- Added bounded Loop Policy and LoopRun control with human start/resume/cancel authority, tool allowlists, iteration/time/cost limits, no-progress stopping, and separate event/audit proof.
- Added a permission-scoped Core API projection and system-registration boundary.
- Added Control Plane registry/scope/loop metadata persistence only; no domain master data or secrets are stored.
- Added a Control Room multi-system projection and generalized Development Workspace work-scope fields.

## Canonical separation

- Agent = WHO; Model = HOW IT REASONS; Runner = WHERE IT EXECUTES.
- Task = WHAT; Run = an execution attempt.
- Skill resolution remains separate from Tool Permission.
- Event and Evidence remain distinct from Audit.
- Review and QA do not grant production approval.
- External domain systems remain their own sources of truth.

## Production boundary

Phase 2 neither resolves the tracked production gaps nor changes these gate results:

- `PRODUCTION_READY = NO`
- `PRODUCTION_DEPLOYMENT_APPROVED = NO`

No production credentials, real deployment, external mutation, or push is part of this evidence.

## Verification evidence

The final Phase 2 gate executes formatting, lint, type checking, all tests, build, clean database initialization, migration replay, module-boundary checks, repository secret/artifact scanning, `git diff --check`, and Git status inspection. Targeted tests cover registry uniqueness and isolation, task/run separation, domain ownership, permission/approval denial, bounded loop controls, API contracts, persistence constraints, UI projection escaping, and Development Workspace scope visibility.
