import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { rateCardRepository } from "./rateCard.repository.js";
import type {
  AdminRateCardFilter,
  CreateRateCardInput,
  RateCardLookupOptions,
  RateCardLookupResult,
  RateCardRecord,
  RateResolutionOptions,
  UpdateRateCardInput,
} from "./rateCard.types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

// Accepts positive decimal strings with up to 4 decimal places.
const QUANTITY_RE = /^\d+(\.\d{1,4})?$/;

const validateQuantity = (quantity: unknown): void => {
  if (typeof quantity !== "string" || !QUANTITY_RE.test(quantity)) {
    throw new AppError(
      400,
      'quantity must be a positive decimal string with up to 4 decimal places (e.g. "1.0000")',
      "INVALID_BILLABLE_QUANTITY",
    );
  }
  // parseFloat is safe here — only used for > 0 check, not for arithmetic
  if (parseFloat(quantity) <= 0) {
    throw new AppError(400, "quantity must be greater than zero", "INVALID_BILLABLE_QUANTITY");
  }
};

const validateServiceType = (serviceType: unknown): void => {
  if (typeof serviceType !== "string" || serviceType.trim().length === 0) {
    throw new AppError(400, "serviceType must be a non-empty string", "INVALID_SERVICE_TYPE");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Rate card service
// ─────────────────────────────────────────────────────────────────────────────

export const rateCardService = {

  // Resolve the active rate for a service type with optional country / provider
  // context. Uses three-level fallback: exact → country-level → global default.
  //
  // Throws:
  //   RATE_NOT_FOUND    — no active rate exists for this service type / context
  //   RATE_AMBIGUOUS    — multiple conflicting active rates detected (data issue)
  async resolveRate(
    db: TransactionDatabase,
    serviceType: string,
    options: RateResolutionOptions = {},
  ): Promise<RateCardRecord> {
    validateServiceType(serviceType);

    const { rate, ambiguous } = await rateCardRepository.findActiveRate(db, serviceType, options);

    if (ambiguous) {
      throw new AppError(
        500,
        `Ambiguous rate cards: multiple active rates for service type "${serviceType}" at the same specificity level. This is a data-integrity issue — contact platform ops.`,
        "RATE_AMBIGUOUS",
      );
    }

    if (!rate) {
      const ctx = [options.countryCode, options.provider].filter(Boolean).join("/");
      throw new AppError(
        404,
        `No active rate card found for service type "${serviceType}"${ctx ? ` (context: ${ctx})` : ""}`,
        "RATE_NOT_FOUND",
      );
    }

    return rate;
  },

  // Resolve rate and calculate credits for a given quantity.
  // This is the primary entry point for Phase 5 usage metering.
  //
  // Returns everything Phase 5 needs to persist in billing.usage_events:
  //   rateCard.id     → usage_events.rate_card_id
  //   unitLabel       → usage_events.unit_label
  //   quantity        → usage_events.quantity
  //   calculatedCredits → usage_events.estimated_credits / billed_credits
  //
  // Credit arithmetic is performed inside PostgreSQL (ROUND(qty × rate, 4))
  // to avoid all JavaScript floating-point hazards.
  async calculateBillingAmount(
    db: TransactionDatabase,
    options: RateCardLookupOptions,
  ): Promise<RateCardLookupResult> {
    const { serviceType, quantity, countryCode, provider } = options;

    validateServiceType(serviceType);
    validateQuantity(quantity);

    const rateCard = await rateCardService.resolveRate(db, serviceType, {
      ...(countryCode !== undefined ? { countryCode } : {}),
      ...(provider !== undefined ? { provider } : {}),
    });

    const calculatedCredits = await rateCardRepository.computeCredits(
      db,
      quantity,
      rateCard.creditsPerUnit,
    );

    return {
      rateCard,
      quantity,
      unitLabel: rateCard.unitLabel,
      creditsPerUnit: rateCard.creditsPerUnit,
      calculatedCredits,
    };
  },

  // List rate cards (active-only by default). Intended for admin views and
  // debugging; not called on the hot path.
  async listRates(
    db: TransactionDatabase,
    filter: { serviceType?: string; activeOnly?: boolean } = {},
  ): Promise<RateCardRecord[]> {
    if (filter.serviceType !== undefined) {
      validateServiceType(filter.serviceType);
    }
    return rateCardRepository.listRates(db, filter);
  },

  // Fetch a single rate card by ID (for linking usage events to archived rates).
  async getRateById(
    db: TransactionDatabase,
    id: string,
  ): Promise<RateCardRecord> {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new AppError(400, "id must be a non-empty string", "INVALID_RATE_CARD_ID");
    }
    const rate = await rateCardRepository.findById(db, id);
    if (!rate) {
      throw new AppError(404, `Rate card "${id}" not found`, "RATE_NOT_FOUND");
    }
    return rate;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin mutation service methods (Phase 9)
// ─────────────────────────────────────────────────────────────────────────────

const CREDITS_PER_UNIT_RE = /^\d+(\.\d{1,4})?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BILLING_SERVICE_TYPE_VALUES = new Set(Object.values({
  WHATSAPP_TEMPLATE: "whatsapp.template",
  WHATSAPP_UTILITY: "whatsapp.utility",
  WHATSAPP_AUTHENTICATION: "whatsapp.authentication",
  WHATSAPP_SERVICE: "whatsapp.service",
  EMAIL_SES: "email.ses",
  SMS_TRANSACTIONAL: "sms.transactional",
  AI_CHAT_TOKEN: "ai.chat_token",
  AI_EMBEDDING: "ai.embedding",
  AI_AGENT_ACTION: "ai.agent_action",
}));

export const rateCardAdminService = {

  // List rate cards with pagination support (activeOnly defaults to false for admin views).
  async listRatesPaginated(
    db: TransactionDatabase,
    filter: AdminRateCardFilter = {},
  ): Promise<{ rows: RateCardRecord[]; total: number; limit: number; offset: number }> {
    const limit = Math.min(filter.limit ?? 200, 500);
    const offset = Math.max(filter.offset ?? 0, 0);
    const { rows, total } = await rateCardRepository.listRatesPaginated(db, {
      ...(filter.serviceType !== undefined ? { serviceType: filter.serviceType } : {}),
      ...(filter.activeOnly !== undefined ? { activeOnly: filter.activeOnly } : {}),
      limit,
      offset,
    });
    return { rows, total, limit, offset };
  },

  // Create a new rate card. Validates all fields before inserting.
  // Throws DUPLICATE_ACTIVE_RATE if the unique constraint would be violated
  // (open-ended active rate for the same (serviceType, countryCode, provider)).
  async createRateCard(
    db: TransactionDatabase,
    input: CreateRateCardInput,
  ): Promise<RateCardRecord> {
    // Validate service type
    if (!BILLING_SERVICE_TYPE_VALUES.has(input.serviceType)) {
      throw new AppError(
        400,
        `serviceType "${input.serviceType}" is not a supported billing service type. ` +
        `Supported values: ${[...BILLING_SERVICE_TYPE_VALUES].join(", ")}`,
        "INVALID_SERVICE_TYPE",
      );
    }

    // Validate unitLabel
    if (typeof input.unitLabel !== "string" || input.unitLabel.trim().length === 0) {
      throw new AppError(400, "unitLabel must be a non-empty string", "INVALID_UNIT_LABEL");
    }
    if (input.unitLabel.length > 32) {
      throw new AppError(400, "unitLabel must be 32 characters or fewer", "INVALID_UNIT_LABEL");
    }

    // Validate creditsPerUnit
    if (!CREDITS_PER_UNIT_RE.test(input.creditsPerUnit) || parseFloat(input.creditsPerUnit) <= 0) {
      throw new AppError(
        400,
        "creditsPerUnit must be a positive decimal string with up to 4 decimal places",
        "INVALID_CREDITS_PER_UNIT",
      );
    }

    // Validate effective date range
    if (input.effectiveFrom && input.effectiveUntil) {
      const from = new Date(input.effectiveFrom);
      const until = new Date(input.effectiveUntil);
      if (isNaN(from.getTime())) {
        throw new AppError(400, "effectiveFrom is not a valid ISO 8601 timestamp", "INVALID_EFFECTIVE_DATE");
      }
      if (isNaN(until.getTime())) {
        throw new AppError(400, "effectiveUntil is not a valid ISO 8601 timestamp", "INVALID_EFFECTIVE_DATE");
      }
      if (until <= from) {
        throw new AppError(400, "effectiveUntil must be after effectiveFrom", "INVALID_EFFECTIVE_DATE");
      }
    } else if (input.effectiveUntil && !input.effectiveFrom) {
      // effectiveUntil relative to NOW()
      const until = new Date(input.effectiveUntil);
      if (isNaN(until.getTime())) {
        throw new AppError(400, "effectiveUntil is not a valid ISO 8601 timestamp", "INVALID_EFFECTIVE_DATE");
      }
    }

    // Validate notes length
    if (input.notes && input.notes.length > 2000) {
      throw new AppError(400, "notes must be 2000 characters or fewer", "INVALID_NOTES");
    }

    try {
      return await rateCardRepository.createRateCard(db, input);
    } catch (err: unknown) {
      // Translate the unique-constraint violation into a clear application error.
      // PostgreSQL error code 23505 = unique_violation
      const pgErr = err as { code?: string; detail?: string };
      if (pgErr.code === "23505" && pgErr.detail?.includes("rate_cards_active_service_uq")) {
        const scope = [input.countryCode ?? "global", input.provider ?? "any"].join("/");
        throw new AppError(
          409,
          `An open-ended active rate already exists for service type "${input.serviceType}" ` +
          `(scope: ${scope}). Deactivate or set effectiveUntil on the existing rate before creating a new one.`,
          "DUPLICATE_ACTIVE_RATE",
        );
      }
      throw err;
    }
  },

  // Update safe-to-change fields on an existing rate card.
  // Immutable fields (serviceType, countryCode, provider, unitLabel, creditsPerUnit,
  // effectiveFrom) cannot be changed to preserve historical billing integrity.
  async updateRateCard(
    db: TransactionDatabase,
    id: string,
    input: UpdateRateCardInput,
  ): Promise<RateCardRecord> {
    if (!UUID_RE.test(id)) {
      throw new AppError(400, "id must be a valid UUID", "INVALID_RATE_CARD_ID");
    }

    if (Object.keys(input).length === 0) {
      throw new AppError(400, "At least one field must be provided for update", "EMPTY_UPDATE");
    }

    // Validate effectiveUntil
    if ("effectiveUntil" in input && input.effectiveUntil !== null && input.effectiveUntil !== undefined) {
      const until = new Date(input.effectiveUntil);
      if (isNaN(until.getTime())) {
        throw new AppError(400, "effectiveUntil is not a valid ISO 8601 timestamp", "INVALID_EFFECTIVE_DATE");
      }
    }

    // Validate notes
    if ("notes" in input && input.notes && input.notes.length > 2000) {
      throw new AppError(400, "notes must be 2000 characters or fewer", "INVALID_NOTES");
    }

    try {
      const updated = await rateCardRepository.updateRateCard(db, id, input);
      if (!updated) {
        throw new AppError(404, `Rate card "${id}" not found`, "RATE_NOT_FOUND");
      }
      return updated;
    } catch (err: unknown) {
      const pgErr = err as { code?: string; detail?: string };
      if (pgErr.code === "23505" && pgErr.detail?.includes("rate_cards_active_service_uq")) {
        throw new AppError(
          409,
          "This update would create a duplicate open-ended active rate for the same service type and scope.",
          "DUPLICATE_ACTIVE_RATE",
        );
      }
      throw err;
    }
  },

  // Deactivate a rate card: sets is_active = false and effective_until = NOW().
  // Returns the deactivated record.
  // Warns (via returned data) if this will leave the service type without any
  // active global fallback rate.
  async deactivateRateCard(
    db: TransactionDatabase,
    id: string,
  ): Promise<{ rateCard: RateCardRecord; coverageGap: boolean }> {
    if (!UUID_RE.test(id)) {
      throw new AppError(400, "id must be a valid UUID", "INVALID_RATE_CARD_ID");
    }

    // Fetch the current record
    const existing = await rateCardRepository.findById(db, id);
    if (!existing) {
      throw new AppError(404, `Rate card "${id}" not found`, "RATE_NOT_FOUND");
    }
    if (!existing.isActive) {
      throw new AppError(409, `Rate card "${id}" is already inactive`, "RATE_ALREADY_INACTIVE");
    }

    const updated = await rateCardRepository.updateRateCard(db, id, {
      isActive: false,
      effectiveUntil: new Date().toISOString(),
    });

    // Check whether this service type still has an active rate (any scope)
    const remaining = await rateCardRepository.listRates(db, {
      serviceType: existing.serviceType,
      activeOnly: true,
    });

    return {
      rateCard: updated!,
      coverageGap: remaining.length === 0,
    };
  },
};

export type RateCardService = typeof rateCardService;
export type RateCardAdminService = typeof rateCardAdminService;
