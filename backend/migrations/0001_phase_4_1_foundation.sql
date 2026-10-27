SET TIME ZONE 'UTC';

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS ltree;

-- Spatial search and embeddings are optional capabilities. The current CRM
-- schema does not declare geometry/geography/vector columns, so a PostgreSQL
-- installation without these extension packages must still be able to run.
DO $$
DECLARE extension_name text;
BEGIN
  FOREACH extension_name IN ARRAY ARRAY['postgis', 'vector'] LOOP
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = extension_name) THEN
      EXECUTE format('CREATE EXTENSION IF NOT EXISTS %I', extension_name);
    ELSE
      RAISE NOTICE 'Optional extension % is not installed on this PostgreSQL server; skipping', extension_name;
    END IF;
  END LOOP;
END $$;

CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS tenancy;

-- These roles must exist before any schema grants or SECURITY DEFINER ownership
-- changes reference them later in this migration.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sensible_app_role') THEN
    CREATE ROLE sensible_app_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sensible_rls_owner') THEN
    CREATE ROLE sensible_rls_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
  END IF;
END $$;

-- Managed PostgreSQL administrators (including Cloud SQL's firebasesuperuser)
-- are not true superusers. Membership is required before functions can be
-- reassigned to the dedicated BYPASSRLS owner role.
GRANT sensible_rls_owner TO CURRENT_USER WITH ADMIN OPTION;

CREATE OR REPLACE FUNCTION public.uuid_generate_v7()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
DECLARE
  unix_milliseconds bigint := floor(extract(epoch FROM clock_timestamp()) * 1000);
  uuid_bytes bytea := decode(lpad(to_hex(unix_milliseconds), 12, '0'), 'hex') || public.gen_random_bytes(10);
BEGIN
  uuid_bytes := set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);
  uuid_bytes := set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);
  RETURN encode(uuid_bytes, 'hex')::uuid;
END;
$$;

DO $$ BEGIN
  CREATE TYPE iam.credential_state AS ENUM ('legacy', 'argon2id');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT USAGE, CREATE ON SCHEMA iam, tenancy TO sensible_rls_owner;

