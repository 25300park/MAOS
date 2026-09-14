export interface DatabaseMaintenanceLockClient {
  query<Row>(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>;
}

// Session-scoped so every repository-owned PostgreSQL maintenance command can
// serialize its complete operation without changing per-migration transactions.
const DATABASE_MAINTENANCE_LOCK_ID = 1_296_126_578;

export class DatabaseMaintenanceLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseMaintenanceLockError";
  }
}

export async function acquireDatabaseMaintenanceLock(
  database: DatabaseMaintenanceLockClient,
): Promise<void> {
  const result = await database.query<{ acquired: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS acquired",
    [DATABASE_MAINTENANCE_LOCK_ID],
  );
  if (result.rows[0]?.acquired !== true) {
    throw new DatabaseMaintenanceLockError(
      "DATABASE_MAINTENANCE_LOCK_UNAVAILABLE",
    );
  }
}

export async function releaseDatabaseMaintenanceLock(
  database: DatabaseMaintenanceLockClient,
): Promise<void> {
  const result = await database.query<{ released: boolean }>(
    "SELECT pg_advisory_unlock($1) AS released",
    [DATABASE_MAINTENANCE_LOCK_ID],
  );
  if (result.rows[0]?.released !== true) {
    throw new DatabaseMaintenanceLockError(
      "DATABASE_MAINTENANCE_LOCK_RELEASE_FAILED",
    );
  }
}
