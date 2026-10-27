SET TIME ZONE 'UTC';

CREATE TABLE crm.ai_contact_jobs (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  keyword_list text[] NOT NULL,
  category varchar(160) NOT NULL DEFAULT '',
  city varchar(160) NOT NULL DEFAULT '',
  contact_limit integer NOT NULL DEFAULT 100,
  status varchar(32) NOT NULL DEFAULT 'pending',
  contacts_count integer NOT NULL DEFAULT 0,
  received_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  error_details text,
  source varchar(100) NOT NULL DEFAULT 'crm-web',
  created_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_contact_jobs_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ai_contact_jobs_keywords_ck CHECK (
    cardinality(keyword_list) BETWEEN 1 AND 100 AND array_position(keyword_list, '') IS NULL
  ),
  CONSTRAINT ai_contact_jobs_limit_ck CHECK (contact_limit BETWEEN 1 AND 10000),
  CONSTRAINT ai_contact_jobs_status_ck CHECK (status IN ('pending','processing','completed','failed')),
  CONSTRAINT ai_contact_jobs_counts_ck CHECK (
    contacts_count >= 0 AND received_count >= 0 AND sent_count >= 0
  )
);

CREATE INDEX ai_contact_jobs_outlet_created_idx
  ON crm.ai_contact_jobs (tenant_id, outlet_id, created_at DESC, id DESC);
CREATE INDEX ai_contact_jobs_pending_idx
  ON crm.ai_contact_jobs (created_at, id) WHERE status = 'pending';

ALTER TABLE crm.ai_contact_jobs OWNER TO sensible_rls_owner;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.ai_contact_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO iam.permissions
  (permission_key, description, catalog_key, label, category)
VALUES
  ('ai_contacts.read', 'View AI contact keyword jobs', 'CRM_AI_SCRAP_VIEW', 'View AI contacts', 'AI INTELLIGENCE'),
  ('ai_contacts.create', 'Create AI contact keyword jobs', 'CRM_AI_SCRAP_CREATE', 'Create AI contacts', 'AI INTELLIGENCE'),
  ('ai_contacts.update', 'Update AI contact keyword jobs', 'CRM_AI_SCRAP_UPDATE', 'Update AI contacts', 'AI INTELLIGENCE'),
  ('ai_contacts.delete', 'Delete AI contact keyword jobs', 'CRM_AI_SCRAP_DELETE', 'Delete AI contacts', 'AI INTELLIGENCE')
ON CONFLICT (permission_key) DO UPDATE SET
  description = EXCLUDED.description,
  catalog_key = COALESCE(iam.permissions.catalog_key, EXCLUDED.catalog_key),
  label = COALESCE(iam.permissions.label, EXCLUDED.label),
  category = COALESCE(iam.permissions.category, EXCLUDED.category);

ALTER TABLE crm.ai_contact_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.ai_contact_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_contact_jobs_select ON crm.ai_contact_jobs FOR SELECT USING (
  tenancy.can_access_outlet(tenant_id, outlet_id)
  AND iam.has_outlet_permission(tenant_id, outlet_id, 'ai_contacts.read')
);
CREATE POLICY ai_contact_jobs_insert ON crm.ai_contact_jobs FOR INSERT WITH CHECK (
  tenancy.can_access_outlet(tenant_id, outlet_id)
  AND created_by_user_id = iam.current_user_id()
  AND updated_by_user_id = iam.current_user_id()
  AND iam.has_outlet_permission(tenant_id, outlet_id, 'ai_contacts.create')
);
CREATE POLICY ai_contact_jobs_update ON crm.ai_contact_jobs FOR UPDATE USING (
  tenancy.can_access_outlet(tenant_id, outlet_id)
  AND iam.has_outlet_permission(tenant_id, outlet_id, 'ai_contacts.update')
) WITH CHECK (
  tenancy.can_access_outlet(tenant_id, outlet_id)
  AND updated_by_user_id = iam.current_user_id()
  AND iam.has_outlet_permission(tenant_id, outlet_id, 'ai_contacts.update')
);
CREATE POLICY ai_contact_jobs_delete ON crm.ai_contact_jobs FOR DELETE USING (
  tenancy.can_access_outlet(tenant_id, outlet_id)
  AND iam.has_outlet_permission(tenant_id, outlet_id, 'ai_contacts.delete')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON crm.ai_contact_jobs TO sensible_app_role;
