import { and, asc, desc, eq, gt, like, or } from "drizzle-orm";
import type { TransactionDatabase } from "../../db/context.js";
import { customerIdentities, customerOutlets, customers } from "../../db/schema/crm.js";
import { outlets } from "../../db/schema/tenancy.js";
import type {
  CustomerIdentityValue,
  CustomerListResult,
  CustomerRepository,
  PostgresCustomerListQuery,
  PostgresCustomerRecord,
} from "./customer.types.js";

const toRecord = (row: typeof customers.$inferSelect & { outletId: string }): PostgresCustomerRecord => ({
  id: row.id,
  outletId: row.outletId,
  businessId: row.businessId,
  customerCode: row.customerCode,
  customerName: row.customerName,
  businessName: row.businessName,
  mobile: row.mobile ?? "",
  email: row.email ?? "",
  businessType: row.businessType,
  area: row.area,
  city: row.city,
  state: row.state,
  priority: row.priority,
  source: row.source,
  status: row.status,
  lifecycle: row.lifecycle,
  totalEnquiries: row.totalEnquiries,
  totalWon: row.totalWon,
  totalLost: row.totalLost,
  createdDate: row.createdAt.getTime(),
  updatedDate: row.updatedAt.getTime(),
});

const decodeCursor = (cursor?: string) => {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { id?: unknown };
    return typeof value.id === "string" ? value.id : undefined;
  } catch {
    return undefined;
  }
};

const encodeCursor = (id: string) => Buffer.from(JSON.stringify({ id }), "utf8").toString("base64url");

export class PostgresCustomerRepository implements CustomerRepository {
  async create(database: TransactionDatabase, values: typeof customers.$inferInsert) {
    await database.db.insert(customers).values(values);
  }

