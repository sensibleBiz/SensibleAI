SET TIME ZONE 'UTC';

-- Durable indexing outbox. Source records remain authoritative; this queue and
-- the chunk table are disposable/rebuildable derivatives.
CREATE TABLE crm.ai_retrieval_jobs (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  outlet_id uuid NOT NULL,
  source_type varchar(16) NOT NULL,
  source_id uuid NOT NULL,
  subject_lead_id uuid NOT NULL,
  source_version char(32) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending',
  attempt_count smallint NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  provider varchar(32),
  model varchar(160),
  model_version varchar(100),
  last_successful_indexing_at timestamptz,
  last_error_code varchar(80),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_retrieval_jobs_source_uq UNIQUE (tenant_id, source_type, source_id),
  CONSTRAINT ai_retrieval_jobs_outlet_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT ai_retrieval_jobs_subject_fk FOREIGN KEY (tenant_id, subject_lead_id)
    REFERENCES crm.leads(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ai_retrieval_jobs_source_type_ck CHECK (source_type IN ('lead', 'timeline')),
  CONSTRAINT ai_retrieval_jobs_status_ck CHECK (status IN ('pending', 'indexing', 'indexed', 'failed')),
  CONSTRAINT ai_retrieval_jobs_attempt_ck CHECK (attempt_count >= 0)
);

CREATE INDEX ai_retrieval_jobs_pending_idx
  ON crm.ai_retrieval_jobs (available_at, id)
  WHERE status IN ('pending', 'indexing') AND attempt_count < 8;
CREATE INDEX ai_retrieval_jobs_subject_idx
  ON crm.ai_retrieval_jobs (tenant_id, outlet_id, subject_lead_id, status);

CREATE TABLE crm.ai_retrieval_chunks (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  source_type varchar(16) NOT NULL,
  source_id uuid NOT NULL,
  subject_lead_id uuid NOT NULL,
  chunk_index smallint NOT NULL DEFAULT 0,
  source_version char(32) NOT NULL,
  document_text varchar(1400) NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', document_text)
  ) STORED,
  embedding vector(768) NOT NULL,
  provider varchar(32) NOT NULL,
  model varchar(160) NOT NULL,
  model_version varchar(100) NOT NULL,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_retrieval_chunks_source_uq
    UNIQUE (tenant_id, source_type, source_id, chunk_index),
  CONSTRAINT ai_retrieval_chunks_job_fk
    FOREIGN KEY (tenant_id, source_type, source_id)
    REFERENCES crm.ai_retrieval_jobs(tenant_id, source_type, source_id)
    ON DELETE CASCADE,
  CONSTRAINT ai_retrieval_chunks_subject_fk
    FOREIGN KEY (tenant_id, subject_lead_id)
    REFERENCES crm.leads(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ai_retrieval_chunks_outlet_fk
    FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT ai_retrieval_chunks_source_type_ck CHECK (source_type IN ('lead', 'timeline')),
  CONSTRAINT ai_retrieval_chunks_text_ck CHECK (length(btrim(document_text)) > 0),
  CONSTRAINT ai_retrieval_chunks_index_ck CHECK (chunk_index = 0)
);

CREATE INDEX ai_retrieval_chunks_search_gin_idx
  ON crm.ai_retrieval_chunks USING gin(search_vector);
CREATE INDEX ai_retrieval_chunks_vector_idx
  ON crm.ai_retrieval_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);
CREATE INDEX ai_retrieval_chunks_scope_idx
  ON crm.ai_retrieval_chunks (tenant_id, outlet_id, subject_lead_id, source_version);

ALTER TABLE crm.ai_retrieval_jobs OWNER TO sensible_rls_owner;
ALTER TABLE crm.ai_retrieval_chunks OWNER TO sensible_rls_owner;
ALTER TABLE crm.ai_retrieval_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.ai_retrieval_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.ai_retrieval_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.ai_retrieval_chunks FORCE ROW LEVEL SECURITY;

