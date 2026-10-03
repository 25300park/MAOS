ALTER TABLE ai.domain_execution_constraints
  ADD COLUMN routing_disposition text,
  ADD COLUMN target_kind text,
  ADD COLUMN target_ref text,
  ADD COLUMN target_version text,
  ADD COLUMN policy_evidence_ref text,
  ADD CONSTRAINT domain_execution_constraints_id_policy_version_key
    UNIQUE (id, policy_version),
  ADD CONSTRAINT domain_execution_constraints_routing_disposition_check
    CHECK (routing_disposition IN ('MAOS_NATIVE','DELEGATE_TO_AIDOS','DELEGATE_TO_DOMAIN_SYSTEM','PROHIBITED','REQUIRE_HUMAN_REVIEW')),
  ADD CONSTRAINT domain_execution_constraints_target_kind_check
    CHECK (target_kind IS NULL OR target_kind IN ('AIDOS','DOMAIN_SYSTEM'));

ALTER TABLE ai.domain_execution_constraints
  DISABLE TRIGGER domain_execution_constraints_guard_development;

UPDATE ai.domain_execution_constraints
   SET routing_disposition = CASE execution_mode
         WHEN 'MAOS_NATIVE' THEN 'MAOS_NATIVE'
         WHEN 'DELEGATE_TO_AIDOS' THEN 'DELEGATE_TO_AIDOS'
         ELSE 'PROHIBITED'
       END,
       target_kind = CASE WHEN domain_key='DEVELOPMENT' THEN 'AIDOS' END,
       target_ref = CASE WHEN domain_key='DEVELOPMENT' THEN 'authority://aidos/development' END,
       target_version = CASE WHEN domain_key='DEVELOPMENT' THEN 'MAOS-031' END;

ALTER TABLE ai.domain_execution_constraints
  ENABLE TRIGGER domain_execution_constraints_guard_development;

ALTER TABLE ai.domain_execution_constraints
  ALTER COLUMN routing_disposition SET NOT NULL,
  ADD CONSTRAINT domain_execution_constraints_target_consistency_check CHECK (
    (routing_disposition IN ('DELEGATE_TO_AIDOS','DELEGATE_TO_DOMAIN_SYSTEM')
      AND target_kind IS NOT NULL AND length(trim(target_ref)) > 0
      AND length(trim(target_version)) > 0)
    OR
    (routing_disposition IN ('MAOS_NATIVE','PROHIBITED','REQUIRE_HUMAN_REVIEW')
      AND target_kind IS NULL AND target_ref IS NULL AND target_version IS NULL)
  );

CREATE TABLE work.requests (
  id uuid PRIMARY KEY,
  source_system text NOT NULL CHECK (length(trim(source_system)) > 0),
  source_type text NOT NULL CHECK (length(trim(source_type)) > 0),
  source_ref text NOT NULL CHECK (length(trim(source_ref)) > 0),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  project_id uuid NOT NULL,
  company_scope_ref text NOT NULL CHECK (length(trim(company_scope_ref)) > 0),
  team_scope_ref text CHECK (team_scope_ref IS NULL OR length(trim(team_scope_ref)) > 0),
  project_scope_ref text NOT NULL CHECK (length(trim(project_scope_ref)) > 0),
  system_scope_ref text CHECK (system_scope_ref IS NULL OR length(trim(system_scope_ref)) > 0),
  environment text NOT NULL CHECK (environment IN ('DEVELOPMENT','PREVIEW','STAGING','PRODUCTION')),
  lifecycle_state text NOT NULL DEFAULT 'REGISTERED' CHECK (lifecycle_state IN ('REGISTERED','INVALIDATED')),
  registered_by_actor_type text NOT NULL CHECK (registered_by_actor_type IN ('HUMAN','AGENT','SYSTEM')),
  registered_by_actor_id uuid NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  invalidated_by_actor_type text CHECK (invalidated_by_actor_type IS NULL OR invalidated_by_actor_type IN ('HUMAN','AGENT','SYSTEM')),
  invalidated_by_actor_id uuid,
  invalidation_reason_code text,
  invalidated_at timestamptz,
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  input_fingerprint text NOT NULL CHECK (input_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  causation_ref text,
  registration_audit_ref uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source_system, source_type, source_ref),
  UNIQUE (organization_id, project_id, idempotency_key),
  FOREIGN KEY (organization_id, project_id) REFERENCES core.projects(organization_id, id),
  CHECK (updated_at >= created_at),
  CHECK (
    (lifecycle_state='REGISTERED' AND invalidated_by_actor_type IS NULL
      AND invalidated_by_actor_id IS NULL AND invalidation_reason_code IS NULL
      AND invalidated_at IS NULL)
    OR
    (lifecycle_state='INVALIDATED' AND invalidated_by_actor_type IS NOT NULL
      AND invalidated_by_actor_id IS NOT NULL AND length(trim(invalidation_reason_code)) > 0
      AND invalidated_at IS NOT NULL)
  )
);

