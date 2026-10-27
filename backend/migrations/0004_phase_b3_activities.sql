SET TIME ZONE 'UTC';

DO $$ BEGIN CREATE TYPE crm.activity_type AS ENUM ('Follow Up', 'Demo', 'Installation', 'Visit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE crm.activity_status AS ENUM ('PENDING', 'DONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE crm.activity_mode AS ENUM ('Online', 'Offline');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE crm.activity_priority AS ENUM ('Low', 'Medium', 'High', 'Urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE crm.activities (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  customer_id uuid,
  assigned_to_user_id uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  created_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  activity_type crm.activity_type NOT NULL,
  status crm.activity_status NOT NULL DEFAULT 'PENDING',
  mode crm.activity_mode NOT NULL,
  priority crm.activity_priority NOT NULL,
  description text NOT NULL,
  scheduled_at timestamptz,
  completed_at timestamptz,
  lead_name_snapshot text NOT NULL,
  lead_mobile_snapshot varchar(32) NOT NULL DEFAULT '',
  lead_requirement_snapshot text NOT NULL DEFAULT '',
  product_id_snapshot varchar(1500),
  product_name_snapshot text,
  product_type_snapshot varchar(100),
  product_dealer_price_snapshot numeric(14,2),
  product_mrp_snapshot numeric(14,2),
  external_product_source varchar(100),
  external_product_id varchar(1500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activities_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT activities_business_tenant_fk FOREIGN KEY (tenant_id, business_id) REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT activities_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT activities_lead_tenant_fk FOREIGN KEY (tenant_id, lead_id) REFERENCES crm.leads(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT activities_customer_tenant_fk FOREIGN KEY (tenant_id, customer_id) REFERENCES crm.customers(tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT activities_description_ck CHECK (length(btrim(description)) > 0),
  CONSTRAINT activities_product_prices_ck CHECK ((product_dealer_price_snapshot IS NULL OR product_dealer_price_snapshot >= 0) AND (product_mrp_snapshot IS NULL OR product_mrp_snapshot >= 0)),
  CONSTRAINT activities_completion_ck CHECK ((status = 'DONE' AND completed_at IS NOT NULL) OR (status = 'PENDING' AND completed_at IS NULL))
);

CREATE INDEX activities_tenant_outlet_scheduled_idx ON crm.activities (tenant_id, outlet_id, scheduled_at, id);
CREATE INDEX activities_tenant_lead_created_idx ON crm.activities (tenant_id, lead_id, created_at DESC, id DESC);
CREATE INDEX activities_tenant_customer_created_idx ON crm.activities (tenant_id, customer_id, created_at DESC, id DESC);
CREATE INDEX activities_tenant_assigned_scheduled_idx ON crm.activities (tenant_id, assigned_to_user_id, scheduled_at, id);
CREATE INDEX activities_tenant_status_scheduled_idx ON crm.activities (tenant_id, status, scheduled_at, id);
CREATE INDEX activities_tenant_type_created_idx ON crm.activities (tenant_id, activity_type, created_at DESC, id DESC);
CREATE INDEX activities_pending_scheduled_idx ON crm.activities (tenant_id, outlet_id, scheduled_at, id) WHERE status = 'PENDING';

CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.activities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION crm.can_access_activity(requested_tenant_id uuid, requested_outlet_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
  SELECT requested_tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(requested_tenant_id)
    AND tenancy.can_access_outlet(requested_tenant_id, requested_outlet_id)
$$;
ALTER FUNCTION crm.can_access_activity(uuid, uuid) OWNER TO sensible_rls_owner;
-- B2 created crm.leads after the B1 blanket owner grant; its SECURITY DEFINER RLS helper needs this read grant.
GRANT SELECT ON crm.leads TO sensible_rls_owner;

ALTER TABLE crm.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.activities FORCE ROW LEVEL SECURITY;
CREATE POLICY activities_select ON crm.activities FOR SELECT USING (crm.can_access_activity(tenant_id, outlet_id));
CREATE POLICY activities_insert ON crm.activities FOR INSERT WITH CHECK (crm.can_access_activity(tenant_id, outlet_id) AND created_by_user_id = iam.current_user_id() AND updated_by_user_id = iam.current_user_id());
CREATE POLICY activities_update ON crm.activities FOR UPDATE USING (crm.can_access_activity(tenant_id, outlet_id)) WITH CHECK (crm.can_access_activity(tenant_id, outlet_id) AND updated_by_user_id = iam.current_user_id());
CREATE POLICY activities_delete ON crm.activities FOR DELETE USING (crm.can_access_activity(tenant_id, outlet_id));

INSERT INTO iam.permissions (permission_key, description) VALUES
  ('activities.read', 'View PostgreSQL activities'),
  ('activities.create', 'Create PostgreSQL activities'),
  ('activities.update', 'Update PostgreSQL activities'),
  ('activities.delete', 'Delete PostgreSQL activities')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;

GRANT SELECT, INSERT, UPDATE, DELETE ON crm.activities TO sensible_app_role;
GRANT EXECUTE ON FUNCTION crm.can_access_activity(uuid, uuid) TO sensible_app_role;
