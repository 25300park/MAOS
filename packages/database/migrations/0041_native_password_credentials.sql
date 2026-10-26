-- REVIEW ONLY: no real database application authorized.
CREATE TABLE identity.password_credentials (
  login_identifier text PRIMARY KEY CHECK (login_identifier = lower(login_identifier) AND length(login_identifier) BETWEEN 3 AND 254 AND login_identifier !~ '[[:space:]]'),
  human_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  password_hash text NOT NULL CHECK (password_hash ~ '^\$argon2id\$v=19\$m=19456,p=1,t=2\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$'),
  state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','REVOKED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at timestamptz,
  FOREIGN KEY (organization_id, human_id) REFERENCES identity.humans(organization_id, id),
  CHECK (updated_at >= created_at),
  CHECK ((state='ACTIVE' AND revoked_at IS NULL) OR (state='REVOKED' AND revoked_at IS NOT NULL AND revoked_at >= created_at))
);
-- No grants, seed accounts, passwords or automatic enrollment.
