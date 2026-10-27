import { Router } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import {
  createPostgresExpense,
  createPostgresExpenseBudget,
  deletePostgresExpense,
  getPostgresExpenseBudgetSummary,
  getPostgresExpenseBudgetTransactions,
  getPostgresExpenseStatusHistory,
  listPostgresExpenses,
  transitionPostgresExpenseStatus,
  updatePostgresExpenseBudget,
} from "./postgresExpense.controller.js";
import {
  postgresExpenseBudgetCreateBodySchema,
  postgresExpenseBudgetHistoryQuerySchema,
  postgresExpenseBudgetIdParamsSchema,
  postgresExpenseBudgetSummaryQuerySchema,
  postgresExpenseBudgetUpdateBodySchema,
  postgresExpenseCreateBodySchema,
  postgresExpenseDeleteQuerySchema,
  postgresExpenseIdParamsSchema,
  postgresExpenseListQuerySchema,
  postgresExpenseStatusBodySchema,
} from "./postgresExpense.validator.js";

export const postgresExpenseRouter = Router();

postgresExpenseRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});
postgresExpenseRouter.use(requirePostgresAuth);

postgresExpenseRouter.get(
  "/expense-budgets/summary",
  validateRequest({ query: postgresExpenseBudgetSummaryQuerySchema }),
  withRequestDatabaseContext(getPostgresExpenseBudgetSummary),
);
postgresExpenseRouter.post(
  "/expense-budgets",
  validateRequest({ body: postgresExpenseBudgetCreateBodySchema }),
  withRequestDatabaseContext(createPostgresExpenseBudget),
);
postgresExpenseRouter.patch(
  "/expense-budgets/:allocationId",
  validateRequest({
    params: postgresExpenseBudgetIdParamsSchema,
    body: postgresExpenseBudgetUpdateBodySchema,
  }),
  withRequestDatabaseContext(updatePostgresExpenseBudget),
);
postgresExpenseRouter.get(
  "/expense-budgets/:allocationId/transactions",
  validateRequest({
    params: postgresExpenseBudgetIdParamsSchema,
    query: postgresExpenseBudgetHistoryQuerySchema,
  }),
  withRequestDatabaseContext(getPostgresExpenseBudgetTransactions),
);
postgresExpenseRouter.get(
  "/expenses",
  validateRequest({ query: postgresExpenseListQuerySchema }),
  withRequestDatabaseContext(listPostgresExpenses),
);
postgresExpenseRouter.post(
  "/expenses",
  validateRequest({ body: postgresExpenseCreateBodySchema }),
  withRequestDatabaseContext(createPostgresExpense),
);
postgresExpenseRouter.patch(
  "/expenses/:expenseId/status",
  validateRequest({ params: postgresExpenseIdParamsSchema, body: postgresExpenseStatusBodySchema }),
  withRequestDatabaseContext(transitionPostgresExpenseStatus),
);
postgresExpenseRouter.get(
  "/expenses/:expenseId/status-history",
  validateRequest({
    params: postgresExpenseIdParamsSchema,
    query: postgresExpenseBudgetHistoryQuerySchema,
  }),
  withRequestDatabaseContext(getPostgresExpenseStatusHistory),
);
postgresExpenseRouter.delete(
  "/expenses/:expenseId",
  validateRequest({ params: postgresExpenseIdParamsSchema, query: postgresExpenseDeleteQuerySchema }),
  withRequestDatabaseContext(deletePostgresExpense),
);
