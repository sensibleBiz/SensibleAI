import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import type { ShiftDTO } from "../types/types";
import { productApi, type PostgresWarehouseStockDTO } from "@/features/products";
import { RootState } from "@/app/store";
import type {
  WarehouseSummaryStats,
  WarehouseSummaryCardData,
  StockItemChartEntry,
} from "../components/dashboard/types";

const emptySummaryStats: WarehouseSummaryStats = {
  totalSale: 0,
  totalUpiSale: 0,
  cashInHand: 0,
};

const emptySummaryCard: WarehouseSummaryCardData = {
  totalTax: 0,
  refundAmt: 0,
  noOfBills: 0,
  openingBalance: 0,
  extraDlvrCharges: 0,
};

const aggregateStock = (
  stock: PostgresWarehouseStockDTO[],
): { topStockItems: StockItemChartEntry[]; lowestStockItems: StockItemChartEntry[] } => {
  const byProduct = new Map<string, StockItemChartEntry>();
  for (const item of stock) {
    const current = byProduct.get(item.productId);
    byProduct.set(item.productId, {
      name: item.productName,
      quantity: (current?.quantity ?? 0) + item.quantity,
    });
  }
  const sorted = [...byProduct.values()].sort((left, right) => right.quantity - left.quantity);
  return {
    topStockItems: sorted.slice(0, 5),
    lowestStockItems: [...sorted].reverse().slice(0, 5),
  };
};

export function useWarehouseDashboardData() {
  const postgresOutlets = useSelector(
    (state: RootState) => state.auth.postgresAccess?.outlets,
  );
  const outletIds = useMemo(
    () => postgresOutlets?.map((outlet) => outlet.id) ?? [],
    [postgresOutlets],
  );
  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<PostgresWarehouseStockDTO[]>([]);

  useEffect(() => {
    if (outletIds.length === 0) {
      setStock([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    void Promise.all(
      outletIds.map((outletId) =>
        productApi.listStock({ outletId }, controller.signal),
      ),
    )
      .then((results) => setStock(results.flat()))
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.error("[useWarehouseDashboardData] PostgreSQL stock fetch failed:", error);
          setStock([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [outletIds]);

  const stockItems = useMemo(() => aggregateStock(stock), [stock]);
  const shiftData = useMemo<ShiftDTO[]>(() => [], []);

  return useMemo(
    () => ({
      data: {
        summaryStats: emptySummaryStats,
        summaryCard: emptySummaryCard,
        ...stockItems,
      },
      loading,
      summaryStats: emptySummaryStats,
      summaryCard: emptySummaryCard,
      topStockItems: stockItems.topStockItems,
      lowestStockItems: stockItems.lowestStockItems,
      shiftData,
      outletIds,
    }),
    [loading, outletIds, shiftData, stockItems],
  );
}
