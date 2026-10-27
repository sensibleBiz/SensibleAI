SET TIME ZONE 'UTC';

DO $$ BEGIN
  CREATE TYPE crm.call_direction AS ENUM ('incoming', 'outgoing', 'missed', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE crm.calls (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  lead_id uuid,
  customer_id uuid,
  logged_by_user_id uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  direction crm.call_direction NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0,
  number varchar(32) NOT NULL DEFAULT '',
  receiver_mobile_no varchar(32) NOT NULL DEFAULT '',
  receiver_name varchar(500) NOT NULL DEFAULT '',
  employee_label varchar(500) NOT NULL DEFAULT '',
  department varchar(200) NOT NULL DEFAULT 'Other',
  logged_at timestamptz NOT NULL,
  phone_account_id varchar(200),
  sim_label varchar(200),
  sim_phone_number varchar(32),
  subscription_id varchar(200),
  device_id varchar(200),
  external_call_source varchar(100),
  external_call_id varchar(1500),
  created_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calls_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT calls_business_tenant_fk FOREIGN KEY (tenant_id, business_id) REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT calls_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT calls_lead_tenant_fk FOREIGN KEY (tenant_id, lead_id) REFERENCES crm.leads(tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT calls_customer_tenant_fk FOREIGN KEY (tenant_id, customer_id) REFERENCES crm.customers(tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT calls_duration_ck CHECK (duration_seconds >= 0),
  CONSTRAINT calls_number_ck CHECK (length(btrim(number)) > 0 OR lead_id IS NOT NULL)
);

CREATE INDEX calls_tenant_outlet_logged_idx ON crm.calls (tenant_id, outlet_id, logged_at DESC, id DESC);
CREATE INDEX calls_tenant_outlet_receiver_logged_idx ON crm.calls (tenant_id, outlet_id, receiver_name, logged_at DESC, id DESC);
CREATE INDEX calls_tenant_outlet_number_logged_idx ON crm.calls (tenant_id, outlet_id, number, logged_at DESC, id DESC);
CREATE INDEX calls_tenant_lead_logged_idx ON crm.calls (tenant_id, lead_id, logged_at DESC, id DESC) WHERE lead_id IS NOT NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.calls FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION crm.can_access_call(requested_tenant_id uuid, requested_outlet_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
  SELECT requested_tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(requested_tenant_id)
    AND tenancy.can_access_outlet(requested_tenant_id, requested_outlet_id)
$$;
ALTER FUNCTION crm.can_access_call(uuid, uuid) OWNER TO sensible_rls_owner;

ALTER TABLE crm.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.calls FORCE ROW LEVEL SECURITY;
CREATE POLICY calls_select ON crm.calls FOR SELECT USING (crm.can_access_call(tenant_id, outlet_id));
CREATE POLICY calls_insert ON crm.calls FOR INSERT WITH CHECK (
  crm.can_access_call(tenant_id, outlet_id)
  AND created_by_user_id = iam.current_user_id()
  AND updated_by_user_id = iam.current_user_id()
);
CREATE POLICY calls_update ON crm.calls FOR UPDATE USING (crm.can_access_call(tenant_id, outlet_id))
  WITH CHECK (crm.can_access_call(tenant_id, outlet_id) AND updated_by_user_id = iam.current_user_id());
CREATE POLICY calls_delete ON crm.calls FOR DELETE USING (crm.can_access_call(tenant_id, outlet_id));

INSERT INTO iam.permissions (permission_key, description) VALUES
  ('calls.read', 'View PostgreSQL call logs linked to leads'),
  ('calls.create', 'Create PostgreSQL call logs'),
  ('calls.reports.read', 'View PostgreSQL call log reports')
ON CONFLICT (permission_key) DO NOTHING;
