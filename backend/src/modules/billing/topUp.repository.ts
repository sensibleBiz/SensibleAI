import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import { getAdminPool } from "../../db/client.js";
import type { TopUpOrderRecord, TopUpOrderStatus } from "./topUp.types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Row type (snake_case from PostgreSQL)
// ─────────────────────────────────────────────────────────────────────────────

interface TopUpOrderRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  outlet_id: string;
  wallet_id: string;
  order_ref: string;
  provider: string;
  provider_order_id: string | null;
  provider_txn_id: string | null;
  amount_inr: string;
  credits_to_grant: string;
  status: TopUpOrderStatus;
  callback_payload: Record<string, unknown> | null;
  idempotency_key: string;
  requested_by_user_id: string;
  expires_at: Date | null;
  paid_at: Date | null;
  wallet_txn_id: string | null;
  created_at: Date;
  updated_at: Date;
  reconcile_retry_count: number;
  reconcile_next_retry_at: Date | null;
  reconcile_last_failure_class: string | null;
}

const ORDER_COLUMNS = `
  id, tenant_id, outlet_id, wallet_id, order_ref, provider,
  provider_order_id, provider_txn_id, amount_inr, credits_to_grant,
  status, callback_payload, idempotency_key, requested_by_user_id,
  expires_at, paid_at, wallet_txn_id, created_at, updated_at,
  reconcile_retry_count, reconcile_next_retry_at, reconcile_last_failure_class
`;

const mapOrder = (row: TopUpOrderRow): TopUpOrderRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  outletId: row.outlet_id,
  walletId: row.wallet_id,
  orderRef: row.order_ref,
  provider: row.provider,
  providerOrderId: row.provider_order_id,
  providerTxnId: row.provider_txn_id,
  amountInr: row.amount_inr,
  creditsToGrant: row.credits_to_grant,
  status: row.status,
  callbackPayload: row.callback_payload,
  idempotencyKey: row.idempotency_key,
  requestedByUserId: row.requested_by_user_id,
  expiresAt: row.expires_at,
  paidAt: row.paid_at,
  walletTxnId: row.wallet_txn_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  reconcileRetryCount: row.reconcile_retry_count,
  reconcileNextRetryAt: row.reconcile_next_retry_at,
  reconcileLastFailureClass: row.reconcile_last_failure_class as TopUpOrderRecord["reconcileLastFailureClass"],
});

// ─────────────────────────────────────────────────────────────────────────────
// Repository — application-role (RLS-scoped) operations
// ─────────────────────────────────────────────────────────────────────────────

