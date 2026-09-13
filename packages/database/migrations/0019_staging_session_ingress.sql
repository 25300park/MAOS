CREATE UNIQUE INDEX identity_humans_organization_id_id_uidx
  ON identity.humans (organization_id, id);

CREATE TABLE identity.human_project_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  project_id uuid NOT NULL,
  scope text NOT NULL CHECK (
    length(trim(scope)) > 0
    AND scope = trim(scope)
    AND scope !~ '[*?]'
  ),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at timestamptz,
  UNIQUE (human_id, organization_id, project_id, scope),
  FOREIGN KEY (organization_id, human_id)
    REFERENCES identity.humans(organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES core.projects(organization_id, id),
  CHECK (updated_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE identity.assignment_permissions (
  assignment_id uuid NOT NULL
    REFERENCES identity.human_project_assignments(id),
  action text NOT NULL,
  resource text NOT NULL,
  environment text NOT NULL CHECK (environment = 'staging'),
  risk text NOT NULL CHECK (risk = 'R2'),
  effect text NOT NULL CHECK (effect IN ('ALLOW', 'DENY')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (assignment_id, action, resource, environment, risk, effect)
);

CREATE TABLE identity.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  tenant_binding_origin text NOT NULL CHECK (
    length(trim(tenant_binding_origin)) > 0
    AND tenant_binding_origin = trim(tenant_binding_origin)
  ),
  tenant_binding_ref text CHECK (
    tenant_binding_ref IS NULL
    OR (
      length(trim(tenant_binding_ref)) > 0
      AND tenant_binding_ref = trim(tenant_binding_ref)
    )
  ),
  issued_at timestamptz NOT NULL,
  last_accessed_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  session_version bigint NOT NULL DEFAULT 1 CHECK (session_version > 0),
  revoked_at timestamptz,
  revocation_evidence_ref text CHECK (
    revocation_evidence_ref IS NULL
    OR length(trim(revocation_evidence_ref)) > 0
  ),
  audit_evidence_ref text CHECK (
    audit_evidence_ref IS NULL
    OR length(trim(audit_evidence_ref)) > 0
  ),
  mfa_verified_at timestamptz,
  mfa_verification_ref text CHECK (
    mfa_verification_ref IS NULL
    OR length(trim(mfa_verification_ref)) > 0
  ),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id, actor_id)
    REFERENCES identity.humans(organization_id, id),
  CHECK (last_accessed_at >= issued_at),
  CHECK (absolute_expires_at = issued_at + INTERVAL '12 hours'),
  CHECK ((mfa_verified_at IS NULL) = (mfa_verification_ref IS NULL)),
  CHECK ((revoked_at IS NULL) = (revocation_evidence_ref IS NULL)),
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at),
  CHECK (updated_at >= created_at)
);

CREATE TABLE identity.session_revocations (
  session_id uuid NOT NULL REFERENCES identity.sessions(id),
  revoked_version bigint NOT NULL CHECK (revoked_version > 1),
  revoked_at timestamptz NOT NULL,
  actor_id uuid NOT NULL REFERENCES identity.humans(id),
  evidence_ref text NOT NULL CHECK (length(trim(evidence_ref)) > 0),
  PRIMARY KEY (session_id, revoked_version)
);

CREATE OR REPLACE FUNCTION identity.protect_session_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.session_version <> 1 THEN
      RAISE EXCEPTION 'new sessions must start at version 1';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.actor_id IS DISTINCT FROM NEW.actor_id
    OR OLD.organization_id IS DISTINCT FROM NEW.organization_id
    OR OLD.tenant_binding_origin IS DISTINCT FROM NEW.tenant_binding_origin
    OR OLD.tenant_binding_ref IS DISTINCT FROM NEW.tenant_binding_ref
    OR OLD.issued_at IS DISTINCT FROM NEW.issued_at
    OR OLD.absolute_expires_at IS DISTINCT FROM NEW.absolute_expires_at
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'session binding and issuance fields are immutable';
  END IF;

  IF OLD.revoked_at IS NOT NULL
    AND (
      OLD.revoked_at IS DISTINCT FROM NEW.revoked_at
      OR OLD.revocation_evidence_ref IS DISTINCT FROM NEW.revocation_evidence_ref
    )
  THEN
    RAISE EXCEPTION 'session revocation is irreversible';
  END IF;

  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'revoked sessions are immutable';
  END IF;

  IF NEW.session_version <> OLD.session_version + 1 THEN
    RAISE EXCEPTION 'session version must increase by exactly one';
  END IF;

  IF NEW.last_accessed_at < OLD.last_accessed_at THEN
    RAISE EXCEPTION 'session access time cannot move backwards';
  END IF;

  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sessions_protect_lifecycle_insert
BEFORE INSERT ON identity.sessions
FOR EACH ROW EXECUTE FUNCTION identity.protect_session_lifecycle();

CREATE TRIGGER sessions_protect_lifecycle_update
BEFORE UPDATE ON identity.sessions
FOR EACH ROW EXECUTE FUNCTION identity.protect_session_lifecycle();

CREATE OR REPLACE FUNCTION identity.reject_session_revocation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'session revocations are append-only';
END;
$$;

CREATE TRIGGER session_revocations_reject_update
BEFORE UPDATE ON identity.session_revocations
FOR EACH ROW EXECUTE FUNCTION identity.reject_session_revocation_mutation();

CREATE TRIGGER session_revocations_reject_delete
BEFORE DELETE ON identity.session_revocations
FOR EACH ROW EXECUTE FUNCTION identity.reject_session_revocation_mutation();

CREATE INDEX identity_humans_active_external_subject_idx
  ON identity.humans (external_subject)
  WHERE external_subject IS NOT NULL AND archived_at IS NULL;

CREATE INDEX human_project_assignments_active_idx
  ON identity.human_project_assignments (human_id, project_id, scope)
  WHERE revoked_at IS NULL;

CREATE INDEX sessions_actor_idx
  ON identity.sessions (actor_id, created_at DESC);

CREATE INDEX sessions_active_resolution_idx
  ON identity.sessions (id, session_version, absolute_expires_at)
  WHERE revoked_at IS NULL;
