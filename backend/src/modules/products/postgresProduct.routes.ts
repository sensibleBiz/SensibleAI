import { Router } from "express";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import {
  archivePostgresCategory,
  archivePostgresProduct,
  createPostgresCategory,
  createPostgresProduct,
  generatePostgresProductAi,
  analyzePostgresProductImageAi,
  getPostgresProduct,
  listPostgresCategories,
  listPostgresProducts,
  searchPostgresProducts,
  updatePostgresCategory,
  updatePostgresProduct,
} from "./postgresProduct.controller.js";
import {
  postgresCategoryCreateSchema,
  postgresCategoryListQuerySchema,
  postgresCategoryUpdateSchema,
  postgresProductCategoryIdParamsSchema,
  postgresProductCreateSchema,
  postgresProductIdParamsSchema,
  postgresProductListQuerySchema,
  postgresProductSearchQuerySchema,
  postgresProductUpdateSchema,
  postgresProductAiGenerateSchema,
  postgresProductAiImageSchema,
} from "./postgresProduct.validator.js";

export const postgresProductRouter = Router();

postgresProductRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});

postgresProductRouter.use(requirePostgresAuth);

// Product AI endpoints (mounted before /:productId)
postgresProductRouter.post(
  "/ai/generate",
  validateRequest({ body: postgresProductAiGenerateSchema }),
  withRequestDatabaseContext(generatePostgresProductAi),
);
postgresProductRouter.post(
  "/ai/analyze-image",
  validateRequest({ body: postgresProductAiImageSchema }),
  withRequestDatabaseContext(analyzePostgresProductImageAi),
);

// Category endpoints
postgresProductRouter.post(
  "/categories",
  validateRequest({ body: postgresCategoryCreateSchema }),
  withRequestDatabaseContext(createPostgresCategory),
);
postgresProductRouter.get(
  "/categories",
  validateRequest({ query: postgresCategoryListQuerySchema }),
  withRequestDatabaseContext(listPostgresCategories),
);
postgresProductRouter.patch(
  "/categories/:categoryId",
  validateRequest({ params: postgresProductCategoryIdParamsSchema, body: postgresCategoryUpdateSchema }),
  withRequestDatabaseContext(updatePostgresCategory),
);
postgresProductRouter.delete(
  "/categories/:categoryId",
  validateRequest({ params: postgresProductCategoryIdParamsSchema }),
  withRequestDatabaseContext(archivePostgresCategory),
);

// Product endpoints
postgresProductRouter.post(
  "/",
  validateRequest({ body: postgresProductCreateSchema }),
  withRequestDatabaseContext(createPostgresProduct),
);
postgresProductRouter.get(
  "/",
  validateRequest({ query: postgresProductListQuerySchema }),
  withRequestDatabaseContext(listPostgresProducts),
);
postgresProductRouter.get(
  "/search",
  validateRequest({ query: postgresProductSearchQuerySchema }),
  withRequestDatabaseContext(searchPostgresProducts),
);
postgresProductRouter.get(
  "/:productId",
  validateRequest({ params: postgresProductIdParamsSchema }),
  withRequestDatabaseContext(getPostgresProduct),
);
postgresProductRouter.patch(
  "/:productId",
  validateRequest({ params: postgresProductIdParamsSchema, body: postgresProductUpdateSchema }),
  withRequestDatabaseContext(updatePostgresProduct),
);
postgresProductRouter.delete(
  "/:productId",
  validateRequest({ params: postgresProductIdParamsSchema }),
  withRequestDatabaseContext(archivePostgresProduct),
);

