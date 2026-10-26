CREATE TABLE governance.ai_routing_policy_versions (
  routing_policy_version_id uuid PRIMARY KEY,
  routing_policy_id uuid NOT NULL,
  version bigint NOT NULL CHECK (version > 0),
  supersedes_policy_version_id uuid,
  authority_identifier text NOT NULL
    CHECK (authority_identifier = 'MAOS_GOVERNANCE_ROUTING_POLICY_STEWARD'),
  lifecycle_intent text NOT NULL
    CHECK (lifecycle_intent IN ('DRAFT','ACTIVE','SUPERSEDED','RETIRED')),
  canonical_domain text NOT NULL
    CHECK (canonical_domain IN ('BUSINESS','OPERATIONS','RESEARCH','ANALYTICS','WRITING','DEVELOPMENT','MEMORY')),
  routing_purpose text NOT NULL
    CHECK (routing_purpose IN ('PRIMARY_EXECUTION','INDEPENDENT_REVIEW','ADVERSARIAL_REVIEW')),
  role_class text NOT NULL
    CHECK (role_class IN ('PLANNER','EXECUTOR','RESEARCHER','ANALYST','WRITER','REVIEWER')),
  organization_id uuid REFERENCES core.organizations(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  project_id uuid,
  scope_ref text NOT NULL CHECK (length(trim(scope_ref)) > 0),
  environment text NOT NULL CHECK (environment IN ('DEVELOPMENT','PREVIEW','STAGING','PRODUCTION')),
  required_capability_refs uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  preferred_capability_refs uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  policy_constraints jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(policy_constraints) = 'object'),
  effective_at timestamptz NOT NULL,
  expires_at timestamptz,
  content_fingerprint text NOT NULL CHECK (content_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  created_by_actor_type text NOT NULL CHECK (created_by_actor_type IN ('HUMAN','AGENT','SYSTEM')),
  created_by_actor_id uuid NOT NULL,
  audit_ref uuid NOT NULL REFERENCES audit.audit_records(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_routing_policy_versions_identity_key
    UNIQUE (routing_policy_id, routing_policy_version_id),
  CONSTRAINT ai_routing_policy_versions_number_key
    UNIQUE (routing_policy_id, version),
  CONSTRAINT ai_routing_policy_versions_predecessor_fk
    FOREIGN KEY (routing_policy_id, supersedes_policy_version_id)
    REFERENCES governance.ai_routing_policy_versions(routing_policy_id, routing_policy_version_id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT ai_routing_policy_versions_project_fk
    FOREIGN KEY (organization_id, project_id)
    REFERENCES core.projects(organization_id, id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  CHECK ((organization_id IS NULL AND project_id IS NULL) OR organization_id IS NOT NULL),
  CHECK ((version = 1 AND supersedes_policy_version_id IS NULL)
    OR (version > 1 AND supersedes_policy_version_id IS NOT NULL)),
  CHECK (expires_at IS NULL OR expires_at > effective_at),
  CHECK (
    (routing_purpose = 'PRIMARY_EXECUTION')
    OR (routing_purpose IN ('INDEPENDENT_REVIEW','ADVERSARIAL_REVIEW') AND role_class = 'REVIEWER')
  )
);

CREATE TABLE governance.ai_routing_policy_activation_events (
  routing_policy_activation_event_id uuid PRIMARY KEY,
  routing_policy_id uuid NOT NULL,
  routing_policy_version_id uuid NOT NULL,
  applicability_fingerprint text NOT NULL CHECK (applicability_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  selection_sequence bigint NOT NULL CHECK (selection_sequence > 0),
  event_type text NOT NULL CHECK (event_type IN ('ACTIVATE','SUPERSEDE','RETIRE')),
  supersedes_activation_event_id uuid REFERENCES governance.ai_routing_policy_activation_events(routing_policy_activation_event_id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  actor_type text NOT NULL CHECK (actor_type IN ('HUMAN','AGENT','SYSTEM')),
  actor_id uuid NOT NULL,
  reason_code text NOT NULL CHECK (length(trim(reason_code)) > 0),
  evidence_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  audit_ref uuid NOT NULL REFERENCES audit.audit_records(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_routing_policy_activation_events_policy_fk
    FOREIGN KEY (routing_policy_id, routing_policy_version_id)
    REFERENCES governance.ai_routing_policy_versions(routing_policy_id, routing_policy_version_id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT ai_routing_policy_activation_events_sequence_key
    UNIQUE (applicability_fingerprint, selection_sequence),
  CHECK ((selection_sequence = 1 AND supersedes_activation_event_id IS NULL AND event_type = 'ACTIVATE')
    OR (selection_sequence > 1 AND supersedes_activation_event_id IS NOT NULL))
);

CREATE TABLE governance.ai_routing_specialization_versions (
  specialization_version_id uuid PRIMARY KEY,
  specialization_id uuid NOT NULL,
  version bigint NOT NULL CHECK (version > 0),
  supersedes_specialization_version_id uuid,
  routing_policy_version_id uuid NOT NULL
    REFERENCES governance.ai_routing_policy_versions(routing_policy_version_id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  lifecycle text NOT NULL
    CHECK (lifecycle IN ('DRAFT','ACTIVE','SUPERSEDED','RETIRED')),
  specialization_key text NOT NULL CHECK (specialization_key ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'),
  canonical_domain text NOT NULL
    CHECK (canonical_domain IN ('BUSINESS','OPERATIONS','RESEARCH','ANALYTICS','WRITING','DEVELOPMENT','MEMORY')),
  routing_purpose text NOT NULL
    CHECK (routing_purpose IN ('PRIMARY_EXECUTION','INDEPENDENT_REVIEW','ADVERSARIAL_REVIEW')),
  scope_ref text NOT NULL CHECK (length(trim(scope_ref)) > 0),
  environment text NOT NULL CHECK (environment IN ('DEVELOPMENT','PREVIEW','STAGING','PRODUCTION')),
  required_capability_refs uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  preferred_capability_refs uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  content_fingerprint text NOT NULL CHECK (content_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  audit_ref uuid NOT NULL REFERENCES audit.audit_records(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_routing_specialization_versions_identity_key
    UNIQUE (specialization_id, specialization_version_id),
  CONSTRAINT ai_routing_specialization_versions_number_key
    UNIQUE (specialization_id, version),
  CONSTRAINT ai_routing_specialization_versions_predecessor_fk
    FOREIGN KEY (specialization_id, supersedes_specialization_version_id)
    REFERENCES governance.ai_routing_specialization_versions(specialization_id, specialization_version_id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  CHECK ((version = 1 AND supersedes_specialization_version_id IS NULL)
    OR (version > 1 AND supersedes_specialization_version_id IS NOT NULL))
);

CREATE TABLE governance.request_routing_decision_streams (
  routing_decision_stream_id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES work.requests(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  routing_purpose text NOT NULL
    CHECK (routing_purpose IN ('PRIMARY_EXECUTION','INDEPENDENT_REVIEW','ADVERSARIAL_REVIEW')),
  created_by_actor_type text NOT NULL CHECK (created_by_actor_type IN ('HUMAN','AGENT','SYSTEM')),
  created_by_actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT request_routing_decision_streams_request_purpose_key
    UNIQUE (request_id, routing_purpose),
  CONSTRAINT request_routing_decision_streams_binding_key
    UNIQUE (routing_decision_stream_id, request_id, routing_purpose)
);

CREATE TABLE governance.request_routing_decision_versions (
  routing_decision_id uuid PRIMARY KEY,
  routing_decision_stream_id uuid NOT NULL,
  request_id uuid NOT NULL,
  routing_purpose text NOT NULL
    CHECK (routing_purpose IN ('PRIMARY_EXECUTION','INDEPENDENT_REVIEW','ADVERSARIAL_REVIEW')),
  routing_version bigint NOT NULL CHECK (routing_version > 0),
  supersedes_routing_decision_id uuid,
  classification_version_id uuid NOT NULL,
  classification_version bigint NOT NULL CHECK (classification_version > 0),
  classification_state text NOT NULL CHECK (classification_state = 'VALIDATED'),
  classification_currentness_state text NOT NULL CHECK (classification_currentness_state = 'CURRENT'),
  classification_currentness_proof text NOT NULL
    CHECK (classification_currentness_proof ~ '^sha256:[a-f0-9]{64}$'),
  classification_policy_resolution_ref uuid NOT NULL,
  classification_policy_resolution_version text NOT NULL
    CHECK (length(trim(classification_policy_resolution_version)) > 0),
  canonical_domain text NOT NULL
    CHECK (canonical_domain IN ('BUSINESS','OPERATIONS','RESEARCH','ANALYTICS','WRITING','DEVELOPMENT','MEMORY')),
  role_class text NOT NULL
    CHECK (role_class IN ('PLANNER','EXECUTOR','RESEARCHER','ANALYST','WRITER','REVIEWER')),
  routing_mode text NOT NULL
    CHECK (routing_mode IN ('PRIMARY_EXECUTION','FALLBACK','INDEPENDENT_REVIEW','ADVERSARIAL_REVIEW')),
  specialization_version_id uuid
    REFERENCES governance.ai_routing_specialization_versions(specialization_version_id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  routing_policy_version_id uuid NOT NULL
    REFERENCES governance.ai_routing_policy_versions(routing_policy_version_id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  provider_id uuid REFERENCES ai.model_providers(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  model_id uuid REFERENCES ai.models(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  runtime_adapter_id uuid REFERENCES ai.host_runtimes(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  model_host_binding_id uuid REFERENCES ai.model_host_bindings(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  registry_snapshot_ref text NOT NULL CHECK (length(trim(registry_snapshot_ref)) > 0),
  registry_snapshot_revision text NOT NULL CHECK (length(trim(registry_snapshot_revision)) > 0),
  registry_observed_at timestamptz NOT NULL,
  registry_fresh_until timestamptz NOT NULL,
  required_capability_refs uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  preferred_capability_refs uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  policy_constraints jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(policy_constraints) = 'object'),
  context_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  artifact_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  evidence_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  priority text NOT NULL CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  human_approval_state text NOT NULL
    CHECK (human_approval_state IN ('NOT_REQUIRED','REQUIRED_MISSING','APPROVED','REJECTED','EXPIRED','REVOKED','STALE','CONSUMED')),
  human_approval_ref uuid,
  human_approval_target_version text,
  human_approval_target_hash text,
  human_approval_authority text,
  human_approval_checked_at timestamptz,
  human_approval_expires_at timestamptz,
  development_delegation_state text NOT NULL
    CHECK (development_delegation_state IN ('NOT_APPLICABLE','READY_TO_DELEGATE','AIDOS_UNAVAILABLE','WAITING_AIDOS_ONBOARDING')),
  aidos_project_ref text,
  aidos_required_capability_refs uuid[],
  aidos_authority_revision text,
  aidos_checked_at timestamptz,
  aidos_fresh_until timestamptz,
  decision_state text NOT NULL CHECK (decision_state IN ('SELECTED','DENIED','WAITING')),
  decision_reason_codes text[] NOT NULL CHECK (cardinality(decision_reason_codes) > 0),
  staleness_state text NOT NULL
    CHECK (staleness_state IN ('CURRENT','STALE_CLASSIFICATION','STALE_POLICY','STALE_REGISTRY','STALE_APPROVAL','STALE_AIDOS','CONFLICTING')),
  classification_checked_at timestamptz NOT NULL,
  policy_checked_at timestamptz NOT NULL,
  policy_fresh_until timestamptz NOT NULL,
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  canonical_intent_fingerprint text NOT NULL CHECK (canonical_intent_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  causation_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  audit_ref uuid NOT NULL REFERENCES audit.audit_records(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT request_routing_decision_versions_stream_decision_key
    UNIQUE (routing_decision_stream_id, routing_decision_id),
  CONSTRAINT request_routing_decision_versions_stream_version_key
    UNIQUE (routing_decision_stream_id, routing_version),
  CONSTRAINT request_routing_decision_versions_idempotency_key
    UNIQUE (request_id, idempotency_key),
  CONSTRAINT request_routing_decision_versions_stream_fk
    FOREIGN KEY (routing_decision_stream_id, request_id, routing_purpose)
    REFERENCES governance.request_routing_decision_streams(routing_decision_stream_id, request_id, routing_purpose)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT request_routing_decision_versions_predecessor_fk
    FOREIGN KEY (routing_decision_stream_id, supersedes_routing_decision_id)
    REFERENCES governance.request_routing_decision_versions(routing_decision_stream_id, routing_decision_id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT request_routing_decision_versions_classification_fk
    FOREIGN KEY (request_id, classification_version_id)
    REFERENCES governance.request_classification_versions(request_id, classification_id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT request_routing_decision_versions_approval_fk
    FOREIGN KEY (human_approval_ref, human_approval_target_version, human_approval_target_hash)
    REFERENCES governance.approvals(id, target_version, target_hash)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  CHECK ((routing_version = 1 AND supersedes_routing_decision_id IS NULL)
    OR (routing_version > 1 AND supersedes_routing_decision_id IS NOT NULL)),
  CHECK (
    (routing_purpose = 'PRIMARY_EXECUTION' AND routing_mode IN ('PRIMARY_EXECUTION','FALLBACK'))
    OR (routing_purpose = 'INDEPENDENT_REVIEW' AND routing_mode = 'INDEPENDENT_REVIEW' AND role_class = 'REVIEWER')
    OR (routing_purpose = 'ADVERSARIAL_REVIEW' AND routing_mode = 'ADVERSARIAL_REVIEW' AND role_class = 'REVIEWER')
  ),
  CHECK (
    (provider_id IS NULL AND model_id IS NULL AND runtime_adapter_id IS NULL
      AND model_host_binding_id IS NULL)
    OR (provider_id IS NOT NULL AND model_id IS NOT NULL AND runtime_adapter_id IS NOT NULL
      AND model_host_binding_id IS NOT NULL)
  ),
  CHECK (
    canonical_domain = 'DEVELOPMENT'
    OR (decision_state = 'SELECTED' AND provider_id IS NOT NULL)
    OR (decision_state IN ('DENIED','WAITING') AND provider_id IS NULL)
  ),
  CHECK (
    (human_approval_state IN ('NOT_REQUIRED','REQUIRED_MISSING')
      AND human_approval_ref IS NULL AND human_approval_target_version IS NULL
      AND human_approval_target_hash IS NULL AND human_approval_authority IS NULL
      AND human_approval_checked_at IS NULL AND human_approval_expires_at IS NULL)
    OR
    (human_approval_state IN ('APPROVED','REJECTED','EXPIRED','REVOKED','STALE','CONSUMED')
      AND human_approval_ref IS NOT NULL AND human_approval_target_version IS NOT NULL
      AND human_approval_target_hash IS NOT NULL AND length(trim(human_approval_authority)) > 0
      AND human_approval_checked_at IS NOT NULL)
  ),
  CHECK (human_approval_expires_at IS NULL OR human_approval_expires_at > human_approval_checked_at),
  CHECK (
    (canonical_domain = 'DEVELOPMENT'
      AND provider_id IS NULL AND model_id IS NULL
      AND runtime_adapter_id IS NULL AND model_host_binding_id IS NULL
      AND development_delegation_state IN ('READY_TO_DELEGATE','AIDOS_UNAVAILABLE','WAITING_AIDOS_ONBOARDING')
      AND aidos_project_ref IS NOT NULL AND aidos_required_capability_refs IS NOT NULL
      AND aidos_authority_revision IS NOT NULL AND aidos_checked_at IS NOT NULL
      AND aidos_fresh_until IS NOT NULL)
    OR
    (canonical_domain <> 'DEVELOPMENT'
      AND development_delegation_state = 'NOT_APPLICABLE'
      AND aidos_project_ref IS NULL AND aidos_required_capability_refs IS NULL
      AND aidos_authority_revision IS NULL AND aidos_checked_at IS NULL
      AND aidos_fresh_until IS NULL)
  ),
  CHECK (registry_fresh_until > registry_observed_at),
  CHECK (policy_fresh_until > policy_checked_at),
  CHECK (aidos_fresh_until IS NULL OR aidos_fresh_until > aidos_checked_at)
);

CREATE TABLE governance.request_routing_candidate_snapshots (
  candidate_snapshot_id uuid PRIMARY KEY,
  routing_decision_id uuid NOT NULL
    REFERENCES governance.request_routing_decision_versions(routing_decision_id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  deterministic_rank integer NOT NULL CHECK (deterministic_rank > 0),
  provider_id uuid NOT NULL REFERENCES ai.model_providers(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  model_id uuid NOT NULL REFERENCES ai.models(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  runtime_adapter_id uuid NOT NULL REFERENCES ai.host_runtimes(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  model_host_binding_id uuid NOT NULL REFERENCES ai.model_host_bindings(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
  eligibility_state text NOT NULL CHECK (eligibility_state IN ('ELIGIBLE','EXCLUDED')),
  reason_codes text[] NOT NULL CHECK (cardinality(reason_codes) > 0),
  capability_evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(capability_evidence) = 'object'),
  ranking_evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(ranking_evidence) = 'object'),
  registry_snapshot_ref text NOT NULL CHECK (length(trim(registry_snapshot_ref)) > 0),
  registry_snapshot_revision text NOT NULL CHECK (length(trim(registry_snapshot_revision)) > 0),
  observed_at timestamptz NOT NULL,
  fresh_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT request_routing_candidate_snapshots_rank_key
    UNIQUE (routing_decision_id, deterministic_rank),
  CONSTRAINT request_routing_candidate_snapshots_binding_key
    UNIQUE (routing_decision_id, model_host_binding_id),
  CHECK (fresh_until > observed_at)
);

CREATE INDEX ai_routing_policy_versions_applicability_idx
  ON governance.ai_routing_policy_versions
    (canonical_domain, routing_purpose, role_class, environment, effective_at);
CREATE INDEX ai_routing_policy_versions_head_idx
  ON governance.ai_routing_policy_versions (routing_policy_id, version DESC);
CREATE INDEX ai_routing_policy_activation_events_head_idx
  ON governance.ai_routing_policy_activation_events (applicability_fingerprint, selection_sequence DESC);
CREATE INDEX ai_routing_policy_activation_events_policy_idx
  ON governance.ai_routing_policy_activation_events (routing_policy_id, routing_policy_version_id);
CREATE INDEX ai_routing_policy_activation_events_prior_idx
  ON governance.ai_routing_policy_activation_events (supersedes_activation_event_id);
CREATE INDEX ai_routing_specialization_versions_policy_idx
  ON governance.ai_routing_specialization_versions (routing_policy_version_id, specialization_key);
CREATE INDEX ai_routing_specialization_versions_head_idx
  ON governance.ai_routing_specialization_versions (specialization_id, version DESC);
CREATE INDEX request_routing_decision_versions_head_idx
  ON governance.request_routing_decision_versions (routing_decision_stream_id, routing_version DESC);
CREATE INDEX request_routing_decision_versions_request_purpose_idx
  ON governance.request_routing_decision_versions (request_id, routing_purpose);
CREATE INDEX request_routing_decision_versions_classification_idx
  ON governance.request_routing_decision_versions (request_id, classification_version_id);
CREATE INDEX request_routing_decision_versions_policy_idx
  ON governance.request_routing_decision_versions (routing_policy_version_id);
CREATE INDEX request_routing_decision_versions_selected_resource_idx
  ON governance.request_routing_decision_versions (model_host_binding_id);
CREATE INDEX request_routing_decision_versions_approval_idx
  ON governance.request_routing_decision_versions (human_approval_ref);
CREATE INDEX request_routing_decision_versions_state_idx
  ON governance.request_routing_decision_versions
    (decision_state, staleness_state, classification_currentness_state, registry_fresh_until, policy_fresh_until);
CREATE INDEX request_routing_candidate_snapshots_decision_rank_idx
  ON governance.request_routing_candidate_snapshots (routing_decision_id, deterministic_rank);
CREATE INDEX request_routing_candidate_snapshots_binding_idx
  ON governance.request_routing_candidate_snapshots (model_host_binding_id);
CREATE INDEX request_routing_candidate_snapshots_eligibility_idx
  ON governance.request_routing_candidate_snapshots (eligibility_state);
CREATE INDEX request_routing_candidate_snapshots_registry_idx
  ON governance.request_routing_candidate_snapshots (registry_snapshot_ref, registry_snapshot_revision);

CREATE FUNCTION governance.reject_phase15d_routing_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PHASE15D_ROUTING_APPEND_ONLY';
END;
$$;

CREATE FUNCTION governance.guard_routing_policy_append()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE predecessor_version bigint;
DECLARE predecessor_lifecycle text;
BEGIN
  IF array_position(NEW.required_capability_refs, NULL) IS NOT NULL
    OR array_position(NEW.preferred_capability_refs, NULL) IS NOT NULL
    OR cardinality(NEW.required_capability_refs) <> (
      SELECT count(DISTINCT capability_ref) FROM unnest(NEW.required_capability_refs) capability_ref
    )
    OR cardinality(NEW.preferred_capability_refs) <> (
      SELECT count(DISTINCT capability_ref) FROM unnest(NEW.preferred_capability_refs) capability_ref
    ) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ROUTING_POLICY_CAPABILITY_REFS_INVALID';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.routing_policy_id::text, 0));
  IF NEW.version = 1 THEN
    IF EXISTS (
      SELECT 1 FROM governance.ai_routing_policy_versions
      WHERE routing_policy_id = NEW.routing_policy_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ROUTING_POLICY_VERSION_CONFLICT';
    END IF;
  ELSE
    SELECT version, lifecycle_intent INTO predecessor_version, predecessor_lifecycle
    FROM governance.ai_routing_policy_versions
    WHERE routing_policy_id = NEW.routing_policy_id
      AND routing_policy_version_id = NEW.supersedes_policy_version_id;
    IF predecessor_version IS NULL OR predecessor_version <> NEW.version - 1
      OR predecessor_lifecycle = 'RETIRED' THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ROUTING_POLICY_PREDECESSOR_INVALID';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION governance.guard_routing_policy_activation_append()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior_event governance.ai_routing_policy_activation_events%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.applicability_fingerprint, 0));
  IF NEW.selection_sequence = 1 THEN
    IF EXISTS (
      SELECT 1 FROM governance.ai_routing_policy_activation_events
      WHERE applicability_fingerprint = NEW.applicability_fingerprint
    ) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ROUTING_POLICY_ACTIVATION_CONFLICT';
    END IF;
  ELSE
    SELECT * INTO prior_event
    FROM governance.ai_routing_policy_activation_events
    WHERE routing_policy_activation_event_id = NEW.supersedes_activation_event_id;
    IF NOT FOUND
      OR prior_event.applicability_fingerprint <> NEW.applicability_fingerprint
      OR prior_event.selection_sequence <> NEW.selection_sequence - 1 THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ROUTING_POLICY_ACTIVATION_PREDECESSOR_INVALID';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION governance.guard_routing_specialization_append()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE predecessor_version bigint;
DECLARE predecessor_lifecycle text;
BEGIN
  IF array_position(NEW.required_capability_refs, NULL) IS NOT NULL
    OR array_position(NEW.preferred_capability_refs, NULL) IS NOT NULL
    OR cardinality(NEW.required_capability_refs) <> (
      SELECT count(DISTINCT capability_ref) FROM unnest(NEW.required_capability_refs) capability_ref
    )
    OR cardinality(NEW.preferred_capability_refs) <> (
      SELECT count(DISTINCT capability_ref) FROM unnest(NEW.preferred_capability_refs) capability_ref
    ) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ROUTING_SPECIALIZATION_CAPABILITY_REFS_INVALID';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.specialization_id::text, 0));
  IF NEW.version = 1 THEN
    IF EXISTS (
      SELECT 1 FROM governance.ai_routing_specialization_versions
      WHERE specialization_id = NEW.specialization_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ROUTING_SPECIALIZATION_VERSION_CONFLICT';
    END IF;
  ELSE
    SELECT version, lifecycle INTO predecessor_version, predecessor_lifecycle
    FROM governance.ai_routing_specialization_versions
    WHERE specialization_id = NEW.specialization_id
      AND specialization_version_id = NEW.supersedes_specialization_version_id;
    IF predecessor_version IS NULL OR predecessor_version <> NEW.version - 1
      OR predecessor_lifecycle = 'RETIRED' THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ROUTING_SPECIALIZATION_PREDECESSOR_INVALID';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION governance.guard_routing_decision_append()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE predecessor_version bigint;
DECLARE binding_model_id uuid;
DECLARE binding_host_id uuid;
DECLARE model_provider_id uuid;
DECLARE host_provider_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.routing_decision_stream_id::text, 0));
  IF NEW.routing_version = 1 THEN
    IF EXISTS (
      SELECT 1 FROM governance.request_routing_decision_versions
      WHERE routing_decision_stream_id = NEW.routing_decision_stream_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ROUTING_DECISION_VERSION_CONFLICT';
    END IF;
  ELSE
    SELECT routing_version INTO predecessor_version
    FROM governance.request_routing_decision_versions
    WHERE routing_decision_stream_id = NEW.routing_decision_stream_id
      AND routing_decision_id = NEW.supersedes_routing_decision_id;
    IF predecessor_version IS NULL OR predecessor_version <> NEW.routing_version - 1 THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ROUTING_DECISION_PREDECESSOR_INVALID';
    END IF;
  END IF;

  IF NEW.model_host_binding_id IS NOT NULL THEN
    SELECT model_id, host_id INTO binding_model_id, binding_host_id
    FROM ai.model_host_bindings WHERE id = NEW.model_host_binding_id;
    SELECT provider_id INTO model_provider_id FROM ai.models WHERE id = NEW.model_id;
    SELECT provider_id INTO host_provider_id FROM ai.host_runtimes WHERE id = NEW.runtime_adapter_id;
    IF binding_model_id IS DISTINCT FROM NEW.model_id
      OR binding_host_id IS DISTINCT FROM NEW.runtime_adapter_id
      OR model_provider_id IS DISTINCT FROM NEW.provider_id
      OR (host_provider_id IS NOT NULL AND host_provider_id IS DISTINCT FROM NEW.provider_id) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ROUTING_REGISTRY_TUPLE_INVALID';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION governance.guard_routing_candidate_append()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE binding_model_id uuid;
DECLARE binding_host_id uuid;
DECLARE model_provider_id uuid;
DECLARE host_provider_id uuid;
BEGIN
  SELECT model_id, host_id INTO binding_model_id, binding_host_id
  FROM ai.model_host_bindings WHERE id = NEW.model_host_binding_id;
  SELECT provider_id INTO model_provider_id FROM ai.models WHERE id = NEW.model_id;
  SELECT provider_id INTO host_provider_id FROM ai.host_runtimes WHERE id = NEW.runtime_adapter_id;
  IF binding_model_id IS DISTINCT FROM NEW.model_id
    OR binding_host_id IS DISTINCT FROM NEW.runtime_adapter_id
    OR model_provider_id IS DISTINCT FROM NEW.provider_id
    OR (host_provider_id IS NOT NULL AND host_provider_id IS DISTINCT FROM NEW.provider_id) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ROUTING_CANDIDATE_REGISTRY_TUPLE_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_routing_policy_versions_guard_insert
BEFORE INSERT ON governance.ai_routing_policy_versions
FOR EACH ROW EXECUTE FUNCTION governance.guard_routing_policy_append();
CREATE TRIGGER ai_routing_policy_activation_events_guard_insert
BEFORE INSERT ON governance.ai_routing_policy_activation_events
FOR EACH ROW EXECUTE FUNCTION governance.guard_routing_policy_activation_append();
CREATE TRIGGER ai_routing_specialization_versions_guard_insert
BEFORE INSERT ON governance.ai_routing_specialization_versions
FOR EACH ROW EXECUTE FUNCTION governance.guard_routing_specialization_append();
CREATE TRIGGER request_routing_decision_versions_guard_insert
BEFORE INSERT ON governance.request_routing_decision_versions
FOR EACH ROW EXECUTE FUNCTION governance.guard_routing_decision_append();
CREATE TRIGGER request_routing_candidate_snapshots_guard_insert
BEFORE INSERT ON governance.request_routing_candidate_snapshots
FOR EACH ROW EXECUTE FUNCTION governance.guard_routing_candidate_append();

CREATE TRIGGER ai_routing_policy_versions_reject_update
BEFORE UPDATE OR DELETE ON governance.ai_routing_policy_versions
FOR EACH ROW EXECUTE FUNCTION governance.reject_phase15d_routing_mutation();
CREATE TRIGGER ai_routing_policy_activation_events_reject_update
BEFORE UPDATE OR DELETE ON governance.ai_routing_policy_activation_events
FOR EACH ROW EXECUTE FUNCTION governance.reject_phase15d_routing_mutation();
CREATE TRIGGER ai_routing_specialization_versions_reject_update
BEFORE UPDATE OR DELETE ON governance.ai_routing_specialization_versions
FOR EACH ROW EXECUTE FUNCTION governance.reject_phase15d_routing_mutation();
CREATE TRIGGER request_routing_decision_streams_reject_update
BEFORE UPDATE OR DELETE ON governance.request_routing_decision_streams
FOR EACH ROW EXECUTE FUNCTION governance.reject_phase15d_routing_mutation();
CREATE TRIGGER request_routing_decision_versions_reject_update
BEFORE UPDATE OR DELETE ON governance.request_routing_decision_versions
FOR EACH ROW EXECUTE FUNCTION governance.reject_phase15d_routing_mutation();
CREATE TRIGGER request_routing_candidate_snapshots_reject_update
BEFORE UPDATE OR DELETE ON governance.request_routing_candidate_snapshots
FOR EACH ROW EXECUTE FUNCTION governance.reject_phase15d_routing_mutation();

REVOKE ALL ON governance.ai_routing_policy_versions FROM PUBLIC;
REVOKE ALL ON governance.ai_routing_policy_activation_events FROM PUBLIC;
REVOKE ALL ON governance.ai_routing_specialization_versions FROM PUBLIC;
REVOKE ALL ON governance.request_routing_decision_streams FROM PUBLIC;
REVOKE ALL ON governance.request_routing_decision_versions FROM PUBLIC;
REVOKE ALL ON governance.request_routing_candidate_snapshots FROM PUBLIC;
