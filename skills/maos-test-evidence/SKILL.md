---
name: maos-test-evidence
description: Verify MAOS implementation claims using real command output and concise evidence.
---

1. Read current phase verification gates.
2. Run only required commands.
3. Capture command, exit status, pass/fail count, and critical error lines.
4. Summarize large logs; do not paste entire logs.
5. Never convert SKIPPED/BLOCKED into PASS.
6. Never infer success without execution.
7. PASS only when every mandatory gate passes.
