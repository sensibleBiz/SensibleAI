import { z } from "zod";

export const outletIdParamsSchema = z.object({ outletId: z.string().uuid() }).strict();

export const createOutletSchema = z.object({
  businessId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  branch: z.string().trim().max(120).default(""),
  address: z.string().trim().max(500).default(""),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
}).strict();

export const updateOutletSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  branch: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const planCatalogSchema = z.object({
  features: z.array(z.object({
    id: z.string().trim().min(1).max(160),
    label: z.string().trim().min(1).max(200),
    tier: z.enum(["silver", "gold", "platinum"]),
    source: z.enum(["default", "sidebar"]),
    featureKey: z.string().trim().min(1).max(128).optional(),
  }).strict()).max(500),
}).strict();
