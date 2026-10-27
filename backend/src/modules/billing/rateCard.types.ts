// NUMERIC columns from PostgreSQL arrive as strings. Never use float arithmetic on these.

export const BILLING_SERVICE_TYPES = {
  WHATSAPP_TEMPLATE: "whatsapp.template",
  WHATSAPP_UTILITY: "whatsapp.utility",
  WHATSAPP_AUTHENTICATION: "whatsapp.authentication",
  WHATSAPP_SERVICE: "whatsapp.service",
  EMAIL_SES: "email.ses",
  SMS_TRANSACTIONAL: "sms.transactional",
  AI_CHAT_TOKEN: "ai.chat_token",
  AI_EMBEDDING: "ai.embedding",
  AI_AGENT_ACTION: "ai.agent_action",
} as const;

export type BillingServiceType = (typeof BILLING_SERVICE_TYPES)[keyof typeof BILLING_SERVICE_TYPES];

export interface RateCardRecord {
  id: string;
  serviceType: string;
  countryCode: string | null;
  provider: string | null;
  unitLabel: string;
  creditsPerUnit: string;   // NUMERIC(10,4) as string — never convert to float for arithmetic
  isActive: boolean;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  notes: string | null;
  createdAt: Date;
}

// Options for resolving the best rate for a given service call.
// Resolution precedence (most specific wins):
//   1. (serviceType, countryCode, provider) — exact
//   2. (serviceType, countryCode, NULL)     — country-level, any provider
//   3. (serviceType, NULL, NULL)            — global default
export interface RateResolutionOptions {
  countryCode?: string;
  provider?: string;
}

// Input to calculateBillingAmount — the single Phase 5 integration point.
export interface RateCardLookupOptions {
  serviceType: string;
  quantity: string;           // positive decimal string, e.g. "1.0000"
  countryCode?: string;
  provider?: string;
}

// Returned by calculateBillingAmount.
// Phase 5 usage_events stores: rateCard.id, unitLabel, quantity, calculatedCredits.
export interface RateCardLookupResult {
  rateCard: RateCardRecord;
  quantity: string;           // echoed from input
  unitLabel: string;          // snapshot from rateCard.unitLabel
  creditsPerUnit: string;     // snapshot from rateCard.creditsPerUnit
  calculatedCredits: string;  // ROUND(quantity × creditsPerUnit, 4) computed by PostgreSQL
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin mutation types (Phase 9)
// ─────────────────────────────────────────────────────────────────────────────

// Input for creating a new rate card. effectiveFrom defaults to NOW() if omitted.
export interface CreateRateCardInput {
  serviceType: string;
  countryCode?: string | null;
  provider?: string | null;
  unitLabel: string;
  creditsPerUnit: string;   // NUMERIC(10,4) string — must be > 0
  isActive?: boolean;       // defaults to true
  effectiveFrom?: string;   // ISO 8601 timestamp; defaults to NOW()
  effectiveUntil?: string | null;
  notes?: string | null;
}

// Fields that can be safely updated without breaking historical billing records.
// Immutable fields (serviceType, countryCode, provider, unitLabel, creditsPerUnit,
// effectiveFrom) must not change once a rate card has been referenced by usage events.
export interface UpdateRateCardInput {
  notes?: string | null;
  isActive?: boolean;
  effectiveUntil?: string | null;
}

// Filter options for admin listing (extends existing listRates filter).
export interface AdminRateCardFilter {
  serviceType?: string;
  activeOnly?: boolean;
  limit?: number;   // default 200, max 500
  offset?: number;
}
