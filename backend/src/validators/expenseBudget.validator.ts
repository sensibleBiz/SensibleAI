import { z } from "zod";

const outletIdSchema = z.string().trim().min(1).max(200);
const documentIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !value.includes("/"), "Invalid document ID");
const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must use YYYY-MM format");
const notesSchema = z.string().trim().max(500).optional();
const moneySchema = z
  .number()
  .finite()
  .max(1_000_000_000)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
    "Amount cannot have more than two decimal places",
  );

export const expenseBudgetCreateBodySchema = z.object({
  outletId: outletIdSchema,
  month: monthSchema,
  targetType: z.enum(["DEPARTMENT", "USER", "MANAGER_TEAM"]),
  targetId: z.string().trim().min(1).max(200),
  allocatedAmount: moneySchema.refine(
    (value) => value > 0,
    "Allocated amount must be greater than zero",
  ),
  notes: notesSchema,
});

export const expenseBudgetUpdateBodySchema = z.object({
  outletId: outletIdSchema,
  allocatedAmount: moneySchema.refine(
    (value) => value >= 0,
    "Allocated amount cannot be negative",
  ),
  notes: notesSchema,
});

export const expenseBudgetSummaryQuerySchema = z.object({
  outletId: outletIdSchema,
  month: monthSchema,
});

export const expenseBudgetHistoryQuerySchema = z.object({
  outletId: outletIdSchema,
  cursor: documentIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const expenseBudgetIdParamsSchema = z.object({
  allocationId: documentIdSchema,
});

export const expenseIdParamsSchema = z.object({
  expenseId: documentIdSchema,
});

export const expenseStatusBodySchema = z
  .object({
    outletId: outletIdSchema,
    status: z.enum(["REVIEWED", "APPROVED", "REJECTED"]),
    rejectionReason: z.string().trim().max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.status === "REJECTED" && !value.rejectionReason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectionReason"],
        message: "Rejection reason is required",
      });
    }
  });

export const expenseDeleteQuerySchema = z.object({
  outletId: outletIdSchema,
});
