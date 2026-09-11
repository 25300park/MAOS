import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  applyMigrations,
  loadMigrations,
  PostgresAlertNotificationRepository,
} from "@maos/database";
import { Webhook } from "svix";
import { createAlertEmailApiRuntime } from "../src/alert-email-runtime.js";
import { createApiServer } from "../src/app.js";

const secret = "whsec_dGVzdC13ZWJob29rLXNlY3JldA==";
const env = {
  DATABASE_URL: "postgresql://synthetic.invalid/maos",
  MAOS_ALERT_CRITICAL_ACK_TIMEOUT_SECONDS: "300",
  MAOS_ALERT_EMAIL_ENABLED: "true",
  MAOS_ALERT_EMAIL_ESCALATION_TO: "escalation@example.test",
  MAOS_ALERT_EMAIL_FROM: "MAOS Staging <alerts@example.test>",
  MAOS_ALERT_EMAIL_PRIMARY_TO: "operator@example.test",
  MAOS_ALERT_EMAIL_PROVIDER: "resend",
  MAOS_ALERT_WARNING_ACK_TIMEOUT_SECONDS: "900",
  MAOS_CONTROL_ROOM_ALERT_BASE_URL: "https://maos-web.example.test",
  RESEND_API_KEY: "synthetic-resend-api-key",
  RESEND_WEBHOOK_SECRET: secret,
};

test("registers signed Resend webhook against durable runtime state", async (t) => {
  const database = new PGlite();
  await applyMigrations(
    database,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  const runtime = await createAlertEmailApiRuntime(env, {
    fetch: async () =>
      new Response(JSON.stringify({ id: "email-runtime-1" }), { status: 200 }),
    openDatabase: async () => ({
      close: () => database.close(),
      exec: (sql) => database.exec(sql),
      query: (sql, params) => database.query(sql, params),
    }),
  });
  assert.equal(runtime.enabled, true);
  if (!runtime.enabled) return;
  t.after(() => runtime.close());
  await runtime.notifications.recordOpened({
    affected_system: "maos-api",
    correlation_id: "corr-runtime-1",
    evidence_refs: ["evidence://health/degraded"],
    first_detected_at: "2026-09-11T00:00:00.000Z",
    id: "alert-runtime-1",
    last_observed_at: "2026-09-11T00:00:00.000Z",
    occurrences: 1,
    owner_reference: "role:operator",
    severity: "WARNING",
    state: "OPEN",
    target_id: "api",
  });
  await runtime.notifications.dispatchPending(runtime.adapter);

  const server = createApiServer({
    environment: "staging",
    routes: runtime.routes,
    service: "api",
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => server.close());
  const port = (server.address() as AddressInfo).port;
  const payload = JSON.stringify({
    created_at: "2026-09-11T00:02:00.000Z",
    data: { email_id: "email-runtime-1", private: "must-not-survive" },
    type: "email.delivered",
  });
  const timestamp = new Date();
  const headers = {
    "content-type": "application/json",
    "svix-id": "webhook-runtime-1",
    "svix-signature": new Webhook(secret).sign(
      "webhook-runtime-1",
      timestamp,
      payload,
    ),
    "svix-timestamp": String(Math.floor(timestamp.getTime() / 1_000)),
  };
  const endpoint = `http://127.0.0.1:${port}/api/v1/webhooks/resend`;

  assert.equal(
    (await fetch(endpoint, { body: payload, headers, method: "POST" })).status,
    200,
  );
  assert.equal(
    (await fetch(endpoint, { body: `${payload} `, headers, method: "POST" }))
      .status,
    401,
  );
  const persisted = new PostgresAlertNotificationRepository(database);
  assert.equal(
    (await persisted.listDeliveryEvents()).find(
      ({ provider_event_id }) => provider_event_id === "webhook-runtime-1",
    )?.state,
    "DELIVERED",
  );
  assert.doesNotMatch(
    JSON.stringify(await persisted.listDeliveryEvents()),
    /private|must-not-survive/,
  );
});

test("omits the webhook route when alert email is disabled", async () => {
  const runtime = await createAlertEmailApiRuntime({});
  assert.deepEqual(runtime, { enabled: false, routes: [] });
});

test("fails closed when an enabled API runtime is missing required secrets", async () => {
  const missingApiKey = { ...env, RESEND_API_KEY: undefined };
  await assert.rejects(
    createAlertEmailApiRuntime(missingApiKey),
    /RESEND_API_KEY_REQUIRED/,
  );
});
