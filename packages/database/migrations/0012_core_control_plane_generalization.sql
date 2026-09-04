CREATE TABLE integration.systems (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  system_type text NOT NULL CHECK (system_type IN (
    'DOMAIN_APPLICATION', 'AI_AGENT_SYSTEM', 'PUBLIC_PLATFORM',
    'INTERNAL_PLATFORM', 'INFRASTRUCTURE', 'MEMORY_SYSTEM', 'EXTERNAL_SERVICE'
  )),
  source_of_truth text NOT NULL CHECK (source_of_truth IN ('MAOS', 'DOMAIN_SYSTEM')),
  lifecycle text NOT NULL CHECK (lifecycle IN ('DRAFT', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'RETIRED')),
  owner_actor_type text NOT NULL CHECK (owner_actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  owner_actor_id text NOT NULL CHECK (length(trim(owner_actor_id)) > 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  CHECK (source_of_truth <> 'MAOS' OR system_type <> 'DOMAIN_APPLICATION'),
  CHECK (updated_at >= created_at),
  CHECK (archived_at IS NULL OR archived_at >= created_at)
);

CREATE TABLE operations.system_environments (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  system_id text NOT NULL REFERENCES integration.systems(id),
  name text NOT NULL CHECK (name IN ('DEVELOPMENT', 'PREVIEW', 'STAGING', 'PRODUCTION')),
  health text NOT NULL CHECK (health IN ('HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'MAINTENANCE', 'UNKNOWN')),
  configuration_reference text NOT NULL CHECK (configuration_reference LIKE 'configref://%'),
  credential_reference text NOT NULL CHECK (credential_reference LIKE 'secretref://%'),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (system_id, name),
  UNIQUE (system_id, id),
  CHECK (updated_at >= created_at)
);

CREATE TABLE operations.repositories (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  system_id text NOT NULL REFERENCES integration.systems(id),
  reference text NOT NULL CHECK (reference LIKE 'registry://%'),
  default_branch text NOT NULL CHECK (length(trim(default_branch)) > 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (system_id, id),
  UNIQUE (system_id, reference),
  CHECK (updated_at >= created_at)
);

CREATE TABLE operations.workroots (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  system_id text NOT NULL REFERENCES integration.systems(id),
  repository_id text NOT NULL,
  root_reference text NOT NULL CHECK (root_reference LIKE 'workroot://%'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (system_id, id),
  UNIQUE (repository_id, root_reference),
  FOREIGN KEY (system_id, repository_id)
    REFERENCES operations.repositories(system_id, id)
);

CREATE TABLE operations.runner_system_bindings (
  runner_id uuid PRIMARY KEY REFERENCES execution.runners(id),
  system_id text NOT NULL REFERENCES integration.systems(id),
  environment_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (system_id, runner_id),
  FOREIGN KEY (system_id, environment_id)
    REFERENCES operations.system_environments(system_id, id)
);

CREATE TABLE operations.runner_workroot_bindings (
  runner_id uuid NOT NULL,
  system_id text NOT NULL,
  workroot_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (runner_id, workroot_id),
  FOREIGN KEY (system_id, runner_id)
    REFERENCES operations.runner_system_bindings(system_id, runner_id),
  FOREIGN KEY (system_id, workroot_id)
    REFERENCES operations.workroots(system_id, id)
);

CREATE TABLE core.project_system_links (
  project_id uuid NOT NULL REFERENCES core.projects(id),
  system_id text NOT NULL REFERENCES integration.systems(id),
  repository_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, system_id),
  FOREIGN KEY (system_id, repository_id)
    REFERENCES operations.repositories(system_id, id)
);

CREATE TABLE execution.control_loop_policies (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  max_iterations integer NOT NULL CHECK (max_iterations > 0),
  time_budget_ms integer NOT NULL CHECK (time_budget_ms > 0),
  max_cost_amount numeric(18, 6) NOT NULL CHECK (max_cost_amount >= 0),
  allowed_tools text[] NOT NULL CHECK (cardinality(allowed_tools) > 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE execution.control_loop_runs (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  policy_id text NOT NULL REFERENCES execution.control_loop_policies(id),
  system_id text NOT NULL REFERENCES integration.systems(id),
  project_id uuid REFERENCES core.projects(id),
  actor_type text NOT NULL CHECK (actor_type = 'HUMAN'),
  actor_id text NOT NULL CHECK (length(trim(actor_id)) > 0),
  trigger_type text NOT NULL CHECK (trigger_type IN ('HUMAN_REQUEST', 'TASK', 'WORKFLOW')),
  trigger_id text NOT NULL CHECK (length(trim(trigger_id)) > 0),
  status text NOT NULL CHECK (status IN ('RUNNING', 'PAUSED', 'STOPPED', 'CANCELLED')),
  stop_condition text CHECK (stop_condition IN (
    'GOAL_REACHED', 'MAX_ITERATIONS', 'TIME_BUDGET_EXCEEDED',
    'COST_BUDGET_EXCEEDED', 'WAITING_HUMAN', 'APPROVAL_REQUIRED',
    'NO_PROGRESS', 'KILL_SWITCH', 'FATAL_ERROR'
  )),
  iteration integer NOT NULL DEFAULT 0 CHECK (iteration >= 0),
  cost_amount numeric(18, 6) NOT NULL DEFAULT 0 CHECK (cost_amount >= 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id, system_id)
    REFERENCES core.project_system_links(project_id, system_id),
  CHECK ((status IN ('RUNNING', 'PAUSED')) = (stop_condition IS NULL)),
  CHECK (updated_at >= created_at)
);
