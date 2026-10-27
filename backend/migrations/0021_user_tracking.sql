SET TIME ZONE 'UTC';

CREATE TABLE crm.user_tracking_history (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  user_id uuid NOT NULL,
  latitude numeric(10, 7) NOT NULL,
  longitude numeric(10, 7) NOT NULL,
  address text NOT NULL DEFAULT '',
  user_name text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL,
  accuracy_meters numeric(10, 2),
  device_id varchar(200),
  external_source varchar(100) NOT NULL DEFAULT 'mobile',
  external_id varchar(1500),
  created_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_tracking_history_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT user_tracking_history_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT user_tracking_history_membership_fk FOREIGN KEY (tenant_id, user_id)
    REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE CASCADE,
  CONSTRAINT user_tracking_history_latitude_ck CHECK (latitude >= -90 AND latitude <= 90),
  CONSTRAINT user_tracking_history_longitude_ck CHECK (longitude >= -180 AND longitude <= 180),
  CONSTRAINT user_tracking_history_accuracy_ck CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0)
);

CREATE INDEX user_tracking_history_scope_recorded_idx
  ON crm.user_tracking_history (tenant_id, outlet_id, user_id, recorded_at DESC, id DESC);
CREATE UNIQUE INDEX user_tracking_history_external_uq
  ON crm.user_tracking_history (tenant_id, outlet_id, external_source, external_id)
  WHERE external_id IS NOT NULL;

CREATE OR REPLACE FUNCTION crm.can_access_user_tracking(requested_tenant_id uuid, requested_outlet_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
  SELECT requested_tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(requested_tenant_id)
    AND tenancy.can_access_outlet(requested_tenant_id, requested_outlet_id)
$$;
ALTER FUNCTION crm.can_access_user_tracking(uuid, uuid) OWNER TO sensible_rls_owner;

ALTER TABLE crm.user_tracking_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.user_tracking_history FORCE ROW LEVEL SECURITY;
CREATE POLICY user_tracking_history_select ON crm.user_tracking_history FOR SELECT USING (
  crm.can_access_user_tracking(tenant_id, outlet_id)
  AND (
    user_id = iam.current_user_id()
    OR iam.has_outlet_permission(tenant_id, outlet_id, 'tracking.read')
    OR iam.has_outlet_permission(tenant_id, outlet_id, 'tracking.write')
  )
);
CREATE POLICY user_tracking_history_insert ON crm.user_tracking_history FOR INSERT WITH CHECK (
  crm.can_access_user_tracking(tenant_id, outlet_id)
  AND created_by_user_id = iam.current_user_id()
  AND (user_id = iam.current_user_id() OR iam.has_outlet_permission(tenant_id, outlet_id, 'tracking.write'))
);

INSERT INTO iam.permissions
  (permission_key, description, catalog_key, label, category)
VALUES
  ('tracking.read', 'View PostgreSQL user tracking history', 'CRM_USERS_TRACKING_VIEW', 'View user tracking', 'Tracking'),
  ('tracking.write', 'Ingest PostgreSQL user tracking points', 'CRM_USERS_TRACKING_CREATE', 'Create user tracking', 'Tracking')
ON CONFLICT (permission_key) DO UPDATE SET
  description = EXCLUDED.description,
  catalog_key = COALESCE(iam.permissions.catalog_key, EXCLUDED.catalog_key),
  label = COALESCE(iam.permissions.label, EXCLUDED.label),
  category = COALESCE(iam.permissions.category, EXCLUDED.category);

GRANT SELECT, INSERT ON crm.user_tracking_history TO sensible_app_role;
GRANT EXECUTE ON FUNCTION crm.can_access_user_tracking(uuid, uuid) TO sensible_app_role;
