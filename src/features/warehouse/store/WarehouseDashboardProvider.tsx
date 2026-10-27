import type { ReactNode } from "react";
import { useWarehouseDashboardData } from "../hooks/useWarehouseDashboardData";
import { WarehouseDashboardContext } from "./WarehouseDashboardContext";

interface WarehouseDashboardProviderProps {
  children: ReactNode;
}

export function WarehouseDashboardProvider({
  children,
}: WarehouseDashboardProviderProps) {
  const value = useWarehouseDashboardData();

  return (
    <WarehouseDashboardContext.Provider value={value}>
      {children}
    </WarehouseDashboardContext.Provider>
  );
}
