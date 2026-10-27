import { z } from "zod";

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(1_500)
  .regex(/^[^/]+$/, "Invalid identifier");
const outletId = identifier.describe("outletId");
const permissionKey = z
  .string()
  .trim()
  .min(2)
  .max(150)
  .regex(/^[A-Z][A-Z0-9_]*$/, "Permission keys must use uppercase letters, numbers, and underscores");
const text = z.string().trim().min(1).max(500);

export const outletQuerySchema = z.object({ outletId }).strict();

export const outletFeatureQuerySchema = z
  .object({
    outletId,
    includeUserCount: z.enum(["true", "false"]).optional(),
  })
  .strict();

export const permissionParamsSchema = z
  .object({ resourceId: identifier })
  .strict();

export const permissionCreateSchema = z
  .object({
    outletId,
    key: permissionKey,
    label: text.max(150),
    description: text,
    category: text.max(100),
  })
  .strict();

export const permissionUpdateSchema = permissionCreateSchema.omit({ key: true });

export const userAccessUpdateSchema = z
  .object({
    outletId,
    role: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9 _-]+$/),
    departmentAccessList: z.array(z.string().trim().min(1).max(100)).max(100),
    outletPermissions: z.array(permissionKey).max(500),
  })
  .strict();

export const userParamsSchema = z.object({ resourceId: identifier }).strict();

export const outletFeatureParamsSchema = z
  .object({ targetOutletId: identifier })
  .strict();

export const outletFeatureUpdateSchema = z
  .object({
    outletId,
    enabledFeatureKeys: z.array(identifier.max(100)).max(100),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
