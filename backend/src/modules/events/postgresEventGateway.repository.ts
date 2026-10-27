import { v7 as uuidv7 } from "uuid";
import type { EventMemberInput } from "./eventGateway.types.js";
import { eventMobilesMatch } from "./eventMobile.util.js";
import type { EventGatewayRepository } from "./eventGateway.repository.types.js";
import { withEventGatewayDatabase } from "./eventGatewayDb.js";

const mapRowToApi = (row: Record<string, unknown>) => ({
  eventId: row.external_event_id,
  title: row.title,
  description: row.description,
  terms: row.terms,
  dateTime: row.event_at ? new Date(String(row.event_at)).toISOString() : null,
  expiryDate: row.expiry_at ? new Date(String(row.expiry_at)).toISOString() : null,
  address: row.address,
  location: row.location,
  postLink: row.post_link,
  fees: Number(row.fees),
  offer: Number(row.offer),
  isActive: row.is_active,
  imageUrl: row.image_url,
  imageList: row.image_list,
  members: row.members ?? [],
});

const mergeMembers = (existing: EventMemberInput[], incoming: EventMemberInput[]) => {
  const updatedMembers = [...existing];
  for (const member of incoming) {
    const mobile = String(member.mobile ?? "").trim();
    const index = updatedMembers.findIndex((item) => eventMobilesMatch(item.mobile, mobile));
    if (index !== -1) {
      const existing = updatedMembers[index]!;
      updatedMembers[index] = {
        ...existing,
        isAttended: member.isAttended ?? existing.isAttended ?? false,
      };
      continue;
    }
    updatedMembers.push({
      name: member.name || "",
      mobile: member.mobile || "",
      paymentStatus: member.paymentStatus || "",
      businessType: member.businessType || "",
      email: member.email || "",
      companyName: member.companyName || "",
      city: member.city || "",
      paymentDate: member.paymentDate ? new Date(member.paymentDate) : null,
      isAgreed: member.isAgreed || false,
      isAttended: member.isAttended || false,
      ...(member.amount !== undefined ? { amount: member.amount } : {}),
      ...(member.transactionId ? { transactionId: member.transactionId } : {}),
      ...(member.transactionTitle ? { transactionTitle: member.transactionTitle } : {}),
      ...(member.transactionType ? { transactionType: member.transactionType } : {}),
      ...(member.url ? { url: member.url } : {}),
    });
  }
  return updatedMembers;
};

export class PostgresEventGatewayRepository implements EventGatewayRepository {
  async mergeEvent(
    outletId: string,
    eventId: string,
    patch: Record<string, unknown>,
    members?: EventMemberInput[],
  ) {
    await withEventGatewayDatabase(outletId, async (database, context) => {
      const existing = await database.client.query<{ members: EventMemberInput[] }>(
        `SELECT members FROM crm.outlet_events
         WHERE tenant_id = $1 AND outlet_id = $2 AND external_event_id = $3 LIMIT 1`,
        [context.tenantId, context.outletId, eventId],
      );
      const mergedMembers = members?.length
        ? mergeMembers(existing.rows[0]?.members ?? [], members)
        : (existing.rows[0]?.members ?? []);

      await database.client.query(
        `INSERT INTO crm.outlet_events (
          id, tenant_id, business_id, outlet_id, external_event_id, title, description, terms,
          event_at, expiry_at, address, location, post_link, fees, offer, is_active, image_url, image_list, members
        ) VALUES (
          $1, $2, $3, $4, $5,
          coalesce($6, ''), coalesce($7, ''), coalesce($8, ''),
          $9, $10, coalesce($11, ''), coalesce($12::jsonb, '{}'::jsonb), coalesce($13, ''),
          coalesce($14, 0), coalesce($15, 0), coalesce($16, true),
          coalesce($17::jsonb, '{}'::jsonb), coalesce($18::jsonb, '[]'::jsonb), coalesce($19::jsonb, '[]'::jsonb)
        )
        ON CONFLICT (tenant_id, outlet_id, external_event_id) DO UPDATE SET
          title = coalesce(excluded.title, crm.outlet_events.title),
          description = coalesce(excluded.description, crm.outlet_events.description),
          terms = coalesce(excluded.terms, crm.outlet_events.terms),
          event_at = coalesce(excluded.event_at, crm.outlet_events.event_at),
          expiry_at = coalesce(excluded.expiry_at, crm.outlet_events.expiry_at),
          address = coalesce(excluded.address, crm.outlet_events.address),
          location = coalesce(excluded.location, crm.outlet_events.location),
          post_link = coalesce(excluded.post_link, crm.outlet_events.post_link),
          fees = coalesce(excluded.fees, crm.outlet_events.fees),
          offer = coalesce(excluded.offer, crm.outlet_events.offer),
          is_active = coalesce(excluded.is_active, crm.outlet_events.is_active),
          image_url = coalesce(excluded.image_url, crm.outlet_events.image_url),
          image_list = coalesce(excluded.image_list, crm.outlet_events.image_list),
          members = CASE WHEN excluded.members = '[]'::jsonb THEN crm.outlet_events.members ELSE excluded.members END,
          updated_at = now()`,
        [
          uuidv7(),
          context.tenantId,
          context.businessId,
          context.outletId,
          eventId,
          patch.title ?? null,
          patch.description ?? null,
          patch.terms ?? null,
          patch.dateTime ?? null,
          patch.expiryDate ?? null,
          patch.address ?? null,
          patch.location ? JSON.stringify(patch.location) : null,
          patch.postLink ?? null,
          patch.fees ?? null,
          patch.offer ?? null,
          patch.isActive ?? null,
          patch.imageUrl ? JSON.stringify(patch.imageUrl) : null,
          patch.imageList ? JSON.stringify(patch.imageList) : null,
          JSON.stringify(mergedMembers),
        ],
      );
    });
    return { eventId, outletId };
  }

