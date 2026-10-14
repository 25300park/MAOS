CREATE TABLE work.project_development_statuses (
  project_id uuid PRIMARY KEY REFERENCES core.projects(id) ON DELETE CASCADE,
  mvp_goal text NOT NULL CHECK (length(trim(mvp_goal)) > 0),
  current_phase text NOT NULL CHECK (length(trim(current_phase)) > 0),
  current_task text NOT NULL CHECK (length(trim(current_task)) > 0),
  status text NOT NULL CHECK (status IN (
    'NOT_STARTED', 'IN_PROGRESS', 'BLOCKED',
    'WAITING_HUMAN', 'COMPLETE', 'HOLD'
  )),
  progress_percent integer NOT NULL CHECK (progress_percent BETWEEN 0 AND 100),
  expected_duration_ms bigint NOT NULL CHECK (expected_duration_ms > 0),
  phase_started_at timestamptz NOT NULL,
  latest_commit text CHECK (
    latest_commit IS NULL OR length(trim(latest_commit)) > 0
  ),
  last_successful_verification timestamptz,
  p0_blockers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(p0_blockers) = 'array'
  ),
  p1_backlog_count integer NOT NULL DEFAULT 0 CHECK (p1_backlog_count >= 0),
  review_count integer NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  revision_count integer NOT NULL DEFAULT 0 CHECK (revision_count >= 0),
  next_action text NOT NULL CHECK (length(trim(next_action)) > 0),
  human_action_required text CHECK (
    human_action_required IS NULL OR length(trim(human_action_required)) > 0
  ),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX project_development_statuses_status_idx
  ON work.project_development_statuses(status, updated_at DESC);

REVOKE ALL ON work.project_development_statuses FROM PUBLIC;
