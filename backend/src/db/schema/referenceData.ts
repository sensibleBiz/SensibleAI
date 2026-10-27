import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgSchema, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";

export const referenceDataSchema = pgSchema("reference_data");
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
};

export const referenceZones = referenceDataSchema.table("zones", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  code: varchar("code", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
}, (table) => [
  index("reference_zones_active_order_idx").on(table.active, table.sortOrder, table.name),
  check("reference_zones_code_ck", sql`${table.code} = upper(btrim(${table.code})) AND length(btrim(${table.code})) > 0`),
]);

export const referenceCountries = referenceDataSchema.table("countries", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  code: varchar("code", { length: 3 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  officialName: varchar("official_name", { length: 240 }).notNull().default(""),
  flag: varchar("flag", { length: 16 }).notNull().default(""),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
}, (table) => [index("reference_countries_active_order_idx").on(table.active, table.sortOrder, table.name)]);

export const referenceStates = referenceDataSchema.table("states", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  countryId: uuid("country_id").notNull().references(() => referenceCountries.id, { onDelete: "restrict" }),
  zoneId: uuid("zone_id").references(() => referenceZones.id, { onDelete: "set null" }),
  code: varchar("code", { length: 12 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
}, (table) => [
  unique("reference_states_country_code_uq").on(table.countryId, table.code),
  unique("reference_states_country_name_uq").on(table.countryId, table.name),
  index("reference_states_country_active_order_idx").on(table.countryId, table.active, table.sortOrder, table.name),
  index("reference_states_zone_idx").on(table.zoneId, table.name),
]);

export const referenceCities = referenceDataSchema.table("cities", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
  stateId: uuid("state_id").notNull().references(() => referenceStates.id, { onDelete: "restrict" }),
  code: varchar("code", { length: 40 }).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
}, (table) => [
  unique("reference_cities_state_code_uq").on(table.stateId, table.code),
  unique("reference_cities_state_name_uq").on(table.stateId, table.name),
  index("reference_cities_state_active_order_idx").on(table.stateId, table.active, table.sortOrder, table.name),
]);
