CREATE TABLE work.multi_ai_handoffs (
  handoff_id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES work.requests(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES core.projects(id) ON DELETE RESTRICT,
  source_role text NOT NULL CHECK (source_role IN (
    'PLANNER','EXECUTOR','RESEARCHER','ANALYST','WRITER','REVIEWER'
  )),
  target_role text NOT NULL CHECK (target_role IN (
    'PLANNER','EXECUTOR','RESEARCHER','ANALYST','WRITER','REVIEWER'
  )),
  status text NOT NULL CHECK (status IN (
    'PENDING','IN_PROGRESS','SUCCEEDED','FAILED'
  )),
  context_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  artifact_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  result_ref text,
  failure_reason text,
  idempotency_key text NOT NULL UNIQUE,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (source_role = 'PLANNER' AND target_role = 'EXECUTOR'),
  CHECK (source_role <> target_role),
  CHECK (
    (status = 'SUCCEEDED' AND result_ref IS NOT NULL AND failure_reason IS NULL)
    OR (status = 'FAILED' AND result_ref IS NULL AND failure_reason IS NOT NULL)
    OR (status IN ('PENDING','IN_PROGRESS') AND result_ref IS NULL AND failure_reason IS NULL)
  )
);

CREATE INDEX multi_ai_handoffs_request_status_idx
  ON work.multi_ai_handoffs(request_id,status,updated_at DESC);

REVOKE ALL ON TABLE work.multi_ai_handoffs FROM PUBLIC;
