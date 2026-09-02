import assert from "node:assert/strict";
import test from "node:test";
import { loadApiConfig, loadDatabaseConfig } from "../src/index.js";

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

test("loads a PostgreSQL database URL from runtime configuration", () => {
  assert.deepEqual(
    loadDatabaseConfig({ DATABASE_URL: "postgresql://localhost/maos" }),
    { databaseUrl: "postgresql://localhost/maos" },
  );
});

test("fails fast when DATABASE_URL is missing or is not PostgreSQL", () => {
  assert.throws(() => loadDatabaseConfig({}), /DATABASE_URL/);
  assert.throws(
    () => loadDatabaseConfig({ DATABASE_URL: "file:local.db" }),
    /PostgreSQL/,
  );
});
