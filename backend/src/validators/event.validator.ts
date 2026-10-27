import { z } from "zod";

const documentIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !value.includes("/"), "Invalid document ID");

export const eventIdParamsSchema = z.object({
  eventId: documentIdSchema,
});

export const eventCityBodySchema = z
  .object({
    outletId: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1, "City is required").max(200),
  })
  .strict();
