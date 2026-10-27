import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { callRepository } from "../src/repositories/call.repository.js";
import { leadRepository } from "../src/repositories/lead.repository.js";
import {
  buildCallReport,
  callService,
  filterCallReport,
  mapCallLogItem,
  normalizeCallNumberVariants,
} from "../src/services/call.service.js";
import type { CallLogDocument } from "../src/types/call.types.js";
import {
  boundCallPageLimit,
  CALL_REPORT_MAX_DOCS,
  isValidCallCursor,
  uniqueCallNumbers,
} from "../src/utils/callQuery.js";
import {
  callReportQuerySchema,
  employeeCallListQuerySchema,
  leadCallListQuerySchema,
} from "../src/validators/call.validator.js";

const originals = {
  getLeadById: leadRepository.getById,
  listByEmployee: callRepository.listByEmployee,
  listByNumbers: callRepository.listByNumbers,
  streamForReport: callRepository.streamForReport,
};

afterEach(() => {
  leadRepository.getById = originals.getLeadById;
  callRepository.listByEmployee = originals.listByEmployee;
  callRepository.listByNumbers = originals.listByNumbers;
  callRepository.streamForReport = originals.streamForReport;
});

const makeCall = (id: string, timestamp: number): CallLogDocument => ({
  id,
  cursor: { id, timestamp },
  data: {
    createdAt: timestamp,
    department: "SALES",
    deviceId: null,
    direction: "incoming",
    durationSeconds: 45,
    name: "Lead",
    number: "9876543210",
    phoneAccountId: "sim-1",
    rawPayload: { token: "must-not-be-projected" },
    receiverMobileNo: "9000000000",
    receiverName: "Sales User",
    simLabel: "SIM 1",
    simPhoneNumber: null,
    subscriptionId: null,
    timestamp,
    uploadedAt: "2026-08-20T10:00:00.000Z",
  },
});

test("call list validation defaults and bounds cursor pagination", () => {
  const parsed = leadCallListQuerySchema.parse({ outletId: "outlet-1" });
  assert.equal(parsed.limit, 30);
  assert.equal(
    leadCallListQuerySchema.safeParse({ outletId: "outlet-1", limit: 101 })
      .success,
    false,
  );
});

test("call report validators enforce one day ranges and employee limits", () => {
  assert.equal(
    callReportQuerySchema.safeParse({
      outletId: "outlet-1",
      startDate: 100,
      endDate: 86_400_101,
    }).success,
    false,
  );
  const employeeQuery = employeeCallListQuerySchema.parse({
    outletId: "outlet-1",
    startDate: 100,
    endDate: 200,
    receiverName: "Sales User ",
  });
  assert.equal(employeeQuery.limit, 50);
  assert.equal(employeeQuery.receiverName, "Sales User ");
});

test("call report aggregates raw logs and filters employee summaries", () => {
  const first = makeCall("call-1", 100);
  const second = makeCall("call-2", 200);
  second.data.department = "SUPPORT";
  second.data.receiverName = "Support User";
  second.data.direction = "missed";
  second.data.durationSeconds = 0;

  const report = buildCallReport([first, second]);
  assert.equal(report.summary.total, 2);
  assert.equal(report.summary.incoming, 1);
  assert.equal(report.summary.missed, 1);
  assert.deepEqual(report.availableDepartments, ["SALES", "SUPPORT"]);

  const filtered = filterCallReport(report, {
    department: "SUPPORT",
    search: "support",
  });
  assert.deepEqual(Object.keys(filtered.departments), ["SUPPORT"]);
  assert.deepEqual(Object.keys(filtered.departments.SUPPORT?.employees ?? {}), [
    "Support User",
  ]);
  assert.equal(filtered.summary.total, 2);
});

test("call report cache avoids duplicate Firestore reads for UI filters", async () => {
  let repositoryCalls = 0;
  callRepository.streamForReport = async function* () {
    repositoryCalls += 1;
    yield makeCall("call-1", 100);
  };
  const baseQuery = {
    outletId: "outlet-cache-test",
    startDate: 100,
    endDate: 200,
  };

  await callService.getReport(baseQuery);
  await callService.getReport({ ...baseQuery, search: "sales" });
  assert.equal(repositoryCalls, 1);
});

test("employee call details use cursor pagination", async () => {
  const records = [
    makeCall("call-3", 300),
    makeCall("call-2", 200),
    makeCall("call-1", 100),
  ];
  callRepository.listByEmployee = async (_query, cursor, limit) => {
    const startIndex = cursor
      ? records.findIndex((record) => record.id === cursor.id) + 1
      : 0;
    return records.slice(startIndex, startIndex + limit);
  };
  const query = {
    outletId: "outlet-1",
    startDate: 1,
    endDate: 400,
    receiverName: "Sales User",
    limit: 2,
  };

  const first = await callService.listByEmployee(query);
  assert.deepEqual(first.items.map((item) => item.id), ["call-3", "call-2"]);
  assert.ok(first.nextCursor);
  const second = await callService.listByEmployee({
    ...query,
    cursor: first.nextCursor ?? undefined,
  });
  assert.deepEqual(second.items.map((item) => item.id), ["call-1"]);
  assert.equal(second.nextCursor, null);
});

