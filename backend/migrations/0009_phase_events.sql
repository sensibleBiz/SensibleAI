SET TIME ZONE 'UTC';

CREATE TABLE crm.outlet_events (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  external_event_id varchar(120) NOT NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  terms text NOT NULL DEFAULT '',
  event_at timestamptz,
  expiry_at timestamptz,
  address text NOT NULL DEFAULT '',
  location jsonb NOT NULL DEFAULT '{}'::jsonb,
  post_link text NOT NULL DEFAULT '',
  fees numeric(12, 2) NOT NULL DEFAULT 0,
  offer numeric(12, 2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  image_url jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  members jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outlet_events_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT outlet_events_business_tenant_fk FOREIGN KEY (tenant_id, business_id) REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT outlet_events_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT outlet_events_external_uq UNIQUE (tenant_id, outlet_id, external_event_id)
);

CREATE INDEX outlet_events_outlet_event_at_idx ON crm.outlet_events (tenant_id, outlet_id, event_at DESC);

CREATE TABLE crm.outlet_event_transactions (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  external_event_id varchar(120) NOT NULL DEFAULT '',
  transaction_id varchar(120) NOT NULL,
  amount numeric(12, 2) NOT NULL DEFAULT 0,
  status varchar(50) NOT NULL DEFAULT '',
  payment_type varchar(50) NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  remark text NOT NULL DEFAULT '',
  transacted_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outlet_event_transactions_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT outlet_event_transactions_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT outlet_event_transactions_idempotency_uq UNIQUE (tenant_id, outlet_id, transaction_id)
);

CREATE INDEX outlet_event_transactions_outlet_event_idx
  ON crm.outlet_event_transactions (tenant_id, outlet_id, external_event_id, transacted_at DESC);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.outlet_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION crm.can_access_event(requested_tenant_id uuid, requested_outlet_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
  SELECT requested_tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(requested_tenant_id)
    AND tenancy.can_access_outlet(requested_tenant_id, requested_outlet_id)
$$;
ALTER FUNCTION crm.can_access_event(uuid, uuid) OWNER TO sensible_rls_owner;

ALTER TABLE crm.outlet_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.outlet_events FORCE ROW LEVEL SECURITY;
CREATE POLICY outlet_events_select ON crm.outlet_events FOR SELECT USING (crm.can_access_event(tenant_id, outlet_id));
CREATE POLICY outlet_events_insert ON crm.outlet_events FOR INSERT WITH CHECK (crm.can_access_event(tenant_id, outlet_id));
CREATE POLICY outlet_events_update ON crm.outlet_events FOR UPDATE USING (crm.can_access_event(tenant_id, outlet_id)) WITH CHECK (crm.can_access_event(tenant_id, outlet_id));
CREATE POLICY outlet_events_delete ON crm.outlet_events FOR DELETE USING (crm.can_access_event(tenant_id, outlet_id));

ALTER TABLE crm.outlet_event_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.outlet_event_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY outlet_event_transactions_select ON crm.outlet_event_transactions FOR SELECT USING (crm.can_access_event(tenant_id, outlet_id));
CREATE POLICY outlet_event_transactions_insert ON crm.outlet_event_transactions FOR INSERT WITH CHECK (crm.can_access_event(tenant_id, outlet_id));
CREATE POLICY outlet_event_transactions_update ON crm.outlet_event_transactions FOR UPDATE USING (crm.can_access_event(tenant_id, outlet_id)) WITH CHECK (crm.can_access_event(tenant_id, outlet_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON crm.outlet_events, crm.outlet_event_transactions TO sensible_app_role;
GRANT SELECT ON crm.outlet_events, crm.outlet_event_transactions TO sensible_rls_owner;
