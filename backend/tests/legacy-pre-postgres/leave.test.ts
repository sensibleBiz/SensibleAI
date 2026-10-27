import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  calculateLeaveBalanceAdjustment,
  leaveRepository,
} from "../src/repositories/leave.repository.js";
import { leaveService, mapLeaveItem } from "../src/services/leave.service.js";
import type { LeaveDocument } from "../src/types/leave.types.js";
import {
  leaveIdParamsSchema,
  leaveListQuerySchema,
  leaveStatusBodySchema,
  leaveTypeCreateBodySchema,
  leaveTypeListQuerySchema,
} from "../src/validators/leave.validator.js";

const originalListMonthBatch = leaveRepository.listMonthBatch;
const originalTransitionStatus = leaveRepository.transitionStatus;
const originalEnsureDefaultLeaveTypes = leaveRepository.ensureDefaultLeaveTypes;
const originalListLeaveTypes = leaveRepository.listLeaveTypes;
const originalCreateLeaveType = leaveRepository.createLeaveType;

afterEach(() => {
  leaveRepository.listMonthBatch = originalListMonthBatch;
  leaveRepository.transitionStatus = originalTransitionStatus;
  leaveRepository.ensureDefaultLeaveTypes = originalEnsureDefaultLeaveTypes;
  leaveRepository.listLeaveTypes = originalListLeaveTypes;
  leaveRepository.createLeaveType = originalCreateLeaveType;
});

const leaveDocument = (
  id: string,
  status: "REQUESTED" | "APPROVED" | "REJECTED",
  createdDate: number,
): LeaveDocument => ({
  id,
  cursor: { id, createdDate },
  data: {
    createdDate,
    dayId: "2026-08-10",
    duration: "Full Day",
    fromDate: createdDate,
    leaveNote: "Personal work",
    leaveType: "CL",
    managerId: "manager-1",
    managerName: "Manager",
    monthId: "2026-08",
    noDays: 1,
    status,
    toDate: createdDate,
    userProfileId: "user-1",
  },
});

test("leave validators enforce month, status, pagination, and document IDs", () => {
  assert.deepEqual(
    leaveListQuerySchema.parse({
      outletId: "outlet-1",
      month: "2026-08",
      status: "REQUESTED",
    }),
    {
      outletId: "outlet-1",
      month: "2026-08",
      status: "REQUESTED",
      limit: 30,
    },
  );
  assert.equal(
    leaveListQuerySchema.safeParse({
      outletId: "outlet-1",
      month: "2026-13",
      status: "REQUESTED",
    }).success,
    false,
  );
  assert.equal(
    leaveStatusBodySchema.safeParse({
      outletId: "outlet-1",
      status: "REQUESTED",
    }).success,
    false,
  );
  assert.equal(leaveIdParamsSchema.safeParse({ leaveId: "bad/id" }).success, false);
  assert.deepEqual(
    leaveTypeListQuerySchema.parse({ outletId: "outlet-1" }),
    { outletId: "outlet-1" },
  );
  assert.equal(
    leaveTypeCreateBodySchema.safeParse({
      outletId: "outlet-1",
      name: "Casual Leave",
      shortCode: "C/L",
    }).success,
    false,
  );
});

test("leave types initialize defaults and return only valid sorted options", async () => {
  let initializedOutlet = "";
  leaveRepository.ensureDefaultLeaveTypes = async (outletId) => {
    initializedOutlet = outletId;
  };
  leaveRepository.listLeaveTypes = async () => [
    {
      id: "personal",
      data: { name: "PERSONAL LEAVE", shortCode: "PL" },
    },
    { id: "invalid", data: { name: "Missing code" } },
    {
      id: "medical",
      data: { name: "MEDICAL LEAVE", shortCode: "ML" },
    },
  ];

  const result = await leaveService.listTypes({ outletId: "outlet-1" });

  assert.equal(initializedOutlet, "outlet-1");
  assert.deepEqual(
    result.items.map((item) => item.shortCode),
    ["ML", "PL"],
  );
});

test("leave type creation normalizes values and rejects duplicates", async () => {
  let receivedName = "";
  let receivedCode = "";
  leaveRepository.createLeaveType = async (input) => {
    receivedName = input.name;
    receivedCode = input.shortCode;
    return {
      id: "leave-type-1",
      data: { name: input.name, shortCode: input.shortCode },
    };
  };

  const result = await leaveService.createType({
    outletId: "outlet-1",
    name: "  casual leave ",
    shortCode: " cl ",
  });
  assert.equal(receivedName, "CASUAL LEAVE");
  assert.equal(receivedCode, "CL");
  assert.equal(result.item.name, "CASUAL LEAVE");

  leaveRepository.createLeaveType = async () => null;
  await assert.rejects(
    leaveService.createType({
      outletId: "outlet-1",
      name: "Casual Leave",
      shortCode: "CL",
    }),
    { message: "A leave type with this name or short code already exists" },
  );
});

