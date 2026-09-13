import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { loadDatabaseConfig } from "@maos/config";
import {
  applyMigrations,
  loadMigrations,
  openPostgresDatabase,
  type Migration,
  type RuntimeDatabase,
} from "@maos/database";

type WriteLine = (line: string) => void;

export interface PostgresMigrationCommandDependencies {
  loadMigrations?: (directory: string) => Promise<Migration[]>;
  openDatabase?: (connectionString: string) => Promise<RuntimeDatabase>;
}

export interface PostgresMigrationCommandOptions {
  dependencies?: PostgresMigrationCommandDependencies;
  env: Record<string, string | undefined>;
  writeStderr?: WriteLine;
  writeStdout?: WriteLine;
}

const migrationsDirectory = fileURLToPath(
  new URL("../packages/database/migrations/", import.meta.url),
);
const migrationId = /^\d{4}_[a-z0-9_]+$/u;

function jsonLine(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

function failed(code: string, details?: Record<string, string>): string {
  return jsonLine({ code, ...details, status: "FAILED" });
}

function validateTarget(
  env: Record<string, string | undefined>,
): string | undefined {
  if (env.MAOS_ENV === "production") return "PRODUCTION_MIGRATION_FORBIDDEN";
  if (env.MAOS_ENV !== "staging") return "STAGING_ENV_REQUIRED";
  if (env.MAOS_DATABASE_MIGRATION_TARGET !== "staging") {
    return "STAGING_TARGET_CONFIRMATION_REQUIRED";
  }
  return undefined;
}

function databaseUrl(env: Record<string, string | undefined>): {
  error?: string;
  value?: string;
} {
  if (!env.DATABASE_URL) return { error: "DATABASE_URL_REQUIRED" };
  try {
    return { value: loadDatabaseConfig(env).databaseUrl };
  } catch {
    return { error: "DATABASE_URL_INVALID" };
  }
}

function migrationFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const checksumMismatch =
    /^Checksum mismatch for migration (\d{4}_[a-z0-9_]+)$/u.exec(message);
  if (checksumMismatch?.[1] && migrationId.test(checksumMismatch[1])) {
    return failed("CHECKSUM_MISMATCH", {
      migration_id: checksumMismatch[1],
    });
  }
  return failed("MIGRATION_APPLICATION_FAILED");
}

export async function runPostgresMigrationCommand(
  options: PostgresMigrationCommandOptions,
): Promise<number> {
  const writeStdout =
    options.writeStdout ??
    ((line: string) => {
      process.stdout.write(`${line}\n`);
    });
  const writeStderr =
    options.writeStderr ??
    ((line: string) => {
      process.stderr.write(`${line}\n`);
    });

  const targetError = validateTarget(options.env);
  if (targetError) {
    writeStderr(failed(targetError));
    return 1;
  }

  const configuredUrl = databaseUrl(options.env);
  if (configuredUrl.error || !configuredUrl.value) {
    writeStderr(failed(configuredUrl.error ?? "DATABASE_URL_INVALID"));
    return 1;
  }

  const load = options.dependencies?.loadMigrations ?? loadMigrations;
  let migrations: Migration[];
  try {
    migrations = await load(migrationsDirectory);
  } catch {
    writeStderr(failed("MIGRATION_LOAD_FAILED"));
    return 1;
  }

  const open = options.dependencies?.openDatabase ?? openPostgresDatabase;
  let database: RuntimeDatabase;
  try {
    database = await open(configuredUrl.value);
  } catch {
    writeStderr(failed("DATABASE_CONNECTION_FAILED"));
    return 1;
  }

  let exitCode = 1;
  try {
    const result = await applyMigrations(database, migrations);
    const applied = new Set(result.applied);
    const skipped = new Set(result.skipped);
    for (const migration of migrations) {
      writeStdout(
        jsonLine({
          checksum: migration.checksum,
          migration_id: migration.id,
          status: applied.has(migration.id)
            ? "APPLIED"
            : skipped.has(migration.id)
              ? "SKIPPED"
              : "FAILED",
        }),
      );
    }
    writeStdout(
      jsonLine({
        applied: result.applied.length,
        skipped: result.skipped.length,
        status: "SUCCEEDED",
      }),
    );
    exitCode = 0;
  } catch (error) {
    writeStderr(migrationFailure(error));
  } finally {
    try {
      await database.close();
    } catch {
      if (exitCode === 0) {
        writeStderr(failed("DATABASE_CLOSE_FAILED"));
        exitCode = 1;
      }
    }
  }
  return exitCode;
}

const invokedPath = process.argv[1];
if (
  invokedPath &&
  pathToFileURL(resolve(invokedPath)).href === import.meta.url
) {
  process.exitCode = await runPostgresMigrationCommand({ env: process.env });
}
