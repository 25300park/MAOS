ALTER TABLE governance.approvals
  ADD COLUMN target_hash text NOT NULL CHECK (length(trim(target_hash)) > 0),
  ADD COLUMN requested_by_actor_type text NOT NULL CHECK (
    requested_by_actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')
  ),
  ADD COLUMN requested_by_actor_id uuid NOT NULL,
  ADD COLUMN approved_by_actor_type text CHECK (
    approved_by_actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')
  ),
  ADD COLUMN approved_by_actor_id uuid,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN consumed_at timestamptz,
  ADD COLUMN correlation_id uuid,
  ADD CONSTRAINT approvals_approver_complete CHECK (
    (approved_by_actor_type IS NULL) = (approved_by_actor_id IS NULL)
  ),
  ADD CONSTRAINT approvals_separation_of_duties CHECK (
    approved_by_actor_id IS NULL OR approved_by_actor_id <> requested_by_actor_id
  ),
  ADD CONSTRAINT approvals_expiration_after_creation CHECK (
    expires_at IS NULL OR expires_at > created_at
  ),
  ADD CONSTRAINT approvals_consumption_requires_approval CHECK (
    consumed_at IS NULL OR status = 'APPROVED'
  );

CREATE TABLE governance.authority_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text CHECK (actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  actor_id uuid,
  action text NOT NULL CHECK (length(trim(action)) > 0),
  effect text NOT NULL CHECK (
    effect IN ('ALLOW', 'DENY', 'REQUIRE_ADDITIONAL_APPROVAL')
  ),
  environment text NOT NULL CHECK (length(trim(environment)) > 0),
  resource text NOT NULL CHECK (length(trim(resource)) > 0),
  risk text NOT NULL CHECK (risk IN ('R0', 'R1', 'R2', 'R3', 'R4')),
  scope text NOT NULL CHECK (length(trim(scope)) > 0),
  valid_from timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  valid_until timestamptz,
  revoked_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  CHECK ((actor_type IS NULL) = (actor_id IS NULL)),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (revoked_at IS NULL OR revoked_at >= valid_from),
  CHECK (updated_at >= created_at),
  CHECK (archived_at IS NULL OR archived_at >= created_at)
);
