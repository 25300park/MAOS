import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { RuntimeDatabase } from "@maos/database";
import { loadMigrations } from "@maos/database";
import {
  acquireDatabaseMaintenanceLock,
  releaseDatabaseMaintenanceLock,
} from "./database-admin-lock.js";
import {
  MAOS_STAGING_SCHEMAS,
  RESET_MIGRATION_MANIFEST,
  runStagingResetCommand,
} from "./database-reset-staging.js";

const SECRET_SENTINEL = "schema-reset-secret-sentinel";
const stagingEnv = Object.freeze({
  DATABASE_URL: `postgresql://maos:${SECRET_SENTINEL}@localhost:5432/maos`,
  MAOS_DATABASE_RESET_CONFIRM: "RESET_MAOS_STAGING_SCHEMAS",
  MAOS_DATABASE_RESET_TARGET: "staging",
  MAOS_ENV: "staging",
});

interface RuntimeWrapperOptions {
  close?: () => Promise<void>;
  failAfterDrops?: number;
  failPostDropVerification?: boolean;
  exposePgliteSchema?: boolean;
}

function capture() {
  const stderr: string[] = [];
  const stdout: string[] = [];
  return {
    stderr,
    stdout,
    writeStderr: (line: string) => stderr.push(line),
    writeStdout: (line: string) => stdout.push(line),
  };
}

function runtimeDatabase(
  database: PGlite,
  options: RuntimeWrapperOptions = {},
): RuntimeDatabase {
  let drops = 0;
  return {
    close: options.close ?? (async () => undefined),
    exec: async (sql) => {
      if (/^DROP SCHEMA/u.test(sql.trim())) {
        drops += 1;
        if (options.failAfterDrops === drops) {
          throw new Error(`${SECRET_SENTINEL}: injected drop failure`);
        }
      }
      return database.exec(sql);
    },
    query: async <Row>(sql: string, params?: unknown[]) => {
      if (
        options.failPostDropVerification &&
        drops === MAOS_STAGING_SCHEMAS.length &&
        sql.includes("reset:schemas")
      ) {
        throw new Error(`${SECRET_SENTINEL}: injected verification failure`);
      }
      const result = await database.query<Row>(sql, params);
      if (sql.includes("reset:schemas")) {
        if (options.exposePgliteSchema === true) {
          return {
            rows: [...result.rows, { schema_name: "pglite" } as Row],
          };
        }
        return {
          rows: result.rows.filter(
            (row) => (row as { schema_name?: string }).schema_name !== "pglite",
          ),
        };
      }
      return { rows: result.rows };
    },
  };
}

