import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import type {
  TransactionListQuery,
  WalletCreditInput,
  WalletDebitInput,
  WalletMutationResult,
  WalletRecord,
  WalletReservationInput,
  WalletTransactionRecord,
  WalletTxnType,
} from "./billing.types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Row types (snake_case from PostgreSQL)
// ─────────────────────────────────────────────────────────────────────────────

interface WalletRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  outlet_id: string;
  balance_credits: string;
  reserved_credits: string;
  available_credits: string;
  currency: string;
  low_balance_threshold: string;
  is_low_balance: boolean;
  created_at: Date;
  updated_at: Date;
}

interface TxnRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  outlet_id: string;
  wallet_id: string;
  txn_type: WalletTxnType;
  credits: string;
  balance_after: string;
  reserved_after: string;
  reference_type: string | null;
  reference_id: string | null;
  idempotency_key: string;
  actor_user_id: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mappers
// ─────────────────────────────────────────────────────────────────────────────

const WALLET_COLUMNS = `
  id, tenant_id, outlet_id, balance_credits, reserved_credits,
  (balance_credits - reserved_credits) AS available_credits,
  currency, low_balance_threshold,
  (balance_credits - reserved_credits) < low_balance_threshold AS is_low_balance,
  created_at, updated_at
`;

const TXN_COLUMNS = `
  id, tenant_id, outlet_id, wallet_id, txn_type, credits,
  balance_after, reserved_after, reference_type, reference_id,
  idempotency_key, actor_user_id, description, metadata, created_at
`;

const QUALIFIED_TXN_COLUMNS = `
  t.id, t.tenant_id, t.outlet_id, t.wallet_id, t.txn_type, t.credits,
  t.balance_after, t.reserved_after, t.reference_type, t.reference_id,
  t.idempotency_key, t.actor_user_id, t.description, t.metadata, t.created_at
`;

const mapWallet = (row: WalletRow): WalletRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  outletId: row.outlet_id,
  balanceCredits: row.balance_credits,
  reservedCredits: row.reserved_credits,
  availableCredits: row.available_credits,
  currency: row.currency,
  lowBalanceThreshold: row.low_balance_threshold,
  isLowBalance: row.is_low_balance,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapTxn = (row: TxnRow): WalletTransactionRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  outletId: row.outlet_id,
  walletId: row.wallet_id,
  txnType: row.txn_type,
  credits: row.credits,
  balanceAfter: row.balance_after,
  reservedAfter: row.reserved_after,
  referenceType: row.reference_type,
  referenceId: row.reference_id,
  idempotencyKey: row.idempotency_key,
  actorUserId: row.actor_user_id,
  description: row.description,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
});

// ─────────────────────────────────────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────────────────────────────────────

