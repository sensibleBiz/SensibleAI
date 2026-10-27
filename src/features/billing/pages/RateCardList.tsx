import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { ROUTES_PATHS } from "@/shared/lib/constants";
import { ApiError } from "@/shared/api/apiClient";
import { billingApi } from "../api/billingApi";
import type { RateCardRecord } from "../types/billing.types";
import { ALL_SERVICE_TYPE_VALUES } from "../types/billing.types";

const PAGE_SIZE = 50;

function StatusBadge({ isActive, effectiveUntil }: { isActive: boolean; effectiveUntil: string | null }) {
  const now = new Date();
  const expired = effectiveUntil ? new Date(effectiveUntil) <= now : false;
  if (!isActive || expired) {
    return <span style={{ ...styles.badge, background: "#fee2e2", color: "#991b1b" }}>Inactive</span>;
  }
  if (effectiveUntil) {
    const daysLeft = Math.ceil((new Date(effectiveUntil).getTime() - now.getTime()) / 86400000);
    return (
      <span style={{ ...styles.badge, background: "#fef3c7", color: "#92400e" }}>
        Expires in {daysLeft}d
      </span>
    );
  }
  return <span style={{ ...styles.badge, background: "#d1fae5", color: "#065f46" }}>Active</span>;
}

function scopeLabel(rc: RateCardRecord): string {
  if (!rc.countryCode && !rc.provider) return "Global";
  if (rc.countryCode && !rc.provider) return rc.countryCode;
  if (!rc.countryCode && rc.provider) return rc.provider;
  return `${rc.countryCode} / ${rc.provider}`;
}

