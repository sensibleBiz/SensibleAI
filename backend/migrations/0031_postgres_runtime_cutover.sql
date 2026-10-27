SET TIME ZONE 'UTC';

ALTER TABLE iam.qr_sessions ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

CREATE OR REPLACE FUNCTION iam.consume_qr_session(requested_id uuid)
RETURNS uuid
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, iam
AS $$
  UPDATE iam.qr_sessions SET consumed_at = now()
  WHERE id = requested_id AND expires_at > now() AND claimed_at IS NOT NULL AND consumed_at IS NULL
  RETURNING legacy_profile_id::uuid
$$;
ALTER FUNCTION iam.consume_qr_session(uuid) OWNER TO sensible_rls_owner;
REVOKE ALL ON FUNCTION iam.consume_qr_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION iam.consume_qr_session(uuid) TO sensible_app_role;

CREATE TABLE crm.integrations (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL,
  integration_key text NOT NULL, integration_type varchar(32) NOT NULL, description text NOT NULL DEFAULT '',
  access_token text, active boolean NOT NULL DEFAULT true, auto_assign_enabled boolean NOT NULL DEFAULT false,
  auto_assign_user_id uuid, auto_assign_employee_name text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integrations_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT integrations_assignee_fk FOREIGN KEY (tenant_id, auto_assign_user_id) REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE SET NULL,
  CONSTRAINT integrations_scope_key_uq UNIQUE (tenant_id, outlet_id, integration_type, integration_key),
  CONSTRAINT integrations_metadata_ck CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX integrations_outlet_idx ON crm.integrations (tenant_id, outlet_id, updated_at DESC);

CREATE TABLE crm.facebook_pages (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL,
  integration_id uuid REFERENCES crm.integrations(id) ON DELETE CASCADE, provider_page_id text NOT NULL,
  page_name text NOT NULL, category text, active boolean NOT NULL DEFAULT true,
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facebook_pages_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT facebook_pages_scope_uq UNIQUE (tenant_id, outlet_id, provider_page_id),
  CONSTRAINT facebook_pages_json_ck CHECK (jsonb_typeof(credentials) = 'object' AND jsonb_typeof(metadata) = 'object')
);

CREATE TABLE crm.whatsapp_automation_rules (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL,
  trigger_event varchar(64) NOT NULL, name text NOT NULL, active boolean NOT NULL DEFAULT false,
  template_name text NOT NULL, language_code varchar(16) NOT NULL DEFAULT 'en', recipient_type varchar(32) NOT NULL,
  parameter_mapping jsonb NOT NULL DEFAULT '{}'::jsonb, conditions jsonb, template_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_automation_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_automation_template_uq UNIQUE (tenant_id, outlet_id, template_name, language_code),
  CONSTRAINT whatsapp_automation_json_ck CHECK (jsonb_typeof(parameter_mapping) = 'object' AND (conditions IS NULL OR jsonb_typeof(conditions) = 'object') AND jsonb_typeof(template_payload) = 'object')
);
CREATE INDEX whatsapp_automation_trigger_idx ON crm.whatsapp_automation_rules (tenant_id, outlet_id, trigger_event, active);

CREATE TABLE crm.messaging_configs (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL,
  platform varchar(32) NOT NULL, active boolean NOT NULL DEFAULT true, configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messaging_configs_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT messaging_configs_scope_uq UNIQUE (tenant_id, outlet_id, platform),
  CONSTRAINT messaging_configs_json_ck CHECK (jsonb_typeof(configuration) = 'object')
);

CREATE TABLE crm.scheduled_messages (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL,
  recipient text NOT NULL, template_name text, message text, status varchar(32) NOT NULL DEFAULT 'PENDING',
  scheduled_at timestamptz NOT NULL, sent_at timestamptz, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_messages_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT scheduled_messages_payload_ck CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX scheduled_messages_due_idx ON crm.scheduled_messages (tenant_id, status, scheduled_at);

CREATE TABLE crm.application_settings (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(), tenant_id uuid NOT NULL, outlet_id uuid,
  setting_key text NOT NULL, value jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_settings_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT application_settings_scope_uq UNIQUE NULLS NOT DISTINCT (tenant_id, outlet_id, setting_key)
);
CREATE TABLE crm.company_details (
  tenant_id uuid PRIMARY KEY REFERENCES tenancy.tenants(id) ON DELETE CASCADE, details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_details_json_ck CHECK (jsonb_typeof(details) = 'object')
);
CREATE TABLE crm.public_urls (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL,
  owner_user_id uuid NOT NULL, display_name text NOT NULL, target_type varchar(32) NOT NULL, target_id text NOT NULL,
  token uuid NOT NULL DEFAULT public.uuid_generate_v7(), active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_urls_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT public_urls_owner_fk FOREIGN KEY (tenant_id, owner_user_id) REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE CASCADE,
  CONSTRAINT public_urls_token_uq UNIQUE (token)
);

CREATE TABLE crm.wallet_accounts (
  tenant_id uuid NOT NULL, outlet_id uuid NOT NULL, user_id uuid NOT NULL,
  balance numeric(18,2) NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, outlet_id, user_id),
  CONSTRAINT wallet_accounts_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT wallet_accounts_user_fk FOREIGN KEY (tenant_id, user_id) REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE CASCADE
);
CREATE TABLE crm.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL, user_id uuid NOT NULL,
  amount numeric(18,2) NOT NULL, transaction_type varchar(32) NOT NULL, balance_after numeric(18,2) NOT NULL,
  reference_type varchar(64), reference_id text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_transactions_account_fk FOREIGN KEY (tenant_id, outlet_id, user_id) REFERENCES crm.wallet_accounts(tenant_id, outlet_id, user_id) ON DELETE CASCADE,
  CONSTRAINT wallet_transactions_creator_fk FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT wallet_transactions_metadata_ck CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE TABLE crm.push_notification_devices (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(), tenant_id uuid NOT NULL, user_id uuid NOT NULL,
  fcm_token text NOT NULL, device_type varchar(32), active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_devices_user_fk FOREIGN KEY (tenant_id, user_id) REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE CASCADE,
  CONSTRAINT push_devices_token_uq UNIQUE (fcm_token)
);
CREATE TABLE crm.push_notifications (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(), tenant_id uuid NOT NULL, recipient_user_id uuid NOT NULL,
  sender_user_id uuid, title text NOT NULL, body text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_notifications_recipient_fk FOREIGN KEY (tenant_id, recipient_user_id) REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE CASCADE,
  CONSTRAINT push_notifications_sender_fk FOREIGN KEY (tenant_id, sender_user_id) REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE SET NULL,
  CONSTRAINT push_notifications_payload_ck CHECK (jsonb_typeof(payload) = 'object')
);
CREATE TABLE crm.quick_contacts (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL,
  name text NOT NULL, mobile varchar(32) NOT NULL, company_name text, business_type text, source_name text, source_type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quick_contacts_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT quick_contacts_metadata_ck CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE TABLE crm.shifts (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL,
  opened_by_user_id uuid NOT NULL, closed_by_user_id uuid, opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
  opening_cash numeric(18,2) NOT NULL DEFAULT 0, closing_cash numeric(18,2), status varchar(16) NOT NULL DEFAULT 'OPEN',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT shifts_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT shifts_opened_by_fk FOREIGN KEY (tenant_id, opened_by_user_id) REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT shifts_closed_by_fk FOREIGN KEY (tenant_id, closed_by_user_id) REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT shifts_status_ck CHECK (status IN ('OPEN','CLOSED')),
  CONSTRAINT shifts_metadata_ck CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE TABLE crm.sales_orders (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL,
  order_number text NOT NULL, customer_id uuid REFERENCES crm.customers(id) ON DELETE SET NULL,
  status varchar(32) NOT NULL DEFAULT 'DRAFT', currency varchar(3) NOT NULL DEFAULT 'INR',
  subtotal numeric(18,2) NOT NULL DEFAULT 0, tax_amount numeric(18,2) NOT NULL DEFAULT 0, total_amount numeric(18,2) NOT NULL DEFAULT 0,
  order_data jsonb NOT NULL DEFAULT '{}'::jsonb, created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_orders_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT sales_orders_creator_fk FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT sales_orders_scope_number_uq UNIQUE (tenant_id, outlet_id, order_number),
  CONSTRAINT sales_orders_data_ck CHECK (jsonb_typeof(order_data) = 'object')
);

INSERT INTO iam.permissions (permission_key, description, catalog_key, label, category)
VALUES
  ('integrations.read', 'View integrations', 'CRM_INTEGRATION_VIEW', 'View integrations', 'Integrations'),
  ('integrations.create', 'Create integrations', 'CRM_INTEGRATION_CREATE', 'Create integrations', 'Integrations'),
  ('integrations.update', 'Update integrations', 'CRM_INTEGRATION_EDIT', 'Edit integrations', 'Integrations'),
  ('integrations.delete', 'Delete integrations', 'CRM_INTEGRATION_DELETE', 'Delete integrations', 'Integrations')
ON CONFLICT (permission_key) DO UPDATE SET
  description = EXCLUDED.description,
  catalog_key = EXCLUDED.catalog_key,
  label = EXCLUDED.label,
  category = EXCLUDED.category;

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'integrations','facebook_pages','whatsapp_automation_rules','messaging_configs','scheduled_messages',
    'application_settings','company_details','public_urls','wallet_accounts','wallet_transactions',
    'push_notification_devices','push_notifications','quick_contacts','shifts','sales_orders'
  ] LOOP
    EXECUTE format('ALTER TABLE crm.%I OWNER TO sensible_rls_owner', table_name);
    EXECUTE format('ALTER TABLE crm.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE crm.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON crm.%I TO sensible_app_role', table_name);
  END LOOP;
END $$;

CREATE POLICY integrations_tenant ON crm.integrations USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY facebook_pages_tenant ON crm.facebook_pages USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY whatsapp_automation_tenant ON crm.whatsapp_automation_rules USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY messaging_configs_tenant ON crm.messaging_configs USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY scheduled_messages_tenant ON crm.scheduled_messages USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY application_settings_tenant ON crm.application_settings USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY company_details_tenant ON crm.company_details USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY public_urls_tenant ON crm.public_urls USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY wallet_accounts_tenant ON crm.wallet_accounts USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY wallet_transactions_tenant ON crm.wallet_transactions USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY push_devices_tenant ON crm.push_notification_devices USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY push_notifications_tenant ON crm.push_notifications USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY quick_contacts_tenant ON crm.quick_contacts USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY shifts_tenant ON crm.shifts USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY sales_orders_tenant ON crm.sales_orders USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());

-- Keep CREATE available to the dedicated owner until every migration has
-- finished transferring functions and tables. Lock the schemas down only at
-- the end of the complete migration chain.
REVOKE CREATE ON SCHEMA iam, tenancy, crm FROM sensible_rls_owner;
