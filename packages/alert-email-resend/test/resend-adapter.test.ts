import assert from "node:assert/strict";
import test from "node:test";
import { Webhook } from "svix";
import { ResendAlertEmailAdapter } from "../src/index.js";

const secret = "whsec_dGVzdC13ZWJob29rLXNlY3JldA==";

test("sends an allowlisted Resend request and reports ACCEPTED only", async () => {
  let received: { body?: string; headers?: Headers; url?: string } = {};
  const adapter = new ResendAlertEmailAdapter(
    {
      apiKey: "synthetic-resend-key",
      escalationTo: "escalation@example.test",
      from: "MAOS Staging <alerts@example.test>",
      primaryTo: "operator@example.test",
      webhookSecret: secret,
    },
    async (input, init) => {
      received = {
        body: String(init?.body),
        headers: new Headers(init?.headers),
        url: String(input),
      };
      return new Response(JSON.stringify({ id: "email-1" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    },
    () => new Date("2026-09-11T00:01:00.000Z"),
  );

  const result = await adapter.send({
    alert_id: "alert-1",
    control_room_alert_url:
      "https://maos-web.example.test/alerts?alert_id=alert-1",
    correlation_id: "corr-alert-1",
    event_kind: "OPENED",
    idempotency_key: "alert-1:OPENED:0",
    notification_id: "notification-1",
    recipient: "PRIMARY",
    severity: "WARNING",
    summary: "WARNING health condition for maos-api",
    system_reference: "maos-api",
  });

  assert.deepEqual(result, {
    accepted_at: "2026-09-11T00:01:00.000Z",
    provider: "RESEND",
    provider_message_id: "email-1",
    state: "ACCEPTED",
  });
  assert.equal(received.url, "https://api.resend.com/emails");
  assert.equal(received.headers?.get("idempotency-key"), "alert-1:OPENED:0");
  assert.match(received.headers?.get("authorization") ?? "", /^Bearer /);
  assert.doesNotMatch(
    received.body ?? "",
    /synthetic-resend-key|stack|password/i,
  );
  assert.deepEqual(JSON.parse(received.body ?? "{}"), {
    from: "MAOS Staging <alerts@example.test>",
    headers: {
      "X-MAOS-Alert-ID": "alert-1",
      "X-MAOS-Correlation-ID": "corr-alert-1",
      "X-MAOS-Notification-ID": "notification-1",
    },
    subject: "[MAOS][WARNING] OPENED · maos-api",
    text: "WARNING health condition for maos-api\n\nReview and acknowledge in MAOS Control Room:\nhttps://maos-web.example.test/alerts?alert_id=alert-1",
    to: ["operator@example.test"],
  });
});

test("verifies signatures and normalizes delivery evidence without recipient data", () => {
  const adapter = new ResendAlertEmailAdapter({
    apiKey: "synthetic-resend-key",
    escalationTo: "escalation@example.test",
    from: "MAOS Staging <alerts@example.test>",
    primaryTo: "operator@example.test",
    webhookSecret: secret,
  });
  const payload = JSON.stringify({
    created_at: "2026-09-11T00:02:00.000Z",
    data: { email_id: "email-1", to: ["operator@example.test"] },
    type: "email.delivered",
  });
  const timestamp = new Date();
  const headers = {
    "svix-id": "webhook-1",
    "svix-signature": new Webhook(secret).sign("webhook-1", timestamp, payload),
    "svix-timestamp": String(Math.floor(timestamp.getTime() / 1_000)),
  };

  assert.deepEqual(adapter.verify(payload, headers), {
    evidence_refs: ["evidence://resend/webhook-1"],
    occurred_at: "2026-09-11T00:02:00.000Z",
    provider: "RESEND",
    provider_event_id: "webhook-1",
    provider_message_id: "email-1",
    state: "DELIVERED",
  });
  assert.throws(
    () => adapter.verify(`${payload} `, headers),
    /INVALID_RESEND_WEBHOOK_SIGNATURE/,
  );
});

test("normalizes delayed, bounced, and failed webhook evidence", () => {
  const adapter = new ResendAlertEmailAdapter({
    apiKey: "synthetic-resend-key",
    escalationTo: "escalation@example.test",
    from: "MAOS Staging <alerts@example.test>",
    primaryTo: "operator@example.test",
    webhookSecret: secret,
  });
  const timestamp = new Date();
  const webhook = new Webhook(secret);

  for (const [type, state, failure] of [
    ["email.delivery_delayed", "DELAYED", undefined],
    ["email.bounced", "BOUNCED", "BOUNCED"],
    ["email.failed", "FAILED", "FAILED"],
  ] as const) {
    const id = `event-${state.toLowerCase()}`;
    const payload = JSON.stringify({
      created_at: "2026-09-11T00:02:00.000Z",
      data: { email_id: "email-1", private: "must-not-survive" },
      type,
    });
    const event = adapter.verify(payload, {
      "svix-id": id,
      "svix-signature": webhook.sign(id, timestamp, payload),
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1_000)),
    });
    assert.equal(event.state, state);
    assert.equal(event.sanitized_failure_code, failure);
    assert.doesNotMatch(JSON.stringify(event), /private|must-not-survive/);
  }
});
