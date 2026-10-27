import { Router } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import {
  getPostgresCustomerTimeline,
  getPostgresLeadTimeline,
} from "./postgresTimeline.controller.js";
import {
  postgresCustomerTimelineParamsSchema,
  postgresLeadTimelineParamsSchema,
  postgresTimelineQuerySchema,
} from "./postgresTimeline.validator.js";

export const postgresTimelineRouter = Router();

postgresTimelineRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});
postgresTimelineRouter.use(requirePostgresAuth);

postgresTimelineRouter.get(
  "/leads/:leadId/timeline",
  validateRequest({ params: postgresLeadTimelineParamsSchema, query: postgresTimelineQuerySchema }),
  withRequestDatabaseContext(getPostgresLeadTimeline),
);
postgresTimelineRouter.get(
  "/customers/:customerId/timeline",
  validateRequest({ params: postgresCustomerTimelineParamsSchema, query: postgresTimelineQuerySchema }),
  withRequestDatabaseContext(getPostgresCustomerTimeline),
);