  async getById(database: TransactionDatabase, tenantId: string, outletId: string, customerId: string) {
    const [row] = await database.db.select({ customer: customers, outletId: customerOutlets.outletId })
      .from(customers)
      .innerJoin(customerOutlets, and(eq(customerOutlets.customerId, customers.id), eq(customerOutlets.tenantId, customers.tenantId)))
      .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId), eq(customerOutlets.outletId, outletId)))
      .limit(1);
    return row ? toRecord({ ...row.customer, outletId: row.outletId }) : null;
  }

  async search(database: TransactionDatabase, tenantId: string, query: PostgresCustomerListQuery): Promise<CustomerListResult> {
    const cursorId = decodeCursor(query.cursor);
    const term = query.query?.trim().toLowerCase();
    const digits = query.query?.replace(/\D/g, "") ?? "";
    const conditions = [
      eq(customers.tenantId, tenantId),
      eq(customerOutlets.outletId, query.outletId),
      ...(query.status ? [eq(customers.status, query.status)] : []),
      ...(cursorId ? [gt(customers.id, cursorId)] : []),
      ...(term ? [or(
        like(customers.normalizedCustomerName, `${term}%`),
        like(customers.normalizedBusinessName, `${term}%`),
        like(customers.normalizedEmail, `${term}%`),
        like(customers.customerCode, `${term.toUpperCase()}%`),
        ...(digits ? [eq(customers.normalizedMobile, digits.length > 10 ? digits.slice(-10) : digits)] : []),
      )!] : []),
    ];
    const rows = await database.db.select({ customer: customers, outletId: customerOutlets.outletId })
      .from(customers)
      .innerJoin(customerOutlets, and(eq(customerOutlets.customerId, customers.id), eq(customerOutlets.tenantId, customers.tenantId)))
      .where(and(...conditions))
      .orderBy(asc(customers.id))
      .limit(query.limit + 1);
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((row) => toRecord({ ...row.customer, outletId: row.outletId })),
      nextCursor: hasMore && page.at(-1) ? encodeCursor(page.at(-1)!.customer.id) : null,
    };
  }

  async match(database: TransactionDatabase, tenantId: string, outletId: string, identities: CustomerIdentityValue[], limit: number) {
    return this.findIdentityCandidates(database, tenantId, outletId, identities, limit);
  }

  async update(database: TransactionDatabase, tenantId: string, outletId: string, customerId: string, values: Partial<typeof customers.$inferInsert>) {
    const allowed = await this.getById(database, tenantId, outletId, customerId);
    if (!allowed) return false;
    const result = await database.db.update(customers).set(values).where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)));
    return (result.rowCount ?? 0) > 0;
  }

  async findByIdentity(database: TransactionDatabase, tenantId: string, outletId: string, identity: CustomerIdentityValue) {
    const records = await this.findIdentityCandidates(database, tenantId, outletId, [identity], 2);
    return records.length === 1 ? records[0]! : null;
  }

  async findIdentityCandidates(database: TransactionDatabase, tenantId: string, outletId: string, identities: CustomerIdentityValue[], limit: number) {
    if (identities.length === 0) return [];
    const identityConditions = identities.map((identity) => and(
      eq(customerIdentities.identityType, identity.type),
      eq(customerIdentities.normalizedValue, identity.value),
    ));
    const rows = await database.db.selectDistinct({ customer: customers, outletId: customerOutlets.outletId })
      .from(customerIdentities)
      .innerJoin(customers, and(eq(customers.id, customerIdentities.customerId), eq(customers.tenantId, customerIdentities.tenantId)))
      .innerJoin(customerOutlets, and(eq(customerOutlets.customerId, customers.id), eq(customerOutlets.tenantId, customers.tenantId)))
      .where(and(eq(customerIdentities.tenantId, tenantId), eq(customerOutlets.outletId, outletId), or(...identityConditions)))
      .orderBy(desc(customers.updatedAt), asc(customers.id))
      .limit(limit);
    return rows.map((row) => toRecord({ ...row.customer, outletId: row.outletId }));
  }

  async attachIdentity(database: TransactionDatabase, tenantId: string, customerId: string, identity: CustomerIdentityValue) {
    await database.db.insert(customerIdentities).values({ tenantId, customerId, identityType: identity.type, normalizedValue: identity.value }).onConflictDoNothing();
  }

  async replaceIdentities(database: TransactionDatabase, tenantId: string, customerId: string, identities: CustomerIdentityValue[]) {
    await database.db.delete(customerIdentities).where(and(eq(customerIdentities.tenantId, tenantId), eq(customerIdentities.customerId, customerId)));
    for (const identity of identities) await this.attachIdentity(database, tenantId, customerId, identity);
  }

  async addOutlet(database: TransactionDatabase, tenantId: string, customerId: string, outletId: string, primary: boolean) {
    await database.db.insert(customerOutlets).values({ tenantId, customerId, outletId, isPrimary: primary }).onConflictDoNothing();
  }

  async getCustomerOutlets(database: TransactionDatabase, tenantId: string, customerId: string) {
    const rows = await database.db.select({ outletId: customerOutlets.outletId }).from(customerOutlets)
      .where(and(eq(customerOutlets.tenantId, tenantId), eq(customerOutlets.customerId, customerId)))
      .orderBy(asc(customerOutlets.outletId));
    return rows.map((row) => row.outletId);
  }

  async getEnquiries(): Promise<never[]> {
    return [];
  }

  async getOutletBusinessId(database: TransactionDatabase, tenantId: string, outletId: string) {
    const [row] = await database.db.select({ businessId: outlets.businessId }).from(outlets)
      .where(and(eq(outlets.tenantId, tenantId), eq(outlets.id, outletId), eq(outlets.active, true))).limit(1);
    return row?.businessId ?? null;
  }

  async lockIdentities(database: TransactionDatabase, tenantId: string, identities: CustomerIdentityValue[]) {
    for (const identity of [...identities].sort((a, b) => `${a.type}:${a.value}`.localeCompare(`${b.type}:${b.value}`))) {
      await database.client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${tenantId}:${identity.type}:${identity.value}`]);
    }
  }
}
