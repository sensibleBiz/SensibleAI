import type { Response } from "express";
import type { RequestWithDatabaseContext } from "../../middleware/postgresAuth.js";
import { whatsappAutomationService } from "./whatsappAutomation.service.js";
import type { WhatsAppAutomationRule } from "./whatsappAutomation.types.js";

export const getAutomationRules = async (request: RequestWithDatabaseContext, response: Response) => {
  const outletId = String((request.validated?.query as { outletId: string }).outletId);
  const rules = await whatsappAutomationService.getRules(request.database, request.tenantId, outletId);
  response.json({ success: true, data: rules });
};

export const saveAutomationRule = async (request: RequestWithDatabaseContext, response: Response) => {
  const outletId = String((request.validated?.query as { outletId: string }).outletId);
  const body = request.validated?.body as WhatsAppAutomationRule;
  const saved = await whatsappAutomationService.saveRule(request.database, request.tenantId, outletId, body);
  response.status(200).json({ success: true, data: saved });
};

export const testSendWhatsAppTemplate = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const outletId = String((request.validated?.query as { outletId: string }).outletId);
  const body = request.validated?.body as {
    recipientNumber: string;
    templateName: string;
    languageCode?: string;
    parameters: Record<string, string>;
  };

  const result = await whatsappAutomationService.testSend(request.database, request.tenantId, {
    outletId,
    ...body,
  });

  if (!result.success) {
    response.status(400).json({
      success: false,
      code: "WHATSAPP_SEND_FAILED",
      message: result.error || "Failed to send WhatsApp message",
      data: result,
    });
    return;
  }

  response.status(200).json({
    success: true,
    data: result,
  });
};
