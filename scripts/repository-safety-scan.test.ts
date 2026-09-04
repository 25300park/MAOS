import assert from "node:assert/strict";
import test from "node:test";
import { scanEntries } from "./repository-safety-scan.js";

test("rejects protected local artifacts and high-confidence credentials", () => {
  assert.deepEqual(
    scanEntries([
      {
        content: "DATABASE_URL=postgresql://user:real-password@db/maos",
        path: ".env.production",
      },
      {
        content: "-----BEGIN " + "PRIVATE KEY-----",
        path: "config/deploy.pem",
      },
      {
        content: "token=ghp_" + "abcdefghijklmnopqrstuvwxyz1234567890",
        path: "src/leak.ts",
      },
      { content: "compiled", path: "apps/api/dist/index.js" },
    ]),
    [
      ".env.production:PROTECTED_PATH",
      "config/deploy.pem:PROTECTED_PATH",
      "src/leak.ts:HIGH_CONFIDENCE_SECRET",
      "apps/api/dist/index.js:GENERATED_ARTIFACT",
    ],
  );
});

test("allows secret references and explicit synthetic redaction fixtures", () => {
  assert.deepEqual(
    scanEntries([
      {
        content: 'credential_reference: "secretref://maos/production/database"',
        path: "src/config.ts",
      },
      {
        content: 'authorization: "Bearer must-not-render"',
        path: "test/redaction.test.ts",
      },
    ]),
    [],
  );
});
