import type { Response } from "express";
import type { RequestWithDatabaseContext } from "../../middleware/postgresAuth.js";
import { businessConfigurationService } from "./businessConfiguration.service.js";

export const getBusinessConfiguration = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const configuration = await businessConfigurationService.get(
    request.database,
    request.tenantId,
    String(request.params.outletId),
  );
  response.json({ success: true, data: configuration });
};

export const saveBusinessConfiguration = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const configuration = await businessConfigurationService.save(
    request.database,
    request.tenantId,
    request.userId,
    String(request.params.outletId),
    request.validated?.body as Parameters<typeof businessConfigurationService.save>[4],
  );
  response.json({ success: true, data: configuration });
};
