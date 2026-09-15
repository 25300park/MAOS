import assert from "node:assert/strict";
import test from "node:test";
import {
  loadAlertEmailConfig,
  loadApiConfig,
  loadDatabaseConfig,
  loadProductionConfig,
  loadStagingCoreBootstrapConfig,
  loadStagingSessionApiConfig,
  loadStagingSessionBffConfig,
  loadStagingOperationsAuthConfig,
} from "../src/index.js";

const stagingCoreBootstrapEnv = {
  MAOS_ENV: "staging",
  MAOS_STAGING_BFF_SERVICE_BEARER_TOKEN: "synthetic-bff-token",
  MAOS_STAGING_CORE_BOOTSTRAP_ACTOR_ID: "human-staging-bootstrap-owner",
  MAOS_STAGING_CORE_BOOTSTRAP_BEARER_TOKEN: "synthetic-bootstrap-token",
  MAOS_STAGING_CORE_BOOTSTRAP_DEPARTMENT_ID:
    "00000000-0000-4000-8000-000000005002",
  MAOS_STAGING_CORE_BOOTSTRAP_DEPARTMENT_NAME: "Platform Operations",
  MAOS_STAGING_CORE_BOOTSTRAP_ENABLED: "true",
  MAOS_STAGING_CORE_BOOTSTRAP_ORGANIZATION_ID:
    "00000000-0000-4000-8000-000000005001",
  MAOS_STAGING_CORE_BOOTSTRAP_ORGANIZATION_NAME: "MAOS Staging",
  MAOS_STAGING_CORE_BOOTSTRAP_ORGANIZATION_SLUG: "maos-staging",
  MAOS_STAGING_CORE_BOOTSTRAP_PROJECT_ID:
    "00000000-0000-4000-8000-000000005003",
  MAOS_STAGING_CORE_BOOTSTRAP_PROJECT_NAME: "MAOS",
  MAOS_STAGING_IDENTITY_ADMIN_BEARER_TOKEN: "synthetic-admin-token",
  MAOS_STAGING_OPERATIONS_BEARER_TOKEN: "synthetic-operations-token",
  MAOS_STAGING_SESSION_CREDENTIAL_BEARER_TOKEN: "synthetic-session-token",
};

test("loads an immutable staging Core bootstrap manifest and dedicated credential", () => {
  assert.deepEqual(loadStagingCoreBootstrapConfig(stagingCoreBootstrapEnv), {
    actorId: "human-staging-bootstrap-owner",
    bearerToken: "synthetic-bootstrap-token",
    enabled: true,
    manifest: {
      departmentId: "00000000-0000-4000-8000-000000005002",
      departmentName: "Platform Operations",
      organizationId: "00000000-0000-4000-8000-000000005001",
      organizationName: "MAOS Staging",
      organizationSlug: "maos-staging",
      projectId: "00000000-0000-4000-8000-000000005003",
      projectName: "MAOS",
      scope: "project-maos",
    },
  });
  assert.deepEqual(loadStagingCoreBootstrapConfig({ MAOS_ENV: "staging" }), {
    enabled: false,
  });
});

test("fails closed for invalid or overlapping staging Core bootstrap configuration", () => {
  for (const name of [
    "MAOS_STAGING_CORE_BOOTSTRAP_ACTOR_ID",
    "MAOS_STAGING_CORE_BOOTSTRAP_BEARER_TOKEN",
    "MAOS_STAGING_CORE_BOOTSTRAP_ORGANIZATION_ID",
    "MAOS_STAGING_CORE_BOOTSTRAP_ORGANIZATION_NAME",
    "MAOS_STAGING_CORE_BOOTSTRAP_ORGANIZATION_SLUG",
    "MAOS_STAGING_CORE_BOOTSTRAP_DEPARTMENT_ID",
    "MAOS_STAGING_CORE_BOOTSTRAP_DEPARTMENT_NAME",
    "MAOS_STAGING_CORE_BOOTSTRAP_PROJECT_ID",
    "MAOS_STAGING_CORE_BOOTSTRAP_PROJECT_NAME",
  ]) {
    assert.throws(
      () =>
        loadStagingCoreBootstrapConfig({
          ...stagingCoreBootstrapEnv,
          [name]: undefined,
        }),
      new RegExp(`${name}_(?:REQUIRED|INVALID)`),
    );
  }
  for (const name of [
    "MAOS_STAGING_BFF_SERVICE_BEARER_TOKEN",
    "MAOS_STAGING_IDENTITY_ADMIN_BEARER_TOKEN",
    "MAOS_STAGING_OPERATIONS_BEARER_TOKEN",
    "MAOS_STAGING_SESSION_CREDENTIAL_BEARER_TOKEN",
  ]) {
    assert.throws(
      () =>
        loadStagingCoreBootstrapConfig({
          ...stagingCoreBootstrapEnv,
          [name]: "synthetic-bootstrap-token",
        }),
      /STAGING_CORE_BOOTSTRAP_CREDENTIAL_MUST_BE_DISTINCT/,
    );
  }
  assert.throws(
    () =>
      loadStagingCoreBootstrapConfig({
        ...stagingCoreBootstrapEnv,
        MAOS_ENV: "production",
      }),
    /STAGING_CORE_BOOTSTRAP_FORBIDDEN/,
  );
});

