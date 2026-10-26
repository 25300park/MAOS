CREATE TABLE work.command_envelopes (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES core.projects(id),
  human_actor_id uuid NOT NULL REFERENCES identity.humans(id),
  source_message_ref text NOT NULL CHECK (length(trim(source_message_ref)) > 0),
  source_message_hash text NOT NULL CHECK (source_message_hash ~ '^sha256:[a-f0-9]{64}$'),
  prior_command_id uuid REFERENCES work.command_envelopes(id),
  company_scope_ref text NOT NULL CHECK (length(trim(company_scope_ref)) > 0),
  team_scope_ref text CHECK (team_scope_ref IS NULL OR length(trim(team_scope_ref)) > 0),
  project_scope_ref text NOT NULL CHECK (length(trim(project_scope_ref)) > 0),
  system_scope_ref text CHECK (system_scope_ref IS NULL OR length(trim(system_scope_ref)) > 0),
  environment text NOT NULL CHECK (environment IN ('DEVELOPMENT', 'PREVIEW', 'STAGING', 'PRODUCTION')),
  normalized_intent text NOT NULL CHECK (length(trim(normalized_intent)) > 0),
  requested_outcome text NOT NULL CHECK (length(trim(requested_outcome)) > 0),
  command_classification text NOT NULL CHECK (command_classification IN (
    'READ_OBSERVE', 'ANALYZE_PLAN', 'GOVERNED_WRITE_ACTION', 'CONTROL', 'PROHIBITED_UNSUPPORTED'
  )),
  risk_class text NOT NULL CHECK (risk_class IN ('R0', 'R1', 'R2', 'R3', 'R4')),
  policy_ref text NOT NULL CHECK (length(trim(policy_ref)) > 0),
  policy_version text NOT NULL CHECK (length(trim(policy_version)) > 0),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN (
    'RECEIVED', 'INTERPRETING', 'CLASSIFIED', 'PLANNING', 'REVIEW',
    'WAITING_HUMAN', 'WAITING_APPROVAL', 'READY', 'DISPATCHED',
    'REJECTED', 'DENIED', 'CANCELLED', 'EXPIRED', 'FAILED'
  )),
  clarification_state text NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (
    clarification_state IN ('NOT_REQUIRED', 'REQUIRED', 'RESOLVED')
  ),
  unresolved_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  causation_ref text CHECK (causation_ref IS NULL OR length(trim(causation_ref)) > 0),
  approval_id uuid REFERENCES governance.approvals(id),
  task_id uuid REFERENCES work.tasks(id),
  workflow_instance_id uuid REFERENCES work.workflow_instances(id),
  run_id uuid REFERENCES execution.runs(id),
  evidence_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  audit_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  reason_code text CHECK (reason_code IS NULL OR length(trim(reason_code)) > 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz,
  UNIQUE (project_id, idempotency_key),
  UNIQUE (project_id, id),
  UNIQUE (id, version),
  CHECK (updated_at >= created_at),
  CHECK (expires_at IS NULL OR expires_at >= created_at),
  CHECK (
    (clarification_state = 'REQUIRED') =
    (lifecycle_state = 'WAITING_HUMAN' AND cardinality(unresolved_fields) > 0)
    OR clarification_state <> 'REQUIRED'
  )
);

CREATE INDEX command_envelopes_project_correlation_idx
  ON work.command_envelopes (project_id, correlation_id, created_at);

