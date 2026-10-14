CREATE TABLE work.development_delegations (
  delegation_id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES work.requests(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES core.projects(id) ON DELETE RESTRICT,
  routing_decision_id uuid NOT NULL
    REFERENCES governance.request_routing_decision_versions(routing_decision_id)
    ON DELETE RESTRICT,
  aidos_project_ref text,
  delegation_request_id text,
  status text NOT NULL CHECK (status IN (
    'PENDING','WAITING_APPROVAL','READY_TO_DELEGATE','DELEGATED','RUNNING',
    'SUCCEEDED','FAILED','BLOCKED'
  )),
  external_delegation_ref text,
  result_ref text,
  failure_code text,
  human_action_required boolean NOT NULL DEFAULT false,
  authority_evidence_ref text,
  idempotency_key text NOT NULL UNIQUE,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (routing_decision_id),
  CHECK ((aidos_project_ref IS NULL) = (delegation_request_id IS NULL)),
  CHECK (
    (status = 'SUCCEEDED' AND result_ref IS NOT NULL AND failure_code IS NULL)
    OR (status IN ('FAILED','BLOCKED') AND failure_code IS NOT NULL)
    OR (status NOT IN ('SUCCEEDED','FAILED','BLOCKED') AND result_ref IS NULL AND failure_code IS NULL)
  ),
  CHECK (
    status NOT IN ('DELEGATED','RUNNING','SUCCEEDED','FAILED')
    OR external_delegation_ref IS NOT NULL
  ),
  CHECK (status <> 'WAITING_APPROVAL' OR human_action_required = true)
);

CREATE INDEX development_delegations_request_status_idx
  ON work.development_delegations(request_id,status,updated_at DESC);

REVOKE ALL ON TABLE work.development_delegations FROM PUBLIC;
