import { z } from "zod";

const activeOnly = z.enum(["true", "false"]).optional().default("true").transform((value) => value === "true");
const q = z.string().trim().max(100).optional().default("");
const limit = z.coerce.number().int().min(1).max(1000).optional().default(250);
const code = z.string().trim().min(2).max(12).transform((value) => value.toUpperCase());

export const referenceListQuerySchema = z.object({ activeOnly, q, limit }).strict();
export const referenceStateQuerySchema = referenceListQuerySchema.extend({
  countryCode: code.optional().default("IN"),
}).strict();
export const referenceCityQuerySchema = referenceListQuerySchema.extend({
  stateCode: code.optional(),
}).strict();
