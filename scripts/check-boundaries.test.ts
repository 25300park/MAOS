import assert from "node:assert/strict";
import test from "node:test";
import { validateDependency } from "./check-boundaries.js";

test("prevents shared packages from depending on applications or modules", () => {
  assert.equal(
    validateDependency("packages/logging/src/index.ts", "@maos/api"),
    "packages cannot import apps or modules",
  );
  assert.equal(
    validateDependency(
      "packages/logging/src/index.ts",
      "@maos/module-orchestration",
    ),
    "packages cannot import apps or modules",
  );
});

test("allows modules to depend on shared packages but not applications", () => {
  assert.equal(
    validateDependency("modules/orchestration/src/index.ts", "@maos/contracts"),
    undefined,
  );
  assert.equal(
    validateDependency("modules/orchestration/src/index.ts", "@maos/api"),
    "modules cannot import apps",
  );
});