CREATE INDEX requests_context_lifecycle_idx
  ON work.requests (organization_id, project_id, environment, lifecycle_state);
CREATE INDEX requests_project_lifecycle_registered_idx
  ON work.requests (project_id, lifecycle_state, registered_at);

CREATE FUNCTION work.guard_request_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='WORK_REQUEST_DELETE_FORBIDDEN';
  END IF;
  IF OLD.lifecycle_state='INVALIDATED' THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='WORK_REQUEST_INVALIDATED_TERMINAL';
  END IF;
  IF NEW.lifecycle_state <> 'INVALIDATED'
     OR OLD.id IS DISTINCT FROM NEW.id
     OR OLD.source_system IS DISTINCT FROM NEW.source_system
     OR OLD.source_type IS DISTINCT FROM NEW.source_type
     OR OLD.source_ref IS DISTINCT FROM NEW.source_ref
     OR OLD.source_fingerprint IS DISTINCT FROM NEW.source_fingerprint
     OR OLD.organization_id IS DISTINCT FROM NEW.organization_id
     OR OLD.project_id IS DISTINCT FROM NEW.project_id
     OR OLD.company_scope_ref IS DISTINCT FROM NEW.company_scope_ref
     OR OLD.team_scope_ref IS DISTINCT FROM NEW.team_scope_ref
     OR OLD.project_scope_ref IS DISTINCT FROM NEW.project_scope_ref
     OR OLD.system_scope_ref IS DISTINCT FROM NEW.system_scope_ref
     OR OLD.environment IS DISTINCT FROM NEW.environment
     OR OLD.registered_by_actor_type IS DISTINCT FROM NEW.registered_by_actor_type
     OR OLD.registered_by_actor_id IS DISTINCT FROM NEW.registered_by_actor_id
     OR OLD.registered_at IS DISTINCT FROM NEW.registered_at
     OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
     OR OLD.input_fingerprint IS DISTINCT FROM NEW.input_fingerprint
     OR OLD.correlation_id IS DISTINCT FROM NEW.correlation_id
     OR OLD.causation_ref IS DISTINCT FROM NEW.causation_ref
     OR OLD.registration_audit_ref IS DISTINCT FROM NEW.registration_audit_ref
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='WORK_REQUEST_IMMUTABLE';
  END IF;
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER requests_guard_mutation
BEFORE UPDATE OR DELETE ON work.requests
FOR EACH ROW EXECUTE FUNCTION work.guard_request_mutation();

