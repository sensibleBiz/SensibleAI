import { z } from "zod";
const uuid = z.string().uuid();
export const publicLinkQuerySchema = z.object({ outletId: uuid }).strict();
export const publicLinkBodySchema = z.object({ outletId: uuid, displayName: z.string().trim().min(1).max(300), url: z.string().trim().url().max(4000), phone: z.string().trim().max(32).optional() }).strict();
export const publicLinkDeleteSchema = z.object({ linkId: uuid }).strict();
export const quickContactBodySchema = z.object({ outletId: uuid, name: z.string().trim().min(1).max(300), mobile: z.string().trim().min(6).max(32), businessType: z.string().trim().max(300), sourceType: z.literal("event"), sourceName: z.string().trim().min(1).max(500), companyName: z.string().trim().max(500).optional() }).strict();
