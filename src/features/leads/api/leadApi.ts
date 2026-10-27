import type { CallLogEntry } from "@/features/activities";
import type { LeadsManagement } from "../types/types";
import { ApiError, apiRequest } from "@/shared/api/apiClient";
import { sessionDataCache } from "@/shared/api/sessionDataCache";
import { postgresSession } from "@/features/auth";

export interface LeadListFilters {
  outletId: string;
  startDate?: number | string;
  endDate?: number | string;
  stage?: string;
  status?: string;
  assignedTo?: string;
  unassigned?: boolean;
  source?: string;
  sourceKey?: string;
  enquiryType?: "CUSTOMER_ENQUIRY";
  search?: string;
  limit?: number;
  cursor?: string;
}

export interface LeadListResponse {
  items: LeadsManagement[];
  nextCursor: string | null;
}

export type RepeatedEnquiryMatch =
  | "MOBILE"
  | "EMAIL"
  | "BUSINESS_PROFILE"
  | "BUSINESS_NAME";

export interface RepeatedEnquiryFilters {
  outletId: string;
  startDate: number | string;
  endDate: number | string;
  assignedTo?: string;
  source?: string;
  enquiryType?: "CUSTOMER_ENQUIRY";
  search?: string;
  limit?: number;
}

export interface RepeatedEnquiryGroup {
  id: string;
  latestCreatedDate: number;
  matchedOn: RepeatedEnquiryMatch[];
  enquiries: LeadsManagement[];
}

export interface RepeatedEnquiryResponse {
  groups: RepeatedEnquiryGroup[];
  totalGroups: number;
  totalEnquiries: number;
  truncated: boolean;
}

export interface LeadRingingFilters {
  outletId: string;
  startDate: number | string;
  endDate: number | string;
  limit?: number;
  cursor?: string;
}

export interface LeadRingingResponse {
  id: string;
  status: string;
  updatedDate: number;
}

export interface CreateLeadInput {
  adId?: string;
  area?: string;
  businessName?: string;
  businessType?: string;
  city?: string;
  customerId?: string | null;
  enquiryType?: "NEW_LEAD" | "CUSTOMER_ENQUIRY";
  customerName: string;
  email?: string;
  mobile: string;
  priority?: string;
  requirement: string;
  source?: string;
  state?: string;
}

export interface CreateLeadResponse {
  id: string;
}

export interface BulkLeadImportItem {
  rowNumber: number;
  externalId: string;
  adId: string;
  originalCreatedAt: number;
  customerName: string;
  mobile: string;
  city: string;
  source: "Facebook" | "Instagram" | "Other";
  requirement: string;
  leadCampaign: string;
  inboxUrl: string;
}

export interface BulkLeadImportResponse {
  created: number;
  skippedDuplicates: number;
}

export interface UpdateLeadInput {
  area?: string;
  businessName?: string;
  businessType?: string;
  city?: string;
  email?: string;
  mobile?: string;
  priority?: string;
  requirement?: string;
  source?: string;
  state?: string;
  username?: string;
  customFields?: Record<string, unknown>;
}

export interface LeadWorkflowInput {
  stage?: string;
  comments: string;
  leadTag: string[];
}

export interface AssignLeadInput extends LeadWorkflowInput {
  assignedTo: string;
}

export interface LeadWorkflowResponse {
  id: string;
  assignedBy?: string;
  assignedTo?: string;
  assignedHistory?: LeadsManagement["assignedHistory"];
  customerId?: string | null;
  customerType?: "PROSPECT" | "CUSTOMER";
  enquiryType?: "NEW_LEAD" | "CUSTOMER_ENQUIRY";
  stage?: string;
  updatedDate: number;
}

export interface LeadWhatsAppShareResponse {
  id: string;
  shareToken: string;
  whatsappShareCount: number;
}

export interface SemanticSearchResult {
  id: string;
  businessName: string | null;
  stage: string;
  city: string | null;
  assignedTo: string | null;
  similarity: number;
}

