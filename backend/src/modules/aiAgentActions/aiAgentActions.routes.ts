import { Router } from "express";
import { env } from "../../config/env.js";
import { AppError } from "../../errors/appError.js";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import { aiAgentActionsService } from "./aiAgentActions.service.js";
import {
  aiAgentActionListQuerySchema,
  aiAgentActionOutletQuerySchema,
  aiAgentActionParamsSchema,
  aiAgentActionProposalSchema,
  aiAgentActionReviewSchema,
  type AiAgentActionProposalInput,
} from "./aiAgentActions.validator.js";
import type { z } from "zod";

export const aiAgentActionsRouter = Router();

aiAgentActionsRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});
aiAgentActionsRouter.use(requirePostgresAuth);
aiAgentActionsRouter.use((_request, _response, next) => {
  if (!env.aiAgentActionsEnabled) {
    next(new AppError(404, "AI action proposals are not enabled", "AI_AGENT_ACTIONS_DISABLED"));
    return;
  }
  next();
});

aiAgentActionsRouter.post(
  "/",
  validateRequest({ body: aiAgentActionProposalSchema }),
  withRequestDatabaseContext(async (request, response) => {
    const result = await aiAgentActionsService.propose(
      request.database,
      request.tenantId,
      request.userId,
      request.validated?.body as AiAgentActionProposalInput,
    );
    response.status(result.replayed ? 200 : 201).json({ success: true, data: result });
  }),
);

aiAgentActionsRouter.get(
  "/",
  validateRequest({ query: aiAgentActionListQuerySchema }),
  withRequestDatabaseContext(async (request, response) => {
    const actions = await aiAgentActionsService.list(
      request.database,
      request.tenantId,
      request.userId,
      request.validated?.query as z.infer<typeof aiAgentActionListQuerySchema>,
    );
    response.json({ success: true, data: { actions } });
  }),
);

aiAgentActionsRouter.get(
  "/:actionId/history",
  validateRequest({ params: aiAgentActionParamsSchema, query: aiAgentActionOutletQuerySchema }),
  withRequestDatabaseContext(async (request, response) => {
    const { actionId } = request.validated?.params as z.infer<typeof aiAgentActionParamsSchema>;
    const { outletId } = request.validated?.query as z.infer<typeof aiAgentActionOutletQuerySchema>;
    const result = await aiAgentActionsService.get(
      request.database, request.tenantId, request.userId, outletId, actionId,
    );
    response.json({ success: true, data: result });
  }),
);

aiAgentActionsRouter.post(
  "/:actionId/review",
  validateRequest({ params: aiAgentActionParamsSchema, query: aiAgentActionOutletQuerySchema, body: aiAgentActionReviewSchema }),
  withRequestDatabaseContext(async (request, response) => {
    const { actionId } = request.validated?.params as z.infer<typeof aiAgentActionParamsSchema>;
    const { outletId } = request.validated?.query as z.infer<typeof aiAgentActionOutletQuerySchema>;
    const { decision, comment } = request.validated?.body as z.infer<typeof aiAgentActionReviewSchema>;
    const action = await aiAgentActionsService.review(
      request.database, request.tenantId, request.userId, outletId, actionId, decision, comment,
    );
    response.json({ success: true, data: { action } });
  }),
);

aiAgentActionsRouter.post(
  "/:actionId/execute",
  validateRequest({ params: aiAgentActionParamsSchema, query: aiAgentActionOutletQuerySchema }),
  withRequestDatabaseContext(async (request, response) => {
    const { actionId } = request.validated?.params as z.infer<typeof aiAgentActionParamsSchema>;
    const { outletId } = request.validated?.query as z.infer<typeof aiAgentActionOutletQuerySchema>;
    const result = await aiAgentActionsService.executeMock(
      request.database, request.tenantId, request.userId, outletId, actionId,
    );
    response.json({ success: true, data: result });
  }),
);

aiAgentActionsRouter.post(
  "/:actionId/cancel",
  validateRequest({ params: aiAgentActionParamsSchema, query: aiAgentActionOutletQuerySchema }),
  withRequestDatabaseContext(async (request, response) => {
    const { actionId } = request.validated?.params as z.infer<typeof aiAgentActionParamsSchema>;
    const { outletId } = request.validated?.query as z.infer<typeof aiAgentActionOutletQuerySchema>;
    const action = await aiAgentActionsService.cancel(
      request.database, request.tenantId, request.userId, outletId, actionId,
    );
    response.json({ success: true, data: { action } });
  }),
);
