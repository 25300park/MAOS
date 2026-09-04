CREATE TABLE integration.ai_mls_resource_links (
  system_id text NOT NULL REFERENCES integration.systems(id),
  resource_id text NOT NULL CHECK (length(trim(resource_id)) > 0),
  project_id uuid NOT NULL REFERENCES core.projects(id),
  task_id uuid NOT NULL REFERENCES work.tasks(id),
  source_reference text NOT NULL CHECK (source_reference LIKE 'ai-mls://%'),
  external_version text NOT NULL CHECK (length(trim(external_version)) > 0),
  target_hash text NOT NULL CHECK (target_hash ~ '^sha256:[a-f0-9]{64}$'),
  visibility text NOT NULL DEFAULT 'INTERNAL_ONLY' CHECK (visibility = 'INTERNAL_ONLY'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (system_id, resource_id),
  UNIQUE (project_id, task_id, system_id, resource_id)
);

CREATE TABLE integration.ai_mls_intake_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id text NOT NULL,
  resource_id text NOT NULL,
  source_reference text NOT NULL CHECK (source_reference LIKE 'ai-mls://%'),
  external_version text NOT NULL CHECK (length(trim(external_version)) > 0),
  health text NOT NULL CHECK (health IN ('HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'MAINTENANCE', 'UNKNOWN')),
  collection_status text NOT NULL CHECK (collection_status IN ('IDLE', 'RUNNING', 'PAUSED', 'FAILED')),
  ingestion_status text NOT NULL CHECK (ingestion_status IN ('READY', 'RUNNING', 'DEGRADED', 'FAILED')),
  pending_count integer NOT NULL CHECK (pending_count >= 0),
  verified_count integer NOT NULL CHECK (verified_count >= 0),
  blocked_count integer NOT NULL CHECK (blocked_count >= 0),
  stale_ingestions integer NOT NULL CHECK (stale_ingestions >= 0),
  failed_ingestions integer NOT NULL CHECK (failed_ingestions >= 0),
  evidence_references text[] NOT NULL CHECK (cardinality(evidence_references) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (system_id, resource_id)
    REFERENCES integration.ai_mls_resource_links(system_id, resource_id)
);

CREATE TABLE integration.ai_mls_candidate_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id text NOT NULL,
  resource_id text NOT NULL,
  candidate_id text NOT NULL CHECK (length(trim(candidate_id)) > 0),
  source_reference text NOT NULL CHECK (source_reference LIKE 'ai-mls://%'),
  verification_state text NOT NULL CHECK (verification_state IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'BLOCKED')),
  contact_state text NOT NULL CHECK (contact_state IN ('NOT_CONTACTED', 'CONTACT_PENDING', 'CONTACTED', 'BLOCKED')),
  consent_state text NOT NULL CHECK (consent_state IN ('UNKNOWN', 'PENDING', 'GRANTED', 'DENIED', 'REVOKED')),
  duplicate_state text NOT NULL CHECK (duplicate_state IN ('UNKNOWN', 'UNIQUE', 'POSSIBLE_DUPLICATE', 'DUPLICATE')),
  freshness text NOT NULL CHECK (freshness IN ('FRESH', 'STALE')),
  publication_eligibility_informational_only boolean NOT NULL DEFAULT true CHECK (publication_eligibility_informational_only),
  evidence_references text[] NOT NULL CHECK (cardinality(evidence_references) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (system_id, resource_id, candidate_id, observed_at),
  FOREIGN KEY (system_id, resource_id)
    REFERENCES integration.ai_mls_resource_links(system_id, resource_id)
);

CREATE OR REPLACE FUNCTION integration.reject_ai_mls_observation_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AI-MLS observations are append-only';
END;
$$;

CREATE TRIGGER ai_mls_intake_observations_immutable
BEFORE UPDATE OR DELETE ON integration.ai_mls_intake_observations
FOR EACH ROW EXECUTE FUNCTION integration.reject_ai_mls_observation_mutation();

CREATE TRIGGER ai_mls_candidate_references_immutable
BEFORE UPDATE OR DELETE ON integration.ai_mls_candidate_references
FOR EACH ROW EXECUTE FUNCTION integration.reject_ai_mls_observation_mutation();
