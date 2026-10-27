import { Router } from "express";
import type { Response } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import type { RequestWithDatabaseContext } from "../../middleware/postgresAuth.js";
import { searchLeads } from "./searchLead.service.js";

export const searchRouter = Router();

searchRouter.use(requirePostgresAuth);

const handleSearchLeads = async (request: RequestWithDatabaseContext, response: Response): Promise<void> => {
  const body = request.body as {
    outletId?: unknown;
    query?: unknown;
    limit?: unknown;
    enableFts?: unknown;
    enableVector?: unknown;
  };

  if (typeof body.outletId !== "string" || !body.outletId) {
    response.status(400).json({ success: false, error: "outletId is required" });
    return;
  }
  if (typeof body.query !== "string" || body.query.trim().length === 0) {
    response.status(400).json({ success: false, error: "query is required" });
    return;
  }
  if (body.query.length > 200) {
    response.status(400).json({ success: false, error: "query must be 200 characters or fewer" });
    return;
  }

  const limit = typeof body.limit === "number" ? body.limit : 20;
  const enableFts = body.enableFts !== false;
  const enableVector = body.enableVector !== false;

  const data = await searchLeads(request.database, request.tenantId, request.userId, {
    outletId: body.outletId,
    query: body.query.trim(),
    limit,
    enableFts,
    enableVector,
  });

  response.json({ success: true, data });
};

/**
 * POST /search/leads
 *
 * Body:
 *   outletId      string   (required)
 *   query         string   (required, 1–200 chars)
 *   limit?        number   (1–50, default 20)
 *   enableFts?    boolean  (default true)
 *   enableVector? boolean  (default true)
 *
 * Response:
 *   { success: true, data: { results: SearchLeadResult[], meta: SearchLeadMeta } }
 */
searchRouter.post("/leads", withRequestDatabaseContext(handleSearchLeads));
