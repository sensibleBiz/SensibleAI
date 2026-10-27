import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./iam.js";
import { outlets, tenants } from "./tenancy.js";

export const exportsSchema = pgSchema("exports");

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────
export const incoterm = exportsSchema.enum("incoterm", [
  "FOB",
  "CIF",
  "CFR",
  "EXW",
  "DDP",
  "DAP",
  "FCA",
  "CIP",
  "CPT",
]);

export const exportPaymentTerm = exportsSchema.enum("export_payment_term", [
  "LC_AT_SIGHT",
  "LC_USANCE",
  "ADVANCE_TT",
  "DP",
  "DA",
  "OPEN_ACCOUNT",
]);

export const exportOrderStatus = exportsSchema.enum("export_order_status", [
  "DRAFT",
  "CONFIRMED",
  "PRODUCTION",
  "READY_TO_SHIP",
  "SHIPPED",
  "DELIVERED",
  "CLOSED",
  "CANCELLED",
]);

export const lcStatus = exportsSchema.enum("lc_status", [
  "DRAFT",
  "ISSUED",
  "CONFIRMED",
  "NEGOTIATED",
  "DRAWN",
  "EXPIRED",
  "CANCELLED",
]);

export const transportMode = exportsSchema.enum("transport_mode", [
  "SEA",
  "AIR",
  "ROAD",
  "RAIL",
]);

export const shipmentStatus = exportsSchema.enum("shipment_status", [
  "BOOKED",
  "GATED_IN",
  "LOADED",
  "IN_TRANSIT",
  "ARRIVED_PORT",
  "CUSTOMS_CLEARED",
  "DELIVERED",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. FOREIGN BUYERS (Global Importers & Trade Contacts)
// ─────────────────────────────────────────────────────────────────────────────
export const foreignBuyers = exportsSchema.table(
  "foreign_buyers",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").notNull(),
    buyerCode: varchar("buyer_code", { length: 64 }).notNull(),
    buyerName: text("buyer_name").notNull(),
    countryCode: varchar("country_code", { length: 4 }).notNull(), // ISO 3166-1 alpha-2 e.g. 'US', 'DE', 'AE'
    countryName: text("country_name").notNull(),
    destinationPort: text("destination_port").notNull(), // e.g. 'Jebel Ali', 'Hamburg', 'Rotterdam'
    defaultCurrency: varchar("default_currency", { length: 10 }).notNull().default("USD"),
    defaultIncoterm: incoterm("default_incoterm").notNull().default("FOB"),
    defaultPaymentTerm: exportPaymentTerm("default_payment_term").notNull().default("LC_AT_SIGHT"),
    creditLimitUsd: numeric("credit_limit_usd", { precision: 16, scale: 2 }).notNull().default("0.00"),
    riskRating: varchar("risk_rating", { length: 16 }).notNull().default("LOW"), // 'LOW' | 'MEDIUM' | 'HIGH'
    contactPerson: text("contact_person"),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 32 }),
    billingAddress: text("billing_address").notNull().default(""),
    shippingAddress: text("shipping_address").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    unique("foreign_buyers_tenant_code_uq").on(table.tenantId, table.outletId, table.buyerCode),
    unique("foreign_buyers_tenant_id_uq").on(table.tenantId, table.id),
    foreignKey({
      name: "foreign_buyers_outlet_fk",
      columns: [table.tenantId, table.outletId],
      foreignColumns: [outlets.tenantId, outlets.id],
    }).onDelete("restrict"),
    index("foreign_buyers_country_idx").on(table.tenantId, table.countryCode),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. EXPORT ORDERS (Sales Contracts / Proforma Invoices)
// ─────────────────────────────────────────────────────────────────────────────
export const exportOrders = exportsSchema.table(
  "export_orders",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").notNull(),
    orderNumber: varchar("order_number", { length: 64 }).notNull(), // PI Number or Export Contract #
    orderDate: date("order_date").notNull(),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => foreignBuyers.id, { onDelete: "restrict" }),
    incoterm: incoterm("incoterm").notNull().default("FOB"),
    portOfLoading: text("port_of_loading").notNull(), // e.g. 'Nhava Sheva (JNPT)', 'Mundra'
    portOfDischarge: text("port_of_discharge").notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("USD"),
    exchangeRateInr: numeric("exchange_rate_inr", { precision: 10, scale: 4 }).notNull().default("84.0000"),
    totalFobValue: numeric("total_fob_value", { precision: 16, scale: 2 }).notNull().default("0.00"),
    freightInsuranceValue: numeric("freight_insurance_value", { precision: 16, scale: 2 }).notNull().default("0.00"),
    totalInvoiceValue: numeric("total_invoice_value", { precision: 16, scale: 2 }).notNull().default("0.00"),
    paymentTerm: exportPaymentTerm("payment_term").notNull().default("LC_AT_SIGHT"),
    advanceReceivedAmount: numeric("advance_received_amount", { precision: 16, scale: 2 }).notNull().default("0.00"),
    status: exportOrderStatus("status").notNull().default("DRAFT"),
    commercialInvoiceNumber: varchar("commercial_invoice_number", { length: 64 }),
    shippingBillNumber: varchar("shipping_bill_number", { length: 64 }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    unique("export_orders_tenant_number_uq").on(table.tenantId, table.outletId, table.orderNumber),
    unique("export_orders_tenant_id_uq").on(table.tenantId, table.id),
    foreignKey({
      name: "export_orders_outlet_fk",
      columns: [table.tenantId, table.outletId],
      foreignColumns: [outlets.tenantId, outlets.id],
    }).onDelete("restrict"),
    index("export_orders_buyer_idx").on(table.tenantId, table.buyerId),
    index("export_orders_status_idx").on(table.tenantId, table.status),
  ],
);