CREATE TABLE tenancy.tenants (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  legacy_id varchar(64),
  name text NOT NULL,
  slug varchar(128) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_slug_uq UNIQUE (slug)
);
CREATE UNIQUE INDEX tenants_legacy_id_uq ON tenancy.tenants (legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX tenants_active_idx ON tenancy.tenants (active);

CREATE TABLE tenancy.businesses (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  legacy_id varchar(64),
  name text NOT NULL,
  legal_name text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT businesses_tenant_id_id_uq UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX businesses_tenant_legacy_id_uq ON tenancy.businesses (tenant_id, legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX businesses_tenant_active_idx ON tenancy.businesses (tenant_id, active);

CREATE TABLE tenancy.outlets (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL,
  business_id uuid NOT NULL,
  legacy_id varchar(64),
  outlet_code varchar(64) NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outlets_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT outlets_tenant_code_uq UNIQUE (tenant_id, outlet_code),
  CONSTRAINT outlets_business_tenant_fk FOREIGN KEY (tenant_id, business_id)
    REFERENCES tenancy.businesses(tenant_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX outlets_tenant_legacy_id_uq ON tenancy.outlets (tenant_id, legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX outlets_business_idx ON tenancy.outlets (business_id);
CREATE INDEX outlets_tenant_active_idx ON tenancy.outlets (tenant_id, active);

CREATE TABLE iam.permissions (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  legacy_id varchar(64),
  permission_key varchar(160) NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permissions_key_uq UNIQUE (permission_key)
);
CREATE UNIQUE INDEX permissions_legacy_id_uq ON iam.permissions (legacy_id) WHERE legacy_id IS NOT NULL;

CREATE TABLE iam.roles (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  legacy_id varchar(64),
  name varchar(128) NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT roles_tenant_name_uq UNIQUE (tenant_id, name)
);
CREATE UNIQUE INDEX roles_tenant_legacy_id_uq ON iam.roles (tenant_id, legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX roles_tenant_active_idx ON iam.roles (tenant_id, active);

CREATE TABLE iam.role_permissions (
  tenant_id uuid NOT NULL,
  role_id uuid NOT NULL,
  permission_id uuid NOT NULL REFERENCES iam.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_permissions_role_permission_uq UNIQUE (role_id, permission_id),
  CONSTRAINT role_permissions_role_tenant_fk FOREIGN KEY (tenant_id, role_id)
    REFERENCES iam.roles(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX role_permissions_tenant_idx ON iam.role_permissions (tenant_id);
CREATE INDEX role_permissions_permission_idx ON iam.role_permissions (permission_id);

CREATE TABLE iam.users (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  legacy_id varchar(64),
  email varchar(320),
  phone varchar(32),
  display_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_identifier_ck CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CONSTRAINT users_email_normalized_ck CHECK (email IS NULL OR email = lower(email))
);
CREATE UNIQUE INDEX users_email_uq ON iam.users (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_phone_uq ON iam.users (phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX users_legacy_id_uq ON iam.users (legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX users_active_idx ON iam.users (active);

CREATE TABLE iam.user_credentials (
  user_id uuid PRIMARY KEY REFERENCES iam.users(id) ON DELETE CASCADE,
  password_hash text,
  state iam.credential_state NOT NULL DEFAULT 'legacy',
  migrated_at timestamptz,
  password_changed_at timestamptz,
  refresh_token_version integer NOT NULL DEFAULT 0,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_credentials_state_hash_ck CHECK (
    (state = 'legacy' AND password_hash IS NULL) OR
    (state = 'argon2id' AND password_hash LIKE '$argon2id$%')
  )
);

CREATE TABLE tenancy.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  is_tenant_admin boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_memberships_tenant_user_uq UNIQUE (tenant_id, user_id)
);
CREATE INDEX tenant_memberships_user_active_idx ON tenancy.tenant_memberships (user_id, active);
CREATE INDEX tenant_memberships_tenant_active_idx ON tenancy.tenant_memberships (tenant_id, active);

CREATE TABLE tenancy.outlet_assignments (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outlet_assignments_outlet_user_role_uq UNIQUE (outlet_id, user_id, role_id),
  CONSTRAINT outlet_assignments_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT outlet_assignments_membership_fk FOREIGN KEY (tenant_id, user_id)
    REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE CASCADE,
  CONSTRAINT outlet_assignments_role_tenant_fk FOREIGN KEY (tenant_id, role_id)
    REFERENCES iam.roles(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX outlet_assignments_user_active_idx ON tenancy.outlet_assignments (user_id, active);
CREATE INDEX outlet_assignments_tenant_outlet_active_idx ON tenancy.outlet_assignments (tenant_id, outlet_id, active);

CREATE TABLE tenancy.outlet_features (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  feature_key varchar(128) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outlet_features_outlet_key_uq UNIQUE (outlet_id, feature_key),
  CONSTRAINT outlet_features_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT outlet_features_key_format_ck CHECK (feature_key ~ '^[a-z][a-z0-9_.-]*$')
);
CREATE INDEX outlet_features_tenant_enabled_idx ON tenancy.outlet_features (tenant_id, enabled);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenancy.tenants', 'tenancy.businesses', 'tenancy.outlets',
    'iam.permissions', 'iam.roles', 'iam.users', 'iam.user_credentials',
    'tenancy.tenant_memberships', 'tenancy.outlet_assignments', 'tenancy.outlet_features'
  ] LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION tenancy.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT nullif(current_setting('app.current_tenant_id', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION iam.current_user_id()
RETURNS uuid LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION iam.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT coalesce(nullif(current_setting('app.is_super_admin', true), '')::boolean, false)
$$;

CREATE OR REPLACE FUNCTION tenancy.has_tenant_access(requested_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, tenancy, iam
AS $$
  SELECT iam.is_super_admin() OR (
    requested_tenant_id = tenancy.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM tenancy.tenant_memberships membership
      WHERE membership.tenant_id = requested_tenant_id
        AND membership.user_id = iam.current_user_id()
        AND membership.active
    )
  )
$$;

CREATE OR REPLACE FUNCTION tenancy.is_tenant_admin(requested_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, tenancy, iam
AS $$
  SELECT iam.is_super_admin() OR (
    requested_tenant_id = tenancy.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM tenancy.tenant_memberships membership
      WHERE membership.tenant_id = requested_tenant_id
        AND membership.user_id = iam.current_user_id()
        AND membership.active AND membership.is_tenant_admin
    )
  )
$$;

CREATE OR REPLACE FUNCTION tenancy.can_access_outlet(requested_tenant_id uuid, requested_outlet_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, tenancy, iam
AS $$
  SELECT tenancy.is_tenant_admin(requested_tenant_id) OR (
    tenancy.has_tenant_access(requested_tenant_id)
    AND EXISTS (
      SELECT 1 FROM tenancy.outlet_assignments assignment
      WHERE assignment.tenant_id = requested_tenant_id
        AND assignment.outlet_id = requested_outlet_id
        AND assignment.user_id = iam.current_user_id()
        AND assignment.active
    )
  )
$$;

ALTER FUNCTION tenancy.has_tenant_access(uuid) OWNER TO sensible_rls_owner;
ALTER FUNCTION tenancy.is_tenant_admin(uuid) OWNER TO sensible_rls_owner;
ALTER FUNCTION tenancy.can_access_outlet(uuid, uuid) OWNER TO sensible_rls_owner;
GRANT USAGE ON SCHEMA iam, tenancy TO sensible_rls_owner;
GRANT SELECT ON ALL TABLES IN SCHEMA iam, tenancy TO sensible_rls_owner;

ALTER TABLE tenancy.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_select ON tenancy.tenants FOR SELECT USING (tenancy.has_tenant_access(id));
CREATE POLICY tenants_update ON tenancy.tenants FOR UPDATE USING (tenancy.is_tenant_admin(id)) WITH CHECK (tenancy.is_tenant_admin(id));
CREATE POLICY tenants_insert ON tenancy.tenants FOR INSERT WITH CHECK (iam.is_super_admin());
CREATE POLICY tenants_delete ON tenancy.tenants FOR DELETE USING (iam.is_super_admin());

ALTER TABLE tenancy.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.businesses FORCE ROW LEVEL SECURITY;
CREATE POLICY businesses_select ON tenancy.businesses FOR SELECT USING (tenancy.has_tenant_access(tenant_id));
CREATE POLICY businesses_insert ON tenancy.businesses FOR INSERT WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY businesses_update ON tenancy.businesses FOR UPDATE USING (tenancy.is_tenant_admin(tenant_id)) WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY businesses_delete ON tenancy.businesses FOR DELETE USING (tenancy.is_tenant_admin(tenant_id));

ALTER TABLE tenancy.outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.outlets FORCE ROW LEVEL SECURITY;
CREATE POLICY outlets_select ON tenancy.outlets FOR SELECT USING (tenancy.can_access_outlet(tenant_id, id));
CREATE POLICY outlets_insert ON tenancy.outlets FOR INSERT WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY outlets_update ON tenancy.outlets FOR UPDATE USING (tenancy.is_tenant_admin(tenant_id)) WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY outlets_delete ON tenancy.outlets FOR DELETE USING (tenancy.is_tenant_admin(tenant_id));

ALTER TABLE iam.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.roles FORCE ROW LEVEL SECURITY;
CREATE POLICY roles_select ON iam.roles FOR SELECT USING (tenancy.has_tenant_access(tenant_id));
CREATE POLICY roles_insert ON iam.roles FOR INSERT WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY roles_update ON iam.roles FOR UPDATE USING (tenancy.is_tenant_admin(tenant_id)) WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY roles_delete ON iam.roles FOR DELETE USING (tenancy.is_tenant_admin(tenant_id));

ALTER TABLE iam.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.role_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY role_permissions_select ON iam.role_permissions FOR SELECT USING (tenancy.has_tenant_access(tenant_id));
CREATE POLICY role_permissions_insert ON iam.role_permissions FOR INSERT WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY role_permissions_update ON iam.role_permissions FOR UPDATE USING (tenancy.is_tenant_admin(tenant_id)) WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY role_permissions_delete ON iam.role_permissions FOR DELETE USING (tenancy.is_tenant_admin(tenant_id));

ALTER TABLE tenancy.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.tenant_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_select ON tenancy.tenant_memberships FOR SELECT USING (tenancy.has_tenant_access(tenant_id));
CREATE POLICY memberships_insert ON tenancy.tenant_memberships FOR INSERT WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY memberships_update ON tenancy.tenant_memberships FOR UPDATE USING (tenancy.is_tenant_admin(tenant_id)) WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY memberships_delete ON tenancy.tenant_memberships FOR DELETE USING (tenancy.is_tenant_admin(tenant_id));

ALTER TABLE tenancy.outlet_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.outlet_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY assignments_select ON tenancy.outlet_assignments FOR SELECT USING (
  tenancy.is_tenant_admin(tenant_id) OR (tenant_id = tenancy.current_tenant_id() AND user_id = iam.current_user_id())
);
CREATE POLICY assignments_insert ON tenancy.outlet_assignments FOR INSERT WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY assignments_update ON tenancy.outlet_assignments FOR UPDATE USING (tenancy.is_tenant_admin(tenant_id)) WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY assignments_delete ON tenancy.outlet_assignments FOR DELETE USING (tenancy.is_tenant_admin(tenant_id));

ALTER TABLE tenancy.outlet_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.outlet_features FORCE ROW LEVEL SECURITY;
CREATE POLICY outlet_features_isolation ON tenancy.outlet_features USING (tenancy.can_access_outlet(tenant_id, outlet_id)) WITH CHECK (tenancy.can_access_outlet(tenant_id, outlet_id));

ALTER TABLE iam.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_select ON iam.users FOR SELECT USING (
  iam.is_super_admin() OR id = iam.current_user_id() OR EXISTS (
    SELECT 1 FROM tenancy.tenant_memberships membership
    WHERE membership.tenant_id = tenancy.current_tenant_id()
      AND membership.user_id = iam.users.id
      AND tenancy.has_tenant_access(membership.tenant_id)
  )
);
CREATE POLICY users_update_self ON iam.users FOR UPDATE USING (id = iam.current_user_id()) WITH CHECK (id = iam.current_user_id());

ALTER TABLE iam.user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.user_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY credentials_self ON iam.user_credentials USING (user_id = iam.current_user_id()) WITH CHECK (user_id = iam.current_user_id());

CREATE OR REPLACE FUNCTION iam.lookup_login_identity(identifier text)
RETURNS TABLE (
  user_id uuid, legacy_id varchar, email varchar, phone varchar, display_name text,
  user_active boolean, password_hash text, credential_state iam.credential_state,
  refresh_token_version integer, memberships jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, iam, tenancy
AS $$
  SELECT usr.id, usr.legacy_id, usr.email, usr.phone, usr.display_name, usr.active,
    credential.password_hash, coalesce(credential.state, 'legacy'::iam.credential_state),
    coalesce(credential.refresh_token_version, 0),
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'tenantId', membership.tenant_id,
        'active', membership.active,
        'isTenantAdmin', membership.is_tenant_admin,
        'outletIds', coalesce((
          SELECT jsonb_agg(DISTINCT assignment.outlet_id)
          FROM tenancy.outlet_assignments assignment
          WHERE assignment.tenant_id = membership.tenant_id
            AND assignment.user_id = usr.id AND assignment.active
        ), '[]'::jsonb)
      )) FROM tenancy.tenant_memberships membership WHERE membership.user_id = usr.id
    ), '[]'::jsonb)
  FROM iam.users usr
  LEFT JOIN iam.user_credentials credential ON credential.user_id = usr.id
  WHERE usr.email = lower(trim(identifier)) OR usr.phone = trim(identifier)
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION iam.lookup_login_identity_by_user_id(requested_user_id uuid)
RETURNS TABLE (
  user_id uuid, legacy_id varchar, email varchar, phone varchar, display_name text,
  user_active boolean, password_hash text, credential_state iam.credential_state,
  refresh_token_version integer, memberships jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, iam, tenancy
AS $$
  SELECT * FROM iam.lookup_login_identity((
    SELECT coalesce(usr.email, usr.phone) FROM iam.users usr WHERE usr.id = requested_user_id
  ))
$$;

CREATE OR REPLACE FUNCTION iam.upgrade_legacy_credential(requested_user_id uuid, argon2id_hash text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, iam
AS $$
DECLARE affected integer;
BEGIN
  IF argon2id_hash NOT LIKE '$argon2id$%' THEN RAISE EXCEPTION 'invalid credential hash'; END IF;
  INSERT INTO iam.user_credentials (user_id, password_hash, state, migrated_at, password_changed_at)
  VALUES (requested_user_id, argon2id_hash, 'argon2id', now(), now())
  ON CONFLICT (user_id) DO UPDATE SET
    password_hash = EXCLUDED.password_hash, state = 'argon2id', migrated_at = now(),
    password_changed_at = now(), updated_at = now()
  WHERE iam.user_credentials.state = 'legacy' AND iam.user_credentials.password_hash IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END;
$$;

CREATE OR REPLACE FUNCTION iam.rotate_refresh_token(requested_user_id uuid, expected_version integer)
RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, iam
AS $$
  UPDATE iam.user_credentials
  SET refresh_token_version = refresh_token_version + 1, updated_at = now()
  WHERE user_id = requested_user_id AND refresh_token_version = expected_version AND state = 'argon2id'
  RETURNING refresh_token_version
$$;

ALTER FUNCTION iam.lookup_login_identity(text) OWNER TO sensible_rls_owner;
ALTER FUNCTION iam.lookup_login_identity_by_user_id(uuid) OWNER TO sensible_rls_owner;
ALTER FUNCTION iam.upgrade_legacy_credential(uuid, text) OWNER TO sensible_rls_owner;
ALTER FUNCTION iam.rotate_refresh_token(uuid, integer) OWNER TO sensible_rls_owner;
GRANT INSERT, UPDATE ON iam.user_credentials TO sensible_rls_owner;

REVOKE ALL ON ALL TABLES IN SCHEMA iam, tenancy FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA iam, tenancy FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.current_tenant_id(), iam.current_user_id(), iam.is_super_admin(),
  tenancy.has_tenant_access(uuid), tenancy.is_tenant_admin(uuid), tenancy.can_access_outlet(uuid, uuid),
  iam.lookup_login_identity(text) TO sensible_rls_owner;
GRANT USAGE ON SCHEMA iam, tenancy TO sensible_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA iam, tenancy TO sensible_app_role;
REVOKE INSERT, UPDATE, DELETE ON iam.permissions FROM sensible_app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA iam, tenancy TO sensible_app_role;
GRANT EXECUTE ON FUNCTION tenancy.current_tenant_id(), iam.current_user_id(), iam.is_super_admin(),
  tenancy.has_tenant_access(uuid), tenancy.is_tenant_admin(uuid), tenancy.can_access_outlet(uuid, uuid),
  iam.lookup_login_identity(text), iam.lookup_login_identity_by_user_id(uuid),
  iam.upgrade_legacy_credential(uuid, text), iam.rotate_refresh_token(uuid, integer) TO sensible_app_role;
