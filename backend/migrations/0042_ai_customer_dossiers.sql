SET TIME ZONE 'UTC';

-- Dossiers are disposable, derived projections. CRM source records and the
-- timeline remain authoritative; no trigger writes AI output back to them.
-- Rows are opt-in per subject and are queued only through the request function.
CREATE TABLE crm.ai_customer_dossiers (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  subject_type varchar(16) NOT NULL,
  subject_id uuid NOT NULL,
  requested_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  status varchar(16) NOT NULL DEFAULT 'pending',
  attempt_count smallint NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  source_version char(32),
  source_watermark jsonb NOT NULL DEFAULT '{}'::jsonb,
  factual_summary text NOT NULL DEFAULT '',
  summary_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  stated_needs jsonb NOT NULL DEFAULT '[]'::jsonb,
  explicit_budget jsonb,
  decision_makers jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_next_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  win_probability numeric(5,4),
  churn_risk numeric(5,4),
  estimates_calibrated boolean NOT NULL DEFAULT false,
  synthesis_provider varchar(32),
  synthesis_model varchar(160),
  synthesis_model_version varchar(100),
  synthesized_at timestamptz,
  synthesis_duration_ms integer,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_micros bigint NOT NULL DEFAULT 0,
  last_error_code varchar(80),
  retain_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_customer_dossiers_subject_uq
    UNIQUE (tenant_id, outlet_id, subject_type, subject_id),
  CONSTRAINT ai_customer_dossiers_outlet_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ai_customer_dossiers_subject_type_ck
    CHECK (subject_type IN ('lead', 'customer')),
  CONSTRAINT ai_customer_dossiers_status_ck
    CHECK (status IN ('pending', 'synthesizing', 'ready', 'stale', 'failed')),
  CONSTRAINT ai_customer_dossiers_attempt_ck CHECK (attempt_count >= 0),
  CONSTRAINT ai_customer_dossiers_json_ck CHECK (
    jsonb_typeof(source_watermark) = 'object'
    AND jsonb_typeof(summary_evidence) = 'array'
    AND jsonb_typeof(facts) = 'array'
    AND jsonb_typeof(stated_needs) = 'array'
    AND (explicit_budget IS NULL OR jsonb_typeof(explicit_budget) = 'object')
    AND jsonb_typeof(decision_makers) = 'array'
    AND jsonb_typeof(risks) = 'array'
    AND jsonb_typeof(suggested_next_actions) = 'array'
  ),
  CONSTRAINT ai_customer_dossiers_scores_ck CHECK (
    (win_probability IS NULL OR win_probability BETWEEN 0 AND 1)
    AND (churn_risk IS NULL OR churn_risk BETWEEN 0 AND 1)
  ),
  -- Estimates cannot be called calibrated until a separate outcome-validation
  -- migration defines and verifies a calibration process.
  CONSTRAINT ai_customer_dossiers_uncalibrated_ck CHECK (estimates_calibrated = false),
  CONSTRAINT ai_customer_dossiers_cost_ck CHECK (
    input_tokens >= 0 AND output_tokens >= 0 AND estimated_cost_micros >= 0
    AND (synthesis_duration_ms IS NULL OR synthesis_duration_ms >= 0)
  )
);

CREATE INDEX ai_customer_dossiers_pending_idx
  ON crm.ai_customer_dossiers (available_at, id)
  WHERE status IN ('pending', 'stale', 'synthesizing') AND attempt_count < 8;
CREATE INDEX ai_customer_dossiers_retention_idx
  ON crm.ai_customer_dossiers (retain_until)
  WHERE retain_until IS NOT NULL;

-- Per-outlet daily reservations cap provider calls, including failed calls.
-- Token and estimated-cost totals support rollout evaluation.
CREATE TABLE crm.ai_dossier_usage_daily (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  usage_date date NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  completed_count integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  estimated_cost_micros bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_dossier_usage_daily_scope_uq UNIQUE (tenant_id, outlet_id, usage_date),
  CONSTRAINT ai_dossier_usage_daily_outlet_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ai_dossier_usage_daily_counts_ck CHECK (
    request_count >= 0 AND completed_count >= 0 AND input_tokens >= 0
    AND output_tokens >= 0 AND estimated_cost_micros >= 0
  )
);

