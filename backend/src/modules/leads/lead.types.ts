export type PostgresLeadStage = string;

export interface PostgresLeadRecord {
  id: string;
  tenantId: string;
  businessId: string;
  outletId: string;
  customerId: string | null;
  assignedToUserId: string | null;
  assignedTo: string;
  assignedBy: string;
  createdByUserId: string;
  updatedByUserId: string;
  customerName: string;
  username: string;
  businessName: string;
  businessType: string;
  mobile: string;
  normalizedMobile: string;
  mobileAlt: string;
  phone: string;
  email: string;
  normalizedEmail: string;
  area: string;
  city: string;
  state: string;
  requirement: string;
  stage: PostgresLeadStage;
  source: string;
  priority: string;
  comments: string;
  customFields: Record<string, unknown>;
  tags: string[];
  leadTag: string[];
  externalRef: string;
  adId: string;
  campaign: string;
  ringing: boolean;
  status: string;
  whatsappShareCount: number;
  createdDate: number;
  updatedDate: number;
}

export interface PostgresLeadAssignmentHistoryItem {
  id: string;
  tenantId: string;
  leadId: string;
  assignedToUserId: string;
  assignedByUserId: string;
  assignedTo: string;
  assignedBy: string;
  assignedAt: number;
}

export interface PostgresLeadStageHistoryItem {
  id: string;
  tenantId: string;
  leadId: string;
  fromStage: PostgresLeadStage | null;
  toStage: PostgresLeadStage;
  changedByUserId: string;
  changedAt: number;
}

export interface PostgresLeadShareTokenRecord {
  id: string;
  tenantId: string;
  leadId: string;
  token: string;
  createdByUserId: string;
  createdAt: number;
  expiresAt: number | null;
}

export interface PostgresLeadCreateInput {
  outletId: string;
  customerId?: string | null;
  adId?: string;
  area?: string;
  businessName?: string;
  businessType?: string;
  city?: string;
  customerName: string;
  email?: string;
  mobile: string;
  priority?: string;
  requirement: string;
  source?: string;
  state?: string;
  assignedTo?: string;
}

export interface PostgresLeadUpdateInput {
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
  customFields?: Record<string, unknown>;
}

export interface PostgresLeadListQuery {
  outletId: string;
  startDate?: number;
  endDate?: number;
  stage?: PostgresLeadStage | string;
  status?: string;
  assignedTo?: string;
  unassigned?: boolean;
  source?: string;
  sourceKey?: import("../../utils/funnelSource.js").FunnelSourceKey;
  search?: string;
  limit: number;
  cursor?: string;
}

export interface PostgresLeadListResult {
  items: PostgresLeadRecord[];
  nextCursor: string | null;
}

export interface PostgresLeadAssignInput {
  outletId: string;
  assignedTo: string;
  comments?: string;
  leadTag?: string[];
  stage?: PostgresLeadStage;
}

export interface PostgresLeadStageInput {
  outletId: string;
  stage?: PostgresLeadStage;
  comments?: string;
  leadTag?: string[];
}

export interface PostgresLeadRingingQuery {
  outletId: string;
  startDate: number;
  endDate: number;
  limit: number;
  cursor?: string;
}

export interface PostgresLeadRepeatedEnquiryQuery {
  outletId: string;
  startDate: number;
  endDate: number;
  assignedTo?: string;
  source?: string;
  search?: string;
  limit: number;
}

export interface PostgresRepeatedEnquiryGroup {
  id: string;
  latestCreatedDate: number;
  matchedOn: ("MOBILE" | "EMAIL" | "BUSINESS_NAME")[];
  enquiries: PostgresLeadRecord[];
}

export interface PostgresRepeatedEnquiryResult {
  groups: PostgresRepeatedEnquiryGroup[];
  totalGroups: number;
  totalEnquiries: number;
  truncated: boolean;
}
export type EmployeeSalesTargetZone = "South" | "West" | "East" | "North" | "Subscriptions";

export interface EmployeeSalesTargetRecord {
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

export interface EmployeeSalesTargetQuery {
  outletId: string;
  month: number;
  year: number;
}

export interface EmployeeSalesTargetWriteItem {
  id?: string;
  zone: EmployeeSalesTargetZone;
  saleExecutive: string;
  saleExecutiveId?: string;
  decForecastNetSales: number;
  achieveNetSales: number;
  order: number;
}

export interface EmployeeSalesTargetSyncInput extends EmployeeSalesTargetQuery {
  items: EmployeeSalesTargetWriteItem[];
}

export interface EmployeeSalesTargetDeleteQuery {
  outletId: string;
}
