CREATE TABLE delivery.artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES core.projects(id),
  artifact_key text NOT NULL,
  build_id text NOT NULL CHECK (length(trim(build_id)) > 0),
  artifact_hash text NOT NULL CHECK (artifact_hash ~ '^sha256:[a-f0-9]{64}$'),
  source_commit text NOT NULL CHECK (length(trim(source_commit)) > 0),
  configuration_versions text[] NOT NULL CHECK (cardinality(configuration_versions) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, artifact_key),
  UNIQUE (id, artifact_hash, source_commit)
);

CREATE TABLE delivery.releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES core.projects(id),
  release_key text NOT NULL,
  version text NOT NULL CHECK (length(trim(version)) > 0),
  artifact_id uuid NOT NULL,
  artifact_hash text NOT NULL CHECK (artifact_hash ~ '^sha256:[a-f0-9]{64}$'),
  source_commit text NOT NULL CHECK (length(trim(source_commit)) > 0),
  rollback_artifact_id uuid NOT NULL REFERENCES delivery.artifacts(id),
  configuration_versions text[] NOT NULL CHECK (cardinality(configuration_versions) > 0),
  development_loop_run_id text NOT NULL CHECK (length(trim(development_loop_run_id)) > 0),
  development_loop_stage text NOT NULL CHECK (development_loop_stage = 'DEPLOY_PREPARATION'),
  author_actor_id uuid NOT NULL,
  reviewer_actor_id uuid NOT NULL,
  qa_reviewer_actor_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'WAITING_APPROVAL', 'READY')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, release_key),
  UNIQUE (project_id, version),
  FOREIGN KEY (artifact_id, artifact_hash, source_commit)
    REFERENCES delivery.artifacts(id, artifact_hash, source_commit),
  CHECK (author_actor_id <> reviewer_actor_id),
  CHECK (author_actor_id <> qa_reviewer_actor_id),
  CHECK (reviewer_actor_id <> qa_reviewer_actor_id)
);

CREATE TABLE delivery.release_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES delivery.releases(id) ON DELETE RESTRICT,
  evidence_ref text NOT NULL CHECK (length(trim(evidence_ref)) > 0),
  kind text NOT NULL CHECK (kind IN ('TEST', 'QA', 'SECURITY', 'ROLLBACK', 'ENVIRONMENT')),
  outcome text NOT NULL CHECK (outcome IN ('PASS', 'FAIL', 'BLOCKED')),
  artifact_hash text NOT NULL CHECK (artifact_hash ~ '^sha256:[a-f0-9]{64}$'),
  source_commit text NOT NULL CHECK (length(trim(source_commit)) > 0),
  environment_name text CHECK (environment_name IN ('DEVELOPMENT', 'PREVIEW', 'STAGING')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (release_id, evidence_ref),
  CHECK (
    (kind = 'ENVIRONMENT' AND environment_name IS NOT NULL)
    OR (kind <> 'ENVIRONMENT' AND environment_name IS NULL)
  )
);

CREATE TABLE delivery.environments (
  name text PRIMARY KEY CHECK (name IN ('DEVELOPMENT', 'PREVIEW', 'STAGING', 'PRODUCTION')),
  health text NOT NULL CHECK (health IN ('HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'MAINTENANCE', 'UNKNOWN')),
  eligible boolean NOT NULL DEFAULT false,
  deployment_mode text NOT NULL CHECK (deployment_mode = 'SIMULATED'),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO delivery.environments (name, health, eligible, deployment_mode)
VALUES
  ('DEVELOPMENT', 'UNKNOWN', false, 'SIMULATED'),
  ('PREVIEW', 'UNKNOWN', false, 'SIMULATED'),
  ('STAGING', 'UNKNOWN', false, 'SIMULATED'),
  ('PRODUCTION', 'UNKNOWN', false, 'SIMULATED')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE delivery.deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES delivery.releases(id),
  environment_name text NOT NULL REFERENCES delivery.environments(name),
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (
    status IN (
      'REQUESTED', 'VALIDATING', 'QUEUED', 'DEPLOYING', 'VERIFYING',
      'SUCCEEDED', 'FAILED', 'ROLLING_BACK', 'ROLLED_BACK', 'CANCELLED'
    )
  ),
  artifact_hash text NOT NULL CHECK (artifact_hash ~ '^sha256:[a-f0-9]{64}$'),
  rollback_artifact_hash text NOT NULL CHECK (rollback_artifact_hash ~ '^sha256:[a-f0-9]{64}$'),
  executor_actor_id uuid NOT NULL,
  approval_id uuid REFERENCES governance.approvals(id),
  approved_by_actor_id uuid,
  timeout_ms integer NOT NULL CHECK (timeout_ms > 0),
  rollback_required boolean NOT NULL DEFAULT false,
  evidence_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  revoked_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((approval_id IS NULL) = (approved_by_actor_id IS NULL))
);

CREATE OR REPLACE FUNCTION delivery.reject_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'release artifacts are immutable';
END;
$$;

CREATE TRIGGER artifacts_reject_update
BEFORE UPDATE ON delivery.artifacts
FOR EACH ROW EXECUTE FUNCTION delivery.reject_artifact_mutation();

CREATE TRIGGER artifacts_reject_delete
BEFORE DELETE ON delivery.artifacts
FOR EACH ROW EXECUTE FUNCTION delivery.reject_artifact_mutation();

CREATE OR REPLACE FUNCTION delivery.protect_release_candidate_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'release candidates cannot be deleted';
  END IF;
  IF OLD.project_id IS DISTINCT FROM NEW.project_id
    OR OLD.release_key IS DISTINCT FROM NEW.release_key
    OR OLD.version IS DISTINCT FROM NEW.version
    OR OLD.artifact_id IS DISTINCT FROM NEW.artifact_id
    OR OLD.artifact_hash IS DISTINCT FROM NEW.artifact_hash
    OR OLD.source_commit IS DISTINCT FROM NEW.source_commit
    OR OLD.rollback_artifact_id IS DISTINCT FROM NEW.rollback_artifact_id
    OR OLD.configuration_versions IS DISTINCT FROM NEW.configuration_versions
    OR OLD.development_loop_run_id IS DISTINCT FROM NEW.development_loop_run_id
    OR OLD.development_loop_stage IS DISTINCT FROM NEW.development_loop_stage
    OR OLD.author_actor_id IS DISTINCT FROM NEW.author_actor_id
    OR OLD.reviewer_actor_id IS DISTINCT FROM NEW.reviewer_actor_id
    OR OLD.qa_reviewer_actor_id IS DISTINCT FROM NEW.qa_reviewer_actor_id
  THEN
    RAISE EXCEPTION 'release candidate identity is immutable';
  END IF;
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER releases_protect_identity
BEFORE UPDATE OR DELETE ON delivery.releases
FOR EACH ROW EXECUTE FUNCTION delivery.protect_release_candidate_identity();
