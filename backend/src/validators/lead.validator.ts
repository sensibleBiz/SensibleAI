import { z } from "zod";

export const LEAD_REPORT_MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1_000;

const validateLeadReportRange = (
  value: { startDate: number; endDate: number },
  context: z.RefinementCtx,
) => {
  if (value.startDate > value.endDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "startDate must be before or equal to endDate",
      path: ["startDate"],
    });
    return;
  }

  if (value.endDate - value.startDate > LEAD_REPORT_MAX_RANGE_MS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Lead report date range cannot exceed 366 days",
      path: ["endDate"],
    });
  }
};

const optionalTrimmedString = (maximumLength: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === ""
        ? undefined
        : value,
    z.string().trim().min(1).max(maximumLength).optional(),
  );

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

export const leadListQuerySchema = z
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
    sourceKey: z
      .enum([
        "indiamart",
        "justdial",
        "facebook",
        "instagram",
        "google",
        "website",
        "reference",
        "self-generated",
        "cold-call",
        "linkedin",
        "whatsapp",
        "email",
        "walk-in",
        "other",
      ])
      .optional(),
    enquiryType: z.enum(["CUSTOMER_ENQUIRY"]).optional(),
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

export const leadRingingListQuerySchema = z
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

const optionalFormString = (maximumLength: number) =>
  z.string().max(maximumLength).optional().default("");

export const leadCreateBodySchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
    adId: optionalFormString(500),
    customerId: z.string().trim().min(1).max(1_500).nullable().optional(),
    enquiryType: z.enum(["NEW_LEAD", "CUSTOMER_ENQUIRY"]).optional(),
    area: optionalFormString(500),
    businessName: optionalFormString(500),
    businessType: optionalFormString(500),
    city: optionalFormString(500),
    customerName: z.string().min(1, "Customer name is required").max(500),
    email: optionalFormString(320),
    mobile: z.string().regex(/^\d{10}$/, "Mobile must contain exactly 10 digits"),
    priority: z
      .union([z.enum(["Low", "Medium", "High", "Urgent"]), z.literal("")])
      .optional()
      .default(""),
    requirement: z.string().min(1, "Requirement is required").max(5_000),
    source: z
      .union([
        z.enum([
          "Website",
          "Indiamart",
          "JustDail",
          "Facebook",
          "Reference",
          "Self Generated",
          "Cold Call",
          "Instagram",
          "LinkedIn",
          "Google Ads",
          "WhatsApp",
          "Email",
          "WalkIn",
          "Other",
        ]),
        z.literal(""),
      ])
      .optional()
      .default(""),
    state: optionalFormString(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.enquiryType === "CUSTOMER_ENQUIRY" && !value.customerId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "customerId is required for a customer enquiry",
        path: ["customerId"],
      });
    }
    if (value.customerId && value.enquiryType === "NEW_LEAD") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A customer-linked lead must be a customer enquiry",
        path: ["enquiryType"],
      });
    }
  });

const leadBulkCreateItemSchema = z
  .object({
    rowNumber: z.number().int().min(2).max(100_000),
    externalId: z.string().trim().min(1).max(500),
    adId: z.string().trim().max(500),
    originalCreatedAt: z
      .number()
      .int()
      .nonnegative()
      .max(8_640_000_000_000_000),
    customerName: z.string().trim().min(1).max(500),
    mobile: z.string().regex(/^\d{10}$/, "Mobile must contain exactly 10 digits"),
    city: z.string().trim().max(500),
    source: z.enum(["Facebook", "Instagram", "Other"]),
    requirement: z.string().trim().min(1).max(5_000),
    leadCampaign: z.string().trim().max(500),
    inboxUrl: z.string().trim().max(2_000),
  })
  .strict();

export const leadBulkCreateBodySchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
    leads: z.array(leadBulkCreateItemSchema).min(1).max(400),
  })
  .strict();

