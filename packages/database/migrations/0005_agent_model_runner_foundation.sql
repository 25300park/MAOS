CREATE TABLE ai.agent_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES core.departments(id),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  role text NOT NULL CHECK (length(trim(role)) > 0),
  lifecycle text NOT NULL CHECK (lifecycle IN ('DRAFT', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'RETIRED')),
  current_version bigint NOT NULL DEFAULT 1 CHECK (current_version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  UNIQUE (department_id, name),
  CHECK (updated_at >= created_at),
  CHECK (archived_at IS NULL OR archived_at >= created_at)
);

CREATE TABLE ai.agent_definition_versions (
  agent_definition_id uuid NOT NULL REFERENCES ai.agent_definitions(id) ON DELETE CASCADE,
  version bigint NOT NULL CHECK (version > 0),
  mission text NOT NULL CHECK (length(trim(mission)) > 0),
  definition jsonb NOT NULL,
  definition_hash text NOT NULL CHECK (length(trim(definition_hash)) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agent_definition_id, version)
);

CREATE TABLE ai.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_definition_id uuid NOT NULL,
  agent_definition_version bigint NOT NULL,
  runtime_status text NOT NULL CHECK (runtime_status IN ('AVAILABLE', 'WORKING', 'WAITING', 'BLOCKED', 'OFFLINE')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retired_at timestamptz,
  FOREIGN KEY (agent_definition_id, agent_definition_version)
    REFERENCES ai.agent_definition_versions(agent_definition_id, version),
  CHECK (updated_at >= created_at),
  CHECK (retired_at IS NULL OR retired_at >= created_at)
);

CREATE TABLE ai.model_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (updated_at >= created_at)
);

CREATE TABLE ai.models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES ai.model_providers(id),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  lifecycle text NOT NULL CHECK (lifecycle IN ('ACTIVE', 'DISABLED')),
  capabilities text[] NOT NULL CHECK (cardinality(capabilities) > 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider_id, name),
  CHECK (updated_at >= created_at)
);

CREATE TABLE execution.runners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  lifecycle text NOT NULL CHECK (lifecycle IN ('ACTIVE', 'DISABLED', 'RETIRED')),
  health text NOT NULL CHECK (health IN ('HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'MAINTENANCE', 'UNKNOWN')),
  capabilities text[] NOT NULL CHECK (cardinality(capabilities) > 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  last_health_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (updated_at >= created_at),
  CHECK (last_health_at IS NULL OR last_health_at >= created_at)
);

CREATE TABLE work.task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES work.tasks(id),
  agent_id uuid NOT NULL REFERENCES ai.agents(id),
  assigned_by_actor_type text NOT NULL CHECK (assigned_by_actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  assigned_by_actor_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('ASSIGNED', 'RELEASED')),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at timestamptz,
  UNIQUE (task_id, idempotency_key),
  CHECK (released_at IS NULL OR released_at >= created_at)
);

CREATE UNIQUE INDEX task_assignments_one_active_agent
  ON work.task_assignments (task_id)
  WHERE status = 'ASSIGNED';

CREATE TABLE execution.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES work.tasks(id),
  assignment_id uuid NOT NULL REFERENCES work.task_assignments(id),
  agent_id uuid NOT NULL REFERENCES ai.agents(id),
  model_id uuid NOT NULL REFERENCES ai.models(id),
  runner_id uuid NOT NULL REFERENCES execution.runners(id),
  status text NOT NULL CHECK (status IN ('REQUESTED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELLED')),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  timeout_ms integer NOT NULL CHECK (timeout_ms > 0),
  cancellation_reason text,
  input_tokens bigint CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens bigint CHECK (output_tokens IS NULL OR output_tokens >= 0),
  cost_amount numeric(18, 6) CHECK (cost_amount IS NULL OR cost_amount >= 0),
  cost_currency text CHECK (cost_currency IS NULL OR cost_currency ~ '^[A-Z]{3}$'),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (task_id, idempotency_key),
  CHECK (started_at IS NULL OR started_at >= created_at),
  CHECK (completed_at IS NULL OR completed_at >= created_at),
  CHECK ((status = 'CANCELLED') OR cancellation_reason IS NULL)
);

CREATE TABLE audit.run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES execution.runs(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name ~ '^RUN\.[A-Z][A-Z0-9_]*$'),
  actor_type text NOT NULL CHECK (actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  actor_id uuid NOT NULL,
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
