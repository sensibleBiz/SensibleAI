import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildDailyAttendanceRows } from "../src/modules/attendance/attendanceHelpers.js";
import type { AttendanceRecordDocument, AttendanceTeamMember } from "../src/types/attendance.types.js";
import { calculateLeaveBalanceAdjustment } from "../src/modules/leave/leaveHelpers.js";
import { postgresAttendanceEventSchema } from "../src/modules/attendance/postgresAttendance.validator.js";
import { postgresBiometricTransactionsSchema } from "../src/modules/attendance/postgresBiometric.validator.js";
import {
  postgresHolidayCreateBodySchema,
  postgresLeaveBalanceUpdateBodySchema,
  postgresLeaveRequestCreateBodySchema,
} from "../src/modules/leave/postgresLeave.validator.js";
import { PostgresLeaveService } from "../src/modules/leave/postgresLeave.service.js";
import type { PostgresLeaveRepository } from "../src/modules/leave/postgresLeave.repository.js";
import type { PostgresAuthorizationRepository } from "../src/modules/authorization/postgresAuthorization.repository.js";
import type { TransactionDatabase } from "../src/db/context.js";

test("B7 PostgreSQL attendance and leave routers are mounted; legacy routers removed", async () => {
  const routes = await readFile(new URL("../src/routes/index.ts", import.meta.url), "utf8");
  assert.match(routes, /apiRouter\.use\("\/attendance", postgresAttendanceRouter\)/);
  assert.match(routes, /apiRouter\.use\("\/leave", postgresLeaveRouter\)/);
  assert.doesNotMatch(routes, /apiRouter\.use\("\/attendance", attendanceRouter\)/);
  assert.doesNotMatch(routes, /apiRouter\.use\("\/attendance\/leaves", leaveRouter\)/);
});

