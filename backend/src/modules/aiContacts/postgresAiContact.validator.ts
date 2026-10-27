import { z } from "zod";

const keywords = z.array(z.string().trim().min(1).max(200)).min(1).max(100)
  .transform((values) => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))));
const status = z.enum(["pending", "processing", "completed", "failed"]);

export const aiContactOutletQuerySchema = z.object({ outletId: z.string().uuid() });
export const aiContactJobParamsSchema = z.object({ jobId: z.string().uuid() });
export const createAiContactJobSchema = z.object({
  outletId: z.string().uuid(),
  keywords,
  category: z.string().trim().max(160).optional().default(""),
  city: z.string().trim().max(160).optional().default(""),
  contactLimit: z.coerce.number().int().min(1).max(10_000).optional().default(100),
});
export const updateAiContactJobSchema = z.object({
  keywords: keywords.optional(),
  category: z.string().trim().max(160).optional(),
  city: z.string().trim().max(160).optional(),
  contactLimit: z.coerce.number().int().min(1).max(10_000).optional(),
  status: status.optional(),
}).refine((input) => Object.keys(input).length > 0, "At least one field is required");
