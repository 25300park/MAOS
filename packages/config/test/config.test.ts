import assert from "node:assert/strict";
import test from "node:test";
import {
  loadApiConfig,
  loadDatabaseConfig,
  loadProductionConfig,
} from "../src/index.js";

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

test("accepts the provider PORT contract for staging API execution", () => {
  assert.deepEqual(loadApiConfig({ MAOS_ENV: "staging", PORT: "8080" }), {
    environment: "staging",
    port: 8080,
    service: "api",
  });
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

test("loads production configuration using environment-specific references only", () => {
  assert.deepEqual(
    loadProductionConfig({
      BACKUP_KEY_REFERENCE: "secretref://maos/production/backup-key",
      DATABASE_SECRET_REFERENCE: "secretref://maos/production/database",
      DEPLOYMENT_PROVIDER_REFERENCE: "providerref://maos/production",
      MAOS_AUTO_MIGRATE: "false",
      MAOS_DEBUG: "false",
      MAOS_ENV: "production",
      MAOS_PUBLIC_ORIGIN: "https://control.maos.example",
      MAOS_SERVICE_IDENTITY: "system-maos-production",
    }),
    {
      autoMigrate: false,
      backupKeyReference: "secretref://maos/production/backup-key",
      databaseSecretReference: "secretref://maos/production/database",
      debug: false,
      deploymentProviderReference: "providerref://maos/production",
      environment: "production",
      publicOrigin: "https://control.maos.example",
      serviceIdentity: "system-maos-production",
    },
  );
});

test("rejects unsafe production defaults and plaintext credentials", () => {
  const valid = {
    BACKUP_KEY_REFERENCE: "secretref://maos/production/backup-key",
    DATABASE_SECRET_REFERENCE: "secretref://maos/production/database",
    DEPLOYMENT_PROVIDER_REFERENCE: "providerref://maos/production",
    MAOS_AUTO_MIGRATE: "false",
    MAOS_DEBUG: "false",
    MAOS_ENV: "production",
    MAOS_PUBLIC_ORIGIN: "https://control.maos.example",
    MAOS_SERVICE_IDENTITY: "system-maos-production",
  };
  assert.throws(
    () => loadProductionConfig({ ...valid, MAOS_DEBUG: "true" }),
    /PRODUCTION_DEBUG_FORBIDDEN/,
  );
  assert.throws(
    () =>
      loadProductionConfig({
        ...valid,
        DATABASE_SECRET_REFERENCE: "postgresql://user:password@db/maos",
      }),
    /SECRET_REFERENCE_REQUIRED/,
  );
  assert.throws(
    () => loadProductionConfig({ ...valid, MAOS_PUBLIC_ORIGIN: "http://maos" }),
    /HTTPS_ORIGIN_REQUIRED/,
  );
  assert.throws(
    () => loadProductionConfig({ ...valid, MAOS_AUTO_MIGRATE: "true" }),
    /PRODUCTION_AUTO_MIGRATE_FORBIDDEN/,
  );
});
