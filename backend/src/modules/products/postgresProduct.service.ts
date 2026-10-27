import { v7 as uuidv7, validate as isUuid } from "uuid";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import {
  PostgresAuthorizationRepository,
  postgresAuthorizationRepository,
} from "../authorization/postgresAuthorization.repository.js";
import type {
  PostgresCreateCategoryInput,
  PostgresCreateProductInput,
  PostgresProduct,
  PostgresProductCategory,
  PostgresProductListQuery,
  PostgresProductListResult,
  PostgresUpdateCategoryInput,
  PostgresUpdateProductInput,
} from "./product.types.js";
import {
  PostgresProductRepository,
  postgresProductRepository,
} from "./postgresProduct.repository.js";

export class PostgresProductService {
  constructor(
    private readonly repository: PostgresProductRepository = postgresProductRepository,
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
      // If no outlet specified, verify tenant admin or user is active tenant member
      const access = await this.authorization.getCurrentAccess(database, userId, tenantId);
      if (!access.tenant.isTenantAdmin && !access.outlets.some((o) => o.permissions.includes(permission))) {
        throw new AppError(403, `Permission denied for ${permission}`, "PERMISSION_DENIED");
      }
    }
  }

  private async resolveBusinessId(
    database: TransactionDatabase,
    tenantId: string,
    outletId?: string,
  ): Promise<string> {
    if (outletId) {
      const result = await database.client.query<{ business_id: string }>(`
        SELECT business_id FROM tenancy.outlets
        WHERE tenant_id = $1 AND id = $2 AND active
      `, [tenantId, outletId]);
      if (result.rows[0]) return result.rows[0].business_id;
    }

    const businessResult = await database.client.query<{ id: string }>(`
      SELECT id FROM tenancy.businesses
      WHERE tenant_id = $1 AND active
      LIMIT 1
    `, [tenantId]);
    if (!businessResult.rows[0]) {
      throw new AppError(400, "No active business found for tenant", "NO_BUSINESS_FOUND");
    }
    return businessResult.rows[0].id;
  }

  private async resolveCategoryId(
    database: TransactionDatabase,
    tenantId: string,
    businessId: string,
    userId: string,
    categoryIdOrName?: string | null,
    categoryNameField?: string,
  ): Promise<string | null> {
    const raw = categoryIdOrName || categoryNameField;
    if (!raw?.trim()) return null;

    if (isUuid(raw)) {
      const existing = await this.repository.getCategory(database, tenantId, raw);
      if (existing) return existing.id;
    }

    // Lookup by name
    const result = await database.client.query<{ id: string }>(`
      SELECT id FROM crm.product_categories
      WHERE tenant_id = $1 AND lower(name) = lower($2) AND NOT is_deleted
      LIMIT 1
    `, [tenantId, raw.trim()]);

    if (result.rows[0]) return result.rows[0].id;

    // Auto-create category if by name
    const newCatId = uuidv7();
    const created = await this.repository.createCategory(database, {
      id: newCatId,
      tenantId,
      businessId,
      input: { name: raw.trim() },
      userId,
    });
    return created.id;
  }

  async create(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: PostgresCreateProductInput,
  ): Promise<PostgresProduct> {
    await this.requirePermission(database, tenantId, userId, input.outletId, "products.create");
    const businessId = await this.resolveBusinessId(database, tenantId, input.outletId);

    const categoryId = await this.resolveCategoryId(
      database,
      tenantId,
      businessId,
      userId,
      input.categoryId,
      input.category,
    );

    const id = uuidv7();
    return this.repository.createProduct(database, {
      id,
      tenantId,
      businessId,
      input: {
        ...input,
        categoryId,
      },
      userId,
    });
  }

  async get(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    productId: string,
    outletId?: string,
  ): Promise<PostgresProduct> {
    await this.requirePermission(database, tenantId, userId, outletId, "products.read");
    const product = await this.repository.getProduct(database, tenantId, productId, outletId);
    if (!product) {
      throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }
    return product;
  }

  async list(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    query: PostgresProductListQuery,
  ): Promise<PostgresProductListResult> {
    await this.requirePermission(database, tenantId, userId, query.outletId, "products.read");
    return this.repository.listProducts(database, tenantId, query);
  }

  async search(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    queryText: string,
    outletId?: string,
    limit = 20,
  ): Promise<PostgresProduct[]> {
    await this.requirePermission(database, tenantId, userId, outletId, "products.read");
    return this.repository.searchProducts(database, tenantId, queryText, outletId, limit);
  }

  async update(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    productId: string,
    input: PostgresUpdateProductInput,
  ): Promise<PostgresProduct> {
    await this.requirePermission(database, tenantId, userId, input.outletId, "products.update");
    const existing = await this.repository.getProduct(database, tenantId, productId, input.outletId);
    if (!existing) {
      throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }

    let categoryId = input.categoryId;
    if (input.category || (input.categoryId && !isUuid(input.categoryId))) {
      categoryId = await this.resolveCategoryId(
        database,
        tenantId,
        existing.businessId,
        userId,
        input.categoryId,
        input.category,
      );
    }

    const updated = await this.repository.updateProduct(
      database,
      tenantId,
      productId,
      { ...input, categoryId },
      userId,
    );
    if (!updated) {
      throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }
    return updated;
  }

  async archive(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    productId: string,
    outletId?: string,
  ): Promise<{ archived: boolean }> {
    await this.requirePermission(database, tenantId, userId, outletId, "products.archive");
    const existing = await this.repository.getProduct(database, tenantId, productId, outletId);
    if (!existing) {
      throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }
    const success = await this.repository.softDeleteProduct(database, tenantId, productId, userId);
    return { archived: success };
  }

  // Categories
  async createCategory(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: PostgresCreateCategoryInput,
  ): Promise<PostgresProductCategory> {
    await this.requirePermission(database, tenantId, userId, input.outletId, "categories.create");
    const businessId = await this.resolveBusinessId(database, tenantId, input.outletId);
    const id = uuidv7();
    return this.repository.createCategory(database, {
      id,
      tenantId,
      businessId,
      input,
      userId,
    });
  }

  async listCategories(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId?: string,
    includeDeleted = false,
  ): Promise<PostgresProductCategory[]> {
    await this.requirePermission(database, tenantId, userId, outletId, "categories.read");
    return this.repository.listCategories(database, tenantId, includeDeleted);
  }

  async updateCategory(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    categoryId: string,
    input: PostgresUpdateCategoryInput,
  ): Promise<PostgresProductCategory> {
    await this.requirePermission(database, tenantId, userId, input.outletId, "categories.update");
    const updated = await this.repository.updateCategory(database, tenantId, categoryId, input, userId);
    if (!updated) {
      throw new AppError(404, "Category not found", "CATEGORY_NOT_FOUND");
    }
    return updated;
  }

  async archiveCategory(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    categoryId: string,
    outletId?: string,
  ): Promise<{ archived: boolean }> {
    await this.requirePermission(database, tenantId, userId, outletId, "categories.archive");
    const success = await this.repository.softDeleteCategory(database, tenantId, categoryId, userId);
    return { archived: success };
  }
}

export const postgresProductService = new PostgresProductService();

