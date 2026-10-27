import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";

interface ConversationRow extends QueryResultRow {
  id: string;
  legacy_id: string | null;
  mobile: string;
  integrated_number: string;
  is_read: boolean;
  unread_count: number;
  last_read_at: Date | null;
  sent_messages: unknown[];
  reply_messages: unknown[];
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const SELECT_FIELDS = `id,legacy_id,mobile,integrated_number,is_read,unread_count,last_read_at,
  sent_messages,reply_messages,metadata,created_at,updated_at`;

const decodeCursor = (cursor?: string) => {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { updatedAt?: unknown; id?: unknown };
    if (typeof value.updatedAt !== "number" || typeof value.id !== "string") return null;
    return { updatedAt: new Date(value.updatedAt), id: value.id };
  } catch { return null; }
};

export class PostgresWhatsAppRepository {
  async list(database: TransactionDatabase, tenantId: string, query: { outletId: string; startDate?: number; limit: number; cursor?: string }) {
    const params: unknown[] = [tenantId, query.outletId];
    const conditions = ["tenant_id = $1", "outlet_id = $2"];
    if (query.startDate !== undefined) { params.push(new Date(query.startDate)); conditions.push(`updated_at >= $${params.length}`); }
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && !cursor) throw new Error("INVALID_CURSOR");
    if (cursor) { params.push(cursor.updatedAt, cursor.id); conditions.push(`(updated_at, id) < ($${params.length - 1}, $${params.length})`); }
    params.push(query.limit + 1);
    const result = await database.client.query<ConversationRow>(`
      SELECT ${SELECT_FIELDS}
      FROM crm.whatsapp_conversations
      WHERE ${conditions.join(" AND ")}
      ORDER BY updated_at DESC,id DESC LIMIT $${params.length}`, params);
    const hasMore = result.rows.length > query.limit;
    const rows = hasMore ? result.rows.slice(0, query.limit) : result.rows;
    const last = rows.at(-1);
    return {
      rows,
      nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ updatedAt: last.updated_at.getTime(), id: last.id }), "utf8").toString("base64url") : null,
    };
  }

  async get(database: TransactionDatabase, tenantId: string, outletId: string, conversationId: string) {
    const result = await database.client.query<ConversationRow>(`
      SELECT ${SELECT_FIELDS} FROM crm.whatsapp_conversations
      WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3`, [tenantId, outletId, conversationId]);
    return result.rows[0] ?? null;
  }

  async markRead(database: TransactionDatabase, tenantId: string, outletId: string, conversationId: string) {
    const result = await database.client.query<ConversationRow>(`
      UPDATE crm.whatsapp_conversations SET is_read=true,unread_count=0,last_read_at=now()
      WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3
      RETURNING ${SELECT_FIELDS}`, [tenantId, outletId, conversationId]);
    return result.rows[0] ?? null;
  }

  async appendOutbound(database: TransactionDatabase, tenantId: string, outletId: string, conversationId: string, message: Record<string, unknown>) {
    const result = await database.client.query<ConversationRow>(`
      UPDATE crm.whatsapp_conversations
      SET sent_messages=sent_messages || jsonb_build_array($4::jsonb),is_read=true
      WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3
      RETURNING ${SELECT_FIELDS}`,
    [tenantId, outletId, conversationId, JSON.stringify(message)]);
    return result.rows[0] ?? null;
  }

  async upsertInbound(database: TransactionDatabase, tenantId: string, input: {
    outletId: string;
    mobile: string;
    integratedNumber: string;
    message: Record<string, unknown>;
    messageUuid: string;
  }) {
    const result = await database.client.query<ConversationRow>(`
      INSERT INTO crm.whatsapp_conversations
        (tenant_id,outlet_id,mobile,integrated_number,is_read,unread_count,reply_messages)
      VALUES ($1,$2,$3,$4,false,1,jsonb_build_array($5::jsonb))
      ON CONFLICT (tenant_id,outlet_id,mobile) DO UPDATE SET
        integrated_number=CASE WHEN EXCLUDED.integrated_number='' THEN crm.whatsapp_conversations.integrated_number ELSE EXCLUDED.integrated_number END,
        reply_messages=CASE
          WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements(crm.whatsapp_conversations.reply_messages) item
            WHERE item->>'message_uuid'=$6
          ) THEN crm.whatsapp_conversations.reply_messages
          ELSE crm.whatsapp_conversations.reply_messages || EXCLUDED.reply_messages
        END,
        is_read=CASE
          WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements(crm.whatsapp_conversations.reply_messages) item
            WHERE item->>'message_uuid'=$6
          ) THEN crm.whatsapp_conversations.is_read
          ELSE false
        END,
        unread_count=CASE
          WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements(crm.whatsapp_conversations.reply_messages) item
            WHERE item->>'message_uuid'=$6
          ) THEN crm.whatsapp_conversations.unread_count
          ELSE crm.whatsapp_conversations.unread_count+1
        END
      RETURNING ${SELECT_FIELDS}`,
    [tenantId, input.outletId, input.mobile, input.integratedNumber, JSON.stringify(input.message), input.messageUuid]);
    return result.rows[0]!;
  }

  async updateOutboundStatus(database: TransactionDatabase, tenantId: string, input: {
    outletId: string;
    mobile: string;
    messageUuid: string;
    status: string;
    occurredAt: number;
    failureReason?: string;
  }) {
    const patch: Record<string, unknown> = { status: input.status };
    if (input.status === "delivered") patch.delivered_at = input.occurredAt;
    if (input.status === "read") patch.read_at = input.occurredAt;
    if (input.status === "failed") patch.failure_reason = input.failureReason ?? "Delivery failed";
    const result = await database.client.query<ConversationRow>(`
      UPDATE crm.whatsapp_conversations SET sent_messages=(
        SELECT coalesce(jsonb_agg(
          CASE WHEN item->>'message_uuid'=$4 OR item->>'request_id'=$4
            THEN item || $5::jsonb ELSE item END
          ORDER BY ordinal
        ),'[]'::jsonb)
        FROM jsonb_array_elements(sent_messages) WITH ORDINALITY AS messages(item,ordinal)
      )
      WHERE tenant_id=$1 AND outlet_id=$2 AND mobile=$3
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(sent_messages) item
          WHERE item->>'message_uuid'=$4 OR item->>'request_id'=$4
        )
      RETURNING ${SELECT_FIELDS}`,
    [tenantId, input.outletId, input.mobile, input.messageUuid, JSON.stringify(patch)]);
    return result.rows[0] ?? null;
  }
}

export type PostgresWhatsAppConversationRow = ConversationRow;
export const postgresWhatsAppRepository = new PostgresWhatsAppRepository();
