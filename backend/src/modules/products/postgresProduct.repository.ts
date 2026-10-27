import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
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

interface ProductRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  business_id: string;
  name: string;
  sku: string;
  brand: string;
  category_id: string | null;
  category_name?: string | null;
  description: string;
  mrp_price: string;
  price: string;
  purchase_price: string;
  tax_percent: string;
  is_add_on: boolean;
  min_unit: Record<string, string>;
  uid_map: Record<string, string | null>;
  custom_fields: Record<string, unknown>;
  active: boolean;
  is_deleted: boolean;
  outlet_ids?: string[];
  created_at: Date;
  updated_at: Date;
}

interface CategoryRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  business_id: string;
  name: string;
  description: string;
  active: boolean;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}

const mapProduct = (row: ProductRow): PostgresProduct => ({
  id: row.id,
  tenantId: row.tenant_id,
  businessId: row.business_id,
  name: row.name,
  sku: row.sku,
  brand: row.brand,
  categoryId: row.category_id,
  ...(row.category_name === null ? {} : { categoryName: row.category_name }),
  description: row.description,
  mrpPrice: Number(row.mrp_price),
  price: Number(row.price),
  purchasePrice: Number(row.purchase_price),
  taxPercent: Number(row.tax_percent),
  isAddOn: row.is_add_on,
  minUnit: {
    length: row.min_unit?.length ?? "",
    width: row.min_unit?.width ?? "",
    height: row.min_unit?.height ?? "",
    weight: row.min_unit?.weight ?? "",
    volume: row.min_unit?.volume ?? "",
  },
  uidMap: {
    GTIN: row.uid_map?.GTIN ?? "",
    ISBN: row.uid_map?.ISBN ?? null,
    BatchId: row.uid_map?.BatchId ?? "",
    QRCode: row.uid_map?.QRCode ?? "",
    IMEI: row.uid_map?.IMEI ?? null,
    SerialNumber: row.uid_map?.SerialNumber ?? null,
    MACAddress: row.uid_map?.MACAddress ?? null,
    VIN: row.uid_map?.VIN ?? null,
    RFID: row.uid_map?.RFID ?? null,
  },
  customFields: row.custom_fields ?? {},
  active: row.active,
  isDeleted: row.is_deleted,
  outletIds: row.outlet_ids ?? [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapCategory = (row: CategoryRow): PostgresProductCategory => ({
  id: row.id,
  tenantId: row.tenant_id,
  businessId: row.business_id,
  name: row.name,
  description: row.description,
  active: row.active,
  isDeleted: row.is_deleted,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class PostgresProductRepository {
  async createProduct(
    database: TransactionDatabase,
    params: {
      id: string;
      tenantId: string;
      businessId: string;
      input: PostgresCreateProductInput;
      userId: string;
    },
  ): Promise<PostgresProduct> {
    const { id, tenantId, businessId, input, userId } = params;

    const result = await database.client.query<ProductRow>(`
      INSERT INTO crm.products (
        id, tenant_id, business_id, name, sku, brand, category_id,
        description, mrp_price, price, purchase_price, tax_percent,
        is_add_on, min_unit, uid_map, custom_fields,
        created_by_user_id, updated_by_user_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15, $16,
        $17, $17
      )
      RETURNING *
    `, [
      id,
      tenantId,
      businessId,
      input.name,
      input.sku ?? "",
      input.brand ?? "",
      input.categoryId ?? null,
      input.description ?? "",
      input.mrpPrice,
      input.price,
      input.purchasePrice ?? 0,
      input.taxPercent ?? 0,
      input.isAddOn ?? false,
      JSON.stringify(input.minUnit ?? {}),
      JSON.stringify(input.uidMap ?? {}),
      JSON.stringify(input.customFields ?? {}),
      userId,
    ]);

    const outletsToLink = input.outletIds ?? (input.outletId ? [input.outletId] : []);
    if (outletsToLink.length > 0) {
      for (const outletId of outletsToLink) {
        await database.client.query(`
          INSERT INTO crm.product_outlets (tenant_id, product_id, outlet_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (product_id, outlet_id) DO NOTHING
        `, [tenantId, id, outletId]);
      }
    }

    const row = result.rows[0];
    if (!row) throw new Error("Product insert did not return a row");
    return mapProduct({ ...row, outlet_ids: outletsToLink });
  }

  async getProduct(
    database: TransactionDatabase,
    tenantId: string,
    productId: string,
    outletId?: string,
  ): Promise<PostgresProduct | null> {
    let query = `
      SELECT p.*, c.name AS category_name,
        coalesce(array_agg(po.outlet_id) FILTER (WHERE po.outlet_id IS NOT NULL), '{}') AS outlet_ids
      FROM crm.products p
      LEFT JOIN crm.product_categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
      LEFT JOIN crm.product_outlets po ON po.product_id = p.id AND po.tenant_id = p.tenant_id AND po.active
      WHERE p.tenant_id = $1 AND p.id = $2
    `;
    const params: unknown[] = [tenantId, productId];

    if (outletId) {
      query += ` AND (
        EXISTS (SELECT 1 FROM crm.product_outlets po2 WHERE po2.product_id = p.id AND po2.outlet_id = $3 AND po2.active)
        OR NOT EXISTS (SELECT 1 FROM crm.product_outlets po3 WHERE po3.product_id = p.id)
      )`;
      params.push(outletId);
    }

    query += ` GROUP BY p.id, c.name`;

    const result = await database.client.query<ProductRow>(query, params);
    if (!result.rows[0]) return null;
    return mapProduct(result.rows[0]);
  }

  async listProducts(
    database: TransactionDatabase,
    tenantId: string,
    query: PostgresProductListQuery,
  ): Promise<PostgresProductListResult> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [tenantId];
    let whereClause = `p.tenant_id = $1`;

    if (!query.includeDeleted) {
      whereClause += ` AND NOT p.is_deleted`;
    }

    if (query.outletId) {
      params.push(query.outletId);
      whereClause += ` AND (
        EXISTS (SELECT 1 FROM crm.product_outlets po2 WHERE po2.product_id = p.id AND po2.outlet_id = $${params.length} AND po2.active)
        OR NOT EXISTS (SELECT 1 FROM crm.product_outlets po3 WHERE po3.product_id = p.id)
      )`;
    }

    if (query.categoryId) {
      params.push(query.categoryId);
      whereClause += ` AND p.category_id = $${params.length}`;
    }

    if (query.search?.trim()) {
      params.push(`%${query.search.trim()}%`);
      whereClause += ` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.brand ILIKE $${params.length})`;
    }

    if (query.cursor) {
      params.push(query.cursor);
      whereClause += ` AND p.id > $${params.length}`;
    }

    params.push(limit + 1);
    const sql = `
      SELECT p.*, c.name AS category_name,
        coalesce(array_agg(po.outlet_id) FILTER (WHERE po.outlet_id IS NOT NULL), '{}') AS outlet_ids
      FROM crm.products p
      LEFT JOIN crm.product_categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
      LEFT JOIN crm.product_outlets po ON po.product_id = p.id AND po.tenant_id = p.tenant_id AND po.active
      WHERE ${whereClause}
      GROUP BY p.id, c.name
      ORDER BY p.id ASC
      LIMIT $${params.length}
    `;

    const result = await database.client.query<ProductRow>(sql, params);
    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const nextCursor = hasMore ? rows.at(-1)?.id ?? null : null;

    return {
      items: rows.map(mapProduct),
      nextCursor,
    };
  }

  async searchProducts(
    database: TransactionDatabase,
    tenantId: string,
    queryText: string,
    outletId?: string,
    limit = 20,
  ): Promise<PostgresProduct[]> {
    const params: unknown[] = [tenantId, `%${queryText.trim()}%`];
    let whereClause = `p.tenant_id = $1 AND NOT p.is_deleted AND (p.name ILIKE $2 OR p.sku ILIKE $2 OR p.brand ILIKE $2)`;

    if (outletId) {
      params.push(outletId);
      whereClause += ` AND (
        EXISTS (SELECT 1 FROM crm.product_outlets po2 WHERE po2.product_id = p.id AND po2.outlet_id = $${params.length} AND po2.active)
        OR NOT EXISTS (SELECT 1 FROM crm.product_outlets po3 WHERE po3.product_id = p.id)
      )`;
    }

    params.push(limit);
    const sql = `
      SELECT p.*, c.name AS category_name,
        coalesce(array_agg(po.outlet_id) FILTER (WHERE po.outlet_id IS NOT NULL), '{}') AS outlet_ids
      FROM crm.products p
      LEFT JOIN crm.product_categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
      LEFT JOIN crm.product_outlets po ON po.product_id = p.id AND po.tenant_id = p.tenant_id AND po.active
      WHERE ${whereClause}
      GROUP BY p.id, c.name
      ORDER BY p.name ASC
      LIMIT $${params.length}
    `;

    const result = await database.client.query<ProductRow>(sql, params);
    return result.rows.map(mapProduct);
  }

  async updateProduct(
    database: TransactionDatabase,
    tenantId: string,
    productId: string,
    input: PostgresUpdateProductInput,
    userId: string,
  ): Promise<PostgresProduct | null> {
    const setClauses: string[] = ["updated_by_user_id = $2"];
    const params: unknown[] = [productId, userId, tenantId];

    if (input.name !== undefined) {
      params.push(input.name);
      setClauses.push(`name = $${params.length}`);
    }
    if (input.sku !== undefined) {
      params.push(input.sku);
      setClauses.push(`sku = $${params.length}`);
    }
    if (input.brand !== undefined) {
      params.push(input.brand);
      setClauses.push(`brand = $${params.length}`);
    }
    if (input.categoryId !== undefined) {
      params.push(input.categoryId);
      setClauses.push(`category_id = $${params.length}`);
    }
    if (input.description !== undefined) {
      params.push(input.description);
      setClauses.push(`description = $${params.length}`);
    }
    if (input.mrpPrice !== undefined) {
      params.push(input.mrpPrice);
      setClauses.push(`mrp_price = $${params.length}`);
    }
    if (input.price !== undefined) {
      params.push(input.price);
      setClauses.push(`price = $${params.length}`);
    }
    if (input.purchasePrice !== undefined) {
      params.push(input.purchasePrice);
      setClauses.push(`purchase_price = $${params.length}`);
    }
    if (input.taxPercent !== undefined) {
      params.push(input.taxPercent);
      setClauses.push(`tax_percent = $${params.length}`);
    }
    if (input.isAddOn !== undefined) {
      params.push(input.isAddOn);
      setClauses.push(`is_add_on = $${params.length}`);
    }
    if (input.minUnit !== undefined) {
      params.push(JSON.stringify(input.minUnit));
      setClauses.push(`min_unit = min_unit || $${params.length}::jsonb`);
    }
    if (input.uidMap !== undefined) {
      params.push(JSON.stringify(input.uidMap));
      setClauses.push(`uid_map = uid_map || $${params.length}::jsonb`);
    }
    if (input.customFields !== undefined) {
      params.push(JSON.stringify(input.customFields));
      setClauses.push(`custom_fields = custom_fields || $${params.length}::jsonb`);
    }
    if (input.active !== undefined) {
      params.push(input.active);
      setClauses.push(`active = $${params.length}`);
    }

    const sql = `
      UPDATE crm.products
      SET ${setClauses.join(", ")}
      WHERE id = $1 AND tenant_id = $3
      RETURNING *
    `;

    const result = await database.client.query<ProductRow>(sql, params);
    if (!result.rows[0]) return null;
    return this.getProduct(database, tenantId, productId);
  }

  async softDeleteProduct(
    database: TransactionDatabase,
    tenantId: string,
    productId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await database.client.query(`
      UPDATE crm.products
      SET is_deleted = true, active = false, updated_by_user_id = $3
      WHERE id = $1 AND tenant_id = $2
    `, [productId, tenantId, userId]);
    return (result.rowCount ?? 0) > 0;
  }

  async createCategory(
    database: TransactionDatabase,
    params: {
      id: string;
      tenantId: string;
      businessId: string;
      input: PostgresCreateCategoryInput;
      userId: string;
    },
  ): Promise<PostgresProductCategory> {
    const { id, tenantId, businessId, input, userId } = params;
    const result = await database.client.query<CategoryRow>(`
      INSERT INTO crm.product_categories (
        id, tenant_id, business_id, name, description,
        created_by_user_id, updated_by_user_id
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $6
      )
      RETURNING *
    `, [id, tenantId, businessId, input.name, input.description ?? "", userId]);
    const row = result.rows[0];
    if (!row) throw new Error("Category insert did not return a row");
    return mapCategory(row);
  }

  async getCategory(
    database: TransactionDatabase,
    tenantId: string,
    categoryId: string,
  ): Promise<PostgresProductCategory | null> {
    const result = await database.client.query<CategoryRow>(`
      SELECT * FROM crm.product_categories
      WHERE id = $1 AND tenant_id = $2
    `, [categoryId, tenantId]);
    if (!result.rows[0]) return null;
    return mapCategory(result.rows[0]);
  }

  async listCategories(
    database: TransactionDatabase,
    tenantId: string,
    includeDeleted = false,
  ): Promise<PostgresProductCategory[]> {
    let query = `SELECT * FROM crm.product_categories WHERE tenant_id = $1`;
    if (!includeDeleted) {
      query += ` AND NOT is_deleted`;
    }
    query += ` ORDER BY name ASC`;
    const result = await database.client.query<CategoryRow>(query, [tenantId]);
    return result.rows.map(mapCategory);
  }

  async updateCategory(
    database: TransactionDatabase,
    tenantId: string,
    categoryId: string,
    input: PostgresUpdateCategoryInput,
    userId: string,
  ): Promise<PostgresProductCategory | null> {
    const setClauses: string[] = ["updated_by_user_id = $2"];
    const params: unknown[] = [categoryId, userId, tenantId];

    if (input.name !== undefined) {
      params.push(input.name);
      setClauses.push(`name = $${params.length}`);
    }
    if (input.description !== undefined) {
      params.push(input.description);
      setClauses.push(`description = $${params.length}`);
    }
    if (input.active !== undefined) {
      params.push(input.active);
      setClauses.push(`active = $${params.length}`);
    }

    const sql = `
      UPDATE crm.product_categories
      SET ${setClauses.join(", ")}
      WHERE id = $1 AND tenant_id = $3
      RETURNING *
    `;
    const result = await database.client.query<CategoryRow>(sql, params);
    if (!result.rows[0]) return null;
    return mapCategory(result.rows[0]);
  }

  async softDeleteCategory(
    database: TransactionDatabase,
    tenantId: string,
    categoryId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await database.client.query(`
      UPDATE crm.product_categories
      SET is_deleted = true, active = false, updated_by_user_id = $3
      WHERE id = $1 AND tenant_id = $2
    `, [categoryId, tenantId, userId]);
    return (result.rowCount ?? 0) > 0;
  }
}

export const postgresProductRepository = new PostgresProductRepository();
