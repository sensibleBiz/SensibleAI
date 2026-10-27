import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { ROUTES_PATHS } from "@/shared/lib/constants";
import { ApiError } from "@/shared/api/apiClient";
import { billingApi } from "../api/billingApi";
import type { WalletTransactionRecord } from "../types/billing.types";

const PAGE_SIZE = 50;

const TXN_LABELS: Record<WalletTransactionRecord["txnType"], string> = {
  CREDIT: "Credit",
  DEBIT: "Debit",
  RESERVE: "Reserve",
  RELEASE: "Release",
  REVERSAL: "Reversal",
};

const TXN_COLORS: Record<WalletTransactionRecord["txnType"], string> = {
  CREDIT: "#2d7a2d",
  DEBIT: "#c0392b",
  RESERVE: "#8a6000",
  RELEASE: "#2980b9",
  REVERSAL: "#7d3c98",
};

function formatCredits(credits: string, txnType: WalletTransactionRecord["txnType"]) {
  const n = Number(credits);
  const sign = txnType === "DEBIT" || txnType === "RESERVE" ? "−" : "+";
  return `${sign}${Math.abs(n).toLocaleString()} cr`;
}

export default function TransactionHistory() {
  const outletId = useSelector((s: RootState) => s.appState.outletInfo?.id ?? "");
  const [transactions, setTransactions] = useState<WalletTransactionRecord[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextOffset: number, controller?: AbortController) => {
      if (!outletId) return;
      setLoading(true);
      setError(null);
      try {
        const result = await billingApi.getTransactions(
          outletId,
          PAGE_SIZE,
          nextOffset,
          controller?.signal,
        );
        setTransactions((prev) =>
          nextOffset === 0 ? result.transactions : [...prev, ...result.transactions],
        );
        setHasMore(result.transactions.length === PAGE_SIZE);
        setOffset(nextOffset + result.transactions.length);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof ApiError ? err.message : "Failed to load transactions");
      } finally {
        setLoading(false);
      }
    },
    [outletId],
  );

  useEffect(() => {
    const controller = new AbortController();
    setTransactions([]);
    setOffset(0);
    void load(0, controller);
    return () => controller.abort();
  }, [load]);

  if (!outletId) {
    return (
      <div style={styles.container}>
        <p style={styles.hint}>Select an outlet to view transaction history.</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <Link to={ROUTES_PATHS.BILLING_WALLET} style={styles.backLink}>
            ← Wallet
          </Link>
          <h2 style={styles.heading}>Transaction History</h2>
        </div>
        <Link to={ROUTES_PATHS.BILLING_TOPUP} style={styles.btnPrimary}>
          Top Up
        </Link>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {transactions.length === 0 && !loading && !error && (
        <p style={styles.hint}>No transactions yet.</p>
      )}

      {transactions.length > 0 && (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Description</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Credits</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Balance After</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((txn) => (
                <tr key={txn.id} style={styles.tr}>
                  <td style={styles.td}>
                    {new Date(txn.createdAt).toLocaleString()}
                  </td>
                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.badge,
                        color: TXN_COLORS[txn.txnType],
                        background: TXN_COLORS[txn.txnType] + "18",
                      }}
                    >
                      {TXN_LABELS[txn.txnType]}
                    </span>
                  </td>
                  <td style={styles.td}>{txn.description ?? "—"}</td>
                  <td
                    style={{
                      ...styles.td,
                      textAlign: "right",
                      color: TXN_COLORS[txn.txnType],
                      fontWeight: 600,
                    }}
                  >
                    {formatCredits(txn.credits, txn.txnType)}
                  </td>
                  <td style={{ ...styles.td, textAlign: "right" }}>
                    {Number(txn.balanceAfter).toLocaleString()} cr
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading && <p style={styles.hint}>Loading…</p>}

      {hasMore && !loading && (
        <button style={styles.loadMoreBtn} onClick={() => void load(offset)}>
          Load more
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: "24px", maxWidth: 900, margin: "0 auto" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 20,
  },
  heading: { fontSize: 22, fontWeight: 600, margin: "4px 0 0", color: "#1a1a2e" },
  backLink: { fontSize: 13, color: "#4f46e5", textDecoration: "none" },
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
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: {
    padding: "10px 12px",
    textAlign: "left",
    borderBottom: "2px solid #e5e7eb",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#666",
    whiteSpace: "nowrap",
  },
  tr: { borderBottom: "1px solid #f3f4f6" },
  td: { padding: "12px", color: "#1a1a2e", verticalAlign: "middle" },
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
  },
  hint: { color: "#666", fontSize: 14 },
  error: { color: "#c0392b", fontSize: 14, marginBottom: 12 },
  loadMoreBtn: {
    marginTop: 16,
    background: "#f3f4f6",
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 14,
    cursor: "pointer",
    color: "#1a1a2e",
  },
};
