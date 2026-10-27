import { v7 as uuidv7 } from "uuid";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import {
  PostgresAuthorizationRepository,
  postgresAuthorizationRepository,
} from "../authorization/postgresAuthorization.repository.js";
import {
  PostgresProductRepository,
  postgresProductRepository,
} from "../products/postgresProduct.repository.js";
import type {
  PostgresActionTransferRequestInput,
  PostgresCreateStockAdjustmentInput,
  PostgresCreateTransferRequestInput,
  PostgresCreateWarehouseInput,
  PostgresStockLedgerEntry,
  PostgresUpdateWarehouseInput,
  PostgresWarehouse,
  PostgresWarehouseStock,
  PostgresWarehouseTransfer,
  PostgresWarehouseTransferStatus,
} from "./warehouse.types.js";
import {
  PostgresWarehouseRepository,
  postgresWarehouseRepository,
} from "./postgresWarehouse.repository.js";

export class PostgresWarehouseService {
  constructor(
    private readonly repository: PostgresWarehouseRepository = postgresWarehouseRepository,
    private readonly productRepository: PostgresProductRepository = postgresProductRepository,
    private readonly authorization: PostgresAuthorizationRepository = postgresAuthorizationRepository,
  ) {}

  private async requirePermission(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string | undefined,
    permission: string,
  ) {
    if (outletId) {
      const hasPerm = await this.authorization.hasOutletPermission(
        database,
        userId,
        tenantId,
        outletId,
        permission,
      );
      if (!hasPerm) {
        throw new AppError(403, `Permission denied for ${permission}`, "PERMISSION_DENIED");
      }
    } else {
      const access = await this.authorization.getCurrentAccess(database, userId, tenantId);
      if (!access.tenant.isTenantAdmin && !access.outlets.some((o) => o.permissions.includes(permission))) {
        throw new AppError(403, `Permission denied for ${permission}`, "PERMISSION_DENIED");
      }
    }
  }

  private async resolveBusinessId(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
  ): Promise<string> {
    const result = await database.client.query<{ business_id: string }>(`
      SELECT business_id FROM tenancy.outlets
      WHERE tenant_id = $1 AND id = $2 AND active
    `, [tenantId, outletId]);
    if (!result.rows[0]) {
      throw new AppError(403, "PostgreSQL outlet access denied", "POSTGRES_OUTLET_ACCESS_DENIED");
    }
    return result.rows[0].business_id;
  }

  // Warehouses
  async createWarehouse(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: PostgresCreateWarehouseInput,
  ): Promise<PostgresWarehouse> {
    await this.requirePermission(database, tenantId, userId, input.outletId, "warehouses.create");
    const businessId = await this.resolveBusinessId(database, tenantId, input.outletId);
    const id = uuidv7();
    return this.repository.createWarehouse(database, {
      id,
      tenantId,
      businessId,
      input,
      userId,
    });
  }

  async getWarehouse(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    warehouseId: string,
    outletId?: string,
  ): Promise<PostgresWarehouse> {
    await this.requirePermission(database, tenantId, userId, outletId, "warehouses.read");
    const warehouse = await this.repository.getWarehouse(database, tenantId, warehouseId, outletId);
    if (!warehouse) {
      throw new AppError(404, "Warehouse not found", "WAREHOUSE_NOT_FOUND");
    }
    return warehouse;
  }

  async listWarehouses(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId?: string,
    includeDeleted = false,
  ): Promise<PostgresWarehouse[]> {
    await this.requirePermission(database, tenantId, userId, outletId, "warehouses.read");
    return this.repository.listWarehouses(database, tenantId, outletId, includeDeleted);
  }

  async updateWarehouse(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    warehouseId: string,
    input: PostgresUpdateWarehouseInput,
  ): Promise<PostgresWarehouse> {
    await this.requirePermission(database, tenantId, userId, input.outletId, "warehouses.update");
    const existing = await this.repository.getWarehouse(database, tenantId, warehouseId, input.outletId);
    if (!existing) {
      throw new AppError(404, "Warehouse not found", "WAREHOUSE_NOT_FOUND");
    }
    const updated = await this.repository.updateWarehouse(database, tenantId, warehouseId, input, userId);
    if (!updated) {
      throw new AppError(404, "Warehouse not found", "WAREHOUSE_NOT_FOUND");
    }
    return updated;
  }

  async archiveWarehouse(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    warehouseId: string,
    outletId?: string,
  ): Promise<{ archived: boolean }> {
    await this.requirePermission(database, tenantId, userId, outletId, "warehouses.archive");
    const existing = await this.repository.getWarehouse(database, tenantId, warehouseId, outletId);
    if (!existing) {
      throw new AppError(404, "Warehouse not found", "WAREHOUSE_NOT_FOUND");
    }
    const success = await this.repository.softDeleteWarehouse(database, tenantId, warehouseId, userId);
    return { archived: success };
  }

