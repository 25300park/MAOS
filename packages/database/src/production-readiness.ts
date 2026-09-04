import type { MigrationDatabase } from "./types.js";

export interface SchemaVersion {
  applied_count: number;
  latest_checksum: string;
  latest_id: string;
}

export async function getSchemaVersion(
  database: MigrationDatabase,
): Promise<SchemaVersion> {
  const result = await database.query<{ checksum: string; id: string }>(`
    SELECT id, checksum FROM core.schema_migrations ORDER BY id
  `);
  const latest = result.rows.at(-1);
  if (!latest) throw new Error("SCHEMA_VERSION_UNAVAILABLE");
  return {
    applied_count: result.rows.length,
    latest_checksum: latest.checksum.trim(),
    latest_id: latest.id,
  };
}

export interface MigrationSafetyInput {
  automatic: boolean;
  backup_age_ms: number | null;
  backup_status: "MISSING" | "CREATED" | "VERIFIED" | "FAILED";
  destructive: boolean;
  environment: "DEVELOPMENT" | "PREVIEW" | "STAGING" | "PRODUCTION";
  lock_required: boolean;
  max_backup_age_ms: number;
  recovery_strategy: "FORWARD_FIX" | "ROLLBACK" | null;
}

export function validateMigrationSafety(input: MigrationSafetyInput): {
  allowed: true;
  requires_human_approval: boolean;
} {
  if (!input.lock_required) throw new Error("MIGRATION_LOCK_REQUIRED");
  if (input.environment === "PRODUCTION") {
    if (input.automatic && input.destructive)
      throw new Error("DESTRUCTIVE_AUTO_MIGRATION_FORBIDDEN");
    if (
      input.backup_status !== "VERIFIED" ||
      input.backup_age_ms === null ||
      input.backup_age_ms < 0 ||
      input.backup_age_ms > input.max_backup_age_ms
    )
      throw new Error("FRESH_BACKUP_REQUIRED");
    if (!input.recovery_strategy)
      throw new Error("MIGRATION_RECOVERY_STRATEGY_REQUIRED");
  }
  return {
    allowed: true,
    requires_human_approval: input.environment === "PRODUCTION",
  };
}