export type LeadReportSource =
  | "Indiamart"
  | "JustDail"
  | "Facebook"
  | "Instagram"
  | "Google"
  | "Website"
  | "Other";

export interface LeadSourceStats {
  total: number;
  new: number;
  follow: number;
  completed: number;
  lost: number;
}

export interface LeadSourceReportResponse {
  sources: Record<LeadReportSource, LeadSourceStats>;
}

export interface LeadSourceReportFilters {
  outletId: string;
  startDate: number | string;
  endDate: number | string;
}

export interface LeadCityStateReportRow {
  state: string;
  city: string;
  assigned: number;
  new: number;
  followup: number;
  completed: number;
  lost: number;
  disqual: number;
  total: number;
}

export interface LeadCityStateReportResponse {
  rows: LeadCityStateReportRow[];
}

export type LeadCityStateReportFilters = LeadSourceReportFilters;

export interface LeadFunnelCounts {
  byStage?: Record<string, number>;
  totalLeads: number;
  newLeads: number;
  assigned: number;
  followUp: number;
  closedWon: number;
  lost: number;
  disqualified: number;
}

export interface LeadFunnelSourceStat {
  key: string;
  total: number;
  active: number;
  won: number;
  lost: number;
  disqualified: number;
  percent: number;
}

export interface LeadFunnelReportResponse {
  counts: LeadFunnelCounts;
  sources: LeadFunnelSourceStat[];
}

export interface LeadFunnelReportFilters {
  outletId: string;
  startDate: number | string;
  endDate: number | string;
  assignedTo?: string;
  source?: string;
}

export interface LeadAnalyticsSourceCount {
  source: string;
  count: number;
}

export interface LeadAnalyticsTrendPoint {
  date: string;
  leads: number;
}

export interface LeadEmployeeReportStats {
  total: number;
  assigned: number;
  followup: number;
  completed: number;
  lost: number;
}

export interface LeadAnalyticsResponse {
  counts: LeadFunnelCounts;
  sources: LeadAnalyticsSourceCount[];
  trend: LeadAnalyticsTrendPoint[];
}

export interface LeadEmployeeReportResponse {
  employees: Record<string, LeadEmployeeReportStats>;
}

export interface LeadLookupFilters {
  outletId: string;
  mobiles: string[];
}

export interface LeadLookupResponse {
  items: LeadsManagement[];
}

export interface LeadActivityItem {
  id: string;
  assignedTo: string;
  createdDate: { seconds: number; nanoseconds: number } | null;
  createdDateInMili?: number;
  createdDateInMill: number;
  description: string;
  leadName: string;
  leadMobile: string;
  leadRequirement: string;
  leadRefId: string;
  mode: string;
  priority: string;
  productDealerPrice: number;
  productId: string | null;
  productMrpPrice: number;
  productName: string | null;
  productType: string;
  scheduledDate: number;
  scheduledTime: number;
  status: string;
  type: string;
}

export interface LeadActivityPage {
  items: LeadActivityItem[];
  nextCursor: string | null;
}

export interface LeadCallPage {
  items: LeadCallItem[];
  nextCursor: string | null;
}

export type LeadCallItem = Pick<
  CallLogEntry,
  | "id"
  | "direction"
  | "durationSeconds"
  | "number"
  | "receiverMobileNo"
  | "receiverName"
  | "timestamp"
>;

export interface ActivitySummary {
  total: number;
  done: number;
  pending: number;
  overdue: number;
}

export interface MonthlyActivityPage extends LeadActivityPage {
  summary: ActivitySummary | null;
}

export interface CreateActivityInput {
  assignedTo: string;
  description: string;
  mode: string;
  priority: string;
  productDealerPrice: number;
  productId: string | null;
  productMrpPrice: number;
  productName: string | null;
  productType: string;
  scheduledDate: number;
  type: string;
  callLater?: boolean;
}

export interface MonthlyActivityFilters {
  outletId: string;
  startDate: number;
  endDate: number;
  assignedTo?: string;
  mode?: string;
  search?: string;
  status?: string;
  type?: string;
  limit?: number;
  cursor?: string;
}

