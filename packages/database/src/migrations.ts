import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Migration } from "./types.js";

const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;

function canonicalizeMigrationSql(sql: string): string {
  return sql.replace(/\r\n?/gu, "\n");
}

export async function loadMigrations(directory: string): Promise<Migration[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const fileNames = entries
    .filter((entry) => entry.isFile() && MIGRATION_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const ids = new Set<string>();
  const migrations: Migration[] = [];

  for (const fileName of fileNames) {
    const id = fileName.slice(0, -4);
    if (ids.has(id)) throw new Error(`Duplicate migration id: ${id}`);
    ids.add(id);

    const sql = canonicalizeMigrationSql(
      await readFile(join(directory, fileName), "utf8"),
    );
    migrations.push({
      id,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    });
  }

  if (migrations.length === 0) {
    throw new Error(`No migrations found in ${directory}`);
  }

  return migrations;
}
