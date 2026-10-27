import { Router } from "express";
import { validateRequest } from "../../middleware/validateRequest.js";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import {
  getBusinessConfiguration,
  saveBusinessConfiguration,
} from "./businessConfiguration.controller.js";
import {
  businessConfigurationParamsSchema,
  saveBusinessConfigurationSchema,
} from "./businessConfiguration.validator.js";

export const postgresBusinessConfigurationRouter = Router();
postgresBusinessConfigurationRouter.use(requirePostgresAuth);
postgresBusinessConfigurationRouter.get(
  "/:outletId",
  validateRequest({ params: businessConfigurationParamsSchema }),
  withRequestDatabaseContext(getBusinessConfiguration),
);
postgresBusinessConfigurationRouter.put(
  "/:outletId",
  validateRequest({ params: businessConfigurationParamsSchema, body: saveBusinessConfigurationSchema }),
  withRequestDatabaseContext(saveBusinessConfiguration),
);