const stagingSessionEnv = {
  MAOS_CORE_API_ORIGIN: "https://maos-api-staging.example.test",
  MAOS_ENV: "staging",
  MAOS_STAGING_BFF_CSRF_SECRET: "synthetic-csrf-secret",
  MAOS_STAGING_BFF_SERVICE_BEARER_TOKEN: "synthetic-service-token",
  MAOS_STAGING_CONTROL_ROOM_ORIGIN: "https://maos-web-staging.example.test",
  MAOS_STAGING_IDENTITY_ADMIN_ACTOR_ID: "human-staging-identity-admin",
  MAOS_STAGING_IDENTITY_ADMIN_BEARER_TOKEN: "synthetic-admin-token",
  MAOS_STAGING_SESSION_CREDENTIAL_BEARER_TOKEN: "synthetic-session-token",
  MAOS_STAGING_SESSION_EXTERNAL_SUBJECT: "staging:human:operator",
  MAOS_STAGING_SESSION_INGRESS_ENABLED: "true",
};

test("loads separate bounded staging Session API and BFF configuration", () => {
  assert.deepEqual(loadStagingSessionApiConfig(stagingSessionEnv), {
    bffServiceBearerToken: "synthetic-service-token",
    controlRoomOrigin: "https://maos-web-staging.example.test",
    enabled: true,
    identityAdminActorId: "human-staging-identity-admin",
    identityAdminBearerToken: "synthetic-admin-token",
    sessionCredentialBearerToken: "synthetic-session-token",
    sessionExternalSubject: "staging:human:operator",
  });
  assert.deepEqual(loadStagingSessionBffConfig(stagingSessionEnv), {
    bffServiceBearerToken: "synthetic-service-token",
    controlRoomOrigin: "https://maos-web-staging.example.test",
    coreApiOrigin: "https://maos-api-staging.example.test",
    csrfSecret: "synthetic-csrf-secret",
    enabled: true,
  });

  assert.deepEqual(loadStagingSessionApiConfig({ MAOS_ENV: "staging" }), {
    enabled: false,
  });
  assert.deepEqual(
    loadStagingSessionBffConfig({
      ...stagingSessionEnv,
      MAOS_ENV: "preview",
    }),
    { enabled: false },
  );
});

test("fails closed for invalid staging Session ingress configuration", () => {
  for (const name of [
    "MAOS_STAGING_CONTROL_ROOM_ORIGIN",
    "MAOS_STAGING_BFF_SERVICE_BEARER_TOKEN",
    "MAOS_STAGING_SESSION_CREDENTIAL_BEARER_TOKEN",
    "MAOS_STAGING_SESSION_EXTERNAL_SUBJECT",
    "MAOS_STAGING_IDENTITY_ADMIN_BEARER_TOKEN",
    "MAOS_STAGING_IDENTITY_ADMIN_ACTOR_ID",
  ]) {
    assert.throws(
      () =>
        loadStagingSessionApiConfig({
          ...stagingSessionEnv,
          [name]: undefined,
        }),
      new RegExp(`${name}_REQUIRED`),
    );
  }
  for (const name of [
    "MAOS_STAGING_CONTROL_ROOM_ORIGIN",
    "MAOS_CORE_API_ORIGIN",
    "MAOS_STAGING_BFF_SERVICE_BEARER_TOKEN",
    "MAOS_STAGING_BFF_CSRF_SECRET",
  ]) {
    assert.throws(
      () =>
        loadStagingSessionBffConfig({
          ...stagingSessionEnv,
          [name]: undefined,
        }),
      new RegExp(`${name}_REQUIRED`),
    );
  }

  for (const origin of [
    "http://maos-web-staging.example.test",
    "https://maos-web-staging.example.test/session",
    "https://*.example.test",
  ]) {
    assert.throws(
      () =>
        loadStagingSessionApiConfig({
          ...stagingSessionEnv,
          MAOS_STAGING_CONTROL_ROOM_ORIGIN: origin,
        }),
      /MAOS_STAGING_CONTROL_ROOM_ORIGIN_INVALID/,
    );
  }
  assert.throws(
    () =>
      loadStagingSessionBffConfig({
        ...stagingSessionEnv,
        MAOS_CORE_API_ORIGIN: "https://maos-api-staging.example.test/path",
      }),
    /MAOS_CORE_API_ORIGIN_INVALID/,
  );

  for (const name of [
    "MAOS_STAGING_SESSION_CREDENTIAL_BEARER_TOKEN",
    "MAOS_STAGING_IDENTITY_ADMIN_BEARER_TOKEN",
  ]) {
    assert.throws(
      () =>
        loadStagingSessionApiConfig({
          ...stagingSessionEnv,
          [name]: stagingSessionEnv.MAOS_STAGING_BFF_SERVICE_BEARER_TOKEN,
        }),
      /STAGING_SESSION_CREDENTIAL_ROLES_MUST_BE_DISTINCT/,
    );
  }
  assert.throws(
    () =>
      loadStagingSessionApiConfig({
        ...stagingSessionEnv,
        MAOS_STAGING_IDENTITY_ADMIN_BEARER_TOKEN:
          stagingSessionEnv.MAOS_STAGING_SESSION_CREDENTIAL_BEARER_TOKEN,
      }),
    /STAGING_SESSION_CREDENTIAL_ROLES_MUST_BE_DISTINCT/,
  );
  assert.throws(
    () =>
      loadStagingSessionBffConfig({
        ...stagingSessionEnv,
        MAOS_STAGING_BFF_CSRF_SECRET:
          stagingSessionEnv.MAOS_STAGING_BFF_SERVICE_BEARER_TOKEN,
      }),
    /STAGING_SESSION_CREDENTIAL_ROLES_MUST_BE_DISTINCT/,
  );
  assert.throws(
    () =>
      loadStagingSessionApiConfig({
        ...stagingSessionEnv,
        MAOS_ENV: "production",
      }),
    /STAGING_SESSION_INGRESS_FORBIDDEN/,
  );
});