async function prepareResettableDatabase(
  checksumKind: "canonical" | "legacy" = "canonical",
): Promise<PGlite> {
  const database = new PGlite();
  for (const schema of MAOS_STAGING_SCHEMAS) {
    await database.exec(`CREATE SCHEMA ${schema}`);
  }
  await database.exec(`
    CREATE TABLE core.schema_migrations (
      id text PRIMARY KEY,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE delivery.environments (
      name text PRIMARY KEY,
      health text NOT NULL,
      eligible boolean NOT NULL,
      deployment_mode text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  for (const migration of RESET_MIGRATION_MANIFEST) {
    await database.query(
      "INSERT INTO core.schema_migrations (id, checksum) VALUES ($1, $2)",
      [
        migration.id,
        checksumKind === "canonical"
          ? migration.canonicalChecksum
          : migration.legacyCrlfChecksum,
      ],
    );
  }
  for (const name of ["DEVELOPMENT", "PREVIEW", "STAGING", "PRODUCTION"]) {
    await database.query(
      `INSERT INTO delivery.environments
        (name, health, eligible, deployment_mode)
       VALUES ($1, 'UNKNOWN', false, 'SIMULATED')`,
      [name],
    );
  }
  return database;
}

async function execute(database: PGlite, options: RuntimeWrapperOptions = {}) {
  const output = capture();
  const events: string[] = [];
  const exitCode = await runStagingResetCommand({
    dependencies: {
      acquireMaintenanceLock: async () => {
        events.push("maintenance-acquired");
      },
      acquireResetLock: async () => {
        events.push("reset-acquired");
      },
      openDatabase: async () => runtimeDatabase(database, options),
      releaseMaintenanceLock: async () => {
        events.push("maintenance-released");
      },
    },
    env: stagingEnv,
    ...output,
  });
  return { events, exitCode, ...output };
}

async function expectPreConnectionFailure(
  env: Record<string, string | undefined>,
  code: string,
) {
  const output = capture();
  let opened = false;
  const exitCode = await runStagingResetCommand({
    dependencies: {
      openDatabase: async () => {
        opened = true;
        throw new Error("must not connect");
      },
    },
    env,
    ...output,
  });
  assert.equal(exitCode, 1);
  assert.equal(opened, false);
  assert.deepEqual(output.stdout, []);
  assert.deepEqual(
    output.stderr.map((line) => JSON.parse(line)),
    [{ code, status: "FAILED" }],
  );
}

test("missing MAOS_ENV fails before connection", async () => {
  await expectPreConnectionFailure(
    { ...stagingEnv, MAOS_ENV: undefined },
    "STAGING_ENV_REQUIRED",
  );
});

test("production reset is forbidden before connection", async () => {
  await expectPreConnectionFailure(
    { ...stagingEnv, MAOS_ENV: "production" },
    "PRODUCTION_RESET_FORBIDDEN",
  );
});

test("non-staging environment fails before connection", async () => {
  await expectPreConnectionFailure(
    { ...stagingEnv, MAOS_ENV: "preview" },
    "STAGING_ENV_REQUIRED",
  );
});

test("wrong reset target fails before connection", async () => {
  await expectPreConnectionFailure(
    { ...stagingEnv, MAOS_DATABASE_RESET_TARGET: "STAGING" },
    "STAGING_RESET_TARGET_CONFIRMATION_REQUIRED",
  );
});

test("missing or wrong destructive confirmation fails before connection", async () => {
  for (const value of [undefined, "RESET_STAGING"]) {
    await expectPreConnectionFailure(
      { ...stagingEnv, MAOS_DATABASE_RESET_CONFIRM: value },
      "DESTRUCTIVE_CONFIRMATION_REQUIRED",
    );
  }
});

test("missing DATABASE_URL fails before connection", async () => {
  await expectPreConnectionFailure(
    { ...stagingEnv, DATABASE_URL: undefined },
    "DATABASE_URL_REQUIRED",
  );
});

test("malformed and non-PostgreSQL URLs fail before connection", async () => {
  for (const value of ["not-a-url", "mysql://localhost/maos"]) {
    await expectPreConnectionFailure(
      { ...stagingEnv, DATABASE_URL: value },
      "DATABASE_URL_INVALID",
    );
  }
});

test("the reset behavior is bound to exactly the 15 canonical schemas", () => {
  assert.deepEqual(MAOS_STAGING_SCHEMAS, [
    "core",
    "identity",
    "work",
    "ai",
    "execution",
    "governance",
    "knowledge",
    "integration",
    "communication",
    "notification",
    "audit",
    "private",
    "quality",
    "delivery",
    "operations",
  ]);
});

test("the reset preflight manifest exactly matches repository LF and legacy CRLF checksums", async () => {
  const migrations = await loadMigrations(
    fileURLToPath(new URL("../packages/database/migrations/", import.meta.url)),
  );
  assert.deepEqual(
    RESET_MIGRATION_MANIFEST.map(({ canonicalChecksum, id }) => ({
      checksum: canonicalChecksum,
      id,
    })),
    migrations.map(({ checksum, id }) => ({ checksum, id })),
  );
  assert.deepEqual(
    RESET_MIGRATION_MANIFEST.map(({ id, legacyCrlfChecksum }) => ({
      checksum: legacyCrlfChecksum,
      id,
    })),
    migrations.map(({ id, sql }) => ({
      checksum: createHash("sha256")
        .update(sql.replace(/\n/gu, "\r\n"))
        .digest("hex"),
      id,
    })),
  );
});

test("an unexpected user schema rejects reset", async () => {
  const database = await prepareResettableDatabase();
  await database.exec("CREATE SCHEMA unrelated");
  const result = await execute(database);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr[0] ?? "", /UNEXPECTED_SCHEMA_PRESENT/u);
  await database.close();
});

test("a schema named pglite is not treated as PostgreSQL provider infrastructure", async () => {
  const database = await prepareResettableDatabase();
  const output = capture();
  const exitCode = await runStagingResetCommand({
    dependencies: {
      acquireMaintenanceLock: async () => undefined,
      acquireResetLock: async () => undefined,
      openDatabase: async () =>
        runtimeDatabase(database, { exposePgliteSchema: true }),
      releaseMaintenanceLock: async () => undefined,
    },
    env: stagingEnv,
    ...output,
  });
  assert.equal(exitCode, 1);
  assert.match(output.stderr[0] ?? "", /UNEXPECTED_SCHEMA_PRESENT/u);
  await database.close();
});

test("a user table in public rejects reset", async () => {
  const database = await prepareResettableDatabase();
  await database.exec("CREATE TABLE public.unrelated (id integer)");
  const result = await execute(database);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr[0] ?? "", /UNEXPECTED_SCHEMA_PRESENT/u);
  await database.close();
});

test("exact canonical migration metadata is accepted", async () => {
  const database = await prepareResettableDatabase("canonical");
  const result = await execute(database);
  assert.equal(result.exitCode, 0);
  await database.close();
});

test("the deterministic legacy CRLF checksum set is accepted only for reset preflight", async () => {
  const database = await prepareResettableDatabase("legacy");
  const result = await execute(database);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout.join("\n"), /LEGACY_CRLF/u);
  await database.close();
});

test("a mixed LF and CRLF migration registry is rejected", async () => {
  const database = await prepareResettableDatabase("canonical");
  await database.query(
    "UPDATE core.schema_migrations SET checksum = $1 WHERE id = $2",
    [RESET_MIGRATION_MANIFEST[0]?.legacyCrlfChecksum, "0001_canonical_schemas"],
  );
  const result = await execute(database);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr[0] ?? "", /BUSINESS_DATA_PRESENT/u);
  await database.close();
});

test("an unknown migration checksum is rejected", async () => {
  const database = await prepareResettableDatabase();
  await database.query(
    "UPDATE core.schema_migrations SET checksum = $1 WHERE id = $2",
    ["f".repeat(64), "0001_canonical_schemas"],
  );
  const result = await execute(database);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr[0] ?? "", /BUSINESS_DATA_PRESENT/u);
  await database.close();
});

test("missing or extra migration IDs are rejected", async () => {
  for (const mutation of ["missing", "extra"] as const) {
    const database = await prepareResettableDatabase();
    if (mutation === "missing") {
      await database.exec(
        "DELETE FROM core.schema_migrations WHERE id = '0019_staging_session_ingress'",
      );
    } else {
      await database.query(
        "INSERT INTO core.schema_migrations (id, checksum) VALUES ($1, $2)",
        ["0020_unexpected", "a".repeat(64)],
      );
    }
    const result = await execute(database);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr[0] ?? "", /BUSINESS_DATA_PRESENT/u);
    await database.close();
  }
});

test("the exact four canonical seed rows are accepted", async () => {
  const database = await prepareResettableDatabase();
  const result = await execute(database);
  assert.equal(result.exitCode, 0);
  await database.close();
});

test("a modified seed row is rejected", async () => {
  const database = await prepareResettableDatabase();
  await database.exec(
    "UPDATE delivery.environments SET health = 'HEALTHY' WHERE name = 'STAGING'",
  );
  const result = await execute(database);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr[0] ?? "", /BUSINESS_DATA_PRESENT/u);
  await database.close();
});

test("an additional seed row is rejected", async () => {
  const database = await prepareResettableDatabase();
  await database.exec(
    "INSERT INTO delivery.environments (name, health, eligible, deployment_mode) VALUES ('EXTRA', 'UNKNOWN', false, 'SIMULATED')",
  );
  const result = await execute(database);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr[0] ?? "", /BUSINESS_DATA_PRESENT/u);
  await database.close();
});

test("one unexpected business row rejects reset", async () => {
  const database = await prepareResettableDatabase();
  await database.exec(
    "CREATE TABLE work.runtime_data (id integer); INSERT INTO work.runtime_data VALUES (1)",
  );
  const result = await execute(database);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr[0] ?? "", /BUSINESS_DATA_PRESENT/u);
  await database.close();
});

test("the shared maintenance lock helper acquires and releases a session lock", async () => {
  const calls: string[] = [];
  const database = {
    query: async <Row>(sql: string): Promise<{ rows: Row[] }> => {
      calls.push(sql);
      return {
        rows: [
          sql.includes("pg_try_advisory_lock")
            ? { acquired: true }
            : { released: true },
        ] as Row[],
      };
    },
  };
  await acquireDatabaseMaintenanceLock(database);
  await releaseDatabaseMaintenanceLock(database);
  assert.equal(calls.length, 2);
  assert.match(calls[0] ?? "", /pg_try_advisory_lock/u);
  assert.match(calls[1] ?? "", /pg_advisory_unlock/u);
});

test("reset/reset overlap is prevented", async () => {
  const database = {
    query: async <Row>(): Promise<{ rows: Row[] }> => ({
      rows: [{ acquired: false }] as Row[],
    }),
  };
  await assert.rejects(
    acquireDatabaseMaintenanceLock(database),
    /DATABASE_MAINTENANCE_LOCK_UNAVAILABLE/u,
  );
});

test("reset acquires the shared maintenance lock before its transaction lock", async () => {
  const database = await prepareResettableDatabase();
  const result = await execute(database);
  assert.deepEqual(result.events, [
    "maintenance-acquired",
    "reset-acquired",
    "maintenance-released",
  ]);
  await database.close();
});

test("all 15 MAOS schemas are removed after commit", async () => {
  const database = await prepareResettableDatabase();
  const result = await execute(database);
  assert.equal(result.exitCode, 0);
  const rows = await database.query<{ schema_name: string }>(
    "SELECT schema_name FROM information_schema.schemata",
  );
  const remaining = new Set(rows.rows.map(({ schema_name }) => schema_name));
  for (const schema of MAOS_STAGING_SCHEMAS) {
    assert.equal(remaining.has(schema), false);
  }
  await database.close();
});

test("public and system schemas are preserved", async () => {
  const database = await prepareResettableDatabase();
  const result = await execute(database);
  assert.equal(result.exitCode, 0);
  const rows = await database.query<{ schema_name: string }>(
    "SELECT schema_name FROM information_schema.schemata",
  );
  const remaining = new Set(rows.rows.map(({ schema_name }) => schema_name));
  assert.equal(remaining.has("public"), true);
  assert.equal(remaining.has("pg_catalog"), true);
  assert.equal(remaining.has("information_schema"), true);
  await database.close();
});

test("an injected mid-reset failure rolls back every schema drop", async () => {
  const database = await prepareResettableDatabase();
  const result = await execute(database, { failAfterDrops: 5 });
  assert.equal(result.exitCode, 1);
  const rows = await database.query<{ schema_name: string }>(
    "SELECT schema_name FROM information_schema.schemata",
  );
  const remaining = new Set(rows.rows.map(({ schema_name }) => schema_name));
  assert.equal(
    MAOS_STAGING_SCHEMAS.every((schema) => remaining.has(schema)),
    true,
  );
  await database.close();
});

test("post-drop verification failure rolls back every schema drop", async () => {
  const database = await prepareResettableDatabase();
  const result = await execute(database, { failPostDropVerification: true });
  assert.equal(result.exitCode, 1);
  const rows = await database.query<{ schema_name: string }>(
    "SELECT schema_name FROM information_schema.schemata",
  );
  const remaining = new Set(rows.rows.map(({ schema_name }) => schema_name));
  assert.equal(
    MAOS_STAGING_SCHEMAS.every((schema) => remaining.has(schema)),
    true,
  );
  await database.close();
});

test("the database connection closes after success", async () => {
  const database = await prepareResettableDatabase();
  let closed = 0;
  const result = await execute(database, {
    close: async () => {
      closed += 1;
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(closed, 1);
  await database.close();
});

test("the database connection and maintenance lock close after failure", async () => {
  const database = await prepareResettableDatabase();
  let closed = 0;
  const result = await execute(database, {
    close: async () => {
      closed += 1;
    },
    failAfterDrops: 1,
  });
  assert.equal(result.exitCode, 1);
  assert.equal(closed, 1);
  assert.equal(result.events.slice(-1)[0], "maintenance-released");
  await database.close();
});

test("secret sentinels and raw errors are absent from output", async () => {
  const output = capture();
  const exitCode = await runStagingResetCommand({
    dependencies: {
      openDatabase: async () => {
        throw new Error(`${SECRET_SENTINEL}: raw provider error`);
      },
    },
    env: stagingEnv,
    ...output,
  });
  assert.equal(exitCode, 1);
  const rendered = [...output.stdout, ...output.stderr].join("\n");
  assert.doesNotMatch(rendered, new RegExp(SECRET_SENTINEL, "u"));
  assert.doesNotMatch(rendered, /localhost|5432|postgresql:/u);
  assert.match(rendered, /DATABASE_CONNECTION_FAILED/u);
});

test("reset commits no migration application or automatic schema recreation", async () => {
  const database = await prepareResettableDatabase();
  const result = await execute(database);
  assert.equal(result.exitCode, 0);
  const core = await database.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'core') AS exists",
  );
  assert.equal(core.rows[0]?.exists, false);
  await database.close();
});

test("the default executable path attempts real PostgreSQL and has no PGlite fallback", async () => {
  const output = capture();
  const exitCode = await runStagingResetCommand({
    env: {
      ...stagingEnv,
      DATABASE_URL:
        "postgresql://maos:sentinel@127.0.0.1:1/maos?connect_timeout=1",
    },
    ...output,
  });
  assert.equal(exitCode, 1);
  assert.match(output.stderr[0] ?? "", /DATABASE_CONNECTION_FAILED/u);
});