export const exportOrderItems = exportsSchema.table(
  "export_order_items",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => exportOrders.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull(),
    productId: uuid("product_id"),
    hsCode: varchar("hs_code", { length: 16 }).notNull(),
    itemDescription: text("item_description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("1.000"),
    uom: varchar("uom", { length: 16 }).notNull().default("PCS"),
    unitPriceForeign: numeric("unit_price_foreign", { precision: 16, scale: 4 }).notNull().default("0.0000"),
    totalValueForeign: numeric("total_value_foreign", { precision: 16, scale: 2 }).notNull().default("0.00"),
  },
  (table) => [
    unique("export_order_items_order_line_uq").on(table.orderId, table.lineNumber),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. LETTERS OF CREDIT (LC Banking & Compliance Tracking)
// ─────────────────────────────────────────────────────────────────────────────
export const lettersOfCredit = exportsSchema.table(
  "letters_of_credit",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => exportOrders.id, { onDelete: "restrict" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => foreignBuyers.id, { onDelete: "restrict" }),
    lcNumber: varchar("lc_number", { length: 64 }).notNull(),
    issuingBank: text("issuing_bank").notNull(),
    advisingBank: text("advising_bank"),
    lcValue: numeric("lc_value", { precision: 16, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("USD"),
    issuanceDate: date("issuance_date").notNull(),
    expiryDate: date("expiry_date").notNull(),
    latestShipmentDate: date("latest_shipment_date").notNull(),
    presentationDays: integer("presentation_days").notNull().default(21),
    status: lcStatus("status").notNull().default("ISSUED"),
    requiredDocuments: jsonb("required_documents").notNull().default(sql`'[]'::jsonb`),
    clausesAndConditions: text("clauses_and_conditions"),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    unique("lc_tenant_number_uq").on(table.tenantId, table.outletId, table.lcNumber),
    unique("lc_tenant_id_uq").on(table.tenantId, table.id),
    index("lc_expiry_date_idx").on(table.tenantId, table.expiryDate),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. SHIPMENTS & CONTAINER TRACKING
// ─────────────────────────────────────────────────────────────────────────────
export const shipments = exportsSchema.table(
  "shipments",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => exportOrders.id, { onDelete: "restrict" }),
    shipmentNumber: varchar("shipment_number", { length: 64 }).notNull(),
    transportMode: transportMode("transport_mode").notNull().default("SEA"),
    shippingLineOrCarrier: text("shipping_line_or_carrier").notNull(),
    vesselName: text("vessel_name"),
    voyageOrFlightNumber: varchar("voyage_or_flight_number", { length: 64 }),
    containerNumber: varchar("container_number", { length: 64 }),
    sealNumber: varchar("seal_number", { length: 64 }),
    billOfLadingOrAwb: varchar("bill_of_lading_or_awb", { length: 64 }),
    blDate: date("bl_date"),
    shippingBillNumber: varchar("shipping_bill_number", { length: 64 }),
    shippingBillDate: date("shipping_bill_date"),
    portOfLoading: text("port_of_loading").notNull(),
    portOfDischarge: text("port_of_discharge").notNull(),
    etd: timestamp("etd", { withTimezone: true, mode: "date" }),
    eta: timestamp("eta", { withTimezone: true, mode: "date" }),
    actualDeparture: timestamp("actual_departure", { withTimezone: true, mode: "date" }),
    actualArrival: timestamp("actual_arrival", { withTimezone: true, mode: "date" }),
    status: shipmentStatus("status").notNull().default("BOOKED"),
    currentLocation: text("current_location"),
    trackingLastUpdated: timestamp("tracking_last_updated", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    unique("shipments_tenant_number_uq").on(table.tenantId, table.outletId, table.shipmentNumber),
    unique("shipments_tenant_id_uq").on(table.tenantId, table.id),
    index("shipments_status_idx").on(table.tenantId, table.status),
    index("shipments_container_idx").on(table.tenantId, table.containerNumber),
  ],
);

export const containerMilestones = exportsSchema.table(
  "container_milestones",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").notNull(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    milestoneCode: varchar("milestone_code", { length: 64 }).notNull(),
    milestoneLocation: text("milestone_location").notNull(),
    milestoneTimestamp: timestamp("milestone_timestamp", { withTimezone: true, mode: "date" }).notNull(),
    description: text("description").notNull(),
    rawCarrierPayload: jsonb("raw_carrier_payload"),
    ...timestamps,
  },
  (table) => [
    index("container_milestones_shipment_idx").on(table.tenantId, table.shipmentId),
  ],
);

