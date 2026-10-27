import { sql } from "drizzle-orm";
import { char, check, foreignKey, index, integer, numeric, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { crmSchema, leads, products } from "./crm.js";
import { outlets, tenantMemberships, tenants } from "./tenancy.js";

export const quotations = crmSchema.table("quotations", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").notNull(),
  leadId: uuid("lead_id"),
  quotationNumber: varchar("quotation_number", { length: 80 }).notNull(),
  customerName: text("customer_name").notNull().default(""),
  customerMobile: varchar("customer_mobile", { length: 32 }).notNull().default(""),
  currencyCode: char("currency_code", { length: 3 }).notNull().default("INR"),
  incoterm: varchar("incoterm", { length: 3 }),
  terms: text("terms").notNull().default(""),
  subtotal: numeric("subtotal", { precision: 16, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 16, scale: 2 }).notNull(),
  taxPercent: numeric("tax_percent", { precision: 5, scale: 2 }).notNull().default("18"),
  taxAmount: numeric("tax_amount", { precision: 16, scale: 2 }).notNull(),
  totalAmount: numeric("total_amount", { precision: 16, scale: 2 }).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [
  unique("quotations_tenant_id_id_uq").on(table.tenantId, table.id),
  unique("quotations_outlet_number_uq").on(table.tenantId, table.outletId, table.quotationNumber),
  foreignKey({ name: "quotations_outlet_tenant_fk", columns: [table.tenantId, table.outletId],
    foreignColumns: [outlets.tenantId, outlets.id] }).onDelete("cascade"),
  foreignKey({ name: "quotations_lead_tenant_fk", columns: [table.tenantId, table.leadId],
    foreignColumns: [leads.tenantId, leads.id] }).onDelete("restrict"),
  foreignKey({ name: "quotations_creator_membership_fk", columns: [table.tenantId, table.createdByUserId],
    foreignColumns: [tenantMemberships.tenantId, tenantMemberships.userId] }).onDelete("restrict"),
  check("quotations_currency_ck", sql`${table.currencyCode} IN ('USD','EUR','INR')`),
  check("quotations_incoterm_ck", sql`${table.incoterm} IS NULL OR ${table.incoterm} IN ('EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF')`),
  index("quotations_outlet_created_idx").on(table.tenantId, table.outletId, table.createdAt, table.id),
  index("quotations_lead_created_idx").on(table.tenantId, table.leadId, table.createdAt),
]);

export const quotationItems = crmSchema.table("quotation_items", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  quotationId: uuid("quotation_id").notNull(),
  productId: uuid("product_id"),
  lineNumber: integer("line_number").notNull(),
  productName: text("product_name").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("1"),
  mrpUnitPrice: numeric("mrp_unit_price", { precision: 16, scale: 2 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 16, scale: 2 }).notNull(),
  lineSubtotal: numeric("line_subtotal", { precision: 16, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 16, scale: 2 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 16, scale: 2 }).notNull(),
  lineTotal: numeric("line_total", { precision: 16, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [
  unique("quotation_items_quotation_line_uq").on(table.quotationId, table.lineNumber),
  foreignKey({ name: "quotation_items_quotation_tenant_fk", columns: [table.tenantId, table.quotationId],
    foreignColumns: [quotations.tenantId, quotations.id] }).onDelete("cascade"),
  foreignKey({ name: "quotation_items_product_tenant_fk", columns: [table.tenantId, table.productId],
    foreignColumns: [products.tenantId, products.id] }).onDelete("restrict"),
  check("quotation_items_values_ck", sql`${table.lineNumber} > 0 AND ${table.quantity} > 0
    AND ${table.mrpUnitPrice} >= 0 AND ${table.unitPrice} >= 0 AND ${table.unitPrice} <= ${table.mrpUnitPrice}`),
  index("quotation_items_quotation_idx").on(table.tenantId, table.quotationId, table.lineNumber),
]);
