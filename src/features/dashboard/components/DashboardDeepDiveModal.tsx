import { useState } from "react";
import {
  X,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Search,
  Sparkles,
  Building,
  Clock,
  ChevronRight,
  Download,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ROUTES_PATHS } from "@/shared/lib/constants";

interface DeepDiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMetric?: string;
}

interface DeepDiveDeal {
  id: string;
  name: string;
  company: string;
  stage: "Discovery" | "Qualified" | "Proposal" | "Negotiation" | "Closing" | "Won";
  stageColor: string;
  value: string;
  rawAmount: number;
  rep: string;
  health: number; // 1-5
  probability: number;
  daysInStage: number;
  intentScore: number;
  nextAction: string;
}

const SAMPLE_DEALS: DeepDiveDeal[] = [
  {
    id: "DL-1092",
    name: "Enterprise Multi-Branch License",
    company: "Apex Global Logistics Ltd",
    stage: "Negotiation",
    stageColor: "amber",
    value: "₹ 48.5 L",
    rawAmount: 4850000,
    rep: "Vikram Rathore",
    health: 5,
    probability: 85,
    daysInStage: 4,
    intentScore: 94,
    nextAction: "Execute revised SLA contract & send board signoff",
  },
  {
    id: "DL-1088",
    name: "Automated Omni-channel CRM Setup",
    company: "Nova Retail Hub Pvt Ltd",
    stage: "Proposal",
    stageColor: "blue",
    value: "₹ 34.0 L",
    rawAmount: 3400000,
    rep: "Sneha Patil",
    health: 4,
    probability: 70,
    daysInStage: 6,
    intentScore: 88,
    nextAction: "Follow up on custom WhatsApp integration scope",
  },
  {
    id: "DL-1075",
    name: "Supply Chain Telemetry Suite",
    company: "Quantum Industrial Corp",
    stage: "Closing",
    stageColor: "emerald",
    value: "₹ 62.0 L",
    rawAmount: 6200000,
    rep: "Vikram Rathore",
    health: 5,
    probability: 92,
    daysInStage: 2,
    intentScore: 98,
    nextAction: "PO issued, generate invoice & schedule onboarding",
  },
  {
    id: "DL-1064",
    name: "Cloud Contact Center Ingestion",
    company: "Zenith FinTech Services",
    stage: "Qualified",
    stageColor: "purple",
    value: "₹ 27.5 L",
    rawAmount: 2750000,
    rep: "Aditi Rao",
    health: 3,
    probability: 55,
    daysInStage: 9,
    intentScore: 81,
    nextAction: "Deliver security compliance documentation",
  },
  {
    id: "DL-1051",
    name: "Pan-India Sales Order Dispatch",
    company: "Starlight Pharma Healthcare",
    stage: "Negotiation",
    stageColor: "amber",
    value: "₹ 52.0 L",
    rawAmount: 5200000,
    rep: "Aditi Rao",
    health: 4,
    probability: 78,
    daysInStage: 5,
    intentScore: 89,
    nextAction: "Confirm 5-year multi-year maintenance terms",
  },
  {
    id: "DL-1049",
    name: "Smart POS & Warehouse Sync",
    company: "BluePeak Consumer Goods",
    stage: "Proposal",
    stageColor: "blue",
    value: "₹ 19.8 L",
    rawAmount: 1980000,
    rep: "Sneha Patil",
    health: 2,
    probability: 40,
    daysInStage: 14,
    intentScore: 65,
    nextAction: "Re-engage executive sponsor before quarterly close",
  },
  {
    id: "DL-1033",
    name: "AI Autonomous Lead Outreach",
    company: "Orion Tech Ventures",
    stage: "Won",
    stageColor: "emerald",
    value: "₹ 38.0 L",
    rawAmount: 3800000,
    rep: "Vikram Rathore",
    health: 5,
    probability: 100,
    daysInStage: 0,
    intentScore: 99,
    nextAction: "Deal Won. License key activated.",
  },
];