-- One mutable rating per authorized user provides a direct usefulness signal
-- during the preview without exposing individual feedback through the API.
CREATE TABLE crm.ai_dossier_feedback (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  dossier_id uuid NOT NULL REFERENCES crm.ai_customer_dossiers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  useful boolean NOT NULL,
  note varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_dossier_feedback_user_uq UNIQUE (dossier_id, user_id),
  CONSTRAINT ai_dossier_feedback_outlet_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ai_dossier_feedback_note_ck CHECK (note IS NULL OR length(btrim(note)) > 0)
);
CREATE INDEX ai_dossier_feedback_rollout_idx
  ON crm.ai_dossier_feedback (tenant_id, outlet_id, useful, updated_at DESC);

ALTER TABLE crm.ai_customer_dossiers OWNER TO sensible_rls_owner;
ALTER TABLE crm.ai_dossier_usage_daily OWNER TO sensible_rls_owner;
ALTER TABLE crm.ai_dossier_feedback OWNER TO sensible_rls_owner;
ALTER TABLE crm.ai_customer_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.ai_customer_dossiers FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.ai_dossier_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.ai_dossier_usage_daily FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.ai_dossier_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.ai_dossier_feedback FORCE ROW LEVEL SECURITY;

-- Cloud SQL restricts ALTER FUNCTION OWNER TO on SECURITY DEFINER functions.
-- Grant CREATE temporarily; SET ROLE so functions are created as sensible_rls_owner.
-- Triggers are created after RESET ROLE because crm_migrator owns the source tables.
GRANT CREATE ON SCHEMA crm TO sensible_rls_owner;
SET ROLE sensible_rls_owner;

-- Both the per-outlet preview flag and the source-record permission are checked
-- at retrieval time. The API also checks them before issuing a query.
CREATE POLICY ai_customer_dossiers_select ON crm.ai_customer_dossiers FOR SELECT USING (
  tenant_id = tenancy.current_tenant_id()
  AND tenancy.can_access_outlet(tenant_id, outlet_id)
  AND EXISTS (
    SELECT 1 FROM tenancy.outlet_features feature
    WHERE feature.tenant_id = ai_customer_dossiers.tenant_id
      AND feature.outlet_id = ai_customer_dossiers.outlet_id
      AND feature.feature_key = 'ai_customer_dossiers' AND feature.enabled
  )
  AND (
    (subject_type = 'lead' AND iam.has_outlet_permission(tenant_id, outlet_id, 'leads.read'))
    OR (subject_type = 'customer' AND iam.has_outlet_permission(tenant_id, outlet_id, 'customers.read'))
  )
  AND (
    (subject_type = 'lead' AND EXISTS (
      SELECT 1 FROM crm.leads lead
      WHERE lead.tenant_id = ai_customer_dossiers.tenant_id
        AND lead.outlet_id = ai_customer_dossiers.outlet_id
        AND lead.id = ai_customer_dossiers.subject_id
    ))
    OR (subject_type = 'customer' AND EXISTS (
      SELECT 1 FROM crm.customer_outlets customer_outlet
      WHERE customer_outlet.tenant_id = ai_customer_dossiers.tenant_id
        AND customer_outlet.outlet_id = ai_customer_dossiers.outlet_id
        AND customer_outlet.customer_id = ai_customer_dossiers.subject_id
    ))
  )
);
-- FORCE RLS also applies to the table owner. Only narrowly-scoped
-- SECURITY DEFINER functions run as this owner; the application role has no
-- table DML grants, so callers cannot use these policies for direct writes.
CREATE POLICY ai_customer_dossiers_internal_select ON crm.ai_customer_dossiers
  FOR SELECT USING (current_user = 'sensible_rls_owner');
CREATE POLICY ai_customer_dossiers_internal_insert ON crm.ai_customer_dossiers
  FOR INSERT WITH CHECK (current_user = 'sensible_rls_owner');
