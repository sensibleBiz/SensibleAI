export interface AssignedHistoryItem {
  assignTo: string;
  assignBy: string;
  assignAt: number;
}

export interface LeadListItem {
  id: string;
  customerId: string | null;
  customerType: "PROSPECT" | "CUSTOMER";
  enquiryType: "NEW_LEAD" | "CUSTOMER_ENQUIRY";
  assignedHistory?: AssignedHistoryItem[];
  area: string;
  assignedBy: string;
  assignedTo: string;
  businessName: string;
  businessType: string;
  city: string;
  comments: string;
  createdDate: number;
  date: string;
  email: string;
  followUpName: string;
  isCustomer: boolean;
  isDealerLead: boolean;
  isDuplicate: boolean;
  adId?: string;
  leadCampaign?: string;
  leadCreatedDate: number;
  leadDate: string;
  leadRefId: string;
  leadTag: string[];
  logId: number;
  mobile: string;
  mobileAlt: string;
  phone: string;
  priority: string;
  remarks: string;
  requirement: string;
  source: string;
  stage: string;
  state: string;
  status: string;
  time: string;
  updatedDate: number;
  username: string;
  whatsappShareCount: number;
}

export interface LeadListQuery {
  outletId: string;
  startDate?: number;
  endDate?: number;
  stage?: string;
  status?: string;
  assignedTo?: string;
  unassigned?: boolean;
  source?: string;
  sourceKey?: string;
  enquiryType?: "CUSTOMER_ENQUIRY";
  search?: string;
  limit: number;
  cursor?: string;
}

export interface LeadCursor {
  createdDate: number;
  id: string;
}

export interface LeadDocument {
  id: string;
  data: Record<string, unknown>;
  cursor: LeadCursor;
}

export interface LeadListResult {
  items: LeadListItem[];
  nextCursor: string | null;
}

export type RepeatedEnquiryMatch =
  | "MOBILE"
  | "EMAIL"
  | "BUSINESS_PROFILE"
  | "BUSINESS_NAME";

export interface RepeatedEnquiryQuery {
  outletId: string;
  startDate: number;
  endDate: number;
  assignedTo?: string;
  source?: string;
  enquiryType?: "CUSTOMER_ENQUIRY";
  search?: string;
  limit: number;
}

export interface RepeatedEnquiryGroup {
  id: string;
  latestCreatedDate: number;
  matchedOn: RepeatedEnquiryMatch[];
  enquiries: LeadListItem[];
}

export interface RepeatedEnquiryResult {
  groups: RepeatedEnquiryGroup[];
  totalGroups: number;
  totalEnquiries: number;
  truncated: boolean;
}

export interface LeadRingingListQuery {
  outletId: string;
  startDate: number;
  endDate: number;
  limit: number;
  cursor?: string;
}

export interface LeadRingingInput {
  outletId: string;
  ringing: boolean;
}

export interface LeadRingingData {
  status: string;
  updatedDate: number;
}

export interface LeadRingingResult extends LeadRingingData {
  id: string;
}

export interface LeadWhatsAppShareInput {
  outletId: string;
}

export interface LeadWhatsAppShareResult {
  id: string;
  shareToken: string;
  whatsappShareCount: number;
}

export interface LeadCreateInput {
  outletId: string;
  customerId?: string | null;
  enquiryType?: "NEW_LEAD" | "CUSTOMER_ENQUIRY";
  area: string;
  adId?: string;
  businessName: string;
  businessType: string;
  city: string;
  customerName: string;
  email: string;
  mobile: string;
  priority: string;
  requirement: string;
  source: string;
  state: string;
}

export type LeadCreateData = Omit<
  LeadListItem,
  "id" | "leadCampaign"
>;

export interface LeadCreateResult {
  id: string;
}

export interface LeadBulkCreateItem {
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

export interface LeadBulkCreateInput {
  outletId: string;
  leads: LeadBulkCreateItem[];
}

export interface LeadBulkCreateRecord {
  externalId: string;
  data: LeadCreateData & { leadCampaign: string };
}

export interface LeadBulkCreateResult {
  created: number;
  skippedDuplicates: number;
}

export interface LeadDetailQuery {
  outletId: string;
}

export interface LeadUpdateInput {
  outletId: string;
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
}

export type LeadUpdateData = Omit<LeadUpdateInput, "outletId"> & {
  phone?: string;
  updatedDate: number;
};

export interface LeadWorkflowInput {
  outletId: string;
  stage?: string;
  comments: string;
  leadTag: string[];
}

export interface LeadAssignInput extends LeadWorkflowInput {
  assignedTo: string;
}

export interface LeadAssignmentData {
  assignedBy: string;
  assignedTo: string;
  assignedHistory?: AssignedHistoryItem[];
  comments: string;
  leadTag: string[];
  stage?: string;
  updatedDate: number;
}

export interface LeadWorkflowResult {
  id: string;
  assignedBy?: string;
  assignedTo?: string;
  assignedHistory?: AssignedHistoryItem[];
  stage?: string;
  customerId?: string | null;
  customerType?: "PROSPECT" | "CUSTOMER";
  enquiryType?: "NEW_LEAD" | "CUSTOMER_ENQUIRY";
  updatedDate: number;
}

export const LEAD_REPORT_SOURCES = [
  "Indiamart",
  "JustDail",
  "Facebook",
  "Instagram",
  "Google",
  "Website",
  "Other",
] as const;

export type LeadReportSource = (typeof LEAD_REPORT_SOURCES)[number];

export interface LeadSourceStats {
  total: number;
  new: number;
  follow: number;
  completed: number;
  lost: number;
}

export interface LeadSourceReportQuery {
  outletId: string;
  startDate: number;
  endDate: number;
}

export interface LeadSourceStageRecord {
  source: string;
  stage: string;
}

export interface LeadSourceReportResult {
  sources: Record<LeadReportSource, LeadSourceStats>;
}

export type LeadCityStateReportQuery = LeadSourceReportQuery;

export interface LeadCityStateStageRecord {
  city: string;
  stage: string;
  state: string;
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

export interface LeadCityStateReportResult {
  rows: LeadCityStateReportRow[];
}

export interface LeadFunnelReportQuery {
  outletId: string;
  startDate: number;
  endDate: number;
  assignedTo?: string;
  source?: string;
}

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

export interface LeadFunnelReportResult {
  counts: LeadFunnelCounts;
  sources: LeadFunnelSourceStat[];
}

export interface LeadFunnelStageRecord {
  stageCategory?: string;
  assignedTo: string;
  source: string;
  stage: string;
}

export type LeadAnalyticsQuery = LeadSourceReportQuery;

export interface LeadAnalyticsRecord extends LeadFunnelStageRecord {
  createdDate: number;
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

export interface LeadAnalyticsResult {
  counts: LeadFunnelCounts;
  sources: LeadAnalyticsSourceCount[];
  trend: LeadAnalyticsTrendPoint[];
  employees: Record<string, LeadEmployeeReportStats>;
}

export type LeadDashboardResult = Omit<LeadAnalyticsResult, "employees">;

export interface LeadEmployeeReportResult {
  employees: Record<string, LeadEmployeeReportStats>;
}

export interface LeadLookupQuery {
  outletId: string;
  mobiles: string[];
}
