---
name: maos-systematic-debug
description: Debug MAOS failures without broad rewrites or uncontrolled context expansion.
---

1. Reproduce the failure.
2. Record the exact command/request and smallest useful error output.
3. Identify the failing layer.
4. Search exact symbols/errors before opening large files.
5. Form one root-cause hypothesis at a time.
6. Make the smallest safe change.
7. Re-run the failing test first, then affected regressions.
8. Check architecture boundaries.
9. Do not opportunistically refactor unrelated code.