CREATE TABLE work.command_envelope_versions (
  command_envelope_id uuid NOT NULL,
  project_id uuid NOT NULL,
  version bigint NOT NULL CHECK (version > 0),
  command_envelope_hash text NOT NULL CHECK (command_envelope_hash ~ '^sha256:[a-f0-9]{64}$'),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN (
    'RECEIVED', 'INTERPRETING', 'CLASSIFIED', 'PLANNING', 'REVIEW',
    'WAITING_HUMAN', 'WAITING_APPROVAL', 'READY', 'DISPATCHED',
    'REJECTED', 'DENIED', 'CANCELLED', 'EXPIRED', 'FAILED'
  )),
  clarification_state text NOT NULL CHECK (clarification_state IN ('NOT_REQUIRED', 'REQUIRED', 'RESOLVED')),
  unresolved_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  approval_id uuid REFERENCES governance.approvals(id),
  approval_request_ref text,
  approval_decision_ref text,
  approval_target_version text,
  approval_target_hash text CHECK (approval_target_hash IS NULL OR approval_target_hash ~ '^sha256:[a-f0-9]{64}$'),
  task_id uuid REFERENCES work.tasks(id),
  workflow_instance_id uuid REFERENCES work.workflow_instances(id),
  run_id uuid REFERENCES execution.runs(id),
  evidence_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  audit_refs text[] NOT NULL CHECK (cardinality(audit_refs) > 0),
  reason_code text NOT NULL CHECK (length(trim(reason_code)) > 0),
  transition_actor_type text NOT NULL CHECK (transition_actor_type IN ('HUMAN', 'AGENT', 'SYSTEM', 'SERVICE')),
  transition_actor_ref text NOT NULL CHECK (length(trim(transition_actor_ref)) > 0),
  transition_policy_ref text NOT NULL CHECK (length(trim(transition_policy_ref)) > 0),
  transition_policy_version text NOT NULL CHECK (length(trim(transition_policy_version)) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  causation_ref text CHECK (causation_ref IS NULL OR length(trim(causation_ref)) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (command_envelope_id, version),
  UNIQUE (project_id, command_envelope_id, version),
  UNIQUE (project_id, command_envelope_id, version, command_envelope_hash),
  FOREIGN KEY (project_id, command_envelope_id)
    REFERENCES work.command_envelopes(project_id, id),
  CHECK (
    (approval_id IS NULL AND approval_request_ref IS NULL AND approval_decision_ref IS NULL
      AND approval_target_version IS NULL AND approval_target_hash IS NULL)
    OR (approval_id IS NOT NULL AND approval_request_ref IS NOT NULL
      AND approval_target_version IS NOT NULL AND approval_target_hash IS NOT NULL)
  )
);

ALTER TABLE governance.approvals
  ADD CONSTRAINT approvals_exact_target_binding_unique
  UNIQUE (id, target_version, target_hash);

ALTER TABLE work.command_envelope_versions
  ADD CONSTRAINT command_versions_exact_approval_fk
  FOREIGN KEY (approval_id, approval_target_version, approval_target_hash)
  REFERENCES governance.approvals(id, target_version, target_hash);

CREATE TABLE governance.governed_artifact_refs (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES core.projects(id),
  command_envelope_id uuid NOT NULL REFERENCES work.command_envelopes(id),
  artifact_kind text NOT NULL CHECK (artifact_kind IN ('PLAN', 'REVIEW', 'VERIFICATION')),
  artifact_ref text NOT NULL CHECK (length(trim(artifact_ref)) > 0),
  artifact_version text NOT NULL CHECK (length(trim(artifact_version)) > 0),
  artifact_hash text NOT NULL CHECK (artifact_hash ~ '^sha256:[a-f0-9]{64}$'),
  delivery_artifact_id uuid REFERENCES delivery.artifacts(id),
  task_id uuid REFERENCES work.tasks(id),
  run_id uuid REFERENCES execution.runs(id),
  scope_ref text NOT NULL CHECK (length(trim(scope_ref)) > 0),
  risk_class text NOT NULL CHECK (risk_class IN ('R0', 'R1', 'R2', 'R3', 'R4')),
  environment text NOT NULL CHECK (environment IN ('DEVELOPMENT', 'PREVIEW', 'STAGING', 'PRODUCTION')),
  policy_ref text NOT NULL CHECK (length(trim(policy_ref)) > 0),
  policy_version text NOT NULL CHECK (length(trim(policy_version)) > 0),
  evidence_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  audit_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  input_fingerprint text NOT NULL CHECK (input_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  causation_ref text CHECK (causation_ref IS NULL OR length(trim(causation_ref)) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, idempotency_key),
  UNIQUE (project_id, command_envelope_id, id),
  UNIQUE (project_id, artifact_kind, artifact_ref, artifact_version, artifact_hash)
  ,FOREIGN KEY (project_id, command_envelope_id)
    REFERENCES work.command_envelopes(project_id, id)
  ,FOREIGN KEY (project_id, task_id)
    REFERENCES work.tasks(project_id, id)
);

CREATE INDEX governed_artifact_refs_command_kind_idx
  ON governance.governed_artifact_refs (command_envelope_id, artifact_kind, created_at);

CREATE TABLE governance.routing_envelopes (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES core.projects(id),
  command_envelope_id uuid NOT NULL,
  command_envelope_version bigint NOT NULL CHECK (command_envelope_version > 0),
  command_envelope_hash text NOT NULL CHECK (command_envelope_hash ~ '^sha256:[a-f0-9]{64}$'),
  routing_kind text NOT NULL CHECK (routing_kind IN ('PLANNER', 'REVIEWER', 'EXECUTOR', 'VERIFIER')),
  status text NOT NULL CHECK (status IN (
    'PENDING', 'EVALUATING', 'SELECTED', 'WAITING_HUMAN', 'CANCELLED', 'EXPIRED', 'FAILED'
  )),
  input_artifact_id uuid,
  verification_handoff_id uuid,
  routing_purpose text NOT NULL CHECK (length(trim(routing_purpose)) > 0),
  required_role text NOT NULL CHECK (length(trim(required_role)) > 0),
  selected_role_ref text CHECK (selected_role_ref IS NULL OR length(trim(selected_role_ref)) > 0),
  selected_agent_id uuid REFERENCES ai.agents(id),
  candidate_refs text[] NOT NULL CHECK (cardinality(candidate_refs) > 0),
  evaluation_refs text[] NOT NULL CHECK (cardinality(evaluation_refs) > 0),
  capability_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  skill_version_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  independence_evidence_ref text CHECK (
    independence_evidence_ref IS NULL OR length(trim(independence_evidence_ref)) > 0
  ),
  risk_class text NOT NULL CHECK (risk_class IN ('R0', 'R1', 'R2', 'R3', 'R4')),
  environment text NOT NULL CHECK (environment IN ('DEVELOPMENT', 'PREVIEW', 'STAGING', 'PRODUCTION')),
  routing_policy_ref text NOT NULL CHECK (length(trim(routing_policy_ref)) > 0),
  routing_policy_version text NOT NULL CHECK (length(trim(routing_policy_version)) > 0),
  approval_id uuid REFERENCES governance.approvals(id),
  approval_request_ref text,
  approval_decision_ref text,
  approval_target_version text,
  approval_target_hash text CHECK (
    approval_target_hash IS NULL OR approval_target_hash ~ '^sha256:[a-f0-9]{64}$'
  ),
  repository_id text REFERENCES operations.repositories(id),
  workroot_id text REFERENCES operations.workroots(id),
  task_id uuid REFERENCES work.tasks(id),
  run_id uuid REFERENCES execution.runs(id),
  fallback_outcome text CHECK (fallback_outcome IS NULL OR length(trim(fallback_outcome)) > 0),
  no_selection_reason text CHECK (no_selection_reason IS NULL OR length(trim(no_selection_reason)) > 0),
  input_binding_hash text NOT NULL CHECK (input_binding_hash ~ '^sha256:[a-f0-9]{64}$'),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  routing_input_fingerprint text NOT NULL CHECK (routing_input_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  causation_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  evidence_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  audit_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  evaluated_at timestamptz NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, routing_kind, idempotency_key),
  UNIQUE (id, routing_kind),
  UNIQUE (project_id, command_envelope_id, id, routing_kind),
  FOREIGN KEY (project_id, command_envelope_id, command_envelope_version, command_envelope_hash)
    REFERENCES work.command_envelope_versions(
      project_id, command_envelope_id, version, command_envelope_hash
    ),
  FOREIGN KEY (approval_id, approval_target_version, approval_target_hash)
    REFERENCES governance.approvals(id, target_version, target_hash),
  FOREIGN KEY (project_id, command_envelope_id, input_artifact_id)
    REFERENCES governance.governed_artifact_refs(project_id, command_envelope_id, id),
  FOREIGN KEY (project_id, task_id)
    REFERENCES work.tasks(project_id, id),
  CHECK (expires_at IS NULL OR expires_at >= evaluated_at),
  CHECK ((status = 'SELECTED') = (selected_agent_id IS NOT NULL)),
  CHECK (
    (approval_id IS NULL AND approval_request_ref IS NULL AND approval_decision_ref IS NULL
      AND approval_target_version IS NULL AND approval_target_hash IS NULL)
    OR (approval_id IS NOT NULL AND approval_request_ref IS NOT NULL
      AND approval_target_version IS NOT NULL AND approval_target_hash IS NOT NULL)
  ),
  CHECK (routing_kind <> 'REVIEWER' OR input_artifact_id IS NOT NULL),
  CHECK (routing_kind <> 'VERIFIER' OR verification_handoff_id IS NOT NULL)
);

CREATE INDEX routing_envelopes_command_kind_idx
  ON governance.routing_envelopes (command_envelope_id, routing_kind, created_at);

CREATE OR REPLACE FUNCTION governance.enforce_current_routing_command_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM work.command_envelopes
    WHERE id = NEW.command_envelope_id
      AND project_id = NEW.project_id
      AND version = NEW.command_envelope_version
  ) THEN
    RAISE EXCEPTION 'routing envelope command version is stale or missing';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER routing_envelopes_enforce_current_command_version
BEFORE INSERT ON governance.routing_envelopes
FOR EACH ROW EXECUTE FUNCTION governance.enforce_current_routing_command_version();

CREATE TABLE governance.verification_handoffs (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES core.projects(id),
  command_envelope_id uuid NOT NULL,
  executor_routing_id uuid NOT NULL,
  executor_routing_kind text NOT NULL DEFAULT 'EXECUTOR' CHECK (executor_routing_kind = 'EXECUTOR'),
  task_id uuid NOT NULL REFERENCES work.tasks(id),
  run_id uuid NOT NULL REFERENCES execution.runs(id),
  tool_call_id uuid REFERENCES execution.tool_calls(id),
  runner_id uuid NOT NULL REFERENCES execution.runners(id),
  status text NOT NULL CHECK (status IN ('READY', 'INVALIDATED', 'CANCELLED', 'EXPIRED')),
  execution_result_ref text NOT NULL CHECK (length(trim(execution_result_ref)) > 0),
  execution_result_version text NOT NULL CHECK (length(trim(execution_result_version)) > 0),
  execution_result_hash text NOT NULL CHECK (execution_result_hash ~ '^sha256:[a-f0-9]{64}$'),
  artifact_ref_ids uuid[] NOT NULL CHECK (cardinality(artifact_ref_ids) > 0),
  artifact_manifest_hash text NOT NULL CHECK (artifact_manifest_hash ~ '^sha256:[a-f0-9]{64}$'),
  evidence_refs text[] NOT NULL CHECK (cardinality(evidence_refs) > 0),
  evidence_set_hash text NOT NULL CHECK (evidence_set_hash ~ '^sha256:[a-f0-9]{64}$'),
  expected_outcome_ref text NOT NULL CHECK (length(trim(expected_outcome_ref)) > 0),
  acceptance_criteria_ref text NOT NULL CHECK (length(trim(acceptance_criteria_ref)) > 0),
  verification_criteria_ref text NOT NULL CHECK (length(trim(verification_criteria_ref)) > 0),
  scope_ref text NOT NULL CHECK (length(trim(scope_ref)) > 0),
  risk_class text NOT NULL CHECK (risk_class IN ('R0', 'R1', 'R2', 'R3', 'R4')),
  environment text NOT NULL CHECK (environment IN ('DEVELOPMENT', 'PREVIEW', 'STAGING', 'PRODUCTION')),
  execution_policy_ref text NOT NULL CHECK (length(trim(execution_policy_ref)) > 0),
  execution_policy_version text NOT NULL CHECK (length(trim(execution_policy_version)) > 0),
  verification_policy_ref text NOT NULL CHECK (length(trim(verification_policy_ref)) > 0),
  verification_policy_version text NOT NULL CHECK (length(trim(verification_policy_version)) > 0),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  handoff_fingerprint text NOT NULL CHECK (handoff_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  causation_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  audit_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz,
  UNIQUE (project_id, idempotency_key),
  UNIQUE (id, version),
  UNIQUE (project_id, command_envelope_id, id),
  FOREIGN KEY (project_id, command_envelope_id)
    REFERENCES work.command_envelopes(project_id, id),
  FOREIGN KEY (project_id, command_envelope_id, executor_routing_id, executor_routing_kind)
    REFERENCES governance.routing_envelopes(project_id, command_envelope_id, id, routing_kind),
  FOREIGN KEY (project_id, task_id)
    REFERENCES work.tasks(project_id, id),
  CHECK (expires_at IS NULL OR expires_at >= created_at)
);

CREATE INDEX verification_handoffs_run_idx
  ON governance.verification_handoffs (run_id, created_at);

CREATE TABLE governance.verification_handoff_artifacts (
  handoff_id uuid NOT NULL,
  project_id uuid NOT NULL,
  command_envelope_id uuid NOT NULL,
  artifact_ref_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (handoff_id, artifact_ref_id),
  FOREIGN KEY (project_id, command_envelope_id, handoff_id)
    REFERENCES governance.verification_handoffs(project_id, command_envelope_id, id),
  FOREIGN KEY (project_id, command_envelope_id, artifact_ref_id)
    REFERENCES governance.governed_artifact_refs(project_id, command_envelope_id, id)
);

ALTER TABLE governance.routing_envelopes
  ADD CONSTRAINT routing_envelopes_verification_handoff_fk
  FOREIGN KEY (project_id, command_envelope_id, verification_handoff_id)
  REFERENCES governance.verification_handoffs(project_id, command_envelope_id, id);

CREATE TABLE core.portal_bindings (
  id uuid NOT NULL,
  binding_kind text NOT NULL CHECK (binding_kind IN ('PROJECT_PORTAL', 'DEVELOPMENT_TEAM_PORTAL')),
  company_ref text NOT NULL CHECK (length(trim(company_ref)) > 0),
  team_ref text CHECK (team_ref IS NULL OR length(trim(team_ref)) > 0),
  project_id uuid NOT NULL REFERENCES core.projects(id),
  project_scope_ref text NOT NULL CHECK (length(trim(project_scope_ref)) > 0),
  system_id text REFERENCES integration.systems(id),
  system_version bigint,
  environment_id text,
  environment_version bigint,
  repository_id text,
  repository_version bigint,
  workroot_id text,
  workroot_ref text,
  policy_ref text NOT NULL CHECK (length(trim(policy_ref)) > 0),
  policy_version text NOT NULL CHECK (length(trim(policy_version)) > 0),
  lifecycle text NOT NULL CHECK (lifecycle IN ('ACTIVE', 'SUSPENDED', 'RETIRED')),
  capability_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  evidence_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  audit_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  binding_fingerprint text NOT NULL CHECK (binding_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  version bigint NOT NULL CHECK (version > 0),
  supersedes_version bigint,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz,
  PRIMARY KEY (id, version),
  UNIQUE (project_id, binding_kind, idempotency_key),
  FOREIGN KEY (id, supersedes_version)
    REFERENCES core.portal_bindings(id, version),
  FOREIGN KEY (system_id, environment_id)
    REFERENCES operations.system_environments(system_id, id),
  FOREIGN KEY (system_id, repository_id)
    REFERENCES operations.repositories(system_id, id),
  FOREIGN KEY (system_id, workroot_id)
    REFERENCES operations.workroots(system_id, id),
  CHECK (expires_at IS NULL OR expires_at >= created_at),
  CHECK (
    (version = 1 AND supersedes_version IS NULL)
    OR (version > 1 AND supersedes_version = version - 1)
  ),
  CHECK (
    binding_kind <> 'DEVELOPMENT_TEAM_PORTAL'
    OR (
      team_ref IS NOT NULL AND system_id IS NOT NULL AND system_version IS NOT NULL
      AND environment_id IS NOT NULL AND environment_version IS NOT NULL
      AND repository_id IS NOT NULL AND repository_version IS NOT NULL
      AND workroot_id IS NOT NULL AND workroot_ref IS NOT NULL
    )
  ),
  CHECK (
    (system_id IS NULL AND environment_id IS NULL AND repository_id IS NULL AND workroot_id IS NULL)
    OR system_id IS NOT NULL
  )
);

CREATE INDEX portal_bindings_project_kind_idx
  ON core.portal_bindings (project_id, binding_kind, lifecycle, created_at);

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
    (OLD.lifecycle_state = 'WAITING_HUMAN' AND NEW.lifecycle_state IN ('INTERPRETING', 'PLANNING', 'REVIEW', 'WAITING_APPROVAL', 'READY', 'CANCELLED', 'EXPIRED', 'FAILED')) OR
    (OLD.lifecycle_state = 'WAITING_APPROVAL' AND NEW.lifecycle_state IN ('READY', 'REJECTED', 'DENIED', 'CANCELLED', 'EXPIRED', 'FAILED')) OR
    (OLD.lifecycle_state = 'READY' AND NEW.lifecycle_state IN ('DISPATCHED', 'CANCELLED', 'EXPIRED', 'FAILED'))
  ) THEN
    RAISE EXCEPTION 'invalid command envelope lifecycle transition';
  END IF;

  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER command_envelopes_enforce_transition
BEFORE UPDATE ON work.command_envelopes
FOR EACH ROW EXECUTE FUNCTION work.enforce_command_envelope_transition();

CREATE OR REPLACE FUNCTION work.require_command_envelope_version_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM work.command_envelope_versions
    WHERE command_envelope_id = NEW.id
      AND project_id = NEW.project_id
      AND version = NEW.version
      AND command_envelope_hash = NEW.request_fingerprint
      AND lifecycle_state = NEW.lifecycle_state
      AND clarification_state = NEW.clarification_state
      AND unresolved_fields = NEW.unresolved_fields
      AND approval_id IS NOT DISTINCT FROM NEW.approval_id
      AND task_id IS NOT DISTINCT FROM NEW.task_id
      AND workflow_instance_id IS NOT DISTINCT FROM NEW.workflow_instance_id
      AND run_id IS NOT DISTINCT FROM NEW.run_id
      AND evidence_refs = NEW.evidence_refs
      AND audit_refs = NEW.audit_refs
  ) THEN
    RAISE EXCEPTION 'command envelope transition requires immutable version history';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER command_envelopes_require_version_history
AFTER UPDATE ON work.command_envelopes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION work.require_command_envelope_version_history();

CREATE OR REPLACE FUNCTION governance.validate_phase14_task_run_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.run_id IS NOT NULL AND (
    NEW.task_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM execution.runs
      WHERE id = NEW.run_id AND task_id = NEW.task_id
    )
  ) THEN
    RAISE EXCEPTION 'Phase 14 task/run binding mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER governed_artifact_refs_validate_execution
