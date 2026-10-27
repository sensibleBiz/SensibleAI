import { Router } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import {
  ingestPostgresWhatsAppEvent,
  listPostgresWhatsAppConversations,
  markPostgresWhatsAppConversationRead,
  sendPostgresWhatsAppMessage,
} from "./postgresWhatsApp.controller.js";
import {
  postgresWhatsAppConversationParamsSchema,
  postgresWhatsAppEventBodySchema,
  postgresWhatsAppListQuerySchema,
  postgresWhatsAppReadBodySchema,
  postgresWhatsAppSendBodySchema,
} from "./postgresWhatsApp.validator.js";

export const postgresWhatsAppRouter = Router();
postgresWhatsAppRouter.use((request, _response, next) => request.header(POSTGRES_SESSION_HEADER) === "1" ? next() : next("router"));
postgresWhatsAppRouter.use(requirePostgresAuth);
postgresWhatsAppRouter.get("/chats", validateRequest({ query: postgresWhatsAppListQuerySchema }), withRequestDatabaseContext(listPostgresWhatsAppConversations));
postgresWhatsAppRouter.post("/chats/events", validateRequest({ body: postgresWhatsAppEventBodySchema }), withRequestDatabaseContext(ingestPostgresWhatsAppEvent));
postgresWhatsAppRouter.post("/chats/:conversationId/messages", validateRequest({ params: postgresWhatsAppConversationParamsSchema, body: postgresWhatsAppSendBodySchema }), withRequestDatabaseContext(sendPostgresWhatsAppMessage));
postgresWhatsAppRouter.patch("/chats/:conversationId/read", validateRequest({ params: postgresWhatsAppConversationParamsSchema, body: postgresWhatsAppReadBodySchema }), withRequestDatabaseContext(markPostgresWhatsAppConversationRead));
