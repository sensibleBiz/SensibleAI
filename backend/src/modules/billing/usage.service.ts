/**
 * Usage metering service — Phase 5 entry point for all billable CRM operations.
 *
 * Billable events:
 *   email.ses        — per successful SES dispatch (outbound transactional email)
 *   whatsapp.service — per successfully sent outbound WhatsApp text message
 *   ai.agent_action  — per completed CRM assistant conversation turn
 *
 * Atomicity guarantee (same-transaction callers):
 *   When meterUsage is called with a TransactionDatabase that is already within
 *   an open transaction, all three DB writes (INSERT usage_event, INSERT
 *   wallet_transaction, UPDATE usage_event) participate in that single
 *   PostgreSQL transaction. A rollback of the outer transaction undoes all
 *   three atomically.
 *
 * Known gap — email post-send billing:
 *   The email route sends via SES before opening a DB transaction (the external
 *   call must not hold a DB connection open). If the billing transaction fails
 *   after the email is accepted by SES, the email is delivered but credits are
 *   not charged. This risk is accepted for Phase 5; a reconciliation job
 *   (Phase 7+) should scan for usage_events that remain PENDING and retry them.
 *
 * Insufficient-balance during an in-flight external operation:
 *   For WhatsApp and AI, meterUsage is called within the same transaction as
 *   the message/response storage. If INSUFFICIENT_CREDITS is thrown, the outer
 *   transaction rolls back — the message record is also discarded. This is safe
 *   from a financial perspective (nothing is charged, nothing is stored), but
 *   the external provider (MSG91 / Google ADK) may have already been called.
 *   A pre-flight wallet check in each integration reduces this window.
 */
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { billingRepository } from "./billing.repository.js";
import { rateCardService } from "./rateCard.service.js";
import { walletService } from "./wallet.service.js";
import { usageRepository } from "./usage.repository.js";
import type { MeterUsageInput, MeterUsageResult } from "./usage.types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const QUANTITY_RE = /^\d+(\.\d{1,4})?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validateMeterInput = (input: MeterUsageInput): void => {
  if (!input.tenantId || !UUID_RE.test(input.tenantId))
    throw new AppError(400, "tenantId must be a valid UUID", "INVALID_METER_INPUT");
  if (!input.outletId || !UUID_RE.test(input.outletId))
    throw new AppError(400, "outletId must be a valid UUID", "INVALID_METER_INPUT");
  if (typeof input.serviceType !== "string" || input.serviceType.trim().length === 0)
    throw new AppError(400, "serviceType must be a non-empty string", "INVALID_METER_INPUT");
  if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128)
    throw new AppError(400, "idempotencyKey must be a string between 8 and 128 characters", "INVALID_METER_INPUT");
  const qty = input.quantity ?? "1.0000";
  if (!QUANTITY_RE.test(qty) || parseFloat(qty) <= 0)
    throw new AppError(400, "quantity must be a positive decimal string with up to 4 decimal places", "INVALID_METER_INPUT");
  if ((input.referenceType === undefined) !== (input.referenceId === undefined)) {
    throw new AppError(400, "referenceType and referenceId must both be provided or both omitted", "INVALID_METER_INPUT");
  }
  if (input.referenceId !== undefined && !UUID_RE.test(input.referenceId)) {
    throw new AppError(400, "referenceId must be a valid UUID", "INVALID_METER_INPUT");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export const usageService = {

  /**
   * Meter a billable CRM operation.
   *
   * Steps (all within the caller's transaction):
   *   1. Validate inputs.
   *   2. Resolve the wallet for (tenantId, outletId).
   *   3. Resolve the applicable rate card and calculate credits.
   *   4. INSERT usage_event(PENDING) — idempotent via ON CONFLICT.
   *   5. DEBIT wallet — idempotent via wallet-level idempotency_key.
   *   6. UPDATE usage_event → BILLED with wallet_txn_id.
   *   7. Return result.
   *
   * Throws:
   *   WALLET_NOT_FOUND    — no wallet configured for this outlet
   *   RATE_NOT_FOUND      — no active rate card for this service type / context
   *   RATE_AMBIGUOUS      — data-integrity issue with rate cards
   *   INSUFFICIENT_CREDITS — not enough available credits
   */
  async meterUsage(
    db: TransactionDatabase,
    input: MeterUsageInput,
  ): Promise<MeterUsageResult> {
    validateMeterInput(input);
    const quantity = input.quantity ?? "1.0000";

    // ── 1. Resolve wallet ────────────────────────────────────────────────────
    // Do not auto-create: wallets are provisioned by tenant admins at onboarding.
    const wallet = await billingRepository.findWalletByOutlet(db, input.tenantId, input.outletId);
    if (!wallet) {
      throw new AppError(
        402,
        `Credit wallet not configured for outlet ${input.outletId}. A tenant admin must set up billing before using this service.`,
        "WALLET_NOT_FOUND",
      );
    }

    // ── 2. Idempotency fast-path: event already billed? ──────────────────────
    // (checked again via ON CONFLICT in insertPending, but early-exit avoids
    // unnecessary rate-card and wallet queries on replays)
    const existing = await usageRepository.findByIdempotencyKey(db, input.tenantId, input.idempotencyKey);
    if (existing?.status === "BILLED") {
      return {
        usageEvent: existing,
        walletTxnId: existing.walletTxnId!,
        billedCredits: existing.billedCredits!,
        idempotent: true,
      };
    }

    // ── 3. Rate resolution and credit calculation ────────────────────────────
    const pricing = await rateCardService.calculateBillingAmount(db, {
      serviceType: input.serviceType,
      quantity,
      ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
    });

    // ── 4. Insert PENDING usage event ────────────────────────────────────────
    const { event: usageEvent, inserted } = await usageRepository.insertPending(db, {
      tenantId: input.tenantId,
      outletId: input.outletId,
      walletId: wallet.id,
      serviceType: input.serviceType,
      quantity,
      unitLabel: pricing.unitLabel,
      rateCardId: pricing.rateCard.id,
      estimatedCredits: pricing.calculatedCredits,
      idempotencyKey: input.idempotencyKey,
      actorUserId: input.actorUserId ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      providerRef: input.providerRef ?? null,
      metadata: input.metadata ?? {},
    });

    // Already-processed event (idempotent replay between the fast-path check
    // and this insert — concurrent request beat us).
    if (!inserted) {
      if (usageEvent.status === "BILLED") {
        return {
          usageEvent,
          walletTxnId: usageEvent.walletTxnId!,
          billedCredits: usageEvent.billedCredits!,
          idempotent: true,
        };
      }
      // PENDING conflict: some other concurrent process is mid-flight for this
      // exact key. Fail fast — the caller should retry after the first completes.
      throw new AppError(
        409,
        `Duplicate concurrent metering attempt for idempotency key "${input.idempotencyKey}"`,
        "USAGE_EVENT_CONFLICT",
      );
    }

    // ── 5. Debit wallet ──────────────────────────────────────────────────────
    const debitResult = await walletService.debitCredits(db, input.tenantId, input.outletId, {
      amount: pricing.calculatedCredits,
      idempotencyKey: input.idempotencyKey,
      ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
      referenceType: "usage_event",
      referenceId: usageEvent.id,
      description: `Usage: ${input.serviceType}`,
      metadata: { serviceType: input.serviceType, rateCardId: pricing.rateCard.id },
    });

    // ── 6. Update usage event to BILLED ──────────────────────────────────────
    const billed = await usageRepository.updateBilled(
      db,
      usageEvent.id,
      input.tenantId,
      pricing.calculatedCredits,
      debitResult.transaction.id,
    );

    console.info(JSON.stringify({
      event: "USAGE_METERED",
      tenantId: input.tenantId,
      outletId: input.outletId,
      serviceType: input.serviceType,
      quantity,
      billedCredits: pricing.calculatedCredits,
      rateCardId: pricing.rateCard.id,
      walletTxnId: debitResult.transaction.id,
      usageEventId: usageEvent.id,
    }));

    return {
      usageEvent: billed,
      walletTxnId: debitResult.transaction.id,
      billedCredits: pricing.calculatedCredits,
      idempotent: false,
    };
  },

  /**
   * Pre-flight wallet check — non-binding; reduces the probability of an
   * external provider call succeeding when credits are already depleted.
   * Never use this as the sole balance check; the wallet debit in meterUsage
   * enforces the real constraint atomically.
   */
  async checkWalletExists(
    db: TransactionDatabase,
    tenantId: string,
    outletId: string,
  ): Promise<void> {
    const wallet = await billingRepository.findWalletByOutlet(db, tenantId, outletId);
    if (!wallet) {
      throw new AppError(
        402,
        `Credit wallet not configured for outlet ${outletId}. A tenant admin must set up billing.`,
        "WALLET_NOT_FOUND",
      );
    }
  },
};

export type UsageService = typeof usageService;
