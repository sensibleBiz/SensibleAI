import { Router } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import {
  listPostgresCities,
  listPostgresCountries,
  listPostgresStates,
  listPostgresZones,
} from "./postgresReferenceData.controller.js";
import {
  referenceCityQuerySchema,
  referenceListQuerySchema,
  referenceStateQuerySchema,
} from "./postgresReferenceData.validator.js";

export const postgresReferenceDataRouter = Router();
postgresReferenceDataRouter.use(requirePostgresAuth);
postgresReferenceDataRouter.get("/countries", validateRequest({ query: referenceListQuerySchema }),
  withRequestDatabaseContext(listPostgresCountries));
postgresReferenceDataRouter.get("/states", validateRequest({ query: referenceStateQuerySchema }),
  withRequestDatabaseContext(listPostgresStates));
postgresReferenceDataRouter.get("/cities", validateRequest({ query: referenceCityQuerySchema }),
  withRequestDatabaseContext(listPostgresCities));
postgresReferenceDataRouter.get("/zones", validateRequest({ query: referenceListQuerySchema }),
  withRequestDatabaseContext(listPostgresZones));
