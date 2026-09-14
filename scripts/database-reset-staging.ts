import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadDatabaseConfig } from "@maos/config";
import { openPostgresDatabase, type RuntimeDatabase } from "@maos/database";
import {
  acquireDatabaseMaintenanceLock,
  releaseDatabaseMaintenanceLock,
} from "./database-admin-lock.js";

type WriteLine = (line: string) => void;

export const MAOS_STAGING_SCHEMAS = Object.freeze([
  "core",
  "identity",
  "work",
  "ai",
  "execution",
  "governance",
  "knowledge",
  "integration",
  "communication",
  "notification",
  "audit",
  "private",
  "quality",
  "delivery",
  "operations",
] as const);

export const RESET_MIGRATION_MANIFEST = Object.freeze(
  [
    [
      "0001_canonical_schemas",
      "f828f328c79585f639257e0df2a16d765ea22d2953be89dadc6d224561c8e161",
      "63872ba1cf3136595b8ad9e9c79c9058e0aa73b7312e3d7ccb1b349f78b1f523",
    ],
    [
      "0002_core_foundation",
      "b05ba045aac3ba221bcb2beb42f310746114ea05ddb434acca10581cbdd2b4af",
      "8eb914e186ff7f2ffea396c4655b8b16bd7667e52dee1cc164d1b78975d91906",
    ],
    [
      "0003_approval_authority_foundation",
      "f9126cd067cda9778a8613643ebb74ba54e432e9439a62c148816fd0933c8bde",
      "c615db5291196bfe266229d6b22450134741d436441155e948fe8faf43cc9d79",
    ],
    [
      "0004_project_task_workflow_foundation",
      "db3deb25eb6507b906564b0da1bbcf34fd1fe8ccc138f3fc0e0e6e65eb4d50f6",
      "d8458d248ebabf585762be53f85098fbcfbed509a8b3bca78debbb5639740058",
    ],
    [
      "0005_agent_model_runner_foundation",
      "c446a667b4c92267a5e7df21defeefc339e734a630857d9e83fd872740ae6212",
      "8210c9cc1037a39d6c41a8daa0c9083e32b9cea830ae0ff5df1de74a7f3169e9",
    ],
    [
      "0006_skill_tool_mcp_foundation",
      "80d7e13627284c72dd5bbe9623d043397b24883d9ac032030e4fdce1ba05d490",
      "4df447f32d75cd59c1293b887db49cf6ec4dd38660b52d618764c0e7805f85c2",
    ],
    [
      "0007_local_execution_bridge_foundation",
      "7419c95e9e43d2c3cf2e968a5b372e4c6449d46efeeda442e9c26dc7f07b6914",
      "2eeeaf6d8cf8cc0da4c550a8269ca9ea9e2dbd8a4309c42c56d1827577c46d84",
    ],
    [
      "0008_ai_memory_gateway_integration",
      "045ef95e8f764dd21772027b7576f353869bf78aa26d408f9505987867dc0dc7",
      "c8a8b30852f43ee6f563841d0bab391e74e7d94714e89492d4cf09db93ac8034",
    ],
    [
      "0009_observability_audit_foundation",
      "cd82134ac5d9dd2baf7e32d4a3f31a011246e97879507041592e705ad8be6f26",
      "a7c5751ce63adb10605bd92cc8e1c64ae45fed8262d2e8c08bfa8cc02e193765",
    ],
    [
      "0010_release_deployment_foundation",
      "0d45fccafbade12af3577cf65fd07f5de8abfac9a4de2aa23b747a38e58bd2e5",
      "8617f83a1b99a4f61d56f4ee1dd9ef06c52118daaf6fbf9b8875126a5ba7105c",
    ],
    [
      "0011_rbs_admin_pilot_foundation",
      "7a95ba6fb0d9a9d7b1351abaa79d1fd783cad7f7a9458c6f03d36d0adeb78263",
      "bff72e181a6df7e178bc666c7d937aeb002e14152ca54859f95518150be7ab68",
    ],
    [
      "0012_core_control_plane_generalization",
      "209623028eeac72110436e911e313f37bee2432d8819223016272ae28eb843e0",
      "af1ad357ba293ff8a5e296ba9652aeae98eed6e4fdd66e68a21adf86d1f0d918",
    ],
    [
      "0013_ai_memory_knowledge_integration",
      "401d68b5e39277ec242340d2bbd4be91b46d647d74c91fdb3056a27fd68b9e0b",
      "773e75776786f9e0f31234c1361e5d85d426568d8bb40875eb2a6ca286ff7f15",
    ],
    [
      "0014_marketing_automation_integration",
      "ba3efc8810239e76e99e157e2e99c7cbf9e845457e9ed8e59ba4eb4c960e2726",
      "65ae224c799da61b96687215c0f3165dcd247d930fb407d58da2deb768452429",
    ],
    [
      "0015_ai_mls_integration",
      "3df2721945d6ac41ad303fe211b019d026cb6e97d94450f1dfb87b6aee04f9d1",
      "044923549226c2a730a01edac871cbf572873a88a06a2fe8786f9e346e81c79d",
    ],
    [
      "0016_crm_human_work_integration",
      "6e9070b6c2d40106664a360e69a195bda350a9b028a8abfee291b38113566e75",
      "4a1aff9b96dc2814c5e561675529f575474623553fb98aec00bc91a0563ece53",
    ],
    [
      "0017_optimization_learning_foundation",
      "c4171e152d0d70542e3a2750b25b057c5b4519e596063527a03c9146a41bd466",
      "5c443a795e669e84801f346393513d57714126a50bfaab9b362842ee5c29030f",
    ],
    [
      "0018_alert_email_delivery",
      "8a9212accac15dec523a77d57fee6f60fcca4c36c23687e5beecf8a1b4dd8654",
      "05a7e77e5d41dec223a800efda93bafe3a45ef68122a7975aab6f36ae841f8d1",
    ],
    [
      "0019_staging_session_ingress",
      "f2a8c8cd5abd48bae8f0ce51676b8b01f234ed520f66429393d2fc5070ae9626",
      "2a07345ecfc33adde97bf58d208a57b971be780d7e6c0f841589f1ef5f818b68",
    ],
  ].map(([id, canonicalChecksum, legacyCrlfChecksum]) => ({
    canonicalChecksum: canonicalChecksum ?? "",
    id: id ?? "",
    legacyCrlfChecksum: legacyCrlfChecksum ?? "",
  })),
);

