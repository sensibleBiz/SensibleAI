import { useState } from "react";
import {
  Phone,
  MessageSquare,
  Calendar,
  FileText,
  Clock,
  AlertTriangle,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Award,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ROUTES_PATHS } from "@/shared/lib/constants";
import { DashboardConfig } from "../types/dashboardConfig";

interface SalesOpsDashboardProps {
  config: DashboardConfig;
  onOpenDeepDive: (metric: string) => void;
}

interface RepPerformance {
  id: string;
  name: string;
  avatar: string;
  role: string;
  quotaTarget: string;
  attainmentPct: number;
  revenueClosed: string;
  pipelineOwned: string;
  callsToday: number;
  avgResponseMins: number;
  winRate: number;
  status: "surpassing" | "on_track" | "behind";
}

const SAMPLE_REPS: RepPerformance[] = [
  {
    id: "rep-1",
    name: "Vikram Rathore",
    avatar: "VR",
    role: "Enterprise Lead Executive",
    quotaTarget: "₹ 50.0 L",
    attainmentPct: 114,
    revenueClosed: "₹ 57.0 L",
    pipelineOwned: "₹ 3.8 Cr",
    callsToday: 28,
    avgResponseMins: 4.2,
    winRate: 29.4,
    status: "surpassing",
  },
  {
    id: "rep-2",
    name: "Sneha Patil",
    avatar: "SP",
    role: "Senior Account Manager",
    quotaTarget: "₹ 40.0 L",
    attainmentPct: 92,
    revenueClosed: "₹ 36.8 L",
    pipelineOwned: "₹ 2.9 Cr",
    callsToday: 34,
    avgResponseMins: 6.5,
    winRate: 22.8,
    status: "on_track",
  },
  {
    id: "rep-3",
    name: "Aditi Rao",
    avatar: "AR",
    role: "Mid-Market Specialist",
    quotaTarget: "₹ 35.0 L",
    attainmentPct: 88,
    revenueClosed: "₹ 30.8 L",
    pipelineOwned: "₹ 2.4 Cr",
    callsToday: 22,
    avgResponseMins: 7.8,
    winRate: 19.5,
    status: "on_track",
  },
  {
    id: "rep-4",
    name: "Rahul Deshmukh",
    avatar: "RD",
    role: "SMB Sales Associate",
    quotaTarget: "₹ 30.0 L",
    attainmentPct: 68,
    revenueClosed: "₹ 20.4 L",
    pipelineOwned: "₹ 1.8 Cr",
    callsToday: 41,
    avgResponseMins: 11.2,
    winRate: 14.2,
    status: "behind",
  },
  {
    id: "rep-5",
    name: "Kavita Nair",
    avatar: "KN",
    role: "Inbound Outreach Specialist",
    quotaTarget: "₹ 25.0 L",
    attainmentPct: 104,
    revenueClosed: "₹ 26.0 L",
    pipelineOwned: "₹ 1.5 Cr",
    callsToday: 48,
    avgResponseMins: 3.1,
    winRate: 24.0,
    status: "surpassing",
  },
];

const STALLED_DEALS = [
  {
    id: "STL-1",
    company: "Metro Infrastructure Pvt Ltd",
    value: "₹ 32.0 L",
    stage: "Proposal Sent",
    rep: "Rahul Deshmukh",
    idleDays: 12,
    reason: "No response to quotation email",
    aiSuggestion: "Trigger executive WhatsApp check-in with limited-time concession.",
  },
  {
    id: "STL-2",
    company: "Delta Logistics Systems",
    value: "₹ 24.5 L",
    stage: "Negotiation",
    rep: "Sneha Patil",
    idleDays: 9,
    reason: "Awaiting legal department approval",
    aiSuggestion: "Offer simplified standard terms addendum.",
  },
  {
    id: "STL-3",
    company: "Zenith Retail Outlets",
    value: "₹ 18.0 L",
    stage: "Qualified",
    rep: "Aditi Rao",
    idleDays: 8,
    reason: "Decision maker was on business travel",
    aiSuggestion: "Schedule recap demo for tomorrow morning.",
  },
];

