import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  applyMigrations,
  loadMigrations,
  PostgresAlertNotificationRepository,
} from "@maos/database";
import { createAlertEmailApiRuntime } from "../../api/src/alert-email-runtime.js";
import { createAlertEmailWorkerRuntime } from "../src/alert-email-runtime.js";

const env = {
  DATABASE_URL: "postgresql://synthetic.invalid/maos",
  MAOS_ALERT_CRITICAL_ACK_TIMEOUT_SECONDS: "300",
  MAOS_ALERT_EMAIL_ENABLED: "true",
  MAOS_ALERT_EMAIL_ESCALATION_TO: "escalation@example.test",
  MAOS_ALERT_EMAIL_FROM: "MAOS Staging <alerts@example.test>",
  MAOS_ALERT_EMAIL_POLL_INTERVAL_SECONDS: "30",
  MAOS_ALERT_EMAIL_PRIMARY_TO: "operator@example.test",
  MAOS_ALERT_EMAIL_PROVIDER: "resend",
  MAOS_ALERT_WARNING_ACK_TIMEOUT_SECONDS: "900",
  MAOS_CONTROL_ROOM_ALERT_BASE_URL: "https://maos-web.example.test",
  RESEND_API_KEY: "synthetic-resend-api-key",
  RESEND_WEBHOOK_SECRET: "whsec_dGVzdC13ZWJob29rLXNlY3JldA==",
};

const alert = {
  affected_system: "maos-api",
  correlation_id: "corr-worker-runtime-1",
  evidence_refs: ["evidence://health/degraded"],
  first_detected_at: "2026-09-11T00:00:00.000Z",
  id: "alert-worker-runtime-1",
  last_observed_at: "2026-09-11T00:00:00.000Z",
  occurrences: 1,
  owner_reference: "role:operator",
  severity: "WARNING" as const,
  state: "OPEN" as const,
  target_id: "api",
};

test("replays API-created outbox work with single-flight worker polling", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(
    database,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  const openDatabase = async () => ({
    close: async () => undefined,
    exec: (sql: string) => database.exec(sql),
    query: <Row>(sql: string, params?: unknown[]) =>
      database.query<Row>(sql, params),
  });
  const api = await createAlertEmailApiRuntime(env, { openDatabase });
  assert.equal(api.enabled, true);
  if (!api.enabled) return;
  await api.notifications.recordOpened(alert);
  await api.close();

  let active = 0;
  let maximumActive = 0;
  let sends = 0;
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const worker = await createAlertEmailWorkerRuntime(env, {
    fetch: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      sends += 1;
      await gate;
      active -= 1;
      return new Response(JSON.stringify({ id: `email-${sends}` }), {
        status: 200,
      });
    },
    now: () => new Date("2026-09-11T00:20:00.000Z"),
    openDatabase,
  });
  assert.equal(worker.enabled, true);
  const first = worker.runNow();
  const overlapping = worker.runNow();
  release();
  const [firstResult, overlappingResult] = await Promise.all([
    first,
    overlapping,
  ]);

  assert.deepEqual(firstResult, overlappingResult);
  assert.deepEqual(firstResult, { dispatched: 2, escalated: 1 });
  assert.equal(maximumActive, 1);
  assert.equal(sends, 2);
  assert.equal(worker.readiness(), true);
  await worker.notifications.recordRecovery(alert, [
    "evidence://health/recovered",
  ]);
  const persisted = new PostgresAlertNotificationRepository(database);
  assert.equal(
    (await persisted.list()).some(
      ({ alert_id, event_kind }) =>
        alert_id === alert.id && event_kind === "RECOVERY_OBSERVED",
    ),
    true,
  );
  assert.equal((await persisted.listAlerts())[0]?.state, "OPEN");
  await worker.stop();
});

test("waits for an active cycle during graceful shutdown", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(
    database,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const worker = await createAlertEmailWorkerRuntime(env, {
    fetch: async () => {
      await gate;
      return new Response(JSON.stringify({ id: "email-graceful" }), {
        status: 200,
      });
    },
    now: () => new Date("2026-09-11T00:01:00.000Z"),
    openDatabase: async () => ({
      close: async () => undefined,
      exec: (sql) => database.exec(sql),
      query: (sql, params) => database.query(sql, params),
    }),
  });
  assert.equal(worker.enabled, true);
  if (!worker.enabled) return;
  await worker.notifications.recordOpened(alert);
  const running = worker.runNow();
  let stopped = false;
  const stopping = worker.stop().then(() => {
    stopped = true;
  });
  await new Promise((done) => setImmediate(done));
  assert.equal(stopped, false);
  release();
  await Promise.all([running, stopping]);
  assert.equal(stopped, true);
});

test("keeps disabled worker runtime ready without polling dependencies", async () => {
  const worker = await createAlertEmailWorkerRuntime({});
  assert.equal(worker.enabled, false);
  assert.equal(worker.readiness(), true);
  assert.deepEqual(await worker.runNow(), { dispatched: 0, escalated: 0 });
  worker.start();
  await worker.stop();
});

test("marks readiness unavailable after a delivery dependency failure", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(
    database,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  const worker = await createAlertEmailWorkerRuntime(env, {
    fetch: async () => new Response("unavailable", { status: 503 }),
    openDatabase: async () => ({
      close: async () => undefined,
      exec: (sql) => database.exec(sql),
      query: (sql, params) => database.query(sql, params),
    }),
  });
  assert.equal(worker.enabled, true);
  if (!worker.enabled) return;
  await worker.notifications.recordOpened(alert);

  await assert.rejects(worker.runNow(), /RESEND_SEND_FAILED_503/);
  assert.equal(worker.readiness(), false);
  await worker.stop();
});
