import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import type { PostgresActivityCreateInput, PostgresActivityListQuery, PostgresActivityUpdateInput } from "./activity.types.js";
import { postgresActivityService } from "./postgresActivity.service.js";

const context = (request: Request) => {
  if (!request.postgresAuth || !request.database) throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  return { auth: request.postgresAuth, database: request.database };
};

export const listPostgresActivities = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresActivityService.list(database, auth.tenantId, auth.userId, request.validated?.query as PostgresActivityListQuery);
  response.json({ success: true, data: result });
};

export const listPostgresLeadActivities = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresActivityService.listLead(database, auth.tenantId, auth.userId, String((request.validated?.params as { leadId: string }).leadId), request.validated?.query as PostgresActivityListQuery);
  response.json({ success: true, data: result });
};

export const createPostgresLeadActivity = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresActivityService.create(database, auth.tenantId, auth.userId, String((request.validated?.params as { leadId: string }).leadId), request.validated?.body as PostgresActivityCreateInput);
  response.status(201).json({ success: true, data: result });
};

export const getPostgresActivity = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresActivityService.getById(database, auth.tenantId, auth.userId, (request.validated?.query as { outletId: string }).outletId, String((request.validated?.params as { activityId: string }).activityId));
  response.json({ success: true, data: result });
};

export const updatePostgresActivity = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresActivityService.update(database, auth.tenantId, auth.userId, String((request.validated?.params as { activityId: string }).activityId), request.validated?.body as PostgresActivityUpdateInput);
  response.json({ success: true, data: result });
};

export const deletePostgresActivity = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresActivityService.delete(database, auth.tenantId, auth.userId, (request.validated?.query as { outletId: string }).outletId, String((request.validated?.params as { activityId: string }).activityId));
  response.json({ success: true, data: result });
};

