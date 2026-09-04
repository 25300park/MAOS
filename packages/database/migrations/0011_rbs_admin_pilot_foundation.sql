ALTER TABLE work.tasks
  ADD CONSTRAINT tasks_id_project_id_unique UNIQUE (id, project_id);

CREATE TABLE integration.domain_systems (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  system_type text NOT NULL CHECK (system_type IN ('PUBLIC_PLATFORM', 'INTERNAL_PLATFORM')),
  source_of_truth text NOT NULL CHECK (source_of_truth = 'DOMAIN_SYSTEM'),
  maturity text NOT NULL CHECK (maturity IN ('I0', 'I1', 'I2')),
  integration_owner_id text NOT NULL CHECK (length(trim(integration_owner_id)) > 0),
  repository_reference text NOT NULL CHECK (repository_reference LIKE 'registry://%'),
  workroot_reference text NOT NULL CHECK (workroot_reference LIKE 'workroot://%'),
  credential_reference text NOT NULL CHECK (credential_reference LIKE 'secretref://%'),
  capabilities text[] NOT NULL CHECK (
    cardinality(capabilities) > 0 AND capabilities <@ ARRAY[
      'READ_SYSTEM_STATUS', 'READ_REPOSITORY_STATUS', 'READ_ENVIRONMENT_METADATA',
      'READ_VERSION_METADATA', 'READ_DEPLOYMENT_READINESS'
    ]::text[]
  ),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE integration.rbs_admin_pilots (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  version text NOT NULL CHECK (length(trim(version)) > 0),
  project_id uuid NOT NULL REFERENCES core.projects(id),
  task_id uuid NOT NULL,
  system_id text NOT NULL REFERENCES integration.domain_systems(id),
  repository_reference text NOT NULL CHECK (repository_reference LIKE 'registry://%'),
  workroot_reference text NOT NULL CHECK (workroot_reference LIKE 'workroot://%'),
  stage text NOT NULL CHECK (stage IN (
    'REQUEST', 'REQUIREMENT', 'PLAN', 'IMPLEMENT', 'TEST', 'QA',
    'APPROVAL_BOUNDARY', 'RELEASE_PREPARATION', 'SIMULATED_DEPLOYMENT',
    'VERIFICATION', 'VERIFIED'
  )),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'WAITING_APPROVAL', 'VERIFIED')),
  production_authorized boolean NOT NULL DEFAULT false CHECK (production_authorized = false),
  release_id uuid REFERENCES delivery.releases(id),
  deployment_id uuid REFERENCES delivery.deployments(id),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, version),
  UNIQUE (id, project_id, task_id, system_id),
  FOREIGN KEY (task_id, project_id) REFERENCES work.tasks(id, project_id)
);

CREATE TABLE integration.pilot_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id text NOT NULL,
  evidence_ref text NOT NULL CHECK (length(trim(evidence_ref)) > 0),
  source_system_id text NOT NULL REFERENCES integration.domain_systems(id),
  source_record_id text NOT NULL CHECK (length(trim(source_record_id)) > 0),
  project_id uuid NOT NULL REFERENCES core.projects(id),
  task_id uuid NOT NULL,
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  capability text NOT NULL CHECK (capability IN (
    'READ_SYSTEM_STATUS', 'READ_REPOSITORY_STATUS', 'READ_ENVIRONMENT_METADATA',
    'READ_VERSION_METADATA', 'READ_DEPLOYMENT_READINESS'
  )),
  version text NOT NULL CHECK (length(trim(version)) > 0),
  health text NOT NULL CHECK (health IN ('HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'UNKNOWN')),
  environment_name text NOT NULL CHECK (environment_name IN ('PREVIEW', 'STAGING', 'PRODUCTION')),
  deployment_readiness text NOT NULL CHECK (deployment_readiness IN ('READY', 'NOT_READY', 'UNKNOWN')),
  repository_state text CHECK (repository_state IN ('CLEAN', 'DIRTY', 'UNKNOWN')),
  source_commit text,
  observed_at timestamptz NOT NULL,
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pilot_id, evidence_ref),
  FOREIGN KEY (pilot_id, project_id, task_id, source_system_id)
    REFERENCES integration.rbs_admin_pilots(id, project_id, task_id, system_id) ON DELETE RESTRICT,
  FOREIGN KEY (task_id, project_id) REFERENCES work.tasks(id, project_id)
);

CREATE OR REPLACE FUNCTION integration.reject_pilot_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'pilot evidence is immutable';
END;
$$;

CREATE TRIGGER pilot_evidence_reject_update
BEFORE UPDATE ON integration.pilot_evidence
FOR EACH ROW EXECUTE FUNCTION integration.reject_pilot_evidence_mutation();

CREATE TRIGGER pilot_evidence_reject_delete
BEFORE DELETE ON integration.pilot_evidence
FOR EACH ROW EXECUTE FUNCTION integration.reject_pilot_evidence_mutation();
