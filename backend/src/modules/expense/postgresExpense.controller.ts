import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import type {
  CreateExpenseBudgetInput,
  ExpenseBudgetHistoryQuery,
  ExpenseBudgetIdParams,
  ExpenseBudgetSummaryQuery,
  ExpenseDeleteQuery,
  ExpenseIdParams,
  ExpenseStatusHistoryQuery,
  ExpenseStatusInput,
  UpdateExpenseBudgetInput,
} from "../../types/expenseBudget.types.js";
import type { PostgresExpenseCreateInput } from "./postgresExpense.repository.js";
import { postgresExpenseService } from "./postgresExpense.service.js";

const context = (request: Request) => {
  if (!request.postgresAuth || !request.database) {
    throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  }
  return { auth: request.postgresAuth, database: request.database };
};

export const createPostgresExpenseBudget = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresExpenseService.createAllocation(
    database, auth.tenantId, auth.userId, request.validated?.body as CreateExpenseBudgetInput,
  );
  response.status(result.created ? 201 : 200).json({ success: true, data: result });
};

export const updatePostgresExpenseBudget = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const params = request.validated?.params as ExpenseBudgetIdParams;
  const result = await postgresExpenseService.updateAllocation(
    database, auth.tenantId, auth.userId, params.allocationId,
    request.validated?.body as UpdateExpenseBudgetInput,
  );
  response.json({ success: true, data: result });
};

export const getPostgresExpenseBudgetSummary = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const result = await postgresExpenseService.getSummary(
    database, auth.tenantId, auth.userId, request.validated?.query as ExpenseBudgetSummaryQuery,
  );
  response.json({ success: true, data: result });
};

export const getPostgresExpenseBudgetTransactions = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const params = request.validated?.params as ExpenseBudgetIdParams;
  const result = await postgresExpenseService.getTransactions(
    database, auth.tenantId, auth.userId, params.allocationId,
    request.validated?.query as ExpenseBudgetHistoryQuery,
  );
  response.json({ success: true, data: result });
};

export const listPostgresExpenses = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const query = request.validated?.query as { outletId: string; startDate: number; endDate: number };
  const items = await postgresExpenseService.listExpenses(
    database, auth.tenantId, auth.userId, query.outletId, query.startDate, query.endDate,
  );
  response.json({ success: true, data: { items } });
};

export const createPostgresExpense = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const item = await postgresExpenseService.createExpense(
    database, auth.tenantId, auth.userId, request.validated?.body as PostgresExpenseCreateInput,
  );
  response.status(201).json({ success: true, data: { item } });
};

export const transitionPostgresExpenseStatus = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const params = request.validated?.params as ExpenseIdParams;
  const result = await postgresExpenseService.transitionExpense(
    database, auth.tenantId, auth.userId, params.expenseId,
    request.validated?.body as ExpenseStatusInput,
  );
  response.json({ success: true, data: result });
};

export const getPostgresExpenseStatusHistory = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const params = request.validated?.params as ExpenseIdParams;
  const result = await postgresExpenseService.getExpenseStatusHistory(
    database, auth.tenantId, auth.userId, params.expenseId,
    request.validated?.query as ExpenseStatusHistoryQuery,
  );
  response.json({ success: true, data: result });
};

export const deletePostgresExpense = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const params = request.validated?.params as ExpenseIdParams;
  const result = await postgresExpenseService.deleteExpense(
    database, auth.tenantId, auth.userId, params.expenseId,
    request.validated?.query as ExpenseDeleteQuery,
  );
  response.json({ success: true, data: result });
};
