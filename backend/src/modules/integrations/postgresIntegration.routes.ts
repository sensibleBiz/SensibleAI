import { Router } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { createIntegration, deleteFacebookPage, deleteIntegration, listFacebookPages, listIntegrations, updateIntegration } from "./postgresIntegration.controller.js";
import { facebookPageParamsSchema, integrationBodySchema, integrationOutletQuerySchema, integrationParamsSchema, integrationPatchSchema } from "./postgresIntegration.validator.js";

export const postgresIntegrationRouter = Router();
postgresIntegrationRouter.use(requirePostgresAuth);
postgresIntegrationRouter.get("/",validateRequest({query:integrationOutletQuerySchema}),withRequestDatabaseContext(listIntegrations));
postgresIntegrationRouter.post("/",validateRequest({body:integrationBodySchema}),withRequestDatabaseContext(createIntegration));
postgresIntegrationRouter.patch("/:integrationId",validateRequest({params:integrationParamsSchema,body:integrationPatchSchema}),withRequestDatabaseContext(updateIntegration));
postgresIntegrationRouter.delete("/:integrationId",validateRequest({params:integrationParamsSchema,query:integrationOutletQuerySchema}),withRequestDatabaseContext(deleteIntegration));
postgresIntegrationRouter.get("/facebook/pages",validateRequest({query:integrationOutletQuerySchema}),withRequestDatabaseContext(listFacebookPages));
postgresIntegrationRouter.delete("/facebook/pages/:pageId",validateRequest({params:facebookPageParamsSchema,query:integrationOutletQuerySchema}),withRequestDatabaseContext(deleteFacebookPage));
