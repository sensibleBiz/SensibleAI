import type { TransactionDatabase } from "../../db/context.js";

export type PostgresCustomerStatus = "ACTIVE" | "INACTIVE";
export type PostgresCustomerLifecycle = "PROSPECT" | "NEW_CUSTOMER" | "REPEAT_CUSTOMER";
export type PostgresCustomerIdentityType = "MOBILE" | "EMAIL" | "BUSINESS_LOCATION";

export interface PostgresCustomerRecord {
  id: string;
  outletId: string;
  businessId: string;
  customerCode: string;
  customerName: string;
  businessName: string;
  mobile: string;
  email: string;
  businessType: string;
  area: string;
  city: string;
  state: string;
  priority: string;
  source: string;
  status: PostgresCustomerStatus;
  lifecycle: PostgresCustomerLifecycle;
  totalEnquiries: number;
  totalWon: number;
  totalLost: number;
  createdDate: number;
  updatedDate: number;
}

export interface CustomerIdentityValue {
  type: PostgresCustomerIdentityType;
  value: string;
}

export interface PostgresCustomerCreateInput {
  outletId: string;
  customerName: string;
  businessName: string;
  mobile: string;
  email: string;
  businessType: string;
  area: string;
  city: string;
  state: string;
  priority: string;
  source: string;
}

export interface PostgresCustomerUpdateInput extends Partial<Omit<PostgresCustomerCreateInput, "outletId">> {
  outletId: string;
  status?: PostgresCustomerStatus;
}

export interface PostgresCustomerListQuery {
  outletId: string;
  query?: string;
  status?: PostgresCustomerStatus;
  limit: number;
  cursor?: string;
}

export interface CustomerMatchQuery {
  outletId: string;
  businessName?: string;
  email?: string;
  mobile?: string;
  city?: string;
  state?: string;
  limit: number;
}

export type CustomerMatchStatus = "NONE" | "MATCHED" | "AMBIGUOUS";

export interface CustomerMatchResult {
  status: CustomerMatchStatus;
  items: PostgresCustomerRecord[];
  existingEnquiries: never[];
}

export interface CustomerListResult {
  items: PostgresCustomerRecord[];
  nextCursor: string | null;
}

export interface CustomerCreateResult {
  customer: PostgresCustomerRecord;
  created: boolean;
  matchStatus: "CREATED" | "MATCHED";
}

export interface CustomerRepository {
  create(database: TransactionDatabase, values: Record<string, unknown>): Promise<void>;
  getById(database: TransactionDatabase, tenantId: string, outletId: string, customerId: string): Promise<PostgresCustomerRecord | null>;
  search(database: TransactionDatabase, tenantId: string, query: PostgresCustomerListQuery): Promise<CustomerListResult>;
  match(database: TransactionDatabase, tenantId: string, outletId: string, identities: CustomerIdentityValue[], limit: number): Promise<PostgresCustomerRecord[]>;
  update(database: TransactionDatabase, tenantId: string, outletId: string, customerId: string, values: Record<string, unknown>): Promise<boolean>;
  findByIdentity(database: TransactionDatabase, tenantId: string, outletId: string, identity: CustomerIdentityValue): Promise<PostgresCustomerRecord | null>;
  findIdentityCandidates(database: TransactionDatabase, tenantId: string, outletId: string, identities: CustomerIdentityValue[], limit: number): Promise<PostgresCustomerRecord[]>;
  attachIdentity(database: TransactionDatabase, tenantId: string, customerId: string, identity: CustomerIdentityValue): Promise<void>;
  replaceIdentities(database: TransactionDatabase, tenantId: string, customerId: string, identities: CustomerIdentityValue[]): Promise<void>;
  addOutlet(database: TransactionDatabase, tenantId: string, customerId: string, outletId: string, primary: boolean): Promise<void>;
  getCustomerOutlets(database: TransactionDatabase, tenantId: string, customerId: string): Promise<string[]>;
  getEnquiries(database: TransactionDatabase, tenantId: string, outletId: string, customerId: string): Promise<never[]>;
  getOutletBusinessId(database: TransactionDatabase, tenantId: string, outletId: string): Promise<string | null>;
  lockIdentities(database: TransactionDatabase, tenantId: string, identities: CustomerIdentityValue[]): Promise<void>;
}
