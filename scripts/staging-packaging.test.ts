import assert from "node:assert/strict";
import test from "node:test";
import { validateStagingPackaging } from "./staging-packaging.js";

test("validates Vercel and Railway staging packaging without secret values", () => {
  assert.deepEqual(validateStagingPackaging(), {
    api: "READY",
    region: "asia-southeast1-eqsg3a",
    secrets: "REFERENCES_ONLY",
    vercel: "READY",
    worker: "READY",
  });
});
