SET TIME ZONE 'UTC';

INSERT INTO iam.permissions (
  permission_key, description, catalog_key, label, category
) VALUES
  ('ai_actions.read', 'View AI action proposals and audit history', 'CRM_AI_ACTIONS_VIEW', 'View AI actions', 'AI'),
  ('ai_actions.propose', 'Create AI action proposals', 'CRM_AI_ACTIONS_PROPOSE', 'Propose AI actions', 'AI'),
  ('ai_actions.review', 'Approve, reject, cancel, and mock-execute AI action proposals', 'CRM_AI_ACTIONS_REVIEW', 'Review AI actions', 'AI'),
  ('whatsapp.messages.send', 'Send customer WhatsApp messages', 'CRM_WHATSAPP_MESSAGE_SEND', 'Send WhatsApp messages', 'Communications')
ON CONFLICT (permission_key) DO UPDATE SET
  description = EXCLUDED.description,
  catalog_key = EXCLUDED.catalog_key,
  label = EXCLUDED.label,
  category = EXCLUDED.category;

CREATE TABLE crm.ai_agent_actions (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  outlet_id uuid NOT NULL,
  agent_id varchar(120) NOT NULL,
  model_id varchar(160) NOT NULL,
  action_type varchar(80) NOT NULL,
  target_type varchar(32) NOT NULL,
  target_id uuid NOT NULL,
  target_lead_id uuid,
  target_customer_id uuid,
  context_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision_summary varchar(500) NOT NULL,
  reason_codes varchar(64)[] NOT NULL,
  proposed_payload jsonb NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'PROPOSED',
  created_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  last_changed_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  reviewer_user_id uuid REFERENCES iam.users(id) ON DELETE RESTRICT,
  review_comment varchar(500),
  reviewed_at timestamptz,
  executed_by_user_id uuid REFERENCES iam.users(id) ON DELETE RESTRICT,
  executed_at timestamptz,
  failed_at timestamptz,
  cancelled_by_user_id uuid REFERENCES iam.users(id) ON DELETE RESTRICT,
  cancelled_at timestamptz,
  execution_mode varchar(16) NOT NULL DEFAULT 'mock',
  execution_result jsonb,
  error_code varchar(80),
  prompt_tokens integer,
  completion_tokens integer,
  estimated_cost numeric(12, 6),
  idempotency_key varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_agent_actions_outlet_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT ai_agent_actions_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT ai_agent_actions_lead_fk FOREIGN KEY (tenant_id, target_lead_id)
    REFERENCES crm.leads(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT ai_agent_actions_customer_fk FOREIGN KEY (tenant_id, target_customer_id)
    REFERENCES crm.customers(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT ai_agent_actions_target_ck CHECK (
    (target_type = 'lead' AND target_lead_id = target_id AND target_customer_id IS NULL)
    OR (target_type = 'customer' AND target_customer_id = target_id AND target_lead_id IS NULL)
  ),
  CONSTRAINT ai_agent_actions_type_ck CHECK (action_type IN (
    'lead.follow_up_suggestion', 'lead.stage_change', 'lead.assign',
    'lead.disqualify', 'customer.message.send'
  )),
  CONSTRAINT ai_agent_actions_type_target_ck CHECK (
    (action_type <> 'customer.message.send' AND target_type = 'lead')
    OR (action_type = 'customer.message.send' AND target_type = 'customer')
  ),
  CONSTRAINT ai_agent_actions_status_ck CHECK (status IN (
    'PROPOSED', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED', 'CANCELLED'
  )),
  CONSTRAINT ai_agent_actions_mode_ck CHECK (execution_mode = 'mock'),
  CONSTRAINT ai_agent_actions_context_ck CHECK (
    jsonb_typeof(context_refs) = 'array' AND jsonb_array_length(context_refs) <= 20
  ),
  CONSTRAINT ai_agent_actions_payload_ck CHECK (jsonb_typeof(proposed_payload) = 'object'),
  CONSTRAINT ai_agent_actions_reasons_ck CHECK (
    cardinality(reason_codes) BETWEEN 1 AND 12
    AND array_position(reason_codes, '') IS NULL
  ),
  CONSTRAINT ai_agent_actions_summary_ck CHECK (length(btrim(decision_summary)) > 0),
  CONSTRAINT ai_agent_actions_tokens_ck CHECK (
    (prompt_tokens IS NULL OR prompt_tokens >= 0)
    AND (completion_tokens IS NULL OR completion_tokens >= 0)
    AND (estimated_cost IS NULL OR estimated_cost >= 0)
  ),
  CONSTRAINT ai_agent_actions_lifecycle_ck CHECK (
    (status = 'PROPOSED' AND reviewed_at IS NULL AND executed_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL)
    OR (status IN ('APPROVED', 'REJECTED') AND reviewed_at IS NOT NULL AND executed_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'EXECUTED' AND reviewed_at IS NOT NULL AND executed_at IS NOT NULL AND failed_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'FAILED' AND reviewed_at IS NOT NULL AND executed_at IS NULL AND failed_at IS NOT NULL AND cancelled_at IS NULL)
    OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL)
  ),
  CONSTRAINT ai_agent_actions_idempotency_uq UNIQUE
    (tenant_id, outlet_id, created_by_user_id, idempotency_key)
);

CREATE INDEX ai_agent_actions_scope_created_idx
  ON crm.ai_agent_actions (tenant_id, outlet_id, created_at DESC, id DESC);
CREATE INDEX ai_agent_actions_scope_status_idx
  ON crm.ai_agent_actions (tenant_id, outlet_id, status, created_at DESC);
CREATE INDEX ai_agent_actions_target_idx
  ON crm.ai_agent_actions (tenant_id, target_type, target_id, created_at DESC);

CREATE TABLE crm.ai_agent_action_history (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  outlet_id uuid NOT NULL,
  action_id uuid NOT NULL,
  event_type varchar(32) NOT NULL,
  from_status varchar(16),
  to_status varchar(16) NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  reason_codes varchar(64)[] NOT NULL DEFAULT '{}',
  error_code varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_agent_action_history_action_fk FOREIGN KEY (tenant_id, action_id)
    REFERENCES crm.ai_agent_actions(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT ai_agent_action_history_outlet_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT ai_agent_action_history_event_ck CHECK (event_type IN (
    'PROPOSED', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED', 'CANCELLED'
  ))
);
CREATE INDEX ai_agent_action_history_action_idx
  ON crm.ai_agent_action_history (tenant_id, action_id, created_at, id);

ALTER TABLE crm.ai_agent_actions OWNER TO sensible_rls_owner;
ALTER TABLE crm.ai_agent_action_history OWNER TO sensible_rls_owner;
ALTER TABLE crm.ai_agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.ai_agent_actions FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.ai_agent_action_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.ai_agent_action_history FORCE ROW LEVEL SECURITY;

-- Cloud SQL restricts ALTER FUNCTION OWNER TO on SECURITY DEFINER functions.
-- Grant CREATE temporarily; SET ROLE so functions are created as sensible_rls_owner.
-- Triggers are created after RESET ROLE since crm_migrator is a member of sensible_rls_owner.
GRANT CREATE ON SCHEMA crm TO sensible_rls_owner;
SET ROLE sensible_rls_owner;

CREATE POLICY ai_agent_actions_select ON crm.ai_agent_actions FOR SELECT USING (
  tenant_id = tenancy.current_tenant_id()
  AND tenancy.can_access_outlet(tenant_id, outlet_id)
  AND iam.has_outlet_permission(tenant_id, outlet_id, 'ai_actions.read')
);
CREATE POLICY ai_agent_actions_insert ON crm.ai_agent_actions FOR INSERT WITH CHECK (
  tenant_id = tenancy.current_tenant_id()
  AND tenancy.can_access_outlet(tenant_id, outlet_id)
  AND iam.has_outlet_permission(tenant_id, outlet_id, 'ai_actions.propose')
  AND created_by_user_id = iam.current_user_id()
  AND last_changed_by_user_id = iam.current_user_id()
  AND status = 'PROPOSED'
);
CREATE POLICY ai_agent_actions_update ON crm.ai_agent_actions FOR UPDATE USING (
  tenant_id = tenancy.current_tenant_id()
  AND tenancy.can_access_outlet(tenant_id, outlet_id)
  AND iam.has_outlet_permission(tenant_id, outlet_id, 'ai_actions.review')
) WITH CHECK (
  tenant_id = tenancy.current_tenant_id()
  AND tenancy.can_access_outlet(tenant_id, outlet_id)
  AND iam.has_outlet_permission(tenant_id, outlet_id, 'ai_actions.review')
  AND last_changed_by_user_id = iam.current_user_id()
);
CREATE POLICY ai_agent_action_history_select ON crm.ai_agent_action_history FOR SELECT USING (
  tenant_id = tenancy.current_tenant_id()
  AND tenancy.can_access_outlet(tenant_id, outlet_id)
  AND iam.has_outlet_permission(tenant_id, outlet_id, 'ai_actions.read')
);

CREATE OR REPLACE FUNCTION crm.enforce_ai_agent_action_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, crm, iam
AS $$
DECLARE
  actor_id uuid := iam.current_user_id();
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'AI action changes require an authenticated actor' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'PROPOSED' OR NEW.created_by_user_id <> actor_id
      OR NEW.reviewer_user_id IS NOT NULL OR NEW.reviewed_at IS NOT NULL
      OR NEW.executed_by_user_id IS NOT NULL OR NEW.executed_at IS NOT NULL
      OR NEW.failed_at IS NOT NULL OR NEW.cancelled_by_user_id IS NOT NULL
      OR NEW.cancelled_at IS NOT NULL OR NEW.execution_result IS NOT NULL
      OR NEW.error_code IS NOT NULL THEN
      RAISE EXCEPTION 'AI actions must be created as proposals by the authenticated actor' USING ERRCODE = '23514';
    END IF;
    NEW.last_changed_by_user_id := actor_id;
    NEW.execution_mode := 'mock';
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF ROW(
    NEW.tenant_id, NEW.outlet_id, NEW.agent_id, NEW.model_id, NEW.action_type,
    NEW.target_type, NEW.target_id, NEW.target_lead_id, NEW.target_customer_id,
    NEW.context_refs, NEW.decision_summary, NEW.reason_codes, NEW.proposed_payload,
    NEW.created_by_user_id, NEW.execution_mode, NEW.prompt_tokens,
    NEW.completion_tokens, NEW.estimated_cost, NEW.idempotency_key, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.outlet_id, OLD.agent_id, OLD.model_id, OLD.action_type,
    OLD.target_type, OLD.target_id, OLD.target_lead_id, OLD.target_customer_id,
    OLD.context_refs, OLD.decision_summary, OLD.reason_codes, OLD.proposed_payload,
    OLD.created_by_user_id, OLD.execution_mode, OLD.prompt_tokens,
    OLD.completion_tokens, OLD.estimated_cost, OLD.idempotency_key, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'AI action proposal data is immutable' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = OLD.status OR NOT (
    (OLD.status = 'PROPOSED' AND NEW.status IN ('APPROVED', 'REJECTED', 'CANCELLED'))
    OR (OLD.status = 'APPROVED' AND NEW.status IN ('EXECUTED', 'FAILED', 'CANCELLED'))
    OR (OLD.status = 'FAILED' AND NEW.status = 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'Invalid AI action state transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('APPROVED', 'REJECTED') AND ROW(
    NEW.executed_by_user_id, NEW.executed_at, NEW.failed_at,
    NEW.cancelled_by_user_id, NEW.cancelled_at, NEW.execution_result, NEW.error_code
  ) IS DISTINCT FROM ROW(
    OLD.executed_by_user_id, OLD.executed_at, OLD.failed_at,
    OLD.cancelled_by_user_id, OLD.cancelled_at, OLD.execution_result, OLD.error_code
  ) THEN
    RAISE EXCEPTION 'Review transitions cannot write execution or cancellation results' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IN ('EXECUTED', 'FAILED') AND ROW(
    NEW.reviewer_user_id, NEW.review_comment, NEW.reviewed_at,
    NEW.cancelled_by_user_id, NEW.cancelled_at
  ) IS DISTINCT FROM ROW(
    OLD.reviewer_user_id, OLD.review_comment, OLD.reviewed_at,
    OLD.cancelled_by_user_id, OLD.cancelled_at
  ) THEN
    RAISE EXCEPTION 'Execution transitions cannot rewrite review or cancellation data' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'CANCELLED' AND ROW(
    NEW.reviewer_user_id, NEW.review_comment, NEW.reviewed_at,
    NEW.executed_by_user_id, NEW.executed_at, NEW.failed_at,
    NEW.execution_result, NEW.error_code
  ) IS DISTINCT FROM ROW(
    OLD.reviewer_user_id, OLD.review_comment, OLD.reviewed_at,
    OLD.executed_by_user_id, OLD.executed_at, OLD.failed_at,
    OLD.execution_result, OLD.error_code
  ) THEN
    RAISE EXCEPTION 'Cancellation cannot rewrite review or execution data' USING ERRCODE = '23514';
  END IF;

  NEW.last_changed_by_user_id := actor_id;
  NEW.updated_at := now();
  IF NEW.status IN ('APPROVED', 'REJECTED') THEN
    IF actor_id = OLD.created_by_user_id THEN
      RAISE EXCEPTION 'The proposer cannot review their own AI action' USING ERRCODE = '23514';
    END IF;
    NEW.reviewer_user_id := actor_id;
    NEW.reviewed_at := now();
  ELSIF NEW.status IN ('EXECUTED', 'FAILED') THEN
    NEW.executed_by_user_id := CASE WHEN NEW.status = 'EXECUTED' THEN actor_id ELSE NULL END;
    NEW.executed_at := CASE WHEN NEW.status = 'EXECUTED' THEN now() ELSE NULL END;
    NEW.failed_at := CASE WHEN NEW.status = 'FAILED' THEN now() ELSE NULL END;
  ELSIF NEW.status = 'CANCELLED' THEN
    NEW.cancelled_by_user_id := actor_id;
    NEW.cancelled_at := now();
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION crm.enforce_ai_agent_action_transition() FROM PUBLIC;

CREATE OR REPLACE FUNCTION crm.record_ai_agent_action_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, crm
AS $$
BEGIN
  INSERT INTO crm.ai_agent_action_history (
    tenant_id, outlet_id, action_id, event_type, from_status, to_status,
    actor_user_id, reason_codes, error_code
  ) VALUES (
    NEW.tenant_id, NEW.outlet_id, NEW.id, NEW.status,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
    NEW.status, NEW.last_changed_by_user_id, NEW.reason_codes, NEW.error_code
  );
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION crm.record_ai_agent_action_history() FROM PUBLIC;

-- Switch back to crm_migrator to create triggers.
-- ai_agent_actions is owned by sensible_rls_owner; crm_migrator is a member of that role.
RESET ROLE;

CREATE TRIGGER ai_agent_actions_transition
  BEFORE INSERT OR UPDATE ON crm.ai_agent_actions
  FOR EACH ROW EXECUTE FUNCTION crm.enforce_ai_agent_action_transition();
CREATE TRIGGER ai_agent_actions_history
  AFTER INSERT OR UPDATE ON crm.ai_agent_actions
  FOR EACH ROW EXECUTE FUNCTION crm.record_ai_agent_action_history();

REVOKE ALL ON crm.ai_agent_actions, crm.ai_agent_action_history FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON crm.ai_agent_actions TO sensible_app_role;
GRANT SELECT ON crm.ai_agent_action_history TO sensible_app_role;

REVOKE CREATE ON SCHEMA crm FROM sensible_rls_owner;