-- Cloud SQL restricts ALTER FUNCTION OWNER TO on SECURITY DEFINER functions.
-- Grant CREATE temporarily; SET ROLE so functions are created as sensible_rls_owner.
-- Triggers are created after RESET ROLE because crm_migrator owns the source tables.
GRANT CREATE ON SCHEMA crm TO sensible_rls_owner;
SET ROLE sensible_rls_owner;

CREATE POLICY ai_retrieval_jobs_owner ON crm.ai_retrieval_jobs FOR ALL USING (
  tenant_id = tenancy.current_tenant_id()
  AND tenancy.can_access_outlet(tenant_id, outlet_id)
) WITH CHECK (
  tenant_id = tenancy.current_tenant_id()
  AND tenancy.can_access_outlet(tenant_id, outlet_id)
);
CREATE POLICY ai_retrieval_chunks_owner_delete ON crm.ai_retrieval_chunks FOR DELETE USING (
  tenant_id = tenancy.current_tenant_id()
  AND tenancy.can_access_outlet(tenant_id, outlet_id)
);

CREATE OR REPLACE FUNCTION crm.ai_retrieval_source_is_current(
  p_tenant_id uuid,
  p_outlet_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_subject_lead_id uuid,
  p_source_version text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, crm
AS $$
  SELECT EXISTS (
    SELECT 1 FROM crm.ai_retrieval_jobs job
    WHERE job.tenant_id = p_tenant_id
      AND job.outlet_id = p_outlet_id
      AND job.source_type = p_source_type
      AND job.source_id = p_source_id
      AND job.subject_lead_id = p_subject_lead_id
      AND job.status = 'indexed'
      AND job.source_version = p_source_version
  )
$$;
REVOKE ALL ON FUNCTION crm.ai_retrieval_source_is_current(uuid, uuid, text, uuid, uuid, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.ai_retrieval_source_is_current(uuid, uuid, text, uuid, uuid, text)
  TO sensible_app_role;

CREATE POLICY ai_retrieval_chunks_select ON crm.ai_retrieval_chunks FOR SELECT USING (
  tenant_id = tenancy.current_tenant_id()
  AND tenancy.can_access_outlet(tenant_id, outlet_id)
  AND iam.has_outlet_permission(tenant_id, outlet_id, 'leads.read')
  AND EXISTS (
    SELECT 1 FROM crm.leads lead
    WHERE lead.tenant_id = ai_retrieval_chunks.tenant_id
      AND lead.id = ai_retrieval_chunks.subject_lead_id
      AND lead.outlet_id = ai_retrieval_chunks.outlet_id
  )
  AND crm.ai_retrieval_source_is_current(
    tenant_id, outlet_id, source_type, source_id, subject_lead_id, source_version
  )
);
GRANT SELECT ON crm.ai_retrieval_chunks TO sensible_app_role;

CREATE OR REPLACE FUNCTION crm.enqueue_ai_retrieval_job(
  p_tenant_id uuid,
  p_outlet_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_subject_lead_id uuid,
  p_source_version text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, crm
AS $$
  INSERT INTO crm.ai_retrieval_jobs (
    tenant_id, outlet_id, source_type, source_id, subject_lead_id, source_version,
    status, attempt_count, available_at, lease_token, lease_until, last_error_code
  ) VALUES (
    p_tenant_id, p_outlet_id, p_source_type, p_source_id, p_subject_lead_id,
    p_source_version, 'pending', 0, now(), NULL, NULL, NULL
  )
  ON CONFLICT (tenant_id, source_type, source_id) DO UPDATE SET
    outlet_id = EXCLUDED.outlet_id,
    subject_lead_id = EXCLUDED.subject_lead_id,
    source_version = EXCLUDED.source_version,
    status = 'pending',
    attempt_count = 0,
    available_at = now(),
    lease_token = NULL,
    lease_until = NULL,
    last_error_code = NULL,
    updated_at = now()
  WHERE crm.ai_retrieval_jobs.source_version IS DISTINCT FROM EXCLUDED.source_version
     OR crm.ai_retrieval_jobs.outlet_id IS DISTINCT FROM EXCLUDED.outlet_id
     OR crm.ai_retrieval_jobs.subject_lead_id IS DISTINCT FROM EXCLUDED.subject_lead_id
     OR crm.ai_retrieval_jobs.status <> 'indexed';
$$;
REVOKE ALL ON FUNCTION crm.enqueue_ai_retrieval_job(uuid, uuid, text, uuid, uuid, text)
  FROM PUBLIC, sensible_app_role;

CREATE OR REPLACE FUNCTION crm.queue_lead_ai_retrieval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, crm
AS $$
BEGIN
  PERFORM crm.enqueue_ai_retrieval_job(
    NEW.tenant_id, NEW.outlet_id, 'lead', NEW.id, NEW.id,
    md5(concat_ws(E'\x1f', coalesce(NEW.business_name, ''),
      coalesce(NEW.requirement, ''), coalesce(NEW.source, ''),
      coalesce(NEW.city, ''), coalesce(NEW.state, ''), coalesce(NEW.stage::text, '')))
  );
  IF TG_OP = 'UPDATE' AND OLD.outlet_id IS DISTINCT FROM NEW.outlet_id THEN
    DELETE FROM crm.ai_retrieval_chunks
    WHERE tenant_id = OLD.tenant_id AND subject_lead_id = OLD.id;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION crm.queue_timeline_ai_retrieval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, crm
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM crm.ai_retrieval_chunks
    WHERE tenant_id = OLD.tenant_id AND source_type = 'timeline' AND source_id = OLD.id;
    DELETE FROM crm.ai_retrieval_jobs
    WHERE tenant_id = OLD.tenant_id AND source_type = 'timeline' AND source_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.entity_type = 'lead' THEN
    PERFORM crm.enqueue_ai_retrieval_job(
      NEW.tenant_id, NEW.outlet_id, 'timeline', NEW.id, NEW.entity_id,
      md5(concat_ws(E'\x1f', extract(epoch FROM NEW.event_time)::text,
        NEW.event_type, NEW.summary, NEW.payload::text))
    );
  ELSE
    DELETE FROM crm.ai_retrieval_chunks
    WHERE tenant_id = NEW.tenant_id AND source_type = 'timeline' AND source_id = NEW.id;
    DELETE FROM crm.ai_retrieval_jobs
    WHERE tenant_id = NEW.tenant_id AND source_type = 'timeline' AND source_id = NEW.id;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION crm.purge_lead_ai_retrieval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, crm
AS $$
BEGIN
  DELETE FROM crm.ai_retrieval_chunks
  WHERE tenant_id = OLD.tenant_id AND subject_lead_id = OLD.id;
  DELETE FROM crm.ai_retrieval_jobs
  WHERE tenant_id = OLD.tenant_id AND subject_lead_id = OLD.id;
  RETURN OLD;
END
$$;

-- Switch back to crm_migrator to create triggers.
-- crm_migrator owns crm.leads; timeline_events is owned by sensible_rls_owner
-- but crm_migrator is a member of that role and can create triggers on it.
RESET ROLE;

CREATE TRIGGER leads_ai_retrieval_queue_insert
  AFTER INSERT ON crm.leads
  FOR EACH ROW EXECUTE FUNCTION crm.queue_lead_ai_retrieval();
CREATE TRIGGER leads_ai_retrieval_queue_update
  AFTER UPDATE OF business_name, requirement, source, city, state, stage, outlet_id
  ON crm.leads FOR EACH ROW EXECUTE FUNCTION crm.queue_lead_ai_retrieval();

CREATE TRIGGER timeline_ai_retrieval_queue
  AFTER INSERT OR UPDATE ON crm.timeline_events
  FOR EACH ROW EXECUTE FUNCTION crm.queue_timeline_ai_retrieval();
CREATE TRIGGER timeline_ai_retrieval_delete
  AFTER DELETE ON crm.timeline_events
  FOR EACH ROW EXECUTE FUNCTION crm.queue_timeline_ai_retrieval();

CREATE TRIGGER leads_ai_retrieval_purge
  BEFORE DELETE ON crm.leads
  FOR EACH ROW EXECUTE FUNCTION crm.purge_lead_ai_retrieval();

REVOKE CREATE ON SCHEMA crm FROM sensible_rls_owner;
