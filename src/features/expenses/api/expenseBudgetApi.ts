import type { ExpenseBudgetAllocationDTO, ExpenseBudgetSummaryDTO, ExpenseBudgetTargetType, ExpenseBudgetTransactionDTO, ExpenseDTO, ExpenseStatusHistoryDTO } from "../types/types";
import { postgresSession } from "@/features/auth";
import { apiRequest } from "@/shared/api/apiClient";

const expenseAuthOptions = () =>
  postgresSession.getAccessToken()
    ? { authMode: "postgres" as const }
    : {};

const withAuth = <T>(path: string, options: Parameters<typeof apiRequest<T>>[1] = {}) =>
  apiRequest<T>(path, { ...options, ...expenseAuthOptions() });

export interface CreateExpenseBudgetRequest {
  outletId: string;
  month: string;
  targetType: ExpenseBudgetTargetType;
  targetId: string;
  allocatedAmount: number;
  notes?: string;
}

export interface UpdateExpenseBudgetRequest {
  outletId: string;
  allocatedAmount: number;
  notes?: string;
}

export interface ExpenseTransitionResponse {
  expenseId: string;
  status: NonNullable<ExpenseDTO["status"]>;
  budgetApplied: boolean;
  allocation: ExpenseBudgetAllocationDTO | null;
  idempotent: boolean;
}

const queryString = (values: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  return params.toString();
};

export const expenseBudgetApi = {
  getSummary(outletId: string, month: string, signal?: AbortSignal) {
    return withAuth<ExpenseBudgetSummaryDTO>(
      `/api/v1/expense-budgets/summary?${queryString({ outletId, month })}`,
      { signal },
    );
  },

  createAllocation(input: CreateExpenseBudgetRequest) {
    return withAuth<{
      allocation: ExpenseBudgetAllocationDTO;
      created: boolean;
    }>("/api/v1/expense-budgets", { method: "POST", body: input });
  },

  updateAllocation(allocationId: string, input: UpdateExpenseBudgetRequest) {
    return withAuth<{
      allocation: ExpenseBudgetAllocationDTO;
      updated: boolean;
    }>(`/api/v1/expense-budgets/${encodeURIComponent(allocationId)}`, {
      method: "PATCH",
      body: input,
    });
  },

  getTransactions(
    outletId: string,
    allocationId: string,
    cursor?: string,
    limit = 25,
    signal?: AbortSignal,
  ) {
    return withAuth<{
      allocation: ExpenseBudgetAllocationDTO;
      items: ExpenseBudgetTransactionDTO[];
      nextCursor: string | null;
    }>(
      `/api/v1/expense-budgets/${encodeURIComponent(
        allocationId,
      )}/transactions?${queryString({ outletId, cursor, limit })}`,
      { signal },
    );
  },

  listExpenses(
    outletId: string,
    startDate: number,
    endDate: number,
    signal?: AbortSignal,
  ) {
    return withAuth<{ items: ExpenseDTO[] }>(
      `/api/v1/expenses?${queryString({ outletId, startDate, endDate })}`,
      { signal },
    );
  },

  transitionExpense(
    outletId: string,
    expenseId: string,
    status: "REVIEWED" | "APPROVED" | "REJECTED",
    rejectionReason?: string,
  ) {
    return withAuth<ExpenseTransitionResponse>(
      `/api/v1/expenses/${encodeURIComponent(expenseId)}/status`,
      {
        method: "PATCH",
        body: { outletId, status, rejectionReason },
      },
    );
  },

  getExpenseStatusHistory(
    outletId: string,
    expenseId: string,
    cursor?: string,
    limit = 25,
    signal?: AbortSignal,
  ) {
    return withAuth<{
      items: ExpenseStatusHistoryDTO[];
      nextCursor: string | null;
    }>(
      `/api/v1/expenses/${encodeURIComponent(
        expenseId,
      )}/status-history?${queryString({ outletId, cursor, limit })}`,
      { signal },
    );
  },

  deleteExpense(outletId: string, expenseId: string) {
    return withAuth<{ expenseId: string; deleted: boolean; idempotent: boolean }>(
      `/api/v1/expenses/${encodeURIComponent(expenseId)}?${queryString({ outletId })}`,
      { method: "DELETE" },
    );
  },
};
