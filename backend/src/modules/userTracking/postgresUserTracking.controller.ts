import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import type { UserTrackingQuery } from "../../types/userTracking.types.js";
import { postgresUserTrackingService } from "./postgresUserTracking.service.js";
import type { PostgresUserTrackingCreateInput } from "./userTracking.types.js";

const context = (request: Request) => {
  if (!request.postgresAuth || !request.database) {
    throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  }
  return { auth: request.postgresAuth, database: request.database };
};

export const listPostgresUserTrackingHistory = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const data = await postgresUserTrackingService.listHistory(
    database, auth.tenantId, auth.userId, request.validated?.query as UserTrackingQuery,
  );
  response.json({ success: true, data });
};

export const createPostgresUserTrackingPoint = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const data = await postgresUserTrackingService.create(
    database, auth.tenantId, auth.userId, request.validated?.body as PostgresUserTrackingCreateInput,
  );
  response.status(201).json({ success: true, data });
};
