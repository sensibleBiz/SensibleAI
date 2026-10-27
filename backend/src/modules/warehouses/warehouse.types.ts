export interface PostgresWarehouse {
  id: string;
  tenantId: string;
  businessId: string;
  outletId: string;
  name: string;
  code: string;
  address: string;
  active: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostgresCreateWarehouseInput {
  outletId: string;
  name: string;
  code?: string | undefined;
  address?: string | undefined;
}

export interface PostgresUpdateWarehouseInput {
  outletId?: string | undefined;
  name?: string | undefined;
  code?: string | undefined;
  address?: string | undefined;
  active?: boolean | undefined;
}

export interface PostgresWarehouseStock {
  id: string;
  tenantId: string;
  warehouseId: string;
  warehouseName?: string | undefined;
  productId: string;
  productName?: string | undefined;
  productSku?: string | undefined;
  quantity: number;
  reorderLevel: number;
  createdAt: Date;
  updatedAt: Date;
}

export type PostgresStockMovementType =
  | "OPENING"
  | "PURCHASE"
  | "SALE"
  | "RETURN"
  | "ADJUSTMENT"
  | "TRANSFER_OUT"
  | "TRANSFER_IN";

export interface PostgresStockLedgerEntry {
  id: string;
  tenantId: string;
  businessId: string;
  outletId: string;
  warehouseId: string;
  warehouseName?: string | undefined;
  productId: string;
  productName?: string | undefined;
  movementType: PostgresStockMovementType;
  quantity: number;
  balanceAfter: number;
  referenceId: string | null;
  remarks: string;
  createdByUserId: string;
  createdAt: Date;
}

export type PostgresStockAdjustmentType =
  | "CORRECTION"
  | "COUNT"
  | "DAMAGE"
  | "EXPIRED"
  | "OTHER";

export interface PostgresStockAdjustmentItemInput {
  productId: string;
  newQuantity: number;
}

export interface PostgresCreateStockAdjustmentInput {
  outletId: string;
  warehouseId: string;
  adjustmentType: PostgresStockAdjustmentType;
  reason?: string | undefined;
  items: PostgresStockAdjustmentItemInput[];
}

export type PostgresWarehouseTransferStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "PARTIALLY_ACCEPTED";

export interface PostgresWarehouseTransfer {
  id: string;
  tenantId: string;
  businessId: string;
  outletId: string;
  productId: string;
  productName?: string | undefined;
  productSku?: string | undefined;
  fromWarehouseId: string;
  fromWarehouseName?: string | undefined;
  toWarehouseId: string;
  toWarehouseName?: string | undefined;
  requestedQuantity: number;
  acceptedQuantity: number | null;
  rejectedQuantity: number | null;
  status: PostgresWarehouseTransferStatus;
  requestedByUserId: string;
  requestedByName?: string | undefined;
  actionTakenByUserId: string | null;
  actionTakenByName?: string | undefined;
  requestDate: Date;
  actionDate: Date | null;
  remarks: string;
  rejectionReason: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostgresCreateTransferRequestInput {
  outletId: string;
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  requestedQuantity: number;
  remarks?: string | undefined;
}

export interface PostgresActionTransferRequestInput {
  outletId?: string | undefined;
  action: "ACCEPT" | "REJECT" | "PARTIAL_ACCEPT";
  acceptedQuantity?: number | undefined;
  rejectionReason?: string | undefined;
  remarks?: string | undefined;
}

