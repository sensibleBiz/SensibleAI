SET TIME ZONE 'UTC';

CREATE TABLE crm.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  legacy_id varchar(1500),
  mobile varchar(32) NOT NULL,
  integrated_number varchar(32) NOT NULL DEFAULT '',
  is_read boolean NOT NULL DEFAULT true,
  unread_count integer NOT NULL DEFAULT 0,
  last_read_at timestamptz,
  sent_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  reply_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_conversations_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_conversations_mobile_ck CHECK (length(btrim(mobile)) > 0),
  CONSTRAINT whatsapp_conversations_unread_ck CHECK (unread_count >= 0),
  CONSTRAINT whatsapp_conversations_sent_messages_ck CHECK (jsonb_typeof(sent_messages) = 'array'),
  CONSTRAINT whatsapp_conversations_reply_messages_ck CHECK (jsonb_typeof(reply_messages) = 'array'),
  CONSTRAINT whatsapp_conversations_metadata_ck CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT whatsapp_conversations_mobile_uq UNIQUE (tenant_id, outlet_id, mobile),
  CONSTRAINT whatsapp_conversations_legacy_uq UNIQUE (tenant_id, outlet_id, legacy_id)
);

CREATE INDEX whatsapp_conversations_outlet_updated_idx ON crm.whatsapp_conversations (tenant_id, outlet_id, updated_at DESC, id DESC);
ALTER TABLE crm.whatsapp_conversations OWNER TO sensible_rls_owner;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO iam.permissions (permission_key, description, catalog_key, label, category) VALUES
  ('whatsapp.read','View and update WhatsApp conversations','CRM_WHATSAPP_VIEW','View WhatsApp','WhatsApp')
ON CONFLICT (permission_key) DO UPDATE SET description=EXCLUDED.description, catalog_key=COALESCE(iam.permissions.catalog_key, EXCLUDED.catalog_key), label=COALESCE(iam.permissions.label, EXCLUDED.label), category=COALESCE(iam.permissions.category, EXCLUDED.category);

ALTER TABLE crm.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.whatsapp_conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_conversations_select ON crm.whatsapp_conversations FOR SELECT USING (tenancy.can_access_outlet(tenant_id,outlet_id) AND iam.has_outlet_permission(tenant_id,outlet_id,'whatsapp.read'));
CREATE POLICY whatsapp_conversations_insert ON crm.whatsapp_conversations FOR INSERT WITH CHECK (tenancy.can_access_outlet(tenant_id,outlet_id) AND iam.has_outlet_permission(tenant_id,outlet_id,'whatsapp.read'));
CREATE POLICY whatsapp_conversations_update ON crm.whatsapp_conversations FOR UPDATE USING (tenancy.can_access_outlet(tenant_id,outlet_id) AND iam.has_outlet_permission(tenant_id,outlet_id,'whatsapp.read')) WITH CHECK (tenancy.can_access_outlet(tenant_id,outlet_id) AND iam.has_outlet_permission(tenant_id,outlet_id,'whatsapp.read'));
GRANT SELECT,INSERT,UPDATE ON crm.whatsapp_conversations TO sensible_app_role;
