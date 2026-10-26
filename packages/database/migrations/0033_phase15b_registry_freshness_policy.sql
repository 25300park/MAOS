CREATE TABLE governance.registry_freshness_policy_versions (
  registry_freshness_policy_version_id uuid PRIMARY KEY,
  registry_freshness_policy_id uuid NOT NULL,
  policy_version bigint NOT NULL CHECK (policy_version > 0),
  supersedes_policy_version_id uuid,
  authority_identifier text NOT NULL
    CHECK (authority_identifier = 'MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD'),
  registry_scope text NOT NULL CHECK (registry_scope = 'PHASE15B_AI_REGISTRY'),
  environment text NOT NULL
    CHECK (environment IN ('DEVELOPMENT','PREVIEW','STAGING','PRODUCTION')),
  max_age_ms bigint NOT NULL
    CHECK (max_age_ms > 0 AND max_age_ms <= 9007199254740991),
  lifecycle_intent text NOT NULL
    CHECK (lifecycle_intent IN ('DRAFT','ACTIVE','SUPERSEDED','RETIRED')),
  effective_at timestamptz NOT NULL,
  content_fingerprint text NOT NULL
    CHECK (content_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  created_by_actor_type text NOT NULL
    CHECK (created_by_actor_type IN ('HUMAN','AGENT','SYSTEM')),
  created_by_actor_id uuid NOT NULL,
  reason_code text NOT NULL CHECK (length(trim(reason_code)) > 0),
  evidence_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  audit_ref uuid NOT NULL REFERENCES audit.audit_records(id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT registry_freshness_policy_versions_identity_key
    UNIQUE (registry_freshness_policy_id, registry_freshness_policy_version_id),
  CONSTRAINT registry_freshness_policy_versions_number_key
    UNIQUE (registry_freshness_policy_id, policy_version),
  CONSTRAINT registry_freshness_policy_versions_idempotency_key
    UNIQUE (registry_scope, environment, idempotency_key),
  CONSTRAINT registry_freshness_policy_versions_predecessor_fk
    FOREIGN KEY (registry_freshness_policy_id, supersedes_policy_version_id)
    REFERENCES governance.registry_freshness_policy_versions(
      registry_freshness_policy_id,
      registry_freshness_policy_version_id
    ) ON UPDATE NO ACTION ON DELETE NO ACTION,
  CHECK ((policy_version = 1 AND supersedes_policy_version_id IS NULL)
    OR (policy_version > 1 AND supersedes_policy_version_id IS NOT NULL))
);

CREATE FUNCTION governance.registry_freshness_applicability_fingerprint(
  p_registry_scope text,
  p_environment text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT 'sha256:' || encode(
    sha256(
      convert_to(
        '{"contractVersion":"MAOS_REGISTRY_FRESHNESS_APPLICABILITY_V1","environment":'
          || to_json(p_environment)::text
          || ',"registryScope":'
          || to_json(p_registry_scope)::text
          || '}',
        'UTF8'
      )
    ),
    'hex'
  );
$$;

CREATE TABLE governance.registry_freshness_policy_activation_events (
  registry_freshness_policy_activation_event_id uuid PRIMARY KEY,
  registry_freshness_policy_id uuid NOT NULL,
  registry_freshness_policy_version bigint NOT NULL CHECK (registry_freshness_policy_version > 0),
  registry_scope text NOT NULL CHECK (registry_scope = 'PHASE15B_AI_REGISTRY'),
  environment text NOT NULL
    CHECK (environment IN ('DEVELOPMENT','PREVIEW','STAGING','PRODUCTION')),
  applicability_fingerprint text NOT NULL
    CHECK (applicability_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  selection_sequence bigint NOT NULL CHECK (selection_sequence > 0),
  event_type text NOT NULL CHECK (event_type IN ('ACTIVATE','SUPERSEDE','RETIRE')),
  supersedes_activation_event_id uuid,
  event_fingerprint text NOT NULL
    CHECK (event_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  authority_identifier text NOT NULL
    CHECK (authority_identifier = 'MAOS_GOVERNANCE_REGISTRY_FRESHNESS_POLICY_STEWARD'),
  actor_type text NOT NULL CHECK (actor_type IN ('HUMAN','AGENT','SYSTEM')),
  actor_id uuid NOT NULL,
  reason_code text NOT NULL CHECK (length(trim(reason_code)) > 0),
  evidence_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  audit_ref uuid NOT NULL REFERENCES audit.audit_records(id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT registry_freshness_policy_activation_events_policy_fk
    FOREIGN KEY (registry_freshness_policy_id, registry_freshness_policy_version)
    REFERENCES governance.registry_freshness_policy_versions(
      registry_freshness_policy_id,
      policy_version
    ) ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT registry_freshness_policy_activation_events_predecessor_fk
    FOREIGN KEY (supersedes_activation_event_id)
    REFERENCES governance.registry_freshness_policy_activation_events(
      registry_freshness_policy_activation_event_id
    ) ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT registry_freshness_policy_activation_events_sequence_key
    UNIQUE (applicability_fingerprint, selection_sequence),
  CONSTRAINT registry_freshness_policy_activation_events_scope_sequence_key
    UNIQUE (registry_scope, environment, selection_sequence),
  CONSTRAINT registry_freshness_policy_activation_events_idempotency_key
    UNIQUE (registry_scope, environment, idempotency_key),
  CONSTRAINT registry_freshness_policy_activation_events_applicability_fingerprint_check
    CHECK (
      applicability_fingerprint =
        governance.registry_freshness_applicability_fingerprint(
          registry_scope,
          environment
        )
    ),
  CHECK ((selection_sequence = 1 AND supersedes_activation_event_id IS NULL AND event_type = 'ACTIVATE')
    OR (selection_sequence > 1 AND supersedes_activation_event_id IS NOT NULL))
);

CREATE INDEX registry_freshness_policy_versions_head_idx
  ON governance.registry_freshness_policy_versions
    (registry_freshness_policy_id, policy_version DESC);
CREATE INDEX registry_freshness_policy_versions_applicability_idx
  ON governance.registry_freshness_policy_versions
    (registry_scope, environment, effective_at);
CREATE INDEX registry_freshness_policy_activation_events_head_idx
  ON governance.registry_freshness_policy_activation_events
    (registry_scope, environment, selection_sequence DESC);
CREATE INDEX registry_freshness_policy_activation_events_policy_idx
  ON governance.registry_freshness_policy_activation_events
    (registry_freshness_policy_id, registry_freshness_policy_version);

CREATE FUNCTION governance.reject_registry_freshness_policy_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REGISTRY_FRESHNESS_POLICY_APPEND_ONLY';
END;
$$;

CREATE FUNCTION governance.guard_registry_freshness_policy_append()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE predecessor_version bigint;
DECLARE predecessor_lifecycle text;
DECLARE current_head bigint;
BEGIN
  IF array_position(NEW.evidence_refs, NULL) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REGISTRY_FRESHNESS_POLICY_EVIDENCE_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.registry_freshness_policy_id::text, 0));
  SELECT max(policy_version) INTO current_head
  FROM governance.registry_freshness_policy_versions
  WHERE registry_freshness_policy_id = NEW.registry_freshness_policy_id;

  IF NEW.policy_version = 1 THEN
    IF current_head IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REGISTRY_FRESHNESS_POLICY_VERSION_CONFLICT';
    END IF;
  ELSE
    SELECT policy_version, lifecycle_intent
      INTO predecessor_version, predecessor_lifecycle
    FROM governance.registry_freshness_policy_versions
    WHERE registry_freshness_policy_id = NEW.registry_freshness_policy_id
      AND registry_freshness_policy_version_id = NEW.supersedes_policy_version_id;
    IF predecessor_version IS NULL
      OR predecessor_version <> NEW.policy_version - 1
      OR current_head <> predecessor_version
      OR predecessor_lifecycle = 'RETIRED' THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REGISTRY_FRESHNESS_POLICY_PREDECESSOR_INVALID';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION governance.guard_registry_freshness_policy_activation_append()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected_policy governance.registry_freshness_policy_versions%ROWTYPE;
DECLARE prior_event governance.registry_freshness_policy_activation_events%ROWTYPE;
DECLARE current_head bigint;
DECLARE canonical_applicability_fingerprint text;
BEGIN
  IF array_position(NEW.evidence_refs, NULL) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REGISTRY_FRESHNESS_ACTIVATION_EVIDENCE_INVALID';
  END IF;

  canonical_applicability_fingerprint :=
    governance.registry_freshness_applicability_fingerprint(
      NEW.registry_scope,
      NEW.environment
    );
  IF NEW.applicability_fingerprint <> canonical_applicability_fingerprint THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REGISTRY_FRESHNESS_APPLICABILITY_FINGERPRINT_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(canonical_applicability_fingerprint, 0)
  );

  SELECT * INTO selected_policy
  FROM governance.registry_freshness_policy_versions
  WHERE registry_freshness_policy_id = NEW.registry_freshness_policy_id
    AND policy_version = NEW.registry_freshness_policy_version;
  IF NOT FOUND
    OR selected_policy.registry_scope <> NEW.registry_scope
    OR selected_policy.environment <> NEW.environment
    OR selected_policy.authority_identifier <> NEW.authority_identifier THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REGISTRY_FRESHNESS_ACTIVATION_POLICY_INVALID';
  END IF;

  IF NEW.event_type IN ('ACTIVATE','SUPERSEDE')
    AND selected_policy.lifecycle_intent <> 'ACTIVE' THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REGISTRY_FRESHNESS_ACTIVATION_LIFECYCLE_INVALID';
  END IF;

  SELECT max(selection_sequence) INTO current_head
  FROM governance.registry_freshness_policy_activation_events
  WHERE applicability_fingerprint = canonical_applicability_fingerprint;

  IF NEW.selection_sequence = 1 THEN
    IF current_head IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REGISTRY_FRESHNESS_ACTIVATION_CONFLICT';
    END IF;
  ELSE
    SELECT * INTO prior_event
    FROM governance.registry_freshness_policy_activation_events
    WHERE registry_freshness_policy_activation_event_id = NEW.supersedes_activation_event_id;
    IF NOT FOUND
      OR prior_event.registry_scope <> NEW.registry_scope
      OR prior_event.environment <> NEW.environment
      OR prior_event.applicability_fingerprint <> canonical_applicability_fingerprint
      OR prior_event.selection_sequence <> NEW.selection_sequence - 1
      OR current_head <> prior_event.selection_sequence THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REGISTRY_FRESHNESS_ACTIVATION_PREDECESSOR_INVALID';
    END IF;

    IF prior_event.event_type = 'RETIRE' AND NEW.event_type <> 'ACTIVATE' THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REGISTRY_FRESHNESS_ACTIVATION_TRANSITION_INVALID';
    END IF;
    IF prior_event.event_type <> 'RETIRE' AND NEW.event_type = 'ACTIVATE' THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REGISTRY_FRESHNESS_ACTIVATION_TRANSITION_INVALID';
    END IF;
    IF NEW.event_type = 'RETIRE'
      AND (NEW.registry_freshness_policy_id <> prior_event.registry_freshness_policy_id
        OR NEW.registry_freshness_policy_version <> prior_event.registry_freshness_policy_version) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REGISTRY_FRESHNESS_RETIRE_TARGET_INVALID';
    END IF;
    IF NEW.event_type = 'SUPERSEDE'
      AND NEW.registry_freshness_policy_id = prior_event.registry_freshness_policy_id
      AND NEW.registry_freshness_policy_version = prior_event.registry_freshness_policy_version THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='REGISTRY_FRESHNESS_SUPERSEDE_TARGET_INVALID';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER registry_freshness_policy_versions_guard_insert
BEFORE INSERT ON governance.registry_freshness_policy_versions
FOR EACH ROW EXECUTE FUNCTION governance.guard_registry_freshness_policy_append();
CREATE TRIGGER registry_freshness_policy_activation_events_guard_insert
BEFORE INSERT ON governance.registry_freshness_policy_activation_events
FOR EACH ROW EXECUTE FUNCTION governance.guard_registry_freshness_policy_activation_append();

CREATE TRIGGER registry_freshness_policy_versions_reject_mutation
BEFORE UPDATE OR DELETE ON governance.registry_freshness_policy_versions
FOR EACH ROW EXECUTE FUNCTION governance.reject_registry_freshness_policy_mutation();
CREATE TRIGGER registry_freshness_policy_activation_events_reject_mutation
BEFORE UPDATE OR DELETE ON governance.registry_freshness_policy_activation_events
FOR EACH ROW EXECUTE FUNCTION governance.reject_registry_freshness_policy_mutation();

ALTER TABLE governance.request_routing_decision_versions
  ADD COLUMN registry_freshness_policy_id uuid,
  ADD COLUMN registry_freshness_policy_version bigint,
  ADD COLUMN registry_max_age_ms bigint,
  ADD CONSTRAINT routing_decision_registry_policy_fk
    FOREIGN KEY (registry_freshness_policy_id, registry_freshness_policy_version)
    REFERENCES governance.registry_freshness_policy_versions(
      registry_freshness_policy_id,
      policy_version
    ) ON UPDATE NO ACTION ON DELETE NO ACTION,
  ADD CONSTRAINT routing_decision_registry_lineage_complete
    CHECK (
      (registry_freshness_policy_id IS NULL
        AND registry_freshness_policy_version IS NULL
        AND registry_max_age_ms IS NULL)
      OR
      (registry_freshness_policy_id IS NOT NULL
        AND registry_freshness_policy_version IS NOT NULL
        AND registry_max_age_ms IS NOT NULL)
    ),
  ADD CONSTRAINT routing_decision_registry_max_age_valid
    CHECK (registry_max_age_ms IS NULL
      OR (registry_max_age_ms > 0 AND registry_max_age_ms <= 9007199254740991)),
  ADD CONSTRAINT routing_decision_registry_fresh_until_derived
    CHECK (registry_max_age_ms IS NULL
      OR registry_fresh_until = registry_observed_at
        + registry_max_age_ms::double precision * INTERVAL '1 millisecond');

ALTER TABLE governance.request_routing_candidate_snapshots
  ADD COLUMN registry_freshness_policy_id uuid,
  ADD COLUMN registry_freshness_policy_version bigint,
  ADD COLUMN registry_max_age_ms bigint,
  ADD CONSTRAINT routing_candidate_registry_policy_fk
    FOREIGN KEY (registry_freshness_policy_id, registry_freshness_policy_version)
    REFERENCES governance.registry_freshness_policy_versions(
      registry_freshness_policy_id,
      policy_version
    ) ON UPDATE NO ACTION ON DELETE NO ACTION,
  ADD CONSTRAINT routing_candidate_registry_lineage_complete
    CHECK (
      (registry_freshness_policy_id IS NULL
        AND registry_freshness_policy_version IS NULL
        AND registry_max_age_ms IS NULL)
      OR
      (registry_freshness_policy_id IS NOT NULL
        AND registry_freshness_policy_version IS NOT NULL
        AND registry_max_age_ms IS NOT NULL)
    ),
  ADD CONSTRAINT routing_candidate_registry_max_age_valid
    CHECK (registry_max_age_ms IS NULL
      OR (registry_max_age_ms > 0 AND registry_max_age_ms <= 9007199254740991)),
  ADD CONSTRAINT routing_candidate_registry_fresh_until_derived
    CHECK (registry_max_age_ms IS NULL
      OR fresh_until = observed_at
        + registry_max_age_ms::double precision * INTERVAL '1 millisecond');

CREATE INDEX request_routing_decision_versions_registry_policy_idx
  ON governance.request_routing_decision_versions
    (registry_freshness_policy_id, registry_freshness_policy_version);
CREATE INDEX request_routing_candidate_snapshots_registry_policy_idx
  ON governance.request_routing_candidate_snapshots
    (registry_freshness_policy_id, registry_freshness_policy_version);

REVOKE ALL ON governance.registry_freshness_policy_versions FROM PUBLIC;
REVOKE ALL ON governance.registry_freshness_policy_activation_events FROM PUBLIC;
