SET TIME ZONE 'UTC';

ALTER TABLE iam.permissions
  ADD COLUMN IF NOT EXISTS label varchar(150),
  ADD COLUMN IF NOT EXISTS category varchar(100),
  ADD COLUMN IF NOT EXISTS catalog_key varchar(160),
  ADD COLUMN IF NOT EXISTS catalog_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES iam.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS permissions_catalog_key_uq
  ON iam.permissions (catalog_key)
  WHERE catalog_key IS NOT NULL;

INSERT INTO iam.permissions (permission_key, description, catalog_key, label, category) VALUES
  ('access_control.permissions.view', 'View PostgreSQL permission catalog', 'CRM_PERMISSION_MASTER_VIEW', 'View permission master', 'Permissions'),
  ('access_control.permissions.create', 'Create PostgreSQL permission catalog entries', 'CRM_PERMISSION_MASTER_CREATE', 'Create permission master', 'Permissions'),
  ('access_control.permissions.update', 'Update PostgreSQL permission catalog entries', 'CRM_PERMISSION_MASTER_EDIT', 'Edit permission master', 'Permissions'),
  ('access_control.permissions.delete', 'Delete PostgreSQL permission catalog entries', 'CRM_PERMISSION_MASTER_DELETE', 'Delete permission master', 'Permissions'),
  ('access_control.users.view', 'View PostgreSQL user access assignments', 'CRM_PERMISSION_VIEW', 'View user access', 'Permissions'),
  ('access_control.users.manage', 'Manage PostgreSQL user role and permission assignments', 'CRM_PERMISSION_EDIT', 'Edit user access', 'Permissions'),
  ('access_control.features.manage', 'Manage PostgreSQL outlet feature access', 'CRM_SETTINGS_EDIT', 'Manage outlet features', 'Settings')
ON CONFLICT (permission_key) DO UPDATE SET
  description = EXCLUDED.description,
  catalog_key = COALESCE(iam.permissions.catalog_key, EXCLUDED.catalog_key),
  label = COALESCE(iam.permissions.label, EXCLUDED.label),
  category = COALESCE(iam.permissions.category, EXCLUDED.category);

UPDATE iam.permissions AS permission
SET
  catalog_key = map.catalog_key,
  label = COALESCE(permission.label, map.label),
  category = COALESCE(permission.category, map.category)
