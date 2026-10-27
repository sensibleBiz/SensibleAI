import { apiRequest } from "@/shared/api/apiClient";

export type EmployeeSalesTargetZone = "South" | "West" | "East" | "North" | "Subscriptions";

export interface EmployeeSalesTarget {
  id: string;
  outletId: string;
  zone: EmployeeSalesTargetZone;
  saleExecutive: string;
  saleExecutiveId?: string;
  decForecastNetSales: number;
  achieveNetSales: number;
  achievementPercentage: number;
  order: number;
  month: number;
  year: number;
  createdAt: number;
  updatedAt: number;
}

export interface EmployeeSalesTargetWrite {
  id?: string;
  zone: EmployeeSalesTargetZone;
  saleExecutive: string;
  saleExecutiveId?: string;
  decForecastNetSales: number;
  achieveNetSales: number;
  order: number;
}

const postgresAuth = () => ({ authMode: "postgres" as const });

export const employeeTargetApi = {
  async list(outletId: string, month: number, year: number, signal?: AbortSignal) {
    const query = new URLSearchParams({ outletId, month: String(month), year: String(year) });
    const result = await apiRequest<{ items: EmployeeSalesTarget[] }>(
      `/api/v1/leads/employee-targets?${query.toString()}`,
      { signal, ...postgresAuth() },
    );
    return result.items;
  },

  async sync(outletId: string, month: number, year: number, items: EmployeeSalesTargetWrite[]) {
    const result = await apiRequest<{ items: EmployeeSalesTarget[] }>(
      "/api/v1/leads/employee-targets/sync",
      { method: "POST", body: { outletId, month, year, items }, ...postgresAuth() },
    );
    return result.items;
  },

  async delete(outletId: string, targetId: string) {
    const query = new URLSearchParams({ outletId });
    return apiRequest<{ deleted: true }>(
      `/api/v1/leads/employee-targets/${encodeURIComponent(targetId)}?${query.toString()}`,
      { method: "DELETE", ...postgresAuth() },
    );
  },
};