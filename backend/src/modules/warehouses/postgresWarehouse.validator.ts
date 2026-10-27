import { z } from "zod";

const uuid = (name: string) => z.string().uuid(`${name} must be a valid UUID`);
const outletId = uuid("outletId");

export const postgresWarehouseIdParamsSchema = z.object({
  warehouseId: uuid("warehouseId"),
}).strict();

export const postgresWarehouseTransferIdParamsSchema = z.object({
  transferId: uuid("transferId"),
}).strict();

export const postgresCreateWarehouseSchema = z.object({
  outletId,
  name: z.string().trim().min(1, "Warehouse name is required").max(500),
  code: z.string().trim().max(64).default(""),
  address: z.string().trim().max(1000).default(""),
}).strict();

export const postgresUpdateWarehouseSchema = z.object({
  outletId: outletId.optional(),
  name: z.string().trim().min(1).max(500).optional(),
  code: z.string().trim().max(64).optional(),
  address: z.string().trim().max(1000).optional(),
  active: z.boolean().optional(),
}).strict();

export const postgresListWarehouseQuerySchema = z.object({
  outletId: outletId.optional(),
  includeDeleted: z.coerce.boolean().default(false),
}).strict();

export const postgresListStockQuerySchema = z.object({
  outletId: outletId.optional(),
  warehouseId: uuid("warehouseId").optional(),
  productId: uuid("productId").optional(),
}).strict();

export const postgresCreateStockAdjustmentSchema = z.object({
  outletId,
  warehouseId: uuid("warehouseId"),
  adjustmentType: z.enum(["CORRECTION", "COUNT", "DAMAGE", "EXPIRED", "OTHER"]),
  reason: z.string().trim().max(1000).default(""),
  items: z.array(
    z.object({
      productId: uuid("productId"),
      newQuantity: z.coerce.number().min(0, "Quantity cannot be negative"),
    }).strict(),
  ).min(1, "At least one item is required for stock adjustment"),
}).strict();

export const postgresListStockLedgerQuerySchema = z.object({
  outletId: outletId.optional(),
  warehouseId: uuid("warehouseId").optional(),
  productId: uuid("productId").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export const postgresCreateTransferRequestSchema = z.object({
  outletId,
  productId: uuid("productId"),
  fromWarehouseId: uuid("fromWarehouseId"),
  toWarehouseId: uuid("toWarehouseId"),
  requestedQuantity: z.coerce.number().positive("Quantity must be greater than 0"),
  remarks: z.string().trim().max(1000).default(""),
}).strict().refine((data) => data.fromWarehouseId !== data.toWarehouseId, {
  message: "Source and destination warehouses must be different",
});

export const postgresActionTransferRequestSchema = z.object({
  outletId: outletId.optional(),
  action: z.enum(["ACCEPT", "REJECT", "PARTIAL_ACCEPT"]),
  acceptedQuantity: z.coerce.number().positive().optional(),
  rejectionReason: z.string().trim().max(1000).optional(),
  remarks: z.string().trim().max(1000).optional(),
}).strict().refine((data) => {
  if (data.action === "PARTIAL_ACCEPT" && (data.acceptedQuantity === undefined || data.acceptedQuantity <= 0)) {
    return false;
  }
  if (data.action === "REJECT" && !data.rejectionReason?.trim()) {
    return false;
  }
  return true;
}, {
  message: "Invalid action payload: acceptedQuantity required for partial accept, rejectionReason required for rejection",
});

export const postgresListTransferRequestsQuerySchema = z.object({
  outletId: outletId.optional(),
  status: z.enum(["PENDING", "ACCEPTED", "REJECTED", "PARTIALLY_ACCEPTED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
