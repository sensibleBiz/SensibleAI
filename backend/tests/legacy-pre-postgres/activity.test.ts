import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import { activityRepository } from "../src/repositories/activity.repository.js";
import { leadRepository } from "../src/repositories/lead.repository.js";
import {
  activityService,
  aggregateActivitySummary,
  buildActivityCreateData,
  mapActivityItem,
} from "../src/services/activity.service.js";
import type { ActivityDocument } from "../src/types/activity.types.js";
import {
  activityCreateBodySchema,
  activityListQuerySchema,
  activityUpdateBodySchema,
} from "../src/validators/activity.validator.js";

const originals = {
  create: activityRepository.create,
  delete: activityRepository.delete,
  listByLead: activityRepository.listByLead,
  listMonthBatch: activityRepository.listMonthBatch,
  listMonthSummary: activityRepository.listMonthSummary,
  update: activityRepository.update,
  getLeadById: leadRepository.getById,
};

afterEach(() => {
  activityRepository.create = originals.create;
  activityRepository.delete = originals.delete;
  activityRepository.listByLead = originals.listByLead;
  activityRepository.listMonthBatch = originals.listMonthBatch;
  activityRepository.listMonthSummary = originals.listMonthSummary;
  activityRepository.update = originals.update;
  leadRepository.getById = originals.getLeadById;
});

const makeActivity = (
  id: string,
  scheduledDate: number,
  overrides: Record<string, unknown> = {},
): ActivityDocument => ({
  id,
  cursor: { id, scheduledDate },
  data: {
    assignedTo: "user-1",
    createdDate: Timestamp.fromMillis(scheduledDate - 1_000),
    createdDateInMill: scheduledDate - 1_000,
    description: "Discuss requirements",
    leadName: "Ada Lovelace",
    leadMobile: "9876543210",
    leadRequirement: "Billing software",
    leadRefId: "lead-1",
    mode: "Offline",
    priority: "High",
    productDealerPrice: 80,
    productId: "product-1",
    productMrpPrice: 100,
    productName: "CRM",
    productType: "Regular",
    scheduledDate,
    scheduledTime: scheduledDate,
    status: "PENDING",
    type: "Follow Up",
    ...overrides,
  },
});

test("activity validators enforce the existing fields and pagination limits", () => {
  const list = activityListQuerySchema.parse({
    outletId: "outlet-1",
    startDate: "100",
    endDate: "200",
  });
  assert.equal(list.limit, 30);
  assert.equal(list.startDate, 100);
  assert.equal(
    activityListQuerySchema.safeParse({
      outletId: "outlet-1",
      startDate: 200,
      endDate: 100,
    }).success,
    false,
  );
  assert.equal(
    activityUpdateBodySchema.safeParse({ outletId: "outlet-1" }).success,
    false,
  );
  assert.equal(
    activityUpdateBodySchema.safeParse({
      outletId: "outlet-1",
      scheduledDate: 500,
    }).success,
    true,
  );
  assert.equal(
    activityCreateBodySchema.safeParse({
      outletId: "outlet-1",
      assignedTo: "user-1",
      description: "Follow up",
      mode: "Offline",
      priority: "High",
      productDealerPrice: 80,
      productId: "product-1",
      productMrpPrice: 100,
      productName: "CRM",
      productType: "Regular",
      scheduledDate: 100,
      type: "Follow Up",
      arbitrary: true,
    }).success,
    false,
  );
});

test("activity create data preserves the schema and controls timestamps", () => {
  const data = buildActivityCreateData(
    {
      outletId: "outlet-1",
      assignedTo: "user-1",
      description: "Follow up",
      mode: "Offline",
      priority: "High",
      productDealerPrice: 80,
      productId: "product-1",
      productMrpPrice: 100,
      productName: "CRM",
      productType: "Regular",
      scheduledDate: 500,
      type: "Follow Up",
    },
    {
      name: "Ada Lovelace",
      mobile: "9876543210",
      requirement: "Billing software",
    },
    "lead-1",
    100,
  );

  assert.equal(data.leadRefId, "lead-1");
  assert.equal(data.leadName, "Ada Lovelace");
  assert.equal(data.leadMobile, "9876543210");
  assert.equal(data.leadRequirement, "Billing software");
  assert.equal(data.createdDateInMill, 100);
  assert.equal(data.scheduledTime, 500);
  assert.equal(data.status, "PENDING");
  assert.ok(data.createdDate instanceof Timestamp);
  assert.equal("createdDateInMili" in data, false);
});

test("activity projection normalizes legacy timestamp spelling", () => {
  const item = mapActivityItem(
    makeActivity("activity-1", 500, {
      createdDateInMill: undefined,
      createdDateInMili: 123,
    }),
  );

  assert.equal(item.createdDateInMill, 123);
  assert.equal(item.createdDateInMili, 123);
  assert.equal(item.id, "activity-1");
});

