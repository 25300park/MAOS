CREATE TABLE integration.memory_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  endpoint text NOT NULL CHECK (endpoint ~ '^https://'),
  credential_ref text NOT NULL CHECK (credential_ref ~ '^secret://'),
  lifecycle text NOT NULL CHECK (lifecycle IN ('ACTIVE', 'DISABLED')),
  health text NOT NULL CHECK (health IN (
    'HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'MAINTENANCE', 'UNKNOWN'
  )),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  last_health_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (name),
  CHECK (last_health_at IS NULL OR last_health_at >= created_at),
  CHECK (updated_at >= created_at)
);

CREATE TABLE knowledge.memory_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL REFERENCES integration.memory_gateways(id),
  external_memory_id text NOT NULL CHECK (length(trim(external_memory_id)) > 0),
  namespace text NOT NULL CHECK (namespace IN (
    '/company', '/departments', '/projects', '/agents', '/tasks',
    '/decisions', '/artifacts', '/policies', '/operations', '/integrations'
  )),
  memory_type text NOT NULL CHECK (memory_type IN (
    'CORPORATE', 'DEPARTMENT', 'PROJECT', 'AGENT', 'TASK',
    'DECISION', 'POLICY', 'OPERATIONAL', 'INTEGRATION'
  )),
  classification text NOT NULL CHECK (classification IN (
    'PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'PRIVATE_PERSONAL'
  )),
  validation text NOT NULL CHECK (validation IN (
    'UNVERIFIED', 'SYSTEM_VERIFIED', 'AGENT_VERIFIED',
    'HUMAN_VERIFIED', 'AUTHORITATIVE'
  )),
  scope_id uuid NOT NULL,
  source_system_id text NOT NULL CHECK (length(trim(source_system_id)) > 0),
  external_resource_id text NOT NULL CHECK (length(trim(external_resource_id)) > 0),
  provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  first_retrieved_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_retrieved_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (gateway_id, external_memory_id),
  CHECK (last_retrieved_at >= first_retrieved_at)
);

CREATE TABLE audit.memory_retrieval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL REFERENCES integration.memory_gateways(id),
  task_id uuid NOT NULL REFERENCES work.tasks(id),
  run_id uuid REFERENCES execution.runs(id),
  actor_type text NOT NULL CHECK (actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  actor_id uuid NOT NULL,
  request_id text NOT NULL CHECK (length(trim(request_id)) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  name text NOT NULL CHECK (name ~ '^MEMORY\.[A-Z][A-Z0-9_]*$'),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
