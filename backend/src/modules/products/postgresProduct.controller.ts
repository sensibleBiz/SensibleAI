import type { Response } from "express";
import type { RequestWithDatabaseContext } from "../../middleware/postgresAuth.js";
import { postgresProductService } from "./postgresProduct.service.js";
import type {
  PostgresCreateCategoryInput,
  PostgresCreateProductInput,
  PostgresProductListQuery,
  PostgresUpdateCategoryInput,
  PostgresUpdateProductInput,
} from "./product.types.js";

export const createPostgresProduct = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const result = await postgresProductService.create(
    request.database,
    request.tenantId,
    request.userId,
    request.body as PostgresCreateProductInput,
  );
  response.status(201).json({ success: true, data: result });
};

export const getPostgresProduct = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const { productId } = request.params as { productId: string };
  const outletId = typeof request.query.outletId === "string" ? request.query.outletId : undefined;
  const result = await postgresProductService.get(
    request.database,
    request.tenantId,
    request.userId,
    productId,
    outletId,
  );
  response.json({ success: true, data: result });
};

export const listPostgresProducts = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const result = await postgresProductService.list(
    request.database,
    request.tenantId,
    request.userId,
    request.query as unknown as PostgresProductListQuery,
  );
  response.json({ success: true, data: result });
};

export const searchPostgresProducts = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const queryText = (request.query.query as string) || "";
  const outletId = typeof request.query.outletId === "string" ? request.query.outletId : undefined;
  const limit = request.query.limit ? Number(request.query.limit) : 20;
  const result = await postgresProductService.search(
    request.database,
    request.tenantId,
    request.userId,
    queryText,
    outletId,
    limit,
  );
  response.json({ success: true, data: result });
};

export const updatePostgresProduct = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const { productId } = request.params as { productId: string };
  const result = await postgresProductService.update(
    request.database,
    request.tenantId,
    request.userId,
    productId,
    request.body as PostgresUpdateProductInput,
  );
  response.json({ success: true, data: result });
};

export const archivePostgresProduct = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const { productId } = request.params as { productId: string };
  const outletId = typeof request.query.outletId === "string" ? request.query.outletId : undefined;
  const result = await postgresProductService.archive(
    request.database,
    request.tenantId,
    request.userId,
    productId,
    outletId,
  );
  response.json({ success: true, data: result });
};

// Categories
export const createPostgresCategory = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const result = await postgresProductService.createCategory(
    request.database,
    request.tenantId,
    request.userId,
    request.body as PostgresCreateCategoryInput,
  );
  response.status(201).json({ success: true, data: result });
};

export const listPostgresCategories = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const outletId = typeof request.query.outletId === "string" ? request.query.outletId : undefined;
  const includeDeleted = request.query.includeDeleted === "true";
  const result = await postgresProductService.listCategories(
    request.database,
    request.tenantId,
    request.userId,
    outletId,
    includeDeleted,
  );
  response.json({ success: true, data: result });
};

export const updatePostgresCategory = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const { categoryId } = request.params as { categoryId: string };
  const result = await postgresProductService.updateCategory(
    request.database,
    request.tenantId,
    request.userId,
    categoryId,
    request.body as PostgresUpdateCategoryInput,
  );
  response.json({ success: true, data: result });
};

export const archivePostgresCategory = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const { categoryId } = request.params as { categoryId: string };
  const outletId = typeof request.query.outletId === "string" ? request.query.outletId : undefined;
  const result = await postgresProductService.archiveCategory(
    request.database,
    request.tenantId,
    request.userId,
    categoryId,
    outletId,
  );
  response.json({ success: true, data: result });
};

export const generatePostgresProductAi = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const { productAiService } = await import("./productAi.service.js");
  const result = await productAiService.generateProduct(request.body);
  response.json({ success: true, data: result });
};

export const analyzePostgresProductImageAi = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const { productAiService } = await import("./productAi.service.js");
  const result = await productAiService.analyzeProductImage(request.body);
  response.json({ success: true, data: result });
};