test("B7 migration defines attendance/leave tables with RLS and no Firestore migration", async () => {
  const migration = await readFile(new URL("../migrations/0008_phase_b7_attendance_leave.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE crm\.attendance_daily/);
  assert.match(migration, /CREATE TABLE crm\.attendance_events/);
  assert.match(migration, /CREATE TABLE crm\.leave_requests/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /attendance_events_idempotency_idx/);
  assert.doesNotMatch(migration, /backfill|\betl\b|synchroni[sz]e|firestore/i);
});

test("B7 daily attendance rows preserve present, leave, and absent semantics", () => {
  const team: AttendanceTeamMember[] = [{
    id: "team-1", userProfileId: "user-1", userName: "User One", empCode: "E1", isActive: true, isOnPayRoll: true,
  }];
  const attendance: AttendanceRecordDocument[] = [{
    id: "att-1",
    data: { userId: "user-1", empCode: "E1", userName: "User One" },
  }];
  const rows = buildDailyAttendanceRows({
    attendance,
    dayEnd: 100,
    dayId: "01-01-2026",
    dayStart: 0,
    leaves: [],
    team,
  });
  assert.equal(rows[0]?.attendanceStatus, "PRESENT");
});

test("B7 leave balance adjustment remains idempotent on approval transitions", () => {
  assert.deepEqual(
    calculateLeaveBalanceAdjustment({ currentStatus: "APPROVED", nextStatus: "APPROVED", noDays: 2, totalLeaves: 10, usedLeaves: 2 }),
    null,
  );
  assert.deepEqual(
    calculateLeaveBalanceAdjustment({ currentStatus: "REQUESTED", nextStatus: "APPROVED", noDays: 2, totalLeaves: 10, usedLeaves: 1 }),
    { usedLeaves: 3, remainingLeaves: 7 },
  );
});

test("B7 biometric transactions router mounts on dedicated machine-ingest path", async () => {
  const routes = await readFile(new URL("../src/routes/index.ts", import.meta.url), "utf8");
  assert.ok(routes.includes('apiRouter.use("/attendance/biometric", postgresBiometricRouter)'));
});

test("B7 MINOP biometric router mounts on /biometric for device protocol; legacy gateway removed", async () => {
  const routes = await readFile(new URL("../src/routes/index.ts", import.meta.url), "utf8");
  assert.ok(routes.includes('apiRouter.use("/biometric", minopBiometricRouter)'));
  assert.doesNotMatch(routes, /legacyAttendanceGatewayRouter/);
});

test("B7 biometric transactions schema accepts MINOP-shaped trans payloads", () => {
  const parsed = postgresBiometricTransactionsSchema.safeParse({
    outletId: "550e8400-e29b-41d4-a716-446655440000",
    trans: [{
      txnId: "1001",
      punchId: "9768",
      mode: "IN",
      txnDateTime: "2026-09-17 09:15:00",
      dvcId: "device-1",
    }],
  });
  assert.equal(parsed.success, true);
});

test("B7 attendance event ingestion schema requires PostgreSQL UUID scope", () => {
  assert.equal(
    postgresAttendanceEventSchema.safeParse({
      outletId: "not-a-uuid",
      userId: "not-a-uuid",
      deviceId: "device-1",
      eventType: "IN",
      timestamp: Date.now(),
    }).success,
    false,
  );
});

test("B7 closeout exposes PostgreSQL balance, holiday, and request routes", async () => {
  const routes = await readFile(new URL("../src/modules/leave/postgresLeave.routes.ts", import.meta.url), "utf8");
  assert.match(routes, /get\("\/balances"/);
  assert.match(routes, /patch\("\/balances\/:userId"/);
  assert.match(routes, /get\("\/holidays"/);
  assert.match(routes, /post\("\/holidays"/);
  assert.match(routes, /post\("\/requests"/);
});

test("B7 balance readers can use attendance access without receiving allocation write access", async () => {
  const checkedPermissions: string[] = [];
  let updateCalled = false;
  const repository = {
    listBalances: async () => [],
    updateBalance: async () => {
      updateCalled = true;
      return null;
    },
  } as unknown as PostgresLeaveRepository;
  const authorization = {
    hasOutletPermission: async (
      _database: TransactionDatabase,
      _userId: string,
      _tenantId: string,
      _outletId: string,
      permission: string,
    ) => {
      checkedPermissions.push(permission);
      return permission === "attendance.read";
    },
  } as unknown as PostgresAuthorizationRepository;
  const service = new PostgresLeaveService(repository, authorization);
  const database = {} as TransactionDatabase;

  assert.deepEqual(
    await service.listBalances(database, "tenant", "actor", {
      outletId: "outlet",
      year: 2026,
    }),
    { items: [] },
  );
  assert.deepEqual(checkedPermissions, ["attendance.read"]);

  await assert.rejects(
    service.updateBalance(database, "tenant", "actor", "employee", {
      outletId: "outlet",
      year: 2026,
      totalLeaves: 24,
      reason: "Annual allocation",
    }),
    (error: unknown) =>
      error instanceof Error &&
      "statusCode" in error &&
      error.statusCode === 403,
  );
  assert.equal(updateCalled, false);
});

test("B7 closeout validators require UUID scope and valid leave/holiday data", () => {
  const outletId = "550e8400-e29b-41d4-a716-446655440000";
  const leaveTypeId = "550e8400-e29b-41d4-a716-446655440001";
  assert.equal(postgresLeaveBalanceUpdateBodySchema.safeParse({
    outletId, year: 2026, totalLeaves: 24, reason: "Annual allocation",
  }).success, true);
  assert.equal(postgresHolidayCreateBodySchema.safeParse({
    outletId, title: "Diwali", date: "2026-11-08", type: "NATIONAL",
    isPaid: true, description: "", applicableStates: [], applicableOutlets: [],
  }).success, true);
  assert.equal(postgresLeaveRequestCreateBodySchema.safeParse({
    outletId, leaveTypeId, fromDate: 1794096000000, toDate: 1794096000000,
    duration: "Full Day", leaveNote: "Family event",
  }).success, true);
});

test("B7 leave balance and holiday UI no longer import Firestore", async () => {
  for (const relativePath of [
    "../../src/features/leave/hooks/useLeaveBalance.ts",
    "../../src/features/leave/pages/LeaveBalancePage.tsx",
    "../../src/features/leave/pages/HolidayCalender.tsx",
  ]) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, /firebaseService|subscribeToSubCollection|COLLECTION_NAME/);
    assert.match(source, /leaveApi|useLeaveBalance/);
  }
});

test("B7 leave pages tolerate PostgreSQL session restoration before the user is populated", async () => {
  const teamTreeHook = await readFile(new URL("../../src/features/team/hooks/useTeamTree.ts", import.meta.url), "utf8");
  const leaveBalanceHook = await readFile(new URL("../../src/features/leave/hooks/useLeaveBalance.ts", import.meta.url), "utf8");
  const applyLeavePage = await readFile(new URL("../../src/features/leave/pages/ApplyLeavePage.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(teamTreeHook, /auth\.user\.id/);
  assert.doesNotMatch(applyLeavePage, /auth\.user\.id/);
  assert.match(teamTreeHook, /auth\.user\?\.id/);
  assert.match(applyLeavePage, /enabled: Boolean\(userId\)/);
  assert.match(leaveBalanceHook, /if \(!enabled \|\| !outletId\)/);
});

test("B7 closeout migration adds balance ledger and holiday fields", async () => {
  const migration = await readFile(new URL("../migrations/0010_phase_b7_closeout.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS crm\.leave_balance_entries/);
  assert.match(migration, /holiday_type/);
  assert.match(migration, /leave_type_id/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
});
