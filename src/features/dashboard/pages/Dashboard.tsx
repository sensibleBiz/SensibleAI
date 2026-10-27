import { useState } from "react";
import {
  TrendingUp,
  Target,
  Users,
  Bot,
  SlidersHorizontal,
  Search,
  Sparkles,
} from "lucide-react";
import TradingTerminalDashboard from "../components/TradingTerminalDashboard";
import SalesOpsDashboard from "../components/SalesOpsDashboard";
import AiAutopilotDashboard from "../components/AiAutopilotDashboard";
import DashboardConfigModal from "../components/DashboardConfigModal";
import DashboardDeepDiveModal from "../components/DashboardDeepDiveModal";
import { LeadFunnelDashboard } from "@/features/leads";
import {
  DashboardConfig,
  DashboardViewMode,
  DEFAULT_DASHBOARD_CONFIG,
} from "../types/dashboardConfig";

const CONFIG_STORAGE_KEY = "crm_dashboard_custom_config_v2";
const MODE_STORAGE_KEY = "crm_dashboard_view_mode_v2";

export default function Dashboard() {
  const [config, setConfig] = useState<DashboardConfig>(() => {
    try {
      const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_DASHBOARD_CONFIG, ...JSON.parse(stored) };
      }
    } catch {
      // fallback
    }
    return DEFAULT_DASHBOARD_CONFIG;
  });

  const [viewMode, setViewMode] = useState<DashboardViewMode>(() => {
    try {
      const stored = localStorage.getItem(MODE_STORAGE_KEY);
      if (
        stored === "terminal" ||
        stored === "pipeline" ||
        stored === "sales_ops" ||
        stored === "ai_autopilot"
      ) {
        return stored;
      }
    } catch {
      // fallback
    }
    return config.defaultMode || "terminal";
  });

  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [deepDiveState, setDeepDiveState] = useState<{
    isOpen: boolean;
    initialMetric: string;
  }>({
    isOpen: false,
    initialMetric: "pipeline",
  });

  const handleModeChange = (mode: DashboardViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  };

  const handleSaveConfig = (newConfig: DashboardConfig) => {
    setConfig(newConfig);
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(newConfig));
    } catch {
      // ignore
    }
  };

  const handleOpenDeepDive = (metric = "pipeline") => {
    setDeepDiveState({
      isOpen: true,
      initialMetric: metric,
    });
  };

  return (
    <div className={`crm-unified-dashboard-container density-${config.density}`}>
      {/* ── View Switcher & Action Toolbar ── */}
      <div className="dashboard-style-switcher-bar">
        <div className="dashboard-switcher-left">
          <div className="dashboard-switcher-pills">
            {/* 1. Executive Trading Terminal */}
            <button
              type="button"
              className={`switcher-pill-btn ${viewMode === "terminal" ? "active" : ""}`}
              onClick={() => handleModeChange("terminal")}
              title="Crypto / Financial Terminal Intelligence CRM Dashboard"
            >
              <TrendingUp size={14} className="switcher-icon text-emerald-500" />
              <span className="switcher-title">Executive Trading Terminal</span>
              <span className="switcher-pulse-tag">Live</span>
            </button>

            {/* 2. Sales Pipeline & Lead Sources */}
            <button
              type="button"
              className={`switcher-pill-btn ${viewMode === "pipeline" ? "active" : ""}`}
              onClick={() => handleModeChange("pipeline")}
              title="Operational Sales Pipeline & Lead Source Matrix with Quotations & Export"
            >
              <Target size={14} className="switcher-icon text-blue-500" />
              <span className="switcher-title">Pipeline & Lead Sources</span>
            </button>

            {/* 3. Sales Ops & Rep Performance */}
            <button
              type="button"
              className={`switcher-pill-btn ${viewMode === "sales_ops" ? "active" : ""}`}
              onClick={() => handleModeChange("sales_ops")}
              title="Sales Operations, Rep Quotas, Calls Logged, and Stalled Deals Radar"
            >
              <Users size={14} className="switcher-icon text-purple-500" />
              <span className="switcher-title">Sales Ops & Reps</span>
            </button>

            {/* 4. AI Command Center & Growth Autopilot */}
            <button
              type="button"
              className={`switcher-pill-btn ${viewMode === "ai_autopilot" ? "active" : ""}`}
              onClick={() => handleModeChange("ai_autopilot")}
              title="Autonomous AI Agents Fleet, Buyer Intent Surges, and AI Credit ROI"
            >
              <Bot size={14} className="switcher-icon text-amber-500" />
              <span className="switcher-title">AI Autopilot & Growth</span>
              <span className="switcher-spark-badge">
                <Sparkles size={10} /> AI
              </span>
            </button>
          </div>
        </div>

        {/* Toolbar Right: Deep Dive, Refresh Rate & Configurator Buttons */}
        <div className="dashboard-switcher-right">
          {/* Deep Dive Explorer Trigger */}
          <button
            type="button"
            className="dashboard-action-btn deep-dive-trigger-btn"
            onClick={() => handleOpenDeepDive("pipeline")}
            title="Open Granular Revenue & Deal Telemetry Deep Dive"
          >
            <Search size={13} className="btn-icon text-blue-400" />
            <span>Deep Dive</span>
          </button>

          {/* Configurator / Settings Button */}
          <button
            type="button"
            className="dashboard-action-btn config-trigger-btn"
            onClick={() => setIsConfigOpen(true)}
            title="Configure Dashboard Widgets, Presets, Targets & Density"
          >
            <SlidersHorizontal size={13} className="btn-icon" />
            <span>Settings</span>
          </button>

          {/* Telemetry Status Indicator */}
          <div className="dashboard-status-indicator" title={`Auto-refresh interval: ${config.refreshRate}s`}>
            <span className="status-live-dot" />
            <span className="status-text">
              {config.refreshRate === 0 ? "Manual Sync" : `${config.refreshRate}s Live`}
            </span>
          </div>
        </div>
      </div>

      {/* ── Active Dashboard Rendering ── */}
      <main className="dashboard-content-area">
        {viewMode === "terminal" && (
          <TradingTerminalDashboard
            config={config}
            onOpenDeepDive={handleOpenDeepDive}
          />
        )}

        {viewMode === "pipeline" && (
          <div className="pipeline-view-wrapper">
            <LeadFunnelDashboard />
          </div>
        )}

        {viewMode === "sales_ops" && (
          <SalesOpsDashboard
            config={config}
            onOpenDeepDive={handleOpenDeepDive}
          />
        )}

        {viewMode === "ai_autopilot" && (
          <AiAutopilotDashboard
            config={config}
            onOpenDeepDive={handleOpenDeepDive}
          />
        )}
      </main>

      {/* ── Settings & Configurator Modal ── */}
      <DashboardConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        config={config}
        onSave={handleSaveConfig}
      />

      {/* ── Granular Deep Dive Drawer / Modal ── */}
      <DashboardDeepDiveModal
        isOpen={deepDiveState.isOpen}
        onClose={() => setDeepDiveState((prev) => ({ ...prev, isOpen: false }))}
        initialMetric={deepDiveState.initialMetric}
      />
    </div>
  );
}
