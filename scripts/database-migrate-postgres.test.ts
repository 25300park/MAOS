import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Migration, RuntimeDatabase } from "@maos/database";
import { applyMigrations, loadMigrations } from "@maos/database";
import { runPostgresMigrationCommand } from "./database-migrate-postgres.js";

const SECRET_SENTINEL = "migration-secret-sentinel";
const stagingEnv = Object.freeze({
  DATABASE_URL: `postgresql://maos:${SECRET_SENTINEL}@localhost:5432/maos`,
  MAOS_DATABASE_MIGRATION_TARGET: "staging",
  MAOS_ENV: "staging",
});

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
  close: () => Promise<void> = async () => undefined,
): RuntimeDatabase {
  return {
    close,
    exec: (sql) => database.exec(sql),
    query: async <Row>(sql: string, params?: unknown[]) => {
      if (sql.includes("pg_try_advisory_lock")) {
        return { rows: [{ acquired: true }] as Row[] };
      }
      if (sql.includes("pg_advisory_unlock")) {
        return { rows: [{ released: true }] as Row[] };
      }
      const result = await database.query<Row>(sql, params);
      return { rows: result.rows };
    },
  };
}

test("serializes real PostgreSQL migration with the shared maintenance lock", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const events: string[] = [];
  const output = capture();
  const exitCode = await runPostgresMigrationCommand({
    dependencies: {
      acquireMaintenanceLock: async () => {
        events.push("acquired");
      },
      loadMigrations: async () => [
        { checksum: "a".repeat(64), id: "0001_lock_probe", sql: "SELECT 1" },
      ],
      openDatabase: async () => runtimeDatabase(database),
      releaseMaintenanceLock: async () => {
        events.push("released");
      },
    },
    env: stagingEnv,
    ...output,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(events, ["acquired", "released"]);
});

test("a migration cannot start while the shared maintenance lock is held", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const output = capture();
  const exitCode = await runPostgresMigrationCommand({
    dependencies: {
      acquireMaintenanceLock: async () => {
        throw new Error("DATABASE_MAINTENANCE_LOCK_UNAVAILABLE");
      },
      loadMigrations: async () => [
        { checksum: "a".repeat(64), id: "0001_lock_probe", sql: "SELECT 1" },
      ],
      openDatabase: async () => runtimeDatabase(database),
    },
    env: stagingEnv,
    ...output,
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(
    output.stderr.map((line) => JSON.parse(line)),
    [{ code: "MIGRATION_LOCK_FAILED", status: "FAILED" }],
  );
});

test("rejects a missing DATABASE_URL before opening a connection", async () => {
  const output = capture();
  let opened = false;
  const exitCode = await runPostgresMigrationCommand({
    dependencies: {
      openDatabase: async () => {
        opened = true;
        throw new Error("must not connect");
      },
    },
    env: { ...stagingEnv, DATABASE_URL: undefined },
    ...output,
  });

  assert.equal(exitCode, 1);
  assert.equal(opened, false);
  assert.deepEqual(
    output.stderr.map((line) => JSON.parse(line)),
    [{ code: "DATABASE_URL_REQUIRED", status: "FAILED" }],
  );
});

test("rejects malformed and non-PostgreSQL URLs before opening", async () => {
  for (const databaseUrl of ["not-a-url", "mysql://localhost/maos"]) {
    const output = capture();
    let opened = false;
    const exitCode = await runPostgresMigrationCommand({
      dependencies: {
        openDatabase: async () => {
          opened = true;
          throw new Error("must not connect");
        },
      },
      env: { ...stagingEnv, DATABASE_URL: databaseUrl },
      ...output,
    });

    assert.equal(exitCode, 1);
    assert.equal(opened, false);
    assert.deepEqual(
      output.stderr.map((line) => JSON.parse(line)),
      [{ code: "DATABASE_URL_INVALID", status: "FAILED" }],
    );
  }
});

test("requires the exact staging environment before opening", async () => {
  for (const environment of [undefined, "development", "preview"]) {
    const output = capture();
    let opened = false;
    const exitCode = await runPostgresMigrationCommand({
      dependencies: {
        openDatabase: async () => {
          opened = true;
          throw new Error("must not connect");
        },
      },
      env: { ...stagingEnv, MAOS_ENV: environment },
      ...output,
    });

    assert.equal(exitCode, 1);
    assert.equal(opened, false);
    assert.deepEqual(
      output.stderr.map((line) => JSON.parse(line)),
      [{ code: "STAGING_ENV_REQUIRED", status: "FAILED" }],
    );
  }
});

test("forbids production before opening a connection", async () => {
  const output = capture();
  let opened = false;
  const exitCode = await runPostgresMigrationCommand({
    dependencies: {
      openDatabase: async () => {
        opened = true;
        throw new Error("must not connect");
      },
    },
    env: { ...stagingEnv, MAOS_ENV: "production" },
    ...output,
  });

  assert.equal(exitCode, 1);
  assert.equal(opened, false);
  assert.deepEqual(
    output.stderr.map((line) => JSON.parse(line)),
    [{ code: "PRODUCTION_MIGRATION_FORBIDDEN", status: "FAILED" }],
  );
});

test("requires an exact staging migration target before opening", async () => {
  for (const target of [undefined, "production", "STAGING"]) {
    const output = capture();
    let opened = false;
    const exitCode = await runPostgresMigrationCommand({
      dependencies: {
        openDatabase: async () => {
          opened = true;
          throw new Error("must not connect");
        },
      },
      env: { ...stagingEnv, MAOS_DATABASE_MIGRATION_TARGET: target },
      ...output,
    });

    assert.equal(exitCode, 1);
    assert.equal(opened, false);
    assert.deepEqual(
      output.stderr.map((line) => JSON.parse(line)),
      [
        {
          code: "STAGING_TARGET_CONFIRMATION_REQUIRED",
          status: "FAILED",
        },
      ],
    );
  }
});

test("applies migrations 0001 through 0019 and skips all 19 on replay", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  let closeCount = 0;
  const openDatabase = async () =>
    runtimeDatabase(database, async () => {
      closeCount += 1;
    });

  const first = capture();
  assert.equal(
    await runPostgresMigrationCommand({
      dependencies: { openDatabase },
      env: stagingEnv,
      ...first,
    }),
    0,
  );
  const firstRecords = first.stdout.map((line) => JSON.parse(line));
  assert.equal(firstRecords.length, 20);
  assert.equal(firstRecords[0].migration_id, "0001_canonical_schemas");
  assert.equal(firstRecords[18].migration_id, "0019_staging_session_ingress");
  assert.ok(
    firstRecords.slice(0, 19).every(({ status }) => status === "APPLIED"),
  );
  assert.deepEqual(firstRecords[19], {
    applied: 19,
    skipped: 0,
    status: "SUCCEEDED",
  });

  const replay = capture();
  assert.equal(
    await runPostgresMigrationCommand({
      dependencies: { openDatabase },
      env: stagingEnv,
      ...replay,
    }),
    0,
  );
  const replayRecords = replay.stdout.map((line) => JSON.parse(line));
  assert.ok(
    replayRecords.slice(0, 19).every(({ status }) => status === "SKIPPED"),
  );
  assert.deepEqual(replayRecords[19], {
    applied: 0,
    skipped: 19,
    status: "SUCCEEDED",
  });
  assert.equal(closeCount, 2);
});

test("reports checksum drift without leaking database credentials", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const migration: Migration = {
    checksum: "a".repeat(64),
    id: "0001_probe",
    sql: "CREATE TABLE public.probe(id text)",
  };
  await applyMigrations(database, [migration]);
  const output = capture();

  const exitCode = await runPostgresMigrationCommand({
    dependencies: {
      loadMigrations: async () => [{ ...migration, checksum: "b".repeat(64) }],
      openDatabase: async () => runtimeDatabase(database),
    },
    env: stagingEnv,
    ...output,
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(
    output.stderr.map((line) => JSON.parse(line)),
    [
      {
        code: "CHECKSUM_MISMATCH",
        migration_id: "0001_probe",
        status: "FAILED",
      },
    ],
  );
  assert.doesNotMatch(
    output.stderr.join("\n"),
    new RegExp(SECRET_SENTINEL, "u"),
  );
});

test("replays real-entrypoint migration loading across CRLF and LF checkouts", async (t) => {
  const crlfDirectory = await mkdtemp(join(tmpdir(), "maos-migrate-crlf-"));
  const lfDirectory = await mkdtemp(join(tmpdir(), "maos-migrate-lf-"));
  const database = new PGlite();
  t.after(async () => {
    await database.close();
    await rm(crlfDirectory, { force: true, recursive: true });
    await rm(lfDirectory, { force: true, recursive: true });
  });
  await writeFile(
    join(crlfDirectory, "0001_line_endings.sql"),
    "CREATE TABLE public.line_endings(id text);\r\n",
    "utf8",
  );
  await writeFile(
    join(lfDirectory, "0001_line_endings.sql"),
    "CREATE TABLE public.line_endings(id text);\n",
    "utf8",
  );
  let directory = crlfDirectory;
  const openDatabase = async () => runtimeDatabase(database);
  const load = async () => loadMigrations(directory);

  const first = capture();
  assert.equal(
    await runPostgresMigrationCommand({
      dependencies: { loadMigrations: load, openDatabase },
      env: stagingEnv,
      ...first,
    }),
    0,
  );
  directory = lfDirectory;
  const replay = capture();
  assert.equal(
    await runPostgresMigrationCommand({
      dependencies: { loadMigrations: load, openDatabase },
      env: stagingEnv,
      ...replay,
    }),
    0,
  );
  assert.deepEqual(
    replay.stdout.map((line) => JSON.parse(line)),
    [
      {
        checksum: JSON.parse(first.stdout[0] ?? "{}").checksum,
        migration_id: "0001_line_endings",
        status: "SKIPPED",
      },
      { applied: 0, skipped: 1, status: "SUCCEEDED" },
    ],
  );
});

test("preserves prior committed migrations when a later migration fails", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const migrations: Migration[] = [
    {
      checksum: "a".repeat(64),
      id: "0001_committed",
      sql: "CREATE TABLE public.committed_probe(id text)",
    },
    {
      checksum: "b".repeat(64),
      id: "0002_failed",
      sql: "CREATE TABLE public.rolled_back_probe(id text); SELECT * FROM public.missing_probe;",
    },
  ];
  const output = capture();

  assert.equal(
    await runPostgresMigrationCommand({
      dependencies: {
        loadMigrations: async () => migrations,
        openDatabase: async () => runtimeDatabase(database),
      },
      env: stagingEnv,
      ...output,
    }),
    1,
  );
  const recorded = await database.query<{ id: string }>(
    "SELECT id FROM core.schema_migrations ORDER BY id",
  );
  assert.deepEqual(recorded.rows, [{ id: "0001_committed" }]);
  assert.deepEqual(
    output.stderr.map((line) => JSON.parse(line)),
    [{ code: "MIGRATION_APPLICATION_FAILED", status: "FAILED" }],
  );
});

test("does not open a database when migration loading fails", async () => {
  const output = capture();
  let closed = false;
  const database = new PGlite();
  const exitCode = await runPostgresMigrationCommand({
    dependencies: {
      loadMigrations: async () => {
        throw new Error("load failed");
      },
      openDatabase: async () =>
        runtimeDatabase(database, async () => {
          closed = true;
          await database.close();
        }),
    },
    env: stagingEnv,
    ...output,
  });

  assert.equal(exitCode, 1);
  assert.equal(closed, false);
  assert.deepEqual(
    output.stderr.map((line) => JSON.parse(line)),
    [{ code: "MIGRATION_LOAD_FAILED", status: "FAILED" }],
  );
});

test("closes an opened database after application failure", async () => {
  const output = capture();
  let closed = false;
  const database = new PGlite();
  const exitCode = await runPostgresMigrationCommand({
    dependencies: {
      loadMigrations: async () => [
        {
          checksum: "a".repeat(64),
          id: "0001_failure",
          sql: "SELECT * FROM public.missing_probe",
        },
      ],
      openDatabase: async () =>
        runtimeDatabase(database, async () => {
          closed = true;
          await database.close();
        }),
    },
    env: stagingEnv,
    ...output,
  });

  assert.equal(exitCode, 1);
  assert.equal(closed, true);
});

test("emits only allowlisted migration evidence and never the URL secret", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const output = capture();
  assert.equal(
    await runPostgresMigrationCommand({
      dependencies: {
        loadMigrations: async () => [
          {
            checksum: "c".repeat(64),
            id: "0001_evidence",
            sql: "SELECT 1",
          },
        ],
        openDatabase: async () => runtimeDatabase(database),
      },
      env: stagingEnv,
      ...output,
    }),
    0,
  );

  assert.deepEqual(
    output.stdout.map((line) => JSON.parse(line)),
    [
      {
        checksum: "c".repeat(64),
        migration_id: "0001_evidence",
        status: "APPLIED",
      },
      { applied: 1, skipped: 0, status: "SUCCEEDED" },
    ],
  );
  assert.equal(output.stderr.length, 0);
  assert.doesNotMatch(
    output.stdout.join("\n"),
    new RegExp(SECRET_SENTINEL, "u"),
  );
});

test("uses the real PostgreSQL adapter by default and never falls back to PGlite", async () => {
  const output = capture();
  const exitCode = await runPostgresMigrationCommand({
    env: {
      ...stagingEnv,
      DATABASE_URL: "postgresql://user:unprinted@127.0.0.1:1/maos",
    },
    ...output,
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(
    output.stderr.map((line) => JSON.parse(line)),
    [{ code: "DATABASE_CONNECTION_FAILED", status: "FAILED" }],
  );
  assert.equal(output.stdout.length, 0);
});
