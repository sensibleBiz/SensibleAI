import { Router } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import { createPostgresUserTrackingPoint, listPostgresUserTrackingHistory } from "./postgresUserTracking.controller.js";
import { postgresUserTrackingCreateSchema, postgresUserTrackingQuerySchema } from "./postgresUserTracking.validator.js";

export const postgresUserTrackingRouter = Router();

postgresUserTrackingRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});
postgresUserTrackingRouter.use(requirePostgresAuth);
postgresUserTrackingRouter.get(
  "/history",
  validateRequest({ query: postgresUserTrackingQuerySchema }),
  withRequestDatabaseContext(listPostgresUserTrackingHistory),
);
postgresUserTrackingRouter.post(
  "/points",
  validateRequest({ body: postgresUserTrackingCreateSchema }),
  withRequestDatabaseContext(createPostgresUserTrackingPoint),
);
