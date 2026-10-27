import { z } from "zod";
import {
  leaveIdParamsSchema,
  leaveListQuerySchema,
  leaveStatusBodySchema,
  leaveTypeCreateBodySchema,
  leaveTypeListQuerySchema,
  leaveBalanceHistoryQuerySchema,
  leaveBalanceQuerySchema,
  leaveBalanceUpdateBodySchema,
  leaveBalanceUserParamsSchema,
  holidayCreateBodySchema,
  holidayIdParamsSchema,
  holidayListQuerySchema,
  holidayUpdateBodySchema,
  leaveRequestCreateBodySchema,
} from "../../validators/leave.validator.js";

const uuid = (name: string) => z.string().trim().uuid(`${name} must be a PostgreSQL UUID`);

export const postgresLeaveTypeListQuerySchema = leaveTypeListQuerySchema.extend({ outletId: uuid("outletId") }).strict();
export const postgresLeaveTypeCreateBodySchema = leaveTypeCreateBodySchema.extend({ outletId: uuid("outletId") }).strict();
export const postgresLeaveListQuerySchema = leaveListQuerySchema.extend({ outletId: uuid("outletId") }).strict();
export const postgresLeaveIdParamsSchema = leaveIdParamsSchema.extend({ leaveId: uuid("leaveId") }).strict();
export const postgresLeaveStatusBodySchema = leaveStatusBodySchema.extend({ outletId: uuid("outletId") }).strict();
export const postgresLeaveBalanceQuerySchema = leaveBalanceQuerySchema.extend({ outletId: uuid("outletId"), userId: uuid("userId").optional() }).strict();
export const postgresLeaveBalanceUserParamsSchema = leaveBalanceUserParamsSchema.extend({ userId: uuid("userId") }).strict();
export const postgresLeaveBalanceUpdateBodySchema = leaveBalanceUpdateBodySchema.extend({ outletId: uuid("outletId") }).strict();
export const postgresLeaveBalanceHistoryQuerySchema = leaveBalanceHistoryQuerySchema.extend({ outletId: uuid("outletId") }).strict();
export const postgresHolidayListQuerySchema = holidayListQuerySchema.extend({ outletId: uuid("outletId") }).strict();
export const postgresHolidayCreateBodySchema = holidayCreateBodySchema.extend({ outletId: uuid("outletId"), applicableOutlets: z.array(uuid("applicableOutlets item")).max(100).default([]) }).strict();
export const postgresHolidayUpdateBodySchema = holidayUpdateBodySchema.extend({ outletId: uuid("outletId"), applicableOutlets: z.array(uuid("applicableOutlets item")).max(100).optional() }).strict();
export const postgresHolidayIdParamsSchema = holidayIdParamsSchema.extend({ holidayId: uuid("holidayId") }).strict();
export const postgresLeaveRequestCreateBodySchema = leaveRequestCreateBodySchema.extend({ outletId: uuid("outletId"), leaveTypeId: uuid("leaveTypeId") }).strict();
