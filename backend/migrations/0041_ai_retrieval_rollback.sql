DROP TRIGGER IF EXISTS leads_ai_retrieval_purge ON crm.leads;
DROP TRIGGER IF EXISTS timeline_ai_retrieval_delete ON crm.timeline_events;
DROP TRIGGER IF EXISTS timeline_ai_retrieval_queue ON crm.timeline_events;
DROP TRIGGER IF EXISTS leads_ai_retrieval_queue_update ON crm.leads;
DROP TRIGGER IF EXISTS leads_ai_retrieval_queue_insert ON crm.leads;

DROP FUNCTION IF EXISTS crm.purge_lead_ai_retrieval();
DROP FUNCTION IF EXISTS crm.queue_timeline_ai_retrieval();
DROP FUNCTION IF EXISTS crm.queue_lead_ai_retrieval();
DROP FUNCTION IF EXISTS crm.enqueue_ai_retrieval_job(uuid, uuid, text, uuid, uuid, text);

DROP TABLE IF EXISTS crm.ai_retrieval_chunks;
DROP TABLE IF EXISTS crm.ai_retrieval_jobs;
DROP FUNCTION IF EXISTS crm.ai_retrieval_source_is_current(uuid, uuid, text, uuid, uuid, text);
