/**
 * Rate-card admin routes — Phase 9.
 *
 * Routes (all mounted under /billing):
 *   GET  /rate-cards               — list rate cards (all authenticated users)
 *   GET  /rate-cards/:id           — get single rate card (all authenticated users)
 *   POST /rate-cards               — create rate card (isTenantAdmin required)
 *   PATCH /rate-cards/:id          — update mutable fields (isTenantAdmin required)
 *   POST /rate-cards/:id/deactivate — deactivate (isTenantAdmin required)
 *
 * Authorization notes:
 *   - All routes require requirePostgresAuth.
 *   - Mutations require requirePlatformAdmin (Phase 10):
 *       isTenantAdmin === true AND tenantId === env.billing.platformAdminTenantId.
 *       env.billing.platformAdminTenantId comes from BILLING_PLATFORM_ADMIN_TENANT_ID
 *       env var (server-side only; cannot be client-supplied). Returns 503 if not set.
 *   - Rate cards are global (no tenant_id). requirePlatformAdmin closes the gap
 *     from Phase 9 where any tenant admin could reach mutation endpoints.
 *   - withDatabaseContext sets the session tenant for RLS; rate_cards RLS
 *     policies for INSERT/UPDATE use billing.is_platform_admin() (migration 0046)
 *     which reads the app.is_platform_admin session variable set server-side.
 *     SELECT policy remains USING(true) — all authenticated users can read rates.
 *
 * Historical integrity:
 *   - Only notes, is_active, and effective_until can be updated (PATCH).
 *   - Structural fields (serviceType, countryCode, provider, unitLabel,
 *     creditsPerUnit, effectiveFrom) are immutable once created.
 *   - Deactivation is preferred over deletion; ON DELETE RESTRICT on
 *     usage_events.rate_card_id prevents hard deletion of referenced cards.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requirePostgresAuth } from "../../middleware/postgresAuth.js";
import { withDatabaseContext } from "../../db/context.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { AppError } from "../../errors/appError.js";
import { env } from "../../config/env.js";
import { rateCardService, rateCardAdminService } from "./rateCard.service.js";
import type { RateCardRecord } from "./rateCard.types.js";

export const rateCardAdminRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Returns true only when the request comes from a tenant admin of the configured
 * platform tenant (BILLING_PLATFORM_ADMIN_TENANT_ID). Both conditions are required:
 *   1. isTenantAdmin — derived from a signed JWT + DB membership, not client-supplied
 *   2. tenantId matches the server-configured platform tenant ID
 *
 * Throws 503 if BILLING_PLATFORM_ADMIN_TENANT_ID is not configured (fail closed).
 * Throws 403 for any other unauthorized request.
 */
function requirePlatformAdmin(req: Request): void {
  const platformTenantId = env.billing.phonePePg.platformAdminTenantId;
  if (!platformTenantId) {
    throw new AppError(
      503,
      "Rate card administration is not available: BILLING_PLATFORM_ADMIN_TENANT_ID is not configured",
      "PLATFORM_ADMIN_NOT_CONFIGURED",
    );
  }
  const auth = req.postgresAuth;
  if (!auth?.isTenantAdmin || auth.tenantId !== platformTenantId) {
    throw new AppError(
      403,
      "Rate card mutations require platform administrator access",
      "PLATFORM_ADMIN_REQUIRED",
    );
  }
}

