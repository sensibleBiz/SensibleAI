/**
 * Top-up service — Phase 6 orchestration for PhonePe PG wallet credit purchases.
 *
 * Lifecycle:
 *   CREATED  — order persisted, PhonePe not yet called
 *   PENDING  — PhonePe initiation succeeded; user redirected to payment page
 *   SUCCESS  — payment verified server-side; wallet credited atomically
 *   FAILED   — payment failed or verification returned non-success
 *   EXPIRED  — order was not completed within 30 minutes (reconciliation marker)
 *
 * Idempotency:
 *   - Initiation: idempotency_key uniqueness enforced by DB; same key returns
 *     the existing order rather than creating a duplicate.
 *   - Wallet credit: keyed on `topup:{orderId}` — the wallet_transactions
 *     idempotency constraint prevents double credit even under concurrent
 *     callbacks or retries.
 *   - Order SUCCESS transition: `UPDATE WHERE status IN ('CREATED', 'PENDING')`
 *     ensures only one concurrent callback can claim the order.
 *
 * Atomicity:
 *   The `updateToSuccess` + `creditWallet` pair executes within a single
 *   withDatabaseContext transaction. If either fails, both roll back — the
 *   order is never marked SUCCESS without its corresponding ledger entry.
 *
 * Credit-to-INR conversion:
 *   Controlled by PHONEPE_PG_CREDITS_PER_INR env var. If unset, top-up
 *   initiation is blocked. This is a required business decision.
 *   Credits are computed via PostgreSQL (ROUND($1::numeric * $2::numeric, 4))
 *   to avoid JS floating-point arithmetic on money values.
 *
 * Reconciliation:
 *   If the server crashes between PhonePe initiation and the PENDING status
 *   update, the order remains CREATED. The bounded reconciliation job queries
 *   stale CREATED/PENDING orders
 *   and uses verifyAndCreditTopUp so confirmation follows the same
 *   authoritative verification and atomic-credit path.
 */

import { v7 as uuidv7 } from "uuid";
import type { TransactionDatabase } from "../../db/context.js";
import { withDatabaseContext } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { env } from "../../config/env.js";
import { billingRepository } from "./billing.repository.js";
import { walletService } from "./wallet.service.js";
import { topUpRepository } from "./topUp.repository.js";
import {
  initiatePayment,
  checkTransactionStatus,
  verifyWebhookAuthorization,
  resolveWebhookCredentials,
  parsePaymentWebhook,
  assertPhonePePgConfigured,
} from "./phonePePg.service.js";
import type {
  InitiateTopUpInput,
  InitiateTopUpResult,
  TopUpOrderRecord,
  VerifyTopUpResult,
} from "./topUp.types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Accepts positive decimal strings with max 2 decimal places (INR amounts)
const INR_AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
// Positive decimal with up to 4dp for credit amounts
const CREDIT_RE = /^\d+(\.\d{1,4})?$/;

const validateUuid = (name: string, value: string) => {
  if (!UUID_RE.test(value)) throw new AppError(400, `${name} must be a valid UUID`, "INVALID_INPUT");
};

