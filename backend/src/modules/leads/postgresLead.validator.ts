import { z } from "zod";
import { FUNNEL_SOURCE_KEYS } from "../../utils/funnelSource.js";
import { leadBulkCreateBodySchema } from "../../validators/lead.validator.js";

const optionalTrimmedString = (maximumLength: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === ""
        ? undefined
        : value,
    z.string().trim().min(1).max(maximumLength).optional(),
  );

const optionalFormString = (maximumLength: number) =>
  z.string().max(maximumLength).optional().default("");

const dateBoundary = (endOfDay: boolean) =>
  z.union([z.string(), z.number()]).transform((value, context) => {
    const rawValue = String(value).trim();
    const milliseconds = /^\d+$/.test(rawValue)
      ? Number(rawValue)
      : /^\d{4}-\d{2}-\d{2}$/.test(rawValue)
        ? Date.parse(`${rawValue}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
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

export const postgresLeadStageEnum = z.string().trim().min(1).max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/, "Invalid stage key")
  .transform((stage) => stage.toUpperCase());

export const postgresLeadIdParamsSchema = z
  .object({
    leadId: z
      .string()
      .trim()
      .min(1, "leadId is required")
      .max(1_500)
      .regex(/^[^/]+$/, "Invalid leadId"),
  })
  .strict();

export const postgresLeadListQuerySchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
    startDate: dateBoundary(false).optional(),
    endDate: dateBoundary(true).optional(),
    stage: optionalTrimmedString(100),
    status: optionalTrimmedString(100),
    assignedTo: optionalTrimmedString(1_500),
    unassigned: z
      .literal("true")
      .transform(() => true as const)
      .optional(),
    source: optionalTrimmedString(200),
    sourceKey: z.enum(FUNNEL_SOURCE_KEYS).optional(),
    search: optionalTrimmedString(100),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    cursor: optionalTrimmedString(2_048),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.startDate !== undefined &&
      value.endDate !== undefined &&
      value.startDate > value.endDate
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startDate must be before or equal to endDate",
        path: ["startDate"],
      });
    }
  });

export const postgresLeadBulkCreateSchema = leadBulkCreateBodySchema.extend({
  outletId: z.string().uuid("outletId must be a UUID"),
}).strict();

export const postgresLeadCreateSchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
    customerId: z.string().trim().min(1).max(1_500).nullable().optional(),
    adId: optionalFormString(500),
    area: optionalFormString(500),
    businessName: optionalFormString(500),
    businessType: optionalFormString(500),
    city: optionalFormString(500),
    customerName: z.string().min(1, "Customer name is required").max(500),
    email: optionalFormString(320),
    mobile: z.string().regex(/^\d{10}$/, "Mobile must contain exactly 10 digits"),
    priority: optionalFormString(64),
    requirement: z.string().min(1, "Requirement is required").max(5_000),
    source: optionalFormString(200),
    state: optionalFormString(500),
    assignedTo: optionalTrimmedString(1_500),
  })
  .strict();

const optionalTrimmedField = (schema: z.ZodTypeAny, maxLength?: number) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    return maxLength !== undefined ? trimmed.slice(0, maxLength) : trimmed;
  }, schema.optional());

export const postgresLeadUpdateSchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
    area: optionalTrimmedField(z.string().max(500), 500),
    businessName: optionalTrimmedField(z.string().max(500), 500),
    businessType: optionalTrimmedField(z.string().max(500), 500),
    city: optionalTrimmedField(z.string().max(500), 500),
    email: optionalTrimmedField(z.string().max(320), 320),
    mobile: z.preprocess((value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      if (trimmed === "") return undefined;
      return trimmed;
    }, z.string().regex(/^\d{10}$/, "Mobile must contain exactly 10 digits").optional()),
    priority: optionalTrimmedField(z.string().max(64)),
    requirement: optionalTrimmedField(z.string().min(1, "Requirement is required").max(5_000), 5_000),
    source: optionalTrimmedField(z.string().max(200)),
    state: optionalTrimmedField(z.string().max(500), 500),
    username: z.preprocess((value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      if (trimmed === "") return undefined;
      return trimmed;
    }, z.string().min(1, "Customer name is required").max(500).optional()),
    customFields: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== "outletId"),
    "At least one lead field is required",
  );

export const postgresLeadAssignSchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
    assignedTo: z.string().trim().min(1, "assignedTo is required").max(1_500),
    comments: z.string().max(10_000).default(""),
    leadTag: z.array(z.string().max(200)).max(100).default([]),
    stage: postgresLeadStageEnum.optional(),
  })
  .strict();

export const postgresLeadStageSchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
    stage: postgresLeadStageEnum.optional(),
    comments: z.string().max(10_000).default(""),
    leadTag: z.array(z.string().max(200)).max(100).default([]),
  })
  .strict();

export const postgresLeadRingingBodySchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
    ringing: z.boolean(),
  })
  .strict();

export const postgresLeadRingingListQuerySchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
    startDate: dateBoundary(false),
    endDate: dateBoundary(true),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: optionalTrimmedString(2_048),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.startDate > value.endDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startDate must be before or equal to endDate",
        path: ["startDate"],
      });
    }
  });

export const postgresLeadRepeatedEnquiryQuerySchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
    startDate: dateBoundary(false),
    endDate: dateBoundary(true),
    assignedTo: optionalTrimmedString(1_500),
    source: optionalTrimmedString(200),
    search: optionalTrimmedString(100),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const postgresLeadShareTokenParamsSchema = z
  .object({
    shareToken: z
      .string()
      .trim()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/, "Invalid lead share token"),
  })
  .strict();
const employeeSalesTargetPeriodSchema = z.object({
  outletId: z.string().uuid("outletId must be a UUID"),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

const employeeSalesTargetItemSchema = z.object({
  id: z.string().uuid("id must be a UUID").optional(),
  zone: z.enum(["South", "West", "East", "North", "Subscriptions"]),
  saleExecutive: z.string().trim().max(500),
  saleExecutiveId: z.string().uuid("saleExecutiveId must be a UUID").optional(),
  decForecastNetSales: z.number().finite().min(0).max(1_000_000_000_000),
  achieveNetSales: z.number().finite().min(0).max(1_000_000_000_000),
  order: z.number().int().min(0).max(10_000),
}).strict();

export const employeeSalesTargetListQuerySchema = employeeSalesTargetPeriodSchema.strict();

export const employeeSalesTargetSyncBodySchema = employeeSalesTargetPeriodSchema.extend({
  items: z.array(employeeSalesTargetItemSchema).max(500),
}).strict();

export const employeeSalesTargetIdParamsSchema = z.object({
  targetId: z.string().uuid("targetId must be a UUID"),
}).strict();

export const employeeSalesTargetDeleteQuerySchema = z.object({
  outletId: z.string().uuid("outletId must be a UUID"),
}).strict();
