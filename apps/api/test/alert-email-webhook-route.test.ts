import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  AlertNotificationService,
  InMemoryAlertNotificationRepository,
} from "@maos/module-operations";
import { createAlertEmailWebhookRoute } from "../src/alert-email-webhook-route.js";
import { createApiServer } from "../src/app.js";

const raw = '{"type":"email.delivered","data":{"email_id":"email-1"}}';

test("preserves the raw signed webhook body and fails closed on invalid signatures", async (t) => {
  const repository = new InMemoryAlertNotificationRepository();
  const notifications = new AlertNotificationService(repository, {
    controlRoomBaseUrl: "https://maos-web.example.test",
    id: () => "notification-1",
  });
  await notifications.recordOpened({
    affected_system: "maos-api",
    correlation_id: "corr-1",
    evidence_refs: [],
    first_detected_at: "2026-09-11T00:00:00.000Z",
    id: "alert-1",
    last_observed_at: "2026-09-11T00:00:00.000Z",
    occurrences: 1,
    owner_reference: "role:operator",
    severity: "WARNING",
    state: "OPEN",
    target_id: "api",
  });
  await notifications.dispatchPending({
    async send() {
      return {
        accepted_at: "2026-09-11T00:01:00.000Z",
        provider: "RESEND",
        provider_message_id: "email-1",
        state: "ACCEPTED",
      };
    },
  });
  const route = createAlertEmailWebhookRoute(
    {
      verify(body, headers) {
        assert.equal(body.toString("utf8"), raw);
        if (headers["svix-signature"] !== "valid")
          throw new Error("INVALID_RESEND_WEBHOOK_SIGNATURE");
        return {
          evidence_refs: ["evidence://resend/event-1"],
          occurred_at: "2026-09-11T00:02:00.000Z",
          provider: "RESEND",
          provider_event_id: "event-1",
          provider_message_id: "email-1",
          state: "DELIVERED",
        };
      },
    },
    notifications,
  );
  const server = createApiServer({
    environment: "development",
    routes: [route],
    service: "api",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/api/v1/webhooks/resend`;

  const invalid = await fetch(url, {
    body: raw,
    headers: { "content-type": "application/json", "svix-signature": "bad" },
    method: "POST",
  });
  assert.equal(invalid.status, 401);

  const valid = await fetch(url, {
    body: raw,
    headers: { "content-type": "application/json", "svix-signature": "valid" },
    method: "POST",
  });
  assert.equal(valid.status, 200);
  assert.deepEqual(((await valid.json()) as { data: unknown }).data, {
    duplicate: false,
    state: "DELIVERED",
  });
});
