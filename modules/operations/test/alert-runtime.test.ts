import assert from "node:assert/strict";
import test from "node:test";
import type {
  AlertEmailAdapterConfig,
  AlertEmailRuntimeAdapter,
} from "../src/alert-runtime.js";
import { createAlertEmailRuntime } from "../src/alert-runtime.js";

const enabledEnv = {
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
  RESEND_WEBHOOK_SECRET: "synthetic-webhook-secret",
};

const adapter = (): AlertEmailRuntimeAdapter => ({
  send: async () => ({
    accepted_at: "2026-09-12T00:00:00.000Z",
    provider: "RESEND",
    provider_message_id: "message-1",
    state: "ACCEPTED",
  }),
  verify: () => ({
    evidence_refs: [],
    occurred_at: "2026-09-12T00:00:00.000Z",
    provider: "RESEND",
    provider_event_id: "event-1",
    provider_message_id: "message-1",
    state: "DELIVERED",
  }),
});

test("keeps disabled email runtime safe without database or secrets", async () => {
  let databaseOpened = false;
  const runtime = await createAlertEmailRuntime(
    {},
    {
      createAdapter: adapter,
      openDatabase: async () => {
        databaseOpened = true;
        throw new Error("must not open database while disabled");
      },
    },
  );

  assert.deepEqual(runtime, { enabled: false });
  assert.equal(databaseOpened, false);
});

test("fails closed when enabled email runtime configuration is incomplete", async () => {
  await assert.rejects(
    createAlertEmailRuntime(
      { MAOS_ALERT_EMAIL_ENABLED: "true" },
      { createAdapter: adapter },
    ),
    /MAOS_ALERT_EMAIL_PROVIDER_INVALID/,
  );
});

test("composes durable alert service without exposing adapter credentials", async (t) => {
  let databaseClosed = false;
  let receivedConfig: AlertEmailAdapterConfig | undefined;
  const runtime = await createAlertEmailRuntime(enabledEnv, {
    createAdapter: (config) => {
      receivedConfig = config;
      return adapter();
    },
    openDatabase: async () => ({
      close: async () => {
        databaseClosed = true;
      },
      exec: async () => undefined,
      query: async () => ({ rows: [] }),
    }),
  });
  t.after(async () => {
    if (runtime.enabled) await runtime.close();
    assert.equal(databaseClosed, true);
  });

  assert.equal(runtime.enabled, true);
  if (!runtime.enabled) return;
  assert.equal(runtime.pollIntervalMs, 30_000);
  assert.equal(receivedConfig?.apiKey, enabledEnv.RESEND_API_KEY);
  assert.deepEqual(await runtime.notifications.notifications(), []);
  const serialized = JSON.stringify(runtime);
  assert.equal(serialized.includes(enabledEnv.RESEND_API_KEY), false);
  assert.equal(serialized.includes(enabledEnv.RESEND_WEBHOOK_SECRET), false);
});
