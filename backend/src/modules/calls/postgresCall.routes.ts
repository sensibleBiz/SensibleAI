import { Router } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import {
  createPostgresCall,
  getPostgresCall,
  getPostgresCallReport,
  listPostgresEmployeeCalls,
  listPostgresLeadCalls,
} from "./postgresCall.controller.js";
import {
  postgresCallCreateSchema,
  postgresCallIdParamsSchema,
  postgresCallOutletQuerySchema,
  postgresCallReportQuerySchema,
  postgresEmployeeCallListQuerySchema,
  postgresLeadCallListQuerySchema,
  postgresLeadCallParamsSchema,
} from "./postgresCall.validator.js";

export const postgresCallRouter = Router();

postgresCallRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});
postgresCallRouter.use(requirePostgresAuth);

postgresCallRouter.get(
  "/calls/report",
  validateRequest({ query: postgresCallReportQuerySchema }),
  withRequestDatabaseContext(getPostgresCallReport),
);
postgresCallRouter.get(
  "/calls",
  validateRequest({ query: postgresEmployeeCallListQuerySchema }),
  withRequestDatabaseContext(listPostgresEmployeeCalls),
);
postgresCallRouter.post(
  "/calls",
  validateRequest({ body: postgresCallCreateSchema }),
  withRequestDatabaseContext(createPostgresCall),
);
postgresCallRouter.get(
  "/calls/:callId",
  validateRequest({ params: postgresCallIdParamsSchema, query: postgresCallOutletQuerySchema }),
  withRequestDatabaseContext(getPostgresCall),
);
postgresCallRouter.get(
  "/leads/:leadId/calls",
  validateRequest({ params: postgresLeadCallParamsSchema, query: postgresLeadCallListQuerySchema }),
  withRequestDatabaseContext(listPostgresLeadCalls),
);
