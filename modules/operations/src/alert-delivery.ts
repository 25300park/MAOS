import { randomUUID } from "node:crypto";
import type { OperationsAlert } from "./hardening.js";

export type AlertNotificationEventKind =
  "OPENED" | "ESCALATED" | "RECOVERY_OBSERVED" | "RESOLVED";
export type AlertEmailDeliveryState =
  "PENDING" | "ACCEPTED" | "DELIVERED" | "DELAYED" | "BOUNCED" | "FAILED";
export type AlertEmailRecipient = "PRIMARY" | "ESCALATION";

export interface AlertEmailNotification {
  alert_id: string;
  control_room_alert_url: string;
  correlation_id: string;
  evidence_refs: readonly string[];
  event_kind: AlertNotificationEventKind;
  id: string;
  idempotency_key: string;
  occurred_at: string;
  owner_reference: string;
  provider_message_id?: string;
  recipient: AlertEmailRecipient;
  severity: OperationsAlert["severity"];
  state: AlertEmailDeliveryState;
  summary: string;
  system_reference: string;
  target_reference: string;
}

export interface AlertEmailDeliveryEvent {
  evidence_refs: readonly string[];
  occurred_at: string;
  provider: "RESEND";
  provider_event_id: string;
  provider_message_id: string;
  sanitized_failure_code?: string;
  state: Exclude<AlertEmailDeliveryState, "PENDING">;
}

export interface AlertEmailDeliveryPort {
  send(input: {
    alert_id: string;
    control_room_alert_url: string;
    correlation_id: string;
    event_kind: AlertNotificationEventKind;
    idempotency_key: string;
    notification_id: string;
    recipient: AlertEmailRecipient;
    severity: OperationsAlert["severity"];
    summary: string;
    system_reference: string;
  }): Promise<{
    accepted_at: string;
    provider: "RESEND";
    provider_message_id: string;
    state: "ACCEPTED";
  }>;
}

export interface AlertNotificationRepository {
  appendDeliveryEvent(event: AlertEmailDeliveryEvent): boolean;
  findByProviderMessageId(id: string): AlertEmailNotification | undefined;
  insert(notification: AlertEmailNotification): boolean;
  list(): readonly AlertEmailNotification[];
  listDeliveryEvents(): readonly AlertEmailDeliveryEvent[];
  recordAcceptance(
    notificationId: string,
    event: AlertEmailDeliveryEvent & { state: "ACCEPTED" },
  ): void;
  updateDelivery(
    notificationId: string,
    state: AlertEmailDeliveryState,
    providerMessageId?: string,
  ): void;
}

export class InMemoryAlertNotificationRepository implements AlertNotificationRepository {
  readonly #events = new Map<string, AlertEmailDeliveryEvent>();
  readonly #notifications = new Map<string, AlertEmailNotification>();
  readonly #idempotencyKeys = new Set<string>();

