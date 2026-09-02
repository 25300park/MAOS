ALTER TABLE core.projects
  ADD COLUMN owner_actor_type text CHECK (owner_actor_type IN ('HUMAN')),
  ADD COLUMN owner_actor_id uuid,
  ADD COLUMN correlation_id text,
  ADD COLUMN idempotency_key text,
  ADD CONSTRAINT projects_owner_complete CHECK ((owner_actor_type IS NULL) = (owner_actor_id IS NULL));

CREATE UNIQUE INDEX projects_idempotency_key_unique ON core.projects (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE core.project_members (
  project_id uuid NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  actor_type text NOT NULL CHECK (actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  actor_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('OWNER', 'LEAD', 'MEMBER', 'REVIEWER', 'APPROVER', 'OBSERVER')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  PRIMARY KEY (project_id, actor_type, actor_id, role),
  CHECK (archived_at IS NULL OR archived_at >= created_at)
);

ALTER TABLE work.tasks
  ADD COLUMN owner_actor_type text CHECK (owner_actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  ADD COLUMN owner_actor_id uuid,
  ADD COLUMN correlation_id text,
  ADD COLUMN idempotency_key text,
  ADD CONSTRAINT tasks_owner_complete CHECK ((owner_actor_type IS NULL) = (owner_actor_id IS NULL));

CREATE UNIQUE INDEX tasks_idempotency_key_unique ON work.tasks (project_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE work.workflow_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES core.projects(id),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  owner_actor_type text NOT NULL CHECK (owner_actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')), owner_actor_id uuid NOT NULL,
  current_version bigint NOT NULL DEFAULT 1 CHECK (current_version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, archived_at timestamptz,
  UNIQUE (project_id, name), CHECK (updated_at >= created_at), CHECK (archived_at IS NULL OR archived_at >= created_at)
);

CREATE TABLE work.workflow_versions (
  workflow_definition_id uuid NOT NULL REFERENCES work.workflow_definitions(id) ON DELETE CASCADE,
  version bigint NOT NULL CHECK (version > 0), definition jsonb NOT NULL,
  definition_hash text NOT NULL CHECK (length(trim(definition_hash)) > 0), created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workflow_definition_id, version)
);

CREATE TABLE work.workflow_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES core.projects(id),
  workflow_definition_id uuid NOT NULL, workflow_version bigint NOT NULL,
  owner_actor_type text NOT NULL CHECK (owner_actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')), owner_actor_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('RUNNING', 'WAITING_DEPENDENCY', 'WAITING_HUMAN', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED')),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0), idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0), created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at timestamptz,
  FOREIGN KEY (workflow_definition_id, workflow_version) REFERENCES work.workflow_versions(workflow_definition_id, version),
  UNIQUE (project_id, idempotency_key), CHECK (updated_at >= created_at), CHECK (completed_at IS NULL OR completed_at >= created_at)
);

CREATE TABLE work.workflow_step_instances (
  workflow_instance_id uuid NOT NULL REFERENCES work.workflow_instances(id) ON DELETE CASCADE,
  step_key text NOT NULL CHECK (length(trim(step_key)) > 0), position integer NOT NULL CHECK (position >= 0),
  gate text NOT NULL CHECK (gate IN ('DEPENDENCY_GATE', 'REVIEW_GATE', 'APPROVAL_GATE', 'SECURITY_GATE', 'HUMAN_INPUT_GATE')),
  task_id uuid REFERENCES work.tasks(id), status text NOT NULL CHECK (status IN ('READY', 'RUNNING', 'WAITING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0), created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workflow_instance_id, step_key), UNIQUE (workflow_instance_id, position), CHECK (updated_at >= created_at)
);

CREATE TABLE audit.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK (name ~ '^[A-Z][A-Z0-9_]*\.[A-Z][A-Z0-9_]*$'),
  aggregate_type text NOT NULL CHECK (aggregate_type IN ('PROJECT', 'TASK', 'WORKFLOW')), aggregate_id uuid NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')), actor_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES core.projects(id), task_id uuid REFERENCES work.tasks(id), workflow_instance_id uuid REFERENCES work.workflow_instances(id),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0), idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb, occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (aggregate_type, aggregate_id, idempotency_key)
);