export default function RateCardList() {
  const navigate = useNavigate();
  const isTenantAdmin = useSelector(
    (s: RootState) => s.auth.postgresAccess?.tenant.isTenantAdmin ?? false,
  );

  const [rows, setRows] = useState<RateCardRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [serviceTypeFilter, setServiceTypeFilter] = useState("");
  const [activeOnlyFilter, setActiveOnlyFilter] = useState(false);

  // Deactivate state
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const load = useCallback(
    async (nextOffset: number, reset: boolean, controller?: AbortController) => {
      setLoading(true);
      setError(null);
      try {
        const result = await billingApi.listRateCards(
          {
            serviceType: serviceTypeFilter || undefined,
            activeOnly: activeOnlyFilter || undefined,
            limit: PAGE_SIZE,
            offset: nextOffset,
          },
          controller?.signal,
        );
        setRows((prev) => (reset ? result.rows : [...prev, ...result.rows]));
        setTotal(result.total);
        setOffset(nextOffset + result.rows.length);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof ApiError ? err.message : "Failed to load rate cards");
      } finally {
        setLoading(false);
      }
    },
    [serviceTypeFilter, activeOnlyFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    setRows([]);
    setOffset(0);
    void load(0, true, controller);
    return () => controller.abort();
  }, [load]);

  const handleDeactivate = async (id: string) => {
    if (!confirm("Deactivate this rate card? Future usage billing for this service may fail if no other active rate exists.")) return;
    setDeactivating(id);
    setDeactivateError(null);
    try {
      const result = await billingApi.deactivateRateCard(id);
      if (result.coverageGap) {
        alert(`⚠️ Rate card deactivated. WARNING: No active rate card remains for service type "${result.rateCard.serviceType}". Future billing for this service will fail with RATE_NOT_FOUND until a new rate is created.`);
      }
      setRows((prev) => prev.map((r) => (r.id === id ? result.rateCard : r)));
    } catch (err) {
      setDeactivateError(err instanceof ApiError ? err.message : "Deactivation failed");
    } finally {
      setDeactivating(null);
    }
  };

  if (!isTenantAdmin) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.heading}>Rate Cards</h2>
          <p style={{ color: "#c0392b" }}>You do not have permission to access rate card management.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <Link to={ROUTES_PATHS.BILLING_WALLET} style={styles.backLink}>← Wallet</Link>
          <h2 style={styles.heading}>Rate Cards</h2>
          <p style={styles.subtitle}>
            Platform-wide pricing rules. Showing {rows.length} of {total}.
          </p>
        </div>
        <Link to={ROUTES_PATHS.BILLING_RATE_CARD_NEW} style={styles.btnPrimary}>
          + New Rate Card
        </Link>
      </div>

      <div style={styles.filters}>
        <select
          style={styles.select}
          value={serviceTypeFilter}
          onChange={(e) => setServiceTypeFilter(e.target.value)}
        >
          <option value="">All service types</option>
          {ALL_SERVICE_TYPE_VALUES.map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={activeOnlyFilter}
            onChange={(e) => setActiveOnlyFilter(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Active only
        </label>
      </div>

      {error && <p style={styles.error}>{error}</p>}
      {deactivateError && <p style={styles.error}>{deactivateError}</p>}

      {rows.length === 0 && !loading && !error && (
        <p style={styles.hint}>No rate cards found.</p>
      )}

      {rows.length > 0 && (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                {["Service Type", "Scope", "Unit", "Credits / Unit", "Status", "Effective From", "Effective Until", "Actions"].map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((rc) => (
                <tr key={rc.id} style={styles.tr}>
                  <td style={styles.td}>
                    <code style={styles.code}>{rc.serviceType}</code>
                  </td>
                  <td style={styles.td}>{scopeLabel(rc)}</td>
                  <td style={styles.td}>{rc.unitLabel}</td>
                  <td style={{ ...styles.td, textAlign: "right", fontWeight: 600 }}>
                    {Number(rc.creditsPerUnit).toFixed(4)}
                  </td>
                  <td style={styles.td}>
                    <StatusBadge isActive={rc.isActive} effectiveUntil={rc.effectiveUntil} />
                  </td>
                  <td style={styles.td}>{new Date(rc.effectiveFrom).toLocaleDateString()}</td>
                  <td style={styles.td}>
                    {rc.effectiveUntil ? new Date(rc.effectiveUntil).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ ...styles.td, whiteSpace: "nowrap" }}>
                    <button
                      style={styles.btnLink}
                      onClick={() => navigate(`${ROUTES_PATHS.BILLING_RATE_CARDS}/${rc.id}/edit`)}
                    >
                      Edit
                    </button>
                    {rc.isActive && (
                      <button
                        style={{ ...styles.btnLink, color: "#c0392b", marginLeft: 8 }}
                        onClick={() => void handleDeactivate(rc.id)}
                        disabled={deactivating === rc.id}
                      >
                        {deactivating === rc.id ? "…" : "Deactivate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading && <p style={styles.hint}>Loading…</p>}

      {!loading && offset < total && (
        <button style={styles.loadMoreBtn} onClick={() => void load(offset, false)}>
          Load more ({total - offset} remaining)
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 24, maxWidth: 1100, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 },
  heading: { fontSize: 22, fontWeight: 600, margin: "4px 0 4px", color: "#1a1a2e" },
  subtitle: { fontSize: 13, color: "#666", margin: 0 },
  backLink: { fontSize: 13, color: "#4f46e5", textDecoration: "none", display: "block", marginBottom: 4 },
  btnPrimary: {
    background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8,
    padding: "10px 18px", fontSize: 14, fontWeight: 600, textDecoration: "none",
  },
  filters: { display: "flex", gap: 16, alignItems: "center", marginBottom: 16, flexWrap: "wrap" },
  select: { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 },
  checkboxLabel: { fontSize: 14, color: "#333", display: "flex", alignItems: "center" },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    padding: "8px 12px", textAlign: "left", borderBottom: "2px solid #e5e7eb",
    fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", color: "#666",
    whiteSpace: "nowrap",
  },
  tr: { borderBottom: "1px solid #f3f4f6" },
  td: { padding: "10px 12px", color: "#1a1a2e", verticalAlign: "middle" },
  badge: { display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 },
  code: { fontFamily: "monospace", background: "#f3f4f6", padding: "1px 4px", borderRadius: 3, fontSize: 12 },
  btnLink: { background: "none", border: "none", color: "#4f46e5", cursor: "pointer", fontSize: 13, padding: 0 },
  hint: { color: "#666", fontSize: 14 },
  error: { color: "#c0392b", fontSize: 14, marginBottom: 12 },
  loadMoreBtn: {
    marginTop: 16, background: "#f3f4f6", border: "none", borderRadius: 8,
    padding: "10px 20px", fontSize: 14, cursor: "pointer", color: "#1a1a2e",
  },
  card: { background: "#fff", borderRadius: 12, padding: 32, boxShadow: "0 1px 6px rgba(0,0,0,.08)" },
};
