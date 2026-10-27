import { Router } from "express";
import { validateRequest } from "../../middleware/validateRequest.js";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { createPostgresOutlet, getPostgresOutlet, getPostgresPlanCatalog, listPostgresOutlets,
  savePostgresPlanCatalog, updatePostgresOutlet } from "./postgresOutlet.controller.js";
import { createOutletSchema, outletIdParamsSchema, planCatalogSchema, updateOutletSchema } from "./postgresOutlet.validator.js";

export const postgresOutletRouter = Router();
postgresOutletRouter.use(requirePostgresAuth);
postgresOutletRouter.get("/plans/catalog", withRequestDatabaseContext(getPostgresPlanCatalog));
postgresOutletRouter.put("/plans/catalog", validateRequest({ body: planCatalogSchema }), withRequestDatabaseContext(savePostgresPlanCatalog));
postgresOutletRouter.get("/", withRequestDatabaseContext(listPostgresOutlets));
postgresOutletRouter.post("/", validateRequest({ body: createOutletSchema }), withRequestDatabaseContext(createPostgresOutlet));
postgresOutletRouter.get("/:outletId", validateRequest({ params: outletIdParamsSchema }), withRequestDatabaseContext(getPostgresOutlet));
postgresOutletRouter.patch("/:outletId", validateRequest({ params: outletIdParamsSchema, body: updateOutletSchema }), withRequestDatabaseContext(updatePostgresOutlet));
