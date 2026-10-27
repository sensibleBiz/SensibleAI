import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import { embedText } from "../assistant/tools/embeddingService.js";
import {
  exactSearchLeadIds,
  ftsSearchLeadIds,
  vectorSearchLeadIds,
  fetchLeadsByIds,
} from "./searchLead.repository.js";
import { reciprocalRankFusion } from "./rrf.js";
import type { SearchLeadParams, SearchLeadResult, SearchLeadMeta } from "./searchLead.types.js";

export interface SearchLeadResponse {
  results: SearchLeadResult[];
  meta: SearchLeadMeta;
}

export async function searchLeads(
  database: TransactionDatabase,
  tenantId: string,
  userId: string,
  params: SearchLeadParams,
): Promise<SearchLeadResponse> {
  const { outletId, query, limit, enableFts, enableVector } = params;
  const clampedLimit = Math.min(Math.max(1, limit), 50);
  const t0 = Date.now();

  // Permission check inside the transaction (RLS context already set)
  const allowed = await postgresAuthorizationRepository.hasOutletPermission(
    database,
    userId,
    tenantId,
    outletId,
    "leads.read",
  );
  if (!allowed) throw new AppError(403, "Permission denied for leads.read", "PERMISSION_DENIED");

  // Statement timeout: 5 s for the whole search transaction
  await database.client.query("SET LOCAL statement_timeout = '5s'");

  const methodsUsed: Array<"exact" | "fts" | "vector"> = [];

  // ── Exact identifier search ─────────────────────────────────────────────
  const exactIds = await exactSearchLeadIds(database.client, tenantId, outletId, query);
  const exactSet = new Set(exactIds);
  if (exactIds.length > 0) methodsUsed.push("exact");

  // ── Full-text search ────────────────────────────────────────────────────
  let ftsIds: string[] = [];
  if (enableFts && query.trim().length >= 2) {
    try {
      ftsIds = await ftsSearchLeadIds(database.client, tenantId, outletId, query, clampedLimit);
      if (ftsIds.length > 0) methodsUsed.push("fts");
    } catch {
      // FTS column may not exist yet (migration not run) — degrade gracefully
    }
  }

  // ── Vector search ───────────────────────────────────────────────────────
  let vectorIds: string[] = [];
  if (enableVector) {
    try {
      const vec = await embedText(query);
      vectorIds = await vectorSearchLeadIds(database.client, tenantId, outletId, vec, clampedLimit);
      if (vectorIds.length > 0) methodsUsed.push("vector");
    } catch {
      // Embedding service unavailable — degrade gracefully, never surface error
    }
  }

  // ── Fuse results ────────────────────────────────────────────────────────
  const fused = reciprocalRankFusion(exactSet, [
    ["exact", exactIds],
    ["fts", ftsIds],
    ["vector", vectorIds],
  ]);

  const topIds = fused.slice(0, clampedLimit).map((item) => item.id);
  const scoreMap = new Map(fused.map((item) => [item.id, item]));

  // ── Fetch full rows, tenant+outlet scoped ───────────────────────────────
  const rowMap = await fetchLeadsByIds(database.client, tenantId, outletId, topIds);

  const results: SearchLeadResult[] = topIds
    .filter((id) => rowMap.has(id))
    .map((id) => {
      const row = rowMap.get(id)!;
      const rrfItem = scoreMap.get(id)!;
      return {
        id: row.id,
        businessName: row.business_name,
        customerName: row.customer_name,
        mobile: row.mobile,
        stage: row.stage,
        city: row.city,
        assignedTo: row.assigned_to_display_name,
        score: rrfItem.score,
        matchedBy: rrfItem.matchedBy,
      };
    });

  const latencyMs = Date.now() - t0;

  return {
    results,
    meta: { query, methodsUsed, latencyMs },
  };
}
