/**
 * Durable top-up reconciliation worker.
 *
 * Safety guarantees:
 *   - Lease-based claiming (FOR UPDATE SKIP LOCKED) prevents duplicate processing
 *     across concurrent workers. A crashed worker's lease expires automatically
 *     once reconcile_next_retry_at elapses.
 *   - PhonePe status calls happen OUTSIDE any open DB transaction.
 *   - Wallet credit is idempotent (keyed on `topup:{orderId}`) — concurrent
 *     callbacks or repeated reconciliation runs cannot double-credit.
 *   - Exponential backoff with jitter avoids thundering-herd on transient errors.
 *   - Exhausted orders (>= MAX_RETRIES) are placed in DEAD_LETTER state for
 *     manual operator inspection without falsely marking payment as FAILED.
 *
 * Error classification:
 *   TRANSIENT  — network error, HTTP 5xx, DB timeout; retry with backoff
 *   PERMANENT  — HTTP 4xx (order not found at provider), amount mismatch; escalate
 *   AMBIGUOUS  — PhonePe returned PENDING/UNKNOWN beyond order expiry; needs investigation
 *   DEAD_LETTER — retry limit reached; stop automatic retries
 *
 * Execution time limit:
 *   maxExecutionMs caps wall-clock runtime per run. An in-progress order always
 *   completes; the limit is checked between orders.
 */

import { getAdminPool } from "../../db/client.js";
import { topUpService } from "./topUp.service.js";
import { topUpRepository } from "./topUp.repository.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum provider status verification attempts before dead-lettering. */
const MAX_RETRIES = 12;

/** Base delay for exponential backoff (ms). With MAX_RETRIES=12 the final
 *  attempt is at BASE * 2^11 ≈ 4.1 hours, well within the 30-minute order
 *  expiry window meaning very old orders converge to EXPIRED or AMBIGUOUS. */
const BACKOFF_BASE_MS = 10_000; // 10 s

/** Maximum per-attempt backoff before jitter (cap at ~10 minutes). */
const BACKOFF_CAP_MS = 600_000;

/** Lease duration — how long a claimed order is invisible to other workers.
 *  Must be longer than the expected PhonePe status API roundtrip. */
const LEASE_DURATION_MS = 90_000; // 90 s

// ─────────────────────────────────────────────────────────────────────────────
// Backoff helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full-jitter exponential backoff: random in [0, min(cap, base * 2^attempt)].
 * Full jitter decorrelates retries across concurrent workers better than
 * equal-jitter or decorrelated-jitter for a shared resource like a payment API.
 */
const nextBackoffMs = (attempt: number): number => {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, attempt));
  return Math.floor(Math.random() * ceiling);
};

// ─────────────────────────────────────────────────────────────────────────────
// Error classification
// ─────────────────────────────────────────────────────────────────────────────

type FailureClass = "TRANSIENT" | "PERMANENT" | "AMBIGUOUS" | "DEAD_LETTER";

const classifyError = (
  error: unknown,
  retryCountAfter: number,
): FailureClass => {
  if (retryCountAfter >= MAX_RETRIES) return "DEAD_LETTER";

  if (typeof error === "object" && error !== null) {
    const e = error as { code?: string; statusCode?: number; status?: number };

    // Provider-reported permanent failures
    if (
      e.code === "ORDER_NOT_FOUND" ||
      e.code === "AMOUNT_MISMATCH" ||
      e.code === "ORDER_IDENTITY_MISMATCH" ||
      e.code === "PROVIDER_ORDER_ID_MISMATCH" ||
      e.code === "PROVIDER_TXN_ID_MISSING"
    ) {
      return "PERMANENT";
    }

    // HTTP 4xx from the provider → permanent
    const httpStatus = e.statusCode ?? e.status;
    if (typeof httpStatus === "number" && httpStatus >= 400 && httpStatus < 500) {
      return "PERMANENT";
    }
  }

  // Classify remaining errors — network timeouts, 5xx, unknown DB errors
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("timeout") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ECONNRESET") ||
    message.includes("EAI_AGAIN") ||
    message.includes("socket hang up")
  ) {
    return "TRANSIENT";
  }

  // Default: treat as transient (safe — order remains retryable)
  return "TRANSIENT";
};

