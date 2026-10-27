import { Router } from "express";
import {
  getAutomationRules,
  saveAutomationRule,
  testSendWhatsAppTemplate,
} from "./whatsappAutomation.controller.js";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import {
  whatsappAutomationOutletQuerySchema,
  whatsappAutomationRuleBodySchema,
  whatsappAutomationTestBodySchema,
} from "./whatsappAutomation.validator.js";

export const whatsappAutomationRouter = Router();

whatsappAutomationRouter.get(
  "/rules",
  requirePostgresAuth,
  validateRequest({ query: whatsappAutomationOutletQuerySchema }),
  withRequestDatabaseContext(getAutomationRules),
);

whatsappAutomationRouter.post(
  "/rules",
  requirePostgresAuth,
  validateRequest({
    query: whatsappAutomationOutletQuerySchema,
    body: whatsappAutomationRuleBodySchema,
  }),
  withRequestDatabaseContext(saveAutomationRule),
);

whatsappAutomationRouter.post(
  "/test",
  requirePostgresAuth,
  validateRequest({
    query: whatsappAutomationOutletQuerySchema,
    body: whatsappAutomationTestBodySchema,
  }),
  withRequestDatabaseContext(testSendWhatsAppTemplate),
);
