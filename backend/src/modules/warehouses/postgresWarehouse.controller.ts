import type { Response } from "express";
import type { RequestWithDatabaseContext } from "../../middleware/postgresAuth.js";
import { postgresWarehouseService } from "./postgresWarehouse.service.js";
import type {
  PostgresActionTransferRequestInput,
  PostgresCreateStockAdjustmentInput,
  PostgresCreateTransferRequestInput,
  PostgresCreateWarehouseInput,
  PostgresUpdateWarehouseInput,
  PostgresWarehouseTransferStatus,
} from "./warehouse.types.js";

// Warehouses
export const createPostgresWarehouse = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const result = await postgresWarehouseService.createWarehouse(
    request.database,
    request.tenantId,
    request.userId,
    request.body as PostgresCreateWarehouseInput,
  );
  response.status(201).json({ success: true, data: result });
};

export const getPostgresWarehouse = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const { warehouseId } = request.params as { warehouseId: string };
  const outletId = typeof request.query.outletId === "string" ? request.query.outletId : undefined;
  const result = await postgresWarehouseService.getWarehouse(
    request.database,
    request.tenantId,
    request.userId,
    warehouseId,
    outletId,
  );
  response.json({ success: true, data: result });
};

export const listPostgresWarehouses = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const outletId = typeof request.query.outletId === "string" ? request.query.outletId : undefined;
  const includeDeleted = request.query.includeDeleted === "true";
  const result = await postgresWarehouseService.listWarehouses(
    request.database,
    request.tenantId,
    request.userId,
    outletId,
    includeDeleted,
  );
  response.json({ success: true, data: result });
};

export const updatePostgresWarehouse = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const { warehouseId } = request.params as { warehouseId: string };
  const result = await postgresWarehouseService.updateWarehouse(
    request.database,
    request.tenantId,
    request.userId,
    warehouseId,
    request.body as PostgresUpdateWarehouseInput,
  );
  response.json({ success: true, data: result });
};

export const archivePostgresWarehouse = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const { warehouseId } = request.params as { warehouseId: string };
  const outletId = typeof request.query.outletId === "string" ? request.query.outletId : undefined;
  const result = await postgresWarehouseService.archiveWarehouse(
    request.database,
    request.tenantId,
    request.userId,
    warehouseId,
    outletId,
  );
  response.json({ success: true, data: result });
};

// Stock & Inventory
export const listPostgresStock = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const outletId = typeof request.query.outletId === "string" ? request.query.outletId : undefined;
  const warehouseId = typeof request.query.warehouseId === "string" ? request.query.warehouseId : undefined;
  const productId = typeof request.query.productId === "string" ? request.query.productId : undefined;
  const result = await postgresWarehouseService.listStock(
    request.database,
    request.tenantId,
    request.userId,
    {
      ...(outletId ? { outletId } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(productId ? { productId } : {}),
    },
  );
  response.json({ success: true, data: result });
};

export const listPostgresStockLedger = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const outletId = typeof request.query.outletId === "string" ? request.query.outletId : undefined;
  const warehouseId = typeof request.query.warehouseId === "string" ? request.query.warehouseId : undefined;
  const productId = typeof request.query.productId === "string" ? request.query.productId : undefined;
  const limit = request.query.limit ? Number(request.query.limit) : 50;
  const result = await postgresWarehouseService.listStockLedger(
    request.database,
    request.tenantId,
    request.userId,
    {
      ...(outletId ? { outletId } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(productId ? { productId } : {}),
      limit,
    },
  );
  response.json({ success: true, data: result });
};

export const createPostgresStockAdjustment = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const result = await postgresWarehouseService.adjustStock(
    request.database,
    request.tenantId,
    request.userId,
    request.body as PostgresCreateStockAdjustmentInput,
  );
  response.status(201).json({ success: true, data: result });
};

// Transfers
export const createPostgresTransferRequest = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const result = await postgresWarehouseService.createTransferRequest(
    request.database,
    request.tenantId,
    request.userId,
    request.body as PostgresCreateTransferRequestInput,
  );
  response.status(201).json({ success: true, data: result });
};

export const getPostgresTransferRequest = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const { transferId } = request.params as { transferId: string };
  const outletId = typeof request.query.outletId === "string" ? request.query.outletId : undefined;
  const result = await postgresWarehouseService.getTransferRequest(
    request.database,
    request.tenantId,
    request.userId,
    transferId,
    outletId,
  );
  response.json({ success: true, data: result });
};

export const listPostgresTransferRequests = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const outletId = typeof request.query.outletId === "string" ? request.query.outletId : undefined;
  const status = typeof request.query.status === "string"
    ? (request.query.status as PostgresWarehouseTransferStatus)
    : undefined;
  const limit = request.query.limit ? Number(request.query.limit) : 50;
  const result = await postgresWarehouseService.listTransferRequests(
    request.database,
    request.tenantId,
    request.userId,
    {
      ...(outletId ? { outletId } : {}),
      ...(status ? { status } : {}),
      limit,
    },
  );
  response.json({ success: true, data: result });
};

export const actionPostgresTransferRequest = async (
  request: RequestWithDatabaseContext,
  response: Response,
) => {
  const { transferId } = request.params as { transferId: string };
  const result = await postgresWarehouseService.actionTransferRequest(
    request.database,
    request.tenantId,
    request.userId,
    transferId,
    request.body as PostgresActionTransferRequestInput,
  );
  response.json({ success: true, data: result });
};
