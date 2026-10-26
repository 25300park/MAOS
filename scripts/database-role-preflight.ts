import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { loadDatabaseMigrationConfig } from "@maos/config";
import {
  inspectDatabaseRoleContract,
  openPostgresDatabase,
} from "@maos/database";

export async function runDatabaseRolePreflight(
  env: Record<string, string | undefined>,
  write = (line: string) => process.stdout.write(`${line}\n`),
) {
  let database;
  try {
    const config = loadDatabaseMigrationConfig(env);
    database = await openPostgresDatabase(config.migrationUrl);
    const result = await inspectDatabaseRoleContract(database, {
      migrationRole: config.migrationRole,
      runtimeRole: config.runtimeRole,
      approvedOwnerRoles: (env.MAOS_DATABASE_APPROVED_OWNER_ROLES ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    });
    for (const row of result.rows)
      write(
        JSON.stringify({
          authority: row.authority,
          object_kind: row.objectKind,
          object_name: row.objectName,
          result: row.result,
        }),
      );
    write(JSON.stringify({ status: result.status }));
    return result.status === "PASS" ? 0 : 1;
  } catch {
    write(
      JSON.stringify({
        code: "DATABASE_ROLE_PREFLIGHT_FAILED",
        status: "FAILED",
      }),
    );
    return 1;
  } finally {
    await database?.close().catch(() => undefined);
  }
}
const invoked = process.argv[1];
if (invoked && pathToFileURL(resolve(invoked)).href === import.meta.url)
  process.exitCode = await runDatabaseRolePreflight(process.env);
