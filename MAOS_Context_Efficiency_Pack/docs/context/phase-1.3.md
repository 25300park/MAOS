# Phase 1.3 Context Manifest — Repository / Project Bootstrap

## Read First
1. `AGENTS.md`
2. `docs/handoff/CURRENT.md`
3. This file

## Required Architecture
Read only:
- MAOS-000 Project Constitution
- MAOS-001 System Architecture
- MAOS-010 API Architecture
- MAOS-013 Observability Architecture
- MAOS-015 Development Standards
- MAOS-016 Test Strategy
- MAOS-017 Deployment Architecture

Read other architecture documents only if a specific conflict arises.

## Scope
Create/verify:
- npm workspace root
- `apps/web`, `apps/api`, `apps/worker`
- module skeletons
- shared packages
- bootstrap contracts
- config validation
- structured logging
- request/correlation context
- unit/integration/contract test scaffolding
- lint/typecheck/test/build scripts
- API health endpoints

## Contract Seed
Use architecture-defined values only. Bootstrap groups may include:
- ActorType
- ReviewStatus
- ApprovalStatus
- ApprovalValidity
- ToolRisk
- ToolCallStatus

Architecture wins if wording conflicts.

## Explicit Non-Goals
No DB engine, Auth, Approval Engine, Workflow Engine, Agent Runtime, Memory integration, Tool/MCP runtime, production deployment, or domain integration.

## Verification
Run install, lint, typecheck, tests, build, API health smoke tests, boundary checks, and git status.

## Final Recommendation
Allowed:
- `PASS_PHASE_1_3`
- `REVISE_PHASE_1_3`

Stop after the Phase 1.3 report.