test("monthly activity list filters on the backend and returns a cursor", async () => {
  const records = [
    makeActivity("activity-3", 300, { leadName: "Alice" }),
    makeActivity("activity-2", 200, { leadName: "Bob" }),
    makeActivity("activity-1", 100, { description: "Alice follow up" }),
  ];
  activityRepository.listMonthBatch = async (_query, cursor) =>
    cursor ? [] : records;
  activityRepository.listMonthSummary = async () => [
    { scheduledDate: 300, status: "PENDING" },
    { scheduledDate: 200, status: "DONE" },
  ];

  const result = await activityService.listMonth({
    outletId: "outlet-1",
    startDate: 1,
    endDate: 400,
    search: "alice",
    limit: 1,
  });

  assert.deepEqual(result.items.map((item) => item.id), ["activity-3"]);
  assert.ok(result.nextCursor);
  assert.equal(result.summary?.total, 2);
});

test("lead activity history is sorted and cursor paginated", async () => {
  activityRepository.listByLead = async () => [
    makeActivity("activity-1", 100, { createdDateInMill: 100 }),
    makeActivity("activity-3", 300, { createdDateInMill: 300 }),
    makeActivity("activity-2", 200, { createdDateInMill: 200 }),
  ];

  const firstPage = await activityService.listByLead({
    outletId: "outlet-1",
    leadId: "lead-1",
    limit: 2,
  });
  assert.deepEqual(firstPage.items.map((item) => item.id), [
    "activity-3",
    "activity-2",
  ]);
  assert.ok(firstPage.nextCursor);

  const secondPage = await activityService.listByLead({
    outletId: "outlet-1",
    leadId: "lead-1",
    limit: 2,
    cursor: firstPage.nextCursor ?? undefined,
  });
  assert.deepEqual(secondPage.items.map((item) => item.id), ["activity-1"]);
  assert.equal(secondPage.nextCursor, null);
});

test("activity summary uses the Kolkata day boundary", () => {
  const now = Date.parse("2026-08-19T12:00:00+05:30");
  const result = aggregateActivitySummary(
    [
      {
        scheduledDate: Date.parse("2026-08-18T23:00:00+05:30"),
        status: "DONE",
      },
      {
        scheduledDate: Date.parse("2026-08-19T01:00:00+05:30"),
        status: "PENDING",
      },
    ],
    now,
  );

  assert.deepEqual(result, { total: 2, done: 1, pending: 1, overdue: 1 });
});

test("activity creation derives lead fields and writes once", async () => {
  let capturedData: Record<string, unknown> | undefined;
  leadRepository.getById = async () => ({
    id: "lead-1",
    cursor: { id: "lead-1", createdDate: 1 },
    data: {
      username: "Ada Lovelace",
      mobile: "9876543210",
      requirement: "Billing software",
    },
  });
  activityRepository.create = async (_outletId, data) => {
    capturedData = data as unknown as Record<string, unknown>;
    return "activity-1";
  };

  const result = await activityService.create(
    {
      outletId: "outlet-1",
      assignedTo: "user-1",
      description: "Follow up",
      mode: "Offline",
      priority: "High",
      productDealerPrice: 80,
      productId: "product-1",
      productMrpPrice: 100,
      productName: "CRM",
      productType: "Regular",
      scheduledDate: 500,
      type: "Follow Up",
    },
    "lead-1",
  );

  assert.equal(capturedData?.leadName, "Ada Lovelace");
  assert.equal(capturedData?.leadRefId, "lead-1");
  assert.equal(capturedData?.status, "PENDING");
  assert.equal(result.id, "activity-1");
});

test("activity update and delete return not found consistently", async () => {
  activityRepository.update = async () => false;
  activityRepository.delete = async () => false;

  await assert.rejects(
    activityService.update(
      { outletId: "outlet-1", status: "DONE" },
      "missing-activity",
    ),
    { message: "Activity not found" },
  );
  await assert.rejects(
    activityService.delete("outlet-1", "missing-activity"),
    { message: "Activity not found" },
  );
});

test("activity rescheduling keeps scheduled date and time in sync", async () => {
  let capturedUpdate: Record<string, unknown> | undefined;
  activityRepository.update = async (_outletId, _activityId, data) => {
    capturedUpdate = data;
    return true;
  };

  const result = await activityService.update(
    { outletId: "outlet-1", scheduledDate: 500 },
    "activity-1",
  );

  assert.deepEqual(capturedUpdate, {
    scheduledDate: 500,
    scheduledTime: 500,
  });
  assert.equal(result.scheduledDate, 500);
  assert.equal(result.scheduledTime, 500);
});
