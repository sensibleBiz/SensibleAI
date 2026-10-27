import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { TransactionDatabase } from "../src/db/context.js";
import type { PostgresAuthorizationRepository } from "../src/modules/authorization/postgresAuthorization.repository.js";
import type { PostgresLeadRepository } from "../src/modules/leads/postgresLead.repository.js";
import type { PostgresLeadRecord } from "../src/modules/leads/lead.types.js";
import type { ActivityRepository, PostgresActivityRecord } from "../src/modules/activities/activity.types.js";
import { PostgresActivityService } from "../src/modules/activities/postgresActivity.service.js";
import { postgresActivityCreateSchema, postgresActivityIdParamsSchema } from "../src/modules/activities/postgresActivity.validator.js";

const ids = {
  tenant: "01994abc-0000-7000-8000-000000000001",
  business: "01994abc-0000-7000-8000-000000000011",
  outlet: "01994abc-0000-7000-8000-000000000021",
  lead: "01994abc-0000-7000-8000-000000000061",
  customer: "01994abc-0000-7000-8000-000000000071",
  user: "01994abc-0000-7000-8000-000000000051",
};

const lead: PostgresLeadRecord = {
  id: ids.lead, tenantId: ids.tenant, businessId: ids.business, outletId: ids.outlet,
  customerId: ids.customer, assignedToUserId: null, assignedTo: "", assignedBy: "",
  createdByUserId: ids.user, updatedByUserId: ids.user, customerName: "Server Lead",
  username: "Server Lead", businessName: "", businessType: "", mobile: "9876543210",
  normalizedMobile: "9876543210", mobileAlt: "", phone: "", email: "", normalizedEmail: "",
  area: "", city: "", state: "", requirement: "Server requirement", stage: "NEW", source: "",
  priority: "High", comments: "", tags: [], leadTag: [], externalRef: "", adId: "", campaign: "",
  ringing: false, status: "", whatsappShareCount: 0, createdDate: 1, updatedDate: 1,
};

class FakeActivityRepository implements ActivityRepository {
  created?: Record<string, unknown>;
  record?: PostgresActivityRecord;
  async create(_database: TransactionDatabase, values: Record<string, unknown>) {
    this.created = values;
    const now = new Date();
    this.record = {
      id: String(values.id), tenantId: String(values.tenantId), businessId: String(values.businessId),
      outletId: String(values.outletId), leadId: String(values.leadId), customerId: values.customerId as string | null,
      assignedToUserId: values.assignedToUserId as string | null, createdByUserId: String(values.createdByUserId),
      updatedByUserId: String(values.updatedByUserId), type: values.activityType as PostgresActivityRecord["type"],
      status: values.status as PostgresActivityRecord["status"], mode: values.mode as PostgresActivityRecord["mode"],
      priority: values.priority as PostgresActivityRecord["priority"], description: String(values.description),
      scheduledAt: values.scheduledAt as Date, completedAt: values.completedAt as Date | null,
      leadNameSnapshot: String(values.leadNameSnapshot), leadMobileSnapshot: String(values.leadMobileSnapshot),
      leadRequirementSnapshot: String(values.leadRequirementSnapshot), productIdSnapshot: values.productIdSnapshot as string | null,
      productNameSnapshot: values.productNameSnapshot as string | null, productTypeSnapshot: values.productTypeSnapshot as string | null,
      productDealerPriceSnapshot: Number(values.productDealerPriceSnapshot), productMrpSnapshot: Number(values.productMrpSnapshot),
      externalProductSource: values.externalProductSource as string | null, externalProductId: values.externalProductId as string | null,
      createdAt: now, updatedAt: now,
    };
  }
  async getById() { return this.record ?? null; }
  async list() { return { records: this.record ? [this.record] : [], nextCursor: null }; }
  async summarize() { return { total: this.record ? 1 : 0, done: 0, pending: this.record ? 1 : 0, overdue: 0 }; }
  async update(_database: TransactionDatabase, _tenantId: string, _outletId: string, _activityId: string, values: Record<string, unknown>) {
    if (!this.record) return false;
    if (values.status) this.record.status = values.status as PostgresActivityRecord["status"];
    if ("completedAt" in values) this.record.completedAt = values.completedAt as Date | null;
    this.record.updatedByUserId = String(values.updatedByUserId);
    return true;
  }
  async delete() { this.record = undefined; return true; }
}

