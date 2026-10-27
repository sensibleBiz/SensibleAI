import { z } from "zod";

const uuid = (name: string) => z.string().trim().uuid(`${name} must be a PostgreSQL UUID`);
const optionalText = (max: number) => z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().trim().min(1).max(max).optional(),
);
const date = z.string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Date must use YYYY-MM-DD format")
  .refine((value) => {
    const timestamp = Date.parse(`${value}T00:00:00.000+05:30`);
    return Number.isFinite(timestamp) && new Date(timestamp + 19_800_000).toISOString().startsWith(value);
  }, "Date is invalid");

export const postgresUserTrackingQuerySchema = z.object({
  outletId: uuid("outletId"),
  userId: uuid("userId"),
  date,
  limit: z.coerce.number().int().min(25).max(500).default(250),
  cursor: optionalText(2_000),
}).strict();

export const postgresUserTrackingCreateSchema = z.object({
  outletId: uuid("outletId"),
  userId: uuid("userId").optional(),
  latitude: z.coerce.number().finite().min(-90).max(90),
  longitude: z.coerce.number().finite().min(-180).max(180),
  address: z.string().trim().max(2_000).optional().default(""),
  name: z.string().trim().max(500).optional().default(""),
  timestamp: z.coerce.number().int().nonnegative().safe(),
  accuracyMeters: z.coerce.number().finite().nonnegative().max(1_000_000).optional(),
  deviceId: optionalText(200),
  externalSource: optionalText(100),
  externalId: optionalText(1_500),
}).strict();