FROM (VALUES
  ('outlets.read', 'CRM_SETTINGS_VIEW', 'View settings', 'Settings'),
  ('outlets.manage', 'CRM_OUTLETS_MANAGE', 'Manage outlets', 'Settings'),
  ('members.manage', 'CRM_MEMBERS_MANAGE', 'Manage memberships', 'Permissions'),
  ('customers.read', 'CRM_CUSTOMERS_VIEW', 'View customers', 'Customers'),
  ('customers.create', 'CRM_CUSTOMERS_CREATE', 'Create customers', 'Customers'),
  ('customers.update', 'CRM_CUSTOMERS_EDIT', 'Edit customers', 'Customers'),
  ('customers.archive', 'CRM_CUSTOMERS_DELETE', 'Archive customers', 'Customers'),
  ('team.read', 'CRM_TEAMTREE_VIEW', 'View team tree', 'Team'),
  ('team.manage', 'CRM_TEAMTREE_EDIT', 'Edit team tree', 'Team'),
  ('users.create', 'CRM_TEAMTREE_CREATE', 'Create team users', 'Team'),
  ('leads.read', 'CRM_LEADS_VIEW', 'View leads', 'Leads'),
  ('leads.create', 'CRM_LEADS_CREATE', 'Create leads', 'Leads'),
  ('leads.import', 'CRM_LEADS_IMPORT', 'Import leads', 'Leads'),
  ('leads.update', 'CRM_LEADS_EDIT', 'Edit leads', 'Leads'),
  ('leads.assign', 'CRM_LEADS_ASSIGN', 'Assign leads', 'Leads'),
  ('leads.share', 'CRM_LEADS_SHARE', 'Share leads', 'Leads'),
  ('lead_reports.read', 'CRM_REPORTS_VIEW', 'View reports', 'Reports'),
  ('lead_reports.employee.read', 'CRM_EMPLOYEE_WISE_REPORT_VIEW', 'View employee reports', 'Reports'),
  ('activities.read', 'CRM_ACTIVITY_VIEW', 'View activities', 'Activities'),
  ('activities.create', 'CRM_ACTIVITY_CREATE', 'Create activities', 'Activities'),
  ('activities.update', 'CRM_ACTIVITY_EDIT', 'Edit activities', 'Activities'),
  ('activities.delete', 'CRM_ACTIVITY_DELETE', 'Delete activities', 'Activities'),
  ('calls.read', 'CRM_CALL_LOGS_VIEW', 'View call logs', 'Calls'),
  ('calls.create', 'CRM_CALL_LOGS_CREATE', 'Create call logs', 'Calls'),
  ('calls.reports.read', 'CRM_CALL_LOGS_REPORT_VIEW', 'View call log reports', 'Reports'),
  ('products.read', 'CRM_PRODUCTS_VIEW', 'View products', 'Products'),
  ('products.create', 'CRM_PRODUCTS_CREATE', 'Create products', 'Products'),
  ('products.update', 'CRM_PRODUCTS_EDIT', 'Edit products', 'Products'),
  ('products.archive', 'CRM_PRODUCTS_DELETE', 'Archive products', 'Products'),
  ('categories.read', 'CRM_CATEGORIES_VIEW', 'View product categories', 'Products'),
  ('categories.create', 'CRM_CATEGORIES_CREATE', 'Create product categories', 'Products'),
  ('categories.update', 'CRM_CATEGORIES_EDIT', 'Edit product categories', 'Products'),
  ('categories.archive', 'CRM_CATEGORIES_DELETE', 'Archive product categories', 'Products'),
  ('warehouses.read', 'CRM_WAREHOUSES_VIEW', 'View warehouses', 'Warehouse'),
  ('warehouses.create', 'CRM_WAREHOUSES_CREATE', 'Create warehouses', 'Warehouse'),
  ('warehouses.update', 'CRM_WAREHOUSES_EDIT', 'Edit warehouses', 'Warehouse'),
  ('warehouses.archive', 'CRM_WAREHOUSES_DELETE', 'Archive warehouses', 'Warehouse'),
  ('inventory.read', 'CRM_INVENTORY_VIEW', 'View inventory', 'Warehouse'),
  ('inventory.adjust', 'CRM_INVENTORY_ADJUST', 'Adjust inventory', 'Warehouse'),
  ('inventory.transfer', 'CRM_INVENTORY_TRANSFER', 'Transfer inventory', 'Warehouse'),
  ('attendance.read', 'CRM_ATTENDANCE_VIEW_ADMIN', 'View attendance', 'Attendance'),
  ('attendance.delete', 'CRM_ATTENDANCE_DELETE', 'Delete attendance', 'Attendance'),
  ('attendance.events.ingest', 'CRM_ATTENDANCE_MARK', 'Ingest attendance events', 'Attendance'),
  ('leave.read', 'CRM_LEAVE_VIEW_ADMIN', 'View leave', 'Leave'),
  ('leave.create', 'CRM_LEAVE_CREATE', 'Create leave types', 'Leave'),
  ('leave.manage', 'CRM_LEAVE_APPROVE', 'Approve leave', 'Leave'),
  ('payroll.read', 'CRM_PAYROLL_VIEW', 'View payroll', 'Payroll'),
  ('payroll.manage', 'CRM_PAYROLL_MANAGE', 'Manage payroll', 'Payroll'),
  ('expense.read', 'CRM_EXPENSE_VIEW', 'View expenses', 'Expense'),
  ('expense.review', 'CRM_EXPENSE_REVIEW', 'Review expenses', 'Expense'),
  ('expense.approve', 'CRM_EXPENSE_APPROVE', 'Approve expenses', 'Expense'),
  ('expense.delete', 'CRM_EXPENSE_DELETE', 'Delete expenses', 'Expense'),
  ('expense.budget.allocate', 'CRM_EXPENSE_BUDGET_ALLOCATE', 'Allocate expense budgets', 'Expense'),
  ('expense.budget.overspend', 'CRM_EXPENSE_BUDGET_OVERSPEND', 'Allow expense budget overspend', 'Expense')
) AS map(permission_key, catalog_key, label, category)
WHERE permission.permission_key = map.permission_key
  AND permission.catalog_key IS NULL;

