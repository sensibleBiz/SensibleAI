import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { roles, users } from "./iam.js";

export const tenancySchema = pgSchema("tenancy");
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
};

export const tenants = tenancySchema.table(
  "tenants",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    legacyId: varchar("legacy_id", { length: 64 }),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("tenants_legacy_id_uq").on(table.legacyId).where(sql`${table.legacyId} IS NOT NULL`),
    unique("tenants_slug_uq").on(table.slug),
    index("tenants_active_idx").on(table.active),
  ],
);

export const businesses = tenancySchema.table(
  "businesses",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    legacyId: varchar("legacy_id", { length: 64 }),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("businesses_tenant_id_id_uq").on(table.tenantId, table.id),
    uniqueIndex("businesses_tenant_legacy_id_uq").on(table.tenantId, table.legacyId).where(sql`${table.legacyId} IS NOT NULL`),
    index("businesses_tenant_active_idx").on(table.tenantId, table.active),
  ],
);

export const outlets = tenancySchema.table(
  "outlets",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id").notNull(),
    businessId: uuid("business_id").notNull(),
    legacyId: varchar("legacy_id", { length: 64 }),
    outletCode: varchar("outlet_code", { length: 64 }).notNull(),
    name: text("name").notNull(),
    branch: varchar("branch", { length: 120 }).notNull().default(""),
    address: text("address").notNull().default(""),
    city: varchar("city", { length: 100 }).notNull().default(""),
    state: varchar("state", { length: 100 }).notNull().default(""),
    billingType: varchar("billing_type", { length: 32 }).notNull().default("TRIAL"),
    renewalDate: timestamp("renewal_date", { withTimezone: true, mode: "date" }),
    latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull().default("0"),
    longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull().default("0"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("outlets_tenant_id_id_uq").on(table.tenantId, table.id),
    unique("outlets_tenant_code_uq").on(table.tenantId, table.outletCode),
    uniqueIndex("outlets_tenant_legacy_id_uq").on(table.tenantId, table.legacyId).where(sql`${table.legacyId} IS NOT NULL`),
    index("outlets_business_idx").on(table.businessId),
    index("outlets_tenant_active_idx").on(table.tenantId, table.active),
    foreignKey({
      name: "outlets_business_tenant_fk",
      columns: [table.tenantId, table.businessId],
      foreignColumns: [businesses.tenantId, businesses.id],
    }).onDelete("cascade"),
  ],
);

export const planCatalogs = tenancySchema.table("plan_catalogs", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  features: jsonb("features").notNull().default([]),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export const outletSubscriptions = tenancySchema.table(
  "outlet_subscriptions",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    planTier: varchar("plan_tier", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    permittedUsers: integer("permitted_users").notNull().default(5),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    renewsAt: timestamp("renews_at", { withTimezone: true, mode: "date" }).notNull(),
    externalTransactionId: varchar("external_transaction_id", { length: 200 }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    index("outlet_subscriptions_tenant_renewal_idx").on(table.tenantId, table.renewsAt, table.status),
    foreignKey({
      name: "outlet_subscriptions_outlet_tenant_fk",
      columns: [table.tenantId, table.outletId],
      foreignColumns: [outlets.tenantId, outlets.id],
    }).onDelete("cascade"),
  ],
);

export const tenantMemberships = tenancySchema.table(
  "tenant_memberships",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    isTenantAdmin: boolean("is_tenant_admin").notNull().default(false),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("tenant_memberships_tenant_user_uq").on(table.tenantId, table.userId),
    index("tenant_memberships_user_active_idx").on(table.userId, table.active),
    index("tenant_memberships_tenant_active_idx").on(table.tenantId, table.active),
  ],
);

export const outletAssignments = tenancySchema.table(
  "outlet_assignments",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    userId: uuid("user_id").notNull(),
    roleId: uuid("role_id").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("outlet_assignments_outlet_user_role_uq").on(table.outletId, table.userId, table.roleId),
    index("outlet_assignments_user_active_idx").on(table.userId, table.active),
    index("outlet_assignments_tenant_outlet_active_idx").on(table.tenantId, table.outletId, table.active),
    foreignKey({
      name: "outlet_assignments_outlet_tenant_fk",
      columns: [table.tenantId, table.outletId],
      foreignColumns: [outlets.tenantId, outlets.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "outlet_assignments_membership_fk",
      columns: [table.tenantId, table.userId],
      foreignColumns: [tenantMemberships.tenantId, tenantMemberships.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "outlet_assignments_role_tenant_fk",
      columns: [table.tenantId, table.roleId],
      foreignColumns: [roles.tenantId, roles.id],
    }).onDelete("restrict"),
  ],
);

export const outletFeatures = tenancySchema.table(
  "outlet_features",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    featureKey: varchar("feature_key", { length: 128 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("outlet_features_outlet_key_uq").on(table.outletId, table.featureKey),
    index("outlet_features_tenant_enabled_idx").on(table.tenantId, table.enabled),
    check("outlet_features_key_format_ck", sql`${table.featureKey} ~ '^[a-z][a-z0-9_.-]*$'`),
    foreignKey({
      name: "outlet_features_outlet_tenant_fk",
      columns: [table.tenantId, table.outletId],
      foreignColumns: [outlets.tenantId, outlets.id],
    }).onDelete("cascade"),
  ],
);

export const businessConfigurations = tenancySchema.table(
  "business_configurations",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    businessId: uuid("business_id").notNull(),
    vertical: varchar("vertical", { length: 64 }).notNull().default("default"),
    businessModel: varchar("business_model", { length: 64 }).notNull().default("b2b"),
    templateVersion: varchar("template_version", { length: 32 }).notNull().default("1.0.0"),
    currency: varchar("currency", { length: 10 }).notNull().default("INR"),
    terminologyOverrides: jsonb("terminology_overrides").notNull().default(sql`'{}'::jsonb`),
    isConfigured: boolean("is_configured").notNull().default(false),
    settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    unique("business_configurations_tenant_business_uq").on(table.tenantId, table.businessId),
    index("business_configurations_tenant_vertical_idx").on(table.tenantId, table.vertical),
    foreignKey({
      name: "business_configurations_business_tenant_fk",
      columns: [table.tenantId, table.businessId],
      foreignColumns: [businesses.tenantId, businesses.id],
    }).onDelete("cascade"),
  ],
);
