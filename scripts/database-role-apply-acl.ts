import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { loadDatabaseAclAdminConfig } from "@maos/config";
import {
  applyPhase15cRuntimeAcl,
  openPostgresDatabase,
  verifyPhase15cRuntimeAcl,
} from "@maos/database";

export async function runDatabaseRoleApplyAcl(
  env: Record<string, string | undefined>,
  write: (line: string) => unknown = (line) =>
    process.stdout.write(`${line}\n`),
  openDatabase = openPostgresDatabase,
) {
  let aclAdmin;
  let runtime;
  try {
    if (env.MAOS_ENV === "production")
      throw new Error("PRODUCTION_ACL_FORBIDDEN");
    const config = loadDatabaseAclAdminConfig(env);
    aclAdmin = await openDatabase(config.aclAdminUrl);
    const input = {
      aclAdminRole: config.aclAdminRole,
      approvedOwnerRoles: (env.MAOS_DATABASE_ACL_APPROVED_OWNER_ROLES ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      ...(config.bootstrapMode ? { bootstrapMode: config.bootstrapMode } : {}),
      environment: config.environment,
      migrationRole: config.migrationRole,
      runtimeRole: config.runtimeRole,
    };
    const applied = await applyPhase15cRuntimeAcl(aclAdmin, input);
    const replay = await applyPhase15cRuntimeAcl(aclAdmin, input);
    if (replay.status !== "REUSED")
      throw new Error("DATABASE_ROLE_ACL_REPLAY_FAILED");
    await aclAdmin.close();
    aclAdmin = undefined;
    runtime = await openDatabase(config.runtimeUrl);
    const verified = await verifyPhase15cRuntimeAcl(runtime, {
      aclAdminRole: config.aclAdminRole,
      migrationRole: config.migrationRole,
      requireRuntimeIdentity: true,
      runtimeRole: config.runtimeRole,
    });
    write(
      JSON.stringify({
        applied_statements: applied.statementCount,
        apply_status: applied.status,
        contract_fingerprint: applied.contractFingerprint,
        replay_status: replay.status,
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
    await aclAdmin?.close().catch(() => undefined);
    await runtime?.close().catch(() => undefined);
  }
}
const invoked = process.argv[1];
if (invoked && pathToFileURL(resolve(invoked)).href === import.meta.url)
  process.exitCode = await runDatabaseRoleApplyAcl(process.env);
