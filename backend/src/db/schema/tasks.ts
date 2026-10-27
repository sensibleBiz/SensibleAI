import { sql } from "drizzle-orm";
import {
  check, date, foreignKey, index, integer, jsonb, smallint, text, timestamp,
  unique, uuid, varchar,
} from "drizzle-orm/pg-core";
import { crmSchema } from "./crm.js";
import { tenantMemberships, tenants, outlets } from "./tenancy.js";

export const tasks = crmSchema.table("tasks", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").notNull(),
  taskNumber: varchar("task_number", { length: 80 }).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description").notNull().default(""),
  taskType: varchar("task_type", { length: 80 }).notNull().default("GENERAL"),
  priority: varchar("priority", { length: 16 }).notNull().default("MEDIUM"),
  priorityRank: smallint("priority_rank").notNull().default(2),
  status: varchar("status", { length: 24 }).notNull().default("OPEN"),
  assignedToUserId: uuid("assigned_to_user_id"),
  assignedByUserId: uuid("assigned_by_user_id"),
  assignedAt: timestamp("assigned_at", { withTimezone: true, mode: "date" }),
  assignedToDepartment: varchar("assigned_to_department", { length: 120 }).notNull().default(""),
  taskDate: date("task_date", { mode: "string" }).notNull().default(sql`current_date`),
  dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }).notNull(),
  outletTimeZone: varchar("outlet_time_zone", { length: 80 }).notNull().default("Asia/Kolkata"),
  progressPercent: smallint("progress_percent").notNull().default(0),
  version: integer("version").notNull().default(1),
  createdByUserId: uuid("created_by_user_id").notNull(),
  updatedByUserId: uuid("updated_by_user_id").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [
  unique("tasks_tenant_id_id_uq").on(table.tenantId, table.id),
  unique("tasks_tenant_outlet_number_uq").on(table.tenantId, table.outletId, table.taskNumber),
  foreignKey({ name: "tasks_outlet_tenant_fk", columns: [table.tenantId, table.outletId],
    foreignColumns: [outlets.tenantId, outlets.id] }).onDelete("cascade"),
  foreignKey({ name: "tasks_assignee_membership_fk", columns: [table.tenantId, table.assignedToUserId],
    foreignColumns: [tenantMemberships.tenantId, tenantMemberships.userId] }).onDelete("restrict"),
  foreignKey({ name: "tasks_assigner_membership_fk", columns: [table.tenantId, table.assignedByUserId],
    foreignColumns: [tenantMemberships.tenantId, tenantMemberships.userId] }).onDelete("restrict"),
  foreignKey({ name: "tasks_creator_membership_fk", columns: [table.tenantId, table.createdByUserId],
    foreignColumns: [tenantMemberships.tenantId, tenantMemberships.userId] }).onDelete("restrict"),
  foreignKey({ name: "tasks_updater_membership_fk", columns: [table.tenantId, table.updatedByUserId],
    foreignColumns: [tenantMemberships.tenantId, tenantMemberships.userId] }).onDelete("restrict"),
  index("tasks_outlet_updated_idx").on(table.tenantId, table.outletId, table.updatedAt, table.id),
  index("tasks_assignee_due_idx").on(table.tenantId, table.outletId, table.assignedToUserId, table.dueAt, table.id),
  check("tasks_priority_ck", sql`${table.priority} IN ('LOW','MEDIUM','HIGH','URGENT')`),
  check("tasks_priority_rank_ck", sql`${table.priorityRank} BETWEEN 1 AND 4`),
  check("tasks_status_ck", sql`${table.status} IN ('OPEN','ASSIGNED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')`),
  check("tasks_progress_ck", sql`${table.progressPercent} BETWEEN 0 AND 100`),
  check("tasks_version_ck", sql`${table.version} > 0`),
  check("tasks_assignment_ck", sql`(
    (${table.assignedToUserId} IS NULL AND ${table.assignedByUserId} IS NULL AND ${table.assignedAt} IS NULL)
    OR (${table.assignedToUserId} IS NOT NULL AND ${table.assignedByUserId} IS NOT NULL AND ${table.assignedAt} IS NOT NULL)
  )`),
]);

export const taskStatusHistory = crmSchema.table("task_status_history", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").notNull(),
  taskId: uuid("task_id").notNull(),
  action: varchar("action", { length: 40 }).notNull(),
  fromStatus: varchar("from_status", { length: 24 }),
  toStatus: varchar("to_status", { length: 24 }).notNull(),
  reason: varchar("reason", { length: 1000 }).notNull().default(""),
  changedByUserId: uuid("changed_by_user_id").notNull(),
  changedByName: varchar("changed_by_name", { length: 300 }).notNull().default(""),
  oldValue: jsonb("old_value").$type<Record<string, unknown> | null>(),
  newValue: jsonb("new_value").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  changedAt: timestamp("changed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ name: "task_status_history_task_tenant_fk", columns: [table.tenantId, table.taskId],
    foreignColumns: [tasks.tenantId, tasks.id] }).onDelete("cascade"),
  foreignKey({ name: "task_status_history_outlet_tenant_fk", columns: [table.tenantId, table.outletId],
    foreignColumns: [outlets.tenantId, outlets.id] }).onDelete("cascade"),
  foreignKey({ name: "task_status_history_actor_membership_fk", columns: [table.tenantId, table.changedByUserId],
    foreignColumns: [tenantMemberships.tenantId, tenantMemberships.userId] }).onDelete("restrict"),
  index("task_status_history_task_changed_idx").on(table.tenantId, table.outletId, table.taskId, table.changedAt, table.id),
  check("task_status_history_action_ck", sql`${table.action} IN ('CREATED','UPDATED','ASSIGNED','STATUS_CHANGED','DELETED')`),
  check("task_status_history_new_value_ck", sql`jsonb_typeof(${table.newValue}) = 'object'`),
]);
