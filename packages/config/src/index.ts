const ENVIRONMENTS = [
  "development",
  "preview",
  "staging",
  "production",
] as const;

export type Environment = (typeof ENVIRONMENTS)[number];

export interface ApiConfig {
  environment: Environment;
  port: number;
  service: "api";
}

export interface DatabaseConfig {
  databaseUrl: string;
}

export type AlertEmailConfig =
  | { enabled: false }
  | {
      apiKey: string;
      controlRoomBaseUrl: string;
      criticalAckTimeoutMs: number;
      enabled: true;
      escalationTo: string;
      from: string;
      primaryTo: string;
      provider: "resend";
      pollIntervalMs: number;
      warningAckTimeoutMs: number;
      webhookSecret: string;
    };

export type StagingOperationsAuthConfig =
  | { enabled: false }
  | {
      actorId: string;
      bearerToken: string;
      enabled: true;
    };

export interface ProductionConfig {
  autoMigrate: false;
  backupKeyReference: string;
  databaseSecretReference: string;
  debug: false;
  deploymentProviderReference: string;
  environment: "production";
  publicOrigin: string;
  serviceIdentity: string;
}

export function loadApiConfig(
  env: Record<string, string | undefined>,
): ApiConfig {
  const environment = env.MAOS_ENV;
  if (!ENVIRONMENTS.includes(environment as Environment)) {
    throw new Error(`MAOS_ENV must be one of: ${ENVIRONMENTS.join(", ")}`);
  }

  const port = Number(env.API_PORT ?? env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("API_PORT must be an integer between 1 and 65535");
  }

  return { environment: environment as Environment, port, service: "api" };
}

export function loadDatabaseConfig(
  env: Record<string, string | undefined>,
): DatabaseConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the PostgreSQL protocol");
  }

  return { databaseUrl };
}

const requiredValue = (
  env: Record<string, string | undefined>,
  name: string,
): string => {
  const value = env[name];
  if (!value?.trim()) throw new Error(`${name}_REQUIRED`);
  return value;
};

const timeoutMs = (
  env: Record<string, string | undefined>,
  name: string,
): number => {
  const seconds = Number(requiredValue(env, name));
  if (!Number.isInteger(seconds) || seconds <= 0)
    throw new Error(`${name}_INVALID`);
  return seconds * 1_000;
};

export function loadAlertEmailConfig(
  env: Record<string, string | undefined>,
): AlertEmailConfig {
  if (env.MAOS_ALERT_EMAIL_ENABLED !== "true") return { enabled: false };
  if (env.MAOS_ALERT_EMAIL_PROVIDER !== "resend")
    throw new Error("MAOS_ALERT_EMAIL_PROVIDER_INVALID");
  const controlRoomBaseUrl = requiredValue(
    env,
    "MAOS_CONTROL_ROOM_ALERT_BASE_URL",
  );
  let controlRoomUrl: URL;
  try {
    controlRoomUrl = new URL(controlRoomBaseUrl);
  } catch {
    throw new Error("CONTROL_ROOM_HTTPS_REQUIRED");
  }
  if (controlRoomUrl.protocol !== "https:")
    throw new Error("CONTROL_ROOM_HTTPS_REQUIRED");
  return {
    apiKey: requiredValue(env, "RESEND_API_KEY"),
    controlRoomBaseUrl: controlRoomUrl.origin,
    criticalAckTimeoutMs: timeoutMs(
      env,
      "MAOS_ALERT_CRITICAL_ACK_TIMEOUT_SECONDS",
    ),
    enabled: true,
    escalationTo: requiredValue(env, "MAOS_ALERT_EMAIL_ESCALATION_TO"),
    from: requiredValue(env, "MAOS_ALERT_EMAIL_FROM"),
    primaryTo: requiredValue(env, "MAOS_ALERT_EMAIL_PRIMARY_TO"),
    provider: "resend",
    pollIntervalMs:
      env.MAOS_ALERT_EMAIL_POLL_INTERVAL_SECONDS === undefined
        ? 30_000
        : timeoutMs(env, "MAOS_ALERT_EMAIL_POLL_INTERVAL_SECONDS"),
    warningAckTimeoutMs: timeoutMs(
      env,
      "MAOS_ALERT_WARNING_ACK_TIMEOUT_SECONDS",
    ),
    webhookSecret: requiredValue(env, "RESEND_WEBHOOK_SECRET"),
  };
}

export function loadStagingOperationsAuthConfig(
  env: Record<string, string | undefined>,
): StagingOperationsAuthConfig {
  if (env.MAOS_ENV !== "staging") return { enabled: false };

  const actorId = env.MAOS_STAGING_OPERATIONS_ACTOR_ID?.trim();
  const bearerToken = env.MAOS_STAGING_OPERATIONS_BEARER_TOKEN;
  if (!actorId || !bearerToken?.trim()) return { enabled: false };

  return { actorId, bearerToken, enabled: true };
}

function requiredReference(
  env: Record<string, string | undefined>,
  name: string,
  prefix: string,
): string {
  const value = env[name];
  if (!value?.startsWith(prefix) || value.length === prefix.length)
    throw new Error(`${name}: SECRET_REFERENCE_REQUIRED`);
  return value;
}

export function loadProductionConfig(
  env: Record<string, string | undefined>,
): ProductionConfig {
  if (env.MAOS_ENV !== "production")
    throw new Error("PRODUCTION_ENVIRONMENT_REQUIRED");
  if (env.MAOS_DEBUG !== "false") throw new Error("PRODUCTION_DEBUG_FORBIDDEN");
  if (env.MAOS_AUTO_MIGRATE !== "false")
    throw new Error("PRODUCTION_AUTO_MIGRATE_FORBIDDEN");

  const publicOrigin = env.MAOS_PUBLIC_ORIGIN;
  let origin: URL;
  try {
    origin = new URL(publicOrigin ?? "");
  } catch {
    throw new Error("HTTPS_ORIGIN_REQUIRED");
  }
  if (origin.protocol !== "https:" || origin.origin !== publicOrigin)
    throw new Error("HTTPS_ORIGIN_REQUIRED");

  const serviceIdentity = env.MAOS_SERVICE_IDENTITY;
  if (!serviceIdentity?.startsWith("system-") || serviceIdentity.length < 8)
    throw new Error("SERVICE_IDENTITY_REQUIRED");

  return {
    autoMigrate: false,
    backupKeyReference: requiredReference(
      env,
      "BACKUP_KEY_REFERENCE",
      "secretref://",
    ),
    databaseSecretReference: requiredReference(
      env,
      "DATABASE_SECRET_REFERENCE",
      "secretref://",
    ),
    debug: false,
    deploymentProviderReference: requiredReference(
      env,
      "DEPLOYMENT_PROVIDER_REFERENCE",
      "providerref://",
    ),
    environment: "production",
    publicOrigin,
    serviceIdentity,
  };
}
