import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { attendanceRepository } from "../src/repositories/attendance.repository.js";
import {
  attendanceService,
  buildDailyAttendanceRows,
} from "../src/services/attendance.service.js";
import type {
  AttendanceRecordDocument,
  AttendanceTeamMember,
  LeaveApplicationRecord,
} from "../src/types/attendance.types.js";
import {
  attendanceDailyQuerySchema,
  attendanceIdParamsSchema,
  attendanceMonthlyQuerySchema,
} from "../src/validators/attendance.validator.js";

const originalListActivePayrollTeam = attendanceRepository.listActivePayrollTeam;
const originalListAttendanceForDay = attendanceRepository.listAttendanceForDay;
const originalListLeaveCandidatesForDay =
  attendanceRepository.listLeaveCandidatesForDay;
const originalListAttendanceForDays = attendanceRepository.listAttendanceForDays;
const originalListLeaveCandidatesForMonth =
  attendanceRepository.listLeaveCandidatesForMonth;
const originalListActiveHolidaysForYear =
  attendanceRepository.listActiveHolidaysForYear;
const originalListActiveSalaries = attendanceRepository.listActiveSalaries;
const originalDeleteAttendance = attendanceRepository.deleteAttendance;

afterEach(() => {
  attendanceRepository.listActivePayrollTeam = originalListActivePayrollTeam;
  attendanceRepository.listAttendanceForDay = originalListAttendanceForDay;
  attendanceRepository.listLeaveCandidatesForDay =
    originalListLeaveCandidatesForDay;
  attendanceRepository.listAttendanceForDays = originalListAttendanceForDays;
  attendanceRepository.listLeaveCandidatesForMonth =
    originalListLeaveCandidatesForMonth;
  attendanceRepository.listActiveHolidaysForYear =
    originalListActiveHolidaysForYear;
  attendanceRepository.listActiveSalaries = originalListActiveSalaries;
  attendanceRepository.deleteAttendance = originalDeleteAttendance;
});

const team: AttendanceTeamMember[] = [
  {
    id: "team-1",
    userName: "Alice",
    userProfileId: "user-1",
    empCode: "E001",
    isActive: true,
    isOnPayRoll: true,
  },
  {
    id: "team-2",
    userName: "Bob",
    userProfileId: "user-2",
    empCode: "E002",
    isActive: true,
    isOnPayRoll: true,
  },
  {
    id: "team-3",
    userName: "Cara",
    userProfileId: "user-3",
    empCode: "E003",
    isActive: true,
    isOnPayRoll: true,
  },
];

test("attendance daily validation accepts timestamps and rejects bad ids", () => {
  const parsed = attendanceDailyQuerySchema.parse({
    outletId: "outlet-1",
    date: "2026-08-25",
  });

  assert.equal(parsed.outletId, "outlet-1");
  assert.equal(parsed.date, Date.parse("2026-08-25T00:00:00.000+05:30"));
  assert.equal(
    attendanceIdParamsSchema.safeParse({ attendanceId: "bad/id" }).success,
    false,
  );
});

test("attendance monthly validation requires a YYYY-MM month", () => {
  assert.deepEqual(
    attendanceMonthlyQuerySchema.parse({
      outletId: "outlet-1",
      month: "2026-08",
    }),
    { outletId: "outlet-1", month: "2026-08", includeSalary: false },
  );
  assert.equal(
    attendanceMonthlyQuerySchema.safeParse({
      outletId: "outlet-1",
      month: "08-2026",
    }).success,
    false,
  );
});

test("daily attendance merge preserves present leave and absent rows", () => {
  const attendance: AttendanceRecordDocument[] = [
    {
      id: "attendance-1",
      data: {
        checkInTime: 100,
        dayId: "25-08-2026",
        isPresent: true,
        userId: "user-1",
      },
    },
  ];
  const leaves: LeaveApplicationRecord[] = [
    {
      id: "leave-1",
      fromDate: 1,
      leaveType: "CL",
      toDate: 999,
      userProfileId: "user-2",
    },
  ];

  const rows = buildDailyAttendanceRows({
    attendance,
    dayEnd: 500,
    dayId: "25-08-2026",
    dayStart: 200,
    leaves,
    team,
  });

  assert.deepEqual(
    rows.map((row) => [row.userId, row.attendanceStatus, row.id]),
    [
      ["user-1", "PRESENT", "attendance-1"],
      ["user-2", "ON_LEAVE", "user-2_leave"],
      ["user-3", "ABSENT", "user-3_absent"],
    ],
  );
});

