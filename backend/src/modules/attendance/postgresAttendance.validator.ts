import { z } from "zod";
import {
  attendanceDailyQuerySchema,
  attendanceDeleteQuerySchema,
  attendanceIdParamsSchema,
  attendanceMonthlyQuerySchema,
} from "../../validators/attendance.validator.js";

const uuid = (name: string) => z.string().trim().uuid(`${name} must be a PostgreSQL UUID`);

export const postgresAttendanceDailyQuerySchema = attendanceDailyQuerySchema
  .extend({ outletId: uuid("outletId") })
  .strict();

export const postgresAttendanceMonthlyQuerySchema = attendanceMonthlyQuerySchema
  .extend({ outletId: uuid("outletId") })
  .strict();

export const postgresAttendanceDeleteQuerySchema = attendanceDeleteQuerySchema
  .extend({ outletId: uuid("outletId") })
  .strict();

export const postgresAttendanceIdParamsSchema = attendanceIdParamsSchema.extend({
  attendanceId: uuid("attendanceId"),
}).strict();

export const postgresAttendanceEventSchema = z.object({
  outletId: uuid("outletId"),
  userId: uuid("userId"),
  deviceId: z.string().trim().min(1).max(200),
  deviceUserId: z.string().trim().max(200).optional(),
  eventType: z.enum(["IN", "OUT"]),
  timestamp: z.coerce.number().int().nonnegative(),
  source: z.string().trim().max(100).optional(),
  externalEventId: z.string().trim().max(1500).optional(),
}).strict();
