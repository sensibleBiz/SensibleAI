import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import { postgresTimelineService } from "./postgresTimeline.service.js";
import type { TimelineQuery } from "./timeline.types.js";

const getContext = (request: Request) => {
  if (!request.database || !request.postgresAuth) {
    throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  }
  return { database: request.database, auth: request.postgresAuth };
};

export const getPostgresLeadTimeline = async (request: Request, response: Response) => {
  const { database, auth } = getContext(request);
  const { leadId } = request.validated?.params as { leadId: string };
  const query = request.validated?.query as TimelineQuery;
  const data = await postgresTimelineService.listLead(database, auth.tenantId, auth.userId, leadId, query);
  response.json({ success: true, data });
};

export const getPostgresCustomerTimeline = async (request: Request, response: Response) => {
  const { database, auth } = getContext(request);
  const { customerId } = request.validated?.params as { customerId: string };
  const query = request.validated?.query as TimelineQuery;
  const data = await postgresTimelineService.listCustomer(database, auth.tenantId, auth.userId, customerId, query);
  response.json({ success: true, data });
};
