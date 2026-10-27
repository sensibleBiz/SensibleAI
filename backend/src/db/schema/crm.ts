import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, numeric, pgSchema, text, timestamp, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./iam.js";
import { businesses, outlets, tenants } from "./tenancy.js";

export const crmSchema = pgSchema("crm");
export const customerStatus = crmSchema.enum("customer_status", ["ACTIVE", "INACTIVE"]);
export const customerLifecycle = crmSchema.enum("customer_lifecycle", ["PROSPECT", "NEW_CUSTOMER", "REPEAT_CUSTOMER"]);
export const customerIdentityType = crmSchema.enum("customer_identity_type", ["MOBILE", "EMAIL", "BUSINESS_LOCATION"]);
export const leadStage = crmSchema.enum("lead_stage", ["NEW", "ASSIGNED", "FOLLOWUP", "WON", "LOST", "DISQUALIFIED"]);
export const stockMovementType = crmSchema.enum("stock_movement_type", ["OPENING", "PURCHASE", "SALE", "RETURN", "ADJUSTMENT", "TRANSFER_OUT", "TRANSFER_IN"]);
export const stockAdjustmentType = crmSchema.enum("stock_adjustment_type", ["CORRECTION", "COUNT", "DAMAGE", "EXPIRED", "OTHER"]);
export const warehouseTransferStatus = crmSchema.enum("warehouse_transfer_status", ["PENDING", "ACCEPTED", "REJECTED", "PARTIALLY_ACCEPTED"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
};

export const customers = crmSchema.table("customers", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull(),
  customerCode: varchar("customer_code", { length: 64 }).notNull(),
  customerName: text("customer_name").notNull(),
  normalizedCustomerName: text("normalized_customer_name").notNull(),
  businessName: text("business_name").notNull().default(""),
  normalizedBusinessName: text("normalized_business_name").notNull().default(""),
  mobile: varchar("mobile", { length: 32 }),
  normalizedMobile: varchar("normalized_mobile", { length: 32 }),
  email: varchar("email", { length: 320 }),
  normalizedEmail: varchar("normalized_email", { length: 320 }),
  businessType: text("business_type").notNull().default(""),
  area: text("area").notNull().default(""),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default(""),
  priority: varchar("priority", { length: 64 }).notNull().default(""),
  source: varchar("source", { length: 200 }).notNull().default(""),
  status: customerStatus("status").notNull().default("ACTIVE"),
  lifecycle: customerLifecycle("lifecycle").notNull().default("PROSPECT"),
  totalEnquiries: integer("total_enquiries").notNull().default(0),
  totalWon: integer("total_won").notNull().default(0),
  totalLost: integer("total_lost").notNull().default(0),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  updatedBy: uuid("updated_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  ...timestamps,
}, (table) => [
  unique("customers_tenant_id_id_uq").on(table.tenantId, table.id),
  unique("customers_tenant_code_uq").on(table.tenantId, table.customerCode),
  foreignKey({ name: "customers_business_tenant_fk", columns: [table.tenantId, table.businessId], foreignColumns: [businesses.tenantId, businesses.id] }).onDelete("restrict"),
  index("customers_tenant_status_idx").on(table.tenantId, table.status),
  index("customers_tenant_mobile_idx").on(table.tenantId, table.normalizedMobile),
  index("customers_tenant_email_idx").on(table.tenantId, table.normalizedEmail),
  index("customers_tenant_name_idx").on(table.tenantId, table.normalizedCustomerName),
  index("customers_tenant_business_name_idx").on(table.tenantId, table.normalizedBusinessName),
  check("customers_counters_nonnegative_ck", sql`${table.totalEnquiries} >= 0 AND ${table.totalWon} >= 0 AND ${table.totalLost} >= 0`),
]);

export const customerOutlets = crmSchema.table("customer_outlets", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  outletId: uuid("outlet_id").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  ...timestamps,
}, (table) => [
  unique("customer_outlets_customer_outlet_uq").on(table.customerId, table.outletId),
  foreignKey({ name: "customer_outlets_customer_tenant_fk", columns: [table.tenantId, table.customerId], foreignColumns: [customers.tenantId, customers.id] }).onDelete("cascade"),
  foreignKey({ name: "customer_outlets_outlet_tenant_fk", columns: [table.tenantId, table.outletId], foreignColumns: [outlets.tenantId, outlets.id] }).onDelete("restrict"),
  uniqueIndex("customer_outlets_primary_uq").on(table.customerId).where(sql`${table.isPrimary}`),
  index("customer_outlets_tenant_outlet_idx").on(table.tenantId, table.outletId),
]);