export default function DashboardDeepDiveModal({
  isOpen,
  onClose,
  initialMetric = "pipeline",
}: DeepDiveModalProps) {
  const navigate = useNavigate();
  const [selectedMetric, setSelectedMetric] = useState<string>(initialMetric);
  const [selectedSegment, setSelectedSegment] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedStage, setSelectedStage] = useState<string>("All");

  if (!isOpen) return null;

  const filteredDeals = SAMPLE_DEALS.filter((d) => {
    if (selectedStage !== "All" && d.stage !== selectedStage) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        d.company.toLowerCase().includes(q) ||
        d.rep.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalFilteredValue = filteredDeals.reduce((sum, d) => sum + d.rawAmount, 0);
  const totalValueInCr = (totalFilteredValue / 10000000).toFixed(2);

  return (
    <div className="crm-modal-backdrop" onClick={onClose}>
      <div
        className="deep-dive-modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Top Header */}
        <div className="deep-dive-header">
          <div className="deep-dive-header-left">
            <div className="deep-dive-badge">
              <Sparkles size={13} className="text-blue-500" />
              <span>Executive Deep Dive Telemetry</span>
            </div>
            <h2 className="deep-dive-title">Multi-Dimensional Revenue Intelligence</h2>
            <p className="deep-dive-subtitle">
              Granular inspection of pipeline dynamics, deal velocities, and predictive conversion vectors.
            </p>
          </div>
          <div className="deep-dive-header-right">
            <button
              type="button"
              className="deep-dive-export-btn"
              onClick={() => alert("Exporting filtered telemetry dataset...")}
            >
              <Download size={14} />
              Export CSV
            </button>
            <button
              type="button"
              className="deep-dive-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Metric Switcher Navigation */}
        <div className="deep-dive-metric-tabs">
          {[
            { id: "pipeline", label: "Pipeline Value", val: "₹ 12.4 Cr", delta: "+18%", positive: true },
            { id: "won", label: "Won Revenue (YTD)", val: "₹ 3.8 Cr", delta: "+28%", positive: true },
            { id: "leads", label: "Qualified Leads", val: "428", delta: "+42%", positive: true },
            { id: "winrate", label: "Win Rate", val: "18.6%", delta: "+3.2%", positive: true },
            { id: "forecast", label: "Forecast 3M", val: "₹ 7.6 Cr", delta: "+24%", positive: true },
            { id: "ai_intent", label: "AI Opportunities", val: "56 Deals", delta: "+35%", positive: true },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              className={`metric-tab-pill ${selectedMetric === m.id ? "active" : ""}`}
              onClick={() => setSelectedMetric(m.id)}
            >
              <span className="pill-name">{m.label}</span>
              <div className="pill-metric-row">
                <span className="pill-val">{m.val}</span>
                <span className={`pill-delta ${m.positive ? "pos" : "neg"}`}>
                  {m.positive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                  {m.delta}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Deep Dive Content Body */}
        <div className="deep-dive-body">
          {/* Key Stat Diagnostics Grid */}
          <div className="deep-dive-stat-grid">
            <div className="deep-dive-stat-card">
              <span className="stat-label">Active Filtered Total</span>
              <div className="stat-number">₹ {totalValueInCr} Cr</div>
              <span className="stat-hint">{filteredDeals.length} deals in active view</span>
            </div>
            <div className="deep-dive-stat-card">
              <span className="stat-label">Average Deal Velocity</span>
              <div className="stat-number">5.2 Days</div>
              <span className="stat-hint">In current stage (healthy &lt; 10d)</span>
            </div>
            <div className="deep-dive-stat-card">
              <span className="stat-label">Weighted Win Probability</span>
              <div className="stat-number">74.8%</div>
              <span className="stat-hint">Based on AI engagement scoring</span>
            </div>
            <div className="deep-dive-stat-card">
              <span className="stat-label">High-Intent Signals</span>
              <div className="stat-number">6 of 7</div>
              <span className="stat-hint">Active executive buyer engagement</span>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="deep-dive-filter-toolbar">
            <div className="filter-search-box">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search deals, company names, or owners..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="filter-search-input"
              />
            </div>

            <div className="filter-dropdowns">
              <div className="filter-item">
                <span className="filter-label">Stage:</span>
                <select
                  value={selectedStage}
                  onChange={(e) => setSelectedStage(e.target.value)}
                  className="filter-select"
                >
                  <option value="All">All Stages</option>
                  <option value="Discovery">Discovery</option>
                  <option value="Qualified">Qualified</option>
                  <option value="Proposal">Proposal</option>
                  <option value="Negotiation">Negotiation</option>
                  <option value="Closing">Closing</option>
                  <option value="Won">Won</option>
                </select>
              </div>

              <div className="filter-item">
                <span className="filter-label">Segment:</span>
                <select
                  value={selectedSegment}
                  onChange={(e) => setSelectedSegment(e.target.value)}
                  className="filter-select"
                >
                  <option value="All">All Segments</option>
                  <option value="Enterprise">Enterprise</option>
                  <option value="Mid-Market">Mid-Market</option>
                  <option value="Retail">Retail</option>
                  <option value="Exports">Exports</option>
                </select>
              </div>
            </div>
          </div>

          {/* Deals Ledger Table */}
          <div className="deep-dive-table-wrapper">
            <table className="deep-dive-table">
              <thead>
                <tr>
                  <th>Deal & Organization</th>
                  <th>Stage</th>
                  <th>Value</th>
                  <th>Owner</th>
                  <th>Health</th>
                  <th>Probability</th>
                  <th>Age in Stage</th>
                  <th>AI Intent</th>
                  <th>Recommended Next Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map((deal) => (
                  <tr key={deal.id}>
                    <td>
                      <div className="deal-info-cell">
                        <span className="deal-name">{deal.name}</span>
                        <span className="deal-company">
                          <Building size={11} className="inline mr-1" />
                          {deal.company}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`stage-tag ${deal.stageColor}`}>
                        {deal.stage}
                      </span>
                    </td>
                    <td>
                      <strong className="deal-value">{deal.value}</strong>
                    </td>
                    <td>
                      <span className="deal-rep">{deal.rep}</span>
                    </td>
                    <td>
                      <div className="health-dots" title={`Health: ${deal.health}/5`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span
                            key={i}
                            className={`health-dot ${i < deal.health ? "filled" : "empty"}`}
                          />
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className="probability-badge">
                        {deal.probability}%
                      </span>
                    </td>
                    <td>
                      <span className={`velocity-tag ${deal.daysInStage > 10 ? "stalled" : "healthy"}`}>
                        <Clock size={11} className="inline mr-1" />
                        {deal.daysInStage}d
                      </span>
                    </td>
                    <td>
                      <span className="intent-score-badge">
                        🔥 {deal.intentScore}/100
                      </span>
                    </td>
                    <td>
                      <span className="action-hint" title={deal.nextAction}>
                        {deal.nextAction}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Drilldown Action Bar */}
          <div className="deep-dive-bottom-bar">
            <div className="bottom-bar-left">
              <span className="hint-text">
                💡 Need operational stage transfers or bulk allocations?
              </span>
            </div>
            <div className="bottom-bar-right">
              <button
                type="button"
                className="drilldown-btn"
                onClick={() => {
                  onClose();
                  navigate(ROUTES_PATHS.LEADS_FUNNEL_DASHBOARD);
                }}
              >
                Open Full Funnel Breakdown <ChevronRight size={14} />
              </button>
              <button
                type="button"
                className="drilldown-btn primary"
                onClick={() => {
                  onClose();
                  navigate(ROUTES_PATHS.LEADS_MANAGEMENT);
                }}
              >
                Go to Leads Management <ExternalLink size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
