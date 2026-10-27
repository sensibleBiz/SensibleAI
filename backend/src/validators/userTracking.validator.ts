import { z } from "zod";

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(1_500)
  .regex(/^[^/]+$/, "Invalid identifier");

export const userTrackingQuerySchema = z
  .object({
    outletId: identifier,
    userId: identifier,
    date: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Date must use YYYY-MM-DD format")
      .refine(
        (value) => {
          const timestamp = Date.parse(`${value}T00:00:00.000+05:30`);
          return Number.isFinite(timestamp) && new Date(timestamp + 19_800_000)
            .toISOString()
            .startsWith(value);
        },
        "Date is invalid",
      ),
    limit: z.coerce.number().int().min(25).max(500).default(250),
    cursor: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();
