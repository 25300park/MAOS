import assert from "node:assert/strict";
import test from "node:test";
import { loadApiConfig } from "../src/index.js";

test("loads a valid API configuration", () => {
  assert.deepEqual(
    loadApiConfig({ MAOS_ENV: "development", API_PORT: "4100" }),
    {
      environment: "development",
      port: 4100,
      service: "api",
    },
  );
});

test("fails fast when MAOS_ENV is missing", () => {
  assert.throws(() => loadApiConfig({ API_PORT: "4100" }), /MAOS_ENV/);
});

test("fails fast when API_PORT is outside the TCP port range", () => {
  assert.throws(
    () => loadApiConfig({ MAOS_ENV: "development", API_PORT: "70000" }),
    /API_PORT/,
  );
});
