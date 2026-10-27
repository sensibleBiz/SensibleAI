import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { mapLeaveItem, mapLeaveTypeItem } from "./leaveHelpers.js";
import type {
  LeaveListQuery,
  LeaveListResult,
  HolidayCreateInput,
  HolidayItem,
  HolidayListQuery,
  HolidayUpdateInput,
  LeaveBalanceHistoryItem,
  LeaveBalanceHistoryQuery,
  LeaveBalanceItem,
  LeaveBalanceQuery,
  LeaveBalanceUpdateInput,
  LeaveRequestCreateInput,
  LeaveStatusInput,
  LeaveTransitionResult,
  LeaveTypeCreateInput,
  LeaveTypeCreateResult,
  LeaveTypeListQuery,
  LeaveTypeListResult,
} from "../../types/leave.types.js";
import { PostgresAuthorizationRepository, postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import { PostgresLeaveRepository, postgresLeaveRepository } from "./postgresLeave.repository.js";

const monthBounds = (month: string) => {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const nextMonthYear = monthNumber === 12 ? year + 1 : year;
  const nextMonthNumber = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextMonth = `${nextMonthYear}-${String(nextMonthNumber).padStart(2, "0")}`;
  return {
    start: Date.parse(`${month}-01T00:00:00.000+05:30`),
    end: Date.parse(`${nextMonth}-01T00:00:00.000+05:30`) - 1,
  };
};

const previousMonth = (month: string) => {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const previousYear = monthNumber === 1 ? year - 1 : year;
  const previousMonthNumber = monthNumber === 1 ? 12 : monthNumber - 1;
  return `${previousYear}-${String(previousMonthNumber).padStart(2, "0")}`;
};

const encodeCursor = (cursor: { id: string; createdDate: number }) =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

export class PostgresLeaveService {
  constructor(
    private readonly repository: PostgresLeaveRepository = postgresLeaveRepository,
    private readonly authorization: PostgresAuthorizationRepository = postgresAuthorizationRepository,
  ) {}

  private async requirePermission(database: TransactionDatabase, tenantId: string, userId: string, outletId: string, permission: string) {
    if (!await this.authorization.hasOutletPermission(database, userId, tenantId, outletId, permission)) {
      throw new AppError(403, `Permission denied for ${permission}`, "PERMISSION_DENIED");
    }
  }

  private async requireAnyPermission(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    permissions: readonly string[],
  ) {
    for (const permission of permissions) {
      if (await this.authorization.hasOutletPermission(database, userId, tenantId, outletId, permission)) {
        return;
      }
    }
    throw new AppError(403, `Permission denied for ${permissions.join(" or ")}`, "PERMISSION_DENIED");
  }

  async listTypes(database: TransactionDatabase, tenantId: string, userId: string, query: LeaveTypeListQuery): Promise<LeaveTypeListResult> {
    await this.requirePermission(database, tenantId, userId, query.outletId, "leave.read");
    const businessId = await this.repository.resolveOutletBusiness(database, tenantId, query.outletId);
    if (!businessId) throw new AppError(404, "Outlet not found", "OUTLET_NOT_FOUND");
    await this.repository.ensureDefaultLeaveTypes(database, tenantId, query.outletId, businessId);
    const documents = await this.repository.listLeaveTypes(database, tenantId, query.outletId);
    return {
      items: documents.map(mapLeaveTypeItem).filter((item) => item.name && item.shortCode).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async createType(database: TransactionDatabase, tenantId: string, userId: string, input: LeaveTypeCreateInput): Promise<LeaveTypeCreateResult> {
    await this.requirePermission(database, tenantId, userId, input.outletId, "leave.create");
    const businessId = await this.repository.resolveOutletBusiness(database, tenantId, input.outletId);
    if (!businessId) throw new AppError(404, "Outlet not found", "OUTLET_NOT_FOUND");
    const normalizedInput = {
      ...input,
      name: input.name.trim().toUpperCase(),
      shortCode: input.shortCode.trim().toUpperCase(),
    };
    const document = await this.repository.createLeaveType(database, tenantId, businessId, normalizedInput);
    if (!document) throw new AppError(409, "A leave type with this name or short code already exists", "LEAVE_TYPE_EXISTS");
    return { item: mapLeaveTypeItem(document) };
  }

  async list(database: TransactionDatabase, tenantId: string, userId: string, query: LeaveListQuery): Promise<LeaveListResult> {
    await this.requirePermission(database, tenantId, userId, query.outletId, "leave.read");
    const selectedMonthRange = monthBounds(query.month);
    const dateRange = query.status === "REQUESTED"
      ? { start: monthBounds(previousMonth(query.month)).start, end: selectedMonthRange.end }
      : selectedMonthRange;
    const batchSize = Math.min(100, Math.max(query.limit * 3, 30));
    const matches = [];
    let scanCursor = query.cursor
      ? JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")) as { id: string; createdDate: number }
      : undefined;
    let exhausted = false;
    while (matches.length <= query.limit && !exhausted) {
      const documents = await this.repository.listMonthBatch(
        database, tenantId, query, dateRange.start, dateRange.end, scanCursor, batchSize,
      );
      exhausted = documents.length < batchSize;
      for (const document of documents) {
        scanCursor = document.cursor;
        if (document.data.status === query.status) {
          matches.push(document);
          if (matches.length > query.limit) break;
        }
      }
      if (documents.length === 0) exhausted = true;
    }
    const hasMore = matches.length > query.limit;
    const page = matches.slice(0, query.limit);
    const nextCursor = hasMore ? page.at(-1)?.cursor : undefined;
    return {
      items: page.map(mapLeaveItem),
      nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
    };
  }

  async transitionStatus(
    database: TransactionDatabase,
    tenantId: string,
    actorId: string,
    leaveId: string,
    input: LeaveStatusInput,
  ): Promise<LeaveTransitionResult> {
    await this.requirePermission(database, tenantId, actorId, input.outletId, "leave.manage");
    const document = await this.repository.transitionStatus(
      database, tenantId, input.outletId, leaveId, { remark: input.remark, status: input.status }, actorId, Date.now(),
    );
    if (!document) throw new AppError(404, "Leave application not found", "LEAVE_NOT_FOUND");
    return { item: mapLeaveItem(document) };
  }

  async listBalances(
    database: TransactionDatabase, tenantId: string, actorId: string, query: LeaveBalanceQuery,
  ): Promise<{ items: LeaveBalanceItem[] }> {
    if (query.userId === actorId) {
      if (!await this.authorization.hasOutletAccess(database, actorId, tenantId, query.outletId)) {
        throw new AppError(403, "Outlet access denied", "PERMISSION_DENIED");
      }
    } else {
      await this.requireAnyPermission(
        database,
        tenantId,
        actorId,
        query.outletId,
        ["attendance.read", "leave.manage"],
      );
    }
    return { items: await this.repository.listBalances(database, tenantId, query) };
  }

  async updateBalance(
    database: TransactionDatabase, tenantId: string, actorId: string, userId: string, input: LeaveBalanceUpdateInput,
  ): Promise<{ item: LeaveBalanceItem }> {
    await this.requirePermission(database, tenantId, actorId, input.outletId, "leave.manage");
    const item = await this.repository.updateBalance(database, tenantId, actorId, userId, input);
    if (!item) throw new AppError(404, "Active employee not found in outlet", "LEAVE_EMPLOYEE_NOT_FOUND");
    return { item };
  }

  async balanceHistory(
    database: TransactionDatabase, tenantId: string, actorId: string, userId: string, query: LeaveBalanceHistoryQuery,
  ): Promise<{ items: LeaveBalanceHistoryItem[] }> {
    if (userId === actorId) {
      if (!await this.authorization.hasOutletAccess(database, actorId, tenantId, query.outletId)) {
        throw new AppError(403, "Outlet access denied", "PERMISSION_DENIED");
      }
    } else {
      await this.requireAnyPermission(
        database,
        tenantId,
        actorId,
        query.outletId,
        ["attendance.read", "leave.manage"],
      );
    }
    return { items: await this.repository.listBalanceHistory(database, tenantId, query.outletId, userId, query.year, query.limit) };
  }

  async listHolidays(
    database: TransactionDatabase, tenantId: string, actorId: string, query: HolidayListQuery,
  ): Promise<{ items: HolidayItem[] }> {
    await this.requirePermission(database, tenantId, actorId, query.outletId, "leave.read");
    return { items: await this.repository.listHolidays(database, tenantId, query.outletId, query.year) };
  }

  async createHoliday(
    database: TransactionDatabase, tenantId: string, actorId: string, input: HolidayCreateInput,
  ): Promise<{ item: HolidayItem }> {
    await this.requirePermission(database, tenantId, actorId, input.outletId, "leave.manage");
    const businessId = await this.repository.resolveOutletBusiness(database, tenantId, input.outletId);
    if (!businessId) throw new AppError(404, "Outlet not found", "OUTLET_NOT_FOUND");
    try {
      return { item: await this.repository.createHoliday(database, tenantId, businessId, input) };
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        throw new AppError(409, "An active holiday already exists on this date", "HOLIDAY_DATE_EXISTS");
      }
      throw error;
    }
  }

  async updateHoliday(
    database: TransactionDatabase, tenantId: string, actorId: string, holidayId: string, input: HolidayUpdateInput,
  ): Promise<{ item: HolidayItem }> {
    await this.requirePermission(database, tenantId, actorId, input.outletId, "leave.manage");
    try {
      const item = await this.repository.updateHoliday(database, tenantId, holidayId, input);
      if (!item) throw new AppError(404, "Holiday not found", "HOLIDAY_NOT_FOUND");
      return { item };
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        throw new AppError(409, "An active holiday already exists on this date", "HOLIDAY_DATE_EXISTS");
      }
      throw error;
    }
  }

  async deleteHoliday(
    database: TransactionDatabase, tenantId: string, actorId: string, outletId: string, holidayId: string,
  ): Promise<{ id: string }> {
    await this.requirePermission(database, tenantId, actorId, outletId, "leave.manage");
    if (!await this.repository.deleteHoliday(database, tenantId, outletId, holidayId)) {
      throw new AppError(404, "Holiday not found", "HOLIDAY_NOT_FOUND");
    }
    return { id: holidayId };
  }

  async createRequest(
    database: TransactionDatabase, tenantId: string, actorId: string, input: LeaveRequestCreateInput,
  ): Promise<{ item: ReturnType<typeof mapLeaveItem> }> {
    if (!await this.authorization.hasOutletAccess(database, actorId, tenantId, input.outletId)) {
      throw new AppError(403, "Outlet access denied", "PERMISSION_DENIED");
    }
    if (input.fromDate > input.toDate) throw new AppError(400, "fromDate must be before or equal to toDate", "INVALID_LEAVE_DATES");
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
    const from = formatter.format(new Date(input.fromDate));
    const to = formatter.format(new Date(input.toDate));
    const fromYear = Number(from.slice(0, 4));
    if (fromYear !== Number(to.slice(0, 4))) throw new AppError(400, "A leave request cannot cross calendar years", "CROSS_YEAR_LEAVE");
    const calendarDays = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
    if (calendarDays < 1 || calendarDays > 366) throw new AppError(400, "Invalid leave date range", "INVALID_LEAVE_DATES");
    if (input.duration === "Half Day" && calendarDays !== 1) {
      throw new AppError(400, "Half-day leave must be for one calendar date", "INVALID_LEAVE_DURATION");
    }
    const requestContext = await this.repository.getRequestContext(database, tenantId, input.outletId, actorId, input.leaveTypeId);
    if (!requestContext) throw new AppError(400, "Employee or leave type is not active in this outlet", "INVALID_LEAVE_REQUEST_SCOPE");
    const document = await this.repository.createRequest(database, tenantId, actorId, input, {
      ...requestContext,
      noDays: input.duration === "Half Day" ? 0.5 : calendarDays,
      dayId: from,
      monthId: from.slice(0, 7),
      year: fromYear,
    });
    return { item: mapLeaveItem(document) };
  }
}

export const postgresLeaveService = new PostgresLeaveService();
