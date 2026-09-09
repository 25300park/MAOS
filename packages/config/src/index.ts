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
