import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import type { TimelineEvent } from "./timeline.types.js";

interface OutletRow extends QueryResultRow {
  outlet_id: string;
}

interface TimelineEventRow extends QueryResultRow {
  id: string;
  entity_type: "lead" | "customer";
  entity_id: string;
  event_type: string;
  source_entity_type: string;
  source_entity_id: string;
  actor_user_id: string | null;
  event_time: Date | string;
  summary: string;
  payload: Record<string, unknown>;
}

export interface TimelineCursor {
  eventTime: string;
  id: string;
}

export class PostgresTimelineRepository {
  async getLeadOutlet(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    leadId: string,
  ): Promise<string | null> {
    const result = await database.client.query<OutletRow>(`
      SELECT outlet_id FROM crm.leads
      WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3
      LIMIT 1
    `, [tenantId, outletId, leadId]);
    return result.rows[0]?.outlet_id ?? null;
  }

  async getCustomerOutlet(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    customerId: string,
  ): Promise<string | null> {
    const result = await database.client.query<OutletRow>(`
      SELECT outlet_id FROM crm.customer_outlets
      WHERE tenant_id = $1 AND outlet_id = $2 AND customer_id = $3
      LIMIT 1
    `, [tenantId, outletId, customerId]);
    return result.rows[0]?.outlet_id ?? null;
  }

  async list(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    entityType: "lead" | "customer",
    entityId: string,
    limit: number,
    cursor?: TimelineCursor,
  ): Promise<TimelineEvent[]> {
    const result = await database.client.query<TimelineEventRow>(`
      SELECT id, entity_type, entity_id, event_type, source_entity_type,
        source_entity_id, actor_user_id, event_time, summary, payload
      FROM crm.timeline_events
      WHERE tenant_id = $1 AND outlet_id = $2
        AND entity_type = $3 AND entity_id = $4
        AND ($5::timestamptz IS NULL OR (event_time, id) < ($5::timestamptz, $6::uuid))
      ORDER BY event_time DESC, id DESC
      LIMIT $7
    `, [tenantId, outletId, entityType, entityId, cursor?.eventTime ?? null, cursor?.id ?? null, limit + 1]);

    return result.rows.map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      eventType: row.event_type,
      sourceEntityType: row.source_entity_type,
      sourceEntityId: row.source_entity_id,
      actorUserId: row.actor_user_id,
      eventTime: row.event_time instanceof Date ? row.event_time.toISOString() : new Date(row.event_time).toISOString(),
      summary: row.summary,
      payload: row.payload,
    }));
  }
}

export const postgresTimelineRepository = new PostgresTimelineRepository();
