DROP TRIGGER IF EXISTS timeline_quotation_insert ON crm.quotations;
DROP TRIGGER IF EXISTS timeline_call_insert ON crm.calls;
DROP TRIGGER IF EXISTS timeline_activity_change ON crm.activities;
DROP TRIGGER IF EXISTS timeline_lead_assigned ON crm.lead_assignment_history;
DROP TRIGGER IF EXISTS timeline_stage_change ON crm.lead_stage_history;
DROP TRIGGER IF EXISTS timeline_lead_insert ON crm.leads;
DROP TRIGGER IF EXISTS timeline_customer_outlet_insert ON crm.customer_outlets;

DROP FUNCTION IF EXISTS crm.timeline_on_quotation_insert();
DROP FUNCTION IF EXISTS crm.timeline_on_call_insert();
DROP FUNCTION IF EXISTS crm.timeline_on_activity_change();
DROP FUNCTION IF EXISTS crm.timeline_on_lead_assigned();
DROP FUNCTION IF EXISTS crm.timeline_on_stage_change();
DROP FUNCTION IF EXISTS crm.timeline_on_lead_insert();
DROP FUNCTION IF EXISTS crm.timeline_on_customer_outlet_insert();
DROP FUNCTION IF EXISTS crm.backfill_timeline_events(uuid);
DROP FUNCTION IF EXISTS crm.append_timeline_event(
  uuid, uuid, uuid, uuid, text, text, uuid, uuid, timestamptz, text, jsonb
);

DROP TABLE IF EXISTS crm.timeline_events;
