CREATE TABLE governance.verified_result_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_key text NOT NULL UNIQUE CHECK (length(trim(result_key)) > 0),
  project_id uuid NOT NULL REFERENCES core.projects(id),
  source_type text NOT NULL CHECK (source_type IN ('TASK', 'RUN', 'WORKFLOW', 'QUALITY', 'SYSTEM')),
  source_id text NOT NULL CHECK (length(trim(source_id)) > 0),
  source_version integer NOT NULL CHECK (source_version > 0),
  source_hash text NOT NULL CHECK (source_hash ~ '^sha256:[a-f0-9]{64}$'),
  verification_state text NOT NULL DEFAULT 'VERIFIED' CHECK (verification_state = 'VERIFIED'),
  evidence_references text[] NOT NULL CHECK (cardinality(evidence_references) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, source_type, source_id, source_version, source_hash)
);

CREATE TABLE governance.optimization_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_key text NOT NULL UNIQUE CHECK (length(trim(evaluation_key)) > 0),
  project_id uuid NOT NULL REFERENCES core.projects(id),
  pattern text NOT NULL CHECK (pattern IN (
    'REPEATED_TASK_FAILURE', 'REPEATED_UX_FRICTION',
    'REPEATED_APPROVAL_BOTTLENECK', 'REPEATED_RETRY_RECOVERY',
    'REPEATED_SUCCESSFUL_WORKFLOW', 'REPEATED_SYSTEM_OPPORTUNITY',
    'REPEATED_RESOURCE_INEFFICIENCY'
  )),
  verified_result_keys text[] NOT NULL CHECK (cardinality(verified_result_keys) >= 2),
  metrics jsonb NOT NULL CHECK (jsonb_typeof(metrics) = 'array' AND jsonb_array_length(metrics) > 0),
  recommendation text NOT NULL CHECK (length(trim(recommendation)) > 0),
  evidence_references text[] NOT NULL CHECK (cardinality(evidence_references) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  evaluated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE governance.learning_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_key text NOT NULL UNIQUE CHECK (length(trim(candidate_key)) > 0),
  project_id uuid NOT NULL REFERENCES core.projects(id),
  candidate_type text NOT NULL CHECK (candidate_type IN (
    'WORKFLOW', 'SKILL', 'MODEL', 'RUNNER', 'TOOL', 'POLICY',
    'UX', 'SYSTEM', 'TEAM', 'AGENT', 'INTEGRATION'
  )),
  verified_result_keys text[] NOT NULL CHECK (cardinality(verified_result_keys) > 0),
  evaluation_key text REFERENCES governance.optimization_evaluations(evaluation_key),
  observed_pattern text NOT NULL CHECK (length(trim(observed_pattern)) > 0),
  improvement_hypothesis text NOT NULL CHECK (length(trim(improvement_hypothesis)) > 0),
  target_reference text NOT NULL CHECK (length(trim(target_reference)) > 0),
  target_version integer NOT NULL CHECK (target_version > 0),
  target_hash text NOT NULL CHECK (target_hash ~ '^sha256:[a-f0-9]{64}$'),
  candidate_hash text NOT NULL UNIQUE CHECK (candidate_hash ~ '^sha256:[a-f0-9]{64}$'),
  confidence numeric(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  risk text NOT NULL CHECK (risk IN ('R0', 'R1', 'R2', 'R3', 'R4')),
  expected_benefit text NOT NULL CHECK (length(trim(expected_benefit)) > 0),
  author_actor_id text NOT NULL CHECK (length(trim(author_actor_id)) > 0),
  reviewer_actor_id text NOT NULL CHECK (length(trim(reviewer_actor_id)) > 0),
  reviewed_by_actor_id text,
  approved_by_actor_id text,
  approval_id uuid REFERENCES governance.approvals(id),
  improvement_task_id uuid REFERENCES work.tasks(id),
  review_state text NOT NULL DEFAULT 'PENDING' CHECK (review_state IN ('PENDING', 'APPROVED', 'REJECTED')),
  approval_state text NOT NULL DEFAULT 'NOT_REQUESTED' CHECK (approval_state IN ('NOT_REQUESTED', 'PENDING', 'APPROVED', 'REJECTED')),
  verification_state text NOT NULL DEFAULT 'NOT_STARTED' CHECK (verification_state IN ('NOT_STARTED', 'IN_PROGRESS', 'PASS', 'FAIL')),
  ux_retest_state text NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (ux_retest_state IN ('NOT_REQUIRED', 'PENDING', 'PASS', 'FAIL')),
  activation_state text NOT NULL DEFAULT 'INACTIVE' CHECK (activation_state IN (
    'INACTIVE', 'READY_FOR_ACTIVATION', 'ACTIVE', 'PAUSED',
    'CANCELLED', 'REJECTED', 'ROLLBACK_CANDIDATE'
  )),
  simulation_only boolean NOT NULL DEFAULT false,
  escalated boolean NOT NULL DEFAULT false,
  evidence_references text[] NOT NULL CHECK (cardinality(evidence_references) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (author_actor_id <> reviewer_actor_id),
  CHECK (reviewed_by_actor_id IS NULL OR reviewed_by_actor_id <> author_actor_id),
  CHECK (approved_by_actor_id IS NULL OR (
    approved_by_actor_id <> author_actor_id AND
    approved_by_actor_id IS DISTINCT FROM reviewed_by_actor_id
  )),
  CHECK (
    activation_state NOT IN ('READY_FOR_ACTIVATION', 'ACTIVE') OR (
      review_state = 'APPROVED' AND approval_state = 'APPROVED' AND
      approval_id IS NOT NULL AND reviewed_by_actor_id IS NOT NULL AND
      approved_by_actor_id IS NOT NULL AND improvement_task_id IS NOT NULL AND
      verification_state = 'PASS' AND
      (candidate_type <> 'UX' OR ux_retest_state = 'PASS')
    )
  ),
  CHECK (review_state <> 'REJECTED' OR activation_state = 'REJECTED')
);

CREATE TABLE governance.learning_candidate_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_key text NOT NULL REFERENCES governance.learning_candidates(candidate_key),
  actor_type text NOT NULL CHECK (actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  actor_id text NOT NULL CHECK (length(trim(actor_id)) > 0),
  decision_type text NOT NULL CHECK (decision_type IN (
    'REVIEW_APPROVED', 'REVIEW_REJECTED', 'APPROVED', 'ACTIVATED',
    'PAUSED', 'CANCELLED', 'ESCALATED', 'ROLLBACK_PROPOSED'
  )),
  bound_version integer NOT NULL CHECK (bound_version > 0),
  bound_hash text NOT NULL CHECK (bound_hash ~ '^sha256:[a-f0-9]{64}$'),
  approval_id uuid REFERENCES governance.approvals(id),
  evidence_references text[] NOT NULL CHECK (cardinality(evidence_references) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit.learning_candidate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_key text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  actor_id text NOT NULL CHECK (length(trim(actor_id)) > 0),
  action text NOT NULL CHECK (action ~ '^[A-Z][A-Z0-9_]*\.[A-Z][A-Z0-9_]*$'),
  result text NOT NULL CHECK (result IN ('SUCCEEDED', 'FAILED', 'DENIED', 'CANCELLED')),
  evidence_references text[] NOT NULL CHECK (cardinality(evidence_references) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION governance.reject_learning_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'learning evidence is append-only';
END;
$$;

CREATE TRIGGER verified_results_reject_update
BEFORE UPDATE OR DELETE ON governance.verified_result_references
FOR EACH ROW EXECUTE FUNCTION governance.reject_learning_evidence_mutation();

CREATE TRIGGER optimization_evaluations_reject_update
BEFORE UPDATE OR DELETE ON governance.optimization_evaluations
FOR EACH ROW EXECUTE FUNCTION governance.reject_learning_evidence_mutation();

CREATE TRIGGER learning_candidate_decisions_reject_update
BEFORE UPDATE OR DELETE ON governance.learning_candidate_decisions
FOR EACH ROW EXECUTE FUNCTION governance.reject_learning_evidence_mutation();

CREATE TRIGGER learning_candidate_events_reject_update
BEFORE UPDATE OR DELETE ON audit.learning_candidate_events
FOR EACH ROW EXECUTE FUNCTION governance.reject_learning_evidence_mutation();
