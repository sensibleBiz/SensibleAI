import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import type {
  CreateRateCardInput,
  RateCardRecord,
  RateResolutionOptions,
  UpdateRateCardInput,
} from "./rateCard.types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Row type (snake_case from PostgreSQL)
// ─────────────────────────────────────────────────────────────────────────────

interface RateCardRow extends QueryResultRow {
  id: string;
  service_type: string;
  country_code: string | null;
  provider: string | null;
  unit_label: string;
  credits_per_unit: string;
  is_active: boolean;
  effective_from: Date;
  effective_until: Date | null;
  notes: string | null;
  created_at: Date;
}

const RATE_CARD_COLUMNS = `
  id, service_type, country_code, provider, unit_label, credits_per_unit,
  is_active, effective_from, effective_until, notes, created_at
`;

const mapRateCard = (row: RateCardRow): RateCardRecord => ({
  id: row.id,
  serviceType: row.service_type,
  countryCode: row.country_code,
  provider: row.provider,
  unitLabel: row.unit_label,
  creditsPerUnit: row.credits_per_unit,
  isActive: row.is_active,
  effectiveFrom: row.effective_from,
  effectiveUntil: row.effective_until,
  notes: row.notes,
  createdAt: row.created_at,
});

// Base SQL fragment for active, currently-effective rates.
const ACTIVE_EFFECTIVE_FILTER = `
  is_active = true
  AND effective_from <= NOW()
  AND (effective_until IS NULL OR effective_until > NOW())
`;

// ─────────────────────────────────────────────────────────────────────────────
// Rate card repository — SELECT only; rate_cards are managed via migrations.
// ─────────────────────────────────────────────────────────────────────────────