export const customerIdentities = crmSchema.table("customer_identities", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  identityType: customerIdentityType("identity_type").notNull(),
  normalizedValue: text("normalized_value").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [
  unique("customer_identities_customer_value_uq").on(table.customerId, table.identityType, table.normalizedValue),
  foreignKey({ name: "customer_identities_customer_tenant_fk", columns: [table.tenantId, table.customerId], foreignColumns: [customers.tenantId, customers.id] }).onDelete("cascade"),
  index("customer_identities_lookup_idx").on(table.tenantId, table.identityType, table.normalizedValue),
]);

// -------------------------------------------------------------
// Dynamic Pipeline Stages & Custom Fields
// -------------------------------------------------------------
export const businessPipelineStages = crmSchema.table(
  "business_pipeline_stages",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    businessId: uuid("business_id").notNull(),
    pipelineType: varchar("pipeline_type", { length: 64 }).notNull().default("lead"),
    stageKey: varchar("stage_key", { length: 64 }).notNull(),
    displayName: text("display_name").notNull(),
    stageOrder: integer("stage_order").notNull().default(0),
    stageCategory: varchar("stage_category", { length: 32 }).notNull().default("OPEN"),
    tabColor: varchar("tab_color", { length: 32 }).notNull().default("#2563eb"),
    isActive: boolean("is_active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    unique("business_pipeline_stages_tenant_id_id_uq").on(table.tenantId, table.id),
    unique("business_pipeline_stages_biz_pipeline_key_uq").on(table.businessId, table.pipelineType, table.stageKey),
    foreignKey({
      name: "business_pipeline_stages_biz_tenant_fk",
      columns: [table.tenantId, table.businessId],
      foreignColumns: [businesses.tenantId, businesses.id],
    }).onDelete("cascade"),
    index("business_pipeline_stages_biz_order_idx").on(table.businessId, table.pipelineType, table.stageOrder),
  ],
);

export const businessCustomFields = crmSchema.table(
  "business_custom_fields",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    businessId: uuid("business_id").notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    fieldKey: varchar("field_key", { length: 64 }).notNull(),
    fieldName: text("field_name").notNull(),
    dataType: varchar("data_type", { length: 32 }).notNull().default("text"),
    fieldGroup: varchar("field_group", { length: 64 }).notNull().default("general"),
    options: jsonb("options").notNull().default(sql`'[]'::jsonb`),
    isRequired: boolean("is_required").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("business_custom_fields_tenant_id_id_uq").on(table.tenantId, table.id),
    unique("business_custom_fields_biz_entity_key_uq").on(table.businessId, table.entityType, table.fieldKey),
    foreignKey({
      name: "business_custom_fields_biz_tenant_fk",
      columns: [table.tenantId, table.businessId],
      foreignColumns: [businesses.tenantId, businesses.id],
    }).onDelete("cascade"),
    index("business_custom_fields_biz_entity_idx").on(table.businessId, table.entityType, table.active),
  ],
);