BEFORE INSERT ON governance.governed_artifact_refs
FOR EACH ROW EXECUTE FUNCTION governance.validate_phase14_task_run_binding();

CREATE TRIGGER routing_envelopes_validate_execution
BEFORE INSERT ON governance.routing_envelopes
FOR EACH ROW EXECUTE FUNCTION governance.validate_phase14_task_run_binding();

CREATE OR REPLACE FUNCTION governance.validate_routing_input_kind()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.routing_kind = 'REVIEWER' AND NOT EXISTS (
    SELECT 1 FROM governance.governed_artifact_refs
    WHERE id = NEW.input_artifact_id
      AND project_id = NEW.project_id
      AND command_envelope_id = NEW.command_envelope_id
      AND artifact_kind = 'PLAN'
  ) THEN
    RAISE EXCEPTION 'Reviewer routing requires the exact governed Plan artifact';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER routing_envelopes_validate_input_kind
BEFORE INSERT ON governance.routing_envelopes
FOR EACH ROW EXECUTE FUNCTION governance.validate_routing_input_kind();

CREATE OR REPLACE FUNCTION governance.validate_verification_handoff_execution()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM execution.runs
    WHERE id = NEW.run_id AND task_id = NEW.task_id AND runner_id = NEW.runner_id
  ) THEN
    RAISE EXCEPTION 'Phase 14 handoff run/runner binding mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER verification_handoffs_validate_execution
