import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import type {
  PostgresCreateWarehouseInput,
  PostgresStockAdjustmentType,
  PostgresStockLedgerEntry,
  PostgresStockMovementType,
  PostgresUpdateWarehouseInput,
  PostgresWarehouse,
  PostgresWarehouseStock,
  PostgresWarehouseTransfer,
  PostgresWarehouseTransferStatus,
} from "./warehouse.types.js";

interface WarehouseRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  business_id: string;
  outlet_id: string;
  name: string;
  code: string;
  address: string;
  active: boolean;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}

interface StockRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  warehouse_id: string;
  warehouse_name?: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  quantity: string;
  reorder_level: string;
  created_at: Date;
  updated_at: Date;
}

interface LedgerRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  business_id: string;
  outlet_id: string;
  warehouse_id: string;
  warehouse_name?: string;
  product_id: string;
  product_name?: string;
  movement_type: PostgresStockMovementType;
  quantity: string;
  balance_after: string;
  reference_id: string | null;
  remarks: string;
  created_by_user_id: string;
  created_at: Date;
}

interface TransferRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  business_id: string;
  outlet_id: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  from_warehouse_id: string;
  from_warehouse_name?: string;
  to_warehouse_id: string;
  to_warehouse_name?: string;
  requested_quantity: string;
  accepted_quantity: string | null;
  rejected_quantity: string | null;
  status: PostgresWarehouseTransferStatus;
  requested_by_user_id: string;
  requested_by_name?: string;
  action_taken_by_user_id: string | null;
  action_taken_by_name?: string | null;
  request_date: Date;
  action_date: Date | null;
  remarks: string;
  rejection_reason: string;
  created_at: Date;
  updated_at: Date;
}

