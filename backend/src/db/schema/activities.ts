import { sql } from "drizzle-orm";
import { check, foreignKey, index, numeric, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./iam.js";
import { businesses, outlets, tenants } from "./tenancy.js";
import { crmSchema, customers, leads } from "./crm.js";

export const activityType = crmSchema.enum("activity_type", ["Follow Up", "Demo", "Installation", "Visit"]);
export const activityStatus = crmSchema.enum("activity_status", ["PENDING", "DONE"]);
export const activityMode = crmSchema.enum("activity_mode", ["Online", "Offline"]);
export const activityPriority = crmSchema.enum("activity_priority", ["Low", "Medium", "High", "Urgent"]);

export const activities = crmSchema.table("activities", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull(), outletId: uuid("outlet_id").notNull(),
  leadId: uuid("lead_id").notNull(), customerId: uuid("customer_id"),
  assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, { onDelete: "set null" }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  updatedByUserId: uuid("updated_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  activityType: activityType("activity_type").notNull(), status: activityStatus("status").notNull().default("PENDING"),
  mode: activityMode("mode").notNull(), priority: activityPriority("priority").notNull(), description: text("description").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: "date" }), completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  leadNameSnapshot: text("lead_name_snapshot").notNull(), leadMobileSnapshot: varchar("lead_mobile_snapshot", { length: 32 }).notNull().default(""),
  leadRequirementSnapshot: text("lead_requirement_snapshot").notNull().default(""), productIdSnapshot: varchar("product_id_snapshot", { length: 1500 }),
  productNameSnapshot: text("product_name_snapshot"), productTypeSnapshot: varchar("product_type_snapshot", { length: 100 }),
  productDealerPriceSnapshot: numeric("product_dealer_price_snapshot", { precision: 14, scale: 2 }), productMrpSnapshot: numeric("product_mrp_snapshot", { precision: 14, scale: 2 }),
  externalProductSource: varchar("external_product_source", { length: 100 }), externalProductId: varchar("external_product_id", { length: 1500 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [
  unique("activities_tenant_id_id_uq").on(table.tenantId, table.id),
  foreignKey({ name: "activities_business_tenant_fk", columns: [table.tenantId, table.businessId], foreignColumns: [businesses.tenantId, businesses.id] }).onDelete("restrict"),
  foreignKey({ name: "activities_outlet_tenant_fk", columns: [table.tenantId, table.outletId], foreignColumns: [outlets.tenantId, outlets.id] }).onDelete("restrict"),
  foreignKey({ name: "activities_lead_tenant_fk", columns: [table.tenantId, table.leadId], foreignColumns: [leads.tenantId, leads.id] }).onDelete("cascade"),
  foreignKey({ name: "activities_customer_tenant_fk", columns: [table.tenantId, table.customerId], foreignColumns: [customers.tenantId, customers.id] }).onDelete("set null"),
  index("activities_tenant_outlet_scheduled_idx").on(table.tenantId, table.outletId, table.scheduledAt, table.id),
  index("activities_tenant_lead_created_idx").on(table.tenantId, table.leadId, table.createdAt, table.id),
  index("activities_tenant_customer_created_idx").on(table.tenantId, table.customerId, table.createdAt, table.id),
  index("activities_tenant_assigned_scheduled_idx").on(table.tenantId, table.assignedToUserId, table.scheduledAt, table.id),
  index("activities_tenant_status_scheduled_idx").on(table.tenantId, table.status, table.scheduledAt, table.id),
  index("activities_tenant_type_created_idx").on(table.tenantId, table.activityType, table.createdAt, table.id),
  check("activities_description_ck", sql`length(btrim(${table.description})) > 0`),
  check("activities_product_prices_ck", sql`(${table.productDealerPriceSnapshot} IS NULL OR ${table.productDealerPriceSnapshot} >= 0) AND (${table.productMrpSnapshot} IS NULL OR ${table.productMrpSnapshot} >= 0)`),
  check("activities_completion_ck", sql`(${table.status} = 'DONE' AND ${table.completedAt} IS NOT NULL) OR (${table.status} = 'PENDING' AND ${table.completedAt} IS NULL)`),
]);