export const topUpRepository = {
  /** Insert a new CREATED order. idempotency_key uniqueness is enforced by DB. */
  async insertOrder(
    db: TransactionDatabase,
    input: {
      tenantId: string;
      outletId: string;
      walletId: string;
      orderRef: string;
      amountInr: string;
      creditsToGrant: string;
      idempotencyKey: string;
      requestedByUserId: string;
    },
  ): Promise<TopUpOrderRecord> {
    const result = await db.client.query<TopUpOrderRow>(`
      INSERT INTO billing.top_up_orders (
        tenant_id, outlet_id, wallet_id, order_ref, provider,
        amount_inr, credits_to_grant, status, idempotency_key,
        requested_by_user_id, expires_at
      ) VALUES (
        $1, $2, $3, $4, 'phonepe_pg',
        $5::numeric, $6::numeric, 'CREATED', $7,
        $8, NOW() + INTERVAL '30 minutes'
      )
      RETURNING ${ORDER_COLUMNS}
    `, [
      input.tenantId, input.outletId, input.walletId, input.orderRef,
      input.amountInr, input.creditsToGrant, input.idempotencyKey,
      input.requestedByUserId,
    ]);
    const row = result.rows[0];
    if (!row) throw new Error("top_up_orders insert returned no rows");
    return mapOrder(row);
  },

  /** Transition order CREATED → PENDING after PhonePe initiation succeeds. */
  async updateToInitiated(
    db: TransactionDatabase,
    tenantId: string,
    orderId: string,
    providerOrderId: string,
  ): Promise<TopUpOrderRecord | null> {
    const result = await db.client.query<TopUpOrderRow>(`
      UPDATE billing.top_up_orders
      SET status = 'PENDING', provider_order_id = $1, updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3 AND status = 'CREATED'
      RETURNING ${ORDER_COLUMNS}
    `, [providerOrderId, orderId, tenantId]);
    return result.rows[0] ? mapOrder(result.rows[0]) : null;
  },

  /**
   * Atomically transition CREATED|PENDING → SUCCESS and set wallet_txn_id.
   * Returns the updated row, or null if the status was not CREATED/PENDING
   * (e.g., already SUCCESS — idempotent). Caller must check the return value.
   */
  async updateToSuccess(
    db: TransactionDatabase,
    tenantId: string,
    orderId: string,
    providerTxnId: string,
    walletTxnId: string,
    callbackPayload: Record<string, unknown>,
  ): Promise<TopUpOrderRecord | null> {
    const result = await db.client.query<TopUpOrderRow>(`
      UPDATE billing.top_up_orders
      SET status = 'SUCCESS',
          provider_txn_id = $1,
          wallet_txn_id   = $2,
          callback_payload = $3::jsonb,
          paid_at          = NOW(),
          updated_at       = NOW()
      WHERE id = $4 AND tenant_id = $5
        AND status IN ('CREATED', 'PENDING', 'FAILED')
      RETURNING ${ORDER_COLUMNS}
    `, [providerTxnId, walletTxnId, JSON.stringify(callbackPayload), orderId, tenantId]);
    return result.rows[0] ? mapOrder(result.rows[0]) : null;
  },

  /** Transition CREATED|PENDING → FAILED (idempotent — no-op if already SUCCESS). */
  async updateToFailed(
    db: TransactionDatabase,
    tenantId: string,
    orderId: string,
    callbackPayload: Record<string, unknown>,
  ): Promise<TopUpOrderRecord | null> {
    const result = await db.client.query<TopUpOrderRow>(`
      UPDATE billing.top_up_orders
      SET status = 'FAILED',
          callback_payload = $1::jsonb,
          updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3
        AND status IN ('CREATED', 'PENDING')
      RETURNING ${ORDER_COLUMNS}
    `, [JSON.stringify(callbackPayload), orderId, tenantId]);
    return result.rows[0] ? mapOrder(result.rows[0]) : null;
  },

  /** Mark an unfinished, locally expired order without deleting its audit row. */
  async updateToExpired(
    db: TransactionDatabase,
    tenantId: string,
    orderId: string,
  ): Promise<TopUpOrderRecord | null> {
    const result = await db.client.query<TopUpOrderRow>(`
      UPDATE billing.top_up_orders
      SET status = 'EXPIRED', updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
        AND status IN ('CREATED', 'PENDING')
      RETURNING ${ORDER_COLUMNS}
    `, [orderId, tenantId]);
    return result.rows[0] ? mapOrder(result.rows[0]) : null;
  },

  /** Record a non-terminal provider verification attempt for retry spacing. */
  async touchVerificationAttempt(
    db: TransactionDatabase,
    tenantId: string,
    orderId: string,
  ): Promise<void> {
    await db.client.query(`
      UPDATE billing.top_up_orders
      SET updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
        AND status IN ('CREATED', 'PENDING')
    `, [orderId, tenantId]);
  },

  async findById(
    db: TransactionDatabase,
    tenantId: string,
    orderId: string,
  ): Promise<TopUpOrderRecord | null> {
    const result = await db.client.query<TopUpOrderRow>(`
      SELECT ${ORDER_COLUMNS}
      FROM billing.top_up_orders
      WHERE id = $1 AND tenant_id = $2
    `, [orderId, tenantId]);
    return result.rows[0] ? mapOrder(result.rows[0]) : null;
  },

  /** Lock an order before applying its corresponding wallet credit. */
  async findByIdForUpdate(
    db: TransactionDatabase,
    tenantId: string,
    orderId: string,
  ): Promise<TopUpOrderRecord | null> {
    const result = await db.client.query<TopUpOrderRow>(`
      SELECT ${ORDER_COLUMNS}
      FROM billing.top_up_orders
      WHERE id = $1 AND tenant_id = $2
      FOR UPDATE
    `, [orderId, tenantId]);
    return result.rows[0] ? mapOrder(result.rows[0]) : null;
  },

  async findByIdempotencyKey(
    db: TransactionDatabase,
    tenantId: string,
    idempotencyKey: string,
  ): Promise<TopUpOrderRecord | null> {
    const result = await db.client.query<TopUpOrderRow>(`
      SELECT ${ORDER_COLUMNS}
      FROM billing.top_up_orders
      WHERE tenant_id = $1 AND idempotency_key = $2
    `, [tenantId, idempotencyKey]);
    return result.rows[0] ? mapOrder(result.rows[0]) : null;
  },

  /**
   * Claim a batch of stale CREATED/PENDING orders for reconciliation.
   *
   * Uses FOR UPDATE SKIP LOCKED so concurrent workers never contend for the
   * same row. Immediately advances reconcile_next_retry_at by leaseDurationMs
   * so a crashed worker's lease expires automatically.
   *
   * Must be called from within an admin-pool transaction that the caller
   * then commits before making any external network calls.
   *
   * Returns at most batchSize rows. The caller is responsible for updating
   * reconcile_retry_count / reconcile_last_failure_class via
   * markReconcileAttempt after the external call completes.
   */
  async claimForReconciliation(
    pool: import("pg").Pool,
    batchSize: number,
    leaseDurationMs: number,
  ): Promise<Array<{ id: string; tenant_id: string; outlet_id: string; requested_by_user_id: string }>> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const rows = await client.query<{
        id: string;
        tenant_id: string;
        outlet_id: string;
        requested_by_user_id: string;
      }>(`
        UPDATE billing.top_up_orders
        SET reconcile_next_retry_at = NOW() + ($1 * INTERVAL '1 millisecond')
        WHERE id IN (
          SELECT id FROM billing.top_up_orders
          WHERE status IN ('CREATED','PENDING')
            AND (reconcile_last_failure_class IS NULL OR reconcile_last_failure_class <> 'DEAD_LETTER')
            AND (reconcile_next_retry_at IS NULL OR reconcile_next_retry_at <= NOW())
          ORDER BY reconcile_next_retry_at ASC NULLS FIRST
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, tenant_id, outlet_id, requested_by_user_id
      `, [leaseDurationMs, batchSize]);
      await client.query("COMMIT");
      return rows.rows;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Record the outcome of a reconciliation attempt (called after each order).
   *
   * - On success or terminal status: reconcile_retry_count is preserved for
   *   history; no update needed (the status transition already happened).
   * - On failure: increments retry_count and sets next_retry_at using
   *   the provided backoff delay; sets failure_class.
   * - When maxRetries is reached: sets failure_class = 'DEAD_LETTER' and
   *   clears next_retry_at so the order is no longer polled.
   */
  async markReconcileAttempt(
    pool: import("pg").Pool,
    orderId: string,
    outcome: {
      failureClass: "TRANSIENT" | "PERMANENT" | "AMBIGUOUS" | "DEAD_LETTER";
      nextRetryDelayMs: number;
    } | { success: true },
  ): Promise<void> {
    if ("success" in outcome) return;
    const { failureClass, nextRetryDelayMs } = outcome;
    const isDead = failureClass === "DEAD_LETTER";
    await pool.query(`
      UPDATE billing.top_up_orders
      SET reconcile_retry_count        = reconcile_retry_count + 1,
          reconcile_last_failure_class = $1,
          reconcile_next_retry_at      = CASE WHEN $2 THEN NULL
                                              ELSE NOW() + ($3 * INTERVAL '1 millisecond')
                                         END,
          updated_at                   = NOW()
      WHERE id = $4
        AND status IN ('CREATED','PENDING')
    `, [failureClass, isDead, nextRetryDelayMs, orderId]);
  },

  // ─── Admin-pool operations (webhook tenant resolution) ─────────────────────
  // These bypass RLS using DATABASE_ADMIN_URL. Use only for resolving
  // tenant_id from provider references in webhook handlers.

  /**
   * Resolve a top-up order by order_ref without tenant context.
   * Uses the admin pool (DATABASE_ADMIN_URL) — strictly for webhook handlers.
   * Never use this for application queries that can go through the app pool.
   */
  async findByOrderRefAdmin(orderRef: string): Promise<{
    id: string;
    tenantId: string;
    outletId: string;
    requestedByUserId: string;
    amountInr: string;
    status: TopUpOrderStatus;
  } | null> {
    const pool = getAdminPool();
    const result = await pool.query<{
      id: string;
      tenant_id: string;
      outlet_id: string;
      requested_by_user_id: string;
      amount_inr: string;
      status: TopUpOrderStatus;
    }>(`
      SELECT id, tenant_id, outlet_id, requested_by_user_id, amount_inr, status
      FROM billing.top_up_orders
      WHERE order_ref = $1
    `, [orderRef]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      outletId: row.outlet_id,
      requestedByUserId: row.requested_by_user_id,
      amountInr: row.amount_inr,
      status: row.status,
    };
  },
};

export type TopUpRepository = typeof topUpRepository;
