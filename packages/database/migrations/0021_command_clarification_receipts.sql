CREATE TABLE work.command_clarification_receipts (
  id uuid PRIMARY KEY,
  command_envelope_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES core.projects(id),
  human_actor_id uuid NOT NULL REFERENCES identity.humans(id),
  resolved_fields jsonb NOT NULL,
  evidence_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  audit_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  response_fingerprint text NOT NULL CHECK (response_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, command_envelope_id),
  FOREIGN KEY (project_id, command_envelope_id)
    REFERENCES work.command_envelopes(project_id, id),
  CHECK (
    jsonb_typeof(resolved_fields) = 'object'
    AND resolved_fields ? 'development_task_kind'
    AND resolved_fields - 'development_task_kind' = '{}'::jsonb
    AND resolved_fields->>'development_task_kind' IN ('CODE_CHANGE', 'TEST_ONLY', 'DOCUMENTATION')
  )
);

CREATE INDEX command_clarification_receipts_command_idx
  ON work.command_clarification_receipts (project_id, command_envelope_id, created_at);

CREATE TRIGGER command_clarification_receipts_reject_update
BEFORE UPDATE ON work.command_clarification_receipts
FOR EACH ROW EXECUTE FUNCTION audit.reject_audit_record_mutation();

CREATE TRIGGER command_clarification_receipts_reject_delete
BEFORE DELETE ON work.command_clarification_receipts
FOR EACH ROW EXECUTE FUNCTION audit.reject_audit_record_mutation();
