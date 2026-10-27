import { z } from "zod";

const uuid = (name: string) => z.string().uuid(`${name} must be a valid UUID`);

export const postgresLeadTimelineParamsSchema = z.object({
  leadId: uuid("leadId"),
}).strict();

export const postgresCustomerTimelineParamsSchema = z.object({
  customerId: uuid("customerId"),
}).strict();

export const postgresTimelineQuerySchema = z.object({
  outletId: uuid("outletId"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(256).optional(),
}).strict();
