import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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

export const accountsSchema = pgSchema("accounts");

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────
export const accountType = accountsSchema.enum("account_type", [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
]);

export const voucherType = accountsSchema.enum("voucher_type", [
  "SALES",
  "PURCHASE",
  "PAYMENT",
  "RECEIPT",
  "JOURNAL",
  "CONTRA",
  "PAYROLL",
  "EXPENSE",
]);

export const voucherStatus = accountsSchema.enum("voucher_status", [
  "DRAFT",
  "POSTED",
  "VOID",
]);

export const gstInvoiceType = accountsSchema.enum("gst_invoice_type", [
  "B2B",
  "B2C_LARGE",
  "B2C_SMALL",
  "EXPORT_WITH_PAY",
  "EXPORT_WITHOUT_PAY",
  "DEEMED_EXPORT",
  "REVERSE_CHARGE",
]);

export const gstPaymentStatus = accountsSchema.enum("gst_payment_status", [
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
]);

export const expenseClaimStatus = accountsSchema.enum("expense_claim_status", [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "DISBURSED",
]);

export const tallySyncStatus = accountsSchema.enum("tally_sync_status", [
  "PENDING",
  "SYNCED",
  "FAILED",
  "IGNORED",
]);

export const holidayType = accountsSchema.enum("holiday_type", [
  "NATIONAL",
  "REGIONAL",
  "OPTIONAL",
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
// 1. CHART OF ACCOUNTS (Ledgers Master)
// ─────────────────────────────────────────────────────────────────────────────
export const chartOfAccounts = accountsSchema.table(
  "chart_of_accounts",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").notNull(),
    accountCode: varchar("account_code", { length: 64 }).notNull(),
    accountName: text("account_name").notNull(),
    accountType: accountType("account_type").notNull(),
    parentAccountId: uuid("parent_account_id"),
    currency: varchar("currency", { length: 10 }).notNull().default("INR"),
    currentBalance: numeric("current_balance", { precision: 16, scale: 2 })
      .notNull()
      .default("0.00"),
    isSystem: boolean("is_system").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    tallyLedgerName: text("tally_ledger_name"),
    ...timestamps,
  },
  (table) => [
    unique("coa_tenant_outlet_code_uq").on(table.tenantId, table.outletId, table.accountCode),
    unique("coa_tenant_id_uq").on(table.tenantId, table.id),
    foreignKey({
      name: "coa_outlet_fk",
      columns: [table.tenantId, table.outletId],
      foreignColumns: [outlets.tenantId, outlets.id],
    }).onDelete("restrict"),
    index("coa_tenant_outlet_idx").on(table.tenantId, table.outletId),
    index("coa_account_type_idx").on(table.tenantId, table.accountType),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. GENERAL LEDGER (Double-Entry Journal Vouchers)
// ─────────────────────────────────────────────────────────────────────────────
export const generalLedger = accountsSchema.table(
  "general_ledger",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").notNull(),
    voucherNumber: varchar("voucher_number", { length: 64 }).notNull(),
    voucherType: voucherType("voucher_type").notNull(),
    voucherDate: date("voucher_date").notNull(),
    narration: text("narration").notNull().default(""),
    totalDebit: numeric("total_debit", { precision: 16, scale: 2 }).notNull().default("0.00"),
    totalCredit: numeric("total_credit", { precision: 16, scale: 2 }).notNull().default("0.00"),
    status: voucherStatus("status").notNull().default("POSTED"),
    referenceModule: varchar("reference_module", { length: 64 }), // 'INVOICE' | 'EXPENSE' | 'PAYROLL'
    referenceId: uuid("reference_id"),
    tallyRemoteId: varchar("tally_remote_id", { length: 128 }),
    postedBy: uuid("posted_by").references(() => users.id, { onDelete: "set null" }),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    unique("gl_tenant_outlet_voucher_uq").on(table.tenantId, table.outletId, table.voucherNumber),
    unique("gl_tenant_id_uq").on(table.tenantId, table.id),
    foreignKey({
      name: "gl_outlet_fk",
      columns: [table.tenantId, table.outletId],
      foreignColumns: [outlets.tenantId, outlets.id],
    }).onDelete("restrict"),
    index("gl_tenant_date_idx").on(table.tenantId, table.voucherDate),
    check("gl_balanced_ck", sql`${table.totalDebit} = ${table.totalCredit}`),
  ],
);

export const journalLines = accountsSchema.table(
  "journal_lines",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").notNull(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => generalLedger.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    lineNumber: integer("line_number").notNull(),
    debitAmount: numeric("debit_amount", { precision: 16, scale: 2 }).notNull().default("0.00"),
    creditAmount: numeric("credit_amount", { precision: 16, scale: 2 }).notNull().default("0.00"),
    description: text("description"),
    tallyLedgerName: text("tally_ledger_name"),
  },
  (table) => [
    unique("journal_lines_ledger_line_uq").on(table.ledgerId, table.lineNumber),
    index("journal_lines_account_idx").on(table.tenantId, table.accountId),
    check("journal_lines_nonneg_ck", sql`${table.debitAmount} >= 0 AND ${table.creditAmount} >= 0`),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. GST INVOICES (B2B, B2C, E-Way Bill, E-Invoice)
// ─────────────────────────────────────────────────────────────────────────────
export const gstInvoices = accountsSchema.table(
  "gst_invoices",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").notNull(),
    invoiceNumber: varchar("invoice_number", { length: 64 }).notNull(),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date"),
    invoiceType: gstInvoiceType("invoice_type").notNull().default("B2B"),
    customerId: uuid("customer_id"),
    customerName: text("customer_name").notNull(),
    customerGstin: varchar("customer_gstin", { length: 15 }),
    billingAddress: text("billing_address").notNull().default(""),
    shippingAddress: text("shipping_address").notNull().default(""),
    placeOfSupply: varchar("place_of_supply", { length: 64 }).notNull(), // State name or code
    isInterState: boolean("is_inter_state").notNull().default(false),
    totalTaxableAmount: numeric("total_taxable_amount", { precision: 16, scale: 2 }).notNull().default("0.00"),
    cgstAmount: numeric("cgst_amount", { precision: 16, scale: 2 }).notNull().default("0.00"),
    sgstAmount: numeric("sgst_amount", { precision: 16, scale: 2 }).notNull().default("0.00"),
    igstAmount: numeric("igst_amount", { precision: 16, scale: 2 }).notNull().default("0.00"),
    cessAmount: numeric("cess_amount", { precision: 16, scale: 2 }).notNull().default("0.00"),
    roundOffAmount: numeric("round_off_amount", { precision: 8, scale: 2 }).notNull().default("0.00"),
    totalInvoiceAmount: numeric("total_invoice_amount", { precision: 16, scale: 2 }).notNull().default("0.00"),
    paidAmount: numeric("paid_amount", { precision: 16, scale: 2 }).notNull().default("0.00"),
    paymentStatus: gstPaymentStatus("payment_status").notNull().default("UNPAID"),
    irn: varchar("irn", { length: 128 }), // Invoice Reference Number for e-invoicing
    qrCodeUrl: text("qr_code_url"),
    ewayBillNumber: varchar("eway_bill_number", { length: 64 }),
    ewayBillDate: timestamp("eway_bill_date", { withTimezone: true, mode: "date" }),
    tallySyncStatus: tallySyncStatus("tally_sync_status").notNull().default("PENDING"),
    tallyRemoteId: varchar("tally_remote_id", { length: 128 }),
    tallyAlterId: varchar("tally_alter_id", { length: 64 }),
    notes: text("notes"),
    termsAndConditions: text("terms_and_conditions"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    unique("gst_invoices_tenant_outlet_number_uq").on(table.tenantId, table.outletId, table.invoiceNumber),
    unique("gst_invoices_tenant_id_uq").on(table.tenantId, table.id),
    foreignKey({
      name: "gst_invoices_outlet_fk",
      columns: [table.tenantId, table.outletId],
      foreignColumns: [outlets.tenantId, outlets.id],
    }).onDelete("restrict"),
    index("gst_invoices_tenant_date_idx").on(table.tenantId, table.invoiceDate),
    index("gst_invoices_payment_status_idx").on(table.tenantId, table.paymentStatus),
  ],
);

export const gstInvoiceItems = accountsSchema.table(
  "gst_invoice_items",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").notNull(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => gstInvoices.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull(),
    productId: uuid("product_id"),
    itemDescription: text("item_description").notNull(),
    hsnSacCode: varchar("hsn_sac_code", { length: 16 }).notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("1.000"),
    uom: varchar("uom", { length: 16 }).notNull().default("PCS"),
    unitPrice: numeric("unit_price", { precision: 16, scale: 2 }).notNull().default("0.00"),
    discountAmount: numeric("discount_amount", { precision: 16, scale: 2 }).notNull().default("0.00"),
    taxableAmount: numeric("taxable_amount", { precision: 16, scale: 2 }).notNull().default("0.00"),
    gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("18.00"), // e.g. 5, 12, 18, 28
    cgstAmount: numeric("cgst_amount", { precision: 16, scale: 2 }).notNull().default("0.00"),
    sgstAmount: numeric("sgst_amount", { precision: 16, scale: 2 }).notNull().default("0.00"),
    igstAmount: numeric("igst_amount", { precision: 16, scale: 2 }).notNull().default("0.00"),
    totalAmount: numeric("total_amount", { precision: 16, scale: 2 }).notNull().default("0.00"),
  },
  (table) => [
    unique("gst_invoice_items_invoice_line_uq").on(table.invoiceId, table.lineNumber),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. EXPENSE CLAIMS (GPS Conveyance & Staff Operating Expenses)
// ─────────────────────────────────────────────────────────────────────────────
export const expenseClaims = accountsSchema.table(
  "expense_claims",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").notNull(),
    claimNumber: varchar("claim_number", { length: 64 }).notNull(),
    employeeUserId: uuid("employee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    category: varchar("category", { length: 64 }).notNull(), // 'TRAVEL' | 'FOOD' | 'LODGING' | 'OFFICE_SUPPLIES' | 'FUEL' | 'OTHER'
    title: text("title").notNull(),
    description: text("description"),
    claimDate: date("claim_date").notNull(),
    amount: numeric("amount", { precision: 16, scale: 2 }).notNull(),
    taxAmount: numeric("tax_amount", { precision: 16, scale: 2 }).notNull().default("0.00"),
    receiptUrls: jsonb("receipt_urls").notNull().default(sql`'[]'::jsonb`),
    gpsDistanceKm: numeric("gps_distance_km", { precision: 8, scale: 2 }),
    conveyanceRatePerKm: numeric("conveyance_rate_per_km", { precision: 6, scale: 2 }),
    status: expenseClaimStatus("status").notNull().default("SUBMITTED"),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
    approvalRemarks: text("approval_remarks"),
    disbursedAt: timestamp("disbursed_at", { withTimezone: true, mode: "date" }),
    tallySyncStatus: tallySyncStatus("tally_sync_status").notNull().default("PENDING"),
    tallyRemoteId: varchar("tally_remote_id", { length: 128 }),
    ...timestamps,
  },
  (table) => [
    unique("expense_claims_tenant_number_uq").on(table.tenantId, table.outletId, table.claimNumber),
    unique("expense_claims_tenant_id_uq").on(table.tenantId, table.id),
    foreignKey({
      name: "expense_claims_outlet_fk",
      columns: [table.tenantId, table.outletId],
      foreignColumns: [outlets.tenantId, outlets.id],
    }).onDelete("restrict"),
    index("expense_claims_employee_idx").on(table.tenantId, table.employeeUserId),
    index("expense_claims_status_idx").on(table.tenantId, table.status),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. HOLIDAY CALENDAR (Integrated with Payroll & Attendance Engine)
// ─────────────────────────────────────────────────────────────────────────────
export const holidayCalendar = accountsSchema.table(
  "holiday_calendar",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").notNull(),
    title: text("title").notNull(),
    holidayDate: date("holiday_date").notNull(),
    holidayType: holidayType("holiday_type").notNull().default("NATIONAL"),
    isPaid: boolean("is_paid").notNull().default(true),
    applicableStates: jsonb("applicable_states").notNull().default(sql`'[]'::jsonb`),
    applicableOutlets: jsonb("applicable_outlets").notNull().default(sql`'[]'::jsonb`),
    description: text("description"),
    year: integer("year").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("holiday_tenant_outlet_date_title_uq").on(table.tenantId, table.outletId, table.holidayDate, table.title),
    unique("holiday_tenant_id_uq").on(table.tenantId, table.id),
    foreignKey({
      name: "holiday_outlet_fk",
      columns: [table.tenantId, table.outletId],
      foreignColumns: [outlets.tenantId, outlets.id],
    }).onDelete("restrict"),
    index("holiday_tenant_year_idx").on(table.tenantId, table.year),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. TALLYPRIME 2-WAY CONNECTOR SYNC JOURNAL
// ─────────────────────────────────────────────────────────────────────────────
export const tallySyncJournal = accountsSchema.table(
  "tally_sync_journal",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").notNull(),
    syncDirection: varchar("sync_direction", { length: 32 }).notNull(), // 'PUSH_TO_TALLY' | 'PULL_FROM_TALLY'
    entityType: varchar("entity_type", { length: 32 }).notNull(), // 'INVOICE' | 'EXPENSE' | 'PAYROLL' | 'LEDGER' | 'PAYMENT'
    entityId: uuid("entity_id").notNull(),
    tallyRemoteId: varchar("tally_remote_id", { length: 128 }),
    tallyAlterId: varchar("tally_alter_id", { length: 64 }),
    syncStatus: tallySyncStatus("sync_status").notNull().default("PENDING"),
    errorMessage: text("error_message"),
    payloadHash: varchar("payload_hash", { length: 64 }),
    syncedAt: timestamp("synced_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    index("tally_sync_status_idx").on(table.tenantId, table.syncStatus),
    index("tally_sync_remote_id_idx").on(table.tenantId, table.tallyRemoteId),
  ],
);

