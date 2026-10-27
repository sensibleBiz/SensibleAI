import { apiRequest as request } from "@/shared/api/apiClient";

const postgresAuth = { authMode: "postgres" as const };
const apiRequest = <T>(
  path: string,
  options: Parameters<typeof request>[1] = {},
) => request<T>(path, { ...options, ...postgresAuth });

export interface PostgresCategoryDTO {
  id: string;
  tenantId: string;
  businessId: string;
  name: string;
  description: string;
  active: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PostgresProductDTO {
  id: string;
  tenantId: string;
  businessId: string;
  categoryId: string | null;
  categoryName?: string;
  name: string;
  sku: string;
  brand: string;
  description: string;
  isAddOn: boolean;
  price: number;
  mrpPrice: number;
  purchasePrice: number;
  taxPercent: number;
  minUnit: {
    length: string;
    width: string;
    height: string;
    weight: string;
    volume: string;
  };
  uidMap: {
    GTIN: string;
    ISBN: string | null;
    BatchId: string;
    QRCode: string;
    IMEI: string | null;
    SerialNumber: string | null;
    MACAddress: string | null;
    VIN: string | null;
    RFID: string | null;
  };
  customFields: Record<string, unknown>;
  outletIds: string[];
  active: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PostgresWarehouseDTO {
  id: string;
  tenantId: string;
  businessId: string;
  outletId: string;
  name: string;
  code: string;
  address: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PostgresWarehouseStockDTO {
  id: string;
  tenantId: string;
  warehouseId: string;
  productId: string;
  productName: string;
  productSku: string;
  warehouseName: string;
  quantity: number;
  reservedQuantity: number;
  reorderLevel: number;
  reorderQuantity: number;
  updatedAt: string;
}

export interface PostgresStockLedgerEntryDTO {
  id: string;
  tenantId: string;
  businessId: string;
  outletId: string;
  warehouseId: string;
  warehouseName: string;
  productId: string;
  productName: string;
  movementType: "IN" | "OUT" | "TRANSFER_IN" | "TRANSFER_OUT" | "ADJUSTMENT" | "SALE" | "RETURN";
  quantity: number;
  balanceAfter: number;
  referenceId: string | null;
  remarks: string;
  userId: string;
  createdAt: string;
}

export interface PostgresWarehouseTransferDTO {
  id: string;
  tenantId: string;
  businessId: string;
  outletId: string;
  productId: string;
  productName: string;
  fromWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  requestedQuantity: number;
  acceptedQuantity: number | null;
  rejectedQuantity: number | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "PARTIALLY_ACCEPTED";
  remarks: string;
  rejectionReason: string | null;
  requestedByUserId: string;
  actionTakenByUserId: string | null;
  actionDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export const productApi = {
  // Products
  async listProducts(params: {
    outletId?: string;
    search?: string;
    categoryId?: string;
    isAddOn?: boolean;
    limit?: number;
    offset?: number;
    includeDeleted?: boolean;
  } = {}, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    if (params.outletId) searchParams.set("outletId", params.outletId);
    if (params.search) searchParams.set("search", params.search);
    if (params.categoryId) searchParams.set("categoryId", params.categoryId);
    if (params.isAddOn !== undefined) searchParams.set("isAddOn", String(params.isAddOn));
    if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
    if (params.offset !== undefined) searchParams.set("offset", String(params.offset));
    if (params.includeDeleted) searchParams.set("includeDeleted", "true");

    const query = searchParams.toString();
    const response = await apiRequest<{ items: PostgresProductDTO[]; total: number }>(
      `/api/v1/products${query ? `?${query}` : ""}`,
      { signal },
    );
    return response;
  },

  async getProduct(productId: string, outletId?: string, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    if (outletId) searchParams.set("outletId", outletId);
    const query = searchParams.toString();
    const response = await apiRequest<PostgresProductDTO>(
      `/api/v1/products/${encodeURIComponent(productId)}${query ? `?${query}` : ""}`,
      { signal },
    );
    return response;
  },

  async searchProducts(queryText: string, outletId?: string, limit = 20, signal?: AbortSignal) {
    const searchParams = new URLSearchParams({ query: queryText, limit: String(limit) });
    if (outletId) searchParams.set("outletId", outletId);
    const response = await apiRequest<PostgresProductDTO[]>(
      `/api/v1/products/search?${searchParams.toString()}`,
      { signal },
    );
    return response;
  },

  async createProduct(input: {
    outletId: string;
    name: string;
    categoryId?: string | null;
    category?: string;
    sku?: string;
    brand?: string;
    description?: string;
    isAddOn?: boolean;
    price?: number;
    mrpPrice?: number;
    purchasePrice?: number;
    taxPercent?: number;
    minUnit?: {
      length?: string;
      width?: string;
      height?: string;
      weight?: string;
      volume?: string;
    };
    uidMap?: Record<string, unknown>;
    customFields?: Record<string, unknown>;
    outletIds?: string[];
  }, signal?: AbortSignal) {
    const response = await apiRequest<PostgresProductDTO>(
      "/api/v1/products",
      {
        method: "POST",
        body: input,
        signal,
      },
    );
    return response;
  },

  async updateProduct(productId: string, input: {
    outletId?: string;
    name?: string;
    categoryId?: string | null;
    category?: string;
    sku?: string;
    brand?: string;
    description?: string;
    isAddOn?: boolean;
    price?: number;
    mrpPrice?: number;
    purchasePrice?: number;
    taxPercent?: number;
    minUnit?: {
      length?: string;
      width?: string;
      height?: string;
      weight?: string;
      volume?: string;
    };
    uidMap?: Record<string, unknown>;
    customFields?: Record<string, unknown>;
    active?: boolean;
  }, signal?: AbortSignal) {
    const response = await apiRequest<PostgresProductDTO>(
      `/api/v1/products/${encodeURIComponent(productId)}`,
      {
        method: "PATCH",
        body: input,
        signal,
      },
    );
    return response;
  },

  async archiveProduct(productId: string, outletId?: string, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    if (outletId) searchParams.set("outletId", outletId);
    const query = searchParams.toString();
    const response = await apiRequest<{ archived: boolean }>(
      `/api/v1/products/${encodeURIComponent(productId)}${query ? `?${query}` : ""}`,
      {
        method: "DELETE",
        signal,
      },
    );
    return response;
  },

  // AI Product Operations
  async generateProductAi(input: {
    prompt?: string;
    name?: string;
    brand?: string;
    category?: string;
    targetPrice?: number;
    outletId?: string;
  }, signal?: AbortSignal) {
    const response = await apiRequest<{
      name: string;
      brand: string;
      category: string;
      description: string;
      features: string[];
      specifications: Record<string, string>;
      suggestedHsnCode: string;
      suggestedGstRate: number;
      suggestedMrp: number;
      suggestedPrice: number;
      suggestedPurchasePrice: number;
      suggestedUnit: string;
      tags: string[];
      whatsappPitch: string;
    }>(
      "/api/v1/products/ai/generate",
      {
        method: "POST",
        body: input,
        signal,
      },
    );
    return response;
  },

  async analyzeProductImageAi(input: {
    imageBase64: string;
    mimeType?: string;
    prompt?: string;
    outletId?: string;
  }, signal?: AbortSignal) {
    const response = await apiRequest<{
      name: string;
      brand: string;
      category: string;
      description: string;
      features: string[];
      specifications: Record<string, string>;
      suggestedHsnCode: string;
      suggestedGstRate: number;
      suggestedMrp: number;
      suggestedPrice: number;
      suggestedPurchasePrice: number;
      suggestedUnit: string;
      tags: string[];
      whatsappPitch: string;
    }>(
      "/api/v1/products/ai/analyze-image",
      {
        method: "POST",
        body: {
          ...input,
          mimeType: input.mimeType || "image/jpeg",
        },
        signal,
      },
    );
    return response;
  },

  // Categories
  async listCategories(outletId?: string, includeDeleted = false, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    if (outletId) searchParams.set("outletId", outletId);
    if (includeDeleted) searchParams.set("includeDeleted", "true");
    const query = searchParams.toString();
    const response = await apiRequest<PostgresCategoryDTO[]>(
      `/api/v1/products/categories${query ? `?${query}` : ""}`,
      { signal },
    );
    return response;
  },

  async createCategory(input: {
    outletId?: string;
    name: string;
    description?: string;
  }, signal?: AbortSignal) {
    const response = await apiRequest<PostgresCategoryDTO>(
      "/api/v1/products/categories",
      {
        method: "POST",
        body: input,
        signal,
      },
    );
    return response;
  },

  async updateCategory(categoryId: string, input: {
    name?: string;
    description?: string;
    active?: boolean;
  }, signal?: AbortSignal) {
    const response = await apiRequest<PostgresCategoryDTO>(
      `/api/v1/products/categories/${encodeURIComponent(categoryId)}`,
      {
        method: "PATCH",
        body: input,
        signal,
      },
    );
    return response;
  },

  async archiveCategory(categoryId: string, outletId?: string, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    if (outletId) searchParams.set("outletId", outletId);
    const query = searchParams.toString();
    const response = await apiRequest<{ archived: boolean }>(
      `/api/v1/products/categories/${encodeURIComponent(categoryId)}${query ? `?${query}` : ""}`,
      {
        method: "DELETE",
        signal,
      },
    );
    return response;
  },

  // Warehouses
  async listWarehouses(outletId?: string, includeDeleted = false, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    if (outletId) searchParams.set("outletId", outletId);
    if (includeDeleted) searchParams.set("includeDeleted", "true");
    const query = searchParams.toString();
    const response = await apiRequest<PostgresWarehouseDTO[]>(
      `/api/v1/warehouses${query ? `?${query}` : ""}`,
      { signal },
    );
    return response;
  },

  async getWarehouse(warehouseId: string, outletId?: string, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    if (outletId) searchParams.set("outletId", outletId);
    const query = searchParams.toString();
    const response = await apiRequest<PostgresWarehouseDTO>(
      `/api/v1/warehouses/${encodeURIComponent(warehouseId)}${query ? `?${query}` : ""}`,
      { signal },
    );
    return response;
  },

  async createWarehouse(input: {
    outletId: string;
    name: string;
    code?: string;
    address?: string;
  }, signal?: AbortSignal) {
    const response = await apiRequest<PostgresWarehouseDTO>(
      "/api/v1/warehouses",
      {
        method: "POST",
        body: input,
        signal,
      },
    );
    return response;
  },

  async updateWarehouse(warehouseId: string, input: {
    outletId?: string;
    name?: string;
    code?: string;
    address?: string;
    active?: boolean;
  }, signal?: AbortSignal) {
    const response = await apiRequest<PostgresWarehouseDTO>(
      `/api/v1/warehouses/${encodeURIComponent(warehouseId)}`,
      {
        method: "PATCH",
        body: input,
        signal,
      },
    );
    return response;
  },

  async archiveWarehouse(warehouseId: string, outletId?: string, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    if (outletId) searchParams.set("outletId", outletId);
    const query = searchParams.toString();
    const response = await apiRequest<{ archived: boolean }>(
      `/api/v1/warehouses/${encodeURIComponent(warehouseId)}${query ? `?${query}` : ""}`,
      {
        method: "DELETE",
        signal,
      },
    );
    return response;
  },

  // Stock & Inventory
  async listStock(params: {
    outletId?: string;
    warehouseId?: string;
    productId?: string;
  } = {}, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    if (params.outletId) searchParams.set("outletId", params.outletId);
    if (params.warehouseId) searchParams.set("warehouseId", params.warehouseId);
    if (params.productId) searchParams.set("productId", params.productId);
    const query = searchParams.toString();
    const response = await apiRequest<PostgresWarehouseStockDTO[]>(
      `/api/v1/inventory/stock${query ? `?${query}` : ""}`,
      { signal },
    );
    return response;
  },

  async listStockLedger(params: {
    outletId?: string;
    warehouseId?: string;
    productId?: string;
    limit?: number;
  } = {}, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    if (params.outletId) searchParams.set("outletId", params.outletId);
    if (params.warehouseId) searchParams.set("warehouseId", params.warehouseId);
    if (params.productId) searchParams.set("productId", params.productId);
    if (params.limit) searchParams.set("limit", String(params.limit));
    const query = searchParams.toString();
    const response = await apiRequest<PostgresStockLedgerEntryDTO[]>(
      `/api/v1/inventory/ledger${query ? `?${query}` : ""}`,
      { signal },
    );
    return response;
  },

  async adjustStock(input: {
    outletId: string;
    warehouseId: string;
    adjustmentType: "CORRECTION" | "COUNT" | "DAMAGE" | "EXPIRED" | "OTHER";
    reason?: string;
    items: Array<{ productId: string; newQuantity: number }>;
  }, signal?: AbortSignal) {
    const response = await apiRequest<{ adjustmentId: string; itemsCount: number }>(
      "/api/v1/inventory/adjustments",
      {
        method: "POST",
        body: input,
        signal,
      },
    );
    return response;
  },

  // Transfers
  async listTransferRequests(params: {
    outletId?: string;
    status?: "PENDING" | "ACCEPTED" | "REJECTED" | "PARTIALLY_ACCEPTED";
    limit?: number;
  } = {}, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    if (params.outletId) searchParams.set("outletId", params.outletId);
    if (params.status) searchParams.set("status", params.status);
    if (params.limit) searchParams.set("limit", String(params.limit));
    const query = searchParams.toString();
    const response = await apiRequest<PostgresWarehouseTransferDTO[]>(
      `/api/v1/inventory/transfers${query ? `?${query}` : ""}`,
      { signal },
    );
    return response;
  },

  async getTransferRequest(transferId: string, outletId?: string, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    if (outletId) searchParams.set("outletId", outletId);
    const query = searchParams.toString();
    const response = await apiRequest<PostgresWarehouseTransferDTO>(
      `/api/v1/inventory/transfers/${encodeURIComponent(transferId)}${query ? `?${query}` : ""}`,
      { signal },
    );
    return response;
  },

  async createTransferRequest(input: {
    outletId: string;
    productId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    requestedQuantity: number;
    remarks?: string;
  }, signal?: AbortSignal) {
    const response = await apiRequest<PostgresWarehouseTransferDTO>(
      "/api/v1/inventory/transfers",
      {
        method: "POST",
        body: input,
        signal,
      },
    );
    return response;
  },

  async actionTransferRequest(transferId: string, input: {
    outletId?: string;
    action: "ACCEPT" | "REJECT" | "PARTIAL_ACCEPT";
    acceptedQuantity?: number;
    rejectionReason?: string;
    remarks?: string;
  }, signal?: AbortSignal) {
    const response = await apiRequest<PostgresWarehouseTransferDTO>(
      `/api/v1/inventory/transfers/${encodeURIComponent(transferId)}/action`,
      {
        method: "POST",
        body: input,
        signal,
      },
    );
    return response;
  },
};
