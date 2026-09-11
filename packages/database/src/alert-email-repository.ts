import type { MigrationDatabase } from "./types.js";

export type StoredAlertState =
  "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "SUPPRESSED";
export type StoredAlertSeverity = "INFO" | "NOTICE" | "WARNING" | "CRITICAL";
export type StoredDeliveryState =
  "PENDING" | "ACCEPTED" | "DELIVERED" | "DELAYED" | "BOUNCED" | "FAILED";

export interface StoredOperationsAlert {
  affected_system: string;
  correlation_id: string;
  evidence_refs: readonly string[];
  first_detected_at: string;
  id: string;
  last_observed_at: string;
  occurrences: number;
  owner_reference: string;
  severity: StoredAlertSeverity;
  state: StoredAlertState;
  target_id: string;
}

export interface StoredAlertEmailNotification {
  alert_id: string;
  control_room_alert_url: string;
  correlation_id: string;
  evidence_refs: readonly string[];
  event_kind: "OPENED" | "ESCALATED" | "RECOVERY_OBSERVED" | "RESOLVED";
  id: string;
  idempotency_key: string;
  occurred_at: string;
  owner_reference: string;
  provider_message_id?: string;
  recipient: "PRIMARY" | "ESCALATION";
  severity: StoredAlertSeverity;
  state: StoredDeliveryState;
  summary: string;
  system_reference: string;
  target_reference: string;
}

export interface StoredAlertEmailDeliveryEvent {
  evidence_refs: readonly string[];
  occurred_at: string;
  provider: "RESEND";
  provider_event_id: string;
  provider_message_id: string;
  sanitized_failure_code?: string;
  state: Exclude<StoredDeliveryState, "PENDING">;
}

type AlertRow = {
  alert_key: string;
  correlation_id: string;
  evidence_references: string[];
  first_detected_at: Date | string;
  last_observed_at: Date | string;
  occurrences: number;
  owner_reference: string;
  severity: StoredAlertSeverity;
  state: StoredAlertState;
  system_reference: string;
  target_reference: string;
};

type NotificationRow = {
  alert_key: string;
  control_room_alert_url: string;
  correlation_id: string;
  delivery_state: StoredDeliveryState;
  event_kind: StoredAlertEmailNotification["event_kind"];
  evidence_references: string[];
  idempotency_key: string;
  notification_key: string;
  occurred_at: Date | string;
  owner_reference: string;
  provider_message_id: string | null;
  recipient_role: StoredAlertEmailNotification["recipient"];
  severity: StoredAlertSeverity;
  summary: string;
  system_reference: string;
  target_reference: string;
};

type DeliveryEventRow = {
  delivery_state: Exclude<StoredDeliveryState, "PENDING">;
  evidence_references: string[];
  occurred_at: Date | string;
  provider: "RESEND";
  provider_event_id: string;
  provider_message_id: string;
  sanitized_failure_code: string | null;
};

const iso = (value: Date | string): string => new Date(value).toISOString();

const mapAlert = (row: AlertRow): StoredOperationsAlert => ({
  affected_system: row.system_reference,
  correlation_id: row.correlation_id,
  evidence_refs: row.evidence_references,
  first_detected_at: iso(row.first_detected_at),
  id: row.alert_key,
  last_observed_at: iso(row.last_observed_at),
  occurrences: row.occurrences,
  owner_reference: row.owner_reference,
  severity: row.severity,
  state: row.state,
  target_id: row.target_reference,
});

const mapNotification = (
  row: NotificationRow,
): StoredAlertEmailNotification => ({
  alert_id: row.alert_key,
  control_room_alert_url: row.control_room_alert_url,
  correlation_id: row.correlation_id,
  evidence_refs: row.evidence_references,
  event_kind: row.event_kind,
  id: row.notification_key,
  idempotency_key: row.idempotency_key,
  occurred_at: iso(row.occurred_at),
  owner_reference: row.owner_reference,
  ...(row.provider_message_id
    ? { provider_message_id: row.provider_message_id }
    : {}),
  recipient: row.recipient_role,
  severity: row.severity,
  state: row.delivery_state,
  summary: row.summary,
  system_reference: row.system_reference,
  target_reference: row.target_reference,
});

