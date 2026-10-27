import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { ROUTES_PATHS } from "@/shared/lib/constants";
import { ApiError } from "@/shared/api/apiClient";
import { billingApi } from "../api/billingApi";

const MIN_INR = 100;
const MAX_INR = 50000;

const PENDING_TOPUP_KEY = "sensible_pending_topup";
const TOPUP_REQUEST_KEY = "sensible_topup_request";

export interface PendingTopup {
  orderId: string;
  orderRef: string;
  outletId: string;
}

interface PendingTopupRequest {
  idempotencyKey: string;
  outletId: string;
  amountInr: string;
}

export default function TopUp() {
  const outletId = useSelector((s: RootState) => s.appState.outletInfo?.id ?? "");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const requestKeyRef = useRef<PendingTopupRequest | null>(null);

  const amountNum = parseFloat(amount);
  const isValidAmount =
    /^\d+(\.\d{1,2})?$/.test(amount) &&
    amountNum >= MIN_INR &&
    amountNum <= MAX_INR;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outletId || !isValidAmount || submitting) return;

    setSubmitting(true);
    setError(null);
    setNotConfigured(false);

    const request = { outletId, amountInr: amount };
    try {
      const saved = sessionStorage.getItem(TOPUP_REQUEST_KEY);
      const savedRequest = saved ? JSON.parse(saved) as PendingTopupRequest : null;
      if (
        !requestKeyRef.current &&
        savedRequest?.outletId === outletId &&
        typeof savedRequest.idempotencyKey === "string"
      ) {
        requestKeyRef.current = savedRequest;
      }
    } catch {
      // Retain the in-memory key when session storage is unavailable.
    }
    if (
      requestKeyRef.current?.outletId === outletId &&
      requestKeyRef.current.amountInr !== amount
    ) {
      setError("A previous top-up is still being resolved. Retry the same amount to check its status before starting another.");
      setSubmitting(false);
      return;
    }
    if (
      requestKeyRef.current &&
      (requestKeyRef.current.outletId !== outletId || requestKeyRef.current.amountInr !== amount)
    ) requestKeyRef.current = null;
    if (
      !requestKeyRef.current ||
      requestKeyRef.current.outletId !== outletId ||
      requestKeyRef.current.amountInr !== amount
    ) {
      requestKeyRef.current = { ...request, idempotencyKey: crypto.randomUUID() };
    }
    const idempotencyKey = requestKeyRef.current.idempotencyKey;
    try {
      sessionStorage.setItem(TOPUP_REQUEST_KEY, JSON.stringify(requestKeyRef.current));
    } catch {
      // The in-memory key still protects retries while this page remains open.
    }

    try {
      const result = await billingApi.initiateTopUp(outletId, amount, idempotencyKey);

      // Store mapping so PaymentReturn can look up orderId by orderRef
      const pending: PendingTopup = {
        orderId: result.orderId,
        orderRef: result.orderRef,
        outletId,
      };
      try {
        sessionStorage.setItem(PENDING_TOPUP_KEY, JSON.stringify(pending));
      } catch {
        // SessionStorage blocked — PaymentReturn will handle gracefully
      }
      try {
        sessionStorage.removeItem(TOPUP_REQUEST_KEY);
      } catch {
        // The in-flight result is already known; a stale key is safe because the API is idempotent.
      }
      requestKeyRef.current = null;

      if (result.reused || !result.redirectUrl) {
        window.location.href =
          `${ROUTES_PATHS.BILLING_PAYMENT_RETURN}?orderRef=${encodeURIComponent(result.orderRef)}`;
      } else {
        // Hard redirect to PhonePe — not React Router navigate
        window.location.href = result.redirectUrl;
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "TOPUP_NOT_CONFIGURED") {
          setNotConfigured(true);
        } else {
          setError(err.message);
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
      setSubmitting(false);
    }
  };

  if (!outletId) {
    return (
      <div style={styles.container}>
        <p style={styles.hint}>Select an outlet before topping up.</p>
      </div>
    );
  }

  if (notConfigured) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.heading}>Top Up Wallet</h2>
          <div style={styles.warnBox}>
            <strong>Online top-up is not available</strong>
            <p style={{ margin: "8px 0 0", fontSize: 14, color: "#7a5800" }}>
              Payment processing is not yet configured for this workspace. Contact
              support to enable online wallet recharges.
            </p>
          </div>
          <Link to={ROUTES_PATHS.BILLING_WALLET} style={styles.backLink}>
            ← Back to Wallet
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <Link to={ROUTES_PATHS.BILLING_WALLET} style={styles.backLink}>
          ← Wallet
        </Link>
        <h2 style={styles.heading}>Top Up Wallet</h2>
        <p style={styles.hint}>
          Enter the amount in INR you want to add as prepaid credits. Min ₹{MIN_INR} · Max ₹
          {MAX_INR.toLocaleString()}.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} style={styles.form}>
          <label style={styles.label} htmlFor="amount">
            Amount (₹)
          </label>
          <div style={styles.inputRow}>
            <span style={styles.rupee}>₹</span>
            <input
              id="amount"
              type="number"
              min={MIN_INR}
              max={MAX_INR}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`${MIN_INR}–${MAX_INR.toLocaleString()}`}
              style={styles.input}
              disabled={submitting}
              autoFocus
            />
          </div>

          {amount && !isValidAmount && (
            <p style={styles.fieldError}>
              {amountNum < MIN_INR
                ? `Minimum top-up is ₹${MIN_INR}`
                : amountNum > MAX_INR
                  ? `Maximum top-up is ₹${MAX_INR.toLocaleString()}`
                  : "Enter a valid amount (e.g. 500)"}
            </p>
          )}

          {error && <p style={styles.error}>{error}</p>}

          <button
            type="submit"
            style={{
              ...styles.btnPrimary,
              opacity: !isValidAmount || submitting ? 0.6 : 1,
              cursor: !isValidAmount || submitting ? "not-allowed" : "pointer",
            }}
            disabled={!isValidAmount || submitting}
          >
            {submitting ? "Redirecting to PhonePe…" : "Pay with PhonePe →"}
          </button>
        </form>

        <p style={styles.secureNote}>
          🔒 You will be redirected to PhonePe's secure payment page. Do not close this
          tab until the payment is complete.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: "24px", maxWidth: 480, margin: "0 auto" },
  card: { background: "#fff", borderRadius: 12, padding: 32, boxShadow: "0 1px 6px rgba(0,0,0,.08)" },
  heading: { fontSize: 22, fontWeight: 600, margin: "8px 0 12px", color: "#1a1a2e" },
  backLink: { fontSize: 13, color: "#4f46e5", textDecoration: "none", display: "inline-block", marginBottom: 4 },
  hint: { color: "#555", fontSize: 14, marginBottom: 20 },
  form: { display: "flex", flexDirection: "column", gap: 8 },
  label: { fontSize: 14, fontWeight: 600, color: "#333" },
  inputRow: { display: "flex", alignItems: "center", border: "1px solid #d1d5db", borderRadius: 8, overflow: "hidden" },
  rupee: { padding: "0 12px", fontSize: 16, color: "#666", background: "#f9fafb", height: 44, display: "flex", alignItems: "center", borderRight: "1px solid #d1d5db" },
  input: { flex: 1, border: "none", outline: "none", padding: "10px 12px", fontSize: 16, height: 44 },
  fieldError: { color: "#c0392b", fontSize: 13, margin: 0 },
  error: { color: "#c0392b", fontSize: 14 },
  btnPrimary: {
    marginTop: 8,
    background: "#4f46e5",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "12px",
    fontSize: 15,
    fontWeight: 600,
    textAlign: "center",
  },
  secureNote: { fontSize: 12, color: "#888", marginTop: 20, lineHeight: 1.5 },
  warnBox: {
    background: "#fff8e1",
    border: "1px solid #ffe082",
    borderRadius: 8,
    padding: "16px",
    marginBottom: 16,
    color: "#7a5800",
  },
};