export const leads = crmSchema.table("leads", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull(),
  outletId: uuid("outlet_id").notNull(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, { onDelete: "set null" }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  updatedByUserId: uuid("updated_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  customerName: text("customer_name").notNull().default(""),
  businessName: text("business_name").notNull().default(""),
  businessType: text("business_type").notNull().default(""),
  mobile: varchar("mobile", { length: 32 }).notNull().default(""),
  normalizedMobile: varchar("normalized_mobile", { length: 32 }).notNull().default(""),
  mobileAlt: varchar("mobile_alt", { length: 32 }).notNull().default(""),
  phone: varchar("phone", { length: 32 }).notNull().default(""),
  email: varchar("email", { length: 320 }).notNull().default(""),
  normalizedEmail: varchar("normalized_email", { length: 320 }).notNull().default(""),
  area: text("area").notNull().default(""),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default(""),
  requirement: text("requirement").notNull().default(""),
  stage: varchar("stage", { length: 64 }).notNull().default("NEW"),
  stageId: uuid("stage_id").references(() => businessPipelineStages.id, { onDelete: "set null" }),
  customFields: jsonb("custom_fields").notNull().default(sql`'{}'::jsonb`),
  source: varchar("source", { length: 200 }).notNull().default(""),
  priority: varchar("priority", { length: 64 }).notNull().default(""),
  comments: text("comments").notNull().default(""),
  tags: text("tags").array().notNull().default(sql`'{}'`),
  externalRef: varchar("external_ref", { length: 500 }).notNull().default(""),
  adId: varchar("ad_id", { length: 500 }).notNull().default(""),
  campaign: varchar("campaign", { length: 500 }).notNull().default(""),
  ringing: boolean("ringing").notNull().default(false),
  whatsappShareCount: integer("whatsapp_share_count").notNull().default(0),
  ...timestamps,
}, (table) => [
  unique("leads_tenant_id_id_uq").on(table.tenantId, table.id),
  foreignKey({ name: "leads_business_tenant_fk", columns: [table.tenantId, table.businessId], foreignColumns: [businesses.tenantId, businesses.id] }).onDelete("restrict"),
  foreignKey({ name: "leads_outlet_tenant_fk", columns: [table.tenantId, table.outletId], foreignColumns: [outlets.tenantId, outlets.id] }).onDelete("restrict"),
  foreignKey({ name: "leads_customer_tenant_fk", columns: [table.tenantId, table.customerId], foreignColumns: [customers.tenantId, customers.id] }).onDelete("set null"),
  index("leads_tenant_outlet_stage_idx").on(table.tenantId, table.outletId, table.stage, table.createdAt),
  index("leads_tenant_stage_id_idx").on(table.tenantId, table.stageId),
  index("leads_tenant_customer_idx").on(table.tenantId, table.customerId),
  index("leads_tenant_assigned_idx").on(table.tenantId, table.assignedToUserId),
  index("leads_tenant_mobile_idx").on(table.tenantId, table.normalizedMobile),
  index("leads_tenant_email_idx").on(table.tenantId, table.normalizedEmail),
  check("leads_counters_nonnegative_ck", sql`${table.whatsappShareCount} >= 0`),
]);

export const leadAssignmentHistory = crmSchema.table("lead_assignment_history", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull(),
  leadId: uuid("lead_id").notNull(),
  assignedToUserId: uuid("assigned_to_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  assignedByUserId: uuid("assigned_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ name: "lead_assignment_history_lead_tenant_fk", columns: [table.tenantId, table.leadId], foreignColumns: [leads.tenantId, leads.id] }).onDelete("cascade"),
  index("lead_assignment_history_lead_idx").on(table.tenantId, table.leadId, table.assignedAt),
]);

export const leadStageHistory = crmSchema.table("lead_stage_history", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull(),
  leadId: uuid("lead_id").notNull(),
  fromStage: varchar("from_stage", { length: 64 }),
  toStage: varchar("to_stage", { length: 64 }).notNull(),
  changedByUserId: uuid("changed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  changedAt: timestamp("changed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ name: "lead_stage_history_lead_tenant_fk", columns: [table.tenantId, table.leadId], foreignColumns: [leads.tenantId, leads.id] }).onDelete("cascade"),
  index("lead_stage_history_lead_idx").on(table.tenantId, table.leadId, table.changedAt),
]);

