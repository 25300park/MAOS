CREATE TABLE operations.alerts (
  alert_key text PRIMARY KEY CHECK (length(trim(alert_key)) > 0),
  target_reference text NOT NULL CHECK (length(trim(target_reference)) > 0),
  system_reference text NOT NULL CHECK (length(trim(system_reference)) > 0),
  owner_reference text NOT NULL CHECK (owner_reference LIKE 'role:%'),
  severity text NOT NULL CHECK (severity IN ('INFO', 'NOTICE', 'WARNING', 'CRITICAL')),
  state text NOT NULL CHECK (state IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'SUPPRESSED')),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  evidence_references text[] NOT NULL CHECK (cardinality(evidence_references) > 0),
  occurrences integer NOT NULL DEFAULT 1 CHECK (occurrences > 0),
  first_detected_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (last_observed_at >= first_detected_at)
);

CREATE TABLE notification.alert_email_outbox (
  notification_key text PRIMARY KEY CHECK (length(trim(notification_key)) > 0),
  alert_key text NOT NULL REFERENCES operations.alerts(alert_key),
  event_kind text NOT NULL CHECK (
    event_kind IN ('OPENED', 'ESCALATED', 'RECOVERY_OBSERVED', 'RESOLVED')
  ),
  severity text NOT NULL CHECK (severity IN ('INFO', 'NOTICE', 'WARNING', 'CRITICAL')),
  summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 160),
  target_reference text NOT NULL CHECK (length(trim(target_reference)) > 0),
  system_reference text NOT NULL CHECK (length(trim(system_reference)) > 0),
  owner_reference text NOT NULL CHECK (owner_reference LIKE 'role:%'),
  recipient_role text NOT NULL CHECK (recipient_role IN ('PRIMARY', 'ESCALATION')),
  control_room_alert_url text NOT NULL CHECK (control_room_alert_url LIKE 'https://%'),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  evidence_references text[] NOT NULL CHECK (cardinality(evidence_references) > 0),
  idempotency_key text NOT NULL UNIQUE CHECK (length(trim(idempotency_key)) > 0),
  delivery_state text NOT NULL DEFAULT 'PENDING' CHECK (
    delivery_state IN ('PENDING', 'ACCEPTED', 'DELIVERED', 'DELAYED', 'BOUNCED', 'FAILED')
  ),
  provider_message_id text UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX alert_email_outbox_pending_idx
ON notification.alert_email_outbox (occurred_at)
WHERE delivery_state = 'PENDING';

CREATE TABLE notification.alert_email_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id text NOT NULL UNIQUE CHECK (length(trim(provider_event_id)) > 0),
  notification_key text NOT NULL REFERENCES notification.alert_email_outbox(notification_key),
  provider text NOT NULL CHECK (provider = 'RESEND'),
  provider_message_id text NOT NULL CHECK (length(trim(provider_message_id)) > 0),
  delivery_state text NOT NULL CHECK (
    delivery_state IN ('ACCEPTED', 'DELIVERED', 'DELAYED', 'BOUNCED', 'FAILED')
  ),
  sanitized_failure_code text CHECK (
    sanitized_failure_code IS NULL OR sanitized_failure_code ~ '^[A-Z][A-Z0-9_]*$'
  ),
  evidence_references text[] NOT NULL CHECK (cardinality(evidence_references) > 0),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION notification.reject_alert_email_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'alert email delivery events are append-only';
END;
$$;

CREATE TRIGGER alert_email_delivery_events_reject_update
BEFORE UPDATE ON notification.alert_email_delivery_events
FOR EACH ROW EXECUTE FUNCTION notification.reject_alert_email_event_mutation();

CREATE TRIGGER alert_email_delivery_events_reject_delete
BEFORE DELETE ON notification.alert_email_delivery_events
FOR EACH ROW EXECUTE FUNCTION notification.reject_alert_email_event_mutation();
