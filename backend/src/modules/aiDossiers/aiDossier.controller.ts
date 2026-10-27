import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import { aiDossierService } from "./aiDossier.service.js";
import type { DossierSubjectType } from "./aiDossier.types.js";

const getContext = (request: Request) => {
  if (!request.database || !request.postgresAuth) {
    throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  }
  return { database: request.database, auth: request.postgresAuth };
};

const subject = (request: Request): { type: DossierSubjectType; id: string } => {
  const params = request.validated?.params as { leadId?: string; customerId?: string };
  return params.leadId
    ? { type: "lead", id: params.leadId }
    : { type: "customer", id: params.customerId! };
};

export const getAiDossier = async (request: Request, response: Response) => {
  const { database, auth } = getContext(request);
  const { type, id } = subject(request);
  const { outletId } = request.validated?.query as { outletId: string };
  const data = await aiDossierService.get(database, auth.tenantId, auth.userId, outletId, type, id);
  response.json({ success: true, data });
};

export const requestAiDossier = async (request: Request, response: Response) => {
  const { database, auth } = getContext(request);
  const { type, id } = subject(request);
  const { outletId } = request.validated?.body as { outletId: string };
  const data = await aiDossierService.request(database, auth.tenantId, auth.userId, outletId, type, id);
  response.status(202).json({ success: true, data });
};

export const recordAiDossierFeedback = async (request: Request, response: Response) => {
  const { database, auth } = getContext(request);
  const { type, id } = subject(request);
  const input = request.validated?.body as { outletId: string; useful: boolean; note?: string };
  await aiDossierService.recordFeedback(
    database, auth.tenantId, auth.userId, input.outletId, type, id, input.useful, input.note,
  );
  response.status(204).send();
};
