import { useContext } from "react";
import {
  WarehouseDashboardContext,
  type WarehouseDashboardContextValue,
} from "./WarehouseDashboardContext";

export function useWarehouseDashboardContext(): WarehouseDashboardContextValue {
  const ctx = useContext(WarehouseDashboardContext);
  if (!ctx) {
    throw new Error(
      "Warehouse dashboard components must be used inside WarehouseDashboardProvider"
    );
  }
  return ctx;
}
