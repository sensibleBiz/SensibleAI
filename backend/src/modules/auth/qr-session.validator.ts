import { z } from "zod";

export const qrSessionParamsSchema = z.object({
  sessionId: z.string().uuid(),
});
