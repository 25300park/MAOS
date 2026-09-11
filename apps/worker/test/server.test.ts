import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  AlertNotificationService,
  InMemoryAlertNotificationRepository,
} from "@maos/module-operations";
import { createWorkerServer, runAlertDeliveryCycle } from "../src/index.js";

test("processes pending alert email and missed-ack escalation in one bounded cycle", async () => {
  const notifications = new AlertNotificationService(
    new InMemoryAlertNotificationRepository(),
    {
      controlRoomBaseUrl: "https://maos-web.example.test",
      id: (() => {
        let id = 0;
        return () => `notification-${++id}`;
      })(),
      now: () => new Date("2026-09-11T00:20:00.000Z"),
    },
  );
  const alert = {
    affected_system: "maos-api",
    correlation_id: "corr-1",
    evidence_refs: ["evidence://health/degraded"],
    first_detected_at: "2026-09-11T00:00:00.000Z",
    id: "alert-1",
    last_observed_at: "2026-09-11T00:00:00.000Z",
    occurrences: 1,
    owner_reference: "role:operator",
    severity: "WARNING" as const,
    state: "OPEN" as const,
    target_id: "api",
  };
  notifications.recordOpened(alert);
  const recipients: string[] = [];
  const result = await runAlertDeliveryCycle({
    adapter: {
      async send(input) {
        recipients.push(input.recipient);
        return {
          accepted_at: "2026-09-11T00:20:00.000Z",
          provider: "RESEND",
          provider_message_id: `email-${recipients.length}`,
          state: "ACCEPTED",
        };
      },
    },
    alerts: [alert],
    notifications,
    policy: { criticalMs: 5 * 60_000, warningMs: 15 * 60_000 },
  });

  assert.deepEqual(result, { dispatched: 2, escalated: 1 });
  assert.deepEqual(recipients, ["PRIMARY", "ESCALATION"]);
});

test("exposes bounded worker liveness and readiness for staging", async (t) => {
  const server = createWorkerServer({ readiness: () => true });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address() as AddressInfo;

  const live = await fetch(`http://127.0.0.1:${port}/health/live`);
  const ready = await fetch(`http://127.0.0.1:${port}/health/ready`);

  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), {
    checks: { process: "HEALTHY" },
    service: "worker",
    status: "HEALTHY",
  });
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), {
    checks: { dependencies: "HEALTHY" },
    service: "worker",
    status: "HEALTHY",
  });
});

test("worker readiness fails closed and unknown paths are not healthy", async (t) => {
  const server = createWorkerServer({ readiness: () => false });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address() as AddressInfo;

  const ready = await fetch(`http://127.0.0.1:${port}/health/ready`);
  const missing = await fetch(`http://127.0.0.1:${port}/unknown`);

  assert.equal(ready.status, 503);
  assert.deepEqual(await ready.json(), {
    checks: { dependencies: "UNAVAILABLE" },
    service: "worker",
    status: "DEGRADED",
  });
  assert.equal(missing.status, 404);
});
