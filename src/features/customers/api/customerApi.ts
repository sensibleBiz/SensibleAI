import type { CustomerRecord } from "../types/types";
import type { LeadsManagement } from "@/features/leads";
import { apiRequest } from "@/shared/api/apiClient";

export interface CustomerSearchResponse {
  items: CustomerRecord[];
  existingEnquiries: LeadsManagement[];
}

export interface CustomerMatchResponse {
  items: CustomerRecord[];
  existingEnquiries: LeadsManagement[];
}

export interface CustomerEnquiryPage {
  customer: CustomerRecord;
  items: LeadsManagement[];
  nextCursor: string | null;
}

export interface CustomerMatchInput {
  businessName?: string;
  email?: string;
  mobile?: string;
}

export interface CustomerCreateInput {
  outletId: string;
  customerName: string;
  businessName?: string;
  mobile?: string;
  email?: string;
  businessType?: string;
  area?: string;
  city?: string;
  state?: string;
  priority?: string;
  source?: string;
}

export interface CustomerUpdateInput extends Partial<Omit<CustomerCreateInput, "outletId">> {
  outletId: string;
  status?: "ACTIVE" | "INACTIVE";
}

export interface CustomerMutationResponse {
  customer: CustomerRecord;
  created?: boolean;
}

const postgresAuth = { authMode: "postgres" as const };

export const customerApi = {
  search(
    outletId: string,
    query: string,
    signal?: AbortSignal,
    limit = 10,
  ) {
    const searchParams = new URLSearchParams({
      outletId,
      query,
      limit: String(limit),
    });
    return apiRequest<CustomerSearchResponse>(
      `/api/v1/customers/search?${searchParams.toString()}`,
      { ...postgresAuth, signal },
    );
  },

  match(
    outletId: string,
    input: CustomerMatchInput,
    signal?: AbortSignal,
  ) {
    const searchParams = new URLSearchParams({ outletId });
    for (const [key, value] of Object.entries(input)) {
      if (value?.trim()) searchParams.set(key, value.trim());
    }
    return apiRequest<CustomerMatchResponse>(
      "/api/v1/customers/match?" + searchParams.toString(),
      { ...postgresAuth, signal },
    );
  },

  get(outletId: string, customerId: string, signal?: AbortSignal) {
    const searchParams = new URLSearchParams({ outletId });
    return apiRequest<CustomerRecord>(
      `/api/v1/customers/${encodeURIComponent(customerId)}?${searchParams.toString()}`,
      { ...postgresAuth, signal },
    );
  },

  getEnquiries(
    outletId: string,
    customerId: string,
    options: { cursor?: string; limit?: number } = {},
    signal?: AbortSignal,
  ) {
    const searchParams = new URLSearchParams({ outletId });
    if (options.cursor) searchParams.set("cursor", options.cursor);
    if (options.limit) searchParams.set("limit", String(options.limit));
    return apiRequest<CustomerEnquiryPage>(
      `/api/v1/customers/${encodeURIComponent(customerId)}/enquiries?${searchParams.toString()}`,
      { ...postgresAuth, signal },
    );
  },

  create(input: CustomerCreateInput, signal?: AbortSignal) {
    return apiRequest<CustomerMutationResponse>("/api/v1/customers", {
      ...postgresAuth,
      method: "POST",
      body: input,
      signal,
    });
  },

  update(customerId: string, input: CustomerUpdateInput, signal?: AbortSignal) {
    return apiRequest<CustomerRecord>(
      `/api/v1/customers/${encodeURIComponent(customerId)}`,
      {
        ...postgresAuth,
        method: "PATCH",
        body: input,
        signal,
      },
    );
  },
};
