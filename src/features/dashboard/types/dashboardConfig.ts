export type DashboardViewMode = "terminal" | "pipeline" | "sales_ops" | "ai_autopilot";

export type DisplayDensity = "compact" | "comfortable" | "minimal";

export type RefreshRateOption = 0 | 15 | 30 | 60 | 300; // in seconds (0 = manual)

export type WidgetKey =
  | "kpi_cards"
  | "momentum_chart"
  | "ai_insights"
  | "funnel_flow"
  | "top_movers"
  | "regional_heatmap"
  | "ai_agents"
  | "recent_wins"
  | "live_activity"
  | "rep_leaderboard"
  | "stalled_deals";

export interface DashboardConfig {
  defaultMode: DashboardViewMode;
  density: DisplayDensity;
  refreshRate: RefreshRateOption;
  targetPipelineCr: number;
  targetWinRatePct: number;
  activeWidgets: Record<WidgetKey, boolean>;
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  defaultMode: "terminal",
  density: "compact",
  refreshRate: 30,
  targetPipelineCr: 15.0,
  targetWinRatePct: 25.0,
  activeWidgets: {
    kpi_cards: true,
    momentum_chart: true,
    ai_insights: true,
    funnel_flow: true,
    top_movers: true,
    regional_heatmap: true,
    ai_agents: true,
    recent_wins: true,
    live_activity: true,
    rep_leaderboard: true,
    stalled_deals: true,
  },
};

export interface DeepDiveMetricInfo {
  metricId: string;
  title: string;
  currentValue: string;
  change: string;
  isPositive: boolean;
  benchmark: string;
  summary: string;
}

