import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ROUTES_PATHS } from "@/shared/lib/constants";
import { ApiError } from "@/shared/api/apiClient";
import { billingApi } from "../api/billingApi";
import type { TopUpOrderStatus, VerifyTopUpResult } from "../types/billing.types";
import { TERMINAL_STATUSES } from "../types/billing.types";
import type { PendingTopup } from "./TopUp";

const PENDING_TOPUP_KEY = "sensible_pending_topup";
const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 20;

type PageState =
  | { phase: "loading"; attempt: number }
  | { phase: "result"; result: VerifyTopUpResult }
  | { phase: "timeout" }
  | { phase: "error"; message: string }
  | { phase: "mismatch" };

function readPending(): PendingTopup | null {
  try {
    const raw = sessionStorage.getItem(PENDING_TOPUP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingTopup;
  } catch {
    return null;
  }
}

function clearPending() {
  try {
    sessionStorage.removeItem(PENDING_TOPUP_KEY);
  } catch {
    // ignore
  }
}

function StatusIcon({ status }: { status: TopUpOrderStatus }) {
  if (status === "SUCCESS") return <span style={styles.iconSuccess}>✅</span>;
  if (status === "PENDING" || status === "CREATED")
    return <span style={styles.iconPending}>⏳</span>;
  return <span style={styles.iconFailed}>❌</span>;
}

export default function PaymentReturn() {
  const [searchParams] = useSearchParams();
  const [pageState, setPageState] = useState<PageState>({ phase: "loading", attempt: 0 });
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const orderRefFromUrl = searchParams.get("orderRef");
    const pending = readPending();

    if (!pending) {
      setPageState({ phase: "error", message: "No pending top-up found. If you completed a payment, check your transaction history." });
      return;
    }

    if (orderRefFromUrl && pending.orderRef !== orderRefFromUrl) {
      setPageState({ phase: "mismatch" });
      return;
    }

    const { orderId, outletId } = pending;

    const poll = async () => {
      attemptRef.current += 1;
      setPageState({ phase: "loading", attempt: attemptRef.current });

      try {
        const result = await billingApi.getTopUpStatus(orderId, outletId);

        if (TERMINAL_STATUSES.has(result.status)) {
          if (result.status === "SUCCESS") clearPending();
          setPageState({ phase: "result", result });
          return;
        }

        if (attemptRef.current >= MAX_ATTEMPTS) {
          setPageState({ phase: "timeout" });
          return;
        }

        timerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch (err) {
        if (err instanceof ApiError) {
          setPageState({ phase: "error", message: err.message });
        } else {
          setPageState({ phase: "error", message: "Unable to check payment status. Please check your transaction history." });
        }
      }
    };

    void poll();

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pageState.phase === "loading") {
    const dots = ".".repeat((pageState.attempt % 3) + 1);
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.iconPending}>⏳</p>
          <h2 style={styles.heading}>Checking Payment Status{dots}</h2>
          <p style={styles.hint}>
            Attempt {pageState.attempt} of {MAX_ATTEMPTS}. This may take a few seconds.
          </p>
        </div>
      </div>
    );
  }

  if (pageState.phase === "timeout") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.iconPending}>⏳</p>
          <h2 style={styles.heading}>Payment Status Unknown</h2>
          <p style={styles.hint}>
            We could not confirm your payment in time. If you completed the payment, credits will
            be added automatically once the payment is confirmed by the provider.
          </p>
          <div style={styles.buttonRow}>
            <Link to={ROUTES_PATHS.BILLING_TRANSACTIONS} style={styles.btnSecondary}>
              View Transactions
            </Link>
            <Link to={ROUTES_PATHS.BILLING_WALLET} style={styles.btnPrimary}>
              Go to Wallet
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (pageState.phase === "error") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.iconFailed}>⚠️</p>
          <h2 style={styles.heading}>Could Not Verify Payment</h2>
          <p style={{ ...styles.hint, color: "#c0392b" }}>{pageState.message}</p>
          <div style={styles.buttonRow}>
            <Link to={ROUTES_PATHS.BILLING_TRANSACTIONS} style={styles.btnSecondary}>
              View Transactions
            </Link>
            <Link to={ROUTES_PATHS.BILLING_WALLET} style={styles.btnPrimary}>
              Go to Wallet
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (pageState.phase === "mismatch") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.iconFailed}>⚠️</p>
          <h2 style={styles.heading}>Unexpected Return</h2>
          <p style={styles.hint}>
            The payment reference does not match. Check your transaction history for the
            latest status.
          </p>
          <Link to={ROUTES_PATHS.BILLING_TRANSACTIONS} style={styles.btnPrimary}>
            View Transactions
          </Link>
        </div>
      </div>
    );
  }

  // Terminal result
  const { result } = pageState;
  const isSuccess = result.status === "SUCCESS";

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <StatusIcon status={result.status} />
        <h2 style={styles.heading}>
          {isSuccess ? "Payment Successful!" : `Payment ${result.status.charAt(0) + result.status.slice(1).toLowerCase()}`}
        </h2>
        {isSuccess && result.creditsGranted !== null && (
          <p style={styles.creditsGranted}>
            +{Number(result.creditsGranted).toLocaleString()} credits added to your wallet
          </p>
        )}
        {!isSuccess && (
          <p style={{ ...styles.hint, color: "#c0392b" }}>
            The payment was not completed. No credits have been added.
            {result.status === "REFUNDED" && " A refund has been initiated."}
          </p>
        )}
        <div style={styles.buttonRow}>
          {isSuccess ? (
            <>
              <Link to={ROUTES_PATHS.BILLING_TRANSACTIONS} style={styles.btnSecondary}>
                View Transactions
              </Link>
              <Link to={ROUTES_PATHS.BILLING_WALLET} style={styles.btnPrimary}>
                Go to Wallet
              </Link>
            </>
          ) : (
            <>
              <Link to={ROUTES_PATHS.BILLING_WALLET} style={styles.btnSecondary}>
                Go to Wallet
              </Link>
              <Link to={ROUTES_PATHS.BILLING_TOPUP} style={styles.btnPrimary}>
                Try Again
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: "24px", maxWidth: 480, margin: "0 auto" },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: "40px 32px",
    boxShadow: "0 1px 6px rgba(0,0,0,.08)",
    textAlign: "center",
  },
  heading: { fontSize: 22, fontWeight: 600, margin: "8px 0 12px", color: "#1a1a2e" },
  hint: { color: "#555", fontSize: 14, lineHeight: 1.6 },
  creditsGranted: { fontSize: 20, fontWeight: 700, color: "#2d7a2d", marginBottom: 8 },
  iconSuccess: { fontSize: 48, display: "block", marginBottom: 8 },
  iconPending: { fontSize: 48, display: "block", marginBottom: 8 },
  iconFailed: { fontSize: 48, display: "block", marginBottom: 8 },
  buttonRow: { display: "flex", gap: 12, justifyContent: "center", marginTop: 24, flexWrap: "wrap" },
  btnPrimary: {
    background: "#4f46e5",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer",
  },
  btnSecondary: {
    background: "#f3f4f6",
    color: "#1a1a2e",
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer",
  },
};
