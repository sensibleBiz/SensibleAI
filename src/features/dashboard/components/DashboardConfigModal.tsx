import { useState } from "react";
import {
  X,
  SlidersHorizontal,
  LayoutGrid,
  Check,
  RotateCcw,
  Sparkles,
  BarChart3,
  TrendingUp,
  Target,
  Users,
  Bot,
  Clock,
  Zap,
  Globe2,
  Flame,
  Shield,
  Layers,
} from "lucide-react";
import {
  DashboardConfig,
  DashboardViewMode,
  DisplayDensity,
  RefreshRateOption,
  WidgetKey,
  DEFAULT_DASHBOARD_CONFIG,
} from "../types/dashboardConfig";

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: DashboardConfig;
  onSave: (newConfig: DashboardConfig) => void;
}

const WIDGET_CATALOG: Array<{
  key: WidgetKey;
  label: string;
  description: string;
  icon: typeof BarChart3;
  category: "Executive" | "Operations" | "AI";
}> = [
  {
    key: "kpi_cards",
    label: "Top Financial Metric Sparklines",
    description: "6 high-density cards for Pipeline, Won YTD, Leads, Win Rate, Forecast, and AI deals.",
    icon: TrendingUp,
    category: "Executive",
  },
  {
    key: "momentum_chart",
    label: "Candlestick & Moving Averages Chart",
    description: "Interactive momentum chart with MA 20, MA 50, MA 200 and timeframe buttons.",
    icon: BarChart3,
    category: "Executive",
  },
  {
    key: "ai_insights",
    label: "AI Revenue Insights Radar",
    description: "Live proactive intelligence alerts on velocity shifts, intent surges, and next actions.",
    icon: Sparkles,
    category: "AI",
  },
  {
    key: "funnel_flow",
    label: "Opportunity Flow Funnel",
    description: "Multi-stage pipeline funnel with stage-to-stage conversion efficiency.",
    icon: Target,
    category: "Operations",
  },
  {
    key: "top_movers",
    label: "Top Accounts & Movers Matrix",
    description: "High-value deals with 5-dot account health indicator and next action triggers.",
    icon: Flame,
    category: "Executive",
  },
  {
    key: "regional_heatmap",
    label: "Territory & Regional Heatmap",
    description: "Distribution matrix across West, South, North, East, and International sectors.",
    icon: Globe2,
    category: "Operations",
  },
  {
    key: "ai_agents",
    label: "Autonomous AI Agents Telemetry",
    description: "Live monitor for Research, Outreach, WhatsApp, and Intelligence agents.",
    icon: Bot,
    category: "AI",
  },
  {
    key: "rep_leaderboard",
    label: "Sales Rep Performance Leaderboard",
    description: "Quota attainment, win rates, calls logged, and response time SLAs per rep.",
    icon: Users,
    category: "Operations",
  },
  {
    key: "stalled_deals",
    label: "Stalled Deals & Slipping Radar",
    description: "Automatic flagging of opportunities idle for more than 7 days.",
    icon: Shield,
    category: "Operations",
  },
  {
    key: "recent_wins",
    label: "Recent Wins & Victory Trophies",
    description: "Celebration stream of closed deals and contract signoffs.",
    icon: Zap,
    category: "Executive",
  },
  {
    key: "live_activity",
    label: "Live Omnichannel Activity Stream",
    description: "Real-time feed of calls, WhatsApp messages, proposals sent, and meetings.",
    icon: Clock,
    category: "Operations",
  },
];

