import { z } from "zod";

const id = (name: string) =>
  z.string().trim().min(1, `${name} is required`).max(1_500).regex(/^[^/]+$/, `Invalid ${name}`);

const dateBoundary = z.union([z.string(), z.number()]).transform((value, context) => {
  const milliseconds = Number(String(value).trim());
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Date must be a millisecond timestamp",
    });
    return z.NEVER;
  }
  return milliseconds;
});

const optionalQueryString = (maximumLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(1).max(maximumLength).optional(),
  );

const paginationFields = {
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: optionalQueryString(2_048),
};

export const activityIdParamsSchema = z
  .object({ activityId: id("activityId") })
  .strict();

export const leadActivityParamsSchema = z
  .object({ leadId: id("leadId") })
  .strict();

export const leadActivityListQuerySchema = z
  .object({
    outletId: id("outletId"),
    ...paginationFields,
  })
  .strict();

export const activityListQuerySchema = z
  .object({
    outletId: id("outletId"),
    startDate: dateBoundary,
    endDate: dateBoundary,
    assignedTo: optionalQueryString(1_500),
    mode: optionalQueryString(100),
    search: optionalQueryString(200),
    status: z.enum(["PENDING", "DONE"]).optional(),
    type: optionalQueryString(100),
    ...paginationFields,
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

export const activityCreateBodySchema = z
  .object({
    outletId: id("outletId"),
    assignedTo: z.string().trim().min(1, "assignedTo is required").max(1_500),
    description: z.string().trim().min(1, "description is required").max(10_000),
    mode: z.enum(["Online", "Offline", ""]),
    priority: z.enum(["Low", "Medium", "High", "Urgent"]),
    productDealerPrice: z.number().finite().nonnegative(),
    productId: z.string().max(1_500).nullable(),
    productMrpPrice: z.number().finite().nonnegative(),
    productName: z.string().max(1_000).nullable(),
    productType: z.enum(["Add On", "Regular"]),
    scheduledDate: z.number().int().nonnegative(),
    type: z.enum(["Follow Up", "Demo", "Installation", "Visit"]),
  })
  .strict();

export const activityUpdateBodySchema = z
  .object({
    outletId: id("outletId"),
    assignedTo: z.string().trim().min(1).max(1_500).optional(),
    scheduledDate: z.number().int().nonnegative().optional(),
    status: z.enum(["PENDING", "DONE"]).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.assignedTo !== undefined ||
      value.scheduledDate !== undefined ||
      value.status !== undefined,
    "At least one activity field is required",
  );

export const activityDeleteQuerySchema = z
  .object({ outletId: id("outletId") })
  .strict();
