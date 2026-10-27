export interface PostgresProductCategory {
  id: string;
  tenantId: string;
  businessId: string;
  name: string;
  description: string;
  active: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostgresProductMinUnit {
  length: string;
  width: string;
  height: string;
  weight: string;
  volume: string;
}

export interface PostgresProductUidMap {
  GTIN: string;
  ISBN: string | null;
  BatchId: string;
  QRCode: string;
  IMEI: string | null;
  SerialNumber: string | null;
  MACAddress: string | null;
  VIN: string | null;
  RFID: string | null;
}

export interface PostgresProduct {
  id: string;
  tenantId: string;
  businessId: string;
  name: string;
  sku: string;
  brand: string;
  categoryId: string | null;
  categoryName?: string;
  description: string;
  mrpPrice: number;
  price: number;
  purchasePrice: number;
  taxPercent: number;
  isAddOn: boolean;
  minUnit: PostgresProductMinUnit;
  uidMap: PostgresProductUidMap;
  customFields: Record<string, unknown>;
  active: boolean;
  isDeleted: boolean;
  outletIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PostgresCreateProductInput {
  outletId?: string | undefined;
  outletIds?: string[] | undefined;
  name: string;
  sku?: string | undefined;
  brand?: string | undefined;
  categoryId?: string | null | undefined;
  category?: string | undefined;
  description?: string | undefined;
  mrpPrice: number;
  price: number;
  purchasePrice?: number | undefined;
  taxPercent?: number | undefined;
  isAddOn?: boolean | undefined;
  minUnit?: Partial<PostgresProductMinUnit> | undefined;
  uidMap?: Partial<PostgresProductUidMap> | undefined;
  customFields?: Record<string, unknown> | undefined;
}

export interface PostgresUpdateProductInput {
  outletId?: string | undefined;
  name?: string | undefined;
  sku?: string | undefined;
  brand?: string | undefined;
  categoryId?: string | null | undefined;
  category?: string | undefined;
  description?: string | undefined;
  mrpPrice?: number | undefined;
  price?: number | undefined;
  purchasePrice?: number | undefined;
  taxPercent?: number | undefined;
  isAddOn?: boolean | undefined;
  minUnit?: Partial<PostgresProductMinUnit> | undefined;
  uidMap?: Partial<PostgresProductUidMap> | undefined;
  customFields?: Record<string, unknown> | undefined;
  active?: boolean | undefined;
}

export interface PostgresProductListQuery {
  outletId?: string | undefined;
  categoryId?: string | undefined;
  search?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
  includeDeleted?: boolean | undefined;
}

export interface PostgresProductListResult {
  items: PostgresProduct[];
  nextCursor: string | null;
}

export interface PostgresCreateCategoryInput {
  outletId?: string | undefined;
  name: string;
  description?: string | undefined;
}

export interface PostgresUpdateCategoryInput {
  outletId?: string | undefined;
  name?: string | undefined;
  description?: string | undefined;
  active?: boolean | undefined;
}

