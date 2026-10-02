CREATE TABLE governance.routing_policy_versions (
  policy_ref text NOT NULL CHECK (length(trim(policy_ref)) > 0),
  policy_version text NOT NULL CHECK (length(trim(policy_version)) > 0),
  routing_kind text NOT NULL CHECK (routing_kind IN ('PLANNER', 'REVIEWER')),
  lifecycle text NOT NULL CHECK (lifecycle IN ('APPROVED', 'RETIRED')),
  required_capability_refs text[] NOT NULL CHECK (cardinality(required_capability_refs) > 0),
  required_skill_version_refs text[] NOT NULL CHECK (cardinality(required_skill_version_refs) > 0),
  allowed_agent_ids uuid[] NOT NULL CHECK (cardinality(allowed_agent_ids) > 0),
  company_scope_refs text[] NOT NULL CHECK (cardinality(company_scope_refs) > 0),
  team_scope_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  project_scope_refs text[] NOT NULL CHECK (cardinality(project_scope_refs) > 0),
  system_scope_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  environments text[] NOT NULL CHECK (
    cardinality(environments) > 0
    AND environments <@ ARRAY['DEVELOPMENT', 'PREVIEW', 'STAGING', 'PRODUCTION']::text[]
  ),
  max_risk_class text NOT NULL CHECK (max_risk_class IN ('R0', 'R1', 'R2', 'R3', 'R4')),
  max_attempts integer NOT NULL CHECK (max_attempts > 0),
  timeout_ms integer NOT NULL CHECK (timeout_ms > 0),
  policy_hash text NOT NULL CHECK (policy_hash ~ '^sha256:[a-f0-9]{64}$'),
  evidence_refs text[] NOT NULL CHECK (cardinality(evidence_refs) > 0),
  audit_refs text[] NOT NULL CHECK (cardinality(audit_refs) > 0),
  effective_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (policy_ref, policy_version, routing_kind),
  CHECK (expires_at IS NULL OR expires_at > effective_at)
);

CREATE INDEX routing_policy_versions_lookup_idx
  ON governance.routing_policy_versions (routing_kind, lifecycle, effective_at, expires_at);

CREATE TRIGGER routing_policy_versions_reject_mutation
BEFORE UPDATE OR DELETE ON governance.routing_policy_versions
FOR EACH ROW EXECUTE FUNCTION governance.reject_phase14_immutable_mutation();