const database = {} as TransactionDatabase;
const input = {
  outletId: ids.outlet, assignedTo: ids.user, description: "Call tomorrow", mode: "Offline" as const,
  priority: "High" as const, productDealerPrice: 80, productId: "legacy-product-1", productMrpPrice: 100,
  productName: "CRM", productType: "Regular", scheduledDate: Date.now() + 60_000, type: "Follow Up" as const,
};

const makeService = (repository: FakeActivityRepository, events: string[] = []) => {
  const authorization = {
    hasOutletPermission: async (_db: TransactionDatabase, _user: string, _tenant: string, _outlet: string, permission: string) => { events.push(permission); return true; },
    hasOutletAccess: async () => true,
  } as unknown as PostgresAuthorizationRepository;
  const leads = {
    lockLead: async () => lead,
    recordAssignment: async () => { events.push("assignment"); },
    recordStageHistory: async () => { events.push("stage-history"); },
    update: async () => { events.push("lead-update"); return true; },
  } as unknown as PostgresLeadRepository;
  return new PostgresActivityService(repository, authorization, leads);
};

test("B3 activity creation derives PostgreSQL lead/customer snapshots and preserves legacy product reference", async () => {
  const repository = new FakeActivityRepository();
  const result = await makeService(repository).create(database, ids.tenant, ids.user, ids.lead, input);
  assert.equal(repository.created?.leadNameSnapshot, "Server Lead");
  assert.equal(repository.created?.leadMobileSnapshot, "9876543210");
  assert.equal(repository.created?.leadRequirementSnapshot, "Server requirement");
  assert.equal(repository.created?.customerId, ids.customer);
  assert.equal(repository.created?.externalProductSource, "LEGACY_FIRESTORE");
  assert.equal(result.leadRefId, ids.lead);
});

test("B3 Call Later creates activity, records FOLLOWUP history, and updates lead in one request transaction", async () => {
  const events: string[] = [];
  const repository = new FakeActivityRepository();
  const originalCreate = repository.create.bind(repository);
  repository.create = async (...args) => { events.push("activity-create"); await originalCreate(...args); };
  await makeService(repository, events).create(database, ids.tenant, ids.user, ids.lead, { ...input, callLater: true });
  assert.deepEqual(events, ["activities.create", "leads.update", "leads.assign", "activity-create", "assignment", "stage-history", "lead-update"]);
});

test("B3 DONE and reopen transitions maintain completed_at", async () => {
  const repository = new FakeActivityRepository();
  const service = makeService(repository);
  const created = await service.create(database, ids.tenant, ids.user, ids.lead, input);
  await service.update(database, ids.tenant, ids.user, created.id, { outletId: ids.outlet, status: "DONE" });
  assert.ok(repository.record?.completedAt instanceof Date);
  await service.update(database, ids.tenant, ids.user, created.id, { outletId: ids.outlet, status: "PENDING" });
  assert.equal(repository.record?.completedAt, null);
});

test("B3 validators reject Firestore IDs and invalid enum values", () => {
  assert.equal(postgresActivityIdParamsSchema.safeParse({ activityId: "firestore-document-id" }).success, false);
  assert.equal(postgresActivityCreateSchema.safeParse({ ...input, type: "Phone Call" }).success, false);
  assert.equal(postgresActivityCreateSchema.safeParse({ ...input, mode: "Hybrid" }).success, false);
  assert.equal(postgresActivityCreateSchema.safeParse({ ...input, priority: "Critical" }).success, false);
});

test("B3 migration contains no Firestore migration, backfill, ETL, or synchronization", async () => {
  const migration = await readFile(new URL("../migrations/0004_phase_b3_activities.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE crm\.activities/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /firestore|backfill|\betl\b|synchroni[sz]e/i);
});