UPDATE iam.permissions
SET catalog_key = 'CRM_' || replace(upper(permission_key), '.', '_')
WHERE catalog_key IS NULL;

UPDATE iam.permissions
SET label = COALESCE(label, initcap(replace(replace(permission_key, '.', ' '), '_', ' '))),
    category = COALESCE(category, 'General')
WHERE label IS NULL OR category IS NULL;

CREATE TABLE iam.user_outlet_permissions (
  tenant_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission_id uuid NOT NULL REFERENCES iam.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  CONSTRAINT user_outlet_permissions_uq UNIQUE (outlet_id, user_id, permission_id),
  CONSTRAINT user_outlet_permissions_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT user_outlet_permissions_membership_fk FOREIGN KEY (tenant_id, user_id)
    REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE CASCADE
);
CREATE INDEX user_outlet_permissions_user_idx ON iam.user_outlet_permissions (tenant_id, user_id, outlet_id);

CREATE TABLE iam.user_outlet_department_access (
  tenant_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  user_id uuid NOT NULL,
  department varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_outlet_department_access_uq UNIQUE (outlet_id, user_id, department),
  CONSTRAINT user_outlet_department_access_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT user_outlet_department_access_membership_fk FOREIGN KEY (tenant_id, user_id)
    REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE CASCADE,
  CONSTRAINT user_outlet_department_access_department_ck CHECK (department = upper(department))
);
CREATE INDEX user_outlet_department_access_user_idx ON iam.user_outlet_department_access (tenant_id, user_id, outlet_id);

CREATE TABLE tenancy.outlet_feature_configs (
  tenant_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  is_configured boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  updated_at_ms bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outlet_feature_configs_pk PRIMARY KEY (outlet_id),
  CONSTRAINT outlet_feature_configs_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT outlet_feature_configs_revision_ck CHECK (revision >= 0)
);

