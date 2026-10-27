import type { ComponentType } from "react";
import {
  SummaryStatsCards,
  SummaryCard,
  StockItemsBarChart,
  SalesChart,
} from "./index";

/** Layout span: 24 = full width, 12 = half width. */
export type WidgetSpan = 24 | 12;

export interface WarehouseDashboardWidgetConfig {
  id: string;
  Component: ComponentType;
  span?: WidgetSpan;
  /** When true, widget can be hidden via dashboard settings (conditionally viewed). */
  optional?: boolean;
}

/**
 * Warehouse dashboard widgets in display order.
 * Reorder to change layout; add/remove for plug-and-play.
 */
export const WAREHOUSE_DASHBOARD_WIDGETS: WarehouseDashboardWidgetConfig[] = [
  { id: "summaryStats", Component: SummaryStatsCards, span: 24 },
  { id: "summaryCard", Component: SummaryCard, span: 24 },
  { id: "stockItemsBarChart", Component: StockItemsBarChart, span: 24 },
  { id: "salesChart", Component: SalesChart, span: 24 },
];