export interface UpdateActivityInput {
  assignedTo?: string;
  scheduledDate?: number;
  status?: "PENDING" | "DONE";
}

export interface UpdateActivityResponse extends UpdateActivityInput {
  id: string;
}

const postgresOwnedAuthOptions = () =>
  postgresSession.getAccessToken()
    ? { authMode: "postgres" as const }
    : {};

const appendQueryValue = (
  searchParams: URLSearchParams,
  key: string,
  value: string | number | undefined,
) => {
  if (value !== undefined && value !== "") {
    searchParams.set(key, String(value));
  }
};

interface CachedLeadList {
  response: LeadListResponse;
}

const MAX_CACHED_LEADS_PER_QUERY = 500;
const leadListCachePrefix = (outletId: string) =>
  `lead-list:${outletId}:`;

const leadListCacheKey = (filters: LeadListFilters) =>
  `${leadListCachePrefix(filters.outletId)}${JSON.stringify([
    filters.startDate ?? "",
    filters.endDate ?? "",
    filters.stage ?? "",
    filters.status ?? "",
    filters.assignedTo ?? "",
    filters.unassigned ?? false,
    filters.source ?? "",
    filters.sourceKey ?? "",
    filters.enquiryType ?? "",
    filters.search ?? "",
    filters.limit ?? 30,
    filters.cursor ?? "",
  ])}`;

const requestLeadList = (
  filters: LeadListFilters,
  signal?: AbortSignal,
) => {
  const searchParams = new URLSearchParams();
  appendQueryValue(searchParams, "outletId", filters.outletId);
  appendQueryValue(searchParams, "startDate", filters.startDate);
  appendQueryValue(searchParams, "endDate", filters.endDate);
  appendQueryValue(searchParams, "stage", filters.stage);
  appendQueryValue(searchParams, "status", filters.status);
  appendQueryValue(searchParams, "assignedTo", filters.assignedTo);
  appendQueryValue(
    searchParams,
    "unassigned",
    filters.unassigned ? "true" : undefined,
  );
  appendQueryValue(searchParams, "source", filters.source);
  appendQueryValue(searchParams, "sourceKey", filters.sourceKey);
  appendQueryValue(searchParams, "enquiryType", filters.enquiryType);
  appendQueryValue(searchParams, "search", filters.search);
  appendQueryValue(searchParams, "limit", filters.limit);
  appendQueryValue(searchParams, "cursor", filters.cursor);

  return apiRequest<LeadListResponse>(
    `/api/v1/leads?${searchParams.toString()}`,
    { signal, ...postgresOwnedAuthOptions() },
  );
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new DOMException("The request was aborted", "AbortError");
  }
};

const readDateBoundary = (value?: number | string) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return 0;
  const parsed = /^\d+$/.test(value.trim())
    ? Number(value)
    : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const mergeLeadLists = (
  cached: LeadListResponse,
  changedItems: LeadsManagement[],
): LeadListResponse => {
  const byId = new Map(cached.items.map((lead) => [lead.id, lead]));
  changedItems.forEach((lead) => byId.set(lead.id, lead));
  const items = [...byId.values()]
    .sort(
      (left, right) =>
        (right.createdDate ?? 0) - (left.createdDate ?? 0) ||
        right.id.localeCompare(left.id),
    )
    .slice(0, MAX_CACHED_LEADS_PER_QUERY);
  return { items, nextCursor: cached.nextCursor };
};

