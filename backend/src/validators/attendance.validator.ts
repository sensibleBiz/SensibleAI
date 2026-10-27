import { z } from "zod";

const dateValue = z.union([z.string(), z.number()]).transform((value, context) => {
  const rawValue = String(value).trim();
  const milliseconds = /^\d+$/.test(rawValue)
    ? Number(rawValue)
    : /^\d{4}-\d{2}-\d{2}$/.test(rawValue)
      ? Date.parse(`${rawValue}T00:00:00.000+05:30`)
      : Number.NaN;

  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Date must be a YYYY-MM-DD value or millisecond timestamp",
    });
    return z.NEVER;
  }

  return milliseconds;
});

export const attendanceDailyQuerySchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
    date: dateValue,
  })
  .strict();

export const attendanceMonthlyQuerySchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must use YYYY-MM format"),
    includeSalary: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .strict();

export const attendanceDeleteQuerySchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
  })
  .strict();

export const attendanceIdParamsSchema = z
  .object({
    attendanceId: z
      .string()
      .trim()
      .min(1, "attendanceId is required")
      .max(1_500)
      .regex(/^[^/]+$/, "Invalid attendanceId"),
  })
  .strict();
