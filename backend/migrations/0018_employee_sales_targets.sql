SET TIME ZONE 'UTC';

CREATE TABLE IF NOT EXISTS crm.employee_sales_targets (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  sale_executive_user_id uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  created_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  zone varchar(40) NOT NULL,
  sale_executive varchar(500) NOT NULL DEFAULT '',
  forecast_net_sales numeric(18,2) NOT NULL DEFAULT 0,
  achieved_net_sales numeric(18,2) NOT NULL DEFAULT 0,
  display_order integer NOT NULL DEFAULT 0,
  target_month smallint NOT NULL,
  target_year smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_sales_targets_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT employee_sales_targets_zone_ck CHECK (zone IN ('South', 'West', 'East', 'North', 'Subscriptions')),
  CONSTRAINT employee_sales_targets_amounts_ck CHECK (forecast_net_sales >= 0 AND achieved_net_sales >= 0),
  CONSTRAINT employee_sales_targets_month_ck CHECK (target_month BETWEEN 1 AND 12),
  CONSTRAINT employee_sales_targets_year_ck CHECK (target_year BETWEEN 2000 AND 2100)
);

CREATE INDEX IF NOT EXISTS employee_sales_targets_period_idx
  ON crm.employee_sales_targets (tenant_id, outlet_id, target_year, target_month, zone, display_order);

DROP TRIGGER IF EXISTS set_updated_at ON crm.employee_sales_targets;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.employee_sales_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE crm.employee_sales_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.employee_sales_targets FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.employee_sales_targets OWNER TO sensible_rls_owner;

DROP POLICY IF EXISTS employee_sales_targets_select ON crm.employee_sales_targets;
CREATE POLICY employee_sales_targets_select ON crm.employee_sales_targets FOR SELECT
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(tenant_id)
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );
DROP POLICY IF EXISTS employee_sales_targets_insert ON crm.employee_sales_targets;
CREATE POLICY employee_sales_targets_insert ON crm.employee_sales_targets FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(tenant_id)
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
    AND created_by_user_id = iam.current_user_id()
    AND updated_by_user_id = iam.current_user_id()
  );
DROP POLICY IF EXISTS employee_sales_targets_update ON crm.employee_sales_targets;
CREATE POLICY employee_sales_targets_update ON crm.employee_sales_targets FOR UPDATE
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(tenant_id)
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  )
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
    AND updated_by_user_id = iam.current_user_id()
  );
DROP POLICY IF EXISTS employee_sales_targets_delete ON crm.employee_sales_targets;
CREATE POLICY employee_sales_targets_delete ON crm.employee_sales_targets FOR DELETE
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(tenant_id)
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );

INSERT INTO iam.permissions (permission_key, description, catalog_key, label, category) VALUES
  ('lead_targets.read', 'View PostgreSQL employee sales targets', 'CRM_EMPLOYEE_TARGET_VIEW', 'View employee targets', 'Reports'),
  ('lead_targets.create', 'Create PostgreSQL employee sales targets', 'CRM_EMPLOYEE_TARGET_CREATE', 'Create employee targets', 'Reports'),
  ('lead_targets.update', 'Update PostgreSQL employee sales targets', 'CRM_EMPLOYEE_TARGET_EDIT', 'Edit employee targets', 'Reports'),
  ('lead_targets.delete', 'Delete PostgreSQL employee sales targets', 'CRM_EMPLOYEE_TARGET_DELETE', 'Delete employee targets', 'Reports')
ON CONFLICT (permission_key) DO UPDATE SET
  description = EXCLUDED.description,
  catalog_key = COALESCE(iam.permissions.catalog_key, EXCLUDED.catalog_key),
  label = COALESCE(iam.permissions.label, EXCLUDED.label),
  category = COALESCE(iam.permissions.category, EXCLUDED.category);

GRANT SELECT, INSERT, UPDATE, DELETE ON crm.employee_sales_targets TO sensible_app_role;