/** Returns true when the caller is the platform admin (used to set DB context). */
function isPlatformAdmin(req: Request): boolean {
  const platformTenantId = env.billing.phonePePg.platformAdminTenantId;
  if (!platformTenantId) return false;
  return req.postgresAuth?.isTenantAdmin === true && req.postgresAuth.tenantId === platformTenantId;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /billing/rate-cards
// List rate cards with optional serviceType filter and pagination.
// ─────────────────────────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  serviceType: z.string().optional(),
  activeOnly: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

rateCardAdminRouter.get(
  "/rate-cards",
  requirePostgresAuth,
  validateRequest({ query: listQuerySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.postgresAuth!;
      const { serviceType, activeOnly, limit, offset } = req.query as unknown as z.infer<typeof listQuerySchema>;

      let result: { rows: RateCardRecord[]; total: number; limit: number; offset: number };
      await withDatabaseContext(
        { tenantId: auth.tenantId, userId: auth.userId },
        async (db) => {
          result = await rateCardAdminService.listRatesPaginated(db, {
            ...(serviceType !== undefined ? { serviceType } : {}),
            activeOnly,
            limit,
            offset,
          });
        },
      );

      res.status(200).json({ success: true, data: result! });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /billing/rate-cards/:id
// Fetch a single rate card by ID.
// ─────────────────────────────────────────────────────────────────────────────

rateCardAdminRouter.get(
  "/rate-cards/:id",
  requirePostgresAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.postgresAuth!;
      const id = String(req.params["id"] ?? "");
      if (!UUID_RE.test(id)) {
        throw new AppError(400, "id must be a valid UUID", "INVALID_RATE_CARD_ID");
      }

      let rateCard!: RateCardRecord;
      await withDatabaseContext(
        { tenantId: auth.tenantId, userId: auth.userId },
        async (db) => {
          rateCard = await rateCardService.getRateById(db, id);
        },
      );

      res.status(200).json({ success: true, data: { rateCard } });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /billing/rate-cards
// Create a new rate card. Requires isTenantAdmin.
// ─────────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  serviceType: z.string().min(1).max(64),
  countryCode: z.string().min(1).max(8).nullable().optional(),
  provider: z.string().min(1).max(64).nullable().optional(),
  unitLabel: z.string().min(1).max(32),
  creditsPerUnit: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, "creditsPerUnit must be a positive decimal with up to 4 decimal places")
    .refine((v) => parseFloat(v) > 0, "creditsPerUnit must be greater than zero"),
  isActive: z.boolean().optional().default(true),
  effectiveFrom: z.string().datetime({ offset: true }).optional(),
  effectiveUntil: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

rateCardAdminRouter.post(
  "/rate-cards",
  requirePostgresAuth,
  validateRequest({ body: createSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.postgresAuth!;
      requirePlatformAdmin(req);

      const raw = req.body as z.infer<typeof createSchema>;
      const input = {
        serviceType: raw.serviceType,
        unitLabel: raw.unitLabel,
        creditsPerUnit: raw.creditsPerUnit,
        isActive: raw.isActive,
        countryCode: raw.countryCode ?? null,
        provider: raw.provider ?? null,
        effectiveUntil: raw.effectiveUntil ?? null,
        notes: raw.notes ?? null,
        ...(raw.effectiveFrom !== undefined ? { effectiveFrom: raw.effectiveFrom } : {}),
      };

      let rateCard!: RateCardRecord;
      await withDatabaseContext(
        { tenantId: auth.tenantId, userId: auth.userId, isPlatformAdmin: isPlatformAdmin(req) },
        async (db) => {
          rateCard = await rateCardAdminService.createRateCard(db, input);
        },
      );

      console.info(JSON.stringify({
        event: "RATE_CARD_CREATED",
        rateCardId: rateCard.id,
        serviceType: rateCard.serviceType,
        actorUserId: auth.userId,
        tenantId: auth.tenantId,
      }));

      res.status(201).json({ success: true, data: { rateCard } });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /billing/rate-cards/:id
// Update mutable fields (notes, isActive, effectiveUntil). Requires isTenantAdmin.
// Immutable fields (serviceType, countryCode, provider, unitLabel, creditsPerUnit,
// effectiveFrom) are not accepted to protect historical billing integrity.
// ─────────────────────────────────────────────────────────────────────────────

const updateSchema = z.object({
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  effectiveUntil: z.string().datetime({ offset: true }).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided for update",
});

rateCardAdminRouter.patch(
  "/rate-cards/:id",
  requirePostgresAuth,
  validateRequest({ body: updateSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.postgresAuth!;
      requirePlatformAdmin(req);

      const id = String(req.params["id"] ?? "");
      if (!UUID_RE.test(id)) {
        throw new AppError(400, "id must be a valid UUID", "INVALID_RATE_CARD_ID");
      }

      const raw = req.body as z.infer<typeof updateSchema>;
      const input = {
        ...(raw.isActive !== undefined ? { isActive: raw.isActive } : {}),
        ...("notes" in raw ? { notes: raw.notes ?? null } : {}),
        ...("effectiveUntil" in raw ? { effectiveUntil: raw.effectiveUntil ?? null } : {}),
      };

      let rateCard!: RateCardRecord;
      await withDatabaseContext(
        { tenantId: auth.tenantId, userId: auth.userId, isPlatformAdmin: isPlatformAdmin(req) },
        async (db) => {
          rateCard = await rateCardAdminService.updateRateCard(db, id, input);
        },
      );

      console.info(JSON.stringify({
        event: "RATE_CARD_UPDATED",
        rateCardId: id,
        changes: Object.keys(input),
        actorUserId: auth.userId,
        tenantId: auth.tenantId,
      }));

      res.status(200).json({ success: true, data: { rateCard } });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /billing/rate-cards/:id/deactivate
// Deactivate a rate card (sets is_active = false, effective_until = NOW()).
// Returns a coverageGap flag when the service type will have no active rates.
// Requires isTenantAdmin.
// ─────────────────────────────────────────────────────────────────────────────

rateCardAdminRouter.post(
  "/rate-cards/:id/deactivate",
  requirePostgresAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.postgresAuth!;
      requirePlatformAdmin(req);

      const id = String(req.params["id"] ?? "");
      if (!UUID_RE.test(id)) {
        throw new AppError(400, "id must be a valid UUID", "INVALID_RATE_CARD_ID");
      }

      let result!: { rateCard: RateCardRecord; coverageGap: boolean };
      await withDatabaseContext(
        { tenantId: auth.tenantId, userId: auth.userId, isPlatformAdmin: isPlatformAdmin(req) },
        async (db) => {
          result = await rateCardAdminService.deactivateRateCard(db, id);
        },
      );

      console.info(JSON.stringify({
        event: "RATE_CARD_DEACTIVATED",
        rateCardId: id,
        coverageGap: result.coverageGap,
        actorUserId: auth.userId,
        tenantId: auth.tenantId,
      }));

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);