test("loads bounded staging operations authentication configuration", () => {
  const configured = {
    MAOS_ENV: "staging",
    MAOS_STAGING_OPERATIONS_ACTOR_ID: "human-staging-operator",
    MAOS_STAGING_OPERATIONS_BEARER_TOKEN: "synthetic-staging-token",
  };

  assert.deepEqual(loadStagingOperationsAuthConfig(configured), {
    actorId: "human-staging-operator",
    bearerToken: "synthetic-staging-token",
    enabled: true,
  });
  assert.deepEqual(loadStagingOperationsAuthConfig({ MAOS_ENV: "staging" }), {
    enabled: false,
  });
  assert.deepEqual(
    loadStagingOperationsAuthConfig({
      ...configured,
      MAOS_STAGING_OPERATIONS_ACTOR_ID: " ",
    }),
    { enabled: false },
  );
  assert.deepEqual(
    loadStagingOperationsAuthConfig({ ...configured, MAOS_ENV: "production" }),
    { enabled: false },
  );
});

test("loads server-only Resend alert configuration and fails closed when incomplete", () => {
  assert.deepEqual(loadAlertEmailConfig({}), { enabled: false });
  const env = {
    MAOS_ALERT_CRITICAL_ACK_TIMEOUT_SECONDS: "300",
    MAOS_ALERT_EMAIL_ENABLED: "true",
    MAOS_ALERT_EMAIL_ESCALATION_TO: "escalation@example.test",
    MAOS_ALERT_EMAIL_FROM: "MAOS Staging <alerts@example.test>",
    MAOS_ALERT_EMAIL_PRIMARY_TO: "operator@example.test",
    MAOS_ALERT_EMAIL_PROVIDER: "resend",
    MAOS_ALERT_WARNING_ACK_TIMEOUT_SECONDS: "900",
    MAOS_CONTROL_ROOM_ALERT_BASE_URL: "https://maos-web.example.test",
    RESEND_API_KEY: "synthetic-resend-api-key",
    RESEND_WEBHOOK_SECRET: "whsec_synthetic_webhook_secret",
  };
  assert.deepEqual(loadAlertEmailConfig(env), {
    apiKey: "synthetic-resend-api-key",
    controlRoomBaseUrl: "https://maos-web.example.test",
    criticalAckTimeoutMs: 300_000,
    enabled: true,
    escalationTo: "escalation@example.test",
    from: "MAOS Staging <alerts@example.test>",
    primaryTo: "operator@example.test",
    provider: "resend",
    pollIntervalMs: 30_000,
    warningAckTimeoutMs: 900_000,
    webhookSecret: "whsec_synthetic_webhook_secret",
  });

  const customPolling = loadAlertEmailConfig({
    ...env,
    MAOS_ALERT_EMAIL_POLL_INTERVAL_SECONDS: "45",
  });
  assert.equal(customPolling.enabled, true);
  if (customPolling.enabled) assert.equal(customPolling.pollIntervalMs, 45_000);
  assert.throws(
    () =>
      loadAlertEmailConfig({
        ...env,
        MAOS_ALERT_EMAIL_POLL_INTERVAL_SECONDS: "0",
      }),
    /MAOS_ALERT_EMAIL_POLL_INTERVAL_SECONDS_INVALID/,
  );
  assert.throws(
    () => loadAlertEmailConfig({ ...env, RESEND_API_KEY: undefined }),
    /RESEND_API_KEY_REQUIRED/,
  );
  assert.throws(
    () =>
      loadAlertEmailConfig({
        ...env,
        MAOS_CONTROL_ROOM_ALERT_BASE_URL: "http://unsafe.example.test",
      }),
    /CONTROL_ROOM_HTTPS_REQUIRED/,
  );
});

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
