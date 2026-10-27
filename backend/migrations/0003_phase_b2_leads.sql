SET TIME ZONE 'UTC';

DO $$ BEGIN CREATE TYPE crm.lead_stage AS ENUM ('NEW', 'ASSIGNED', 'FOLLOWUP', 'WON', 'LOST', 'DISQUALIFIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE crm.leads (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  customer_id uuid,
  assigned_to_user_id uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  created_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  customer_name text NOT NULL DEFAULT '',
  business_name text NOT NULL DEFAULT '',
  business_type text NOT NULL DEFAULT '',
  mobile varchar(32) NOT NULL DEFAULT '',
  normalized_mobile varchar(32) NOT NULL DEFAULT '',
  mobile_alt varchar(32) NOT NULL DEFAULT '',
  phone varchar(32) NOT NULL DEFAULT '',
  email varchar(320) NOT NULL DEFAULT '',
  normalized_email varchar(320) NOT NULL DEFAULT '',
  area text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  requirement text NOT NULL DEFAULT '',
  stage crm.lead_stage NOT NULL DEFAULT 'NEW',
  source varchar(200) NOT NULL DEFAULT '',
  priority varchar(64) NOT NULL DEFAULT '',
  comments text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  external_ref varchar(500) NOT NULL DEFAULT '',
  ad_id varchar(500) NOT NULL DEFAULT '',
  campaign varchar(500) NOT NULL DEFAULT '',
  ringing boolean NOT NULL DEFAULT false,
  whatsapp_share_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leads_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT leads_business_tenant_fk FOREIGN KEY (tenant_id, business_id)
    REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT leads_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT leads_customer_tenant_fk FOREIGN KEY (tenant_id, customer_id)
    REFERENCES crm.customers(tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT leads_counters_nonnegative_ck CHECK (whatsapp_share_count >= 0)
);

CREATE INDEX leads_tenant_outlet_stage_idx ON crm.leads (tenant_id, outlet_id, stage, created_at DESC);
CREATE INDEX leads_tenant_customer_idx ON crm.leads (tenant_id, customer_id);
CREATE INDEX leads_tenant_assigned_idx ON crm.leads (tenant_id, assigned_to_user_id);
CREATE INDEX leads_tenant_mobile_idx ON crm.leads (tenant_id, normalized_mobile);
CREATE INDEX leads_tenant_email_idx ON crm.leads (tenant_id, normalized_email);
CREATE INDEX leads_tenant_ringing_idx ON crm.leads (tenant_id, outlet_id) WHERE ringing;

CREATE TABLE crm.lead_assignment_history (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  assigned_to_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  assigned_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_assignment_history_lead_tenant_fk FOREIGN KEY (tenant_id, lead_id)
    REFERENCES crm.leads(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX lead_assignment_history_lead_idx ON crm.lead_assignment_history (tenant_id, lead_id, assigned_at DESC);

CREATE TABLE crm.lead_stage_history (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  from_stage crm.lead_stage,
  to_stage crm.lead_stage NOT NULL,
  changed_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_stage_history_lead_tenant_fk FOREIGN KEY (tenant_id, lead_id)
    REFERENCES crm.leads(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX lead_stage_history_lead_idx ON crm.lead_stage_history (tenant_id, lead_id, changed_at DESC);

CREATE TABLE crm.lead_share_tokens (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  token varchar(64) NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CONSTRAINT lead_share_tokens_token_uq UNIQUE (token),
  CONSTRAINT lead_share_tokens_lead_tenant_fk FOREIGN KEY (tenant_id, lead_id)
    REFERENCES crm.leads(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX lead_share_tokens_lead_idx ON crm.lead_share_tokens (tenant_id, lead_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION crm.can_access_lead(requested_tenant_id uuid, requested_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
  SELECT requested_tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(requested_tenant_id)
    AND EXISTS (
      SELECT 1 FROM crm.leads lead_item
      WHERE lead_item.tenant_id = requested_tenant_id
        AND lead_item.id = requested_lead_id
        AND tenancy.can_access_outlet(lead_item.tenant_id, lead_item.outlet_id)
    )
$$;
ALTER FUNCTION crm.can_access_lead(uuid, uuid) OWNER TO sensible_rls_owner;

ALTER TABLE crm.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.leads FORCE ROW LEVEL SECURITY;
CREATE POLICY leads_select ON crm.leads FOR SELECT USING (crm.can_access_lead(tenant_id, id));
CREATE POLICY leads_insert ON crm.leads FOR INSERT
  WITH CHECK (tenant_id = tenancy.current_tenant_id() AND tenancy.has_tenant_access(tenant_id)
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
    AND created_by_user_id = iam.current_user_id() AND updated_by_user_id = iam.current_user_id());
CREATE POLICY leads_update ON crm.leads FOR UPDATE
  USING (crm.can_access_lead(tenant_id, id))
  WITH CHECK (crm.can_access_lead(tenant_id, id) AND updated_by_user_id = iam.current_user_id());

ALTER TABLE crm.lead_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.lead_assignment_history FORCE ROW LEVEL SECURITY;
CREATE POLICY lead_assignment_history_select ON crm.lead_assignment_history FOR SELECT
  USING (crm.can_access_lead(tenant_id, lead_id));
CREATE POLICY lead_assignment_history_insert ON crm.lead_assignment_history FOR INSERT
  WITH CHECK (crm.can_access_lead(tenant_id, lead_id));

ALTER TABLE crm.lead_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.lead_stage_history FORCE ROW LEVEL SECURITY;
CREATE POLICY lead_stage_history_select ON crm.lead_stage_history FOR SELECT
  USING (crm.can_access_lead(tenant_id, lead_id));
CREATE POLICY lead_stage_history_insert ON crm.lead_stage_history FOR INSERT
  WITH CHECK (crm.can_access_lead(tenant_id, lead_id));

ALTER TABLE crm.lead_share_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.lead_share_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY lead_share_tokens_select ON crm.lead_share_tokens FOR SELECT
  USING (crm.can_access_lead(tenant_id, lead_id));
CREATE POLICY lead_share_tokens_insert ON crm.lead_share_tokens FOR INSERT
  WITH CHECK (crm.can_access_lead(tenant_id, lead_id));

INSERT INTO iam.permissions (permission_key, description) VALUES
  ('leads.read', 'View PostgreSQL leads'),
  ('leads.create', 'Create PostgreSQL leads'),
  ('leads.import', 'Import PostgreSQL leads'),
  ('leads.update', 'Update PostgreSQL leads'),
  ('leads.assign', 'Assign PostgreSQL leads'),
  ('leads.share', 'Share PostgreSQL leads'),
  ('lead_reports.read', 'View PostgreSQL lead reports'),
  ('lead_reports.employee.read', 'View PostgreSQL employee lead reports')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA crm TO sensible_app_role;
GRANT EXECUTE ON FUNCTION crm.can_access_lead(uuid, uuid) TO sensible_app_role;