const mapDeliveryEvent = (
  row: DeliveryEventRow,
): StoredAlertEmailDeliveryEvent => ({
  evidence_refs: row.evidence_references,
  occurred_at: iso(row.occurred_at),
  provider: row.provider,
  provider_event_id: row.provider_event_id,
  provider_message_id: row.provider_message_id,
  ...(row.sanitized_failure_code
    ? { sanitized_failure_code: row.sanitized_failure_code }
    : {}),
  state: row.delivery_state,
});

export class PostgresAlertNotificationRepository {
  constructor(private readonly database: MigrationDatabase) {}

  async upsertAlert(alert: StoredOperationsAlert): Promise<void> {
    await this.database.query(
      `INSERT INTO operations.alerts (
        alert_key, target_reference, system_reference, owner_reference,
        severity, state, correlation_id, evidence_references, occurrences,
        first_detected_at, last_observed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (alert_key) DO UPDATE SET
        target_reference = EXCLUDED.target_reference,
        system_reference = EXCLUDED.system_reference,
        owner_reference = EXCLUDED.owner_reference,
        severity = EXCLUDED.severity,
        state = EXCLUDED.state,
        correlation_id = EXCLUDED.correlation_id,
        evidence_references = EXCLUDED.evidence_references,
        occurrences = EXCLUDED.occurrences,
        first_detected_at = EXCLUDED.first_detected_at,
        last_observed_at = EXCLUDED.last_observed_at,
        updated_at = CURRENT_TIMESTAMP`,
      [
        alert.id,
        alert.target_id,
        alert.affected_system,
        alert.owner_reference,
        alert.severity,
        alert.state,
        alert.correlation_id,
        [...alert.evidence_refs],
        alert.occurrences,
        alert.first_detected_at,
        alert.last_observed_at,
      ],
    );
  }

  async updateAlertState(
    alertId: string,
    state: StoredAlertState,
    evidenceRefs: readonly string[],
  ): Promise<void> {
    await this.database.query(
      `UPDATE operations.alerts
       SET state = $2,
           evidence_references = evidence_references || $3::text[],
           updated_at = CURRENT_TIMESTAMP
       WHERE alert_key = $1`,
      [alertId, state, [...evidenceRefs]],
    );
  }

  async insert(notification: StoredAlertEmailNotification): Promise<boolean> {
    const result = await this.database.query<{ notification_key: string }>(
      `INSERT INTO notification.alert_email_outbox (
        notification_key, alert_key, event_kind, severity, summary,
        target_reference, system_reference, owner_reference, recipient_role,
        control_room_alert_url, correlation_id, evidence_references,
        idempotency_key, delivery_state, provider_message_id, occurred_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING notification_key`,
      [
        notification.id,
        notification.alert_id,
        notification.event_kind,
        notification.severity,
        notification.summary,
        notification.target_reference,
        notification.system_reference,
        notification.owner_reference,
        notification.recipient,
        notification.control_room_alert_url,
        notification.correlation_id,
        [...notification.evidence_refs],
        notification.idempotency_key,
        notification.state,
        notification.provider_message_id ?? null,
        notification.occurred_at,
      ],
    );
    return result.rows.length === 1;
  }

  async list(): Promise<readonly StoredAlertEmailNotification[]> {
    const result = await this.database.query<NotificationRow>(`
      SELECT notification_key, alert_key, event_kind, severity, summary,
             target_reference, system_reference, owner_reference,
             recipient_role, control_room_alert_url, correlation_id,
             evidence_references, idempotency_key, delivery_state,
             provider_message_id, occurred_at
      FROM notification.alert_email_outbox
      ORDER BY occurred_at, notification_key
    `);
    return result.rows.map(mapNotification);
  }

