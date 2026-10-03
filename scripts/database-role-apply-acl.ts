import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { loadDatabaseMigrationConfig } from "@maos/config";
import {
  applyPhase15cRuntimeAcl,
  openPostgresDatabase,
  verifyPhase15cRuntimeAcl,
} from "@maos/database";

export async function runDatabaseRoleApplyAcl(
  env: Record<string, string | undefined>,
  write = (line: string) => process.stdout.write(`${line}\n`),
) {
  let migration;
  let runtime;
  try {
    if (env.MAOS_ENV === "production")
      throw new Error("PRODUCTION_ACL_FORBIDDEN");
    const config = loadDatabaseMigrationConfig(env);
    migration = await openPostgresDatabase(config.migrationUrl);
    const applied = await applyPhase15cRuntimeAcl(migration, {
      runtimeRole: config.runtimeRole,
    });
    await migration.close();
    migration = undefined;
    runtime = await openPostgresDatabase(config.runtimeUrl);
    const verified = await verifyPhase15cRuntimeAcl(runtime, {
      runtimeRole: config.runtimeRole,
    });
    write(
      JSON.stringify({
        applied_statements: applied.statementCount,
        status: verified.status,
      }),
    );
    return verified.status === "PASS" ? 0 : 1;
  } catch {
    write(
      JSON.stringify({ code: "DATABASE_ROLE_ACL_FAILED", status: "FAILED" }),
    );
    return 1;
  } finally {
    await migration?.close().catch(() => undefined);
    await runtime?.close().catch(() => undefined);
  }
}
const invoked = process.argv[1];
if (invoked && pathToFileURL(resolve(invoked)).href === import.meta.url)
  process.exitCode = await runDatabaseRoleApplyAcl(process.env);
