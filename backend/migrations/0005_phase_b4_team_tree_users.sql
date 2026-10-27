SET TIME ZONE 'UTC';

CREATE TABLE crm.user_profiles (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  profile_role varchar(64) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_profiles_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT user_profiles_tenant_business_user_uq UNIQUE (tenant_id, business_id, user_id),
  CONSTRAINT user_profiles_business_tenant_fk FOREIGN KEY (tenant_id, business_id)
    REFERENCES tenancy.businesses(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT user_profiles_membership_fk FOREIGN KEY (tenant_id, user_id)
    REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE CASCADE,
  CONSTRAINT user_profiles_role_ck CHECK (profile_role IN ('USER','SUPER_ADMIN','SUB_SUPER_ADMIN','ADMIN','SUPPORT','MANAGER'))
);
CREATE INDEX user_profiles_tenant_user_active_idx ON crm.user_profiles (tenant_id, user_id, active);
CREATE INDEX user_profiles_business_role_active_idx ON crm.user_profiles (business_id, profile_role, active);

CREATE TABLE crm.team_memberships (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  user_profile_id uuid NOT NULL,
  user_id uuid NOT NULL,
  department varchar(64) NOT NULL,
  zone varchar(100),
  manager_profile_id uuid,
  emp_code varchar(50) NOT NULL,
  is_on_payroll boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_memberships_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT team_memberships_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT team_memberships_profile_tenant_fk FOREIGN KEY (tenant_id, user_profile_id)
    REFERENCES crm.user_profiles(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT team_memberships_manager_tenant_fk FOREIGN KEY (tenant_id, manager_profile_id)
    REFERENCES crm.user_profiles(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT team_memberships_business_tenant_fk FOREIGN KEY (tenant_id, business_id)
    REFERENCES tenancy.businesses(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT team_memberships_user_tenant_fk FOREIGN KEY (tenant_id, user_id)
    REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE CASCADE,
  CONSTRAINT team_memberships_not_self_managed_ck CHECK (manager_profile_id IS NULL OR manager_profile_id <> user_profile_id),
  CONSTRAINT team_memberships_department_ck CHECK (department IN ('SALES','IT','HR','ACCOUNT','SUPPORT','HARDWARE')),
  CONSTRAINT team_memberships_zone_ck CHECK (zone IS NULL OR length(btrim(zone)) BETWEEN 1 AND 100)
);
CREATE UNIQUE INDEX team_memberships_scope_uq
  ON crm.team_memberships (tenant_id, user_profile_id, outlet_id, department, coalesce(zone, ''));
CREATE INDEX team_memberships_outlet_department_active_idx ON crm.team_memberships (tenant_id, outlet_id, department, active);
CREATE INDEX team_memberships_manager_active_idx ON crm.team_memberships (tenant_id, manager_profile_id, active);
CREATE INDEX team_memberships_user_active_idx ON crm.team_memberships (tenant_id, user_id, active);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.team_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION iam.has_outlet_permission(requested_tenant_id uuid, requested_outlet_id uuid, requested_permission text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, iam, tenancy
AS $$
  SELECT tenancy.is_tenant_admin(requested_tenant_id) OR EXISTS (
    SELECT 1 FROM crm.user_profiles profile
    JOIN crm.team_memberships team ON team.user_profile_id = profile.id AND team.tenant_id = profile.tenant_id
    WHERE profile.tenant_id = requested_tenant_id AND profile.user_id = iam.current_user_id()
      AND profile.profile_role = 'SUPER_ADMIN' AND profile.active
      AND team.outlet_id = requested_outlet_id AND team.active
  ) OR EXISTS (
    SELECT 1
    FROM tenancy.outlet_assignments assignment
    JOIN iam.roles role ON role.id = assignment.role_id AND role.tenant_id = assignment.tenant_id AND role.active
    JOIN iam.role_permissions role_permission ON role_permission.role_id = role.id AND role_permission.tenant_id = role.tenant_id
    JOIN iam.permissions permission ON permission.id = role_permission.permission_id
    WHERE assignment.tenant_id = requested_tenant_id
      AND assignment.outlet_id = requested_outlet_id
      AND assignment.user_id = iam.current_user_id()
      AND assignment.active
      AND permission.permission_key = requested_permission
  )
$$;
ALTER FUNCTION iam.has_outlet_permission(uuid, uuid, text) OWNER TO sensible_rls_owner;
GRANT EXECUTE ON FUNCTION iam.has_outlet_permission(uuid, uuid, text) TO sensible_rls_owner, sensible_app_role;

CREATE OR REPLACE FUNCTION crm.can_access_team_scope(requested_tenant_id uuid, requested_outlet_id uuid, requested_department text, requested_zone text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, crm, iam, tenancy
AS $$
  SELECT tenancy.is_tenant_admin(requested_tenant_id) OR EXISTS (
    SELECT 1 FROM crm.user_profiles profile
    JOIN crm.team_memberships own_team ON own_team.user_profile_id = profile.id AND own_team.tenant_id = profile.tenant_id
    WHERE profile.tenant_id = requested_tenant_id AND profile.user_id = iam.current_user_id()
      AND profile.profile_role = 'SUPER_ADMIN' AND profile.active
      AND own_team.outlet_id = requested_outlet_id AND own_team.active
  ) OR EXISTS (
    SELECT 1 FROM crm.team_memberships own_team
    WHERE own_team.tenant_id = requested_tenant_id
      AND own_team.user_id = iam.current_user_id()
      AND own_team.outlet_id = requested_outlet_id
      AND own_team.department = requested_department
      AND own_team.active
      AND (own_team.zone IS NULL OR requested_zone IS NULL OR upper(own_team.zone) = upper(requested_zone))
  )
$$;
ALTER FUNCTION crm.can_access_team_scope(uuid, uuid, text, text) OWNER TO sensible_rls_owner;
GRANT EXECUTE ON FUNCTION crm.can_access_team_scope(uuid, uuid, text, text) TO sensible_rls_owner, sensible_app_role;
ALTER TABLE crm.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.user_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY user_profiles_select ON crm.user_profiles FOR SELECT USING (tenancy.has_tenant_access(tenant_id));
CREATE POLICY user_profiles_insert ON crm.user_profiles FOR INSERT WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY user_profiles_update ON crm.user_profiles FOR UPDATE USING (tenancy.is_tenant_admin(tenant_id)) WITH CHECK (tenancy.is_tenant_admin(tenant_id));
CREATE POLICY user_profiles_delete ON crm.user_profiles FOR DELETE USING (tenancy.is_tenant_admin(tenant_id));

ALTER TABLE crm.team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.team_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY team_memberships_select ON crm.team_memberships FOR SELECT USING (tenancy.can_access_outlet(tenant_id, outlet_id) AND crm.can_access_team_scope(tenant_id, outlet_id, department, zone));
CREATE POLICY team_memberships_insert ON crm.team_memberships FOR INSERT WITH CHECK (
  (tenancy.is_tenant_admin(tenant_id) OR iam.has_outlet_permission(tenant_id, outlet_id, 'team.manage'))
  AND crm.can_access_team_scope(tenant_id, outlet_id, department, zone)
);
CREATE POLICY team_memberships_update ON crm.team_memberships FOR UPDATE USING (
  (tenancy.is_tenant_admin(tenant_id) OR iam.has_outlet_permission(tenant_id, outlet_id, 'team.manage'))
  AND crm.can_access_team_scope(tenant_id, outlet_id, department, zone)
) WITH CHECK ((tenancy.is_tenant_admin(tenant_id) OR iam.has_outlet_permission(tenant_id, outlet_id, 'team.manage'))
  AND crm.can_access_team_scope(tenant_id, outlet_id, department, zone));
CREATE POLICY team_memberships_delete ON crm.team_memberships FOR DELETE USING (
  (tenancy.is_tenant_admin(tenant_id) OR iam.has_outlet_permission(tenant_id, outlet_id, 'team.manage'))
  AND crm.can_access_team_scope(tenant_id, outlet_id, department, zone)
);

-- PostgreSQL user provisioning is intentionally limited to a current tenant administrator.
CREATE POLICY users_insert_tenant_admin ON iam.users FOR INSERT WITH CHECK (
  tenancy.is_tenant_admin(tenancy.current_tenant_id())
);
CREATE POLICY credentials_insert_tenant_admin ON iam.user_credentials FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM tenancy.tenant_memberships membership
    WHERE membership.tenant_id = tenancy.current_tenant_id()
      AND membership.user_id = iam.user_credentials.user_id)
  AND tenancy.is_tenant_admin(tenancy.current_tenant_id())
);

REVOKE ALL ON crm.user_profiles, crm.team_memberships FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.user_profiles, crm.team_memberships TO sensible_app_role;
GRANT SELECT ON crm.user_profiles, crm.team_memberships TO sensible_rls_owner;
