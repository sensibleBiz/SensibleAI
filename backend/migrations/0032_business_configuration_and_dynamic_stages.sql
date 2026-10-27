SET TIME ZONE 'UTC';

-- 1. Business Configurations (Tenancy schema)
CREATE TABLE IF NOT EXISTS tenancy.business_configurations (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  vertical varchar(64) NOT NULL DEFAULT 'default',
  business_model varchar(64) NOT NULL DEFAULT 'b2b',
  template_version varchar(32) NOT NULL DEFAULT '1.0.0',
  currency varchar(10) NOT NULL DEFAULT 'INR',
  terminology_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_configured boolean NOT NULL DEFAULT false,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_configurations_tenant_business_uq UNIQUE (tenant_id, business_id),
  CONSTRAINT business_configurations_business_tenant_fk FOREIGN KEY (tenant_id, business_id) REFERENCES tenancy.businesses(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS business_configurations_tenant_vertical_idx ON tenancy.business_configurations (tenant_id, vertical);

-- 2. Business Pipeline Stages (CRM schema)
CREATE TABLE IF NOT EXISTS crm.business_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  pipeline_type varchar(64) NOT NULL DEFAULT 'lead',
  stage_key varchar(64) NOT NULL,
  display_name text NOT NULL,
  stage_order integer NOT NULL DEFAULT 0,
  stage_category varchar(32) NOT NULL DEFAULT 'OPEN',
  tab_color varchar(32) NOT NULL DEFAULT '#2563eb',
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_pipeline_stages_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT business_pipeline_stages_biz_pipeline_key_uq UNIQUE (business_id, pipeline_type, stage_key),
  CONSTRAINT business_pipeline_stages_biz_tenant_fk FOREIGN KEY (tenant_id, business_id) REFERENCES tenancy.businesses(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS business_pipeline_stages_biz_order_idx ON crm.business_pipeline_stages (business_id, pipeline_type, stage_order);

-- 3. Business Custom Fields (CRM schema)
CREATE TABLE IF NOT EXISTS crm.business_custom_fields (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  entity_type varchar(64) NOT NULL,
  field_key varchar(64) NOT NULL,
  field_name text NOT NULL,
  data_type varchar(32) NOT NULL DEFAULT 'text',
  field_group varchar(64) NOT NULL DEFAULT 'general',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_required boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_custom_fields_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT business_custom_fields_biz_entity_key_uq UNIQUE (business_id, entity_type, field_key),
  CONSTRAINT business_custom_fields_biz_tenant_fk FOREIGN KEY (tenant_id, business_id) REFERENCES tenancy.businesses(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS business_custom_fields_biz_entity_idx ON crm.business_custom_fields (business_id, entity_type, active);

-- 4. Dynamic Stages & Custom Fields on Leads
ALTER TABLE crm.leads ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES crm.business_pipeline_stages(id) ON DELETE SET NULL;
ALTER TABLE crm.leads ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS leads_tenant_stage_id_idx ON crm.leads (tenant_id, stage_id);

-- 5. Permissions
INSERT INTO iam.permissions (permission_key, description, catalog_key, label, category)
VALUES
  ('configuration.read', 'View business configuration', 'CRM_CONFIG_VIEW', 'View configuration', 'Configuration'),
  ('configuration.manage', 'Manage business configuration', 'CRM_CONFIG_MANAGE', 'Manage configuration', 'Configuration')
ON CONFLICT (permission_key) DO UPDATE SET
  description = EXCLUDED.description,
  catalog_key = EXCLUDED.catalog_key,
  label = EXCLUDED.label,
  category = EXCLUDED.category;

-- 6. Ownership, Row Level Security, and Application Grants
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sensible_rls_owner') THEN
    ALTER TABLE tenancy.business_configurations OWNER TO sensible_rls_owner;
    ALTER TABLE crm.business_pipeline_stages OWNER TO sensible_rls_owner;
    ALTER TABLE crm.business_custom_fields OWNER TO sensible_rls_owner;
  END IF;

  ALTER TABLE tenancy.business_configurations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE tenancy.business_configurations FORCE ROW LEVEL SECURITY;
  ALTER TABLE crm.business_pipeline_stages ENABLE ROW LEVEL SECURITY;
  ALTER TABLE crm.business_pipeline_stages FORCE ROW LEVEL SECURITY;
  ALTER TABLE crm.business_custom_fields ENABLE ROW LEVEL SECURITY;
  ALTER TABLE crm.business_custom_fields FORCE ROW LEVEL SECURITY;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sensible_app_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.business_configurations TO sensible_app_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON crm.business_pipeline_stages TO sensible_app_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON crm.business_custom_fields TO sensible_app_role;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'tenancy' AND tablename = 'business_configurations' AND policyname = 'business_configurations_tenant'
  ) THEN
    CREATE POLICY business_configurations_tenant ON tenancy.business_configurations
      USING (tenant_id = tenancy.current_tenant_id())
      WITH CHECK (tenant_id = tenancy.current_tenant_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'crm' AND tablename = 'business_pipeline_stages' AND policyname = 'business_pipeline_stages_tenant'
  ) THEN
    CREATE POLICY business_pipeline_stages_tenant ON crm.business_pipeline_stages
      USING (tenant_id = tenancy.current_tenant_id())
      WITH CHECK (tenant_id = tenancy.current_tenant_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'crm' AND tablename = 'business_custom_fields' AND policyname = 'business_custom_fields_tenant'
  ) THEN
    CREATE POLICY business_custom_fields_tenant ON crm.business_custom_fields
      USING (tenant_id = tenancy.current_tenant_id())
      WITH CHECK (tenant_id = tenancy.current_tenant_id());
  END IF;
END $$;
