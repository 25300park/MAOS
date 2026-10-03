import assert from "node:assert/strict";
import test from "node:test";
import { applyPhase15cRuntimeAcl } from "@maos/database";

test("ACL application obtains a server-quoted role and uses only fixed statements", async () => {
  const executed: string[] = [];
  const database = {
    exec: async (sql: string) => {
      executed.push(sql);
    },
    query: async <Row>(sql: string, params?: unknown[]) => {
      if (sql.includes("quote_ident"))
        return { rows: [{ quoted: '"app_runtime"' }] as Row[] };
      if (sql.includes("pg_roles"))
        return { rows: [{ rolname: params?.[0] }] as Row[] };
      return { rows: [] as Row[] };
    },
  };
  const result = await applyPhase15cRuntimeAcl(database, {
    runtimeRole: "app_runtime",
  });
  assert.equal(result.status, "APPLIED");
  assert.equal(
    executed.some((sql) => sql.includes("GRANT ALL")),
    false,
  );
  assert.equal(
    executed.some((sql) => sql.includes("WITH GRANT OPTION")),
    false,
  );
  assert.equal(
    executed.some((sql) => sql.includes("DELETE")),
    false,
  );
});
