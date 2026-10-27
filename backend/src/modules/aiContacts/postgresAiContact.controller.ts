import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import type { CreateAiContactJobInput, UpdateAiContactJobInput } from "./aiContact.types.js";
import { postgresAiContactService } from "./postgresAiContact.service.js";

const context = (request: Request) => {
  if (!request.postgresAuth || !request.database) {
    throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  }
  return { auth: request.postgresAuth, database: request.database };
};

export const listPostgresAiContactJobs = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const outletId = String((request.validated?.query as { outletId: string }).outletId);
  const data = await postgresAiContactService.list(database, auth.tenantId, auth.userId, outletId);
  response.json({ success: true, data });
};

export const createPostgresAiContactJob = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const data = await postgresAiContactService.create(database, auth.tenantId, auth.userId,
    request.validated?.body as CreateAiContactJobInput);
  response.status(201).json({ success: true, data });
};

export const updatePostgresAiContactJob = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const { outletId } = request.validated?.query as { outletId: string };
  const { jobId } = request.validated?.params as { jobId: string };
  const data = await postgresAiContactService.update(database, auth.tenantId, auth.userId, outletId, jobId,
    request.validated?.body as UpdateAiContactJobInput);
  response.json({ success: true, data });
};

export const deletePostgresAiContactJob = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const { outletId } = request.validated?.query as { outletId: string };
  const { jobId } = request.validated?.params as { jobId: string };
  const data = await postgresAiContactService.delete(database, auth.tenantId, auth.userId, outletId, jobId);
  response.json({ success: true, data });
};
