CREATE TABLE integration.marketing_team_members (
  system_id text NOT NULL REFERENCES integration.systems(id),
  external_agent_id text NOT NULL CHECK (length(trim(external_agent_id)) > 0),
  role text NOT NULL CHECK (role IN (
    'CMO', 'STRATEGY', 'DATA_ANALYSIS', 'ADS', 'CONTENT',
    'COPY', 'DESIGN', 'YOUTUBE', 'QA', 'PUBLISHER'
  )),
  current_work_reference text NOT NULL CHECK (current_work_reference LIKE 'marketing://%'),
  health text NOT NULL CHECK (health IN ('HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'MAINTENANCE', 'UNKNOWN')),
  status text NOT NULL CHECK (status IN ('AVAILABLE', 'WORKING', 'WAITING', 'BLOCKED', 'OFFLINE')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (system_id, external_agent_id),
  UNIQUE (system_id, role),
  CHECK (updated_at >= created_at)
);

CREATE TABLE integration.marketing_campaign_links (
  system_id text NOT NULL REFERENCES integration.systems(id),
  campaign_id text NOT NULL CHECK (length(trim(campaign_id)) > 0),
  project_id uuid NOT NULL REFERENCES core.projects(id),
  task_id uuid NOT NULL REFERENCES work.tasks(id),
  source_reference text NOT NULL CHECK (source_reference LIKE 'marketing://%'),
  external_version text NOT NULL CHECK (length(trim(external_version)) > 0),
  target_hash text NOT NULL CHECK (target_hash ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (system_id, campaign_id),
  UNIQUE (project_id, task_id, system_id, campaign_id)
);

CREATE TABLE integration.marketing_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id text NOT NULL,
  campaign_id text NOT NULL,
  source_reference text NOT NULL CHECK (source_reference LIKE 'marketing://%'),
  external_version text NOT NULL CHECK (length(trim(external_version)) > 0),
  target_hash text NOT NULL CHECK (target_hash ~ '^sha256:[a-f0-9]{64}$'),
  campaign_status text NOT NULL CHECK (campaign_status IN (
    'DRAFT', 'PLANNING', 'PRODUCING', 'QA', 'WAITING_APPROVAL',
    'PUBLISHER_READY', 'SIMULATED', 'COMPLETED', 'BLOCKED', 'FAILED'
  )),
  qa_state text NOT NULL CHECK (qa_state IN ('NOT_STARTED', 'IN_PROGRESS', 'PASS', 'REVISE', 'BLOCK')),
  approval_state text NOT NULL CHECK (approval_state IN ('NOT_REQUESTED', 'PENDING', 'APPROVED', 'REJECTED', 'STALE')),
  publisher_state text NOT NULL CHECK (publisher_state IN ('NOT_READY', 'WAITING_QA', 'WAITING_AUTHORIZATION', 'SIMULATION_READY', 'SIMULATED')),
  evidence_references text[] NOT NULL CHECK (cardinality(evidence_references) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (system_id, campaign_id)
    REFERENCES integration.marketing_campaign_links(system_id, campaign_id)
);

CREATE OR REPLACE FUNCTION integration.reject_marketing_observation_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'marketing observations are append-only';
END;
$$;

CREATE TRIGGER marketing_observations_immutable_update
BEFORE UPDATE OR DELETE ON integration.marketing_observations
FOR EACH ROW EXECUTE FUNCTION integration.reject_marketing_observation_mutation();
