import type { Outlet } from "../types/types";
import type { AnnualPlanFeature } from "../utils/annualPlanCatalog";
import { apiRequest } from "@/shared/api/apiClient";

export interface OutletSubscriptionDTO {
  id: string;
  outletId: string;
  planTier: "trial" | "silver" | "gold" | "platinum";
  status: "trial" | "active" | "expired" | "cancelled";
  amount: number;
  permittedUsers: number;
  startsAt: number;
  renewsAt: number;
  externalTransactionId: string | null;
}

const auth = { authMode: "postgres" as const };

export const outletApi = {
  list() {
    return apiRequest<{ items: Outlet[] }>("/api/v1/outlets", auth);
  },
  get(outletId: string) {
    return apiRequest<{ outlet: Outlet; subscription: OutletSubscriptionDTO | null }>(
      `/api/v1/outlets/${encodeURIComponent(outletId)}`, auth,
    );
  },
  update(outletId: string, input: Partial<Pick<Outlet, "name" | "branch" | "address" | "city" | "state">>) {
    return apiRequest<Outlet>(`/api/v1/outlets/${encodeURIComponent(outletId)}`, {
      ...auth, method: "PATCH", body: input,
    });
  },
  getPlanCatalog() {
    return apiRequest<{ features: AnnualPlanFeature[] }>("/api/v1/outlets/plans/catalog", auth);
  },
  savePlanCatalog(features: AnnualPlanFeature[]) {
    return apiRequest<{ features: AnnualPlanFeature[] }>("/api/v1/outlets/plans/catalog", {
      ...auth, method: "PUT", body: { features },
    });
  },
};