BEFORE INSERT ON governance.verification_handoffs
FOR EACH ROW EXECUTE FUNCTION governance.validate_verification_handoff_execution();

CREATE OR REPLACE FUNCTION core.validate_portal_binding_versions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.system_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM integration.systems
    WHERE id = NEW.system_id AND version = NEW.system_version
  ) THEN
    RAISE EXCEPTION 'portal system version mismatch';
  END IF;
  IF NEW.environment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM operations.system_environments
    WHERE id = NEW.environment_id AND system_id = NEW.system_id
      AND version = NEW.environment_version
  ) THEN
    RAISE EXCEPTION 'portal environment version mismatch';
  END IF;
  IF NEW.repository_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM operations.repositories
    WHERE id = NEW.repository_id AND system_id = NEW.system_id
      AND version = NEW.repository_version
  ) THEN
    RAISE EXCEPTION 'portal repository version mismatch';
  END IF;
  IF NEW.workroot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM operations.workroots
    WHERE id = NEW.workroot_id AND system_id = NEW.system_id
      AND repository_id = NEW.repository_id AND root_reference = NEW.workroot_ref
  ) THEN
    RAISE EXCEPTION 'portal workroot binding mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER portal_bindings_validate_versions
BEFORE INSERT ON core.portal_bindings
FOR EACH ROW EXECUTE FUNCTION core.validate_portal_binding_versions();

