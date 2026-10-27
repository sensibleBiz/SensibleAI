import { Router } from "express";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import {
  actionPostgresTransferRequest,
  archivePostgresWarehouse,
  createPostgresStockAdjustment,
  createPostgresTransferRequest,
  createPostgresWarehouse,
  getPostgresTransferRequest,
  getPostgresWarehouse,
  listPostgresStock,
  listPostgresStockLedger,
  listPostgresTransferRequests,
  listPostgresWarehouses,
  updatePostgresWarehouse,
} from "./postgresWarehouse.controller.js";
import {
  postgresActionTransferRequestSchema,
  postgresCreateStockAdjustmentSchema,
  postgresCreateTransferRequestSchema,
  postgresCreateWarehouseSchema,
  postgresListStockLedgerQuerySchema,
  postgresListStockQuerySchema,
  postgresListTransferRequestsQuerySchema,
  postgresListWarehouseQuerySchema,
  postgresUpdateWarehouseSchema,
  postgresWarehouseIdParamsSchema,
  postgresWarehouseTransferIdParamsSchema,
} from "./postgresWarehouse.validator.js";

export const postgresWarehouseRouter = Router();

postgresWarehouseRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});

postgresWarehouseRouter.use(requirePostgresAuth);

// Warehouse CRUD endpoints
postgresWarehouseRouter.post(
  "/",
  validateRequest({ body: postgresCreateWarehouseSchema }),
  withRequestDatabaseContext(createPostgresWarehouse),
);

postgresWarehouseRouter.get(
  "/",
  validateRequest({ query: postgresListWarehouseQuerySchema }),
  withRequestDatabaseContext(listPostgresWarehouses),
);

postgresWarehouseRouter.get(
  "/:warehouseId",
  validateRequest({ params: postgresWarehouseIdParamsSchema }),
  withRequestDatabaseContext(getPostgresWarehouse),
);

postgresWarehouseRouter.patch(
  "/:warehouseId",
  validateRequest({ params: postgresWarehouseIdParamsSchema, body: postgresUpdateWarehouseSchema }),
  withRequestDatabaseContext(updatePostgresWarehouse),
);

postgresWarehouseRouter.delete(
  "/:warehouseId",
  validateRequest({ params: postgresWarehouseIdParamsSchema }),
  withRequestDatabaseContext(archivePostgresWarehouse),
);

export const postgresInventoryRouter = Router();

postgresInventoryRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});

postgresInventoryRouter.use(requirePostgresAuth);

// Stock & Ledger
postgresInventoryRouter.get(
  "/stock",
  validateRequest({ query: postgresListStockQuerySchema }),
  withRequestDatabaseContext(listPostgresStock),
);

postgresInventoryRouter.get(
  "/ledger",
  validateRequest({ query: postgresListStockLedgerQuerySchema }),
  withRequestDatabaseContext(listPostgresStockLedger),
);

postgresInventoryRouter.post(
  "/adjustments",
  validateRequest({ body: postgresCreateStockAdjustmentSchema }),
  withRequestDatabaseContext(createPostgresStockAdjustment),
);

// Transfers
postgresInventoryRouter.post(
  "/transfers",
  validateRequest({ body: postgresCreateTransferRequestSchema }),
  withRequestDatabaseContext(createPostgresTransferRequest),
);

postgresInventoryRouter.get(
  "/transfers",
  validateRequest({ query: postgresListTransferRequestsQuerySchema }),
  withRequestDatabaseContext(listPostgresTransferRequests),
);

postgresInventoryRouter.get(
  "/transfers/:transferId",
  validateRequest({ params: postgresWarehouseTransferIdParamsSchema }),
  withRequestDatabaseContext(getPostgresTransferRequest),
);

postgresInventoryRouter.post(
  "/transfers/:transferId/action",
  validateRequest({
    params: postgresWarehouseTransferIdParamsSchema,
    body: postgresActionTransferRequestSchema,
  }),
  withRequestDatabaseContext(actionPostgresTransferRequest),
);

