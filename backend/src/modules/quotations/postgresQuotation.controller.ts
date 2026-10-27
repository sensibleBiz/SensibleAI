import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import { postgresQuotationService } from "./postgresQuotation.service.js";
import type { QuotationCreateInput } from "./quotation.types.js";
import { env } from "../../config/env.js";
import { postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import { quotationWhatsAppPdfSchema } from "./postgresQuotation.validator.js";

export const createPostgresQuotation = async (request: Request, response: Response) => {
  if (!request.database || !request.postgresAuth) {
    throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  }
  const data = await postgresQuotationService.create(
    request.database, request.postgresAuth.tenantId, request.postgresAuth.userId,
    request.validated?.body as QuotationCreateInput,
  );
  response.status(201).json({ success: true, data });
};

/**
 * Proxies the WhatsApp PDF send request to the Cloud Function server-side,
 * injecting the MSG91 auth key from env vars instead of exposing it in the
 * browser bundle.
 */
export const sendQuotationWhatsAppPdf = async (request: Request, response: Response) => {
  if (!request.database || !request.postgresAuth) {
    throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  }
  const payload = quotationWhatsAppPdfSchema.parse(request.validated?.body);
  const allowed = await postgresAuthorizationRepository.hasOutletPermission(
    request.database, request.postgresAuth.userId, request.postgresAuth.tenantId, payload.outletId, "leads.create",
  );
  if (!allowed) throw new AppError(403, "Permission denied for quotation messaging", "PERMISSION_DENIED");
  const CLOUD_FN_URL = "https://asia-south1-sensiblebizpro.cloudfunctions.net/msg91Whatsapp/send_pdf_whatsapp";
  const authKey = env.whatsapp.authKey;
  if (!authKey) {
    response.status(503).json({ success: false, message: "WhatsApp messaging is not configured on this server" });
    return;
  }
  try {
    const upstream = await fetch(CLOUD_FN_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authkey: authKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await upstream.text();
    if (!upstream.ok) throw new AppError(502, "WhatsApp provider rejected the request", "WHATSAPP_PROVIDER_ERROR");
    response.json({ success: true, data: { providerResponse: text } });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, "Unable to contact WhatsApp provider", "WHATSAPP_PROVIDER_ERROR");
  }
};
