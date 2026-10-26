CREATE TABLE governance.security_controls (
  id uuid PRIMARY KEY,
  control_kind text NOT NULL CHECK (control_kind IN ('KILL', 'SUSPEND')),
  scope_type text NOT NULL CHECK (scope_type IN (
    'GLOBAL', 'PROJECT', 'AGENT', 'RUNNER', 'TOOL_PROVIDER', 'WORKFLOW', 'TASK'
  )),
  environment text NOT NULL CHECK (environment = 'STAGING'),
  lifecycle text NOT NULL CHECK (lifecycle IN ('ACTIVE', 'RECOVERING', 'INACTIVE')),
  incident_mode text NOT NULL CHECK (incident_mode IN ('NONE', 'ACTIVE', 'RESOLVED')),
  project_id uuid REFERENCES core.projects(id),
  agent_id uuid REFERENCES ai.agents(id),
  runner_id uuid REFERENCES execution.runners(id),
  tool_provider_id uuid REFERENCES execution.tool_providers(id),
  workflow_instance_id uuid REFERENCES work.workflow_instances(id),
  task_id uuid REFERENCES work.tasks(id),
  actor_id uuid NOT NULL,
  authority_ref text NOT NULL CHECK (length(trim(authority_ref)) > 0),
  reason_code text NOT NULL CHECK (length(trim(reason_code)) > 0),
  policy_ref text NOT NULL CHECK (length(trim(policy_ref)) > 0),
  policy_version text NOT NULL CHECK (length(trim(policy_version)) > 0),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  input_fingerprint text NOT NULL CHECK (input_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  activated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recovery_requested_at timestamptz,
  recovered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (environment, idempotency_key),
  CHECK (
    (scope_type = 'GLOBAL' AND project_id IS NULL AND agent_id IS NULL AND runner_id IS NULL AND tool_provider_id IS NULL AND workflow_instance_id IS NULL AND task_id IS NULL) OR
    (scope_type = 'PROJECT' AND project_id IS NOT NULL AND agent_id IS NULL AND runner_id IS NULL AND tool_provider_id IS NULL AND workflow_instance_id IS NULL AND task_id IS NULL) OR
    (scope_type = 'AGENT' AND project_id IS NULL AND agent_id IS NOT NULL AND runner_id IS NULL AND tool_provider_id IS NULL AND workflow_instance_id IS NULL AND task_id IS NULL) OR
    (scope_type = 'RUNNER' AND project_id IS NULL AND agent_id IS NULL AND runner_id IS NOT NULL AND tool_provider_id IS NULL AND workflow_instance_id IS NULL AND task_id IS NULL) OR
    (scope_type = 'TOOL_PROVIDER' AND project_id IS NULL AND agent_id IS NULL AND runner_id IS NULL AND tool_provider_id IS NOT NULL AND workflow_instance_id IS NULL AND task_id IS NULL) OR
    (scope_type = 'WORKFLOW' AND project_id IS NULL AND agent_id IS NULL AND runner_id IS NULL AND tool_provider_id IS NULL AND workflow_instance_id IS NOT NULL AND task_id IS NULL) OR
    (scope_type = 'TASK' AND project_id IS NULL AND agent_id IS NULL AND runner_id IS NULL AND tool_provider_id IS NULL AND workflow_instance_id IS NULL AND task_id IS NOT NULL)
  ),
  CHECK (recovery_requested_at IS NULL OR recovery_requested_at >= activated_at),
  CHECK (recovered_at IS NULL OR recovered_at >= activated_at),
  CHECK ((lifecycle = 'RECOVERING') = (recovery_requested_at IS NOT NULL AND recovered_at IS NULL) OR lifecycle <> 'RECOVERING'),
  CHECK ((lifecycle = 'INACTIVE') = (recovered_at IS NOT NULL) OR lifecycle <> 'INACTIVE')
);

CREATE UNIQUE INDEX security_controls_one_effective_scope
  ON governance.security_controls (
    control_kind,
    scope_type,
    environment,
    COALESCE(project_id::text, agent_id::text, runner_id::text, tool_provider_id::text, workflow_instance_id::text, task_id::text, 'GLOBAL')
  )
  WHERE lifecycle IN ('ACTIVE', 'RECOVERING');

CREATE INDEX security_controls_evaluation_idx
  ON governance.security_controls (environment, lifecycle, scope_type);

CREATE TABLE governance.security_control_transitions (
  id uuid PRIMARY KEY,
  security_control_id uuid NOT NULL REFERENCES governance.security_controls(id),
  from_lifecycle text CHECK (from_lifecycle IS NULL OR from_lifecycle IN ('ACTIVE', 'RECOVERING', 'INACTIVE')),
  to_lifecycle text NOT NULL CHECK (to_lifecycle IN ('ACTIVE', 'RECOVERING', 'INACTIVE')),
  actor_id uuid NOT NULL,
  authority_ref text NOT NULL CHECK (length(trim(authority_ref)) > 0),
  reason_code text NOT NULL CHECK (length(trim(reason_code)) > 0),
  policy_ref text NOT NULL CHECK (length(trim(policy_ref)) > 0),
  policy_version text NOT NULL CHECK (length(trim(policy_version)) > 0),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  input_fingerprint text NOT NULL CHECK (input_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  evidence_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (security_control_id, idempotency_key)
);

CREATE TABLE governance.security_cancellations (
  id uuid PRIMARY KEY,
  security_control_id uuid NOT NULL REFERENCES governance.security_controls(id),
  target_type text NOT NULL CHECK (target_type IN ('TASK', 'RUN', 'TOOL_CALL', 'WORKFLOW')),
  target_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN (
    'NOT_REQUIRED', 'REQUESTED', 'ACKNOWLEDGED', 'CANCELLED', 'TIMEOUT', 'FAILED'
  )),
  reason_code text NOT NULL CHECK (length(trim(reason_code)) > 0),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  evidence_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  requested_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (security_control_id, target_type, target_id),
  UNIQUE (security_control_id, idempotency_key),
  CHECK (acknowledged_at IS NULL OR acknowledged_at >= requested_at),
  CHECK (completed_at IS NULL OR completed_at >= requested_at)
);

CREATE OR REPLACE FUNCTION governance.reject_security_control_transition_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'security control transitions are append-only';
END;
$$;

CREATE TRIGGER security_control_transitions_reject_update
BEFORE UPDATE ON governance.security_control_transitions
FOR EACH ROW EXECUTE FUNCTION governance.reject_security_control_transition_mutation();

CREATE TRIGGER security_control_transitions_reject_delete
BEFORE DELETE ON governance.security_control_transitions
FOR EACH ROW EXECUTE FUNCTION governance.reject_security_control_transition_mutation();