CREATE TABLE governance.request_classification_versions (
  classification_id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES work.requests(id) ON DELETE NO ACTION,
  task_id uuid REFERENCES work.tasks(id) ON DELETE NO ACTION,
  version bigint NOT NULL CHECK (version > 0),
  supersedes_classification_id uuid REFERENCES governance.request_classification_versions(classification_id) ON DELETE NO ACTION,
  domain_key text NOT NULL CHECK (domain_key IN ('BUSINESS','OPERATIONS','RESEARCH','ANALYTICS','WRITING','DEVELOPMENT','MEMORY')),
  subdomain_key text,
  classification_state text NOT NULL CHECK (classification_state IN ('PROPOSED','VALIDATED','REJECTED','STALE')),
  source text NOT NULL CHECK (source IN ('DETERMINISTIC_POLICY','AI_ASSISTED','HUMAN_OVERRIDE')),
  routing_disposition text NOT NULL CHECK (routing_disposition IN ('MAOS_NATIVE','DELEGATE_TO_AIDOS','DELEGATE_TO_DOMAIN_SYSTEM','PROHIBITED','REQUIRE_HUMAN_REVIEW')),
  reason_code text NOT NULL CHECK (length(trim(reason_code)) > 0),
  requested_role_class text,
  required_capability_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  preferred_capability_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  policy_constraint_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  context_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  artifact_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  evidence_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  priority_class text NOT NULL DEFAULT 'NORMAL' CHECK (priority_class IN ('LOW','NORMAL','HIGH','URGENT')),
  intent_class_ref text,
  intent_snapshot_hash text CHECK (intent_snapshot_hash IS NULL OR intent_snapshot_hash ~ '^sha256:[a-f0-9]{64}$'),
  risk_class_ref text,
  risk_snapshot_hash text CHECK (risk_snapshot_hash IS NULL OR risk_snapshot_hash ~ '^sha256:[a-f0-9]{64}$'),
  confidence_class text CHECK (confidence_class IS NULL OR confidence_class IN ('HIGH','MEDIUM','LOW','UNKNOWN')),
  validator_rule_ref text,
  validator_rule_version text,
  policy_resolution_ref uuid,
  policy_resolution_version text,
  created_by_actor_type text NOT NULL CHECK (created_by_actor_type IN ('HUMAN','AGENT','SYSTEM')),
  created_by_actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  validated_at timestamptz,
  stale_at timestamptz,
  canonical_payload_fingerprint text NOT NULL CHECK (canonical_payload_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  causation_ref text,
  audit_ref uuid NOT NULL,
  UNIQUE (request_id, version),
  UNIQUE (request_id, idempotency_key),
  UNIQUE (request_id, classification_id),
  FOREIGN KEY (request_id, supersedes_classification_id)
    REFERENCES governance.request_classification_versions(request_id, classification_id),
  FOREIGN KEY (policy_resolution_ref, policy_resolution_version)
    REFERENCES ai.domain_execution_constraints(id, policy_version),
  CHECK ((version=1 AND supersedes_classification_id IS NULL) OR (version>1 AND supersedes_classification_id IS NOT NULL)),
  CHECK (
    (classification_state='VALIDATED' AND validated_at IS NOT NULL AND stale_at IS NULL
      AND policy_resolution_ref IS NOT NULL AND policy_resolution_version IS NOT NULL)
    OR (classification_state='STALE' AND stale_at IS NOT NULL AND validated_at IS NULL
      AND policy_resolution_ref IS NULL AND policy_resolution_version IS NULL)
    OR (classification_state IN ('PROPOSED','REJECTED') AND validated_at IS NULL AND stale_at IS NULL
      AND policy_resolution_ref IS NULL AND policy_resolution_version IS NULL)
  ),
  CHECK (source='AI_ASSISTED' OR confidence_class IS NULL),
  CHECK (domain_key<>'DEVELOPMENT' OR routing_disposition='DELEGATE_TO_AIDOS')
);

CREATE INDEX request_classification_versions_head_idx
  ON governance.request_classification_versions (request_id, version DESC);
CREATE INDEX request_classification_versions_task_idx
  ON governance.request_classification_versions (task_id);
CREATE INDEX request_classification_versions_state_idx
  ON governance.request_classification_versions (domain_key, classification_state);
CREATE INDEX request_classification_versions_policy_idx
  ON governance.request_classification_versions (policy_resolution_ref, policy_resolution_version);

CREATE FUNCTION governance.guard_request_classification_append()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE predecessor governance.request_classification_versions%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REQUEST_CLASSIFICATION_APPEND_ONLY';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.request_id::text, 0));
  IF NEW.version=1 THEN
    IF EXISTS (SELECT 1 FROM governance.request_classification_versions WHERE request_id=NEW.request_id) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REQUEST_CLASSIFICATION_VERSION_CONFLICT';
    END IF;
  ELSE
    SELECT * INTO predecessor FROM governance.request_classification_versions
     WHERE classification_id=NEW.supersedes_classification_id AND request_id=NEW.request_id;
    IF NOT FOUND OR predecessor.version <> NEW.version-1
       OR EXISTS (SELECT 1 FROM governance.request_classification_versions WHERE request_id=NEW.request_id AND version>=NEW.version) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REQUEST_CLASSIFICATION_PREDECESSOR_INVALID';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER request_classification_versions_guard_insert
BEFORE INSERT ON governance.request_classification_versions
FOR EACH ROW EXECUTE FUNCTION governance.guard_request_classification_append();

CREATE FUNCTION governance.reject_request_classification_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REQUEST_CLASSIFICATION_APPEND_ONLY';
END;
$$;

CREATE TRIGGER request_classification_versions_reject_update
BEFORE UPDATE ON governance.request_classification_versions
FOR EACH ROW EXECUTE FUNCTION governance.reject_request_classification_mutation();
CREATE TRIGGER request_classification_versions_reject_delete
BEFORE DELETE ON governance.request_classification_versions
FOR EACH ROW EXECUTE FUNCTION governance.reject_request_classification_mutation();

REVOKE ALL ON work.requests FROM PUBLIC;
REVOKE ALL ON governance.request_classification_versions FROM PUBLIC;
