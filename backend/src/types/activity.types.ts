export interface ActivityTimestamp {
  seconds: number;
  nanoseconds: number;
}

export interface ActivityItem {
  id: string;
  assignedTo: string;
  createdDate: ActivityTimestamp | null;
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

export interface ActivityCreateInput {
  outletId: string;
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
}

export interface ActivityCreateData extends Omit<ActivityItem, "createdDate" | "id"> {
  createdDate: unknown;
}

export interface ActivityUpdateInput {
  outletId: string;
  assignedTo?: string;
  scheduledDate?: number;
  status?: "PENDING" | "DONE";
}

export interface ActivityUpdateResult {
  id: string;
  assignedTo?: string;
  scheduledDate?: number;
  scheduledTime?: number;
  status?: string;
}

export interface ActivityCursor {
  id: string;
  scheduledDate: number;
}

export interface ActivityDocument {
  id: string;
  data: Record<string, unknown>;
  cursor: ActivityCursor;
}

export interface ActivityListQuery {
  outletId: string;
  startDate: number;
  endDate: number;
  assignedTo?: string;
  mode?: string;
  search?: string;
  status?: string;
  type?: string;
  limit: number;
  cursor?: string;
}

export interface LeadActivityListQuery {
  outletId: string;
  leadId: string;
  limit: number;
  cursor?: string;
}

export interface ActivitySummary {
  total: number;
  done: number;
  pending: number;
  overdue: number;
}

export interface ActivityListResult {
  items: ActivityItem[];
  nextCursor: string | null;
  summary: ActivitySummary | null;
}

export interface LeadActivityListResult {
  items: ActivityItem[];
  nextCursor: string | null;
}

export interface ActivitySummaryRecord {
  scheduledDate: number;
  status: string;
}
