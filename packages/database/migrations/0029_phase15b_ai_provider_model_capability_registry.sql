ALTER TABLE ai.model_providers
  ADD COLUMN provider_key text,
  ADD COLUMN display_name text,
  ADD COLUMN provider_type text NOT NULL DEFAULT 'EXTERNAL',
  ADD COLUMN health_state text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN readiness_state text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN credential_ref text,
  ADD COLUMN default_region text,
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN version bigint NOT NULL DEFAULT 1;

ALTER TABLE ai.models
  ADD COLUMN model_key text,
  ADD COLUMN display_name text,
  ADD COLUMN model_family text,
  ADD COLUMN model_version text,
  ADD COLUMN context_window_class text,
  ADD COLUMN multimodal_support boolean,
  ADD COLUMN structured_output_support boolean,
  ADD COLUMN tool_use_support boolean,
  ADD COLUMN streaming_support boolean,
  ADD COLUMN health_state text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN readiness_state text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

WITH normalized AS (
  SELECT id,
         COALESCE(NULLIF(trim(both '-' FROM regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')), ''), 'provider') AS base_key
    FROM ai.model_providers
), collision_counts AS (
  SELECT base_key, count(*) AS collision_count
    FROM normalized
   GROUP BY base_key
)
UPDATE ai.model_providers provider
   SET provider_key = CASE
         WHEN collision_counts.collision_count > 1
           THEN normalized.base_key || '-' || replace(provider.id::text, '-', '')
         ELSE normalized.base_key
       END,
       display_name = provider.name
  FROM normalized
  JOIN collision_counts USING (base_key)
 WHERE provider.id = normalized.id;

WITH normalized AS (
  SELECT id,
         provider_id,
         COALESCE(NULLIF(trim(both '-' FROM regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')), ''), 'model') AS base_key
    FROM ai.models
), collision_counts AS (
  SELECT provider_id, base_key, count(*) AS collision_count
    FROM normalized
   GROUP BY provider_id, base_key
)
UPDATE ai.models model
   SET model_key = CASE
         WHEN collision_counts.collision_count > 1
           THEN normalized.base_key || '-' || replace(model.id::text, '-', '')
         ELSE normalized.base_key
       END,
       display_name = model.name
  FROM normalized
  JOIN collision_counts
    ON collision_counts.provider_id = normalized.provider_id
   AND collision_counts.base_key = normalized.base_key
 WHERE model.id = normalized.id;

ALTER TABLE ai.model_providers
  ALTER COLUMN provider_key SET NOT NULL,
  ALTER COLUMN display_name SET NOT NULL,
  ADD CONSTRAINT model_providers_provider_key_format_check
    CHECK (provider_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  ADD CONSTRAINT model_providers_provider_key_key UNIQUE (provider_key),
  ADD CONSTRAINT model_providers_provider_type_check
    CHECK (provider_type IN ('EXTERNAL', 'LOCAL', 'HYBRID')),
  ADD CONSTRAINT model_providers_health_state_check
    CHECK (health_state IN ('HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'UNKNOWN')),
  ADD CONSTRAINT model_providers_readiness_state_check
    CHECK (readiness_state IN ('READY', 'DEGRADED', 'BLOCKED', 'STALE', 'UNKNOWN')),
  ADD CONSTRAINT model_providers_version_check CHECK (version > 0);

ALTER TABLE ai.models
  ALTER COLUMN model_key SET NOT NULL,
  ALTER COLUMN display_name SET NOT NULL,
  ADD CONSTRAINT models_model_key_format_check
    CHECK (model_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  ADD CONSTRAINT models_provider_id_model_key_key UNIQUE (provider_id, model_key),
  ADD CONSTRAINT models_health_state_check
    CHECK (health_state IN ('HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'UNKNOWN')),
  ADD CONSTRAINT models_readiness_state_check
    CHECK (readiness_state IN ('READY', 'DEGRADED', 'BLOCKED', 'STALE', 'UNKNOWN'));

COMMENT ON COLUMN ai.models.capabilities IS
  'LEGACY_NONAUTHORITATIVE; COMPATIBILITY_ONLY. Canonical capability authority is ai.model_capability_bindings joined to ai.capabilities.';

CREATE FUNCTION ai.assign_model_provider_registry_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.provider_key IS NULL OR trim(NEW.provider_key) = '' THEN
    NEW.provider_key := COALESCE(
      NULLIF(trim(both '-' FROM regexp_replace(lower(trim(NEW.name)), '[^a-z0-9]+', '-', 'g')), ''),
      'provider'
    );
  END IF;
  IF NEW.display_name IS NULL OR trim(NEW.display_name) = '' THEN
    NEW.display_name := NEW.name;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER model_providers_assign_registry_fields
BEFORE INSERT ON ai.model_providers
FOR EACH ROW EXECUTE FUNCTION ai.assign_model_provider_registry_fields();

CREATE FUNCTION ai.assign_model_registry_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.model_key IS NULL OR trim(NEW.model_key) = '' THEN
    NEW.model_key := COALESCE(
      NULLIF(trim(both '-' FROM regexp_replace(lower(trim(NEW.name)), '[^a-z0-9]+', '-', 'g')), ''),
      'model'
    );
  END IF;
  IF NEW.display_name IS NULL OR trim(NEW.display_name) = '' THEN
    NEW.display_name := NEW.name;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER models_assign_registry_fields
BEFORE INSERT ON ai.models
FOR EACH ROW EXECUTE FUNCTION ai.assign_model_registry_fields();

CREATE TABLE ai.host_runtimes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES ai.model_providers(id),
  host_key text NOT NULL UNIQUE CHECK (host_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
  host_type text NOT NULL CHECK (host_type IN ('PROVIDER_API', 'CLI_ADAPTER', 'LOCAL_RUNTIME', 'OTHER')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  execution_mode text NOT NULL CHECK (execution_mode IN ('REMOTE_API', 'LOCAL_PROCESS', 'HYBRID')),
  network_required boolean NOT NULL,
  interactive_required boolean NOT NULL DEFAULT false,
  credential_mode text NOT NULL CHECK (credential_mode IN ('REFERENCE', 'NONE')),
  credential_ref text,
  adapter_ref text NOT NULL CHECK (length(trim(adapter_ref)) > 0),
  health_state text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (health_state IN ('HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'UNKNOWN')),
  readiness_state text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (readiness_state IN ('READY', 'DEGRADED', 'BLOCKED', 'STALE', 'UNKNOWN')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (updated_at >= created_at),
  CHECK ((credential_mode = 'NONE' AND credential_ref IS NULL) OR credential_mode = 'REFERENCE')
);

CREATE TABLE ai.model_host_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES ai.models(id),
  host_id uuid NOT NULL REFERENCES ai.host_runtimes(id),
  lifecycle text NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle IN ('ACTIVE', 'DISABLED')),
  health_state text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (health_state IN ('HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'UNKNOWN')),
  readiness_state text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (readiness_state IN ('READY', 'DEGRADED', 'BLOCKED', 'STALE', 'UNKNOWN')),
  cost_class text NOT NULL DEFAULT 'UNKNOWN' CHECK (cost_class IN ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN')),
  latency_class text NOT NULL DEFAULT 'UNKNOWN' CHECK (latency_class IN ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN')),
  quality_class text NOT NULL DEFAULT 'UNKNOWN' CHECK (quality_class IN ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN')),
  verification_evidence_ref text,
  verified_at timestamptz,
  policy_version text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT model_host_bindings_model_id_host_id_key UNIQUE (model_id, host_id),
  CHECK (updated_at >= created_at)
);

CREATE TABLE ai.capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_key text NOT NULL UNIQUE CHECK (capability_key ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'),
  description text NOT NULL CHECK (length(trim(description)) > 0),
  capability_class text NOT NULL CHECK (capability_class IN ('REASONING', 'CONTENT', 'CODE', 'DATA', 'TOOL', 'INTERFACE')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (updated_at >= created_at)
);

CREATE TABLE ai.model_capability_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_host_binding_id uuid NOT NULL REFERENCES ai.model_host_bindings(id),
  capability_id uuid NOT NULL REFERENCES ai.capabilities(id),
  support_level text NOT NULL CHECK (support_level IN ('UNSUPPORTED', 'LIMITED', 'SUPPORTED', 'PREFERRED')),
  confidence_class text NOT NULL DEFAULT 'UNKNOWN' CHECK (confidence_class IN ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN')),
  verification_freshness text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (verification_freshness IN ('FRESH', 'STALE', 'UNKNOWN', 'RECONCILING')),
  verified_at timestamptz,
  verification_source text,
  evidence_ref text,
  policy_version text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT model_capability_bindings_model_host_binding_id_capability_id_key
    UNIQUE (model_host_binding_id, capability_id),
  CHECK (updated_at >= created_at)
);

CREATE TABLE ai.role_compatibilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_host_binding_id uuid NOT NULL REFERENCES ai.model_host_bindings(id),
  domain_key text NOT NULL CHECK (domain_key ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'),
  stage_key text NOT NULL CHECK (stage_key ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'),
  role_key text NOT NULL CHECK (role_key ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'),
  eligibility text NOT NULL CHECK (eligibility IN ('ELIGIBLE', 'CONDITIONAL', 'INELIGIBLE')),
  fallback_eligible boolean NOT NULL DEFAULT false,
  independent_review_eligible boolean NOT NULL DEFAULT false,
  adversarial_review_eligible boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (model_host_binding_id, domain_key, stage_key, role_key),
  CHECK (updated_at >= created_at)
);

CREATE TABLE ai.domain_execution_constraints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key text NOT NULL UNIQUE CHECK (domain_key ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'),
  execution_mode text NOT NULL CHECK (execution_mode IN ('MAOS_NATIVE', 'DELEGATE_TO_AIDOS', 'PROHIBITED')),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')),
  reason_code text NOT NULL CHECK (length(trim(reason_code)) > 0),
  policy_ref text NOT NULL CHECK (length(trim(policy_ref)) > 0),
  policy_version text NOT NULL CHECK (length(trim(policy_version)) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (updated_at >= created_at)
);

INSERT INTO ai.model_providers
  (id, name, status, provider_key, display_name, provider_type, health_state, readiness_state)
VALUES
  ('00000000-0000-4000-8000-000000015001', 'OpenAI', 'ACTIVE', 'openai', 'OpenAI', 'EXTERNAL', 'UNKNOWN', 'UNKNOWN'),
  ('00000000-0000-4000-8000-000000015002', 'Anthropic', 'ACTIVE', 'anthropic', 'Anthropic', 'EXTERNAL', 'UNKNOWN', 'UNKNOWN'),
  ('00000000-0000-4000-8000-000000015003', 'Google', 'ACTIVE', 'google', 'Google', 'EXTERNAL', 'UNKNOWN', 'UNKNOWN')
ON CONFLICT (provider_key) DO NOTHING;

INSERT INTO ai.host_runtimes
  (id, provider_id, host_key, display_name, host_type, execution_mode, network_required,
   credential_mode, credential_ref, adapter_ref, health_state, readiness_state)
VALUES
  ('00000000-0000-4000-8000-000000015101', (SELECT id FROM ai.model_providers WHERE provider_key = 'openai'), 'openai-api', 'OpenAI API', 'PROVIDER_API', 'REMOTE_API', true, 'NONE', NULL, 'adapter://maos/openai-api', 'UNKNOWN', 'UNKNOWN'),
  ('00000000-0000-4000-8000-000000015102', (SELECT id FROM ai.model_providers WHERE provider_key = 'anthropic'), 'anthropic-api', 'Anthropic API', 'PROVIDER_API', 'REMOTE_API', true, 'NONE', NULL, 'adapter://maos/anthropic-api', 'UNKNOWN', 'UNKNOWN'),
  ('00000000-0000-4000-8000-000000015103', (SELECT id FROM ai.model_providers WHERE provider_key = 'google'), 'google-api', 'Google API', 'PROVIDER_API', 'REMOTE_API', true, 'NONE', NULL, 'adapter://maos/google-api', 'UNKNOWN', 'UNKNOWN'),
  ('00000000-0000-4000-8000-000000015104', NULL, 'codex-cli', 'Codex CLI', 'CLI_ADAPTER', 'LOCAL_PROCESS', false, 'NONE', NULL, 'adapter://maos/codex-cli', 'UNKNOWN', 'BLOCKED'),
  ('00000000-0000-4000-8000-000000015105', NULL, 'claude-code', 'Claude Code', 'CLI_ADAPTER', 'LOCAL_PROCESS', false, 'NONE', NULL, 'adapter://maos/claude-code', 'UNKNOWN', 'BLOCKED');

INSERT INTO ai.capabilities (id, capability_key, description, capability_class)
VALUES
  ('00000000-0000-4000-8000-000000015201', 'GENERAL_REASONING', 'General reasoning', 'REASONING'),
  ('00000000-0000-4000-8000-000000015202', 'PLANNING', 'Planning', 'REASONING'),
  ('00000000-0000-4000-8000-000000015203', 'RESEARCH', 'Research', 'REASONING'),
  ('00000000-0000-4000-8000-000000015204', 'ANALYSIS', 'Analysis', 'REASONING'),
  ('00000000-0000-4000-8000-000000015205', 'WRITING', 'Writing', 'CONTENT'),
  ('00000000-0000-4000-8000-000000015206', 'SUMMARIZATION', 'Summarization', 'CONTENT'),
  ('00000000-0000-4000-8000-000000015207', 'CODE_REASONING', 'Code reasoning', 'CODE'),
  ('00000000-0000-4000-8000-000000015208', 'CODE_EXECUTION', 'Code execution metadata only', 'CODE'),
  ('00000000-0000-4000-8000-000000015209', 'CODE_REVIEW', 'Code review', 'CODE'),
  ('00000000-0000-4000-8000-000000015210', 'SECURITY_REVIEW', 'Security review', 'CODE'),
  ('00000000-0000-4000-8000-000000015211', 'DATA_ANALYSIS', 'Data analysis', 'DATA'),
  ('00000000-0000-4000-8000-000000015212', 'TOOL_USE', 'Tool use', 'TOOL'),
  ('00000000-0000-4000-8000-000000015213', 'STRUCTURED_OUTPUT', 'Structured output', 'INTERFACE'),
  ('00000000-0000-4000-8000-000000015214', 'MULTIMODAL', 'Multimodal input and output', 'INTERFACE'),
  ('00000000-0000-4000-8000-000000015215', 'LONG_CONTEXT', 'Long context', 'INTERFACE');

INSERT INTO ai.domain_execution_constraints
  (id, domain_key, execution_mode, status, reason_code, policy_ref, policy_version)
VALUES
  ('00000000-0000-4000-8000-000000015301', 'DEVELOPMENT', 'DELEGATE_TO_AIDOS', 'ACTIVE',
   'PHASE15A_DEVELOPMENT_DELEGATION', 'MAOS-FRZ-014', '2.3');

CREATE FUNCTION ai.guard_development_domain_constraint()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('ai.development_authority_boundary', 0));
  IF OLD.domain_key = 'DEVELOPMENT'
     AND OLD.execution_mode = 'DELEGATE_TO_AIDOS'
     AND OLD.status = 'ACTIVE'
     AND (TG_OP = 'DELETE' OR NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'AI_DEVELOPMENT_DOMAIN_CONSTRAINT_IMMUTABLE';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER domain_execution_constraints_guard_development
BEFORE UPDATE OR DELETE ON ai.domain_execution_constraints
FOR EACH ROW EXECUTE FUNCTION ai.guard_development_domain_constraint();

CREATE FUNCTION ai.guard_development_role_compatibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_policy_count integer;
  active_mode text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('ai.development_authority_boundary', 0));
  IF NEW.domain_key <> 'DEVELOPMENT' OR NEW.eligibility = 'INELIGIBLE' THEN
    RETURN NEW;
  END IF;

  SELECT count(*), min(execution_mode)
    INTO active_policy_count, active_mode
    FROM ai.domain_execution_constraints
   WHERE domain_key = 'DEVELOPMENT'
     AND status = 'ACTIVE';

  IF active_policy_count <> 1 OR active_mode <> 'DELEGATE_TO_AIDOS' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'AI_DEVELOPMENT_POLICY_PROHIBITED';
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'AI_DEVELOPMENT_ROLE_COMPATIBILITY_DENIED';
END;
$$;

CREATE TRIGGER role_compatibilities_guard_development
BEFORE INSERT OR UPDATE ON ai.role_compatibilities
FOR EACH ROW EXECUTE FUNCTION ai.guard_development_role_compatibility();
