import { z } from "zod";
import {
  outletFeatureParamsSchema,
  outletFeatureQuerySchema,
  outletFeatureUpdateSchema,
  outletQuerySchema,
  permissionCreateSchema,
  permissionParamsSchema,
  permissionUpdateSchema,
  userAccessUpdateSchema,
  userParamsSchema,
} from "../../validators/accessControl.validator.js";

const uuid = (label: string) => z.string().uuid(`${label} must be a UUID`);
const permissionKey = z
  .string()
  .trim()
  .min(2)
  .max(150)
  .regex(
    /^(?:[A-Z][A-Z0-9_]*|[a-z][a-z0-9_.]*)$/,
    "Permission keys must be CRM_* or lowercase dotted PostgreSQL keys",
  );

export const postgresOutletQuerySchema = outletQuerySchema.extend({ outletId: uuid("outletId") }).strict();
export const postgresOutletFeatureQuerySchema = outletFeatureQuerySchema.extend({
  outletId: uuid("outletId"),
}).strict();
export const postgresPermissionParamsSchema = permissionParamsSchema.extend({
  resourceId: uuid("resourceId"),
}).strict();
export const postgresUserParamsSchema = userParamsSchema.extend({
  resourceId: uuid("resourceId"),
}).strict();
export const postgresOutletFeatureParamsSchema = outletFeatureParamsSchema.extend({
  targetOutletId: uuid("targetOutletId"),
}).strict();

export const postgresPermissionCreateSchema = permissionCreateSchema.extend({
  outletId: uuid("outletId"),
  key: permissionKey,
}).strict();

export const postgresPermissionUpdateSchema = permissionUpdateSchema.extend({
  outletId: uuid("outletId"),
}).strict();

export const postgresUserAccessUpdateSchema = userAccessUpdateSchema.extend({
  outletId: uuid("outletId"),
  outletPermissions: z.array(permissionKey).max(500),
}).strict();

export const postgresOutletFeatureUpdateSchema = outletFeatureUpdateSchema.extend({
  outletId: uuid("outletId"),
}).strict();
