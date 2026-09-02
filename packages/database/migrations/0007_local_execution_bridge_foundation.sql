CREATE TABLE execution.local_runner_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL CHECK (length(trim(device_id)) > 0),
  identity_id text NOT NULL CHECK (length(trim(identity_id)) > 0),
  runner_id uuid NOT NULL REFERENCES execution.runners(id),
  provider_id uuid NOT NULL REFERENCES execution.tool_providers(id),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED')),
  health text NOT NULL CHECK (health IN (
    'HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'MAINTENANCE', 'UNKNOWN'
  )),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  last_health_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at timestamptz,
  UNIQUE (device_id, runner_id),
  CHECK (updated_at >= created_at),
  CHECK (last_health_at IS NULL OR last_health_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK ((status = 'REVOKED') OR revoked_at IS NULL)
);

CREATE TABLE execution.local_runner_workroots (
  local_runner_id uuid NOT NULL
    REFERENCES execution.local_runner_registrations(id) ON DELETE CASCADE,
  workroot text NOT NULL CHECK (length(trim(workroot)) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (local_runner_id, workroot)
);

CREATE TABLE execution.local_runner_capabilities (
  local_runner_id uuid NOT NULL
    REFERENCES execution.local_runner_registrations(id) ON DELETE CASCADE,
  capability text NOT NULL CHECK (capability IN (
    'READ_FILE', 'WRITE_FILE', 'RUN_COMMAND', 'GIT_STATUS', 'GIT_DIFF'
  )),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (local_runner_id, capability)
);

CREATE TABLE execution.local_runner_command_policies (
  local_runner_id uuid NOT NULL
    REFERENCES execution.local_runner_registrations(id) ON DELETE CASCADE,
  command text NOT NULL CHECK (length(trim(command)) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (local_runner_id, command)
);

CREATE TABLE execution.local_task_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_runner_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES work.tasks(id),
  run_id uuid NOT NULL REFERENCES execution.runs(id),
  workroot text NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at timestamptz,
  FOREIGN KEY (local_runner_id, workroot)
    REFERENCES execution.local_runner_workroots(local_runner_id, workroot),
  UNIQUE (local_runner_id, run_id),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK ((status = 'REVOKED') OR revoked_at IS NULL)
);
