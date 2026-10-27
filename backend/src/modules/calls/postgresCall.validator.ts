import { z } from "zod";
import { CALL_DIRECTIONS } from "./call.types.js";

const uuid = (name: string) => z.string().trim().uuid(`${name} must be a PostgreSQL UUID`);
const optionalQuery = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
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

export const postgresLeadCallParamsSchema = z.object({ leadId: uuid("leadId") }).strict();

export const postgresLeadCallListQuerySchema = z
  .object({
    outletId: uuid("outletId"),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    cursor: optionalQuery(z.string().trim().min(1).max(2048)),
  })
  .strict();

export const postgresCallReportQuerySchema = oneDayRange({
  outletId: uuid("outletId"),
  startDate: timestamp,
  endDate: timestamp,
  department: optionalQuery(z.string().trim().min(1).max(200)),
  search: optionalQuery(z.string().trim().min(1).max(200)),
});

export const postgresEmployeeCallListQuerySchema = oneDayRange({
  outletId: uuid("outletId"),
  startDate: timestamp,
  endDate: timestamp,
  receiverName: z
    .string()
    .min(1)
    .max(500)
    .refine((value) => value.trim().length > 0, "receiverName is required"),
  direction: z.enum(CALL_DIRECTIONS).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: optionalQuery(z.string().trim().min(1).max(2048)),
});

export const postgresCallCreateSchema = z
  .object({
    outletId: uuid("outletId"),
    leadId: optionalQuery(uuid("leadId")),
    customerId: optionalQuery(uuid("customerId")),
    loggedByUserId: optionalQuery(uuid("loggedByUserId")),
    direction: z.enum(CALL_DIRECTIONS),
    durationSeconds: z.coerce.number().int().min(0).max(86_400),
    number: z.string().trim().min(1).max(32),
    receiverMobileNo: z.string().trim().max(32).optional().default(""),
    receiverName: z.string().trim().min(1).max(500),
    name: z.string().trim().max(500).optional().default(""),
    department: z.string().trim().max(200).optional().default("Other"),
    timestamp: timestamp,
    phoneAccountId: optionalQuery(z.string().trim().max(200)),
    simLabel: optionalQuery(z.string().trim().max(200)),
    simPhoneNumber: optionalQuery(z.string().trim().max(32)),
    subscriptionId: optionalQuery(z.string().trim().max(200)),
    deviceId: optionalQuery(z.string().trim().max(200)),
    externalCallSource: optionalQuery(z.string().trim().max(100)),
    externalCallId: optionalQuery(z.string().trim().max(1500)),
  })
  .strict();

export const postgresCallIdParamsSchema = z.object({ callId: uuid("callId") }).strict();
export const postgresCallOutletQuerySchema = z.object({ outletId: uuid("outletId") }).strict();