const getSessionCachedLeads = async (
  filters: LeadListFilters,
  signal?: AbortSignal,
): Promise<LeadListResponse> => {
  throwIfAborted(signal);
  const key = leadListCacheKey(filters);
  const cached = sessionDataCache.get<CachedLeadList>(key);

  if (filters.cursor) {
    if (cached) return cached.response;
    const response = await requestLeadList(filters, signal);
    sessionDataCache.set<CachedLeadList>(key, { response });
    return response;
  }

  if (!cached || cached.response.items.length === 0) {
    const response = await requestLeadList(filters, signal);
    sessionDataCache.set<CachedLeadList>(key, { response });
    return response;
  }

  const newestCreatedDate = Math.max(
    ...cached.response.items.map((lead) => lead.createdDate || 0),
  );
  if (newestCreatedDate <= 0) return cached.response;

  const changedItems: LeadsManagement[] = [];
  let cursor: string | undefined;
  let pageCount = 0;
  try {
    do {
      throwIfAborted(signal);
      const response = await requestLeadList(
        {
          ...filters,
          startDate: Math.max(
            readDateBoundary(filters.startDate),
            newestCreatedDate,
          ),
          limit: 100,
          cursor,
        },
        signal,
      );
      changedItems.push(...response.items);
      cursor = response.nextCursor ?? undefined;
      pageCount += 1;
    } while (cursor && pageCount < 50);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      throw error;
    }
    return cached.response;
  }

  // Do not advance the cache when an unusually large delta could not be read
  // completely. The next refresh will retry from the same safe watermark.
  if (cursor) return cached.response;

  const response = mergeLeadLists(cached.response, changedItems);
  sessionDataCache.set<CachedLeadList>(key, { response });
  return response;
};

export const invalidateLeadSessionCache = (outletId: string) => {
  const prefix = leadListCachePrefix(outletId);
  sessionDataCache.deleteWhere((key) => key.startsWith(prefix));
};

