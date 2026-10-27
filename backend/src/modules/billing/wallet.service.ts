import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { billingRepository } from "./billing.repository.js";
import type {
  TransactionListQuery,
  WalletCreditInput,
  WalletDebitInput,
  WalletMutationResult,
  WalletRecord,
  WalletReservationInput,
  WalletTransactionRecord,
} from "./billing.types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Amount validation
// Accepts positive decimal strings with up to 4 decimal places.
// Never use parseFloat/Number for monetary arithmetic — only for zero-check.
// ─────────────────────────────────────────────────────────────────────────────
const CREDIT_AMOUNT_RE = /^\d+(\.\d{1,4})?$/;

const validateAmount = (amount: unknown, field = "amount"): void => {
  if (typeof amount !== "string" || !CREDIT_AMOUNT_RE.test(amount)) {
    throw new AppError(
      400,
      `${field} must be a positive decimal string with up to 4 decimal places (e.g. "100.0000")`,
      "INVALID_AMOUNT",
    );
  }
  // parseFloat is safe here — we only test for > 0, not for arithmetic
  if (parseFloat(amount) <= 0) {
    throw new AppError(400, `${field} must be greater than zero`, "INVALID_AMOUNT");
  }
};

const validateIdempotencyKey = (key: unknown): void => {
  if (typeof key !== "string" || key.length < 8 || key.length > 128) {
    throw new AppError(400, "idempotencyKey must be a string between 8 and 128 characters", "INVALID_IDEMPOTENCY_KEY");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: resolve wallet or throw
// ─────────────────────────────────────────────────────────────────────────────
const requireWallet = async (
  db: TransactionDatabase,
  tenantId: string,
  outletId: string,
): Promise<WalletRecord> => {
  const wallet = await billingRepository.findWalletByOutlet(db, tenantId, outletId);
  if (!wallet) throw new AppError(404, "Credit wallet not found for this outlet", "WALLET_NOT_FOUND");
  return wallet;
};

// ─────────────────────────────────────────────────────────────────────────────
// Wallet service
// ─────────────────────────────────────────────────────────────────────────────

export const walletService = {

  // ── Read operations ─────────────────────────────────────────────────────

  async getWallet(
    db: TransactionDatabase,
    tenantId: string,
    outletId: string,
  ): Promise<WalletRecord> {
    return requireWallet(db, tenantId, outletId);
  },

  async getBalance(
    db: TransactionDatabase,
    tenantId: string,
    outletId: string,
  ): Promise<{ balanceCredits: string; reservedCredits: string; availableCredits: string; currency: string }> {
    const wallet = await requireWallet(db, tenantId, outletId);
    return {
      balanceCredits: wallet.balanceCredits,
      reservedCredits: wallet.reservedCredits,
      availableCredits: wallet.availableCredits,
      currency: wallet.currency,
    };
  },

  // ── Wallet initialisation ────────────────────────────────────────────────

  // Creates a wallet if one does not already exist.
  // Safe to call concurrently — ON CONFLICT ensures exactly one wallet per outlet.
  async getOrCreateWallet(
    db: TransactionDatabase,
    tenantId: string,
    outletId: string,
    currency?: string,
  ): Promise<WalletRecord> {
    return billingRepository.getOrCreateWallet(db, tenantId, outletId, currency);
  },

  // ── Balance mutations ───────────────────────────────────────────────────

  // Debit credits from the wallet (immediate charge).
  // Throws INSUFFICIENT_CREDITS when available < amount.
  // Idempotent: a repeated call with the same idempotencyKey and same wallet
  // returns the original result without applying a second debit.
  async debitCredits(
    db: TransactionDatabase,
    tenantId: string,
    outletId: string,
    input: WalletDebitInput,
  ): Promise<WalletMutationResult> {
    validateAmount(input.amount);
    validateIdempotencyKey(input.idempotencyKey);

    const result = await billingRepository.debitCredits(db, tenantId, outletId, input);

    if (!result.wallet) {
      throw new AppError(404, "Credit wallet not found for this outlet", "WALLET_NOT_FOUND");
    }
    if (result.insufficientBalance) {
      throw new AppError(
        402,
        `Insufficient credits: required ${input.amount}, available ${result.wallet.availableCredits}`,
        "INSUFFICIENT_CREDITS",
      );
    }

    if (!result.idempotent) {
      console.info(JSON.stringify({
        event: "WALLET_DEBIT",
        tenantId,
        outletId,
        walletId: result.wallet.id,
        amount: input.amount,
        referenceType: input.referenceType,
        balanceAfter: result.transaction.balanceAfter,
      }));
    }

    return { wallet: result.wallet, transaction: result.transaction, idempotent: result.idempotent };
  },

  // Credit the wallet for an authorized internal operation.
  // Only call this after a server-side verified event (e.g., confirmed top-up payment).
  // Idempotent by idempotencyKey.
  async creditWallet(
    db: TransactionDatabase,
    tenantId: string,
    outletId: string,
    input: WalletCreditInput,
  ): Promise<WalletMutationResult> {
    validateAmount(input.amount);
    validateIdempotencyKey(input.idempotencyKey);

    const result = await billingRepository.creditWallet(db, tenantId, outletId, input, "CREDIT");

    if (!result.wallet) {
      throw new AppError(404, "Credit wallet not found for this outlet", "WALLET_NOT_FOUND");
    }

    if (!result.idempotent) {
      console.info(JSON.stringify({
        event: "WALLET_CREDIT",
        tenantId,
        outletId,
        walletId: result.wallet.id,
        referenceType: input.referenceType,
        ...(input.referenceType === "top_up_order"
          ? {}
          : {
              amount: input.amount,
              balanceAfter: result.transaction.balanceAfter,
            }),
      }));
    }

    return result;
  },

  // Create a REVERSAL compensating entry for a prior settled transaction.
  // A reversal re-adds credits to the wallet. It does NOT modify the original ledger row.
  async createReversal(
    db: TransactionDatabase,
    tenantId: string,
    outletId: string,
    input: WalletCreditInput & { originalTxnId: string },
  ): Promise<WalletMutationResult> {
    validateAmount(input.amount);
    validateIdempotencyKey(input.idempotencyKey);

    const result = await billingRepository.creditWallet(db, tenantId, outletId, {
      amount: input.amount,
      idempotencyKey: input.idempotencyKey,
      ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
      referenceType: "wallet_transaction",
      referenceId: input.originalTxnId,
      description: input.description ?? `Reversal of transaction ${input.originalTxnId}`,
      metadata: { originalTxnId: input.originalTxnId, ...input.metadata },
    }, "REVERSAL");

    if (!result.wallet) {
      throw new AppError(404, "Credit wallet not found for this outlet", "WALLET_NOT_FOUND");
    }

    return result;
  },

  // ── Reservation operations ─────────────────────────────────────────────
  // Reserve credits for a long-running operation.
  // IMPORTANT: never hold a PostgreSQL transaction open while awaiting an
  // external service response. Reserve in one transaction, then debit or
  // release in a separate transaction after the external call completes.

  async reserveCredits(
    db: TransactionDatabase,
    tenantId: string,
    outletId: string,
    input: WalletReservationInput,
  ): Promise<WalletMutationResult> {
    validateAmount(input.amount);
    validateIdempotencyKey(input.idempotencyKey);

    const result = await billingRepository.reserveCredits(db, tenantId, outletId, input);

    if (!result.wallet) {
      throw new AppError(404, "Credit wallet not found for this outlet", "WALLET_NOT_FOUND");
    }
    if (result.insufficientBalance) {
      throw new AppError(
        402,
        `Insufficient credits for reservation: required ${input.amount}, available ${result.wallet.availableCredits}`,
        "INSUFFICIENT_CREDITS",
      );
    }

    return { wallet: result.wallet, transaction: result.transaction, idempotent: result.idempotent };
  },

  async releaseReservation(
    db: TransactionDatabase,
    tenantId: string,
    outletId: string,
    input: WalletReservationInput,
  ): Promise<WalletMutationResult> {
    validateAmount(input.amount);
    validateIdempotencyKey(input.idempotencyKey);

    const result = await billingRepository.releaseReservation(db, tenantId, outletId, input);

    if (!result.wallet) {
      throw new AppError(404, "Credit wallet not found for this outlet", "WALLET_NOT_FOUND");
    }

    return result;
  },

  // ── Transaction history ─────────────────────────────────────────────────

  async getTransactionHistory(
    db: TransactionDatabase,
    tenantId: string,
    outletId: string,
    query: TransactionListQuery = {},
  ): Promise<WalletTransactionRecord[]> {
    return billingRepository.listTransactions(db, tenantId, outletId, query);
  },
};

export type WalletService = typeof walletService;