const mapWarehouse = (row: WarehouseRow): PostgresWarehouse => ({
  id: row.id,
  tenantId: row.tenant_id,
  businessId: row.business_id,
  outletId: row.outlet_id,
  name: row.name,
  code: row.code,
  address: row.address,
  active: row.active,
  isDeleted: row.is_deleted,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapStock = (row: StockRow): PostgresWarehouseStock => ({
  id: row.id,
  tenantId: row.tenant_id,
  warehouseId: row.warehouse_id,
  warehouseName: row.warehouse_name,
  productId: row.product_id,
  productName: row.product_name,
  productSku: row.product_sku,
  quantity: Number(row.quantity),
  reorderLevel: Number(row.reorder_level),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapLedger = (row: LedgerRow): PostgresStockLedgerEntry => ({
  id: row.id,
  tenantId: row.tenant_id,
  businessId: row.business_id,
  outletId: row.outlet_id,
  warehouseId: row.warehouse_id,
  warehouseName: row.warehouse_name,
  productId: row.product_id,
  productName: row.product_name,
  movementType: row.movement_type,
  quantity: Number(row.quantity),
  balanceAfter: Number(row.balance_after),
  referenceId: row.reference_id,
  remarks: row.remarks,
  createdByUserId: row.created_by_user_id,
  createdAt: row.created_at,
});

const mapTransfer = (row: TransferRow): PostgresWarehouseTransfer => ({
  id: row.id,
  tenantId: row.tenant_id,
  businessId: row.business_id,
  outletId: row.outlet_id,
  productId: row.product_id,
  productName: row.product_name,
  productSku: row.product_sku,
  fromWarehouseId: row.from_warehouse_id,
  fromWarehouseName: row.from_warehouse_name,
  toWarehouseId: row.to_warehouse_id,
  toWarehouseName: row.to_warehouse_name,
  requestedQuantity: Number(row.requested_quantity),
  acceptedQuantity: row.accepted_quantity !== null ? Number(row.accepted_quantity) : null,
  rejectedQuantity: row.rejected_quantity !== null ? Number(row.rejected_quantity) : null,
  status: row.status,
  requestedByUserId: row.requested_by_user_id,
  requestedByName: row.requested_by_name,
  actionTakenByUserId: row.action_taken_by_user_id,
  actionTakenByName: row.action_taken_by_name ?? undefined,
  requestDate: row.request_date,
  actionDate: row.action_date,
  remarks: row.remarks,
  rejectionReason: row.rejection_reason,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class PostgresWarehouseRepository {
  // Warehouses
  async createWarehouse(
    database: TransactionDatabase,
    params: {
      id: string;
      tenantId: string;
      businessId: string;
      input: PostgresCreateWarehouseInput;
      userId: string;
    },
  ): Promise<PostgresWarehouse> {
    const { id, tenantId, businessId, input, userId } = params;
    const result = await database.client.query<WarehouseRow>(`
      INSERT INTO crm.warehouses (
        id, tenant_id, business_id, outlet_id, name, code, address,
        created_by_user_id, updated_by_user_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $8
      )
      RETURNING *
    `, [
      id,
      tenantId,
      businessId,
      input.outletId,
      input.name,
      input.code ?? "",
      input.address ?? "",
      userId,
    ]);
    const row = result.rows[0];
    if (!row) throw new Error("Warehouse insert did not return a row");
    return mapWarehouse(row);
  }

  async getWarehouse(
    database: TransactionDatabase,
    tenantId: string,
    warehouseId: string,
    outletId?: string,
  ): Promise<PostgresWarehouse | null> {
    let query = `SELECT * FROM crm.warehouses WHERE tenant_id = $1 AND id = $2`;
    const params: unknown[] = [tenantId, warehouseId];
    if (outletId) {
      params.push(outletId);
      query += ` AND outlet_id = $3`;
    }
    const result = await database.client.query<WarehouseRow>(query, params);
    if (!result.rows[0]) return null;
    return mapWarehouse(result.rows[0]);
  }

  async listWarehouses(
    database: TransactionDatabase,
    tenantId: string,
    outletId?: string,
    includeDeleted = false,
  ): Promise<PostgresWarehouse[]> {
    const params: unknown[] = [tenantId];
    let query = `SELECT * FROM crm.warehouses WHERE tenant_id = $1`;
    if (!includeDeleted) {
      query += ` AND NOT is_deleted`;
    }
    if (outletId) {
      params.push(outletId);
      query += ` AND outlet_id = $${params.length}`;
    }
    query += ` ORDER BY name ASC`;
    const result = await database.client.query<WarehouseRow>(query, params);
    return result.rows.map(mapWarehouse);
  }

  async updateWarehouse(
    database: TransactionDatabase,
    tenantId: string,
    warehouseId: string,
    input: PostgresUpdateWarehouseInput,
    userId: string,
  ): Promise<PostgresWarehouse | null> {
    const setClauses: string[] = ["updated_by_user_id = $2"];
    const params: unknown[] = [warehouseId, userId, tenantId];

    if (input.name !== undefined) {
      params.push(input.name);
      setClauses.push(`name = $${params.length}`);
    }
    if (input.code !== undefined) {
      params.push(input.code);
      setClauses.push(`code = $${params.length}`);
    }
    if (input.address !== undefined) {
      params.push(input.address);
      setClauses.push(`address = $${params.length}`);
    }
    if (input.active !== undefined) {
      params.push(input.active);
      setClauses.push(`active = $${params.length}`);
    }

    const sql = `
      UPDATE crm.warehouses
      SET ${setClauses.join(", ")}
      WHERE id = $1 AND tenant_id = $3
      RETURNING *
    `;
    const result = await database.client.query<WarehouseRow>(sql, params);
    if (!result.rows[0]) return null;
    return mapWarehouse(result.rows[0]);
  }

  async softDeleteWarehouse(
    database: TransactionDatabase,
    tenantId: string,
    warehouseId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await database.client.query(`
      UPDATE crm.warehouses
      SET is_deleted = true, active = false, updated_by_user_id = $3
      WHERE id = $1 AND tenant_id = $2
    `, [warehouseId, tenantId, userId]);
    return (result.rowCount ?? 0) > 0;
  }

  // Stock & Inventory
  async lockStock(
    database: TransactionDatabase,
    tenantId: string,
    warehouseId: string,
    productId: string,
  ): Promise<number> {
    const result = await database.client.query<{ quantity: string }>(`
      SELECT quantity FROM crm.warehouse_stock
      WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3
      FOR UPDATE
    `, [tenantId, warehouseId, productId]);

    if (!result.rows[0]) return 0;
    return Number(result.rows[0].quantity);
  }

  async setStockQuantity(
    database: TransactionDatabase,
    params: {
      tenantId: string;
      warehouseId: string;
      productId: string;
      quantity: number;
    },
  ): Promise<void> {
    const { tenantId, warehouseId, productId, quantity } = params;
    await database.client.query(`
      INSERT INTO crm.warehouse_stock (tenant_id, warehouse_id, product_id, quantity)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (warehouse_id, product_id)
      DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()
    `, [tenantId, warehouseId, productId, quantity]);
  }

  async listStock(
    database: TransactionDatabase,
    tenantId: string,
    options: { outletId?: string; warehouseId?: string; productId?: string },
  ): Promise<PostgresWarehouseStock[]> {
    const params: unknown[] = [tenantId];
    let query = `
      SELECT ws.*, w.name AS warehouse_name, p.name AS product_name, p.sku AS product_sku
      FROM crm.warehouse_stock ws
      JOIN crm.warehouses w ON w.id = ws.warehouse_id AND w.tenant_id = ws.tenant_id
      JOIN crm.products p ON p.id = ws.product_id AND p.tenant_id = ws.tenant_id
      WHERE ws.tenant_id = $1 AND NOT w.is_deleted AND NOT p.is_deleted
    `;

    if (options.outletId) {
      params.push(options.outletId);
      query += ` AND w.outlet_id = $${params.length}`;
    }
    if (options.warehouseId) {
      params.push(options.warehouseId);
      query += ` AND ws.warehouse_id = $${params.length}`;
    }
    if (options.productId) {
      params.push(options.productId);
      query += ` AND ws.product_id = $${params.length}`;
    }

    query += ` ORDER BY p.name ASC, w.name ASC`;
    const result = await database.client.query<StockRow>(query, params);
    return result.rows.map(mapStock);
  }

  // Stock Ledger
  async createLedgerEntry(
    database: TransactionDatabase,
    params: {
      id: string;
      tenantId: string;
      businessId: string;
      outletId: string;
      warehouseId: string;
      productId: string;
      movementType: PostgresStockMovementType;
      quantity: number;
      balanceAfter: number;
      referenceId?: string | null;
      remarks?: string;
      userId: string;
    },
  ): Promise<PostgresStockLedgerEntry> {
    const {
      id,
      tenantId,
      businessId,
      outletId,
      warehouseId,
      productId,
      movementType,
      quantity,
      balanceAfter,
      referenceId,
      remarks,
      userId,
    } = params;

    const result = await database.client.query<LedgerRow>(`
      INSERT INTO crm.stock_ledger (
        id, tenant_id, business_id, outlet_id, warehouse_id, product_id,
        movement_type, quantity, balance_after, reference_id, remarks,
        created_by_user_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12
      )
      RETURNING *
    `, [
      id,
      tenantId,
      businessId,
      outletId,
      warehouseId,
      productId,
      movementType,
      quantity,
      balanceAfter,
      referenceId ?? null,
      remarks ?? "",
      userId,
    ]);
    const row = result.rows[0];
    if (!row) throw new Error("Stock ledger insert did not return a row");
    return mapLedger(row);
  }

  async listStockLedger(
    database: TransactionDatabase,
    tenantId: string,
    options: { outletId?: string; warehouseId?: string; productId?: string; limit?: number },
  ): Promise<PostgresStockLedgerEntry[]> {
    const limit = options.limit ?? 50;
    const params: unknown[] = [tenantId];
    let query = `
      SELECT sl.*, w.name AS warehouse_name, p.name AS product_name
      FROM crm.stock_ledger sl
      JOIN crm.warehouses w ON w.id = sl.warehouse_id AND w.tenant_id = sl.tenant_id
      JOIN crm.products p ON p.id = sl.product_id AND p.tenant_id = sl.tenant_id
      WHERE sl.tenant_id = $1
    `;

    if (options.outletId) {
      params.push(options.outletId);
      query += ` AND sl.outlet_id = $${params.length}`;
    }
    if (options.warehouseId) {
      params.push(options.warehouseId);
      query += ` AND sl.warehouse_id = $${params.length}`;
    }
    if (options.productId) {
      params.push(options.productId);
      query += ` AND sl.product_id = $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY sl.created_at DESC LIMIT $${params.length}`;

    const result = await database.client.query<LedgerRow>(query, params);
    return result.rows.map(mapLedger);
  }

  // Stock Adjustments
  async createStockAdjustment(
    database: TransactionDatabase,
    params: {
      id: string;
      tenantId: string;
      businessId: string;
      outletId: string;
      warehouseId: string;
      adjustmentType: PostgresStockAdjustmentType;
      reason?: string;
      userId: string;
    },
  ): Promise<void> {
    const { id, tenantId, businessId, outletId, warehouseId, adjustmentType, reason, userId } = params;
    await database.client.query(`
      INSERT INTO crm.stock_adjustments (
        id, tenant_id, business_id, outlet_id, warehouse_id, adjustment_type, reason, created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [id, tenantId, businessId, outletId, warehouseId, adjustmentType, reason ?? "", userId]);
  }

  async createStockAdjustmentItem(
    database: TransactionDatabase,
    params: {
      id: string;
      tenantId: string;
      adjustmentId: string;
      productId: string;
      previousQuantity: number;
      newQuantity: number;
      differenceQuantity: number;
    },
  ): Promise<void> {
    const { id, tenantId, adjustmentId, productId, previousQuantity, newQuantity, differenceQuantity } = params;
    await database.client.query(`
      INSERT INTO crm.stock_adjustment_items (
        id, tenant_id, adjustment_id, product_id, previous_quantity, new_quantity, difference_quantity
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [id, tenantId, adjustmentId, productId, previousQuantity, newQuantity, differenceQuantity]);
  }

  // Warehouse Transfers
  async createTransferRequest(
    database: TransactionDatabase,
    params: {
      id: string;
      tenantId: string;
      businessId: string;
      outletId: string;
      productId: string;
      fromWarehouseId: string;
      toWarehouseId: string;
      requestedQuantity: number;
      remarks?: string;
      userId: string;
    },
  ): Promise<PostgresWarehouseTransfer> {
    const {
      id,
      tenantId,
      businessId,
      outletId,
      productId,
      fromWarehouseId,
      toWarehouseId,
      requestedQuantity,
      remarks,
      userId,
    } = params;

    const result = await database.client.query<TransferRow>(`
      INSERT INTO crm.warehouse_transfers (
        id, tenant_id, business_id, outlet_id, product_id,
        from_warehouse_id, to_warehouse_id, requested_quantity,
        status, requested_by_user_id, remarks
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        'PENDING', $9, $10
      )
      RETURNING *
    `, [
      id,
      tenantId,
      businessId,
      outletId,
      productId,
      fromWarehouseId,
      toWarehouseId,
      requestedQuantity,
      userId,
      remarks ?? "",
    ]);

    const row = result.rows[0];
    if (!row) throw new Error("Transfer insert did not return a row");
    return this.getTransferRequest(database, tenantId, row.id) as Promise<PostgresWarehouseTransfer>;
  }

  async getTransferRequest(
    database: TransactionDatabase,
    tenantId: string,
    transferId: string,
    outletId?: string,
  ): Promise<PostgresWarehouseTransfer | null> {
    let query = `
      SELECT wt.*,
        p.name AS product_name, p.sku AS product_sku,
        fw.name AS from_warehouse_name,
        tw.name AS to_warehouse_name,
        req_u.display_name AS requested_by_name,
        act_u.display_name AS action_taken_by_name
      FROM crm.warehouse_transfers wt
      JOIN crm.products p ON p.id = wt.product_id AND p.tenant_id = wt.tenant_id
      JOIN crm.warehouses fw ON fw.id = wt.from_warehouse_id AND fw.tenant_id = wt.tenant_id
      JOIN crm.warehouses tw ON tw.id = wt.to_warehouse_id AND tw.tenant_id = wt.tenant_id
      LEFT JOIN iam.users req_u ON req_u.id = wt.requested_by_user_id
      LEFT JOIN iam.users act_u ON act_u.id = wt.action_taken_by_user_id
      WHERE wt.tenant_id = $1 AND wt.id = $2
    `;
    const params: unknown[] = [tenantId, transferId];
    if (outletId) {
      params.push(outletId);
      query += ` AND wt.outlet_id = $3`;
    }

    const result = await database.client.query<TransferRow>(query, params);
    if (!result.rows[0]) return null;
    return mapTransfer(result.rows[0]);
  }

  async listTransferRequests(
    database: TransactionDatabase,
    tenantId: string,
    options: { outletId?: string; status?: PostgresWarehouseTransferStatus; limit?: number },
  ): Promise<PostgresWarehouseTransfer[]> {
    const limit = options.limit ?? 50;
    const params: unknown[] = [tenantId];
    let query = `
      SELECT wt.*,
        p.name AS product_name, p.sku AS product_sku,
        fw.name AS from_warehouse_name,
        tw.name AS to_warehouse_name,
        req_u.display_name AS requested_by_name,
        act_u.display_name AS action_taken_by_name
      FROM crm.warehouse_transfers wt
      JOIN crm.products p ON p.id = wt.product_id AND p.tenant_id = wt.tenant_id
      JOIN crm.warehouses fw ON fw.id = wt.from_warehouse_id AND fw.tenant_id = wt.tenant_id
      JOIN crm.warehouses tw ON tw.id = wt.to_warehouse_id AND tw.tenant_id = wt.tenant_id
      LEFT JOIN iam.users req_u ON req_u.id = wt.requested_by_user_id
      LEFT JOIN iam.users act_u ON act_u.id = wt.action_taken_by_user_id
      WHERE wt.tenant_id = $1
    `;

    if (options.outletId) {
      params.push(options.outletId);
      query += ` AND wt.outlet_id = $${params.length}`;
    }
    if (options.status) {
      params.push(options.status);
      query += ` AND wt.status = $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY wt.request_date DESC LIMIT $${params.length}`;

    const result = await database.client.query<TransferRow>(query, params);
    return result.rows.map(mapTransfer);
  }

  async updateTransferStatus(
    database: TransactionDatabase,
    params: {
      tenantId: string;
      transferId: string;
      status: PostgresWarehouseTransferStatus;
      acceptedQuantity?: number | null;
      rejectedQuantity?: number | null;
      actionTakenByUserId: string;
      actionDate: Date;
      remarks?: string;
      rejectionReason?: string;
    },
  ): Promise<PostgresWarehouseTransfer | null> {
    const {
      tenantId,
      transferId,
      status,
      acceptedQuantity,
      rejectedQuantity,
      actionTakenByUserId,
      actionDate,
      remarks,
      rejectionReason,
    } = params;

    await database.client.query(`
      UPDATE crm.warehouse_transfers
      SET status = $3,
          accepted_quantity = $4,
          rejected_quantity = $5,
          action_taken_by_user_id = $6,
          action_date = $7,
          remarks = coalesce($8, remarks),
          rejection_reason = coalesce($9, rejection_reason),
          updated_at = now()
      WHERE id = $1 AND tenant_id = $2
    `, [
      transferId,
      tenantId,
      status,
      acceptedQuantity ?? null,
      rejectedQuantity ?? null,
      actionTakenByUserId,
      actionDate,
      remarks ?? null,
      rejectionReason ?? null,
    ]);

    return this.getTransferRequest(database, tenantId, transferId);
  }
}

export const postgresWarehouseRepository = new PostgresWarehouseRepository();