const RESET_TRANSACTION_LOCK_ID = 1_296_126_579;
const expectedSeedNames = ["DEVELOPMENT", "PREVIEW", "STAGING", "PRODUCTION"];
const allowedInfrastructureSchemas = new Set(["information_schema", "public"]);

export interface StagingResetCommandDependencies {
  acquireMaintenanceLock?: (database: RuntimeDatabase) => Promise<void>;
  acquireResetLock?: (database: RuntimeDatabase) => Promise<void>;
  openDatabase?: (connectionString: string) => Promise<RuntimeDatabase>;
  releaseMaintenanceLock?: (database: RuntimeDatabase) => Promise<void>;
}

export interface StagingResetCommandOptions {
  dependencies?: StagingResetCommandDependencies;
  env: Record<string, string | undefined>;
  writeStderr?: WriteLine;
  writeStdout?: WriteLine;
}

class ResetFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ResetFailure";
  }
}

interface SchemaRow {
  schema_name: string;
}

interface TableRow {
  table_name: string;
  table_schema: string;
}

interface CountRow {
  count: string | number;
}

interface MigrationRow {
  checksum: string;
  id: string;
}

interface EnvironmentSeedRow {
  deployment_mode: string;
  eligible: boolean;
  health: string;
  name: string;
  updated_at: unknown;
}