CREATE POLICY ai_customer_dossiers_internal_update ON crm.ai_customer_dossiers
  FOR UPDATE USING (current_user = 'sensible_rls_owner')
  WITH CHECK (current_user = 'sensible_rls_owner');
GRANT SELECT ON crm.ai_customer_dossiers TO sensible_app_role;

CREATE POLICY ai_dossier_feedback_internal_select ON crm.ai_dossier_feedback
  FOR SELECT USING (current_user = 'sensible_rls_owner');
CREATE POLICY ai_dossier_feedback_internal_insert ON crm.ai_dossier_feedback
  FOR INSERT WITH CHECK (current_user = 'sensible_rls_owner');
CREATE POLICY ai_dossier_feedback_internal_update ON crm.ai_dossier_feedback
  FOR UPDATE USING (current_user = 'sensible_rls_owner')
  WITH CHECK (current_user = 'sensible_rls_owner');

-- No application role receives INSERT/UPDATE/DELETE on the derived table.
-- This narrowly-scoped function can only request or retry background synthesis.
CREATE OR REPLACE FUNCTION crm.request_ai_customer_dossier(
  p_tenant_id uuid,
  p_outlet_id uuid,
  p_subject_type text,
  p_subject_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
DECLARE
  v_id uuid;
  v_permission text;
BEGIN
  IF p_tenant_id IS DISTINCT FROM tenancy.current_tenant_id()
     OR NOT tenancy.can_access_outlet(p_tenant_id, p_outlet_id) THEN
    RAISE EXCEPTION 'dossier outlet access denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tenancy.outlet_features feature
    WHERE feature.tenant_id = p_tenant_id AND feature.outlet_id = p_outlet_id
      AND feature.feature_key = 'ai_customer_dossiers' AND feature.enabled
  ) THEN
    RAISE EXCEPTION 'AI customer dossiers are not enabled for this outlet'
      USING ERRCODE = '42501';
  END IF;

  IF p_subject_type = 'lead' THEN
    v_permission := 'leads.read';
    IF NOT EXISTS (
      SELECT 1 FROM crm.leads lead
      WHERE lead.tenant_id = p_tenant_id AND lead.outlet_id = p_outlet_id
        AND lead.id = p_subject_id
    ) THEN
      RAISE EXCEPTION 'lead was not found' USING ERRCODE = 'P0002';
    END IF;
  ELSIF p_subject_type = 'customer' THEN
    v_permission := 'customers.read';
    IF NOT EXISTS (
      SELECT 1 FROM crm.customer_outlets customer_outlet
      WHERE customer_outlet.tenant_id = p_tenant_id
        AND customer_outlet.outlet_id = p_outlet_id
        AND customer_outlet.customer_id = p_subject_id
    ) THEN
      RAISE EXCEPTION 'customer was not found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported dossier subject type' USING ERRCODE = '22023';
  END IF;

  IF NOT iam.has_outlet_permission(p_tenant_id, p_outlet_id, v_permission) THEN
    RAISE EXCEPTION 'dossier source permission denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO crm.ai_customer_dossiers (
    tenant_id, outlet_id, subject_type, subject_id, requested_by_user_id,
    status, attempt_count, available_at, lease_token, lease_until, last_error_code
  ) VALUES (
    p_tenant_id, p_outlet_id, p_subject_type, p_subject_id, iam.current_user_id(),
    'pending', 0, now(), NULL, NULL, NULL
  )
  ON CONFLICT (tenant_id, outlet_id, subject_type, subject_id) DO UPDATE SET
    requested_by_user_id = iam.current_user_id(),
    status = CASE WHEN crm.ai_customer_dossiers.synthesized_at IS NULL
      THEN 'pending' ELSE 'stale' END,
    attempt_count = 0,
    available_at = now(),
    lease_token = NULL,
    lease_until = NULL,
    last_error_code = NULL,
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;
REVOKE ALL ON FUNCTION crm.request_ai_customer_dossier(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.request_ai_customer_dossier(uuid, uuid, text, uuid)
  TO sensible_app_role;

CREATE OR REPLACE FUNCTION crm.record_ai_customer_dossier_feedback(
  p_tenant_id uuid,
  p_outlet_id uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_useful boolean,
  p_note text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
DECLARE
  v_dossier_id uuid;
  v_permission text;
BEGIN
  IF p_tenant_id IS DISTINCT FROM tenancy.current_tenant_id()
     OR NOT tenancy.can_access_outlet(p_tenant_id, p_outlet_id) THEN
    RAISE EXCEPTION 'dossier feedback outlet access denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tenancy.outlet_features feature
    WHERE feature.tenant_id = p_tenant_id AND feature.outlet_id = p_outlet_id
      AND feature.feature_key = 'ai_customer_dossiers' AND feature.enabled
  ) THEN
    RAISE EXCEPTION 'AI customer dossiers are not enabled for this outlet'
      USING ERRCODE = '42501';
  END IF;
  v_permission := CASE WHEN p_subject_type = 'lead' THEN 'leads.read'
    WHEN p_subject_type = 'customer' THEN 'customers.read' ELSE NULL END;
  IF v_permission IS NULL
     OR NOT iam.has_outlet_permission(p_tenant_id, p_outlet_id, v_permission) THEN
    RAISE EXCEPTION 'dossier feedback permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_dossier_id
  FROM crm.ai_customer_dossiers
  WHERE tenant_id = p_tenant_id AND outlet_id = p_outlet_id
    AND subject_type = p_subject_type AND subject_id = p_subject_id
    AND status = 'ready'
    AND (
      (p_subject_type = 'lead' AND EXISTS (
        SELECT 1 FROM crm.leads lead
        WHERE lead.tenant_id = p_tenant_id AND lead.outlet_id = p_outlet_id
          AND lead.id = p_subject_id
      ))
      OR (p_subject_type = 'customer' AND EXISTS (
        SELECT 1 FROM crm.customer_outlets customer_outlet
        WHERE customer_outlet.tenant_id = p_tenant_id
          AND customer_outlet.outlet_id = p_outlet_id
          AND customer_outlet.customer_id = p_subject_id
      ))
    );
  IF v_dossier_id IS NULL THEN
    RAISE EXCEPTION 'ready dossier was not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO crm.ai_dossier_feedback (
    tenant_id, outlet_id, dossier_id, user_id, useful, note
  ) VALUES (
    p_tenant_id, p_outlet_id, v_dossier_id, iam.current_user_id(), p_useful,
    nullif(left(btrim(p_note), 500), '')
  )
  ON CONFLICT (dossier_id, user_id) DO UPDATE SET
    useful = EXCLUDED.useful, note = EXCLUDED.note, updated_at = now();
