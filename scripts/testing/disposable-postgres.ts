import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";

export interface DisposablePostgresExecutablePaths {
  readonly initdb: string;
  readonly pgCtl: string;
  readonly postgres: string;
  readonly createdb: string;
  readonly psql: string;
}

export interface DisposablePostgresContext {
  readonly databaseName: string;
  readonly migrationRole: string;
  readonly migrationUrl: string;
  readonly runtimeRole: string;
  readonly runtimeUrl: string;
  readonly port: number;
}

export interface DisposablePostgresOptions {
  readonly executables?: DisposablePostgresExecutablePaths;
  readonly startupTimeoutMs?: number;
}

const windowsBin = "C:\\Program Files\\PostgreSQL\\18\\bin";

export const WINDOWS_POSTGRES_18_EXECUTABLES: DisposablePostgresExecutablePaths =
  {
    initdb: join(windowsBin, "initdb.exe"),
    pgCtl: join(windowsBin, "pg_ctl.exe"),
    postgres: join(windowsBin, "postgres.exe"),
    createdb: join(windowsBin, "createdb.exe"),
    psql: join(windowsBin, "psql.exe"),
  };

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function command(
  file: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(file, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("DISPOSABLE_POSTGRES_COMMAND_TIMEOUT"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk).slice(0, 2_048);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `DISPOSABLE_POSTGRES_COMMAND_FAILED:${code}:${stderr.replace(/[\r\n]+/gu, " ").slice(0, 256)}`,
          ),
        );
      }
    });
  });
}

export async function withDisposablePostgres(
  options: DisposablePostgresOptions,
  run: (context: DisposablePostgresContext) => Promise<void>,
): Promise<void> {
  const paths = options.executables ?? WINDOWS_POSTGRES_18_EXECUTABLES;
  const timeoutMs = options.startupTimeoutMs ?? 30_000;
  const root = await mkdtemp(join(tmpdir(), "maos-phase15c-pg-"));
  const data = join(root, "data");
  const port = await freePort();
  let started = false;
  const suffix = randomBytes(6).toString("hex");
  const migrationRole = `maos_migration_${suffix}`;
  const runtimeRole = `maos_runtime_${suffix}`;
  const databaseName = `maos_phase15c_${suffix}`;
  const migrationPassword = randomBytes(24).toString("base64url");
  const runtimePassword = randomBytes(24).toString("base64url");

  try {
    await command(
      paths.initdb,
      [
        "-D",
        data,
        "-U",
        "postgres",
        "-A",
        "trust",
        "--no-locale",
        "--encoding=UTF8",
      ],
      timeoutMs,
    );
    await command(
      paths.pgCtl,
      ["-D", data, "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"],
      timeoutMs,
    );
    started = true;

    const bootstrap = new Client({
      connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`,
    });
    await bootstrap.connect();
    try {
      await bootstrap.query(
        `CREATE ROLE ${migrationRole} LOGIN PASSWORD '${migrationPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
      );
      await bootstrap.query(
        `CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
      );
    } finally {
      await bootstrap.end();
    }
    await command(
      paths.createdb,
      [
        "-h",
        "127.0.0.1",
        "-p",
        String(port),
        "-U",
        "postgres",
        "-O",
        migrationRole,
        databaseName,
      ],
      timeoutMs,
    );
    await run({
      databaseName,
      migrationRole,
      migrationUrl: `postgresql://${migrationRole}:${encodeURIComponent(migrationPassword)}@127.0.0.1:${port}/${databaseName}`,
      runtimeRole,
      runtimeUrl: `postgresql://${runtimeRole}:${encodeURIComponent(runtimePassword)}@127.0.0.1:${port}/${databaseName}`,
      port,
    });
  } finally {
    if (started) {
      await command(
        paths.pgCtl,
        ["-D", data, "-m", "fast", "-w", "stop"],
        timeoutMs,
      ).catch(() => undefined);
    }
    await rm(root, { recursive: true, force: true });
  }
}
