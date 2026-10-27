SET TIME ZONE 'UTC';

-- Repair Team Tree access only for the requested outlet. If the outlet has no
-- explicit feature configuration, the application already enables the full
-- default catalog and no feature row is required.
INSERT INTO tenancy.outlet_features (tenant_id, outlet_id, feature_key, enabled)
SELECT outlet.tenant_id, outlet.id, 'team_tree', true
FROM tenancy.outlets outlet
WHERE outlet.id = '487f6044-5f8e-7b89-87a0-b952bb81e625'::uuid
  AND outlet.active
  AND (
    EXISTS (
      SELECT 1
      FROM tenancy.outlet_features existing
      WHERE existing.tenant_id = outlet.tenant_id
        AND existing.outlet_id = outlet.id
    )
    OR EXISTS (
      SELECT 1
      FROM tenancy.outlet_feature_configs config
      WHERE config.tenant_id = outlet.tenant_id
        AND config.outlet_id = outlet.id
        AND config.is_configured
    )
  )
ON CONFLICT (outlet_id, feature_key)
DO UPDATE SET enabled = true;

-- Keep the permission catalog mapping available for the frontend alias.
INSERT INTO iam.permissions (
  permission_key, description, catalog_key, label, category
) VALUES (
  'team.read',
  'View PostgreSQL team members',
  'CRM_TEAMTREE_VIEW',
  'View team tree',
  'Team'
)
ON CONFLICT (permission_key) DO UPDATE SET
  catalog_key = EXCLUDED.catalog_key,
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  catalog_active = true;

-- Grant view access only to active ADMIN/SUPER_ADMIN users assigned to this
-- outlet. Direct outlet grants avoid expanding a shared role in other outlets.
INSERT INTO iam.user_outlet_permissions (
  tenant_id, outlet_id, user_id, permission_id
)
SELECT assignment.tenant_id, assignment.outlet_id, assignment.user_id, permission.id
FROM tenancy.outlet_assignments assignment
JOIN iam.roles role
  ON role.tenant_id = assignment.tenant_id
 AND role.id = assignment.role_id
 AND role.active
JOIN iam.permissions permission
  ON permission.permission_key = 'team.read'
WHERE assignment.outlet_id = '487f6044-5f8e-7b89-87a0-b952bb81e625'::uuid
  AND assignment.active
  AND regexp_replace(upper(role.name), '[^A-Z0-9]', '', 'g')
      IN ('ADMIN', 'SUPERADMIN')
ON CONFLICT (outlet_id, user_id, permission_id) DO NOTHING;
