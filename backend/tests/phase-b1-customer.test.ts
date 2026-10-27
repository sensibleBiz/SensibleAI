import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import type { TransactionDatabase } from "../src/db/context.js";
import { AppError } from "../src/errors/appError.js";
import { PostgresCustomerService } from "../src/modules/customers/postgresCustomer.service.js";
import type {
  CustomerIdentityValue,
  CustomerRepository,
  PostgresCustomerRecord,
} from "../src/modules/customers/customer.types.js";
import {
  postgresCustomerCreateSchema,
  postgresCustomerUpdateSchema,
} from "../src/modules/customers/postgresCustomer.validator.js";

const customer = (id = "01994abc-0000-7000-8000-000000000099"): PostgresCustomerRecord => ({
  id,
  outletId: "01994abc-0000-7000-8000-000000000021",
  businessId: "01994abc-0000-7000-8000-000000000011",
  customerCode: "CUS-01994ABC-0",
  customerName: "Acme Owner",
  businessName: "Acme Pvt Ltd",
  mobile: "9876543210",
  email: "owner@example.com",
  businessType: "Dealer",
  area: "Central",
  city: "Pune",
  state: "Maharashtra",
  priority: "High",
  source: "Website",
  status: "ACTIVE",
  lifecycle: "PROSPECT",
  totalEnquiries: 0,
  totalWon: 0,
  totalLost: 0,
  createdDate: 1,
  updatedDate: 1,
});

class FakeRepository implements CustomerRepository {
  created: Record<string, unknown> | undefined;
  attached: CustomerIdentityValue[] = [];
  candidateRecords: PostgresCustomerRecord[] = [];
  failAttach = false;
  async create(_database: TransactionDatabase, values: Record<string, unknown>) { this.created = values; }
  async getById() { return this.created ? customer(String(this.created.id)) : null; }
  async search() { return { items: this.candidateRecords, nextCursor: null }; }
  async match() { return this.candidateRecords; }
  async update() { return true; }
  async findByIdentity() { return this.candidateRecords.length === 1 ? this.candidateRecords[0]! : null; }
  async findIdentityCandidates() { return this.candidateRecords; }
  async attachIdentity(_database: TransactionDatabase, _tenantId: string, _customerId: string, identity: CustomerIdentityValue) {
    if (this.failAttach) throw new Error("identity failure");
    this.attached.push(identity);
  }
  async replaceIdentities() {}
  async addOutlet() {}
  async getCustomerOutlets() { return []; }
  async getEnquiries() { return []; }
  async getOutletBusinessId() { return "01994abc-0000-7000-8000-000000000011"; }
  async lockIdentities() {}
}

const database = {} as TransactionDatabase;
const input = {
  outletId: "01994abc-0000-7000-8000-000000000021",
  customerName: " Acme Owner ",
  businessName: " Acme Pvt. Ltd ",
  mobile: "9876543210",
  email: " Owner@Example.COM ",
  businessType: "Dealer",
  area: "Central",
  city: "Pune",
  state: "Maharashtra",
  priority: "High",
  source: "Website",
};

test("PostgreSQL customer creation normalizes fields and creates all current identities", async () => {
  const repository = new FakeRepository();
  const result = await new PostgresCustomerService(repository).create(database, "01994abc-0000-7000-8000-000000000001", "01994abc-0000-7000-8000-000000000051", input);
  assert.equal(result.created, true);
  assert.equal(repository.created?.normalizedMobile, "9876543210");
  assert.equal(repository.created?.normalizedEmail, "owner@example.com");
  assert.equal(repository.created?.normalizedBusinessName, "acme pvt ltd");
  assert.deepEqual(repository.attached.map((entry) => entry.type), ["MOBILE", "EMAIL", "BUSINESS_LOCATION"]);
  assert.equal(repository.created?.lifecycle, "PROSPECT");
});

test("one identity candidate is reused and multiple candidates are explicit ambiguity", async () => {
  const repository = new FakeRepository();
  repository.candidateRecords = [customer()];
  const matched = await new PostgresCustomerService(repository).create(database, "01994abc-0000-7000-8000-000000000001", "01994abc-0000-7000-8000-000000000051", input);
  assert.equal(matched.created, false);
  assert.equal(repository.created, undefined);
  repository.candidateRecords = [customer(), customer("01994abc-0000-7000-8000-000000000098")];
  await assert.rejects(
    new PostgresCustomerService(repository).create(database, "01994abc-0000-7000-8000-000000000001", "01994abc-0000-7000-8000-000000000051", input),
    (error: unknown) => error instanceof AppError && error.code === "CUSTOMER_IDENTITY_AMBIGUOUS",
  );
});

test("customer validators reject counter/lifecycle control and require an identity", () => {
  assert.equal(postgresCustomerCreateSchema.safeParse({ ...input, mobile: "", email: "", businessName: "", city: "", state: "" }).success, false);
  assert.equal(postgresCustomerUpdateSchema.safeParse({ outletId: input.outletId, totalWon: 999999 }).success, false);
  assert.equal(postgresCustomerUpdateSchema.safeParse({ outletId: input.outletId, lifecycle: "REPEAT_CUSTOMER" }).success, false);
  assert.equal(postgresCustomerUpdateSchema.safeParse({ outletId: input.outletId, status: "INACTIVE" }).success, true);
});

test("B1 migration declares CRM tables, forced RLS, permissions, and no Firestore migration", async () => {
  const sql = await readFile(path.resolve(process.cwd(), "migrations/0002_phase_b1_customers.sql"), "utf8");
  for (const table of ["crm.customers", "crm.customer_outlets", "crm.customer_identities"]) {
    assert.match(sql, new RegExp(`CREATE TABLE ${table.replace(".", "\\.")}`, "i"));
    assert.match(sql, new RegExp(`ALTER TABLE ${table.replace(".", "\\.")} FORCE ROW LEVEL SECURITY`, "i"));
  }
  for (const permission of ["customers.read", "customers.create", "customers.update", "customers.archive"]) assert.match(sql, new RegExp(permission));
  assert.doesNotMatch(sql, /firestore|firebase|backfill|etl|synchroni[sz]e/i);
});

test("PostgreSQL Customer module has no Firebase or Firestore dependency", async () => {
  const directory = path.resolve(process.cwd(), "src/modules/customers");
  for (const file of ["postgresCustomer.repository.ts", "postgresCustomer.service.ts", "postgresCustomer.controller.ts", "postgresCustomer.routes.ts"]) {
    const source = await readFile(path.join(directory, file), "utf8");
    assert.doesNotMatch(source, /firebase|firestore/i, file);
  }
});