  // Stock & Inventory
  async listStock(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    options: { outletId?: string; warehouseId?: string; productId?: string },
  ): Promise<PostgresWarehouseStock[]> {
    await this.requirePermission(database, tenantId, userId, options.outletId, "inventory.read");
    return this.repository.listStock(database, tenantId, options);
  }

  async listStockLedger(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    options: { outletId?: string; warehouseId?: string; productId?: string; limit?: number },
  ): Promise<PostgresStockLedgerEntry[]> {
    await this.requirePermission(database, tenantId, userId, options.outletId, "inventory.read");
    return this.repository.listStockLedger(database, tenantId, options);
  }

  async adjustStock(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: PostgresCreateStockAdjustmentInput,
  ): Promise<{ adjustmentId: string; itemsCount: number }> {
    await this.requirePermission(database, tenantId, userId, input.outletId, "inventory.adjust");
    const warehouse = await this.repository.getWarehouse(database, tenantId, input.warehouseId, input.outletId);
    if (!warehouse) {
      throw new AppError(404, "Warehouse not found for this outlet", "WAREHOUSE_NOT_FOUND");
    }
    const businessId = warehouse.businessId;

    const adjustmentId = uuidv7();
    await this.repository.createStockAdjustment(database, {
      id: adjustmentId,
      tenantId,
      businessId,
      outletId: input.outletId,
      warehouseId: input.warehouseId,
      adjustmentType: input.adjustmentType,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      userId,
    });

    for (const item of input.items) {
      const product = await this.productRepository.getProduct(database, tenantId, item.productId);
      if (!product) {
        throw new AppError(404, `Product ${item.productId} not found`, "PRODUCT_NOT_FOUND");
      }

      // Lock current stock row
      const previousQuantity = await this.repository.lockStock(
        database,
        tenantId,
        input.warehouseId,
        item.productId,
      );

      const difference = item.newQuantity - previousQuantity;
      await this.repository.setStockQuantity(database, {
        tenantId,
        warehouseId: input.warehouseId,
        productId: item.productId,
        quantity: item.newQuantity,
      });

      // Log adjustment item
      const adjustmentItemId = uuidv7();
      await this.repository.createStockAdjustmentItem(database, {
        id: adjustmentItemId,
        tenantId,
        adjustmentId,
        productId: item.productId,
        previousQuantity,
        newQuantity: item.newQuantity,
        differenceQuantity: difference,
      });

      // Log stock ledger entry
      const ledgerId = uuidv7();
      await this.repository.createLedgerEntry(database, {
        id: ledgerId,
        tenantId,
        businessId,
        outletId: input.outletId,
        warehouseId: input.warehouseId,
        productId: item.productId,
        movementType: "ADJUSTMENT",
        quantity: difference,
        balanceAfter: item.newQuantity,
        referenceId: adjustmentId,
        remarks: `Stock adjustment (${input.adjustmentType}): ${input.reason ?? ""}`.trim(),
        userId,
      });
    }

    return { adjustmentId, itemsCount: input.items.length };
  }

  // Transfers
  async createTransferRequest(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: PostgresCreateTransferRequestInput,
  ): Promise<PostgresWarehouseTransfer> {
    await this.requirePermission(database, tenantId, userId, input.outletId, "inventory.transfer");
    const fromWh = await this.repository.getWarehouse(database, tenantId, input.fromWarehouseId);
    if (!fromWh) {
      throw new AppError(404, "Source warehouse not found", "SOURCE_WAREHOUSE_NOT_FOUND");
    }
    const toWh = await this.repository.getWarehouse(database, tenantId, input.toWarehouseId);
    if (!toWh) {
      throw new AppError(404, "Destination warehouse not found", "DESTINATION_WAREHOUSE_NOT_FOUND");
    }
    const product = await this.productRepository.getProduct(database, tenantId, input.productId);
    if (!product) {
      throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }

    const id = uuidv7();
    return this.repository.createTransferRequest(database, {
      id,
      tenantId,
      businessId: fromWh.businessId,
      outletId: input.outletId,
      productId: input.productId,
      fromWarehouseId: input.fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      requestedQuantity: input.requestedQuantity,
      ...(input.remarks === undefined ? {} : { remarks: input.remarks }),
      userId,
    });
  }

  async getTransferRequest(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    transferId: string,
    outletId?: string,
  ): Promise<PostgresWarehouseTransfer> {
    await this.requirePermission(database, tenantId, userId, outletId, "inventory.transfer");
    const transfer = await this.repository.getTransferRequest(database, tenantId, transferId, outletId);
    if (!transfer) {
      throw new AppError(404, "Transfer request not found", "TRANSFER_NOT_FOUND");
    }
    return transfer;
  }

  async listTransferRequests(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    options: { outletId?: string; status?: PostgresWarehouseTransferStatus; limit?: number },
  ): Promise<PostgresWarehouseTransfer[]> {
    await this.requirePermission(database, tenantId, userId, options.outletId, "inventory.transfer");
    return this.repository.listTransferRequests(database, tenantId, options);
  }

