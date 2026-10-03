import type {
  ApplyMigrationsOptions,
  Migration,
  MigrationDatabase,
  MigrationResult,
} from "./types.js";

interface AppliedMigration {
  checksum: string;
  id: string;
}

interface MigrationRegistryShape {
  columns_match: boolean;
  primary_key_match: boolean;
  schema_exists: boolean;
  table_exists: boolean;
}

const MIGRATION_LOCK_ID = 1_296_126_577;

async function ensureMigrationRegistry(
  database: MigrationDatabase,
): Promise<void> {
  await database.exec(`
    CREATE SCHEMA IF NOT EXISTS core;
    CREATE TABLE IF NOT EXISTS core.schema_migrations (
      id text PRIMARY KEY,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function verifyExistingMigrationRegistry(
  database: MigrationDatabase,
): Promise<void> {
  const shape = await database.query<MigrationRegistryShape>(`
    /* registry_shape */
    WITH registry AS (
      SELECT relation.oid
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'core'
        AND relation.relname = 'schema_migrations'
        AND relation.relkind = 'r'
    )
    SELECT
      EXISTS (
        SELECT 1 FROM pg_namespace WHERE nspname = 'core'
      ) AS schema_exists,
      EXISTS (SELECT 1 FROM registry) AS table_exists,
      (
        SELECT count(*) = 3
          AND count(*) FILTER (
            WHERE attribute.attname = 'id'
              AND format_type(attribute.atttypid, attribute.atttypmod) = 'text'
              AND attribute.attnotnull
          ) = 1
          AND count(*) FILTER (
            WHERE attribute.attname = 'checksum'
              AND format_type(attribute.atttypid, attribute.atttypmod) = 'character(64)'
              AND attribute.attnotnull
          ) = 1
          AND count(*) FILTER (
            WHERE attribute.attname = 'applied_at'
              AND format_type(attribute.atttypid, attribute.atttypmod) = 'timestamp with time zone'
              AND attribute.attnotnull
              AND definition.adbin IS NOT NULL
          ) = 1
        FROM registry
        JOIN pg_attribute attribute ON attribute.attrelid = registry.oid
        LEFT JOIN pg_attrdef definition
          ON definition.adrelid = attribute.attrelid
         AND definition.adnum = attribute.attnum
        WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
      ) AS columns_match,
      EXISTS (
        SELECT 1
        FROM registry
        JOIN pg_constraint constraint_record
          ON constraint_record.conrelid = registry.oid
        JOIN pg_attribute attribute
          ON attribute.attrelid = registry.oid
         AND attribute.attname = 'id'
        WHERE constraint_record.contype = 'p'
          AND constraint_record.conkey = ARRAY[attribute.attnum]::smallint[]
      ) AS primary_key_match
  `);
  const registry = shape.rows[0];
  if (!registry?.schema_exists)
    throw new Error("MIGRATION_REGISTRY_SCHEMA_MISSING");
  if (!registry.table_exists)
    throw new Error("MIGRATION_REGISTRY_TABLE_MISSING");
  if (!registry.columns_match || !registry.primary_key_match)
    throw new Error("MIGRATION_REGISTRY_SHAPE_INVALID");
}

export async function applyMigrations(
  database: MigrationDatabase,
  migrations: readonly Migration[],
  options: ApplyMigrationsOptions = {},
): Promise<MigrationResult> {
  if ((options.registryMode ?? "ENSURE") === "VERIFY_EXISTING")
    await verifyExistingMigrationRegistry(database);
  else await ensureMigrationRegistry(database);

  const appliedRows = await database.query<AppliedMigration>(`
    SELECT id, checksum
    FROM core.schema_migrations
    ORDER BY id
  `);
  const recorded = new Map(
    appliedRows.rows.map(({ id, checksum }) => [id, checksum.trim()]),
  );

  const result: MigrationResult = { applied: [], skipped: [] };

  for (const migration of migrations) {
    const recordedChecksum = recorded.get(migration.id);
    if (recordedChecksum) {
      if (recordedChecksum !== migration.checksum) {
        throw new Error(`Checksum mismatch for migration ${migration.id}`);
      }
      result.skipped.push(migration.id);
      continue;
    }

    await database.exec("BEGIN");
    try {
      await database.query("SELECT pg_advisory_xact_lock($1)", [
        MIGRATION_LOCK_ID,
      ]);
      await database.exec(migration.sql);
      await database.query(
        `INSERT INTO core.schema_migrations (id, checksum) VALUES ($1, $2)`,
        [migration.id, migration.checksum],
      );
      await database.exec("COMMIT");
      result.applied.push(migration.id);
    } catch (error) {
      await database.exec("ROLLBACK");
      throw error;
    }
  }

  return result;
}
