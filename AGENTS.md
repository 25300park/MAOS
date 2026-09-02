# MAOS Global Agent Instructions

## Source of Truth
- `docs/architecture/` is canonical.
- MAOS Architecture v1.0 is frozen.
- Do not silently change frozen architecture.
- Architecture changes require an explicit Change Request.
- v1.1 candidate documents remain proposals until approved.

## Canonical Semantics
- Agent = WHO
- Task = WHAT
- Skill = HOW
- Memory = WHAT IS KNOWN
- Tool/MCP = WHAT CAN ACT
- Workflow = IN WHAT ORDER
- Model = HOW IT REASONS
- Runner = WHERE IT EXECUTES
- Approval = MAY
- Artifact = RESULT
- Evidence = PROOF OF RESULT
- Audit = PROOF OF WHO DID WHAT

Also preserve: Task != Run; Review != Approval; QA PASS != Production Approval; Agent != Model != Runner; Skill != Tool Permission; Chat is not Source of Truth; AI output is not trusted action until validated and authorized.

## Human Authority
- Human authority is always above AI authority.
- AI must not bypass approval, security, privacy, deployment, or authority gates.
- Private employee data remains private unless explicit sharing/policy allows otherwise.

## Repository Boundary
- Primary MAOS repository: `D:\\10. MAOS`
- Do not modify external systems unless the current task explicitly includes them.
- AI-MLS, CRM, RBS, PBN, ERP, Marketing Automation, and AI Memory Gateway remain independent systems/repositories by default.

## Context-Efficiency Rule
- DO NOT read every architecture document automatically.
- First read `docs/handoff/CURRENT.md`.
- Then read the current phase manifest under `docs/context/`.
- Read only architecture documents and source files named by that manifest.
- Expand context only for a concrete conflict, dependency, or missing fact.
- Prefer search/grep before opening large files.
- Avoid `node_modules`, build output, full lockfiles, and large logs unless required.

## Development Rules
- Work on the current phase only.
- Do not begin the next phase automatically.
- Preserve module boundaries.
- Prefer configuration over hardcoding.
- Never place secrets in code, logs, memory, prompts, artifacts, or test fixtures.

## Verification Rule
Never claim PASS from static reasoning alone. Run the verification required by the current phase and report actual results.

## Reporting
Default final implementation report:
- Phase
- Scope
- Files Added/Modified
- Verification
- Architecture Violations
- Remaining Issues
- Git Status
- FINAL RECOMMENDATION: PASS / REVISE

Stop after the report.