CREATE OR REPLACE FUNCTION governance.reject_phase14_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Phase 14 governed record is immutable';
END;
$$;

CREATE TRIGGER governed_artifact_refs_reject_mutation
BEFORE UPDATE OR DELETE ON governance.governed_artifact_refs
FOR EACH ROW EXECUTE FUNCTION governance.reject_phase14_immutable_mutation();

CREATE TRIGGER command_envelope_versions_reject_mutation
BEFORE UPDATE OR DELETE ON work.command_envelope_versions
FOR EACH ROW EXECUTE FUNCTION governance.reject_phase14_immutable_mutation();

CREATE TRIGGER routing_envelopes_reject_mutation
BEFORE UPDATE OR DELETE ON governance.routing_envelopes
FOR EACH ROW EXECUTE FUNCTION governance.reject_phase14_immutable_mutation();

CREATE TRIGGER verification_handoffs_reject_mutation
BEFORE UPDATE OR DELETE ON governance.verification_handoffs
FOR EACH ROW EXECUTE FUNCTION governance.reject_phase14_immutable_mutation();

CREATE TRIGGER verification_handoff_artifacts_reject_mutation
BEFORE UPDATE OR DELETE ON governance.verification_handoff_artifacts
FOR EACH ROW EXECUTE FUNCTION governance.reject_phase14_immutable_mutation();

CREATE TRIGGER portal_bindings_reject_mutation
BEFORE UPDATE OR DELETE ON core.portal_bindings
FOR EACH ROW EXECUTE FUNCTION governance.reject_phase14_immutable_mutation();