test("call number normalization preserves the current matching variants", () => {
  assert.deepEqual(normalizeCallNumberVariants("+91 98765-43210"), [
    "+919876543210",
    "9876543210",
  ]);
  assert.deepEqual(normalizeCallNumberVariants(""), []);
});

test("call projection returns only the fields required by CallHistory", () => {
  const item = mapCallLogItem(makeCall("call-1", 100));
  assert.equal(item.id, "call-1");
  assert.equal(item.durationSeconds, 45);
  assert.equal("createdAt" in item, false);
  assert.equal("rawPayload" in item, false);
});

test("lead calls use the lead mobile and return non-overlapping cursor pages", async () => {
  const records = [
    makeCall("call-3", 300),
    makeCall("call-2", 200),
    makeCall("call-1", 100),
  ];
  const capturedNumbers: string[][] = [];
  leadRepository.getById = async () => ({
    id: "lead-1",
    cursor: { id: "lead-1", createdDate: 1 },
    data: { mobile: "+91 98765 43210" },
  });
  callRepository.listByNumbers = async (_outletId, numbers, cursor, limit) => {
    capturedNumbers.push(numbers);
    const startIndex = cursor
      ? records.findIndex((record) => record.id === cursor.id) + 1
      : 0;
    return records.slice(startIndex, startIndex + limit);
  };

  const firstPage = await callService.listByLead({
    outletId: "outlet-1",
    leadId: "lead-1",
    limit: 2,
  });
  assert.deepEqual(firstPage.items.map((item) => item.id), ["call-3", "call-2"]);
  assert.ok(firstPage.nextCursor);

  const secondPage = await callService.listByLead({
    outletId: "outlet-1",
    leadId: "lead-1",
    limit: 2,
    cursor: firstPage.nextCursor ?? undefined,
  });
  assert.deepEqual(secondPage.items.map((item) => item.id), ["call-1"]);
  assert.equal(secondPage.nextCursor, null);
  assert.deepEqual(capturedNumbers[0], ["+919876543210", "9876543210"]);
});

test("lead calls reject missing leads and malformed cursors", async () => {
  leadRepository.getById = async () => null;
  await assert.rejects(
    callService.listByLead({ outletId: "outlet-1", leadId: "missing", limit: 30 }),
    { message: "Lead not found" },
  );

  leadRepository.getById = async () => ({
    id: "lead-1",
    cursor: { id: "lead-1", createdDate: 1 },
    data: { mobile: "9876543210" },
  });
  await assert.rejects(
    callService.listByLead({
      outletId: "outlet-1",
      leadId: "lead-1",
      limit: 30,
      cursor: "invalid",
    }),
    { message: "Invalid pagination cursor" },
  );
});

test("call query helpers bound limits, reject oversized IN filters, and ignore fake cursors", () => {
  assert.equal(boundCallPageLimit(1), 1);
  assert.equal(boundCallPageLimit(50), 50);
  assert.equal(boundCallPageLimit(500), 101);
  assert.equal(CALL_REPORT_MAX_DOCS, 5_000);
  assert.throws(() => boundCallPageLimit(0), { message: "Invalid page limit" });
  assert.throws(() => boundCallPageLimit(-10), { message: "Invalid page limit" });

  assert.deepEqual(uniqueCallNumbers([" 9876543210 ", "9876543210", ""]), [
    "9876543210",
  ]);
  assert.deepEqual(uniqueCallNumbers([]), []);
  assert.throws(
    () => uniqueCallNumbers(Array.from({ length: 31 }, (_, index) => String(index))),
    { message: "Too many call numbers for a single lookup" },
  );

  assert.equal(isValidCallCursor({ id: "call-1", timestamp: 100 }), true);
  assert.equal(isValidCallCursor({ id: "call-1", timestamp: Number.NaN }), false);
  assert.equal(isValidCallCursor({ id: "", timestamp: 100 }), false);
});

test("employee pagination does not emit a next cursor when timestamp is invalid", async () => {
  callRepository.listByEmployee = async () => [
    {
      ...makeCall("call-2", 200),
      cursor: { id: "call-2", timestamp: Number.NaN },
    },
    makeCall("call-1", 100),
  ];

  const result = await callService.listByEmployee({
    outletId: "outlet-1",
    startDate: 1,
    endDate: 400,
    receiverName: "Sales User",
    limit: 1,
  });

  assert.deepEqual(result.items.map((item) => item.id), ["call-2"]);
  assert.equal(result.nextCursor, null);
});
