import { z } from "zod";

const uuid = (name: string) => z.string().uuid(`${name} must be a valid UUID`);

export const aiDossierLeadParamsSchema = z.object({ leadId: uuid("leadId") }).strict();
export const aiDossierCustomerParamsSchema = z.object({ customerId: uuid("customerId") }).strict();
export const aiDossierOutletQuerySchema = z.object({ outletId: uuid("outletId") }).strict();
export const aiDossierRequestSchema = z.object({ outletId: uuid("outletId") }).strict();
export const aiDossierFeedbackSchema = z.object({
  outletId: uuid("outletId"),
  useful: z.boolean(),
  note: z.string().trim().min(1).max(500).optional(),
}).strict();
