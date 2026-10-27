import { createContext } from "react";
import type { ShiftDTO } from "../types/types";
import type { useWarehouseDashboardData } from "../hooks/useWarehouseDashboardData";
import type {
  StockItemChartEntry,
  WarehouseSummaryCardData,
  WarehouseSummaryStats,
} from "../components/dashboard/types";

export interface WarehouseDashboardContextValue {
  data: ReturnType<typeof useWarehouseDashboardData>["data"];
  loading: boolean;
  summaryStats: WarehouseSummaryStats | null | undefined;
  summaryCard: WarehouseSummaryCardData | null | undefined;
  topStockItems: StockItemChartEntry[];
  lowestStockItems: StockItemChartEntry[];
  shiftData: ShiftDTO[];
  outletIds: string[];
}

export const WarehouseDashboardContext =
  createContext<WarehouseDashboardContextValue | null>(null);
