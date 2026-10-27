import { z } from "zod";
import { ACTIVITY_MODES, ACTIVITY_PRIORITIES, ACTIVITY_STATUSES, ACTIVITY_TYPES } from "./activity.types.js";

const uuid = (name: string) => z.string().trim().uuid(`${name} must be a PostgreSQL UUID`);
const optionalQuery = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((value) => value === "" ? undefined : value, schema.optional());
const milliseconds = z.coerce.number().int().nonnegative();

export const postgresActivityIdParamsSchema = z.object({ activityId: uuid("activityId") }).strict();
export const postgresLeadActivityParamsSchema = z.object({ leadId: uuid("leadId") }).strict();
export const postgresActivityOutletQuerySchema = z.object({ outletId: uuid("outletId") }).strict();

const activityListObject = z.object({
  outletId: uuid("outletId"),
  leadId: optionalQuery(uuid("leadId")),
  customerId: optionalQuery(uuid("customerId")),
  assignedTo: optionalQuery(uuid("assignedTo")),
  mode: optionalQuery(z.enum(ACTIVITY_MODES)),
  priority: optionalQuery(z.enum(ACTIVITY_PRIORITIES)),
  search: optionalQuery(z.string().trim().min(1).max(200)),
  status: optionalQuery(z.enum(ACTIVITY_STATUSES)),
  type: optionalQuery(z.enum(ACTIVITY_TYPES)),
  startDate: optionalQuery(milliseconds),
  endDate: optionalQuery(milliseconds),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: optionalQuery(z.string().trim().min(1).max(2048)),
}).strict();

const validateDateRange = <T extends { startDate?: number | undefined; endDate?: number | undefined }>(value: T, context: z.RefinementCtx) => {
  if (value.startDate !== undefined && value.endDate !== undefined && value.startDate > value.endDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "startDate must be before or equal to endDate", path: ["startDate"] });
  }
};

export const postgresActivityListQuerySchema = activityListObject.superRefine(validateDateRange);
export const postgresLeadActivityListQuerySchema = activityListObject.omit({ leadId: true }).superRefine(validateDateRange);

export const postgresActivityCreateSchema = z.object({
  outletId: uuid("outletId"), assignedTo: uuid("assignedTo"),
  description: z.string().trim().min(1).max(10_000), mode: z.enum(ACTIVITY_MODES),
  priority: z.enum(ACTIVITY_PRIORITIES), productDealerPrice: z.number().finite().nonnegative(),
  productId: z.string().trim().min(1).max(1500).nullable(), productMrpPrice: z.number().finite().nonnegative(),
  productName: z.string().max(1000).nullable(), productType: z.string().trim().min(1).max(100),
  scheduledDate: z.number().int().nonnegative(), type: z.enum(ACTIVITY_TYPES), callLater: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  if (value.callLater && value.type !== "Follow Up") context.addIssue({ code: z.ZodIssueCode.custom, message: "Call Later requires a Follow Up activity", path: ["type"] });
});

export const postgresActivityUpdateSchema = z.object({
  outletId: uuid("outletId"), assignedTo: uuid("assignedTo").optional(),
  scheduledDate: z.number().int().nonnegative().optional(), status: z.enum(ACTIVITY_STATUSES).optional(),
}).strict().refine((value) => value.assignedTo !== undefined || value.scheduledDate !== undefined || value.status !== undefined, "At least one activity field is required");

