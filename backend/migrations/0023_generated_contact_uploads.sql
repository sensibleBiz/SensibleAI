SET TIME ZONE 'UTC';

CREATE TABLE crm.generated_contact_imports (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  external_import_id uuid NOT NULL,
  file_name varchar(500) NOT NULL,
  worksheet_name varchar(200) NOT NULL,
  uploaded_at timestamptz NOT NULL,
  upload_type varchar(16) NOT NULL,
  upload_name varchar(500) NOT NULL,
  event_details jsonb,
  uploaded_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT generated_contact_imports_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT generated_contact_imports_scope_uq UNIQUE (tenant_id, outlet_id, external_import_id),
  CONSTRAINT generated_contact_imports_type_ck CHECK (upload_type IN ('EVENT','OTHER')),
  CONSTRAINT generated_contact_imports_event_ck CHECK (
    (upload_type = 'EVENT' AND event_details IS NOT NULL) OR
    (upload_type = 'OTHER' AND event_details IS NULL)
  )
);

CREATE TABLE crm.generated_contacts (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  import_id uuid NOT NULL REFERENCES crm.generated_contact_imports(id) ON DELETE CASCADE,
  excel_row_number integer NOT NULL,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_user_id uuid NOT NULL,
  assigned_user_name varchar(300) NOT NULL,
  assigned_employee_code varchar(100) NOT NULL DEFAULT '',
  status varchar(40) NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT generated_contacts_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT generated_contacts_membership_fk FOREIGN KEY (tenant_id, assigned_user_id)
    REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT generated_contacts_import_row_uq UNIQUE (import_id, excel_row_number),
  CONSTRAINT generated_contacts_row_ck CHECK (excel_row_number > 0),
  CONSTRAINT generated_contacts_values_ck CHECK (jsonb_typeof(values) = 'object')
);

CREATE TABLE crm.generated_contact_assignment_history (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES crm.generated_contacts(id) ON DELETE CASCADE,
  assigned_from_user_id uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  assigned_to_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  reassigned_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  reason varchar(1000) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX generated_contact_imports_outlet_uploaded_idx
  ON crm.generated_contact_imports (tenant_id, outlet_id, uploaded_at DESC);
CREATE INDEX generated_contacts_import_idx ON crm.generated_contacts (import_id, excel_row_number);
CREATE INDEX generated_contacts_assignee_idx ON crm.generated_contacts (tenant_id, outlet_id, assigned_user_id, status);

ALTER TABLE crm.generated_contact_imports OWNER TO sensible_rls_owner;
ALTER TABLE crm.generated_contacts OWNER TO sensible_rls_owner;
ALTER TABLE crm.generated_contact_assignment_history OWNER TO sensible_rls_owner;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.generated_contact_imports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.generated_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO iam.permissions (permission_key, description, catalog_key, label, category) VALUES
  ('generated_contacts.read','View generated contact uploads','CRM_CONTACT_UPLOAD_VIEW','View Upload Contacts','AI INTELLIGENCE'),
  ('generated_contacts.create','Upload generated contacts','CRM_CONTACT_UPLOAD_CREATE','Create Upload Contacts','AI INTELLIGENCE'),
  ('generated_contacts.update','Reassign generated contacts','CRM_CONTACT_UPLOAD_UPDATE','Update Upload Contacts','AI INTELLIGENCE'),
  ('generated_contacts.delete','Delete generated contacts','CRM_CONTACT_UPLOAD_DELETE','Delete Upload Contacts','AI INTELLIGENCE')
ON CONFLICT (permission_key) DO UPDATE SET
  description=EXCLUDED.description,
  catalog_key=COALESCE(iam.permissions.catalog_key, EXCLUDED.catalog_key),
  label=COALESCE(iam.permissions.label, EXCLUDED.label),
  category=COALESCE(iam.permissions.category, EXCLUDED.category);

ALTER TABLE crm.generated_contact_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.generated_contact_imports FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.generated_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.generated_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.generated_contact_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.generated_contact_assignment_history FORCE ROW LEVEL SECURITY;

CREATE POLICY generated_contact_imports_select ON crm.generated_contact_imports FOR SELECT USING
  (tenancy.can_access_outlet(tenant_id,outlet_id) AND iam.has_outlet_permission(tenant_id,outlet_id,'generated_contacts.read'));
CREATE POLICY generated_contact_imports_insert ON crm.generated_contact_imports FOR INSERT WITH CHECK
  (tenancy.can_access_outlet(tenant_id,outlet_id) AND uploaded_by_user_id=iam.current_user_id() AND iam.has_outlet_permission(tenant_id,outlet_id,'generated_contacts.create'));
CREATE POLICY generated_contacts_select ON crm.generated_contacts FOR SELECT USING
  (tenancy.can_access_outlet(tenant_id,outlet_id) AND iam.has_outlet_permission(tenant_id,outlet_id,'generated_contacts.read'));
CREATE POLICY generated_contacts_insert ON crm.generated_contacts FOR INSERT WITH CHECK
  (tenancy.can_access_outlet(tenant_id,outlet_id) AND iam.has_outlet_permission(tenant_id,outlet_id,'generated_contacts.create'));
CREATE POLICY generated_contacts_update ON crm.generated_contacts FOR UPDATE USING
  (tenancy.can_access_outlet(tenant_id,outlet_id) AND iam.has_outlet_permission(tenant_id,outlet_id,'generated_contacts.update'))
  WITH CHECK (tenancy.can_access_outlet(tenant_id,outlet_id) AND iam.has_outlet_permission(tenant_id,outlet_id,'generated_contacts.update'));
CREATE POLICY generated_contacts_delete ON crm.generated_contacts FOR DELETE USING
  (tenancy.can_access_outlet(tenant_id,outlet_id) AND iam.has_outlet_permission(tenant_id,outlet_id,'generated_contacts.delete'));
CREATE POLICY generated_contact_assignment_history_select ON crm.generated_contact_assignment_history FOR SELECT USING
  (tenancy.can_access_outlet(tenant_id,outlet_id) AND iam.has_outlet_permission(tenant_id,outlet_id,'generated_contacts.read'));
CREATE POLICY generated_contact_assignment_history_insert ON crm.generated_contact_assignment_history FOR INSERT WITH CHECK
  (tenancy.can_access_outlet(tenant_id,outlet_id) AND reassigned_by_user_id=iam.current_user_id() AND iam.has_outlet_permission(tenant_id,outlet_id,'generated_contacts.update'));

GRANT SELECT,INSERT,UPDATE,DELETE ON crm.generated_contact_imports,crm.generated_contacts,crm.generated_contact_assignment_history TO sensible_app_role;