export const rateCardRepository = {

  // Resolve the best matching rate using three-level specificity fallback:
  //   Priority 1 — exact  : (serviceType, countryCode, provider)
  //   Priority 2 — country: (serviceType, countryCode, NULL)  [only when provider provided]
  //   Priority 3 — global : (serviceType, NULL, NULL)         [only when some context given]
  //
  // Returns { rate, ambiguous: true } when multiple active rows exist at the
  // same priority level (should not occur under normal migration management,
  // but detected defensively).
  async findActiveRate(
    db: TransactionDatabase,
    serviceType: string,
    options: RateResolutionOptions = {},
  ): Promise<{ rate: RateCardRecord | null; ambiguous: boolean }> {
    const { countryCode = null, provider = null } = options;

    // Build a priority list from most-specific to least-specific.
    // Each entry describes what country_code and provider the candidate row must have.
    const priorities: Array<{ cc: string | null; prov: string | null }> = [];

    if (countryCode !== null && provider !== null) {
      priorities.push({ cc: countryCode, prov: provider });   // exact
      priorities.push({ cc: countryCode, prov: null });       // country-level
      priorities.push({ cc: null,        prov: null });       // global
    } else if (countryCode !== null) {
      priorities.push({ cc: countryCode, prov: null });       // country-level (no provider context)
      priorities.push({ cc: null,        prov: null });       // global
    } else if (provider !== null) {
      priorities.push({ cc: null,        prov: provider });   // provider-only
      priorities.push({ cc: null,        prov: null });       // global
    } else {
      priorities.push({ cc: null,        prov: null });       // global only
    }

    for (const { cc, prov } of priorities) {
      const result = await db.client.query<RateCardRow>(`
        SELECT ${RATE_CARD_COLUMNS}
        FROM billing.rate_cards
        WHERE service_type = $1
          AND ${ACTIVE_EFFECTIVE_FILTER}
          AND country_code IS NOT DISTINCT FROM $2
          AND provider IS NOT DISTINCT FROM $3
        ORDER BY effective_from DESC
      `, [serviceType, cc, prov]);

      if (result.rowCount === 0) continue;

      // More than one row at the same specificity level is a data-integrity issue.
      if ((result.rowCount ?? 0) > 1) {
        return { rate: null, ambiguous: true };
      }

      return { rate: mapRateCard(result.rows[0]!), ambiguous: false };
    }

    return { rate: null, ambiguous: false };
  },

  // Look up a rate card by its primary key (for audit / usage-event linking).
  async findById(
    db: TransactionDatabase,
    id: string,
  ): Promise<RateCardRecord | null> {
    const result = await db.client.query<RateCardRow>(`
      SELECT ${RATE_CARD_COLUMNS}
      FROM billing.rate_cards
      WHERE id = $1
    `, [id]);
    return result.rows[0] ? mapRateCard(result.rows[0]) : null;
  },

  // List rate cards, optionally filtered by service type and/or active-only.
  async listRates(
    db: TransactionDatabase,
    filter: { serviceType?: string; activeOnly?: boolean } = {},
  ): Promise<RateCardRecord[]> {
    const { serviceType, activeOnly = true } = filter;

    const result = await db.client.query<RateCardRow>(`
      SELECT ${RATE_CARD_COLUMNS}
      FROM billing.rate_cards
      WHERE ($1::text IS NULL OR service_type = $1)
        AND (NOT $2 OR (${ACTIVE_EFFECTIVE_FILTER}))
      ORDER BY service_type, country_code NULLS LAST, provider NULLS LAST, effective_from DESC
    `, [serviceType ?? null, activeOnly]);

    return result.rows.map(mapRateCard);
  },

  // Compute credits = ROUND(quantity × creditsPerUnit, 4) inside PostgreSQL
  // to avoid all JavaScript floating-point hazards.
  async computeCredits(
    db: TransactionDatabase,
    quantity: string,
    creditsPerUnit: string,
  ): Promise<string> {
    const result = await db.client.query<{ calculated_credits: string }>(
      `SELECT ROUND($1::numeric * $2::numeric, 4)::text AS calculated_credits`,
      [quantity, creditsPerUnit],
    );
    return result.rows[0]!.calculated_credits;
  },

  // ─── Admin mutations (Phase 9) ──────────────────────────────────────────

  // Insert a new rate card. effectiveFrom defaults to NOW() in the DB if not provided.
  async createRateCard(
    db: TransactionDatabase,
    input: CreateRateCardInput,
  ): Promise<RateCardRecord> {
    const result = await db.client.query<RateCardRow>(`
      INSERT INTO billing.rate_cards (
        service_type, country_code, provider, unit_label, credits_per_unit,
        is_active, effective_from, effective_until, notes
      ) VALUES (
        $1, $2, $3, $4, $5::numeric,
        $6, COALESCE($7::timestamptz, NOW()), $8::timestamptz, $9
      )
      RETURNING ${RATE_CARD_COLUMNS}
    `, [
      input.serviceType,
      input.countryCode ?? null,
      input.provider ?? null,
      input.unitLabel,
      input.creditsPerUnit,
      input.isActive ?? true,
      input.effectiveFrom ?? null,
      input.effectiveUntil ?? null,
      input.notes ?? null,
    ]);
    return mapRateCard(result.rows[0]!);
  },

  // Update the safe-to-change fields: notes, is_active, effective_until.
  // Returns null if the rate card does not exist.
  async updateRateCard(
    db: TransactionDatabase,
    id: string,
    input: UpdateRateCardInput,
  ): Promise<RateCardRecord | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [id];

    if ("notes" in input) {
      params.push(input.notes ?? null);
      setClauses.push(`notes = $${params.length}`);
    }
    if ("isActive" in input) {
      params.push(input.isActive);
      setClauses.push(`is_active = $${params.length}`);
    }
    if ("effectiveUntil" in input) {
      params.push(input.effectiveUntil ?? null);
      setClauses.push(`effective_until = $${params.length}::timestamptz`);
    }

    if (setClauses.length === 0) {
      return rateCardRepository.findById(db, id);
    }

    const result = await db.client.query<RateCardRow>(`
      UPDATE billing.rate_cards
      SET ${setClauses.join(", ")}
      WHERE id = $1
      RETURNING ${RATE_CARD_COLUMNS}
    `, params);

    return result.rows[0] ? mapRateCard(result.rows[0]) : null;
  },

  // List rate cards with optional pagination (for admin views).
  async listRatesPaginated(
    db: TransactionDatabase,
    filter: { serviceType?: string; activeOnly?: boolean; limit?: number; offset?: number } = {},
  ): Promise<{ rows: RateCardRecord[]; total: number }> {
    const { serviceType, activeOnly = false, limit = 200, offset = 0 } = filter;

    const countResult = await db.client.query<{ total: string }>(`
      SELECT COUNT(*)::text AS total
      FROM billing.rate_cards
      WHERE ($1::text IS NULL OR service_type = $1)
        AND (NOT $2 OR (${ACTIVE_EFFECTIVE_FILTER}))
    `, [serviceType ?? null, activeOnly]);

    const dataResult = await db.client.query<RateCardRow>(`
      SELECT ${RATE_CARD_COLUMNS}
      FROM billing.rate_cards
      WHERE ($1::text IS NULL OR service_type = $1)
        AND (NOT $2 OR (${ACTIVE_EFFECTIVE_FILTER}))
      ORDER BY service_type, country_code NULLS LAST, provider NULLS LAST, effective_from DESC
      LIMIT $3 OFFSET $4
    `, [serviceType ?? null, activeOnly, limit, offset]);

    return {
      rows: dataResult.rows.map(mapRateCard),
      total: parseInt(countResult.rows[0]!.total, 10),
    };
  },
};
