import { z } from "zod";

const uuid = (name: string) => z.string().trim().uuid(`${name} must be a PostgreSQL UUID`);

const transactionSchema = z.object({
  txnId: z.union([z.string(), z.number()]).transform(String).pipe(z.string().trim().min(1).max(100)),
  punchId: z.union([z.string(), z.number()]).transform(String).pipe(z.string().trim().min(1).max(100)),
  mode: z.string().trim().toUpperCase().pipe(z.enum(["IN", "OUT"])),
  txnDateTime: z.union([z.string().trim().min(1), z.coerce.number().int().positive()]),
  dvcId: z.union([z.string(), z.number()]).transform(String).optional(),
  dvcIP: z.string().trim().max(45).optional(),
  integrationKey: z.string().trim().max(200).optional(),
}).strict();

export const postgresBiometricTransactionsSchema = z.object({
  outletId: uuid("outletId"),
  trans: z.array(transactionSchema).min(1).max(100),
}).strict();
