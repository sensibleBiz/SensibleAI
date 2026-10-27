import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import { postgresTeamService } from "./postgresTeam.service.js";
import type { PostgresTeamCreateInput, PostgresTeamListQuery, PostgresTeamMembershipCreateInput, PostgresTeamUpdateInput } from "./team.types.js";

const context = (request: Request) => {
  if (!request.database || !request.postgresAuth) throw new AppError(401, "Authentication is required", "AUTHENTICATION_REQUIRED");
  return { database: request.database, auth: request.postgresAuth };
};

export const listPostgresTeam = async (request: Request, response: Response) => {
  const { database, auth } = context(request);
  response.json({ success: true, data: await postgresTeamService.list(database, auth.tenantId, auth.userId, request.validated?.query as PostgresTeamListQuery) });
};
export const getPostgresTeamMember = async (request: Request, response: Response) => {
  const { database, auth } = context(request);
  const { userId } = request.validated?.params as { userId: string };
  const { outletId } = request.validated?.query as { outletId: string };
  response.json({ success: true, data: await postgresTeamService.get(database, auth.tenantId, auth.userId, outletId, userId) });
};
export const createPostgresTeamUser = async (request: Request, response: Response) => {
  const { database, auth } = context(request);
  const data = await postgresTeamService.create(database, auth.tenantId, auth.userId, auth.isTenantAdmin, request.validated?.body as PostgresTeamCreateInput);
  response.status(201).json({ success: true, data });
};
export const updatePostgresTeamMember = async (request: Request, response: Response) => {
  const { database, auth } = context(request);
  const { userId } = request.validated?.params as { userId: string };
  response.json({ success: true, data: await postgresTeamService.update(database, auth.tenantId, auth.userId, userId, request.validated?.body as PostgresTeamUpdateInput) });
};

export const addPostgresTeamMembership = async (request: Request, response: Response) => {
  const { database, auth } = context(request);
  const { userId } = request.validated?.params as { userId: string };
  const data = await postgresTeamService.addMembership(database, auth.tenantId, auth.userId, userId, request.validated?.body as PostgresTeamMembershipCreateInput);
  response.status(201).json({ success: true, data });
};