import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { ROUTES_PATHS } from "@/shared/lib/constants";
import { ApiError } from "@/shared/api/apiClient";
import { billingApi } from "../api/billingApi";
import type { RateCardRecord } from "../types/billing.types";
import { ALL_SERVICE_TYPE_VALUES } from "../types/billing.types";

type FormMode = "create" | "edit";

interface FormValues {
  serviceType: string;
  countryCode: string;
  provider: string;
  unitLabel: string;
  creditsPerUnit: string;
  isActive: boolean;
  effectiveFrom: string;
  effectiveUntil: string;
  notes: string;
}

const EMPTY_FORM: FormValues = {
  serviceType: ALL_SERVICE_TYPE_VALUES[0] ?? "",
  countryCode: "",
  provider: "",
  unitLabel: "message",
  creditsPerUnit: "",
  isActive: true,
  effectiveFrom: "",
  effectiveUntil: "",
  notes: "",
};

function toDateInputValue(isoString: string): string {
  if (!isoString) return "";
  return isoString.slice(0, 10);
}

function toUtcDateBoundary(date: string, endOfDay = false): string | null | undefined {
  if (!date) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const boundary = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const value = new Date(`${date}T${boundary}Z`);
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== date) {
    return null;
  }
  return value.toISOString();
}

function validateCreate(v: FormValues): string[] {
  const errors: string[] = [];
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
  if (v.effectiveFrom && toUtcDateBoundary(v.effectiveFrom) === null) {
    errors.push("Effective from must be a valid date.");
  }
  if (v.effectiveUntil && toUtcDateBoundary(v.effectiveUntil, true) === null) {
    errors.push("Effective until must be a valid date.");
  }
  if (v.notes.length > 2000) errors.push("Notes must be ≤ 2000 characters.");
  return errors;
}

function validateEdit(v: FormValues): string[] {
  const errors: string[] = [];
  if (v.effectiveUntil && new Date(v.effectiveUntil) <= new Date()) {
    errors.push("Effective until must be in the future.");
  }
  if (v.effectiveUntil && toUtcDateBoundary(v.effectiveUntil, true) === null) {
    errors.push("Effective until must be a valid date.");
  }
  if (v.notes.length > 2000) errors.push("Notes must be ≤ 2000 characters.");
  return errors;
}