export const leadShareTokens = crmSchema.table("lead_share_tokens", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull(),
  leadId: uuid("lead_id").notNull(),
  token: varchar("token", { length: 64 }).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
}, (table) => [
  unique("lead_share_tokens_token_uq").on(table.token),
  foreignKey({ name: "lead_share_tokens_lead_tenant_fk", columns: [table.tenantId, table.leadId], foreignColumns: [leads.tenantId, leads.id] }).onDelete("cascade"),
  index("lead_share_tokens_lead_idx").on(table.tenantId, table.leadId),
]);

// -------------------------------------------------------------
// Product Categories
// -------------------------------------------------------------
export const productCategories = crmSchema.table("product_categories", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  active: boolean("active").notNull().default(true),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  updatedByUserId: uuid("updated_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  ...timestamps,
}, (table) => [
  unique("product_categories_tenant_id_id_uq").on(table.tenantId, table.id),
  foreignKey({ name: "product_categories_business_tenant_fk", columns: [table.tenantId, table.businessId], foreignColumns: [businesses.tenantId, businesses.id] }).onDelete("restrict"),
  index("product_categories_tenant_idx").on(table.tenantId, table.active, table.isDeleted),
  index("product_categories_name_idx").on(table.tenantId, table.name),
]);

// -------------------------------------------------------------
// Products
// -------------------------------------------------------------
export const products = crmSchema.table("products", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull(),
  name: text("name").notNull(),
  sku: varchar("sku", { length: 128 }).notNull().default(""),
  brand: text("brand").notNull().default(""),
  categoryId: uuid("category_id").references(() => productCategories.id, { onDelete: "set null" }),
  description: text("description").notNull().default(""),
  mrpPrice: numeric("mrp_price", { precision: 14, scale: 2 }).notNull().default("0"),
  price: numeric("price", { precision: 14, scale: 2 }).notNull().default("0"),
  purchasePrice: numeric("purchase_price", { precision: 14, scale: 2 }).notNull().default("0"),
  taxPercent: numeric("tax_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  isAddOn: boolean("is_add_on").notNull().default(false),
  minUnit: jsonb("min_unit").notNull().default(sql`'{}'::jsonb`),
  uidMap: jsonb("uid_map").notNull().default(sql`'{}'::jsonb`),
  customFields: jsonb("custom_fields").notNull().default(sql`'{}'::jsonb`),
  active: boolean("active").notNull().default(true),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  updatedByUserId: uuid("updated_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  ...timestamps,
}, (table) => [
  unique("products_tenant_id_id_uq").on(table.tenantId, table.id),
  foreignKey({ name: "products_business_tenant_fk", columns: [table.tenantId, table.businessId], foreignColumns: [businesses.tenantId, businesses.id] }).onDelete("restrict"),
  check("products_prices_ck", sql`${table.mrpPrice} >= 0 AND ${table.price} >= 0 AND ${table.purchasePrice} >= 0 AND ${table.taxPercent} >= 0`),
  index("products_tenant_idx").on(table.tenantId, table.isDeleted, table.active),
  index("products_tenant_category_idx").on(table.tenantId, table.categoryId),
  index("products_tenant_sku_idx").on(table.tenantId, table.sku),
  index("products_tenant_name_idx").on(table.tenantId, table.name),
]);

// -------------------------------------------------------------
// Product Outlets
// -------------------------------------------------------------
export const productOutlets = crmSchema.table("product_outlets", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull(),
  productId: uuid("product_id").notNull(),
  outletId: uuid("outlet_id").notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (table) => [
  unique("product_outlets_tenant_id_id_uq").on(table.tenantId, table.id),
  unique("product_outlets_product_outlet_uq").on(table.productId, table.outletId),
  foreignKey({ name: "product_outlets_product_tenant_fk", columns: [table.tenantId, table.productId], foreignColumns: [products.tenantId, products.id] }).onDelete("cascade"),
  foreignKey({ name: "product_outlets_outlet_tenant_fk", columns: [table.tenantId, table.outletId], foreignColumns: [outlets.tenantId, outlets.id] }).onDelete("cascade"),
  index("product_outlets_tenant_outlet_idx").on(table.tenantId, table.outletId, table.active),
]);

// -------------------------------------------------------------
// Warehouses
// -------------------------------------------------------------
export const warehouses = crmSchema.table("warehouses", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull(),
  outletId: uuid("outlet_id").notNull(),
  name: text("name").notNull(),
  code: varchar("code", { length: 64 }).notNull().default(""),
  address: text("address").notNull().default(""),
  active: boolean("active").notNull().default(true),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  updatedByUserId: uuid("updated_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  ...timestamps,
}, (table) => [
  unique("warehouses_tenant_id_id_uq").on(table.tenantId, table.id),
  foreignKey({ name: "warehouses_business_tenant_fk", columns: [table.tenantId, table.businessId], foreignColumns: [businesses.tenantId, businesses.id] }).onDelete("restrict"),
  foreignKey({ name: "warehouses_outlet_tenant_fk", columns: [table.tenantId, table.outletId], foreignColumns: [outlets.tenantId, outlets.id] }).onDelete("restrict"),
  index("warehouses_tenant_outlet_idx").on(table.tenantId, table.outletId, table.isDeleted, table.active),
]);

// -------------------------------------------------------------
// Warehouse Stock
// -------------------------------------------------------------
export const warehouseStock = crmSchema.table("warehouse_stock", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull(),
  warehouseId: uuid("warehouse_id").notNull(),
  productId: uuid("product_id").notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 2 }).notNull().default("0"),
  reorderLevel: numeric("reorder_level", { precision: 14, scale: 2 }).notNull().default("0"),
  ...timestamps,
}, (table) => [
  unique("warehouse_stock_tenant_id_id_uq").on(table.tenantId, table.id),
  unique("warehouse_stock_warehouse_product_uq").on(table.warehouseId, table.productId),
  foreignKey({ name: "warehouse_stock_warehouse_tenant_fk", columns: [table.tenantId, table.warehouseId], foreignColumns: [warehouses.tenantId, warehouses.id] }).onDelete("cascade"),
  foreignKey({ name: "warehouse_stock_product_tenant_fk", columns: [table.tenantId, table.productId], foreignColumns: [products.tenantId, products.id] }).onDelete("cascade"),
  check("warehouse_stock_quantity_nonnegative_ck", sql`${table.quantity} >= 0`),
  index("warehouse_stock_tenant_warehouse_idx").on(table.tenantId, table.warehouseId),
  index("warehouse_stock_tenant_product_idx").on(table.tenantId, table.productId),
]);