  async listEvents(params: {
    outletId: string;
    eventId?: string;
    isActive?: boolean;
    fromDate?: string;
    toDate?: string;
  }) {
    return withEventGatewayDatabase(params.outletId, async (database, context) => {
      const clauses = ["tenant_id = $1", "outlet_id = $2"];
      const values: unknown[] = [context.tenantId, context.outletId];
      if (params.eventId) {
        values.push(params.eventId);
        clauses.push(`external_event_id = $${values.length}`);
      }
      if (params.isActive !== undefined) {
        values.push(params.isActive);
        clauses.push(`is_active = $${values.length}`);
      }
      if (params.fromDate) {
        values.push(params.fromDate);
        clauses.push(`event_at >= $${values.length}::timestamptz`);
      }
      if (params.toDate) {
        values.push(params.toDate);
        clauses.push(`event_at <= $${values.length}::timestamptz`);
      }
      const result = await database.client.query(
        `SELECT * FROM crm.outlet_events WHERE ${clauses.join(" AND ")} ORDER BY event_at DESC NULLS LAST`,
        values,
      );
      return result.rows.map((row) => mapRowToApi(row as Record<string, unknown>));
    });
  }

  async listEventTransactions(params: { outletId: string; eventId?: string }) {
    return withEventGatewayDatabase(params.outletId, async (database, context) => {
      const values: unknown[] = [context.tenantId, context.outletId];
      let filter = "";
      if (params.eventId) {
        values.push(params.eventId);
        filter = ` AND external_event_id = $${values.length}`;
      }
      const result = await database.client.query(
        `SELECT transaction_id AS "transactionId", external_event_id AS "eventId",
                amount, status, payment_type AS "paymentType", message, remark,
                transacted_at AS date
         FROM crm.outlet_event_transactions
         WHERE tenant_id = $1 AND outlet_id = $2${filter}
         ORDER BY transacted_at DESC`,
        values,
      );
      return result.rows as Record<string, unknown>[];
    });
  }

  async findTransactionById(outletId: string, transactionId: string) {
    return withEventGatewayDatabase(outletId, async (database, context) => {
      const result = await database.client.query(
        `SELECT id FROM crm.outlet_event_transactions
         WHERE tenant_id = $1 AND outlet_id = $2 AND transaction_id = $3 LIMIT 1`,
        [context.tenantId, context.outletId, transactionId],
      );
      return result.rows[0] ?? null;
    });
  }

  async addEventTransaction(outletId: string, transaction: Record<string, unknown>) {
    await withEventGatewayDatabase(outletId, async (database, context) => {
      await database.client.query(
        `INSERT INTO crm.outlet_event_transactions (
          id, tenant_id, outlet_id, external_event_id, transaction_id, amount, status, payment_type, message, remark, transacted_at, payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
        ON CONFLICT (tenant_id, outlet_id, transaction_id) DO NOTHING`,
        [
          uuidv7(),
          context.tenantId,
          context.outletId,
          String(transaction.eventId ?? ""),
          String(transaction.transactionId ?? ""),
          Number(transaction.amount ?? 0),
          String(transaction.status ?? ""),
          String(transaction.paymentType ?? ""),
          String(transaction.message ?? ""),
          String(transaction.remark ?? ""),
          transaction.date ?? new Date(),
          JSON.stringify(transaction),
        ],
      );
    });
  }

  async getEvent(outletId: string, eventId: string) {
    return withEventGatewayDatabase(outletId, async (database, context) => {
      const result = await database.client.query(
        `SELECT * FROM crm.outlet_events
         WHERE tenant_id = $1 AND outlet_id = $2 AND external_event_id = $3 LIMIT 1`,
        [context.tenantId, context.outletId, eventId],
      );
      const row = result.rows[0];
      return row ? mapRowToApi(row as Record<string, unknown>) : null;
    });
  }

  async updateEventMembers(outletId: string, eventId: string, members: EventMemberInput[]) {
    await withEventGatewayDatabase(outletId, async (database, context) => {
      await database.client.query(
        `UPDATE crm.outlet_events SET members = $4::jsonb, updated_at = now()
         WHERE tenant_id = $1 AND outlet_id = $2 AND external_event_id = $3`,
        [context.tenantId, context.outletId, eventId, JSON.stringify(members)],
      );
    });
  }

  async saveMemberPendingPayment(params: {
    outletId: string;
    eventId: string;
    transactionId: string;
    intentString: string;
    mobile: string;
  }) {
    const eventData = await this.getEvent(params.outletId, params.eventId);
    if (!eventData) return;
    const members = (eventData.members as EventMemberInput[] | undefined) ?? [];
    const updated = members.map((member) =>
      eventMobilesMatch(member.mobile, params.mobile)
        ? {
          ...member,
          paymentStatus: "PENDING",
          transactionId: params.transactionId,
          paymentDate: null,
          url: params.intentString,
        }
        : member,
    );
    await this.updateEventMembers(params.outletId, params.eventId, updated);
  }
}

export const postgresEventGatewayRepository = new PostgresEventGatewayRepository();
