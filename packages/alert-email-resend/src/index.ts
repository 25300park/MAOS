import { Webhook } from "svix";

export type ResendDeliveryState =
  "ACCEPTED" | "DELIVERED" | "DELAYED" | "BOUNCED" | "FAILED";

export interface ResendAlertEmailConfig {
  apiKey: string;
  escalationTo: string;
  from: string;
  primaryTo: string;
  webhookSecret: string;
}

export interface ResendAlertEmailRequest {
  alert_id: string;
  control_room_alert_url: string;
  correlation_id: string;
  event_kind: "OPENED" | "ESCALATED" | "RECOVERY_OBSERVED" | "RESOLVED";
  idempotency_key: string;
  notification_id: string;
  recipient: "PRIMARY" | "ESCALATION";
  severity: "INFO" | "NOTICE" | "WARNING" | "CRITICAL";
  summary: string;
  system_reference: string;
}

export interface ResendNormalizedDeliveryEvent {
  evidence_refs: readonly string[];
  occurred_at: string;
  provider: "RESEND";
  provider_event_id: string;
  provider_message_id: string;
  sanitized_failure_code?: string;
  state: Exclude<ResendDeliveryState, "ACCEPTED">;
}

type Fetch = typeof fetch;

const required = (value: string, code: string): string => {
  if (!value.trim()) throw new Error(code);
  return value;
};

const safe = (value: string): string =>
  value.replaceAll(/[^A-Za-z0-9 .:_/-]/g, "_").slice(0, 160);

const eventState = (type: string): ResendNormalizedDeliveryEvent["state"] => {
  if (type === "email.delivered") return "DELIVERED";
  if (type === "email.delivery_delayed") return "DELAYED";
  if (type === "email.bounced") return "BOUNCED";
  if (type === "email.failed" || type === "email.suppressed") return "FAILED";
  throw new Error("UNSUPPORTED_RESEND_WEBHOOK_EVENT");
};

export class ResendAlertEmailAdapter {
  readonly #config: ResendAlertEmailConfig;
  readonly #fetch: Fetch;
  readonly #now: () => Date;
  readonly #webhook: Webhook;

  constructor(
    config: ResendAlertEmailConfig,
    fetchImplementation: Fetch = fetch,
    now: () => Date = () => new Date(),
  ) {
    required(config.apiKey, "RESEND_API_KEY_REQUIRED");
    required(config.webhookSecret, "RESEND_WEBHOOK_SECRET_REQUIRED");
    required(config.from, "ALERT_EMAIL_FROM_REQUIRED");
    required(config.primaryTo, "ALERT_EMAIL_PRIMARY_TO_REQUIRED");
    required(config.escalationTo, "ALERT_EMAIL_ESCALATION_TO_REQUIRED");
    this.#config = Object.freeze({ ...config });
    this.#fetch = fetchImplementation;
    this.#now = now;
    this.#webhook = new Webhook(config.webhookSecret);
  }

  async send(input: ResendAlertEmailRequest): Promise<{
    accepted_at: string;
    provider: "RESEND";
    provider_message_id: string;
    state: "ACCEPTED";
  }> {
    const response = await this.#fetch("https://api.resend.com/emails", {
      body: JSON.stringify({
        from: this.#config.from,
        headers: {
          "X-MAOS-Alert-ID": safe(input.alert_id),
          "X-MAOS-Correlation-ID": safe(input.correlation_id),
          "X-MAOS-Notification-ID": safe(input.notification_id),
        },
        subject: `[MAOS][${input.severity}] ${input.event_kind} · ${safe(input.system_reference)}`,
        text: `${safe(input.summary)}\n\nReview and acknowledge in MAOS Control Room:\n${input.control_room_alert_url}`,
        to: [
          input.recipient === "ESCALATION"
            ? this.#config.escalationTo
            : this.#config.primaryTo,
        ],
      }),
      headers: {
        authorization: `Bearer ${this.#config.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": input.idempotency_key,
      },
      method: "POST",
    });
    if (!response.ok) throw new Error(`RESEND_SEND_FAILED_${response.status}`);
    const body = (await response.json()) as { id?: unknown };
    if (typeof body.id !== "string" || !body.id)
      throw new Error("INVALID_RESEND_ACCEPTANCE");
    return {
      accepted_at: this.#now().toISOString(),
      provider: "RESEND",
      provider_message_id: body.id,
      state: "ACCEPTED",
    };
  }

  verify(
    rawBody: string | Buffer,
    headers: Record<string, string>,
  ): ResendNormalizedDeliveryEvent {
    let body: unknown;
    try {
      body = this.#webhook.verify(rawBody, headers);
    } catch {
      throw new Error("INVALID_RESEND_WEBHOOK_SIGNATURE");
    }
    if (!body || typeof body !== "object")
      throw new Error("INVALID_RESEND_WEBHOOK_PAYLOAD");
    const event = body as {
      created_at?: unknown;
      data?: { email_id?: unknown };
      type?: unknown;
    };
    const eventId = headers["svix-id"];
    if (
      !eventId ||
      typeof event.created_at !== "string" ||
      typeof event.data?.email_id !== "string" ||
      typeof event.type !== "string"
    )
      throw new Error("INVALID_RESEND_WEBHOOK_PAYLOAD");
    const state = eventState(event.type);
    return {
      evidence_refs: [`evidence://resend/${safe(eventId)}`],
      occurred_at: event.created_at,
      provider: "RESEND",
      provider_event_id: safe(eventId),
      provider_message_id: safe(event.data.email_id),
      ...(state === "FAILED" || state === "BOUNCED"
        ? {
            sanitized_failure_code: event.type
              .replace("email.", "")
              .toUpperCase(),
          }
        : {}),
      state,
    };
  }
}
