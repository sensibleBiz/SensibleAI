SET TIME ZONE 'UTC';

INSERT INTO iam.permissions (permission_key, description, catalog_key, label, category) VALUES
  ('outlets.read', 'View authorized outlets', 'CRM_SETTINGS_VIEW', 'View settings', 'Settings'),
  ('outlets.manage', 'Manage outlets within an administered tenant', 'CRM_OUTLETS_MANAGE', 'Manage outlets', 'Settings'),
  ('members.manage', 'Manage memberships within an administered tenant', 'CRM_MEMBERS_MANAGE', 'Manage memberships', 'Permissions'),
  ('team.read', 'View PostgreSQL team members', 'CRM_TEAMTREE_VIEW', 'View team tree', 'Team'),
  ('team.manage', 'Manage PostgreSQL team memberships', 'CRM_TEAMTREE_EDIT', 'Edit team tree', 'Team'),
  ('users.create', 'Provision PostgreSQL users', 'CRM_TEAMTREE_CREATE', 'Create team users', 'Team'),
  ('payroll.read', 'View PostgreSQL payroll and salary structures', 'CRM_PAYROLL_VIEW', 'View payroll', 'Payroll'),
  ('payroll.manage', 'Create and update PostgreSQL salary structures and payroll runs', 'CRM_PAYROLL_MANAGE', 'Manage payroll', 'Payroll')
ON CONFLICT (permission_key) DO UPDATE SET
  catalog_key = COALESCE(EXCLUDED.catalog_key, iam.permissions.catalog_key),
  label = COALESCE(EXCLUDED.label, iam.permissions.label),
  category = COALESCE(EXCLUDED.category, iam.permissions.category),
  catalog_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  crm.employee_salary_structures,
  crm.salary_structure_revisions,
  crm.payroll_runs,
  crm.payroll_run_summaries
TO sensible_app_role;

GRANT SELECT ON
  crm.employee_salary_structures,
  crm.salary_structure_revisions,
  crm.payroll_runs,
  crm.payroll_run_summaries
TO sensible_rls_owner;

GRANT EXECUTE ON FUNCTION crm.can_access_payroll(uuid, uuid) TO sensible_app_role;
