import { v7 as uuidv7 } from "uuid";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { customerLifecycleForWonCount } from "../../services/customerLifecycle.js";
import {
  buildCustomerCode,
  buildCustomerIdentities,
  normalizeBusinessName,
  normalizeEmail,
  normalizeMobile,
} from "../../utils/customerNormalization.js";
import type {
  CustomerCreateResult,
  CustomerIdentityValue,
  CustomerListResult,
  CustomerMatchQuery,
  CustomerMatchResult,
  CustomerRepository,
  PostgresCustomerCreateInput,
  PostgresCustomerListQuery,
  PostgresCustomerRecord,
  PostgresCustomerUpdateInput,
} from "./customer.types.js";
import { PostgresCustomerRepository } from "./postgresCustomer.repository.js";

const identitiesFor = (input: {
  businessName: string;
  city: string;
  email: string;
  mobile: string;
  state: string;
}): CustomerIdentityValue[] => buildCustomerIdentities(input).map((identity) => ({
  type: identity.type === "mobile" ? "MOBILE" : identity.type === "email" ? "EMAIL" : "BUSINESS_LOCATION",
  value: identity.value,
}));

const requireIdentities = (input: Parameters<typeof identitiesFor>[0]) => {
  const identities = identitiesFor(input);
  if (identities.length === 0) {
    throw new AppError(400, "A mobile, email, or business location is required to identify the customer", "CUSTOMER_IDENTITY_REQUIRED");
  }
  return identities;
};

export class PostgresCustomerService {
  constructor(private readonly repository: CustomerRepository = new PostgresCustomerRepository()) {}

  async create(database: TransactionDatabase, tenantId: string, userId: string, input: PostgresCustomerCreateInput): Promise<CustomerCreateResult> {
    const businessId = await this.repository.getOutletBusinessId(database, tenantId, input.outletId);
    if (!businessId) throw new AppError(403, "PostgreSQL outlet access denied", "POSTGRES_OUTLET_ACCESS_DENIED");
    const identities = requireIdentities(input);
    await this.repository.lockIdentities(database, tenantId, identities);
    const candidates = await this.repository.findIdentityCandidates(database, tenantId, input.outletId, identities, 3);
    if (candidates.length > 1) {
      throw new AppError(409, "Customer identities match multiple customer records", "CUSTOMER_IDENTITY_AMBIGUOUS");
    }
    if (candidates[0]) return { customer: candidates[0], created: false, matchStatus: "MATCHED" };

    const id = uuidv7();
    await this.repository.create(database, {
      id,
      tenantId,
      businessId,
      customerCode: buildCustomerCode(id),
      customerName: input.customerName.trim(),
      normalizedCustomerName: normalizeBusinessName(input.customerName),
      businessName: input.businessName.trim(),
      normalizedBusinessName: normalizeBusinessName(input.businessName),
      mobile: input.mobile.trim() || null,
      normalizedMobile: normalizeMobile(input.mobile) || null,
      email: input.email.trim() || null,
      normalizedEmail: normalizeEmail(input.email) || null,
      businessType: input.businessType.trim(),
      area: input.area.trim(),
      city: input.city.trim(),
      state: input.state.trim(),
      priority: input.priority.trim(),
      source: input.source.trim(),
      status: "ACTIVE",
      lifecycle: customerLifecycleForWonCount(0),
      totalEnquiries: 0,
      totalWon: 0,
      totalLost: 0,
      createdBy: userId,
      updatedBy: userId,
    });
    await this.repository.addOutlet(database, tenantId, id, input.outletId, true);
    for (const identity of identities) await this.repository.attachIdentity(database, tenantId, id, identity);
    const customer = await this.repository.getById(database, tenantId, input.outletId, id);
    if (!customer) throw new Error("Created customer was not readable inside its transaction");
    return { customer, created: true, matchStatus: "CREATED" };
  }

  list(database: TransactionDatabase, tenantId: string, query: PostgresCustomerListQuery): Promise<CustomerListResult> {
    return this.repository.search(database, tenantId, query);
  }

  search(database: TransactionDatabase, tenantId: string, query: PostgresCustomerListQuery) {
    return this.repository.search(database, tenantId, query).then((result) => ({ items: result.items, existingEnquiries: [] as never[] }));
  }

  async match(database: TransactionDatabase, tenantId: string, query: CustomerMatchQuery): Promise<CustomerMatchResult> {
    const identities = identitiesFor({
      businessName: query.businessName ?? "",
      city: query.city ?? "",
      email: query.email ?? "",
      mobile: query.mobile ?? "",
      state: query.state ?? "",
    });
    const items = await this.repository.match(database, tenantId, query.outletId, identities, query.limit);
    return { status: items.length === 0 ? "NONE" : items.length === 1 ? "MATCHED" : "AMBIGUOUS", items, existingEnquiries: [] };
  }

  async getById(database: TransactionDatabase, tenantId: string, outletId: string, customerId: string): Promise<PostgresCustomerRecord> {
    const customer = await this.repository.getById(database, tenantId, outletId, customerId);
    if (!customer) throw new AppError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
    return customer;
  }

  async update(database: TransactionDatabase, tenantId: string, userId: string, customerId: string, input: PostgresCustomerUpdateInput) {
    const current = await this.getById(database, tenantId, input.outletId, customerId);
    const merged = {
      customerName: input.customerName ?? current.customerName,
      businessName: input.businessName ?? current.businessName,
      mobile: input.mobile ?? current.mobile,
      email: input.email ?? current.email,
      city: input.city ?? current.city,
      state: input.state ?? current.state,
    };
    const identities = requireIdentities(merged);
    await this.repository.lockIdentities(database, tenantId, identities);
    const values = {
      ...(input.customerName !== undefined ? { customerName: input.customerName.trim(), normalizedCustomerName: normalizeBusinessName(input.customerName) } : {}),
      ...(input.businessName !== undefined ? { businessName: input.businessName.trim(), normalizedBusinessName: normalizeBusinessName(input.businessName) } : {}),
      ...(input.mobile !== undefined ? { mobile: input.mobile.trim() || null, normalizedMobile: normalizeMobile(input.mobile) || null } : {}),
      ...(input.email !== undefined ? { email: input.email.trim() || null, normalizedEmail: normalizeEmail(input.email) || null } : {}),
      ...(input.businessType !== undefined ? { businessType: input.businessType.trim() } : {}),
      ...(input.area !== undefined ? { area: input.area.trim() } : {}),
      ...(input.city !== undefined ? { city: input.city.trim() } : {}),
      ...(input.state !== undefined ? { state: input.state.trim() } : {}),
      ...(input.priority !== undefined ? { priority: input.priority.trim() } : {}),
      ...(input.source !== undefined ? { source: input.source.trim() } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedBy: userId,
    };
    const updated = await this.repository.update(database, tenantId, input.outletId, customerId, values);
    if (!updated) throw new AppError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
    await this.repository.replaceIdentities(database, tenantId, customerId, identities);
    return this.getById(database, tenantId, input.outletId, customerId);
  }

  async getEnquiries(database: TransactionDatabase, tenantId: string, outletId: string, customerId: string) {
    const customer = await this.getById(database, tenantId, outletId, customerId);
    const items = await this.repository.getEnquiries(database, tenantId, outletId, customerId);
    return { customer, items, nextCursor: null };
  }
}

export const postgresCustomerService = new PostgresCustomerService();
