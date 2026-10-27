SET TIME ZONE 'UTC';

-- timeline_events is a derived projection, never a business source of truth.
-- Source mutations and their projection writes share one PostgreSQL transaction
-- through triggers; a failed projection therefore fails the source mutation too.
-- Source tables and history rows remain authoritative and may be replayed with
-- crm.backfill_timeline_events(tenant_id).
--
-- Supported sources are actual CRM records with a stable customer/lead link:
-- customer outlet membership, leads and their stage/assignment histories,
-- activities, linked calls, and lead-linked quotations. Tasks currently have
-- no customer or lead relation, sales_orders stores opaque order_data without
-- a stable customer/lead FK, and this schema has no payments table; none are
-- projected as customer events until those relationships are modeled.

CREATE TABLE crm.timeline_events (
  id                  uuid         PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id           uuid         NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  outlet_id           uuid         NOT NULL,
  entity_type         varchar(16)  NOT NULL,
  entity_id           uuid         NOT NULL,
  event_type          varchar(40)  NOT NULL,
  source_entity_type  varchar(24)  NOT NULL,
  source_entity_id    uuid         NOT NULL,
  idempotency_key     varchar(200) NOT NULL,
  actor_user_id       uuid         REFERENCES iam.users(id) ON DELETE SET NULL,
  event_time          timestamptz  NOT NULL,
  summary             varchar(240) NOT NULL,
  payload             jsonb        NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT timeline_events_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT timeline_events_idempotency_uq
    UNIQUE (tenant_id, entity_type, entity_id, idempotency_key),
  CONSTRAINT timeline_events_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT timeline_events_entity_type_ck
    CHECK (entity_type IN ('lead', 'customer')),
  CONSTRAINT timeline_events_event_type_ck CHECK (event_type IN (
    'customer_created', 'lead_created', 'stage_changed', 'lead_assigned',
    'activity_created', 'activity_completed', 'call_logged', 'quotation_created'
  )),
  CONSTRAINT timeline_events_source_entity_type_ck
    CHECK (source_entity_type IN ('customer_outlet', 'lead', 'activity', 'call', 'quotation')),
  CONSTRAINT timeline_events_payload_ck CHECK (jsonb_typeof(payload) = 'object')
);

-- Main feed: one customer or lead, newest-first with a stable tie-breaker.
CREATE INDEX timeline_events_entity_time_idx
  ON crm.timeline_events (tenant_id, outlet_id, entity_type, entity_id, event_time DESC, id DESC);
-- Reconciliation and source-record troubleshooting.
CREATE INDEX timeline_events_source_idx
  ON crm.timeline_events (tenant_id, source_entity_type, source_entity_id);

ALTER TABLE crm.timeline_events OWNER TO sensible_rls_owner;
ALTER TABLE crm.timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.timeline_events FORCE ROW LEVEL SECURITY;
CREATE POLICY timeline_events_select ON crm.timeline_events FOR SELECT USING (
  tenant_id = tenancy.current_tenant_id()
  AND tenancy.can_access_outlet(tenant_id, outlet_id)
  AND (
    (entity_type = 'lead' AND iam.has_outlet_permission(tenant_id, outlet_id, 'leads.read'))
    OR (entity_type = 'customer' AND iam.has_outlet_permission(tenant_id, outlet_id, 'customers.read'))
  )
);
CREATE POLICY timeline_events_insert ON crm.timeline_events FOR INSERT WITH CHECK (
  tenant_id = tenancy.current_tenant_id()
  AND tenancy.can_access_outlet(tenant_id, outlet_id)
);
CREATE POLICY timeline_events_update ON crm.timeline_events FOR UPDATE USING (
  tenant_id = tenancy.current_tenant_id()
  AND tenancy.can_access_outlet(tenant_id, outlet_id)
) WITH CHECK (
  tenant_id = tenancy.current_tenant_id()
  AND tenancy.can_access_outlet(tenant_id, outlet_id)
);
CREATE POLICY timeline_events_delete ON crm.timeline_events FOR DELETE USING (
  tenant_id = tenancy.current_tenant_id()
  AND tenancy.can_access_outlet(tenant_id, outlet_id)
);
GRANT SELECT ON crm.timeline_events TO sensible_app_role;
GRANT SELECT ON crm.leads, crm.customers, crm.customer_outlets,
  crm.lead_stage_history, crm.lead_assignment_history, crm.activities,
  crm.calls, crm.quotations TO sensible_rls_owner;