const validateAmountInr = (amountInr: string): void => {
  if (!INR_AMOUNT_RE.test(amountInr) || parseFloat(amountInr) <= 0) {
    throw new AppError(400, "amountInr must be a positive decimal string (e.g. '500.00')", "INVALID_AMOUNT");
  }
  const cfg = env.billing.phonePePg;
  const amount = parseFloat(amountInr);
  if (amount < cfg.minAmountInr) {
    throw new AppError(
      400,
      `Minimum top-up amount is ₹${cfg.minAmountInr}`,
      "AMOUNT_TOO_LOW",
    );
  }
  if (amount > cfg.maxAmountInr) {
    throw new AppError(
      400,
      `Maximum top-up amount is ₹${cfg.maxAmountInr}`,
      "AMOUNT_TOO_HIGH",
    );
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Credit conversion — server-side only, from env var
// ─────────────────────────────────────────────────────────────────────────────

const requireConversionRate = (): string => {
  const rate = env.billing.phonePePg.creditsPerInr;
  if (!rate || !CREDIT_RE.test(rate) || parseFloat(rate) <= 0) {
    throw new AppError(
      503,
      "Top-up is not configured: the credit conversion rate (PHONEPE_PG_CREDITS_PER_INR) has not been set. " +
        "A platform administrator must configure this before top-ups can be initiated.",
      "TOPUP_NOT_CONFIGURED",
    );
  }
  return rate;
};

const requireProviderConfiguration = (): void => {
  try {
    assertPhonePePgConfigured();
  } catch (error) {
    throw new AppError(
      503,
      error instanceof Error ? error.message : "PhonePe PG is not configured",
      "TOPUP_PROVIDER_NOT_CONFIGURED",
    );
  }
  requireTopUpUrls();
};

/**
 * Compute credits to grant for an INR amount using PostgreSQL arithmetic.
 * ROUND(amountInr::numeric * creditsPerInr::numeric, 4)
 * Never uses JS floats for the actual credit calculation.
 */
const computeCredits = async (
  db: TransactionDatabase,
  amountInr: string,
  creditsPerInr: string,
): Promise<string> => {
  const result = await db.client.query<{ credits: string }>(`
    SELECT ROUND($1::numeric * $2::numeric, 4)::text AS credits
  `, [amountInr, creditsPerInr]);
  const credits = result.rows[0]?.credits;
  if (!credits) throw new Error("Credit computation returned no result");
  return credits;
};

/**
 * Convert INR string to paise integer (for PhonePe API).
 * e.g. "500.00" → 50000
 * Uses multiplication by 100 on the string-parsed value.
 * This is safe because amounts are validated to max 2 decimal places.
 */
const toPaise = (amountInr: string): number => {
  // Multiply by 100 using integer arithmetic via string manipulation
  const parts = amountInr.split(".");
  const rupees = parseInt(parts[0] ?? "0", 10);
  const paiseStr = (parts[1] ?? "").padEnd(2, "0").slice(0, 2);
  const paise = parseInt(paiseStr, 10);
  return rupees * 100 + paise;
};

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export const topUpService = {

  /**
   * Initiate a wallet top-up via PhonePe PG.
   *
   * Steps:
   *   1. Validate inputs and check conversion rate is configured.
   *   2. Verify the wallet exists for the outlet.
   *   3. Idempotency check — return existing order if already initiated.
   *   4. Compute credits server-side via PostgreSQL.
   *   5. Insert CREATED order in PostgreSQL.
   *   6. Call PhonePe PG initiate API (outside the DB transaction).
   *   7. Update order to PENDING with provider reference.
   *   8. Return redirect URL to caller.
   */
  async initiateTopUp(
    db: TransactionDatabase,
    input: InitiateTopUpInput,
  ): Promise<InitiateTopUpResult> {
    validateUuid("tenantId", input.tenantId);
    validateUuid("outletId", input.outletId);
    validateUuid("requestedByUserId", input.requestedByUserId);
    validateAmountInr(input.amountInr);
    const creditsPerInr = requireConversionRate();
    requireProviderConfiguration();

    const wallet = await billingRepository.findWalletByOutlet(db, input.tenantId, input.outletId);
    if (!wallet) {
      throw new AppError(
        402,
        `Credit wallet not configured for outlet ${input.outletId}. A tenant admin must provision a wallet before top-ups can be made.`,
        "WALLET_NOT_FOUND",
      );
    }

    // Idempotency — same idempotencyKey returns existing result without a new order
    const existing = await topUpRepository.findByIdempotencyKey(db, input.tenantId, input.idempotencyKey);
    if (existing) {
      if (existing.status === "CREATED" || existing.status === "PENDING") {
        return {
          orderId: existing.id,
          orderRef: existing.orderRef,
          redirectUrl: null,
          amountInr: existing.amountInr,
          creditsToGrant: existing.creditsToGrant,
          reused: true,
          status: existing.status,
        };
      }
      // Already SUCCESS/FAILED/EXPIRED — client should create a new idempotency key
      throw new AppError(
        409,
        `Top-up idempotency key reuse: the order for key "${input.idempotencyKey}" is in terminal state "${existing.status}"`,
        "TOPUP_IDEMPOTENCY_KEY_REUSED",
      );
    }

    const creditsToGrant = await computeCredits(db, input.amountInr, creditsPerInr);

    // Generate stable order reference (used as PhonePe merchantOrderId)
    const orderRef = `TU${uuidv7().replace(/-/g, "")}`;

    const order = await topUpRepository.insertOrder(db, {
      tenantId: input.tenantId,
      outletId: input.outletId,
      walletId: wallet.id,
      orderRef,
      amountInr: input.amountInr,
      creditsToGrant,
      idempotencyKey: input.idempotencyKey,
      requestedByUserId: input.requestedByUserId,
    });

    // PhonePe initiation — must NOT be inside the open DB transaction.
    // Commit the CREATED order first, then call the external API.
    // The outer withDatabaseContext COMMIT happens when this async function returns.
    // We return the order now so the transaction closes, then call PhonePe in a
    // separate step from the route handler.
    //
    // NOTE: The route handler (phonePePg.routes.ts) commits the DB transaction by
    // returning from withDatabaseContext, then calls _initiateWithPhonePe in a
    // separate context. This two-phase approach avoids holding a DB connection open
    // during the external HTTP call.
    return {
      orderId: order.id,
      orderRef: order.orderRef,
      redirectUrl: buildRedirectUrl(order.orderRef),
      amountInr: order.amountInr,
      creditsToGrant: order.creditsToGrant,
      reused: false,
      status: "CREATED",
    };
  },

  /**
   * Phase 2 of initiation: call PhonePe API and update order to PENDING.
   * Must be called AFTER the withDatabaseContext that created the CREATED order
   * has committed. Opens a fresh DB context for the PENDING update.
   */
  async callPhonePeAndUpdateOrder(
    tenantId: string,
    userId: string,
    orderId: string,
    orderRef: string,
    amountInr: string,
  ): Promise<{ redirectUrl: string }> {
    const pgResult = await initiatePayment({
      merchantOrderId: orderRef,
      amountPaise: toPaise(amountInr),
      redirectUrl: buildRedirectUrl(orderRef),
    });

    if (!pgResult.success || !pgResult.redirectUrl) {
      // Update order to FAILED — PhonePe refused the initiation
      await withDatabaseContext({ tenantId, userId }, async (db) => {
        await topUpRepository.updateToFailed(db, tenantId, orderId, {
          reason: "PhonePe initiation failed",
          code: pgResult.rawResponse.code ?? "INVALID_CREATE_RESPONSE",
          message: pgResult.rawResponse.message ?? "PhonePe did not create a pending order",
        });
      });
      throw new AppError(
        502,
        `PhonePe payment initiation failed: ${pgResult.rawResponse.message ?? pgResult.rawResponse.code ?? "invalid response"}`,
        "PHONEPE_INITIATION_FAILED",
      );
    }

    await withDatabaseContext({ tenantId, userId }, async (db) => {
      await topUpRepository.updateToInitiated(db, tenantId, orderId, pgResult.providerOrderId!);
    });

    return { redirectUrl: pgResult.redirectUrl };
  },

  /**
   * Verify a top-up payment via server-side PhonePe status check and,
   * if successful, atomically credit the wallet and mark the order SUCCESS.
   *
   * Safe to call multiple times (idempotent):
   *   - If already SUCCESS: returns idempotent=true without a second credit.
   *   - If FAILED/EXPIRED: returns the current status.
   *   - If PENDING/CREATED: calls PhonePe status API, then processes.
   */
  async verifyAndCreditTopUp(
    tenantId: string,
    userId: string,
    outletId: string,
    orderId: string,
  ): Promise<VerifyTopUpResult> {
    const order = await withDatabaseContext(
      { tenantId, userId },
      (db) => topUpRepository.findById(db, tenantId, orderId),
    );
    if (!order) {
      throw new AppError(404, "Top-up order not found", "ORDER_NOT_FOUND");
    }
    if (order.tenantId !== tenantId || order.outletId !== outletId) {
      throw new AppError(403, "Access denied to this top-up order", "ORDER_ACCESS_DENIED");
    }

    // Already in terminal state
    if (order.status === "SUCCESS") {
      return {
        orderId: order.id,
        orderRef: order.orderRef,
        status: "SUCCESS",
        walletTxnId: order.walletTxnId,
        creditsGranted: order.creditsToGrant,
        idempotent: true,
      };
    }
    if (order.status === "EXPIRED" || order.status === "REFUNDED") {
      return {
        orderId: order.id,
        orderRef: order.orderRef,
        status: order.status,
        walletTxnId: null,
        creditsGranted: null,
        idempotent: false,
      };
    }

    // Query PhonePe for current status — outside the open transaction.
    // Return the result to the caller; actual DB update happens in a separate context.
    const statusResult = await checkTransactionStatus(order.orderRef);

    if (statusResult.state === "PENDING" || statusResult.state === "UNKNOWN") {
      return withDatabaseContext({ tenantId, userId }, async (db) => {
        const current = await topUpRepository.findByIdForUpdate(db, tenantId, orderId);
        if (!current) throw new AppError(404, "Top-up order not found", "ORDER_NOT_FOUND");
        if (current.status === "SUCCESS") return successResult(current, true);
        if (current.status === "EXPIRED" || current.status === "REFUNDED") {
          return terminalResult(current);
        }
        if (current.expiresAt && current.expiresAt.getTime() <= Date.now()) {
          const expired = await topUpRepository.updateToExpired(db, tenantId, current.id);
          return terminalResult(expired ?? current, "EXPIRED");
        }
        await topUpRepository.touchVerificationAttempt(db, tenantId, current.id);
        return pendingResult(current);
      });
    }

    if (statusResult.state === "FAILED") {
      return withDatabaseContext({ tenantId, userId }, async (db) => {
        const current = await topUpRepository.findByIdForUpdate(db, tenantId, orderId);
        if (!current) throw new AppError(404, "Top-up order not found", "ORDER_NOT_FOUND");
        if (current.status === "SUCCESS") return successResult(current, true);
        if (current.status === "EXPIRED" || current.status === "REFUNDED") {
          return terminalResult(current);
        }
        const failed = await topUpRepository.updateToFailed(db, tenantId, current.id, {
          reason: "PhonePe status: FAILED",
          code: statusResult.rawResponse.code ?? "PAYMENT_FAILED",
          source: "server_status",
        });
        return terminalResult(failed ?? current, "FAILED");
      });
    }

    // COMPLETED — validate then credit
    if (statusResult.merchantOrderId !== order.orderRef) {
      throw new AppError(422, "Payment order identity mismatch", "ORDER_IDENTITY_MISMATCH");
    }
    if (
      order.providerOrderId &&
      (!statusResult.providerOrderId || statusResult.providerOrderId !== order.providerOrderId)
    ) {
      throw new AppError(422, "PhonePe provider order identity mismatch", "PROVIDER_ORDER_ID_MISMATCH");
    }
    const expectedPaise = toPaise(order.amountInr);
    if (statusResult.amountPaise === null || statusResult.amountPaise !== expectedPaise) {
      throw new AppError(
        422,
        "PhonePe payment amount did not match the top-up order",
        "AMOUNT_MISMATCH",
      );
    }
    if (!statusResult.transactionId) {
      throw new AppError(422, "PhonePe completed status did not include a transaction ID", "PROVIDER_TXN_ID_MISSING");
    }
    const providerTxnId = statusResult.transactionId;

    return withDatabaseContext({ tenantId, userId }, async (db) => {
      const current = await topUpRepository.findByIdForUpdate(db, tenantId, orderId);
      if (!current) throw new AppError(404, "Top-up order not found", "ORDER_NOT_FOUND");
      if (current.outletId !== outletId) {
        throw new AppError(403, "Access denied to this top-up order", "ORDER_ACCESS_DENIED");
      }
      if (current.status === "SUCCESS") return successResult(current, true);
      if (current.status === "EXPIRED" || current.status === "REFUNDED") {
        return terminalResult(current);
      }
      return creditOrderAtomically(
        db,
        current.id,
        tenantId,
        outletId,
        current.orderRef,
        current.creditsToGrant,
        providerTxnId,
        {
          state: "COMPLETED",
          code: statusResult.rawResponse.code ?? "PAYMENT_SUCCESS",
          source: "server_status",
        },
      );
    });
  },

  /**
   * Handle an inbound PhonePe PG webhook callback.
   * Verifies the configured SHA webhook authorization, parses the v2 event,
   * resolves the tenant
   * via admin DB (bypassing RLS), then processes the payment in the correct
   * tenant context.
   *
   * This is the ONLY function that uses findByOrderRefAdmin.
   */
  async handlePhonePeCallback(
    rawBody: unknown,
    authorizationHeader: string,
  ): Promise<void> {
    const { username, password } = resolveWebhookCredentials();
    if (!verifyWebhookAuthorization(authorizationHeader, username, password)) {
      throw new AppError(401, "PhonePe webhook authentication failed", "INVALID_CALLBACK_SIGNATURE");
    }
    let webhook;
    try {
      webhook = parsePaymentWebhook(rawBody);
    } catch (error) {
      throw new AppError(
        400,
        error instanceof Error ? error.message : "Invalid PhonePe webhook",
        "INVALID_CALLBACK",
      );
    }
    const merchantOrderId = webhook.payload.merchantOrderId;

    // Resolve tenant using admin pool — no RLS context available at this point
    const orderInfo = await topUpRepository.findByOrderRefAdmin(merchantOrderId);
    if (!orderInfo) {
      // Unknown order — log but return 200 to prevent PhonePe from retrying
      console.warn(JSON.stringify({
        severity: "WARN",
        event: "PHONEPE_CALLBACK_ORDER_NOT_FOUND",
      }));
      return;
    }

    // Already in terminal state — idempotent return
    if (orderInfo.status === "SUCCESS" || orderInfo.status === "EXPIRED" || orderInfo.status === "REFUNDED") {
      return;
    }

    // A valid callback is only a trigger. Financial state comes from the
    // trusted server-side status API, which also handles duplicate and
    // out-of-order callbacks safely.
    await this.verifyAndCreditTopUp(
      orderInfo.tenantId,
      orderInfo.requestedByUserId,
      orderInfo.outletId,
      orderInfo.id,
    );
    // state === "PENDING" — do nothing; wait for next callback or reconciliation
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildRedirectUrl(orderRef: string): string {
  const { redirectUrl } = requireTopUpUrls();
  const url = new URL(redirectUrl);
  url.searchParams.set("orderRef", orderRef);
  return url.toString();
}

function requireTopUpUrls(): { redirectUrl: string; callbackUrl: string } {
  const cfg = env.billing.phonePePg;
  const parse = (name: string, value: string): string => {
    if (!value) {
      throw new AppError(503, `Top-up is not configured: ${name} is required`, "TOPUP_NOT_CONFIGURED");
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new AppError(503, `Top-up is not configured: ${name} must be a valid URL`, "TOPUP_NOT_CONFIGURED");
    }
    if (env.nodeEnv === "production" && parsed.protocol !== "https:") {
      throw new AppError(503, `Top-up is not configured: ${name} must use HTTPS`, "TOPUP_NOT_CONFIGURED");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new AppError(503, `Top-up is not configured: ${name} must use HTTP(S)`, "TOPUP_NOT_CONFIGURED");
    }
    return parsed.toString();
  };
  return {
    redirectUrl: parse("PHONEPE_PG_REDIRECT_URL", cfg.redirectUrl),
    callbackUrl: parse("PHONEPE_PG_CALLBACK_URL", cfg.callbackUrl),
  };
}

function successResult(order: TopUpOrderRecord, idempotent: boolean): VerifyTopUpResult {
  return {
    orderId: order.id,
    orderRef: order.orderRef,
    status: "SUCCESS",
    walletTxnId: order.walletTxnId,
    creditsGranted: order.creditsToGrant,
    idempotent,
  };
}

function terminalResult(
  order: TopUpOrderRecord,
  status: "FAILED" | "EXPIRED" | "REFUNDED" = order.status as "FAILED" | "EXPIRED" | "REFUNDED",
): VerifyTopUpResult {
  return {
    orderId: order.id,
    orderRef: order.orderRef,
    status,
    walletTxnId: null,
    creditsGranted: null,
    idempotent: false,
  };
}

function pendingResult(order: TopUpOrderRecord): VerifyTopUpResult {
  return {
    orderId: order.id,
    orderRef: order.orderRef,
    status: "PENDING",
    walletTxnId: null,
    creditsGranted: null,
    idempotent: false,
  };
}

async function creditOrderAtomically(
  db: TransactionDatabase,
  orderId: string,
  tenantId: string,
  outletId: string,
  orderRef: string,
  creditsToGrant: string,
  providerTxnId: string,
  callbackPayload: Record<string, unknown>,
): Promise<VerifyTopUpResult> {
  const walletCreditKey = `topup:${orderId}`;

  // Credit the wallet (idempotent by walletCreditKey)
  const creditResult = await walletService.creditWallet(db, tenantId, outletId, {
    amount: creditsToGrant,
    idempotencyKey: walletCreditKey,
    referenceType: "top_up_order",
    referenceId: orderId,
    description: `Wallet top-up: ₹ credited ${creditsToGrant} credits`,
    metadata: { orderRef },
  });

  // Mark order SUCCESS — if 0 rows updated (concurrent callback beat us), the
  // wallet credit idempotency key prevents double credit, so we just return.
  const updatedOrder = await topUpRepository.updateToSuccess(
    db,
    tenantId,
    orderId,
    providerTxnId,
    creditResult.transaction.id,
    callbackPayload,
  );

  if (!updatedOrder) {
    // Concurrent processor claimed the order first; wallet credit was idempotent
    return {
      orderId,
      orderRef,
      status: "SUCCESS",
      walletTxnId: creditResult.transaction.id,
      creditsGranted: creditsToGrant,
      idempotent: true,
    };
  }

  console.info(JSON.stringify({
    event: "TOPUP_SUCCESS",
    tenantId,
    outletId,
    orderId,
    walletTxnId: creditResult.transaction.id,
  }));

  return {
    orderId,
    orderRef,
    status: "SUCCESS",
    walletTxnId: creditResult.transaction.id,
    creditsGranted: creditsToGrant,
    idempotent: false,
  };
}

export type TopUpService = typeof topUpService;
