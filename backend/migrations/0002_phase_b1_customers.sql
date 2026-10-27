SET TIME ZONE 'UTC';

CREATE SCHEMA IF NOT EXISTS crm;
GRANT USAGE, CREATE ON SCHEMA crm TO sensible_rls_owner;

DO $$ BEGIN CREATE TYPE crm.customer_status AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE crm.customer_lifecycle AS ENUM ('PROSPECT', 'NEW_CUSTOMER', 'REPEAT_CUSTOMER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE crm.customer_identity_type AS ENUM ('MOBILE', 'EMAIL', 'BUSINESS_LOCATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE crm.customers (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  customer_code varchar(64) NOT NULL,
  customer_name text NOT NULL,
  normalized_customer_name text NOT NULL,
  business_name text NOT NULL DEFAULT '',
  normalized_business_name text NOT NULL DEFAULT '',
  mobile varchar(32),
  normalized_mobile varchar(32),
  email varchar(320),
  normalized_email varchar(320),
  business_type text NOT NULL DEFAULT '',
  area text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  priority varchar(64) NOT NULL DEFAULT '',
  source varchar(200) NOT NULL DEFAULT '',
  status crm.customer_status NOT NULL DEFAULT 'ACTIVE',
  lifecycle crm.customer_lifecycle NOT NULL DEFAULT 'PROSPECT',
  total_enquiries integer NOT NULL DEFAULT 0,
  total_won integer NOT NULL DEFAULT 0,
  total_lost integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT customers_tenant_code_uq UNIQUE (tenant_id, customer_code),
  CONSTRAINT customers_business_tenant_fk FOREIGN KEY (tenant_id, business_id)
    REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT customers_counters_nonnegative_ck CHECK (total_enquiries >= 0 AND total_won >= 0 AND total_lost >= 0)
);
CREATE INDEX customers_tenant_status_idx ON crm.customers (tenant_id, status);
CREATE INDEX customers_tenant_mobile_idx ON crm.customers (tenant_id, normalized_mobile);
CREATE INDEX customers_tenant_email_idx ON crm.customers (tenant_id, normalized_email);
CREATE INDEX customers_tenant_name_idx ON crm.customers (tenant_id, normalized_customer_name text_pattern_ops);
CREATE INDEX customers_tenant_business_name_idx ON crm.customers (tenant_id, normalized_business_name text_pattern_ops);
CREATE INDEX customers_tenant_code_idx ON crm.customers (tenant_id, customer_code text_pattern_ops);

CREATE TABLE crm.customer_outlets (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_outlets_customer_outlet_uq UNIQUE (customer_id, outlet_id),
  CONSTRAINT customer_outlets_customer_tenant_fk FOREIGN KEY (tenant_id, customer_id)
    REFERENCES crm.customers(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT customer_outlets_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX customer_outlets_primary_uq ON crm.customer_outlets (customer_id) WHERE is_primary;
CREATE INDEX customer_outlets_tenant_outlet_idx ON crm.customer_outlets (tenant_id, outlet_id);

CREATE TABLE crm.customer_identities (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  identity_type crm.customer_identity_type NOT NULL,
  normalized_value text NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_identities_customer_value_uq UNIQUE (customer_id, identity_type, normalized_value),
  CONSTRAINT customer_identities_customer_tenant_fk FOREIGN KEY (tenant_id, customer_id)
    REFERENCES crm.customers(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT customer_identities_value_ck CHECK (length(normalized_value) > 0)
);
CREATE INDEX customer_identities_lookup_idx ON crm.customer_identities (tenant_id, identity_type, normalized_value);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.customer_outlets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION crm.can_access_customer(requested_tenant_id uuid, requested_customer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
  SELECT requested_tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(requested_tenant_id)
    AND EXISTS (
      SELECT 1 FROM crm.customer_outlets relationship
      WHERE relationship.tenant_id = requested_tenant_id
        AND relationship.customer_id = requested_customer_id
        AND tenancy.can_access_outlet(relationship.tenant_id, relationship.outlet_id)
    )
$$;
ALTER FUNCTION crm.can_access_customer(uuid, uuid) OWNER TO sensible_rls_owner;
GRANT USAGE ON SCHEMA crm TO sensible_rls_owner;
GRANT SELECT ON ALL TABLES IN SCHEMA crm TO sensible_rls_owner;

ALTER TABLE crm.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.customers FORCE ROW LEVEL SECURITY;
CREATE POLICY customers_select ON crm.customers FOR SELECT USING (crm.can_access_customer(tenant_id, id));
CREATE POLICY customers_insert ON crm.customers FOR INSERT
  WITH CHECK (tenant_id = tenancy.current_tenant_id() AND tenancy.has_tenant_access(tenant_id)
    AND created_by = iam.current_user_id() AND updated_by = iam.current_user_id());
CREATE POLICY customers_update ON crm.customers FOR UPDATE
  USING (crm.can_access_customer(tenant_id, id))
  WITH CHECK (crm.can_access_customer(tenant_id, id) AND updated_by = iam.current_user_id());

ALTER TABLE crm.customer_outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.customer_outlets FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_outlets_isolation ON crm.customer_outlets
  USING (tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (tenancy.can_access_outlet(tenant_id, outlet_id));

ALTER TABLE crm.customer_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.customer_identities FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_identities_select ON crm.customer_identities FOR SELECT
  USING (crm.can_access_customer(tenant_id, customer_id));
CREATE POLICY customer_identities_insert ON crm.customer_identities FOR INSERT
  WITH CHECK (crm.can_access_customer(tenant_id, customer_id));
CREATE POLICY customer_identities_delete ON crm.customer_identities FOR DELETE
  USING (crm.can_access_customer(tenant_id, customer_id));

INSERT INTO iam.permissions (permission_key, description) VALUES
  ('customers.read', 'View PostgreSQL customers'),
  ('customers.create', 'Create PostgreSQL customers'),
  ('customers.update', 'Update PostgreSQL customers'),
  ('customers.archive', 'Mark PostgreSQL customers inactive')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;

REVOKE ALL ON ALL TABLES IN SCHEMA crm FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crm FROM PUBLIC;
GRANT USAGE ON SCHEMA crm TO sensible_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA crm TO sensible_app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA crm TO sensible_app_role;
GRANT EXECUTE ON FUNCTION crm.can_access_customer(uuid, uuid) TO sensible_app_role;
