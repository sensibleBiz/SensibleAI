import { sql } from "drizzle-orm";
import { boolean, foreignKey, index, integer, jsonb, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { crmSchema } from "./crm.js";
import { outlets, tenants } from "./tenancy.js";

export const whatsappConversations = crmSchema.table("whatsapp_conversations", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`), tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }), outletId: uuid("outlet_id").notNull(),
  legacyId: varchar("legacy_id", { length: 1500 }), mobile: varchar("mobile", { length: 32 }).notNull(), integratedNumber: varchar("integrated_number", { length: 32 }).notNull().default(""),
  isRead: boolean("is_read").notNull().default(true), unreadCount: integer("unread_count").notNull().default(0), lastReadAt: timestamp("last_read_at", { withTimezone: true, mode: "date" }),
  sentMessages: jsonb("sent_messages").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`), replyMessages: jsonb("reply_messages").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`), metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ name: "whatsapp_conversations_outlet_tenant_fk", columns: [table.tenantId, table.outletId], foreignColumns: [outlets.tenantId, outlets.id] }).onDelete("cascade"),
  unique("whatsapp_conversations_mobile_uq").on(table.tenantId, table.outletId, table.mobile), unique("whatsapp_conversations_legacy_uq").on(table.tenantId, table.outletId, table.legacyId), index("whatsapp_conversations_outlet_updated_idx").on(table.tenantId, table.outletId, table.updatedAt, table.id),
]);
