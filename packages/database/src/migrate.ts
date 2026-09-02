import type { Migration, MigrationDatabase, MigrationResult } from "./types.js";

interface AppliedMigration {
  checksum: string;
  id: string;
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

export async function applyMigrations(
  database: MigrationDatabase,
  migrations: readonly Migration[],
): Promise<MigrationResult> {
  await ensureMigrationRegistry(database);

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