CREATE TABLE iam.access_control_audit (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid,
  actor_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  action varchar(80) NOT NULL,
  target_type varchar(40) NOT NULL,
  target_id varchar(160) NOT NULL,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_control_audit_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE SET NULL
);
CREATE INDEX access_control_audit_tenant_created_idx ON iam.access_control_audit (tenant_id, created_at DESC);
CREATE INDEX access_control_audit_target_idx ON iam.access_control_audit (tenant_id, target_type, target_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON iam.user_outlet_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON iam.user_outlet_department_access
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenancy.outlet_feature_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION iam.has_permission(requested_permission_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, iam, tenancy
AS $$
  SELECT iam.is_super_admin()
    OR tenancy.is_tenant_admin(tenancy.current_tenant_id())
    OR EXISTS (
      SELECT 1
      FROM tenancy.outlet_assignments assignment
      JOIN iam.roles role
        ON role.id = assignment.role_id AND role.tenant_id = assignment.tenant_id AND role.active
      JOIN iam.role_permissions role_permission
        ON role_permission.role_id = role.id AND role_permission.tenant_id = role.tenant_id
      JOIN iam.permissions permission ON permission.id = role_permission.permission_id
      WHERE assignment.tenant_id = tenancy.current_tenant_id()
        AND assignment.user_id = iam.current_user_id()
        AND assignment.active
        AND permission.catalog_active
        AND (permission.permission_key = requested_permission_key OR permission.catalog_key = requested_permission_key)
    )
    OR EXISTS (
      SELECT 1
      FROM iam.user_outlet_permissions grant_row
      JOIN iam.permissions permission ON permission.id = grant_row.permission_id
      WHERE grant_row.tenant_id = tenancy.current_tenant_id()
        AND grant_row.user_id = iam.current_user_id()
        AND permission.catalog_active
        AND (permission.permission_key = requested_permission_key OR permission.catalog_key = requested_permission_key)
    )
$$;

CREATE OR REPLACE FUNCTION iam.has_outlet_permission(requested_tenant_id uuid, requested_outlet_id uuid, requested_permission text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, iam, tenancy
AS $$
  SELECT iam.is_super_admin()
    OR tenancy.is_tenant_admin(requested_tenant_id)
    OR EXISTS (
      SELECT 1
      FROM tenancy.outlet_assignments assignment
      JOIN iam.roles role
        ON role.id = assignment.role_id AND role.tenant_id = assignment.tenant_id AND role.active
      JOIN iam.role_permissions role_permission
        ON role_permission.role_id = role.id AND role_permission.tenant_id = role.tenant_id
      JOIN iam.permissions permission ON permission.id = role_permission.permission_id
      WHERE assignment.tenant_id = requested_tenant_id
        AND assignment.outlet_id = requested_outlet_id
        AND assignment.user_id = iam.current_user_id()
        AND assignment.active
        AND permission.catalog_active
        AND (permission.permission_key = requested_permission OR permission.catalog_key = requested_permission)
    )
    OR EXISTS (
      SELECT 1
      FROM iam.user_outlet_permissions grant_row
      JOIN iam.permissions permission ON permission.id = grant_row.permission_id
      WHERE grant_row.tenant_id = requested_tenant_id
        AND grant_row.outlet_id = requested_outlet_id
        AND grant_row.user_id = iam.current_user_id()
        AND permission.catalog_active
        AND (permission.permission_key = requested_permission OR permission.catalog_key = requested_permission)
    )
$$;

ALTER FUNCTION iam.has_permission(text) OWNER TO sensible_rls_owner;
ALTER FUNCTION iam.has_outlet_permission(uuid, uuid, text) OWNER TO sensible_rls_owner;

ALTER TABLE iam.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permissions_select ON iam.permissions;
CREATE POLICY permissions_select ON iam.permissions FOR SELECT
  USING (iam.current_user_id() IS NOT NULL OR iam.is_super_admin());
DROP POLICY IF EXISTS permissions_insert ON iam.permissions;
CREATE POLICY permissions_insert ON iam.permissions FOR INSERT
  WITH CHECK (iam.has_permission('access_control.permissions.create'));
DROP POLICY IF EXISTS permissions_update ON iam.permissions;
CREATE POLICY permissions_update ON iam.permissions FOR UPDATE
  USING (iam.has_permission('access_control.permissions.update'))
  WITH CHECK (iam.has_permission('access_control.permissions.update'));
DROP POLICY IF EXISTS permissions_delete ON iam.permissions;
CREATE POLICY permissions_delete ON iam.permissions FOR DELETE
  USING (iam.has_permission('access_control.permissions.delete'));

ALTER TABLE iam.user_outlet_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.user_outlet_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY user_outlet_permissions_select ON iam.user_outlet_permissions FOR SELECT USING (
  tenancy.can_access_outlet(tenant_id, outlet_id)
  OR iam.has_permission('access_control.users.view')
  OR iam.has_permission('access_control.users.manage')
);
CREATE POLICY user_outlet_permissions_write ON iam.user_outlet_permissions
  USING (iam.has_outlet_permission(tenant_id, outlet_id, 'access_control.users.manage'))
  WITH CHECK (iam.has_outlet_permission(tenant_id, outlet_id, 'access_control.users.manage'));

ALTER TABLE iam.user_outlet_department_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.user_outlet_department_access FORCE ROW LEVEL SECURITY;
CREATE POLICY user_outlet_department_access_select ON iam.user_outlet_department_access FOR SELECT USING (
  tenancy.can_access_outlet(tenant_id, outlet_id)
  OR iam.has_permission('access_control.users.view')
  OR iam.has_permission('access_control.users.manage')
);
CREATE POLICY user_outlet_department_access_write ON iam.user_outlet_department_access
  USING (iam.has_outlet_permission(tenant_id, outlet_id, 'access_control.users.manage'))
  WITH CHECK (iam.has_outlet_permission(tenant_id, outlet_id, 'access_control.users.manage'));

ALTER TABLE tenancy.outlet_feature_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.outlet_feature_configs FORCE ROW LEVEL SECURITY;
CREATE POLICY outlet_feature_configs_select ON tenancy.outlet_feature_configs FOR SELECT
  USING (tenancy.can_access_outlet(tenant_id, outlet_id));
CREATE POLICY outlet_feature_configs_write ON tenancy.outlet_feature_configs
  USING (iam.has_outlet_permission(tenant_id, outlet_id, 'access_control.features.manage'))
  WITH CHECK (iam.has_outlet_permission(tenant_id, outlet_id, 'access_control.features.manage'));

ALTER TABLE iam.access_control_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.access_control_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY access_control_audit_select ON iam.access_control_audit FOR SELECT USING (
  tenancy.has_tenant_access(tenant_id)
  AND (
    tenancy.is_tenant_admin(tenant_id)
    OR iam.has_permission('access_control.users.view')
    OR iam.has_permission('access_control.permissions.view')
    OR iam.has_permission('access_control.features.manage')
  )
);
CREATE POLICY access_control_audit_insert ON iam.access_control_audit FOR INSERT WITH CHECK (
  tenancy.has_tenant_access(tenant_id)
  AND actor_user_id = iam.current_user_id()
);

DROP POLICY IF EXISTS assignments_select ON tenancy.outlet_assignments;
CREATE POLICY assignments_select ON tenancy.outlet_assignments FOR SELECT USING (
  tenancy.is_tenant_admin(tenant_id)
  OR (tenant_id = tenancy.current_tenant_id() AND user_id = iam.current_user_id())
  OR iam.has_permission('access_control.users.view')
  OR iam.has_permission('access_control.users.manage')
);
DROP POLICY IF EXISTS assignments_insert ON tenancy.outlet_assignments;
CREATE POLICY assignments_insert ON tenancy.outlet_assignments FOR INSERT WITH CHECK (
  tenancy.is_tenant_admin(tenant_id)
  OR iam.has_outlet_permission(tenant_id, outlet_id, 'access_control.users.manage')
);
DROP POLICY IF EXISTS assignments_update ON tenancy.outlet_assignments;
CREATE POLICY assignments_update ON tenancy.outlet_assignments FOR UPDATE
  USING (
    tenancy.is_tenant_admin(tenant_id)
    OR iam.has_outlet_permission(tenant_id, outlet_id, 'access_control.users.manage')
  )
  WITH CHECK (
    tenancy.is_tenant_admin(tenant_id)
    OR iam.has_outlet_permission(tenant_id, outlet_id, 'access_control.users.manage')
  );
DROP POLICY IF EXISTS assignments_delete ON tenancy.outlet_assignments;
CREATE POLICY assignments_delete ON tenancy.outlet_assignments FOR DELETE USING (
  tenancy.is_tenant_admin(tenant_id)
  OR iam.has_outlet_permission(tenant_id, outlet_id, 'access_control.users.manage')
);

DROP POLICY IF EXISTS user_profiles_update ON crm.user_profiles;
CREATE POLICY user_profiles_update ON crm.user_profiles FOR UPDATE
  USING (
    tenancy.is_tenant_admin(tenant_id)
    OR iam.has_permission('access_control.users.manage')
  )
  WITH CHECK (
    tenancy.is_tenant_admin(tenant_id)
    OR iam.has_permission('access_control.users.manage')
  );

DROP POLICY IF EXISTS outlet_features_isolation ON tenancy.outlet_features;
CREATE POLICY outlet_features_select ON tenancy.outlet_features FOR SELECT
  USING (tenancy.can_access_outlet(tenant_id, outlet_id));
CREATE POLICY outlet_features_write ON tenancy.outlet_features
  USING (iam.has_outlet_permission(tenant_id, outlet_id, 'access_control.features.manage'))
  WITH CHECK (iam.has_outlet_permission(tenant_id, outlet_id, 'access_control.features.manage'));

GRANT SELECT, INSERT, UPDATE, DELETE ON iam.permissions TO sensible_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  iam.user_outlet_permissions,
  iam.user_outlet_department_access,
  tenancy.outlet_feature_configs,
  iam.access_control_audit
TO sensible_app_role;
GRANT SELECT ON
  iam.user_outlet_permissions,
  iam.user_outlet_department_access,
  tenancy.outlet_feature_configs,
  iam.access_control_audit,
  iam.permissions
TO sensible_rls_owner;
GRANT EXECUTE ON FUNCTION iam.has_permission(text), iam.has_outlet_permission(uuid, uuid, text)
TO sensible_app_role, sensible_rls_owner;
