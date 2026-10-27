import { z } from "zod";

const uuid = z.string().uuid();
export const integrationOutletQuerySchema = z.object({ outletId: uuid });
export const integrationParamsSchema = z.object({ integrationId: uuid });
export const facebookPageParamsSchema = z.object({ pageId: uuid });
export const integrationBodySchema = z.object({
  outletId: uuid,
  integrationKey: z.string().trim().min(1).max(500),
  type: z.string().trim().min(1).max(32),
  description: z.string().trim().max(2000).default(""),
  accessToken: z.string().max(10000).optional(),
  isActive: z.boolean().optional(),
  autoassignenabled: z.boolean().optional(),
  autoAssignUserId: uuid.optional(),
  autoAssignEmployeeName: z.string().trim().max(300).optional(),
});
export const integrationPatchSchema = integrationBodySchema.partial().extend({ outletId: uuid });