END
$$;
REVOKE ALL ON FUNCTION crm.record_ai_customer_dossier_feedback(uuid, uuid, text, uuid, boolean, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.record_ai_customer_dossier_feedback(uuid, uuid, text, uuid, boolean, text)
  TO sensible_app_role;

-- Source mutations only invalidate already-enrolled dossiers. They do not
-- create dossiers, call a provider, or delay the source transaction materially.
CREATE OR REPLACE FUNCTION crm.mark_ai_customer_dossier_stale(
  p_tenant_id uuid,
  p_outlet_id uuid,
  p_subject_type text,
  p_subject_id uuid
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, crm
AS $$
  UPDATE crm.ai_customer_dossiers dossier SET
    status = CASE WHEN dossier.synthesized_at IS NULL THEN 'pending' ELSE 'stale' END,
    attempt_count = 0,
    available_at = now(),
    lease_token = NULL,
    lease_until = NULL,
    last_error_code = NULL,
    updated_at = now()
  WHERE dossier.tenant_id = p_tenant_id
    AND dossier.outlet_id = p_outlet_id
    AND dossier.subject_type = p_subject_type
    AND dossier.subject_id = p_subject_id;
$$;
REVOKE ALL ON FUNCTION crm.mark_ai_customer_dossier_stale(uuid, uuid, text, uuid)
  FROM PUBLIC, sensible_app_role;

CREATE OR REPLACE FUNCTION crm.stale_ai_dossier_from_timeline()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, crm
AS $$
DECLARE v_event crm.timeline_events%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN v_event := OLD; ELSE v_event := NEW; END IF;
  PERFORM crm.mark_ai_customer_dossier_stale(
    v_event.tenant_id, v_event.outlet_id, v_event.entity_type, v_event.entity_id
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION crm.stale_ai_dossier_from_lead()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, crm
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM crm.mark_ai_customer_dossier_stale(OLD.tenant_id, OLD.outlet_id, 'lead', OLD.id);
    IF OLD.customer_id IS NOT NULL THEN
      PERFORM crm.mark_ai_customer_dossier_stale(
        OLD.tenant_id, OLD.outlet_id, 'customer', OLD.customer_id
      );
    END IF;
    RETURN OLD;
  END IF;
  PERFORM crm.mark_ai_customer_dossier_stale(NEW.tenant_id, NEW.outlet_id, 'lead', NEW.id);
  IF NEW.customer_id IS NOT NULL THEN
    PERFORM crm.mark_ai_customer_dossier_stale(
      NEW.tenant_id, NEW.outlet_id, 'customer', NEW.customer_id
    );
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.customer_id IS NOT NULL
     AND (OLD.customer_id IS DISTINCT FROM NEW.customer_id
       OR OLD.outlet_id IS DISTINCT FROM NEW.outlet_id) THEN
    PERFORM crm.mark_ai_customer_dossier_stale(
      OLD.tenant_id, OLD.outlet_id, 'customer', OLD.customer_id
    );
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.outlet_id IS DISTINCT FROM NEW.outlet_id THEN
    PERFORM crm.mark_ai_customer_dossier_stale(OLD.tenant_id, OLD.outlet_id, 'lead', OLD.id);
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION crm.stale_ai_dossier_from_customer()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, crm
AS $$
DECLARE v_outlet_id uuid;
BEGIN
  FOR v_outlet_id IN
    SELECT outlet_id FROM crm.customer_outlets
    WHERE tenant_id = NEW.tenant_id AND customer_id = NEW.id
  LOOP
    PERFORM crm.mark_ai_customer_dossier_stale(
      NEW.tenant_id, v_outlet_id, 'customer', NEW.id
    );
  END LOOP;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION crm.stale_ai_dossier_from_customer_outlet()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, crm
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM crm.mark_ai_customer_dossier_stale(
      OLD.tenant_id, OLD.outlet_id, 'customer', OLD.customer_id
    );
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM crm.mark_ai_customer_dossier_stale(
      NEW.tenant_id, NEW.outlet_id, 'customer', NEW.customer_id
    );
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

-- Switch back to crm_migrator to create triggers.
-- crm_migrator owns crm.leads, crm.customers, crm.customer_outlets;
-- crm.timeline_events is owned by sensible_rls_owner but crm_migrator is a member.
RESET ROLE;

CREATE TRIGGER timeline_ai_dossier_stale
  AFTER INSERT OR UPDATE OR DELETE ON crm.timeline_events
  FOR EACH ROW EXECUTE FUNCTION crm.stale_ai_dossier_from_timeline();

CREATE TRIGGER leads_ai_dossier_stale
  AFTER UPDATE OF customer_name, business_name, business_type, area, city, state,
    requirement, stage, customer_id, source, priority, comments, tags, outlet_id
  ON crm.leads FOR EACH ROW EXECUTE FUNCTION crm.stale_ai_dossier_from_lead();
CREATE TRIGGER leads_ai_dossier_delete
  AFTER DELETE ON crm.leads
  FOR EACH ROW EXECUTE FUNCTION crm.stale_ai_dossier_from_lead();

CREATE TRIGGER customers_ai_dossier_stale
  AFTER UPDATE OF customer_name, business_name, business_type, area, city, state,
    priority, source, status, lifecycle, total_enquiries, total_won, total_lost
  ON crm.customers FOR EACH ROW EXECUTE FUNCTION crm.stale_ai_dossier_from_customer();

CREATE TRIGGER customer_outlets_ai_dossier_stale
  AFTER INSERT OR UPDATE OR DELETE ON crm.customer_outlets
  FOR EACH ROW EXECUTE FUNCTION crm.stale_ai_dossier_from_customer_outlet();

REVOKE CREATE ON SCHEMA crm FROM sensible_rls_owner;
