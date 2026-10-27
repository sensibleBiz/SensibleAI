import { Router } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import {
  generatePostgresPayroll,
  getPostgresPayrollEmployeeData,
  getPostgresPayrollOverview,
  getPostgresPayrollRules,
  previewPostgresPayroll,
  savePostgresSalaryStructure,
} from "./postgresPayroll.controller.js";
import {
  postgresPayrollEmployeeQuerySchema,
  postgresPayrollGenerateBodySchema,
  postgresPayrollOverviewQuerySchema,
  postgresPayrollPreviewBodySchema,
  postgresPayrollRulesQuerySchema,
  postgresSalaryStructureBodySchema,
} from "./postgresPayroll.validator.js";

export const postgresPayrollRouter = Router();

postgresPayrollRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});
postgresPayrollRouter.use(requirePostgresAuth);

postgresPayrollRouter.get(
  "/employee",
  validateRequest({ query: postgresPayrollEmployeeQuerySchema }),
  withRequestDatabaseContext(getPostgresPayrollEmployeeData),
);
postgresPayrollRouter.get(
  "/overview",
  validateRequest({ query: postgresPayrollOverviewQuerySchema }),
  withRequestDatabaseContext(getPostgresPayrollOverview),
);
postgresPayrollRouter.get(
  "/statutory-rules",
  validateRequest({ query: postgresPayrollRulesQuerySchema }),
  getPostgresPayrollRules,
);
postgresPayrollRouter.post(
  "/preview",
  validateRequest({ body: postgresPayrollPreviewBodySchema }),
  withRequestDatabaseContext(previewPostgresPayroll),
);
postgresPayrollRouter.patch(
  "/salary-structure",
  validateRequest({ body: postgresSalaryStructureBodySchema }),
  withRequestDatabaseContext(savePostgresSalaryStructure),
);
postgresPayrollRouter.post(
  "/runs",
  validateRequest({ body: postgresPayrollGenerateBodySchema }),
  withRequestDatabaseContext(generatePostgresPayroll),
);
