import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import type { TransactionDatabase } from "../src/db/context.js";
import { PostgresTimelineRepository } from "../src/modules/timeline/postgresTimeline.repository.js";
import { PostgresTimelineService } from "../src/modules/timeline/postgresTimeline.service.js";
import type { TimelineEvent } from "../src/modules/timeline/timeline.types.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const outletId = "22222222-2222-4222-8222-222222222222";
const leadId = "33333333-3333-4333-8333-333333333333";
const eventId = "44444444-4444-4444-8444-444444444444";
const database = { client: { query: async () => ({ rows: [] }) } } as unknown as TransactionDatabase;

const event = (id: string, eventTime: string): TimelineEvent => ({
  id,
  entityType: "lead",
  entityId: leadId,
  eventType: "stage_changed",
  sourceEntityType: "lead",
  sourceEntityId: eventId,
  actorUserId: null,
  eventTime,
  summary: "Lead stage changed",
  payload: { fromStage: "NEW", toStage: "FOLLOWUP" },
});

test("timeline repository scopes retrieval and orders by event time with a stable id tie-breaker", async () => {
  let sql = "";
  let parameters: unknown[] = [];
  const db = {
    client: {
      query: async (query: string, values: unknown[]) => {
        sql = query;
        parameters = values;
        return { rows: [] };
      },
    },
  } as unknown as TransactionDatabase;

  await new PostgresTimelineRepository().list(db, tenantId, outletId, "lead", leadId, 20, {
    eventTime: "2026-10-09T08:00:00.000Z",
    id: eventId,
  });

  assert.match(sql, /tenant_id = \$1 AND outlet_id = \$2/);
  assert.match(sql, /\(event_time, id\) < \(\$5::timestamptz, \$6::uuid\)/);
  assert.match(sql, /ORDER BY event_time DESC, id DESC/);
  assert.deepEqual(parameters, [
    tenantId, outletId, "lead", leadId, "2026-10-09T08:00:00.000Z", eventId, 21,
  ]);
});

test("timeline pagination uses the last returned event as its next-page cursor", async () => {
  let receivedCursor: { eventTime: string; id: string } | undefined;
  const rows = [
    event("44444444-4444-4444-8444-444444444444", "2026-10-09T09:00:00.000Z"),
    event("55555555-5555-4555-8555-555555555555", "2026-10-09T08:00:00.000Z"),
    event("66666666-6666-4666-8666-666666666666", "2026-10-09T07:00:00.000Z"),
  ];
  const service = new PostgresTimelineService({
    getLeadOutlet: async () => outletId,
    getCustomerOutlet: async () => outletId,
    list: async (_database, _tenant, _outlet, _type, _entityId, _limit, cursor) => {
      receivedCursor = cursor;
      return rows;
    },
  }, {
    hasOutletPermission: async () => true,
  });

  const firstPage = await service.listLead(database, tenantId, "user-id", leadId, {
    outletId, limit: 2,
  });
  assert.deepEqual(firstPage.items.map((item) => item.id), [rows[0]?.id, rows[1]?.id]);
  assert.ok(firstPage.nextCursor);

  await service.listLead(database, tenantId, "user-id", leadId, {
    outletId, limit: 2, cursor: firstPage.nextCursor ?? undefined,
  });
  assert.deepEqual(receivedCursor, { eventTime: rows[1]?.eventTime, id: rows[1]?.id });
});

test("timeline reads require the matching outlet read permission", async () => {
  let sourceRead = false;
  const service = new PostgresTimelineService({
    getLeadOutlet: async () => {
      sourceRead = true;
      return outletId;
    },
    getCustomerOutlet: async () => outletId,
    list: async () => [],
  }, {
    hasOutletPermission: async () => false,
  });

  await assert.rejects(
    service.listLead(database, tenantId, "user-id", leadId, { outletId, limit: 10 }),
    (error: { statusCode?: number }) => error.statusCode === 403,
  );
  assert.equal(sourceRead, false);
});

test("timeline projection is idempotent and remains tied to source tables", async () => {
  const migrationsDirectory = path.resolve(process.cwd(), "migrations");
  const migration = await readFile(path.join(migrationsDirectory, "0040_timeline_events.sql"), "utf8");

  assert.match(migration, /UNIQUE \(tenant_id, entity_type, entity_id, idempotency_key\)/);
  assert.match(migration, /ON CONFLICT \(tenant_id, entity_type, entity_id, idempotency_key\) DO UPDATE/);
  assert.match(migration, /CREATE TRIGGER timeline_customer_outlet_insert\s+AFTER INSERT ON crm\.customer_outlets/);
  assert.match(migration, /CREATE TRIGGER timeline_lead_insert\s+AFTER INSERT ON crm\.leads/);
  assert.match(migration, /CREATE TRIGGER timeline_stage_change\s+AFTER INSERT ON crm\.lead_stage_history/);
  assert.match(migration, /CREATE TRIGGER timeline_activity_change\s+AFTER INSERT OR UPDATE ON crm\.activities/);
  assert.match(migration, /CREATE TRIGGER timeline_call_insert\s+AFTER INSERT OR UPDATE ON crm\.calls/);
  assert.match(migration, /CREATE TRIGGER timeline_quotation_insert\s+AFTER INSERT OR UPDATE ON crm\.quotations/);
  assert.match(migration, /REFERENCES tenancy\.tenants\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /REFERENCES tenancy\.outlets\(tenant_id, id\) ON DELETE RESTRICT/);
  assert.match(migration, /entity_type = 'lead' AND iam\.has_outlet_permission\(tenant_id, outlet_id, 'leads\.read'\)/);
  assert.match(migration, /entity_type = 'customer' AND iam\.has_outlet_permission\(tenant_id, outlet_id, 'customers\.read'\)/);
  assert.match(migration, /activity_completed'\s+AND activity\.status <> 'DONE'/);
  assert.doesNotMatch(migration, /EXCEPTION WHEN OTHERS/);
  assert.doesNotMatch(migration, /total_amount|customer_mobile|receiver_mobile_no/);
});
