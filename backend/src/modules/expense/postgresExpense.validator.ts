import { z } from "zod";
import {
  expenseBudgetCreateBodySchema,
  expenseBudgetHistoryQuerySchema,
  expenseBudgetIdParamsSchema,
  expenseBudgetSummaryQuerySchema,
  expenseBudgetUpdateBodySchema,
  expenseDeleteQuerySchema,
  expenseIdParamsSchema,
} from "../../validators/expenseBudget.validator.js";

const uuid = (label: string) => z.string().uuid(`${label} must be a UUID`);

export const postgresExpenseBudgetCreateBodySchema = expenseBudgetCreateBodySchema.extend({
  outletId: uuid("outletId"),
}).strict();

export const postgresExpenseBudgetUpdateBodySchema = expenseBudgetUpdateBodySchema.extend({
  outletId: uuid("outletId"),
}).strict();

export const postgresExpenseBudgetSummaryQuerySchema = expenseBudgetSummaryQuerySchema.extend({
  outletId: uuid("outletId"),
}).strict();

export const postgresExpenseBudgetHistoryQuerySchema = expenseBudgetHistoryQuerySchema.extend({
  outletId: uuid("outletId"),
  cursor: uuid("cursor").optional(),
}).strict();

export const postgresExpenseBudgetIdParamsSchema = expenseBudgetIdParamsSchema.extend({
  allocationId: uuid("allocationId"),
}).strict();

export const postgresExpenseIdParamsSchema = expenseIdParamsSchema.extend({
  expenseId: uuid("expenseId"),
}).strict();

export const postgresExpenseStatusBodySchema = z
  .object({
    outletId: uuid("outletId"),
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

export const postgresExpenseDeleteQuerySchema = expenseDeleteQuerySchema.extend({
  outletId: uuid("outletId"),
}).strict();

export const postgresExpenseListQuerySchema = z.object({
  outletId: uuid("outletId"),
  startDate: z.coerce.number().int().nonnegative(),
  endDate: z.coerce.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if (value.startDate > value.endDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["startDate"],
      message: "startDate must be before or equal to endDate",
    });
  }
});

export const postgresExpenseCreateBodySchema = z.object({
  outletId: uuid("outletId"),
  userId: uuid("userId").optional(),
  amount: z.number().finite().gt(0).max(1_000_000_000),
  monthId: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must use YYYY-MM format"),
  categoryId: uuid("categoryId").optional(),
  purpose: z.string().trim().max(500).optional(),
  createdDate: z.number().int().nonnegative().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
}).strict();
