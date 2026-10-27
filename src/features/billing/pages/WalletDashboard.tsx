import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { ROUTES_PATHS } from "@/shared/lib/constants";
import { ApiError } from "@/shared/api/apiClient";
import { billingApi } from "../api/billingApi";
import type { WalletRecord } from "../types/billing.types";

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "wallet"; wallet: WalletRecord }
  | { phase: "no_wallet" }
  | { phase: "error"; message: string };

export default function WalletDashboard() {
  const outletId = useSelector((s: RootState) => s.appState.outletInfo?.id ?? "");
  const isTenantAdmin = useSelector(
    (s: RootState) => s.auth.postgresAccess?.tenant.isTenantAdmin ?? false,
  );
  const navigate = useNavigate();

  const [state, setState] = useState<State>({ phase: "idle" });
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  const load = useCallback(
    async (controller?: AbortController) => {
      if (!outletId) return;
      setState({ phase: "loading" });
      try {
        const { wallet } = await billingApi.getWallet(outletId, controller?.signal);
        setState({ phase: "wallet", wallet });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ phase: "no_wallet" });
          return;
        }
        setState({
          phase: "error",
          message: err instanceof ApiError ? err.message : "Failed to load wallet",
        });
      }
    },
    [outletId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller);
    return () => controller.abort();
  }, [load]);

  const handleProvision = async () => {
    if (!outletId) return;
    setProvisioning(true);
    setProvisionError(null);
    try {
      const { wallet } = await billingApi.provisionWallet(outletId);
      setState({ phase: "wallet", wallet });
    } catch (err) {
      setProvisionError(err instanceof ApiError ? err.message : "Provisioning failed");
    } finally {
      setProvisioning(false);
    }
  };

  if (!outletId) {
    return (
      <div style={styles.container}>
        <p style={styles.hint}>Select an outlet to view its wallet.</p>
      </div>
    );
  }

  if (state.phase === "loading" || state.phase === "idle") {
    return (
      <div style={styles.container}>
        <p style={styles.hint}>Loading wallet…</p>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div style={styles.container}>
        <p style={styles.error}>{state.message}</p>
        <button style={styles.btnPrimary} onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  if (state.phase === "no_wallet") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.heading}>Prepaid Credit Wallet</h2>
          <p style={styles.hint}>
            No wallet has been provisioned for this outlet yet.
          </p>
          {isTenantAdmin ? (
            <>
              <button
                style={styles.btnPrimary}
                onClick={() => void handleProvision()}
                disabled={provisioning}
              >
                {provisioning ? "Provisioning…" : "Provision Wallet"}
              </button>
              {provisionError && (
                <p style={{ ...styles.error, marginTop: 8 }}>{provisionError}</p>
              )}
            </>
          ) : (
            <p style={styles.hint}>Contact your account administrator to enable billing.</p>
          )}
        </div>
      </div>
    );
  }

  const { wallet } = state;
  const available = Number(wallet.availableCredits);
  const balance = Number(wallet.balanceCredits);
  const reserved = Number(wallet.reservedCredits);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.heading}>Prepaid Credit Wallet</h2>
        <button
          style={styles.btnPrimary}
          onClick={() => navigate(ROUTES_PATHS.BILLING_TOPUP)}
        >
          Top Up
        </button>
      </div>

      {wallet.isLowBalance && (
        <div style={styles.lowBalanceBanner}>
          ⚠️ Low balance — consider topping up soon.
        </div>
      )}

      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Available Credits</span>
          <span style={{ ...styles.statValue, color: "#2d7a2d" }}>
            {available.toLocaleString()}
          </span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Balance Credits</span>
          <span style={styles.statValue}>{balance.toLocaleString()}</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Reserved Credits</span>
          <span style={{ ...styles.statValue, color: "#8a6000" }}>
            {reserved.toLocaleString()}
          </span>
        </div>
      </div>

      <div style={styles.autoCreditCard}>
        <div style={styles.autoCreditHeader}>
          <span style={styles.autoCreditTitle}>🛡️ Pre-Approved Auto Credit Line</span>
          <span style={styles.autoCreditPill}>Approved & Active</span>
        </div>
        <p style={styles.autoCreditDesc}>
          Amount Approved: <strong>{wallet.currency === "USD" ? "$60" : "₹5,000"}</strong> (
          {wallet.currency === "USD" ? "48,000 Emergency Credits" : "50,000 Emergency Credits"}).
          This safety buffer ensures zero campaign, ad targeting, or WhatsApp PBX interruption if balance runs low.
        </p>
      </div>

      <div style={styles.ratesCard}>
        <div style={styles.ratesCardHeader}>
          <span style={styles.ratesCardTitle}>Conversion Rate Transparency</span>
          <div style={styles.ratesPills}>
            <span style={styles.ratePill}>₹1 = 10 Credits</span>
            <span style={styles.ratePill}>$1 = 800 Credits</span>
          </div>
        </div>
        <div style={styles.ratesGrid}>
          <div style={styles.rateItem}>
            <span>☁️</span>
            <div>
              <strong>Cloud Compute & Storage</strong>
              <small style={styles.rateSmall}>1 Cr / GB-day</small>
            </div>
          </div>
          <div style={styles.rateItem}>
            <span>📢</span>
            <div>
              <strong>Setting Ads (Meta / Google)</strong>
              <small style={styles.rateSmall}>25 Cr / campaign</small>
            </div>
          </div>
          <div style={styles.rateItem}>
            <span>💬</span>
            <div>
              <strong>WhatsApp & PBX Outreach</strong>
              <small style={styles.rateSmall}>8 Cr / msg · 15 Cr / call min</small>
            </div>
          </div>
          <div style={styles.rateItem}>
            <span>🧠</span>
            <div>
              <strong>Gemini AI Intelligence</strong>
              <small style={styles.rateSmall}>15 Cr / query min</small>
            </div>
          </div>
        </div>
      </div>

      <div style={styles.actions}>
        <Link to={ROUTES_PATHS.BILLING_TRANSACTIONS} style={styles.linkBtn}>
          View Transaction History →
        </Link>
      </div>

      <p style={styles.meta}>
        Currency: {wallet.currency} · Last updated:{" "}
        {new Date(wallet.updatedAt).toLocaleString()}
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: "24px", maxWidth: 700, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  heading: { fontSize: 22, fontWeight: 600, margin: 0, color: "#1a1a2e" },
  card: { background: "#fff", borderRadius: 12, padding: 32, boxShadow: "0 1px 6px rgba(0,0,0,.08)" },
  statsRow: { display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" },
  statCard: {
    flex: "1 1 180px",
    background: "#fff",
    borderRadius: 12,
    padding: "20px 24px",
    boxShadow: "0 1px 6px rgba(0,0,0,.08)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  statLabel: { fontSize: 13, color: "#666", textTransform: "uppercase", letterSpacing: "0.04em" },
  statValue: { fontSize: 28, fontWeight: 700, color: "#1a1a2e" },
  btnPrimary: {
    background: "#4f46e5",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  linkBtn: {
    color: "#4f46e5",
    fontSize: 14,
    fontWeight: 500,
    textDecoration: "none",
  },
  actions: { marginBottom: 16 },
  hint: { color: "#666", fontSize: 14 },
  error: { color: "#c0392b", fontSize: 14 },
  meta: { fontSize: 12, color: "#999", marginTop: 8 },
  lowBalanceBanner: {
    background: "#fff8e1",
    border: "1px solid #ffe082",
    borderRadius: 8,
    padding: "10px 16px",
    marginBottom: 16,
    fontSize: 14,
    color: "#7a5800",
  },
  autoCreditCard: {
    background: "#f0f9ff",
    border: "1px solid #bae6fd",
    borderRadius: 12,
    padding: "16px 20px",
    marginBottom: 20,
  },
  autoCreditHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  autoCreditTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0369a1",
  },
  autoCreditPill: {
    fontSize: 11,
    fontWeight: 700,
    background: "#0284c7",
    color: "#fff",
    padding: "2px 8px",
    borderRadius: 999,
  },
  autoCreditDesc: {
    fontSize: 13,
    color: "#075985",
    margin: 0,
    lineHeight: 1.5,
  },
  ratesCard: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "16px 20px",
    marginBottom: 20,
    boxShadow: "0 1px 6px rgba(0,0,0,.04)",
  },
  ratesCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  ratesCardTitle: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#475569",
  },
  ratesPills: {
    display: "flex",
    gap: 8,
  },
  ratePill: {
    fontSize: 11,
    fontWeight: 700,
    background: "#f1f5f9",
    color: "#0f172a",
    padding: "3px 8px",
    borderRadius: 6,
    border: "1px solid #cbd5e1",
  },
  ratesGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 10,
  },
  rateItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#f8fafc",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #f1f5f9",
  },
  rateSmall: {
    display: "block",
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
};
