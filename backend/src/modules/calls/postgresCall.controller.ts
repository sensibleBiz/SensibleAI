import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import type {
  CallReportQuery,
  EmployeeCallListQuery,
  LeadCallListQuery,
} from "../../types/call.types.js";
import type { PostgresCallCreateInput } from "./call.types.js";
import { postgresCallService } from "./postgresCall.service.js";

const context = (request: Request) => {
  if (!request.postgresAuth || !request.database) {
    throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  }
  return { auth: request.postgresAuth, database: request.database };
};

export const getPostgresCallReport = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresCallService.getReport(
    database,
    auth.tenantId,
    auth.userId,
    request.validated?.query as CallReportQuery,
  );
  response.json({ success: true, data: result });
};

export const listPostgresEmployeeCalls = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresCallService.listByEmployee(
    database,
    auth.tenantId,
    auth.userId,
    request.validated?.query as EmployeeCallListQuery,
  );
  response.json({ success: true, data: result });
};

export const listPostgresLeadCalls = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const leadId = String((request.validated?.params as { leadId: string }).leadId);
  const query = request.validated?.query as Omit<LeadCallListQuery, "leadId">;
  const result = await postgresCallService.listByLead(database, auth.tenantId, auth.userId, {
    ...query,
    leadId,
  });
  response.json({ success: true, data: result });
};

export const createPostgresCall = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresCallService.create(
    database,
    auth.tenantId,
    auth.userId,
    request.validated?.body as PostgresCallCreateInput,
  );
  response.status(201).json({ success: true, data: result });
};

export const getPostgresCall = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const callId = String((request.validated?.params as { callId: string }).callId);
  const outletId = String((request.validated?.query as { outletId: string }).outletId);
  const result = await postgresCallService.getById(database, auth.tenantId, auth.userId, outletId, callId);
  response.json({ success: true, data: result });
};