-- Cloud SQL restricts ALTER FUNCTION OWNER TO on SECURITY DEFINER functions
-- even for cloudsqlsuperuser. Grant CREATE temporarily, SET ROLE so functions
-- are created already owned by sensible_rls_owner, then revoke.
-- Triggers are created after RESET ROLE because crm_migrator owns the source tables.
GRANT CREATE ON SCHEMA crm TO sensible_rls_owner;
SET ROLE sensible_rls_owner;

-- The helper writes one logical source event to each applicable customer/lead
-- feed. Replaying a source event repairs changed projection fields and does not
-- create duplicates.
CREATE OR REPLACE FUNCTION crm.append_timeline_event(
  p_tenant_id uuid,
  p_outlet_id uuid,
  p_lead_id uuid,
  p_customer_id uuid,
  p_event_type text,
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_actor_user_id uuid,
  p_event_time timestamptz,
  p_summary text,
  p_payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
DECLARE
  v_subject record;
BEGIN
  FOR v_subject IN
    SELECT 'lead'::text AS entity_type, p_lead_id AS entity_id
    WHERE p_lead_id IS NOT NULL
    UNION ALL
    SELECT 'customer'::text, p_customer_id
    WHERE p_customer_id IS NOT NULL
  LOOP
    INSERT INTO crm.timeline_events (
      tenant_id, outlet_id, entity_type, entity_id,
      event_type, source_entity_type, source_entity_id, idempotency_key,
      actor_user_id, event_time, summary, payload
    ) VALUES (
      p_tenant_id, p_outlet_id, v_subject.entity_type, v_subject.entity_id,
      p_event_type, p_source_entity_type, p_source_entity_id,
      p_event_type || ':' ||
        CASE WHEN p_source_entity_type = 'customer_outlet'
          THEN p_customer_id::text || ':' || p_outlet_id::text
          ELSE p_source_entity_id::text
        END,
      p_actor_user_id, p_event_time, left(p_summary, 240), coalesce(p_payload, '{}'::jsonb)
    )
    ON CONFLICT (tenant_id, entity_type, entity_id, idempotency_key) DO UPDATE
    SET outlet_id = EXCLUDED.outlet_id,
        event_type = EXCLUDED.event_type,
        source_entity_type = EXCLUDED.source_entity_type,
        source_entity_id = EXCLUDED.source_entity_id,
        actor_user_id = EXCLUDED.actor_user_id,
        event_time = EXCLUDED.event_time,
        summary = EXCLUDED.summary,
        payload = EXCLUDED.payload;
  END LOOP;
END
$$;
REVOKE ALL ON FUNCTION crm.append_timeline_event(uuid, uuid, uuid, uuid, text, text, uuid, uuid, timestamptz, text, jsonb)
  FROM PUBLIC, sensible_app_role;

CREATE OR REPLACE FUNCTION crm.timeline_on_customer_outlet_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
DECLARE
  v_customer crm.customers%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_customer
  FROM crm.customers
  WHERE tenant_id = NEW.tenant_id AND id = NEW.customer_id;

  PERFORM crm.append_timeline_event(
    NEW.tenant_id, NEW.outlet_id, NULL, NEW.customer_id,
    'customer_created', 'customer_outlet', NEW.id,
    v_customer.created_by, v_customer.created_at,
    'Customer created',
    jsonb_build_object('eventVersion', 1)
  );
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION crm.timeline_on_lead_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
BEGIN
  PERFORM crm.append_timeline_event(
    NEW.tenant_id, NEW.outlet_id, NEW.id, NEW.customer_id,
    'lead_created', 'lead', NEW.id, NEW.created_by_user_id, NEW.created_at,
    'Lead created',
    jsonb_build_object('eventVersion', 1)
  );
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION crm.timeline_on_stage_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
DECLARE
  v_lead crm.leads%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_lead
  FROM crm.leads WHERE tenant_id = NEW.tenant_id AND id = NEW.lead_id;

  PERFORM crm.append_timeline_event(
    NEW.tenant_id, v_lead.outlet_id, NEW.lead_id, v_lead.customer_id,
    'stage_changed', 'lead', NEW.id, NEW.changed_by_user_id, NEW.changed_at,
    CASE WHEN NEW.from_stage IS NULL THEN 'Lead stage set'
      ELSE 'Lead stage changed' END,
    jsonb_build_object(
      'eventVersion', 1, 'fromStage', NEW.from_stage, 'toStage', NEW.to_stage
    )
  );
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION crm.timeline_on_lead_assigned()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
DECLARE
  v_lead crm.leads%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_lead
  FROM crm.leads WHERE tenant_id = NEW.tenant_id AND id = NEW.lead_id;

  PERFORM crm.append_timeline_event(
    NEW.tenant_id, v_lead.outlet_id, NEW.lead_id, v_lead.customer_id,
    'lead_assigned', 'lead', NEW.id, NEW.assigned_by_user_id, NEW.assigned_at,
    'Lead assigned',
    jsonb_build_object('eventVersion', 1, 'assignedToUserId', NEW.assigned_to_user_id)
  );
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION crm.timeline_on_activity_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  v_customer_id := NEW.customer_id;
  IF v_customer_id IS NULL THEN
    SELECT customer_id INTO v_customer_id FROM crm.leads
    WHERE tenant_id = NEW.tenant_id AND id = NEW.lead_id;
  END IF;

  PERFORM crm.append_timeline_event(
    NEW.tenant_id, NEW.outlet_id, NEW.lead_id, v_customer_id,
    'activity_created', 'activity', NEW.id, NEW.created_by_user_id, NEW.created_at,
    NEW.activity_type::text || ' scheduled',
    jsonb_build_object(
      'eventVersion', 1, 'activityType', NEW.activity_type,
      'mode', NEW.mode, 'priority', NEW.priority, 'scheduledAt', NEW.scheduled_at
    )
  );

  IF NEW.status = 'DONE' THEN
    PERFORM crm.append_timeline_event(
      NEW.tenant_id, NEW.outlet_id, NEW.lead_id, v_customer_id,
      'activity_completed', 'activity', NEW.id, NEW.updated_by_user_id,
      coalesce(NEW.completed_at, NEW.updated_at),
      NEW.activity_type::text || ' completed',
      jsonb_build_object(
        'eventVersion', 1, 'activityType', NEW.activity_type,
        'completedAt', NEW.completed_at
      )
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'DONE' THEN
    DELETE FROM crm.timeline_events
    WHERE tenant_id = NEW.tenant_id AND source_entity_type = 'activity'
      AND source_entity_id = NEW.id AND event_type = 'activity_completed';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION crm.timeline_on_call_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  v_customer_id := NEW.customer_id;
  IF NEW.lead_id IS NOT NULL AND v_customer_id IS NULL THEN
    SELECT customer_id INTO v_customer_id FROM crm.leads
    WHERE tenant_id = NEW.tenant_id AND id = NEW.lead_id;
  END IF;
  IF NEW.lead_id IS NOT NULL OR v_customer_id IS NOT NULL THEN
    PERFORM crm.append_timeline_event(
      NEW.tenant_id, NEW.outlet_id, NEW.lead_id, v_customer_id,
      'call_logged', 'call', NEW.id,
      coalesce(NEW.logged_by_user_id, NEW.created_by_user_id), NEW.logged_at,
      initcap(NEW.direction::text) || ' call',
      jsonb_build_object(
        'eventVersion', 1, 'direction', NEW.direction,
        'durationSeconds', NEW.duration_seconds
      )
    );
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION crm.timeline_on_quotation_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;
  SELECT customer_id INTO v_customer_id FROM crm.leads
  WHERE tenant_id = NEW.tenant_id AND id = NEW.lead_id;

  PERFORM crm.append_timeline_event(
    NEW.tenant_id, NEW.outlet_id, NEW.lead_id, v_customer_id,
    'quotation_created', 'quotation', NEW.id, NEW.created_by_user_id,
    NEW.created_at, 'Quotation created',
    jsonb_build_object(
      'eventVersion', 1, 'quotationNumber', NEW.quotation_number,
      'currencyCode', NEW.currency_code
    )
  );
  RETURN NEW;
END
$$;

-- Repeatable, tenant-scoped repair/backfill. Do not run an all-tenant scan from
-- an application session: invoke once per tenant with its DB context. This is
-- additive/upserting only and can safely be retried while live writes continue.
CREATE OR REPLACE FUNCTION crm.backfill_timeline_events(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
DECLARE
  v_event record;
  v_count integer := 0;
BEGIN
  IF p_tenant_id IS DISTINCT FROM tenancy.current_tenant_id()
     AND coalesce(current_setting('app.is_super_admin', true), 'false') <> 'true' THEN
    RAISE EXCEPTION 'timeline backfill is restricted to the current tenant'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM crm.timeline_events timeline_row
  USING crm.activities activity
  WHERE timeline_row.tenant_id = p_tenant_id
    AND activity.tenant_id = p_tenant_id
    AND timeline_row.source_entity_type = 'activity'
    AND timeline_row.source_entity_id = activity.id
    AND timeline_row.event_type = 'activity_completed'
    AND activity.status <> 'DONE';

  FOR v_event IN
    SELECT co.tenant_id, co.outlet_id, NULL::uuid AS lead_id, c.id AS customer_id,
      'customer_created'::text AS event_type, 'customer_outlet'::text AS source_entity_type,
      co.id AS source_entity_id, c.created_by AS actor_user_id, c.created_at AS event_time,
      'Customer created'::text AS summary,
      jsonb_build_object('eventVersion', 1) AS payload
    FROM crm.customer_outlets co
    JOIN crm.customers c ON c.tenant_id = co.tenant_id AND c.id = co.customer_id
    WHERE co.tenant_id = p_tenant_id
    UNION ALL
    SELECT l.tenant_id, l.outlet_id, l.id, l.customer_id,
      'lead_created', 'lead', l.id, l.created_by_user_id, l.created_at,
      'Lead created', jsonb_build_object('eventVersion', 1)
    FROM crm.leads l WHERE l.tenant_id = p_tenant_id
    UNION ALL
    SELECT h.tenant_id, l.outlet_id, h.lead_id, l.customer_id,
      'stage_changed', 'lead', h.id, h.changed_by_user_id, h.changed_at,
      CASE WHEN h.from_stage IS NULL THEN 'Lead stage set' ELSE 'Lead stage changed' END,
      jsonb_build_object('eventVersion', 1, 'fromStage', h.from_stage, 'toStage', h.to_stage)
    FROM crm.lead_stage_history h
    JOIN crm.leads l ON l.tenant_id = h.tenant_id AND l.id = h.lead_id
    WHERE h.tenant_id = p_tenant_id
    UNION ALL
    SELECT h.tenant_id, l.outlet_id, h.lead_id, l.customer_id,
      'lead_assigned', 'lead', h.id, h.assigned_by_user_id, h.assigned_at,
      'Lead assigned',
      jsonb_build_object('eventVersion', 1, 'assignedToUserId', h.assigned_to_user_id)
    FROM crm.lead_assignment_history h
    JOIN crm.leads l ON l.tenant_id = h.tenant_id AND l.id = h.lead_id
    WHERE h.tenant_id = p_tenant_id
    UNION ALL
    SELECT a.tenant_id, a.outlet_id, a.lead_id, coalesce(a.customer_id, l.customer_id),
      'activity_created', 'activity', a.id, a.created_by_user_id, a.created_at,
      a.activity_type::text || ' scheduled',
      jsonb_build_object('eventVersion', 1, 'activityType', a.activity_type,
        'mode', a.mode, 'priority', a.priority, 'scheduledAt', a.scheduled_at)
    FROM crm.activities a
    LEFT JOIN crm.leads l ON l.tenant_id = a.tenant_id AND l.id = a.lead_id
    WHERE a.tenant_id = p_tenant_id
    UNION ALL
    SELECT a.tenant_id, a.outlet_id, a.lead_id, coalesce(a.customer_id, l.customer_id),
      'activity_completed', 'activity', a.id, a.updated_by_user_id,
      coalesce(a.completed_at, a.updated_at), a.activity_type::text || ' completed',
      jsonb_build_object('eventVersion', 1, 'activityType', a.activity_type,
        'completedAt', a.completed_at)
    FROM crm.activities a
    LEFT JOIN crm.leads l ON l.tenant_id = a.tenant_id AND l.id = a.lead_id
    WHERE a.tenant_id = p_tenant_id AND a.status = 'DONE'
    UNION ALL
    SELECT c.tenant_id, c.outlet_id, c.lead_id,
      coalesce(c.customer_id, l.customer_id),
      'call_logged', 'call', c.id, coalesce(c.logged_by_user_id, c.created_by_user_id),
      c.logged_at, initcap(c.direction::text) || ' call',
      jsonb_build_object('eventVersion', 1, 'direction', c.direction,
        'durationSeconds', c.duration_seconds)
    FROM crm.calls c
    LEFT JOIN crm.leads l ON l.tenant_id = c.tenant_id AND l.id = c.lead_id
    WHERE c.tenant_id = p_tenant_id
      AND (c.lead_id IS NOT NULL OR c.customer_id IS NOT NULL)
    UNION ALL
    SELECT q.tenant_id, q.outlet_id, q.lead_id, l.customer_id,
      'quotation_created', 'quotation', q.id, q.created_by_user_id,
      q.created_at, 'Quotation created',
      jsonb_build_object('eventVersion', 1, 'quotationNumber', q.quotation_number,
        'currencyCode', q.currency_code)
    FROM crm.quotations q
    JOIN crm.leads l ON l.tenant_id = q.tenant_id AND l.id = q.lead_id
    WHERE q.tenant_id = p_tenant_id
  LOOP
    PERFORM crm.append_timeline_event(
      v_event.tenant_id, v_event.outlet_id, v_event.lead_id, v_event.customer_id,
      v_event.event_type, v_event.source_entity_type, v_event.source_entity_id,
      v_event.actor_user_id, v_event.event_time, v_event.summary, v_event.payload
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END
$$;
REVOKE ALL ON FUNCTION crm.backfill_timeline_events(uuid) FROM PUBLIC, sensible_app_role;

-- Switch back to crm_migrator to create triggers — crm_migrator owns the source tables.
RESET ROLE;

CREATE TRIGGER timeline_customer_outlet_insert
  AFTER INSERT ON crm.customer_outlets
  FOR EACH ROW EXECUTE FUNCTION crm.timeline_on_customer_outlet_insert();

CREATE TRIGGER timeline_lead_insert
  AFTER INSERT ON crm.leads
  FOR EACH ROW EXECUTE FUNCTION crm.timeline_on_lead_insert();

CREATE TRIGGER timeline_stage_change
  AFTER INSERT ON crm.lead_stage_history
  FOR EACH ROW EXECUTE FUNCTION crm.timeline_on_stage_change();

CREATE TRIGGER timeline_lead_assigned
  AFTER INSERT ON crm.lead_assignment_history
  FOR EACH ROW EXECUTE FUNCTION crm.timeline_on_lead_assigned();

CREATE TRIGGER timeline_activity_change
  AFTER INSERT OR UPDATE ON crm.activities
  FOR EACH ROW EXECUTE FUNCTION crm.timeline_on_activity_change();

CREATE TRIGGER timeline_call_insert
  AFTER INSERT OR UPDATE ON crm.calls
  FOR EACH ROW EXECUTE FUNCTION crm.timeline_on_call_insert();

CREATE TRIGGER timeline_quotation_insert
  AFTER INSERT OR UPDATE ON crm.quotations
  FOR EACH ROW EXECUTE FUNCTION crm.timeline_on_quotation_insert();

REVOKE CREATE ON SCHEMA crm FROM sensible_rls_owner;
