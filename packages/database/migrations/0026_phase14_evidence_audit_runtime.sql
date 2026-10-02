ALTER TABLE work.command_envelopes
  DROP CONSTRAINT command_envelopes_lifecycle_state_check,
  ADD CONSTRAINT command_envelopes_lifecycle_state_check CHECK (lifecycle_state IN (
    'RECEIVED', 'INTERPRETING', 'CLASSIFIED', 'PLANNING', 'REVIEW',
    'WAITING_HUMAN', 'WAITING_APPROVAL', 'READY', 'DISPATCHED',
    'COMPLETED', 'REJECTED', 'DENIED', 'CANCELLED', 'EXPIRED', 'FAILED'
  ));

ALTER TABLE work.command_envelope_versions
  DROP CONSTRAINT command_envelope_versions_lifecycle_state_check,
  ADD CONSTRAINT command_envelope_versions_lifecycle_state_check CHECK (lifecycle_state IN (
    'RECEIVED', 'INTERPRETING', 'CLASSIFIED', 'PLANNING', 'REVIEW',
    'WAITING_HUMAN', 'WAITING_APPROVAL', 'READY', 'DISPATCHED',
    'COMPLETED', 'REJECTED', 'DENIED', 'CANCELLED', 'EXPIRED', 'FAILED'
  ));

ALTER TABLE governance.governed_artifact_refs
  ADD COLUMN evidence_classification text NOT NULL DEFAULT 'INTERNAL'
    CHECK (evidence_classification IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'PRIVATE_PERSONAL')),
  ADD COLUMN redaction_policy_ref text NOT NULL DEFAULT 'policy://maos-013/secret-exclusion'
    CHECK (length(trim(redaction_policy_ref)) > 0),
  ADD COLUMN retention_class text NOT NULL DEFAULT 'STANDARD'
    CHECK (length(trim(retention_class)) > 0),
  ADD COLUMN retention_policy_ref text NOT NULL DEFAULT 'policy://maos-013/retention/default'
    CHECK (length(trim(retention_policy_ref)) > 0),
  ADD COLUMN generated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN observed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN evidence_integrity_algorithm text NOT NULL DEFAULT 'SHA-256'
    CHECK (evidence_integrity_algorithm = 'SHA-256'),
  ADD CONSTRAINT governed_artifact_refs_evidence_time_check
    CHECK (observed_at >= generated_at);

CREATE INDEX governed_artifact_refs_correlation_idx
  ON governance.governed_artifact_refs (correlation_id, created_at);
CREATE INDEX governed_artifact_refs_evidence_refs_idx
  ON governance.governed_artifact_refs USING gin (evidence_refs);
CREATE INDEX verification_handoffs_evidence_refs_idx
  ON governance.verification_handoffs USING gin (evidence_refs);
CREATE INDEX routing_envelopes_causation_refs_idx
  ON governance.routing_envelopes USING gin (causation_refs);
CREATE INDEX audit_records_evidence_refs_idx
  ON audit.audit_records USING gin (evidence_refs);

CREATE OR REPLACE FUNCTION work.enforce_command_envelope_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.project_id IS DISTINCT FROM NEW.project_id
    OR OLD.human_actor_id IS DISTINCT FROM NEW.human_actor_id
    OR OLD.source_message_ref IS DISTINCT FROM NEW.source_message_ref
    OR OLD.source_message_hash IS DISTINCT FROM NEW.source_message_hash
    OR OLD.prior_command_id IS DISTINCT FROM NEW.prior_command_id
    OR OLD.company_scope_ref IS DISTINCT FROM NEW.company_scope_ref
    OR OLD.team_scope_ref IS DISTINCT FROM NEW.team_scope_ref
    OR OLD.project_scope_ref IS DISTINCT FROM NEW.project_scope_ref
    OR OLD.system_scope_ref IS DISTINCT FROM NEW.system_scope_ref
    OR OLD.environment IS DISTINCT FROM NEW.environment
    OR OLD.normalized_intent IS DISTINCT FROM NEW.normalized_intent
    OR OLD.requested_outcome IS DISTINCT FROM NEW.requested_outcome
    OR OLD.command_classification IS DISTINCT FROM NEW.command_classification
    OR OLD.risk_class IS DISTINCT FROM NEW.risk_class
    OR OLD.policy_ref IS DISTINCT FROM NEW.policy_ref
    OR OLD.policy_version IS DISTINCT FROM NEW.policy_version
    OR OLD.request_fingerprint IS DISTINCT FROM NEW.request_fingerprint
    OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
    OR OLD.correlation_id IS DISTINCT FROM NEW.correlation_id
    OR OLD.causation_ref IS DISTINCT FROM NEW.causation_ref
    OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'command envelope immutable binding cannot change';
  END IF;

  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'command envelope version must increase by exactly one';
  END IF;

  IF NOT (
    (OLD.lifecycle_state = 'RECEIVED' AND NEW.lifecycle_state IN ('INTERPRETING', 'CANCELLED', 'EXPIRED', 'FAILED')) OR
    (OLD.lifecycle_state = 'INTERPRETING' AND NEW.lifecycle_state IN ('CLASSIFIED', 'WAITING_HUMAN', 'REJECTED', 'DENIED', 'CANCELLED', 'EXPIRED', 'FAILED')) OR
    (OLD.lifecycle_state = 'CLASSIFIED' AND NEW.lifecycle_state IN ('PLANNING', 'WAITING_HUMAN', 'REJECTED', 'DENIED', 'CANCELLED', 'EXPIRED', 'FAILED')) OR
    (OLD.lifecycle_state = 'PLANNING' AND NEW.lifecycle_state IN ('REVIEW', 'WAITING_HUMAN', 'CANCELLED', 'EXPIRED', 'FAILED')) OR
    (OLD.lifecycle_state = 'REVIEW' AND NEW.lifecycle_state IN ('PLANNING', 'WAITING_HUMAN', 'WAITING_APPROVAL', 'READY', 'REJECTED', 'DENIED', 'CANCELLED', 'EXPIRED', 'FAILED')) OR
    (OLD.lifecycle_state = 'WAITING_HUMAN' AND NEW.lifecycle_state IN ('INTERPRETING', 'PLANNING', 'REVIEW', 'WAITING_APPROVAL', 'READY', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED')) OR
    (OLD.lifecycle_state = 'WAITING_APPROVAL' AND NEW.lifecycle_state IN ('READY', 'REJECTED', 'DENIED', 'CANCELLED', 'EXPIRED', 'FAILED')) OR
    (OLD.lifecycle_state = 'READY' AND NEW.lifecycle_state IN ('DISPATCHED', 'CANCELLED', 'EXPIRED', 'FAILED')) OR
    (OLD.lifecycle_state = 'DISPATCHED' AND NEW.lifecycle_state IN ('COMPLETED', 'WAITING_HUMAN', 'CANCELLED', 'FAILED'))
  ) THEN
    RAISE EXCEPTION 'invalid command envelope lifecycle transition';
  END IF;

  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
