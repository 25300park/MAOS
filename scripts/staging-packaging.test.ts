import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { validateStagingPackaging } from "./staging-packaging.js";

test("builds database before operations for the Vercel runtime", () => {
  const webPackage = JSON.parse(
    readFileSync(resolve("apps/web/package.json"), "utf8"),
  ) as { scripts: { prebuild: string } };

  assert.equal(
    webPackage.scripts.prebuild,
    "npm run build --workspace @maos/logging && npm run build --workspace @maos/database && npm run build --workspace @maos/module-operations && npm run build --workspace @maos/config",
  );
});

test("validates Vercel and Railway staging packaging without secret values", () => {
  assert.deepEqual(validateStagingPackaging(), {
    api: "READY",
    region: "asia-southeast1-eqsg3a",
    secrets: "REFERENCES_ONLY",
    vercel: "READY",
    worker: "READY",
  });
});
