import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import {
  SearchOutlined,
  LoadingOutlined,
  CloseCircleFilled,
  UserOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { notification, Spin, Tag, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { leadApi, type SemanticSearchResult } from "../api/leadApi";
import { ROUTES_PATHS } from "@/shared/lib/constants";
import { useOutletFeatureAccess } from "@/features/outlets";
import { OUTLET_FEATURE_KEYS, SIDEBAR_MENU_OPTIONS, type SidebarMenuOption } from "@/shared/lib/sidebarMenuConfig";
import type { RootState } from "@/app/store";

// Flatten sidebar menu into navigable pages (skip sections & comingSoon)
const flattenMenuPages = (items: readonly SidebarMenuOption[]): Array<{ label: string; path: string; section: string }> => {
  const pages: Array<{ label: string; path: string; section: string }> = [];
  for (const item of items) {
    if (item.children) {
      const sectionLabel = item.label;
      for (const child of item.children) {
        if (!child.comingSoon && child.menuKey.startsWith("/")) {
          pages.push({ label: child.label, path: child.menuKey, section: sectionLabel });
        }
      }
    } else if (!item.comingSoon && item.menuKey.startsWith("/")) {
      pages.push({ label: item.label, path: item.menuKey, section: "" });
    }
  }
  return pages;
};

const ALL_PAGES = flattenMenuPages(SIDEBAR_MENU_OPTIONS);

interface Props {
  outletId: string;
}

const STAGE_COLORS: Record<string, string> = {
  NEW: "blue",
  ASSIGNED: "geekblue",
  FOLLOWUP: "orange",
  RINGING: "gold",
  WON: "green",
  LOST: "red",
  DISQUALIFIED: "default",
};

type LeadResult = SemanticSearchResult & { _kind: "lead" };
type TeamResult = { _kind: "team"; id: string; name: string; role: string; code: string };
type PageResult = { _kind: "page"; label: string; path: string; section: string };

const GlobalSearchBar: React.FC<Props> = ({ outletId }) => {
  const navigate = useNavigate();
  const teamData = useSelector((s: RootState) => s.appState.teamTreeData ?? []);
  const { hasOutletFeature } = useOutletFeatureAccess();

  const [query, setQuery] = useState("");
  const [leadResults, setLeadResults] = useState<LeadResult[]>([]);
  const [teamResults, setTeamResults] = useState<TeamResult[]>([]);
  const [pageResults, setPageResults] = useState<PageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalResults = leadResults.length + teamResults.length + pageResults.length;

  const searchPages = useCallback((q: string): PageResult[] => {
    const lower = q.toLowerCase();
    return ALL_PAGES
      .filter((p) => p.label.toLowerCase().includes(lower) || p.section.toLowerCase().includes(lower))
      .slice(0, 4)
      .map((p) => ({ ...p, _kind: "page" as const }));
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchTeam = useCallback(
    (q: string): TeamResult[] => {
      const lower = q.toLowerCase();
      return teamData
        .filter(
          (m) =>
            m.userName?.toLowerCase().includes(lower) ||
            m.designation?.toLowerCase().includes(lower) ||
            m.roleInZone?.toLowerCase().includes(lower) ||
            m.code?.toLowerCase().includes(lower),
        )
        .slice(0, 4)
        .map((m) => ({
          _kind: "team" as const,
          id: m.id,
          name: m.userName,
          role: m.designation || m.roleInZone || "",
          code: m.code || "",
        }));
    },
    [teamData],
  );

  const search = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setLeadResults([]);
        setTeamResults([]);
        setPageResults([]);
        setOpen(false);
        return;
      }

      // Instant client-side searches
      const team = searchTeam(trimmed);
      const pages = searchPages(trimmed);
      setTeamResults(team);
      setPageResults(pages);
      if (team.length > 0 || pages.length > 0) setOpen(true);

      // Lead semantic search
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setLoading(true);
      setError(null);
      try {
        const data = await leadApi.semanticSearch(outletId, trimmed, 6, abortRef.current.signal);
        setLeadResults(data.map((r) => ({ ...r, _kind: "lead" as const })));
        setOpen(true);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Search failed: ${msg}`);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    },
    [outletId, searchTeam, searchPages],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setLeadResults([]);
      setTeamResults([]);
      setPageResults([]);
      setOpen(false);
      setError(null);
      return;
    }
    // Instant client-side
    setTeamResults(searchTeam(val.trim()));
    setPageResults(searchPages(val.trim()));
    // Leads debounced
    debounceRef.current = setTimeout(() => void search(val), 400);
  };

  const handleClear = () => {
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery("");
    setLeadResults([]);
    setTeamResults([]);
    setPageResults([]);
    setOpen(false);
    setError(null);
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void search(query);
    }
    if (e.key === "Escape") setOpen(false);
  };

  const handleSelectPage = (path: string) => {
    setOpen(false);
    setQuery("");
    navigate(path);
  };

  const handleSelectLead = (id: string) => {
    setOpen(false);
    setQuery("");
    navigate(`${ROUTES_PATHS.LEADS_MANAGEMENT}?lead=${encodeURIComponent(id)}`);
  };

  const handleSelectTeam = () => {
    setOpen(false);
    setQuery("");
    if (hasOutletFeature(OUTLET_FEATURE_KEYS.TEAM_TREE)) {
      navigate(ROUTES_PATHS.TEAM_TREE_PAGE);
    } else {
      notification.warning({
        message: "Team Members module not enabled",
        description: "The Users & Teams module is not enabled for this outlet. Ask an administrator to enable it under Outlet Feature Access.",
        duration: 5,
      });
    }
  };

  const hasResults = totalResults > 0 || error;

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      {/* Input */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--search-bg, rgba(0,0,0,0.04))",
          border: `1.5px solid ${focused ? "#1677ff" : "var(--search-border, rgba(0,0,0,0.15))"}`,
          borderRadius: 10,
          padding: "0 12px",
          height: 38,
          width: "100%",
          transition: "border-color 0.2s, box-shadow 0.2s",
          boxShadow: focused ? "0 0 0 3px rgba(22,119,255,0.12)" : "none",
        }}
      >
        {loading
          ? <Spin size="small" indicator={<LoadingOutlined style={{ fontSize: 14, color: "#1677ff" }} spin />} />
          : <SearchOutlined style={{ fontSize: 14, color: focused ? "#1677ff" : "#999", flexShrink: 0, transition: "color 0.2s" }} />
        }
        <input
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setFocused(true);
            if (hasResults) setOpen(true);
          }}
          onBlur={() => setFocused(false)}
          placeholder="Search leads, team, pages…"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 13.5,
            color: "inherit",
            minWidth: 0,
          }}
        />
        {query && (
          <CloseCircleFilled
            onClick={handleClear}
            style={{ fontSize: 14, color: "#bbb", cursor: "pointer", flexShrink: 0 }}
          />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: "max(100%, 400px)",
            background: "var(--search-dropdown-bg, #fff)",
            border: "1px solid var(--search-border, rgba(0,0,0,0.12))",
            borderRadius: 10,
            boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
            zIndex: 1000,
            overflow: "hidden",
            maxHeight: 480,
            overflowY: "auto",
          }}
        >
          {error && !leadResults.length && !teamResults.length ? (
            <div style={{ padding: "10px 14px" }}>
              <Typography.Text type="danger" style={{ fontSize: 13 }}>{error}</Typography.Text>
            </div>
          ) : !leadResults.length && !teamResults.length ? (
            <div style={{ padding: "12px 16px" }}>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                No results for &ldquo;{query}&rdquo;
              </Typography.Text>
            </div>
          ) : (
            <div>
              {/* ── Team Members ── */}
              {teamResults.length > 0 && (
                <div>
                  <div style={{
                    padding: "8px 14px 4px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#888",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    borderBottom: "1px solid rgba(0,0,0,0.05)",
                  }}>
                    Team Members
                  </div>
                  {teamResults.map((item) => (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={handleSelectTeam}
                      onKeyDown={(e) => e.key === "Enter" && handleSelectTeam()}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 14px",
                        cursor: "pointer",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.04)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "#e6f4ff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        <UserOutlined style={{ fontSize: 14, color: "#1677ff" }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>
                          {[item.role, item.code].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <ApartmentOutlined style={{ fontSize: 12, color: "#ccc" }} />
                    </div>
                  ))}
                </div>
              )}

              {/* ── Pages ── */}
              {pageResults.length > 0 && (
                <div>
                  <div style={{
                    padding: "8px 14px 4px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#888",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    borderBottom: "1px solid rgba(0,0,0,0.05)",
                    borderTop: teamResults.length > 0 ? "1px solid rgba(0,0,0,0.06)" : undefined,
                  }}>
                    Pages
                  </div>
                  {pageResults.map((item) => (
                    <div
                      key={item.path}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectPage(item.path)}
                      onKeyDown={(e) => e.key === "Enter" && handleSelectPage(item.path)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 14px",
                        cursor: "pointer",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.04)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "#f0f5ff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        <AppstoreOutlined style={{ fontSize: 14, color: "#4b6ef5" }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.label}
                        </div>
                        {item.section && (
                          <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>{item.section}</div>
                        )}
                      </div>
                      <RightOutlined style={{ fontSize: 10, color: "#ccc", flexShrink: 0 }} />
                    </div>
                  ))}
                </div>
              )}

              {/* ── Leads ── */}
              {leadResults.length > 0 && (
                <div>
                  <div style={{
                    padding: "8px 14px 4px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#888",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    borderBottom: "1px solid rgba(0,0,0,0.05)",
                    borderTop: (teamResults.length > 0 || pageResults.length > 0) ? "1px solid rgba(0,0,0,0.06)" : undefined,
                  }}>
                    Leads
                  </div>
                  {leadResults.map((item) => (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectLead(item.id)}
                      onKeyDown={(e) => e.key === "Enter" && handleSelectLead(item.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 14px",
                        cursor: "pointer",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.04)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "#f6ffed",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#52c41a",
                      }}>
                        {(item.businessName || "?")[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.businessName || "Unknown"}
                        </div>
                        <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>
                          {[item.city, item.assignedTo].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <Tag color={STAGE_COLORS[item.stage] ?? "default"} style={{ fontSize: 11, margin: 0 }}>
                          {item.stage}
                        </Tag>
                        <span style={{ fontSize: 11, color: "#aaa", minWidth: 28, textAlign: "right" }}>
                          {Math.round(item.similarity * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalSearchBar;
