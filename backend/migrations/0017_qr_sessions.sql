SET TIME ZONE 'UTC';

-- QR sessions are created before the browser has a tenant or user identity.
-- A verified Firebase user may claim the opaque session id; the legacy profile
-- id is retained only until the remaining user profiles are migrated.
CREATE TABLE IF NOT EXISTS iam.qr_sessions (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  legacy_profile_id varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  CONSTRAINT qr_sessions_expiry_ck CHECK (expires_at > created_at),
  CONSTRAINT qr_sessions_claim_ck CHECK (
    (legacy_profile_id IS NULL AND claimed_at IS NULL)
    OR (legacy_profile_id IS NOT NULL AND claimed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS qr_sessions_expires_at_idx ON iam.qr_sessions (expires_at);

ALTER TABLE iam.qr_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.qr_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE iam.qr_sessions OWNER TO sensible_rls_owner;
REVOKE ALL ON iam.qr_sessions FROM PUBLIC, sensible_app_role;

CREATE OR REPLACE FUNCTION iam.create_qr_session(requested_ttl_seconds integer DEFAULT 30)
RETURNS TABLE (id uuid, created_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, iam, public
AS $$
BEGIN
  IF requested_ttl_seconds < 5 OR requested_ttl_seconds > 300 THEN
    RAISE EXCEPTION 'QR session TTL must be between 5 and 300 seconds';
  END IF;

  DELETE FROM iam.qr_sessions session
  WHERE session.expires_at < now() - interval '1 day';

  RETURN QUERY
  INSERT INTO iam.qr_sessions (expires_at)
  VALUES (now() + make_interval(secs => requested_ttl_seconds))
  RETURNING qr_sessions.id, qr_sessions.created_at, qr_sessions.expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION iam.get_qr_session(requested_id uuid)
RETURNS TABLE (
  id uuid,
  legacy_profile_id varchar,
  status text,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, iam
AS $$
  SELECT
    session.id,
    CASE WHEN session.expires_at > now() THEN session.legacy_profile_id ELSE NULL END,
    CASE
      WHEN session.expires_at <= now() THEN 'EXPIRED'
      WHEN session.claimed_at IS NOT NULL THEN 'CLAIMED'
      ELSE 'PENDING'
    END,
    session.created_at,
    session.expires_at
  FROM iam.qr_sessions session
  WHERE session.id = requested_id
$$;

CREATE OR REPLACE FUNCTION iam.claim_qr_session(requested_id uuid, requested_legacy_profile_id varchar)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, iam
AS $$
  WITH claimed AS (
    UPDATE iam.qr_sessions
    SET legacy_profile_id = requested_legacy_profile_id, claimed_at = now()
    WHERE id = requested_id
      AND expires_at > now()
      AND claimed_at IS NULL
      AND length(btrim(requested_legacy_profile_id)) BETWEEN 1 AND 128
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM claimed)
$$;

ALTER FUNCTION iam.create_qr_session(integer) OWNER TO sensible_rls_owner;
ALTER FUNCTION iam.get_qr_session(uuid) OWNER TO sensible_rls_owner;
ALTER FUNCTION iam.claim_qr_session(uuid, varchar) OWNER TO sensible_rls_owner;
REVOKE ALL ON FUNCTION iam.create_qr_session(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION iam.get_qr_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION iam.claim_qr_session(uuid, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION iam.create_qr_session(integer) TO sensible_app_role;
GRANT EXECUTE ON FUNCTION iam.get_qr_session(uuid) TO sensible_app_role;
GRANT EXECUTE ON FUNCTION iam.claim_qr_session(uuid, varchar) TO sensible_app_role;
