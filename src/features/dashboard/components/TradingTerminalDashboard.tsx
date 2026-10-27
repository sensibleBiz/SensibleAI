import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Calendar,
  ChevronDown,
  Flame,
  Globe2,
  Mail,
  MessageSquare,
  Phone,
  Sparkles,
  Target,
  Users,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ROUTES_PATHS } from "@/shared/lib/constants";
import { useThemeMode } from "@/shared/hooks";
import type { DashboardConfig } from "../types/dashboardConfig";

type TimeframeOption = "7D" | "30D" | "3M" | "6M" | "1Y";
type MoversTab = "top" | "rising" | "risk";

interface CandlePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma20: number;
  ma50: number;
  ma200: number;
}

interface TradingTerminalDashboardProps {
  config?: DashboardConfig;
  onOpenDeepDive?: (metric: string) => void;
}

export default function TradingTerminalDashboard({
  config,
  onOpenDeepDive,
}: TradingTerminalDashboardProps) {
  const navigate = useNavigate();
  const { isDark } = useThemeMode();

  const [timeframe, setTimeframe] = useState<TimeframeOption>("1Y");
  const [moversTab, setMoversTab] = useState<MoversTab>("top");
  const [selectedSegment, setSelectedSegment] = useState<string>("All Segments");
  const [hoveredCandle, setHoveredCandle] = useState<CandlePoint | null>(null);

  // Candlestick series replicating the exact momentum shown in the reference screenshots
  const candleData: CandlePoint[] = useMemo(() => [
    { date: "Jan 2026", open: 12.0, high: 13.5, low: 11.2, close: 13.1, volume: 38, ma20: 12.2, ma50: 11.0, ma200: 9.8 },
    { date: "Feb 2026", open: 13.1, high: 14.8, low: 12.6, close: 14.2, volume: 46, ma20: 12.8, ma50: 11.5, ma200: 10.1 },
    { date: "Mar 2026", open: 14.2, high: 15.6, low: 13.4, close: 14.8, volume: 52, ma20: 13.4, ma50: 12.1, ma200: 10.4 },
    { date: "Apr 2026", open: 14.8, high: 16.2, low: 13.8, close: 15.5, volume: 58, ma20: 14.0, ma50: 12.7, ma200: 10.8 },
    { date: "May 2026", open: 15.5, high: 17.0, low: 14.6, close: 16.4, volume: 64, ma20: 14.6, ma50: 13.2, ma200: 11.2 },
    { date: "Jun 2026", open: 16.4, high: 17.8, low: 15.0, close: 15.8, volume: 48, ma20: 15.1, ma50: 13.8, ma200: 11.5 },
    { date: "Jul 2026", open: 15.8, high: 17.2, low: 14.5, close: 16.8, volume: 62, ma20: 15.6, ma50: 14.3, ma200: 11.8 },
    { date: "Aug 2026", open: 16.8, high: 18.5, low: 15.8, close: 17.6, volume: 72, ma20: 16.2, ma50: 14.8, ma200: 12.1 },
    { date: "Sep 2026", open: 10.8, high: 12.6, low: 10.4, close: 12.4, volume: 84, ma20: 10.2, ma50: 8.6, ma200: 6.1 },
    { date: "Oct 2026", open: 12.4, high: 14.2, low: 11.8, close: 13.8, volume: 90, ma20: 11.4, ma50: 9.5, ma200: 7.2 },
    { date: "Nov 2026", open: 13.8, high: 15.5, low: 13.0, close: 14.9, volume: 95, ma20: 12.6, ma50: 10.4, ma200: 8.0 },
    { date: "Dec 2026", open: 14.9, high: 16.8, low: 14.2, close: 16.2, volume: 105, ma20: 13.8, ma50: 11.2, ma200: 8.8 },
  ], []);

  const activeCandle = hoveredCandle || candleData[8]; // Default to Sep 2026 as in screenshot

  return (
    <div className={`trading-terminal-root ${isDark ? "theme-dark" : "theme-light"} density-${config?.density || "compact"}`}>
      {/* ── 1. Top 6 Financial Metric Sparkline Cards ── */}
      {(!config || config.activeWidgets.kpi_cards !== false) && (
        <section className="terminal-kpi-row">
          {/* Pipeline Value */}
          <div
            className="terminal-kpi-card clickable"
            onClick={() => onOpenDeepDive?.("pipeline")}
            title="Click to deep dive Pipeline Value"
          >
            <div className="terminal-kpi-header">
              <span className="terminal-kpi-label">Pipeline Value</span>
              <span className="terminal-kpi-badge positive"><ArrowUpRight size={11} /> 18%</span>
            </div>
            <div className="terminal-kpi-val">₹ 12.4 Cr</div>
            <div className="terminal-kpi-sub">vs last 30 days • Click to deep dive</div>
            <svg className="terminal-sparkline" viewBox="0 0 100 24" preserveAspectRatio="none">
              <path d="M0,20 Q20,16 35,18 T65,8 T85,12 T100,4" fill="none" stroke="#10b981" strokeWidth="2" />
            </svg>
          </div>

          {/* Won Revenue (YTD) */}
          <div
            className="terminal-kpi-card clickable"
            onClick={() => onOpenDeepDive?.("won")}
            title="Click to deep dive Won Revenue"
          >
            <div className="terminal-kpi-header">
              <span className="terminal-kpi-label">Won Revenue (YTD)</span>
              <span className="terminal-kpi-badge positive"><ArrowUpRight size={11} /> 28%</span>
            </div>
            <div className="terminal-kpi-val">₹ 3.8 Cr</div>
            <div className="terminal-kpi-sub">vs last 30 days • Click to deep dive</div>
            <svg className="terminal-sparkline" viewBox="0 0 100 24" preserveAspectRatio="none">
              <path d="M0,22 Q25,18 45,14 T75,10 T100,3" fill="none" stroke="#3b82f6" strokeWidth="2" />
            </svg>
          </div>

          {/* Qualified Leads */}
          <div
            className="terminal-kpi-card clickable"
            onClick={() => onOpenDeepDive?.("leads")}
            title="Click to deep dive Qualified Leads"
          >
            <div className="terminal-kpi-header">
              <span className="terminal-kpi-label">Qualified Leads</span>
              <span className="terminal-kpi-badge positive"><ArrowUpRight size={11} /> 42%</span>
            </div>
            <div className="terminal-kpi-val">428</div>
            <div className="terminal-kpi-sub">vs last 30 days • Click to deep dive</div>
            <svg className="terminal-sparkline" viewBox="0 0 100 24" preserveAspectRatio="none">
              <path d="M0,20 Q20,22 40,15 T70,12 T100,5" fill="none" stroke="#8b5cf6" strokeWidth="2" />
            </svg>
          </div>

          {/* Conversion Rate */}
          <div
            className="terminal-kpi-card clickable"
            onClick={() => onOpenDeepDive?.("winrate")}
            title="Click to deep dive Conversion Rate"
          >
            <div className="terminal-kpi-header">
              <span className="terminal-kpi-label">Conversion Rate</span>
              <span className="terminal-kpi-badge positive"><ArrowUpRight size={11} /> 3.2%</span>
            </div>
            <div className="terminal-kpi-val">18.6%</div>
            <div className="terminal-kpi-sub">vs last 30 days • Click to deep dive</div>
            <svg className="terminal-sparkline" viewBox="0 0 100 24" preserveAspectRatio="none">
              <path d="M0,18 Q20,14 40,16 T70,8 T100,4" fill="none" stroke="#ec4899" strokeWidth="2" />
            </svg>
          </div>

          {/* Forecast (Next 3 Months) */}
          <div
            className="terminal-kpi-card clickable"
            onClick={() => onOpenDeepDive?.("forecast")}
            title="Click to deep dive 3M Forecast"
          >
            <div className="terminal-kpi-header">
              <span className="terminal-kpi-label">Forecast (Next 3 Months)</span>
              <span className="terminal-kpi-badge positive"><ArrowUpRight size={11} /> 24%</span>
            </div>
            <div className="terminal-kpi-val">₹ 7.6 Cr</div>
            <div className="terminal-kpi-sub">vs last 30 days • Click to deep dive</div>
            <svg className="terminal-sparkline" viewBox="0 0 100 24" preserveAspectRatio="none">
              <path d="M0,22 Q30,16 55,14 T80,8 T100,2" fill="none" stroke="#f59e0b" strokeWidth="2" />
            </svg>
          </div>

          {/* AI Opportunities */}
          <div
            className="terminal-kpi-card clickable"
            onClick={() => onOpenDeepDive?.("ai_intent")}
            title="Click to deep dive AI Opportunities"
          >
            <div className="terminal-kpi-header">
              <span className="terminal-kpi-label">AI Opportunities</span>
              <span className="terminal-kpi-badge positive"><ArrowUpRight size={11} /> 35%</span>
            </div>
            <div className="terminal-kpi-val">56</div>
            <div className="terminal-kpi-sub">High potential • Click to deep dive</div>
            <svg className="terminal-sparkline" viewBox="0 0 100 24" preserveAspectRatio="none">
              <path d="M0,20 Q25,12 50,15 T80,6 T100,3" fill="none" stroke="#10b981" strokeWidth="2" />
            </svg>
          </div>
        </section>
      )}

      {/* ── 2. Middle Row: Candlestick Momentum Chart & AI Revenue Insights ── */}
      <section className="terminal-main-grid">
        {/* Momentum Candlestick & Moving Average Chart */}
        <div className="terminal-card momentum-card">
          <div className="momentum-card-header">
            <div className="momentum-title-group">
              <div className="momentum-title-row">
                <span className="momentum-icon">📈</span>
                <h3 className="momentum-title">Revenue & Pipeline Momentum</h3>
              </div>
              <div className="momentum-summary-pills">
                <div className="summary-pill blue">
                  <span className="dot" /> Current Pipeline: <strong>₹ 12.4 Cr</strong>
                </div>
                <div className="summary-pill green">
                  <span className="dot" /> Won (YTD): <strong>₹ 3.8 Cr</strong>
                </div>
                <div className="summary-pill purple">
                  <span className="dot" /> Forecast (Next 3M): <strong>₹ 7.6 Cr</strong>
                </div>
                <div className="summary-pill amber">
                  <span className="dot" /> Total Pipeline: <strong>₹ 18.2 Cr</strong>
                </div>
              </div>
            </div>

            <div className="momentum-controls">
              <div className="timeframe-pill-group">
                {(["7D", "30D", "3M", "6M", "1Y"] as TimeframeOption[]).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    className={`tf-btn ${timeframe === tf ? "active" : ""}`}
                    onClick={() => setTimeframe(tf)}
                  >
                    {tf}
                  </button>
                ))}
              </div>
              <div className="segment-select-wrap">
                <select
                  value={selectedSegment}
                  onChange={(e) => setSelectedSegment(e.target.value)}
                  className="segment-select"
                >
                  <option value="All Segments">All Segments</option>
                  <option value="Enterprise">Enterprise</option>
                  <option value="SME">SME</option>
                  <option value="Retail">Retail</option>
                  <option value="Exports">Exports</option>
                </select>
              </div>
            </div>
          </div>

          {/* Chart Header Indicators Bar */}
          <div className="chart-legend-row">
            <div className="chart-legend-metrics">
              <span className="legend-ohlc">Pipeline Value</span>
              <span className="legend-ohlc">O <strong>{activeCandle.open} Cr</strong></span>
              <span className="legend-ohlc">H <strong>{activeCandle.high} Cr</strong></span>
              <span className="legend-ohlc">L <strong>{activeCandle.low} Cr</strong></span>
              <span className="legend-ohlc">C <strong>{activeCandle.close} Cr</strong></span>
              <span className="legend-delta positive">+1.6 Cr (+14.8%)</span>
            </div>
            <div className="chart-ma-indicators">
              <span className="ma-tag green">● MA 20 10.2 Cr</span>
              <span className="ma-tag blue">● MA 50 8.6 Cr</span>
              <span className="ma-tag purple">● MA 200 6.1 Cr</span>
            </div>
          </div>

          {/* SVG Candlestick & Curve Visualization */}
          <div className="momentum-svg-wrapper">
            <svg
              className="momentum-canvas"
              viewBox="0 0 880 240"
              preserveAspectRatio="none"
              onMouseLeave={() => setHoveredCandle(null)}
            >
              <defs>
                <linearGradient id="volumeGradGreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
                </linearGradient>
                <linearGradient id="volumeGradRed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
                </linearGradient>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid lines */}
              <line x1="0" y1="30" x2="880" y2="30" stroke="currentColor" strokeOpacity="0.07" strokeDasharray="3 3" />
              <line x1="0" y1="80" x2="880" y2="80" stroke="currentColor" strokeOpacity="0.07" strokeDasharray="3 3" />
              <line x1="0" y1="130" x2="880" y2="130" stroke="currentColor" strokeOpacity="0.07" strokeDasharray="3 3" />
              <line x1="0" y1="180" x2="880" y2="180" stroke="currentColor" strokeOpacity="0.07" strokeDasharray="3 3" />

              {/* Volume Bars */}
              {candleData.map((c, i) => {
                const x = 30 + i * 70;
                const isBull = c.close >= c.open;
                const volHeight = (c.volume / 110) * 55;
                return (
                  <rect
                    key={`vol-${i}`}
                    x={x - 8}
                    y={230 - volHeight}
                    width={16}
                    height={volHeight}
                    fill={isBull ? "url(#volumeGradGreen)" : "url(#volumeGradRed)"}
                    rx="1"
                  />
                );
              })}

              {/* Candlesticks */}
              {candleData.map((c, i) => {
                const x = 30 + i * 70;
                const isBull = c.close >= c.open;
                // Coordinate conversion (25 Cr -> y:20, 5 Cr -> y:200)
                const scaleY = (val: number) => 220 - ((val - 5) / 20) * 190;
                const yHigh = scaleY(c.high);
                const yLow = scaleY(c.low);
                const yOpen = scaleY(c.open);
                const yClose = scaleY(c.close);
                const yTop = Math.min(yOpen, yClose);
                const bodyHeight = Math.max(Math.abs(yOpen - yClose), 3);

                const color = isBull ? "#10b981" : "#ef4444";

                return (
                  <g
                    key={`candle-${i}`}
                    className="candle-bar-group"
                    onMouseEnter={() => setHoveredCandle(c)}
                    style={{ cursor: "pointer" }}
                  >
                    {/* Wick */}
                    <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1.5" />
                    {/* Body */}
                    <rect
                      x={x - 6}
                      y={yTop}
                      width={12}
                      height={bodyHeight}
                      fill={color}
                      rx="1"
                    />
                  </g>
                );
              })}

              {/* Moving Average Curves */}
              {/* MA 200 (Purple) */}
              <path
                d="M30,170 C170,165 310,155 450,140 C590,128 730,110 800,95"
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="2"
              />
              {/* MA 50 (Blue) */}
              <path
                d="M30,150 C170,140 310,125 450,110 C590,95 730,75 800,60"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
              />
              {/* MA 20 (Green) */}
              <path
                d="M30,135 C170,120 310,105 450,90 C590,75 730,55 800,45"
                fill="none"
                stroke="#10b981"
                strokeWidth="2.2"
                strokeDasharray="4 2"
              />

              {/* September Target Focus Point & Vertical Crosshair */}
              <line x1="590" y1="20" x2="590" y2="230" stroke="#3b82f6" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx="590" cy="115" r="4.5" fill="#3b82f6" stroke="#fff" strokeWidth="2" />
            </svg>

            {/* Floating Tooltip Box matching Screenshot */}
            <div className="terminal-candle-tooltip" style={{ left: "55%", top: "25%" }}>
              <div className="tooltip-head">Sep 2026</div>
              <div className="tooltip-val">Pipeline Value: <strong>12.4 Cr</strong></div>
              <div className="tooltip-sub positive">↑ 18% vs last month</div>
            </div>

            {/* Bottom X-Axis Month Labels */}
            <div className="momentum-x-axis">
              {candleData.map((c) => (
                <span key={c.date} className="x-label">{c.date}</span>
              ))}
            </div>
          </div>
        </div>

        {/* AI Revenue Insights Panel */}
        <div className="terminal-card ai-insights-card">
          <div className="ai-insights-header">
            <div className="ai-title-row">
              <Sparkles size={16} className="sparkle-ai-icon" />
              <h3 className="ai-heading">AI Revenue Insights</h3>
            </div>
            <button
              type="button"
              className="see-all-link"
              onClick={() => navigate(ROUTES_PATHS.LEADS_MANAGEMENT)}
            >
              See All →
            </button>
          </div>

          <div className="ai-insights-items-wrap">
            {/* 1. Momentum loss alert */}
            <div className="ai-insight-block alert-red">
              <div className="insight-icon-wrap red"><Flame size={15} /></div>
              <div className="insight-body">
                <strong>3 high-value opportunities losing momentum</strong>
                <p>Total value: ₹ 1.8 Cr</p>
              </div>
            </div>

            {/* 2. Intent detection */}
            <div className="ai-insight-block alert-green">
              <div className="insight-icon-wrap green"><Target size={15} /></div>
              <div className="insight-body">
                <strong>12 buyers showing intent</strong>
                <p>Based on recent website visits, email engagement and market signals</p>
              </div>
            </div>

            {/* 3. Regional acceleration */}
            <div className="ai-insight-block alert-blue">
              <div className="insight-icon-wrap blue"><Globe2 size={15} /></div>
              <div className="insight-body">
                <strong>Thailand distributor segment accelerating</strong>
                <p>+40% increase in new leads this month</p>
              </div>
            </div>

            {/* 4. Recommended next actions */}
            <div className="ai-insight-block alert-purple">
              <div className="insight-icon-wrap purple"><Sparkles size={15} /></div>
              <div className="insight-body">
                <strong>Recommended next actions</strong>
                <ul className="action-bullet-list">
                  <li>• Follow up with 8 warm opportunities</li>
                  <li>• Send proposal to 5 qualified leads</li>
                  <li>• Schedule calls with 12 new prospects</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Middle 3-Column Grid: Opportunity Flow, Top Accounts, Pipeline Heatmap ── */}
      <section className="terminal-three-col-grid">
        {/* Opportunity Flow (Pipeline Funnel) */}
        <div className="terminal-card opportunity-flow-card">
          <div className="card-top-bar">
            <h4 className="column-card-title">Opportunity Flow</h4>
            <span className="card-filter-pill">This Quarter <ChevronDown size={11} /></span>
          </div>

          <div className="flow-table-header">
            <span>Stage</span>
            <span style={{ textAlign: "right" }}>Count</span>
            <span style={{ textAlign: "right" }}>Value</span>
            <span style={{ textAlign: "right" }}>Δ (vs last qtr)</span>
          </div>

          <div className="flow-stages-list">
            {[
              { stage: "Lead", count: 312, value: "₹ 8.4 Cr", delta: "+22%", isUp: true, color: "#3b82f6", pct: 100 },
              { stage: "Qualified", count: 148, value: "₹ 6.2 Cr", delta: "+18%", isUp: true, color: "#06b6d4", pct: 75 },
              { stage: "Discovery", count: 86, value: "₹ 4.8 Cr", delta: "+12%", isUp: true, color: "#8b5cf6", pct: 58 },
              { stage: "Proposal", count: 54, value: "₹ 3.1 Cr", delta: "-8%", isUp: false, color: "#ec4899", pct: 40 },
              { stage: "Negotiation", count: 32, value: "₹ 2.6 Cr", delta: "+20%", isUp: true, color: "#f59e0b", pct: 32 },
              { stage: "Won", count: 46, value: "₹ 3.8 Cr", delta: "+28%", isUp: true, color: "#10b981", pct: 45 },
            ].map((stg) => (
              <div key={stg.stage} className="flow-stage-row">
                <div className="flow-stage-name-col">
                  <span className="flow-stage-label">{stg.stage}</span>
                  <div className="flow-bar-track">
                    <div
                      className="flow-bar-fill"
                      style={{ width: `${stg.pct}%`, backgroundColor: stg.color }}
                    />
                  </div>
                </div>
                <div className="flow-count-col">{stg.count}</div>
                <div className="flow-val-col">{stg.value}</div>
                <div className={`flow-delta-col ${stg.isUp ? "positive" : "negative"}`}>
                  {stg.isUp ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />} {stg.delta}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Accounts / Movers Table */}
        <div className="terminal-card top-accounts-card">
          <div className="card-top-bar">
            <h4 className="column-card-title">Top Accounts / Movers</h4>
            <div className="movers-tab-buttons">
              <button
                type="button"
                className={`movers-tab-btn ${moversTab === "top" ? "active" : ""}`}
                onClick={() => setMoversTab("top")}
              >
                Top Accounts
              </button>
              <button
                type="button"
                className={`movers-tab-btn ${moversTab === "rising" ? "active" : ""}`}
                onClick={() => setMoversTab("rising")}
              >
                Rising Opportunities
              </button>
              <button
                type="button"
                className={`movers-tab-btn ${moversTab === "risk" ? "active" : ""}`}
                onClick={() => setMoversTab("risk")}
              >
                At Risk
              </button>
            </div>
          </div>

          <div className="terminal-accounts-table-wrap">
            <table className="terminal-accounts-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Opportunity Value</th>
                  <th>Stage</th>
                  <th>Health</th>
                  <th>Intent</th>
                  <th style={{ textAlign: "right" }}>Next Action</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: "ABC Manufacturing Ltd", val: "₹ 1.2 Cr", stage: "Negotiation", stageType: "negotiation", health: 5, intent: "High", action: "Call - Oct 8" },
                  { name: "Varier Bakery Equipments", val: "₹ 95 L", stage: "Proposal", stageType: "proposal", health: 4, intent: "High", action: "Send Quote" },
                  { name: "Thai Fresh Foods Co.", val: "₹ 80 L", stage: "Discovery", stageType: "discovery", health: 4, intent: "High", action: "Meeting - Oct 9" },
                  { name: "Shree Retail Mart", val: "₹ 65 L", stage: "Qualified", stageType: "qualified", health: 3, intent: "Medium", action: "Follow Up" },
                  { name: "National Distributors", val: "₹ 60 L", stage: "Negotiation", stageType: "negotiation", health: 4, intent: "Medium", action: "Call - Oct 10" },
                  { name: "OM Supermarkets", val: "₹ 48 L", stage: "Proposal", stageType: "proposal", health: 3, intent: "Medium", action: "Send Catalogue" },
                  { name: "Laxmi Food Products", val: "₹ 42 L", stage: "Discovery", stageType: "discovery", health: 2, intent: "Low", action: "Nurture" },
                  { name: "Siam Retail Group (TH)", val: "₹ 40 L", stage: "Qualified", stageType: "qualified", health: 4, intent: "High", action: "Meeting - Oct 11" },
                ].map((row) => (
                  <tr key={row.name}>
                    <td><strong>{row.name}</strong></td>
                    <td>{row.val}</td>
                    <td><span className={`terminal-stage-pill ${row.stageType}`}>{row.stage}</span></td>
                    <td>
                      <span className="health-dots">
                        {[1, 2, 3, 4, 5].map((d) => (
                          <span key={d} className={`dot ${d <= row.health ? "filled" : "empty"}`} />
                        ))}
                      </span>
                    </td>
                    <td>
                      <span className={`intent-badge ${row.intent.toLowerCase()}`}>
                        {row.intent}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span className="next-action-text">{row.action}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pipeline Heatmap by Region */}
        <div className="terminal-card heatmap-card">
          <div className="card-top-bar">
            <h4 className="column-card-title">Pipeline Heatmap</h4>
            <span className="card-filter-pill">By Region <ChevronDown size={11} /></span>
          </div>

          <div className="heatmap-table-wrap">
            <table className="heatmap-matrix">
              <thead>
                <tr>
                  <th>Region</th>
                  <th>Lead</th>
                  <th>Qual</th>
                  <th>Disc</th>
                  <th>Prop</th>
                  <th>Neg</th>
                  <th>Won</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { region: "India - West", l: 42, q: 28, d: 18, p: 12, n: 8, w: 14 },
                  { region: "India - South", l: 38, q: 24, d: 16, p: 10, n: 6, w: 12 },
                  { region: "India - North", l: 36, q: 22, d: 14, p: 8, n: 5, w: 10 },
                  { region: "India - East", l: 22, q: 14, d: 10, p: 6, n: 4, w: 8 },
                  { region: "Thailand", l: 28, q: 20, d: 16, p: 12, n: 8, w: 10 },
                  { region: "Middle East", l: 18, q: 12, d: 8, p: 6, n: 4, w: 6 },
                  { region: "Others", l: 12, q: 8, d: 6, p: 4, n: 2, w: 4 },
                ].map((row) => (
                  <tr key={row.region}>
                    <td className="heatmap-region-name">{row.region}</td>
                    <td className="heat-cell cell-deep">{row.l}</td>
                    <td className="heat-cell cell-med-high">{row.q}</td>
                    <td className="heat-cell cell-med">{row.d}</td>
                    <td className="heat-cell cell-med-low">{row.p}</td>
                    <td className="heat-cell cell-low">{row.n}</td>
                    <td className="heat-cell cell-med-high">{row.w}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── 4. Bottom 3-Column Grid: Live Activity, AI Agents, Recent Wins ── */}
      <section className="terminal-three-col-grid terminal-bottom-row">
        {/* Live Activity Feed */}
        <div className="terminal-card live-activity-card">
          <div className="card-top-bar">
            <h4 className="column-card-title">Live Activity</h4>
            <span className="card-filter-pill">All Activities <ChevronDown size={11} /></span>
          </div>

          <div className="terminal-activity-list">
            <div className="terminal-activity-item">
              <span className="act-icon-box green"><MessageSquare size={14} /></span>
              <div className="act-body">
                <div className="act-lead-head">WhatsApp from <strong>Ramesh Traders</strong></div>
                <p className="act-desc">Interested in price list for Sensible 10...</p>
              </div>
              <span className="act-time">2 min ago</span>
            </div>

            <div className="terminal-activity-item">
              <span className="act-icon-box blue"><Mail size={14} /></span>
              <div className="act-body">
                <div className="act-lead-head">Email from <strong>Thai Retail Group</strong></div>
                <p className="act-desc">Request for distributor information</p>
              </div>
              <span className="act-time">12 min ago</span>
            </div>

            <div className="terminal-activity-item">
              <span className="act-icon-box purple"><Phone size={14} /></span>
              <div className="act-body">
                <div className="act-lead-head">Call with <strong>ABC Manufacturing</strong></div>
                <p className="act-desc">Discussed proposal and next steps</p>
              </div>
              <span className="act-time">35 min ago</span>
            </div>

            <div className="terminal-activity-item">
              <span className="act-icon-box orange"><Calendar size={14} /></span>
              <div className="act-body">
                <div className="act-lead-head">Meeting with <strong>Varier Bakery</strong></div>
                <p className="act-desc">Product demo scheduled</p>
              </div>
              <span className="act-time">1 hour ago</span>
            </div>
          </div>
        </div>

        {/* AI Agents Monitoring */}
        <div className="terminal-card ai-agents-card">
          <div className="card-top-bar">
            <h4 className="column-card-title">AI Agents</h4>
            <button
              type="button"
              className="see-all-link"
              onClick={() => navigate(ROUTES_PATHS.AI_SCRAP)}
            >
              Manage Agents →
            </button>
          </div>

          <div className="terminal-agents-grid">
            {/* Research Agent */}
            <div className="terminal-agent-box">
              <div className="agent-top-row">
                <div className="agent-name-group">
                  <span className="agent-icon blue"><Bot size={14} /></span>
                  <strong>Research Agent</strong>
                </div>
                <span className="agent-status-pill active">● Active</span>
              </div>
              <p className="agent-task-desc">Finding new prospects in food retail segment...</p>
              <div className="agent-stat-bottom">
                <span>124 companies found today</span>
                <span className="mini-bars"> ▃▅▇</span>
              </div>
            </div>

            {/* Lead Agent */}
            <div className="terminal-agent-box">
              <div className="agent-top-row">
                <div className="agent-name-group">
                  <span className="agent-icon cyan"><Users size={14} /></span>
                  <strong>Lead Agent</strong>
                </div>
                <span className="agent-status-pill active">● Active</span>
              </div>
              <p className="agent-task-desc">Analyzing incoming leads and enrichment...</p>
              <div className="agent-stat-bottom">
                <span>48 leads processed today</span>
                <span className="mini-bars"> ▂▄▆</span>
              </div>
            </div>

            {/* Follow-up Agent */}
            <div className="terminal-agent-box">
              <div className="agent-top-row">
                <div className="agent-name-group">
                  <span className="agent-icon purple"><Mail size={14} /></span>
                  <strong>Follow-up Agent</strong>
                </div>
                <span className="agent-status-pill running">● Running</span>
              </div>
              <p className="agent-task-desc">Sending personalized follow-up emails...</p>
              <div className="agent-stat-bottom">
                <span>112 emails sent today</span>
                <span className="mini-bars"> ▅▇█</span>
              </div>
            </div>

            {/* Forecast Agent */}
            <div className="terminal-agent-box">
              <div className="agent-top-row">
                <div className="agent-name-group">
                  <span className="agent-icon amber"><Zap size={14} /></span>
                  <strong>Forecast Agent</strong>
                </div>
                <span className="agent-status-pill idle">● Idle</span>
              </div>
              <p className="agent-task-desc">Generating pipeline forecast...</p>
              <div className="agent-stat-bottom">
                <span>Next run in 2 hours</span>
                <span className="mini-bars"> ▂▃▄</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Wins */}
        <div className="terminal-card recent-wins-card">
          <div className="card-top-bar">
            <h4 className="column-card-title">Recent Wins</h4>
            <button
              type="button"
              className="see-all-link"
              onClick={() => navigate(ROUTES_PATHS.LEADS_MANAGEMENT)}
            >
              View All →
            </button>
          </div>

          <div className="terminal-wins-list">
            <div className="win-item-row">
              <span className="win-trophy-icon">🏆</span>
              <div className="win-body">
                <strong>Modern Hypermart Ltd</strong>
                <small>Sensible 10 - 25 outlets</small>
              </div>
              <div className="win-value-col">
                <span className="win-amount">₹ 48 L</span>
                <span className="win-time">2 days ago</span>
              </div>
            </div>

            <div className="win-item-row">
              <span className="win-trophy-icon">🏆</span>
              <div className="win-body">
                <strong>City Fresh Mart</strong>
                <small>Weighing Scales - 15 outlets</small>
              </div>
              <div className="win-value-col">
                <span className="win-amount">₹ 35 L</span>
                <span className="win-time">4 days ago</span>
              </div>
            </div>

            <div className="win-item-row">
              <span className="win-trophy-icon">🏆</span>
              <div className="win-body">
                <strong>Maharashtra Retail Chain</strong>
                <small>POS Systems - 10 outlets</small>
              </div>
              <div className="win-value-col">
                <span className="win-amount">₹ 28 L</span>
                <span className="win-time">5 days ago</span>
              </div>
            </div>

            <div className="win-item-row">
              <span className="win-trophy-icon">🏆</span>
              <div className="win-body">
                <strong>Thai Food Distributors</strong>
                <small>Initial order - 5 outlets</small>
              </div>
              <div className="win-value-col">
                <span className="win-amount">₹ 22 L</span>
                <span className="win-time">1 week ago</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

