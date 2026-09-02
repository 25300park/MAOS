CREATE TABLE ai.skill_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  category text NOT NULL CHECK (category IN (
    'GENERAL', 'DEVELOPMENT', 'DESIGN', 'DATA', 'REAL_ESTATE',
    'MARKETING', 'FINANCE', 'HR', 'SECURITY', 'OPERATIONS',
    'COMMUNICATION', 'GOVERNANCE'
  )),
  scope text NOT NULL CHECK (scope IN ('GLOBAL', 'DEPARTMENT', 'PROJECT', 'DOMAIN_SYSTEM', 'AGENT')),
  status text NOT NULL CHECK (status IN ('DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE', 'DEPRECATED', 'DISABLED', 'ARCHIVED')),
  current_version bigint NOT NULL DEFAULT 1 CHECK (current_version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  UNIQUE (name, scope),
  CHECK (updated_at >= created_at),
  CHECK (archived_at IS NULL OR archived_at >= created_at)
);

CREATE TABLE ai.skill_versions (
  skill_definition_id uuid NOT NULL REFERENCES ai.skill_definitions(id) ON DELETE CASCADE,
  version bigint NOT NULL CHECK (version > 0),
  checksum text NOT NULL CHECK (length(trim(checksum)) > 0),
  package_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (skill_definition_id, version)
);

CREATE TABLE ai.skill_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_definition_id uuid NOT NULL,
  skill_version bigint NOT NULL,
  resolution_source text NOT NULL CHECK (resolution_source IN ('TASK', 'PROJECT', 'WORKFLOW', 'DEPARTMENT', 'AGENT', 'GLOBAL')),
  scope_id uuid,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (skill_definition_id, skill_version)
    REFERENCES ai.skill_versions(skill_definition_id, version),
  CHECK (
    (resolution_source = 'GLOBAL' AND scope_id IS NULL) OR
    (resolution_source <> 'GLOBAL' AND scope_id IS NOT NULL)
  ),
  UNIQUE (skill_definition_id, skill_version, resolution_source, scope_id)
);

CREATE TABLE execution.tool_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  provider_type text NOT NULL CHECK (provider_type IN ('NATIVE', 'MCP')),
  provider_version text NOT NULL CHECK (length(trim(provider_version)) > 0),
  checksum text NOT NULL CHECK (length(trim(checksum)) > 0),
  trust text NOT NULL CHECK (trust IN ('TRUSTED_INTERNAL', 'APPROVED_EXTERNAL', 'RESTRICTED', 'UNTRUSTED')),
  lifecycle text NOT NULL CHECK (lifecycle IN ('DRAFT', 'TESTING', 'ACTIVE', 'DISABLED', 'DEPRECATED', 'ARCHIVED')),
  health text NOT NULL CHECK (health IN ('HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'MAINTENANCE', 'UNKNOWN')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (updated_at >= created_at)
);

CREATE TABLE execution.tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES execution.tool_providers(id),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  tool_type text NOT NULL CHECK (tool_type IN (
    'FILESYSTEM', 'CLI', 'API', 'DATABASE', 'BROWSER', 'MCP',
    'DEPLOYMENT', 'VERSION_CONTROL', 'COMMUNICATION', 'STORAGE',
    'OBSERVABILITY'
  )),
  risk text NOT NULL CHECK (risk IN ('R0', 'R1', 'R2', 'R3', 'R4')),
  lifecycle text NOT NULL CHECK (lifecycle IN ('DRAFT', 'TESTING', 'ACTIVE', 'DISABLED', 'DEPRECATED', 'ARCHIVED')),
  health text NOT NULL CHECK (health IN ('HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'MAINTENANCE', 'UNKNOWN')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider_id, name),
  CHECK (updated_at >= created_at)
);

CREATE TABLE execution.tool_capabilities (
  tool_id uuid NOT NULL REFERENCES execution.tools(id) ON DELETE CASCADE,
  capability_id text NOT NULL CHECK (length(trim(capability_id)) > 0),
  action_type text NOT NULL CHECK (action_type IN ('READ', 'WRITE', 'EXECUTE', 'ADMIN')),
  risk text NOT NULL CHECK (risk IN ('R0', 'R1', 'R2', 'R3', 'R4')),
  requires_approval boolean NOT NULL,
  environment_scope text[] NOT NULL CHECK (cardinality(environment_scope) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tool_id, capability_id)
);

CREATE TABLE governance.tool_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_layer text NOT NULL CHECK (permission_layer IN ('AGENT', 'WORKFLOW', 'PROJECT', 'ENVIRONMENT', 'HUMAN_AUTHORITY')),
  subject_id uuid NOT NULL,
  tool_id uuid NOT NULL,
  capability_id text NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('READ', 'WRITE', 'EXECUTE', 'ADMIN')),
  effect text NOT NULL CHECK (effect IN ('ALLOW', 'DENY', 'ALLOW_WITH_APPROVAL')),
  risk text NOT NULL CHECK (risk IN ('R0', 'R1', 'R2', 'R3', 'R4')),
  environment text NOT NULL CHECK (length(trim(environment)) > 0),
  scope text NOT NULL CHECK (length(trim(scope)) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at timestamptz,
  FOREIGN KEY (tool_id, capability_id)
    REFERENCES execution.tool_capabilities(tool_id, capability_id),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE execution.tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES execution.runs(id),
  agent_id uuid NOT NULL REFERENCES ai.agents(id),
  tool_id uuid NOT NULL,
  capability_id text NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('READ', 'WRITE', 'EXECUTE', 'ADMIN')),
  environment text NOT NULL CHECK (length(trim(environment)) > 0),
  status text NOT NULL CHECK (status IN (
    'REQUESTED', 'AUTHORIZING', 'WAITING_APPROVAL', 'AUTHORIZED',
    'EXECUTING', 'SUCCEEDED', 'FAILED', 'DENIED', 'TIMED_OUT', 'CANCELLED'
  )),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  timeout_ms integer NOT NULL CHECK (timeout_ms > 0),
  cancellation_reason text,
  result jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at timestamptz,
  completed_at timestamptz,
  FOREIGN KEY (tool_id, capability_id)
    REFERENCES execution.tool_capabilities(tool_id, capability_id),
  UNIQUE (run_id, idempotency_key),
  CHECK (started_at IS NULL OR started_at >= created_at),
  CHECK (completed_at IS NULL OR completed_at >= created_at),
  CHECK ((status = 'CANCELLED') OR cancellation_reason IS NULL)
);

CREATE TABLE audit.tool_call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_call_id uuid NOT NULL REFERENCES execution.tool_calls(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name ~ '^TOOL_CALL\.[A-Z][A-Z0-9_]*$'),
  actor_type text NOT NULL CHECK (actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  actor_id uuid NOT NULL,
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
