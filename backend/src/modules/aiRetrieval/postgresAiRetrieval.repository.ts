import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import { normalizePhone } from "../search/searchLead.repository.js";

interface IdRow extends QueryResultRow {
  id: string;
}

interface ContextRow extends QueryResultRow {
  lead_id: string;
  source_type: "lead" | "timeline";
  document_text: string | null;
  business_name: string | null;
  requirement: string | null;
  source: string | null;
  city: string | null;
  state: string | null;
  stage: string | null;
}

export interface RetrievalDocument {
  leadId: string;
  sourceType: "lead" | "timeline";
  text: string;
  businessName?: string | null;
  requirement?: string | null;
  source?: string | null;
  city?: string | null;
  state?: string | null;
  stage?: string | null;
}

export class PostgresAiRetrievalRepository {
  async exactLeadIds(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    query: string,
  ): Promise<string[]> {
    const digits = normalizePhone(query);
    const result = await database.client.query<IdRow>(`
      SELECT id FROM crm.leads
      WHERE tenant_id = $1 AND outlet_id = $2
        AND (($3 <> '' AND normalized_mobile = $3)
          OR normalized_email = $4 OR external_ref = $5)
      ORDER BY id
      LIMIT 10
    `, [tenantId, outletId, digits, query.toLowerCase(), query]);
    return result.rows.map((row) => row.id);
  }

  async fullTextLeadIds(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    query: string,
  ): Promise<string[]> {
    const result = await database.client.query<IdRow>(`
      SELECT subject_lead_id AS id
      FROM crm.ai_retrieval_chunks
      WHERE tenant_id = $1 AND outlet_id = $2
        AND search_vector @@ websearch_to_tsquery('simple', $3)
      GROUP BY subject_lead_id
      ORDER BY max(ts_rank_cd(search_vector, websearch_to_tsquery('simple', $3))) DESC
      LIMIT 10
    `, [tenantId, outletId, query]);
    return result.rows.map((row) => row.id);
  }

  async vectorLeadIds(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    embedding: number[],
  ): Promise<string[]> {
    const result = await database.client.query<IdRow>(`
      SELECT subject_lead_id AS id
      FROM (
        SELECT subject_lead_id, embedding <=> $3::vector AS distance
        FROM crm.ai_retrieval_chunks
        WHERE tenant_id = $1 AND outlet_id = $2
        ORDER BY embedding <=> $3::vector
        LIMIT 40
      ) nearest
      GROUP BY subject_lead_id
      ORDER BY min(distance)
      LIMIT 10
    `, [tenantId, outletId, JSON.stringify(embedding)]);
    return result.rows.map((row) => row.id);
  }

  async getDocuments(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    leadIds: string[],
  ): Promise<RetrievalDocument[]> {
    if (leadIds.length === 0) return [];
    const result = await database.client.query<ContextRow>(`
      SELECT lead.id AS lead_id, 'lead'::text AS source_type,
        chunk.document_text, NULL::text AS business_name, NULL::text AS requirement,
        NULL::text AS source, NULL::text AS city, NULL::text AS state, NULL::text AS stage
      FROM crm.ai_retrieval_chunks chunk
      JOIN crm.leads lead
        ON lead.tenant_id = chunk.tenant_id AND lead.id = chunk.subject_lead_id
          AND lead.outlet_id = chunk.outlet_id
      WHERE chunk.tenant_id = $1 AND chunk.outlet_id = $2
        AND chunk.subject_lead_id = ANY($3::uuid[]) AND chunk.source_type = 'lead'
      UNION ALL
      SELECT lead.id, 'lead', NULL::text, lead.business_name, lead.requirement,
        lead.source, lead.city, lead.state, lead.stage::text
      FROM crm.leads lead
      WHERE lead.tenant_id = $1 AND lead.outlet_id = $2 AND lead.id = ANY($3::uuid[])
        AND NOT EXISTS (
          SELECT 1 FROM crm.ai_retrieval_chunks chunk
          WHERE chunk.tenant_id = lead.tenant_id AND chunk.outlet_id = lead.outlet_id
            AND chunk.subject_lead_id = lead.id AND chunk.source_type = 'lead'
        )
      UNION ALL
      SELECT lead.id, 'timeline', chunk.document_text, NULL::text, NULL::text,
        NULL::text, NULL::text, NULL::text, NULL::text
      FROM crm.ai_retrieval_chunks chunk
      JOIN crm.leads lead
        ON lead.tenant_id = chunk.tenant_id AND lead.id = chunk.subject_lead_id
          AND lead.outlet_id = chunk.outlet_id
      WHERE chunk.tenant_id = $1 AND chunk.outlet_id = $2
        AND chunk.subject_lead_id = ANY($3::uuid[]) AND chunk.source_type = 'timeline'
      LIMIT 30
    `, [tenantId, outletId, leadIds]);

    return result.rows.map((row) => ({
      leadId: row.lead_id,
      sourceType: row.source_type,
      text: row.document_text ?? "",
      businessName: row.business_name,
      requirement: row.requirement,
      source: row.source,
      city: row.city,
      state: row.state,
      stage: row.stage,
    }));
  }
}

export const postgresAiRetrievalRepository = new PostgresAiRetrievalRepository();
