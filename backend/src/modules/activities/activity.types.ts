import type { TransactionDatabase } from "../../db/context.js";

export const ACTIVITY_TYPES = ["Follow Up", "Demo", "Installation", "Visit"] as const;
export const ACTIVITY_STATUSES = ["PENDING", "DONE"] as const;
export const ACTIVITY_MODES = ["Online", "Offline"] as const;
export const ACTIVITY_PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;

export type PostgresActivityType = (typeof ACTIVITY_TYPES)[number];
export type PostgresActivityStatus = (typeof ACTIVITY_STATUSES)[number];
export type PostgresActivityMode = (typeof ACTIVITY_MODES)[number];
export type PostgresActivityPriority = (typeof ACTIVITY_PRIORITIES)[number];

export interface PostgresActivityRecord {
  id: string;
  tenantId: string;
  businessId: string;
  outletId: string;
  leadId: string;
  customerId: string | null;
  assignedToUserId: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  type: PostgresActivityType;
  status: PostgresActivityStatus;
  mode: PostgresActivityMode;
  priority: PostgresActivityPriority;
  description: string;
  scheduledAt: Date | null;
  completedAt: Date | null;
  leadNameSnapshot: string;
  leadMobileSnapshot: string;
  leadRequirementSnapshot: string;
  productIdSnapshot: string | null;
  productNameSnapshot: string | null;
  productTypeSnapshot: string | null;
  productDealerPriceSnapshot: number;
  productMrpSnapshot: number;
  externalProductSource: string | null;
  externalProductId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostgresActivityItem {
  id: string;
  assignedTo: string;
  createdDate: { seconds: number; nanoseconds: number };
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

export interface PostgresActivityCreateInput {
  outletId: string;
  assignedTo: string;
  description: string;
  mode: PostgresActivityMode;
  priority: PostgresActivityPriority;
  productDealerPrice: number;
  productId: string | null;
  productMrpPrice: number;
  productName: string | null;
  productType: string;
  scheduledDate: number;
  type: PostgresActivityType;
  callLater?: boolean;
}

export interface PostgresActivityUpdateInput {
  outletId: string;
  assignedTo?: string;
  scheduledDate?: number;
  status?: PostgresActivityStatus;
}

export interface PostgresActivityListQuery {
  outletId: string;
  leadId?: string;
  customerId?: string;
  assignedTo?: string;
  mode?: PostgresActivityMode;
  priority?: PostgresActivityPriority;
  search?: string;
  status?: PostgresActivityStatus;
  type?: PostgresActivityType;
  startDate?: number;
  endDate?: number;
  limit: number;
  cursor?: string;
}

export interface PostgresActivityPage {
  items: PostgresActivityItem[];
  nextCursor: string | null;
  summary: { total: number; done: number; pending: number; overdue: number } | null;
}

export interface ActivityRepository {
  create(database: TransactionDatabase, values: Record<string, unknown>): Promise<void>;
  getById(database: TransactionDatabase, tenantId: string, outletId: string, activityId: string): Promise<PostgresActivityRecord | null>;
  list(database: TransactionDatabase, tenantId: string, query: PostgresActivityListQuery): Promise<{ records: PostgresActivityRecord[]; nextCursor: string | null }>;
  summarize(database: TransactionDatabase, tenantId: string, query: Pick<PostgresActivityListQuery, "outletId" | "startDate" | "endDate">): Promise<{ total: number; done: number; pending: number; overdue: number }>;
  update(database: TransactionDatabase, tenantId: string, outletId: string, activityId: string, values: Record<string, unknown>): Promise<boolean>;
  delete(database: TransactionDatabase, tenantId: string, outletId: string, activityId: string): Promise<boolean>;
}
