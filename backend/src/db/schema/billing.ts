import { sql } from "drizzle-orm";
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
import { users } from "./iam.js";
import { outlets, tenants } from "./tenancy.js";

export const billingSchema = pgSchema("billing");

// ─────────────────────────────────────────────────────────────────────────────
// billing.wallets — one credit wallet per outlet
// ─────────────────────────────────────────────────────────────────────────────
export const wallets = billingSchema.table(
  "wallets",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
    outletId: uuid("outlet_id").notNull(),
    balanceCredits: numeric("balance_credits", { precision: 16, scale: 4 }).notNull().default("0"),
    reservedCredits: numeric("reserved_credits", { precision: 16, scale: 4 }).notNull().default("0"),
    currency: varchar("currency", { length: 10 }).notNull().default("INR"),
    lowBalanceThreshold: numeric("low_balance_threshold", { precision: 16, scale: 4 }).notNull().default("50000"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    unique("wallets_tenant_outlet_uq").on(table.tenantId, table.outletId),
    unique("wallets_tenant_id_uq").on(table.tenantId, table.id),
    foreignKey({
      name: "wallets_outlet_fk",
      columns: [table.tenantId, table.outletId],
      foreignColumns: [outlets.tenantId, outlets.id],
    }).onDelete("restrict"),
    index("wallets_tenant_idx").on(table.tenantId),
    check("wallets_balance_nonneg_ck", sql`${table.balanceCredits} >= 0`),
    check("wallets_reserved_nonneg_ck", sql`${table.reservedCredits} >= 0`),
    check("wallets_reserved_lte_balance_ck", sql`${table.reservedCredits} <= ${table.balanceCredits}`),
    check("wallets_low_balance_nonneg_ck", sql`${table.lowBalanceThreshold} >= 0`),
    check("wallets_currency_ck", sql`${table.currency} IN ('INR', 'USD', 'EUR')`),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// billing.wallet_transactions — immutable credit ledger (append-only)
// txn_type: CREDIT | DEBIT | RESERVE | RELEASE | REVERSAL
// ─────────────────────────────────────────────────────────────────────────────
export const walletTransactions = billingSchema.table(
  "wallet_transactions",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    walletId: uuid("wallet_id").notNull(),
    txnType: varchar("txn_type", { length: 16 }).notNull(),
    credits: numeric("credits", { precision: 16, scale: 4 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 16, scale: 4 }).notNull(),
    reservedAfter: numeric("reserved_after", { precision: 16, scale: 4 }).notNull(),
    referenceType: varchar("reference_type", { length: 32 }),
    referenceId: uuid("reference_id"),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    description: varchar("description", { length: 500 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    unique("wallet_txns_tenant_id_uq").on(table.tenantId, table.id),
    unique("wallet_txns_idempotency_uq").on(table.walletId, table.idempotencyKey),
    foreignKey({
      name: "wallet_txns_wallet_tenant_fk",
      columns: [table.tenantId, table.walletId],
      foreignColumns: [wallets.tenantId, wallets.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "wallet_txns_outlet_fk",
      columns: [table.tenantId, table.outletId],
      foreignColumns: [outlets.tenantId, outlets.id],
    }).onDelete("restrict"),
    index("wallet_txns_wallet_created_idx").on(table.walletId, table.createdAt),
    index("wallet_txns_tenant_outlet_created_idx").on(table.tenantId, table.outletId, table.createdAt),
    index("wallet_txns_reference_idx")
      .on(table.referenceType, table.referenceId)
      .where(sql`${table.referenceId} IS NOT NULL`),
    check("wallet_txns_type_ck", sql`${table.txnType} IN ('CREDIT','DEBIT','RESERVE','RELEASE','REVERSAL')`),
    check("wallet_txns_credits_positive_ck", sql`${table.credits} > 0`),
    check("wallet_txns_balance_nonneg_ck", sql`${table.balanceAfter} >= 0`),
    check("wallet_txns_reserved_nonneg_ck", sql`${table.reservedAfter} >= 0`),
    check("wallet_txns_metadata_ck", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    check(
      "wallet_txns_ref_coherence_ck",
      sql`(${table.referenceType} IS NULL AND ${table.referenceId} IS NULL) OR (${table.referenceType} IS NOT NULL AND ${table.referenceId} IS NOT NULL)`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// billing.rate_cards — platform-wide service pricing (read-only for app role)
// Managed via migration scripts only. One active rate per
// (service_type, country_code, provider) at a time (partial unique index).
// ─────────────────────────────────────────────────────────────────────────────
export const rateCards = billingSchema.table(
  "rate_cards",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    serviceType: varchar("service_type", { length: 64 }).notNull(),
    countryCode: varchar("country_code", { length: 8 }),
    provider: varchar("provider", { length: 64 }),
    unitLabel: varchar("unit_label", { length: 32 }).notNull(),
    creditsPerUnit: numeric("credits_per_unit", { precision: 10, scale: 4 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    effectiveUntil: timestamp("effective_until", { withTimezone: true, mode: "date" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    // COALESCE(country_code, '') and COALESCE(provider, '') ensure NULL values
    // are treated as equal for uniqueness — only one active default rate card
    // per service_type at a time.
    uniqueIndex("rate_cards_active_service_uq")
      .using(
        "btree",
        table.serviceType,
        sql`COALESCE(${table.countryCode}, '')`,
        sql`COALESCE(${table.provider}, '')`,
      )
      .where(sql`${table.isActive} AND ${table.effectiveUntil} IS NULL`),
    index("rate_cards_service_lookup_idx").on(table.serviceType, table.isActive, table.effectiveFrom),
    check("rate_cards_credits_positive_ck", sql`${table.creditsPerUnit} > 0`),
    check(
      "rate_cards_dates_ck",
      sql`${table.effectiveUntil} IS NULL OR ${table.effectiveUntil} > ${table.effectiveFrom}`,
    ),
    check("rate_cards_service_type_nonempty_ck", sql`length(btrim(${table.serviceType})) > 0`),
    check("rate_cards_unit_nonempty_ck", sql`length(btrim(${table.unitLabel})) > 0`),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// billing.usage_events — per-call metering record
// Written before deduction; status: PENDING → BILLED | INSUFFICIENT | FAILED | REVERSED
// ─────────────────────────────────────────────────────────────────────────────
export const usageEvents = billingSchema.table(
  "usage_events",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    walletId: uuid("wallet_id").notNull(),
    serviceType: varchar("service_type", { length: 64 }).notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull().default("1"),
    unitLabel: varchar("unit_label", { length: 32 }).notNull(),
    rateCardId: uuid("rate_card_id").references(() => rateCards.id, { onDelete: "restrict" }),
    estimatedCredits: numeric("estimated_credits", { precision: 14, scale: 4 }),
    billedCredits: numeric("billed_credits", { precision: 14, scale: 4 }),
    status: varchar("status", { length: 16 }).notNull().default("PENDING"),
    walletTxnId: uuid("wallet_txn_id"),
    referenceType: varchar("reference_type", { length: 32 }),
    referenceId: uuid("reference_id"),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    providerRef: varchar("provider_ref", { length: 255 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    unique("usage_events_tenant_id_uq").on(table.tenantId, table.id),
    unique("usage_events_idempotency_uq").on(table.tenantId, table.idempotencyKey),
    foreignKey({
      name: "usage_events_outlet_fk",
      columns: [table.tenantId, table.outletId],
      foreignColumns: [outlets.tenantId, outlets.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "usage_events_wallet_tenant_fk",
      columns: [table.tenantId, table.walletId],
      foreignColumns: [wallets.tenantId, wallets.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "usage_events_wallet_txn_fk",
      columns: [table.tenantId, table.walletTxnId],
      foreignColumns: [walletTransactions.tenantId, walletTransactions.id],
    }).onDelete("restrict"),
    index("usage_events_wallet_status_idx").on(table.walletId, table.status, table.createdAt),
    index("usage_events_tenant_outlet_created_idx").on(table.tenantId, table.outletId, table.createdAt),
    index("usage_events_reference_idx")
      .on(table.referenceType, table.referenceId)
      .where(sql`${table.referenceId} IS NOT NULL`),
    check("usage_events_quantity_ck", sql`${table.quantity} > 0`),
    check("usage_events_status_ck", sql`${table.status} IN ('PENDING','BILLED','INSUFFICIENT','FAILED','REVERSED')`),
    check("usage_events_billed_nonneg_ck", sql`${table.billedCredits} IS NULL OR ${table.billedCredits} >= 0`),
    check(
      "usage_events_billing_coherence_ck",
      sql`(${table.status} = 'BILLED' AND ${table.billedCredits} IS NOT NULL AND ${table.walletTxnId} IS NOT NULL) OR (${table.status} <> 'BILLED' AND ${table.walletTxnId} IS NULL)`,
    ),
    check("usage_events_metadata_ck", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    check(
      "usage_events_ref_coherence_ck",
      sql`(${table.referenceType} IS NULL AND ${table.referenceId} IS NULL) OR (${table.referenceType} IS NOT NULL AND ${table.referenceId} IS NOT NULL)`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// billing.top_up_orders — payment intents for credit purchases (PhonePe PG)
// status: CREATED → PENDING → SUCCESS | FAILED | EXPIRED | REFUNDED
// ─────────────────────────────────────────────────────────────────────────────
export const topUpOrders = billingSchema.table(
  "top_up_orders",
  {
    id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`),
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    walletId: uuid("wallet_id").notNull(),
    orderRef: varchar("order_ref", { length: 128 }).notNull(),
    provider: varchar("provider", { length: 32 }).notNull().default("phonepe_pg"),
    providerOrderId: varchar("provider_order_id", { length: 255 }),
    providerTxnId: varchar("provider_txn_id", { length: 255 }),
    amountInr: numeric("amount_inr", { precision: 12, scale: 2 }).notNull(),
    creditsToGrant: numeric("credits_to_grant", { precision: 16, scale: 4 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("CREATED"),
    callbackPayload: jsonb("callback_payload").$type<Record<string, unknown>>(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    requestedByUserId: uuid("requested_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    walletTxnId: uuid("wallet_txn_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    reconcileRetryCount: integer("reconcile_retry_count").notNull().default(0),
    reconcileNextRetryAt: timestamp("reconcile_next_retry_at", { withTimezone: true, mode: "date" }),
    reconcileLastFailureClass: varchar("reconcile_last_failure_class", { length: 16 }),
  },
  (table) => [
    unique("top_up_orders_tenant_id_uq").on(table.tenantId, table.id),
    unique("top_up_orders_order_ref_uq").on(table.orderRef),
    unique("top_up_orders_idempotency_uq").on(table.tenantId, table.idempotencyKey),
    // Unique non-null provider_order_id (NULL while awaiting PG initiation response)
    uniqueIndex("top_up_orders_provider_order_uq")
      .on(table.providerOrderId)
      .where(sql`${table.providerOrderId} IS NOT NULL`),
    foreignKey({
      name: "top_up_orders_outlet_fk",
      columns: [table.tenantId, table.outletId],
      foreignColumns: [outlets.tenantId, outlets.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "top_up_orders_wallet_tenant_fk",
      columns: [table.tenantId, table.walletId],
      foreignColumns: [wallets.tenantId, wallets.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "top_up_orders_wallet_txn_fk",
      columns: [table.tenantId, table.walletTxnId],
      foreignColumns: [walletTransactions.tenantId, walletTransactions.id],
    }).onDelete("restrict"),
    index("top_up_orders_wallet_status_idx").on(table.walletId, table.status, table.createdAt),
    index("top_up_orders_tenant_outlet_created_idx").on(table.tenantId, table.outletId, table.createdAt),
    check("top_up_amount_positive_ck", sql`${table.amountInr} > 0`),
    check("top_up_credits_positive_ck", sql`${table.creditsToGrant} > 0`),
    check(
      "top_up_status_ck",
      sql`${table.status} IN ('CREATED','PENDING','SUCCESS','FAILED','EXPIRED','REFUNDED')`,
    ),
    check("top_up_provider_ck", sql`${table.provider} IN ('phonepe_pg','manual','razorpay')`),
    check(
      "top_up_success_coherence_ck",
      sql`(${table.status} = 'SUCCESS' AND ${table.walletTxnId} IS NOT NULL AND ${table.paidAt} IS NOT NULL) OR (${table.status} <> 'SUCCESS' AND ${table.walletTxnId} IS NULL)`,
    ),
    check("top_up_reconcile_failure_class_ck", sql`${table.reconcileLastFailureClass} IS NULL OR ${table.reconcileLastFailureClass} IN ('TRANSIENT','PERMANENT','AMBIGUOUS','DEAD_LETTER')`),
    check("top_up_reconcile_retry_nonneg_ck", sql`${table.reconcileRetryCount} >= 0`),
    index("top_up_orders_reconcile_claim_idx")
      .on(table.reconcileNextRetryAt)
      .where(sql`${table.status} IN ('CREATED','PENDING') AND (${table.reconcileLastFailureClass} IS NULL OR ${table.reconcileLastFailureClass} <> 'DEAD_LETTER')`),
  ],
);