export default function DashboardConfigModal({
  isOpen,
  onClose,
  config,
  onSave,
}: ConfigModalProps) {
  const [activeTab, setActiveTab] = useState<"presets" | "widgets" | "targets">("presets");
  const [localConfig, setLocalConfig] = useState<DashboardConfig>(() => ({ ...config }));

  if (!isOpen) return null;

  const handleWidgetToggle = (key: WidgetKey) => {
    setLocalConfig((prev) => ({
      ...prev,
      activeWidgets: {
        ...prev.activeWidgets,
        [key]: !prev.activeWidgets[key],
      },
    }));
  };

  const handleReset = () => {
    setLocalConfig({ ...DEFAULT_DASHBOARD_CONFIG });
  };

  const handleApply = () => {
    onSave(localConfig);
    onClose();
  };

  return (
    <div className="crm-modal-backdrop" onClick={onClose}>
      <div
        className="dashboard-config-modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="config-modal-header">
          <div className="config-header-left">
            <div className="config-header-badge">
              <SlidersHorizontal size={13} />
              <span>Dashboard Configurator</span>
            </div>
            <h3 className="config-modal-title">Personalize Your Revenue Cockpit</h3>
            <p className="config-modal-subtitle">
              Choose your primary dashboard archetype, toggle modular telemetry widgets, and adjust display density.
            </p>
          </div>
          <button
            type="button"
            className="config-modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="config-modal-tabs">
          <button
            type="button"
            className={`config-tab-btn ${activeTab === "presets" ? "active" : ""}`}
            onClick={() => setActiveTab("presets")}
          >
            <LayoutGrid size={14} />
            <span>Preset & Density</span>
          </button>
          <button
            type="button"
            className={`config-tab-btn ${activeTab === "widgets" ? "active" : ""}`}
            onClick={() => setActiveTab("widgets")}
          >
            <Layers size={14} />
            <span>Widget Studio</span>
            <span className="tab-counter">
              {Object.values(localConfig.activeWidgets).filter(Boolean).length}/11
            </span>
          </button>
          <button
            type="button"
            className={`config-tab-btn ${activeTab === "targets" ? "active" : ""}`}
            onClick={() => setActiveTab("targets")}
          >
            <Target size={14} />
            <span>Target Goals & Refresh</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="config-modal-body">
          {/* TAB 1: PRESET & DENSITY */}
          {activeTab === "presets" && (
            <div className="config-tab-content">
              <div className="config-section">
                <label className="section-title">Default Startup Dashboard</label>
                <p className="section-desc">Select which dashboard loads automatically upon signing in.</p>
                <div className="preset-grid">
                  {[
                    {
                      id: "terminal",
                      title: "Executive Trading Terminal",
                      desc: "Crypto/Bloomberg high-density financial terminal with candlestick momentum & MA curves.",
                      icon: TrendingUp,
                    },
                    {
                      id: "pipeline",
                      title: "Sales Pipeline & Lead Funnel",
                      desc: "Full source attribution matrix, employee filters, quotation management, and Excel export.",
                      icon: Target,
                    },
                    {
                      id: "sales_ops",
                      title: "Sales Ops & Rep Performance",
                      desc: "Rep quotas, activity telemetry (calls, WhatsApp, meetings), and stalled deal radar.",
                      icon: Users,
                    },
                    {
                      id: "ai_autopilot",
                      title: "AI Command Center & Autopilot",
                      desc: "Autonomous agents telemetry, hot buyer intent signals, and credit automation throughput.",
                      icon: Bot,
                    },
                  ].map((p) => {
                    const Icon = p.icon;
                    const isSelected = localConfig.defaultMode === p.id;
                    return (
                      <div
                        key={p.id}
                        className={`preset-card ${isSelected ? "selected" : ""}`}
                        onClick={() =>
                          setLocalConfig((prev) => ({
                            ...prev,
                            defaultMode: p.id as DashboardViewMode,
                          }))
                        }
                      >
                        <div className="preset-card-top">
                          <span className="preset-icon-wrap">
                            <Icon size={18} />
                          </span>
                          {isSelected && <span className="preset-checked"><Check size={13} /></span>}
                        </div>
                        <h4 className="preset-name">{p.title}</h4>
                        <p className="preset-desc">{p.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Visual Display Density */}
              <div className="config-section">
                <label className="section-title">Visual Layout Density</label>
                <p className="section-desc">Adjust the compact spacing of charts, tables, and metric cards.</p>
                <div className="density-toggle-group">
                  {[
                    { id: "compact", label: "High-Density Compact", sub: "Terminal style (Max metrics on screen)" },
                    { id: "comfortable", label: "Comfortable Balanced", sub: "Standard enterprise spacing" },
                    { id: "minimal", label: "Clean Minimalist", sub: "Spacious with soft elevations" },
                  ].map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={`density-option-btn ${localConfig.density === d.id ? "active" : ""}`}
                      onClick={() =>
                        setLocalConfig((prev) => ({
                          ...prev,
                          density: d.id as DisplayDensity,
                        }))
                      }
                    >
                      <strong className="density-label">{d.label}</strong>
                      <span className="density-sub">{d.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WIDGET STUDIO */}
          {activeTab === "widgets" && (
            <div className="config-tab-content">
              <div className="config-section">
                <div className="section-header-flex">
                  <div>
                    <label className="section-title">Active Modular Widgets</label>
                    <p className="section-desc">Toggle the specific analytical components to render in your dashboard.</p>
                  </div>
                  <div className="widget-batch-actions">
                    <button
                      type="button"
                      className="batch-action-btn"
                      onClick={() => {
                        const allOn = {} as Record<WidgetKey, boolean>;
                        WIDGET_CATALOG.forEach((w) => (allOn[w.key] = true));
                        setLocalConfig((prev) => ({ ...prev, activeWidgets: allOn }));
                      }}
                    >
                      Enable All
                    </button>
                  </div>
                </div>

                <div className="widget-toggle-list">
                  {WIDGET_CATALOG.map((widget) => {
                    const Icon = widget.icon;
                    const isEnabled = Boolean(localConfig.activeWidgets[widget.key]);
                    return (
                      <div
                        key={widget.key}
                        className={`widget-toggle-card ${isEnabled ? "enabled" : "disabled"}`}
                        onClick={() => handleWidgetToggle(widget.key)}
                      >
                        <div className="widget-toggle-left">
                          <span className={`widget-icon ${isEnabled ? "active" : ""}`}>
                            <Icon size={16} />
                          </span>
                          <div className="widget-info">
                            <div className="widget-title-row">
                              <span className="widget-name">{widget.label}</span>
                              <span className={`category-tag ${widget.category.toLowerCase()}`}>
                                {widget.category}
                              </span>
                            </div>
                            <p className="widget-desc">{widget.description}</p>
                          </div>
                        </div>

                        <div className="widget-toggle-right">
                          <div className={`switch-track ${isEnabled ? "on" : "off"}`}>
                            <div className="switch-thumb" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TARGET GOALS & REFRESH */}
          {activeTab === "targets" && (
            <div className="config-tab-content">
              <div className="config-section">
                <label className="section-title">Telemetry Auto-Refresh Interval</label>
                <p className="section-desc">Frequency at which live pipeline metrics, AI signals, and rep activity refresh.</p>
                <div className="refresh-rate-grid">
                  {[
                    { val: 15, label: "15 Seconds", tag: "⚡ Ultra-Live Pulse" },
                    { val: 30, label: "30 Seconds", tag: "Recommended" },
                    { val: 60, label: "1 Minute", tag: "Standard" },
                    { val: 300, label: "5 Minutes", tag: "Low Bandwidth" },
                    { val: 0, label: "Manual Only", tag: "On Demand" },
                  ].map((r) => (
                    <button
                      key={r.val}
                      type="button"
                      className={`refresh-pill ${localConfig.refreshRate === r.val ? "active" : ""}`}
                      onClick={() =>
                        setLocalConfig((prev) => ({
                          ...prev,
                          refreshRate: r.val as RefreshRateOption,
                        }))
                      }
                    >
                      <strong className="rate-time">{r.label}</strong>
                      <span className="rate-tag">{r.tag}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="config-section">
                <label className="section-title">Executive Targets & Benchmarks</label>
                <p className="section-desc">Custom thresholds used for calculating visual pacing and target achievement lines.</p>
                <div className="target-inputs-grid">
                  <div className="target-input-box">
                    <label className="target-label">Quarterly Pipeline Goal (₹ Crores)</label>
                    <div className="input-group">
                      <span className="input-prefix">₹</span>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        step="0.5"
                        value={localConfig.targetPipelineCr}
                        onChange={(e) =>
                          setLocalConfig((prev) => ({
                            ...prev,
                            targetPipelineCr: parseFloat(e.target.value) || 15.0,
                          }))
                        }
                        className="target-field"
                      />
                      <span className="input-suffix">Cr</span>
                    </div>
                    <span className="target-hint">Current: ₹ 12.4 Cr (82.6% to goal)</span>
                  </div>

                  <div className="target-input-box">
                    <label className="target-label">Target Conversion Win Rate (%)</label>
                    <div className="input-group">
                      <input
                        type="number"
                        min="5"
                        max="100"
                        step="0.5"
                        value={localConfig.targetWinRatePct}
                        onChange={(e) =>
                          setLocalConfig((prev) => ({
                            ...prev,
                            targetWinRatePct: parseFloat(e.target.value) || 25.0,
                          }))
                        }
                        className="target-field"
                      />
                      <span className="input-suffix">%</span>
                    </div>
                    <span className="target-hint">Current: 18.6% (6.4% gap to target)</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="config-modal-footer">
          <button
            type="button"
            className="config-reset-btn"
            onClick={handleReset}
          >
            <RotateCcw size={14} />
            <span>Reset Defaults</span>
          </button>

          <div className="footer-right-actions">
            <button
              type="button"
              className="config-cancel-btn"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="config-save-btn"
              onClick={handleApply}
            >
              <Check size={14} />
              <span>Save & Apply Configuration</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

