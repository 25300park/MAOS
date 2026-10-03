import assert from "node:assert/strict";
import test from "node:test";
import { applyMigrations } from "../src/index.js";
import type { MigrationDatabase } from "../src/types.js";

interface RegistryShape {
  readonly columns_match: boolean;
  readonly primary_key_match: boolean;
  readonly schema_exists: boolean;
  readonly table_exists: boolean;
}

const validRegistry = Object.freeze({
  columns_match: true,
  primary_key_match: true,
  schema_exists: true,
  table_exists: true,
});

function governedDatabase(registry: RegistryShape = validRegistry) {
  const statements: string[] = [];
  const database: MigrationDatabase = {
    exec: async (sql) => {
      statements.push(sql);
      if (/\bCREATE\s+(SCHEMA|TABLE)\b/iu.test(sql))
        throw new Error("BOOTSTRAP_DDL_FORBIDDEN");
    },
    query: async <Row>(sql: string) => {
      statements.push(sql);
      if (sql.includes("registry_shape")) return { rows: [registry] as Row[] };
      if (sql.includes("FROM core.schema_migrations"))
        return { rows: [] as Row[] };
      return { rows: [] as Row[] };
    },
  };
  return { database, statements };
}

test("governed migration verifies an existing canonical registry without bootstrap DDL", async () => {
  const { database, statements } = governedDatabase();

  const result = await applyMigrations(database, [], {
    registryMode: "VERIFY_EXISTING",
  });

  assert.deepEqual(result, { applied: [], skipped: [] });
  assert.equal(
    statements.some((sql) => /\bCREATE\s+(SCHEMA|TABLE)\b/iu.test(sql)),
    false,
  );
});

for (const [name, registry, error] of [
  [
    "missing core schema",
    { ...validRegistry, schema_exists: false, table_exists: false },
    "MIGRATION_REGISTRY_SCHEMA_MISSING",
  ],
  [
    "missing migration registry table",
    { ...validRegistry, table_exists: false },
    "MIGRATION_REGISTRY_TABLE_MISSING",
  ],
  [
    "malformed migration registry",
    { ...validRegistry, columns_match: false },
    "MIGRATION_REGISTRY_SHAPE_INVALID",
  ],
] as const) {
  test(`governed migration fails closed for ${name}`, async () => {
    const { database } = governedDatabase(registry);
    await assert.rejects(
      applyMigrations(database, [], { registryMode: "VERIFY_EXISTING" }),
      new RegExp(error, "u"),
    );
  });
}