function jsonLine(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

function failed(code: string): string {
  return jsonLine({ code, status: "FAILED" });
}

function validateTarget(
  env: Record<string, string | undefined>,
): string | undefined {
  if (env.MAOS_ENV === "production") return "PRODUCTION_RESET_FORBIDDEN";
  if (env.MAOS_ENV !== "staging") return "STAGING_ENV_REQUIRED";
  if (env.MAOS_DATABASE_RESET_TARGET !== "staging") {
    return "STAGING_RESET_TARGET_CONFIRMATION_REQUIRED";
  }
  if (env.MAOS_DATABASE_RESET_CONFIRM !== "RESET_MAOS_STAGING_SCHEMAS") {
    return "DESTRUCTIVE_CONFIRMATION_REQUIRED";
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

function isInfrastructureSchema(schema: string): boolean {
  return allowedInfrastructureSchemas.has(schema) || schema.startsWith("pg_");
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function listSchemas(database: RuntimeDatabase): Promise<string[]> {
  const result = await database.query<SchemaRow>(`
    SELECT nspname AS schema_name
    FROM pg_namespace
    ORDER BY nspname
    /* reset:schemas */
  `);
  return result.rows.map(({ schema_name }) => schema_name);
}

async function verifySchemas(database: RuntimeDatabase): Promise<void> {
  const schemas = await listSchemas(database);
  const expected = new Set(MAOS_STAGING_SCHEMAS);
  if (
    schemas.some(
      (schema) =>
        !expected.has(schema as (typeof MAOS_STAGING_SCHEMAS)[number]) &&
        !isInfrastructureSchema(schema),
    )
  ) {
    throw new ResetFailure("UNEXPECTED_SCHEMA_PRESENT");
  }

  const publicTables = await database.query<TableRow>(`
    SELECT n.nspname AS table_schema, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'f')
    ORDER BY c.relname
  `);
  if (publicTables.rows.length > 0) {
    throw new ResetFailure("UNEXPECTED_SCHEMA_PRESENT");
  }
}

function classifyMigrationRegistry(
  rows: MigrationRow[],
): "CANONICAL_LF" | "LEGACY_CRLF" {
  if (rows.length !== RESET_MIGRATION_MANIFEST.length) {
    throw new ResetFailure("BUSINESS_DATA_PRESENT");
  }
  const byId = new Map(rows.map(({ checksum, id }) => [id, checksum.trim()]));
  const canonical = RESET_MIGRATION_MANIFEST.every(
    ({ canonicalChecksum, id }) => byId.get(id) === canonicalChecksum,
  );
  const legacy = RESET_MIGRATION_MANIFEST.every(
    ({ id, legacyCrlfChecksum }) => byId.get(id) === legacyCrlfChecksum,
  );
  if (
    byId.size !== RESET_MIGRATION_MANIFEST.length ||
    (!canonical && !legacy)
  ) {
    throw new ResetFailure("BUSINESS_DATA_PRESENT");
  }
  return canonical ? "CANONICAL_LF" : "LEGACY_CRLF";
}

async function verifyMigrationRegistry(database: RuntimeDatabase) {
  const result = await database.query<MigrationRow>(`
    SELECT id, checksum
    FROM core.schema_migrations
    ORDER BY id
  `);
  return classifyMigrationRegistry(result.rows);
}

async function verifySeeds(database: RuntimeDatabase): Promise<void> {
  const result = await database.query<EnvironmentSeedRow>(`
    SELECT name, health, eligible, deployment_mode, updated_at
    FROM delivery.environments
    ORDER BY name
  `);
  if (result.rows.length !== expectedSeedNames.length) {
    throw new ResetFailure("BUSINESS_DATA_PRESENT");
  }
  const byName = new Map(result.rows.map((row) => [row.name, row]));
  for (const name of expectedSeedNames) {
    const row = byName.get(name);
    if (
      !row ||
      row.health !== "UNKNOWN" ||
      row.eligible !== false ||
      row.deployment_mode !== "SIMULATED" ||
      row.updated_at === null
    ) {
      throw new ResetFailure("BUSINESS_DATA_PRESENT");
    }
  }
}

async function verifyNoBusinessData(database: RuntimeDatabase): Promise<void> {
  const result = await database.query<TableRow>(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
    ORDER BY table_schema, table_name
  `);
  const allowedSchemas = new Set(MAOS_STAGING_SCHEMAS);
  for (const {
    table_name: tableName,
    table_schema: tableSchema,
  } of result.rows) {
    if (
      !allowedSchemas.has(tableSchema as (typeof MAOS_STAGING_SCHEMAS)[number])
    )
      continue;
    if (
      (tableSchema === "core" && tableName === "schema_migrations") ||
      (tableSchema === "delivery" && tableName === "environments")
    ) {
      continue;
    }
    const count = await database.query<CountRow>(
      `SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableSchema)}.${quoteIdentifier(tableName)}`,
    );
    if (Number(count.rows[0]?.count ?? 0) !== 0) {
      throw new ResetFailure("BUSINESS_DATA_PRESENT");
    }
  }
}

async function acquireResetTransactionLock(
  database: RuntimeDatabase,
): Promise<void> {
  const result = await database.query<{ acquired: boolean }>(
    "SELECT pg_try_advisory_xact_lock($1) AS acquired",
    [RESET_TRANSACTION_LOCK_ID],
  );
  if (result.rows[0]?.acquired !== true) {
    throw new ResetFailure("RESET_LOCK_FAILED");
  }
}

function resetFailureCode(error: unknown): string {
  return error instanceof ResetFailure ? error.code : "SCHEMA_RESET_FAILED";
}

export async function runStagingResetCommand(
  options: StagingResetCommandOptions,
): Promise<number> {
  const writeStdout =
    options.writeStdout ?? ((line) => process.stdout.write(`${line}\n`));
  const writeStderr =
    options.writeStderr ?? ((line) => process.stderr.write(`${line}\n`));
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

  const open = options.dependencies?.openDatabase ?? openPostgresDatabase;
  let database: RuntimeDatabase;
  try {
    database = await open(configuredUrl.value);
  } catch {
    writeStderr(failed("DATABASE_CONNECTION_FAILED"));
    return 1;
  }

  const acquireMaintenance =
    options.dependencies?.acquireMaintenanceLock ??
    acquireDatabaseMaintenanceLock;
  const releaseMaintenance =
    options.dependencies?.releaseMaintenanceLock ??
    releaseDatabaseMaintenanceLock;
  const acquireReset =
    options.dependencies?.acquireResetLock ?? acquireResetTransactionLock;
  let maintenanceLocked = false;
  let transactionStarted = false;
  let exitCode = 1;
  try {
    try {
      await acquireMaintenance(database);
      maintenanceLocked = true;
      await database.exec("BEGIN");
      transactionStarted = true;
      await acquireReset(database);
    } catch {
      throw new ResetFailure("RESET_LOCK_FAILED");
    }

    await verifySchemas(database);
    const checksumClassification = await verifyMigrationRegistry(database);
    await verifySeeds(database);
    await verifyNoBusinessData(database);

    for (const schema of MAOS_STAGING_SCHEMAS) {
      await database.exec(`DROP SCHEMA ${quoteIdentifier(schema)} CASCADE`);
    }
    const remaining = new Set(await listSchemas(database));
    if (MAOS_STAGING_SCHEMAS.some((schema) => remaining.has(schema))) {
      throw new ResetFailure("SCHEMA_RESET_FAILED");
    }
    await database.exec("COMMIT");
    transactionStarted = false;

    writeStdout(
      jsonLine({
        checksum_classification: checksumClassification,
        environment: "staging",
        migration_records: RESET_MIGRATION_MANIFEST.length,
        seed_rows: expectedSeedNames.length,
        status: "VERIFIED",
        target: "staging",
      }),
    );
    for (const schema of MAOS_STAGING_SCHEMAS) {
      writeStdout(jsonLine({ schema, status: "RESET" }));
    }
    writeStdout(
      jsonLine({
        schemas_reset: MAOS_STAGING_SCHEMAS.length,
        status: "SUCCEEDED",
      }),
    );
    exitCode = 0;
  } catch (error) {
    if (transactionStarted) {
      try {
        await database.exec("ROLLBACK");
      } catch {
        // Preserve the sanitized primary failure classification.
      }
    }
    writeStderr(failed(resetFailureCode(error)));
  } finally {
    if (maintenanceLocked) {
      try {
        await releaseMaintenance(database);
      } catch {
        if (exitCode === 0) {
          writeStderr(failed("RESET_LOCK_FAILED"));
          exitCode = 1;
        }
      }
    }
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
  process.exitCode = await runStagingResetCommand({ env: process.env });
}
