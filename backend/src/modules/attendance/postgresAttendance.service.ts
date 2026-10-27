import { v7 as uuidv7 } from "uuid";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { buildDailyAttendanceRows } from "./attendanceHelpers.js";
import type {
  AttendanceDailyQuery,
  AttendanceDailyResult,
  AttendanceDeleteResult,
  AttendanceMonthlyQuery,
  AttendanceMonthlyResult,
  AttendanceTeamMember,
} from "../../types/attendance.types.js";
import { PostgresAuthorizationRepository, postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import { PostgresTeamRepository, postgresTeamRepository } from "../team/postgresTeam.repository.js";
import type { PostgresAttendanceEventInput } from "./attendance.types.js";
import { PostgresAttendanceRepository, postgresAttendanceRepository } from "./postgresAttendance.repository.js";
import { postgresPayrollService } from "../payroll/postgresPayroll.service.js";

const ATTENDANCE_TIME_ZONE = "Asia/Kolkata";

const formatDayId = (timestamp: number) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ATTENDANCE_TIME_ZONE,
  }).formatToParts(new Date(timestamp));
  const readPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${readPart("day")}-${readPart("month")}-${readPart("year")}`;
};

const dayBounds = (timestamp: number) => {
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: ATTENDANCE_TIME_ZONE,
    year: "numeric",
  });
  const localDate = dateFormatter.format(new Date(timestamp));
  return {
    start: Date.parse(`${localDate}T00:00:00.000+05:30`),
    end: Date.parse(`${localDate}T23:59:59.999+05:30`),
  };
};

const monthDetails = (month: string) => {
  const yearText = month.slice(0, 4);
  const monthText = month.slice(5, 7);
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const nextMonthYear = monthNumber === 12 ? year + 1 : year;
  const nextMonthNumber = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextMonth = `${nextMonthYear}-${String(nextMonthNumber).padStart(2, "0")}`;
  return {
    dayIds: Array.from({ length: daysInMonth }, (_, index) =>
      `${String(index + 1).padStart(2, "0")}-${monthText}-${yearText}`),
    end: Date.parse(`${nextMonth}-01T00:00:00.000+05:30`) - 1,
    start: Date.parse(`${month}-01T00:00:00.000+05:30`),
    year: yearText,
  };
};

const toAttendanceTeamMember = (member: {
  id: string; userId: string; userName: string; empCode: string; department: string;
  isActive: boolean; isOnPayRoll: boolean; teamHeadProfileId: string | null;
}): AttendanceTeamMember => ({
  id: member.id,
  userProfileId: member.userId,
  userName: member.userName,
  empCode: member.empCode,
  department: member.department,
  isActive: member.isActive,
  isOnPayRoll: member.isOnPayRoll,
  teamHeadProfileId: member.teamHeadProfileId ?? "",
});

export class PostgresAttendanceService {
  constructor(
    private readonly repository: PostgresAttendanceRepository = postgresAttendanceRepository,
    private readonly team: PostgresTeamRepository = postgresTeamRepository,
    private readonly authorization: PostgresAuthorizationRepository = postgresAuthorizationRepository,
  ) {}

  private async requirePermission(database: TransactionDatabase, tenantId: string, userId: string, outletId: string, permission: string) {
    if (!await this.authorization.hasOutletPermission(database, userId, tenantId, outletId, permission)) {
      throw new AppError(403, `Permission denied for ${permission}`, "PERMISSION_DENIED");
    }
  }

  private async listPayrollTeam(database: TransactionDatabase, tenantId: string, userId: string, outletId: string) {
    await this.requirePermission(database, tenantId, userId, outletId, "attendance.read");
    const result = await this.team.list(database, tenantId, { outletId, active: true, limit: 500 });
    return result.items.filter((member) => member.isActive && member.isOnPayRoll).map(toAttendanceTeamMember);
  }

  async getDaily(database: TransactionDatabase, tenantId: string, userId: string, query: AttendanceDailyQuery): Promise<AttendanceDailyResult> {
    const dayId = formatDayId(query.date);
    const { start, end } = dayBounds(query.date);
    const [team, attendance, leaves] = await Promise.all([
      this.listPayrollTeam(database, tenantId, userId, query.outletId),
      this.repository.listForDay(database, tenantId, query.outletId, dayId),
      this.repository.listApprovedLeavesForRange(database, tenantId, query.outletId, start, end),
    ]);
    return {
      items: buildDailyAttendanceRows({ attendance, dayEnd: end, dayId, dayStart: start, leaves, team }),
      team,
    };
  }

  async getMonthly(database: TransactionDatabase, tenantId: string, userId: string, query: AttendanceMonthlyQuery): Promise<AttendanceMonthlyResult> {
    const { dayIds, end, start, year } = monthDetails(query.month);
    const [team, attendance, leaves, yearlyHolidays, salaries] = await Promise.all([
      this.listPayrollTeam(database, tenantId, userId, query.outletId),
      this.repository.listForDayIds(database, tenantId, query.outletId, dayIds),
      this.repository.listApprovedLeavesForRange(database, tenantId, query.outletId, start, end),
      this.repository.listHolidaysForYear(database, tenantId, query.outletId, year),
      query.includeSalary
        ? postgresPayrollService.listActiveSalarySummaries(database, tenantId, userId, query.outletId)
        : Promise.resolve([]),
    ]);
    const holidays = yearlyHolidays.filter((holiday) => {
      if (holiday.dateString) return holiday.dateString.startsWith(`${query.month}-`);
      return typeof holiday.date === "number" && holiday.date >= start && holiday.date <= end;
    });
    return {
      attendance: attendance.map((record) => ({ ...record.data, id: record.id })),
      holidays,
      leaves,
      salaries,
      team,
    };
  }

  async deleteAttendance(database: TransactionDatabase, tenantId: string, userId: string, outletId: string, attendanceId: string): Promise<AttendanceDeleteResult> {
    await this.requirePermission(database, tenantId, userId, outletId, "attendance.delete");
    if (attendanceId.endsWith("_leave") || attendanceId.endsWith("_absent")) {
      throw new AppError(400, "Only saved attendance records can be deleted", "ATTENDANCE_RECORD_NOT_SAVED");
    }
    await this.repository.deleteDaily(database, tenantId, outletId, attendanceId);
    return { id: attendanceId };
  }

  async ingestEvent(database: TransactionDatabase, tenantId: string, actorId: string, input: PostgresAttendanceEventInput) {
    await this.requirePermission(database, tenantId, actorId, input.outletId, "attendance.events.ingest");
    const businessId = await this.repository.resolveOutletBusiness(database, tenantId, input.outletId);
    if (!businessId) throw new AppError(404, "Outlet not found", "OUTLET_NOT_FOUND");
    if (!await this.authorization.hasOutletAccess(database, input.userId, tenantId, input.outletId)) {
      throw new AppError(400, "User is inactive or does not belong to this outlet", "INVALID_ATTENDANCE_USER");
    }
    const eventAtMs = input.timestamp;
    const dayId = formatDayId(eventAtMs);
    const monthId = `${dayId.slice(6, 10)}-${dayId.slice(3, 5)}`;
    const yearId = dayId.slice(6, 10);
    await this.repository.insertEvent(database, {
      id: uuidv7(),
      tenantId,
      businessId,
      outletId: input.outletId,
      userId: input.userId,
      deviceId: input.deviceId,
      deviceUserId: input.deviceUserId ?? null,
      eventType: input.eventType,
      eventAt: new Date(eventAtMs),
      source: input.source ?? "BIOMETRIC",
      externalEventId: input.externalEventId ?? null,
    });
    const member = (await this.team.get(database, tenantId, input.outletId, input.userId))[0];
    await this.repository.upsertDailyFromPunch(database, {
      id: uuidv7(),
      tenantId,
      businessId,
      outletId: input.outletId,
      userId: input.userId,
      dayId,
      monthId,
      yearId,
      checkInTime: input.eventType === "IN" ? eventAtMs : null,
      checkOutTime: input.eventType === "OUT" ? eventAtMs : null,
      empCode: member?.empCode ?? "",
      userName: member?.userName ?? "",
      details: { source: input.source ?? "BIOMETRIC", deviceId: input.deviceId, txnId: input.externalEventId },
      eventType: input.eventType,
    });
    return { accepted: true };
  }
}

export const postgresAttendanceService = new PostgresAttendanceService();