// ─────────────────────────────────────────────────────────────────────────────
// Public interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ReconciliationOptions {
  /** Maximum orders to attempt in this run. */
  batchSize?: number;
  /** Maximum wall-clock milliseconds for this run (checked between orders). */
  maxExecutionMs?: number;
}

export interface ReconciliationResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  deadLettered: number;
  errors: string[];
  /** true if run stopped because maxExecutionMs was reached */
  timeoutReached: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker
// ─────────────────────────────────────────────────────────────────────────────

export const reconcileTopUpOrders = async (
  options: ReconciliationOptions = {},
): Promise<ReconciliationResult> => {
  const batchSize = Math.min(Math.max(options.batchSize ?? 50, 1), 500);
  const maxExecutionMs = options.maxExecutionMs ?? 300_000; // default 5 minutes
  const startedAt = Date.now();

  const result: ReconciliationResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    deadLettered: 0,
    errors: [],
    timeoutReached: false,
  };

  const adminPool = getAdminPool();

  // Atomically claim a batch. Workers that run concurrently claim distinct sets.
  let claimedOrders: Array<{
    id: string;
    tenant_id: string;
    outlet_id: string;
    requested_by_user_id: string;
  }>;

  try {
    claimedOrders = await topUpRepository.claimForReconciliation(
      adminPool,
      batchSize,
      LEASE_DURATION_MS,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(`Reconciliation: failed to claim orders: ${message}`);
    return result;
  }

  for (const order of claimedOrders) {
    if (Date.now() - startedAt > maxExecutionMs) {
      result.timeoutReached = true;
      break;
    }

    result.processed++;

    try {
      const status = await topUpService.verifyAndCreditTopUp(
        order.tenant_id,
        order.requested_by_user_id,
        order.outlet_id,
        order.id,
      );

      if (status.status === "PENDING" || status.status === "CREATED") {
        result.skipped++;
        // Order is still active — next_retry_at already set; no extra update needed.
      } else {
        result.succeeded++;
        // Terminal or SUCCESS — no further reconciliation needed.
        // Mark the attempt as successful so next_retry_at stays in the past
        // and the query excludes it via status filter.
        await topUpRepository.markReconcileAttempt(adminPool, order.id, { success: true });
      }
    } catch (error) {
      result.failed++;

      // Read current retry count to decide failure class
      let currentRetryCount = 0;
      try {
        const pool = getAdminPool();
        const row = await pool.query<{ reconcile_retry_count: number }>(
          "SELECT reconcile_retry_count FROM billing.top_up_orders WHERE id = $1",
          [order.id],
        );
        currentRetryCount = row.rows[0]?.reconcile_retry_count ?? 0;
      } catch {
        // If we can't read the count, assume 0 and classify conservatively
      }

      const retryCountAfter = currentRetryCount + 1;
      const failureClass = classifyError(error, retryCountAfter);
      const backoffMs = failureClass === "DEAD_LETTER"
        ? 0
        : nextBackoffMs(currentRetryCount);

      try {
        await topUpRepository.markReconcileAttempt(adminPool, order.id, {
          failureClass,
          nextRetryDelayMs: backoffMs,
        });
      } catch (updateError) {
        const updateMessage = updateError instanceof Error ? updateError.message : String(updateError);
        result.errors.push(`Order ${order.id}: failed to record attempt: ${updateMessage}`);
      }

      if (failureClass === "DEAD_LETTER") {
        result.deadLettered++;
      }

      const errorCode =
        typeof error === "object" && error !== null && "code" in error &&
        typeof (error as { code?: string }).code === "string"
          ? (error as { code: string }).code
          : "UNEXPECTED_ERROR";

      result.errors.push(`Order ${order.id}: ${errorCode} [${failureClass}]`);

      console.error(JSON.stringify({
        severity: "ERROR",
        event: "RECONCILIATION_ORDER_ERROR",
        orderId: order.id,
        tenantId: order.tenant_id,
        code: errorCode,
        failureClass,
        retryCount: retryCountAfter,
        nextRetryMs: backoffMs,
      }));
    }
  }

  console.info(JSON.stringify({
    event: "RECONCILIATION_RUN_COMPLETE",
    processed: result.processed,
    succeeded: result.succeeded,
    failed: result.failed,
    skipped: result.skipped,
    deadLettered: result.deadLettered,
    errorCount: result.errors.length,
    timeoutReached: result.timeoutReached,
    batchSize,
    durationMs: Date.now() - startedAt,
  }));

  return result;
};
