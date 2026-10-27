SET TIME ZONE 'UTC';

-- Forward migration: safe for databases where 0032 has already run.
ALTER TABLE crm.products ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE crm.leads ALTER COLUMN stage DROP DEFAULT;
ALTER TABLE crm.leads ALTER COLUMN stage TYPE varchar(64) USING stage::text;
ALTER TABLE crm.leads ALTER COLUMN stage SET DEFAULT 'NEW';
ALTER TABLE crm.lead_stage_history ALTER COLUMN from_stage TYPE varchar(64) USING from_stage::text;
ALTER TABLE crm.lead_stage_history ALTER COLUMN to_stage TYPE varchar(64) USING to_stage::text;

-- Set tenant context while seeding because the configuration tables force RLS.
DO $$
DECLARE
  business record;
  lead_record record;
BEGIN
  FOR business IN SELECT id, tenant_id FROM tenancy.businesses LOOP
    PERFORM set_config('app.current_tenant_id', business.tenant_id::text, true);
    INSERT INTO tenancy.business_configurations (tenant_id, business_id)
      VALUES (business.tenant_id, business.id) ON CONFLICT DO NOTHING;
    INSERT INTO crm.business_pipeline_stages
      (tenant_id, business_id, stage_key, display_name, stage_order, stage_category, tab_color, is_default)
    SELECT business.tenant_id, business.id, key, label, ordering, category, color, is_default
    FROM (VALUES
      ('NEW','New Lead',0,'OPEN','#2563eb',true),
      ('ASSIGNED','Assigned',1,'OPEN','#3b82f6',false),
      ('FOLLOWUP','Follow Up',2,'OPEN','#f59e0b',false),
      ('WON','Won',3,'WON','#10b981',false),
      ('LOST','Lost',4,'LOST','#ef4444',false),
      ('DISQUALIFIED','Disqualified',5,'DISQUALIFIED','#6b7280',false)
    ) defaults(key,label,ordering,category,color,is_default)
    ON CONFLICT DO NOTHING;
    FOR lead_record IN
      SELECT id, COALESCE(updated_by_user_id, created_by_user_id) AS actor_id
      FROM crm.leads
      WHERE tenant_id = business.tenant_id AND business_id = business.id AND stage_id IS NULL
    LOOP
      IF lead_record.actor_id IS NULL THEN
        RAISE EXCEPTION 'Cannot backfill lead stage without an existing user actor';
      END IF;
      PERFORM set_config('app.current_user_id', lead_record.actor_id::text, true);
      UPDATE crm.leads lead SET
        stage_id = stage.id,
        updated_by_user_id = lead_record.actor_id
      FROM crm.business_pipeline_stages stage
      WHERE lead.id = lead_record.id
        AND stage.tenant_id = lead.tenant_id AND stage.business_id = lead.business_id
        AND stage.pipeline_type = 'lead' AND stage.stage_key = lead.stage;
    END LOOP;
  END LOOP;
END $$;

-- Applies to every writer, including activities and imports that still set stage.
CREATE OR REPLACE FUNCTION tenancy.seed_business_pipeline() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, crm AS $$
BEGIN
  INSERT INTO crm.business_pipeline_stages
    (tenant_id, business_id, stage_key, display_name, stage_order, stage_category, tab_color, is_default)
  SELECT NEW.tenant_id, NEW.id, key, label, ordering, category, color, is_default
  FROM (VALUES
    ('NEW','New Lead',0,'OPEN','#2563eb',true),
    ('ASSIGNED','Assigned',1,'OPEN','#3b82f6',false),
    ('FOLLOWUP','Follow Up',2,'OPEN','#f59e0b',false),
    ('WON','Won',3,'WON','#10b981',false),
    ('LOST','Lost',4,'LOST','#ef4444',false),
    ('DISQUALIFIED','Disqualified',5,'DISQUALIFIED','#6b7280',false)
  ) defaults(key,label,ordering,category,color,is_default) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER seed_business_pipeline AFTER INSERT ON tenancy.businesses
  FOR EACH ROW EXECUTE FUNCTION tenancy.seed_business_pipeline();

CREATE OR REPLACE FUNCTION crm.resolve_lead_pipeline_stage() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, crm AS $$
DECLARE resolved_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS NOT DISTINCT FROM OLD.stage
    AND NEW.business_id = OLD.business_id AND NEW.tenant_id = OLD.tenant_id
    AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN RETURN NEW; END IF;
  NEW.stage := upper(NEW.stage);
  SELECT id INTO resolved_id FROM crm.business_pipeline_stages
    WHERE tenant_id = NEW.tenant_id AND business_id = NEW.business_id
      AND pipeline_type = 'lead' AND stage_key = NEW.stage AND is_active;
  IF resolved_id IS NULL THEN
    RAISE EXCEPTION 'Stage is not active for this business' USING ERRCODE = '23514';
  END IF;
  NEW.stage_id := resolved_id;
  RETURN NEW;
END $$;
CREATE TRIGGER resolve_lead_pipeline_stage BEFORE INSERT OR UPDATE OF stage, stage_id, business_id, tenant_id
  ON crm.leads FOR EACH ROW EXECUTE FUNCTION crm.resolve_lead_pipeline_stage();