  async actionTransferRequest(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    transferId: string,
    input: PostgresActionTransferRequestInput,
  ): Promise<PostgresWarehouseTransfer> {
    await this.requirePermission(database, tenantId, userId, input.outletId, "inventory.transfer");
    const transfer = await this.repository.getTransferRequest(database, tenantId, transferId, input.outletId);
    if (!transfer) {
      throw new AppError(404, "Transfer request not found", "TRANSFER_NOT_FOUND");
    }
    if (transfer.status !== "PENDING") {
      throw new AppError(400, `Transfer request has already been ${transfer.status.toLowerCase()}`, "TRANSFER_ALREADY_ACTIONED");
    }

    const now = new Date();

    if (input.action === "REJECT") {
      const updated = await this.repository.updateTransferStatus(database, {
        tenantId,
        transferId,
        status: "REJECTED",
        acceptedQuantity: 0,
        rejectedQuantity: transfer.requestedQuantity,
        actionTakenByUserId: userId,
        actionDate: now,
        ...(input.remarks === undefined ? {} : { remarks: input.remarks }),
        ...(input.rejectionReason === undefined ? {} : { rejectionReason: input.rejectionReason }),
      });
      if (!updated) throw new AppError(500, "Failed to update transfer status", "TRANSFER_UPDATE_FAILED");
      return updated;
    }

    // ACCEPT or PARTIAL_ACCEPT
    const quantityToTransfer = input.action === "ACCEPT" ? transfer.requestedQuantity : (input.acceptedQuantity ?? 0);
    const rejectedQuantity = input.action === "ACCEPT" ? 0 : transfer.requestedQuantity - quantityToTransfer;
    const finalStatus: PostgresWarehouseTransferStatus = input.action === "ACCEPT" ? "ACCEPTED" : "PARTIALLY_ACCEPTED";

    if (quantityToTransfer <= 0) {
      throw new AppError(400, "Quantity to transfer must be greater than 0", "INVALID_QUANTITY");
    }

    // Lock and check source warehouse stock
    const sourceCurrentStock = await this.repository.lockStock(
      database,
      tenantId,
      transfer.fromWarehouseId,
      transfer.productId,
    );

    if (sourceCurrentStock < quantityToTransfer) {
      throw new AppError(
        400,
        `Insufficient stock in source warehouse (available: ${sourceCurrentStock}, required: ${quantityToTransfer})`,
        "INSUFFICIENT_STOCK",
      );
    }

    // Deduct from source warehouse
    const newSourceStock = sourceCurrentStock - quantityToTransfer;
    await this.repository.setStockQuantity(database, {
      tenantId,
      warehouseId: transfer.fromWarehouseId,
      productId: transfer.productId,
      quantity: newSourceStock,
    });

    // Add to destination warehouse
    const destCurrentStock = await this.repository.lockStock(
      database,
      tenantId,
      transfer.toWarehouseId,
      transfer.productId,
    );
    const newDestStock = destCurrentStock + quantityToTransfer;
    await this.repository.setStockQuantity(database, {
      tenantId,
      warehouseId: transfer.toWarehouseId,
      productId: transfer.productId,
      quantity: newDestStock,
    });

    // Create Ledger entries
    // 1. Source: TRANSFER_OUT
    const outLedgerId = uuidv7();
    await this.repository.createLedgerEntry(database, {
      id: outLedgerId,
      tenantId,
      businessId: transfer.businessId,
      outletId: transfer.outletId,
      warehouseId: transfer.fromWarehouseId,
      productId: transfer.productId,
      movementType: "TRANSFER_OUT",
      quantity: -quantityToTransfer,
      balanceAfter: newSourceStock,
      referenceId: transfer.id,
      remarks: `Transfer to ${transfer.toWarehouseName || transfer.toWarehouseId}: ${input.remarks ?? ""}`.trim(),
      userId,
    });

    // 2. Dest: TRANSFER_IN
    const inLedgerId = uuidv7();
    await this.repository.createLedgerEntry(database, {
      id: inLedgerId,
      tenantId,
      businessId: transfer.businessId,
      outletId: transfer.outletId,
      warehouseId: transfer.toWarehouseId,
      productId: transfer.productId,
      movementType: "TRANSFER_IN",
      quantity: quantityToTransfer,
      balanceAfter: newDestStock,
      referenceId: transfer.id,
      remarks: `Transfer from ${transfer.fromWarehouseName || transfer.fromWarehouseId}: ${input.remarks ?? ""}`.trim(),
      userId,
    });

    // Update Transfer record
    const updated = await this.repository.updateTransferStatus(database, {
      tenantId,
      transferId,
      status: finalStatus,
      acceptedQuantity: quantityToTransfer,
      rejectedQuantity,
      actionTakenByUserId: userId,
      actionDate: now,
      ...(input.remarks === undefined ? {} : { remarks: input.remarks }),
      ...(input.rejectionReason === undefined ? {} : { rejectionReason: input.rejectionReason }),
    });
    if (!updated) throw new AppError(500, "Failed to update transfer status", "TRANSFER_UPDATE_FAILED");
    return updated;
  }
}

export const postgresWarehouseService = new PostgresWarehouseService();