  async listAlerts(): Promise<readonly StoredOperationsAlert[]> {
    const result = await this.database.query<AlertRow>(`
      SELECT alert_key, target_reference, system_reference, owner_reference,
             severity, state, correlation_id, evidence_references,
             occurrences, first_detected_at, last_observed_at
      FROM operations.alerts
      ORDER BY first_detected_at, alert_key
    `);
    return result.rows.map(mapAlert);
  }

  async updateDelivery(
    notificationId: string,
    state: StoredDeliveryState,
    providerMessageId?: string,
  ): Promise<void> {
    await this.database.query(
      `UPDATE notification.alert_email_outbox
       SET delivery_state = $2,
           provider_message_id = COALESCE($3, provider_message_id),
           accepted_at = CASE WHEN $2 = 'ACCEPTED' THEN CURRENT_TIMESTAMP ELSE accepted_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE notification_key = $1`,
      [notificationId, state, providerMessageId ?? null],
    );
  }

  async findByProviderMessageId(
    id: string,
  ): Promise<StoredAlertEmailNotification | undefined> {
    const result = await this.database.query<NotificationRow>(
      `SELECT notification_key, alert_key, event_kind, severity, summary,
              target_reference, system_reference, owner_reference,
              recipient_role, control_room_alert_url, correlation_id,
              evidence_references, idempotency_key, delivery_state,
              provider_message_id, occurred_at
       FROM notification.alert_email_outbox
       WHERE provider_message_id = $1`,
      [id],
    );
    return result.rows[0] ? mapNotification(result.rows[0]) : undefined;
  }

  async appendDeliveryEvent(
    event: StoredAlertEmailDeliveryEvent,
  ): Promise<boolean> {
    const result = await this.database.query<{ provider_event_id: string }>(
      `INSERT INTO notification.alert_email_delivery_events (
        provider_event_id, notification_key, provider, provider_message_id,
        delivery_state, sanitized_failure_code, evidence_references, occurred_at
      )
      SELECT $1, notification_key, $2, $3, $4, $5, $6, $7
      FROM notification.alert_email_outbox
      WHERE provider_message_id = $3
      ON CONFLICT (provider_event_id) DO NOTHING
      RETURNING provider_event_id`,
      [
        event.provider_event_id,
        event.provider,
        event.provider_message_id,
        event.state,
        event.sanitized_failure_code ?? null,
        [...event.evidence_refs],
        event.occurred_at,
      ],
    );
    return result.rows.length === 1;
  }

  async listDeliveryEvents(): Promise<
    readonly StoredAlertEmailDeliveryEvent[]
  > {
    const result = await this.database.query<DeliveryEventRow>(`
      SELECT provider_event_id, provider, provider_message_id, delivery_state,
             sanitized_failure_code, evidence_references, occurred_at
      FROM notification.alert_email_delivery_events
      ORDER BY occurred_at, provider_event_id
    `);
    return result.rows.map(mapDeliveryEvent);
  }

  async recordAcceptance(
    notificationId: string,
    event: StoredAlertEmailDeliveryEvent & { state: "ACCEPTED" },
  ): Promise<void> {
    await this.database.exec("BEGIN");
    try {
      await this.database.query(
        `INSERT INTO notification.alert_email_delivery_events (
          provider_event_id, notification_key, provider, provider_message_id,
          delivery_state, sanitized_failure_code, evidence_references, occurred_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (provider_event_id) DO NOTHING`,
        [
          event.provider_event_id,
          notificationId,
          event.provider,
          event.provider_message_id,
          event.state,
          event.sanitized_failure_code ?? null,
          [...event.evidence_refs],
          event.occurred_at,
        ],
      );
      await this.updateDelivery(
        notificationId,
        event.state,
        event.provider_message_id,
      );
      await this.database.exec("COMMIT");
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
