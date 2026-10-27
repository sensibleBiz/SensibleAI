import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenancy.js";

export const iamSchema = pgSchema("iam");
export const credentialState = iamSchema.enum("credential_state", ["legacy", "argon2id"]);
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
};

export const permissions = iamSchema.table(
  "permissions",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    legacyId: varchar("legacy_id", { length: 64 }),
    key: varchar("permission_key", { length: 160 }).notNull(),
    description: text("description"),
    ...timestamps,
  },
  (table) => [
    unique("permissions_key_uq").on(table.key),
    uniqueIndex("permissions_legacy_id_uq").on(table.legacyId).where(sql`${table.legacyId} IS NOT NULL`),
  ],
);

export const roles = iamSchema.table(
  "roles",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    legacyId: varchar("legacy_id", { length: 64 }),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("roles_tenant_id_id_uq").on(table.tenantId, table.id),
    unique("roles_tenant_name_uq").on(table.tenantId, table.name),
    uniqueIndex("roles_tenant_legacy_id_uq").on(table.tenantId, table.legacyId).where(sql`${table.legacyId} IS NOT NULL`),
    index("roles_tenant_active_idx").on(table.tenantId, table.active),
  ],
);

export const rolePermissions = iamSchema.table(
  "role_permissions",
  {
    tenantId: uuid("tenant_id").notNull(),
    roleId: uuid("role_id").notNull(),
    permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    unique("role_permissions_role_permission_uq").on(table.roleId, table.permissionId),
    foreignKey({
      name: "role_permissions_role_tenant_fk",
      columns: [table.tenantId, table.roleId],
      foreignColumns: [roles.tenantId, roles.id],
    }).onDelete("cascade"),
    index("role_permissions_tenant_idx").on(table.tenantId),
    index("role_permissions_permission_idx").on(table.permissionId),
  ],
);

export const users = iamSchema.table(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    legacyId: varchar("legacy_id", { length: 64 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 32 }),
    displayName: text("display_name").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_uq").on(table.email).where(sql`${table.email} IS NOT NULL`),
    uniqueIndex("users_phone_uq").on(table.phone).where(sql`${table.phone} IS NOT NULL`),
    uniqueIndex("users_legacy_id_uq").on(table.legacyId).where(sql`${table.legacyId} IS NOT NULL`),
    index("users_active_idx").on(table.active),
    check("users_identifier_ck", sql`${table.email} IS NOT NULL OR ${table.phone} IS NOT NULL`),
    check("users_email_normalized_ck", sql`${table.email} IS NULL OR ${table.email} = lower(${table.email})`),
  ],
);

export const userCredentials = iamSchema.table(
  "user_credentials",
  {
    userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    passwordHash: text("password_hash"),
    state: credentialState("state").notNull().default("legacy"),
    migratedAt: timestamp("migrated_at", { withTimezone: true, mode: "date" }),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true, mode: "date" }),
    refreshTokenVersion: integer("refresh_token_version").notNull().default(0),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    check("user_credentials_state_hash_ck", sql`(${table.state} = 'legacy' AND ${table.passwordHash} IS NULL) OR (${table.state} = 'argon2id' AND ${table.passwordHash} LIKE '$argon2id$%')`),
  ],
);
