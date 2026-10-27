import { Router } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { createPostgresQuotation, sendQuotationWhatsAppPdf } from "./postgresQuotation.controller.js";
import { postgresQuotationCreateSchema, quotationWhatsAppPdfSchema } from "./postgresQuotation.validator.js";

export const postgresQuotationRouter = Router();
postgresQuotationRouter.use(requirePostgresAuth);
postgresQuotationRouter.post("/", validateRequest({ body: postgresQuotationCreateSchema }), withRequestDatabaseContext(createPostgresQuotation));
// Proxy route: keeps MSG91 auth key server-side; auth still required so only
// legitimate employees can trigger a WhatsApp PDF send.
postgresQuotationRouter.post("/whatsapp-pdf", validateRequest({ body: quotationWhatsAppPdfSchema }), withRequestDatabaseContext(sendQuotationWhatsAppPdf));
