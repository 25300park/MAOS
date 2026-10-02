CREATE TABLE governance.human_approval_requests (
  id uuid PRIMARY KEY,
  approval_id uuid NOT NULL UNIQUE REFERENCES governance.approvals(id),
  project_id uuid NOT NULL REFERENCES core.projects(id),
  command_envelope_id uuid NOT NULL REFERENCES work.command_envelopes(id),
  plan_artifact_id uuid NOT NULL,
  review_artifact_id uuid NOT NULL,
  authority_owner_actor_id uuid NOT NULL REFERENCES identity.humans(id),
  requested_operation text NOT NULL CHECK (length(trim(requested_operation)) > 0),
  target_type text NOT NULL CHECK (target_type = 'REVIEW_ARTIFACT'),
  target_id uuid NOT NULL,
  target_version text NOT NULL CHECK (length(trim(target_version)) > 0),
  target_hash text NOT NULL CHECK (target_hash ~ '^sha256:[a-f0-9]{64}$'),
  company_scope_ref text NOT NULL CHECK (length(trim(company_scope_ref)) > 0),
  team_scope_ref text CHECK (team_scope_ref IS NULL OR length(trim(team_scope_ref)) > 0),
  project_scope_ref text NOT NULL CHECK (length(trim(project_scope_ref)) > 0),
  system_scope_ref text CHECK (system_scope_ref IS NULL OR length(trim(system_scope_ref)) > 0),
  risk_class text NOT NULL CHECK (risk_class IN ('R0', 'R1', 'R2', 'R3', 'R4')),
  environment text NOT NULL CHECK (environment IN ('DEVELOPMENT', 'PREVIEW', 'STAGING', 'PRODUCTION')),
  evidence_refs text[] NOT NULL CHECK (cardinality(evidence_refs) > 0),
  evidence_manifest_hash text NOT NULL CHECK (evidence_manifest_hash ~ '^sha256:[a-f0-9]{64}$'),
  approval_policy_ref text NOT NULL CHECK (length(trim(approval_policy_ref)) > 0),
  approval_policy_version text NOT NULL CHECK (length(trim(approval_policy_version)) > 0),
  fresh_until timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  causation_refs text[] NOT NULL CHECK (cardinality(causation_refs) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, idempotency_key),
  UNIQUE (project_id, command_envelope_id, id),
  FOREIGN KEY (project_id, command_envelope_id)
    REFERENCES work.command_envelopes(project_id, id),
  FOREIGN KEY (project_id, command_envelope_id, plan_artifact_id)
    REFERENCES governance.governed_artifact_refs(project_id, command_envelope_id, id),
  FOREIGN KEY (project_id, command_envelope_id, review_artifact_id)
    REFERENCES governance.governed_artifact_refs(project_id, command_envelope_id, id),
  FOREIGN KEY (approval_id, target_version, target_hash)
    REFERENCES governance.approvals(id, target_version, target_hash),
  CHECK (target_id = review_artifact_id),
  CHECK (fresh_until > created_at),
  CHECK (expires_at >= fresh_until)
);

CREATE INDEX human_approval_requests_command_idx
  ON governance.human_approval_requests (command_envelope_id, created_at);
CREATE INDEX human_approval_requests_correlation_idx
  ON governance.human_approval_requests (correlation_id, created_at);

CREATE TABLE governance.human_approval_decisions (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES core.projects(id),
  request_id uuid NOT NULL REFERENCES governance.human_approval_requests(id),
  approval_id uuid NOT NULL REFERENCES governance.approvals(id),
  actor_type text NOT NULL CHECK (actor_type = 'HUMAN'),
  actor_id uuid NOT NULL REFERENCES identity.humans(id),
  authority_ref text NOT NULL CHECK (length(trim(authority_ref)) > 0),
  decision_type text NOT NULL CHECK (decision_type IN (
    'APPROVED', 'REJECTED', 'CLARIFICATION_REQUIRED',
    'REVOKED', 'EXPIRED', 'SUPERSEDED', 'CANCELLED'
  )),
  resulting_status text NOT NULL CHECK (resulting_status IN (
    'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'REVOKED', 'CANCELLED'
  )),
  resulting_validity text NOT NULL CHECK (resulting_validity IN (
    'VALID', 'STALE', 'TARGET_MISMATCH', 'VERSION_MISMATCH',
    'AUTHORITY_INVALID', 'POLICY_INVALID', 'CONSUMED'
  )),
  reason_code text NOT NULL CHECK (length(trim(reason_code)) > 0),
  evidence_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  replacement_request_id uuid REFERENCES governance.human_approval_requests(id),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  decision_fingerprint text NOT NULL CHECK (decision_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  causation_refs text[] NOT NULL CHECK (cardinality(causation_refs) > 0),
  decided_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, request_id, idempotency_key),
  CHECK ((decision_type = 'SUPERSEDED') = (replacement_request_id IS NOT NULL)),
  CHECK (replacement_request_id IS NULL OR replacement_request_id <> request_id)
);

CREATE INDEX human_approval_decisions_request_idx
  ON governance.human_approval_decisions (request_id, decided_at, id);
CREATE INDEX human_approval_decisions_correlation_idx
  ON governance.human_approval_decisions (correlation_id, decided_at);
CREATE UNIQUE INDEX human_approval_decisions_one_supersession_idx
  ON governance.human_approval_decisions (request_id)
  WHERE decision_type = 'SUPERSEDED';

CREATE OR REPLACE FUNCTION governance.reject_human_approval_request_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'human approval requests are immutable';
END;
$$;

CREATE TRIGGER human_approval_requests_reject_mutation
BEFORE UPDATE OR DELETE ON governance.human_approval_requests
FOR EACH ROW EXECUTE FUNCTION governance.reject_human_approval_request_mutation();

CREATE OR REPLACE FUNCTION governance.reject_human_approval_decision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'human approval decisions are append-only';
END;
$$;

CREATE TRIGGER human_approval_decisions_reject_mutation
BEFORE UPDATE OR DELETE ON governance.human_approval_decisions
FOR EACH ROW EXECUTE FUNCTION governance.reject_human_approval_decision_mutation();
