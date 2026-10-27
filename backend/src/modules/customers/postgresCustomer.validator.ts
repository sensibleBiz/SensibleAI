import { z } from "zod";

const uuid = (name: string) => z.string().uuid(`${name} must be a valid UUID`);
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional();
const outletId = uuid("outletId");

export const postgresCustomerIdParamsSchema = z.object({ customerId: uuid("customerId") }).strict();

export const postgresCustomerCreateSchema = z.object({
  outletId,
  customerName: z.string().trim().min(1).max(500),
  businessName: z.string().trim().max(500).default(""),
  mobile: z.string().trim().regex(/^(|\d{10})$/, "Mobile must contain exactly 10 digits").default(""),
  email: z.string().trim().email().max(320).or(z.literal("")).default(""),
  businessType: z.string().trim().max(500).default(""),
  area: z.string().trim().max(500).default(""),
  city: z.string().trim().max(500).default(""),
  state: z.string().trim().max(500).default(""),
  priority: z.string().trim().max(64).default(""),
  source: z.string().trim().max(200).default(""),
}).strict().refine((value) => Boolean(value.mobile || value.email || (value.businessName && (value.city || value.state))), {
  message: "A mobile, email, or business location is required to identify the customer",
});

export const postgresCustomerListQuerySchema = z.object({
  outletId,
  query: optionalText(200),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: optionalText(2048),
}).strict();

export const postgresCustomerSearchQuerySchema = z.object({
  outletId,
  query: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(10),
}).strict();

export const postgresCustomerMatchQuerySchema = z.object({
  outletId,
  businessName: optionalText(500),
  email: z.string().trim().email().max(320).optional(),
  mobile: z.string().trim().regex(/^\d{10}$/).optional(),
  city: optionalText(500),
  state: optionalText(500),
  limit: z.coerce.number().int().min(1).max(20).default(10),
}).strict().refine((value) => Boolean(value.mobile || value.email || value.businessName), {
  message: "At least one customer identity is required",
});

export const postgresCustomerDetailQuerySchema = z.object({ outletId }).strict();
export const postgresCustomerEnquiryQuerySchema = z.object({
  outletId,
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: optionalText(2048),
}).strict();

export const postgresCustomerUpdateSchema = z.object({
  outletId,
  customerName: optionalText(500),
  businessName: optionalText(500),
  mobile: z.string().trim().regex(/^(|\d{10})$/).optional(),
  email: z.string().trim().email().max(320).or(z.literal("")).optional(),
  businessType: optionalText(500),
  area: optionalText(500),
  city: optionalText(500),
  state: optionalText(500),
  priority: optionalText(64),
  source: optionalText(200),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "outletId"), {
  message: "At least one customer field is required",
});
