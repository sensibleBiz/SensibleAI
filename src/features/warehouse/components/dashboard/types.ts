/** Top-level stats: Total Sale, Total UPI Sale, Cash In Hand */
export interface WarehouseSummaryStats {
  totalSale: number;
  totalUpiSale: number;
  cashInHand: number;
}

/** Summary card: Tax, Refund, Bills, Opening Balance, Extra/Dlvr Charges */
export interface WarehouseSummaryCardData {
  totalTax: number;
  refundAmt: number;
  noOfBills: number;
  openingBalance: number;
  extraDlvrCharges: number;
}

/** Item for stock bar chart (top 5 / lowest 5) */
export interface StockItemChartEntry {
  name: string;
  quantity: number;
  value?: number;
}

/** Sales chart data point */
export interface SalesChartDataPoint {
  date: string;
  quantity: number;
  value: number;
}

export type SalesTimeframe = "thisWeek" | "thisMonth" | "thisYear";
export type SalesChartMode = "quantity" | "value";

export interface WarehouseDashboardData {
  summaryStats: WarehouseSummaryStats;
  summaryCard: WarehouseSummaryCardData;
  topStockItems: StockItemChartEntry[];
  lowestStockItems: StockItemChartEntry[];
  salesChartData: SalesChartDataPoint[];
}