// -------------------------------------------------------------
// Stock Ledger
// -------------------------------------------------------------
export const stockLedger = crmSchema.table("stock_ledger", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull(),
  outletId: uuid("outlet_id").notNull(),
  warehouseId: uuid("warehouse_id").notNull(),
  productId: uuid("product_id").notNull(),
  movementType: stockMovementType("movement_type").notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 2 }).notNull(),
  balanceAfter: numeric("balance_after", { precision: 14, scale: 2 }).notNull(),
  referenceId: varchar("reference_id", { length: 128 }),
  remarks: text("remarks").notNull().default(""),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [
  unique("stock_ledger_tenant_id_id_uq").on(table.tenantId, table.id),
  foreignKey({ name: "stock_ledger_warehouse_tenant_fk", columns: [table.tenantId, table.warehouseId], foreignColumns: [warehouses.tenantId, warehouses.id] }).onDelete("restrict"),
  foreignKey({ name: "stock_ledger_product_tenant_fk", columns: [table.tenantId, table.productId], foreignColumns: [products.tenantId, products.id] }).onDelete("restrict"),
  index("stock_ledger_tenant_product_idx").on(table.tenantId, table.productId, table.createdAt),
  index("stock_ledger_tenant_warehouse_idx").on(table.tenantId, table.warehouseId, table.createdAt),
]);

