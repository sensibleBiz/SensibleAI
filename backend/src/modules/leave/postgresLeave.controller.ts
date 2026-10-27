import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import type {
  HolidayCreateInput, HolidayListQuery, HolidayUpdateInput, LeaveBalanceHistoryQuery,
  LeaveBalanceQuery, LeaveBalanceUpdateInput, LeaveListQuery, LeaveRequestCreateInput,
  LeaveStatusInput, LeaveTypeCreateInput, LeaveTypeListQuery,
} from "../../types/leave.types.js";
import { postgresLeaveService } from "./postgresLeave.service.js";

const context = (request: Request) => {
  if (!request.postgresAuth || !request.database) {
    throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  }
  return { auth: request.postgresAuth, database: request.database };
};

export const getPostgresLeaveTypes = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresLeaveService.listTypes(database, auth.tenantId, auth.userId, request.validated?.query as LeaveTypeListQuery);
  response.json({ success: true, data: result });
};

export const createPostgresLeaveType = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresLeaveService.createType(database, auth.tenantId, auth.userId, request.validated?.body as LeaveTypeCreateInput);
  response.status(201).json({ success: true, data: result });
};

export const listPostgresLeaves = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresLeaveService.list(database, auth.tenantId, auth.userId, request.validated?.query as LeaveListQuery);
  response.json({ success: true, data: result });
};

export const transitionPostgresLeaveStatus = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const leaveId = String((request.validated?.params as { leaveId: string }).leaveId);
  const result = await postgresLeaveService.transitionStatus(
    database, auth.tenantId, auth.userId, leaveId, request.validated?.body as LeaveStatusInput,
  );
  response.json({ success: true, data: result });
};

export const listPostgresLeaveBalances = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresLeaveService.listBalances(database, auth.tenantId, auth.userId, request.validated?.query as LeaveBalanceQuery);
  response.json({ success: true, data: result });
};

export const updatePostgresLeaveBalance = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const userId = String((request.validated?.params as { userId: string }).userId);
  const result = await postgresLeaveService.updateBalance(database, auth.tenantId, auth.userId, userId, request.validated?.body as LeaveBalanceUpdateInput);
  response.json({ success: true, data: result });
};

export const getPostgresLeaveBalanceHistory = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const userId = String((request.validated?.params as { userId: string }).userId);
  const result = await postgresLeaveService.balanceHistory(database, auth.tenantId, auth.userId, userId, request.validated?.query as LeaveBalanceHistoryQuery);
  response.json({ success: true, data: result });
};

export const listPostgresHolidays = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresLeaveService.listHolidays(database, auth.tenantId, auth.userId, request.validated?.query as HolidayListQuery);
  response.json({ success: true, data: result });
};

export const createPostgresHoliday = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresLeaveService.createHoliday(database, auth.tenantId, auth.userId, request.validated?.body as HolidayCreateInput);
  response.status(201).json({ success: true, data: result });
};

export const updatePostgresHoliday = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const holidayId = String((request.validated?.params as { holidayId: string }).holidayId);
  const result = await postgresLeaveService.updateHoliday(database, auth.tenantId, auth.userId, holidayId, request.validated?.body as HolidayUpdateInput);
  response.json({ success: true, data: result });
};

export const deletePostgresHoliday = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const holidayId = String((request.validated?.params as { holidayId: string }).holidayId);
  const outletId = String((request.validated?.query as { outletId: string }).outletId);
  const result = await postgresLeaveService.deleteHoliday(database, auth.tenantId, auth.userId, outletId, holidayId);
  response.json({ success: true, data: result });
};

export const createPostgresLeaveRequest = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresLeaveService.createRequest(database, auth.tenantId, auth.userId, request.validated?.body as LeaveRequestCreateInput);
  response.status(201).json({ success: true, data: result });
};
