import { z } from "zod";

const outletIdSchema = z.string().trim().min(1).max(1_500);
const documentIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(1_500)
  .regex(/^[^/]+$/, "Invalid document ID");

export const leaveListQuerySchema = z
  .object({
    outletId: outletIdSchema,
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must use YYYY-MM format"),
    status: z.enum(["REQUESTED", "APPROVED", "REJECTED"]),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    cursor: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();

export const leaveIdParamsSchema = z
  .object({ leaveId: documentIdSchema })
  .strict();

export const leaveStatusBodySchema = z
  .object({
    outletId: outletIdSchema,
    status: z.enum(["APPROVED", "REJECTED"]),
    remark: z.string().trim().max(1_000).default(""),
  })
  .strict();

export const leaveTypeListQuerySchema = z
  .object({ outletId: outletIdSchema })
  .strict();

export const leaveTypeCreateBodySchema = z
  .object({
    outletId: outletIdSchema,
    name: z.string().trim().min(2).max(100),
    shortCode: z
      .string()
      .trim()
      .min(1)
      .max(10)
      .regex(/^[A-Za-z0-9]+$/, 'Short code can only contain letters and numbers'),
  })
  .strict();

export const leaveBalanceQuerySchema = z.object({
  outletId: outletIdSchema,
  year: z.coerce.number().int().min(2000).max(2200),
  userId: documentIdSchema.optional(),
}).strict();

export const leaveBalanceUserParamsSchema = z.object({ userId: documentIdSchema }).strict();
export const leaveBalanceUpdateBodySchema = z.object({
  outletId: outletIdSchema,
  year: z.number().int().min(2000).max(2200),
  totalLeaves: z.number().min(0).max(366),
  reason: z.string().trim().min(2).max(500),
}).strict();
export const leaveBalanceHistoryQuerySchema = z.object({
  outletId: outletIdSchema,
  year: z.coerce.number().int().min(2000).max(2200),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export const holidayListQuerySchema = z.object({
  outletId: outletIdSchema,
  year: z.string().regex(/^\d{4}$/),
}).strict();
const holidayTypeSchema = z.enum(["NATIONAL", "OPTIONAL", "REGIONAL"]);
export const holidayCreateBodySchema = z.object({
  outletId: outletIdSchema,
  title: z.string().trim().min(2).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: holidayTypeSchema.default("NATIONAL"),
  isPaid: z.boolean().default(true),
  description: z.string().trim().max(1000).default(""),
  applicableStates: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  applicableOutlets: z.array(documentIdSchema).max(100).default([]),
}).strict();
export const holidayUpdateBodySchema = holidayCreateBodySchema.partial().required({ outletId: true }).strict();
export const holidayIdParamsSchema = z.object({ holidayId: documentIdSchema }).strict();

export const leaveRequestCreateBodySchema = z.object({
  outletId: outletIdSchema,
  leaveTypeId: documentIdSchema,
  fromDate: z.number().int().nonnegative(),
  toDate: z.number().int().nonnegative(),
  duration: z.enum(["Full Day", "Half Day"]),
  leaveNote: z.string().trim().min(2).max(2000),
}).strict();