export default function SalesOpsDashboard({
  config,
  onOpenDeepDive,
}: SalesOpsDashboardProps) {
  const navigate = useNavigate();
  const [repFilter, setRepFilter] = useState<string>("all");

  const filteredReps = SAMPLE_REPS.filter((r) => {
    if (repFilter === "all") return true;
    return r.status === repFilter;
  });

  return (
    <div className={`sales-ops-dashboard-root density-${config.density}`}>
      {/* ── Top Activity Telemetry Bar ── */}
      <section className="ops-telemetry-strip">
        <div className="ops-kpi-card" onClick={() => onOpenDeepDive("activity_calls")}>
          <div className="ops-kpi-icon blue"><Phone size={16} /></div>
          <div className="ops-kpi-data">
            <span className="ops-kpi-label">Calls Logged Today</span>
            <div className="ops-kpi-num">173 <span className="delta-pill pos">+22%</span></div>
            <span className="ops-kpi-sub">Target: 150 calls / day</span>
          </div>
        </div>

        <div className="ops-kpi-card" onClick={() => onOpenDeepDive("activity_whatsapp")}>
          <div className="ops-kpi-icon green"><MessageSquare size={16} /></div>
          <div className="ops-kpi-data">
            <span className="ops-kpi-label">WhatsApp Sequences Sent</span>
            <div className="ops-kpi-num">412 <span className="delta-pill pos">+35%</span></div>
            <span className="ops-kpi-sub">94% delivery, 68% read rate</span>
          </div>
        </div>

        <div className="ops-kpi-card" onClick={() => onOpenDeepDive("activity_meetings")}>
          <div className="ops-kpi-icon purple"><Calendar size={16} /></div>
          <div className="ops-kpi-data">
            <span className="ops-kpi-label">Demos & Meetings Held</span>
            <div className="ops-kpi-num">29 <span className="delta-pill pos">+16%</span></div>
            <span className="ops-kpi-sub">87% show-up rate</span>
          </div>
        </div>

        <div className="ops-kpi-card" onClick={() => onOpenDeepDive("activity_quotations")}>
          <div className="ops-kpi-icon amber"><FileText size={16} /></div>
          <div className="ops-kpi-data">
            <span className="ops-kpi-label">Quotations Generated</span>
            <div className="ops-kpi-num">18 <span className="delta-pill pos">+12%</span></div>
            <span className="ops-kpi-sub">Total quote value: ₹ 1.4 Cr</span>
          </div>
        </div>

        <div className="ops-kpi-card" onClick={() => onOpenDeepDive("activity_sla")}>
          <div className="ops-kpi-icon emerald"><Clock size={16} /></div>
          <div className="ops-kpi-data">
            <span className="ops-kpi-label">Avg Inbound Response SLA</span>
            <div className="ops-kpi-num">4.8 min <span className="delta-pill pos">-1.4m</span></div>
            <span className="ops-kpi-sub">Target &lt; 10 min SLA</span>
          </div>
        </div>
      </section>

      {/* ── Main Two-Column Operations Layout ── */}
      <div className="ops-main-columns">
        {/* Left Column: Rep Performance & Quota Attainment */}
        <div className="ops-left-column">
          <div className="terminal-card ops-leaderboard-card">
            <div className="card-top-bar">
              <div className="card-title-group">
                <span className="card-icon"><Award size={16} /></span>
                <h3 className="column-card-title">Sales Rep Quota Attainment & Leaderboard</h3>
              </div>
              <div className="ops-filter-pills">
                {["all", "surpassing", "on_track", "behind"].map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`ops-pill-filter ${repFilter === f ? "active" : ""}`}
                    onClick={() => setRepFilter(f)}
                  >
                    {f === "all" ? "All Reps" : f.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            <div className="reps-table-wrapper">
              <table className="reps-table">
                <thead>
                  <tr>
                    <th>Sales Executive</th>
                    <th>Quota Target</th>
                    <th>Closed (YTD)</th>
                    <th>Pacing</th>
                    <th>Pipeline</th>
                    <th>Win Rate</th>
                    <th>SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReps.map((rep, idx) => (
                    <tr key={rep.id}>
                      <td>
                        <div className="rep-profile-cell">
                          <span className={`rep-rank rank-${idx + 1}`}>{idx + 1}</span>
                          <span className="rep-avatar">{rep.avatar}</span>
                          <div className="rep-details">
                            <strong className="rep-name">{rep.name}</strong>
                            <span className="rep-role">{rep.role}</span>
                          </div>
                        </div>
                      </td>
                      <td>{rep.quotaTarget}</td>
                      <td>
                        <strong className="rep-rev">{rep.revenueClosed}</strong>
                      </td>
                      <td>
                        <div className="attainment-bar-wrap">
                          <div className="bar-track">
                            <div
                              className={`bar-fill ${rep.attainmentPct >= 100 ? "surpassing" : rep.attainmentPct >= 80 ? "on-track" : "behind"}`}
                              style={{ width: `${Math.min(rep.attainmentPct, 100)}%` }}
                            />
                          </div>
                          <span className="attainment-pct">{rep.attainmentPct}%</span>
                        </div>
                      </td>
                      <td>{rep.pipelineOwned}</td>
                      <td>
                        <span className="winrate-badge">{rep.winRate}%</span>
                      </td>
                      <td>
                        <span className="sla-badge">{rep.avgResponseMins}m</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Stalled Deals Radar & AI Escalations */}
        <div className="ops-right-column">
          {/* Stalled Deals Alert Box */}
          <div className="terminal-card stalled-deals-card">
            <div className="card-top-bar">
              <div className="card-title-group">
                <span className="card-icon text-amber-500"><AlertTriangle size={16} /></span>
                <h3 className="column-card-title">Stalled Opportunities Radar (&gt;7 Days Idle)</h3>
              </div>
              <span className="warning-count-badge">3 Deals At Risk</span>
            </div>

            <div className="stalled-list">
              {STALLED_DEALS.map((deal) => (
                <div key={deal.id} className="stalled-item-card">
                  <div className="stalled-top">
                    <div>
                      <strong className="stalled-company">{deal.company}</strong>
                      <span className="stalled-stage">{deal.stage} • Assigned to {deal.rep}</span>
                    </div>
                    <div className="stalled-val-col">
                      <strong className="stalled-val">{deal.value}</strong>
                      <span className="idle-tag">⚠️ {deal.idleDays}d idle</span>
                    </div>
                  </div>

                  <div className="stalled-reason">
                    <span className="reason-label">Bottleneck:</span> {deal.reason}
                  </div>

                  <div className="stalled-ai-action">
                    <Sparkles size={12} className="inline mr-1 text-blue-500" />
                    <strong>AI Recommendation:</strong> {deal.aiSuggestion}
                  </div>

                  <div className="stalled-actions-row">
                    <button
                      type="button"
                      className="stalled-reengage-btn"
                      onClick={() => navigate(ROUTES_PATHS.LEADS_MANAGEMENT)}
                    >
                      Open Lead Dossier <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Ops Navigation Shortcuts */}
          <div className="terminal-card ops-shortcuts-card">
            <h4 className="column-card-title">Operations Deep Links</h4>
            <div className="ops-links-grid">
              <button
                type="button"
                className="ops-quick-link"
                onClick={() => navigate(ROUTES_PATHS.EMPLOYEE_WISE_REPORT)}
              >
                <span>Employee-wise Detailed Report</span>
                <ExternalLink size={14} />
              </button>
              <button
                type="button"
                className="ops-quick-link"
                onClick={() => navigate(ROUTES_PATHS.CALL_LOGS_REPORT)}
              >
                <span>Call Logs & Telephony Analysis</span>
                <ExternalLink size={14} />
              </button>
              <button
                type="button"
                className="ops-quick-link"
                onClick={() => navigate(ROUTES_PATHS.SOURCE_WISE_REPORT)}
              >
                <span>Source Attribution Matrix</span>
                <ExternalLink size={14} />
              </button>
              <button
                type="button"
                className="ops-quick-link"
                onClick={() => navigate(ROUTES_PATHS.EMPLOYEE_TARGET)}
              >
                <span>Set Sales Quotas & Targets</span>
                <ExternalLink size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
