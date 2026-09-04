CREATE TABLE integration.crm_employee_scope_references (
  system_id text NOT NULL REFERENCES integration.systems(id),
  employee_id text NOT NULL CHECK (length(trim(employee_id)) > 0),
  project_id uuid NOT NULL REFERENCES core.projects(id),
  source_reference text NOT NULL CHECK (source_reference LIKE 'crm://employees/%'),
  visibility text NOT NULL DEFAULT 'BUSINESS_WORK_ONLY' CHECK (visibility = 'BUSINESS_WORK_ONLY'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (system_id, employee_id),
  UNIQUE (system_id, source_reference)
);

CREATE TABLE integration.crm_capture_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id text NOT NULL,
  employee_id text NOT NULL,
  candidate_id text NOT NULL CHECK (length(trim(candidate_id)) > 0),
  original_input_reference text NOT NULL CHECK (original_input_reference LIKE 'crm://captures/%'),
  deduplication_key text NOT NULL CHECK (length(trim(deduplication_key)) > 0),
  confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  review_required boolean NOT NULL CHECK (review_required),
  evidence_references text[] NOT NULL CHECK (cardinality(evidence_references) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (system_id, employee_id, candidate_id),
  UNIQUE (system_id, employee_id, deduplication_key),
  FOREIGN KEY (system_id, employee_id)
    REFERENCES integration.crm_employee_scope_references(system_id, employee_id)
);

CREATE TABLE integration.crm_work_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id text NOT NULL,
  employee_id text NOT NULL,
  source_reference text NOT NULL CHECK (source_reference LIKE 'crm://%'),
  workload text NOT NULL CHECK (workload IN ('LOW', 'BALANCED', 'HIGH')),
  tasks_due_today integer NOT NULL CHECK (tasks_due_today >= 0),
  overdue_tasks integer NOT NULL CHECK (overdue_tasks >= 0),
  upcoming_viewings integer NOT NULL CHECK (upcoming_viewings >= 0),
  contract_deadlines integer NOT NULL CHECK (contract_deadlines >= 0),
  blockers integer NOT NULL CHECK (blockers >= 0),
  evidence_references text[] NOT NULL CHECK (cardinality(evidence_references) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (system_id, employee_id)
    REFERENCES integration.crm_employee_scope_references(system_id, employee_id)
);

CREATE OR REPLACE FUNCTION integration.reject_crm_observation_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CRM integration observations are append-only';
END;
$$;

CREATE TRIGGER crm_capture_candidates_immutable
BEFORE UPDATE OR DELETE ON integration.crm_capture_candidates
FOR EACH ROW EXECUTE FUNCTION integration.reject_crm_observation_mutation();

CREATE TRIGGER crm_work_observations_immutable
BEFORE UPDATE OR DELETE ON integration.crm_work_observations
FOR EACH ROW EXECUTE FUNCTION integration.reject_crm_observation_mutation();
