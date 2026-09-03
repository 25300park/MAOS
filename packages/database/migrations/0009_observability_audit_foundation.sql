CREATE TABLE audit.observability_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (name ~ '^[A-Z][A-Z0-9_]*\.[A-Z][A-Z0-9_]*$'),
  request_id text NOT NULL CHECK (length(trim(request_id)) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  trace_id text NOT NULL CHECK (length(trim(trace_id)) > 0),
  span_id text NOT NULL CHECK (length(trim(span_id)) > 0),
  project_id uuid REFERENCES core.projects(id),
  task_id uuid REFERENCES work.tasks(id),
  workflow_instance_id uuid REFERENCES work.workflow_instances(id),
  run_id uuid REFERENCES execution.runs(id),
  tool_call_id uuid REFERENCES execution.tool_calls(id),
  approval_id uuid REFERENCES governance.approvals(id),
  actor_type text CHECK (actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((actor_type IS NULL) = (actor_id IS NULL))
);

CREATE TABLE audit.trace_spans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id text NOT NULL CHECK (length(trim(trace_id)) > 0),
  span_id text NOT NULL UNIQUE CHECK (length(trim(span_id)) > 0),
  parent_span_id text,
  request_id text NOT NULL CHECK (length(trim(request_id)) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  status text NOT NULL CHECK (status IN ('OK', 'ERROR')),
  duration_ms numeric(18, 3) NOT NULL CHECK (duration_ms >= 0),
  project_id uuid REFERENCES core.projects(id),
  task_id uuid REFERENCES work.tasks(id),
  run_id uuid REFERENCES execution.runs(id),
  observed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE operations.metric_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (name ~ '^[a-z][a-z0-9_]*$'),
  value double precision NOT NULL CHECK (value NOT IN ('Infinity', '-Infinity', 'NaN')),
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit.audit_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL CHECK (actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action ~ '^[A-Z][A-Z0-9_]*\.[A-Z][A-Z0-9_]*$'),
  target_type text NOT NULL CHECK (target_type ~ '^[A-Z][A-Z0-9_]*$'),
  target_id uuid NOT NULL,
  result text NOT NULL CHECK (result IN ('SUCCEEDED', 'FAILED', 'DENIED', 'CANCELLED')),
  request_id text NOT NULL CHECK (length(trim(request_id)) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  trace_id text NOT NULL CHECK (length(trim(trace_id)) > 0),
  span_id text NOT NULL CHECK (length(trim(span_id)) > 0),
  project_id uuid REFERENCES core.projects(id),
  task_id uuid REFERENCES work.tasks(id),
  workflow_instance_id uuid REFERENCES work.workflow_instances(id),
  run_id uuid REFERENCES execution.runs(id),
  tool_call_id uuid REFERENCES execution.tool_calls(id),
  approval_id uuid REFERENCES governance.approvals(id),
  evidence_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash text CHECK (previous_hash IS NULL OR previous_hash ~ '^[a-f0-9]{64}$'),
  record_hash text NOT NULL UNIQUE CHECK (record_hash ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION audit.reject_audit_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit records are append-only';
END;
$$;

CREATE TRIGGER audit_records_reject_update
BEFORE UPDATE ON audit.audit_records
FOR EACH ROW EXECUTE FUNCTION audit.reject_audit_record_mutation();

CREATE TRIGGER audit_records_reject_delete
BEFORE DELETE ON audit.audit_records
FOR EACH ROW EXECUTE FUNCTION audit.reject_audit_record_mutation();
