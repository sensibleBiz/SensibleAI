import { apiRequest } from "@/shared/api/apiClient";
import type {
  CreateRateCardBody,
  InitiateTopUpResult,
  RateCardRecord,
  UpdateRateCardBody,
  VerifyTopUpResult,
  WalletRecord,
  WalletTransactionRecord,
} from "../types/billing.types";

export const billingApi = {
  getWallet(outletId: string, signal?: AbortSignal): Promise<{ wallet: WalletRecord }> {
    return apiRequest<{ wallet: WalletRecord }>(
      `/api/v1/billing/wallet?outletId=${encodeURIComponent(outletId)}`,
      { signal },
    );
  },

  getTransactions(
    outletId: string,
    limit = 50,
    offset = 0,
    signal?: AbortSignal,
  ): Promise<{ transactions: WalletTransactionRecord[]; limit: number; offset: number }> {
    return apiRequest(
      `/api/v1/billing/transactions?outletId=${encodeURIComponent(outletId)}&limit=${limit}&offset=${offset}`,
      { signal },
    );
  },

  provisionWallet(outletId: string, currency?: string): Promise<{ wallet: WalletRecord }> {
    return apiRequest<{ wallet: WalletRecord }>("/api/v1/billing/wallet", {
      method: "POST",
      body: { outletId, ...(currency !== undefined ? { currency } : {}) },
    });
  },

  initiateTopUp(
    outletId: string,
    amountInr: string,
    idempotencyKey: string,
  ): Promise<InitiateTopUpResult> {
    return apiRequest<InitiateTopUpResult>("/api/v1/billing/topup", {
      method: "POST",
      body: { outletId, amountInr, idempotencyKey },
    });
  },

  getTopUpStatus(
    orderId: string,
    outletId: string,
    signal?: AbortSignal,
  ): Promise<VerifyTopUpResult> {
    return apiRequest<VerifyTopUpResult>(
      `/api/v1/billing/topup/${encodeURIComponent(orderId)}/status?outletId=${encodeURIComponent(outletId)}`,
      { signal },
    );
  },

  // ─── Rate Card Admin (Phase 9) ─────────────────────────────────────────

  listRateCards(
    params: { serviceType?: string; activeOnly?: boolean; limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ): Promise<{ rows: RateCardRecord[]; total: number; limit: number; offset: number }> {
    const query = new URLSearchParams();
    if (params.serviceType) query.set("serviceType", params.serviceType);
    if (params.activeOnly !== undefined) query.set("activeOnly", String(params.activeOnly));
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.offset !== undefined) query.set("offset", String(params.offset));
    const qs = query.toString();
    return apiRequest(`/api/v1/billing/rate-cards${qs ? `?${qs}` : ""}`, { signal });
  },

  getRateCard(id: string, signal?: AbortSignal): Promise<{ rateCard: RateCardRecord }> {
    return apiRequest(`/api/v1/billing/rate-cards/${encodeURIComponent(id)}`, { signal });
  },

  createRateCard(body: CreateRateCardBody): Promise<{ rateCard: RateCardRecord }> {
    return apiRequest("/api/v1/billing/rate-cards", { method: "POST", body });
  },

  updateRateCard(id: string, body: UpdateRateCardBody): Promise<{ rateCard: RateCardRecord }> {
    return apiRequest(`/api/v1/billing/rate-cards/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
    });
  },

  deactivateRateCard(id: string): Promise<{ rateCard: RateCardRecord; coverageGap: boolean }> {
    return apiRequest(`/api/v1/billing/rate-cards/${encodeURIComponent(id)}/deactivate`, {
      method: "POST",
    });
  },
};
