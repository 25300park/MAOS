import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  applyMigrations,
  loadMigrations,
  PostgresAlertNotificationRepository,
} from "../src/index.js";

const migrationsDirectory = resolve("packages/database/migrations");

test("persists alert outbox and delivery state across repository restarts", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(database, await loadMigrations(migrationsDirectory));

  const first = new PostgresAlertNotificationRepository(database);
  const alert = {
    affected_system: "maos-api",
    correlation_id: "corr-runtime-1",
    evidence_refs: ["evidence://health/degraded"],
    first_detected_at: "2026-09-11T00:00:00.000Z",
    id: "alert-runtime-1",
    last_observed_at: "2026-09-11T00:00:00.000Z",
    occurrences: 1,
    owner_reference: "role:operator",
    severity: "WARNING" as const,
    state: "OPEN" as const,
    target_id: "api",
  };
  const notification = {
    alert_id: alert.id,
    control_room_alert_url:
      "https://maos-web.example.test/alerts?alert_id=alert-runtime-1",
    correlation_id: alert.correlation_id,
    evidence_refs: alert.evidence_refs,
    event_kind: "OPENED" as const,
    id: "notification-runtime-1",
    idempotency_key: "alert-runtime-1:OPENED:0",
    occurred_at: "2026-09-11T00:00:00.000Z",
    owner_reference: alert.owner_reference,
    recipient: "PRIMARY" as const,
    severity: alert.severity,
    state: "PENDING" as const,
    summary: "WARNING health condition for maos-api",
    system_reference: alert.affected_system,
    target_reference: alert.target_id,
  };

  await first.upsertAlert(alert);
  assert.equal(await first.insert(notification), true);
  assert.equal(await first.insert(notification), false);

  const restarted = new PostgresAlertNotificationRepository(database);
  assert.deepEqual(await restarted.list(), [notification]);
  assert.deepEqual(await restarted.listAlerts(), [alert]);

  await restarted.recordAcceptance(notification.id, {
    evidence_refs: ["evidence://resend/acceptance/email-runtime-1"],
    occurred_at: "2026-09-11T00:01:00.000Z",
    provider: "RESEND",
    provider_event_id: "acceptance:email-runtime-1",
    provider_message_id: "email-runtime-1",
    state: "ACCEPTED",
  });
  const delivered = {
    evidence_refs: ["evidence://resend/event-runtime-1"],
    occurred_at: "2026-09-11T00:02:00.000Z",
    provider: "RESEND" as const,
    provider_event_id: "event-runtime-1",
    provider_message_id: "email-runtime-1",
    state: "DELIVERED" as const,
  };
  assert.equal(await restarted.appendDeliveryEvent(delivered), true);
  assert.equal(await restarted.appendDeliveryEvent(delivered), false);
  await restarted.updateDelivery(notification.id, "DELIVERED");
  await restarted.updateAlertState(alert.id, "ACKNOWLEDGED", [
    "evidence://human/ack-runtime-1",
  ]);

  const afterRestart = new PostgresAlertNotificationRepository(database);
  assert.equal((await afterRestart.list())[0]?.state, "DELIVERED");
  assert.equal((await afterRestart.listAlerts())[0]?.state, "ACKNOWLEDGED");
  assert.deepEqual(
    await afterRestart.listDeliveryEvents(),
    [
      {
        ...delivered,
        evidence_refs: ["evidence://resend/event-runtime-1"],
      },
      {
        evidence_refs: ["evidence://resend/acceptance/email-runtime-1"],
        occurred_at: "2026-09-11T00:01:00.000Z",
        provider: "RESEND",
        provider_event_id: "acceptance:email-runtime-1",
        provider_message_id: "email-runtime-1",
        state: "ACCEPTED",
      },
    ].sort((left, right) => left.occurred_at.localeCompare(right.occurred_at)),
  );
});
