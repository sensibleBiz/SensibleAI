/**
 * Billing wallet routes — Phase 7.
 *
 * Routes (all mounted under /billing):
 *   GET  /wallet          — wallet summary for an outlet
 *   GET  /transactions    — paginated transaction history (offset-based)
 *   POST /wallet          — provision a wallet (tenant admin only)
 *
 * Security invariants:
 *   - tenantId is always sourced from req.postgresAuth (never client-supplied).
 *   - outletId is validated as a UUID; RLS enforces the tenant scope.
 *   - POST /wallet requires isTenantAdmin; never accepts a client-supplied balance.
 *   - All reads go through withDatabaseContext so RLS session vars are set.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requirePostgresAuth } from "../../middleware/postgresAuth.js";
import { withDatabaseContext } from "../../db/context.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { AppError } from "../../errors/appError.js";
import { walletService } from "./wallet.service.js";
import type { WalletRecord, WalletTransactionRecord } from "./billing.types.js";

export const billingWalletRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Extract and validate a UUID from a query param (handles string | string[] | ParsedQs). */
function extractQueryUuid(raw: unknown, field: string): string {
  const value =
    typeof raw === "string" ? raw
    : Array.isArray(raw) && typeof raw[0] === "string" ? (raw[0] as string)
    : undefined;
  if (!value || !UUID_RE.test(value)) {
    throw new AppError(400, `${field} query parameter must be a valid UUID`, "INVALID_INPUT");
  }
  return value;
}

/** Parse a non-negative integer query param with a fallback. */
function extractQueryInt(raw: unknown, fallback: number, min: number, max: number): number {
  if (typeof raw !== "string") return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /billing/wallet?outletId=<uuid>
// Returns the wallet for an outlet. 404 when no wallet has been provisioned.
// ─────────────────────────────────────────────────────────────────────────────

billingWalletRouter.get(
  "/wallet",
  requirePostgresAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.postgresAuth!;
      const outletId = extractQueryUuid(req.query["outletId"], "outletId");

      let wallet!: WalletRecord;
      await withDatabaseContext(
        { tenantId: auth.tenantId, userId: auth.userId },
        async (db) => {
          wallet = await walletService.getWallet(db, auth.tenantId, outletId);
        },
      );

      res.status(200).json({ success: true, data: { wallet } });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /billing/transactions?outletId=<uuid>&limit=50&offset=0
// Paginated transaction history. Stable ordering: created_at DESC, id DESC.
// limit is capped at 200. offset is non-negative.
// ─────────────────────────────────────────────────────────────────────────────

billingWalletRouter.get(
  "/transactions",
  requirePostgresAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.postgresAuth!;
      const outletId = extractQueryUuid(req.query["outletId"], "outletId");
      const limit = extractQueryInt(req.query["limit"], 50, 1, 200);
      const offset = extractQueryInt(req.query["offset"], 0, 0, Number.MAX_SAFE_INTEGER);

      let transactions!: WalletTransactionRecord[];
      await withDatabaseContext(
        { tenantId: auth.tenantId, userId: auth.userId },
        async (db) => {
          transactions = await walletService.getTransactionHistory(
            db,
            auth.tenantId,
            outletId,
            { limit, offset },
          );
        },
      );

      res.status(200).json({ success: true, data: { transactions, limit, offset } });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /billing/wallet
// Provision (create if absent) a billing wallet for an outlet.
// Idempotent — safe to call multiple times; returns existing wallet if present.
// Requires: isTenantAdmin. Never accepts a client-supplied initial balance.
// ─────────────────────────────────────────────────────────────────────────────

const provisionSchema = z.object({
  outletId: z.string().uuid("outletId must be a valid UUID"),
  currency: z.string().length(3, "currency must be a 3-character ISO 4217 code (e.g. 'INR')").optional(),
});

billingWalletRouter.post(
  "/wallet",
  requirePostgresAuth,
  validateRequest({ body: provisionSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.postgresAuth!;

      if (!auth.isTenantAdmin) {
        throw new AppError(
          403,
          "Only tenant administrators can provision billing wallets",
          "FORBIDDEN",
        );
      }

      const { outletId, currency } = req.body as z.infer<typeof provisionSchema>;

      let wallet!: WalletRecord;
      await withDatabaseContext(
        { tenantId: auth.tenantId, userId: auth.userId },
        async (db) => {
          wallet = await walletService.getOrCreateWallet(
            db,
            auth.tenantId,
            outletId,
            ...(currency !== undefined ? [currency] : []),
          );
        },
      );

      console.info(JSON.stringify({
        event: "WALLET_PROVISIONED",
        tenantId: auth.tenantId,
        outletId,
        walletId: wallet.id,
        actorUserId: auth.userId,
      }));

      res.status(200).json({ success: true, data: { wallet } });
    } catch (error) {
      next(error);
    }
  },
);
