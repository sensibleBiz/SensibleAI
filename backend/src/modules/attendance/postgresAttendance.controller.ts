import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import type { AttendanceDailyQuery, AttendanceMonthlyQuery } from "../../types/attendance.types.js";
import type { PostgresAttendanceEventInput } from "./attendance.types.js";
import { postgresAttendanceService } from "./postgresAttendance.service.js";

const context = (request: Request) => {
  if (!request.postgresAuth || !request.database) {
    throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  }
  return { auth: request.postgresAuth, database: request.database };
};

export const getPostgresDailyAttendance = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresAttendanceService.getDaily(
    database, auth.tenantId, auth.userId, request.validated?.query as AttendanceDailyQuery,
  );
  response.json({ success: true, data: result });
};

export const getPostgresMonthlyAttendance = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresAttendanceService.getMonthly(
    database, auth.tenantId, auth.userId, request.validated?.query as AttendanceMonthlyQuery,
  );
  response.json({ success: true, data: result });
};

export const deletePostgresAttendance = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const attendanceId = String((request.validated?.params as { attendanceId: string }).attendanceId);
  const outletId = String((request.validated?.query as { outletId: string }).outletId);
  const result = await postgresAttendanceService.deleteAttendance(database, auth.tenantId, auth.userId, outletId, attendanceId);
  response.json({ success: true, data: result });
};

export const ingestPostgresAttendanceEvent = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresAttendanceService.ingestEvent(
    database, auth.tenantId, auth.userId, request.validated?.body as PostgresAttendanceEventInput,
  );
  response.status(202).json({ success: true, data: result });
};
