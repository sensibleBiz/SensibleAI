import { sql } from "drizzle-orm";
import { check, foreignKey, index, numeric, text, timestamp, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./iam.js";
import { crmSchema } from "./crm.js";
import { outlets, tenantMemberships, tenants } from "./tenancy.js";

export const userTrackingHistory = crmSchema.table("user_tracking_history", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").notNull(),
  userId: uuid("user_id").notNull(),
  latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
  address: text("address").notNull().default(""),
  userName: text("user_name").notNull().default(""),
  recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
  accuracyMeters: numeric("accuracy_meters", { precision: 10, scale: 2 }),
  deviceId: varchar("device_id", { length: 200 }),
  externalSource: varchar("external_source", { length: 100 }).notNull().default("mobile"),
  externalId: varchar("external_id", { length: 1500 }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [
  unique("user_tracking_history_tenant_id_id_uq").on(table.tenantId, table.id),
  foreignKey({ name: "user_tracking_history_outlet_tenant_fk", columns: [table.tenantId, table.outletId], foreignColumns: [outlets.tenantId, outlets.id] }).onDelete("cascade"),
  foreignKey({ name: "user_tracking_history_membership_fk", columns: [table.tenantId, table.userId], foreignColumns: [tenantMemberships.tenantId, tenantMemberships.userId] }).onDelete("cascade"),
  index("user_tracking_history_scope_recorded_idx").on(table.tenantId, table.outletId, table.userId, table.recordedAt, table.id),
  uniqueIndex("user_tracking_history_external_uq").on(table.tenantId, table.outletId, table.externalSource, table.externalId).where(sql`${table.externalId} IS NOT NULL`),
  check("user_tracking_history_latitude_ck", sql`${table.latitude} >= -90 AND ${table.latitude} <= 90`),
  check("user_tracking_history_longitude_ck", sql`${table.longitude} >= -180 AND ${table.longitude} <= 180`),
  check("user_tracking_history_accuracy_ck", sql`${table.accuracyMeters} IS NULL OR ${table.accuracyMeters} >= 0`),
]);
