import { Router } from "express";
import { z } from "zod";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import { env } from "../../config/env.js";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { createRateLimiter } from "../../middleware/security.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import {
  askCrmAssistant,
  type CrmAssistantInput,
} from "./crmAssistant.service.js";

const crmAssistantRequestSchema = z.object({
  outletId: z.string().trim().min(1).max(128),
  message: z.string().trim().min(1).max(4_000),
  history: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().max(2_000),
    }),
  ).max(8),
});

export const crmAssistantRouter = Router();
const retrievalRateLimiter = createRateLimiter({
  maxRequests: 30,
  windowMs: 60_000,
  message: "Too many AI assistant requests. Please try again later.",
});

crmAssistantRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});
crmAssistantRouter.use(requirePostgresAuth);
crmAssistantRouter.post(
  "/chat",
  (request, response, next) => {
    if (env.aiRetrieval.enabled) return retrievalRateLimiter(request, response, next);
    next();
  },
  validateRequest({ body: crmAssistantRequestSchema }),
  withRequestDatabaseContext(async (request, response) => {
    const answer = await askCrmAssistant(
      request.database,
      request.tenantId,
      request.userId,
      request.validated?.body as CrmAssistantInput,
    );
    response.json({ success: true, data: { answer } });
  }),
);
