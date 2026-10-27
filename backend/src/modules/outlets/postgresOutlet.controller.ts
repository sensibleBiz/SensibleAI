import type { RequestWithDatabaseContext } from "../../middleware/postgresAuth.js";
import type { Response } from "express";
import { postgresOutletService } from "./postgresOutlet.service.js";
import type { PostgresOutletCreateInput } from "./outlet.types.js";

export const listPostgresOutlets = async (request: RequestWithDatabaseContext, response: Response) => {
  const items = await postgresOutletService.list(request.database, request.tenantId);
  response.json({ success: true, data: { items } });
};
export const createPostgresOutlet = async (request: RequestWithDatabaseContext, response: Response) => {
  const data = await postgresOutletService.create(
    request.database,
    request.tenantId,
    request.userId,
    request.validated?.body as PostgresOutletCreateInput,
  );
  response.status(201).json({ success: true, data });
};
export const getPostgresOutlet = async (request: RequestWithDatabaseContext, response: Response) => {
  const data = await postgresOutletService.get(request.database, request.tenantId, String(request.params.outletId));
  response.json({ success: true, data });
};
export const updatePostgresOutlet = async (request: RequestWithDatabaseContext, response: Response) => {
  const item = await postgresOutletService.update(request.database, request.tenantId, request.userId,
    String(request.params.outletId), request.validated?.body ?? request.body);
  response.json({ success: true, data: item });
};
export const getPostgresPlanCatalog = async (request: RequestWithDatabaseContext, response: Response) => {
  const features = await postgresOutletService.getPlanCatalog(request.database, request.tenantId);
  response.json({ success: true, data: { features } });
};
export const savePostgresPlanCatalog = async (request: RequestWithDatabaseContext, response: Response) => {
  const body = request.validated?.body as { features: unknown[] };
  const features = await postgresOutletService.savePlanCatalog(request.database, request.tenantId, request.userId, body.features);
  response.json({ success: true, data: { features } });
};