export const billingRepository = {
  // ── Wallet reads ──────────────────────────────────────────────────────────

  async findWalletByOutlet(
    db: TransactionDatabase,
    tenantId: string,
    outletId: string,
  ): Promise<WalletRecord | null> {
    const result = await db.client.query<WalletRow>(`
      SELECT ${WALLET_COLUMNS}
      FROM billing.wallets
      WHERE tenant_id = $1 AND outlet_id = $2
    `, [tenantId, outletId]);
    return result.rows[0] ? mapWallet(result.rows[0]) : null;
  },

  async findWalletById(
    db: TransactionDatabase,
    tenantId: string,
    walletId: string,
  ): Promise<WalletRecord | null> {
    const result = await db.client.query<WalletRow>(`
      SELECT ${WALLET_COLUMNS}
      FROM billing.wallets
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, walletId]);
    return result.rows[0] ? mapWallet(result.rows[0]) : null;
  },

  // ── Wallet creation ───────────────────────────────────────────────────────

  // ON CONFLICT DO NOTHING: concurrent calls produce at most one wallet per outlet.
  async getOrCreateWallet(
    db: TransactionDatabase,
    tenantId: string,
    outletId: string,
    currency = "INR",
  ): Promise<WalletRecord> {
    await db.client.query(`
      INSERT INTO billing.wallets (tenant_id, outlet_id, currency)
      VALUES ($1, $2, $3)
      ON CONFLICT (tenant_id, outlet_id) DO NOTHING
    `, [tenantId, outletId, currency]);

    const result = await db.client.query<WalletRow>(`
      SELECT ${WALLET_COLUMNS}
      FROM billing.wallets
      WHERE tenant_id = $1 AND outlet_id = $2
    `, [tenantId, outletId]);

    if (!result.rows[0]) throw new Error("Wallet creation failed unexpectedly");
    return mapWallet(result.rows[0]);
  },

  // ── Atomic balance mutations ──────────────────────────────────────────────
  //
  // All mutations follow the same sequence within the caller's transaction:
  //   1. SELECT ... FOR UPDATE  — acquire row-level lock; prevents concurrent mutations
  //   2. Check idempotency key  — return existing result if already processed
  //   3. Validate business rule — e.g. sufficient balance
  //   4. INSERT wallet_transactions — immutable ledger entry
  //   5. UPDATE billing.wallets  — adjust balance/reserved; WHERE clause re-checks
  //                                 invariant as defence-in-depth
  //
  // The caller's withDatabaseContext transaction wraps all 5 steps atomically.

  async debitCredits(
    db: TransactionDatabase,
    tenantId: string,
    outletId: string,
    input: WalletDebitInput,
  ): Promise<WalletMutationResult & { insufficientBalance: boolean }> {
    // 1. Lock wallet row
    const lockResult = await db.client.query<WalletRow>(`
      SELECT ${WALLET_COLUMNS}
      FROM billing.wallets
      WHERE tenant_id = $1 AND outlet_id = $2
      FOR UPDATE
    `, [tenantId, outletId]);
    if (!lockResult.rows[0]) return { wallet: null as never, transaction: null as never, idempotent: false, insufficientBalance: false };
    const lockedWallet = lockResult.rows[0];

    // 2. Check idempotency — was this key already processed for this wallet?
    const existingTxn = await db.client.query<TxnRow>(`
      SELECT ${TXN_COLUMNS}
      FROM billing.wallet_transactions
      WHERE wallet_id = $1 AND idempotency_key = $2
    `, [lockedWallet.id, input.idempotencyKey]);

    if (existingTxn.rows[0]) {
      const wallet = await this.findWalletByOutlet(db, tenantId, outletId);
      return { wallet: wallet!, transaction: mapTxn(existingTxn.rows[0]), idempotent: true, insufficientBalance: false };
    }

    // 3. Balance check: available = balance - reserved >= amount
    // PostgreSQL NUMERIC comparison is exact; we send the amount as a text param
    const balanceCheckResult = await db.client.query<{ sufficient: boolean }>(`
      SELECT (balance_credits - reserved_credits) >= $1::numeric AS sufficient
      FROM billing.wallets WHERE id = $2
    `, [input.amount, lockedWallet.id]);
    if (!balanceCheckResult.rows[0]?.sufficient) {
      return { wallet: mapWallet(lockedWallet), transaction: null as never, idempotent: false, insufficientBalance: true };
    }

    // 4. Insert ledger entry; balance_after computed by PostgreSQL to avoid JS float arithmetic
    const txnResult = await db.client.query<TxnRow>(`
      INSERT INTO billing.wallet_transactions (
        tenant_id, outlet_id, wallet_id, txn_type, credits,
        balance_after, reserved_after,
        reference_type, reference_id, idempotency_key,
        actor_user_id, description, metadata
      ) SELECT
        $1, $2, $3, 'DEBIT', $4::numeric,
        balance_credits - $4::numeric,
        reserved_credits,
        $5, $6, $7, $8, $9, $10::jsonb
      FROM billing.wallets WHERE id = $3
      RETURNING ${TXN_COLUMNS}
    `, [
      tenantId, outletId, lockedWallet.id, input.amount,
      input.referenceType ?? null, input.referenceId ?? null,
      input.idempotencyKey, input.actorUserId ?? null,
      input.description ?? null,
      JSON.stringify(input.metadata ?? {}),
    ]);
    const txn = txnResult.rows[0];
    if (!txn) throw new Error("Wallet transaction insert returned no rows");

    // 5. Update wallet balance; WHERE re-checks invariant (defence-in-depth)
    const walletResult = await db.client.query<WalletRow>(`
      UPDATE billing.wallets
      SET balance_credits = balance_credits - $1::numeric,
          updated_at      = NOW()
      WHERE tenant_id = $2 AND id = $3
        AND balance_credits - reserved_credits >= $1::numeric
      RETURNING ${WALLET_COLUMNS}
    `, [input.amount, tenantId, lockedWallet.id]);
    if (!walletResult.rows[0]) throw new Error("Wallet balance update failed the safety check");

    return { wallet: mapWallet(walletResult.rows[0]), transaction: mapTxn(txn), idempotent: false, insufficientBalance: false };
  },

  async creditWallet(
    db: TransactionDatabase,
    tenantId: string,
    outletId: string,
    input: WalletCreditInput,
    txnType: WalletTxnType = "CREDIT",
  ): Promise<WalletMutationResult> {
    // 1. Lock wallet row
    const lockResult = await db.client.query<WalletRow>(`
      SELECT ${WALLET_COLUMNS}
      FROM billing.wallets
      WHERE tenant_id = $1 AND outlet_id = $2
      FOR UPDATE
    `, [tenantId, outletId]);
    if (!lockResult.rows[0]) return { wallet: null as never, transaction: null as never, idempotent: false };
    const lockedWallet = lockResult.rows[0];

    // 2. Check idempotency
    const existingTxn = await db.client.query<TxnRow>(`
      SELECT ${TXN_COLUMNS}
      FROM billing.wallet_transactions
      WHERE wallet_id = $1 AND idempotency_key = $2
    `, [lockedWallet.id, input.idempotencyKey]);

    if (existingTxn.rows[0]) {
      const wallet = await this.findWalletByOutlet(db, tenantId, outletId);
      return { wallet: wallet!, transaction: mapTxn(existingTxn.rows[0]), idempotent: true };
    }

    // 3. Insert ledger entry
    const txnResult = await db.client.query<TxnRow>(`
      INSERT INTO billing.wallet_transactions (
        tenant_id, outlet_id, wallet_id, txn_type, credits,
        balance_after, reserved_after,
        reference_type, reference_id, idempotency_key,
        actor_user_id, description, metadata
      ) SELECT
        $1, $2, $3, $4, $5::numeric,
        balance_credits + $5::numeric,
        reserved_credits,
        $6, $7, $8, $9, $10, $11::jsonb
      FROM billing.wallets WHERE id = $3
      RETURNING ${TXN_COLUMNS}
    `, [
      tenantId, outletId, lockedWallet.id, txnType, input.amount,
      input.referenceType ?? null, input.referenceId ?? null,
      input.idempotencyKey, input.actorUserId ?? null,
      input.description ?? null,
      JSON.stringify(input.metadata ?? {}),
    ]);
    const txn = txnResult.rows[0];
    if (!txn) throw new Error("Wallet credit transaction insert returned no rows");

    // 4. Update wallet balance
    const walletResult = await db.client.query<WalletRow>(`
      UPDATE billing.wallets
      SET balance_credits = balance_credits + $1::numeric,
          updated_at      = NOW()
      WHERE tenant_id = $2 AND id = $3
      RETURNING ${WALLET_COLUMNS}
    `, [input.amount, tenantId, lockedWallet.id]);
    if (!walletResult.rows[0]) throw new Error("Wallet balance update returned no rows");

    return { wallet: mapWallet(walletResult.rows[0]), transaction: mapTxn(txn), idempotent: false };
  },

  // Reserve credits for an in-flight operation.
  // The wallet row is locked; reserved_credits increases while balance_credits stays.
  // Callers MUST eventually release or debit the reservation in a separate transaction.
  async reserveCredits(
    db: TransactionDatabase,
    tenantId: string,
    outletId: string,
    input: WalletReservationInput,
  ): Promise<WalletMutationResult & { insufficientBalance: boolean }> {
    const lockResult = await db.client.query<WalletRow>(`
      SELECT ${WALLET_COLUMNS}
      FROM billing.wallets
      WHERE tenant_id = $1 AND outlet_id = $2
      FOR UPDATE
    `, [tenantId, outletId]);
    if (!lockResult.rows[0]) return { wallet: null as never, transaction: null as never, idempotent: false, insufficientBalance: false };
    const lockedWallet = lockResult.rows[0];

    const existingTxn = await db.client.query<TxnRow>(`
      SELECT ${TXN_COLUMNS}
      FROM billing.wallet_transactions
      WHERE wallet_id = $1 AND idempotency_key = $2
    `, [lockedWallet.id, input.idempotencyKey]);

    if (existingTxn.rows[0]) {
      const wallet = await this.findWalletByOutlet(db, tenantId, outletId);
      return { wallet: wallet!, transaction: mapTxn(existingTxn.rows[0]), idempotent: true, insufficientBalance: false };
    }

    const balanceCheckResult = await db.client.query<{ sufficient: boolean }>(`
      SELECT (balance_credits - reserved_credits) >= $1::numeric AS sufficient
      FROM billing.wallets WHERE id = $2
    `, [input.amount, lockedWallet.id]);
    if (!balanceCheckResult.rows[0]?.sufficient) {
      return { wallet: mapWallet(lockedWallet), transaction: null as never, idempotent: false, insufficientBalance: true };
    }

    const txnResult = await db.client.query<TxnRow>(`
      INSERT INTO billing.wallet_transactions (
        tenant_id, outlet_id, wallet_id, txn_type, credits,
        balance_after, reserved_after,
        reference_type, reference_id, idempotency_key,
        actor_user_id, description, metadata
      ) SELECT
        $1, $2, $3, 'RESERVE', $4::numeric,
        balance_credits,
        reserved_credits + $4::numeric,
        $5, $6, $7, $8, $9, '{}'::jsonb
      FROM billing.wallets WHERE id = $3
      RETURNING ${TXN_COLUMNS}
    `, [
      tenantId, outletId, lockedWallet.id, input.amount,
      input.referenceType ?? null, input.referenceId ?? null,
      input.idempotencyKey, input.actorUserId ?? null,
      input.description ?? null,
    ]);
    if (!txnResult.rows[0]) throw new Error("Reservation insert returned no rows");

    const walletResult = await db.client.query<WalletRow>(`
      UPDATE billing.wallets
      SET reserved_credits = reserved_credits + $1::numeric,
          updated_at       = NOW()
      WHERE tenant_id = $2 AND id = $3
        AND balance_credits - reserved_credits >= $1::numeric
      RETURNING ${WALLET_COLUMNS}
    `, [input.amount, tenantId, lockedWallet.id]);
    if (!walletResult.rows[0]) throw new Error("Reservation wallet update failed the safety check");

    return { wallet: mapWallet(walletResult.rows[0]), transaction: mapTxn(txnResult.rows[0]), idempotent: false, insufficientBalance: false };
  },

  // Release a reservation without charging. Creates a RELEASE ledger entry.
  async releaseReservation(
    db: TransactionDatabase,
    tenantId: string,
    outletId: string,
    input: WalletReservationInput,
  ): Promise<WalletMutationResult> {
    const lockResult = await db.client.query<WalletRow>(`
      SELECT ${WALLET_COLUMNS}
      FROM billing.wallets
      WHERE tenant_id = $1 AND outlet_id = $2
      FOR UPDATE
    `, [tenantId, outletId]);
    if (!lockResult.rows[0]) return { wallet: null as never, transaction: null as never, idempotent: false };
    const lockedWallet = lockResult.rows[0];

    const existingTxn = await db.client.query<TxnRow>(`
      SELECT ${TXN_COLUMNS}
      FROM billing.wallet_transactions
      WHERE wallet_id = $1 AND idempotency_key = $2
    `, [lockedWallet.id, input.idempotencyKey]);

    if (existingTxn.rows[0]) {
      const wallet = await this.findWalletByOutlet(db, tenantId, outletId);
      return { wallet: wallet!, transaction: mapTxn(existingTxn.rows[0]), idempotent: true };
    }

    const txnResult = await db.client.query<TxnRow>(`
      INSERT INTO billing.wallet_transactions (
        tenant_id, outlet_id, wallet_id, txn_type, credits,
        balance_after, reserved_after,
        reference_type, reference_id, idempotency_key,
        actor_user_id, description, metadata
      ) SELECT
        $1, $2, $3, 'RELEASE', $4::numeric,
        balance_credits,
        GREATEST(0, reserved_credits - $4::numeric),
        $5, $6, $7, $8, $9, '{}'::jsonb
      FROM billing.wallets WHERE id = $3
      RETURNING ${TXN_COLUMNS}
    `, [
      tenantId, outletId, lockedWallet.id, input.amount,
      input.referenceType ?? null, input.referenceId ?? null,
      input.idempotencyKey, input.actorUserId ?? null,
      input.description ?? null,
    ]);
    if (!txnResult.rows[0]) throw new Error("Release insert returned no rows");

    const walletResult = await db.client.query<WalletRow>(`
      UPDATE billing.wallets
      SET reserved_credits = GREATEST(0, reserved_credits - $1::numeric),
          updated_at       = NOW()
      WHERE tenant_id = $2 AND id = $3
      RETURNING ${WALLET_COLUMNS}
    `, [input.amount, tenantId, lockedWallet.id]);
    if (!walletResult.rows[0]) throw new Error("Release wallet update returned no rows");

    return { wallet: mapWallet(walletResult.rows[0]), transaction: mapTxn(txnResult.rows[0]), idempotent: false };
  },

  // ── Transaction history ───────────────────────────────────────────────────

  async listTransactions(
    db: TransactionDatabase,
    tenantId: string,
    outletId: string,
    query: TransactionListQuery,
  ): Promise<WalletTransactionRecord[]> {
    const limit = Math.min(query.limit ?? 50, 200);
    const offset = query.offset ?? 0;
    const result = await db.client.query<TxnRow & { wallet_outlet_id: string }>(`
      SELECT ${QUALIFIED_TXN_COLUMNS}
      FROM billing.wallet_transactions t
      JOIN billing.wallets w ON w.id = t.wallet_id
      WHERE t.tenant_id = $1 AND w.outlet_id = $2
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $3 OFFSET $4
    `, [tenantId, outletId, limit, offset]);
    return result.rows.map(mapTxn);
  },
};

export type BillingRepository = typeof billingRepository;
