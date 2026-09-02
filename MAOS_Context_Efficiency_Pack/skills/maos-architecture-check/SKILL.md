---
name: maos-architecture-check
description: Check proposed MAOS changes against frozen architecture without redesigning the system.
---

1. Read global instructions and current phase manifest.
2. Identify exact changed files/entities/statuses/APIs.
3. Read only architecture documents governing those items.
4. Check semantics, source-of-truth, module boundaries, enums, authority/approval, privacy/security, API/event consistency.
5. Classify: PASS / MINOR ISSUE / ARCHITECTURE CONFLICT / CHANGE REQUEST REQUIRED.
6. Do not rewrite architecture unless explicitly authorized.
7. Recommend the smallest correction that restores compliance.
