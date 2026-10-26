-- Review only, unapplied: bounded Staging initial-password authorization.
CREATE TABLE identity.password_setup_authorizations (
  id uuid PRIMARY KEY,
  purpose text NOT NULL DEFAULT 'INITIAL_PASSWORD_SETUP' CHECK (purpose = 'INITIAL_PASSWORD_SETUP'),
  login_identifier text NOT NULL CHECK (login_identifier = lower(login_identifier) AND length(login_identifier) BETWEEN 3 AND 254 AND login_identifier !~ '[[:space:]]'),
  human_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  token_digest text NOT NULL UNIQUE CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  authorized_by uuid NOT NULL REFERENCES identity.humans(id),
  authorization_ref text NOT NULL CHECK (authorization_ref ~ '^evidence://[A-Za-z0-9/_.:-]+$'),
  environment text NOT NULL DEFAULT 'staging' CHECK (environment='staging'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  FOREIGN KEY (organization_id,human_id) REFERENCES identity.humans(organization_id,id),
  CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '15 minutes'),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

-- Dedicated non-login owner; a pre-existing name is a deployment blocker.
CREATE ROLE maos_staging_setup_lock_owner NOLOGIN NOSUPERUSER NOINHERIT
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA identity, core TO maos_staging_setup_lock_owner;
GRANT SELECT(id, organization_id, archived_at), UPDATE(id)
  ON identity.humans TO maos_staging_setup_lock_owner;
GRANT SELECT(id, archived_at), UPDATE(id)
  ON core.organizations TO maos_staging_setup_lock_owner;
GRANT SELECT(id, human_id, organization_id, token_digest, environment,
  created_at, expires_at, consumed_at)
  ON identity.password_setup_authorizations TO maos_staging_setup_lock_owner;

CREATE FUNCTION identity.lock_native_login_setup_subject(
  p_human_id uuid, p_organization_id uuid, p_setup_id uuid, p_token_digest text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM h.id
  FROM identity.humans AS h
  JOIN core.organizations AS o ON o.id = h.organization_id
  JOIN identity.password_setup_authorizations AS a
    ON a.human_id = h.id AND a.organization_id = o.id
  WHERE h.id = p_human_id AND o.id = p_organization_id
    AND h.archived_at IS NULL AND o.archived_at IS NULL
    AND a.id = p_setup_id AND a.token_digest = p_token_digest
    AND a.environment = 'staging' AND a.consumed_at IS NULL
    AND a.created_at <= pg_catalog.clock_timestamp()
    AND a.expires_at > pg_catalog.clock_timestamp()
  FOR SHARE OF h, o;
  RETURN FOUND;
END;
$$;
ALTER FUNCTION identity.lock_native_login_setup_subject(uuid,uuid,uuid,text)
  OWNER TO maos_staging_setup_lock_owner;
REVOKE ALL ON FUNCTION identity.lock_native_login_setup_subject(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.lock_native_login_setup_subject(uuid,uuid,uuid,text)
  TO maos_staging_runtime;
