import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import type { ActivityRepository, PostgresActivityListQuery, PostgresActivityRecord } from "./activity.types.js";

interface ActivityRow extends QueryResultRow {
  id: string; tenant_id: string; business_id: string; outlet_id: string; lead_id: string; customer_id: string | null;
  assigned_to_user_id: string | null; created_by_user_id: string; updated_by_user_id: string;
  activity_type: PostgresActivityRecord["type"]; status: PostgresActivityRecord["status"];
  mode: PostgresActivityRecord["mode"]; priority: PostgresActivityRecord["priority"]; description: string;
  scheduled_at: Date | null; completed_at: Date | null; lead_name_snapshot: string; lead_mobile_snapshot: string;
  lead_requirement_snapshot: string; product_id_snapshot: string | null; product_name_snapshot: string | null;
  product_type_snapshot: string | null; product_dealer_price_snapshot: string | null; product_mrp_snapshot: string | null;
  external_product_source: string | null; external_product_id: string | null; created_at: Date; updated_at: Date;
}

const mapRow = (row: ActivityRow): PostgresActivityRecord => ({
  id: row.id, tenantId: row.tenant_id, businessId: row.business_id, outletId: row.outlet_id,
  leadId: row.lead_id, customerId: row.customer_id, assignedToUserId: row.assigned_to_user_id,
  createdByUserId: row.created_by_user_id, updatedByUserId: row.updated_by_user_id, type: row.activity_type,
  status: row.status, mode: row.mode, priority: row.priority, description: row.description,
  scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : null,
  completedAt: row.completed_at ? new Date(row.completed_at) : null,
  leadNameSnapshot: row.lead_name_snapshot, leadMobileSnapshot: row.lead_mobile_snapshot,
  leadRequirementSnapshot: row.lead_requirement_snapshot, productIdSnapshot: row.product_id_snapshot,
  productNameSnapshot: row.product_name_snapshot, productTypeSnapshot: row.product_type_snapshot,
  productDealerPriceSnapshot: Number(row.product_dealer_price_snapshot ?? 0),
  productMrpSnapshot: Number(row.product_mrp_snapshot ?? 0), externalProductSource: row.external_product_source,
  externalProductId: row.external_product_id, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
});

const SELECT_FIELDS = `id, tenant_id, business_id, outlet_id, lead_id, customer_id,
  assigned_to_user_id, created_by_user_id, updated_by_user_id, activity_type, status, mode, priority,
  description, scheduled_at, completed_at, lead_name_snapshot, lead_mobile_snapshot,
  lead_requirement_snapshot, product_id_snapshot, product_name_snapshot, product_type_snapshot,
  product_dealer_price_snapshot, product_mrp_snapshot, external_product_source, external_product_id,
  created_at, updated_at`;

const decodeCursor = (cursor?: string): { createdAt: Date; id: string } | null => {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { createdAt?: unknown; id?: unknown };
    if (typeof value.createdAt !== "number" || !Number.isSafeInteger(value.createdAt) || typeof value.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)) return null;
    return { createdAt: new Date(value.createdAt), id: value.id };
  } catch { return null; }
};

const columnName = (key: string) => key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);

export class PostgresActivityRepository implements ActivityRepository {
  async create(database: TransactionDatabase, values: Record<string, unknown>): Promise<void> {
    const keys = Object.keys(values);
    await database.client.query(
      `INSERT INTO crm.activities (${keys.map(columnName).join(", ")}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(", ")})`,
      keys.map((key) => values[key]),
    );
  }

