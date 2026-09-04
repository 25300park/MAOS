CREATE TABLE execution.run_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES execution.runs(id),
  task_id uuid NOT NULL REFERENCES work.tasks(id),
  project_id uuid NOT NULL REFERENCES core.projects(id),
  agent_id uuid NOT NULL REFERENCES ai.agents(id),
  system_id text NOT NULL REFERENCES integration.systems(id),
  gateway_id uuid NOT NULL REFERENCES integration.memory_gateways(id),
  status text NOT NULL CHECK (status IN ('READY', 'DEGRADED', 'FAILED')),
  requested_categories text[] NOT NULL CHECK (cardinality(requested_categories) > 0),
  requested_classifications text[] NOT NULL CHECK (cardinality(requested_classifications) > 0),
  memory_reference_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  degraded_reasons text[] NOT NULL DEFAULT ARRAY[]::text[],
  request_id text NOT NULL CHECK (length(trim(request_id)) > 0),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  assembled_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (task_id, request_id),
  CHECK (expires_at > assembled_at),
  CHECK (NOT ('PRIVATE_PERSONAL' = ANY(requested_classifications)))
);

CREATE TABLE knowledge.memory_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL REFERENCES integration.memory_gateways(id),
  project_id uuid NOT NULL REFERENCES core.projects(id),
  task_id uuid NOT NULL REFERENCES work.tasks(id),
  created_by_actor_type text NOT NULL CHECK (created_by_actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  created_by_actor_id uuid NOT NULL,
  content_reference text NOT NULL CHECK (content_reference ~ '^artifact://'),
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[a-f0-9]{64}$'),
  memory_type text NOT NULL CHECK (memory_type IN (
    'CORPORATE', 'DEPARTMENT', 'PROJECT', 'AGENT', 'TASK',
    'DECISION', 'POLICY', 'OPERATIONAL', 'INTEGRATION'
  )),
  status text NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'MERGED', 'EXPIRED')),
  validation text NOT NULL CHECK (validation IN (
    'UNVERIFIED', 'SYSTEM_VERIFIED', 'AGENT_VERIFIED',
    'HUMAN_VERIFIED', 'AUTHORITATIVE'
  )),
  evidence_ids text[] NOT NULL CHECK (cardinality(evidence_ids) > 0),
  reviewed_by_actor_id uuid,
  merged_external_memory_id text,
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at timestamptz,
  merged_at timestamptz,
  CHECK ((status IN ('APPROVED', 'REJECTED', 'MERGED')) = (reviewed_by_actor_id IS NOT NULL)),
  CHECK ((status = 'MERGED') = (merged_external_memory_id IS NOT NULL)),
  CHECK ((status = 'MERGED') = (merged_at IS NOT NULL)),
  CHECK (reviewed_at IS NULL OR reviewed_at >= created_at),
  CHECK (merged_at IS NULL OR merged_at >= created_at)
);
