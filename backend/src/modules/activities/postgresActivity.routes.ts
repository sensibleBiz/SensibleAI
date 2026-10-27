import { Router } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import {
  createPostgresLeadActivity,
  deletePostgresActivity,
  getPostgresActivity,
  listPostgresActivities,
  listPostgresLeadActivities,
  updatePostgresActivity,
} from "./postgresActivity.controller.js";
import {
  postgresActivityCreateSchema,
  postgresActivityIdParamsSchema,
  postgresActivityListQuerySchema,
  postgresActivityOutletQuerySchema,
  postgresActivityUpdateSchema,
  postgresLeadActivityListQuerySchema,
  postgresLeadActivityParamsSchema,
} from "./postgresActivity.validator.js";

export const postgresActivityRouter = Router();

postgresActivityRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});
postgresActivityRouter.use(requirePostgresAuth);

postgresActivityRouter.get("/activities", validateRequest({ query: postgresActivityListQuerySchema }), withRequestDatabaseContext(listPostgresActivities));
postgresActivityRouter.get("/activities/:activityId", validateRequest({ params: postgresActivityIdParamsSchema, query: postgresActivityOutletQuerySchema }), withRequestDatabaseContext(getPostgresActivity));
postgresActivityRouter.patch("/activities/:activityId", validateRequest({ params: postgresActivityIdParamsSchema, body: postgresActivityUpdateSchema }), withRequestDatabaseContext(updatePostgresActivity));
postgresActivityRouter.delete("/activities/:activityId", validateRequest({ params: postgresActivityIdParamsSchema, query: postgresActivityOutletQuerySchema }), withRequestDatabaseContext(deletePostgresActivity));
postgresActivityRouter.get("/leads/:leadId/activities", validateRequest({ params: postgresLeadActivityParamsSchema, query: postgresLeadActivityListQuerySchema }), withRequestDatabaseContext(listPostgresLeadActivities));
postgresActivityRouter.post("/leads/:leadId/activities", validateRequest({ params: postgresLeadActivityParamsSchema, body: postgresActivityCreateSchema }), withRequestDatabaseContext(createPostgresLeadActivity));
