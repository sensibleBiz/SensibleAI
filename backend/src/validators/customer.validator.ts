import { z } from "zod";

const outletId = z.string().trim().min(1, "outletId is required").max(1_500);
const cursor = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).max(2_048).optional(),
);

export const customerSearchQuerySchema = z
  .object({
    outletId,
    query: z.string().trim().min(2, "Enter at least 2 characters").max(200),
    limit: z.coerce.number().int().min(1).max(20).default(10),
  })
  .strict();

const optionalMatchField = (maximumLength: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(2).max(maximumLength).optional(),
  );

export const customerMatchQuerySchema = z
  .object({
    outletId,
    businessName: optionalMatchField(500),
    email: optionalMatchField(320),
    mobile: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      z.string().regex(/^\d{10}$/).optional(),
    ),
    limit: z.coerce.number().int().min(1).max(10).default(5),
  })
  .strict()
  .refine(
    (value) =>
      Boolean(
        value.businessName ||
          value.email ||
          value.mobile,
      ),
    "At least one customer field is required",
  );

export const customerIdParamsSchema = z
  .object({
    customerId: z
      .string()
      .trim()
      .min(1, "customerId is required")
      .max(1_500)
      .regex(/^[^/]+$/, "Invalid customerId"),
  })
  .strict();

export const customerDetailQuerySchema = z.object({ outletId }).strict();

export const customerEnquiryQuerySchema = z
  .object({
    outletId,
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor,
  })
  .strict();