export const leadApi = {
  async createLead(outletId: string, input: CreateLeadInput) {
    const response = await apiRequest<CreateLeadResponse>("/api/v1/leads", {
      method: "POST",
      body: { ...input, outletId },
      ...postgresOwnedAuthOptions(),
    });
    return response;
  },

  getLead(outletId: string, leadId: string, signal?: AbortSignal) {
    const searchParams = new URLSearchParams({ outletId });
    return apiRequest<LeadsManagement>(
      `/api/v1/leads/${encodeURIComponent(leadId)}?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  async updateLead(outletId: string, leadId: string, input: UpdateLeadInput) {
    const response = await apiRequest<LeadWorkflowResponse>(
      `/api/v1/leads/${encodeURIComponent(leadId)}`,
      {
        method: "PATCH",
        body: { ...input, outletId },
        ...postgresOwnedAuthOptions(),
      },
    );
    invalidateLeadSessionCache(outletId);
    return response;
  },

  async createBulkLeads(outletId: string, leads: BulkLeadImportItem[]) {
    const response = await apiRequest<BulkLeadImportResponse>(
      "/api/v1/leads/bulk",
      {
        method: "POST",
        body: { outletId, leads },
        ...postgresOwnedAuthOptions(),
      },
    );
    invalidateLeadSessionCache(outletId);
    return response;
  },

  getSharedLead(outletId: string, shareToken: string, signal?: AbortSignal) {
    const searchParams = new URLSearchParams({ outletId });
    return apiRequest<LeadsManagement>(
      `/api/v1/leads/share/${encodeURIComponent(shareToken)}?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  async recordWhatsAppShare(outletId: string, leadId: string) {
    const response = await apiRequest<LeadWhatsAppShareResponse>(
      `/api/v1/leads/${encodeURIComponent(leadId)}/whatsapp-share`,
      { method: "POST", body: { outletId }, ...postgresOwnedAuthOptions() },
    );
    invalidateLeadSessionCache(outletId);
    return response;
  },

  async assignLead(outletId: string, leadId: string, input: AssignLeadInput) {
    const response = await apiRequest<LeadWorkflowResponse>(
      `/api/v1/leads/${encodeURIComponent(leadId)}/assign`,
      {
        method: "POST",
        body: { ...input, outletId },
        ...postgresOwnedAuthOptions(),
      },
    );
    invalidateLeadSessionCache(outletId);
    return response;
  },

  async changeStage(outletId: string, leadId: string, input: LeadWorkflowInput) {
    const response = await apiRequest<LeadWorkflowResponse>(
      `/api/v1/leads/${encodeURIComponent(leadId)}/stage`,
      {
        method: "POST",
        body: { ...input, outletId },
        ...postgresOwnedAuthOptions(),
      },
    );
    invalidateLeadSessionCache(outletId);
    return response;
  },

  getRingingLeads(filters: LeadRingingFilters, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    appendQueryValue(searchParams, "outletId", filters.outletId);
    appendQueryValue(searchParams, "startDate", filters.startDate);
    appendQueryValue(searchParams, "endDate", filters.endDate);
    appendQueryValue(searchParams, "limit", filters.limit);
    appendQueryValue(searchParams, "cursor", filters.cursor);

    return apiRequest<LeadListResponse>(
      `/api/v1/leads/ringing?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  async setRinging(outletId: string, leadId: string, ringing: boolean) {
    const response = await apiRequest<LeadRingingResponse>(
      `/api/v1/leads/${encodeURIComponent(leadId)}/ringing`,
      { method: "POST", body: { outletId, ringing }, ...postgresOwnedAuthOptions() },
    );
    invalidateLeadSessionCache(outletId);
    return response;
  },

  getDashboard(filters: LeadSourceReportFilters, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    appendQueryValue(searchParams, "outletId", filters.outletId);
    appendQueryValue(searchParams, "startDate", filters.startDate);
    appendQueryValue(searchParams, "endDate", filters.endDate);

    return apiRequest<LeadAnalyticsResponse>(
      `/api/v1/leads/dashboard?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  getEmployeeReport(filters: LeadSourceReportFilters, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    appendQueryValue(searchParams, "outletId", filters.outletId);
    appendQueryValue(searchParams, "startDate", filters.startDate);
    appendQueryValue(searchParams, "endDate", filters.endDate);

    return apiRequest<LeadEmployeeReportResponse>(
      `/api/v1/leads/reports/employees?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  getSourceReport(
    filters: LeadSourceReportFilters,
    signal?: AbortSignal,
  ) {
    const searchParams = new URLSearchParams();
    appendQueryValue(searchParams, "outletId", filters.outletId);
    appendQueryValue(searchParams, "startDate", filters.startDate);
    appendQueryValue(searchParams, "endDate", filters.endDate);

    return apiRequest<LeadSourceReportResponse>(
      `/api/v1/leads/reports/source?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  getCityStateReport(
    filters: LeadCityStateReportFilters,
    signal?: AbortSignal,
  ) {
    const searchParams = new URLSearchParams();
    appendQueryValue(searchParams, "outletId", filters.outletId);
    appendQueryValue(searchParams, "startDate", filters.startDate);
    appendQueryValue(searchParams, "endDate", filters.endDate);

    return apiRequest<LeadCityStateReportResponse>(
      `/api/v1/leads/reports/city-state?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  getFunnelReport(
    filters: LeadFunnelReportFilters,
    signal?: AbortSignal,
  ) {
    const searchParams = new URLSearchParams();
    appendQueryValue(searchParams, "outletId", filters.outletId);
    appendQueryValue(searchParams, "startDate", filters.startDate);
    appendQueryValue(searchParams, "endDate", filters.endDate);
    appendQueryValue(searchParams, "assignedTo", filters.assignedTo);

    return apiRequest<LeadFunnelReportResponse>(
      `/api/v1/leads/reports/funnel?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  getStageCounts(filters: LeadFunnelReportFilters, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    appendQueryValue(searchParams, "outletId", filters.outletId);
    appendQueryValue(searchParams, "startDate", filters.startDate);
    appendQueryValue(searchParams, "endDate", filters.endDate);
    appendQueryValue(searchParams, "assignedTo", filters.assignedTo);
    appendQueryValue(searchParams, "source", filters.source);

    return apiRequest<LeadFunnelCounts>(
      `/api/v1/leads/reports/stage-counts?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  getRepeatedEnquiries(
    filters: RepeatedEnquiryFilters,
    signal?: AbortSignal,
  ) {
    const searchParams = new URLSearchParams();
    appendQueryValue(searchParams, "outletId", filters.outletId);
    appendQueryValue(searchParams, "startDate", filters.startDate);
    appendQueryValue(searchParams, "endDate", filters.endDate);
    appendQueryValue(searchParams, "assignedTo", filters.assignedTo);
    appendQueryValue(searchParams, "source", filters.source);
    appendQueryValue(searchParams, "enquiryType", filters.enquiryType);
    appendQueryValue(searchParams, "search", filters.search);
    appendQueryValue(searchParams, "limit", filters.limit);

    return apiRequest<RepeatedEnquiryResponse>(
      `/api/v1/leads/repeated-enquiries?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  lookupByMobiles(filters: LeadLookupFilters, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    appendQueryValue(searchParams, "outletId", filters.outletId);
    appendQueryValue(searchParams, "mobiles", filters.mobiles.join(","));

    return apiRequest<LeadLookupResponse>(
      `/api/v1/leads/lookup?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  getActivities(
    outletId: string,
    leadId: string,
    options: { limit?: number; cursor?: string } = {},
    signal?: AbortSignal,
  ) {
    const searchParams = new URLSearchParams({ outletId });
    appendQueryValue(searchParams, "limit", options.limit);
    appendQueryValue(searchParams, "cursor", options.cursor);
    return apiRequest<LeadActivityPage>(
      `/api/v1/leads/${encodeURIComponent(leadId)}/activities?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  getCalls(
    outletId: string,
    leadId: string,
    options: { limit?: number; cursor?: string } = {},
    signal?: AbortSignal,
  ) {
    const searchParams = new URLSearchParams({ outletId });
    appendQueryValue(searchParams, "limit", options.limit);
    appendQueryValue(searchParams, "cursor", options.cursor);
    return apiRequest<LeadCallPage>(
      `/api/v1/leads/${encodeURIComponent(leadId)}/calls?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  createActivity(
    outletId: string,
    leadId: string,
    input: CreateActivityInput,
  ) {
    return apiRequest<LeadActivityItem>(
      `/api/v1/leads/${encodeURIComponent(leadId)}/activities`,
      { method: "POST", body: { ...input, outletId }, ...postgresOwnedAuthOptions() },
    );
  },

  getMonthlyActivities(
    filters: MonthlyActivityFilters,
    signal?: AbortSignal,
  ) {
    const searchParams = new URLSearchParams();
    appendQueryValue(searchParams, "outletId", filters.outletId);
    appendQueryValue(searchParams, "startDate", filters.startDate);
    appendQueryValue(searchParams, "endDate", filters.endDate);
    appendQueryValue(searchParams, "assignedTo", filters.assignedTo);
    appendQueryValue(searchParams, "mode", filters.mode);
    appendQueryValue(searchParams, "search", filters.search);
    appendQueryValue(searchParams, "status", filters.status);
    appendQueryValue(searchParams, "type", filters.type);
    appendQueryValue(searchParams, "limit", filters.limit);
    appendQueryValue(searchParams, "cursor", filters.cursor);
    return apiRequest<MonthlyActivityPage>(
      `/api/v1/activities?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  updateActivity(
    outletId: string,
    activityId: string,
    input: UpdateActivityInput,
  ) {
    return apiRequest<UpdateActivityResponse>(
      `/api/v1/activities/${encodeURIComponent(activityId)}`,
      { method: "PATCH", body: { ...input, outletId }, ...postgresOwnedAuthOptions() },
    );
  },

  deleteActivity(outletId: string, activityId: string) {
    const searchParams = new URLSearchParams({ outletId });
    return apiRequest<{ id: string }>(
      `/api/v1/activities/${encodeURIComponent(activityId)}?${searchParams.toString()}`,
      { method: "DELETE", ...postgresOwnedAuthOptions() },
    );
  },

  getLeads(filters: LeadListFilters, signal?: AbortSignal) {
    return getSessionCachedLeads(filters, signal);
  },

  semanticSearch(outletId: string, query: string, limit?: number, signal?: AbortSignal) {
    return apiRequest<SemanticSearchResult[]>("/api/v1/leads/semantic-search", {
      method: "POST",
      body: { outletId, query, limit },
      signal,
      ...postgresOwnedAuthOptions(),
    });
  },
};
