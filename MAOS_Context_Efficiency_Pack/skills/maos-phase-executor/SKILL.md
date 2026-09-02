---
name: maos-phase-executor
description: Execute exactly one MAOS implementation phase with minimal context and verified evidence.
---

1. Read `AGENTS.md`.
2. Read `docs/handoff/CURRENT.md`.
3. Read the current `docs/context/phase-*.md`.
4. Read only architecture docs listed as required.
5. Inspect only source files relevant to the phase.
6. State architecture conflicts before changing code.
7. Implement only current-phase scope.
8. Run required verification.
9. Summarize actual evidence.
10. Stop after PASS/REVISE; never start the next phase automatically.

Context discipline: search before large reads; avoid generated files, lockfiles, huge logs, and unrelated modules.