export default function RateCardForm() {
  const { id } = useParams<{ id?: string }>();
  const mode: FormMode = id ? "edit" : "create";
  const navigate = useNavigate();

  const isTenantAdmin = useSelector(
    (s: RootState) => s.auth.postgresAccess?.tenant.isTenantAdmin ?? false,
  );

  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [original, setOriginal] = useState<RateCardRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(mode === "edit");
  const [submitting, setSubmitting] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  // Load existing rate card for edit
  useEffect(() => {
    if (mode !== "edit" || !id) return;
    let cancelled = false;
    setLoadingData(true);
    billingApi
      .getRateCard(id)
      .then(({ rateCard }) => {
        if (cancelled) return;
        setOriginal(rateCard);
        setForm({
          serviceType: rateCard.serviceType,
          countryCode: rateCard.countryCode ?? "",
          provider: rateCard.provider ?? "",
          unitLabel: rateCard.unitLabel,
          creditsPerUnit: rateCard.creditsPerUnit,
          isActive: rateCard.isActive,
          effectiveFrom: toDateInputValue(rateCard.effectiveFrom),
          effectiveUntil: toDateInputValue(rateCard.effectiveUntil ?? ""),
          notes: rateCard.notes ?? "",
        });
        setLoadingData(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : "Failed to load rate card");
        setLoadingData(false);
      });
    return () => { cancelled = true; };
  }, [id, mode]);

  const set = (field: keyof FormValues, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitErrors([]);
    setServerError(null);

    const errors = mode === "create" ? validateCreate(form) : validateEdit(form);
    if (errors.length > 0) {
      setSubmitErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "create") {
        const effectiveFrom = toUtcDateBoundary(form.effectiveFrom);
        const effectiveUntil = toUtcDateBoundary(form.effectiveUntil, true);
        await billingApi.createRateCard({
          serviceType: form.serviceType,
          countryCode: form.countryCode || null,
          provider: form.provider || null,
          unitLabel: form.unitLabel.trim(),
          creditsPerUnit: form.creditsPerUnit.trim(),
          isActive: form.isActive,
          effectiveFrom,
          effectiveUntil: effectiveUntil ?? null,
          notes: form.notes || null,
        });
      } else {
        const effectiveUntil = toUtcDateBoundary(form.effectiveUntil, true);
        await billingApi.updateRateCard(id!, {
          isActive: form.isActive,
          effectiveUntil: effectiveUntil ?? null,
          notes: form.notes || null,
        });
      }
      navigate(ROUTES_PATHS.BILLING_RATE_CARDS);
    } catch (err) {
      if (err instanceof ApiError) {
        if ((err as { code?: string }).code === "DUPLICATE_ACTIVE_RATE") {
          setServerError(
            "An active rate card already exists for this service type / country / provider combination. Deactivate the existing one first, or choose a different scope.",
          );
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError("An unexpected error occurred.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!isTenantAdmin) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.heading}>Rate Card</h2>
          <p style={{ color: "#c0392b" }}>You do not have permission to manage rate cards.</p>
        </div>
      </div>
    );
  }

  if (loadingData) {
    return <div style={styles.container}><p style={styles.hint}>Loading…</p></div>;
  }

  if (loadError) {
    return (
      <div style={styles.container}>
        <p style={styles.error}>{loadError}</p>
        <Link to={ROUTES_PATHS.BILLING_RATE_CARDS} style={styles.backLink}>← Back to rate cards</Link>
      </div>
    );
  }

  const isEditMode = mode === "edit";
  const title = isEditMode ? "Edit Rate Card" : "New Rate Card";

  return (
    <div style={styles.container}>
      <Link to={ROUTES_PATHS.BILLING_RATE_CARDS} style={styles.backLink}>← Rate Cards</Link>
      <h2 style={styles.heading}>{title}</h2>

      {isEditMode && original && (
        <div style={styles.infoBox}>
          <strong>ID:</strong> <code style={styles.code}>{original.id}</code>
          <br />
          <small style={{ color: "#888" }}>
            Structural fields (service type, scope, unit label, credits/unit) are immutable to preserve billing history.
            Only notes, active status, and effective-until date may be changed.
          </small>
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} style={styles.form}>
        {submitErrors.length > 0 && (
          <div style={styles.errorBox}>
            {submitErrors.map((e) => <div key={e}>{e}</div>)}
          </div>
        )}
        {serverError && <div style={styles.errorBox}>{serverError}</div>}

        {/* Service Type */}
        <div style={styles.field}>
          <label style={styles.label}>Service Type *</label>
          {isEditMode ? (
            <div style={styles.readonlyValue}><code style={styles.code}>{form.serviceType}</code></div>
          ) : (
            <select
              style={styles.input}
              value={form.serviceType}
              onChange={(e) => set("serviceType", e.target.value)}
              required
            >
              {ALL_SERVICE_TYPE_VALUES.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          )}
        </div>

        {/* Country Code */}
        <div style={styles.field}>
          <label style={styles.label}>Country Code</label>
          {isEditMode ? (
            <div style={styles.readonlyValue}>{original?.countryCode ?? <em style={{ color: "#999" }}>— (global)</em>}</div>
          ) : (
            <input
              type="text"
              style={styles.input}
              placeholder="e.g. IN, US (leave blank for global)"
              value={form.countryCode}
              onChange={(e) => set("countryCode", e.target.value.toUpperCase())}
              maxLength={2}
            />
          )}
          {!isEditMode && <small style={styles.hint}>ISO-3166-1 alpha-2 or blank for global fallback.</small>}
        </div>

        {/* Provider */}
        <div style={styles.field}>
          <label style={styles.label}>Provider</label>
          {isEditMode ? (
            <div style={styles.readonlyValue}>{original?.provider ?? <em style={{ color: "#999" }}>— (any)</em>}</div>
          ) : (
            <input
              type="text"
              style={styles.input}
              placeholder="e.g. twilio, ses (leave blank for any)"
              value={form.provider}
              onChange={(e) => set("provider", e.target.value.toLowerCase())}
            />
          )}
        </div>

        {/* Unit Label */}
        <div style={styles.field}>
          <label style={styles.label}>Unit Label *</label>
          {isEditMode ? (
            <div style={styles.readonlyValue}>{form.unitLabel}</div>
          ) : (
            <input
              type="text"
              style={styles.input}
              placeholder="e.g. message, token, email"
              value={form.unitLabel}
              onChange={(e) => set("unitLabel", e.target.value)}
              maxLength={32}
              required
            />
          )}
        </div>

        {/* Credits Per Unit */}
        <div style={styles.field}>
          <label style={styles.label}>Credits Per Unit *</label>
          {isEditMode ? (
            <div style={styles.readonlyValue}>{Number(form.creditsPerUnit).toFixed(4)}</div>
          ) : (
            <input
              type="text"
              style={styles.input}
              placeholder="e.g. 1.5000"
              value={form.creditsPerUnit}
              onChange={(e) => set("creditsPerUnit", e.target.value)}
              required
            />
          )}
          {!isEditMode && <small style={styles.hint}>Stored as NUMERIC(10,4). Positive number required.</small>}
        </div>

        {/* Active */}
        <div style={styles.field}>
          <label style={{ ...styles.label, display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
            />
            Active
          </label>
          <small style={styles.hint}>Inactive rate cards are not used for billing.</small>
        </div>

        {/* Effective From (create only) */}
        {!isEditMode && (
          <div style={styles.field}>
            <label style={styles.label}>Effective From</label>
            <input
              type="date"
              style={styles.input}
              value={form.effectiveFrom}
              onChange={(e) => set("effectiveFrom", e.target.value)}
            />
            <small style={styles.hint}>Leave blank to use current timestamp.</small>
          </div>
        )}

        {/* Effective Until */}
        <div style={styles.field}>
          <label style={styles.label}>Effective Until</label>
          <input
            type="date"
            style={styles.input}
            value={form.effectiveUntil}
            onChange={(e) => set("effectiveUntil", e.target.value)}
          />
          <small style={styles.hint}>Leave blank for no expiry.</small>
        </div>

        {/* Notes */}
        <div style={styles.field}>
          <label style={styles.label}>Notes</label>
          <textarea
            style={{ ...styles.input, minHeight: 80, resize: "vertical" }}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            maxLength={2000}
            placeholder="Optional internal notes"
          />
          <small style={styles.hint}>{form.notes.length}/2000 characters</small>
        </div>

        <div style={styles.actions}>
          <button
            type="button"
            style={styles.btnSecondary}
            onClick={() => navigate(ROUTES_PATHS.BILLING_RATE_CARDS)}
          >
            Cancel
          </button>
          <button type="submit" style={styles.btnPrimary} disabled={submitting}>
            {submitting ? "Saving…" : isEditMode ? "Save Changes" : "Create Rate Card"}
          </button>
        </div>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 24, maxWidth: 600, margin: "0 auto" },
  card: { background: "#fff", borderRadius: 12, padding: 32, boxShadow: "0 1px 6px rgba(0,0,0,.08)" },
  heading: { fontSize: 22, fontWeight: 600, margin: "4px 0 20px", color: "#1a1a2e" },
  backLink: { fontSize: 13, color: "#4f46e5", textDecoration: "none", display: "block", marginBottom: 8 },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 13, fontWeight: 600, color: "#374151" },
  input: {
    padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db",
    fontSize: 14, outline: "none", background: "#fff", color: "#1a1a2e",
  },
  readonlyValue: {
    padding: "9px 12px", borderRadius: 8, background: "#f9fafb",
    border: "1px solid #e5e7eb", fontSize: 14, color: "#6b7280",
  },
  code: { fontFamily: "monospace", fontSize: 12, background: "#f3f4f6", padding: "1px 4px", borderRadius: 3 },
  hint: { fontSize: 12, color: "#9ca3af" },
  errorBox: {
    background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8,
    padding: "12px 16px", fontSize: 14, color: "#991b1b", lineHeight: 1.6,
  },
  infoBox: {
    background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8,
    padding: "12px 16px", fontSize: 13, lineHeight: 1.8, marginBottom: 8,
  },
  actions: { display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 },
  btnPrimary: {
    background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8,
    padding: "10px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  btnSecondary: {
    background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8,
    padding: "10px 22px", fontSize: 14, cursor: "pointer",
  },
  error: { color: "#c0392b", fontSize: 14 },
};