test("present attendance falls back to NA for a missing employee code", () => {
  const rows = buildDailyAttendanceRows({
    attendance: [{
      id: "attendance-1",
      data: { userId: "user-1" },
    }],
    dayEnd: 500,
    dayId: "25-08-2026",
    dayStart: 200,
    leaves: [],
    team: [{
      id: "team-1",
      userName: "Alice",
      userProfileId: "user-1",
    }],
  });

  assert.equal(rows[0]?.empCode, "NA");
});

test("daily attendance service performs one bounded merge per collection", async () => {
  const calls: string[] = [];
  attendanceRepository.listActivePayrollTeam = async (outletId) => {
    calls.push(`team:${outletId}`);
    return team.slice(0, 1);
  };
  attendanceRepository.listAttendanceForDay = async (outletId, dayId) => {
    calls.push(`attendance:${outletId}:${dayId}`);
    return [];
  };
  attendanceRepository.listLeaveCandidatesForDay = async (outletId, dayStart) => {
    calls.push(`leaves:${outletId}:${dayStart}`);
    return [];
  };

  const result = await attendanceService.getDaily({
    outletId: "outlet-1",
    date: Date.parse("2026-08-25T10:00:00.000+05:30"),
  });

  assert.deepEqual(calls.sort(), [
    "attendance:outlet-1:25-08-2026",
    `leaves:outlet-1:${Date.parse("2026-08-25T00:00:00.000+05:30")}`,
    "team:outlet-1",
  ]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.attendanceStatus, "ABSENT");
  assert.equal(result.team.length, 1);
});

test("monthly attendance service scopes every query to the requested outlet and month", async () => {
  const calls: string[] = [];
  attendanceRepository.listActivePayrollTeam = async (outletId) => {
    calls.push(`team:${outletId}`);
    return team.slice(0, 1);
  };
  attendanceRepository.listAttendanceForDays = async (outletId, dayIds) => {
    calls.push(
      `attendance:${outletId}:${dayIds[0]}:${dayIds.at(-1)}:${dayIds.length}`,
    );
    return [
      {
        id: "attendance-1",
        data: { dayId: "01-08-2026", isPresent: true, userId: "user-1" },
      },
    ];
  };
  attendanceRepository.listLeaveCandidatesForMonth = async (
    outletId,
    monthStart,
    monthEnd,
  ) => {
    calls.push(`leaves:${outletId}:${monthStart}:${monthEnd}`);
    return [];
  };
  attendanceRepository.listActiveHolidaysForYear = async (outletId, year) => {
    calls.push(`holidays:${outletId}:${year}`);
    return [
      {
        id: "august",
        dateString: "2026-08-15",
        isActive: true,
        year: "2026",
      },
      {
        id: "september",
        dateString: "2026-09-01",
        isActive: true,
        year: "2026",
      },
    ];
  };
  attendanceRepository.listActiveSalaries = async (outletId) => {
    calls.push(`salaries:${outletId}`);
    return [];
  };

  const result = await attendanceService.getMonthly({
    outletId: "outlet-1",
    month: "2026-08",
    includeSalary: true,
  });

  assert.deepEqual(calls.sort(), [
    "attendance:outlet-1:01-08-2026:31-08-2026:31",
    "holidays:outlet-1:2026",
    `leaves:outlet-1:${Date.parse("2026-08-01T00:00:00.000+05:30")}:${Date.parse("2026-09-01T00:00:00.000+05:30") - 1}`,
    "salaries:outlet-1",
    "team:outlet-1",
  ]);
  assert.deepEqual(result.attendance, [
    {
      id: "attendance-1",
      dayId: "01-08-2026",
      isPresent: true,
      userId: "user-1",
    },
  ]);
  assert.deepEqual(result.holidays.map((holiday) => holiday.id), ["august"]);
});

test("synthetic leave and absent rows cannot be deleted as attendance docs", async () => {
  await assert.rejects(
    attendanceService.deleteAttendance("outlet-1", "user-1_absent"),
    { message: "Only saved attendance records can be deleted" },
  );
});

test("attendance delete calls the repository for saved attendance docs", async () => {
  let deleted: string | undefined;
  attendanceRepository.deleteAttendance = async (_outletId, attendanceId) => {
    deleted = attendanceId;
  };

  const result = await attendanceService.deleteAttendance(
    "outlet-1",
    "attendance-1",
  );

  assert.deepEqual(result, { id: "attendance-1" });
  assert.equal(deleted, "attendance-1");
});
