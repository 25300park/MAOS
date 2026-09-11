import assert from "node:assert/strict";
import test from "node:test";
import {
  AlertNotificationService,
  InMemoryAlertNotificationRepository,
  type AlertEmailDeliveryPort,
  type AlertNotificationRepository,
  type OperationsAlert,
} from "../src/index.js";

const alert = (overrides: Partial<OperationsAlert> = {}): OperationsAlert => ({
  affected_system: "maos-api",
  correlation_id: "corr-alert-1",
  evidence_refs: ["evidence://health/degraded"],
  first_detected_at: "2026-09-11T00:00:00.000Z",
  id: "alert-1",
  last_observed_at: "2026-09-11T00:00:00.000Z",
  occurrences: 1,
  owner_reference: "role:platform-operations",
  severity: "WARNING",
  state: "OPEN",
  target_id: "maos-api-staging",
  ...overrides,
});

test("creates exactly one redacted OPENED outbox notification per alert", async () => {
  const repository = new InMemoryAlertNotificationRepository();
  const service = new AlertNotificationService(repository, {
    controlRoomBaseUrl: "https://maos-web.example.test",
    id: () => "notification-1",
    now: () => new Date("2026-09-11T00:00:00.000Z"),
  });

  await service.recordOpened(alert());
  await service.recordOpened(alert());

  assert.deepEqual(await service.notifications(), [
    {
      alert_id: "alert-1",
      control_room_alert_url:
        "https://maos-web.example.test/alerts?alert_id=alert-1",
      correlation_id: "corr-alert-1",
      evidence_refs: ["evidence://health/degraded"],
      event_kind: "OPENED",
      id: "notification-1",
      idempotency_key: "alert-1:OPENED:0",
      occurred_at: "2026-09-11T00:00:00.000Z",
      owner_reference: "role:platform-operations",
      recipient: "PRIMARY",
      severity: "WARNING",
      state: "PENDING",
      summary: "WARNING health condition for maos-api",
      system_reference: "maos-api",
      target_reference: "maos-api-staging",
    },
  ]);
});

test("keeps provider acceptance separate from signed delivery evidence", async () => {
  const repository = new InMemoryAlertNotificationRepository();
  const service = new AlertNotificationService(repository, {
    controlRoomBaseUrl: "https://maos-web.example.test",
    id: () => "notification-1",
    now: () => new Date("2026-09-11T00:01:00.000Z"),
  });
  await service.recordOpened(alert());
  const adapter: AlertEmailDeliveryPort = {
    async send() {
      return {
        accepted_at: "2026-09-11T00:01:00.000Z",
        provider: "RESEND",
        provider_message_id: "email-1",
        state: "ACCEPTED",
      };
    },
  };

  await service.dispatchPending(adapter);
  assert.equal((await service.notifications())[0]?.state, "ACCEPTED");

  assert.deepEqual(
    await service.recordProviderEvent({
      evidence_refs: ["evidence://resend/webhook-1"],
      occurred_at: "2026-09-11T00:02:00.000Z",
      provider: "RESEND",
      provider_event_id: "webhook-1",
      provider_message_id: "email-1",
      state: "DELIVERED",
    }),
    { duplicate: false, state: "DELIVERED" },
  );
  assert.equal((await service.notifications())[0]?.state, "DELIVERED");
  assert.deepEqual(
    await service.recordProviderEvent({
      evidence_refs: ["evidence://resend/webhook-1"],
      occurred_at: "2026-09-11T00:02:00.000Z",
      provider: "RESEND",
      provider_event_id: "webhook-1",
      provider_message_id: "email-1",
      state: "DELIVERED",
    }),
    { duplicate: true, state: "DELIVERED" },
  );

  assert.deepEqual(
    await service.recordProviderEvent({
      evidence_refs: ["evidence://resend/webhook-2"],
      occurred_at: "2026-09-11T00:03:00.000Z",
      provider: "RESEND",
      provider_event_id: "webhook-2",
      provider_message_id: "email-1",
      state: "DELAYED",
    }),
    { duplicate: false, state: "DELIVERED" },
  );
  assert.equal((await service.deliveryEvents()).length, 3);
});