test("completed leave list is month bounded, status filtered, projected, and cursor paginated", async () => {
  const calls: Array<{
    start: number;
    end: number;
    limit: number;
  }> = [];
  leaveRepository.listMonthBatch = async (
    _query,
    start,
    end,
    _cursor,
    limit,
  ) => {
    calls.push({ start, end, limit });
    return [
      leaveDocument("approved-2", "APPROVED", 20),
      leaveDocument("requested", "REQUESTED", 15),
      leaveDocument("approved-1", "APPROVED", 10),
    ];
  };

  const result = await leaveService.list({
    outletId: "list-outlet",
    month: "2026-08",
    status: "APPROVED",
    limit: 1,
  });

  assert.deepEqual(calls, [
    {
      start: Date.parse("2026-08-01T00:00:00.000+05:30"),
      end: Date.parse("2026-09-01T00:00:00.000+05:30") - 1,
      limit: 30,
    },
  ]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.id, "approved-2");
  assert.equal(result.items[0]?.status, "APPROVED");
  assert.ok(result.nextCursor);
});

test("pending leave list includes only the selected and previous month", async () => {
  const calls: Array<{
    start: number;
    end: number;
  }> = [];
  leaveRepository.listMonthBatch = async (_query, start, end) => {
    calls.push({ start, end });
    return [
      leaveDocument("current-approved", "APPROVED", 20),
      leaveDocument("previous-month-pending", "REQUESTED", 10),
    ];
  };

  const result = await leaveService.list({
    outletId: "pending-across-months-outlet",
    month: "2026-09",
    status: "REQUESTED",
    limit: 30,
  });

  await leaveService.list({
    outletId: "pending-year-boundary-outlet",
    month: "2027-01",
    status: "REQUESTED",
    limit: 30,
  });

  assert.deepEqual(calls, [
    {
      start: Date.parse("2026-08-01T00:00:00.000+05:30"),
      end: Date.parse("2026-10-01T00:00:00.000+05:30") - 1,
    },
    {
      start: Date.parse("2026-12-01T00:00:00.000+05:30"),
      end: Date.parse("2027-02-01T00:00:00.000+05:30") - 1,
    },
  ]);
  assert.deepEqual(
    result.items.map((item) => item.id),
    ["previous-month-pending"],
  );
});

test("leave projection returns only the fields used by the approval UI", () => {
  const item = mapLeaveItem({
    ...leaveDocument("leave-1", "REQUESTED", 10),
    data: {
      ...leaveDocument("leave-1", "REQUESTED", 10).data,
      reqBody: { accessToken: "must-not-leak" },
    },
  });

  assert.equal(item.id, "leave-1");
  assert.equal("reqBody" in item, false);
});

test("leave balance adjustment is idempotent across status transitions", () => {
  assert.deepEqual(
    calculateLeaveBalanceAdjustment({
      currentStatus: "REQUESTED",
      nextStatus: "APPROVED",
      noDays: 2,
      totalLeaves: 12,
      usedLeaves: 3,
    }),
    { usedLeaves: 5, remainingLeaves: 7 },
  );
  assert.equal(
    calculateLeaveBalanceAdjustment({
      currentStatus: "APPROVED",
      nextStatus: "APPROVED",
      noDays: 2,
      totalLeaves: 12,
      usedLeaves: 5,
    }),
    null,
  );
  assert.deepEqual(
    calculateLeaveBalanceAdjustment({
      currentStatus: "APPROVED",
      nextStatus: "REJECTED",
      noDays: 2,
      totalLeaves: 12,
      usedLeaves: 5,
    }),
    { usedLeaves: 3, remainingLeaves: 9 },
  );
});

test("leave status service derives the actor and returns not found consistently", async () => {
  let receivedActor = "";
  leaveRepository.transitionStatus = async (
    _outletId,
    _leaveId,
    _input,
    actorId,
  ) => {
    receivedActor = actorId;
    return leaveDocument("leave-1", "APPROVED", 10);
  };

  const result = await leaveService.transitionStatus(
    "leave-1",
    { outletId: "transition-outlet", remark: "Approved", status: "APPROVED" },
    "admin-1",
  );
  assert.equal(receivedActor, "admin-1");
  assert.equal(result.item.status, "APPROVED");

  leaveRepository.transitionStatus = async () => null;
  await assert.rejects(
    leaveService.transitionStatus(
      "missing",
      { outletId: "missing-outlet", remark: "", status: "REJECTED" },
      "admin-1",
    ),
    { message: "Leave application not found" },
  );
});
