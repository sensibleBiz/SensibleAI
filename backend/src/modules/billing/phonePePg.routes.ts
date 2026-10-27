/**
 * PhonePe PG routes — Standard Checkout v2.
 *
 * Routes:
 *   POST /billing/topup            — initiate a wallet top-up (auth required)
 *   GET  /billing/topup/:orderId/status — poll top-up status (auth required)
 *   POST /webhooks/phonepe-pg/callback  — PhonePe PG callback (SHA-authenticated)
 *
 * The webhook route is mounted at the /api root, not under /api/billing, so
 * it receives a POST to /api/webhooks/phonepe-pg/callback.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requirePostgresAuth } from "../../middleware/postgresAuth.js";
import { withDatabaseContext } from "../../db/context.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { AppError } from "../../errors/appError.js";
import { topUpService } from "./topUp.service.js";
import type { InitiateTopUpResult } from "./topUp.types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Top-up router (mounted at /billing)
// ─────────────────────────────────────────────────────────────────────────────

export const phonePePgTopUpRouter = Router();

const initiateSchema = z.object({
  outletId: z.string().uuid("outletId must be a valid UUID"),
  amountInr: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "amountInr must be a positive decimal string (e.g. '500.00')")
    .refine((v) => parseFloat(v) > 0, "amountInr must be greater than zero"),
  idempotencyKey: z.string().min(8).max(128),
});

/**
 * POST /billing/topup
 * Initiate a wallet top-up. Returns a redirect URL to the PhonePe payment page.
 *
 * Two-phase: DB order is created first (committed), then PhonePe is called in
 * a separate DB context so no connection is held during the external HTTP call.
 */
phonePePgTopUpRouter.post(
  "/topup",
  requirePostgresAuth,
  validateRequest({ body: initiateSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.postgresAuth!;
      const { outletId, amountInr, idempotencyKey } = req.body as z.infer<typeof initiateSchema>;

      // Phase 1: Create CREATED order in DB (transaction committed on return)
      let initiatedOrder: InitiateTopUpResult;

      await withDatabaseContext(
        { tenantId: auth.tenantId, userId: auth.userId },
        async (db) => {
          const result = await topUpService.initiateTopUp(db, {
            tenantId: auth.tenantId,
            outletId,
            requestedByUserId: auth.userId,
            amountInr,
            idempotencyKey,
          });
          initiatedOrder = result;
        },
      );

      if (initiatedOrder!.reused) {
        res.status(200).json({
          success: true,
          data: initiatedOrder!,
        });
        return;
      }

      // Phase 2: Call PhonePe (outside DB transaction) and update order to PENDING
      const { redirectUrl } = await topUpService.callPhonePeAndUpdateOrder(
        auth.tenantId,
        auth.userId,
        initiatedOrder!.orderId,
        initiatedOrder!.orderRef,
        amountInr,
      );

      res.status(200).json({
        success: true,
        data: {
          orderId: initiatedOrder!.orderId,
          orderRef: initiatedOrder!.orderRef,
          redirectUrl,
          amountInr,
          creditsToGrant: initiatedOrder!.creditsToGrant,
          reused: false,
          status: "CREATED",
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /billing/topup/:orderId/status
 * Client-side status poll. Calls PhonePe status API server-side before responding.
 * Never trusts any client-supplied status. Idempotent.
 */
phonePePgTopUpRouter.get(
  "/topup/:orderId/status",
  requirePostgresAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.postgresAuth!;
      const orderId = Array.isArray(req.params["orderId"]) ? req.params["orderId"][0] : req.params["orderId"];
      if (!orderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
        throw new AppError(400, "orderId must be a valid UUID", "INVALID_INPUT");
      }

      const rawOutletId = req.query["outletId"];
      const outletId = typeof rawOutletId === "string"
        ? rawOutletId
        : Array.isArray(rawOutletId) && typeof rawOutletId[0] === "string"
          ? rawOutletId[0] as string
          : undefined;
      if (!outletId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(outletId)) {
        throw new AppError(400, "outletId query parameter must be a valid UUID", "INVALID_INPUT");
      }

      const result = await topUpService.verifyAndCreditTopUp(
        auth.tenantId,
        auth.userId,
        outletId,
        orderId,
      );

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Webhook router (mounted at /webhooks)
// ─────────────────────────────────────────────────────────────────────────────

export const phonePePgWebhookRouter = Router();

/**
 * POST /webhooks/phonepe-pg/callback
 * PhonePe PG payment callback. No CRM auth — verified using the SHA webhook
 * credentials configured in the PhonePe Business Dashboard.
 * Returns 200 for all valid requests (including already-processed orders) so
 * PhonePe does not retry. Returns 4xx only for signature/parsing failures.
 *
 * IMPORTANT: Browser redirects to success/failure pages do NOT call this
 * endpoint. PhonePe calls this URL asynchronously. Client-side status is
 * confirmed via GET /billing/topup/:orderId/status.
 */
phonePePgWebhookRouter.post(
  "/phonepe-pg/callback",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authorization = req.header("Authorization") ?? "";
      const body = req.body as unknown;

      if (!authorization) {
        throw new AppError(400, "Missing Authorization header", "MISSING_SIGNATURE");
      }

      await topUpService.handlePhonePeCallback(body, authorization);

      res.status(200).json({ success: true });
    } catch (error) {
      // Signature failures must be surfaced as 4xx (not 200) so misconfigured
      // webhooks don't silently succeed. Other errors return 500.
      if (error instanceof AppError && (error.statusCode === 400 || error.statusCode === 401)) {
        next(error);
        return;
      }
      // Transient failures return 5xx so the provider can retry. The handler is
      // idempotent, and reconciliation remains the second recovery path.
      console.error(JSON.stringify({
        severity: "ERROR",
        event: "PHONEPE_CALLBACK_PROCESSING_ERROR",
        code: error instanceof AppError ? error.code : "UNEXPECTED_ERROR",
      }));
      res.status(500).json({
        success: false,
        message: "PhonePe callback processing failed",
        code: "PHONEPE_CALLBACK_PROCESSING_FAILED",
      });
    }
  },
);