  async getById(database: TransactionDatabase, tenantId: string, outletId: string, activityId: string) {
    const result = await database.client.query<ActivityRow>(`SELECT ${SELECT_FIELDS} FROM crm.activities WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3`, [tenantId, outletId, activityId]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async list(database: TransactionDatabase, tenantId: string, query: PostgresActivityListQuery) {
    const conditions = ["tenant_id = $1", "outlet_id = $2"];
    const params: unknown[] = [tenantId, query.outletId];
    const add = (condition: string, value: unknown) => { params.push(value); conditions.push(condition.replace("?", `$${params.length}`)); };
    if (query.leadId) add("lead_id = ?", query.leadId);
    if (query.customerId) add("customer_id = ?", query.customerId);
    if (query.assignedTo) add("assigned_to_user_id = ?", query.assignedTo);
    if (query.mode) add("mode = ?", query.mode);
    if (query.priority) add("priority = ?", query.priority);
    if (query.status) add("status = ?", query.status);
    if (query.type) add("activity_type = ?", query.type);
    if (query.startDate !== undefined) add("scheduled_at >= ?", new Date(query.startDate));
    if (query.endDate !== undefined) add("scheduled_at <= ?", new Date(query.endDate));
    if (query.search) {
      params.push(`%${query.search.toLowerCase()}%`);
      conditions.push(`(lower(lead_name_snapshot) LIKE $${params.length} OR lower(lead_mobile_snapshot) LIKE $${params.length} OR lower(lead_requirement_snapshot) LIKE $${params.length} OR lower(description) LIKE $${params.length})`);
    }
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && !cursor) throw new Error("INVALID_CURSOR");
    if (cursor) {
      params.push(cursor.createdAt, cursor.id);
      conditions.push(`(created_at, id) < ($${params.length - 1}, $${params.length})`);
    }
    params.push(query.limit + 1);
    const result = await database.client.query<ActivityRow>(`SELECT ${SELECT_FIELDS} FROM crm.activities WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`, params);
    const hasMore = result.rows.length > query.limit;
    const rows = hasMore ? result.rows.slice(0, query.limit) : result.rows;
    const last = rows.at(-1);
    return {
      records: rows.map(mapRow),
      nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ createdAt: new Date(last.created_at).getTime(), id: last.id }), "utf8").toString("base64url") : null,
    };
  }

  async summarize(database: TransactionDatabase, tenantId: string, query: Pick<PostgresActivityListQuery, "outletId" | "startDate" | "endDate">) {
    const conditions = ["tenant_id = $1", "outlet_id = $2"];
    const params: unknown[] = [tenantId, query.outletId];
    if (query.startDate !== undefined) { params.push(new Date(query.startDate)); conditions.push(`scheduled_at >= $${params.length}`); }
    if (query.endDate !== undefined) { params.push(new Date(query.endDate)); conditions.push(`scheduled_at <= $${params.length}`); }
    const result = await database.client.query<{ total: string; done: string; pending: string; overdue: string }>(`
      SELECT count(*) AS total, count(*) FILTER (WHERE status = 'DONE') AS done,
        count(*) FILTER (WHERE status = 'PENDING') AS pending,
        count(*) FILTER (WHERE scheduled_at < date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata') AS overdue
      FROM crm.activities WHERE ${conditions.join(" AND ")}`, params);
    const row = result.rows[0]!;
    return { total: Number(row.total), done: Number(row.done), pending: Number(row.pending), overdue: Number(row.overdue) };
  }

  async update(database: TransactionDatabase, tenantId: string, outletId: string, activityId: string, values: Record<string, unknown>) {
    const keys = Object.keys(values);
    if (!keys.length) return true;
    const params: unknown[] = [tenantId, outletId, activityId];
    const clauses = keys.map((key) => { params.push(values[key]); return `${columnName(key)} = $${params.length}`; });
    const result = await database.client.query(`UPDATE crm.activities SET ${clauses.join(", ")}, updated_at = now() WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3`, params);
    return (result.rowCount ?? 0) > 0;
  }

  async delete(database: TransactionDatabase, tenantId: string, outletId: string, activityId: string) {
    const result = await database.client.query("DELETE FROM crm.activities WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3", [tenantId, outletId, activityId]);
    return (result.rowCount ?? 0) > 0;
  }
}

export const postgresActivityRepository = new PostgresActivityRepository();