  insert(notification: AlertEmailNotification): boolean {
    if (this.#idempotencyKeys.has(notification.idempotency_key)) return false;
    this.#idempotencyKeys.add(notification.idempotency_key);
    this.#notifications.set(notification.id, notification);
    return true;
  }

  list(): readonly AlertEmailNotification[] {
    return [...this.#notifications.values()];
  }

  updateDelivery(
    notificationId: string,
    state: AlertEmailDeliveryState,
    providerMessageId?: string,
  ): void {
    const notification = this.#notifications.get(notificationId);
    if (!notification) return;
    this.#notifications.set(
      notificationId,
      Object.freeze({
        ...notification,
        ...(providerMessageId
          ? { provider_message_id: providerMessageId }
          : {}),
        state,
      }),
    );
  }

  findByProviderMessageId(id: string): AlertEmailNotification | undefined {
    return [...this.#notifications.values()].find(
      ({ provider_message_id }) => provider_message_id === id,
    );
  }

  appendDeliveryEvent(event: AlertEmailDeliveryEvent): boolean {
    if (this.#events.has(event.provider_event_id)) return false;
    this.#events.set(event.provider_event_id, Object.freeze({ ...event }));
    return true;
  }

  listDeliveryEvents(): readonly AlertEmailDeliveryEvent[] {
    return [...this.#events.values()];
  }

  recordAcceptance(
    notificationId: string,
    event: AlertEmailDeliveryEvent & { state: "ACCEPTED" },
  ): void {
    this.appendDeliveryEvent(event);
    this.updateDelivery(notificationId, event.state, event.provider_message_id);
  }
}

const safePart = (value: string): string =>
  value.replaceAll(/[^A-Za-z0-9 .:_/-]/g, "_").slice(0, 160);

const deliveryRank: Record<AlertEmailDeliveryState, number> = {
  ACCEPTED: 1,
  BOUNCED: 4,
  DELAYED: 2,
  DELIVERED: 3,
  FAILED: 4,
  PENDING: 0,
};

export class AlertNotificationService {
  readonly #controlRoomBaseUrl: string;
  readonly #id: () => string;
  readonly #now: () => Date;

  constructor(
    private readonly repository: AlertNotificationRepository,
    options: {
      controlRoomBaseUrl: string;
      id?: () => string;
      now?: () => Date;
    },
  ) {
    const base = new URL(options.controlRoomBaseUrl);
    if (base.protocol !== "https:")
      throw new Error("CONTROL_ROOM_HTTPS_REQUIRED");
    this.#controlRoomBaseUrl = base.origin;
    this.#id = options.id ?? (() => `notification-${randomUUID()}`);
    this.#now = options.now ?? (() => new Date());
  }

  recordOpened(alert: OperationsAlert): boolean {
    return this.enqueue(alert, "OPENED", "PRIMARY", alert.evidence_refs);
  }

  recordRecovery(
    alert: OperationsAlert,
    evidenceRefs: readonly string[],
  ): boolean {
    return this.enqueue(alert, "RECOVERY_OBSERVED", "PRIMARY", evidenceRefs);
  }

  recordResolved(
    alert: OperationsAlert,
    evidenceRefs: readonly string[],
  ): boolean {
    return this.enqueue(alert, "RESOLVED", "PRIMARY", evidenceRefs);
  }

  recordDueEscalations(
    alerts: readonly OperationsAlert[],
    policy: { criticalMs: number; warningMs: number },
  ): number {
    let created = 0;
    for (const alert of alerts) {
      if (alert.state !== "OPEN") continue;
      if (alert.severity !== "WARNING" && alert.severity !== "CRITICAL")
        continue;
      const timeout =
        alert.severity === "CRITICAL" ? policy.criticalMs : policy.warningMs;
      if (this.#now().getTime() - Date.parse(alert.first_detected_at) < timeout)
        continue;
      if (this.enqueue(alert, "ESCALATED", "ESCALATION", alert.evidence_refs))
        created += 1;
    }
    return created;
  }

  async dispatchPending(adapter: AlertEmailDeliveryPort): Promise<number> {
    let dispatched = 0;
    for (const notification of this.repository.list()) {
      if (notification.state !== "PENDING") continue;
      const acceptance = await adapter.send({
        alert_id: notification.alert_id,
        control_room_alert_url: notification.control_room_alert_url,
        correlation_id: notification.correlation_id,
        event_kind: notification.event_kind,
        idempotency_key: notification.idempotency_key,
        notification_id: notification.id,
        recipient: notification.recipient,
        severity: notification.severity,
        summary: notification.summary,
        system_reference: notification.system_reference,
      });
      this.repository.recordAcceptance(
        notification.id,
        Object.freeze({
          evidence_refs: Object.freeze([
            `evidence://resend/acceptance/${safePart(acceptance.provider_message_id)}`,
          ]),
          occurred_at: acceptance.accepted_at,
          provider: acceptance.provider,
          provider_event_id: `acceptance:${acceptance.provider_message_id}`,
          provider_message_id: acceptance.provider_message_id,
          state: acceptance.state,
        }),
      );
      dispatched += 1;
    }
    return dispatched;
  }

  recordProviderEvent(event: AlertEmailDeliveryEvent): {
    duplicate: boolean;
    state: AlertEmailDeliveryState;
  } {
    const notification = this.repository.findByProviderMessageId(
      event.provider_message_id,
    );
    if (!notification) throw new Error("ALERT_NOTIFICATION_NOT_FOUND");
    if (!this.repository.appendDeliveryEvent(event))
      return { duplicate: true, state: notification.state };
    const state =
      deliveryRank[event.state] >= deliveryRank[notification.state]
        ? event.state
        : notification.state;
    this.repository.updateDelivery(notification.id, state);
    return { duplicate: false, state };
  }

  notifications(): readonly AlertEmailNotification[] {
    return this.repository.list();
  }

  deliveryEvents(): readonly AlertEmailDeliveryEvent[] {
    return this.repository.listDeliveryEvents();
  }

  private enqueue(
    alert: OperationsAlert,
    eventKind: AlertNotificationEventKind,
    recipient: AlertEmailRecipient,
    evidenceRefs: readonly string[],
  ): boolean {
    const id = this.#id();
    return this.repository.insert(
      Object.freeze({
        alert_id: alert.id,
        control_room_alert_url: `${this.#controlRoomBaseUrl}/alerts?alert_id=${encodeURIComponent(alert.id)}`,
        correlation_id: alert.correlation_id,
        evidence_refs: Object.freeze([...evidenceRefs]),
        event_kind: eventKind,
        id,
        idempotency_key: `${alert.id}:${eventKind}:0`,
        occurred_at: this.#now().toISOString(),
        owner_reference: alert.owner_reference,
        recipient,
        severity: alert.severity,
        state: "PENDING",
        summary: `${alert.severity} health condition for ${safePart(alert.affected_system)}`,
        system_reference: safePart(alert.affected_system),
        target_reference: safePart(alert.target_id),
      }),
    );
  }
}
