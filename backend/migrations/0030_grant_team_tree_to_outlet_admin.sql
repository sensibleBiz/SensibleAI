SET TIME ZONE 'UTC';

-- The requested outlet uses a custom role name (demo-admin). Grant Team Tree
-- to its active tenant administrator without expanding access to regular users
-- or any other outlet.
INSERT INTO iam.user_outlet_permissions (
  tenant_id, outlet_id, user_id, permission_id
)
SELECT assignment.tenant_id, assignment.outlet_id, assignment.user_id, permission.id
FROM tenancy.outlet_assignments assignment
JOIN tenancy.tenant_memberships membership
  ON membership.tenant_id = assignment.tenant_id
 AND membership.user_id = assignment.user_id
 AND membership.active
 AND membership.is_tenant_admin
JOIN iam.permissions permission
  ON permission.permission_key = 'team.read'
WHERE assignment.outlet_id = '487f6044-5f8e-7b89-87a0-b952bb81e625'::uuid
  AND assignment.active
ON CONFLICT (outlet_id, user_id, permission_id) DO NOTHING;
