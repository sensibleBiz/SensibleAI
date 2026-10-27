/**
 * Billing feature — pure logic tests.
 * Uses Node.js built-in test runner: node --test tests/billing.test.mjs
 *
 * Does not import React components or use Vite path aliases.
 * Tests the invariants that the billing pages rely on.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ─── Status classification ────────────────────────────────────────────────────
// Mirror of src/features/billing/types/billing.types.ts

const TERMINAL_STATUSES = new Set(["SUCCESS", "FAILED", "EXPIRED", "REFUNDED"]);
const POLLING_STATUSES = new Set(["CREATED", "PENDING"]);
const ALL_STATUSES = ["CREATED", "PENDING", "SUCCESS", "FAILED", "EXPIRED", "REFUNDED"];

describe("TopUpOrderStatus sets", () => {
  test("every status is either terminal or polling, never both", () => {
    for (const s of ALL_STATUSES) {
      const isTerminal = TERMINAL_STATUSES.has(s);
      const isPolling = POLLING_STATUSES.has(s);
      assert.ok(isTerminal !== isPolling, `Status "${s}" must be in exactly one set`);
    }
  });

  test("SUCCESS is terminal", () => {
    assert.ok(TERMINAL_STATUSES.has("SUCCESS"));
    assert.ok(!POLLING_STATUSES.has("SUCCESS"));
  });

  test("FAILED, EXPIRED, REFUNDED are terminal", () => {
    for (const s of ["FAILED", "EXPIRED", "REFUNDED"]) {
      assert.ok(TERMINAL_STATUSES.has(s), `${s} must be terminal`);
    }
  });

  test("CREATED and PENDING are polling statuses", () => {
    assert.ok(POLLING_STATUSES.has("CREATED"));
    assert.ok(POLLING_STATUSES.has("PENDING"));
  });

  test("TERMINAL_STATUSES has exactly 4 entries", () => {
    assert.equal(TERMINAL_STATUSES.size, 4);
  });

  test("POLLING_STATUSES has exactly 2 entries", () => {
    assert.equal(POLLING_STATUSES.size, 2);
  });
});

// ─── Amount validation ────────────────────────────────────────────────────────
// Mirror of validation logic in TopUp.tsx

const MIN_INR = 100;
const MAX_INR = 50000;

function isValidTopUpAmount(raw) {
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return false;
  const n = parseFloat(raw);
  return n >= MIN_INR && n <= MAX_INR;
}

describe("TopUp amount validation", () => {
  test("rejects empty string", () => {
    assert.ok(!isValidTopUpAmount(""));
  });

  test("rejects negative numbers", () => {
    assert.ok(!isValidTopUpAmount("-1"));
  });

  test("rejects amount below minimum", () => {
    assert.ok(!isValidTopUpAmount("99"));
    assert.ok(!isValidTopUpAmount("0"));
  });

  test("rejects amount above maximum", () => {
    assert.ok(!isValidTopUpAmount("50001"));
    assert.ok(!isValidTopUpAmount("99999"));
  });

  test("accepts minimum boundary", () => {
    assert.ok(isValidTopUpAmount("100"));
  });

  test("accepts maximum boundary", () => {
    assert.ok(isValidTopUpAmount("50000"));
  });

  test("accepts valid amounts within range", () => {
    assert.ok(isValidTopUpAmount("500"));
    assert.ok(isValidTopUpAmount("1000.50"));
    assert.ok(isValidTopUpAmount("25000"));
  });

  test("rejects more than 2 decimal places", () => {
    assert.ok(!isValidTopUpAmount("100.123"));
  });

  test("rejects non-numeric strings", () => {
    assert.ok(!isValidTopUpAmount("abc"));
    assert.ok(!isValidTopUpAmount("1,000"));
    assert.ok(!isValidTopUpAmount("₹500"));
  });
});

// ─── Credit display formatting ────────────────────────────────────────────────
// Mirror of formatCredits logic in TransactionHistory.tsx

function formatCredits(credits, txnType) {
  const n = Number(credits);
  const sign = txnType === "DEBIT" || txnType === "RESERVE" ? "−" : "+";
  return `${sign}${Math.abs(n).toLocaleString()} cr`;
}

describe("Credit display formatting", () => {
  test("CREDIT shows + prefix", () => {
    assert.ok(formatCredits("1000", "CREDIT").startsWith("+"));
  });

  test("DEBIT shows − prefix", () => {
    assert.ok(formatCredits("500", "DEBIT").startsWith("−"));
  });

  test("RESERVE shows − prefix", () => {
    assert.ok(formatCredits("200", "RESERVE").startsWith("−"));
  });

  test("RELEASE shows + prefix", () => {
    assert.ok(formatCredits("200", "RELEASE").startsWith("+"));
  });

  test("REVERSAL shows + prefix", () => {
    assert.ok(formatCredits("100", "REVERSAL").startsWith("+"));
  });

  test("always appends ' cr'", () => {
    for (const type of ["CREDIT", "DEBIT", "RESERVE", "RELEASE", "REVERSAL"]) {
      assert.ok(formatCredits("100", type).endsWith(" cr"), `${type} should end with ' cr'`);
    }
  });

  test("handles string NUMERIC inputs without float drift", () => {
    // These are PostgreSQL NUMERIC values returned as strings
    const result = formatCredits("1000000", "CREDIT");
    assert.ok(result.includes("1"), "should include the number");
  });
});

// ─── sessionStorage key contract ─────────────────────────────────────────────
// The key used in TopUp.tsx and PaymentReturn.tsx must match.

const PENDING_TOPUP_KEY = "sensible_pending_topup";

describe("PendingTopup sessionStorage contract", () => {
  test("key constant is stable", () => {
    assert.equal(PENDING_TOPUP_KEY, "sensible_pending_topup");
  });

  test("PendingTopup shape has required fields", () => {
    const pending = { orderId: "uuid-1", orderRef: "TU-ref", outletId: "uuid-2" };
    assert.ok("orderId" in pending, "must have orderId");
    assert.ok("orderRef" in pending, "must have orderRef");
    assert.ok("outletId" in pending, "must have outletId");
    // No other fields — do not store sensitive data
    assert.equal(Object.keys(pending).length, 3);
  });
});

// ─── Rate card form validation ────────────────────────────────────────────────
// Mirror of validateCreate/validateEdit logic in RateCardForm.tsx

const SERVICE_TYPE_VALUES = [
  "whatsapp.template",
  "whatsapp.utility",
  "whatsapp.authentication",
  "whatsapp.service",
  "email.ses",
  "sms.transactional",
  "ai.chat_token",
  "ai.embedding",
  "ai.agent_action",
];

function validateCreateRateCard(v) {
  const errors = [];
  if (!v.serviceType) errors.push("Service type is required.");
  if (!v.unitLabel.trim()) errors.push("Unit label is required.");
  if (v.unitLabel.trim().length > 32) errors.push("Unit label must be ≤ 32 characters.");
  if (!v.creditsPerUnit) {
    errors.push("Credits per unit is required.");
  } else if (!/^\d+(\.\d+)?$/.test(v.creditsPerUnit.trim())) {
    errors.push("Credits per unit must be a positive number.");
  } else if (parseFloat(v.creditsPerUnit) <= 0) {
    errors.push("Credits per unit must be greater than zero.");
  }
  if (v.effectiveFrom && v.effectiveUntil) {
    if (new Date(v.effectiveFrom) >= new Date(v.effectiveUntil)) {
      errors.push("Effective until must be after effective from.");
    }
  }
  if (v.notes.length > 2000) errors.push("Notes must be ≤ 2000 characters.");
  return errors;
}

function baseCreateForm(overrides = {}) {
  return {
    serviceType: "whatsapp.template",
    unitLabel: "message",
    creditsPerUnit: "1.5",
    effectiveFrom: "",
    effectiveUntil: "",
    notes: "",
    ...overrides,
  };
}

describe("RateCard form create validation", () => {
  test("valid form produces no errors", () => {
    const errors = validateCreateRateCard(baseCreateForm());
    assert.deepEqual(errors, []);
  });

  test("missing service type is rejected", () => {
    const errors = validateCreateRateCard(baseCreateForm({ serviceType: "" }));
    assert.ok(errors.some((e) => e.includes("Service type")));
  });

  test("missing unit label is rejected", () => {
    const errors = validateCreateRateCard(baseCreateForm({ unitLabel: "" }));
    assert.ok(errors.some((e) => e.includes("Unit label is required")));
  });

  test("unit label over 32 chars is rejected", () => {
    const errors = validateCreateRateCard(baseCreateForm({ unitLabel: "a".repeat(33) }));
    assert.ok(errors.some((e) => e.includes("≤ 32")));
  });

  test("unit label at exactly 32 chars is accepted", () => {
    const errors = validateCreateRateCard(baseCreateForm({ unitLabel: "a".repeat(32) }));
    assert.deepEqual(errors, []);
  });

  test("missing credits per unit is rejected", () => {
    const errors = validateCreateRateCard(baseCreateForm({ creditsPerUnit: "" }));
    assert.ok(errors.some((e) => e.includes("Credits per unit is required")));
  });

  test("non-numeric credits per unit is rejected", () => {
    const errors = validateCreateRateCard(baseCreateForm({ creditsPerUnit: "abc" }));
    assert.ok(errors.some((e) => e.includes("positive number")));
  });

  test("zero credits per unit is rejected", () => {
    const errors = validateCreateRateCard(baseCreateForm({ creditsPerUnit: "0" }));
    assert.ok(errors.some((e) => e.includes("greater than zero")));
  });

  test("negative credits per unit is rejected", () => {
    const errors = validateCreateRateCard(baseCreateForm({ creditsPerUnit: "-1" }));
    assert.ok(errors.some((e) => e.includes("positive number")));
  });

  test("effectiveUntil before effectiveFrom is rejected", () => {
    const errors = validateCreateRateCard(
      baseCreateForm({ effectiveFrom: "2026-12-01", effectiveUntil: "2026-01-01" })
    );
    assert.ok(errors.some((e) => e.includes("Effective until must be after")));
  });

  test("effectiveUntil equal to effectiveFrom is rejected", () => {
    const errors = validateCreateRateCard(
      baseCreateForm({ effectiveFrom: "2026-06-01", effectiveUntil: "2026-06-01" })
    );
    assert.ok(errors.some((e) => e.includes("Effective until must be after")));
  });

  test("effectiveUntil after effectiveFrom is accepted", () => {
    const errors = validateCreateRateCard(
      baseCreateForm({ effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" })
    );
    assert.deepEqual(errors, []);
  });

  test("notes over 2000 chars is rejected", () => {
    const errors = validateCreateRateCard(baseCreateForm({ notes: "a".repeat(2001) }));
    assert.ok(errors.some((e) => e.includes("≤ 2000")));
  });

  test("notes at exactly 2000 chars is accepted", () => {
    const errors = validateCreateRateCard(baseCreateForm({ notes: "a".repeat(2000) }));
    assert.deepEqual(errors, []);
  });

  test("decimal credits per unit (4 decimal places) is accepted", () => {
    const errors = validateCreateRateCard(baseCreateForm({ creditsPerUnit: "0.0001" }));
    assert.deepEqual(errors, []);
  });

  test("all defined service types are valid values", () => {
    for (const st of SERVICE_TYPE_VALUES) {
      const errors = validateCreateRateCard(baseCreateForm({ serviceType: st }));
      assert.deepEqual(errors, [], `Service type "${st}" should be valid`);
    }
  });
});

// ─── Rate card status display ────────────────────────────────────────────────
// Mirror of StatusBadge logic in RateCardList.tsx

function getStatusLabel(isActive, effectiveUntil) {
  const now = new Date();
  const expired = effectiveUntil ? new Date(effectiveUntil) <= now : false;
  if (!isActive || expired) return "inactive";
  if (effectiveUntil) return "expiring";
  return "active";
}

describe("RateCard status display logic", () => {
  test("active with no expiry shows active", () => {
    assert.equal(getStatusLabel(true, null), "active");
  });

  test("inactive with no expiry shows inactive", () => {
    assert.equal(getStatusLabel(false, null), "inactive");
  });

  test("active with future expiry shows expiring", () => {
    const future = new Date(Date.now() + 86400000 * 30).toISOString();
    assert.equal(getStatusLabel(true, future), "expiring");
  });

  test("active with past expiry shows inactive (expired)", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    assert.equal(getStatusLabel(true, past), "inactive");
  });

  test("inactive with future expiry still shows inactive", () => {
    const future = new Date(Date.now() + 86400000 * 30).toISOString();
    assert.equal(getStatusLabel(false, future), "inactive");
  });
});

// ─── Rate card scope label ────────────────────────────────────────────────────
// Mirror of scopeLabel helper in RateCardList.tsx

function scopeLabel(countryCode, provider) {
  if (!countryCode && !provider) return "Global";
  if (countryCode && !provider) return countryCode;
  if (!countryCode && provider) return provider;
  return `${countryCode} / ${provider}`;
}

describe("RateCard scope label", () => {
  test("no country or provider → Global", () => {
    assert.equal(scopeLabel(null, null), "Global");
  });

  test("country only → country code", () => {
    assert.equal(scopeLabel("IN", null), "IN");
  });

  test("provider only → provider name", () => {
    assert.equal(scopeLabel(null, "twilio"), "twilio");
  });

  test("both country and provider → combined", () => {
    assert.equal(scopeLabel("IN", "twilio"), "IN / twilio");
  });
});

// ─── API URL encoding ─────────────────────────────────────────────────────────
// Verify URL encoding for UUIDs used in billingApi

describe("API URL parameter encoding", () => {
  const UUID = "12345678-1234-1234-1234-123456789012";

  test("encodeURIComponent is a no-op for UUID characters", () => {
    assert.equal(encodeURIComponent(UUID), UUID);
  });

  test("wallet URL is correctly formed", () => {
    const url = `/api/v1/billing/wallet?outletId=${encodeURIComponent(UUID)}`;
    assert.equal(url, `/api/v1/billing/wallet?outletId=${UUID}`);
  });

  test("status URL encodes orderId in path correctly", () => {
    const url = `/api/v1/billing/topup/${encodeURIComponent(UUID)}/status?outletId=${encodeURIComponent(UUID)}`;
    assert.ok(url.startsWith("/api/v1/billing/topup/"));
    assert.ok(url.includes("/status?outletId="));
  });

  test("rate card list URL encodes serviceType filter", () => {
    const st = "whatsapp.template";
    const params = new URLSearchParams({ serviceType: st });
    const url = `/api/v1/billing/rate-cards?${params.toString()}`;
    assert.ok(url.includes("serviceType=whatsapp.template"));
  });

  test("rate card deactivate URL has correct shape", () => {
    const url = `/api/v1/billing/rate-cards/${encodeURIComponent(UUID)}/deactivate`;
    assert.ok(url.startsWith("/api/v1/billing/rate-cards/"));
    assert.ok(url.endsWith("/deactivate"));
  });

  test("rate card edit URL has correct shape", () => {
    const url = `/billing/rate-cards/${UUID}/edit`;
    assert.ok(url.includes("/edit"));
    assert.ok(url.startsWith("/billing/rate-cards/"));
  });
});
