import type { LeadCursor, LeadListItem } from "./lead.types.js";

export type CustomerStatus = "ACTIVE" | "INACTIVE";
export type CustomerLifecycle =
  | "PROSPECT"
  | "NEW_CUSTOMER"
  | "REPEAT_CUSTOMER";

export interface CustomerRecord {
  id: string;
  outletId: string;
  area: string;
  businessType: string;
  customerCode: string;
  customerName: string;
  businessName: string;
  mobile: string;
  priority: string;
  source: string;
  email: string;
  city: string;
  state: string;
  status: CustomerStatus;
  lifecycle: CustomerLifecycle;
  totalEnquiries: number;
  totalWon: number;
  totalLost: number;
  createdDate: number;
  updatedDate: number;
}

export interface CustomerStoredData
  extends Omit<CustomerRecord, "id" | "outletId"> {
  normalizedBusinessName: string;
  normalizedCustomerCode: string;
  normalizedCustomerName: string;
  normalizedEmail: string;
  normalizedMobile: string;
}

export interface CustomerDocument {
  id: string;
  data: Record<string, unknown>;
}

export type CustomerEnquiryDefaultsDocument = CustomerDocument;

export interface CustomerSearchQuery {
  outletId: string;
  query: string;
  limit: number;
}

export interface CustomerSearchResult {
  items: CustomerRecord[];
  existingEnquiries: LeadListItem[];
}

export interface CustomerMatchQuery {
  outletId: string;
  businessName?: string;
  email?: string;
  mobile?: string;
  limit: number;
}

export interface CustomerMatchResult {
  items: CustomerRecord[];
  existingEnquiries: LeadListItem[];
}

export interface CustomerDetailQuery {
  outletId: string;
}

export interface CustomerEnquiryQuery extends CustomerDetailQuery {
  limit: number;
  cursor?: string;
}

export interface CustomerEnquiryPage {
  customer: CustomerRecord;
  items: LeadListItem[];
  nextCursor: string | null;
}

export interface CustomerEnquiryDocuments {
  records: Array<{
    id: string;
    data: Record<string, unknown>;
    cursor: LeadCursor;
  }>;
}

export type CustomerIdentityType = "mobile" | "email" | "businessLocation";

export interface CustomerIdentity {
  type: CustomerIdentityType;
  value: string;
}

export interface LeadWorkflowTransactionInput {
  comments: string;
  leadTag: string[];
  stage?: string;
  updatedDate: number;
  assignment?: {
    assignedBy: string;
    assignedTo: string;
  };
}

export interface LeadWorkflowTransactionResult {
  assignedBy?: string;
  assignedTo?: string;
  assignedHistory?: Array<{
    assignTo: string;
    assignBy: string;
    assignAt: number;
  }>;
  customerId: string | null;
  customerType: "PROSPECT" | "CUSTOMER";
  enquiryType: "NEW_LEAD" | "CUSTOMER_ENQUIRY";
  stage?: string;
}