test("escalates a missed acknowledgement once and records recovery without resolving", async () => {
  let now = new Date("2026-09-11T00:16:00.000Z");
  let sequence = 0;
  const repository = new InMemoryAlertNotificationRepository();
  const service = new AlertNotificationService(repository, {
    controlRoomBaseUrl: "https://maos-web.example.test",
    id: () => `notification-${++sequence}`,
    now: () => now,
  });
  const open = alert();
  await service.recordOpened(open);

  assert.equal(
    await service.recordDueEscalations([open], {
      criticalMs: 5 * 60_000,
      warningMs: 15 * 60_000,
    }),
    1,
  );
  assert.equal(
    await service.recordDueEscalations([open], {
      criticalMs: 5 * 60_000,
      warningMs: 15 * 60_000,
    }),
    0,
  );
  now = new Date("2026-09-11T00:17:00.000Z");
  await service.recordRecovery(open, ["evidence://health/recovered"]);

  assert.deepEqual(
    (await service.notifications()).map(({ event_kind, recipient }) => ({
      event_kind,
      recipient,
    })),
    [
      { event_kind: "OPENED", recipient: "PRIMARY" },
      { event_kind: "ESCALATED", recipient: "ESCALATION" },
      { event_kind: "RECOVERY_OBSERVED", recipient: "PRIMARY" },
    ],
  );
  assert.equal(open.state, "OPEN");
  assert.equal((await service.alerts())[0]?.state, "OPEN");
});

test("safely replays pending delivery after worker restart", async () => {
  const repository = new InMemoryAlertNotificationRepository();
  const first = new AlertNotificationService(repository, {
    controlRoomBaseUrl: "https://maos-web.example.test",
    id: () => "notification-1",
    now: () => new Date("2026-09-11T00:00:00.000Z"),
  });
  await first.recordOpened(alert());
  const restarted = new AlertNotificationService(repository, {
    controlRoomBaseUrl: "https://maos-web.example.test",
    id: () => "unused",
    now: () => new Date("2026-09-11T00:01:00.000Z"),
  });
  let sends = 0;
  await restarted.dispatchPending({
    async send() {
      sends += 1;
      return {
        accepted_at: "2026-09-11T00:01:00.000Z",
        provider: "RESEND",
        provider_message_id: "email-1",
        state: "ACCEPTED",
      };
    },
  });
  await restarted.dispatchPending({
    async send() {
      sends += 1;
      throw new Error("must not resend accepted notification");
    },
  });
  assert.equal(sends, 1);
});

test("awaits an asynchronous durable notification repository", async () => {
  const memory = new InMemoryAlertNotificationRepository();
  const repository = {
    appendDeliveryEvent: async (
      ...args: Parameters<typeof memory.appendDeliveryEvent>
    ) => memory.appendDeliveryEvent(...args),
    findByProviderMessageId: async (
      ...args: Parameters<typeof memory.findByProviderMessageId>
    ) => memory.findByProviderMessageId(...args),
    insert: async (...args: Parameters<typeof memory.insert>) =>
      memory.insert(...args),
    list: async () => memory.list(),
    listAlerts: async () => [],
    listDeliveryEvents: async () => memory.listDeliveryEvents(),
    recordAcceptance: async (
      ...args: Parameters<typeof memory.recordAcceptance>
    ) => memory.recordAcceptance(...args),
    updateAlertState: async () => undefined,
    updateDelivery: async (...args: Parameters<typeof memory.updateDelivery>) =>
      memory.updateDelivery(...args),
    upsertAlert: async () => undefined,
  } as unknown as AlertNotificationRepository;
  const service = new AlertNotificationService(repository, {
    controlRoomBaseUrl: "https://maos-web.example.test",
    id: () => "notification-async-1",
    now: () => new Date("2026-09-11T00:00:00.000Z"),
  });

  await service.recordOpened(alert());
  assert.equal(
    await service.dispatchPending({
      async send() {
        return {
          accepted_at: "2026-09-11T00:01:00.000Z",
          provider: "RESEND",
          provider_message_id: "email-async-1",
          state: "ACCEPTED",
        };
      },
    }),
    1,
  );
  assert.equal((await service.notifications())[0]?.state, "ACCEPTED");
});
