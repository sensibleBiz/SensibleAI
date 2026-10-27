SET TIME ZONE 'UTC';

ALTER TABLE tenancy.outlets
  ADD COLUMN IF NOT EXISTS branch varchar(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city varchar(100) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS state varchar(100) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_type varchar(32) NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN IF NOT EXISTS renewal_date timestamptz,
  ADD COLUMN IF NOT EXISTS latitude numeric(10,7) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longitude numeric(10,7) NOT NULL DEFAULT 0;

CREATE TABLE tenancy.plan_catalogs (
  tenant_id uuid PRIMARY KEY REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_catalogs_features_array_ck CHECK (jsonb_typeof(features) = 'array')
);

CREATE TABLE tenancy.outlet_subscriptions (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  plan_tier varchar(32) NOT NULL,
  status varchar(32) NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  permitted_users integer NOT NULL DEFAULT 5,
  starts_at timestamptz NOT NULL DEFAULT now(),
  renews_at timestamptz NOT NULL,
  external_transaction_id varchar(200),
  created_by uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outlet_subscriptions_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT outlet_subscriptions_plan_tier_ck CHECK (plan_tier IN ('trial','silver','gold','platinum')),
  CONSTRAINT outlet_subscriptions_status_ck CHECK (status IN ('trial','active','expired','cancelled')),
  CONSTRAINT outlet_subscriptions_amount_ck CHECK (amount >= 0),
  CONSTRAINT outlet_subscriptions_users_ck CHECK (permitted_users > 0)
);

CREATE UNIQUE INDEX outlet_subscriptions_current_uq ON tenancy.outlet_subscriptions (outlet_id)
  WHERE status IN ('trial', 'active');
CREATE INDEX outlet_subscriptions_tenant_renewal_idx
  ON tenancy.outlet_subscriptions (tenant_id, renews_at, status);

ALTER TABLE tenancy.plan_catalogs OWNER TO sensible_rls_owner;
ALTER TABLE tenancy.outlet_subscriptions OWNER TO sensible_rls_owner;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenancy.plan_catalogs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenancy.outlet_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE tenancy.plan_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.plan_catalogs FORCE ROW LEVEL SECURITY;
CREATE POLICY plan_catalogs_select ON tenancy.plan_catalogs FOR SELECT
  USING (tenancy.has_tenant_access(tenant_id));
CREATE POLICY plan_catalogs_insert ON tenancy.plan_catalogs FOR INSERT
  WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY plan_catalogs_update ON tenancy.plan_catalogs FOR UPDATE
  USING (tenancy.is_tenant_admin(tenant_id)) WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY plan_catalogs_delete ON tenancy.plan_catalogs FOR DELETE
  USING (tenancy.is_tenant_admin(tenant_id));

ALTER TABLE tenancy.outlet_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.outlet_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY outlet_subscriptions_select ON tenancy.outlet_subscriptions FOR SELECT
  USING (tenancy.can_access_outlet(tenant_id, outlet_id));
CREATE POLICY outlet_subscriptions_insert ON tenancy.outlet_subscriptions FOR INSERT
  WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY outlet_subscriptions_update ON tenancy.outlet_subscriptions FOR UPDATE
  USING (tenancy.is_tenant_admin(tenant_id)) WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY outlet_subscriptions_delete ON tenancy.outlet_subscriptions FOR DELETE
  USING (tenancy.is_tenant_admin(tenant_id));

CREATE OR REPLACE FUNCTION iam.bootstrap_phone_onboarding(
  firebase_uid text, verified_phone text, owner_name text, owner_email text,
  business_name text, branch_name text, business_address text,
  business_city text, business_state text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, iam, tenancy, crm
AS $$
DECLARE
  new_tenant_id uuid := public.uuid_generate_v7();
  new_business_id uuid := public.uuid_generate_v7();
  new_outlet_id uuid := public.uuid_generate_v7();
  new_user_id uuid := public.uuid_generate_v7();
  new_role_id uuid := public.uuid_generate_v7();
  new_profile_id uuid := public.uuid_generate_v7();
  normalized_phone text;
  renewal_at timestamptz := now() + interval '14 days';
BEGIN
  normalized_phone := '+91' || right(regexp_replace(verified_phone, '[^0-9]', '', 'g'), 10);
  IF length(normalized_phone) <> 13 THEN
    RAISE EXCEPTION 'invalid verified phone number' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM iam.users WHERE legacy_id = firebase_uid OR phone = normalized_phone) THEN
    RAISE EXCEPTION 'account already exists' USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('app.is_super_admin', 'true', true);
  PERFORM set_config('app.current_tenant_id', new_tenant_id::text, true);
  PERFORM set_config('app.current_user_id', new_user_id::text, true);

  INSERT INTO tenancy.tenants (id, legacy_id, name, slug)
  VALUES (new_tenant_id, firebase_uid, business_name,
    left(regexp_replace(lower(btrim(business_name)), '[^a-z0-9]+', '-', 'g'), 100)
      || '-' || left(replace(new_tenant_id::text, '-', ''), 8));
  INSERT INTO tenancy.businesses (id, tenant_id, name, legal_name)
  VALUES (new_business_id, new_tenant_id, business_name, business_name);
  INSERT INTO iam.users (id, legacy_id, email, phone, display_name)
  VALUES (new_user_id, firebase_uid, lower(owner_email), normalized_phone, owner_name);
  INSERT INTO iam.user_credentials (user_id) VALUES (new_user_id);
  INSERT INTO tenancy.tenant_memberships (tenant_id, user_id, is_tenant_admin)
  VALUES (new_tenant_id, new_user_id, true);
  INSERT INTO iam.roles (id, tenant_id, name, description)
  VALUES (new_role_id, new_tenant_id, 'SUPER_ADMIN', 'Tenant owner');
  INSERT INTO iam.role_permissions (tenant_id, role_id, permission_id)
  SELECT new_tenant_id, new_role_id, permission.id FROM iam.permissions permission;
  INSERT INTO tenancy.outlets (
    id, tenant_id, business_id, outlet_code, name, branch, address, city, state,
    billing_type, renewal_date
  ) VALUES (
    new_outlet_id, new_tenant_id, new_business_id, 'MAIN', business_name,
    branch_name, business_address, business_city, business_state, 'TRIAL', renewal_at
  );
  INSERT INTO tenancy.outlet_assignments (tenant_id, outlet_id, user_id, role_id)
  VALUES (new_tenant_id, new_outlet_id, new_user_id, new_role_id);
  INSERT INTO crm.user_profiles (id, tenant_id, business_id, user_id, profile_role)
  VALUES (new_profile_id, new_tenant_id, new_business_id, new_user_id, 'SUPER_ADMIN');
  INSERT INTO crm.team_memberships (
    tenant_id, business_id, outlet_id, user_profile_id, user_id, department, emp_code
  ) VALUES (
    new_tenant_id, new_business_id, new_outlet_id, new_profile_id, new_user_id, 'SALES', 'OWNER'
  );
  INSERT INTO tenancy.outlet_features (tenant_id, outlet_id, feature_key)
  VALUES
    (new_tenant_id, new_outlet_id, 'dashboard'),
    (new_tenant_id, new_outlet_id, 'leads_list'),
    (new_tenant_id, new_outlet_id, 'leads_funnel'),
    (new_tenant_id, new_outlet_id, 'leads_activities'),
    (new_tenant_id, new_outlet_id, 'leads_ringing');
  INSERT INTO tenancy.outlet_subscriptions (
    tenant_id, outlet_id, plan_tier, status, renews_at, created_by, updated_by
  ) VALUES (
    new_tenant_id, new_outlet_id, 'trial', 'trial', renewal_at, new_user_id, new_user_id
  );
  INSERT INTO tenancy.plan_catalogs (tenant_id, features, updated_by)
  VALUES (new_tenant_id, '[]'::jsonb, new_user_id);

  RETURN jsonb_build_object('tenantId', new_tenant_id, 'businessId', new_business_id,
    'outletId', new_outlet_id, 'userId', new_user_id,
    'renewalDate', extract(epoch FROM renewal_at) * 1000);
END;
$$;

ALTER FUNCTION iam.bootstrap_phone_onboarding(text, text, text, text, text, text, text, text, text)
  OWNER TO sensible_rls_owner;
REVOKE ALL ON FUNCTION iam.bootstrap_phone_onboarding(text, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION iam.bootstrap_phone_onboarding(text, text, text, text, text, text, text, text, text)
  TO sensible_app_role;

CREATE OR REPLACE FUNCTION iam.rotate_refresh_token(requested_user_id uuid, expected_version integer)
RETURNS integer LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, iam AS $$
  UPDATE iam.user_credentials SET refresh_token_version = refresh_token_version + 1, updated_at = now()
  WHERE user_id = requested_user_id AND refresh_token_version = expected_version
  RETURNING refresh_token_version
$$;
ALTER FUNCTION iam.rotate_refresh_token(uuid, integer) OWNER TO sensible_rls_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.plan_catalogs, tenancy.outlet_subscriptions TO sensible_app_role;
GRANT EXECUTE ON FUNCTION iam.rotate_refresh_token(uuid, integer) TO sensible_app_role;
