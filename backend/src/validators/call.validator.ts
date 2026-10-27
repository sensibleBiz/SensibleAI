import { z } from "zod";

const id = (name: string) =>
  z
    .string()
    .trim()
    .min(1, `${name} is required`)
    .max(1_500)
    .regex(/^[^/]+$/, `Invalid ${name}`);

const optionalQueryString = (maximumLength: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).max(maximumLength).optional(),
  );

const optionalExactQueryString = (maximumLength: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z
      .string()
      .min(1)
      .max(maximumLength)
      .refine((value) => value.trim().length > 0, "Value cannot be blank")
      .optional(),
  );

const timestamp = z.coerce.number().int().nonnegative().safe();

const oneDayRange = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object(shape)
    .strict()
    .superRefine((value, context) => {
      const range = value as { startDate: number; endDate: number };
      if (range.startDate > range.endDate) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "startDate must be before or equal to endDate",
          path: ["startDate"],
        });
      }
      if (range.endDate - range.startDate > 86_400_000) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Call report date range cannot exceed one day",
          path: ["endDate"],
        });
      }
    });

export const leadCallParamsSchema = z
  .object({ leadId: id("leadId") })
  .strict();

export const leadCallListQuerySchema = z
  .object({
    outletId: id("outletId"),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    cursor: optionalQueryString(2_048),
  })
  .strict();

export const callReportQuerySchema = oneDayRange({
  outletId: id("outletId"),
  startDate: timestamp,
  endDate: timestamp,
  department: optionalExactQueryString(200),
  search: optionalQueryString(200),
});

export const employeeCallListQuerySchema = oneDayRange({
  outletId: id("outletId"),
  startDate: timestamp,
  endDate: timestamp,
  receiverName: z
    .string()
    .min(1)
    .max(500)
    .refine((value) => value.trim().length > 0, "receiverName is required"),
  direction: z
    .enum(["incoming", "outgoing", "missed", "rejected"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: optionalQueryString(2_048),
});