const leadStageSchema = z.enum([
  "NEW",
  "ASSIGNED",
  "FOLLOWUP",
  "WON",
  "LOST",
  "DISQUALIFIED",
]);

const leadPrioritySchema = z.union([
  z.enum(["Low", "Medium", "High", "Urgent"]),
  z.literal(""),
]);

const leadSourceSchema = z.union([
  z.enum([
    "Website",
    "Indiamart",
    "JustDail",
    "Facebook",
    "Reference",
    "Self Generated",
    "Cold Call",
    "Instagram",
    "LinkedIn",
    "Google Ads",
    "WhatsApp",
    "Email",
    "WalkIn",
    "Other",
  ]),
  z.literal(""),
]);

export const leadIdParamsSchema = z
  .object({
    leadId: z
      .string()
      .trim()
      .min(1, "leadId is required")
      .max(1_500)
      .regex(/^[^/]+$/, "Invalid leadId"),
  })
  .strict();

export const leadDetailQuerySchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
  })
  .strict();

export const leadSourceReportQuerySchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
    startDate: dateBoundary(false),
    endDate: dateBoundary(true),
  })
  .strict()
  .superRefine(validateLeadReportRange);

export const leadCityStateReportQuerySchema = leadSourceReportQuerySchema;

export const leadFunnelReportQuerySchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
    startDate: dateBoundary(false),
    endDate: dateBoundary(true),
    assignedTo: optionalTrimmedString(1_500),
    source: optionalTrimmedString(200),
  })
  .strict()
  .superRefine(validateLeadReportRange);

export const repeatedEnquiryQuerySchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
    startDate: dateBoundary(false),
    endDate: dateBoundary(true),
    assignedTo: optionalTrimmedString(1_500),
    source: optionalTrimmedString(200),
    enquiryType: z.enum(["CUSTOMER_ENQUIRY"]).optional(),
    search: optionalTrimmedString(100),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .superRefine(validateLeadReportRange);

export const leadLookupQuerySchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
    mobiles: z.preprocess((value) => {
      if (Array.isArray(value)) return value;
      if (typeof value !== "string") return value;
      return value
        .split(",")
        .map((mobile) => mobile.trim())
        .filter(Boolean);
    }, z.array(z.string().trim().min(1).max(20)).min(1).max(30)),
  })
  .strict();

const optionalTrimmedField = (schema: z.ZodTypeAny, maxLength?: number) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    return maxLength !== undefined ? trimmed.slice(0, maxLength) : trimmed;
  }, schema.optional());

export const leadUpdateBodySchema = z
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
    priority: optionalTrimmedField(leadPrioritySchema),
    requirement: optionalTrimmedField(z.string().min(1, "Requirement is required").max(5_000), 5_000),
    source: optionalTrimmedField(leadSourceSchema),
    state: optionalTrimmedField(z.string().max(500), 500),
    username: z.preprocess((value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      if (trimmed === "") return undefined;
      return trimmed;
    }, z.string().min(1, "Customer name is required").max(500).optional()),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== "outletId"),
    "At least one lead field is required",
  );

export const leadRingingBodySchema = z
  .object({
    outletId: z.string().trim().min(1, "outletId is required").max(1_500),
    ringing: z.boolean(),
  })
  .strict();

export const leadShareTokenParamsSchema = z
  .object({
    shareToken: z
      .string()
      .trim()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/, "Invalid lead share token"),
  })
  .strict();

const leadWorkflowFields = {
  outletId: z.string().trim().min(1, "outletId is required").max(1_500),
  stage: leadStageSchema.optional(),
  comments: z.string().max(10_000).default(""),
  leadTag: z.array(z.string().max(200)).max(100).default([]),
};

export const leadAssignBodySchema = z
  .object({
    ...leadWorkflowFields,
    assignedTo: z.string().max(1_500),
  })
  .strict();

export const leadStageBodySchema = z.object(leadWorkflowFields).strict();
