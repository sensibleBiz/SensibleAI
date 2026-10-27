import type { Response } from "express";
import type { RequestWithDatabaseContext } from "../../middleware/postgresAuth.js";
import { postgresWhatsAppService, type PostgresWhatsAppEventInput, type PostgresWhatsAppSendInput } from "./postgresWhatsApp.service.js";

export const listPostgresWhatsAppConversations = async (request: RequestWithDatabaseContext, response: Response) => {
  const result = await postgresWhatsAppService.list(request.database, request.tenantId, request.userId, request.validated?.query as { outletId: string; startDate?: number; limit: number; cursor?: string });
  response.json({ success: true, data: result });
};

export const markPostgresWhatsAppConversationRead = async (request: RequestWithDatabaseContext, response: Response) => {
  const params = request.validated?.params as { conversationId: string };
  const body = request.validated?.body as { outletId: string };
  const result = await postgresWhatsAppService.markRead(request.database, request.tenantId, request.userId, body.outletId, params.conversationId);
  response.json({ success: true, data: result });
};

export const sendPostgresWhatsAppMessage = async (request: RequestWithDatabaseContext, response: Response) => {
  const params = request.validated?.params as { conversationId: string };
  const result = await postgresWhatsAppService.sendMessage(
    request.database,
    request.tenantId,
    request.userId,
    params.conversationId,
    request.validated?.body as PostgresWhatsAppSendInput,
  );
  if (!result.sent) {
    response.status(502).json({ success: false, message: result.error || "WhatsApp provider rejected the message", code: "WHATSAPP_SEND_FAILED" });
    return;
  }
  response.status(201).json({ success: true, data: result.conversation });
};

export const ingestPostgresWhatsAppEvent = async (request: RequestWithDatabaseContext, response: Response) => {
  const result = await postgresWhatsAppService.ingestEvent(
    request.database,
    request.tenantId,
    request.userId,
    request.validated?.body as PostgresWhatsAppEventInput,
  );
  response.status(202).json({ success: true, data: result });
};
