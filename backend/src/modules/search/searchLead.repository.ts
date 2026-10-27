import type { PoolClient } from "pg";

// ─── Result shapes ───────────────────────────────────────────────────────────

export interface LeadRow {
  id: string;
  business_name: string;
  customer_name: string;
  mobile: string;
  stage: string;
  city: string | null;
  assigned_to_display_name: string | null;
}

// ─── Query helpers ────────────────────────────────────────────────────────────

/**
 * Normalise a query string to phone-number digits for exact mobile lookup.
 * Returns the last 10 digits if the input has ≥ 10 digits, otherwise returns
 * the raw digits so that short-number lookups still work.
 */
export function normalizePhone(query: string): string {
  const digits = query.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

// ─── Exact identifier search ─────────────────────────────────────────────────

/**
 * Returns IDs of leads that are an exact match for phone, email or external_ref.
 * Always tenant+outlet scoped. Does not apply soft-delete filter because leads
 * have no deleted_at column (hard-delete is not used; this matches existing
 * list() behaviour).
 */
export async function exactSearchLeadIds(
  client: PoolClient,
  tenantId: string,
  outletId: string,
  query: string,
): Promise<string[]> {
  const digits = normalizePhone(query);
  const lower = query.toLowerCase();
  const result = await client.query<{ id: string }>(
    `SELECT id
     FROM crm.leads
     WHERE tenant_id = $1
       AND outlet_id = $2
       AND (
         ($3 <> '' AND normalized_mobile = $3)
         OR normalized_email = $4
         OR external_ref    = $5
       )
     LIMIT 20`,
    [tenantId, outletId, digits, lower, query],
  );
  return result.rows.map((r) => r.id);
}

// ─── Full-text search ─────────────────────────────────────────────────────────

/**
 * FTS search using the generated `search_vector` column (migration 0039).
 * Uses `websearch_to_tsquery` which understands quoted phrases and "-word" negation,
 * and gracefully handles short/stop words without throwing.
 */
export async function ftsSearchLeadIds(
  client: PoolClient,
  tenantId: string,
  outletId: string,
  query: string,
  limit: number,
): Promise<string[]> {
  const result = await client.query<{ id: string }>(
    `SELECT id
     FROM crm.leads
     WHERE tenant_id = $1
       AND outlet_id = $2
       AND search_vector @@ websearch_to_tsquery('simple', $3)
     ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('simple', $3)) DESC
     LIMIT $4`,
    [tenantId, outletId, query, limit],
  );
  return result.rows.map((r) => r.id);
}

// ─── Vector (semantic) search ─────────────────────────────────────────────────

/**
 * Cosine-distance nearest-neighbour search using the IVFFlat index from
 * migration 0036. Only considers leads that already have an embedding.
 */
export async function vectorSearchLeadIds(
  client: PoolClient,
  tenantId: string,
  outletId: string,
  vector: number[],
  limit: number,
): Promise<string[]> {
  const result = await client.query<{ id: string }>(
    `SELECT id
     FROM crm.leads
     WHERE tenant_id = $1
       AND outlet_id = $2
       AND embedding IS NOT NULL
     ORDER BY embedding <=> $3::vector
     LIMIT $4`,
    [tenantId, outletId, JSON.stringify(vector), limit],
  );
  return result.rows.map((r) => r.id);
}

// ─── Fetch full rows for a result set ────────────────────────────────────────

export async function fetchLeadsByIds(
  client: PoolClient,
  tenantId: string,
  outletId: string,
  ids: string[],
): Promise<Map<string, LeadRow>> {
  if (ids.length === 0) return new Map();
  const result = await client.query<LeadRow>(
    `SELECT l.id,
            coalesce(l.business_name, '') AS business_name,
            coalesce(l.customer_name, '') AS customer_name,
            coalesce(l.mobile, '')         AS mobile,
            l.stage::text                  AS stage,
            l.city,
            u.display_name                 AS assigned_to_display_name
     FROM crm.leads l
     LEFT JOIN iam.users u ON u.id = l.assigned_to_user_id
     WHERE l.tenant_id = $1
       AND l.outlet_id = $2
       AND l.id = ANY($3::uuid[])`,
    [tenantId, outletId, ids],
  );
  return new Map(result.rows.map((row) => [row.id, row]));
}
