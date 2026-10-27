import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import type { AiContactJob, CreateAiContactJobInput, UpdateAiContactJobInput } from "./aiContact.types.js";

interface AiContactJobRow extends QueryResultRow {
  id: string;
  outlet_id: string;
  keyword_list: string[];
  category: string;
  city: string;
  contact_limit: number;
  status: AiContactJob["status"];
  contacts_count: number;
  received_count: number;
  sent_count: number;
  last_run_at: Date | null;
  error_details: string | null;
  source: string;
  created_at: Date;
  updated_at: Date;
}

const columns = `id, outlet_id, keyword_list, category, city, contact_limit, status,
  contacts_count, received_count, sent_count, last_run_at, error_details, source, created_at, updated_at`;

const mapRow = (row: AiContactJobRow): AiContactJob => ({
  id: row.id,
  outletId: row.outlet_id,
  keywordList: row.keyword_list,
  category: row.category,
  city: row.city,
  contactLimit: row.contact_limit,
  status: row.status,
  contactsCount: row.contacts_count,
  receivedCount: row.received_count,
  sentCount: row.sent_count,
  lastRunAt: row.last_run_at?.getTime() ?? null,
  errorDetails: row.error_details,
  source: row.source,
  createdAt: row.created_at.getTime(),
  updatedAt: row.updated_at.getTime(),
});

export class PostgresAiContactRepository {
  async list(database: TransactionDatabase, tenantId: string, outletId: string) {
    const result = await database.client.query<AiContactJobRow>(`
      SELECT ${columns} FROM crm.ai_contact_jobs
      WHERE tenant_id = $1 AND outlet_id = $2
      ORDER BY created_at DESC, id DESC
    `, [tenantId, outletId]);
    return result.rows.map(mapRow);
  }

  async create(database: TransactionDatabase, tenantId: string, userId: string, input: CreateAiContactJobInput) {
    const result = await database.client.query<AiContactJobRow>(`
      INSERT INTO crm.ai_contact_jobs
        (tenant_id, outlet_id, keyword_list, category, city, contact_limit, created_by_user_id, updated_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
      RETURNING ${columns}
    `, [tenantId, input.outletId, input.keywords, input.category ?? "", input.city ?? "", input.contactLimit ?? 100, userId]);
    return mapRow(result.rows[0]!);
  }

  async update(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    jobId: string,
    userId: string,
    input: UpdateAiContactJobInput,
  ) {
    const result = await database.client.query<AiContactJobRow>(`
      UPDATE crm.ai_contact_jobs SET
        keyword_list = CASE WHEN $4::boolean THEN $5::text[] ELSE keyword_list END,
        category = CASE WHEN $6::boolean THEN $7::varchar ELSE category END,
        city = CASE WHEN $8::boolean THEN $9::varchar ELSE city END,
        contact_limit = CASE WHEN $10::boolean THEN $11::integer ELSE contact_limit END,
        status = CASE WHEN $12::boolean THEN $13::varchar ELSE status END,
        updated_by_user_id = $14
      WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3
      RETURNING ${columns}
    `, [tenantId, outletId, jobId,
      input.keywords !== undefined, input.keywords ?? null,
      input.category !== undefined, input.category ?? null,
      input.city !== undefined, input.city ?? null,
      input.contactLimit !== undefined, input.contactLimit ?? null,
      input.status !== undefined, input.status ?? null, userId]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async delete(database: TransactionDatabase, tenantId: string, outletId: string, jobId: string) {
    const result = await database.client.query(`
      DELETE FROM crm.ai_contact_jobs WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3
    `, [tenantId, outletId, jobId]);
    return (result.rowCount ?? 0) > 0;
  }
}

export const postgresAiContactRepository = new PostgresAiContactRepository();