// -------------------------------------------------------------
// Stock Adjustments
// -------------------------------------------------------------
export const stockAdjustments = crmSchema.table("stock_adjustments", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull(),
  outletId: uuid("outlet_id").notNull(),
  warehouseId: uuid("warehouse_id").notNull(),
  adjustmentType: stockAdjustmentType("adjustment_type").notNull(),
  reason: text("reason").notNull().default(""),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [
  unique("stock_adjustments_tenant_id_id_uq").on(table.tenantId, table.id),
  foreignKey({ name: "stock_adjustments_warehouse_tenant_fk", columns: [table.tenantId, table.warehouseId], foreignColumns: [warehouses.tenantId, warehouses.id] }).onDelete("restrict"),
  index("stock_adjustments_tenant_warehouse_idx").on(table.tenantId, table.warehouseId, table.createdAt),
]);

export const stockAdjustmentItems = crmSchema.table("stock_adjustment_items", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull(),
  adjustmentId: uuid("adjustment_id").notNull(),
  productId: uuid("product_id").notNull(),
  previousQuantity: numeric("previous_quantity", { precision: 14, scale: 2 }).notNull(),
  newQuantity: numeric("new_quantity", { precision: 14, scale: 2 }).notNull(),
  differenceQuantity: numeric("difference_quantity", { precision: 14, scale: 2 }).notNull(),
}, (table) => [
  foreignKey({ name: "stock_adjustment_items_adjustment_tenant_fk", columns: [table.tenantId, table.adjustmentId], foreignColumns: [stockAdjustments.tenantId, stockAdjustments.id] }).onDelete("cascade"),
  foreignKey({ name: "stock_adjustment_items_product_tenant_fk", columns: [table.tenantId, table.productId], foreignColumns: [products.tenantId, products.id] }).onDelete("restrict"),
  index("stock_adjustment_items_adjustment_idx").on(table.tenantId, table.adjustmentId),
]);

// -------------------------------------------------------------
// Warehouse Transfers
// -------------------------------------------------------------
export const warehouseTransfers = crmSchema.table("warehouse_transfers", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull(),
  outletId: uuid("outlet_id").notNull(),
  productId: uuid("product_id").notNull(),
  fromWarehouseId: uuid("from_warehouse_id").notNull(),
  toWarehouseId: uuid("to_warehouse_id").notNull(),
  requestedQuantity: numeric("requested_quantity", { precision: 14, scale: 2 }).notNull(),
  acceptedQuantity: numeric("accepted_quantity", { precision: 14, scale: 2 }),
  rejectedQuantity: numeric("rejected_quantity", { precision: 14, scale: 2 }),
  status: warehouseTransferStatus("status").notNull().default("PENDING"),
  requestedByUserId: uuid("requested_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  actionTakenByUserId: uuid("action_taken_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  requestDate: timestamp("request_date", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  actionDate: timestamp("action_date", { withTimezone: true, mode: "date" }),
  remarks: text("remarks").notNull().default(""),
  rejectionReason: text("rejection_reason").notNull().default(""),
  ...timestamps,
}, (table) => [
  unique("warehouse_transfers_tenant_id_id_uq").on(table.tenantId, table.id),
  foreignKey({ name: "warehouse_transfers_from_wh_tenant_fk", columns: [table.tenantId, table.fromWarehouseId], foreignColumns: [warehouses.tenantId, warehouses.id] }).onDelete("restrict"),
  foreignKey({ name: "warehouse_transfers_to_wh_tenant_fk", columns: [table.tenantId, table.toWarehouseId], foreignColumns: [warehouses.tenantId, warehouses.id] }).onDelete("restrict"),
  foreignKey({ name: "warehouse_transfers_product_tenant_fk", columns: [table.tenantId, table.productId], foreignColumns: [products.tenantId, products.id] }).onDelete("restrict"),
  check("warehouse_transfers_quantities_ck", sql`${table.requestedQuantity} > 0 AND (${table.acceptedQuantity} IS NULL OR ${table.acceptedQuantity} >= 0) AND (${table.rejectedQuantity} IS NULL OR ${table.rejectedQuantity} >= 0)`),
  index("warehouse_transfers_tenant_outlet_idx").on(table.tenantId, table.outletId, table.status, table.requestDate),
]);
