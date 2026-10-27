import { apiRequest } from "@/shared/api/apiClient";
import type { IntegrationConfig } from "../types/types";
export type IntegrationInput = Omit<IntegrationConfig, "id" | "createdDate" | "modifiedDate">;
export type FacebookPageRecord = { key: string; id: string; pageId?: string; pageName?: string; name?: string; category?: string; isActive?: boolean; [key: string]: unknown };
export const integrationApi = {
  list: (outletId: string) => apiRequest<IntegrationConfig[]>(`/api/v1/integrations?outletId=${encodeURIComponent(outletId)}`),
  create: (input: IntegrationInput) => apiRequest<IntegrationConfig>("/api/v1/integrations", { method: "POST", body: input }),
  update: (id: string, input: Partial<IntegrationInput>) => apiRequest<IntegrationConfig>(`/api/v1/integrations/${encodeURIComponent(id)}`, { method: "PATCH", body: input }),
  delete: (outletId: string, id: string) => apiRequest<boolean>(`/api/v1/integrations/${encodeURIComponent(id)}?outletId=${encodeURIComponent(outletId)}`, { method: "DELETE" }),
  listFacebookPages: (outletId: string) => apiRequest<FacebookPageRecord[]>(`/api/v1/integrations/facebook/pages?outletId=${encodeURIComponent(outletId)}`),
  deleteFacebookPage: (outletId: string, id: string) => apiRequest<boolean>(`/api/v1/integrations/facebook/pages/${encodeURIComponent(id)}?outletId=${encodeURIComponent(outletId)}`, { method: "DELETE" }),
};
